import { ORPCError } from '@orpc/client';
import { and, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import {
  requireRoomMembershipForActor,
  requireRpcActor,
  type RpcActor,
} from '@/domain/player-actor.ts';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  gamePlayerTable,
  gameRoomTable,
  gameTurnTable,
} from '@/database/schema/game-schema.ts';
import {
  roomConversationParticipantTable,
  roomConversationTable,
  roomMessageTable,
} from '@/database/schema/message-schema.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import type { OrderProposalPayload } from './schema.ts';
import {
  getThreadSchema,
  listThreadsSchema,
  markThreadReadSchema,
  openOrCreateThreadSchema,
  sendMessageSchema,
  sendOrderProposalSchema,
  startTypingSchema,
  watchMessageEventsSchema,
} from './schema.ts';
import {
  publishMessageEvent,
  publishTypingEvent,
  watchMessageEventStream,
} from './realtime.ts';
import {
  buildParticipantKey,
  canAccessMessages,
  canWriteMessages,
} from './utils.ts';
import {
  cancelMessageNotificationsForReadThread,
  enqueueMessageNotifications,
} from '@/domain/notification/enqueue.ts';
import { getMessageRecipientUserIds } from '@/domain/notification/recipients.ts';
import { createLogger } from '@/lib/logger.ts';

const messageNotificationLogger = createLogger('message-notifications');

async function enqueueMessageRecipients(params: {
  roomId: string;
  threadId: string;
  messageId: string;
  senderPlayerId: string;
}): Promise<void> {
  try {
    const recipientUserIds = await getMessageRecipientUserIds({
      conversationId: params.threadId,
      senderPlayerId: params.senderPlayerId,
    });
    messageNotificationLogger.info(
      {
        messageId: params.messageId,
        threadId: params.threadId,
        roomId: params.roomId,
        senderPlayerId: params.senderPlayerId,
        recipientCount: recipientUserIds.length,
      },
      'Resolved message recipients for notifications',
    );
    if (recipientUserIds.length === 0) return;
    await enqueueMessageNotifications({
      roomId: params.roomId,
      threadId: params.threadId,
      messageId: params.messageId,
      recipientUserIds,
    });
  } catch (error) {
    messageNotificationLogger.warn(
      { error, ...params },
      'Failed to enqueue message notifications',
    );
  }
}

const TYPING_THROTTLE_MS = 3_000;
const typingTimestamps = new Map<string, number>();

export const GLOBAL_PARTICIPANT_KEY = 'global';

/**
 * Create the single per-room "global chat" conversation if it doesn't exist
 * yet, enrolling every non-spectator player as a participant. Idempotent —
 * safe to call at game start or lazily thereafter.
 */
export async function ensureGlobalConversation(params: {
  roomId: string;
  createdByPlayerId: string;
}): Promise<string> {
  const existing = await selectOne(
    database
      .select()
      .from(roomConversationTable)
      .where(
        and(
          eq(roomConversationTable.roomId, params.roomId),
          eq(roomConversationTable.kind, 'global'),
        ),
      ),
  );

  if (existing) {
    return existing.id;
  }

  const players = await database
    .select({ id: gamePlayerTable.id })
    .from(gamePlayerTable)
    .where(
      and(
        eq(gamePlayerTable.roomId, params.roomId),
        eq(gamePlayerTable.isSpectator, false),
      ),
    );

  if (players.length === 0) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Cannot create global chat without any players',
    });
  }

  const [conversation] = await database
    .insert(roomConversationTable)
    .values({
      roomId: params.roomId,
      participantKey: GLOBAL_PARTICIPANT_KEY,
      kind: 'global',
      status: 'active',
      createdByPlayerId: params.createdByPlayerId,
      lastMessageAt: null,
      updatedAt: new Date(),
    })
    .returning();

  await database.insert(roomConversationParticipantTable).values(
    players.map((player) => ({
      conversationId: conversation!.id,
      playerId: player.id,
    })),
  );

  publishMessageEvent(params.roomId, 'thread_created', conversation!.id);
  return conversation!.id;
}

