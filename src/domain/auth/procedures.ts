import { nullableUserSessionSchema } from '@/domain/auth/auth-types.ts';
import { pub } from '@/rpc/base.ts';

export const getUserSession = pub
  .output(nullableUserSessionSchema)
  .handler(async ({ context }) => {
    return context.userSession ?? null;
  });
