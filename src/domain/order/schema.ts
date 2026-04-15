import * as z from 'zod/v4';
import {
  orderTypeSchema,
  unitTypeSchema,
  buildActionSchema,
} from '@/database/schema/game-schema.ts';

const orderInputSchema = z.object({
  unitProvince: z
    .string()
    .min(2)
    .max(4)
    .describe('Province of the unit issuing the order.'),
  orderType: orderTypeSchema.describe('Order type: hold, move, support, or convoy.'),
  targetProvince: z
    .string()
    .min(2)
    .max(10)
    .optional()
    .describe('Target province for move, support, or convoy orders.'),
  supportedUnitProvince: z
    .string()
    .min(2)
    .max(4)
    .optional()
    .describe('Province of the supported unit when orderType is support.'),
  viaConvoy: z
    .boolean()
    .optional()
    .describe('Whether a move order should travel by convoy.'),
  coast: z
    .string()
    .max(2)
    .optional()
    .describe('Optional coast suffix when a coastal destination requires it.'),
});

export const submitOrdersSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  orders: z
    .array(orderInputSchema)
    .min(1)
    .max(34)
    .describe('Orders to submit for the current player power.'),
});

const retreatInputSchema = z.object({
  unitProvince: z
    .string()
    .min(2)
    .max(4)
    .describe('Province of the dislodged unit.'),
  retreatTo: z
    .string()
    .min(2)
    .max(10)
    .nullable()
    .describe('Destination province for the retreat, or null to disband.'),
});

export const submitRetreatsSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  retreats: z
    .array(retreatInputSchema)
    .min(1)
    .max(34)
    .describe('Retreat decisions for the current player power.'),
});

const buildInputSchema = z.object({
  action: buildActionSchema.describe('Build action: build, disband, or waive.'),
  unitType: unitTypeSchema
    .optional()
    .describe('Unit type for build orders. Omit for disband or waive actions.'),
  province: z
    .string()
    .min(2)
    .max(4)
    .describe('Province where the build or disband happens.'),
  coast: z
    .string()
    .max(2)
    .optional()
    .describe('Optional coast suffix for coastal builds.'),
});

export const submitBuildsSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
  builds: z
    .array(buildInputSchema)
    .min(1)
    .max(34)
    .describe('Build or disband orders for the current player power.'),
});

export const getMyOrdersSchema = z.object({
  roomId: z.string().uuid().describe('The room ID.'),
});
