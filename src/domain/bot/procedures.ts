import { ORPCError } from '@orpc/client';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  requireRoomMembershipForActor,
  requireRpcActor,
} from '@/domain/player-actor.ts';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import { gamePlayerTable } from '@/database/schema/game-schema.ts';
import {
  roomConversationParticipantTable,
  roomMessageTable,
} from '@/database/schema/message-schema.ts';
import {
  getFullBrainState,
  parseObservations,
  parseRelationships,
} from './brain/bot-memory.ts';
import { getBotBrainStateSchema, getBotMessagesSchema } from './schema.ts';

function assertRoomCreator(
  membership: typeof gamePlayerTable.$inferSelect | null | undefined,
  action: string,
) {
  if (!membership || membership.role !== 'creator') {
    throw new ORPCError('FORBIDDEN', {
      message: `Only the room creator can ${action}`,
    });
  }
}

async function requireBotPlayer(roomId: string, playerId: string) {
  const player = await selectOne(
    database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.id, playerId),
          eq(gamePlayerTable.roomId, roomId),
          eq(gamePlayerTable.isBot, true),
        ),
      ),
  );

  if (!player) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Bot player not found in this room',
    });
  }

  return player;
}

export const getBotBrainState = authed
  .input(getBotBrainStateSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const membership = await requireRoomMembershipForActor(input.roomId, actor);
    assertRoomCreator(membership, 'inspect bot brain state');
    await requireBotPlayer(input.roomId, input.playerId);

    const state = await getFullBrainState(input.playerId);

    if (!state) {
      return null;
    }

    return {
      power: state.power,
      strategicPlan: state.strategicPlan,
      observations: parseObservations(state.observations),
      relationships: parseRelationships(state.relationships),
      updatedAt: state.updatedAt,
    };
  });

export const getBotMessages = authed
  .input(getBotMessagesSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const membership = await requireRoomMembershipForActor(input.roomId, actor);
    assertRoomCreator(membership, 'inspect bot messages');
    await requireBotPlayer(input.roomId, input.playerId);

    const messages = await database
      .select()
      .from(roomMessageTable)
      .where(
        and(
          eq(roomMessageTable.senderPlayerId, input.playerId),
          eq(roomMessageTable.roomId, input.roomId),
        ),
      )
      .orderBy(asc(roomMessageTable.createdAt));

    if (messages.length === 0) {
      return { messages: [] };
    }

    // Batch-load conversation participants
    const conversationIds = [...new Set(messages.map((m) => m.conversationId))];

    const participantRows = await database
      .select({
        conversationId: roomConversationParticipantTable.conversationId,
        playerId: roomConversationParticipantTable.playerId,
      })
      .from(roomConversationParticipantTable)
      .where(
        inArray(
          roomConversationParticipantTable.conversationId,
          conversationIds,
        ),
      );

    const participantsByConversation = new Map<string, string[]>();
    for (const row of participantRows) {
      const ids = participantsByConversation.get(row.conversationId) ?? [];
      ids.push(row.playerId);
      participantsByConversation.set(row.conversationId, ids);
    }

    return {
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        body: m.body,
        createdAt: m.createdAt,
        recipientPlayerIds: (
          participantsByConversation.get(m.conversationId) ?? []
        ).filter((id) => id !== input.playerId),
      })),
    };
  });
