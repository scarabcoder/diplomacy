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
import { attachHistoricalNarration } from '@/domain/game/historical-narrator.ts';
import {
  buildBuildPhaseResultPayload,
  buildOrderPhaseResultPayload,
  buildRetreatPhaseResultPayload,
  type GamePhaseResultPayload,
} from '@/domain/game/phase-results.ts';
import { getPowersRequiringSubmission } from '@/domain/game/submission-requirements.ts';
import {
  submitOrdersSchema,
  submitRetreatsSchema,
  submitBuildsSchema,
  getMyOrdersSchema,
} from './schema.ts';
import { publishRoomEvent } from '@/domain/room/realtime.ts';
import { enqueuePhaseResultNotifications } from '@/domain/notification/enqueue.ts';
import { getPhaseResultRecipientUserIds } from '@/domain/notification/recipients.ts';
import { createLogger } from '@/lib/logger.ts';

const phaseNotificationLogger = createLogger('phase-notifications');

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

  const turn = await selectOne(
    database.select().from(gameTurnTable).where(eq(gameTurnTable.id, turnId)),
  );
  if (!turn) {
    return false;
  }

  const requiredPowers = getPowersRequiringSubmission(turn, activePlayers);

  if (turn.phase === 'order_submission') {
    const orders = await database
      .select({ power: gameOrderTable.power })
      .from(gameOrderTable)
      .where(eq(gameOrderTable.turnId, turnId));

    const submittedPowers = new Set(orders.map((o) => o.power));
    return requiredPowers.every((p) => submittedPowers.has(p));
  }

  if (turn.phase === 'retreat_submission') {
    const retreats = await database
      .select({ power: gameRetreatTable.power })
      .from(gameRetreatTable)
      .where(eq(gameRetreatTable.turnId, turnId));

    const submittedPowers = new Set(retreats.map((r) => r.power));
    return requiredPowers.every((p) => submittedPowers.has(p));
  }

  if (turn.phase === 'build_submission') {
    const builds = await database
      .select({ power: gameBuildTable.power })
      .from(gameBuildTable)
      .where(eq(gameBuildTable.turnId, turnId));

    const submittedPowers = new Set(builds.map((b) => b.power));
    return requiredPowers.every((p) => submittedPowers.has(p));
  }

  return false;
}

async function replaceOrdersForPower(params: {
  turnId: string;
  roomId: string;
  power: Power;
  records: Array<typeof gameOrderTable.$inferInsert>;
}) {
  await database.transaction(async (tx) => {
    await tx
      .delete(gameOrderTable)
      .where(
        and(
          eq(gameOrderTable.turnId, params.turnId),
          eq(gameOrderTable.power, params.power),
        ),
      );

    await tx.insert(gameOrderTable).values(params.records);
  });
}

async function replaceRetreatsForPower(params: {
  turnId: string;
  roomId: string;
  power: Power;
  records: Array<typeof gameRetreatTable.$inferInsert>;
}) {
  await database.transaction(async (tx) => {
    await tx
      .delete(gameRetreatTable)
      .where(
        and(
          eq(gameRetreatTable.turnId, params.turnId),
          eq(gameRetreatTable.power, params.power),
        ),
      );

    await tx.insert(gameRetreatTable).values(params.records);
  });
}

async function replaceBuildsForPower(params: {
  turnId: string;
  roomId: string;
  power: Power;
  records: Array<typeof gameBuildTable.$inferInsert>;
}) {
  await database.transaction(async (tx) => {
    await tx
      .delete(gameBuildTable)
      .where(
        and(
          eq(gameBuildTable.turnId, params.turnId),
          eq(gameBuildTable.power, params.power),
        ),
      );

    await tx.insert(gameBuildTable).values(params.records);
  });
}

async function createPhaseResult(params: {
  roomId: string;
  turn: typeof gameTurnTable.$inferSelect;
  payload: GamePhaseResultPayload;
  resolvedPositions: UnitPositions;
  dislodgedUnits: DislodgedUnit[];
}) {
  const previousPayloads = await database
    .select({ payload: gamePhaseResultTable.payload })
    .from(gamePhaseResultTable)
    .where(eq(gamePhaseResultTable.turnId, params.turn.id))
    .orderBy(gamePhaseResultTable.createdAt);

  const payload = await attachHistoricalNarration({
    existingPayloads: previousPayloads.map(
      (result) => result.payload as GamePhaseResultPayload,
    ),
    payload: params.payload,
    dislodgedUnits: params.dislodgedUnits,
  });

  const [inserted] = await database
    .insert(gamePhaseResultTable)
    .values({
      roomId: params.roomId,
      turnId: params.turn.id,
      turnNumber: params.turn.turnNumber,
      year: params.turn.year,
      season: params.turn.season,
      phase: params.turn.phase,
      payload,
    })
    .returning();

  if (inserted) {
    try {
      const recipientUserIds = await getPhaseResultRecipientUserIds({
        roomId: params.roomId,
      });
      if (recipientUserIds.length > 0) {
        await enqueuePhaseResultNotifications({
          roomId: params.roomId,
          phaseResultId: inserted.id,
          recipientUserIds,
        });
      }
    } catch (error) {
      phaseNotificationLogger.warn(
        { error, roomId: params.roomId, phaseResultId: inserted.id },
        'Failed to enqueue phase result notifications',
      );
    }
  }
}

