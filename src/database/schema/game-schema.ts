import {
  boolean,
  index,
  integer,
  jsonb,
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

// ============================================================================
// ENUMS
// ============================================================================

// --- Powers ---
export const Powers = [
  'england',
  'france',
  'germany',
  'russia',
  'austria',
  'italy',
  'turkey',
] as const;
export const powerEnum = pgEnum('power', Powers);
export type PowerEnum = (typeof Powers)[number];
export const powerSchema = z.enum(Powers);

// --- Room Status ---
export const RoomStatuses = [
  'lobby',
  'playing',
  'completed',
  'abandoned',
] as const;
export const roomStatusEnum = pgEnum('room_status', RoomStatuses);
export type RoomStatusEnum = (typeof RoomStatuses)[number];
export const roomStatusSchema = z.enum(RoomStatuses);

// --- Player Status ---
export const PlayerStatuses = [
  'active',
  'civil_disorder',
  'eliminated',
] as const;
export const playerStatusEnum = pgEnum('player_status', PlayerStatuses);
export type PlayerStatusEnum = (typeof PlayerStatuses)[number];
export const playerStatusSchema = z.enum(PlayerStatuses);

// --- Season ---
export const Seasons = ['spring', 'fall'] as const;
export const seasonEnum = pgEnum('season', Seasons);
export type SeasonEnum = (typeof Seasons)[number];
export const seasonSchema = z.enum(Seasons);

// --- Game Phase ---
export const GamePhases = [
  'order_submission',
  'order_resolution',
  'retreat_submission',
  'retreat_resolution',
  'build_submission',
  'build_resolution',
] as const;
export const gamePhaseEnum = pgEnum('game_phase', GamePhases);
export type GamePhaseEnum = (typeof GamePhases)[number];
export const gamePhaseSchema = z.enum(GamePhases);

// --- Unit Type ---
export const UnitTypes = ['army', 'fleet'] as const;
export const unitTypeEnum = pgEnum('unit_type', UnitTypes);
export type UnitTypeEnum = (typeof UnitTypes)[number];
export const unitTypeSchema = z.enum(UnitTypes);

// --- Order Type ---
export const OrderTypes = ['hold', 'move', 'support', 'convoy'] as const;
export const orderTypeEnum = pgEnum('order_type', OrderTypes);
export type OrderTypeEnum = (typeof OrderTypes)[number];
export const orderTypeSchema = z.enum(OrderTypes);

// --- Build Action ---
export const BuildActions = ['build', 'disband', 'waive'] as const;
export const buildActionEnum = pgEnum('build_action', BuildActions);
export type BuildActionEnum = (typeof BuildActions)[number];
export const buildActionSchema = z.enum(BuildActions);

// ============================================================================
// TABLES
// ============================================================================

// --- Game Room ---
export const gameRoomTable = pgTable(
  'game_room',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    status: roomStatusEnum('status').notNull().default('lobby'),
    currentTurnId: uuid('current_turn_id'),
    winnerId: text('winner_id').references(() => userTable.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by')
      .notNull()
      .references(() => userTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('game_room_code_idx').on(table.code)],
);

// --- Game Player ---
export const gamePlayerTable = pgTable(
  'game_player',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    power: powerEnum('power'),
    status: playerStatusEnum('status').notNull().default('active'),
    isSpectator: boolean('is_spectator').notNull().default(false),
    isReady: boolean('is_ready').notNull().default(false),
    isBot: boolean('is_bot').notNull().default(false),
    supplyCenterCount: integer('supply_center_count').notNull().default(0),
    missedTurnCount: integer('missed_turn_count').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_player_room_idx').on(table.roomId),
    index('game_player_user_idx').on(table.userId),
    unique('game_player_room_user_uniq').on(table.roomId, table.userId),
  ],
);

// --- Game Turn ---
export const gameTurnTable = pgTable(
  'game_turn',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    turnNumber: integer('turn_number').notNull(),
    year: integer('year').notNull(),
    season: seasonEnum('season').notNull(),
    phase: gamePhaseEnum('phase').notNull(),
    unitPositions: jsonb('unit_positions').notNull(),
    supplyCenters: jsonb('supply_centers').notNull(),
    dislodgedUnits: jsonb('dislodged_units'),
    isComplete: boolean('is_complete').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_turn_room_idx').on(table.roomId),
    unique('game_turn_room_number_uniq').on(table.roomId, table.turnNumber),
  ],
);

