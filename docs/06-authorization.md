# Authorization with CASL

This document covers the attribute-based access control system: actions, subjects, ability context, layered permission rules, and React integration.

---

## 1. Overview

CASL provides attribute-based access control. Permissions are defined as rules that grant or deny actions on subjects. Rules are context-sensitive -- platform-level, org-scoped, and client-scoped rules layer on top of each other.

The permission system is defined in `src/domain/auth/permissions.ts`. A single function, `getAbilitiesFor`, builds a complete ability instance by applying rules in layers: platform first, then org, then project, then client. The resulting ability object is passed through oRPC middleware context so every procedure can check permissions inline.

---

## 2. Actions and Subjects

```typescript
const actions = [
  'access',
  'view',
  'edit',
  'restore',
  'delete',
  'create',
  'impersonate',
  'deactivate',
  'manage',
] as const;

type Subject =
  | 'User'
  | 'AdminDashboard'
  | 'Organization'
  | 'Client'
  | 'Project'
  | 'Task'
  | 'Milestone'
  | 'OrgMember'
  | 'ClientMember'
  | 'Invitation'
  | 'all'
  | User;

type AppAbilities = [
  (typeof actions)[number],
  Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type AppAbility = MongoAbility<AppAbilities>;
```

- `manage` is a CASL wildcard that matches any action.
- `all` is a CASL wildcard that matches any subject.
- Including `User` (the type, not the string `'User'`) allows CASL to match conditions against actual user objects.
- `ForcedSubject` enables `subject()` wrapping for condition-based checks (see section 9).

---

## 3. Ability Context

The `AbilityContext` type defines the full context required to build abilities:

```typescript
export type OrgMembership = {
  organizationId: string;
  role: OrgMemberRole;
};

export type ClientMembership = {
  clientId: string;
  role: ClientMemberRole;
};

export type AbilityContext = {
  user: User;
  orgMembership?: OrgMembership | null;
  clientMemberships?: ClientMembership[];
  projectMemberships?: { projectId: string }[];
};
```

The `orgAbilityMiddleware` in `src/rpc/base.ts` queries all three membership types (org, client, project) and passes them to `getAbilitiesFor`. See the oRPC documentation (03-orpc.md, section 3.6) for details on how this context is assembled.

---

## 4. Platform Rules

`applyPlatformRules(builder, user)` defines permissions that apply regardless of org context:

| Who | Rules |
|-----|-------|
| Everyone | `can('view', 'User')` |
| Admin + Staff | `can('impersonate', 'User')`, `can('restore', 'User')`, `can('deactivate', 'User', { role: 'USER' })` |
| Admin + Staff (restrictions) | `cannot('impersonate', 'User', { role: 'ADMIN' })`, `cannot('impersonate', 'User', { id: user.id })` |
| Admin | `can(['view', 'edit', 'delete', 'create', 'access', 'restore', 'deactivate'], 'all')` |
| Staff | `can('access', 'AdminDashboard')` |
| Self (everyone) | `can('edit', 'User', { id: user.id })`, `cannot('edit', 'User', ['role'], { id: user.id })` |
| Self (restrictions) | `cannot('deactivate', 'User', { id: user.id })`, `cannot('delete', 'User', { id: user.id })` |

Key behaviors:

- Admins can do almost everything globally, but `cannot` rules still prevent self-impersonation and self-deletion.
- Staff can access the admin dashboard but cannot modify entities beyond what their other memberships allow.
- Everyone can edit their own user record, but nobody can change their own `role` field (the `['role']` array in `cannot` restricts specific fields).

---

## 5. Org-Scoped Rules

`applyOrgRules(builder, orgMembership)` defines permissions scoped to an organization. All conditions include `{ organizationId: orgId }` to prevent cross-org access:

### Owner

Full control over everything in the org:

```typescript
can('manage', 'Organization', { id: orgId });
can('manage', 'OrgMember', orgCondition);
can('manage', 'Client', orgCondition);
can('manage', 'ClientMember', orgCondition);
can('manage', 'Project', orgCondition);
can('manage', 'Task', orgCondition);
can('manage', 'Milestone', orgCondition);
can('manage', 'Invitation', orgCondition);
```

### Admin

Manage clients, projects, tasks, milestones, and invitations. Can view and edit (but not fully manage) the organization itself:

```typescript
can('view', 'Organization', { id: orgId });
can('edit', 'Organization', { id: orgId });
can('view', 'OrgMember', orgCondition);
can('manage', 'Client', orgCondition);
can('manage', 'ClientMember', orgCondition);
can('manage', 'Project', orgCondition);
can('manage', 'Task', orgCondition);
can('manage', 'Milestone', orgCondition);
can('manage', 'Invitation', orgCondition);
```

### Member

Read-only at the org level. Write access to specific projects is granted by project-level rules (section 6):

```typescript
can('view', 'Organization', { id: orgId });
can('view', 'OrgMember', orgCondition);
can('view', 'Client', orgCondition);
can('view', 'Invitation', orgCondition);
```

---

## 6. Project-Level Rules for Members

`applyOrgMemberProjectRules(builder, orgMembership, projectMemberships)` grants project-specific permissions to org members with the `member` role. This only runs for members -- owners and admins already have `manage` on all projects via org rules.

For each project the member is assigned to:

```typescript
can(['view', 'edit'], 'Project', { id: pm.projectId });
can(['view', 'create', 'edit', 'delete'], 'Task', { projectId: pm.projectId });
can('view', 'Milestone', { projectId: pm.projectId });
```

A member who is not assigned to a project cannot see or interact with it at all.

---

## 7. Client-Scoped Rules

`applyClientRules(builder, clientMemberships, projectMemberships)` handles external client users who are not org members but have been added to specific clients.

