import {
  createTextAdapter,
  getPrimaryAiModel,
  getTaglineAiModel,
  resolveAiConfig,
  resolveAiProvider,
  type AiProvider,
} from '@/lib/ai-text.ts';

type BotAiEnv = Record<string, string | undefined>;

export type BotAiProvider = AiProvider;

export function resolveBotAiProvider(
  env: BotAiEnv = process.env,
): BotAiProvider {
  return resolveAiProvider(env);
}

export function getBotAiModel(env: BotAiEnv = process.env): string {
  return getPrimaryAiModel(env);
}

export function getBotAiTaglineModel(env: BotAiEnv = process.env): string {
  return getTaglineAiModel(env);
}

export interface ResolvedBotAiConfig {
  apiKey: string;
  model: string;
  provider: BotAiProvider;
  taglineModel: string;
}

export function getBotAiTaglineModelOptions(
  env: BotAiEnv = process.env,
): Record<string, unknown> | undefined {
  const provider = resolveBotAiProvider(env);

  if (provider === 'openai') {
    return {
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    };
  }

  return undefined;
}

export function getBotAiModelOptions(
  env: BotAiEnv = process.env,
): Record<string, unknown> | undefined {
  const provider = resolveBotAiProvider(env);

  if (provider === 'openai') {
    return {
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    };
  }

  return undefined;
}

export function resolveBotAiConfig(
  env: BotAiEnv = process.env,
): ResolvedBotAiConfig {
  const provider = resolveBotAiProvider(env);
  const primary = resolveAiConfig(env);

  return {
    apiKey: primary.apiKey,
    model: primary.model,
    provider,
    taglineModel: getBotAiTaglineModel(env),
  };
}

export function createBotTextAdapter(
  env: BotAiEnv = process.env,
  options?: { model?: string },
) {
  return createTextAdapter(env, {
    model: options?.model ?? getBotAiModel(env),
  });
}
