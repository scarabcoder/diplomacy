import * as z from 'zod/v4';

export const updatePreferencesSchema = z.object({
  emailOnMessage: z.boolean().optional(),
  emailOnPhaseResult: z.boolean().optional(),
  webPushOnMessage: z.boolean().optional(),
  webPushOnPhaseResult: z.boolean().optional(),
  messageDebounceSeconds: z.number().int().min(0).max(3600).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const subscribeWebPushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});
export type SubscribeWebPushInput = z.infer<typeof subscribeWebPushSchema>;

export const unsubscribeWebPushSchema = z.object({
  endpoint: z.string().url(),
});
