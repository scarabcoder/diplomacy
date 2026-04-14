# Testing and Deployment

## 1. Bun Test Runner

Uses Bun's built-in test runner:

```typescript
import { describe, test, expect, afterAll } from 'bun:test';

describe('feature', () => {
  test('does something', () => {
    expect(formatMcpToolName('auth.getUserSession')).toBe('auth-get-user-session');
  });
});
```

File convention: `*.test.ts` alongside source files.

Run tests: `bun test`

## 2. Ephemeral PGlite Databases

Tests get isolated databases automatically:

```typescript
function getPgliteDataDir(): string {
  if (isTestRuntime()) {
    const dataDir = mkdtempSync(join(tmpdir(), 'app-pglite-test-'));
    process.once('exit', () => {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    });
    return dataDir;
  }
  return `./.database/${getGitBranch()}`;
}
```

Each test file gets a fresh database. Migrations run automatically on PGlite startup. Temp directory cleaned up on process exit.

## 3. Database Cleanup

```typescript
afterAll(async () => {
  const client = (database as { $client?: { close?: () => Promise<void> } }).$client;
  await client?.close?.();
});
```

## 4. Test Patterns

- **Unit tests**: Pure functions (date utils, slug formatting, markdown parsing)
- **Integration tests**: MCP router tool discovery, tool execution, surface filtering
- **No mocking of database**: Tests use real PGlite -- same SQL, same migrations

## 5. Build Process

```bash
bun run build
# Output:
#   dist/client/   -- Static assets (JS, CSS, images)
#   dist/server/   -- Server bundle (server.js)
```

Uses Vite with TanStack Start plugin. React SWC for fast transpilation.

## 6. Production Server

`server.ts` -- Bun native HTTP server:

```typescript
async function initializeServer() {
  // 1. Load TanStack Start handler
  const handler = (await import('./dist/server/server.js')).default;

  // 2. Preload static assets into memory
  const { routes } = await initializeStaticRoutes('./dist/client');

  // 3. Start Bun server
  Bun.serve({
    port: SERVER_PORT,
    routes: {
      ...routes,           // Static assets (preloaded or on-demand)
      '/*': async (req) => {  // Everything else -> TanStack Start
        return handler.fetch(req);
      },
    },
    error(error) {
      return new Response('Internal Server Error', { status: 500 });
    },
  });
}
```

## 7. Static Asset Strategy

- Small files (< 5MB default) -- preloaded into memory with ETag + Gzip
- Large files -- served on-demand from disk
- Hashed assets get `Cache-Control: public, max-age=31536000, immutable`
- Non-hashed assets get `Cache-Control: public, max-age=3600`
- ETag support with `If-None-Match` -- 304 Not Modified
- On-demand Gzip compression for compressible MIME types

Configuration via environment variables:

```bash
ASSET_PRELOAD_MAX_SIZE=5242880         # Max file size to preload (5MB)
ASSET_PRELOAD_INCLUDE_PATTERNS=*.js,*.css  # Include patterns
ASSET_PRELOAD_EXCLUDE_PATTERNS=*.map       # Exclude patterns
ASSET_PRELOAD_ENABLE_ETAG=true             # ETag support
ASSET_PRELOAD_ENABLE_GZIP=true             # Gzip compression
ASSET_PRELOAD_GZIP_MIN_SIZE=1024           # Min size for gzip (1KB)
```

## 8. Running in Production

```bash
# Build
bun run build

# Start
bun run start
# or: PORT=8080 bun run server.ts
```

## 9. Process Error Handling

```typescript
process.on('unhandledRejection', (error) => {
  log.error(`Unhandled promise rejection: ${formatError(error)}`);
});
process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception: ${formatError(error)}`);
});
```
