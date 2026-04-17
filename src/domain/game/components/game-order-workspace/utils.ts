import type {
  BuildOrderDraft,
  MainOrderDraft,
  RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  BuildCount,
  DislodgedUnit,
  GamePhase,
  PlayerStatus,
  Power,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import { POWERS } from '@/domain/game/engine/types.ts';
import type {
  BuildProgressState,
  MainDraftMap,
  MySubmission,
  PlayersWindowEntry,
  PlayersWindowSections,
  RetreatDraftMap,
  RoomPlayerSummary,
  SubmissionStatus,
} from './types.ts';
import { getPowerLabel } from '@/domain/game/power-presentation.tsx';

export function createDefaultMainOrders(
  positions: UnitPositions,
  myPower: Power | null,
  mySubmission: MySubmission,
): MainDraftMap {
  const drafts: MainDraftMap = {};

  for (const [province, unit] of Object.entries(positions)) {
    if (unit.power !== myPower) {
      continue;
    }

    drafts[province] = createEmptyMainOrder(province);
  }

  if (mySubmission?.phase === 'order_submission') {
    for (const order of mySubmission.orders) {
      drafts[order.unitProvince] = {
        unitProvince: order.unitProvince,
        orderType: order.orderType,
        targetProvince: order.targetProvince,
        supportedUnitProvince: order.supportedUnitProvince,
        viaConvoy: order.viaConvoy,
      };
    }
  }

  return drafts;
}

export function createDefaultRetreatOrders(
  dislodgedUnits: DislodgedUnit[],
  myPower: Power | null,
  mySubmission: MySubmission,
): RetreatDraftMap {
  const drafts: RetreatDraftMap = {};

  for (const unit of dislodgedUnits) {
    if (unit.power !== myPower) {
      continue;
    }

    drafts[unit.province] = createEmptyRetreatOrder(unit.province);
  }

  if (mySubmission?.phase === 'retreat_submission') {
    for (const retreat of mySubmission.retreats) {
      drafts[retreat.unitProvince] = {
        unitProvince: retreat.unitProvince,
        retreatTo: retreat.retreatTo,
      };
    }
  }

  return drafts;
}

export function createDefaultBuildOrders(
  mySubmission: MySubmission,
): BuildOrderDraft[] {
  if (mySubmission?.phase !== 'build_submission') {
    return [];
  }

  return mySubmission.builds.map((build) => ({
    action: build.action,
    province: build.province,
    unitType: build.unitType,
    coast: build.coast,
  }));
}

export function createEmptyMainOrder(province: string): MainOrderDraft {
  return {
    unitProvince: province,
    orderType: 'hold',
    targetProvince: null,
    supportedUnitProvince: null,
    viaConvoy: false,
  };
}

export function createEmptyRetreatOrder(province: string): RetreatOrderDraft {
  return {
    unitProvince: province,
    retreatTo: null,
  };
}

export function formatPhase(phase: GamePhase): string {
  const map: Record<GamePhase, string> = {
    order_submission: 'Order Submission',
    order_resolution: 'Resolving Orders',
    retreat_submission: 'Retreat Phase',
    retreat_resolution: 'Resolving Retreats',
    build_submission: 'Build / Disband Phase',
    build_resolution: 'Resolving Builds',
  };

  return map[phase];
}

export function formatPlayerStatus(status: PlayerStatus): string {
  const labels: Record<PlayerStatus, string> = {
    active: 'Active',
    civil_disorder: 'Civil Disorder',
    eliminated: 'Eliminated',
  };

  return labels[status];
}

export function buildPlayersWindowSections({
  players,
  submissionStatus,
  phase,
  myUserId,
}: {
  players: RoomPlayerSummary[];
  submissionStatus: SubmissionStatus | null;
  phase: GamePhase;
  myUserId: string | null;
}): PlayersWindowSections {
  const shouldShowSubmissionState =
    phase === 'order_submission' ||
    phase === 'retreat_submission' ||
    phase === 'build_submission';
  const submittedPowers = new Set(submissionStatus?.submitted ?? []);
  const pendingPowers = new Set(submissionStatus?.pending ?? []);
  const powerOrder = new Map(
    POWERS.map((power, index) => [power, index] as const),
  );

  const rosterEntries = players.map((player) => {
    const submissionState: PlayersWindowEntry['submissionState'] =
      shouldShowSubmissionState && !player.isSpectator && player.power
        ? submittedPowers.has(player.power)
          ? 'submitted'
          : pendingPowers.has(player.power)
            ? 'pending'
            : null
        : null;

    return {
      ...player,
      isCurrentUser: player.userId === myUserId,
      powerLabel: player.isSpectator
        ? 'Spectator'
        : player.power
          ? getPowerLabel(player.power)
          : 'Unassigned',
      submissionState,
    };
  });

  const activePlayers = rosterEntries
    .filter((player) => !player.isSpectator)
    .sort((left, right) => {
      const leftSubmissionOrder =
        left.submissionState === 'pending'
          ? 0
          : left.submissionState === 'submitted'
            ? 1
            : 2;
      const rightSubmissionOrder =
        right.submissionState === 'pending'
          ? 0
          : right.submissionState === 'submitted'
            ? 1
            : 2;

      if (leftSubmissionOrder !== rightSubmissionOrder) {
        return leftSubmissionOrder - rightSubmissionOrder;
      }

      const leftPowerOrder = left.power
        ? (powerOrder.get(left.power) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const rightPowerOrder = right.power
        ? (powerOrder.get(right.power) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      if (leftPowerOrder !== rightPowerOrder) {
        return leftPowerOrder - rightPowerOrder;
      }

      return left.displayName.localeCompare(right.displayName);
    });

  const spectators = rosterEntries
    .filter((player) => player.isSpectator)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    activePlayers,
    spectators,
  };
}

export function getBuildProgressState(
  myBuildCount: BuildCount | null,
  buildOrders: BuildOrderDraft[],
): BuildProgressState {
  if (!myBuildCount || myBuildCount.count === 0) {
    return null;
  }

  const builds = buildOrders.filter((build) => build.action === 'build');
  const disbands = buildOrders.filter((build) => build.action === 'disband');
  const armies = builds.filter((build) => build.unitType === 'army').length;
  const fleets = builds.filter((build) => build.unitType === 'fleet').length;

  if (myBuildCount.count > 0) {
    return {
      mode: 'build',
      total: myBuildCount.count,
      completed: builds.length,
      remaining: Math.max(0, myBuildCount.count - builds.length),
      armies,
      fleets,
      builds,
      disbands,
    };
  }

  const total = Math.abs(myBuildCount.count);

  return {
    mode: 'disband',
    total,
    completed: disbands.length,
    remaining: Math.max(0, total - disbands.length),
    armies,
    fleets,
    builds,
    disbands,
  };
}
