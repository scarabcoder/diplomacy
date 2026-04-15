import { ORPCError } from '@orpc/client';
import { and, eq } from 'drizzle-orm';
import {
  requireRoomMembershipForActor,
  requireRpcActor,
  type RpcActor,
} from '@/domain/player-actor.ts';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import {
  gameRoomTable,
  gameTurnTable,
  gameOrderTable,
  gameOrderResultTable,
  gamePhaseResultTable,
  gamePlayerTable,
  gameRetreatTable,
  gameBuildTable,
} from '@/database/schema/game-schema.ts';
import { selectOne } from '@/database/helpers.ts';
import type {
  UnitPositions,
  SupplyCenterOwnership,
  DislodgedUnit,
  Order,
  RetreatOrder,
  BuildOrder,
  Power,
} from '@/domain/game/engine/types.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import {
  adjudicateBuildPhase,
  adjudicateMainPhase,
  adjudicateRetreatPhase,
  validateMainOrders,
} from '@/domain/game/adjudicator/rust-engine.ts';
import { advancePhase } from '@/domain/game/game-logic.ts';
import {
  buildBuildPhaseResultPayload,
  buildOrderPhaseResultPayload,
  buildRetreatPhaseResultPayload,
  type GamePhaseResultPayload,
} from '@/domain/game/phase-results.ts';
import {
  submitOrdersSchema,
  submitRetreatsSchema,
  submitBuildsSchema,
  getMyOrdersSchema,
} from './schema.ts';
import { publishRoomEvent } from '@/domain/room/realtime.ts';

// --- Helper: get room, turn, and player context ---
async function getGameContext(roomId: string, actor: RpcActor) {
  const room = await selectOne(
    database.select().from(gameRoomTable).where(eq(gameRoomTable.id, roomId)),
  );
  if (!room || room.status !== 'playing') {
    throw new ORPCError('BAD_REQUEST', { message: 'Game is not active' });
  }
  if (!room.currentTurnId) {
    throw new ORPCError('BAD_REQUEST', { message: 'No active turn' });
  }

  const turn = await selectOne(
    database
      .select()
      .from(gameTurnTable)
      .where(eq(gameTurnTable.id, room.currentTurnId)),
  );
  if (!turn || turn.isComplete) {
    throw new ORPCError('BAD_REQUEST', { message: 'No active phase' });
  }

  const player = await requireRoomMembershipForActor(
    roomId,
    actor,
    'You are not an active player in this game',
  );
  if (!player || player.isSpectator || !player.power) {
    throw new ORPCError('FORBIDDEN', {
      message: 'You are not an active player in this game',
    });
  }
  if (player.status !== 'active') {
    throw new ORPCError('FORBIDDEN', {
      message: `You are in ${player.status} status and cannot submit orders`,
    });
  }

  return { room, turn, player, power: player.power as Power };
}

// --- Helper: check if all active players have submitted ---
async function checkAllSubmitted(
  roomId: string,
  turnId: string,
  phase: string,
): Promise<boolean> {
  const activePlayers = await database
    .select()
    .from(gamePlayerTable)
    .where(
      and(
        eq(gamePlayerTable.roomId, roomId),
        eq(gamePlayerTable.isSpectator, false),
      ),
    );

  const activePowers = activePlayers
    .filter((p) => p.power && p.status === 'active')
    .map((p) => p.power!);

  if (phase === 'order_submission') {
    const orders = await database
      .select({ power: gameOrderTable.power })
      .from(gameOrderTable)
      .where(eq(gameOrderTable.turnId, turnId));

    const submittedPowers = new Set(orders.map((o) => o.power));
    return activePowers.every((p) => submittedPowers.has(p));
  }

  if (phase === 'retreat_submission') {
    const retreats = await database
      .select({ power: gameRetreatTable.power })
      .from(gameRetreatTable)
      .where(eq(gameRetreatTable.turnId, turnId));

    const submittedPowers = new Set(retreats.map((r) => r.power));
    // Only powers with dislodged units need to submit
    // For now, check if all submitted
    return submittedPowers.size > 0; // Simplified: at least one retreat submitted
  }

  if (phase === 'build_submission') {
    const builds = await database
      .select({ power: gameBuildTable.power })
      .from(gameBuildTable)
      .where(eq(gameBuildTable.turnId, turnId));

    const submittedPowers = new Set(builds.map((b) => b.power));
    // Only powers that need to build/disband need to submit
    const _positions = {} as UnitPositions; // Will be loaded from turn
    return submittedPowers.size > 0; // Simplified
  }

  return false;
}

async function createPhaseResult(params: {
  roomId: string;
  turn: typeof gameTurnTable.$inferSelect;
  payload: GamePhaseResultPayload;
}) {
  await database.insert(gamePhaseResultTable).values({
    roomId: params.roomId,
    turnId: params.turn.id,
    turnNumber: params.turn.turnNumber,
    year: params.turn.year,
    season: params.turn.season,
    phase: params.turn.phase,
    payload: params.payload,
  });
}

