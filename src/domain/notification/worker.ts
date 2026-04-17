import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import { userTable } from '@/database/schema/auth-schema.ts';
import {
  gamePlayerTable,
  gameRoomTable,
} from '@/database/schema/game-schema.ts';
import {
  roomConversationTable,
  roomMessageTable,
} from '@/database/schema/message-schema.ts';
import { notificationOutboxTable } from '@/database/schema/notification-schema.ts';
import { gamePhaseResultTable } from '@/database/schema/game-schema.ts';
import type { GamePhaseResultPayload } from '@/domain/game/phase-results.ts';
import { createLogger } from '@/lib/logger.ts';
import {
  renderMessageEmail,
  renderMessagePush,
  renderPhaseResultEmail,
  renderPhaseResultPush,
} from './content.ts';
import { sendEmail } from './email.ts';
import { sendWebPushToUser } from './web-push-server.ts';

const logger = createLogger('notification-worker');

const POLL_INTERVAL_MS = 10_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let shuttingDown = false;

export function startNotificationWorker(): void {
  if (typeof window !== 'undefined') return;
  if (started) return;
  started = true;
  shuttingDown = false;
  logger.info(
    { pollMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
    'Starting notification worker',
  );
  schedule();
}

export function stopNotificationWorker(): void {
  shuttingDown = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  started = false;
}

function schedule(): void {
  if (shuttingDown) return;
  timer = setTimeout(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

async function tick(): Promise<void> {
  if (running) {
    schedule();
    return;
  }
  running = true;
  try {
    await processPending();
  } catch (error) {
    logger.error({ error }, 'Notification worker tick failed');
  } finally {
    running = false;
    schedule();
  }
}

async function processPending(): Promise<void> {
  const now = new Date();

  const rows = await database
    .select()
    .from(notificationOutboxTable)
    .where(
      and(
        eq(notificationOutboxTable.status, 'pending'),
        lte(notificationOutboxTable.scheduledFor, now),
        or(
          isNull(notificationOutboxTable.nextAttemptAt),
          lte(notificationOutboxTable.nextAttemptAt, now),
        ),
      ),
    )
    .orderBy(asc(notificationOutboxTable.scheduledFor))
    .limit(BATCH_SIZE);

  if (rows.length === 0) {
    logger.debug('Worker tick: no pending rows');
    return;
  }

  logger.info({ count: rows.length }, 'Worker tick: dispatching pending rows');

  const processedIds = new Set<string>();

  for (const row of rows) {
    if (processedIds.has(row.id)) continue;
    logger.info(
      {
        id: row.id,
        userId: row.userId,
        channel: row.channel,
        kind: row.kind,
        scheduledFor: row.scheduledFor,
        attempts: row.attempts,
      },
      'Dispatching notification row',
    );
    try {
      const extraIds = await dispatchRow(row);
      processedIds.add(row.id);
      for (const id of extraIds) processedIds.add(id);
      logger.info(
        { id: row.id, coalesced: extraIds.length },
        'Notification row dispatched successfully',
      );
    } catch (error) {
      logger.warn(
        { id: row.id, error, channel: row.channel, kind: row.kind },
        'Notification dispatch threw, will retry',
      );
      await markFailure(row.id, row.attempts + 1, error);
      processedIds.add(row.id);
    }
  }
}

async function dispatchRow(
  row: typeof notificationOutboxTable.$inferSelect,
): Promise<string[]> {
  if (row.kind === 'message') {
    return dispatchMessageRow(row);
  }
  return dispatchPhaseResultRow(row);
}

async function dispatchMessageRow(
  row: typeof notificationOutboxTable.$inferSelect,
): Promise<string[]> {
  if (!row.triggerMessageId || !row.threadId) {
    await markDead(row.id, 'missing trigger message or thread id');
    return [];
  }

  const context = await loadMessageContext({
    userId: row.userId,
    threadId: row.threadId,
    messageId: row.triggerMessageId,
  });
  if (!context) {
    await markDead(row.id, 'message context missing (deleted?)');
    return [];
  }

  const coalesced = await findCoalescableMessageRows(row);
  const allIds = [row.id, ...coalesced];

  if (row.channel === 'email') {
    if (!context.userEmail) {
      await markSentBulk(allIds);
      return coalesced;
    }
    const { subject, html, text } = renderMessageEmail(context.content);
    await sendEmail({ to: context.userEmail, subject, html, text });
    await markSentBulk(allIds);
    return coalesced;
  }

  const push = renderMessagePush(context.content);
  await sendWebPushToUser({ userId: row.userId, payload: push });
  await markSent(row.id);
  return [];
}

async function dispatchPhaseResultRow(
  row: typeof notificationOutboxTable.$inferSelect,
): Promise<string[]> {
  if (!row.phaseResultId) {
    await markDead(row.id, 'missing phase result id');
    return [];
  }

  const context = await loadPhaseResultContext({
    userId: row.userId,
    phaseResultId: row.phaseResultId,
    roomId: row.roomId,
  });
  if (!context) {
    await markDead(row.id, 'phase result context missing');
    return [];
  }

  if (row.channel === 'email') {
    if (!context.userEmail) {
      await markSent(row.id);
      return [];
    }
    const { subject, html, text } = renderPhaseResultEmail(context.content);
    await sendEmail({ to: context.userEmail, subject, html, text });
    await markSent(row.id);
    return [];
  }

  const push = renderPhaseResultPush(context.content);
  await sendWebPushToUser({ userId: row.userId, payload: push });
  await markSent(row.id);
  return [];
}

async function findCoalescableMessageRows(
  row: typeof notificationOutboxTable.$inferSelect,
): Promise<string[]> {
  if (row.channel !== 'email' || !row.threadId) return [];

  const now = new Date();
  const others = await database
    .select({ id: notificationOutboxTable.id })
    .from(notificationOutboxTable)
    .where(
      and(
        eq(notificationOutboxTable.status, 'pending'),
        eq(notificationOutboxTable.channel, 'email'),
        eq(notificationOutboxTable.kind, 'message'),
        eq(notificationOutboxTable.userId, row.userId),
        eq(notificationOutboxTable.threadId, row.threadId),
        lte(notificationOutboxTable.scheduledFor, now),
        // Exclude the row we're already dispatching.
        sql`${notificationOutboxTable.id} <> ${row.id}`,
      ),
    );
  return others.map((o) => o.id);
}

async function loadMessageContext(params: {
  userId: string;
  threadId: string;
  messageId: string;
}): Promise<
  | {
      userEmail: string | null;
      content: Parameters<typeof renderMessageEmail>[0];
    }
  | null
> {
  const user = await selectOne(
    database
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, params.userId)),
  );
  if (!user) return null;

  const message = await selectOne(
    database
      .select()
      .from(roomMessageTable)
      .where(eq(roomMessageTable.id, params.messageId)),
  );
  if (!message) return null;

  const conversation = await selectOne(
    database
      .select()
      .from(roomConversationTable)
      .where(eq(roomConversationTable.id, params.threadId)),
  );
  if (!conversation) return null;

  const room = await selectOne(
    database
      .select()
      .from(gameRoomTable)
      .where(eq(gameRoomTable.id, conversation.roomId)),
  );
  if (!room) return null;

  const senderRow = await selectOne(
    database
      .select({
        playerId: gamePlayerTable.id,
        power: gamePlayerTable.power,
        userName: userTable.name,
        isBot: gamePlayerTable.isBot,
      })
      .from(gamePlayerTable)
      .leftJoin(userTable, eq(gamePlayerTable.userId, userTable.id))
      .where(eq(gamePlayerTable.id, message.senderPlayerId)),
  );
  const senderName = senderRow?.power
    ? capitalize(senderRow.power)
    : (senderRow?.userName ?? 'Another player');

  const threadLabel =
    conversation.kind === 'global'
      ? 'Global chat'
      : conversation.kind === 'group'
        ? 'Group chat'
        : 'Direct message';

  return {
    userEmail: user.email,
    content: {
      roomId: room.id,
      roomName: room.name,
      threadId: conversation.id,
      threadLabel,
      senderName,
      messageBody: message.body,
      messageKind: (message.kind ?? 'text') as 'text' | 'order_proposal',
    },
  };
}

async function loadPhaseResultContext(params: {
  userId: string;
  phaseResultId: string;
  roomId: string;
}): Promise<
  | {
      userEmail: string | null;
      content: Parameters<typeof renderPhaseResultEmail>[0];
    }
  | null
> {
  const user = await selectOne(
    database
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, params.userId)),
  );
  if (!user) return null;

  const result = await selectOne(
    database
      .select()
      .from(gamePhaseResultTable)
      .where(eq(gamePhaseResultTable.id, params.phaseResultId)),
  );
  if (!result) return null;

  const room = await selectOne(
    database
      .select()
      .from(gameRoomTable)
      .where(eq(gameRoomTable.id, params.roomId)),
  );
  if (!room) return null;

  return {
    userEmail: user.email,
    content: {
      roomId: room.id,
      roomName: room.name,
      payload: result.payload as GamePhaseResultPayload,
    },
  };
}

