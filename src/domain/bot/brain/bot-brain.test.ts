import { describe, expect, it } from 'bun:test';
import { getBotActivationBudget } from './bot-brain.ts';

describe('getBotActivationBudget', () => {
  it('uses a larger budget for game start', () => {
    expect(getBotActivationBudget({ type: 'game_start' })).toEqual({
      maxSteps: 18,
      maxTokens: 10_000,
    });
  });

  it('caps message replies aggressively', () => {
    expect(
      getBotActivationBudget({
        type: 'message_received',
        threadId: crypto.randomUUID(),
        senderPlayerId: crypto.randomUUID(),
      }),
    ).toEqual({
      maxSteps: 6,
      maxTokens: 2_000,
    });
  });

  it('keeps finalize runs on the smallest budget', () => {
    expect(getBotActivationBudget({ type: 'finalize_phase' })).toEqual({
      maxSteps: 3,
      maxTokens: 600,
    });
  });
});
