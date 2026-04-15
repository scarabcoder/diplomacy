import { describe, expect, it } from 'bun:test';
import {
  buildParticipantKey,
  canAccessMessages,
  canWriteMessages,
  describeArchivedReason,
} from './utils.ts';

describe('message utils', () => {
  it('normalizes participant keys', () => {
    expect(buildParticipantKey(['b', 'a', 'b', 'c'])).toBe('a:b:c');
  });

  it('allows any non-spectator player to access messages', () => {
    expect(
      canAccessMessages({ isSpectator: false, isBot: false }),
    ).toBeTrue();
    expect(canAccessMessages({ isSpectator: false, isBot: true })).toBeTrue();
    expect(canAccessMessages({ isSpectator: true, isBot: false })).toBeFalse();
  });

  it('makes completed rooms and eliminated players read-only', () => {
    expect(
      canWriteMessages({
        roomStatus: 'playing',
        playerStatus: 'active',
        isSpectator: false,
        isBot: false,
      }),
    ).toBeTrue();
    expect(
      canWriteMessages({
        roomStatus: 'completed',
        playerStatus: 'active',
        isSpectator: false,
        isBot: false,
      }),
    ).toBeFalse();
    expect(
      canWriteMessages({
        roomStatus: 'playing',
        playerStatus: 'eliminated',
        isSpectator: false,
        isBot: false,
      }),
    ).toBeFalse();
  });

  it('describes archived reasons', () => {
    expect(describeArchivedReason('participant_eliminated')).toContain(
      'eliminated',
    );
    expect(describeArchivedReason('room_completed')).toContain('complete');
    expect(describeArchivedReason(null)).toContain('read-only');
  });
});
