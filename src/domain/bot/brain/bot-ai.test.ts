import { describe, expect, it } from 'bun:test';
import {
  getBotAiModel,
  getBotAiModelOptions,
  getBotAiTaglineModelOptions,
  getBotAiTaglineModel,
  resolveBotAiConfig,
  resolveBotAiProvider,
} from './bot-ai.ts';

describe('resolveBotAiProvider', () => {
  it('uses an explicit provider when configured', () => {
    expect(
      resolveBotAiProvider({
        BOT_AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai',
      }),
    ).toBe('openai');
  });

  it('auto-detects openai when only the OpenAI key is present', () => {
    expect(
      resolveBotAiProvider({
        OPENAI_API_KEY: 'sk-openai',
      }),
    ).toBe('openai');
  });

  it('keeps anthropic as the fallback when both keys are present', () => {
    expect(
      resolveBotAiProvider({
        ANTHROPIC_API_KEY: 'sk-ant',
        OPENAI_API_KEY: 'sk-openai',
      }),
    ).toBe('anthropic');
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      resolveBotAiProvider({
        BOT_AI_PROVIDER: 'gemini',
      }),
    ).toThrow(
      'BOT_AI_PROVIDER must be "anthropic" or "openai", received "gemini"',
    );
  });
});

describe('resolveBotAiConfig', () => {
  it('uses provider-specific defaults', () => {
    const config = resolveBotAiConfig({
      BOT_AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-openai',
    });

    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-5.2');
    expect(config.taglineModel).toBe('gpt-5-mini');
  });

  it('honors explicit model overrides', () => {
    const env = {
      BOT_AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant',
      BOT_AI_MODEL: 'claude-sonnet-4-6',
      BOT_AI_TAGLINE_MODEL: 'claude-haiku-4-5',
    };

    expect(getBotAiModel(env)).toBe('claude-sonnet-4-6');
    expect(getBotAiTaglineModel(env)).toBe('claude-haiku-4-5');
  });

  it('uses low-effort provider options for openai taglines', () => {
    expect(
      getBotAiTaglineModelOptions({
        BOT_AI_PROVIDER: 'openai',
      }),
    ).toEqual({
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    });
  });

  it('does not add tagline model options for anthropic', () => {
    expect(
      getBotAiTaglineModelOptions({
        BOT_AI_PROVIDER: 'anthropic',
      }),
    ).toBeUndefined();
  });

  it('uses low-effort provider options for openai bot turns', () => {
    expect(
      getBotAiModelOptions({
        BOT_AI_PROVIDER: 'openai',
      }),
    ).toEqual({
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    });
  });

  it('does not add turn model options for anthropic', () => {
    expect(
      getBotAiModelOptions({
        BOT_AI_PROVIDER: 'anthropic',
      }),
    ).toBeUndefined();
  });

  it('requires the matching provider key', () => {
    expect(() =>
      resolveBotAiConfig({
        BOT_AI_PROVIDER: 'openai',
      }),
    ).toThrow(
      'OPENAI_API_KEY environment variable is required when BOT_AI_PROVIDER=openai',
    );
  });
});
