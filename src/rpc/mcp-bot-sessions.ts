import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { BotSeatSession } from '@/domain/bot/auth.ts';

export type BotMcpSessionEntry = {
  sessionId: string;
  botSession: BotSeatSession;
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  roomPageStateUri: string;
  messageEventsUri: string;
};

const botMcpSessions = new Map<string, BotMcpSessionEntry>();

export function registerBotMcpSession(entry: BotMcpSessionEntry) {
  botMcpSessions.set(entry.sessionId, entry);
}

export function getBotMcpSession(sessionId: string) {
  return botMcpSessions.get(sessionId);
}

export function removeBotMcpSession(sessionId: string) {
  botMcpSessions.delete(sessionId);
}

function listRoomSessions(roomId: string) {
  return [...botMcpSessions.values()].filter(
    (session) => session.botSession.roomId === roomId,
  );
}

export async function notifyRoomPageStateUpdated(roomId: string) {
  await Promise.allSettled(
    listRoomSessions(roomId).map((session) =>
      session.server.server.sendResourceUpdated({
        uri: session.roomPageStateUri,
      }),
    ),
  );
}

export async function notifyMessageEventsUpdated(roomId: string) {
  await Promise.allSettled(
    listRoomSessions(roomId).map((session) =>
      session.server.server.sendResourceUpdated({
        uri: session.messageEventsUri,
      }),
    ),
  );
}
