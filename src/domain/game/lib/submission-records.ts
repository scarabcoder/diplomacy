import * as z from 'zod/v4';

export const mainSubmissionRecordSchema = z.object({
  unitProvince: z.string().min(2).max(10),
  orderType: z.enum(['hold', 'move', 'support', 'convoy']),
  targetProvince: z.string().min(2).max(10).nullable(),
  supportedUnitProvince: z.string().min(2).max(10).nullable(),
  viaConvoy: z.boolean(),
});

export type MainSubmissionRecord = z.infer<typeof mainSubmissionRecordSchema>;

export const retreatSubmissionRecordSchema = z.object({
  unitProvince: z.string().min(2).max(10),
  retreatTo: z.string().min(2).max(10).nullable(),
});

export type RetreatSubmissionRecord = z.infer<
  typeof retreatSubmissionRecordSchema
>;

export const buildSubmissionRecordSchema = z.object({
  action: z.enum(['build', 'disband', 'waive']),
  province: z.string().min(2).max(10),
  unitType: z.enum(['army', 'fleet']).nullable(),
  coast: z.string().max(4).nullable(),
});

export type BuildSubmissionRecord = z.infer<typeof buildSubmissionRecordSchema>;
