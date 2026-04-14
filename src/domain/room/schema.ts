import * as z from 'zod/v4';
import { powerSchema } from '@/database/schema/game-schema.ts';

export const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(100),
});

export const joinRoomSchema = z.object({
  code: z.string().length(6, 'Room code must be 6 characters'),
});

export const getRoomSchema = z.object({
  roomId: z.string().uuid(),
});

export const selectPowerSchema = z.object({
  roomId: z.string().uuid(),
  power: powerSchema,
});

export const deselectPowerSchema = z.object({
  roomId: z.string().uuid(),
});

export const setReadySchema = z.object({
  roomId: z.string().uuid(),
  ready: z.boolean(),
});

export const startGameSchema = z.object({
  roomId: z.string().uuid(),
});

export const fillBotsSchema = z.object({
  roomId: z.string().uuid(),
});

export const listMyRoomsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