function getTurnDislodgedUnits(
  turn: typeof gameTurnTable.$inferSelect,
): DislodgedUnit[] {
  return (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [];
}

// --- Submit Orders ---
export const submitOrders = authed
  .input(submitOrdersSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, turn, power } = await getGameContext(input.roomId, actor);

    if (turn.phase !== 'order_submission') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Current phase is ${turn.phase}, not order_submission`,
      });
    }

    // Check if already submitted
    const existing = await database
      .select()
      .from(gameOrderTable)
      .where(
        and(
          eq(gameOrderTable.turnId, turn.id),
          eq(gameOrderTable.power, power),
        ),
      );

    if (existing.length > 0) {
      throw new ORPCError('CONFLICT', {
        message: 'You have already submitted orders for this turn',
      });
    }

    const positions = turn.unitPositions as UnitPositions;

    const engineOrders: Order[] = input.orders.map((orderInput) => ({
      power,
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
      throw new ORPCError('BAD_REQUEST', {
        message: validation.errors[0]?.message ?? 'Invalid order submission',
      });
    }

    const orderRecords = engineOrders.map((order) => ({
      turnId: turn.id,
      roomId: room.id,
      power,
      unitType: order.unitType,
      unitProvince: order.unitProvince,
      orderType: order.orderType,
      targetProvince: order.targetProvince,
      supportedUnitProvince: order.supportedUnitProvince,
      viaConvoy: order.viaConvoy ?? false,
      coast: order.coast,
    }));

    await database.insert(gameOrderTable).values(orderRecords);

    // Check if all players have submitted
    const allSubmitted = await checkAllSubmitted(
      room.id,
      turn.id,
      'order_submission',
    );

    if (allSubmitted) {
      // Resolve orders
      const allOrders = await database
        .select()
        .from(gameOrderTable)
        .where(eq(gameOrderTable.turnId, turn.id));

      const allEngineOrders: Order[] = allOrders.map((o) => ({
        power: o.power as Power,
        unitType: o.unitType as 'army' | 'fleet',
        unitProvince: o.unitProvince,
        orderType: o.orderType as 'hold' | 'move' | 'support' | 'convoy',
        targetProvince: o.targetProvince,
        supportedUnitProvince: o.supportedUnitProvince,
        viaConvoy: o.viaConvoy,
        coast: o.coast,
      }));

      const result = await adjudicateMainPhase(positions, allEngineOrders);

      // Store results
      for (const orderResult of result.orderResults) {
        const dbOrder = allOrders.find(
          (o) =>
            o.unitProvince === orderResult.order.unitProvince &&
            o.power === orderResult.order.power,
        );
        if (dbOrder) {
          await database.insert(gameOrderResultTable).values({
            orderId: dbOrder.id,
            success: orderResult.success,
            resultType: orderResult.resultType,
            dislodgedFrom: orderResult.dislodgedFrom ?? null,
            retreatOptions: orderResult.retreatOptions ?? null,
          });
        }
      }

      await createPhaseResult({
        roomId: room.id,
        turn,
        payload: buildOrderPhaseResultPayload({
          turn: {
            id: turn.id,
            turnNumber: turn.turnNumber,
            season: turn.season,
            year: turn.year,
            phase: turn.phase,
            unitPositions: positions,
            supplyCenters: turn.supplyCenters as SupplyCenterOwnership,
            dislodgedUnits: getTurnDislodgedUnits(turn),
          },
          orders: allEngineOrders,
          orderResults: result.orderResults,
          resolvedPositions: result.newPositions,
          dislodgedUnits: result.dislodgedUnits,
        }),
      });

      // Advance phase
      await advancePhase(
        room.id,
        turn.id,
        result.newPositions,
        result.dislodgedUnits,
      );
    }

    publishRoomEvent(room.id, 'submit_orders');
    return { submitted: true, allSubmitted };
  });

// --- Submit Retreats ---
export const submitRetreats = authed
  .input(submitRetreatsSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, turn, power } = await getGameContext(input.roomId, actor);

    if (turn.phase !== 'retreat_submission') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Current phase is ${turn.phase}, not retreat_submission`,
      });
    }

    const dislodgedUnits =
      (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [];
    const myDislodged = dislodgedUnits.filter((d) => d.power === power);

    if (myDislodged.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'You have no dislodged units to retreat',
      });
    }

    const existing = await database
      .select()
      .from(gameRetreatTable)
      .where(
        and(
          eq(gameRetreatTable.turnId, turn.id),
          eq(gameRetreatTable.power, power),
        ),
      );

    if (existing.length > 0) {
      throw new ORPCError('CONFLICT', {
        message: 'You have already submitted retreats for this turn',
      });
    }

    // Store retreat orders
    const retreatRecords = input.retreats.map((r) => ({
      turnId: turn.id,
      roomId: room.id,
      power,
      unitType:
        myDislodged.find((d) => d.province === r.unitProvince)?.unitType ??
        ('army' as const),
      unitProvince: r.unitProvince,
      retreatTo: r.retreatTo,
    }));

    await database.insert(gameRetreatTable).values(retreatRecords);

    // Check if all powers with dislodged units have submitted
    const powersNeedingRetreats = [
      ...new Set(dislodgedUnits.map((d) => d.power)),
    ];

    const submittedRetreats = await database
      .select({ power: gameRetreatTable.power })
      .from(gameRetreatTable)
      .where(eq(gameRetreatTable.turnId, turn.id));

    const submittedPowers = new Set(submittedRetreats.map((r) => r.power));
    const allSubmitted = powersNeedingRetreats.every((p) =>
      submittedPowers.has(p),
    );

    if (allSubmitted) {
      const allRetreats = await database
        .select()
        .from(gameRetreatTable)
        .where(eq(gameRetreatTable.turnId, turn.id));

      const retreatOrders: RetreatOrder[] = allRetreats.map((r) => ({
        power: r.power as Power,
        unitType: r.unitType as 'army' | 'fleet',
        unitProvince: r.unitProvince,
        retreatTo: r.retreatTo,
      }));

      const positions = turn.unitPositions as UnitPositions;
      const result = await adjudicateRetreatPhase(
        positions,
        dislodgedUnits,
        retreatOrders,
      );

      await createPhaseResult({
        roomId: room.id,
        turn,
        payload: buildRetreatPhaseResultPayload({
          turn: {
            id: turn.id,
            turnNumber: turn.turnNumber,
            season: turn.season,
            year: turn.year,
            phase: turn.phase,
            unitPositions: positions,
            supplyCenters: turn.supplyCenters as SupplyCenterOwnership,
            dislodgedUnits,
          },
          retreats: retreatOrders,
          result,
        }),
      });

      await advancePhase(room.id, turn.id, result.newPositions, []);
    }

    publishRoomEvent(room.id, 'submit_retreats');
    return { submitted: true, allSubmitted };
  });