export async function resolveGlobalThreadId(roomId: string): Promise<string> {
  const existing = await selectOne(
    database
      .select({ id: roomConversationTable.id })
      .from(roomConversationTable)
      .where(
        and(
          eq(roomConversationTable.roomId, roomId),
          eq(roomConversationTable.kind, 'global'),
        ),
      ),
  );

  if (!existing) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Global chat is not available for this room yet',
    });
  }

  return existing.id;
}

async function getMessageContext(roomId: string, actor: RpcActor) {
  const room = await selectOne(
    database.select().from(gameRoomTable).where(eq(gameRoomTable.id, roomId)),
  );

  if (!room) {
    throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
  }

  const player = await requireRoomMembershipForActor(
    roomId,
    actor,
    'You are not a member of this room',
  );

  if (!canAccessMessages(player)) {
    throw new ORPCError('FORBIDDEN', {
      message: 'You cannot access private messages in this room',
    });
  }

  return { room, player };
}

function assertCanWriteMessages(params: {
  room: typeof gameRoomTable.$inferSelect;
  player: typeof gamePlayerTable.$inferSelect;
}) {
  if (
    !canWriteMessages({
      roomStatus: params.room.status,
      playerStatus: params.player.status,
      isSpectator: params.player.isSpectator,
      isBot: params.player.isBot,
    })
  ) {
    const message =
      params.room.status === 'completed'
        ? 'This room is complete and all conversations are read-only'
        : params.player.status === 'eliminated'
          ? 'Eliminated players can read existing conversations but cannot send new messages'
          : 'You cannot send messages in this room';

    throw new ORPCError('BAD_REQUEST', { message });
  }
}

async function getAccessibleConversation(params: {
  roomId: string;
  playerId: string;
  threadId: string;
}) {
  const row = await selectOne(
    database
      .select({
        conversation: roomConversationTable,
        participant: roomConversationParticipantTable,
      })
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
          eq(roomConversationParticipantTable.playerId, params.playerId),
          eq(roomConversationParticipantTable.conversationId, params.threadId),
          eq(roomConversationTable.roomId, params.roomId),
        ),
      ),
  );

  if (!row) {
    throw new ORPCError('NOT_FOUND', { message: 'Conversation not found' });
  }

  return row;
}

async function getConversationParticipantIds(conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return new Map<string, string[]>();
  }

  const rows = await database
    .select({
      conversationId: roomConversationParticipantTable.conversationId,
      playerId: roomConversationParticipantTable.playerId,
    })
    .from(roomConversationParticipantTable)
    .where(
      inArray(roomConversationParticipantTable.conversationId, conversationIds),
    );

  const participantIdsByConversation = new Map<string, string[]>();
  for (const row of rows) {
    const playerIds =
      participantIdsByConversation.get(row.conversationId) ?? [];
    playerIds.push(row.playerId);
    participantIdsByConversation.set(row.conversationId, playerIds);
  }

  return participantIdsByConversation;
}

