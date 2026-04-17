import { Resend } from 'resend';
import { createLogger } from '@/lib/logger.ts';
import { getEmailFrom, getResendApiKey } from './config.ts';

const logger = createLogger('notification-email');

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = getResendApiKey();
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const client = getClient();

  if (!client) {
    logger.info(
      { to: params.to, subject: params.subject },
      'RESEND_API_KEY not set — logging email instead of sending',
    );
    logger.debug({ text: params.text }, 'Email body (dev mode)');
    return;
  }

  const { error } = await client.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    throw new Error(
      `Resend failed: ${error.name ?? 'unknown'} — ${error.message ?? 'no message'}`,
    );
  }
}
