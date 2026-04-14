import * as z from 'zod/v4';

export const getGameStateSchema = z.object({
  roomId: z.string().uuid(),
});

export const getGameHistorySchema = z.object({
  roomId: z.string().uuid(),
  turnNumber: z.number().int().min(1).optional(),
});

export const getSubmissionStatusSchema = z.object({
  roomId: z.string().uuid(),
});
