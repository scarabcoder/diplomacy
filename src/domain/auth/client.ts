import { inferAdditionalFields } from 'better-auth/client/plugins';
import { anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { type auth } from '@/domain/auth/auth.ts';

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), anonymousClient()],
});

/**
 * Ensure the user has a session, creating an anonymous one if needed.
 * Call this before any action that requires authentication (e.g., creating/joining rooms).
 */
export async function ensureSession() {
  const session = await authClient.getSession();
  if (session.data) return session.data;

  const result = await authClient.signIn.anonymous();
  return result.data;
}

/**
 * Trigger cross-tab session sync after sign-in/sign-out.
 */
export function triggerSessionChange() {
  localStorage.setItem('sessionChange', Date.now().toString());
}
