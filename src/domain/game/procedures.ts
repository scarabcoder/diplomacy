import { ORPCError } from '@orpc/client';
import { and, eq, desc } from 'drizzle-orm';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import {
  gameRoomTable,
  gameTurnTable,
  gameOrderTable,
  gameOrderResultTable,
  gamePlayerTable,
  gameRetreatTable,
  gameBuildTable,
} from '@/database/schema/game-schema.ts';
import { selectOne } from '@/database/helpers.ts';
import type {
  UnitPositions,
  SupplyCenterOwnership,
  DislodgedUnit,
} from '@/domain/game/engine/types.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import {
  getGameStateSchema,
  getGameHistorySchema,
  getSubmissionStatusSchema,
} from './schema.ts';

// --- Get Game State ---
export const getGameState = authed
  .input(getGameStateSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    if (!room.currentTurnId) {
      return {
        room,
        turn: null,
        submissionStatus: null,
        buildCounts: null,
        mySubmission: null,
      };
    }

    const turn = await selectOne(
      database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, room.currentTurnId)),
    );

    if (!turn) {
      return {
        room,
        turn: null,
        submissionStatus: null,
        buildCounts: null,
        mySubmission: null,
      };
    }

    const currentUserPlayer = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, input.roomId),
            eq(gamePlayerTable.userId, userSession.user.id),
          ),
        ),
    );

    const activePlayers = await database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, input.roomId),
          eq(gamePlayerTable.isSpectator, false),
        ),
      );

    const activePowers = activePlayers
      .filter((player) => player.power && player.status === 'active' && !player.isBot)
      .map((player) => player.power!);

    let submitted: string[] = [];
    let pending: string[] = [];
    let mySubmission: {
      phase: 'order_submission';
      orders: Array<typeof gameOrderTable.$inferSelect>;
    } | {
      phase: 'retreat_submission';
      retreats: Array<typeof gameRetreatTable.$inferSelect>;
    } | {
      phase: 'build_submission';
      builds: Array<typeof gameBuildTable.$inferSelect>;
    } | null = null;

    if (turn.phase === 'order_submission') {
      const orders = await database
        .select()
        .from(gameOrderTable)
        .where(eq(gameOrderTable.turnId, turn.id));

      submitted = [...new Set(orders.map((order) => order.power))];
      pending = activePowers.filter((power) => !submitted.includes(power));

      if (currentUserPlayer?.power) {
        const myOrders = orders.filter((order) => order.power === currentUserPlayer.power);
        if (myOrders.length > 0) {
          mySubmission = {
            phase: 'order_submission',
            orders: myOrders,
          };
        }
      }
    } else if (turn.phase === 'retreat_submission') {
      const retreats = await database
        .select()
        .from(gameRetreatTable)
        .where(eq(gameRetreatTable.turnId, turn.id));
      const retreatPowers = [
        ...new Set(
          ((turn.dislodgedUnits as DislodgedUnit[] | null) ?? []).map(
            (unit) => unit.power,
          ),
        ),
      ].filter((power) => activePowers.includes(power));

      submitted = [...new Set(retreats.map((retreat) => retreat.power))];
      pending = retreatPowers.filter((power) => !submitted.includes(power));

      if (currentUserPlayer?.power) {
        const myRetreats = retreats.filter(
          (retreat) => retreat.power === currentUserPlayer.power,
        );
        if (myRetreats.length > 0) {
          mySubmission = {
            phase: 'retreat_submission',
            retreats: myRetreats,
          };
        }
      }
    } else if (turn.phase === 'build_submission') {
      const positions = turn.unitPositions as UnitPositions;
      const supplyCenters = turn.supplyCenters as SupplyCenterOwnership;
      const buildCounts = calculateBuildCounts(positions, supplyCenters);
      const buildPowers = buildCounts
        .filter((count) => count.count !== 0 && activePowers.includes(count.power))
        .map((count) => count.power);
      const builds = await database
        .select()
        .from(gameBuildTable)
        .where(eq(gameBuildTable.turnId, turn.id));

      submitted = [...new Set(builds.map((build) => build.power))];
      pending = buildPowers.filter((power) => !submitted.includes(power));

      if (currentUserPlayer?.power) {
        const myBuilds = builds.filter((build) => build.power === currentUserPlayer.power);
        if (myBuilds.length > 0) {
          mySubmission = {
            phase: 'build_submission',
            builds: myBuilds,
          };
        }
      }
    } else {
      submitted = [];
      pending = [];
    }

    const submissionStatus = {
      submitted,
      pending,
    };

    // Calculate build counts if in build phase
    let buildCounts = null;
    if (turn.phase === 'build_submission') {
      buildCounts = calculateBuildCounts(
        turn.unitPositions as UnitPositions,
        turn.supplyCenters as SupplyCenterOwnership,
      );
    }

    return {
      room,
      turn: {
        ...turn,
        unitPositions: turn.unitPositions as UnitPositions,
        supplyCenters: turn.supplyCenters as SupplyCenterOwnership,
        dislodgedUnits: (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [],
      },
      submissionStatus,
      buildCounts,
      mySubmission,
    };
  });

