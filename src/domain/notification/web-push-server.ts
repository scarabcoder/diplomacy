import webpush from 'web-push';
import { and, eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { webPushSubscriptionTable } from '@/database/schema/notification-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import { getVapidConfig } from './config.ts';

const logger = createLogger('notification-web-push');

let vapidInitialised = false;

function ensureVapid(): boolean {
  if (vapidInitialised) return true;
  const config = getVapidConfig();
  if (!config) return false;

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  vapidInitialised = true;
  return true;
}

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/**
 * Send a push to every active subscription for a user. Subscriptions that
 * return 404 or 410 are deleted (the browser has unsubscribed).
 */
export async function sendWebPushToUser(params: {
  userId: string;
  payload: WebPushPayload;
}): Promise<{ sent: number; removed: number }> {
  if (!ensureVapid()) {
    logger.warn(
      { userId: params.userId },
      'VAPID not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY unset) — skipping web push',
    );
    return { sent: 0, removed: 0 };
  }

  const subscriptions = await database
    .select()
    .from(webPushSubscriptionTable)
    .where(eq(webPushSubscriptionTable.userId, params.userId));

  logger.info(
    {
      userId: params.userId,
      subscriptionCount: subscriptions.length,
      payloadTitle: params.payload.title,
    },
    'Sending web push to user',
  );

  if (subscriptions.length === 0) {
    logger.warn(
      { userId: params.userId },
      'User has no registered web-push subscriptions — nothing to send',
    );
    return { sent: 0, removed: 0 };
  }

  const payload = JSON.stringify(params.payload);
  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    const endpointHost = (() => {
      try {
        return new URL(subscription.endpoint).host;
      } catch {
        return 'invalid-endpoint';
      }
    })();
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );
      sent++;
      logger.info(
        {
          userId: params.userId,
          subscriptionId: subscription.id,
          endpointHost,
        },
        'Web push delivered',
      );
      await database
        .update(webPushSubscriptionTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(webPushSubscriptionTable.id, subscription.id));
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        logger.info(
          {
            userId: params.userId,
            subscriptionId: subscription.id,
            endpointHost,
            statusCode,
          },
          'Web push subscription gone (404/410) — pruning',
        );
        await database
          .delete(webPushSubscriptionTable)
          .where(
            and(
              eq(webPushSubscriptionTable.id, subscription.id),
              eq(webPushSubscriptionTable.userId, params.userId),
            ),
          );
        removed++;
      } else {
        logger.warn(
          {
            error,
            statusCode,
            userId: params.userId,
            subscriptionId: subscription.id,
            endpointHost,
          },
          'Web push delivery failed',
        );
        throw error;
      }
    }
  }

  logger.info(
    { userId: params.userId, sent, removed },
    'Web push batch complete',
  );

  return { sent, removed };
}
