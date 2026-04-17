import * as z from 'zod/v4';
import {
  buildSubmissionRecordSchema,
  mainSubmissionRecordSchema,
  retreatSubmissionRecordSchema,
} from '@/domain/game/lib/submission-records.ts';

const roomIdField = z.string().uuid().describe('The room ID.');

const unitSchema = z.object({
  power: z.enum([
    'england',
    'france',
    'germany',
    'russia',
    'austria',
    'italy',
    'turkey',
  ]),
  unitType: z.enum(['army', 'fleet']),
  coast: z.string().max(4).nullable().optional(),
});

const dislodgedUnitSchema = z.object({
  power: z.enum([
    'england',
    'france',
    'germany',
    'russia',
    'austria',
    'italy',
    'turkey',
  ]),
  unitType: z.enum(['army', 'fleet']),
  province: z.string().min(2).max(10),
  coast: z.string().max(4).nullable().optional(),
  dislodgedFrom: z.string().min(2).max(10),
  retreatOptions: z.array(z.string().min(2).max(10)),
});

const powerOrNullSchema = z
  .enum([
    'england',
    'france',
    'germany',
    'russia',
    'austria',
    'italy',
    'turkey',
  ])
  .nullable();

export const orderProposalPayloadSchema = z.object({
  version: z.literal(1),
  turnId: z.string().uuid(),
  turnNumber: z.number().int().min(1),
  year: z.number().int().min(1900).max(2100),
  season: z.enum(['spring', 'fall']),
  phase: z.enum(['order_submission', 'retreat_submission', 'build_submission']),
  orders: z.union([
    z.array(mainSubmissionRecordSchema).min(1).max(34),
    z.array(retreatSubmissionRecordSchema).min(1).max(34),
    z.array(buildSubmissionRecordSchema).min(1).max(34),
  ]),
  boardBefore: z.object({
    positions: z.record(z.string(), unitSchema),
    supplyCenters: z.record(z.string(), powerOrNullSchema),
    dislodgedUnits: z.array(dislodgedUnitSchema),
  }),
});

export type OrderProposalPayload = z.infer<typeof orderProposalPayloadSchema>;

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

export const sendOrderProposalSchema = z.object({
  roomId: roomIdField,
  threadId: z.string().uuid().describe('The conversation ID to send into.'),
  body: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(2000, 'Message is too long')
    .describe(
      'Plain-text body that accompanies the proposal (e.g. "What do you think of this?").',
    ),
  proposal: orderProposalPayloadSchema.describe(
    'The structured order proposal payload. Snapshots the board state at send time.',
  ),
});

export const markThreadReadSchema = z.object({
  roomId: roomIdField,
  threadId: z.string().uuid().describe('The conversation ID to mark as read.'),
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
  threadId: z
    .string()
    .uuid()
    .describe('The conversation ID where the user is typing.'),
});

export const watchMessageEventsSchema = z.object({
  roomId: roomIdField,
});
