# Database: Drizzle ORM and PostgreSQL

This document covers the database layer: driver setup, schema conventions, migration workflow, and how Drizzle ORM integrates with Zod for end-to-end type safety.

---

## 1. Driver Setup

The database driver lives in `src/database/database-driver.ts` and supports two modes:

- **PostgreSQL** -- used when `DATABASE_URL` is set. Connects via `drizzle-orm/node-postgres`.
- **PGlite** -- used when `DATABASE_URL` is absent. An in-process PostgreSQL implementation that requires zero external dependencies.

```typescript
// src/database/database-driver.ts

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;
export const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
export const databaseProvider = databaseUrl ? 'postgres' : 'pglite';

export async function createDatabase({
  migrateLocal = true,
}: {
  migrateLocal?: boolean;
} = {}): Promise<Database> {
  if (!databaseUrl) {
    const dataDir = getPgliteDataDir();
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite({ dataDir });
    const db = drizzlePGLite<typeof schema>({ client, schema });
    if (migrateLocal) {
      await migratePglite(db, { migrationsFolder: './drizzle' });
    }
    return db;
  }

  return drizzlePG<typeof schema>(databaseUrl, {
    schema,
    logger: process.env.DATABASE_DEBUG === 'true',
  });
}
```

### PGlite data directory

The data directory is chosen based on context:

| Context | Directory | Lifecycle |
|---|---|---|
| Dev (normal) | `.database/{git-branch}` | Persists per branch |
| Dev (custom) | `PGLITE_DATA_DIR` env var | Persists at configured path |
| Test | Ephemeral temp dir (`os.tmpdir()`) | Deleted on process exit |

Test detection checks `NODE_ENV === 'test'`, `process.argv` containing `test`, or any arg ending in `.test.ts`.

```typescript
function isTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.argv.includes('test') ||
    process.argv.some((arg) => arg.endsWith('.test.ts'))
  );
}

function getPgliteDataDir(): string {
  const configuredDataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (configuredDataDir) return configuredDataDir;

  if (isTestRuntime()) {
    const dataDir = mkdtempSync(join(tmpdir(), 'nehemiah-pglite-test-'));
    process.once('exit', () => {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    });
    return dataDir;
  }

  return `./.database/${getGitBranch()}`;
}
```

**Why PGlite?** Zero-config local development. No PostgreSQL install, no Docker, no connection strings. Data persists per git branch so switching branches gives you isolated databases automatically. PGlite auto-migrates on startup, so the database schema is always current.

### Standalone migration helper

A `migrateDatabase` export handles both providers, useful for standalone migration scripts:

```typescript
export async function migrateDatabase(
  db: Database,
  migrationsFolder = './drizzle',
): Promise<void> {
  if (databaseProvider === 'postgres') {
    await migratePostgres(db as NodePgDatabase<typeof schema>, { migrationsFolder });
    return;
  }
  await migratePglite(db as PgliteDatabase<typeof schema>, { migrationsFolder });
}
```

---

## 2. Database Singleton

```typescript
// src/database/database.ts

export const database = await createDatabase();
```

Top-level `await` -- the database is ready before any module that imports it executes. This means all downstream consumers (oRPC procedures, BetterAuth, etc.) get a fully initialized, migrated database instance without async initialization boilerplate.

The module also re-exports the driver utilities:

```typescript
export type { Database };
export { createDatabase, databaseProvider, databaseUrl, migrateDatabase };
```

---

## 3. Schema Organization

Schema files live in `src/database/schema/`, one file per domain. A barrel export in `index.ts` aggregates everything:

```typescript
// src/database/schema/index.ts
export * from './auth-schema.ts';
export * from './assistant.ts';
export * from './audit-log.ts';
export * from './organization.ts';
export * from './client.ts';
export * from './project.ts';
export * from './milestone.ts';
export * from './task.ts';
export * from './invitation.ts';
```

Both the Drizzle driver and the Drizzle config import from this barrel, keeping schema registration centralized.

---

## 4. Table Definition Pattern

The task table (`src/database/schema/task.ts`) demonstrates the canonical pattern:

