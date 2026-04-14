# Domain Module Pattern

This document covers the standard structure for feature domains: directory layout, schema conventions, procedure patterns, router registration, and MCP tool integration.

---

## 1. Overview

Each feature is a self-contained domain module in `src/domain/{name}/`. A domain owns its schema, procedures, router, and UI components. This keeps related code colocated and makes it straightforward to add new features without touching unrelated modules.

The app router in `src/rpc/router.ts` aggregates all domain routers into a single typed API surface. Adding a new domain means creating the module directory, defining its pieces, and registering the router.

---

## 2. Directory Structure

```
src/domain/{name}/
  schema.ts          # Zod input/output schemas
  procedures.ts      # oRPC procedure handlers
  router.ts          # Router export (wraps procedures with MCP tool metadata)
  components/        # React UI components (optional)
  hooks/             # Domain-specific React hooks (optional)
```

Not every domain needs `components/` or `hooks/`. Some domains are purely server-side (e.g., activity logging). The three required files are `schema.ts`, `procedures.ts`, and `router.ts`.

---

## 3. Step-by-Step: Building a New Domain

This walkthrough uses a generic "task" domain as a concrete example. Each step shows the actual pattern used in the codebase.

### Step 1: Database Schema

Define the database table in `src/database/schema/task.ts`. Follow the enum + table + drizzle-zod pattern:

```typescript
import { pgEnum, pgTable, text, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import * as z from 'zod/v4';

// 1. Define the enum values as a const array
export const TaskStatuses = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const;
export const taskStatusEnum = pgEnum('task_status', TaskStatuses);
export type TaskStatus = (typeof TaskStatuses)[number];
export const taskStatusSchema = z.enum(TaskStatuses);

export const TaskPriorities = ['low', 'medium', 'high', 'urgent'] as const;
export const taskPriorityEnum = pgEnum('task_priority', TaskPriorities);
export type TaskPriority = (typeof TaskPriorities)[number];
export const taskPrioritySchema = z.enum(TaskPriorities);

// 2. Define the table
export const taskTable = pgTable('task', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('todo'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  blocking: boolean('blocking').notNull().default(false),
  assignedTo: uuid('assigned_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 3. Generate insert schema, omitting auto-generated fields
export const taskInsertSchema = createInsertSchema(taskTable, {
  // Override or refine specific fields here if needed
}).omit({ id: true, createdAt: true, updatedAt: true });
```

After defining the table:

1. Add the export to `src/database/schema/index.ts`.
2. Run `bun run drizzle:generate` to create the migration file.
3. Run `bun run drizzle:migrate` to apply it.

See the database documentation (04-database.md) for more detail on enum patterns and schema conventions.

### Step 2: Input Schemas

Define Zod input schemas in `src/domain/task/schema.ts`. These are separate from the database insert schema -- they represent what the API accepts, not what the database stores:

```typescript
import * as z from 'zod/v4';
import { taskStatusSchema, taskPrioritySchema } from '@/database/schema/task.ts';

export const createTaskSchema = z.object({
  projectId: z.string().uuid().describe('The project to create the task in.'),
  title: z.string().min(1, 'Title is required').describe('Task title.'),
  description: z.string().optional().describe('Detailed task description.'),
  priority: taskPrioritySchema.optional().describe('Priority level: low, medium, high, or urgent.'),
  blocking: z.boolean().optional().describe('Whether this task blocks project progress.'),
  assignedTo: z.string().nullable().optional().describe('User ID of the assignee, or null for unassigned.'),
  dueDate: z.string().date().nullable().optional().describe('Due date (YYYY-MM-DD), or null for no due date.'),
});

export const listTasksSchema = z.object({
  projectId: z.string().uuid().describe('The project to list tasks for.'),
  status: taskStatusSchema.optional().describe('Filter by status.'),
  priority: taskPrioritySchema.optional().describe('Filter by priority.'),
  sortBy: z
    .enum(['createdAt', 'dueDate', 'priority', 'status', 'updatedAt'])
    .default('createdAt')
    .describe('Field to sort by. Default: createdAt.'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction. Default: desc.'),
  cursor: z.string().optional().describe('Opaque pagination cursor from a previous response.'),
  limit: z.number().int().min(1).max(100).default(25).describe('Max results per page (1-100, default 25).'),
});

export const getTaskSchema = z.object({
  taskId: z.string().uuid().describe('The task ID to retrieve.'),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().uuid().describe('The task ID to delete.'),
});

export const updateTaskSchema = z.object({
  taskId: z.string().uuid().describe('The task ID to update.'),
  title: z.string().min(1).optional().describe('New task title.'),
  description: z.string().nullable().optional().describe('New description, or null to clear.'),
  priority: taskPrioritySchema.optional().describe('New priority.'),
});
```

