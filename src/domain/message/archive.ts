import { and, eq, inArray, ne } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import {
  roomConversationParticipantTable,
  roomConversationTable,
  type RoomConversationArchivedReason,
} from '@/database/schema/message-schema.ts';
import { publishMessageEvent } from './realtime.ts';

async function archiveConversationIds(
  roomId: string,
  conversationIds: string[],
  reason: RoomConversationArchivedReason,
) {
  if (conversationIds.length === 0) {
    return;
  }

  const uniqueConversationIds = [...new Set(conversationIds)];
  const archivedAt = new Date();

  await database
    .update(roomConversationTable)
    .set({
      status: 'archived',
      archivedReason: reason,
      updatedAt: archivedAt,
    })
    .where(inArray(roomConversationTable.id, uniqueConversationIds));

  for (const conversationId of uniqueConversationIds) {
    publishMessageEvent(roomId, 'thread_archived', conversationId);
  }
}

export async function archiveConversationsForEliminatedPlayers(
  roomId: string,
  playerIds: string[],
) {
  if (playerIds.length === 0) {
    return;
  }

  const rows = await database
    .select({ conversationId: roomConversationParticipantTable.conversationId })
    .from(roomConversationParticipantTable)
    .innerJoin(
      roomConversationTable,
      eq(
        roomConversationTable.id,
        roomConversationParticipantTable.conversationId,
      ),
    )
    .where(
      and(
        inArray(roomConversationParticipantTable.playerId, playerIds),
        ne(roomConversationTable.kind, 'global'),
      ),
    );

  await archiveConversationIds(
    roomId,
    rows.map((row) => row.conversationId),
    'participant_eliminated',
  );
}

export async function archiveConversationsForCompletedRoom(roomId: string) {
  const rows = await database
    .select({ id: roomConversationTable.id })
    .from(roomConversationTable)
    .where(eq(roomConversationTable.roomId, roomId));

  await archiveConversationIds(
    roomId,
    rows.map((row) => row.id),
    'room_completed',
  );
}
