# TanStack Start and Routing

This document covers the TanStack Start entry point, router configuration, root route, route groups, and data loading patterns.

---

## 1. TanStack Start Entry Point

`src/start.ts` creates the Start instance with request middleware:

```typescript
import { createStart } from '@tanstack/react-start';
import { authContextMiddleware } from '@/domain/auth/auth-context-middleware.ts';

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authContextMiddleware],
  };
});
```

The `authContextMiddleware` wraps every incoming request in BetterAuth's endpoint context so that session cookies are automatically read and validated before any route handler or server function executes. This means authentication state is available globally without per-route setup.

---

## 2. Router Setup

`src/router.tsx` creates and configures the TanStack Router with React Query integration:

```typescript
import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import { toast } from 'sonner';
import NotFound from './not-found';
import { routeTree } from './routeTree.gen';
import { findFunctionPaths } from '@/lib/serialization.ts';

export function getRouter() {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if ('status' in error && error.status !== 500) return false;
          return failureCount < 1;
        },
      },
      dehydrate: {
        shouldDehydrateQuery: (query) => {
          const functionPaths = findFunctionPaths(query.state.data);
          if (functionPaths.length > 0) {
            return false;
          }

          if (query.state.status === 'error') {
            return false;
          }

          return true;
        },
        shouldRedactErrors: () => {
          return true;
        },
      },
      mutations: {
        onError: (error) => {
          toast.error('message' in error ? error.message : 'An error occurred');
        },
      },
    },
  });

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      Wrap: ({ children }) => <>{children}</>,
      defaultViewTransition: false,
      defaultNotFoundComponent: NotFound,
    }),
    queryClient,
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

Key decisions:

- **Retry logic**: Queries only retry once, and only for HTTP 500 errors. Non-500 errors (401, 403, 404, etc.) are not retried since they represent intentional server responses.
- **Dehydration filtering**: `findFunctionPaths` walks query data recursively to detect functions, which cannot be serialized across the SSR boundary. Queries containing functions are excluded from dehydration. Errored queries are also excluded.
- **Error redaction**: `shouldRedactErrors` returns `true` so server-side error details are not leaked to the client in the dehydrated payload.
- **`routerWithQueryClient`**: Integrates React Query with TanStack Router so that route loaders, prefetching, and SSR dehydration/hydration all flow through the same `QueryClient`.
- **`defaultPreload: 'intent'`**: When a user hovers over a link, route data begins loading before they click, making navigation feel instant.
- **`defaultViewTransition: false`**: View Transitions API is disabled. Animations are handled at the component level instead.
- **Mutation error handling**: All mutation errors surface a toast notification automatically via Sonner.

---

## 3. Root Route

`src/routes/__root.tsx` is the top-level route that wraps the entire application:

```typescript
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, interactive-widget=resizes-content',
      },
      { title: 'Nehemiah' },
    ],
    links: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon-cropped.svg' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
  pendingComponent: RoutePending,
});
```

The `RootComponent` does the following:

1. **Session loading**: Fetches the current user session via `useSuspenseQuery(orpcUtils.auth.getUserSession.queryOptions())`. This suspends rendering until the session query resolves (either a session object or `null`).

2. **CASL abilities**: Computes platform-level abilities with `getAbilitiesFor(session?.user)` and memoizes the result. The ability instance is provided to the entire component tree via `AbilityContext`.

3. **Cross-tab session sync**: Registers a `StorageEvent` listener on the `sessionChange` key. When another tab signs in or out and writes to `localStorage`, this tab invalidates the router and resets all queries so the UI reflects the new auth state.

4. **Document shell**: Wraps everything in `StrictMode` and renders `HeadContent` (meta tags, stylesheets), `Scripts` (client-side hydration), and `Toaster` (Sonner toast notifications).

```typescript
function RootComponent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = useSuspenseQuery(
    orpcUtils.auth.getUserSession.queryOptions(),
  );

  const ability = useMemo(
    () => getAbilitiesFor(session?.user || undefined),
    [session],
  );

  useEffect(() => {
    const eventListener = (event: StorageEvent) => {
      if (event.key === 'sessionChange') {
        try {
          void router.invalidate();
          void queryClient.resetQueries();
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', eventListener);
    return () => window.removeEventListener('storage', eventListener);
  }, [queryClient, router]);

  return (
    <AbilityContext value={ability}>
      <RootDocument>
        <RouterLoadingIndicator />
        <Outlet />
      </RootDocument>
    </AbilityContext>
  );
}
```

---

## 4. Route Groups

Routes are organized into three layout groups using TanStack Router's pathless route convention (prefixed with `_`):

### `_auth/` -- Public Auth Pages

Contains login, registration, and password reset pages. The `beforeLoad` guard redirects authenticated users away:

```typescript
beforeLoad: async ({ context, search }) => {
  const session = await context.queryClient.ensureQueryData(
    orpcUtils.auth.getUserSession.queryOptions(),
  );
  if (session) {
    throw redirect({ replace: true, to: search.redirect || '/dashboard' });
  }
},
```

If the user is already logged in, they are sent to the dashboard (or a `redirect` URL from the query string). The layout also validates search params for `redirect`, `resetPassword`, and `email` fields.

### `_authenticated/` -- Protected Routes

All routes that require a valid session. This is the most complex layout route -- see Section 5 for full details. The `beforeLoad` guard:

1. Checks for a session; redirects to `/login` if missing.
2. Attempts org-scoped resolution (works when the request is on an org subdomain).
3. If no org context, checks the user's org memberships and redirects to the appropriate subdomain.
4. If no memberships at all, checks for client-only memberships and redirects accordingly.
5. If no relationships exist, redirects to `/onboarding`.

### `_public/` -- Public Pages

Session-aware but no authentication gate. The layout loads the session and conditionally renders navigation links (dashboard/sign-out for authenticated users, sign-in/register for anonymous visitors):

```typescript
export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});

