import { eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import {
  gameRoomTable,
  gameTurnTable,
  gamePlayerTable,
} from '@/database/schema/game-schema.ts';
import { selectOne } from '@/database/helpers.ts';
import type {
  UnitPositions,
  SupplyCenterOwnership,
  DislodgedUnit,
  Power,
} from '@/domain/game/engine/types.ts';
import {
  SUPPLY_CENTERS,
  countSupplyCenters,
} from '@/domain/game/engine/map-data.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import {
  archiveConversationsForCompletedRoom,
  archiveConversationsForEliminatedPlayers,
} from '@/domain/message/archive.ts';

const VICTORY_THRESHOLD = 18;

/**
 * Check if any power has achieved victory (18+ supply centers).
 */
export function checkVictory(
  supplyCenters: SupplyCenterOwnership,
): Power | null {
  const counts = countSupplyCenters(supplyCenters);
  for (const [power, count] of Object.entries(counts)) {
    if (count >= VICTORY_THRESHOLD) {
      return power as Power;
    }
  }
  return null;
}

/**
 * Update supply center ownership based on current unit positions.
 * A supply center changes ownership when a unit occupies it at the end of a Fall turn.
 */
export function updateSupplyCenterOwnership(
  currentOwnership: SupplyCenterOwnership,
  positions: UnitPositions,
): SupplyCenterOwnership {
  const newOwnership = { ...currentOwnership };

  for (const sc of SUPPLY_CENTERS) {
    const unit = positions[sc];
    if (unit) {
      newOwnership[sc] = unit.power;
    }
    // If no unit occupies the SC, ownership doesn't change
  }

  return newOwnership;
}

/**
 * Advance the game to the next phase/turn after resolution.
 * Returns the new turn data, or null if the game is over.
 */
export async function advancePhase(
  roomId: string,
  currentTurnId: string,
  resolvedPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
): Promise<void> {
  const currentTurn = await selectOne(
    database
      .select()
      .from(gameTurnTable)
      .where(eq(gameTurnTable.id, currentTurnId)),
  );

  if (!currentTurn) return;

  const { season, phase } = currentTurn;
  const supplyCenters = currentTurn.supplyCenters as SupplyCenterOwnership;

  // Mark current turn/phase as complete
  await database
    .update(gameTurnTable)
    .set({
      isComplete: true,
      resolvedAt: new Date(),
      unitPositions: resolvedPositions,
      updatedAt: new Date(),
    })
    .where(eq(gameTurnTable.id, currentTurnId));

  // Determine next phase
  if (phase === 'order_submission' || phase === 'order_resolution') {
    if (dislodgedUnits.length > 0) {
      // Enter retreat phase
      await createNextPhase(
        roomId,
        currentTurn.turnNumber,
        currentTurn.year,
        season,
        'retreat_submission',
        resolvedPositions,
        supplyCenters,
        dislodgedUnits,
      );
      return;
    }

    // No retreats needed
    if (season === 'fall') {
      await handleEndOfFall(
        roomId,
        currentTurn.turnNumber,
        currentTurn.year,
        resolvedPositions,
        supplyCenters,
      );
      return;
    }

    // Spring with no retreats — advance to Fall
    await createNextTurn(
      roomId,
      currentTurn.turnNumber + 1,
      currentTurn.year,
      'fall',
      resolvedPositions,
      supplyCenters,
    );
    return;
  }

  if (phase === 'retreat_submission' || phase === 'retreat_resolution') {
    if (season === 'fall') {
      await handleEndOfFall(
        roomId,
        currentTurn.turnNumber,
        currentTurn.year,
        resolvedPositions,
        supplyCenters,
      );
      return;
    }

    // Spring retreat done — advance to Fall
    await createNextTurn(
      roomId,
      currentTurn.turnNumber + 1,
      currentTurn.year,
      'fall',
      resolvedPositions,
      supplyCenters,
    );
    return;
  }

  if (phase === 'build_submission' || phase === 'build_resolution') {
    // Build phase done — check victory, then advance to next Spring
    const updatedOwnership = currentTurn.supplyCenters as SupplyCenterOwnership;
    const winner = checkVictory(updatedOwnership);

    if (winner) {
      await endGame(roomId, winner);
      return;
    }

    await createNextTurn(
      roomId,
      currentTurn.turnNumber + 1,
      currentTurn.year + 1,
      'spring',
      resolvedPositions,
      updatedOwnership,
    );
    return;
  }
}

