import { describe, expect, it } from 'bun:test';
import {
  createBotCredentialSecret,
  createBotCredentialToken,
  hashBotCredentialSecret,
  parseBotCredentialToken,
} from './token.ts';

describe('bot auth helpers', () => {
  it('creates parseable bearer tokens', () => {
    const credentialId = crypto.randomUUID();
    const secret = createBotCredentialSecret();
    const token = createBotCredentialToken(credentialId, secret);

    expect(parseBotCredentialToken(token)).toEqual({
      credentialId,
      secret,
    });
  });

  it('rejects malformed bearer tokens', () => {
    expect(parseBotCredentialToken('')).toBeNull();
    expect(parseBotCredentialToken('missing-delimiter')).toBeNull();
    expect(parseBotCredentialToken('.secret')).toBeNull();
    expect(parseBotCredentialToken('credential.')).toBeNull();
  });

  it('hashes the same secret deterministically', () => {
    const secret = createBotCredentialSecret();

    expect(hashBotCredentialSecret(secret)).toBe(hashBotCredentialSecret(secret));
  });
});
