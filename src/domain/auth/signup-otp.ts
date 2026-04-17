import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import * as z from 'zod/v4';

export const OTP_TTL_SECONDS = 600;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const MAX_OTP_ATTEMPTS = 5;
export const SIGNUP_OTP_IDENTIFIER_PREFIX = 'signup-otp:';

export function signupOtpIdentifier(email: string): string {
  return `${SIGNUP_OTP_IDENTIFIER_PREFIX}${email.trim().toLowerCase()}`;
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function otpMatches(otp: string, otpHash: string): boolean {
  const candidate = Buffer.from(hashOtp(otp), 'hex');
  const stored = Buffer.from(otpHash, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export const pendingSignupSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  otpHash: z.string().min(1),
  attempts: z.number().int().min(0),
});

export type PendingSignup = z.infer<typeof pendingSignupSchema>;
