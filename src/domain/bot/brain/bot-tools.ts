import { toolDefinition } from '@tanstack/ai';
import { call } from '@orpc/server';
import * as z from 'zod/v4';
import type { BotSeatSession } from '@/domain/bot/auth.ts';
import type { ORPCContext } from '@/rpc/base.ts';
import type { PowerEnum } from '@/database/schema/game-schema.ts';
import {
  orderTypeSchema,
  unitTypeSchema,
  buildActionSchema,
} from '@/database/schema/game-schema.ts';
import { getGameState } from '@/domain/game/procedures.ts';
import { getGameHistory } from '@/domain/game/procedures.ts';
import { getSubmissionStatus } from '@/domain/game/procedures.ts';
import { listThreads } from '@/domain/message/procedures.ts';
import { getThread } from '@/domain/message/procedures.ts';
import { openOrCreateThread } from '@/domain/message/procedures.ts';
import { sendMessage } from '@/domain/message/procedures.ts';
import { submitOrders } from '@/domain/order/procedures.ts';
import { submitRetreats } from '@/domain/order/procedures.ts';
import { submitBuilds } from '@/domain/order/procedures.ts';
import {
  updateStrategicPlan,
  setObservations,
  updateRelationship,
} from './bot-memory.ts';
import { createBotOrpcContext } from './bot-context.ts';
import { createLogger } from '@/lib/logger.ts';

const baseLogger = createLogger('bot-tools');

type ToolContext = {
  botSession: BotSeatSession;
  roomId: string;
  playerId: string;
  power: PowerEnum;
};

function orpcContext(ctx: ToolContext): ORPCContext {
  return createBotOrpcContext(ctx.botSession);
}

/** Truncate a value for safe logging (avoids dumping huge game state) */
function summarize(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json && json.length > 400) {
    return `${json.slice(0, 400)}… (${json.length} chars)`;
  }
  return value;
}

/**
 * Create the full set of TanStack AI tools for a bot brain activation.
 * Each tool wraps either an oRPC procedure (via direct `call()`) or
 * a memory operation. Every tool call is debug-logged with power + botId tags.
 */
