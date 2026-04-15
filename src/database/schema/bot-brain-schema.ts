import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-zod';
import {
  botTable,
  gamePlayerTable,
  gameRoomTable,
  powerEnum,
} from './game-schema.ts';

// ============================================================================
// BOT BRAIN STATE
// ============================================================================

export const botBrainStateTable = pgTable(
  'bot_brain_state',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => gamePlayerTable.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    botId: uuid('bot_id')
      .notNull()
      .references(() => botTable.id, { onDelete: 'cascade' }),
    power: powerEnum('power').notNull(),
    strategicPlan: text('strategic_plan').notNull().default(''),
    observations: jsonb('observations').notNull().default([]),
    relationships: jsonb('relationships').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('bot_brain_state_player_uniq').on(table.playerId),
    index('bot_brain_state_room_idx').on(table.roomId),
    index('bot_brain_state_bot_idx').on(table.botId),
  ],
);

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const botBrainStateSelectSchema = createSelectSchema(botBrainStateTable);
