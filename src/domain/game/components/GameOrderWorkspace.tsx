import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button.tsx';
import { orpcUtils } from '@/rpc/react.ts';
import {
  canSupportHold,
  describeBuildOrder,
  describeMainOrder,
  describeProvinceRef,
  describeRetreatOrder,
  findDislodgedUnit,
  getBuildAnnotations,
  getBuildChoices,
  getCoastalDestinationsForFleetArmy,
  getConvoyMoveTargets,
  getConvoyableArmyProvincesForFleet,
  getDefaultWaiveProvince,
  getEligibleBuildProvinces,
  getMainOrderAnnotations,
  getMoveTargets,
  getRetreatAnnotations,
  getSupportMoveTargets,
  getSupportableUnitProvinces,
  type BuildOrderDraft,
  type MainOrderDraft,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import {
  type BuildCount,
  type DislodgedUnit,
  type GamePhase,
  type Power,
  type SupplyCenterOwnership,
  type UnitPositions,
} from '@/domain/game/engine/types.ts';
import { DiplomacyMap } from './DiplomacyMap.tsx';

type GameTurnState = {
  id: string;
  season: 'spring' | 'fall';
  year: number;
  phase: GamePhase;
  unitPositions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  dislodgedUnits: DislodgedUnit[];
};

type SubmissionStatus = {
  submitted: string[];
  pending: string[];
};

type MainSubmissionRecord = {
  unitProvince: string;
  orderType: 'hold' | 'move' | 'support' | 'convoy';
  targetProvince: string | null;
  supportedUnitProvince: string | null;
  viaConvoy: boolean;
};

type RetreatSubmissionRecord = {
  unitProvince: string;
  retreatTo: string | null;
};

type BuildSubmissionRecord = {
  action: 'build' | 'disband' | 'waive';
  province: string;
  unitType: 'army' | 'fleet' | null;
  coast: string | null;
};

type MySubmission =
  | {
      phase: 'order_submission';
      orders: MainSubmissionRecord[];
    }
  | {
      phase: 'retreat_submission';
      retreats: RetreatSubmissionRecord[];
    }
  | {
      phase: 'build_submission';
      builds: BuildSubmissionRecord[];
    }
  | null;

type MainInteraction =
  | { kind: 'idle' }
  | { kind: 'unit'; province: string }
  | { kind: 'move'; province: string; viaConvoy: boolean }
  | { kind: 'support-unit'; province: string }
  | { kind: 'support-target'; province: string; supportedUnitProvince: string }
  | { kind: 'convoy-unit'; province: string }
  | { kind: 'convoy-target'; province: string; supportedUnitProvince: string };

type RetreatInteraction =
  | { kind: 'idle' }
  | { kind: 'unit'; province: string };

type BuildInteraction =
  | { kind: 'idle' }
  | { kind: 'site'; province: string }
  | { kind: 'disband'; province: string };

function createDefaultMainOrders(
  positions: UnitPositions,
  myPower: Power | null,
  mySubmission: MySubmission,
): Record<string, MainOrderDraft> {
  const drafts: Record<string, MainOrderDraft> = {};

  for (const [province, unit] of Object.entries(positions)) {
    if (unit.power !== myPower) {
      continue;
    }

    drafts[province] = {
      unitProvince: province,
      orderType: 'hold',
      targetProvince: null,
      supportedUnitProvince: null,
      viaConvoy: false,
    };
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

function createDefaultRetreatOrders(
  dislodgedUnits: DislodgedUnit[],
  myPower: Power | null,
  mySubmission: MySubmission,
): Record<string, RetreatOrderDraft> {
  const drafts: Record<string, RetreatOrderDraft> = {};

  for (const unit of dislodgedUnits) {
    if (unit.power !== myPower) {
      continue;
    }

    drafts[unit.province] = {
      unitProvince: unit.province,
      retreatTo: null,
    };
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

function createDefaultBuildOrders(mySubmission: MySubmission): BuildOrderDraft[] {
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

function formatPhase(phase: GamePhase): string {
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function WorkspacePanel({
  children,
  mobile,
}: {
  children: React.ReactNode;
  mobile?: boolean;
}) {
  return (
    <div
      className={
        mobile
          ? 'pointer-events-auto rounded-t-3xl border-t border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur'
          : 'pointer-events-auto w-[23rem] rounded-3xl border border-black/10 bg-white/90 p-4 shadow-2xl backdrop-blur'
      }
    >
      {children}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

export function GameOrderWorkspace({
  roomId,
  roomName,
  roomCode,
  turn,
  submissionStatus,
  buildCounts,
  myPower,
  isSpectator,
  mySubmission,
  onSubmitted,
}: {
  roomId: string;
  roomName: string;
  roomCode: string;
  turn: GameTurnState;
  submissionStatus: SubmissionStatus | null;
  buildCounts: BuildCount[] | null;
  myPower: Power | null;
  isSpectator: boolean;
  mySubmission: MySubmission;
  onSubmitted: () => void;
}) {
  const positions = turn.unitPositions;
  const supplyCenters = turn.supplyCenters;
  const myUnits = Object.entries(positions)
    .filter(([_, unit]) => unit.power === myPower)
    .map(([province]) => province);
  const myDislodgedUnits = turn.dislodgedUnits.filter((unit) => unit.power === myPower);
  const myBuildCount = buildCounts?.find((count) => count.power === myPower) ?? null;
  const needsRetreatOrders = turn.phase === 'retreat_submission' && myDislodgedUnits.length > 0;
  const needsBuildOrders = turn.phase === 'build_submission' && !!myBuildCount && myBuildCount.count !== 0;
  const hasPersistedSubmission =
    (mySubmission?.phase === 'order_submission' && mySubmission.orders.length > 0)
    || (mySubmission?.phase === 'retreat_submission' && mySubmission.retreats.length > 0)
    || (mySubmission?.phase === 'build_submission' && mySubmission.builds.length > 0);
  const submissionSignature = JSON.stringify(mySubmission);
  const resetKeyRef = useRef<string>('');

  const [didSubmit, setDidSubmit] = useState(false);
  const [mainOrders, setMainOrders] = useState<Record<string, MainOrderDraft>>(() =>
    createDefaultMainOrders(positions, myPower, mySubmission),
  );
  const [retreatOrders, setRetreatOrders] = useState<Record<string, RetreatOrderDraft>>(() =>
    createDefaultRetreatOrders(turn.dislodgedUnits, myPower, mySubmission),
  );
  const [buildOrders, setBuildOrders] = useState<BuildOrderDraft[]>(() =>
    createDefaultBuildOrders(mySubmission),
  );
  const [mainInteraction, setMainInteraction] = useState<MainInteraction>({ kind: 'idle' });
  const [retreatInteraction, setRetreatInteraction] = useState<RetreatInteraction>({ kind: 'idle' });
  const [buildInteraction, setBuildInteraction] = useState<BuildInteraction>({ kind: 'idle' });

  const submitOrdersMutation = useMutation(
    orpcUtils.order.submitOrders.mutationOptions(),
  );
  const submitRetreatsMutation = useMutation(
    orpcUtils.order.submitRetreats.mutationOptions(),
  );
  const submitBuildsMutation = useMutation(
    orpcUtils.order.submitBuilds.mutationOptions(),
  );

  useEffect(() => {
    const resetKey = `${turn.id}:${turn.phase}:${myPower ?? 'spectator'}:${submissionSignature}`;
    if (resetKeyRef.current === resetKey) {
      return;
    }

    resetKeyRef.current = resetKey;
    setDidSubmit(false);
    setMainOrders(createDefaultMainOrders(positions, myPower, mySubmission));
    setRetreatOrders(createDefaultRetreatOrders(turn.dislodgedUnits, myPower, mySubmission));
    setBuildOrders(createDefaultBuildOrders(mySubmission));
    setMainInteraction({ kind: 'idle' });
    setRetreatInteraction({ kind: 'idle' });
    setBuildInteraction({ kind: 'idle' });
  }, [myPower, mySubmission, positions, submissionSignature, turn.dislodgedUnits, turn.id, turn.phase]);

  const isLocked = didSubmit || hasPersistedSubmission;
  const activeMutation =
    turn.phase === 'order_submission'
      ? submitOrdersMutation
      : turn.phase === 'retreat_submission'
        ? submitRetreatsMutation
        : submitBuildsMutation;
  const getMainDraft = (province: string): MainOrderDraft => (
    mainOrders[province] ?? {
      unitProvince: province,
      orderType: 'hold',
      targetProvince: null,
      supportedUnitProvince: null,
      viaConvoy: false,
    }
  );
  const getRetreatDraft = (province: string): RetreatOrderDraft => (
    retreatOrders[province] ?? {
      unitProvince: province,
      retreatTo: null,
    }
  );

  const commitMainOrder = (province: string, order: Partial<MainOrderDraft>) => {
    setMainOrders((previous) => ({
      ...previous,
      [province]: {
        ...previous[province],
        unitProvince: province,
        orderType: 'hold',
        targetProvince: null,
        supportedUnitProvince: null,
        viaConvoy: false,
        ...order,
      },
    }));
    setMainInteraction({ kind: 'unit', province });
  };

  const resetMainOrder = (province: string) => {
    commitMainOrder(province, {
      orderType: 'hold',
      targetProvince: null,
      supportedUnitProvince: null,
      viaConvoy: false,
    });
  };

  const selectedMainProvince =
    mainInteraction.kind === 'idle' ? null : mainInteraction.province;
  const mainValidTargets =
    mainInteraction.kind === 'move'
      ? mainInteraction.viaConvoy
        ? getConvoyMoveTargets(mainInteraction.province, positions)
        : getMoveTargets(mainInteraction.province, positions)
      : mainInteraction.kind === 'support-target'
        ? getSupportMoveTargets(
            mainInteraction.province,
            mainInteraction.supportedUnitProvince,
            positions,
          )
        : mainInteraction.kind === 'convoy-target'
          ? getCoastalDestinationsForFleetArmy(
              mainInteraction.province,
              mainInteraction.supportedUnitProvince,
              positions,
            )
          : [];
  const highlightedMainUnits =
    mainInteraction.kind === 'support-unit'
      ? getSupportableUnitProvinces(mainInteraction.province, positions)
      : mainInteraction.kind === 'convoy-unit'
        ? getConvoyableArmyProvincesForFleet(mainInteraction.province, positions)
        : [];

  const selectMainUnit = (province: string) => {
    if (isLocked || !myPower || positions[province]?.power !== myPower) {
      return;
    }

    setMainInteraction({ kind: 'unit', province });
  };

  const handleMainUnitClick = (province: string) => {
    if (isLocked || !myPower) {
      return;
    }

    if (mainInteraction.kind === 'support-unit') {
      const supportedUnits = getSupportableUnitProvinces(mainInteraction.province, positions);
      if (supportedUnits.includes(province)) {
        setMainInteraction({
          kind: 'support-target',
          province: mainInteraction.province,
          supportedUnitProvince: province,
        });
        return;
      }
    }

    if (mainInteraction.kind === 'convoy-unit') {
      const armies = getConvoyableArmyProvincesForFleet(mainInteraction.province, positions);
      if (armies.includes(province)) {
        setMainInteraction({
          kind: 'convoy-target',
          province: mainInteraction.province,
          supportedUnitProvince: province,
        });
        return;
      }
    }

    selectMainUnit(province);
  };

  const handleMainProvinceClick = (provinceRef: string) => {
    if (isLocked || !myPower) {
      return;
    }

    if (mainInteraction.kind === 'move' && mainValidTargets.includes(provinceRef)) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'move',
        targetProvince: provinceRef,
        supportedUnitProvince: null,
        viaConvoy: mainInteraction.viaConvoy,
      });
      return;
    }

    if (
      mainInteraction.kind === 'support-target'
      && mainValidTargets.includes(provinceRef)
    ) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'support',
        targetProvince: provinceRef,
        supportedUnitProvince: mainInteraction.supportedUnitProvince,
        viaConvoy: false,
      });
      return;
    }

    if (
      mainInteraction.kind === 'convoy-target'
      && mainValidTargets.includes(provinceRef)
    ) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'convoy',
        targetProvince: provinceRef,
        supportedUnitProvince: mainInteraction.supportedUnitProvince,
        viaConvoy: false,
      });
      return;
    }

    const province = PROVINCES[provinceRef] ? provinceRef : provinceRef.split('/')[0] ?? provinceRef;
    if (positions[province]?.power === myPower) {
      selectMainUnit(province);
    }
  };

  const handleRetreatUnitClick = (province: string) => {
    if (isLocked || !needsRetreatOrders) {
      return;
    }

    if (myDislodgedUnits.some((unit) => unit.province === province)) {
      setRetreatInteraction({ kind: 'unit', province });
    }
  };

  const handleRetreatProvinceClick = (provinceRef: string) => {
    if (isLocked || retreatInteraction.kind !== 'unit') {
      return;
    }

    const unit = findDislodgedUnit(turn.dislodgedUnits, retreatInteraction.province);
    if (!unit) {
      return;
    }

    if (unit.retreatOptions.includes(provinceRef)) {
      setRetreatOrders((previous) => ({
        ...previous,
        [retreatInteraction.province]: {
          unitProvince: retreatInteraction.province,
          retreatTo: provinceRef,
        },
      }));
    }
  };

  const upsertBuild = (build: BuildOrderDraft) => {
    setBuildOrders((previous) => {
      const withoutCurrent = previous.filter(
        (existing) => existing.province !== build.province,
      );
      const buildLimit = myBuildCount?.count ?? 0;
      if (build.action === 'build' && buildLimit > 0 && withoutCurrent.length >= buildLimit) {
        return previous;
      }

      return [...withoutCurrent, build];
    });
  };

  const handleBuildUnitClick = (province: string) => {
    if (isLocked || !myBuildCount || myBuildCount.count >= 0) {
      return;
    }

    if (positions[province]?.power !== myPower) {
      return;
    }

    setBuildOrders((previous) => {
      const exists = previous.some(
        (build) => build.action === 'disband' && build.province === province,
      );
      if (exists) {
        return previous.filter((build) => build.province !== province);
      }

      return [
        ...previous,
        {
          action: 'disband',
          province,
          unitType: positions[province]?.unitType ?? null,
          coast: positions[province]?.coast ?? null,
        },
      ];
    });
    setBuildInteraction({ kind: 'disband', province });
  };

  const handleBuildProvinceClick = (provinceRef: string) => {
    if (isLocked || !myBuildCount || myBuildCount.count <= 0) {
      return;
    }

    const province = provinceRef.split('/')[0] ?? provinceRef;
    const eligible = getEligibleBuildProvinces(myPower as Power, myBuildCount);
    if (!eligible.includes(province)) {
      return;
    }

    setBuildInteraction({ kind: 'site', province });
  };

  const mainAnnotations = getMainOrderAnnotations(mainOrders, positions);
  const retreatAnnotations = getRetreatAnnotations(retreatOrders, positions);
  const buildAnnotations = getBuildAnnotations(buildOrders, positions);

  const activeAnnotations =
    turn.phase === 'order_submission'
      ? mainAnnotations
      : turn.phase === 'retreat_submission'
        ? retreatAnnotations
        : buildAnnotations;

  const activeSelectedUnit =
    turn.phase === 'order_submission'
      ? selectedMainProvince
      : turn.phase === 'retreat_submission'
        ? retreatInteraction.kind === 'unit'
          ? retreatInteraction.province
          : null
        : buildInteraction.kind === 'disband'
          ? buildInteraction.province
          : null;

  const activeSelectedProvince =
    turn.phase === 'build_submission' && buildInteraction.kind === 'site'
      ? buildInteraction.province
      : null;

  const activeHighlightedUnits =
    turn.phase === 'order_submission'
      ? highlightedMainUnits
      : turn.phase === 'retreat_submission'
        ? myDislodgedUnits.map((unit) => unit.province)
        : myBuildCount && myBuildCount.count < 0
          ? myUnits
          : [];

  const activeValidTargets =
    turn.phase === 'order_submission'
      ? mainValidTargets
      : turn.phase === 'retreat_submission'
        ? retreatInteraction.kind === 'unit'
          ? findDislodgedUnit(turn.dislodgedUnits, retreatInteraction.province)?.retreatOptions ?? []
          : []
        : myBuildCount && myBuildCount.count > 0
          ? getEligibleBuildProvinces(myPower as Power, myBuildCount)
          : [];

  const positiveBuildCount = myBuildCount && myBuildCount.count > 0 ? myBuildCount.count : 0;
  const disbandsRequired = myBuildCount && myBuildCount.count < 0 ? Math.abs(myBuildCount.count) : 0;
  const currentPositiveBuilds = buildOrders.filter((build) => build.action === 'build');
  const currentDisbands = buildOrders.filter((build) => build.action === 'disband');
  const remainingBuilds = Math.max(0, positiveBuildCount - currentPositiveBuilds.length);
  const canSubmitBuilds =
    myBuildCount?.count == null
      ? false
      : myBuildCount.count > 0
        ? true
        : currentDisbands.length === disbandsRequired;
  const canSubmitCurrentPhase =
    !isLocked
    && !isSpectator
    && !!myPower
    && (turn.phase === 'order_submission'
      || (turn.phase === 'retreat_submission' && needsRetreatOrders)
      || (turn.phase === 'build_submission' && needsBuildOrders && canSubmitBuilds));

  const submissionSummary =
    submissionStatus && (
      <div className="mt-2 text-sm text-white/80">
        <span className="font-medium text-white">Submitted:</span>{' '}
        {submissionStatus.submitted.length > 0
          ? submissionStatus.submitted.map(capitalize).join(', ')
          : 'None'}
        {submissionStatus.pending.length > 0 ? (
          <>
            {' '}
            <span className="mx-1 text-white/40">&middot;</span>
            <span className="font-medium text-white">Waiting:</span>{' '}
            {submissionStatus.pending.map(capitalize).join(', ')}
          </>
        ) : null}
      </div>
    );

  const handleSubmit = async () => {
    if (!myPower || isLocked) {
      return;
    }

    if (turn.phase === 'order_submission') {
      const orders = myUnits.map((province) => {
        const draft = mainOrders[province];
        return {
          unitProvince: province,
          orderType: draft?.orderType ?? 'hold',
          targetProvince: draft?.targetProvince ?? undefined,
          supportedUnitProvince: draft?.supportedUnitProvince ?? undefined,
          viaConvoy: draft?.viaConvoy || undefined,
        };
      });

      await submitOrdersMutation.mutateAsync({ roomId, orders });
    } else if (turn.phase === 'retreat_submission') {
      const retreats = myDislodgedUnits.map((unit) => ({
        unitProvince: unit.province,
        retreatTo: retreatOrders[unit.province]?.retreatTo ?? null,
      }));
      await submitRetreatsMutation.mutateAsync({ roomId, retreats });
    } else if (turn.phase === 'build_submission' && myBuildCount) {
      const builds =
        myBuildCount.count > 0
          ? [
              ...currentPositiveBuilds.map((build) => ({
                action: 'build' as const,
                unitType: build.unitType ?? undefined,
                province: build.province,
                coast: build.coast ?? undefined,
              })),
              ...Array.from({ length: remainingBuilds }, () => ({
                action: 'waive' as const,
                province: getDefaultWaiveProvince(myPower),
              })),
            ]
          : currentDisbands.map((build) => ({
              action: 'disband' as const,
              province: build.province,
              unitType: build.unitType ?? undefined,
              coast: build.coast ?? undefined,
            }));

      await submitBuildsMutation.mutateAsync({ roomId, builds });
    }

    setDidSubmit(true);
    onSubmitted();
  };

  const renderMainActionBody = () => {
    if (isSpectator || !myPower) {
      return <p className="text-sm text-muted-foreground">Spectators can inspect the board but cannot submit orders.</p>;
    }

    if (isLocked) {
      return <p className="text-sm text-muted-foreground">Orders submitted. Waiting for the rest of the board.</p>;
    }

    if (mainInteraction.kind === 'idle') {
      return <p className="text-sm text-muted-foreground">Select one of your units to draft its order directly on the map.</p>;
    }

    const unit = positions[mainInteraction.province];
    if (!unit) {
      return null;
    }

    const convoyTargets = getConvoyMoveTargets(mainInteraction.province, positions);
    const convoyableArmies = getConvoyableArmyProvincesForFleet(mainInteraction.province, positions);

    if (mainInteraction.kind === 'unit') {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm">
            {describeMainOrder(mainInteraction.province, getMainDraft(mainInteraction.province), positions)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => resetMainOrder(mainInteraction.province)}>
              Hold
            </Button>
            <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'move', province: mainInteraction.province, viaConvoy: false })}>
              Move
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={convoyTargets.length === 0 || unit.unitType !== 'army'}
              onClick={() =>
                setMainInteraction({
                  kind: 'move',
                  province: mainInteraction.province,
                  viaConvoy: true,
                })
              }
            >
              Via Convoy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMainInteraction({ kind: 'support-unit', province: mainInteraction.province })}
            >
              Support
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={unit.unitType !== 'fleet' || PROVINCES[mainInteraction.province]?.type !== 'water' || convoyableArmies.length === 0}
              onClick={() => setMainInteraction({ kind: 'convoy-unit', province: mainInteraction.province })}
            >
              Convoy
            </Button>
            <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'idle' })}>
              Done
            </Button>
          </div>
        </div>
      );
    }

    if (mainInteraction.kind === 'move') {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select a {mainInteraction.viaConvoy ? 'convoy destination' : 'destination'} for{' '}
            {describeProvinceRef(mainInteraction.province)}.
          </p>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {mainValidTargets.length > 0
              ? mainValidTargets.map(describeProvinceRef).join(', ')
              : 'No legal destinations available.'}
          </div>
          <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'unit', province: mainInteraction.province })}>
            Back
          </Button>
        </div>
      );
    }

    if (mainInteraction.kind === 'support-unit') {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select any unit that {describeProvinceRef(mainInteraction.province)} can support.
          </p>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {highlightedMainUnits.length > 0
              ? highlightedMainUnits.map(describeProvinceRef).join(', ')
              : 'No support targets available.'}
          </div>
          <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'unit', province: mainInteraction.province })}>
            Back
          </Button>
        </div>
      );
    }

    if (mainInteraction.kind === 'support-target') {
      const canHold = canSupportHold(
        mainInteraction.province,
        mainInteraction.supportedUnitProvince,
        positions,
      );

      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Supporting {describeProvinceRef(mainInteraction.supportedUnitProvince)} from{' '}
            {describeProvinceRef(mainInteraction.province)}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={!canHold}
              onClick={() =>
                commitMainOrder(mainInteraction.province, {
                  orderType: 'support',
                  targetProvince: null,
                  supportedUnitProvince: mainInteraction.supportedUnitProvince,
                  viaConvoy: false,
                })
              }
            >
              Support Hold
            </Button>
            <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'support-unit', province: mainInteraction.province })}>
              Change Unit
            </Button>
          </div>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {mainValidTargets.length > 0
              ? `Support move to: ${mainValidTargets.map(describeProvinceRef).join(', ')}`
              : 'No support-move destinations available.'}
          </div>
          <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'unit', province: mainInteraction.province })}>
            Cancel
          </Button>
        </div>
      );
    }

    if (mainInteraction.kind === 'convoy-unit') {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select an army for {describeProvinceRef(mainInteraction.province)} to convoy.
          </p>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {highlightedMainUnits.length > 0
              ? highlightedMainUnits.map(describeProvinceRef).join(', ')
              : 'No convoyable armies available.'}
          </div>
          <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'unit', province: mainInteraction.province })}>
            Back
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Select a convoy destination for {describeProvinceRef(mainInteraction.supportedUnitProvince)}.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {mainValidTargets.length > 0
            ? mainValidTargets.map(describeProvinceRef).join(', ')
            : 'No convoy destinations available.'}
        </div>
        <Button type="button" variant="outline" onClick={() => setMainInteraction({ kind: 'convoy-unit', province: mainInteraction.province })}>
          Back
        </Button>
      </div>
    );
  };

  const renderRetreatActionBody = () => {
    if (isSpectator || !myPower) {
      return <p className="text-sm text-muted-foreground">Spectators can inspect the board but cannot submit orders.</p>;
    }

    if (!needsRetreatOrders) {
      return <p className="text-sm text-muted-foreground">You have no units to retreat this phase.</p>;
    }

    if (isLocked) {
      return <p className="text-sm text-muted-foreground">Retreats submitted. Waiting for the board to resolve.</p>;
    }

    if (retreatInteraction.kind === 'idle') {
      return <p className="text-sm text-muted-foreground">Select one of your dislodged units, then choose a retreat destination on the map or disband it.</p>;
    }

    const selectedUnit = findDislodgedUnit(turn.dislodgedUnits, retreatInteraction.province);
    if (!selectedUnit) {
      return null;
    }

    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {describeRetreatOrder(getRetreatDraft(retreatInteraction.province), positions)}
        </div>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {selectedUnit.retreatOptions.length > 0
            ? selectedUnit.retreatOptions.map(describeProvinceRef).join(', ')
            : 'No legal retreat destinations.'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() =>
              setRetreatOrders((previous) => ({
                ...previous,
                [retreatInteraction.province]: {
                  unitProvince: retreatInteraction.province,
                  retreatTo: null,
                },
              }))
            }
          >
            Disband
          </Button>
          <Button type="button" variant="outline" onClick={() => setRetreatInteraction({ kind: 'idle' })}>
            Done
          </Button>
        </div>
      </div>
    );
  };

  const renderBuildActionBody = () => {
    if (isSpectator || !myPower) {
      return <p className="text-sm text-muted-foreground">Spectators can inspect the board but cannot submit orders.</p>;
    }

    if (!needsBuildOrders || !myBuildCount) {
      return <p className="text-sm text-muted-foreground">You have no build or disband decisions this phase.</p>;
    }

    if (isLocked) {
      return <p className="text-sm text-muted-foreground">Build submission locked. Waiting for the phase to resolve.</p>;
    }

    if (myBuildCount.count < 0) {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select {disbandsRequired} unit{disbandsRequired === 1 ? '' : 's'} to disband.
          </p>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {currentDisbands.length > 0
              ? currentDisbands.map(describeBuildOrder).join(', ')
              : 'No units selected yet.'}
          </div>
        </div>
      );
    }

    if (buildInteraction.kind !== 'site') {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select one of your eligible home centers to place a new unit.
          </p>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            {getEligibleBuildProvinces(myPower, myBuildCount).map(describeProvinceRef).join(', ')}
          </div>
        </div>
      );
    }

    const choices = getBuildChoices(buildInteraction.province);
    const currentBuild = currentPositiveBuilds.find(
      (build) => build.province === buildInteraction.province,
    );

    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Choose what to build in {describeProvinceRef(buildInteraction.province)}.
        </p>
        <div className="grid gap-2">
          {choices.map((choice) => (
            <Button
              key={`${choice.unitType}-${choice.coast ?? 'base'}`}
              type="button"
              variant="outline"
              onClick={() =>
                upsertBuild({
                  action: 'build',
                  province: buildInteraction.province,
                  unitType: choice.unitType,
                  coast: choice.coast,
                })
              }
            >
              {choice.unitType === 'army'
                ? 'Army'
                : `Fleet${choice.coast ? ` (${choice.coast.toUpperCase()})` : ''}`}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!currentBuild}
            onClick={() =>
              setBuildOrders((previous) =>
                previous.filter((build) => build.province !== buildInteraction.province),
              )
            }
          >
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={() => setBuildInteraction({ kind: 'idle' })}>
            Done
          </Button>
        </div>
      </div>
    );
  };

  const renderActionBody =
    turn.phase === 'order_submission'
      ? renderMainActionBody()
      : turn.phase === 'retreat_submission'
        ? renderRetreatActionBody()
        : renderBuildActionBody();

  const summaryLines =
    turn.phase === 'order_submission'
      ? myUnits.map((province) => describeMainOrder(province, getMainDraft(province), positions))
      : turn.phase === 'retreat_submission'
        ? myDislodgedUnits.map((unit) =>
            describeRetreatOrder(getRetreatDraft(unit.province), positions),
          )
        : buildOrders.length > 0
          ? buildOrders.map(describeBuildOrder)
          : remainingBuilds > 0
            ? Array.from({ length: remainingBuilds }, () => 'Waive')
            : [];

  const renderSummary = () => (
    <div className="space-y-3">
      <SectionTitle
        title="Submission"
        subtitle={
          turn.phase === 'build_submission' && myBuildCount
            ? myBuildCount.count > 0
              ? `${currentPositiveBuilds.length}/${positiveBuildCount} builds placed`
              : `${currentDisbands.length}/${disbandsRequired} disbands selected`
            : undefined
        }
      />
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {summaryLines.length > 0 ? (
          summaryLines.map((line, index) => (
            <div key={`${line}-${index}`} className="text-sm">
              {line}
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">No submission required for your power in this phase.</div>
        )}
      </div>
      {activeMutation.isError ? (
        <p className="text-sm text-destructive">{activeMutation.error.message}</p>
      ) : null}
      {isLocked ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Submitted.
        </div>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={!canSubmitCurrentPhase || activeMutation.isPending}
          onClick={handleSubmit}
        >
          {activeMutation.isPending ? 'Submitting...' : 'Submit'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="relative h-screen overflow-hidden bg-[#e7dfc8] text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
        <div className="pointer-events-auto rounded-[2rem] border border-white/15 bg-[#111827]/88 px-5 py-4 text-white shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link to="/" className="text-xs uppercase tracking-[0.2em] text-white/60 transition hover:text-white">
                Back
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold">{roomName}</h1>
                <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm tracking-[0.22em]">
                  {roomCode}
                </span>
              </div>
              <div className="mt-2 text-sm text-white/80">
                {turn.season === 'spring' ? 'Spring' : 'Fall'} {turn.year} · {formatPhase(turn.phase)}
                {myPower ? ` · ${capitalize(myPower)}` : ''}
                {isSpectator ? ' · Spectating' : ''}
              </div>
              {submissionSummary}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pt-28">
        <DiplomacyMap
          positions={positions}
          supplyCenters={supplyCenters}
          selectedProvince={activeSelectedProvince}
          selectedUnitProvince={activeSelectedUnit}
          validTargets={activeValidTargets}
          highlightedUnitProvinces={activeHighlightedUnits}
          annotations={activeAnnotations}
          onProvinceClick={
            turn.phase === 'order_submission'
              ? handleMainProvinceClick
              : turn.phase === 'retreat_submission'
                ? handleRetreatProvinceClick
                : handleBuildProvinceClick
          }
          onUnitClick={
            turn.phase === 'order_submission'
              ? handleMainUnitClick
              : turn.phase === 'retreat_submission'
                ? handleRetreatUnitClick
                : handleBuildUnitClick
          }
        />
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 hidden gap-4 sm:flex">
        <WorkspacePanel>
          <SectionTitle
            title="Action"
            subtitle={
              turn.phase === 'order_submission'
                ? selectedMainProvince
                  ? describeProvinceRef(selectedMainProvince)
                  : 'Select a unit'
                : turn.phase === 'retreat_submission'
                  ? retreatInteraction.kind === 'unit'
                    ? describeProvinceRef(retreatInteraction.province)
                    : 'Select a dislodged unit'
                  : buildInteraction.kind === 'site'
                    ? describeProvinceRef(buildInteraction.province)
                    : 'Select a build site or unit'
            }
          />
          {renderActionBody}
          <div className="mt-5 border-t border-black/10 pt-4">
            {renderSummary()}
          </div>
        </WorkspacePanel>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 sm:hidden">
        <WorkspacePanel mobile>
          <div className="mb-2 mx-auto h-1.5 w-12 rounded-full bg-black/10" />
          <SectionTitle
            title="Action"
            subtitle={
              turn.phase === 'order_submission'
                ? selectedMainProvince
                  ? describeProvinceRef(selectedMainProvince)
                  : 'Select a unit'
                : turn.phase === 'retreat_submission'
                  ? retreatInteraction.kind === 'unit'
                    ? describeProvinceRef(retreatInteraction.province)
                    : 'Select a dislodged unit'
                  : buildInteraction.kind === 'site'
                    ? describeProvinceRef(buildInteraction.province)
                    : 'Select a build site or unit'
            }
          />
          <div className="max-h-[42vh] overflow-y-auto pb-2">
            {renderActionBody}
            <div className="mt-5 border-t border-black/10 pt-4">
              {renderSummary()}
            </div>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