async function getLastMessages(lastMessageIds: string[]) {
  if (lastMessageIds.length === 0) {
    return new Map<string, typeof roomMessageTable.$inferSelect>();
  }

  const rows = await database
    .select()
    .from(roomMessageTable)
    .where(inArray(roomMessageTable.id, lastMessageIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function getUnreadCount(params: {
  conversationId: string;
  participant: typeof roomConversationParticipantTable.$inferSelect;
  currentPlayerId: string;
}) {
  const filters = [
    eq(roomMessageTable.conversationId, params.conversationId),
    ne(roomMessageTable.senderPlayerId, params.currentPlayerId),
  ];

  if (params.participant.lastReadAt) {
    filters.push(gt(roomMessageTable.createdAt, params.participant.lastReadAt));
  }

  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMessageTable)
    .where(and(...filters));

  return row?.count ?? 0;
}

async function buildThreadSummary(params: {
  room: typeof gameRoomTable.$inferSelect;
  currentPlayer: typeof gamePlayerTable.$inferSelect;
  conversation: typeof roomConversationTable.$inferSelect;
  participant: typeof roomConversationParticipantTable.$inferSelect;
  participantIds: string[];
  lastMessage: typeof roomMessageTable.$inferSelect | null;
}) {
  const unreadCount = await getUnreadCount({
    conversationId: params.conversation.id,
    participant: params.participant,
    currentPlayerId: params.currentPlayer.id,
  });

  const canSend =
    params.conversation.status === 'active' &&
    canWriteMessages({
      roomStatus: params.room.status,
      playerStatus: params.currentPlayer.status,
      isSpectator: params.currentPlayer.isSpectator,
      isBot: params.currentPlayer.isBot,
    });

  return {
    id: params.conversation.id,
    kind: params.conversation.kind,
    status: params.conversation.status,
    archivedReason: params.conversation.archivedReason,
    participantPlayerIds: params.participantIds,
    lastMessage:
      params.lastMessage == null
        ? null
        : {
            id: params.lastMessage.id,
            senderPlayerId: params.lastMessage.senderPlayerId,
            body: params.lastMessage.body,
            kind: (params.lastMessage.kind ?? 'text') as
              | 'text'
              | 'order_proposal',
            createdAt: params.lastMessage.createdAt,
          },
    lastMessageAt: params.conversation.lastMessageAt,
    unreadCount,
    canSend,
  };
}

export const listThreads = authed
  .input(listThreadsSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);

    const rows = await database
      .select({
        conversation: roomConversationTable,
        participant: roomConversationParticipantTable,
      })
      .from(roomConversationParticipantTable)
      .innerJoin(
        roomConversationTable,
        eq(
          roomConversationTable.id,
          roomConversationParticipantTable.conversationId,
        ),
      )
      .where(eq(roomConversationParticipantTable.playerId, player.id))
      .orderBy(
        desc(roomConversationTable.lastMessageAt),
        desc(roomConversationTable.createdAt),
      );

    const conversationIds = rows.map((row) => row.conversation.id);
    const participantIdsByConversation =
      await getConversationParticipantIds(conversationIds);
    const lastMessageById = await getLastMessages(
      rows
        .map((row) => row.conversation.lastMessageId)
        .filter((value): value is string => value != null),
    );

    const items = await Promise.all(
      rows.map((row) =>
        buildThreadSummary({
          room,
          currentPlayer: player,
          conversation: row.conversation,
          participant: row.participant,
          participantIds:
            participantIdsByConversation.get(row.conversation.id) ?? [],
          lastMessage:
            row.conversation.lastMessageId == null
              ? null
              : (lastMessageById.get(row.conversation.lastMessageId) ?? null),
        }),
      ),
    );

    return { items };
  });

