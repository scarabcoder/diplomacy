import { ORPCError } from '@orpc/client';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  botTable,
  gameBuildTable,
  gameOrderTable,
  gamePlayerTable,
  gamePhaseResultAckTable,
  gamePhaseResultTable,
  gameRetreatTable,
  gameRoomTable,
  gameTurnTable,
} from '@/database/schema/game-schema.ts';
import { userTable } from '@/database/schema/auth-schema.ts';
import { getBotActivities } from '@/domain/bot/brain/bot-activity.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import type { GamePhaseResultPayload } from '@/domain/game/phase-results.ts';
import { selectPendingPhaseResult } from '@/domain/game/phase-results.ts';
import type {
  DislodgedUnit,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';

export async function getRoomDataSnapshot(roomId: string) {
  const room = await selectOne(
    database.select().from(gameRoomTable).where(eq(gameRoomTable.id, roomId)),
  );

  if (!room) {
    throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
  }

  const rawPlayers = await database
    .select({
      ...getTableColumns(gamePlayerTable),
      userDisplayName: userTable.name,
      botDisplayName: botTable.name,
    })
    .from(gamePlayerTable)
    .leftJoin(userTable, eq(gamePlayerTable.userId, userTable.id))
    .leftJoin(botTable, eq(gamePlayerTable.botId, botTable.id))
    .where(eq(gamePlayerTable.roomId, room.id))
    .orderBy(gamePlayerTable.joinedAt);

  const botPlayerIds = rawPlayers
    .filter((p) => p.botId != null)
    .map((p) => p.id);
  const botActivities = getBotActivities(botPlayerIds);

  const players = rawPlayers.map((player) => ({
    ...player,
    isBot: player.botId != null,
    displayName:
      player.userDisplayName ?? player.botDisplayName ?? 'Unknown player',
    activityTagline: botActivities.get(player.id) ?? null,
  }));

  let currentTurn = null;
  if (room.currentTurnId) {
    currentTurn = await selectOne(
      database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, room.currentTurnId)),
    );
  }

  return { room, players, currentTurn: currentTurn ?? null };
}

export type RoomDataSnapshot = Awaited<ReturnType<typeof getRoomDataSnapshot>>;

export async function getGameStateSnapshot(
  roomId: string,
  currentPlayerId: string | null,
) {
  const room = await selectOne(
    database.select().from(gameRoomTable).where(eq(gameRoomTable.id, roomId)),
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
      pendingPhaseResult: null,
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
      pendingPhaseResult: null,
    };
  }

  const currentPlayer = currentPlayerId
    ? await selectOne(
        database
          .select()
          .from(gamePlayerTable)
          .where(
            and(
              eq(gamePlayerTable.roomId, roomId),
              eq(gamePlayerTable.id, currentPlayerId),
            ),
          ),
      )
    : null;

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
    .filter((player) => player.power && player.status === 'active')
    .map((player) => player.power!);

  let submitted: string[] = [];
  let pending: string[] = [];
  let mySubmission:
    | {
        phase: 'order_submission';
        orders: Array<typeof gameOrderTable.$inferSelect>;
      }
    | {
        phase: 'retreat_submission';
        retreats: Array<typeof gameRetreatTable.$inferSelect>;
      }
    | {
        phase: 'build_submission';
        builds: Array<typeof gameBuildTable.$inferSelect>;
      }
    | null = null;

  if (turn.phase === 'order_submission') {
    const orders = await database
      .select()
      .from(gameOrderTable)
      .where(eq(gameOrderTable.turnId, turn.id));

    submitted = [...new Set(orders.map((order) => order.power))];
    pending = activePowers.filter((power) => !submitted.includes(power));

    if (currentPlayer?.power) {
      const myOrders = orders.filter(
        (order) => order.power === currentPlayer.power,
      );
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

    if (currentPlayer?.power) {
      const myRetreats = retreats.filter(
        (retreat) => retreat.power === currentPlayer.power,
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
      .filter(
        (count) => count.count !== 0 && activePowers.includes(count.power),
      )
      .map((count) => count.power);
    const builds = await database
      .select()
      .from(gameBuildTable)
      .where(eq(gameBuildTable.turnId, turn.id));

    submitted = [...new Set(builds.map((build) => build.power))];
    pending = buildPowers.filter((power) => !submitted.includes(power));

    if (currentPlayer?.power) {
      const myBuilds = builds.filter(
        (build) => build.power === currentPlayer.power,
      );
      if (myBuilds.length > 0) {
        mySubmission = {
          phase: 'build_submission',
          builds: myBuilds,
        };
      }
    }
  }

  let buildCounts = null;
  if (turn.phase === 'build_submission') {
    buildCounts = calculateBuildCounts(
      turn.unitPositions as UnitPositions,
      turn.supplyCenters as SupplyCenterOwnership,
    );
  }

  let pendingPhaseResult: {
    id: string;
    roomId: string;
    turnId: string;
    turnNumber: number;
    season: 'spring' | 'fall';
    year: number;
    phase: string;
    createdAt: Date;
    payload: GamePhaseResultPayload;
  } | null = null;

  if (currentPlayer) {
    const [phaseResults, acknowledgedResults] = await Promise.all([
      database
        .select()
        .from(gamePhaseResultTable)
        .where(eq(gamePhaseResultTable.roomId, roomId))
        .orderBy(gamePhaseResultTable.createdAt),
      database
        .select({ phaseResultId: gamePhaseResultAckTable.phaseResultId })
        .from(gamePhaseResultAckTable)
        .where(eq(gamePhaseResultAckTable.playerId, currentPlayer.id)),
    ]);

    const pending = selectPendingPhaseResult(
      phaseResults,
      new Set(acknowledgedResults.map((ack) => ack.phaseResultId)),
      currentPlayer.joinedAt,
    );

    if (pending) {
      pendingPhaseResult = {
        ...pending,
        phase: pending.phase,
        season: pending.season as 'spring' | 'fall',
        payload: pending.payload as GamePhaseResultPayload,
      };
    }
  }

  return {
    room,
    turn: {
      ...turn,
      unitPositions: turn.unitPositions as UnitPositions,
      supplyCenters: turn.supplyCenters as SupplyCenterOwnership,
      dislodgedUnits: (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [],
    },
    submissionStatus: {
      submitted,
      pending,
    },
    buildCounts,
    mySubmission,
    pendingPhaseResult,
  };
}

export type GameStateSnapshot = Awaited<
  ReturnType<typeof getGameStateSnapshot>
>;

export async function getRoomPageStateSnapshot(
  roomId: string,
  currentPlayerId: string | null,
) {
  const [roomData, gameState] = await Promise.all([
    getRoomDataSnapshot(roomId),
    getGameStateSnapshot(roomId, currentPlayerId),
  ]);

  return { roomData, gameState };
}

export type RoomPageStateSnapshot = Awaited<
  ReturnType<typeof getRoomPageStateSnapshot>
>;
