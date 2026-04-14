# Authentication with BetterAuth

This document covers the authentication layer: server configuration, supported auth methods, session handling, middleware integration, and cross-tab synchronization.

---

## 1. Overview

BetterAuth handles all authentication. The following methods are supported:

- **Email + password** -- with required email verification
- **Magic links** -- passwordless sign-in via email
- **Email OTP** -- one-time passcode sent to email
- **Passkeys (WebAuthn)** -- biometric / hardware key authentication
- **Google OAuth** -- social sign-in
- **MCP OAuth** -- OAuth2 for AI agent clients (Model Context Protocol)

All auth methods share a single session system. Sessions are cookie-based with cross-subdomain support for multi-tenant routing.

---

## 2. Server Configuration

The BetterAuth server instance is configured in `src/domain/auth/auth.ts`.

### Database adapter

BetterAuth uses Drizzle's adapter with explicit schema mapping:

```typescript
database: drizzleAdapter(database, {
  provider: 'pg',
  schema: {
    user: schema.userTable,
    session: schema.sessionTable,
    account: schema.accountTable,
    verification: schema.verificationTable,
    oauthApplication: schema.oauthApplicationTable,
    oauthAccessToken: schema.oauthAccessTokenTable,
    oauthConsent: schema.oauthConsentTable,
    passkey: schema.passkeyTable,
  },
}),
```

### Base URL and host allowlist

The `getAllowedAuthHosts()` function dynamically builds a host allowlist that supports wildcard subdomains:

```typescript
function getAllowedAuthHosts() {
  const baseUrl = getBaseAuthUrl();
  const host = baseUrl.host;
  const hostname = baseUrl.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return [host, `*.localhost${baseUrl.port ? `:${baseUrl.port}` : ''}`];
  }

  return [host, `*.${hostname}`];
}
```

For local dev, this produces `["localhost:3000", "*.localhost:3000"]`. In production, it allows the base domain and all subdomains.

### Trusted origins

Trusted origins are resolved dynamically per request. Any subdomain of `BASE_URL` is automatically trusted, plus any origins listed in the `TRUSTED_ORIGINS` environment variable:

```typescript
trustedOrigins: (request) => {
  const origins: string[] = [];
  if (process.env.TRUSTED_ORIGINS) {
    origins.push(...process.env.TRUSTED_ORIGINS.split(','));
  }
  const origin = request?.headers.get('origin');
  if (origin) {
    const url = new URL(origin);
    const baseHost = new URL(process.env.BASE_URL as string).hostname;
    if (url.hostname === baseHost || url.hostname.endsWith(`.${baseHost}`)) {
      origins.push(origin);
    }
  }
  return origins;
},
```

### Cross-subdomain cookies

Cookies are scoped to the root domain so sessions work across tenant subdomains:

```typescript
advanced: {
  crossSubDomainCookies: {
    enabled: true,
    domain: getBaseAuthUrl().hostname,
  },
  defaultCookieAttributes: {
    domain: getBaseAuthUrl().hostname,
  },
},
```

### Email + password

```typescript
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  sendResetPassword: async ({ user, url }) => {
    void emailService.sendEmail({
      to: user.email,
      template: ResetPasswordTemplate,
      props: { redirectUrl: url, applicationName: process.env.APP_NAME || 'App' },
    });
  },
},
emailVerification: {
  autoSignInAfterVerification: true,
},
```

Email verification is required. After verification completes, the user is automatically signed in.

### Custom user fields

The user model extends BetterAuth's default with additional fields:

| Field | Type | Default | Input | Purpose |
|---|---|---|---|---|
| `role` | enum (USER, STAFF, ADMIN) | `'USER'` | No | Authorization role |
| `firstName` | string | `''` | Yes | Display name |
| `lastName` | string | `''` | Yes | Display name |
| `phone` | string (nullable) | `null` | Yes | Contact info |
| `isDisabled` | boolean | `false` | No | Soft-disable account |
| `isDeleted` | boolean | `false` | No | Soft-delete account |

Fields marked `input: false` cannot be set during sign-up -- they are managed server-side only.

### Custom session fields

```typescript
session: {
  additionalFields: {
    impersonatedBy: {
      type: 'string',
      required: false,
      defaultValue: null,
      input: false,
    },
  },
},
```

The `impersonatedBy` field tracks admin impersonation sessions. When set, it contains the admin user ID who initiated the impersonation.

### Social providers

