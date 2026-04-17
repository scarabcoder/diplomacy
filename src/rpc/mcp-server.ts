import { randomUUID } from 'crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { createLogger } from '@/lib/logger.ts';
import type { BotSeatSession } from '@/domain/bot/auth.ts';
import { getBufferedMessageEvents } from '@/domain/message/realtime.ts';
import { getRoomPageStateSnapshot } from '@/domain/room/live-state.ts';
import { getRoomStateVersion } from '@/domain/room/realtime.ts';
import { appRouter } from '@/rpc/router.ts';
import {
  getBotMcpSession,
  registerBotMcpSession,
  removeBotMcpSession,
} from '@/rpc/mcp-bot-sessions.ts';
import { BOT_MCP_TOOL_DEFINITIONS } from '@/rpc/mcp-bot-tools.ts';
import { createMcpRouter, formatMcpToolName } from '@/rpc/mcp.ts';
import { resolveMcpOrpcContext } from '@/rpc/mcp-auth.ts';

const logger = createLogger('rpc-mcp-server');

const sharedResolveContext = async (
  options: Parameters<typeof resolveMcpOrpcContext>[0] = {},
) => resolveMcpOrpcContext(options);

export const appMcpRouter = createMcpRouter(appRouter, {
  serverInfo: {
    name: 'diplomacy',
    version: '0.0.0',
  },
  surface: 'internal_bot',
  resolveContext: sharedResolveContext,
});

function createCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Access-Control-Max-Age': '86400',
  };
}

function createJsonRpcErrorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message,
      },
      id: null,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...createCorsHeaders(),
      },
    },
  );
}

async function parsePostBody(request: Request) {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

function getRoomPageStateUri(roomId: string) {
  return `bot://rooms/${roomId}/page-state`;
}

function getMessageEventsUri(roomId: string) {
  return `bot://rooms/${roomId}/message-events`;
}

function registerBotResources(server: McpServer, botSession: BotSeatSession) {
  const roomPageStateUri = getRoomPageStateUri(botSession.roomId);
  const messageEventsUri = getMessageEventsUri(botSession.roomId);

  server.registerResource(
    'room-page-state',
    roomPageStateUri,
    {
      title: 'Room Page State',
      description: 'Latest room page snapshot for the bot seat room.',
      mimeType: 'application/json',
    },
    async () => {
      const snapshot = await getRoomPageStateSnapshot(
        botSession.roomId,
        botSession.playerId,
      );

      return {
        contents: [
          {
            uri: roomPageStateUri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                roomId: botSession.roomId,
                version: getRoomStateVersion(botSession.roomId),
                snapshot,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    'message-events',
    messageEventsUri,
    {
      title: 'Room Message Events',
      description: 'Buffered room message events for the bot seat room.',
      mimeType: 'application/json',
    },
    async () => {
      const events = getBufferedMessageEvents(botSession.roomId);

      return {
        contents: [
          {
            uri: messageEventsUri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                roomId: botSession.roomId,
                firstSequence: events[0]?.sequence ?? null,
                latestSequence: events.at(-1)?.sequence ?? 0,
                events,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

function registerBotWatchTools(server: McpServer, botSession: BotSeatSession) {
  const roomWatchDefinition =
    BOT_MCP_TOOL_DEFINITIONS['room.watchRoomPageState'];
  const messageWatchDefinition =
    BOT_MCP_TOOL_DEFINITIONS['message.watchMessageEvents'];
  const roomPageStateUri = getRoomPageStateUri(botSession.roomId);
  const messageEventsUri = getMessageEventsUri(botSession.roomId);
  const roomWatchToolName = formatMcpToolName('room.watchRoomPageState');
  const messageWatchToolName = formatMcpToolName('message.watchMessageEvents');

  server.registerTool(
    roomWatchToolName,
    {
      description: roomWatchDefinition.description,
      annotations: roomWatchDefinition.annotations,
      inputSchema: BOT_ROOM_ID_SCHEMA.shape,
    },
    async ({ roomId }) => {
      if (roomId !== botSession.roomId) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'FORBIDDEN',
                message: 'Bots can only watch their own room resources',
              }),
            },
          ],
          structuredContent: {
            code: 'FORBIDDEN',
            message: 'Bots can only watch their own room resources',
          },
        };
      }

      const snapshot = await getRoomPageStateSnapshot(
        botSession.roomId,
        botSession.playerId,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                roomId: botSession.roomId,
                version: getRoomStateVersion(botSession.roomId),
                resourceUri: roomPageStateUri,
              },
              null,
              2,
            ),
          },
          {
            type: 'resource_link',
            uri: roomPageStateUri,
            name: 'Room Page State',
            title: 'Room Page State',
            mimeType: 'application/json',
          },
        ],
        structuredContent: {
          roomId: botSession.roomId,
          version: getRoomStateVersion(botSession.roomId),
          resourceUri: roomPageStateUri,
          snapshot,
        },
      };
    },
  );

  server.registerTool(
    messageWatchToolName,
    {
      description: messageWatchDefinition.description,
      annotations: messageWatchDefinition.annotations,
      inputSchema: BOT_ROOM_ID_SCHEMA.shape,
    },
    async ({ roomId }) => {
      if (roomId !== botSession.roomId) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'FORBIDDEN',
                message: 'Bots can only watch their own room resources',
              }),
            },
          ],
          structuredContent: {
            code: 'FORBIDDEN',
            message: 'Bots can only watch their own room resources',
          },
        };
      }

      const events = getBufferedMessageEvents(botSession.roomId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                roomId: botSession.roomId,
                latestSequence: events.at(-1)?.sequence ?? 0,
                resourceUri: messageEventsUri,
              },
              null,
              2,
            ),
          },
          {
            type: 'resource_link',
            uri: messageEventsUri,
            name: 'Message Events',
            title: 'Message Events',
            mimeType: 'application/json',
          },
        ],
        structuredContent: {
          roomId: botSession.roomId,
          latestSequence: events.at(-1)?.sequence ?? 0,
          resourceUri: messageEventsUri,
          events,
        },
      };
    },
  );
}

