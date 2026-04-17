export function getPublicAppUrl(): string {
  return (
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    'http://localhost:3000'
  );
}

export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    'Diplomacy <notifications@localhost>'
  );
}

export function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

export function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:support@localhost';

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}
