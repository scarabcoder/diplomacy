import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import * as z from 'zod/v4';
import { userTable } from './auth-schema.ts';
import { gameRoomTable } from './game-schema.ts';
import { roomConversationTable, roomMessageTable } from './message-schema.ts';

// ============================================================================
// ENUMS
// ============================================================================

export const NotificationChannels = ['email', 'web_push'] as const;
export const notificationChannelEnum = pgEnum(
  'notification_channel',
  NotificationChannels,
);
export type NotificationChannel = (typeof NotificationChannels)[number];
export const notificationChannelSchema = z.enum(NotificationChannels);

export const NotificationKinds = ['message', 'phase_result'] as const;
export const notificationKindEnum = pgEnum(
  'notification_kind',
  NotificationKinds,
);
export type NotificationKind = (typeof NotificationKinds)[number];
export const notificationKindSchema = z.enum(NotificationKinds);

export const NotificationStatuses = ['pending', 'sent', 'dead'] as const;
export const notificationStatusEnum = pgEnum(
  'notification_status',
  NotificationStatuses,
);
export type NotificationStatus = (typeof NotificationStatuses)[number];
export const notificationStatusSchema = z.enum(NotificationStatuses);

// ============================================================================
// TABLES
// ============================================================================

export const userNotificationPreferenceTable = pgTable(
  'user_notification_preference',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    emailOnMessage: boolean('email_on_message').notNull().default(true),
    emailOnPhaseResult: boolean('email_on_phase_result')
      .notNull()
      .default(true),
    webPushOnMessage: boolean('web_push_on_message').notNull().default(true),
    webPushOnPhaseResult: boolean('web_push_on_phase_result')
      .notNull()
      .default(true),
    messageDebounceSeconds: integer('message_debounce_seconds')
      .notNull()
      .default(300),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const webPushSubscriptionTable = pgTable(
  'web_push_subscription',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [index('web_push_subscription_user_idx').on(table.userId)],
);

export const notificationOutboxTable = pgTable(
  'notification_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    kind: notificationKindEnum('kind').notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => roomConversationTable.id, {
      onDelete: 'cascade',
    }),
    triggerMessageId: uuid('trigger_message_id').references(
      () => roomMessageTable.id,
      { onDelete: 'cascade' },
    ),
    phaseResultId: uuid('phase_result_id'),
    dedupeKey: text('dedupe_key').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: notificationStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notification_outbox_status_scheduled_idx').on(
      table.status,
      table.scheduledFor,
    ),
    index('notification_outbox_user_kind_idx').on(table.userId, table.kind),
    unique('notification_outbox_dedupe_key_uniq').on(table.dedupeKey),
  ],
);

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const userNotificationPreferenceSelectSchema = createSelectSchema(
  userNotificationPreferenceTable,
);
export const userNotificationPreferenceInsertSchema = createInsertSchema(
  userNotificationPreferenceTable,
).omit({ createdAt: true, updatedAt: true });

export const webPushSubscriptionSelectSchema = createSelectSchema(
  webPushSubscriptionTable,
);
export const webPushSubscriptionInsertSchema = createInsertSchema(
  webPushSubscriptionTable,
).omit({ id: true, createdAt: true, lastUsedAt: true });

export const notificationOutboxSelectSchema = createSelectSchema(
  notificationOutboxTable,
);
