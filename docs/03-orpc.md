# oRPC: Type-Safe RPC Layer

This document covers the oRPC infrastructure: context types, middleware chain, base procedures, router composition, isomorphic client, React Query integration, HTTP endpoint, and error handling.

---

## 1. Overview

oRPC is the exclusive RPC layer for all client-server communication. Every data fetch, mutation, and server action is an oRPC procedure. `createServerFn` from TanStack Start is not used -- oRPC replaces it entirely.

This provides:
- End-to-end type safety from Zod input schemas through to React Query hooks
- A single middleware chain for auth, org resolution, and authorization
- Isomorphic execution (in-process during SSR, over HTTP on the client)
- Automatic React Query integration with proper cache keys

---

## 2. Context Type

Every oRPC procedure receives a context object. The base context is defined in `src/rpc/base.ts`:

```typescript
export type ORPCContext = {
  headers: Headers;
  request?: Request;
  userSession?: UserSession | null;
  organization?: ResolvedOrganization | null;
  assistantRun?: AssistantRunContext | null;
};
```

- **`headers`**: Always present. Forwarded from the HTTP request (browser) or from the server-side client (SSR).
- **`request`**: The original `Request` object. Available in HTTP-originated calls; may be absent in server-side direct calls.
- **`userSession`**: Pre-injected session. When present, the auth middleware skips cookie-based session resolution. Used by the MCP server to inject sessions directly.
- **`organization`**: Pre-injected org context. When present, the org middleware skips subdomain-based resolution. Used by the MCP server to inject org context directly.
- **`assistantRun`**: Context for AI assistant tool calls, carrying the current run metadata.

---

## 3. Middleware Chain

The middleware chain in `src/rpc/base.ts` builds up context progressively. Each middleware adds fields to the context that downstream middleware and procedures can depend on.

### 3.1 `authMiddleware` -- Session Resolution

```typescript
const authMiddleware = o.middleware(async ({ context, next }) => {
  if ('userSession' in context) {
    return next({
      context: { userSession: context.userSession ?? null },
    });
  }

  const rawSession = (await auth.api.getSession({
    headers: context.headers,
  })) as unknown;
  const session = sanitizeUserSession(rawSession);

  return next({
    context: { userSession: session },
  });
});
```

Fetches the user session from cookies via BetterAuth. If `userSession` is already in the context (injected by MCP or another caller), it short-circuits and uses the existing value. The session is sanitized to strip any extra fields that BetterAuth may attach.

### 3.2 `requireAuthMiddleware` -- Auth Gate

```typescript
const requireAuthMiddleware = o.middleware(async ({ context, next }) => {
  const userSession = (context as any).userSession as UserSession;

  if (!userSession) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'You must be logged in to do that!',
    });
  }

  return next({
    context: {
      userSession: userSession as NonNullable<typeof userSession>,
    },
  });
});
```

Throws `UNAUTHORIZED` if no session exists. After this middleware, `userSession` is guaranteed non-null in the context type.

### 3.3 `abilityMiddleware` -- Platform Permissions

```typescript
const abilityMiddleware = o.middleware(async ({ context, next }) => {
  const userSession = (context as any).userSession as UserSession | null;

  const ability: AppAbility = getAbilitiesFor(userSession?.user || undefined);

  return next({ context: { ability } });
});
```

Loads CASL platform-level permissions based on the user's role. These are global abilities (e.g., "can create organizations") not scoped to any specific organization.

### 3.4 `orgMiddleware` -- Organization Resolution

```typescript
const orgMiddleware = o.middleware(async ({ context, next }) => {
  if ('organization' in context) {
    return next({
      context: { organization: context.organization ?? null },
    });
  }

  let organization: ResolvedOrganization | null = null;

  if (context.request) {
    organization = await resolveOrgFromRequest(context.request);
  }

  return next({
    context: { organization },
  });
});
```

Resolves the current organization from the request's subdomain, headers, or query parameters. Like auth middleware, it short-circuits if the organization is already injected in context. Returns `null` if no org can be determined (e.g., root domain request).

### 3.5 `requireOrgMiddleware` -- Org Gate