export const openOrCreateThread = authed
  .input(openOrCreateThreadSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);
    assertCanWriteMessages({ room, player });

    const participantPlayerIds = [
      ...new Set(
        input.participantPlayerIds.filter((playerId) => playerId !== player.id),
      ),
    ];

    if (participantPlayerIds.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Choose at least one other player',
      });
    }

    const otherPlayers = await database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, input.roomId),
          inArray(gamePlayerTable.id, participantPlayerIds),
        ),
      );

    if (otherPlayers.length !== participantPlayerIds.length) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'One or more selected players are not in this room',
      });
    }

    const invalidPlayer = otherPlayers.find(
      (otherPlayer) =>
        !canWriteMessages({
          roomStatus: room.status,
          playerStatus: otherPlayer.status,
          isSpectator: otherPlayer.isSpectator,
          isBot: otherPlayer.isBot,
        }),
    );

    if (invalidPlayer) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Selected players must be active room players',
      });
    }

    const allParticipantIds = [
      player.id,
      ...otherPlayers.map((otherPlayer) => otherPlayer.id),
    ];
    const participantKey = buildParticipantKey(allParticipantIds);
    const existingConversation = await selectOne(
      database
        .select()
        .from(roomConversationTable)
        .where(
          and(
            eq(roomConversationTable.roomId, input.roomId),
            eq(roomConversationTable.participantKey, participantKey),
          ),
        ),
    );

    if (existingConversation) {
      const participant = await selectOne(
        database
          .select()
          .from(roomConversationParticipantTable)
          .where(
            and(
              eq(
                roomConversationParticipantTable.conversationId,
                existingConversation.id,
              ),
              eq(roomConversationParticipantTable.playerId, player.id),
            ),
          ),
      );

      if (!participant) {
        throw new ORPCError('NOT_FOUND', { message: 'Conversation not found' });
      }

      const lastMessage =
        existingConversation.lastMessageId == null
          ? null
          : ((await selectOne(
              database
                .select()
                .from(roomMessageTable)
                .where(
                  eq(roomMessageTable.id, existingConversation.lastMessageId),
                ),
            )) ?? null);

      return {
        thread: await buildThreadSummary({
          room,
          currentPlayer: player,
          conversation: existingConversation,
          participant,
          participantIds: allParticipantIds,
          lastMessage,
        }),
      };
    }

    const now = new Date();
    const [conversation] = await database
      .insert(roomConversationTable)
      .values({
        roomId: input.roomId,
        participantKey,
        kind: allParticipantIds.length === 2 ? 'direct' : 'group',
        status: 'active',
        createdByPlayerId: player.id,
        lastMessageAt: null,
        updatedAt: now,
      })
      .returning();

    await database.insert(roomConversationParticipantTable).values(
      allParticipantIds.map((participantId) => ({
        conversationId: conversation!.id,
        playerId: participantId,
      })),
    );

    const participant = await selectOne(
      database
        .select()
        .from(roomConversationParticipantTable)
        .where(
          and(
            eq(
              roomConversationParticipantTable.conversationId,
              conversation!.id,
            ),
            eq(roomConversationParticipantTable.playerId, player.id),
          ),
        ),
    );

    publishMessageEvent(input.roomId, 'thread_created', conversation!.id);

    return {
      thread: await buildThreadSummary({
        room,
        currentPlayer: player,
        conversation: conversation!,
        participant: participant!,
        participantIds: allParticipantIds,
        lastMessage: null,
      }),
    };
  });

export const getThread = authed
  .input(getThreadSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);
    const { conversation, participant } = await getAccessibleConversation({
      roomId: input.roomId,
      playerId: player.id,
      threadId: input.threadId,
    });

    let cursorMessage: typeof roomMessageTable.$inferSelect | undefined;
    if (input.cursor) {
      cursorMessage = await selectOne(
        database
          .select()
          .from(roomMessageTable)
          .where(
            and(
              eq(roomMessageTable.id, input.cursor),
              eq(roomMessageTable.conversationId, input.threadId),
            ),
          ),
      );
    }

    const filters = [eq(roomMessageTable.conversationId, input.threadId)];
    if (cursorMessage) {
      const cursorFilter = or(
        lt(roomMessageTable.createdAt, cursorMessage.createdAt),
        and(
          eq(roomMessageTable.createdAt, cursorMessage.createdAt),
          lt(roomMessageTable.id, cursorMessage.id),
        ),
      );

      if (cursorFilter) {
        filters.push(cursorFilter);
      }
    }

    const messageRows = await database
      .select()
      .from(roomMessageTable)
      .where(and(...filters))
      .orderBy(desc(roomMessageTable.createdAt), desc(roomMessageTable.id))
      .limit(input.limit + 1);

    const hasMore = messageRows.length > input.limit;
    const visibleRows = (
      hasMore ? messageRows.slice(0, input.limit) : messageRows
    )
      .slice()
      .reverse();

    const participantIdsByConversation = await getConversationParticipantIds([
      conversation.id,
    ]);
    const lastMessageById = await getLastMessages(
      conversation.lastMessageId == null ? [] : [conversation.lastMessageId],
    );

    return {
      thread: await buildThreadSummary({
        room,
        currentPlayer: player,
        conversation,
        participant,
        participantIds: participantIdsByConversation.get(conversation.id) ?? [],
        lastMessage:
          conversation.lastMessageId == null
            ? null
            : (lastMessageById.get(conversation.lastMessageId) ?? null),
      }),
      messages: visibleRows.map((message) => ({
        id: message.id,
        senderPlayerId: message.senderPlayerId,
        body: message.body,
        kind: (message.kind ?? 'text') as 'text' | 'order_proposal',
        proposalPayload: (message.proposalPayload ??
          null) as OrderProposalPayload | null,
        createdAt: message.createdAt,
      })),
      nextCursor: hasMore ? (visibleRows[0]?.id ?? null) : null,
      hasMore,
    };
  });

