import {
  describeBuildOrder,
  describeMainOrder,
  describeProvinceRef,
  describeRetreatOrder,
  getBuildAnnotations,
  getMainOrderAnnotations,
  getRetreatAnnotations,
  type BuildOrderDraft,
  type MainOrderDraft,
  type OrderAnnotation,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  BuildOrder,
  BuildResult,
  DislodgedUnit,
  GamePhase,
  Order,
  OrderResult,
  Power,
  RetreatOrder,
  RetreatResult,
  Season,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import {
  checkVictory,
  updateSupplyCenterOwnership,
} from '@/domain/game/game-logic.ts';

export type PhaseResultStatus = 'success' | 'failure' | 'info';

export type ResolvedSubmissionPhase =
  | 'order_submission'
  | 'retreat_submission'
  | 'build_submission';

export interface PhaseResultBoardSnapshot {
  positions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  dislodgedUnits: DislodgedUnit[];
}

export interface PhaseResultAnnotation extends OrderAnnotation {
  tone: PhaseResultStatus;
}

export interface PhaseResultItem {
  id: string;
  power: Power | null;
  summary: string;
  detail?: string;
  status: PhaseResultStatus;
}

export interface PhaseResultGroup {
  id: string;
  title: string;
  items: PhaseResultItem[];
}

export interface PhaseResultAlert {
  id: string;
  title: string;
  tone: 'warning' | 'danger' | 'info';
  items: PhaseResultItem[];
}

export interface GamePhaseResultPayload {
  turnNumber: number;
  season: Season;
  year: number;
  phase: ResolvedSubmissionPhase;
  headline: string;
  historicalNarration: string | null;
  winnerPower: Power | null;
  boardBefore: PhaseResultBoardSnapshot;
  boardAfter: PhaseResultBoardSnapshot;
  annotations: PhaseResultAnnotation[];
  alerts?: PhaseResultAlert[];
  groups: PhaseResultGroup[];
}

type TurnContext = {
  id: string;
  turnNumber: number;
  season: Season;
  year: number;
  phase: GamePhase;
  unitPositions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  dislodgedUnits: DislodgedUnit[];
};

function getPhaseHeadline(
  phase: ResolvedSubmissionPhase,
  season: Season,
  year: number,
): string {
  const prefix = season === 'spring' ? 'Spring' : 'Fall';
  if (phase === 'order_submission') {
    return `${prefix} ${year} orders resolved`;
  }

  if (phase === 'retreat_submission') {
    return `${prefix} ${year} retreats resolved`;
  }

  return `${prefix} ${year} adjustments resolved`;
}

function createGroups(
  items: PhaseResultItem[],
  titles: {
    success: string;
    failure: string;
    info: string;
  },
): PhaseResultGroup[] {
  const groups: PhaseResultGroup[] = [];
  const successful = items.filter((item) => item.status === 'success');
  const failed = items.filter((item) => item.status === 'failure');
  const informational = items.filter((item) => item.status === 'info');

  if (successful.length > 0) {
    groups.push({
      id: 'success',
      title: titles.success,
      items: successful,
    });
  }

  if (failed.length > 0) {
    groups.push({
      id: 'failure',
      title: titles.failure,
      items: failed,
    });
  }

  if (informational.length > 0) {
    groups.push({
      id: 'info',
      title: titles.info,
      items: informational,
    });
  }

  return groups;
}

function cloneBoardSnapshot(
  board: PhaseResultBoardSnapshot,
): PhaseResultBoardSnapshot {
  return {
    positions: { ...board.positions },
    supplyCenters: { ...board.supplyCenters },
    dislodgedUnits: board.dislodgedUnits.map((unit) => ({
      ...unit,
      retreatOptions: [...unit.retreatOptions],
    })),
  };
}

function buildBoardAfter(
  turn: TurnContext,
  resolvedPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
): PhaseResultBoardSnapshot {
  const boardAfter: PhaseResultBoardSnapshot = {
    positions: { ...resolvedPositions },
    supplyCenters: { ...turn.supplyCenters },
    dislodgedUnits: dislodgedUnits.map((unit) => ({
      ...unit,
      retreatOptions: [...unit.retreatOptions],
    })),
  };

  if (turn.phase === 'order_submission') {
    if (dislodgedUnits.length === 0) {
      boardAfter.dislodgedUnits = [];
      if (turn.season === 'fall') {
        boardAfter.supplyCenters = updateSupplyCenterOwnership(
          turn.supplyCenters,
          resolvedPositions,
        );
      }
    }

    return boardAfter;
  }

  boardAfter.dislodgedUnits = [];

  if (turn.phase === 'retreat_submission' && turn.season === 'fall') {
    boardAfter.supplyCenters = updateSupplyCenterOwnership(
      turn.supplyCenters,
      resolvedPositions,
    );
  }

  return boardAfter;
}

function createOrderBoardForDescriptions(
  turn: TurnContext,
): PhaseResultBoardSnapshot {
  return {
    positions: { ...turn.unitPositions },
    supplyCenters: { ...turn.supplyCenters },
    dislodgedUnits: turn.dislodgedUnits.map((unit) => ({
      ...unit,
      retreatOptions: [...unit.retreatOptions],
    })),
  };
}

function describeDislodgedUnit(
  unit: Pick<DislodgedUnit, 'province' | 'unitType'>,
) {
  const label = unit.unitType === 'army' ? 'Army' : 'Fleet';
  return `${label} in ${describeProvinceRef(unit.province)}`;
}

function createOrderPhaseAlerts(
  dislodgedUnits: DislodgedUnit[],
): PhaseResultAlert[] {
  const alerts: PhaseResultAlert[] = [];
  const retreatRequired = dislodgedUnits.filter(
    (unit) => unit.retreatOptions.length > 0,
  );
  const destroyedUnits = dislodgedUnits.filter(
    (unit) => unit.retreatOptions.length === 0,
  );

  if (retreatRequired.length > 0) {
    alerts.push({
      id: 'retreat-required',
      title:
        retreatRequired.length === 1 ? 'Retreat required' : 'Retreats required',
      tone: 'warning',
      items: retreatRequired.map((unit) => ({
        id: `retreat-${unit.power}-${unit.province}`,
        power: unit.power,
        summary: `${describeDislodgedUnit(unit)} must retreat`,
        detail: `Dislodged by ${describeProvinceRef(
          unit.dislodgedFrom,
        )}. Legal retreats: ${unit.retreatOptions
          .map(describeProvinceRef)
          .join(', ')}.`,
        status: 'info',
      })),
    });
  }

  if (destroyedUnits.length > 0) {
    alerts.push({
      id: 'destroyed',
      title: destroyedUnits.length === 1 ? 'Destroyed' : 'Destroyed units',
      tone: 'danger',
      items: destroyedUnits.map((unit) => ({
        id: `destroyed-${unit.power}-${unit.province}`,
        power: unit.power,
        summary: `${describeDislodgedUnit(unit)} is destroyed`,
        detail: `Dislodged by ${describeProvinceRef(
          unit.dislodgedFrom,
        )}. No legal retreat destinations remain.`,
        status: 'info',
      })),
    });
  }

  return alerts;
}

function mainOrderDraftFromOrder(order: Order): MainOrderDraft {
  return {
    unitProvince: order.unitProvince,
    orderType: order.orderType,
    targetProvince: order.targetProvince ?? null,
    supportedUnitProvince: order.supportedUnitProvince ?? null,
    viaConvoy: order.viaConvoy ?? false,
  };
}

function retreatDraftFromOrder(order: RetreatOrder): RetreatOrderDraft {
  return {
    unitProvince: order.unitProvince,
    retreatTo: order.retreatTo ?? null,
  };
}

function buildDraftFromOrder(order: BuildOrder): BuildOrderDraft {
  return {
    action: order.action,
    province: order.province,
    unitType: order.unitType ?? null,
    coast: order.coast ?? null,
  };
}

function mainOrderDetail(result: OrderResult): string {
  if (result.resultType === 'executed') {
    return 'Executed';
  }

  if (result.resultType === 'bounced') {
    return 'Rejected: bounced';
  }

  if (result.resultType === 'cut') {
    return 'Rejected: support was cut';
  }

  if (result.resultType === 'dislodged') {
    return result.dislodgedFrom
      ? `Rejected: dislodged from ${describeProvinceRef(result.dislodgedFrom)}`
      : 'Rejected: unit was dislodged';
  }

  if (result.resultType === 'void') {
    return 'Rejected: void order';
  }

  return 'Rejected: no valid order';
}

function retreatStatusDetail(
  result: RetreatResult['orderResults'][number],
): string {
  if (result.resultType === 'retreated') {
    return 'Retreated successfully';
  }

  if (result.reason) {
    return result.reason;
  }

  return result.resultType === 'disbanded' ? 'Disbanded' : 'Retreat failed';
}

function withRetreatUnits(
  positions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
): UnitPositions {
  const merged = { ...positions };

  for (const unit of dislodgedUnits) {
    merged[unit.province] = {
      power: unit.power,
      unitType: unit.unitType,
      coast: unit.coast ?? null,
    };
  }

  return merged;
}

export function buildOrderPhaseResultPayload(input: {
  turn: TurnContext;
  orders: Order[];
  orderResults: OrderResult[];
  resolvedPositions: UnitPositions;
  dislodgedUnits: DislodgedUnit[];
}): GamePhaseResultPayload {
  const boardBefore = createOrderBoardForDescriptions(input.turn);
  const boardAfter = buildBoardAfter(
    input.turn,
    input.resolvedPositions,
    input.dislodgedUnits,
  );

  const items = input.orderResults.map((result) => {
    const order = mainOrderDraftFromOrder(result.order);
    const summary = describeMainOrder(
      result.order.unitProvince,
      order,
      boardBefore.positions,
    );

    return {
      id: `${result.order.power}-${result.order.unitProvince}`,
      power: result.order.power,
      summary,
      detail: mainOrderDetail(result),
      status: result.success ? 'success' : 'failure',
    } satisfies PhaseResultItem;
  });

  const annotations = input.orderResults.flatMap((result) => {
    const drafts = {
      [result.order.unitProvince]: mainOrderDraftFromOrder(result.order),
    };
    return getMainOrderAnnotations(drafts, boardBefore.positions).map(
      (annotation) =>
        ({
          ...annotation,
          tone: result.success ? 'success' : 'failure',
        }) satisfies PhaseResultAnnotation,
    );
  });

  return {
    turnNumber: input.turn.turnNumber,
    season: input.turn.season,
    year: input.turn.year,
    phase: 'order_submission',
    headline: getPhaseHeadline(
      'order_submission',
      input.turn.season,
      input.turn.year,
    ),
    historicalNarration: null,
    winnerPower: checkVictory(boardAfter.supplyCenters),
    boardBefore: cloneBoardSnapshot(boardBefore),
    boardAfter: cloneBoardSnapshot(boardAfter),
    annotations,
    alerts: createOrderPhaseAlerts(input.dislodgedUnits),
    groups: createGroups(items, {
      success: 'Executed',
      failure: 'Rejected',
      info: 'Notes',
    }),
  };
}

export function buildRetreatPhaseResultPayload(input: {
  turn: TurnContext;
  retreats: RetreatOrder[];
  result: RetreatResult;
}): GamePhaseResultPayload {
  const boardBefore = createOrderBoardForDescriptions(input.turn);
  const positionsWithRetreaters = withRetreatUnits(
    boardBefore.positions,
    input.turn.dislodgedUnits,
  );
  const boardAfter = buildBoardAfter(input.turn, input.result.newPositions, []);

  const items = input.result.orderResults.map((result) => {
    const order = retreatDraftFromOrder(result.order);
    const status =
      result.resultType === 'retreated'
        ? 'success'
        : result.order.retreatTo
          ? 'failure'
          : 'info';

    return {
      id: `${result.order.power}-${result.order.unitProvince}`,
      power: result.order.power,
      summary: describeRetreatOrder(order, positionsWithRetreaters),
      detail: retreatStatusDetail(result),
      status,
    } satisfies PhaseResultItem;
  });

  const annotations = input.result.orderResults.flatMap((result) => {
    const drafts = {
      [result.order.unitProvince]: retreatDraftFromOrder(result.order),
    };

    return getRetreatAnnotations(drafts, positionsWithRetreaters).map(
      (annotation) =>
        ({
          ...annotation,
          tone:
            result.resultType === 'retreated'
              ? 'success'
              : result.order.retreatTo
                ? 'failure'
                : 'info',
        }) satisfies PhaseResultAnnotation,
    );
  });

  return {
    turnNumber: input.turn.turnNumber,
    season: input.turn.season,
    year: input.turn.year,
    phase: 'retreat_submission',
    headline: getPhaseHeadline(
      'retreat_submission',
      input.turn.season,
      input.turn.year,
    ),
    historicalNarration: null,
    winnerPower: checkVictory(boardAfter.supplyCenters),
    boardBefore: cloneBoardSnapshot(boardBefore),
    boardAfter: cloneBoardSnapshot(boardAfter),
    annotations,
    groups: createGroups(items, {
      success: 'Successful retreats',
      failure: 'Rejected retreats',
      info: 'Disbanded',
    }),
  };
}

export function buildBuildPhaseResultPayload(input: {
  turn: TurnContext;
  builds: BuildOrder[];
  result: BuildResult;
}): GamePhaseResultPayload {
  const boardBefore = createOrderBoardForDescriptions(input.turn);
  const boardAfter = buildBoardAfter(input.turn, input.result.newPositions, []);

  const executedKeys = new Set(
    input.result.executed.map(
      (order) =>
        `${order.action}:${order.province}:${order.unitType ?? 'none'}:${order.coast ?? 'none'}`,
    ),
  );
  const failedReasonByKey = new Map(
    input.result.failed.map(({ order, reason }) => [
      `${order.action}:${order.province}:${order.unitType ?? 'none'}:${order.coast ?? 'none'}`,
      reason,
    ]),
  );

  const items = input.builds.map((build, index) => {
    const key = `${build.action}:${build.province}:${build.unitType ?? 'none'}:${build.coast ?? 'none'}`;
    const isWaive = build.action === 'waive';
    const status = isWaive
      ? 'info'
      : executedKeys.has(key)
        ? 'success'
        : 'failure';
    const detail = isWaive
      ? 'Build waived'
      : executedKeys.has(key)
        ? 'Executed'
        : (failedReasonByKey.get(key) ?? 'Rejected');

    return {
      id: `${build.power}-${build.province}-${index}`,
      power: build.power,
      summary: describeBuildOrder(buildDraftFromOrder(build)),
      detail,
      status,
    } satisfies PhaseResultItem;
  });

  const annotations = input.builds.flatMap((build) => {
    if (build.action === 'waive') {
      return [];
    }

    const status = executedKeys.has(
      `${build.action}:${build.province}:${build.unitType ?? 'none'}:${build.coast ?? 'none'}`,
    )
      ? 'success'
      : 'failure';

    return getBuildAnnotations(
      [buildDraftFromOrder(build)],
      boardBefore.positions,
    ).map(
      (annotation) =>
        ({
          ...annotation,
          tone: status,
        }) satisfies PhaseResultAnnotation,
    );
  });

  return {
    turnNumber: input.turn.turnNumber,
    season: input.turn.season,
    year: input.turn.year,
    phase: 'build_submission',
    headline: getPhaseHeadline(
      'build_submission',
      input.turn.season,
      input.turn.year,
    ),
    historicalNarration: null,
    winnerPower: checkVictory(boardAfter.supplyCenters),
    boardBefore: cloneBoardSnapshot(boardBefore),
    boardAfter: cloneBoardSnapshot(boardAfter),
    annotations,
    groups: createGroups(items, {
      success: 'Executed adjustments',
      failure: 'Rejected adjustments',
      info: 'Waived builds',
    }),
  };
}

export function selectPendingPhaseResult<
  T extends { id: string; createdAt: Date },
>(
  phaseResults: T[],
  acknowledgedIds: Set<string>,
  joinedAt: Date | null,
): T | null {
  for (const phaseResult of phaseResults) {
    if (joinedAt && phaseResult.createdAt < joinedAt) {
      continue;
    }

    if (!acknowledgedIds.has(phaseResult.id)) {
      return phaseResult;
    }
  }

  return null;
}