```typescript
const requireOrgMiddleware = o.middleware(async ({ context, next }) => {
  const organization = (context as any)
    .organization as ResolvedOrganization | null;

  if (!organization) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Organization not found.',
    });
  }

  return next({
    context: {
      organization: organization as NonNullable<typeof organization>,
    },
  });
});
```

Throws `NOT_FOUND` if no organization was resolved. Uses `NOT_FOUND` rather than `FORBIDDEN` to avoid leaking whether an organization exists.

### 3.6 `orgAbilityMiddleware` -- Org-Scoped Authorization

```typescript
const orgAbilityMiddleware = o.middleware(async ({ context, next }) => {
  const userSession = (context as any).userSession as UserSession;
  const organization = (context as any).organization as ResolvedOrganization;

  const orgMembership = await database.query.organizationMemberTable.findFirst({
    where: and(
      eq(organizationMemberTable.organizationId, organization.id),
      eq(organizationMemberTable.userId, userSession.user.id),
    ),
  });

  const clientMemberships = await database
    .select({
      clientId: clientMemberTable.clientId,
      clientName: clientTable.name,
      role: clientMemberTable.role,
    })
    .from(clientMemberTable)
    .innerJoin(clientTable, eq(clientTable.id, clientMemberTable.clientId))
    .where(
      and(
        eq(clientMemberTable.userId, userSession.user.id),
        eq(clientTable.organizationId, organization.id),
      ),
    );

  const projectMemberships = await database
    .select({ projectId: projectMemberTable.projectId })
    .from(projectMemberTable)
    .innerJoin(projectTable, eq(projectTable.id, projectMemberTable.projectId))
    .where(
      and(
        eq(projectMemberTable.userId, userSession.user.id),
        eq(projectTable.organizationId, organization.id),
      ),
    );

  // Reject users with no relationship to this org at all
  if (!orgMembership && clientMemberships.length === 0) {
    throw new ORPCError('FORBIDDEN', {
      message: 'You are not a member of this organization.',
    });
  }

  const ability: AppAbility = getAbilitiesFor({
    user: userSession.user,
    orgMembership: orgMembership
      ? {
          organizationId: orgMembership.organizationId,
          role: orgMembership.role,
        }
      : null,
    clientMemberships,
    projectMemberships,
  });

  return next({
    context: {
      orgMembership: orgMembership ?? null,
      clientMemberships,
      projectMemberships,
      ability,
    },
  });
});
```

This is the most substantial middleware. It:

1. Queries the user's org membership (admin, member, etc.)
2. Queries all client memberships within this org (with client names and roles)
3. Queries all project memberships within this org
4. Rejects users who have no org membership AND no client memberships (no relationship to this org)
5. Builds org-scoped CASL abilities incorporating all three membership types
6. Adds `orgMembership`, `clientMemberships`, `projectMemberships`, and `ability` to the context

After this middleware, procedures can check fine-grained permissions like "can this user edit this specific project" or "can this user view this client's data."

---

## 4. Base Procedure Levels

Four base procedures are exported for use in domain routers, each building on the previous:

```typescript
export const pub = o.use(authMiddleware);
export const authed = pub.use(requireAuthMiddleware);
export const withAbility = authed.use(abilityMiddleware);
export const orgScoped = authed
  .use(orgMiddleware)
  .use(requireOrgMiddleware)
  .use(orgAbilityMiddleware);
```

| Procedure | Session | Auth Required | Abilities | Org Context |
|-----------|---------|---------------|-----------|-------------|
| `pub` | Optional (may be null) | No | No | No |
| `authed` | Guaranteed non-null | Yes | No | No |
| `withAbility` | Guaranteed non-null | Yes | Platform-level | No |
| `orgScoped` | Guaranteed non-null | Yes | Org-scoped | Yes |

**When to use each:**

