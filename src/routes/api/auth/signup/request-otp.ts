import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createFileRoute } from '@tanstack/react-router';
import { database } from '@/database/database.ts';
import { userTable, verificationTable } from '@/database/schema/auth-schema.ts';
import {
  generateOtp,
  hashOtp,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  signupOtpIdentifier,
  type PendingSignup,
} from '@/domain/auth/signup-otp.ts';
import { signupRequestSchema } from '@/domain/auth/signup-schema.ts';
import { sendEmail } from '@/domain/notification/email.ts';
import { renderSignupOtpEmail } from '@/domain/notification/content.ts';
import { createLogger } from '@/lib/logger.ts';

const logger = createLogger('signup-otp-request');

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleRequestOtp(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = signupRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid signup details';
    return jsonResponse({ error: message }, 400);
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const identifier = signupOtpIdentifier(normalizedEmail);

  const existingUser = await database
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1);

  if (existingUser.length > 0) {
    return jsonResponse(
      { error: 'An account with that email already exists.' },
      409,
    );
  }

  const existingPending = await database
    .select()
    .from(verificationTable)
    .where(eq(verificationTable.identifier, identifier))
    .limit(1);

  const now = Date.now();
  const recent = existingPending[0];
  if (recent?.createdAt) {
    const ageMs = now - recent.createdAt.getTime();
    if (ageMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfter = Math.ceil(
        (OTP_RESEND_COOLDOWN_SECONDS * 1000 - ageMs) / 1000,
      );
      return new Response(
        JSON.stringify({
          error: `Please wait ${retryAfter}s before requesting another code.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }
  }

  const otp = generateOtp();
  const pending: PendingSignup = {
    name: name.trim(),
    email: normalizedEmail,
    password,
    otpHash: hashOtp(otp),
    attempts: 0,
  };

  await database
    .delete(verificationTable)
    .where(eq(verificationTable.identifier, identifier));

  await database.insert(verificationTable).values({
    id: randomUUID(),
    identifier,
    value: JSON.stringify(pending),
    expiresAt: new Date(now + OTP_TTL_SECONDS * 1000),
  });

  const email_ = renderSignupOtpEmail({
    otp,
    ttlMinutes: Math.round(OTP_TTL_SECONDS / 60),
  });

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: email_.subject,
      html: email_.html,
      text: email_.text,
    });
  } catch (err) {
    logger.error({ err, email: normalizedEmail }, 'Failed to send OTP email');
    return jsonResponse(
      { error: 'Could not send verification email. Please try again.' },
      502,
    );
  }

  return jsonResponse({ ok: true, email: normalizedEmail }, 200);
}

export const Route = createFileRoute('/api/auth/signup/request-otp')({
  server: {
    handlers: {
      ANY: ({ request }) => handleRequestOtp(request),
    },
  },
});