// --- Submit Builds ---
export const submitBuilds = authed
  .input(submitBuildsSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const { room, turn, power } = await getGameContext(input.roomId, actor);

    if (turn.phase !== 'build_submission') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Current phase is ${turn.phase}, not build_submission`,
      });
    }

    const positions = turn.unitPositions as UnitPositions;
    const supplyCenters = turn.supplyCenters as SupplyCenterOwnership;
    const buildCounts = calculateBuildCounts(positions, supplyCenters);
    const myBuildCount = buildCounts.find((bc) => bc.power === power);

    if (!myBuildCount || myBuildCount.count === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'You have no builds or disbands to submit',
      });
    }

    const existing = await database
      .select()
      .from(gameBuildTable)
      .where(
        and(
          eq(gameBuildTable.turnId, turn.id),
          eq(gameBuildTable.power, power),
        ),
      );

    if (existing.length > 0) {
      throw new ORPCError('CONFLICT', {
        message: 'You have already submitted builds for this turn',
      });
    }

    // Store build orders
    const buildRecords = input.builds.map((b) => ({
      turnId: turn.id,
      roomId: room.id,
      power,
      action: b.action,
      unitType: b.unitType ?? null,
      province: b.province,
      coast: b.coast ?? null,
    }));

    await database.insert(gameBuildTable).values(buildRecords);

    // Check if all powers needing builds/disbands have submitted
    const powersNeedingAction = buildCounts
      .filter((bc) => bc.count !== 0)
      .map((bc) => bc.power);

    const submittedBuilds = await database
      .select({ power: gameBuildTable.power })
      .from(gameBuildTable)
      .where(eq(gameBuildTable.turnId, turn.id));

    const submittedPowers = new Set(submittedBuilds.map((b) => b.power));
    const allSubmitted = powersNeedingAction.every((p) =>
      submittedPowers.has(p),
    );

    if (allSubmitted) {
      const allBuilds = await database
        .select()
        .from(gameBuildTable)
        .where(eq(gameBuildTable.turnId, turn.id));

      const buildOrders: BuildOrder[] = allBuilds.map((b) => ({
        power: b.power as Power,
        action: b.action as 'build' | 'disband' | 'waive',
        unitType: b.unitType as 'army' | 'fleet' | null,
        province: b.province,
        coast: b.coast,
      }));

      const result = await adjudicateBuildPhase(
        positions,
        supplyCenters,
        buildOrders,
      );

      await createPhaseResult({
        roomId: room.id,
        turn,
        payload: buildBuildPhaseResultPayload({
          turn: {
            id: turn.id,
            turnNumber: turn.turnNumber,
            season: turn.season,
            year: turn.year,
            phase: turn.phase,
            unitPositions: positions,
            supplyCenters,
            dislodgedUnits: getTurnDislodgedUnits(turn),
          },
          builds: buildOrders,
          result,
        }),
      });

      await advancePhase(room.id, turn.id, result.newPositions, []);
    }

    publishRoomEvent(room.id, 'submit_builds');
    return { submitted: true, allSubmitted };
  });

// --- Get My Orders ---
export const getMyOrders = authed
  .input(getMyOrdersSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const {
      room: _room,
      turn,
      power,
    } = await getGameContext(input.roomId, actor);

    const orders = await database
      .select()
      .from(gameOrderTable)
      .where(
        and(
          eq(gameOrderTable.turnId, turn.id),
          eq(gameOrderTable.power, power),
        ),
      );

    return orders;
  });
