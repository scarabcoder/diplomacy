# Project Setup and Configuration

This document covers the project structure, TypeScript configuration, Vite build setup, available scripts, and environment variables.

---

## Directory Structure

```
src/
├── routes/                     # TanStack Start file-based routes
│   ├── _authenticated/         # Routes requiring auth (layout route)
│   ├── _auth/                  # Public auth routes (login, register)
│   ├── _public/                # Public routes
│   └── api/                    # API routes (rpc, auth, mcp)
├── domain/                     # Feature domains
│   └── {feature}/              # Each domain: router, procedures, schema, components
├── rpc/                        # oRPC infrastructure
│   ├── base.ts                 # Middleware chain and base procedure builders
│   ├── router.ts               # Root router (aggregates domain routers)
│   ├── client.ts               # Isomorphic oRPC client
│   ├── react.ts                # React Query integration
│   ├── mcp.ts                  # MCP tool registration
│   └── mcp-user-tools.ts       # User-facing MCP tool catalog
├── database/                   # Database layer
│   ├── database-driver.ts      # Drizzle driver (PostgreSQL + PGlite)
│   ├── database.ts             # Singleton instance
│   ├── schema/                 # Table definitions
│   ├── helpers.ts              # Query utilities
│   └── audit-log/              # Audit trail utilities
├── common/                     # Shared infrastructure
│   ├── email/                  # Email service + templates
│   ├── hooks/                  # Shared React hooks
│   └── observability/          # Logging middleware
├── components/
│   ├── ui/                     # shadcn/ui components
│   └── layout/                 # App shell, header, sidebar
├── lib/                        # Utilities
│   ├── logger.ts               # Pino logger factory
│   ├── form.ts                 # TanStack Form setup
│   └── form/                   # Form field components
└── styles/                     # Global CSS (Tailwind v4)
```

Each feature domain lives in `src/domain/{feature}/` and owns its own router, procedures, schema, permissions, and UI components. The root router in `src/rpc/router.ts` aggregates all domain routers into a single API surface.

