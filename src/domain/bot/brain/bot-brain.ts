import { chat, maxIterations } from '@tanstack/ai';
import { createAnthropicChat } from '@tanstack/ai-anthropic';
import { and, eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { gamePlayerTable } from '@/database/schema/game-schema.ts';
import type { PowerEnum } from '@/database/schema/game-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import {
  generateActivityTagline,
  setBotActivity,
  clearBotActivity,
} from './bot-activity.ts';
import { loadBotSession } from './bot-context.ts';
import { getOrCreateBrainState } from './bot-memory.ts';
import { parseObservations, parseRelationships } from './bot-memory.ts';
import { buildBotSystemPrompt, buildTriggerMessage, type PlayerInfo } from './bot-prompts.ts';
import { createBotTools } from './bot-tools.ts';
import type { BotBrainParams } from './types.ts';

const logger = createLogger('bot-brain');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_STEPS_INITIAL = 30; // more steps for game_start (lots of diplomacy)
const MAX_STEPS_DEFAULT = 20;
const MAX_STEPS_FINALIZE = 10; // fewer steps for urgent finalization

function getModel() {
  return process.env.BOT_AI_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for AI bots');
  }
  return key;
}

function getMaxSteps(trigger: BotBrainParams['trigger']): number {
  switch (trigger.type) {
    case 'game_start':
      return MAX_STEPS_INITIAL;
    case 'finalize_phase':
      return MAX_STEPS_FINALIZE;
    default:
      return MAX_STEPS_DEFAULT;
  }
}

/** Create a tagged logger child for a specific bot */
function botLogger(power: PowerEnum, botId: string) {
  return logger.child({ bot: power.toUpperCase(), botId });
}

/**
 * Load all players in a room for the system prompt roster.
 */
async function loadPlayerRoster(roomId: string): Promise<PlayerInfo[]> {
  const players = await database
    .select({
      playerId: gamePlayerTable.id,
      power: gamePlayerTable.power,
      isBot: gamePlayerTable.isBot,
      status: gamePlayerTable.status,
    })
    .from(gamePlayerTable)
    .where(
      and(
        eq(gamePlayerTable.roomId, roomId),
        eq(gamePlayerTable.isSpectator, false),
      ),
    );

  return players
    .filter((p) => p.power != null)
    .map((p) => ({
      playerId: p.playerId,
      power: p.power as PowerEnum,
      isBot: p.isBot,
      status: p.status,
    }));
}

/**
 * Main entry point for the bot brain. Called by triggers to make the bot
 * think and act. The AI agent loop reads game state, sends messages,
 * updates memory, and submits orders — all via tool calls.
 */
export async function activateBotBrain(params: BotBrainParams): Promise<void> {
  const { playerId, roomId, botId, power, trigger } = params;
  const log = botLogger(power, botId);
  const startTime = Date.now();

  log.info({ playerId, roomId, trigger }, 'Activating bot brain');

  // Load bot session for oRPC calls
  log.debug({ playerId }, 'Loading bot session...');
  const botSession = await loadBotSession(playerId);
  if (!botSession) {
    log.error({ playerId }, 'Could not load bot session — skipping activation');
    return;
  }
  log.debug({ credentialId: botSession.credentialId }, 'Bot session loaded');

  // Load or create brain state (memory)
  log.debug('Loading brain state from database...');
  const brainState = await getOrCreateBrainState({ playerId, roomId, botId, power });
  const observations = parseObservations(brainState.observations);
  const relationships = parseRelationships(brainState.relationships);
  log.debug(
    {
      hasPlan: brainState.strategicPlan.length > 0,
      planLength: brainState.strategicPlan.length,
      observationCount: observations.length,
      relationshipCount: Object.keys(relationships).length,
    },
    'Brain state loaded',
  );

  // Load player roster for prompt context
  log.debug({ roomId }, 'Loading player roster...');
  const players = await loadPlayerRoster(roomId);
  log.debug(
    {
      playerCount: players.length,
      powers: players.map((p) => p.power),
      bots: players.filter((p) => p.isBot).map((p) => p.power),
    },
    'Player roster loaded',
  );

  // Build system prompt with game context and memory
  log.debug('Building system prompt...');
  const systemPrompt = buildBotSystemPrompt({ power, brainState, players });
  log.debug({ systemPromptLength: systemPrompt.length }, 'System prompt built');

  // Build trigger-specific user message
  const triggerMessage = buildTriggerMessage(trigger);
  log.debug({ triggerMessageLength: triggerMessage.length }, 'Trigger message built');

  // Create tools
  const tools = createBotTools({
    botSession,
    roomId,
    playerId,
    power,
  });
  log.debug({ toolCount: tools.length, toolNames: tools.map((t) => t.name) }, 'Tools created');

  // Create the adapter with the configured model
  const model = getModel();
  const apiKey = getApiKey();
  const adapter = createAnthropicChat(model as any, apiKey);
  const maxSteps = getMaxSteps(trigger);

  // Generate and publish activity tagline so players can see what the bot is doing
  const tagline = await generateActivityTagline(power, trigger);
  setBotActivity(playerId, tagline);
  log.debug({ tagline }, 'Activity tagline set');
  const { publishRoomEvent } = await import('@/domain/room/realtime.ts');
  publishRoomEvent(roomId, 'bot_activity');

  log.info(
    { model, maxSteps, temperature: 0.7, maxTokens: 50_000 },
    'Starting AI chat agent loop',
  );

  try {
    // Use streaming mode and consume the stream to drive the agent loop.
    // Tools auto-execute via their .server() implementations.
    const stream = chat({
      adapter,
      systemPrompts: [systemPrompt],
      messages: [{ role: 'user', content: triggerMessage }],
      tools,
      agentLoopStrategy: maxIterations(maxSteps),
      maxTokens: 50_000,
      temperature: 0.7,
    });

    // Consume the stream to drive tool execution and log chunk types
    let chunkCount = 0;
    let textChunks = 0;
    let toolCallStarts = 0;
    let toolCallEnds = 0;

    for await (const chunk of stream) {
      chunkCount++;
      const chunkType = (chunk as any).type ?? 'unknown';

      if (chunkType === 'text-delta' || chunkType === 'TEXT_CONTENT') {
        textChunks++;
      } else if (chunkType === 'tool-call-begin' || chunkType === 'TOOL_CALL_START') {
        toolCallStarts++;
        log.debug(
          { toolName: (chunk as any).toolName ?? (chunk as any).name, step: toolCallStarts },
          'AI calling tool',
        );
      } else if (chunkType === 'tool-result' || chunkType === 'TOOL_CALL_END') {
        toolCallEnds++;
      } else if (chunkCount <= 5 || chunkCount % 50 === 0) {
        // Log the first few chunks and every 50th to trace progress without flooding
        log.debug({ chunkType, chunkCount }, 'Stream chunk');
      }
    }

    const durationMs = Date.now() - startTime;
    log.info(
      {
        durationMs,
        chunkCount,
        textChunks,
        toolCallStarts,
        toolCallEnds,
        trigger: trigger.type,
      },
      'Bot brain activation complete',
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error(
      { durationMs, trigger: trigger.type, err: error },
      'Bot brain activation failed',
    );
    throw error;
  } finally {
    clearBotActivity(playerId);
    publishRoomEvent(roomId, 'bot_activity');
  }
}