function PublicLayout() {
  const { data: session } = useSuspenseQuery(
    orpcUtils.auth.getUserSession.queryOptions(),
  );
  // Renders header with conditional nav, <Outlet />, and footer
}
```

---

## 5. Authenticated Layout

The `_authenticated/route.tsx` file contains the most important routing logic. Here is the full `beforeLoad`:

```typescript
beforeLoad: async ({ context, location }) => {
  const session = await context.queryClient.ensureQueryData(
    orpcUtils.auth.getUserSession.queryOptions(),
  );

  if (!session) {
    throw redirect({
      replace: true,
      to: '/login',
      search: {
        redirect: location.pathname.startsWith('/invite/')
          ? location.pathname
          : undefined,
      },
    });
  }

  // Invitation acceptance works without org context
  if (location.pathname.startsWith('/invite/')) {
    return { session, org: null };
  }

  // Try org-scoped resolution (works when on an org subdomain)
  let org = null;
  const orgQueryOptions = orpcUtils.org.getOrganization.queryOptions();
  try {
    org = await context.queryClient.ensureQueryData(orgQueryOptions);
  } catch {
    context.queryClient.removeQueries({
      queryKey: orgQueryOptions.queryKey,
      exact: true,
    });
    // No org context (root domain or not a member of this org)
  }

  if (org) {
    return { session, org };
  }

  // On root domain: check user's org memberships
  const memberships = await context.queryClient.ensureQueryData(
    orpcUtils.org.listMyOrganizations.queryOptions(),
  );

  if (memberships.length === 0) {
    // Check if user has client memberships in any org
    const clientOrgs = await context.queryClient.ensureQueryData(
      orpcUtils.org.listMyClientOrganizations.queryOptions(),
    );

    if (clientOrgs.length > 0) {
      // Client-only user -- redirect to their org's subdomain
      const primaryOrg = clientOrgs[0]!.organization;
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : (process.env.BASE_URL ?? 'http://localhost:3000');
      throw redirect({
        href: buildOrgUrl(primaryOrg.slug, origin) + location.pathname,
      });
    }

    // No orgs at all -- redirect to onboarding (unless already there)
    if (location.pathname !== '/onboarding') {
      throw redirect({ replace: true, to: '/onboarding' });
    }
    return { session, org: null };
  }

  // Has membership(s) but on root domain -- redirect to first org's subdomain
  const primaryOrg = memberships[0]!.organization;
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.BASE_URL ?? 'http://localhost:3000');
  throw redirect({
    href: buildOrgUrl(primaryOrg.slug, origin) + location.pathname,
  });
},
```

The component switches between shells based on the user's relationship to the organization:

```typescript
function AuthenticatedLayout() {
  const { org, session: routeSession } = Route.useRouteContext();

  if (!org) {
    // No org context (onboarding, invitation acceptance)
    return <AnimatedOutlet />;
  }

  if (!org.currentUserRole) {
    // User is a client member, not an org member
    return <ClientShell org={org} session={session} />;
  }

  // Org member -- full app shell with sidebar navigation
  return <AppShell org={org} session={session} />;
}
```

- **`AppShell`**: Full application layout with sidebar, navigation, and org-scoped features. Rendered for org members (admins, managers, etc.).
- **`ClientShell`**: Simplified layout for external client users who can view their projects but do not have org-level access.

---

## 6. API Routes

API routes live under `src/routes/api/` and use TanStack Start's `server.handlers` to define HTTP handlers:

### `api/rpc/$.ts` -- oRPC Handler

Catch-all route that delegates to oRPC's `RPCHandler`. All oRPC procedures are served under the `/api/rpc` prefix:

```typescript
const handler = new RPCHandler(appRouter);

