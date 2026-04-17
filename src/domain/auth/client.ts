import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { type auth } from '@/domain/auth/auth.ts';

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

/**
 * Trigger cross-tab session sync after sign-in/sign-out.
 */
export function triggerSessionChange() {
  localStorage.setItem('sessionChange', Date.now().toString());
}