export const sendMessage = authed
  .input(sendMessageSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);
    assertCanWriteMessages({ room, player });

    const { conversation } = await getAccessibleConversation({
      roomId: input.roomId,
      playerId: player.id,
      threadId: input.threadId,
    });

    if (conversation.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'This conversation is read-only',
      });
    }

    const isGlobal = conversation.kind === 'global';

    const [message] = await database
      .insert(roomMessageTable)
      .values({
        roomId: input.roomId,
        conversationId: input.threadId,
        senderPlayerId: player.id,
        body: input.body.trim(),
      })
      .returning();

    await database
      .update(roomConversationTable)
      .set({
        lastMessageId: message!.id,
        lastMessageAt: message!.createdAt,
        updatedAt: new Date(),
      })
      .where(eq(roomConversationTable.id, input.threadId));

    await database
      .update(roomConversationParticipantTable)
      .set({
        lastReadMessageId: message!.id,
        lastReadAt: message!.createdAt,
      })
      .where(
        and(
          eq(roomConversationParticipantTable.conversationId, input.threadId),
          eq(roomConversationParticipantTable.playerId, player.id),
        ),
      );

    publishMessageEvent(input.roomId, 'message_sent', input.threadId);

    // Notify bot participants to respond — but skip for global chat to avoid
    // spam loops. Bots pick up global statements on their next scheduled trigger.
    if (!isGlobal) {
      import('@/domain/bot/brain/bot-triggers.ts').then(
        ({ onMessageReceived }) => {
          onMessageReceived(input.roomId, input.threadId, player.id);
        },
      );
    }

    await enqueueMessageRecipients({
      roomId: input.roomId,
      threadId: input.threadId,
      messageId: message!.id,
      senderPlayerId: player.id,
    });

    return {
      message: {
        id: message!.id,
        senderPlayerId: message!.senderPlayerId,
        body: message!.body,
        kind: 'text' as const,
        proposalPayload: null as OrderProposalPayload | null,
        createdAt: message!.createdAt,
      },
    };
  });

export const sendOrderProposal = authed
  .input(sendOrderProposalSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);
    assertCanWriteMessages({ room, player });

    const { conversation } = await getAccessibleConversation({
      roomId: input.roomId,
      playerId: player.id,
      threadId: input.threadId,
    });

    if (conversation.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'This conversation is read-only',
      });
    }

    if (!room.currentTurnId || room.currentTurnId !== input.proposal.turnId) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'This proposal is for a phase that has already advanced. Start a new proposal against the current phase.',
      });
    }

    const currentTurn = await selectOne(
      database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, input.proposal.turnId)),
    );

    if (!currentTurn) {
      throw new ORPCError('NOT_FOUND', { message: 'Turn not found' });
    }

    if (currentTurn.phase !== input.proposal.phase) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Proposal phase does not match the current turn phase',
      });
    }

    const positions = input.proposal.boardBefore.positions;
    for (const order of input.proposal.orders) {
      if ('unitProvince' in order) {
        if (!positions[order.unitProvince]) {
          throw new ORPCError('BAD_REQUEST', {
            message: `No unit at ${order.unitProvince} in the proposed board state`,
          });
        }
      }

      const targetProvince =
        'targetProvince' in order
          ? order.targetProvince
          : 'retreatTo' in order
            ? order.retreatTo
            : 'province' in order
              ? order.province
              : null;
      if (targetProvince) {
        const base = targetProvince.split('/')[0]!;
        if (!PROVINCES[base]) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Unknown province: ${targetProvince}`,
          });
        }
      }

      if ('supportedUnitProvince' in order && order.supportedUnitProvince) {
        const base = order.supportedUnitProvince.split('/')[0]!;
        if (!PROVINCES[base]) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Unknown province: ${order.supportedUnitProvince}`,
          });
        }
      }
    }

    const isGlobal = conversation.kind === 'global';

    const [message] = await database
      .insert(roomMessageTable)
      .values({
        roomId: input.roomId,
        conversationId: input.threadId,
        senderPlayerId: player.id,
        body: input.body.trim(),
        kind: 'order_proposal',
        proposalPayload: input.proposal,
      })
      .returning();

    await database
      .update(roomConversationTable)
      .set({
        lastMessageId: message!.id,
        lastMessageAt: message!.createdAt,
        updatedAt: new Date(),
      })
      .where(eq(roomConversationTable.id, input.threadId));

    await database
      .update(roomConversationParticipantTable)
      .set({
        lastReadMessageId: message!.id,
        lastReadAt: message!.createdAt,
      })
      .where(
        and(
          eq(roomConversationParticipantTable.conversationId, input.threadId),
          eq(roomConversationParticipantTable.playerId, player.id),
        ),
      );

    publishMessageEvent(input.roomId, 'message_sent', input.threadId);

    if (!isGlobal) {
      import('@/domain/bot/brain/bot-triggers.ts').then(
        ({ onMessageReceived }) => {
          onMessageReceived(input.roomId, input.threadId, player.id);
        },
      );
    }

    await enqueueMessageRecipients({
      roomId: input.roomId,
      threadId: input.threadId,
      messageId: message!.id,
      senderPlayerId: player.id,
    });

    return {
      message: {
        id: message!.id,
        senderPlayerId: message!.senderPlayerId,
        body: message!.body,
        kind: 'order_proposal' as const,
        proposalPayload: input.proposal,
        createdAt: message!.createdAt,
      },
    };
  });

