import { and, eq, isNull } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  botPlayerCredentialTable,
  botTable,
  gamePlayerTable,
} from '@/database/schema/game-schema.ts';
import type { BotSeatSession } from '@/domain/bot/auth.ts';
import type { ORPCContext } from '@/rpc/base.ts';
import { createLogger } from '@/lib/logger.ts';

const logger = createLogger('bot-context');

/**
 * Build an ORPCContext with bot session injected, suitable for direct
 * `call()` of oRPC procedures from server-side bot brain logic.
 */
export function createBotOrpcContext(botSession: BotSeatSession): ORPCContext {
  logger.debug(
    {
      botId: botSession.botId,
      botName: botSession.botName,
      playerId: botSession.playerId,
      roomId: botSession.roomId,
    },
    'Creating oRPC context for bot',
  );
  return {
    headers: new Headers(),
    request: undefined,
    userSession: null,
    botSession,
  } as ORPCContext;
}

/**
 * Load a BotSeatSession from the database given a player ID.
 * Used by the brain to construct auth context for oRPC calls.
 */
export async function loadBotSession(
  playerId: string,
): Promise<BotSeatSession | null> {
  logger.debug({ playerId }, 'Loading bot session from credential table...');
  const row = await selectOne(
    database
      .select({
        credentialId: botPlayerCredentialTable.id,
        botId: botTable.id,
        botName: botTable.name,
        playerId: gamePlayerTable.id,
        roomId: gamePlayerTable.roomId,
      })
      .from(botPlayerCredentialTable)
      .innerJoin(botTable, eq(botTable.id, botPlayerCredentialTable.botId))
      .innerJoin(
        gamePlayerTable,
        and(
          eq(gamePlayerTable.id, botPlayerCredentialTable.playerId),
          eq(gamePlayerTable.botId, botPlayerCredentialTable.botId),
          isNull(gamePlayerTable.userId),
        ),
      )
      .where(eq(botPlayerCredentialTable.playerId, playerId)),
  );

  if (!row) {
    logger.warn(
      { playerId },
      'No bot session found for player — credential may be missing or revoked',
    );
    return null;
  }

  logger.debug(
    {
      playerId,
      botId: row.botId,
      botName: row.botName,
      credentialId: row.credentialId,
      roomId: row.roomId,
    },
    'Bot session loaded successfully',
  );

  return {
    credentialId: row.credentialId,
    botId: row.botId,
    botName: row.botName,
    playerId: row.playerId,
    roomId: row.roomId,
  };
}