export const Route = createFileRoute('/api/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response, matched } = await handler.handle(request, {
          prefix: '/api/rpc',
          context: { headers: request.headers, request },
        });

        if (matched) {
          return response;
        }

        return new Response(JSON.stringify({ error: 'No route was found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
```

### `api/auth/$.ts` -- BetterAuth Handler

Catch-all route that delegates to BetterAuth's built-in request handler for all auth endpoints (sign-in, sign-up, session, OAuth callbacks, etc.):

```typescript
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: ({ request }) => {
        return auth.handler(request);
      },
    },
  },
});
```

### `api/mcp.ts` -- MCP Server Endpoint

Handles Model Context Protocol requests. Validates the MCP session, returns an unauthorized response if not authenticated, and delegates to the MCP request handler otherwise. OPTIONS requests get a preflight response for CORS.

### `api/assistant/chat.ts` -- AI Assistant Chat

POST-only endpoint that delegates to the assistant chat handler for streaming AI responses.

---

## 7. Data Loading Pattern

Route data is loaded using `ensureQueryData` in `beforeLoad` or `loader` functions. This ensures data is available during SSR and cached for subsequent client-side navigations:

```typescript
export const Route = createFileRoute('/_authenticated/projects/$projectId/dashboard')({
  loader: async ({ context, params }) => {
    const { projectId } = params;

    const project = await context.queryClient.ensureQueryData(
      orpcUtils.project.getProject.queryOptions({ input: { projectId } }),
    );

    // Can use loaded data for conditional logic
    if (project.status === 'planning') {
      throw redirect({
        to: '/projects/$projectId/planning',
        params: { projectId },
      });
    }

    // Parallel prefetching of multiple queries
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpcUtils.project.getProjectOverview.queryOptions({ input: { projectId } }),
      ),
      context.queryClient.ensureQueryData(
        orpcUtils.activity.getProjectActivity.queryOptions({
          input: { projectId, limit: 6 },
        }),
      ),
    ]);
  },
});
```

Key points:

- **`ensureQueryData`** returns cached data if available, or fetches it. During SSR, this populates the query cache so the data is dehydrated and sent to the client. On client-side navigation, it reuses cached data or fetches fresh data as needed.
- **Sequential vs. parallel**: Use `await` for data needed immediately (e.g., to decide whether to redirect). Use `Promise.all` to prefetch multiple independent queries in parallel.
- **oRPC integration**: All data fetching goes through `orpcUtils.{domain}.{procedure}.queryOptions()`, which returns a React Query options object with the correct query key and fetch function. This keeps the query cache, SSR, and client-side fetching all aligned to the same oRPC procedure.
- **Type safety**: The `input` parameter is fully typed by the oRPC procedure's Zod schema, and the return type flows through to component props.