function getTurnDislodgedUnits(
  turn: typeof gameTurnTable.$inferSelect,
): DislodgedUnit[] {
  return (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [];
}

async function resolveOrderSubmissionTurn(
  room: typeof gameRoomTable.$inferSelect,
  turn: typeof gameTurnTable.$inferSelect,
): Promise<void> {
  const positions = turn.unitPositions as UnitPositions;
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
    resolvedPositions: result.newPositions,
    dislodgedUnits: result.dislodgedUnits,
  });

  await advancePhase(
    room.id,
    turn.id,
    result.newPositions,
    result.dislodgedUnits,
  );
}

async function resolveRetreatSubmissionTurn(
  room: typeof gameRoomTable.$inferSelect,
  turn: typeof gameTurnTable.$inferSelect,
): Promise<void> {
  const dislodgedUnits = getTurnDislodgedUnits(turn);
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
    resolvedPositions: result.newPositions,
    dislodgedUnits: [],
  });

  await advancePhase(room.id, turn.id, result.newPositions, []);
}

async function resolveBuildSubmissionTurn(
  room: typeof gameRoomTable.$inferSelect,
  turn: typeof gameTurnTable.$inferSelect,
): Promise<void> {
  const positions = turn.unitPositions as UnitPositions;
  const supplyCenters = turn.supplyCenters as SupplyCenterOwnership;
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
    resolvedPositions: result.newPositions,
    dislodgedUnits: [],
  });

  await advancePhase(room.id, turn.id, result.newPositions, []);
}

export async function resolveTurnIfReady(params: {
  roomId: string;
  turnId?: string;
}): Promise<{ resolved: boolean; allSubmitted: boolean }> {
  const room = await selectOne(
    database
      .select()
      .from(gameRoomTable)
      .where(eq(gameRoomTable.id, params.roomId)),
  );
  if (!room || room.status !== 'playing' || !room.currentTurnId) {
    return { resolved: false, allSubmitted: false };
  }

  const turn = await selectOne(
    database
      .select()
      .from(gameTurnTable)
      .where(eq(gameTurnTable.id, room.currentTurnId)),
  );
  if (!turn || turn.isComplete) {
    return { resolved: false, allSubmitted: false };
  }

  if (params.turnId && turn.id !== params.turnId) {
    return { resolved: false, allSubmitted: false };
  }

  if (
    turn.phase !== 'order_submission' &&
    turn.phase !== 'retreat_submission' &&
    turn.phase !== 'build_submission'
  ) {
    return { resolved: false, allSubmitted: false };
  }

  const allSubmitted = await checkAllSubmitted(room.id, turn.id);
  if (!allSubmitted) {
    return { resolved: false, allSubmitted: false };
  }

  if (turn.phase === 'order_submission') {
    await resolveOrderSubmissionTurn(room, turn);
  } else if (turn.phase === 'retreat_submission') {
    await resolveRetreatSubmissionTurn(room, turn);
  } else {
    await resolveBuildSubmissionTurn(room, turn);
  }

  return { resolved: true, allSubmitted: true };
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

    await replaceOrdersForPower({
      turnId: turn.id,
      roomId: room.id,
      power,
      records: orderRecords,
    });

    const { allSubmitted } = await resolveTurnIfReady({
      roomId: room.id,
      turnId: turn.id,
    });

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

    await replaceRetreatsForPower({
      turnId: turn.id,
      roomId: room.id,
      power,
      records: retreatRecords,
    });

    const { allSubmitted } = await resolveTurnIfReady({
      roomId: room.id,
      turnId: turn.id,
    });

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

    await replaceBuildsForPower({
      turnId: turn.id,
      roomId: room.id,
      power,
      records: buildRecords,
    });

    const { allSubmitted } = await resolveTurnIfReady({
      roomId: room.id,
      turnId: turn.id,
    });

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
