import { call } from '@orpc/server';
import { and, eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  gameBuildTable,
  gameOrderTable,
  gamePlayerTable,
  gameRetreatTable,
  gameRoomTable,
  gameTurnTable,
  type PowerEnum,
} from '@/database/schema/game-schema.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import type {
  DislodgedUnit,
  Power,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import {
  submitOrders,
  submitRetreats,
  submitBuilds,
} from '@/domain/order/procedures.ts';
import { createLogger } from '@/lib/logger.ts';
import { loadBotSession } from './bot-context.ts';
import { createBotOrpcContext } from './bot-context.ts';

const logger = createLogger('bot-fallback');

/**
 * Submit safe default orders for a bot that failed all activation attempts.
 * - Order phase: hold all units
 * - Retreat phase: disband all dislodged units
 * - Build phase: waive builds or disband excess units
 *
 * Silently returns if the bot has already submitted or the game state
 * doesn't require submission from this power.
 */
export async function submitFallbackOrders(params: {
  playerId: string;
  roomId: string;
  power: PowerEnum;
}): Promise<void> {
  const { playerId, roomId, power } = params;
  const log = logger.child({ bot: power.toUpperCase(), playerId });

  log.info('Attempting fallback order submission');

  // Load bot session for oRPC context
  const botSession = await loadBotSession(playerId);
  if (!botSession) {
    log.error('Cannot submit fallback — no bot session found');
    return;
  }
  const context = createBotOrpcContext(botSession);

  // Load game state
  const room = await selectOne(
    database.select().from(gameRoomTable).where(eq(gameRoomTable.id, roomId)),
  );
  if (!room || room.status !== 'playing' || !room.currentTurnId) {
    log.warn('Game not in playing state — skipping fallback');
    return;
  }

  const turn = await selectOne(
    database
      .select()
      .from(gameTurnTable)
      .where(eq(gameTurnTable.id, room.currentTurnId)),
  );
  if (!turn || turn.isComplete) {
    log.warn('No active turn — skipping fallback');
    return;
  }

  const positions = turn.unitPositions as UnitPositions;
  const supplyCenters = turn.supplyCenters as SupplyCenterOwnership;
  const p = power as Power;

  try {
    if (turn.phase === 'order_submission') {
      await submitFallbackMainOrders(roomId, p, positions, context, log);
    } else if (turn.phase === 'retreat_submission') {
      const dislodgedUnits =
        (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [];
      await submitFallbackRetreats(roomId, p, dislodgedUnits, context, log);
    } else if (turn.phase === 'build_submission') {
      await submitFallbackBuilds(
        roomId,
        p,
        positions,
        supplyCenters,
        context,
        log,
      );
    } else {
      log.debug({ phase: turn.phase }, 'Not a submission phase — no fallback needed');
    }
  } catch (error) {
    // Catch CONFLICT (already submitted) gracefully
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already submitted')) {
      log.info('Bot already submitted — fallback not needed');
    } else {
      log.error({ err: error }, 'Fallback submission failed');
    }
  }
}

async function submitFallbackMainOrders(
  roomId: string,
  power: Power,
  positions: UnitPositions,
  context: any,
  log: any,
): Promise<void> {
  const myUnits = Object.entries(positions)
    .filter(([, unit]) => unit.power === power)
    .map(([province]) => province);

  if (myUnits.length === 0) {
    log.info('No units to submit orders for');
    return;
  }

  const orders = myUnits.map((province) => ({
    unitProvince: province,
    orderType: 'hold' as const,
  }));

  log.info({ unitCount: orders.length }, 'Submitting fallback HOLD orders');
  await call(submitOrders, { roomId, orders }, {
    context,
    path: ['order', 'submitOrders'],
  });
  log.info('Fallback orders submitted');
}

async function submitFallbackRetreats(
  roomId: string,
  power: Power,
  dislodgedUnits: DislodgedUnit[],
  context: any,
  log: any,
): Promise<void> {
  const myDislodged = dislodgedUnits.filter((u) => u.power === power);

  if (myDislodged.length === 0) {
    log.info('No dislodged units — no retreat needed');
    return;
  }

  const retreats = myDislodged.map((unit) => ({
    unitProvince: unit.province,
    retreatTo: null, // disband
  }));

  log.info({ unitCount: retreats.length }, 'Submitting fallback DISBAND retreats');
  await call(submitRetreats, { roomId, retreats }, {
    context,
    path: ['order', 'submitRetreats'],
  });
  log.info('Fallback retreats submitted');
}

async function submitFallbackBuilds(
  roomId: string,
  power: Power,
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  context: any,
  log: any,
): Promise<void> {
  const buildCounts = calculateBuildCounts(positions, supplyCenters);
  const myBuildCount = buildCounts.find((bc) => bc.power === power);

  if (!myBuildCount || myBuildCount.count === 0) {
    log.info('No builds or disbands needed');
    return;
  }

  const builds: Array<{
    action: 'build' | 'disband' | 'waive';
    province: string;
    unitType?: 'army' | 'fleet';
    coast?: string;
  }> = [];

  if (myBuildCount.count > 0) {
    // Can build — waive all builds (safest fallback)
    for (let i = 0; i < myBuildCount.count; i++) {
      const province = myBuildCount.availableHomeSCs[i] ?? myBuildCount.availableHomeSCs[0];
      if (province) {
        builds.push({ action: 'waive', province });
      }
    }
    log.info({ waiveCount: builds.length }, 'Submitting fallback WAIVE builds');
  } else {
    // Must disband — pick units to remove
    const myUnits = Object.entries(positions)
      .filter(([, unit]) => unit.power === power)
      .map(([province]) => province);
    const disbandCount = Math.abs(myBuildCount.count);

    for (let i = 0; i < disbandCount && i < myUnits.length; i++) {
      builds.push({ action: 'disband', province: myUnits[i]! });
    }
    log.info({ disbandCount: builds.length }, 'Submitting fallback DISBAND builds');
  }

  if (builds.length > 0) {
    await call(submitBuilds, { roomId, builds }, {
      context,
      path: ['order', 'submitBuilds'],
    });
    log.info('Fallback builds submitted');
  }
}
