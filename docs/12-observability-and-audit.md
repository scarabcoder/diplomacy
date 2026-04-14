# Logging, Observability, and Audit Trail

## 1. Pino Logger

`src/lib/logger.ts`:

```typescript
import pino from 'pino';

export const createLogger = (name: string) => {
  return pino({
    name,
    transport:
      process.env.PRETTY_LOGGING === 'true'
        ? { target: 'pino-pretty' }
        : undefined,
  });
};
```

Usage:

```typescript
const logger = createLogger('email-service');
logger.info({ to, subject }, 'Sending email via SendGrid');
logger.error({ to, subject, err }, 'Failed to send email');
```

- `PRETTY_LOGGING=true` -- human-readable output (dev)
- `PRETTY_LOGGING=false` (default) -- JSON lines (production)
- Named loggers for filtering (`email-service`, `org-context`, `rpc-mcp`, etc.)

## 2. Structured Logging Patterns

Always log structured context objects:

```typescript
// Good
logger.info({ userId, organizationId, action: 'create' }, 'Entity created');
logger.error({ err, requestId }, 'Request failed');

// Bad
logger.info(`Created entity ${entityId} for user ${userId}`);
```

## 3. Audit Log Schema

`src/database/schema/audit-log.ts`:

```typescript
export const auditLogTable = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => userTable.id, { onDelete: 'set null' }),
  impersonatedBy: text('impersonated_by').references(() => userTable.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizationTable.id, { onDelete: 'set null' }),
  entityType: auditEntityTypeEnum('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: auditActionEnum('action').notNull(),           // CREATE | UPDATE | DELETE
  changedFields: jsonb('changed_fields').$type<ChangedFields>(),
  message: text('message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_log_entity_idx').on(table.entityType, table.entityId),
  index('audit_log_user_idx').on(table.userId),
  index('audit_log_created_at_idx').on(table.createdAt),
  index('audit_log_org_created_at_idx').on(table.organizationId, table.createdAt),
]);
```

Entity types: USER, ORGANIZATION, CLIENT, PROJECT, TASK, MILESTONE, ORG_MEMBER, CLIENT_MEMBER, INVITATION, MILESTONE_UPDATE

`ChangedFields` type:

```typescript
export type ChangedFieldValue = { old: unknown; new: unknown };
export type ChangedFields = Record<string, ChangedFieldValue>;
```

## 4. Audit Utilities

`src/database/audit-log/audit-log.utils.ts`:

### auditCreate()

```typescript
export async function auditCreate(params: AuditCreateParams) {
  const changedFields: ChangedFields = {};
  for (const [key, value] of Object.entries(params.data)) {
    if (!EXCLUDED_FIELDS.includes(key)) {
      changedFields[key] = { old: null, new: value };
    }
  }
  return createAuditLog({ ...params, action: 'CREATE', changedFields });
}
```

### auditUpdate() -- computes field-level diff

```typescript
export function computeChangedFields(oldData, newData, excludeFields = ['id', 'createdAt', 'updatedAt']): ChangedFields | null {
  const changedFields: ChangedFields = {};
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue;
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changedFields[key] = { old: oldData[key], new: newData[key] };
    }
  }
  return Object.keys(changedFields).length > 0 ? changedFields : null;
}

export async function auditUpdate(params: AuditUpdateParams) {
  const changedFields = computeChangedFields(params.oldData, params.newData);
  if (!changedFields) return null;  // No changes -- skip audit
  return createAuditLog({ ...params, action: 'UPDATE', changedFields });
}
```

### auditDelete()

```typescript
export async function auditDelete(params: AuditDeleteParams) {
  return createAuditLog({
    ...params, action: 'DELETE',
    changedFields: { deleted: { old: false, new: true } },
  });
}
```

## 5. Assistant Context Propagation

When a tool call originates from the AI assistant, `formatAssistantAuditMessage()` decorates the message:

```typescript
export function formatAssistantAuditMessage(message?: string | null): string | null {
  const run = getAssistantRunContext();
  if (!run) return message;
  return message ? `${message} via Assistant` : `Via Assistant (${run.toolName})`;
}
```

This is called inside `createAuditLog()`, so all audit entries automatically record assistant attribution when applicable.

## 6. Usage Pattern in Procedures

```typescript
// After mutation
const [entity] = await database.insert(entityTable).values({ ... }).returning();
await auditCreate({
  userId: userSession.user.id,
  organizationId: organization.id,
  entityType: 'ENTITY',
  entityId: entity.id,
  data: entity as Record<string, unknown>,
  impersonatedBy: userSession.session.impersonatedBy,
});

// After update
await auditUpdate({
  userId: userSession.user.id,
  organizationId: organization.id,
  entityType: 'ENTITY',
  entityId: entity.id,
  oldData: originalEntity as Record<string, unknown>,
  newData: updatedEntity as Record<string, unknown>,
  impersonatedBy: userSession.session.impersonatedBy,
});
```
