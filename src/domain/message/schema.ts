import * as z from 'zod/v4';

const roomIdField = z.string().uuid().describe('The room ID.');

export const listThreadsSchema = z.object({
  roomId: roomIdField,
});

export const openOrCreateThreadSchema = z.object({
  roomId: roomIdField,
  participantPlayerIds: z
    .array(z.string().uuid())
    .min(1, 'Choose at least one player')
    .max(6, 'Too many players selected')
    .describe(
      'Player IDs to include besides the current player. Use room player IDs, not user IDs.',
    ),
});

export const getThreadSchema = z.object({
  roomId: roomIdField,
  threadId: z.string().uuid().describe('The conversation ID to retrieve.'),
  cursor: z
    .string()
    .optional()
    .describe('Optional pagination cursor from the previous response.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum messages to return (1-100, default 50).'),
});

export const sendMessageSchema = z.object({
  roomId: roomIdField,
  threadId: z.string().uuid().describe('The conversation ID to send into.'),
  body: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(2000, 'Message is too long')
    .describe('Plain-text message body.'),
});

export const markThreadReadSchema = z.object({
  roomId: roomIdField,
  threadId: z
    .string()
    .uuid()
    .describe('The conversation ID to mark as read.'),
  readThroughMessageId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Optional message ID to mark through. Defaults to the newest message in the thread.',
    ),
});

export const startTypingSchema = z.object({
  roomId: roomIdField,
  threadId: z.string().uuid().describe('The conversation ID where the user is typing.'),
});

export const watchMessageEventsSchema = z.object({
  roomId: roomIdField,
});
