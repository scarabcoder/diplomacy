import { describe, expect, it } from 'bun:test';
import { getAiTemperatureOptions, getNarratorAiModel } from './ai-text.ts';

describe('getNarratorAiModel', () => {
  it('uses the narrator override when configured', () => {
    expect(
      getNarratorAiModel({
        BOT_AI_PROVIDER: 'openai',
        BOT_AI_MODEL: 'gpt-5.2',
        NARRATOR_AI_MODEL: 'gpt-5-mini',
      }),
    ).toBe('gpt-5-mini');
  });

  it('falls back to the primary bot model when narrator override is absent', () => {
    expect(
      getNarratorAiModel({
        BOT_AI_PROVIDER: 'anthropic',
        BOT_AI_MODEL: 'claude-sonnet-4-6',
      }),
    ).toBe('claude-sonnet-4-6');
  });
});

describe('getAiTemperatureOptions', () => {
  it('keeps temperature for anthropic models', () => {
    expect(getAiTemperatureOptions('anthropic', 0.6)).toEqual({
      temperature: 0.6,
    });
  });

  it('omits temperature for openai models', () => {
    expect(getAiTemperatureOptions('openai', 0.6)).toEqual({});
  });
});