### Client Admin

Can view all projects and tasks for their client, manage client team members, create tasks, and manage invitations scoped to their client:

```typescript
can('view', 'Project', { clientId: cm.clientId });
can('view', 'Milestone', { clientId: cm.clientId });
can('view', 'Task', { clientId: cm.clientId });
can('create', 'Task', { clientId: cm.clientId });
can('manage', 'ClientMember', { clientId: cm.clientId });
can('view', 'Client', { id: cm.clientId });
can('manage', 'Invitation', { scopeId: cm.clientId });
```

### Client Member

Can only view projects they are specifically assigned to, plus create tasks within those projects:

```typescript
can('view', 'Client', { id: cm.clientId });
for (const pm of projectMemberships) {
  can('view', 'Project', { id: pm.projectId });
  can('view', 'Milestone', { projectId: pm.projectId });
  can('view', 'Task', { projectId: pm.projectId });
  can('create', 'Task', { projectId: pm.projectId });
}
```

---

## 8. Main Entry Point

```typescript
export function getAbilitiesFor(context?: AbilityContext | User) {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (!context) {
    builder.can('view', 'User');
    return builder.build();
  }

  // Support legacy call signature: getAbilitiesFor(user)
  const isLegacyUser =
    'id' in context && 'role' in context && !('user' in context);
  if (isLegacyUser) {
    applyPlatformRules(builder, context as User);
    return builder.build();
  }

  const ctx = context as AbilityContext;

  // Platform-level rules always apply
  applyPlatformRules(builder, ctx.user);

  // Org-scoped rules
  if (ctx.orgMembership) {
    applyOrgRules(builder, ctx.orgMembership);
    applyOrgMemberProjectRules(builder, ctx.orgMembership, ctx.projectMemberships ?? []);
  }

  // Client-scoped rules
  if (ctx.clientMemberships?.length) {
    applyClientRules(builder, ctx.clientMemberships, ctx.projectMemberships ?? []);
  }

  return builder.build();
}
```

The function accepts three call signatures:

1. **No context** (`undefined`): returns minimal abilities (view users only). Used for anonymous/unauthenticated requests.
2. **User object** (legacy): applies platform rules only. Used by the `abilityMiddleware` for platform-level checks without org context.
3. **Full AbilityContext**: applies all rule layers. Used by `orgAbilityMiddleware` for org-scoped procedures.

---

## 9. Usage in oRPC Procedures

### Checking Permissions

```typescript
import { subject } from '@casl/ability';

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
```

The `subject()` function wraps a plain object so CASL can match it against condition-based rules. Without `subject()`, CASL would treat the second argument as a subject string, not an object with conditions.

### The NOT_FOUND Pattern

For read operations, prefer `NOT_FOUND` over `FORBIDDEN` to avoid leaking entity existence:

```typescript
const project = await selectOne(
  database.select().from(projectTable).where(
    and(
      eq(projectTable.id, input.projectId),
      eq(projectTable.organizationId, organization.id),
    ),
  ),
);

if (!project) {
  throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
}

if (ability.cannot('view', subject('Project', project))) {
  throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
}
```

Both missing entities and forbidden entities return the same error. An attacker cannot distinguish between "does not exist" and "exists but you cannot see it."

---

## 10. React Integration

The `AbilityContext` and `Can` component are defined in `src/common/hooks/use-ability.tsx`:

```typescript
import { createContextualCan } from '@casl/react';
import { createContext } from 'react';
import { type AppAbility } from '@/domain/auth/permissions.ts';

export const AbilityContext = createContext<AppAbility>(
  null as unknown as AppAbility,
);
export const Can = createContextualCan(AbilityContext.Consumer);
```

The `AbilityContext` provider is set up in the authenticated layout route, populated with the ability built from the user's session and memberships.

### Using `<Can>` in Components

```typescript
import { Can } from '@/common/hooks/use-ability.tsx';

<Can I="edit" a="Project">
  <EditProjectButton />
</Can>

<Can I="create" a="Task">
  <NewTaskForm />
</Can>

<Can I="manage" a="OrgMember">
  <MemberManagementPanel />
</Can>
```

`<Can>` conditionally renders its children based on the current user's abilities. It reads the ability instance from `AbilityContext` automatically.

### Imperative Checks

For logic that cannot be expressed as conditional rendering:

```typescript
import { useContext } from 'react';
import { AbilityContext } from '@/common/hooks/use-ability.tsx';

const ability = useContext(AbilityContext);

if (ability.can('delete', subject('Task', task))) {
  // show delete option
}
```

---

## 11. Adding a New Permission

Step-by-step process for adding a new subject or permission:

1. **Add the subject to the `Subject` type union** in `src/domain/auth/permissions.ts`. For example, adding `'Report'`:
   ```typescript
   type Subject =
     | 'User'
     | 'AdminDashboard'
     | 'Organization'
     // ...existing subjects
     | 'Report'
     | 'all'
     | User;
   ```

2. **Add rules in the appropriate `apply*Rules` function**. Choose the right layer:
   - `applyPlatformRules` for global permissions (admin-only features, etc.)
   - `applyOrgRules` for org-scoped CRUD
   - `applyOrgMemberProjectRules` for project-level member access
   - `applyClientRules` for external client user access

3. **Use `subject()` in procedures** to check permissions against the new subject:
   ```typescript
   if (ability.cannot('view', subject('Report', { organizationId: organization.id }))) {
     throw new ORPCError('NOT_FOUND', { message: 'Report not found' });
   }
   ```

4. **Optionally use `<Can>` in React components** for conditional rendering:
   ```typescript
   <Can I="view" a="Report">
     <ReportDashboard />
   </Can>
   ```