```typescript
import {
  boolean, date, index, pgEnum, pgTable, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import * as z from 'zod/v4';

// --- Task Status ---
export const TaskStatuses = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;
export const taskStatusEnum = pgEnum('task_status', TaskStatuses);
export type TaskStatus = (typeof TaskStatuses)[number];
export const taskStatusSchema = z.enum(TaskStatuses);

// --- Task Priority ---
export const TaskPriorities = ['low', 'medium', 'high', 'urgent'] as const;
export const taskPriorityEnum = pgEnum('task_priority', TaskPriorities);
export type TaskPriority = (typeof TaskPriorities)[number];
export const taskPrioritySchema = z.enum(TaskPriorities);

// --- Task Owner ---
export const TaskOwners = ['serving_org', 'client'] as const;
export const taskOwnerEnum = pgEnum('task_owner', TaskOwners);
export type TaskOwner = (typeof TaskOwners)[number];
export const taskOwnerSchema = z.enum(TaskOwners);

// --- Task Table ---
export const taskTable = pgTable(
  'task',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    blocking: boolean('blocking').notNull().default(false),
    owner: taskOwnerEnum('owner').notNull().default('serving_org'),
    assignedTo: text('assigned_to').references(() => userTable.id, {
      onDelete: 'set null',
    }),
    dueDate: date('due_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => userTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('task_project_idx').on(table.projectId),
    index('task_assigned_to_idx').on(table.assignedTo),
    index('task_status_idx').on(table.status),
    index('task_project_blocking_idx').on(table.projectId, table.blocking),
  ],
);
```

Key conventions visible in this table:

- **UUIDs** as primary keys with `defaultRandom()`.
- **Foreign keys** declared inline with `references()` and explicit `onDelete` behavior.
- **Timestamps** use `withTimezone: true` and `defaultNow()`.
- **Indexes** declared in the third argument callback, returned as an array.
- **Composite indexes** for common query patterns (e.g., `task_project_blocking_idx`).

---

## 5. drizzle-zod Integration

Each schema file generates Zod schemas directly from the Drizzle table definition:

```typescript
export const taskSelectSchema = createSelectSchema(taskTable);
export const taskInsertSchema = createInsertSchema(taskTable, {
  title: z.string().min(1, 'Title is required'),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  owner: taskOwnerSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
```

How this works:

- `createSelectSchema(table)` generates a Zod schema matching the full row shape. Used for validating data coming out of the database.
- `createInsertSchema(table, overrides)` generates a Zod schema for inserts. The second argument overrides specific fields with custom validators (e.g., adding `min(1)` to `title`).
- `.omit()` removes fields that are auto-generated by the database (`id`, `createdAt`, `updatedAt`), so they are not required in insert payloads.

These schemas are used directly in oRPC procedure input validation, ensuring the database shape, TypeScript types, and runtime validation all derive from the same source.

---

## 6. Enum Pattern

Every enum follows a single-source-of-truth derivation chain:

```
const array  -->  pgEnum (database)  -->  TypeScript type  -->  Zod schema (validation)
```

Concretely:

```typescript
// 1. Source of truth: a const array
export const TaskStatuses = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;

// 2. Database enum (used in table columns)
export const taskStatusEnum = pgEnum('task_status', TaskStatuses);

// 3. TypeScript type (used in application code)
export type TaskStatus = (typeof TaskStatuses)[number];

// 4. Zod schema (used in runtime validation)
export const taskStatusSchema = z.enum(TaskStatuses);
```

All four artifacts derive from the same `const` array. Adding a new status value means changing one line -- the database enum, TypeScript type, and Zod validator all update automatically. No drift between layers.

---

## 7. Drizzle Config

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/database/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL?.trim() ||
      'postgresql://postgres:postgres@localhost:5432/nehemiah',
  },
});
```

- `out` -- migration files are written to `./drizzle/`.
- `schema` -- points to the barrel export so Drizzle Kit sees all tables.
- The fallback URL is only used by Drizzle Kit for generation/introspection; the runtime driver uses its own resolution logic.

---

## 8. Migration Workflow

```bash
# 1. Edit schema files in src/database/schema/

# 2. Generate a migration from the schema diff
bun run drizzle:generate

# 3. Run the migration against the database
bun run drizzle:migrate

# 4. Explore data interactively
bun run drizzle:studio
```

Notes:

- `drizzle:generate` runs `bun drizzle generate`, which diffs the current schema against the last known state and produces SQL migration files in `./drizzle/`.
- `drizzle:migrate` runs `bun run migrate.ts`, a standalone script that applies pending migrations.
- `drizzle:studio` launches Drizzle Kit's visual database browser.
- When using PGlite locally, migrations run automatically on startup (`migrateLocal` defaults to `true`), so you only need to run `drizzle:migrate` explicitly when targeting a real PostgreSQL instance.
