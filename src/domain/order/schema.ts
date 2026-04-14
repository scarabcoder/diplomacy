import * as z from 'zod/v4';
import {
  orderTypeSchema,
  unitTypeSchema,
  buildActionSchema,
} from '@/database/schema/game-schema.ts';

const orderInputSchema = z.object({
  unitProvince: z.string().min(2).max(4),
  orderType: orderTypeSchema,
  targetProvince: z.string().min(2).max(10).optional(),
  supportedUnitProvince: z.string().min(2).max(4).optional(),
  viaConvoy: z.boolean().optional(),
  coast: z.string().max(2).optional(),
});

export const submitOrdersSchema = z.object({
  roomId: z.string().uuid(),
  orders: z.array(orderInputSchema).min(1).max(34),
});

const retreatInputSchema = z.object({
  unitProvince: z.string().min(2).max(4),
  retreatTo: z.string().min(2).max(10).nullable(),
});

export const submitRetreatsSchema = z.object({
  roomId: z.string().uuid(),
  retreats: z.array(retreatInputSchema).min(1).max(34),
});

const buildInputSchema = z.object({
  action: buildActionSchema,
  unitType: unitTypeSchema.optional(),
  province: z.string().min(2).max(4),
  coast: z.string().max(2).optional(),
});

export const submitBuildsSchema = z.object({
  roomId: z.string().uuid(),
  builds: z.array(buildInputSchema).min(1).max(34),
});

export const getMyOrdersSchema = z.object({
  roomId: z.string().uuid(),
});
