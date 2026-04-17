import { eq } from 'drizzle-orm';
import { createFileRoute } from '@tanstack/react-router';
import { APIError } from 'better-auth/api';
import { auth } from '@/domain/auth/auth.ts';
import { database } from '@/database/database.ts';
import { userTable, verificationTable } from '@/database/schema/auth-schema.ts';
import {
  MAX_OTP_ATTEMPTS,
  otpMatches,
  pendingSignupSchema,
  signupOtpIdentifier,
} from '@/domain/auth/signup-otp.ts';
import { signupVerifySchema } from '@/domain/auth/signup-schema.ts';
import { createLogger } from '@/lib/logger.ts';

const logger = createLogger('signup-otp-verify');

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleVerifyOtp(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = signupVerifySchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid verification';
    return jsonResponse({ error: message }, 400);
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const identifier = signupOtpIdentifier(normalizedEmail);

  const rows = await database
    .select()
    .from(verificationTable)
    .where(eq(verificationTable.identifier, identifier))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return jsonResponse(
      { error: 'No pending sign-up for that email. Request a new code.' },
      404,
    );
  }

  if (row.expiresAt.getTime() < Date.now()) {
    await database
      .delete(verificationTable)
      .where(eq(verificationTable.identifier, identifier));
    return jsonResponse({ error: 'Code has expired. Request a new one.' }, 410);
  }

  let pending;
  try {
    pending = pendingSignupSchema.parse(JSON.parse(row.value));
  } catch (err) {
    logger.error({ err, identifier }, 'Corrupt pending signup row');
    await database
      .delete(verificationTable)
      .where(eq(verificationTable.identifier, identifier));
    return jsonResponse(
      { error: 'Sign-up state was invalid. Please start again.' },
      500,
    );
  }

  if (!otpMatches(parsed.data.otp, pending.otpHash)) {
    const nextAttempts = pending.attempts + 1;
    if (nextAttempts >= MAX_OTP_ATTEMPTS) {
      await database
        .delete(verificationTable)
        .where(eq(verificationTable.identifier, identifier));
      return jsonResponse(
        { error: 'Too many incorrect attempts. Request a new code.' },
        429,
      );
    }
    await database
      .update(verificationTable)
      .set({
        value: JSON.stringify({ ...pending, attempts: nextAttempts }),
        updatedAt: new Date(),
      })
      .where(eq(verificationTable.identifier, identifier));
    const remaining = MAX_OTP_ATTEMPTS - nextAttempts;
    return jsonResponse(
      {
        error: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      },
      400,
    );
  }

  let result;
  try {
    result = await auth.api.signUpEmail({
      body: {
        name: pending.name,
        email: pending.email,
        password: pending.password,
      },
      headers: request.headers,
      returnHeaders: true,
    });
  } catch (err) {
    if (err instanceof APIError) {
      logger.warn(
        { err, email: pending.email },
        'signUpEmail rejected after OTP verify',
      );
      const message =
        (err.body && typeof err.body === 'object' && 'message' in err.body
          ? String((err.body as { message?: unknown }).message ?? '')
          : '') || 'Could not create account.';
      return jsonResponse({ error: message }, 422);
    }
    logger.error({ err, email: pending.email }, 'signUpEmail threw');
    return jsonResponse(
      { error: 'Could not create account. Please try again.' },
      500,
    );
  }

  const createdUser = result.response.user;

  await database
    .update(userTable)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(userTable.id, createdUser.id));

  await database
    .delete(verificationTable)
    .where(eq(verificationTable.identifier, identifier));

  const responseHeaders = new Headers(result.headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(
    JSON.stringify({
      ok: true,
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
      },
    }),
    {
      status: 200,
      headers: responseHeaders,
    },
  );
}

export const Route = createFileRoute('/api/auth/signup/verify-otp')({
  server: {
    handlers: {
      ANY: ({ request }) => handleVerifyOtp(request),
    },
  },
});
