import * as z from 'zod/v4';

export const getBotBrainStateSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  playerId: z.string().uuid().describe('The bot player ID.'),
});

export const getBotMessagesSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  playerId: z.string().uuid().describe('The bot player ID.'),
});
