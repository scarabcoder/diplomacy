import { and, eq, exists, lte, sql } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { roomMessageTable } from '@/database/schema/message-schema.ts';
import { notificationOutboxTable } from '@/database/schema/notification-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import { getPreferencesMap } from './preferences.ts';

const logger = createLogger('notification-enqueue');

type EnqueueMessageParams = {
  roomId: string;
  threadId: string;
  messageId: string;
  recipientUserIds: string[];
};

type EnqueuePhaseResultParams = {
  roomId: string;
  phaseResultId: string;
  recipientUserIds: string[];
};

/**
 * Enqueue notifications for a new message. Called from message procedures.
 * Web push rows run immediately; email rows are debounced per-user to coalesce
 * bursts in a conversation.
 */
export async function enqueueMessageNotifications(
  params: EnqueueMessageParams,
): Promise<void> {
  const userIds = [...new Set(params.recipientUserIds)];
  if (userIds.length === 0) return;

  const prefs = await getPreferencesMap(userIds);
  const now = new Date();

  const rows: (typeof notificationOutboxTable.$inferInsert)[] = [];
  for (const userId of userIds) {
    const pref = prefs.get(userId);
    if (!pref) continue;

    if (pref.webPushOnMessage) {
      rows.push({
        userId,
        channel: 'web_push',
        kind: 'message',
        roomId: params.roomId,
        threadId: params.threadId,
        triggerMessageId: params.messageId,
        dedupeKey: `${userId}:web_push:message:${params.messageId}`,
        scheduledFor: now,
      });
    }

    if (pref.emailOnMessage) {
      const scheduledFor = new Date(
        now.getTime() + pref.messageDebounceSeconds * 1000,
      );
      rows.push({
        userId,
        channel: 'email',
        kind: 'message',
        roomId: params.roomId,
        threadId: params.threadId,
        triggerMessageId: params.messageId,
        dedupeKey: `${userId}:email:message:${params.messageId}`,
        scheduledFor,
      });
    }
  }

  if (rows.length === 0) {
    logger.info(
      { recipientCount: userIds.length, messageId: params.messageId },
      'No message notifications to enqueue (all recipients opted out)',
    );
    return;
  }

  try {
    await database
      .insert(notificationOutboxTable)
      .values(rows)
      .onConflictDoNothing({
        target: notificationOutboxTable.dedupeKey,
      });
    logger.info(
      {
        messageId: params.messageId,
        threadId: params.threadId,
        roomId: params.roomId,
        rowCount: rows.length,
        recipientCount: userIds.length,
      },
      'Enqueued message notifications',
    );
  } catch (error) {
    logger.error({ error, params }, 'Failed to enqueue message notifications');
  }
}

/**
 * Enqueue notifications for a phase result. Called after createPhaseResult.
 * Both channels fire immediately — phase transitions are the rarer, more
 * time-sensitive event.
 */
export async function enqueuePhaseResultNotifications(
  params: EnqueuePhaseResultParams,
): Promise<void> {
  const userIds = [...new Set(params.recipientUserIds)];
  if (userIds.length === 0) return;

  const prefs = await getPreferencesMap(userIds);
  const now = new Date();

  const rows: (typeof notificationOutboxTable.$inferInsert)[] = [];
  for (const userId of userIds) {
    const pref = prefs.get(userId);
    if (!pref) continue;

    if (pref.webPushOnPhaseResult) {
      rows.push({
        userId,
        channel: 'web_push',
        kind: 'phase_result',
        roomId: params.roomId,
        phaseResultId: params.phaseResultId,
        dedupeKey: `${userId}:web_push:phase_result:${params.phaseResultId}`,
        scheduledFor: now,
      });
    }

    if (pref.emailOnPhaseResult) {
      rows.push({
        userId,
        channel: 'email',
        kind: 'phase_result',
        roomId: params.roomId,
        phaseResultId: params.phaseResultId,
        dedupeKey: `${userId}:email:phase_result:${params.phaseResultId}`,
        scheduledFor: now,
      });
    }
  }

  if (rows.length === 0) {
    logger.info(
      {
        recipientCount: userIds.length,
        phaseResultId: params.phaseResultId,
      },
      'No phase-result notifications to enqueue (all recipients opted out)',
    );
    return;
  }

  try {
    await database
      .insert(notificationOutboxTable)
      .values(rows)
      .onConflictDoNothing({
        target: notificationOutboxTable.dedupeKey,
      });
    logger.info(
      {
        phaseResultId: params.phaseResultId,
        roomId: params.roomId,
        rowCount: rows.length,
        recipientCount: userIds.length,
      },
      'Enqueued phase-result notifications',
    );
  } catch (error) {
    logger.error(
      { error, params },
      'Failed to enqueue phase result notifications',
    );
  }
}

/**
 * Cancel still-pending message notifications for a thread the user has just
 * caught up on. Flips matching rows to `dead` so the worker skips them.
 * Covers both email (debounced) and web_push (race with the 10s poll).
 */
export async function cancelMessageNotificationsForReadThread(params: {
  userId: string;
  threadId: string;
  readThroughAt: Date;
}): Promise<void> {
  try {
    const result = await database
      .update(notificationOutboxTable)
      .set({
        status: 'dead',
        lastError: 'cancelled: user read thread',
      })
      .where(
        and(
          eq(notificationOutboxTable.userId, params.userId),
          eq(notificationOutboxTable.threadId, params.threadId),
          eq(notificationOutboxTable.status, 'pending'),
          eq(notificationOutboxTable.kind, 'message'),
          exists(
            database
              .select({ one: sql`1` })
              .from(roomMessageTable)
              .where(
                and(
                  eq(
                    roomMessageTable.id,
                    notificationOutboxTable.triggerMessageId,
                  ),
                  lte(roomMessageTable.createdAt, params.readThroughAt),
                ),
              ),
          ),
        ),
      )
      .returning();

    if (result.length > 0) {
      logger.info(
        {
          userId: params.userId,
          threadId: params.threadId,
          cancelledCount: result.length,
        },
        'Cancelled pending message notifications after thread read',
      );
    }
  } catch (error) {
    logger.error(
      { error, params },
      'Failed to cancel message notifications on thread read',
    );
  }
}
