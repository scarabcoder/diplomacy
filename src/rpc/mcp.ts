import { ORPCError } from '@orpc/client';
import {
  type AnyProcedure,
  type AnyRouter,
  call,
  isProcedure,
  traverseContractProcedures,
} from '@orpc/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  normalizeObjectSchema,
  type AnyObjectSchema,
  type AnySchema,
  type ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  Implementation,
  RequestInfo,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { createLogger } from '@/lib/logger.ts';
import type { ORPCContext } from '@/rpc/base.ts';

const EMPTY_OBJECT_SCHEMA = z.object({}).strict();

type MetaCapableProcedure = AnyProcedure & {
  meta(meta: Record<string, unknown>): AnyProcedure;
};

export const MCP_SURFACES = ['internal_bot'] as const;
export type McpSurface = (typeof MCP_SURFACES)[number];

export type McpToolMeta = {
  name?: string;
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema?: AnyObjectSchema | ZodRawShapeCompat;
  outputSchema?: AnySchema;
  surfaces?: readonly McpSurface[];
  _meta?: Record<string, unknown>;
};

export type McpContextInput = Omit<Partial<ORPCContext>, 'headers'> & {
  headers?: HeadersInit;
  [key: string]: unknown;
};

export type ResolveMcpContextOptions = {
  toolName: string;
  path: readonly string[];
  arguments: Record<string, unknown>;
  request?: Request;
  requestInfo?: RequestInfo;
  authInfo?: AuthInfo;
  context?: Record<string, unknown>;
};

export type ResolveMcpContext = (
  options: ResolveMcpContextOptions,
) => Promise<McpContextInput | void> | McpContextInput | void;

export type CreateMcpRouterOptions = {
  serverInfo: Implementation;
  resolveContext?: ResolveMcpContext;
  surface?: McpSurface;
};

export type McpToolDescriptor = {
  name: string;
  path: readonly string[];
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema: AnyObjectSchema;
  outputSchema?: AnySchema;
  _meta?: Record<string, unknown>;
};

export type CallMcpToolOptions = {
  request?: Request;
  requestInfo?: RequestInfo;
  authInfo?: AuthInfo;
  context?: Record<string, unknown>;
};

export type RegisterMcpToolsOptions = {
  context?: Record<string, unknown>;
};

type McpToolEntry = McpToolDescriptor & {
  procedure: AnyProcedure;
};

function getMcpToolSurfaces(meta: McpToolMeta): readonly McpSurface[] {
  return meta.surfaces?.length ? meta.surfaces : ['internal_bot'];
}

export function withMcpTool<T extends MetaCapableProcedure>(
  procedure: T,
  meta: McpToolMeta,
): T {
  return procedure.meta({ mcp: meta }) as T;
}

function getProcedureMeta(procedure: AnyProcedure): Record<string, unknown> {
  const meta = procedure['~orpc'].meta;

  if (meta && typeof meta === 'object') {
    return meta as Record<string, unknown>;
  }

  return {};
}

function getMcpToolMeta(procedure: AnyProcedure): McpToolMeta | undefined {
  const meta = getProcedureMeta(procedure).mcp;

  if (!meta || typeof meta !== 'object') {
    return undefined;
  }

  return meta as McpToolMeta;
}

function getProcedureInputSchema(procedure: AnyProcedure): AnyObjectSchema {
  const procedureInputSchema = procedure['~orpc'].inputSchema;

  if (!procedureInputSchema) {
    return EMPTY_OBJECT_SCHEMA;
  }

  const inferredSchema = normalizeObjectSchema(procedureInputSchema);

  if (!inferredSchema) {
    throw new Error(
      'Opted-in MCP procedures must declare an object input schema or provide an explicit MCP input schema override.',
    );
  }

  return inferredSchema;
}

export function formatMcpToolName(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildToolName(path: readonly string[], meta: McpToolMeta): string {
  return formatMcpToolName(meta.name ?? path.join('.'));
}

function requestFromRequestInfo(
  requestInfo?: RequestInfo,
): Request | undefined {
  if (!requestInfo?.url) {
    return undefined;
  }

  return new Request(requestInfo.url.toString(), {
    headers: new Headers(requestInfo.headers as HeadersInit),
  });
}

function normalizeContext(context: McpContextInput | void): ORPCContext {
  const { headers, ...rest } = context ?? {};

  return {
    ...rest,
    headers: new Headers(headers),
  } as ORPCContext;
}

function serializeToolValue(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);

    if (json !== undefined) {
      return json;
    }
  } catch {
    // Fall through to String(...) when JSON serialization fails.
  }

  return String(value);
}