export function createBotTools(ctx: ToolContext) {
  const context = orpcContext(ctx);
  const log = baseLogger.child({ bot: ctx.power.toUpperCase(), botId: ctx.botSession.botId });

  // Wrapper that logs tool invocations
  async function traced<T>(
    toolName: string,
    args: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    log.debug({ tool: toolName, args: summarize(args) }, 'Tool called');
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      log.debug({ tool: toolName, durationMs, result: summarize(result) }, 'Tool completed');
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      log.error({ tool: toolName, durationMs, err: error }, 'Tool failed');
      throw error;
    }
  }

  // ── Game-reading tools ─────────────────────────────────────────

  const getGameStateTool = toolDefinition({
    name: 'get_game_state',
    description:
      'Get the current game state including unit positions, supply center ownership, current phase, and your submission status.',
    inputSchema: z.object({}),
  }).server(async () => {
    return traced('get_game_state', {}, async () => {
      const result = await call(getGameState, { roomId: ctx.roomId }, { context, path: ['game', 'getGameState'] });
      return result;
    });
  });

  const getGameHistoryTool = toolDefinition({
    name: 'get_game_history',
    description:
      'Get past turns with all submitted orders and their results. Use to analyze what other powers did.',
    inputSchema: z.object({
      turnNumber: z.number().int().min(1).optional().describe('Specific turn number to fetch, or omit for all turns.'),
    }),
  }).server(async (args) => {
    return traced('get_game_history', args, async () => {
      const result = await call(getGameHistory, { roomId: ctx.roomId, turnNumber: args.turnNumber }, { context, path: ['game', 'getGameHistory'] });
      return result;
    });
  });

  const getSubmissionStatusTool = toolDefinition({
    name: 'get_submission_status',
    description:
      'Check which powers have submitted orders for the current phase and which are still pending.',
    inputSchema: z.object({}),
  }).server(async () => {
    return traced('get_submission_status', {}, async () => {
      const result = await call(getSubmissionStatus, { roomId: ctx.roomId }, { context, path: ['game', 'getSubmissionStatus'] });
      return result;
    });
  });

  // ── Messaging tools ────────────────────────────────────────────

  const listConversationsTool = toolDefinition({
    name: 'list_conversations',
    description:
      'List all your diplomatic conversation threads. Shows who you are talking to and unread message counts.',
    inputSchema: z.object({}),
  }).server(async () => {
    return traced('list_conversations', {}, async () => {
      const result = await call(listThreads, { roomId: ctx.roomId }, { context, path: ['message', 'listThreads'] });
      log.debug({ threadCount: (result as any)?.items?.length ?? 0 }, 'Listed conversations');
      return result;
    });
  });

  const readConversationTool = toolDefinition({
    name: 'read_conversation',
    description:
      'Read messages in a conversation thread. Use to review what was said before responding.',
    inputSchema: z.object({
      threadId: z.string().uuid().describe('The conversation thread ID to read.'),
    }),
  }).server(async (args) => {
    return traced('read_conversation', args, async () => {
      const result = await call(getThread, { roomId: ctx.roomId, threadId: args.threadId, limit: 50 }, { context, path: ['message', 'getThread'] });
      log.debug({ threadId: args.threadId, messageCount: (result as any)?.messages?.length ?? 0 }, 'Read conversation');
      return result;
    });
  });

  const startConversationTool = toolDefinition({
    name: 'start_conversation',
    description:
      'Open a new private conversation with one or more other players. Provide their player IDs (not power names).',
    inputSchema: z.object({
      participantPlayerIds: z.array(z.string().uuid()).min(1).max(6).describe('Player IDs to include in the conversation.'),
    }),
  }).server(async (args) => {
    return traced('start_conversation', args, async () => {
      log.info({ participantPlayerIds: args.participantPlayerIds }, 'Starting conversation');
      const result = await call(openOrCreateThread, { roomId: ctx.roomId, participantPlayerIds: args.participantPlayerIds }, { context, path: ['message', 'openOrCreateThread'] });
      log.info({ threadId: (result as any)?.thread?.id }, 'Conversation opened');
      return result;
    });
  });

  const sendMessageTool = toolDefinition({
    name: 'send_message',
    description:
      'Send a diplomatic message in a conversation. You may lie, manipulate, propose alliances, make threats, or be friendly — whatever serves your strategy.',
    inputSchema: z.object({
      threadId: z.string().uuid().describe('The conversation thread ID.'),
      body: z.string().min(1).max(500).describe('The message text. Keep it SHORT — 1-3 sentences max.'),
    }),
  }).server(async (args) => {
    return traced('send_message', { threadId: args.threadId, bodyLength: args.body.length }, async () => {
      log.info({ threadId: args.threadId, bodyPreview: args.body.slice(0, 120) }, 'Sending message');
      const result = await call(sendMessage, { roomId: ctx.roomId, threadId: args.threadId, body: args.body }, { context, path: ['message', 'sendMessage'] });
      log.info({ threadId: args.threadId, messageId: (result as any)?.message?.id }, 'Message sent');
      return result;
    });
  });

  // ── Order submission tools ─────────────────────────────────────

  const submitOrdersTool = toolDefinition({
    name: 'submit_orders',
    description:
      'Submit your main-phase orders (hold, move, support, convoy) for all your units. You must submit orders for every unit you control.',
    inputSchema: z.object({
      orders: z.array(z.object({
        unitProvince: z.string().min(2).max(4).describe('Province where your unit is located.'),
        orderType: orderTypeSchema.describe('Order type: hold, move, support, or convoy.'),
        targetProvince: z.string().min(2).max(10).optional().describe('Target province for move/support/convoy.'),
        supportedUnitProvince: z.string().min(2).max(4).optional().describe('Province of the unit being supported (for support orders).'),
        viaConvoy: z.boolean().optional().describe('Whether this move should use a convoy route.'),
        coast: z.string().max(2).optional().describe('Coast suffix for coastal destinations (e.g. "nc", "sc").'),
      })).min(1).max(34).describe('Your orders for this phase.'),
    }),
  }).server(async (args) => {
    return traced('submit_orders', { orderCount: args.orders.length }, async () => {
      const orderSummary = args.orders.map((o) =>
        `${o.unitProvince} ${o.orderType}${o.targetProvince ? ` → ${o.targetProvince}` : ''}${o.supportedUnitProvince ? ` (support ${o.supportedUnitProvince})` : ''}`,
      );
      log.info({ orders: orderSummary }, 'Submitting orders');
      const result = await call(submitOrders, { roomId: ctx.roomId, orders: args.orders }, { context, path: ['order', 'submitOrders'] });
      log.info({ submitted: (result as any)?.submitted, allSubmitted: (result as any)?.allSubmitted }, 'Orders submitted');
      return result;
    });
  });

  const submitRetreatsTool = toolDefinition({
    name: 'submit_retreats',
    description:
      'Submit retreat orders for your dislodged units. Each unit can retreat to a valid province or be disbanded (retreatTo: null).',
    inputSchema: z.object({
      retreats: z.array(z.object({
        unitProvince: z.string().min(2).max(4).describe('Province of your dislodged unit.'),
        retreatTo: z.string().min(2).max(10).nullable().describe('Province to retreat to, or null to disband.'),
      })).min(1).max(34).describe('Your retreat decisions.'),
    }),
  }).server(async (args) => {
    return traced('submit_retreats', args, async () => {
      const retreatSummary = args.retreats.map((r) =>
        `${r.unitProvince} → ${r.retreatTo ?? 'DISBAND'}`,
      );
      log.info({ retreats: retreatSummary }, 'Submitting retreats');
      const result = await call(submitRetreats, { roomId: ctx.roomId, retreats: args.retreats }, { context, path: ['order', 'submitRetreats'] });
      log.info({ submitted: (result as any)?.submitted, allSubmitted: (result as any)?.allSubmitted }, 'Retreats submitted');
      return result;
    });
  });

  const submitBuildsTool = toolDefinition({
    name: 'submit_builds',
    description:
      'Submit build or disband orders during the build phase. Build new units on unoccupied home supply centers, or disband existing units.',
    inputSchema: z.object({
      builds: z.array(z.object({
        action: buildActionSchema.describe('build (new unit), disband (remove unit), or waive (skip a build).'),
        unitType: unitTypeSchema.optional().describe('army or fleet (for build actions only).'),
        province: z.string().min(2).max(4).describe('Province for the build/disband.'),
        coast: z.string().max(2).optional().describe('Coast suffix for coastal fleet builds.'),
      })).min(1).max(34).describe('Your build/disband decisions.'),
    }),
  }).server(async (args) => {
    return traced('submit_builds', args, async () => {
      const buildSummary = args.builds.map((b) =>
        `${b.action} ${b.unitType ?? ''} ${b.province}${b.coast ? `/${b.coast}` : ''}`.trim(),
      );
      log.info({ builds: buildSummary }, 'Submitting builds');
      const result = await call(submitBuilds, { roomId: ctx.roomId, builds: args.builds }, { context, path: ['order', 'submitBuilds'] });
      log.info({ submitted: (result as any)?.submitted, allSubmitted: (result as any)?.allSubmitted }, 'Builds submitted');
      return result;
    });
  });

  // ── Memory tools (write to bot_brain_state directly) ───────────

  const updatePlanTool = toolDefinition({
    name: 'update_strategic_plan',
    description:
      'Replace your entire strategic plan. Use bullet points, not prose. Include: current goals, active alliances, who to target, deception angles. Fold in relevant old observations when consolidating memory. Keep it under ~1500 characters.',
    inputSchema: z.object({
      plan: z.string().min(1).max(3000).describe('Your complete updated strategic plan. Bullet points preferred.'),
    }),
  }).server(async (args) => {
    return traced('update_strategic_plan', { planLength: args.plan.length }, async () => {
      log.info({ planPreview: args.plan.slice(0, 200), planLength: args.plan.length }, 'Updating strategic plan');
      await updateStrategicPlan(ctx.playerId, args.plan);
      return { updated: true };
    });
  });

  const setObservationsTool = toolDefinition({
    name: 'set_observations',
    description:
      'Replace your entire observations list. Max 10 observations. Use this to add new observations AND prune stale ones in a single call. When observations are full, consolidate — fold old info into your strategic plan, then drop those observations. Each note should be one concise sentence.',
    inputSchema: z.object({
      observations: z.array(z.object({
        turn: z.number().int().min(0).describe('Turn number this observation relates to.'),
        phase: z.string().describe('Game phase (e.g. "spring order_submission").'),
        note: z.string().min(1).max(200).describe('One concise sentence.'),
      })).max(10).describe('Your complete observations list (replaces all existing observations).'),
    }),
  }).server(async (args) => {
    return traced('set_observations', { count: args.observations.length }, async () => {
      log.info({ observationCount: args.observations.length }, 'Setting observations');
      await setObservations(ctx.playerId, args.observations);
      return { updated: true, count: args.observations.length };
    });
  });

  const updateRelationshipTool = toolDefinition({
    name: 'update_relationship',
    description:
      'Update your assessment of another power. Track trust level, stance, and notes about their behavior and promises.',
    inputSchema: z.object({
      targetPower: z.enum(['england', 'france', 'germany', 'russia', 'austria', 'italy', 'turkey']).describe('The power to update your assessment of.'),
      trust: z.number().min(-1).max(1).describe('Trust level from -1 (total enemy) to 1 (fully trusted ally).'),
      stance: z.enum(['allied', 'friendly', 'neutral', 'suspicious', 'hostile']).describe('Your current diplomatic stance toward this power.'),
      notes: z.array(z.string()).describe('Key notes about this power (replaces previous notes).'),
    }),
  }).server(async (args) => {
    return traced('update_relationship', { targetPower: args.targetPower, trust: args.trust, stance: args.stance }, async () => {
      log.info(
        { targetPower: args.targetPower.toUpperCase(), trust: args.trust, stance: args.stance, noteCount: args.notes.length },
        'Updating relationship assessment',
      );
      await updateRelationship(ctx.playerId, args.targetPower as PowerEnum, {
        trust: args.trust,
        stance: args.stance,
        notes: args.notes,
      });
      return { updated: true };
    });
  });

  return [
    getGameStateTool,
    getGameHistoryTool,
    getSubmissionStatusTool,
    listConversationsTool,
    readConversationTool,
    startConversationTool,
    sendMessageTool,
    submitOrdersTool,
    submitRetreatsTool,
    submitBuildsTool,
    updatePlanTool,
    setObservationsTool,
    updateRelationshipTool,
  ];
}