---

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "types": ["vite/client", "bun-types"],
    "lib": ["ESNext", "dom"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "seed.ts"]
}
```

### Key flags

- **`strict: true`** -- Enables the full suite of strict type-checking options: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, and `alwaysStrict`.
- **`noUncheckedIndexedAccess`** -- Forces null checks on dynamic property access. `array[i]` returns `T | undefined` instead of `T`, preventing silent undefined-at-runtime bugs.
- **`noImplicitOverride`** -- Requires the explicit `override` keyword when a subclass method overrides a base class method. Catches accidental overwrites and makes intent visible.
- **`module: "Preserve"`** -- Leaves import/export syntax untouched, deferring module resolution entirely to the bundler (Vite). No CommonJS/ESM transform at the TypeScript level.
- **`moduleResolution: "bundler"`** -- Uses bundler-style resolution rules (supports `exports` maps in `package.json`, no file extension required).
- **`@/*` path alias** -- Maps `@/` to `./src/`, enabling clean imports like `import { db } from "@/database/database"` instead of relative paths.
- **`noUnusedLocals: false` / `noUnusedParameters: false`** -- Disabled to avoid noise during development. Unused variable detection is handled by the linter (`oxlint`) instead.
- **`verbatimModuleSyntax: false`** -- Disabled because some dependencies use import patterns that conflict with strict verbatim module syntax enforcement.

---

## Vite Configuration

The Vite config (`vite.config.ts`) handles the dev server, plugin pipeline, HTTPS for local development, and bundle analysis.

### Plugin order

```ts
plugins: [
  ...(enableTanstackDevtools ? [devtools()] : []),
  tailwindcss(),
  tanstackStart(),
  react(),
  visualizer({ template: 'sunburst', open: false, gzipSize: true, brotliSize: true, filename: 'analyze.html' }),
]
```

1. **`devtools()`** -- TanStack Devtools Vite plugin. Conditionally included (disabled when HTTPS is active unless `ENABLE_TANSTACK_DEVTOOLS=true`, since it can conflict with custom HTTPS setups).
2. **`tailwindcss()`** -- Tailwind CSS v4 Vite plugin. Processes utility classes at build time.
3. **`tanstackStart()`** -- TanStack Start plugin. Handles SSR, file-based routing, and server function compilation.
4. **`react()`** -- `@vitejs/plugin-react-swc`. Uses SWC for fast JSX transforms and React Fast Refresh.
5. **`visualizer()`** -- Generates a `analyze.html` sunburst chart of the production bundle with gzip and brotli size estimates. Does not auto-open.

### HTTPS dev setup

Multi-tenant architectures that use subdomain-based routing (e.g., `{tenant}.app.test`) require HTTPS in local development because browsers enforce secure context rules on cookies with `Domain` attributes. Without HTTPS, cross-subdomain cookies are silently dropped.

The config reads `BASE_URL` and, when it starts with `https://`, loads TLS certificates from the `.cert/` directory:

```ts
function getDevHttpsConfig() {
  const baseUrl = getDevServerUrl()?.toString();

  if (!baseUrl?.startsWith('https://')) {
    return undefined;
  }

  const certPath = path.resolve(
    process.cwd(),
    process.env.LOCAL_HTTPS_CERT_FILE || '.cert/nehemiah.test.pem',
  );
  const keyPath = path.resolve(
    process.cwd(),
    process.env.LOCAL_HTTPS_KEY_FILE || '.cert/nehemiah.test-key.pem',
  );

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      [
        'HTTPS dev certs missing.',
        `Expected cert: ${certPath}`,
        `Expected key: ${keyPath}`,
        'Generate them with:',
        'mkcert -cert-file .cert/nehemiah.test.pem -key-file .cert/nehemiah.test-key.pem nehemiah.test "*.nehemiah.test" localhost 127.0.0.1 ::1',
      ].join('\n'),
    );
  }

  return {
    allowHTTP1: true,
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}
```

Generate certificates with [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install  # one-time: install the local CA
mkcert -cert-file .cert/nehemiah.test.pem -key-file .cert/nehemiah.test-key.pem \
  nehemiah.test "*.nehemiah.test" localhost 127.0.0.1 ::1
```

When HTTPS is not needed (no subdomain routing, or `BASE_URL` uses `http://`), the config falls back to plain HTTP with no certificate loading.

### HMR configuration

When a custom hostname is set via `BASE_URL`, HMR is explicitly configured to use that hostname and port so the WebSocket connection works correctly across subdomains. When HTTPS is active, HMR is disabled entirely (HMR over custom HTTPS certificates introduces complexity with diminishing returns -- full page reload is the fallback).

### Path alias resolution

```ts
resolve: {
  tsconfigPaths: true,
}
```

Vite reads the `paths` field from `tsconfig.json` directly, so the `@/*` alias works in both TypeScript and the bundler without duplication.

---

## Package Scripts

```bash
bun run dev             # Start Vite dev server (bunx --bun vite dev)
bun run build           # Production build (bunx --bun vite build)
bun run start           # Production server (bun run server.ts)
bun run lint            # Run oxlint on src/
bun run lint:fix        # Run oxlint with auto-fix
bun run format          # Format src/ with oxfmt (write mode)
bun run format:check    # Check formatting without writing
bun run shadcn          # Add shadcn/ui components (bunx --bun shadcn)
bun run type-check      # TypeScript checking with tsgo (native preview compiler)
bun run drizzle:generate # Generate Drizzle migrations from schema changes
bun run drizzle:migrate  # Run pending database migrations (bun run migrate.ts)
bun run drizzle:studio   # Launch Drizzle Studio (visual DB explorer)
bun run db:seed          # Seed database with sample data (bun run seed.ts)
```

### Notes

- **`type-check`** uses `tsgo` from `@typescript/native-preview` -- a native (non-JS) TypeScript compiler that runs significantly faster than `tsc`. It passes `--noEmit --skipLibCheck` for type-checking only.
- **`drizzle:migrate`** runs `migrate.ts` directly instead of using `drizzle-kit migrate`, allowing custom migration logic (e.g., PGlite support).
- **`shadcn`** is a passthrough to the shadcn CLI for adding UI components. Usage: `bun run shadcn add button`.
- All scripts use `bunx --bun` where applicable to ensure Bun's runtime is used instead of Node.

---

## Environment Variables

| Variable | Type | Default | Required | Purpose |
|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | string | -- | Yes | BetterAuth signing secret. Must be 32+ characters. Used for session token signing and encryption. |
| `BASE_URL` | string | -- | Yes | Application base URL (e.g., `http://localhost:3000` or `https://app.nehemiah.test:3000`). Drives HTTPS detection, cookie domain, and OAuth callback URLs. |
| `TRUSTED_ORIGINS` | string | -- | No | Comma-separated list of allowed CORS origins. Required when the app serves multiple subdomains or external integrations. |
| `DATABASE_URL` | string | -- | No | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/db`). When omitted, the app falls back to PGlite (in-process SQLite-compatible PostgreSQL) for zero-dependency local development. |
| `SENDGRID_API_KEY` | string | -- | No | SendGrid API key for transactional email. Email sending is silently skipped when not set. |
| `FROM_EMAIL` | string | -- | No | Default sender email address (e.g., `noreply@example.com`). |
| `APP_NAME` | string | `"App"` | No | Application name displayed in email templates and UI. |
| `APP_LOGO_URL` | string | -- | No | URL to a logo image shown in email headers. |
| `GOOGLE_CLIENT_ID` | string | -- | No | Google OAuth client ID. Google sign-in is hidden when not configured. |
| `GOOGLE_CLIENT_SECRET` | string | -- | No | Google OAuth client secret. |
| `PRETTY_LOGGING` | boolean | `false` | No | When `true`, enables `pino-pretty` for human-readable log output. Use in development only. |
| `DATABASE_DEBUG` | boolean | `false` | No | When `true`, enables Drizzle ORM query logging. Logs all SQL queries to the console. |
| `PORT` | number | `3000` | No | HTTP server listen port. |
| `BOT_AI_PROVIDER` | string | auto-detect / `"anthropic"` fallback | No | AI provider for bot players. Supported values: `anthropic`, `openai`. |
| `ANTHROPIC_API_KEY` | string | -- | No | Required when `BOT_AI_PROVIDER=anthropic`. |
| `OPENAI_API_KEY` | string | -- | No | Required when `BOT_AI_PROVIDER=openai`. |
| `BOT_AI_MODEL` | string | provider-specific | No | Primary AI model used by bot players. |
| `NARRATOR_AI_MODEL` | string | `BOT_AI_MODEL` | No | Optional override model used for historical turn narration. Falls back to `BOT_AI_MODEL` when unset. |
| `BOT_AI_TAGLINE_MODEL` | string | provider-specific | No | Optional smaller model used to generate ephemeral bot activity taglines. |
| `LOCAL_HTTPS_CERT_FILE` | string | `".cert/nehemiah.test.pem"` | No | Path to the TLS certificate file for local HTTPS development. Only read when `BASE_URL` starts with `https://`. |
| `LOCAL_HTTPS_KEY_FILE` | string | `".cert/nehemiah.test-key.pem"` | No | Path to the TLS private key file for local HTTPS development. Only read when `BASE_URL` starts with `https://`. |

### Minimal `.env` for local development

```env
BETTER_AUTH_SECRET=your-secret-at-least-32-characters-long
BASE_URL=http://localhost:3000
PRETTY_LOGGING=true
```

This is enough to run the app with PGlite (no external database), no email sending, and no OAuth. Add `DATABASE_URL` to connect to a real PostgreSQL instance.
