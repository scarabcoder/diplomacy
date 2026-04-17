import type {
  gamePlayerTable,
  gameTurnTable,
} from '@/database/schema/game-schema.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import type {
  DislodgedUnit,
  Power,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';

type SubmissionPlayer = Pick<
  typeof gamePlayerTable.$inferSelect,
  'power' | 'status' | 'isSpectator'
>;

type SubmissionTurn = Pick<
  typeof gameTurnTable.$inferSelect,
  'phase' | 'unitPositions' | 'dislodgedUnits' | 'supplyCenters'
>;

export function getActivePowers(players: SubmissionPlayer[]): Power[] {
  return players
    .filter(
      (player): player is SubmissionPlayer & { power: Power } =>
        !player.isSpectator &&
        player.status === 'active' &&
        player.power != null,
    )
    .map((player) => player.power);
}

export function getPowersRequiringSubmission(
  turn: SubmissionTurn,
  players: SubmissionPlayer[],
): Power[] {
  const activePowers = getActivePowers(players);
  if (activePowers.length === 0) {
    return [];
  }

  if (turn.phase === 'order_submission') {
    const powersWithUnits = new Set<Power>(
      Object.values(turn.unitPositions as UnitPositions).map(
        (unit) => unit.power,
      ),
    );

    return activePowers.filter((power) => powersWithUnits.has(power));
  }

  if (turn.phase === 'retreat_submission') {
    const retreatPowers = new Set<Power>(
      ((turn.dislodgedUnits as DislodgedUnit[] | null) ?? []).map(
        (unit) => unit.power,
      ),
    );

    return activePowers.filter((power) => retreatPowers.has(power));
  }

  if (turn.phase === 'build_submission') {
    const buildCounts = calculateBuildCounts(
      turn.unitPositions as UnitPositions,
      turn.supplyCenters as SupplyCenterOwnership,
    );
    const activePowerSet = new Set(activePowers);

    return buildCounts
      .filter((count) => count.count !== 0 && activePowerSet.has(count.power))
      .map((count) => count.power);
  }

  return [];
}
