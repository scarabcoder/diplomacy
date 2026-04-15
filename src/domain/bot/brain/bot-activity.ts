import type { PowerEnum } from '@/database/schema/game-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import type { BotBrainTrigger } from './types.ts';

const logger = createLogger('bot-activity');

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

export function getBotActivities(
  playerIds: string[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of playerIds) {
    const tagline = activityTaglines.get(id);
    if (tagline) result.set(id, tagline);
  }
  return result;
}

/**
 * Call Claude Haiku to generate a short, vague activity tagline.
 * Must NOT reveal the bot's power, plans, targets, or direction.
 * Returns a 2-5 word phrase like "Deep in thought..." or "Weighing options..."
 */
export async function generateActivityTagline(
  _power: PowerEnum,
  trigger: BotBrainTrigger,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackTagline(trigger);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 24,
        temperature: 1,
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
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Haiku tagline request failed');
      return fallbackTagline(trigger);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content?.[0]?.text?.trim();

    if (text && text.length > 0 && text.length < 60) {
      return text;
    }

    return fallbackTagline(trigger);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate tagline via Haiku');
    return fallbackTagline(trigger);
  }
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
