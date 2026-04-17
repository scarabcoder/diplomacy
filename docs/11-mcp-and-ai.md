# MCP Server and AI Assistant

## Overview

The Model Context Protocol (MCP) server exposes oRPC procedures as tools that can be called by AI assistants or external MCP clients. The built-in AI assistant uses these tools to perform actions on behalf of users. This architecture means every server-side procedure can optionally become an AI-callable tool with a single decorator, and the assistant shares the same authorization and validation layer as the rest of the application.

---

## Tool Registration

Any oRPC procedure can be exposed as an MCP tool by attaching metadata via `withMcpTool()`. This function calls `.meta()` on the procedure to store MCP-specific information:

```typescript
export function withMcpTool<T extends MetaCapableProcedure>(procedure: T, meta: McpToolMeta): T {
  return procedure.meta({ mcp: meta }) as T;
}
```

### McpToolMeta Type

```typescript
export type McpToolMeta = {
  name?: string;
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema?: AnyObjectSchema;
  surfaces?: readonly McpSurface[];
};
```

- `description` is required and used by AI models to understand what the tool does.
- `annotations` carries MCP-standard hints like `readOnlyHint` and `destructiveHint`.
- `surfaces` controls where the tool is available.
- `inputSchema` can override the inferred schema from the procedure's input validator.

---

## Tool Surfaces

Tools are scoped to specific surfaces that determine where they can be invoked:

| Surface | Description |
|---|---|
| `internal_bot` | Available to the built-in AI assistant |
| `user_connect` | Available to external MCP clients (e.g., Claude Desktop) |

The `withUserMcpTool()` shorthand exposes a procedure on both surfaces at once:

```typescript
export function withUserMcpTool<T>(procedure: T, toolName: UserFacingMcpToolName): T {
  const definition = USER_FACING_MCP_TOOL_DEFINITIONS[toolName];
  return withMcpTool(procedure, { ...definition, surfaces: ['internal_bot', 'user_connect'] });
}
```

This is the common case -- most tools that the assistant can use should also be available to external clients.

---

## Tool Name Formatting

`formatMcpToolName()` converts the dotted oRPC procedure path into kebab-case, which is the required format for MCP tool names:

| oRPC Path | MCP Tool Name |
|---|---|
| `auth.getUserSession` | `auth-get-user-session` |
| `task.createTask` | `task-create-task` |
| `milestone.listMilestones` | `milestone-list-milestones` |

---

## createMcpRouter()

`createMcpRouter()` is the core function that transforms an oRPC router tree into an MCP-compatible tool registry:

```typescript
export function createMcpRouter<TRouter extends AnyRouter>(router: TRouter, options: CreateMcpRouterOptions) {
  // 1. Traverse router tree
  traverseContractProcedures({ router, path: [] }, ({ contract, path }) => {
    const meta = getMcpToolMeta(contract);
    if (!meta) return;  // Skip non-opted-in procedures
    if (!getMcpToolSurfaces(meta).includes(surface)) return;  // Skip wrong surface
    // 2. Build tool entry
    const entry = createToolEntry(contract, path, meta);
    toolEntries.set(entry.name, entry);
  });

  return {
    tools: descriptors,        // Array of tool descriptors
    register: (server) => ..., // Register on McpServer
    createServer: () => ...,   // Create standalone McpServer
    callTool: (name, args, options) => ...,  // Direct invocation
  };
}
```

The returned object provides four capabilities:

- **`tools`** -- Array of tool descriptors for listing available tools.
- **`register(server)`** -- Registers all tools on an existing `McpServer` instance.
- **`createServer()`** -- Creates and returns a standalone `McpServer` with all tools registered.
- **`callTool(name, args, options)`** -- Directly invokes a tool by name, used by the AI assistant pipeline.

---

## Tool Execution

When `callTool()` is invoked, it resolves the execution context, runs the underlying oRPC procedure, and formats the result as an MCP `CallToolResult`:

```typescript
async function callTool(name, args, callOptions) {
  const resolvedContext = normalizeContext(await options.resolveContext?.({ ... }));
  const executeProcedure = () => call(tool.procedure, args, { context: resolvedContext, path: tool.path });
  
  // Wrap in assistant run context if applicable
  const result = resolvedContext.assistantRun
    ? await runWithAssistantRunContext(resolvedContext.assistantRun, executeProcedure)
    : await executeProcedure();

  return toSuccessResult(tool, result);
}
```

