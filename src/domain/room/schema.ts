import * as z from 'zod/v4';
import { powerSchema } from '@/database/schema/game-schema.ts';

export const createRoomSchema = z.object({
  name: z
    .string()
    .min(1, 'Room name is required')
    .max(100)
    .describe('Display name for the room.'),
});

export const joinRoomSchema = z.object({
  code: z
    .string()
    .length(6, 'Room code must be 6 characters')
    .describe('Six-character room code.'),
});

export const getRoomSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const watchRoomPageStateSchema = getRoomSchema;

export const selectPowerSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  power: powerSchema.describe('Power to claim for the current player seat.'),
});

export const deselectPowerSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const setReadySchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  ready: z.boolean().describe('Whether to mark the current seat ready.'),
});

export const startGameSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const fillBotsSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const finalizePhaseSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const listMyRoomsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum rooms to return (1-50, default 20).'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Zero-based pagination offset.'),
});