const BOT_ROOM_ID_SCHEMA = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

function createBotMcpServer(botSession: BotSeatSession) {
  const server = appMcpRouter.createServer({
    context: {
      botSession,
    },
  });

  registerBotResources(server, botSession);
  registerBotWatchTools(server, botSession);

  return server;
}

export function createMcpPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}

export function createMcpUnauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer',
      ...createCorsHeaders(),
    },
  });
}

export async function handleAuthenticatedMcpRequest(
  request: Request,
  botSession: BotSeatSession,
): Promise<Response> {
  try {
    const sessionId = request.headers.get('mcp-session-id');
    const existingSession = sessionId ? getBotMcpSession(sessionId) : undefined;

    if (existingSession) {
      if (existingSession.botSession.playerId !== botSession.playerId) {
        return createJsonRpcErrorResponse(
          403,
          'Session does not belong to the authenticated bot seat.',
        );
      }

      return existingSession.transport.handleRequest(request, {
        parsedBody:
          request.method === 'POST' ? await parsePostBody(request) : undefined,
      });
    }

    if (request.method !== 'POST') {
      return createJsonRpcErrorResponse(
        400,
        'Bad Request: No valid session ID provided.',
      );
    }

    const server = createBotMcpServer(botSession);
    let registeredSessionId: string | undefined;

    const transport: WebStandardStreamableHTTPServerTransport =
      new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          registeredSessionId = newSessionId;
          registerBotMcpSession({
            sessionId: newSessionId,
            botSession,
            server,
            transport,
            roomPageStateUri: getRoomPageStateUri(botSession.roomId),
            messageEventsUri: getMessageEventsUri(botSession.roomId),
          });
        },
        onsessionclosed: async (closedSessionId) => {
          removeBotMcpSession(closedSessionId);
          await server.close();
        },
      });

    await server.connect(transport);

    const response = await transport.handleRequest(request, {
      parsedBody: await parsePostBody(request),
    });

    if (!registeredSessionId && request.headers.get('mcp-session-id')) {
      logger.warn(
        { playerId: botSession.playerId },
        'MCP request completed without initializing a session',
      );
    }

    return response;
  } catch (error) {
    logger.error({ err: error }, 'MCP HTTP request failed');

    return createJsonRpcErrorResponse(500, 'Internal server error.');
  }
}
