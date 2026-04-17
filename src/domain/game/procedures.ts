import { ORPCError } from '@orpc/client';
import { and, eq, desc } from 'drizzle-orm';
import {
  requireRoomMembershipForActor,
  requireRpcActor,
} from '@/domain/player-actor.ts';
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
  gamePhaseResultAckTable,
  gamePhaseResultTable,
} from '@/database/schema/game-schema.ts';
import { selectOne } from '@/database/helpers.ts';
import type { Power } from '@/domain/game/engine/types.ts';
import { getGameStateSnapshot } from '@/domain/room/live-state.ts';
import type { GamePhaseResultPayload } from '@/domain/game/phase-results.ts';
import { getPowersRequiringSubmission } from '@/domain/game/submission-requirements.ts';
import {
  getGameStateSchema,
  getGameHistorySchema,
  getPhaseResultHistorySchema,
  getSubmissionStatusSchema,
  acknowledgePhaseResultSchema,
} from './schema.ts';

// --- Get Game State ---
export const getGameState = authed
  .input(getGameStateSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const membership = await requireRoomMembershipForActor(input.roomId, actor);

    return getGameStateSnapshot(input.roomId, membership.id);
  });

// --- Get Game History ---
export const getGameHistory = authed
  .input(getGameHistorySchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    await requireRoomMembershipForActor(input.roomId, actor);

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
            .where(eq(gameOrderResultTable.orderId, orders[0]!.id));
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

// --- Get Phase Result History ---
export const getPhaseResultHistory = authed
  .input(getPhaseResultHistorySchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    await requireRoomMembershipForActor(input.roomId, actor);

    const results = await database
      .select({
        id: gamePhaseResultTable.id,
        turnNumber: gamePhaseResultTable.turnNumber,
        year: gamePhaseResultTable.year,
        season: gamePhaseResultTable.season,
        phase: gamePhaseResultTable.phase,
        payload: gamePhaseResultTable.payload,
        createdAt: gamePhaseResultTable.createdAt,
      })
      .from(gamePhaseResultTable)
      .where(eq(gamePhaseResultTable.roomId, input.roomId))
      .orderBy(gamePhaseResultTable.createdAt);

    return results.map((r) => ({
      ...r,
      payload: r.payload as GamePhaseResultPayload,
    }));
  });

// --- Get Submission Status ---
export const getSubmissionStatus = authed
  .input(getSubmissionStatusSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    await requireRoomMembershipForActor(input.roomId, actor);

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

    const requiredPowers = getPowersRequiringSubmission(turn, activePlayers);

    const requiredPowerSet = new Set(requiredPowers);
    let submittedPowers: Power[] = [];

    if (turn.phase === 'order_submission') {
      const orders = await database
        .select({ power: gameOrderTable.power })
        .from(gameOrderTable)
        .where(eq(gameOrderTable.turnId, turn.id));

      submittedPowers = [...new Set(orders.map((order) => order.power))].filter(
        (power): power is Power => requiredPowerSet.has(power as Power),
      );
    } else if (turn.phase === 'retreat_submission') {
      const retreats = await database
        .select({ power: gameRetreatTable.power })
        .from(gameRetreatTable)
        .where(eq(gameRetreatTable.turnId, turn.id));
      submittedPowers = [
        ...new Set(retreats.map((retreat) => retreat.power)),
      ].filter((power): power is Power => requiredPowerSet.has(power as Power));
    } else if (turn.phase === 'build_submission') {
      const builds = await database
        .select({ power: gameBuildTable.power })
        .from(gameBuildTable)
        .where(eq(gameBuildTable.turnId, turn.id));
      submittedPowers = [...new Set(builds.map((build) => build.power))].filter(
        (power): power is Power => requiredPowerSet.has(power as Power),
      );
    }

    return {
      phase: turn.phase,
      submitted: submittedPowers,
      pending: requiredPowers.filter((p) => !submittedPowers.includes(p)),
      allSubmitted: requiredPowers.every((p) => submittedPowers.includes(p)),
    };
  });

export const acknowledgePhaseResult = authed
  .input(acknowledgePhaseResultSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const phaseResult = await selectOne(
      database
        .select()
        .from(gamePhaseResultTable)
        .where(eq(gamePhaseResultTable.id, input.phaseResultId)),
    );

    if (!phaseResult) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Phase result not found',
      });
    }

    const membership = await requireRoomMembershipForActor(
      phaseResult.roomId,
      actor,
    );

    await database
      .insert(gamePhaseResultAckTable)
      .values({
        phaseResultId: phaseResult.id,
        playerId: membership.id,
      })
      .onConflictDoNothing();

    return { acknowledged: true };
  });
