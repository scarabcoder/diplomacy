import { chat } from '@tanstack/ai';
import type { DislodgedUnit } from '@/domain/game/engine/types.ts';
import type { GamePhaseResultPayload } from '@/domain/game/phase-results.ts';
import {
  createTextAdapter,
  getAiTemperatureOptions,
  getNarratorAiModel,
  resolveAiConfig,
  type AiProvider,
} from '@/lib/ai-text.ts';
import { createLogger } from '@/lib/logger.ts';

const logger = createLogger('historical-narrator');
const MAX_LOGGED_BODY_LENGTH = 1500;

type NarrationContextItem = {
  phase: GamePhaseResultPayload['phase'];
  headline: string;
  alerts: Array<{
    title: string;
    tone: 'warning' | 'danger' | 'info';
    items: string[];
  }>;
  groups: Array<{
    title: string;
    items: string[];
  }>;
};

export function shouldGenerateHistoricalNarration(input: {
  phase: GamePhaseResultPayload['phase'];
  season: GamePhaseResultPayload['season'];
  dislodgedUnits: DislodgedUnit[];
}): boolean {
  if (input.phase === 'build_submission') {
    return false;
  }

  if (input.phase === 'order_submission' && input.dislodgedUnits.length > 0) {
    return false;
  }

  return input.season === 'spring' || input.season === 'fall';
}

export function buildHistoricalNarrationContext(
  payloads: GamePhaseResultPayload[],
): NarrationContextItem[] {
  return payloads.map((payload) => ({
    phase: payload.phase,
    headline: payload.headline,
    alerts: (payload.alerts ?? []).map((alert) => ({
      title: alert.title,
      tone: alert.tone,
      items: alert.items.map((item) =>
        item.detail ? `${item.summary} (${item.detail})` : item.summary,
      ),
    })),
    groups: payload.groups.map((group) => ({
      title: group.title,
      items: group.items.map((item) =>
        item.detail ? `${item.summary} (${item.detail})` : item.summary,
      ),
    })),
  }));
}

export async function attachHistoricalNarration(params: {
  existingPayloads: GamePhaseResultPayload[];
  payload: GamePhaseResultPayload;
  dislodgedUnits: DislodgedUnit[];
  generateNarration?: (
    payloads: GamePhaseResultPayload[],
  ) => Promise<string | null>;
}): Promise<GamePhaseResultPayload> {
  if (
    !shouldGenerateHistoricalNarration({
      phase: params.payload.phase,
      season: params.payload.season,
      dislodgedUnits: params.dislodgedUnits,
    })
  ) {
    return params.payload;
  }

  const narration = await (
    params.generateNarration ?? generateHistoricalNarration
  )([...params.existingPayloads, params.payload]);

  return {
    ...params.payload,
    historicalNarration: narration,
  };
}

export async function generateHistoricalNarration(
  payloads: GamePhaseResultPayload[],
): Promise<string | null> {
  if (payloads.length === 0) {
    return null;
  }

  let provider: AiProvider;
  let model: string;

  try {
    model = getNarratorAiModel(process.env);
    provider = resolveAiConfig(process.env, { model }).provider;
  } catch {
    return null;
  }

  const latest = payloads[payloads.length - 1]!;
  const startedAt = Date.now();

  try {
    const responseText = await chat({
      adapter: createTextAdapter(process.env, { model }),
      stream: false,
      maxTokens: 350,
      ...getAiTemperatureOptions(provider, 0.6),
      messages: [
        {
          role: 'user',
          content: [
            'Write a concise historical narration for a Diplomacy map recap.',
            'Return 2-3 short paragraphs in plain text only.',
            'Group events by broader theaters or conflicts, not by a full unit-by-unit transcript.',
            'Use a readable historical voice and explain what changed around the board.',
            'Do not mention that you are an AI or narrator. Do not use markdown labels or bullet points.',
            '',
            `Turn: ${latest.headline}`,
            '',
            'Resolved events:',
            JSON.stringify(buildHistoricalNarrationContext(payloads), null, 2),
          ].join('\n'),
        },
      ],
    });

    const narration = normalizeHistoricalNarration(responseText);
    if (narration) {
      return narration;
    }

    logger.warn(
      {
        provider,
        model,
        durationMs: Date.now() - startedAt,
        responseBody: truncateForLog(responseText),
      },
      'Historical narration response did not contain usable text',
    );
    return null;
  } catch (error) {
    logger.warn(
      {
        provider,
        model,
        durationMs: Date.now() - startedAt,
        err: error,
      },
      'Failed to generate historical narration',
    );
    return null;
  }
}

function normalizeHistoricalNarration(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\r\n/g, '\n');

  if (normalized.length === 0) {
    return null;
  }

  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) {
    return null;
  }

  return paragraphs.join('\n\n');
}

function truncateForLog(value: string): string {
  if (value.length <= MAX_LOGGED_BODY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOGGED_BODY_LENGTH)}… (${value.length} chars)`;
}