function isStructuredContent(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSuccessResult(
  tool: McpToolDescriptor,
  value: unknown,
): CallToolResult {
  const text = serializeToolValue(value);

  if (tool.outputSchema && !isStructuredContent(value)) {
    throw new Error(
      `MCP tool "${tool.name}" declared an output schema but returned a non-object result.`,
    );
  }

  if (isStructuredContent(value)) {
    return {
      content: [{ type: 'text', text }],
      structuredContent: value,
    };
  }

  return {
    content: [{ type: 'text', text }],
  };
}

function toErrorResult(error: unknown): CallToolResult {
  if (error instanceof ORPCError) {
    const structuredContent = {
      code: error.code,
      message: error.message,
      data: error.data,
    };

    return {
      content: [{ type: 'text', text: serializeToolValue(structuredContent) }],
      structuredContent,
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = { message };

  return {
    content: [{ type: 'text', text: serializeToolValue(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

function createToolEntry(
  procedure: AnyProcedure,
  path: readonly string[],
  meta: McpToolMeta,
): McpToolEntry {
  const name = buildToolName(path, meta);
  const inputSchema = meta.inputSchema
    ? normalizeObjectSchema(meta.inputSchema)
    : undefined;

  return {
    name,
    path,
    title: meta.title,
    description: meta.description,
    annotations: meta.annotations,
    inputSchema: inputSchema ?? getProcedureInputSchema(procedure),
    outputSchema: meta.outputSchema,
    _meta: meta._meta,
    procedure,
  };
}

export function createMcpRouter<TRouter extends AnyRouter>(
  router: TRouter,
  options: CreateMcpRouterOptions,
) {
  const logger = createLogger('rpc-mcp');
  const toolEntries = new Map<string, McpToolEntry>();
  const surface = options.surface ?? 'internal_bot';

  traverseContractProcedures({ router, path: [] }, ({ contract, path }) => {
    if (!isProcedure(contract)) {
      return;
    }

    const meta = getMcpToolMeta(contract);

    if (!meta) {
      return;
    }

    if (!getMcpToolSurfaces(meta).includes(surface)) {
      return;
    }

    const entry = createToolEntry(contract, path, meta);

    if (toolEntries.has(entry.name)) {
      throw new Error(`Duplicate MCP tool name "${entry.name}".`);
    }

    toolEntries.set(entry.name, entry);
  });

  const descriptors = [...toolEntries.values()].map(
    ({ procedure: _procedure, ...tool }) => tool,
  );

  async function callTool(
    name: string,
    args: Record<string, unknown> = {},
    callOptions: CallMcpToolOptions = {},
  ): Promise<CallToolResult> {
    const tool = toolEntries.get(name);

    if (!tool) {
      throw new Error(`Unknown MCP tool "${name}".`);
    }

    try {
      const resolvedContext = normalizeContext(
        await options.resolveContext?.({
          toolName: name,
          path: tool.path,
          arguments: args,
          request:
            callOptions.request ??
            requestFromRequestInfo(callOptions.requestInfo),
          requestInfo: callOptions.requestInfo,
          authInfo: callOptions.authInfo,
          context: callOptions.context,
        }),
      );
      const result = await call(tool.procedure, args, {
        context: resolvedContext,
        path: tool.path,
      });

      return toSuccessResult(tool, result);
    } catch (error) {
      logger.error({ err: error, toolName: name }, 'MCP tool execution failed');

      return toErrorResult(error);
    }
  }

  function register(
    server: McpServer,
    registerOptions: RegisterMcpToolsOptions = {},
  ) {
    for (const tool of toolEntries.values()) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          _meta: tool._meta,
        },
        async (
          args: Record<string, unknown>,
          extra: { requestInfo?: RequestInfo; authInfo?: AuthInfo },
        ) =>
          callTool(tool.name, args ?? {}, {
            requestInfo: extra.requestInfo,
            authInfo: extra.authInfo,
            context: registerOptions.context,
          }),
      );
    }

    logger.info({ toolCount: toolEntries.size }, 'Registered MCP tools');
  }

  function createServer(registerOptions: RegisterMcpToolsOptions = {}) {
    const server = new McpServer(options.serverInfo);

    register(server, registerOptions);

    return server;
  }

  return {
    router,
    tools: descriptors,
    register,
    createServer,
    callTool,
  };
}
