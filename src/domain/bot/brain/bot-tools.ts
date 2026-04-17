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
import type { Order, UnitPositions } from '@/domain/game/engine/types.ts';
import {
  canSupportHold,
  getConvoyMoveTargets,
  getMoveTargets,
  getSupportableUnitProvinces,
  getSupportMoveTargets,
} from '@/domain/game/engine/order-drafting.ts';
import {
  HOME_SUPPLY_CENTERS,
  countSupplyCenters,
} from '@/domain/game/engine/map-data.ts';
import { validateMainOrders } from '@/domain/game/adjudicator/rust-engine.ts';
import { listThreads } from '@/domain/message/procedures.ts';
import { getThread } from '@/domain/message/procedures.ts';
import { openOrCreateThread } from '@/domain/message/procedures.ts';
import { sendMessage } from '@/domain/message/procedures.ts';
import { sendOrderProposal } from '@/domain/message/procedures.ts';
import { resolveGlobalThreadId } from '@/domain/message/procedures.ts';
import type { OrderProposalPayload } from '@/domain/message/schema.ts';
import {
  describeBuildOrder,
  describeMainOrder,
  describeRetreatOrder,
  type BuildOrderDraft,
  type MainOrderDraft,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  DislodgedUnit,
  SupplyCenterOwnership,
} from '@/domain/game/engine/types.ts';
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
import type { BotBrainTrigger } from './types.ts';

const baseLogger = createLogger('bot-tools');

type ToolContext = {
  botSession: BotSeatSession;
  roomId: string;
  playerId: string;
  power: PowerEnum;
  trigger: BotBrainTrigger;
};

function orpcContext(ctx: ToolContext): ORPCContext {
  return createBotOrpcContext(ctx.botSession);
}

/**
 * Render a proposal's orders as plain text so a bot reading a conversation can
 * reason about them without seeing the raw JSON payload. Appended to the
 * message body just for the bot's view.
 */
function appendProposalSummary(
  body: string,
  proposal: OrderProposalPayload,
): string {
  const positions = proposal.boardBefore.positions as UnitPositions;
  const seasonLabel = proposal.season === 'spring' ? 'Spring' : 'Fall';
  const phaseLabel =
    proposal.phase === 'order_submission'
      ? 'Orders'
      : proposal.phase === 'retreat_submission'
        ? 'Retreats'
        : 'Builds';

  let lines: string[] = [];
  if (proposal.phase === 'order_submission') {
    lines = proposal.orders
      .filter((o) => 'orderType' in o)
      .map((o) => {
        const order = o as MainOrderDraft;
        return describeMainOrder(order.unitProvince, order, positions);
      });
  } else if (proposal.phase === 'retreat_submission') {
    lines = proposal.orders
      .filter((o) => 'retreatTo' in o)
      .map((o) => describeRetreatOrder(o as RetreatOrderDraft, positions));
  } else if (proposal.phase === 'build_submission') {
    lines = proposal.orders
      .filter((o) => 'action' in o)
      .map((o) => describeBuildOrder(o as BuildOrderDraft));
  }

  const header = `[PROPOSED ${phaseLabel.toUpperCase()} — ${seasonLabel} ${proposal.year}]`;
  return `${body}\n\n${header}\n- ${lines.join('\n- ')}`;
}

/** Truncate a value for safe logging (avoids dumping huge game state) */
function summarize(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json && json.length > 400) {
    return `${json.slice(0, 400)}… (${json.length} chars)`;
  }
  return value;
}