**Important**: `.describe()` annotations on every field are required. They are consumed by MCP tool discovery to auto-generate tool descriptions for AI agent clients. Without them, MCP tools lack parameter documentation.

### Step 3: Procedures

Define oRPC procedures in `src/domain/task/procedures.ts`. Every procedure follows the same pattern: **validate, authorize, mutate, audit, return**.

```typescript
import { ORPCError } from '@orpc/client';
import { subject } from '@casl/ability';
import { and, eq } from 'drizzle-orm';
import { orgScoped } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import { projectTable } from '@/database/schema/project.ts';
import { taskTable } from '@/database/schema/task.ts';
import { selectOne } from '@/database/helpers.ts';
import { auditCreate } from '@/database/audit-log/audit-log.utils.ts';
import { createTaskSchema } from '@/domain/task/schema.ts';

export const createTask = orgScoped
  .input(createTaskSchema)
  .handler(async ({ input, context: { organization, ability, userSession } }) => {
    // 1. Validate: entity exists within org context
    const project = await selectOne(
      database
        .select()
        .from(projectTable)
        .where(
          and(
            eq(projectTable.id, input.projectId),
            eq(projectTable.organizationId, organization.id),
          ),
        ),
    );
    if (!project) {
      throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
    }

    // 2. Authorize: check CASL permissions
    if (
      ability.cannot(
        'create',
        subject('Task', {
          projectId: project.id,
          organizationId: organization.id,
        }),
      )
    ) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have permission to create tasks in this project',
      });
    }

    // 3. Mutate: execute the database operation
    const [task] = await database
      .insert(taskTable)
      .values({
        projectId: project.id,
        organizationId: organization.id,
        title: input.title,
        description: input.description,
        priority: input.priority,
      })
      .returning();

    // 4. Audit: log the action
    await auditCreate({
      userId: userSession.user.id,
      organizationId: organization.id,
      entityType: 'TASK',
      entityId: task.id,
      data: task,
    });

    // 5. Return the result
    return task;
  });
```

Key patterns:

- Always scope database queries with `organizationId` to enforce tenant isolation.
- Use `selectOne()` helper for single-row queries.
- Use `subject()` from `@casl/ability` to wrap objects for condition-based permission checks.
- Use `NOT_FOUND` instead of `FORBIDDEN` for read operations to avoid leaking entity existence (see 06-authorization.md, section 9).
- Audit every create, update, and delete using the `auditCreate`, `auditUpdate`, and `auditDelete` helpers.

### Step 4: Router

Define the domain router in `src/domain/task/router.ts`. Each procedure is wrapped with `withUserMcpTool` to register it as an MCP-discoverable tool:

```typescript
import {
  createTask,
  deleteTask,
  listTasks,
  getTask,
  updateTask,
  updateTaskStatus,
  listBlockingTasks,
} from '@/domain/task/procedures.ts';
import { withUserMcpTool } from '@/rpc/mcp-user-tools.ts';

export const taskRouter = {
  createTask: withUserMcpTool(createTask, 'task.createTask'),
  deleteTask: withUserMcpTool(deleteTask, 'task.deleteTask'),
  listTasks: withUserMcpTool(listTasks, 'task.listTasks'),
  getTask: withUserMcpTool(getTask, 'task.getTask'),
  updateTask: withUserMcpTool(updateTask, 'task.updateTask'),
  updateTaskStatus: withUserMcpTool(updateTaskStatus, 'task.updateTaskStatus'),
  listBlockingTasks: withUserMcpTool(listBlockingTasks, 'task.listBlockingTasks'),
};
```

The `withUserMcpTool(procedure, toolName)` function attaches MCP metadata to the procedure. The tool name follows the format `{domain}.{procedureName}` and must match an entry in the MCP tool definitions (step 6).