async function handleEndOfFall(
  roomId: string,
  currentTurnNumber: number,
  year: number,
  positions: UnitPositions,
  currentSupplyCenters: SupplyCenterOwnership,
): Promise<void> {
  // Update supply center ownership
  const newOwnership = updateSupplyCenterOwnership(
    currentSupplyCenters,
    positions,
  );

  // Check victory
  const winner = checkVictory(newOwnership);
  if (winner) {
    await endGame(roomId, winner);
    return;
  }

  // Check if any power needs to build or disband
  const buildCounts = calculateBuildCounts(positions, newOwnership);
  const needsBuildPhase = buildCounts.some((bc) => bc.count !== 0);

  // Update player supply center counts
  await updatePlayerSupplyCounts(roomId, newOwnership);

  if (needsBuildPhase) {
    await createNextPhase(
      roomId,
      currentTurnNumber,
      year,
      'fall',
      'build_submission',
      positions,
      newOwnership,
      null,
    );
    return;
  }

  // No builds needed — advance to next Spring
  await createNextTurn(
    roomId,
    currentTurnNumber + 1,
    year + 1,
    'spring',
    positions,
    newOwnership,
  );
}

async function createNextTurn(
  roomId: string,
  turnNumber: number,
  year: number,
  season: 'spring' | 'fall',
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
): Promise<void> {
  const [turn] = await database
    .insert(gameTurnTable)
    .values({
      roomId,
      turnNumber,
      year,
      season,
      phase: 'order_submission',
      unitPositions: positions,
      supplyCenters,
    })
    .returning();

  await database
    .update(gameRoomTable)
    .set({ currentTurnId: turn!.id, updatedAt: new Date() })
    .where(eq(gameRoomTable.id, roomId));

  // Notify bots of the new submission phase
  import('@/domain/bot/brain/bot-triggers.ts').then(({ onPhaseChanged }) => {
    onPhaseChanged(roomId, 'order_submission');
  });
}

async function createNextPhase(
  roomId: string,
  currentTurnNumber: number,
  year: number,
  season: 'spring' | 'fall',
  phase: 'retreat_submission' | 'build_submission',
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  dislodgedUnits: DislodgedUnit[] | null,
): Promise<void> {
  // We reuse the same turn number but create a new turn record for the new phase
  // This keeps each phase as its own snapshot
  const [turn] = await database
    .insert(gameTurnTable)
    .values({
      roomId,
      turnNumber: currentTurnNumber,
      year,
      season,
      phase,
      unitPositions: positions,
      supplyCenters,
      dislodgedUnits,
    })
    .onConflictDoUpdate({
      target: [gameTurnTable.roomId, gameTurnTable.turnNumber],
      set: {
        phase,
        unitPositions: positions,
        supplyCenters,
        dislodgedUnits,
        isComplete: false,
        resolvedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await database
    .update(gameRoomTable)
    .set({ currentTurnId: turn!.id, updatedAt: new Date() })
    .where(eq(gameRoomTable.id, roomId));

  // Notify bots of the new submission phase
  import('@/domain/bot/brain/bot-triggers.ts').then(({ onPhaseChanged }) => {
    onPhaseChanged(roomId, phase);
  });
}

async function updatePlayerSupplyCounts(
  roomId: string,
  supplyCenters: SupplyCenterOwnership,
): Promise<void> {
  const counts = countSupplyCenters(supplyCenters);
  const players = await database
    .select()
    .from(gamePlayerTable)
    .where(eq(gamePlayerTable.roomId, roomId));

  const eliminatedPlayerIds: string[] = [];

  for (const player of players) {
    if (player.power && !player.isSpectator) {
      const count = counts[player.power] ?? 0;
      const shouldEliminate = count === 0 && player.status !== 'eliminated';

      await database
        .update(gamePlayerTable)
        .set({
          supplyCenterCount: count,
          status: count === 0 ? 'eliminated' : player.status,
        })
        .where(eq(gamePlayerTable.id, player.id));

      if (shouldEliminate) {
        eliminatedPlayerIds.push(player.id);
      }
    }
  }

  await archiveConversationsForEliminatedPlayers(roomId, eliminatedPlayerIds);
}

async function endGame(roomId: string, winnerPower: Power): Promise<void> {
  const players = await database
    .select()
    .from(gamePlayerTable)
    .where(eq(gamePlayerTable.roomId, roomId));

  const winnerPlayer = players.find((p) => p.power === winnerPower);

  await database
    .update(gameRoomTable)
    .set({
      status: 'completed',
      winnerPlayerId: winnerPlayer?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(gameRoomTable.id, roomId));

  await archiveConversationsForCompletedRoom(roomId);
}