function getConversationReadLimit(trigger: BotBrainTrigger): number {
  switch (trigger.type) {
    case 'message_received':
      return 12;
    case 'phase_change':
      return trigger.phase === 'order_submission' ? 20 : 8;
    default:
      return 10;
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}

type LegalOrdersForUnit = {
  unitType: 'army' | 'fleet';
  coast: string | null;
  legalMoves: string[];
  legalConvoyMoves: string[];
  legalSupports: Array<{
    supportedUnit: string;
    canSupportHold: boolean;
    canSupportMoveTo: string[];
  }>;
};

type GameStateWithBotReference = {
  turn?: {
    supplyCenters?: SupplyCenterOwnership;
    unitPositions?: UnitPositions;
  };
  supplyCenterReference?: {
    validSupplyCenters: string[];
    homeSupplyCenters: Record<PowerEnum, string[]>;
    countsByPower: Record<PowerEnum, number>;
    note: string;
  };
  myLegalOrders?: Record<string, LegalOrdersForUnit>;
};

/**
 * Compute the full set of geographically legal orders for every unit the given
 * power controls. This is what the bot uses to avoid void moves/supports — it
 * answers "what CAN this unit do?" before the LLM commits to anything.
 */
function computeMyLegalOrders(
  positions: UnitPositions,
  power: PowerEnum,
): Record<string, LegalOrdersForUnit> {
  const out: Record<string, LegalOrdersForUnit> = {};
  for (const [province, unit] of Object.entries(positions)) {
    if (unit.power !== power) continue;
    const supportable = getSupportableUnitProvinces(province, positions);
    out[province] = {
      unitType: unit.unitType,
      coast: unit.coast ?? null,
      legalMoves: getMoveTargets(province, positions),
      legalConvoyMoves: getConvoyMoveTargets(province, positions),
      legalSupports: supportable.map((supportedUnit) => ({
        supportedUnit,
        canSupportHold: canSupportHold(province, supportedUnit, positions),
        canSupportMoveTo: getSupportMoveTargets(
          province,
          supportedUnit,
          positions,
        ),
      })),
    };
  }
  return out;
}

export function attachBotBoardReference(
  result: unknown,
): GameStateWithBotReference {
  const enriched = result as GameStateWithBotReference;
  const supplyCenters = enriched.turn?.supplyCenters;

  if (!supplyCenters) {
    return enriched;
  }

  enriched.supplyCenterReference = {
    validSupplyCenters: Object.keys(supplyCenters).sort(),
    homeSupplyCenters: HOME_SUPPLY_CENTERS,
    countsByPower: countSupplyCenters(supplyCenters) as Record<
      PowerEnum,
      number
    >,
    note: 'Only provinces listed in validSupplyCenters are supply centers. Do not infer supply center status from unit positions alone.',
  };

  return enriched;
}

/**
 * Create the full set of TanStack AI tools for a bot brain activation.
 * Each tool wraps either an oRPC procedure (via direct `call()`) or
 * a memory operation. Every tool call is debug-logged with power + botId tags.
 */
export function createBotTools(ctx: ToolContext) {
  const context = orpcContext(ctx);
  const log = baseLogger.child({
    bot: ctx.power.toUpperCase(),
    botId: ctx.botSession.botId,
  });
  const conversationReadLimit = getConversationReadLimit(ctx.trigger);

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
      log.debug(
        { tool: toolName, durationMs, result: summarize(result) },
        'Tool completed',
      );
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
      'Get the current game state including unit positions, supply center ownership, current phase, and your submission status. Includes a `supplyCenterReference` field naming every valid supply center on the map and a `myLegalOrders` field listing every geographically legal move and support for each of your units.',
    inputSchema: z.object({}),
  }).server(async () => {
    return traced('get_game_state', {}, async () => {
      const result = attachBotBoardReference(
        await call(
          getGameState,
          { roomId: ctx.roomId },
          { context, path: ['game', 'getGameState'] },
        ),
      );
      const positions = result.turn?.unitPositions;
      if (positions) {
        result.myLegalOrders = computeMyLegalOrders(positions, ctx.power);
      }
      return result;
    });
  });

  const getGameHistoryTool = toolDefinition({
    name: 'get_game_history',
    description:
      'Get past turns with all submitted orders and their results. Use to analyze what other powers did.',
    inputSchema: z.object({
      turnNumber: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Specific turn number to fetch, or omit for all turns.'),
    }),
  }).server(async (args) => {
    return traced('get_game_history', args, async () => {
      const result = await call(
        getGameHistory,
        { roomId: ctx.roomId, turnNumber: args.turnNumber },
        { context, path: ['game', 'getGameHistory'] },
      );
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
      const result = await call(
        listThreads,
        { roomId: ctx.roomId },
        { context, path: ['message', 'listThreads'] },
      );
      const items = ((result as any)?.items ?? []).map((thread: any) => ({
        id: thread.id,
        kind: thread.kind,
        status: thread.status,
        participantPlayerIds: thread.participantPlayerIds,
        unreadCount: thread.unreadCount,
        canSend: thread.canSend,
        lastMessage:
          thread.lastMessage == null
            ? null
            : {
                id: thread.lastMessage.id,
                senderPlayerId: thread.lastMessage.senderPlayerId,
                kind: thread.lastMessage.kind,
                bodyPreview: truncateText(thread.lastMessage.body ?? '', 160),
                createdAt: thread.lastMessage.createdAt,
              },
      }));
      log.debug({ threadCount: items.length }, 'Listed conversations');
      return { items };
    });
  });

  const readConversationTool = toolDefinition({
    name: 'read_conversation',
    description:
      'Read messages in a conversation thread. Use to review what was said before responding.',
    inputSchema: z.object({
      threadId: z
        .string()
        .uuid()
        .describe('The conversation thread ID to read.'),
    }),
  }).server(async (args) => {
    return traced('read_conversation', args, async () => {
      const result = await call(
        getThread,
        {
          roomId: ctx.roomId,
          threadId: args.threadId,
          limit: conversationReadLimit,
        },
        { context, path: ['message', 'getThread'] },
      );
      const enriched = result as {
        messages?: Array<{
          kind?: 'text' | 'order_proposal';
          body: string;
          proposalPayload?: OrderProposalPayload | null;
        }>;
      };
      if (enriched?.messages) {
        for (const message of enriched.messages) {
          if (message.kind === 'order_proposal' && message.proposalPayload) {
            message.body = appendProposalSummary(
              message.body,
              message.proposalPayload,
            );
            message.proposalPayload = null;
          }
        }
      }
      log.debug(
        {
          threadId: args.threadId,
          messageCount: (result as any)?.messages?.length ?? 0,
        },
        'Read conversation',
      );
      return result;
    });
  });

  const startConversationTool = toolDefinition({
    name: 'start_conversation',
    description:
      'Open a new private conversation with one or more other players. Provide their player IDs (not power names).',
    inputSchema: z.object({
      participantPlayerIds: z
        .array(z.string().uuid())
        .min(1)
        .max(6)
        .describe('Player IDs to include in the conversation.'),
    }),
  }).server(async (args) => {
    return traced('start_conversation', args, async () => {
      log.info(
        { participantPlayerIds: args.participantPlayerIds },
        'Starting conversation',
      );
      const result = await call(
        openOrCreateThread,
        { roomId: ctx.roomId, participantPlayerIds: args.participantPlayerIds },
        { context, path: ['message', 'openOrCreateThread'] },
      );
      log.info(
        { threadId: (result as any)?.thread?.id },
        'Conversation opened',
      );
      return {
        threadId: (result as any)?.thread?.id ?? null,
        participantPlayerIds: args.participantPlayerIds,
      };
    });
  });

  const sendMessageTool = toolDefinition({
    name: 'send_message',
    description:
      'Send a diplomatic message in a conversation. You may lie, manipulate, propose alliances, make threats, or be friendly — whatever serves your strategy.',
    inputSchema: z.object({
      threadId: z.string().uuid().describe('The conversation thread ID.'),
      body: z
        .string()
        .min(1)
        .max(500)
        .describe('The message text. Keep it SHORT — 1-3 sentences max.'),
    }),
  }).server(async (args) => {
    return traced(
      'send_message',
      { threadId: args.threadId, bodyLength: args.body.length },
      async () => {
        log.info(
          { threadId: args.threadId, bodyPreview: args.body.slice(0, 120) },
          'Sending message',
        );
        const result = await call(
          sendMessage,
          { roomId: ctx.roomId, threadId: args.threadId, body: args.body },
          { context, path: ['message', 'sendMessage'] },
        );
        log.info(
          { threadId: args.threadId, messageId: (result as any)?.message?.id },
          'Message sent',
        );
        return {
          sent: true,
          threadId: args.threadId,
          messageId: (result as any)?.message?.id ?? null,
        };
      },
    );
  });

  const sendOrderProposalTool = toolDefinition({
    name: 'send_order_proposal',
    description:
      'Send a STRUCTURED, visual order proposal into a private conversation. The recipient sees a card they can click to watch the proposed moves animate on the map. Use ONLY when pitching a coordinated 2–3-unit play that would take several sentences to describe in prose — not for simple one-move suggestions. Max 1 proposal per activation. The `body` should sell the play in character, not restate the orders. The proposal snapshots the current board, so it stays viewable even after the phase advances.',
    inputSchema: z.object({
      threadId: z.string().uuid().describe('The conversation thread ID.'),
      body: z
        .string()
        .min(1)
        .max(500)
        .describe('Short prose accompanying the proposal. 1–3 sentences max.'),
      orders: z
        .array(
          z.object({
            unitProvince: z
              .string()
              .min(2)
              .max(10)
              .describe(
                'Province where the proposed unit is located (must currently have a unit of any power).',
              ),
            orderType: orderTypeSchema.describe(
              'Order type: hold, move, support, or convoy.',
            ),
            targetProvince: z.string().min(2).max(10).nullable().optional(),
            supportedUnitProvince: z
              .string()
              .min(2)
              .max(10)
              .nullable()
              .optional(),
            viaConvoy: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(10)
        .describe('Proposed orders for units of any power. 1–10 orders.'),
    }),
  }).server(async (args) => {
    return traced(
      'send_order_proposal',
      { threadId: args.threadId, orderCount: args.orders.length },
      async () => {
        const state = await call(
          getGameState,
          { roomId: ctx.roomId },
          { context, path: ['game', 'getGameState'] },
        );
        const turn = (state as any)?.turn as {
          id: string;
          turnNumber: number;
          year: number;
          season: 'spring' | 'fall';
          phase:
            | 'order_submission'
            | 'retreat_submission'
            | 'build_submission'
            | string;
          unitPositions: UnitPositions;
          supplyCenters: SupplyCenterOwnership;
          dislodgedUnits: DislodgedUnit[] | null;
        } | null;
        if (!turn) {
          return {
            sent: false,
            error:
              'No active turn — cannot send a proposal when no game is running.',
          };
        }
        if (turn.phase !== 'order_submission') {
          return {
            sent: false,
            error: `Proposals are only supported during order_submission. Current phase: ${turn.phase}.`,
          };
        }

        const proposal: OrderProposalPayload = {
          version: 1,
          turnId: turn.id,
          turnNumber: turn.turnNumber,
          year: turn.year,
          season: turn.season,
          phase: 'order_submission',
          orders: args.orders.map((order) => ({
            unitProvince: order.unitProvince,
            orderType: order.orderType,
            targetProvince: order.targetProvince ?? null,
            supportedUnitProvince: order.supportedUnitProvince ?? null,
            viaConvoy: order.viaConvoy ?? false,
          })),
          boardBefore: {
            positions: turn.unitPositions,
            supplyCenters: turn.supplyCenters,
            dislodgedUnits: turn.dislodgedUnits ?? [],
          },
        };

        const result = await call(
          sendOrderProposal,
          {
            roomId: ctx.roomId,
            threadId: args.threadId,
            body: args.body,
            proposal,
          },
          { context, path: ['message', 'sendOrderProposal'] },
        );
        log.info(
          {
            threadId: args.threadId,
            orderCount: args.orders.length,
          },
          'Order proposal sent',
        );
        return {
          sent: true,
          threadId: args.threadId,
          orderCount: args.orders.length,
          messageId: (result as any)?.message?.id ?? null,
        };
      },
    );
  });

  const postGlobalMessageTool = toolDefinition({
    name: 'post_global_message',
    description:
      'Post a PUBLIC statement visible to every player in the room. Use SPARINGLY — at most once per phase, only for posturing, public accusations of betrayal, threats, or setting a narrative. NEVER reveal your strategic plan, alliances, or upcoming targets here. Silence carries weight; spam looks desperate.',
    inputSchema: z.object({
      body: z
        .string()
        .min(1)
        .max(300)
        .describe(
          'Public statement. Keep it SHORT — 1-2 sentences max. Remember: every player sees this.',
        ),
    }),
  }).server(async (args) => {
    return traced(
      'post_global_message',
      { bodyLength: args.body.length },
      async () => {
        const threadId = await resolveGlobalThreadId(ctx.roomId);
        log.info(
          { threadId, bodyPreview: args.body.slice(0, 120) },
          'Posting global message',
        );
        const result = await call(
          sendMessage,
          { roomId: ctx.roomId, threadId, body: args.body },
          { context, path: ['message', 'sendMessage'] },
        );
        log.info(
          { threadId, messageId: (result as any)?.message?.id },
          'Global message posted',
        );
        return {
          sent: true,
          threadId,
          messageId: (result as any)?.message?.id ?? null,
        };
      },
    );
  });

  // ── Order submission tools ─────────────────────────────────────

  const submitOrdersTool = toolDefinition({
    name: 'submit_orders',
    description:
      'Submit your main-phase orders (hold, move, support, convoy) for all your units. You must submit orders for every unit you control. If you call this again before the phase resolves, it replaces your previous submission. Orders are pre-validated against the map: if any are illegal (e.g. supporting into a province the supporter cannot reach) the tool returns { submitted: false, invalidOrders: [...] } with legal alternatives — fix and resubmit.',
    inputSchema: z.object({
      orders: z
        .array(
          z.object({
            unitProvince: z
              .string()
              .min(2)
              .max(4)
              .describe('Province where your unit is located.'),
            orderType: orderTypeSchema.describe(
              'Order type: hold, move, support, or convoy.',
            ),
            targetProvince: z
              .string()
              .min(2)
              .max(10)
              .optional()
              .describe('Target province for move/support/convoy.'),
            supportedUnitProvince: z
              .string()
              .min(2)
              .max(4)
              .optional()
              .describe(
                'Province of the unit being supported (for support orders).',
              ),
            viaConvoy: z
              .boolean()
              .optional()
              .describe('Whether this move should use a convoy route.'),
            coast: z
              .string()
              .max(2)
              .optional()
              .describe(
                'Coast suffix for coastal destinations (e.g. "nc", "sc").',
              ),
          }),
        )
        .min(1)
        .max(34)
        .describe('Your orders for this phase.'),
    }),
  }).server(async (args) => {
    return traced(
      'submit_orders',
      { orderCount: args.orders.length },
      async () => {
        const orderSummary = args.orders.map(
          (o) =>
            `${o.unitProvince} ${o.orderType}${o.targetProvince ? ` → ${o.targetProvince}` : ''}${o.supportedUnitProvince ? ` (support ${o.supportedUnitProvince})` : ''}`,
        );
        log.info({ orders: orderSummary }, 'Submitting orders');

        // Pre-validate against the map before calling the RPC. This lets us
        // surface every invalid order at once with legal alternatives, instead
        // of the server rejecting the whole submission on the first error.
        const state = await call(
          getGameState,
          { roomId: ctx.roomId },
          { context, path: ['game', 'getGameState'] },
        );
        const positions = (state as any)?.turn?.unitPositions as
          | UnitPositions
          | undefined;
        if (positions) {
          const engineOrders: Order[] = args.orders.map((orderInput) => ({
            power: ctx.power,
            unitType: positions[orderInput.unitProvince]?.unitType ?? 'army',
            unitProvince: orderInput.unitProvince,
            orderType: orderInput.orderType,
            targetProvince: orderInput.targetProvince ?? null,
            supportedUnitProvince: orderInput.supportedUnitProvince ?? null,
            viaConvoy: orderInput.viaConvoy ?? false,
            coast: orderInput.coast ?? null,
          }));
          const validation = await validateMainOrders(positions, engineOrders);
          if (!validation.valid) {
            const legalOrders = computeMyLegalOrders(positions, ctx.power);
            const invalidOrders = validation.errors.map((err) => ({
              unitProvince: err.unitProvince,
              reason: err.message,
              legalOrdersForThisUnit: legalOrders[err.unitProvince] ?? null,
            }));
            log.warn(
              { invalidOrders },
              'Bot attempted invalid orders — returning guidance instead of submitting',
            );
            return {
              submitted: false,
              invalidOrders,
              hint: 'One or more orders were illegal. Consult `legalOrdersForThisUnit` for each rejected unit, fix the orders, and call submit_orders again with the corrected full order set.',
            };
          }
        }

        const result = await call(
          submitOrders,
          {
            roomId: ctx.roomId,
            orders: args.orders.map((order) => ({
              ...order,
              coast: order.coast ?? undefined,
            })),
          },
          { context, path: ['order', 'submitOrders'] },
        );
        log.info(
          {
            submitted: (result as any)?.submitted,
            allSubmitted: (result as any)?.allSubmitted,
          },
          'Orders submitted',
        );
        return result;
      },
    );
  });

  const submitRetreatsTool = toolDefinition({
    name: 'submit_retreats',
    description:
      'Submit retreat orders for your dislodged units. Each unit can retreat to a valid province or be disbanded (retreatTo: null). If you call this again before the phase resolves, it replaces your previous retreat submission.',
    inputSchema: z.object({
      retreats: z
        .array(
          z.object({
            unitProvince: z
              .string()
              .min(2)
              .max(4)
              .describe('Province of your dislodged unit.'),
            retreatTo: z
              .string()
              .min(2)
              .max(10)
              .nullable()
              .describe('Province to retreat to, or null to disband.'),
          }),
        )
        .min(1)
        .max(34)
        .describe('Your retreat decisions.'),
    }),
  }).server(async (args) => {
    return traced('submit_retreats', args, async () => {
      const retreatSummary = args.retreats.map(
        (r) => `${r.unitProvince} → ${r.retreatTo ?? 'DISBAND'}`,
      );
      log.info({ retreats: retreatSummary }, 'Submitting retreats');
      const result = await call(
        submitRetreats,
        { roomId: ctx.roomId, retreats: args.retreats },
        { context, path: ['order', 'submitRetreats'] },
      );
      log.info(
        {
          submitted: (result as any)?.submitted,
          allSubmitted: (result as any)?.allSubmitted,
        },
        'Retreats submitted',
      );
      return result;
    });
  });

  const submitBuildsTool = toolDefinition({
    name: 'submit_builds',
    description:
      'Submit build or disband orders during the build phase. Build new units on unoccupied home supply centers, or disband existing units. If you call this again before the phase resolves, it replaces your previous build submission.',
    inputSchema: z.object({
      builds: z
        .array(
          z.object({
            action: buildActionSchema.describe(
              'build (new unit), disband (remove unit), or waive (skip a build).',
            ),
            unitType: unitTypeSchema
              .optional()
              .describe('army or fleet (for build actions only).'),
            province: z
              .string()
              .min(2)
              .max(4)
              .describe('Province for the build/disband.'),
            coast: z
              .string()
              .max(2)
              .optional()
              .describe('Coast suffix for coastal fleet builds.'),
          }),
        )
        .min(1)
        .max(34)
        .describe('Your build/disband decisions.'),
    }),
  }).server(async (args) => {
    return traced('submit_builds', args, async () => {
      const buildSummary = args.builds.map((b) =>
        `${b.action} ${b.unitType ?? ''} ${b.province}${b.coast ? `/${b.coast}` : ''}`.trim(),
      );
      log.info({ builds: buildSummary }, 'Submitting builds');
      const result = await call(
        submitBuilds,
        {
          roomId: ctx.roomId,
          builds: args.builds.map((build) => ({
            ...build,
            coast: build.coast ?? undefined,
          })),
        },
        { context, path: ['order', 'submitBuilds'] },
      );
      log.info(
        {
          submitted: (result as any)?.submitted,
          allSubmitted: (result as any)?.allSubmitted,
        },
        'Builds submitted',
      );
      return result;
    });
  });

  // ── Memory tools (write to bot_brain_state directly) ───────────

  const updatePlanTool = toolDefinition({
    name: 'update_strategic_plan',
    description:
      'Replace your entire strategic plan. Use bullet points, not prose. Include: current goals, active alliances, who to target, deception angles. Fold in relevant old observations when consolidating memory. Keep it under ~1500 characters.',
    inputSchema: z.object({
      plan: z
        .string()
        .min(1)
        .max(3000)
        .describe(
          'Your complete updated strategic plan. Bullet points preferred.',
        ),
    }),
  }).server(async (args) => {
    return traced(
      'update_strategic_plan',
      { planLength: args.plan.length },
      async () => {
        log.info(
          {
            planPreview: args.plan.slice(0, 200),
            planLength: args.plan.length,
          },
          'Updating strategic plan',
        );
        await updateStrategicPlan(ctx.playerId, args.plan);
        return { updated: true };
      },
    );
  });

  const setObservationsTool = toolDefinition({
    name: 'set_observations',
    description:
      'Replace your entire observations list. Max 10 observations. Use this to add new observations AND prune stale ones in a single call. When observations are full, consolidate — fold old info into your strategic plan, then drop those observations. Each note should be one concise sentence.',
    inputSchema: z.object({
      observations: z
        .array(
          z.object({
            turn: z
              .number()
              .int()
              .min(0)
              .describe('Turn number this observation relates to.'),
            phase: z
              .string()
              .describe('Game phase (e.g. "spring order_submission").'),
            note: z.string().min(1).max(200).describe('One concise sentence.'),
          }),
        )
        .max(10)
        .describe(
          'Your complete observations list (replaces all existing observations).',
        ),
    }),
  }).server(async (args) => {
    return traced(
      'set_observations',
      { count: args.observations.length },
      async () => {
        log.info(
          { observationCount: args.observations.length },
          'Setting observations',
        );
        await setObservations(ctx.playerId, args.observations);
        return { updated: true, count: args.observations.length };
      },
    );
  });

  const updateRelationshipTool = toolDefinition({
    name: 'update_relationship',
    description:
      'Update your assessment of another power. Track trust level, stance, and notes about their behavior and promises.',
    inputSchema: z.object({
      targetPower: z
        .enum([
          'england',
          'france',
          'germany',
          'russia',
          'austria',
          'italy',
          'turkey',
        ])
        .describe('The power to update your assessment of.'),
      trust: z
        .number()
        .min(-1)
        .max(1)
        .describe(
          'Trust level from -1 (total enemy) to 1 (fully trusted ally).',
        ),
      stance: z
        .enum(['allied', 'friendly', 'neutral', 'suspicious', 'hostile'])
        .describe('Your current diplomatic stance toward this power.'),
      notes: z
        .array(z.string())
        .describe('Key notes about this power (replaces previous notes).'),
    }),
  }).server(async (args) => {
    return traced(
      'update_relationship',
      { targetPower: args.targetPower, trust: args.trust, stance: args.stance },
      async () => {
        log.info(
          {
            targetPower: args.targetPower.toUpperCase(),
            trust: args.trust,
            stance: args.stance,
            noteCount: args.notes.length,
          },
          'Updating relationship assessment',
        );
        await updateRelationship(ctx.playerId, args.targetPower as PowerEnum, {
          trust: args.trust,
          stance: args.stance,
          notes: args.notes,
        });
        return { updated: true };
      },
    );
  });

  const memoryTools = [
    updatePlanTool,
    setObservationsTool,
    updateRelationshipTool,
  ];

  switch (ctx.trigger.type) {
    case 'game_start':
      return [
        getGameStateTool,
        startConversationTool,
        sendMessageTool,
        sendOrderProposalTool,
        submitOrdersTool,
        ...memoryTools,
      ];
    case 'message_received':
      return [
        getGameStateTool,
        readConversationTool,
        sendMessageTool,
        sendOrderProposalTool,
        setObservationsTool,
        updateRelationshipTool,
      ];
    case 'phase_change':
      if (ctx.trigger.phase === 'order_submission') {
        return [
          getGameStateTool,
          getGameHistoryTool,
          listConversationsTool,
          readConversationTool,
          startConversationTool,
          sendMessageTool,
          sendOrderProposalTool,
          postGlobalMessageTool,
          submitOrdersTool,
          ...memoryTools,
        ];
      }

      if (ctx.trigger.phase === 'retreat_submission') {
        return [
          getGameStateTool,
          submitRetreatsTool,
          updatePlanTool,
          setObservationsTool,
        ];
      }

      if (ctx.trigger.phase === 'build_submission') {
        return [
          getGameStateTool,
          submitBuildsTool,
          updatePlanTool,
          setObservationsTool,
        ];
      }

      return [getGameStateTool];
    case 'finalize_phase':
      return [
        getGameStateTool,
        submitOrdersTool,
        submitRetreatsTool,
        submitBuildsTool,
      ];
  }
}