// --- Game Order ---
export const gameOrderTable = pgTable(
  'game_order',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    turnId: uuid('turn_id')
      .notNull()
      .references(() => gameTurnTable.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    power: powerEnum('power').notNull(),
    unitType: unitTypeEnum('unit_type').notNull(),
    unitProvince: text('unit_province').notNull(),
    orderType: orderTypeEnum('order_type').notNull(),
    targetProvince: text('target_province'),
    supportedUnitProvince: text('supported_unit_province'),
    viaConvoy: boolean('via_convoy').notNull().default(false),
    coast: text('coast'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_order_turn_power_idx').on(table.turnId, table.power),
    index('game_order_room_idx').on(table.roomId),
  ],
);

// --- Game Order Result ---
export const gameOrderResultTable = pgTable(
  'game_order_result',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => gameOrderTable.id, { onDelete: 'cascade' }),
    success: boolean('success').notNull(),
    resultType: text('result_type').notNull(),
    dislodgedFrom: text('dislodged_from'),
    retreatOptions: jsonb('retreat_options'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('game_order_result_order_idx').on(table.orderId)],
);

// --- Game Retreat ---
export const gameRetreatTable = pgTable(
  'game_retreat',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    turnId: uuid('turn_id')
      .notNull()
      .references(() => gameTurnTable.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    power: powerEnum('power').notNull(),
    unitType: unitTypeEnum('unit_type').notNull(),
    unitProvince: text('unit_province').notNull(),
    retreatTo: text('retreat_to'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_retreat_turn_power_idx').on(table.turnId, table.power),
  ],
);

// --- Game Build ---
export const gameBuildTable = pgTable(
  'game_build',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    turnId: uuid('turn_id')
      .notNull()
      .references(() => gameTurnTable.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => gameRoomTable.id, { onDelete: 'cascade' }),
    power: powerEnum('power').notNull(),
    action: buildActionEnum('action').notNull(),
    unitType: unitTypeEnum('unit_type'),
    province: text('province').notNull(),
    coast: text('coast'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('game_build_turn_power_idx').on(table.turnId, table.power),
  ],
);

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const gameRoomSelectSchema = createSelectSchema(gameRoomTable);
export const gameRoomInsertSchema = createInsertSchema(gameRoomTable, {
  name: z.string().min(1, 'Name is required'),
  status: roomStatusSchema,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const gamePlayerSelectSchema = createSelectSchema(gamePlayerTable);
export const gamePlayerInsertSchema = createInsertSchema(gamePlayerTable, {
  status: playerStatusSchema,
}).omit({ id: true, joinedAt: true });

export const gameTurnSelectSchema = createSelectSchema(gameTurnTable);
export const gameTurnInsertSchema = createInsertSchema(gameTurnTable, {
  season: seasonSchema,
  phase: gamePhaseSchema,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const gameOrderSelectSchema = createSelectSchema(gameOrderTable);
export const gameOrderInsertSchema = createInsertSchema(gameOrderTable, {
  orderType: orderTypeSchema,
  unitType: unitTypeSchema,
}).omit({ id: true, createdAt: true });

export const gameOrderResultSelectSchema =
  createSelectSchema(gameOrderResultTable);
export const gameRetreatSelectSchema = createSelectSchema(gameRetreatTable);
export const gameBuildSelectSchema = createSelectSchema(gameBuildTable);
