import { createHash, randomBytes } from 'crypto';

export function createBotCredentialSecret() {
  return randomBytes(24).toString('hex');
}

export function hashBotCredentialSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function createBotCredentialToken(credentialId: string, secret: string) {
  return `${credentialId}.${secret}`;
}

export function parseBotCredentialToken(token: string) {
  const delimiterIndex = token.indexOf('.');

  if (delimiterIndex <= 0 || delimiterIndex === token.length - 1) {
    return null;
  }

  return {
    credentialId: token.slice(0, delimiterIndex),
    secret: token.slice(delimiterIndex + 1),
  };
}