async function markSent(id: string): Promise<void> {
  await database
    .update(notificationOutboxTable)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(notificationOutboxTable.id, id));
}

async function markSentBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await database
    .update(notificationOutboxTable)
    .set({ status: 'sent', sentAt: new Date() })
    .where(inArray(notificationOutboxTable.id, ids));
}

async function markDead(id: string, reason: string): Promise<void> {
  logger.warn({ id, reason }, 'Marking notification outbox row dead');
  await database
    .update(notificationOutboxTable)
    .set({ status: 'dead', lastError: reason })
    .where(eq(notificationOutboxTable.id, id));
}

async function markFailure(
  id: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown error');

  if (attempts >= MAX_ATTEMPTS) {
    logger.warn(
      { id, attempts, error: message },
      'Notification hit max attempts — marking dead',
    );
    await database
      .update(notificationOutboxTable)
      .set({
        status: 'dead',
        attempts,
        lastError: message,
      })
      .where(eq(notificationOutboxTable.id, id));
    return;
  }

  const backoffMs = Math.min(
    5 * 60 * 1000,
    1000 * Math.pow(2, attempts),
  );
  const nextAttemptAt = new Date(Date.now() + backoffMs);

  await database
    .update(notificationOutboxTable)
    .set({ attempts, lastError: message, nextAttemptAt })
    .where(eq(notificationOutboxTable.id, id));
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