The procedure executes with the same context (user session, organization, permissions) as a normal oRPC call. If the call originates from the AI assistant, it is wrapped in an `AssistantRunContext` so downstream code can detect and annotate assistant-initiated actions.

---

## Error Handling

Errors from tool execution are caught and formatted into MCP-standard error results:

```typescript
function toErrorResult(error: unknown): CallToolResult {
  if (error instanceof ORPCError) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ code: error.code, message: error.message }) }],
      structuredContent: { code: error.code, message: error.message },
      isError: true,
    };
  }
  return { content: [{ type: 'text', text: String(error) }], isError: true };
}
```

oRPC errors preserve their error code and message in both the `content` array (for text-based clients) and `structuredContent` (for clients that support structured responses). Non-oRPC errors are stringified as plain text.

---

## User-Facing Tool Catalog

`USER_FACING_MCP_TOOL_DEFINITIONS` in `src/rpc/mcp-user-tools.ts` is a centralized catalog that maps procedure names to their MCP metadata. This is the single source of truth for which procedures are exposed as user-facing tools and how they are described:

```typescript
export const USER_FACING_MCP_TOOL_DEFINITIONS = {
  'task.createTask': {
    description: 'Create a task for a project. Requires projectId and title.',
  },
  'task.listTasks': {
    description: 'List tasks for a project with filters and pagination.',
    annotations: { readOnlyHint: true },
  },
  'task.deleteTask': {
    description: 'Permanently delete a task by its taskId.',
    annotations: { destructiveHint: true },
  },
  // ...
};
```

Tools can also be explicitly excluded from user-facing exposure even if they have MCP metadata:

```typescript
export const USER_FACING_MCP_EXCLUDED_TOOLS = [
  'auth.getPasswordAvailable',
  'auth.getUserStatus',
  // ...
];
```

---

## AI Assistant Pipeline

The built-in AI assistant uses `@tanstack/ai` with a provider-specific adapter. The bot implementation supports both Anthropic and OpenAI through TanStack AI, with runtime selection based on environment configuration:

```typescript
const result = await chat({
  adapter: createBotTextAdapter(),  // resolves Anthropic or OpenAI from env
  stream: true,
  maxTokens: 5120,
  messages: toChatMessages(messages),
  tools: createAssistantTools(actor, state),
  systemPrompts: [createAssistantSystemPrompt(state)],
});
```

### Tool Bridging

`createAssistantTools()` bridges the MCP tool registry to the AI tool definition format expected by `@tanstack/ai`:

```typescript
mcpRouter.tools.map((tool) => 
  toolDefinition({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }).server(async (args) => {
    const result = await mcpRouter.callTool(tool.name, args, {
      context: { organization: actor.organization, userSession: actor.userSession },
    });
    return result.structuredContent || {};
  })
);
```

Each MCP tool becomes an AI-callable tool that:

1. Receives arguments from the AI model.
2. Calls through to `mcpRouter.callTool()` with the current user's context.
3. Returns the structured result back to the AI model for further reasoning.

---

## AsyncLocalStorage Run Context

The assistant run context uses Node.js `AsyncLocalStorage` to propagate metadata through the entire call stack without passing it as function arguments:

```typescript
const assistantRunStorage = new AsyncLocalStorage<AssistantRunContext>();

export function runWithAssistantRunContext<T>(context: AssistantRunContext, callback: () => T) {
  return assistantRunStorage.run(context, callback);
}

export function getAssistantRunContext(): AssistantRunContext | undefined {
  return assistantRunStorage.getStore();
}
```

### Audit Log Decoration

Any code deeper in the call stack can check whether it is running inside an assistant action and annotate audit logs accordingly:

```typescript
export function formatAssistantAuditMessage(message?: string | null): string | null {
  const run = getAssistantRunContext();
  if (!run) return message;
  return message ? `${message} via Assistant` : `Via Assistant (${run.toolName})`;
}
```

This ensures that actions taken by the AI assistant are clearly attributed in the audit trail, distinguishing them from direct user actions.
