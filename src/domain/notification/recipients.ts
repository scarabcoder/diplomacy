import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { gamePlayerTable } from '@/database/schema/game-schema.ts';
import { roomConversationParticipantTable } from '@/database/schema/message-schema.ts';

/**
 * Returns the userIds of real (non-bot) conversation participants who should
 * be notified about a new message. Excludes the sender, bots, spectators, and
 * eliminated players.
 */
export async function getMessageRecipientUserIds(params: {
  conversationId: string;
  senderPlayerId: string;
}): Promise<string[]> {
  const rows = await database
    .select({ userId: gamePlayerTable.userId })
    .from(roomConversationParticipantTable)
    .innerJoin(
      gamePlayerTable,
      eq(gamePlayerTable.id, roomConversationParticipantTable.playerId),
    )
    .where(
      and(
        eq(
          roomConversationParticipantTable.conversationId,
          params.conversationId,
        ),
        ne(roomConversationParticipantTable.playerId, params.senderPlayerId),
        eq(gamePlayerTable.isBot, false),
        eq(gamePlayerTable.isSpectator, false),
        ne(gamePlayerTable.status, 'eliminated'),
        isNotNull(gamePlayerTable.userId),
      ),
    );

  return [
    ...new Set(
      rows
        .map((row) => row.userId)
        .filter((userId): userId is string => userId != null),
    ),
  ];
}

/**
 * Returns the userIds of real (non-bot) players in a room who should be
 * notified when a phase resolves. Excludes spectators and eliminated players.
 */
export async function getPhaseResultRecipientUserIds(params: {
  roomId: string;
}): Promise<string[]> {
  const rows = await database
    .select({ userId: gamePlayerTable.userId })
    .from(gamePlayerTable)
    .where(
      and(
        eq(gamePlayerTable.roomId, params.roomId),
        eq(gamePlayerTable.isBot, false),
        eq(gamePlayerTable.isSpectator, false),
        ne(gamePlayerTable.status, 'eliminated'),
        isNotNull(gamePlayerTable.userId),
      ),
    );

  return [
    ...new Set(
      rows
        .map((row) => row.userId)
        .filter((userId): userId is string => userId != null),
    ),
  ];
}