### Step 5: Register in App Router

Add the domain router to `src/rpc/router.ts`:

```typescript
import { taskRouter } from '@/domain/task/router.ts';

export const appRouter = {
  // ...existing routers
  task: taskRouter,
};

export type AppRouter = typeof appRouter;
```

After this step, the task procedures are callable from both the client (`orpcUtils.task.createTask`) and via MCP tools.

### Step 6: MCP Tool Definitions

Add entries to the `USER_FACING_MCP_TOOL_DEFINITIONS` object in `src/rpc/mcp-user-tools.ts`. Each key matches the tool name used in the router:

```typescript
export const USER_FACING_MCP_TOOL_DEFINITIONS = {
  // ...existing tools

  'task.createTask': {
    description:
      'Create a task for a project. Requires projectId and title.',
  },
  'task.listTasks': {
    description:
      'List tasks for a project with filters and pagination.',
    annotations: { readOnlyHint: true },
  },
  'task.getTask': {
    description:
      'Get a single task by ID. Returns the full task record.',
    annotations: { readOnlyHint: true },
  },
  'task.updateTask': {
    description:
      'Update a task. Accepts taskId and any fields to change.',
    annotations: { idempotentHint: true },
  },
  'task.deleteTask': {
    description:
      'Delete a task by ID. This is irreversible.',
    annotations: { destructiveHint: true },
  },
};
```

Available annotations:

| Annotation | Purpose |
|---|---|
| `readOnlyHint: true` | The tool does not modify data |
| `idempotentHint: true` | Calling the tool multiple times with the same input produces the same result |
| `destructiveHint: true` | The tool permanently deletes or modifies data |

The `description` field is what AI agents see when discovering available tools. Write it as a concise, action-oriented sentence.

### Step 7: Route

Create a file route in `src/routes/_authenticated/` for the UI page. Use TanStack Start's file-based routing conventions (see 02-tanstack-start-routing.md). The route loader should prefetch data using `orpcUtils`:

```typescript
// src/routes/_authenticated/tasks.tsx
import { createFileRoute } from '@tanstack/react-router';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_authenticated/tasks')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.task.listTasks.queryOptions({ input: { projectId } }),
    );
  },
  component: TasksPage,
});
```

### Step 8: Components

Build React components in `src/domain/task/components/`. Use `orpcUtils` for data fetching and mutations, and `useAppForm` for form handling:

```typescript
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orpcUtils } from '@/rpc/react.ts';

function TaskList({ projectId }: { projectId: string }) {
  const { data } = useSuspenseQuery(
    orpcUtils.task.listTasks.queryOptions({ input: { projectId } }),
  );

  return (
    <ul>
      {data.items.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

For mutations with cache invalidation:

```typescript
function CreateTaskButton({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation(orpcUtils.task.createTask.mutationOptions());

  const handleCreate = async () => {
    await mutation.mutateAsync({ projectId, title: 'New task' });
    await queryClient.invalidateQueries({
      queryKey: orpcUtils.task.listTasks.queryOptions({ input: { projectId } }).queryKey,
    });
  };

  return <button onClick={handleCreate}>Create Task</button>;
}
```

---

## 4. Procedure Base Level Guide

Choose the base procedure level based on what context the handler needs. These are defined in `src/rpc/base.ts` and documented in detail in 03-orpc.md, section 4.

| Level | Session | Auth Required | Abilities | Org Context | When to Use |
|---|---|---|---|---|---|
| `pub` | Optional (may be null) | No | No | No | Public data, optional session (e.g., checking if a user is logged in) |
| `authed` | Guaranteed non-null | Yes | No | No | User must be logged in but no permission checks needed (e.g., listing own organizations, accepting an invitation) |
| `withAbility` | Guaranteed non-null | Yes | Platform-level | No | Needs platform-level CASL permissions without org context (e.g., admin-only operations) |
| `orgScoped` | Guaranteed non-null | Yes | Org-scoped | Yes | Most CRUD operations -- needs org context and scoped permissions. This is the default choice for domain procedures. |

The vast majority of domain procedures use `orgScoped`. Only reach for a different level when the operation genuinely does not need org context.