Google OAuth is conditionally enabled based on environment variables:

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    mapProfileToUser: (profile) => ({
      firstName: profile.given_name,
      lastName: profile.family_name,
    }),
  },
},
```

`mapProfileToUser` maps Google profile fields to the custom user fields.

### Plugins

```typescript
plugins: [
  tanstackStartCookies(),
  passkey({ rpID: hostname, rpName: appName }),
  magicLink({ sendMagicLink: ({ email, url }) => { /* sends email */ } }),
  emailOTP({ sendVerificationOnSignUp: true, sendVerificationOTP: async ({ email, otp }) => { /* sends email */ } }),
  invitationAuth({ sendOTP: async ({ email, otp, firstName }) => { /* sends invite OTP email */ } }),
  mcp({ loginPage: '/login', oidcConfig: { loginPage: '/login', consentPage: '/mcp/consent' } }),
],
```

| Plugin | Purpose |
|---|---|
| `tanstackStartCookies()` | SSR-compatible cookie handling for TanStack Start |
| `passkey()` | WebAuthn registration and authentication |
| `magicLink()` | Passwordless sign-in via emailed link |
| `emailOTP()` | One-time passcode verification (also on sign-up) |
| `invitationAuth()` | Custom plugin for the invitation acceptance flow |
| `mcp()` | OAuth2 provider for MCP (AI agent) clients |

All email-sending plugins use the `emailService` singleton with React Email templates.

### Database hooks

A `session.create.before` hook rejects sign-in attempts from disabled or deleted users:

```typescript
databaseHooks: {
  session: {
    create: {
      before: async (session, ctx) => {
        if (!ctx) return;
        const user = await ctx.context.adapter.findOne<{
          isDisabled: boolean;
          isDeleted: boolean;
        }>({
          model: 'user',
          where: [{ field: 'id', value: session.userId }],
        });
        if (user?.isDisabled || user?.isDeleted) {
          throw new APIError('BAD_REQUEST', {
            message: 'Your account has been disabled',
          });
        }
      },
    },
  },
},
```

This runs before every session creation (sign-in, token refresh). Disabled or deleted users cannot obtain new sessions regardless of which auth method they use.

---

## 3. Auth Context Middleware

BetterAuth needs endpoint context to read and write session cookies, handle token refresh, and resolve the current user. The middleware in `src/domain/auth/auth-context-middleware.ts` sets this up for every oRPC request:

```typescript
import { createMiddleware } from '@tanstack/react-start';

export const authContextMiddleware = createMiddleware({
  type: 'request',
}).server(async ({ next, request }) => {
  const [{ getRequestHeaders }, { auth }] = await Promise.all([
    import('@tanstack/react-start/server'),
    import('@/domain/auth/auth.ts'),
  ]);
  const ctx = await auth.$context;

  const { runWithEndpointContext } = await import('@better-auth/core/context');

  const context = {
    ...ctx,
    baseURL: request.headers.get('origin') || ctx.baseURL,
  };

  return await runWithEndpointContext(
    {
      context: context as unknown as Parameters<typeof runWithEndpointContext>[0]['context'],
      headers: getRequestHeaders(),
      request,
    },
    () => next(),
  );
});
```

Why this exists: BetterAuth's internal session resolution (reading cookies, auto-refreshing expired tokens, writing updated cookies) depends on having the full HTTP request context available. `runWithEndpointContext` establishes an async-local-storage context that BetterAuth's internals read from. Without this middleware, session lookups in oRPC procedures would fail.

The `baseURL` override to `request.headers.get('origin')` ensures cookie domain resolution works correctly across tenant subdomains.

Dynamic imports are used for `@tanstack/react-start/server` and the auth module to avoid pulling server-only code into the client bundle.

---

## 4. Session Types

```typescript
// src/domain/auth/auth-types.ts

export type User = InferSelectModel<typeof userTable>;
export type DbSession = InferSelectModel<typeof sessionTable>;
export type UserSession = { session: DbSession; user: User };
```

Session and user types are derived from the Drizzle schema (`InferSelectModel`), not from BetterAuth's `$Infer.Session`. This is intentional -- BetterAuth's inferred types do not include custom fields added via the Drizzle schema, so using Drizzle's select types as ground truth ensures all fields (including `role`, `firstName`, `isDisabled`, etc.) are present.

### sanitizeUserSession

```typescript
export function sanitizeUserSession(input: unknown): UserSession | null {
  if (!input || typeof input !== 'object') return null;

  const candidate = input as {
    session?: Partial<DbSession> | null;
    user?: Partial<User> | null;
  };

  if (!candidate.session || !candidate.user) return null;

  return {
    session: {
      id: candidate.session.id ?? '',
      expiresAt: candidate.session.expiresAt ?? new Date(0),
      token: candidate.session.token ?? '',
      // ... all fields with sensible defaults
    },
    user: {
      id: candidate.user.id ?? '',
      name: candidate.user.name ?? '',
      role: candidate.user.role ?? 'USER',
      isDisabled: candidate.user.isDisabled ?? false,
      isDeleted: candidate.user.isDeleted ?? false,
      // ... all fields with sensible defaults
    },
  };
}
```

This function performs defensive parsing: it accepts `unknown` input, validates the shape, and fills in safe defaults for any missing fields. This handles edge cases where BetterAuth returns a session object with unexpected missing fields (e.g., during version upgrades or schema migrations). The function returns `null` if the input is not a valid session shape, or a fully populated `UserSession` with all fields guaranteed to be present.

---

## 5. Cross-Tab Session Sync

When a user signs in or out in one browser tab, all other tabs must reflect the change immediately.

### Trigger (auth client)

```typescript
// src/domain/auth/client.ts

export const triggerSessionChange = () => {
  localStorage.setItem('sessionChange', Date.now().toString());
};
```

This is called after sign-in and sign-out operations. For example, the logout page:

```typescript
// src/routes/logout.tsx
authClient.signOut().then(() => {
  triggerSessionChange();
  queryClient.clear();
  void router.navigate({ to: '/' });
});
```

### Listener (root route)

The root route component listens for `StorageEvent` on the `sessionChange` key:

```typescript
// src/routes/__root.tsx

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
```

How it works:

1. Tab A signs in or out and calls `triggerSessionChange()`, which writes to `localStorage`.
2. The browser fires a `StorageEvent` in all *other* tabs (same origin).
3. Each listening tab calls `router.invalidate()` (re-runs route loaders) and `queryClient.resetQueries()` (clears all cached React Query data).
4. The route loaders re-fetch the session, and the UI updates to reflect the new auth state.

This ensures that signing out in one tab does not leave stale authenticated UI in other tabs, and signing in propagates the session everywhere immediately.
