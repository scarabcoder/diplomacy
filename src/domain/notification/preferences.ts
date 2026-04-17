import { eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { userNotificationPreferenceTable } from '@/database/schema/notification-schema.ts';
import { selectOne } from '@/database/helpers.ts';

export type NotificationPreferences = {
  userId: string;
  emailOnMessage: boolean;
  emailOnPhaseResult: boolean;
  webPushOnMessage: boolean;
  webPushOnPhaseResult: boolean;
  messageDebounceSeconds: number;
};

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId'> = {
  emailOnMessage: true,
  emailOnPhaseResult: true,
  webPushOnMessage: true,
  webPushOnPhaseResult: true,
  messageDebounceSeconds: 300,
};

export async function getPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const row = await selectOne(
    database
      .select()
      .from(userNotificationPreferenceTable)
      .where(eq(userNotificationPreferenceTable.userId, userId)),
  );

  if (!row) {
    return { userId, ...DEFAULT_PREFERENCES };
  }

  return {
    userId: row.userId,
    emailOnMessage: row.emailOnMessage,
    emailOnPhaseResult: row.emailOnPhaseResult,
    webPushOnMessage: row.webPushOnMessage,
    webPushOnPhaseResult: row.webPushOnPhaseResult,
    messageDebounceSeconds: row.messageDebounceSeconds,
  };
}

export async function getPreferencesMap(
  userIds: string[],
): Promise<Map<string, NotificationPreferences>> {
  if (userIds.length === 0) return new Map();

  const rows = await database
    .select()
    .from(userNotificationPreferenceTable);

  const map = new Map<string, NotificationPreferences>();
  for (const userId of userIds) {
    map.set(userId, { userId, ...DEFAULT_PREFERENCES });
  }
  for (const row of rows) {
    if (!map.has(row.userId)) continue;
    map.set(row.userId, {
      userId: row.userId,
      emailOnMessage: row.emailOnMessage,
      emailOnPhaseResult: row.emailOnPhaseResult,
      webPushOnMessage: row.webPushOnMessage,
      webPushOnPhaseResult: row.webPushOnPhaseResult,
      messageDebounceSeconds: row.messageDebounceSeconds,
    });
  }
  return map;
}

export async function upsertPreferences(
  userId: string,
  updates: Partial<Omit<NotificationPreferences, 'userId'>>,
): Promise<NotificationPreferences> {
  const current = await getPreferences(userId);
  const merged = { ...current, ...updates };
  const now = new Date();

  await database
    .insert(userNotificationPreferenceTable)
    .values({
      userId,
      emailOnMessage: merged.emailOnMessage,
      emailOnPhaseResult: merged.emailOnPhaseResult,
      webPushOnMessage: merged.webPushOnMessage,
      webPushOnPhaseResult: merged.webPushOnPhaseResult,
      messageDebounceSeconds: merged.messageDebounceSeconds,
    })
    .onConflictDoUpdate({
      target: userNotificationPreferenceTable.userId,
      set: {
        emailOnMessage: merged.emailOnMessage,
        emailOnPhaseResult: merged.emailOnPhaseResult,
        webPushOnMessage: merged.webPushOnMessage,
        webPushOnPhaseResult: merged.webPushOnPhaseResult,
        messageDebounceSeconds: merged.messageDebounceSeconds,
        updatedAt: now,
      },
    });

  return merged;
}