- **`pub`**: Public endpoints where knowing the session is helpful but not required (e.g., `getUserSession` returns `null` for anonymous users).
- **`authed`**: Endpoints that need a logged-in user but no permission checks (e.g., listing the user's own organizations, accepting an invitation).
- **`withAbility`**: Endpoints that need platform-level permission checks (e.g., creating a new organization -- checked against global role).
- **`orgScoped`**: The most common level. Any endpoint operating within an organization's context (e.g., listing projects, creating tasks, managing members). This is the default choice for most domain procedures.

---

## 5. Router Composition

Domain routers are aggregated into a single app router in `src/rpc/router.ts`:

```typescript
import { authRouter } from '@/domain/auth/router.ts';
import { orgRouter } from '@/domain/org/router.ts';
import { clientRouter } from '@/domain/client/router.ts';
import { projectRouter } from '@/domain/project/router.ts';
import { taskRouter } from '@/domain/task/router.ts';
import { milestoneRouter } from '@/domain/milestone/router.ts';
import { activityRouter } from '@/domain/activity/router.ts';
import { invitationRouter } from '@/domain/invitation/router.ts';
import { assistantRouter } from '@/domain/assistant/router.ts';

export const appRouter = {
  auth: authRouter,
  org: orgRouter,
  client: clientRouter,
  project: projectRouter,
  task: taskRouter,
  milestone: milestoneRouter,
  activity: activityRouter,
  invitation: invitationRouter,
  assistant: assistantRouter,
};

export type AppRouter = typeof appRouter;
```

Each domain owns its own router file (e.g., `src/domain/project/router.ts`) that defines procedures using the base procedure levels from `src/rpc/base.ts`. The `AppRouter` type is exported and used by the client to infer the full type-safe API surface.

---

## 6. Isomorphic Client

`src/rpc/client.ts` creates an oRPC client that works both on the server (during SSR) and in the browser:

```typescript
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server';
import { appRouter } from '@/rpc/router.ts';
import type { AppRouter } from '@/rpc/router.ts';
```

### URL Resolution

```typescript
const getRpcUrl = createIsomorphicFn()
  .server((): string => {
    const request = getRequest();
    const url = new URL(request.url);
    const forwardedProto =
      firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
      firstHeaderValue(request.headers.get('x-forwarded-protocol'));
    const forwardedHost = firstHeaderValue(
      request.headers.get('x-forwarded-host'),
    );
    const host = forwardedHost ?? firstHeaderValue(request.headers.get('host'));

    if (forwardedProto && host) {
      return `${forwardedProto}://${host}/api/rpc`;
    }

    if (host) {
      return `${url.protocol}//${host}/api/rpc`;
    }

    return new URL('/api/rpc', url).toString();
  })
  .client((): string => {
    return `${window.location.origin}/api/rpc`;
  });
```

On the server, the URL is reconstructed from proxy headers (`x-forwarded-proto`, `x-forwarded-host`) to correctly resolve the URL behind reverse proxies. On the client, it simply uses `window.location.origin`.

### Header Forwarding

```typescript
const getRpcHeaders = createIsomorphicFn()
  .server((): Record<string, string> => {
    const cookie = getRequestHeaders()?.get?.('cookie');
    return cookie ? { cookie } : {};
  })
  .client((): Record<string, string> => {
    return {};
  });
```

On the server, cookies from the original request are forwarded so that auth middleware can read the session. On the client, cookies are automatically included by the browser.

### In-Process Server Execution

```typescript
const serverRpcHandler = new RPCHandler(appRouter);

const rpcFetch = createIsomorphicFn()
  .server(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);

      for (const [key, value] of Object.entries(getRpcHeaders())) {
        headers.set(key, value);
      }

      const request =
        input instanceof Request
          ? input
          : new Request(input.toString(), { ...init, headers });

      const { response, matched } = await serverRpcHandler.handle(request, {
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
  )
  .client(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return globalThis.fetch(input, init);
    },
  );
```

The critical optimization: during SSR, the server-side `rpcFetch` calls `RPCHandler.handle()` directly in-process. There is no HTTP roundtrip. The request is constructed and handled as if it came over the network, but it all happens in the same process. On the client, standard `fetch` is used.

### Client Creation

```typescript
const link = new RPCLink({
  url: () => getRpcUrl(),
  headers: () => getRpcHeaders(),
  fetch: (request, init) => rpcFetch(request, init),
});

