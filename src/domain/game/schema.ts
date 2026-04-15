import * as z from 'zod/v4';

export const getGameStateSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const getGameHistorySchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  turnNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional turn number to fetch. Omit to list all turns.'),
});

export const getSubmissionStatusSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});

export const acknowledgePhaseResultSchema = z.object({
  phaseResultId: z.string().uuid().describe('The phase result ID to acknowledge.'),
});