export const startTyping = authed
  .input(startTypingSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, player } = await getMessageContext(input.roomId, actor);
    assertCanWriteMessages({ room, player });
    await getAccessibleConversation({
      roomId: input.roomId,
      playerId: player.id,
      threadId: input.threadId,
    });

    const key = `${player.id}:${input.threadId}`;
    const now = Date.now();
    if (now - (typingTimestamps.get(key) ?? 0) < TYPING_THROTTLE_MS) {
      return;
    }
    typingTimestamps.set(key, now);

    publishTypingEvent(input.roomId, input.threadId, player.id);
  });

export const markThreadRead = authed
  .input(markThreadReadSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { player } = await getMessageContext(input.roomId, actor);
    await getAccessibleConversation({
      roomId: input.roomId,
      playerId: player.id,
      threadId: input.threadId,
    });

    const targetMessage =
      input.readThroughMessageId == null
        ? await selectOne(
            database
              .select()
              .from(roomMessageTable)
              .where(eq(roomMessageTable.conversationId, input.threadId))
              .orderBy(
                desc(roomMessageTable.createdAt),
                desc(roomMessageTable.id),
              ),
          )
        : await selectOne(
            database
              .select()
              .from(roomMessageTable)
              .where(
                and(
                  eq(roomMessageTable.id, input.readThroughMessageId),
                  eq(roomMessageTable.conversationId, input.threadId),
                ),
              ),
          );

    if (!targetMessage) {
      return { marked: false };
    }

    await database
      .update(roomConversationParticipantTable)
      .set({
        lastReadMessageId: targetMessage.id,
        lastReadAt: targetMessage.createdAt,
      })
      .where(
        and(
          eq(roomConversationParticipantTable.conversationId, input.threadId),
          eq(roomConversationParticipantTable.playerId, player.id),
        ),
      );

    if (actor.type === 'user') {
      await cancelMessageNotificationsForReadThread({
        userId: actor.userId,
        threadId: input.threadId,
        readThroughAt: targetMessage.createdAt,
      });
    }

    publishMessageEvent(input.roomId, 'thread_read', input.threadId);

    return { marked: true };
  });

export const watchMessageEvents = authed
  .input(watchMessageEventsSchema)
  .handler(async ({ input, context: { request, ...context } }) => {
    const actor = requireRpcActor(context);
    await getMessageContext(input.roomId, actor);

    return watchMessageEventStream({
      roomId: input.roomId,
      signal: request?.signal,
    });
  });
