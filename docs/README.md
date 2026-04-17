# Full-Stack TypeScript SaaS Starter — Technical Reference

## Stack Summary

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Framework | TanStack Start (SSR, file-based routing) |
| Language | TypeScript (strict mode) |
| Frontend | React, Tailwind CSS v4, shadcn/ui (Base UI primitives) |
| RPC | oRPC (`@orpc/server`, `@orpc/client`, `@orpc/react-query`) |
| Auth | BetterAuth (email+password, magic link, OTP, passkey, Google OAuth) |
| Database | Drizzle ORM + PostgreSQL (PGlite fallback for local dev) |
| Validation | Zod + `drizzle-zod` |
| Authorization | CASL (`@casl/ability`, `@casl/react`) |
| Email | SendGrid + React Email |
| Forms | TanStack Form |
| Logging | Pino |
| MCP | Model Context Protocol server |
| AI | TanStack AI via `@tanstack/ai-anthropic` and `@tanstack/ai-openai` |
| Testing | Bun test runner |
| Linting | oxlint |
| Formatting | oxfmt |

---

## Prerequisites

- **Bun** — JavaScript runtime and package manager
- **PostgreSQL** (optional) — PGlite is used as an automatic fallback for local development
- **mkcert** (optional) — for HTTPS local development with trusted certificates

---

## Quick Start

```bash
bun install
cp .env.example .env    # Edit with your values
bun run dev             # Start dev server on http://localhost:3000
```

---

## Architecture

```
Browser
  |
TanStack Start (SSR + File-based Routing)
  |
Route Loaders -> oRPC Client (isomorphic)
  |
oRPC Procedures <- Middleware Chain (auth -> org -> abilities)
  |
Drizzle ORM -> PostgreSQL / PGlite
```

---

## Table of Contents

| Doc | Topic |
|---|---|
| [01-project-setup.md](./01-project-setup.md) | Project setup, configuration, and directory structure |
| [02-tanstack-start-routing.md](./02-tanstack-start-routing.md) | TanStack Start routing, layouts, and data loading |
| [03-orpc.md](./03-orpc.md) | oRPC procedures, middleware, client setup, and React Query integration |
| [04-database.md](./04-database.md) | Drizzle ORM, schema patterns, and migrations |
| [05-authentication.md](./05-authentication.md) | BetterAuth authentication, plugins, and session management |
| [06-authorization.md](./06-authorization.md) | CASL authorization, permission rules, and React integration |
| [07-domain-module-pattern.md](./07-domain-module-pattern.md) | Domain module pattern — building features end-to-end |
| [08-multi-tenancy.md](./08-multi-tenancy.md) | Multi-tenancy via subdomain-based organization resolution |
| [09-email.md](./09-email.md) | Transactional email with React Email and SendGrid |
| [10-forms-and-ui.md](./10-forms-and-ui.md) | TanStack Form, shadcn/ui components, and Tailwind CSS v4 |
| [11-mcp-and-ai.md](./11-mcp-and-ai.md) | MCP server and AI assistant integration |
| [12-observability-and-audit.md](./12-observability-and-audit.md) | Pino logging and audit trail system |
| [13-testing-and-deployment.md](./13-testing-and-deployment.md) | Testing with Bun and production deployment |

---

## Common Commands

```bash
bun run dev             # Dev server
bun run build           # Production build
bun run start           # Production server
bun run type-check      # TypeScript checking with tsgo (native preview)
bun run lint            # Run oxlint
bun run format          # Format with oxfmt
bun run drizzle:migrate # Run migrations
bun run drizzle:studio  # Visual database explorer
```
