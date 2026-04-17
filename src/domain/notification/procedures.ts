import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import { gamePlayerTable } from '@/database/schema/game-schema.ts';
import {
  roomConversationParticipantTable,
  roomMessageTable,
} from '@/database/schema/message-schema.ts';
import { webPushSubscriptionTable } from '@/database/schema/notification-schema.ts';
import { getVapidConfig } from './config.ts';
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  upsertPreferences,
} from './preferences.ts';
import {
  subscribeWebPushSchema,
  unsubscribeWebPushSchema,
  updatePreferencesSchema,
} from './schema.ts';

export const getVapidPublicKey = authed.handler(async () => {
  const config = getVapidConfig();
  return { publicKey: config?.publicKey ?? null };
});

export const getMyPreferences = authed.handler(async ({ context }) => {
  const userId = context.userSession!.user.id;
  const preferences = await getPreferences(userId);
  return { preferences, defaults: DEFAULT_PREFERENCES };
});

export const updateMyPreferences = authed
  .input(updatePreferencesSchema)
  .handler(async ({ input, context }) => {
    const userId = context.userSession!.user.id;
    const preferences = await upsertPreferences(userId, input);
    return { preferences };
  });

export const subscribeWebPush = authed
  .input(subscribeWebPushSchema)
  .handler(async ({ input, context }) => {
    const userId = context.userSession!.user.id;
    const now = new Date();

    await database
      .insert(webPushSubscriptionTable)
      .values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: webPushSubscriptionTable.endpoint,
        set: {
          userId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          lastUsedAt: now,
        },
      });

    return { subscribed: true };
  });

export const unsubscribeWebPush = authed
  .input(unsubscribeWebPushSchema)
  .handler(async ({ input, context }) => {
    const userId = context.userSession!.user.id;

    await database
      .delete(webPushSubscriptionTable)
      .where(
        and(
          eq(webPushSubscriptionTable.endpoint, input.endpoint),
          eq(webPushSubscriptionTable.userId, userId),
        ),
      );

    return { unsubscribed: true };
  });

export const getUnreadMessageCount = authed.handler(async ({ context }) => {
  const userId = context.userSession!.user.id;

  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMessageTable)
    .innerJoin(
      roomConversationParticipantTable,
      eq(
        roomConversationParticipantTable.conversationId,
        roomMessageTable.conversationId,
      ),
    )
    .innerJoin(
      gamePlayerTable,
      eq(gamePlayerTable.id, roomConversationParticipantTable.playerId),
    )
    .where(
      and(
        eq(gamePlayerTable.userId, userId),
        ne(
          roomMessageTable.senderPlayerId,
          roomConversationParticipantTable.playerId,
        ),
        or(
          isNull(roomConversationParticipantTable.lastReadAt),
          gt(
            roomMessageTable.createdAt,
            roomConversationParticipantTable.lastReadAt,
          ),
        ),
      ),
    );

  return { count: row?.count ?? 0 };
});

export const listMyWebPushSubscriptions = authed.handler(
  async ({ context }) => {
    const userId = context.userSession!.user.id;
    const rows = await database
      .select({
        id: webPushSubscriptionTable.id,
        endpoint: webPushSubscriptionTable.endpoint,
        userAgent: webPushSubscriptionTable.userAgent,
        createdAt: webPushSubscriptionTable.createdAt,
        lastUsedAt: webPushSubscriptionTable.lastUsedAt,
      })
      .from(webPushSubscriptionTable)
      .where(eq(webPushSubscriptionTable.userId, userId));

    return { subscriptions: rows };
  },
);
