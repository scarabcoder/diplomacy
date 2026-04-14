# Multi-Tenancy

## Architecture

Subdomain-based multi-tenancy. Each organization gets a subdomain: `{slug}.yourdomain.com`. On localhost: `{slug}.localhost:3000`.

## Subdomain Extraction

The `extractOrgSlug()` function in `src/domain/org/org-context-middleware.ts` parses the hostname to isolate the org slug:

```typescript
export function extractOrgSlug(hostname: string): string | null {
  const host = hostname.split(':')[0]!;
  if (host.endsWith('.localhost') || host.endsWith('.local')) {
    const slug = host.split('.')[0]!;
    return slug === 'localhost' || slug === 'local' ? null : slug;
  }
  if (host === 'localhost' || host === '127.0.0.1') return null;
  const parts = host.split('.');
  if (parts.length <= 2) return null;
  return parts[0]!;
}
```

Examples:

- `acme.localhost:3000` -> `acme`
- `acme.yourdomain.com` -> `acme`
- `localhost:3000` -> `null` (root domain)
- `yourdomain.com` -> `null` (root domain)

## Org Resolution Pipeline

`resolveOrgFromRequest()` tries multiple sources in order:

```typescript
export async function resolveOrgFromRequest(request: Request): Promise<ResolvedOrganization | null> {
  const url = new URL(request.url);
  let slug = extractOrgSlug(url.hostname);
  if (!slug) slug = request.headers.get('x-org-slug');   // Fallback: header
  if (!slug) slug = url.searchParams.get('org');          // Fallback: query param
  if (!slug) return null;
  return resolveOrganization(slug);  // DB lookup
}
```

Resolution order: subdomain -> `x-org-slug` header -> `?org=` query param -> null.

## oRPC Org Middleware

In `src/rpc/base.ts`, the `orgMiddleware` calls `resolveOrgFromRequest()` and injects the organization into context. The `requireOrgMiddleware` throws NOT_FOUND if null. The `orgAbilityMiddleware` loads org, client, and project memberships and builds scoped CASL abilities.

Short-circuit: if `organization` is already in context (injected by MCP), skip resolution.

## Cross-Subdomain Authentication

BetterAuth configured with:

```typescript
advanced: {
  crossSubDomainCookies: { enabled: true, domain: hostname },
  defaultCookieAttributes: { domain: hostname },
},
```

Session cookies are set on the root domain (e.g., `.yourdomain.com`), so they are shared across all org subdomains. Single sign-on across the entire platform.

## Trusted Origins

```typescript
trustedOrigins: (request) => {
  const origin = request?.headers.get('origin');
  if (origin) {
    const url = new URL(origin);
    if (url.hostname === baseHost || url.hostname.endsWith(`.${baseHost}`)) {
      origins.push(origin);
    }
  }
  return origins;
},
```

Dynamically trusts any subdomain of the base URL.

## Route-Level Org Resolution

In `_authenticated/route.tsx` `beforeLoad`:

1. Try `orpcUtils.org.getOrganization.queryOptions()` (works on org subdomain)
2. If that fails, check `listMyOrganizations` (user's org memberships)
3. If no orgs, check `listMyClientOrganizations` (client memberships)
4. Redirect to the appropriate subdomain or onboarding

## Local Development

For HTTP (simple): `acme.localhost:3000` works out of the box.

For HTTPS (needed for cross-subdomain cookies in some browsers):

```bash
# Install mkcert
brew install mkcert
mkcert -install

# Generate certs
mkcert -cert-file .cert/app.test.pem -key-file .cert/app.test-key.pem app.test "*.app.test" localhost 127.0.0.1 ::1
```

Add to `/etc/hosts`:

```
127.0.0.1 app.test
127.0.0.1 acme.app.test
```

Set `BASE_URL=https://app.test:3000` in `.env`.