export const client = createORPCClient<RouterClient<AppRouter>>(link);
```

The `RPCLink` ties together URL resolution, header forwarding, and the isomorphic fetch function. The client is typed against `AppRouter` so every procedure call is fully type-safe.

---

## 7. React Query Integration

`src/rpc/react.ts` bridges oRPC with React Query:

```typescript
import { createORPCReactQueryUtils } from '@orpc/react-query';
import { client } from '@/rpc/client.ts';

export const orpcUtils = createORPCReactQueryUtils(client);
```

Usage in components:

```typescript
// Suspense query (throws promise, works with Suspense boundaries)
const { data } = useSuspenseQuery(
  orpcUtils.project.listProjects.queryOptions({ input: { status: 'active' } }),
);

// Standard query
const { data, isLoading } = useQuery(
  orpcUtils.task.listTasks.queryOptions({ input: { projectId } }),
);

// Mutation
const mutation = useMutation(
  orpcUtils.task.createTask.mutationOptions(),
);
await mutation.mutateAsync({ title: 'New task', projectId });

// In route loaders (SSR prefetching)
await context.queryClient.ensureQueryData(
  orpcUtils.project.getProject.queryOptions({ input: { projectId } }),
);

// Cache invalidation
await queryClient.invalidateQueries({
  queryKey: orpcUtils.project.listProjects.queryOptions().queryKey,
});
```

The `orpcUtils` object mirrors the router structure. Each procedure exposes `.queryOptions()` (for queries) and `.mutationOptions()` (for mutations) that return standard React Query option objects. This means query keys are automatically derived from the procedure path and input, ensuring correct cache invalidation.

---

## 8. HTTP Endpoint

The oRPC HTTP endpoint is a catch-all route at `src/routes/api/rpc/$.ts`:

```typescript
import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';
import { appRouter } from '@/rpc/router.ts';

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

- The `$` in the route path makes it a catch-all, matching any path under `/api/rpc/`.
- `ANY` handles all HTTP methods (GET, POST, etc.).
- The `prefix` option tells `RPCHandler` to strip `/api/rpc` from the path before matching procedure routes.
- The initial context provides `headers` and `request`, which flow into the middleware chain.
- Unmatched routes return a 404 JSON response.

---

## 9. Error Handling

oRPC procedures throw `ORPCError` with standard HTTP-style error codes:

```typescript
import { ORPCError } from '@orpc/client';

// Not authenticated
throw new ORPCError('UNAUTHORIZED', {
  message: 'You must be logged in to do that!',
});

// Not allowed
throw new ORPCError('FORBIDDEN', {
  message: 'You do not have permission to perform this action.',
});

// Entity not found
throw new ORPCError('NOT_FOUND', {
  message: 'Project not found.',
});

// Unique constraint or business rule violation
throw new ORPCError('CONFLICT', {
  message: 'A project with that name already exists.',
});
```

### The NOT_FOUND Pattern

When a user requests an entity they should not have access to, prefer `NOT_FOUND` over `FORBIDDEN`. Returning `FORBIDDEN` confirms the entity exists, which leaks information. Returning `NOT_FOUND` reveals nothing about whether the entity exists:

```typescript
// Preferred: does not reveal whether the project exists
const project = await database.query.projectTable.findFirst({
  where: eq(projectTable.id, input.projectId),
});
if (!project) {
  throw new ORPCError('NOT_FOUND', { message: 'Project not found.' });
}

// Then check permissions separately
if (ability.cannot('read', subject('Project', project))) {
  throw new ORPCError('NOT_FOUND', { message: 'Project not found.' });
}
```

Both missing entities and forbidden entities return the same `NOT_FOUND` error, making it impossible for an attacker to enumerate valid entity IDs.

### Error Propagation

On the client, oRPC errors are caught by React Query's error handling. The router's `QueryClient` is configured to:

1. **Not retry** non-500 errors (auth failures, not-found, forbidden are not transient).
2. **Show a toast** for mutation errors via the global `onError` handler.
3. **Redact errors** during dehydration so server error details do not leak into the HTML payload.
