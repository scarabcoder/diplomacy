import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import * as z from 'zod/v4';
import { gamePlayerTable, gameRoomTable } from './game-schema.ts';

export const RoomConversationKinds = ['direct', 'group'] as const;
export const roomConversationKindEnum = pgEnum(
  'room_conversation_kind',
  RoomConversationKinds,
);
export type RoomConversationKind = (typeof RoomConversationKinds)[number];
export const roomConversationKindSchema = z.enum(RoomConversationKinds);

export const RoomConversationStatuses = ['active', 'archived'] as const;
export const roomConversationStatusEnum = pgEnum(
  'room_conversation_status',
  RoomConversationStatuses,
);
export type RoomConversationStatus = (typeof RoomConversationStatuses)[number];
export const roomConversationStatusSchema = z.enum(RoomConversationStatuses);

export const RoomConversationArchivedReasons = [
  'participant_eliminated',
  'room_completed',
] as const;
export const roomConversationArchivedReasonEnum = pgEnum(
  'room_conversation_archived_reason',
  RoomConversationArchivedReasons,
);
export type RoomConversationArchivedReason =
  (typeof RoomConversationArchivedReasons)[number];
export const roomConversationArchivedReasonSchema = z.enum(
  RoomConversationArchivedReasons,
);

export const roomConversationTable = pgTable(
  'room_conversation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    participantKey: text('participant_key').notNull(),
    kind: roomConversationKindEnum('kind').notNull(),
    status: roomConversationStatusEnum('status').notNull().default('active'),
    archivedReason: roomConversationArchivedReasonEnum('archived_reason'),
    createdByPlayerId: uuid('created_by_player_id')
      .notNull()
      .references(() => gamePlayerTable.id, { onDelete: 'cascade' }),
    lastMessageId: uuid('last_message_id'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('room_conversation_room_idx').on(table.roomId),
    unique('room_conversation_room_participant_key_uniq').on(
      table.roomId,
      table.participantKey,
    ),
  ],
);

export const roomConversationParticipantTable = pgTable(
  'room_conversation_participant',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => roomConversationTable.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => gamePlayerTable.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id'),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('room_conversation_participant_conversation_idx').on(
      table.conversationId,
    ),
    index('room_conversation_participant_player_idx').on(table.playerId),
    unique('room_conversation_participant_conversation_player_uniq').on(
      table.conversationId,
      table.playerId,
    ),
  ],
);

export const roomMessageTable = pgTable(
  'room_message',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => roomConversationTable.id, { onDelete: 'cascade' }),
    senderPlayerId: uuid('sender_player_id')
      .notNull()
      .references(() => gamePlayerTable.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('room_message_room_idx').on(table.roomId),
    index('room_message_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    index('room_message_sender_idx').on(table.senderPlayerId),
  ],
);

export const roomConversationSelectSchema =
  createSelectSchema(roomConversationTable);
export const roomConversationInsertSchema = createInsertSchema(
  roomConversationTable,
  {
    kind: roomConversationKindSchema,
    status: roomConversationStatusSchema,
    archivedReason: roomConversationArchivedReasonSchema.nullable(),
  },
).omit({ id: true, createdAt: true, updatedAt: true });

export const roomConversationParticipantSelectSchema = createSelectSchema(
  roomConversationParticipantTable,
);
export const roomConversationParticipantInsertSchema = createInsertSchema(
  roomConversationParticipantTable,
).omit({ id: true, joinedAt: true });

export const roomMessageSelectSchema = createSelectSchema(roomMessageTable);
export const roomMessageInsertSchema = createInsertSchema(roomMessageTable, {
  body: z.string().trim().min(1, 'Message body is required').max(2000),
}).omit({ id: true, createdAt: true });