// --- Get Game History ---
export const getGameHistory = authed
  .input(getGameHistorySchema)
  .handler(async ({ input }) => {
    const query = database
      .select()
      .from(gameTurnTable)
      .where(eq(gameTurnTable.roomId, input.roomId))
      .orderBy(desc(gameTurnTable.turnNumber));

    const turns = input.turnNumber
      ? await database
          .select()
          .from(gameTurnTable)
          .where(
            and(
              eq(gameTurnTable.roomId, input.roomId),
              eq(gameTurnTable.turnNumber, input.turnNumber),
            ),
          )
      : await query;

    // For each completed turn, get orders and results
    const history = await Promise.all(
      turns.map(async (turn) => {
        const orders = await database
          .select()
          .from(gameOrderTable)
          .where(eq(gameOrderTable.turnId, turn.id));

        const orderIds = orders.map((o) => o.id);
        let results: Array<typeof gameOrderResultTable.$inferSelect> = [];
        if (orderIds.length > 0) {
          results = await database
            .select()
            .from(gameOrderResultTable)
            .where(
              eq(gameOrderResultTable.orderId, orders[0]!.id),
            );
          // Get all results for all orders in this turn
          // Simple approach: query per turn
          results = [];
          for (const order of orders) {
            const orderResults = await database
              .select()
              .from(gameOrderResultTable)
              .where(eq(gameOrderResultTable.orderId, order.id));
            results.push(...orderResults);
          }
        }

        return {
          turn,
          orders,
          results,
        };
      }),
    );

    return history;
  });

// --- Get Submission Status ---
export const getSubmissionStatus = authed
  .input(getSubmissionStatusSchema)
  .handler(async ({ input }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room || !room.currentTurnId) {
      throw new ORPCError('NOT_FOUND', { message: 'No active game' });
    }

    const turn = await selectOne(
      database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, room.currentTurnId)),
    );

    if (!turn) {
      throw new ORPCError('NOT_FOUND', { message: 'No active turn' });
    }

    const activePlayers = await database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, input.roomId),
          eq(gamePlayerTable.isSpectator, false),
        ),
      );

    const activePowers = activePlayers
      .filter(
        (p) => p.power && p.status === 'active' && !p.isBot,
      )
      .map((p) => p.power!);

    let submittedPowers: string[] = [];

    if (turn.phase === 'order_submission') {
      const orders = await database
        .select({ power: gameOrderTable.power })
        .from(gameOrderTable)
        .where(eq(gameOrderTable.turnId, turn.id));

      submittedPowers = [...new Set(orders.map((order) => order.power))];
    } else if (turn.phase === 'retreat_submission') {
      const retreats = await database
        .select({ power: gameRetreatTable.power })
        .from(gameRetreatTable)
        .where(eq(gameRetreatTable.turnId, turn.id));
      const retreatPowers = [
        ...new Set(
          ((turn.dislodgedUnits as DislodgedUnit[] | null) ?? []).map(
            (unit) => unit.power,
          ),
        ),
      ].filter((power) => activePowers.includes(power));
      submittedPowers = [
        ...new Set(retreats.map((retreat) => retreat.power)),
      ].filter((power) => retreatPowers.includes(power));
    } else if (turn.phase === 'build_submission') {
      const buildCounts = calculateBuildCounts(
        turn.unitPositions as UnitPositions,
        turn.supplyCenters as SupplyCenterOwnership,
      );
      const buildPowers = buildCounts
        .filter((count) => count.count !== 0 && activePowers.includes(count.power))
        .map((count) => count.power);
      const builds = await database
        .select({ power: gameBuildTable.power })
        .from(gameBuildTable)
        .where(eq(gameBuildTable.turnId, turn.id));
      submittedPowers = [...new Set(builds.map((build) => build.power))].filter(
        (power) => buildPowers.includes(power),
      );
    }

    return {
      phase: turn.phase,
      submitted: submittedPowers,
      pending: activePowers.filter((p) => !submittedPowers.includes(p)),
      allSubmitted: activePowers.every((p) => submittedPowers.includes(p)),
    };
  });
