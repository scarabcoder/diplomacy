import { createAnthropicChat } from '@tanstack/ai-anthropic';
import { createOpenaiChat } from '@tanstack/ai-openai';

export type AiProvider = 'anthropic' | 'openai';

type AiEnv = Record<string, string | undefined>;

const DEFAULT_PROVIDER: AiProvider = 'anthropic';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.2',
};

const DEFAULT_TAGLINE_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
};

function hasValue(value: string | undefined): value is string {
  return value != null && value.trim().length > 0;
}

function getRequiredApiKey(provider: AiProvider, env: AiEnv): string {
  const envVar =
    provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const value = env[envVar];

  if (!hasValue(value)) {
    throw new Error(
      `${envVar} environment variable is required when BOT_AI_PROVIDER=${provider}`,
    );
  }

  return value;
}

function getConfiguredValue(
  value: string | undefined,
  fallback: string,
): string {
  return hasValue(value) ? value.trim() : fallback;
}

export function resolveAiProvider(env: AiEnv = process.env): AiProvider {
  const configuredProvider = env.BOT_AI_PROVIDER?.trim().toLowerCase();
  if (configuredProvider === 'anthropic' || configuredProvider === 'openai') {
    return configuredProvider;
  }

  if (configuredProvider) {
    throw new Error(
      `BOT_AI_PROVIDER must be "anthropic" or "openai", received "${env.BOT_AI_PROVIDER}"`,
    );
  }

  const hasAnthropicKey = hasValue(env.ANTHROPIC_API_KEY);
  const hasOpenAiKey = hasValue(env.OPENAI_API_KEY);

  if (hasAnthropicKey && !hasOpenAiKey) {
    return 'anthropic';
  }

  if (hasOpenAiKey && !hasAnthropicKey) {
    return 'openai';
  }

  return DEFAULT_PROVIDER;
}

export function getPrimaryAiModel(env: AiEnv = process.env): string {
  const provider = resolveAiProvider(env);
  return getConfiguredValue(env.BOT_AI_MODEL, DEFAULT_MODELS[provider]);
}

export function getTaglineAiModel(env: AiEnv = process.env): string {
  const provider = resolveAiProvider(env);
  return getConfiguredValue(
    env.BOT_AI_TAGLINE_MODEL,
    DEFAULT_TAGLINE_MODELS[provider],
  );
}

export function getNarratorAiModel(env: AiEnv = process.env): string {
  return getConfiguredValue(env.NARRATOR_AI_MODEL, getPrimaryAiModel(env));
}

export function getAiTemperatureOptions(
  provider: AiProvider,
  temperature: number,
): { temperature?: number } {
  if (provider === 'openai') {
    return {};
  }

  return { temperature };
}

export interface ResolvedAiConfig {
  apiKey: string;
  model: string;
  provider: AiProvider;
}

export function resolveAiConfig(
  env: AiEnv = process.env,
  options?: { model?: string },
): ResolvedAiConfig {
  const provider = resolveAiProvider(env);

  return {
    apiKey: getRequiredApiKey(provider, env),
    model: options?.model ?? getPrimaryAiModel(env),
    provider,
  };
}

export function createTextAdapter(
  env: AiEnv = process.env,
  options?: { model?: string },
) {
  const { apiKey, provider, model } = resolveAiConfig(env, options);

  if (provider === 'anthropic') {
    return createAnthropicChat(model as any, apiKey);
  }

  return createOpenaiChat(model as any, apiKey);
}
