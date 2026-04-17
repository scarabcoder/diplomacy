import { chat } from '@tanstack/ai';
import type { PowerEnum } from '@/database/schema/game-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import {
  getAiTemperatureOptions,
  type AiProvider,
} from '@/lib/ai-text.ts';
import {
  createBotTextAdapter,
  getBotAiTaglineModelOptions,
  resolveBotAiConfig,
} from './bot-ai.ts';
import type { BotBrainTrigger } from './types.ts';

const logger = createLogger('bot-activity');
const MAX_LOGGED_BODY_LENGTH = 1000;

/**
 * In-memory map of bot activity taglines, keyed by playerId.
 * These are ephemeral — cleared on activation end and server restart.
 */
const activityTaglines = new Map<string, string>();

export function setBotActivity(playerId: string, tagline: string): void {
  activityTaglines.set(playerId, tagline);
}

export function clearBotActivity(playerId: string): void {
  activityTaglines.delete(playerId);
}

export function getBotActivity(playerId: string): string | null {
  return activityTaglines.get(playerId) ?? null;
}

export function getBotActivities(playerIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of playerIds) {
    const tagline = activityTaglines.get(id);
    if (tagline) result.set(id, tagline);
  }
  return result;
}

/**
 * Generate a short, vague activity tagline through the configured TanStack AI provider.
 * Must NOT reveal the bot's power, plans, targets, or direction.
 * Returns a 2-5 word phrase like "Deep in thought..." or "Weighing options..."
 */
export async function generateActivityTagline(
  _power: PowerEnum,
  trigger: BotBrainTrigger,
): Promise<string> {
  let provider: AiProvider;
  let model: string;

  try {
    const resolved = resolveBotAiConfig();
    provider = resolved.provider;
    model = resolved.taglineModel;
  } catch {
    return fallbackTagline(trigger);
  }

  const startedAt = Date.now();

  try {
    const responseText = await chat({
      adapter: createBotTextAdapter(process.env, { model }),
      stream: false,
      maxTokens: 32,
      ...getAiTemperatureOptions(provider, 1),
      modelOptions: getBotAiTaglineModelOptions(process.env),
      messages: [
        {
          role: 'user',
          content: `Generate a 2-5 word activity status for an AI player in a strategy board game. End with "..."

CRITICAL: Do NOT mention any specific regions, countries, powers, directions, targets, or strategies. The status must be completely vague and reveal nothing about what the player is doing or planning. No proper nouns.

Good: "Deep in thought...", "Weighing options...", "Calculating...", "Pondering the situation...", "Making arrangements...", "Reviewing the board...", "Lost in strategy...", "Deliberating carefully..."
Bad: "Eyeing the Balkans...", "Plotting against France...", "Moving north...", "Building fleets..."

Reply with ONLY the tagline, nothing else.`,
        },
      ],
    });
    const durationMs = Date.now() - startedAt;
    const text = normalizeTagline(responseText);

    if (text) {
      return text;
    }

    logger.warn(
      {
        trigger: trigger.type,
        provider,
        model,
        durationMs,
        responseBody: truncateForLog(responseText),
      },
      'AI tagline response did not contain a usable tagline',
    );

    return fallbackTagline(trigger);
  } catch (error) {
    logger.warn(
      {
        trigger: trigger.type,
        provider,
        model,
        durationMs: Date.now() - startedAt,
        err: error,
      },
      'Failed to generate tagline via AI provider',
    );
    return fallbackTagline(trigger);
  }
}

function normalizeTagline(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ');

  if (normalized.length === 0 || normalized.length >= 60) {
    return null;
  }

  if (normalized.endsWith('...')) {
    return normalized;
  }

  return `${normalized.replace(/[.!?]+$/g, '')}...`;
}

function truncateForLog(value: string): string {
  if (value.length <= MAX_LOGGED_BODY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOGGED_BODY_LENGTH)}… (${value.length} chars)`;
}

function fallbackTagline(_trigger: BotBrainTrigger): string {
  const options = [
    'Deep in thought...',
    'Weighing options...',
    'Calculating...',
    'Pondering the situation...',
    'Deliberating...',
    'Reviewing the board...',
  ];
  return options[Math.floor(Math.random() * options.length)]!;
}
