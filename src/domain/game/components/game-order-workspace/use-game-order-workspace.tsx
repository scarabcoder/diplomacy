import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Castle,
  Check,
  CircleCheck,
  Clock,
  HandHelping,
  ScrollText,
  Shield,
  Ship,
  ShipWheel,
  Trash2,
  Undo2,
} from 'lucide-react';
import { orpcUtils } from '@/rpc/react.ts';
import {
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
import { resolveProvinceTargetClick } from '@/domain/game/lib/province-refs.ts';
import {
  PowerName,
  joinInlineMeta,
} from '@/domain/game/power-presentation.tsx';
import { BattleshipTokenIcon, TankTokenIcon } from '../unit-token-icons.tsx';
import type {
  BuildInteraction,
  FlyoutContent,
  FlyoutPanel,
  GameOrderWorkspaceProps,
  HeaderStatusChipData,
  MainInteraction,
  RetreatInteraction,
  ToolbarAction,
} from './types.ts';
import {
  buildPlayersWindowSections,
  createDefaultBuildOrders,
  createDefaultMainOrders,
  createDefaultRetreatOrders,
  createEmptyMainOrder,
  createEmptyRetreatOrder,
  formatPhase,
  getBuildProgressState,
} from './utils.ts';

export function useGameOrderWorkspace({
  roomId,
  players,
  turn,
  submissionStatus,
  buildCounts,
  myUserId,
  myPower,
  isSpectator,
  mySubmission,
  onSubmitted,
}: GameOrderWorkspaceProps) {
  const positions = turn.unitPositions;
  const supplyCenters = turn.supplyCenters;
  const myUnits = Object.entries(positions)
    .filter(([_, unit]) => unit.power === myPower)
    .map(([province]) => province);
  const myDislodgedUnits = turn.dislodgedUnits.filter(
    (unit) => unit.power === myPower,
  );
  const myBuildCount =
    buildCounts?.find((count) => count.power === myPower) ?? null;
  const needsRetreatOrders =
    turn.phase === 'retreat_submission' && myDislodgedUnits.length > 0;
  const needsBuildOrders =
    turn.phase === 'build_submission' &&
    !!myBuildCount &&
    myBuildCount.count !== 0;
  const hasPersistedSubmission =
    (mySubmission?.phase === 'order_submission' &&
      mySubmission.orders.length > 0) ||
    (mySubmission?.phase === 'retreat_submission' &&
      mySubmission.retreats.length > 0) ||
    (mySubmission?.phase === 'build_submission' &&
      mySubmission.builds.length > 0);
  const submissionSignature = JSON.stringify(mySubmission);
  const resetKeyRef = useRef<string>('');

  const [didSubmit, setDidSubmit] = useState(false);
  const [mainOrders, setMainOrders] = useState(() =>
    createDefaultMainOrders(positions, myPower, mySubmission),
  );
  const [retreatOrders, setRetreatOrders] = useState(() =>
    createDefaultRetreatOrders(turn.dislodgedUnits, myPower, mySubmission),
  );
  const [buildOrders, setBuildOrders] = useState(() =>
    createDefaultBuildOrders(mySubmission),
  );
  const [mainInteraction, setMainInteraction] = useState<MainInteraction>({
    kind: 'idle',
  });
  const [retreatInteraction, setRetreatInteraction] =
    useState<RetreatInteraction>({ kind: 'idle' });
  const [buildInteraction, setBuildInteraction] = useState<BuildInteraction>({
    kind: 'idle',
  });
  const [activeFlyout, setActiveFlyout] = useState<FlyoutPanel>(null);
  const [isPlayersWindowOpen, setIsPlayersWindowOpen] = useState(false);
  const [buildChoiceMode, setBuildChoiceMode] = useState<
    'army' | 'fleet' | null
  >(null);

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
    setRetreatOrders(
      createDefaultRetreatOrders(turn.dislodgedUnits, myPower, mySubmission),
    );
    setBuildOrders(createDefaultBuildOrders(mySubmission));
    setMainInteraction({ kind: 'idle' });
    setRetreatInteraction({ kind: 'idle' });
    setBuildInteraction({ kind: 'idle' });
    setActiveFlyout(null);
    setIsPlayersWindowOpen(false);
    setBuildChoiceMode(null);
  }, [
    myPower,
    mySubmission,
    positions,
    submissionSignature,
    turn.dislodgedUnits,
    turn.id,
    turn.phase,
  ]);

  const isLocked = didSubmit || hasPersistedSubmission;
  const activeMutation =
    turn.phase === 'order_submission'
      ? submitOrdersMutation
      : turn.phase === 'retreat_submission'
        ? submitRetreatsMutation
        : submitBuildsMutation;
  const getMainDraft = (province: string): MainOrderDraft =>
    mainOrders[province] ?? createEmptyMainOrder(province);
  const getRetreatDraft = (province: string): RetreatOrderDraft =>
    retreatOrders[province] ?? createEmptyRetreatOrder(province);

  const commitMainOrder = (
    province: string,
    order: Partial<MainOrderDraft>,
  ) => {
    setMainOrders((previous) => ({
      ...previous,
      [province]: {
        ...createEmptyMainOrder(province),
        ...previous[province],
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
        ? getConvoyableArmyProvincesForFleet(
            mainInteraction.province,
            positions,
          )
        : [];

  const selectMainUnit = (province: string) => {
    if (isLocked || !myPower || positions[province]?.power !== myPower) {
      return;
    }

    setMainInteraction({ kind: 'unit', province });
    setActiveFlyout(null);
  };

  const handleMainUnitClick = (province: string) => {
    if (isLocked || !myPower) {
      return;
    }

    if (mainInteraction.kind === 'support-unit') {
      const supportedUnits = getSupportableUnitProvinces(
        mainInteraction.province,
        positions,
      );
      if (supportedUnits.includes(province)) {
        setMainInteraction({
          kind: 'support-target',
          province: mainInteraction.province,
          supportedUnitProvince: province,
        });
        setActiveFlyout('action');
        return;
      }
    }

    if (mainInteraction.kind === 'convoy-unit') {
      const armies = getConvoyableArmyProvincesForFleet(
        mainInteraction.province,
        positions,
      );
      if (armies.includes(province)) {
        setMainInteraction({
          kind: 'convoy-target',
          province: mainInteraction.province,
          supportedUnitProvince: province,
        });
        setActiveFlyout('action');
        return;
      }
    }

    selectMainUnit(province);
  };

  const handleMainProvinceClick = (provinceRef: string) => {
    if (isLocked || !myPower) {
      return;
    }

    const resolvedProvinceRef = resolveProvinceTargetClick(
      mainValidTargets,
      provinceRef,
    );

    if (mainInteraction.kind === 'move' && resolvedProvinceRef) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'move',
        targetProvince: resolvedProvinceRef,
        supportedUnitProvince: null,
        viaConvoy: mainInteraction.viaConvoy,
      });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'support-target' && resolvedProvinceRef) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'support',
        targetProvince: resolvedProvinceRef,
        supportedUnitProvince: mainInteraction.supportedUnitProvince,
        viaConvoy: false,
      });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'convoy-target' && resolvedProvinceRef) {
      commitMainOrder(mainInteraction.province, {
        orderType: 'convoy',
        targetProvince: resolvedProvinceRef,
        supportedUnitProvince: mainInteraction.supportedUnitProvince,
        viaConvoy: false,
      });
      setActiveFlyout('action');
      return;
    }

    const province = PROVINCES[provinceRef]
      ? provinceRef
      : (provinceRef.split('/')[0] ?? provinceRef);
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
      setActiveFlyout(null);
    }
  };

  const handleRetreatProvinceClick = (provinceRef: string) => {
    if (isLocked || retreatInteraction.kind !== 'unit') {
      return;
    }

    const unit = findDislodgedUnit(
      turn.dislodgedUnits,
      retreatInteraction.province,
    );
    if (!unit) {
      return;
    }

    const resolvedProvinceRef = resolveProvinceTargetClick(
      unit.retreatOptions,
      provinceRef,
    );

    if (resolvedProvinceRef) {
      setRetreatOrders((previous) => ({
        ...previous,
        [retreatInteraction.province]: {
          unitProvince: retreatInteraction.province,
          retreatTo: resolvedProvinceRef,
        },
      }));
      setActiveFlyout('action');
    }
  };

  const upsertBuild = (build: BuildOrderDraft) => {
    setBuildOrders((previous) => {
      const withoutCurrent = previous.filter(
        (existing) => existing.province !== build.province,
      );
      const buildLimit = myBuildCount?.count ?? 0;
      if (
        build.action === 'build' &&
        buildLimit > 0 &&
        withoutCurrent.length >= buildLimit
      ) {
        return previous;
      }

      return [...withoutCurrent, build];
    });
    setBuildChoiceMode(null);
    setActiveFlyout('action');
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
    setBuildChoiceMode(null);
    setActiveFlyout(null);
  };

  const eligibleBuildProvinces =
    isSpectator || !myPower || !myBuildCount || myBuildCount.count <= 0
      ? []
      : getEligibleBuildProvinces(myPower, myBuildCount);

  const handleBuildProvinceClick = (provinceRef: string) => {
    if (isLocked || !myBuildCount || myBuildCount.count <= 0) {
      return;
    }

    const province = provinceRef.split('/')[0] ?? provinceRef;
    if (!eligibleBuildProvinces.includes(province)) {
      return;
    }

    setBuildInteraction({ kind: 'site', province });
    setBuildChoiceMode(null);
    setActiveFlyout('action');
  };

  const isOrderSubmission = turn.phase === 'order_submission';
  const isRetreatSubmission = turn.phase === 'retreat_submission';
  const isBuildSubmission = turn.phase === 'build_submission';

  const mainAnnotations = getMainOrderAnnotations(mainOrders, positions);
  const retreatAnnotations = getRetreatAnnotations(retreatOrders, positions);
  const buildAnnotations = getBuildAnnotations(buildOrders, positions);

  const activeAnnotations = isOrderSubmission
    ? mainAnnotations
    : isRetreatSubmission
      ? retreatAnnotations
      : isBuildSubmission
        ? buildAnnotations
        : [];

  const activeSelectedUnit = isOrderSubmission
    ? selectedMainProvince
    : isRetreatSubmission
      ? retreatInteraction.kind === 'unit'
        ? retreatInteraction.province
        : null
      : isBuildSubmission && buildInteraction.kind === 'disband'
        ? buildInteraction.province
        : null;

  const activeSelectedProvince =
    isBuildSubmission && buildInteraction.kind === 'site'
      ? buildInteraction.province
      : null;

  const activeHighlightedUnits = isOrderSubmission
    ? highlightedMainUnits
    : isRetreatSubmission
      ? myDislodgedUnits.map((unit) => unit.province)
      : isBuildSubmission && myBuildCount && myBuildCount.count < 0
        ? myUnits
        : [];

  const activeValidTargets = isOrderSubmission
    ? mainValidTargets
    : isRetreatSubmission
      ? retreatInteraction.kind === 'unit'
        ? (findDislodgedUnit(turn.dislodgedUnits, retreatInteraction.province)
            ?.retreatOptions ?? [])
        : []
      : isBuildSubmission && myBuildCount && myBuildCount.count > 0
        ? eligibleBuildProvinces
        : [];

  const buildProgress = getBuildProgressState(myBuildCount, buildOrders);
  const currentPositiveBuilds = buildProgress?.builds ?? [];
  const currentDisbands = buildProgress?.disbands ?? [];
  const disbandsRequired =
    buildProgress?.mode === 'disband' ? buildProgress.total : 0;
  const remainingBuilds =
    buildProgress?.mode === 'build' ? buildProgress.remaining : 0;
  const canSubmitBuilds =
    myBuildCount?.count == null
      ? false
      : myBuildCount.count > 0
        ? true
        : currentDisbands.length === disbandsRequired;
  const canSubmitCurrentPhase =
    !isLocked &&
    !isSpectator &&
    !!myPower &&
    (turn.phase === 'order_submission' ||
      (turn.phase === 'retreat_submission' && needsRetreatOrders) ||
      (turn.phase === 'build_submission' &&
        needsBuildOrders &&
        canSubmitBuilds));

  const bannerMetaItems = [
    <span key="season">
      {turn.season === 'spring' ? 'Spring' : 'Fall'} {turn.year}
    </span>,
    <span key="phase">{formatPhase(turn.phase)}</span>,
    myPower ? (
      <PowerName
        key="power"
        className="gap-1.5"
        flagClassName="h-3.5 w-5"
        power={myPower}
      />
    ) : null,
    isSpectator ? <span key="spectating">Spectating</span> : null,
  ].filter((item) => item != null) as ReactNode[];
  const bannerMeta = joinInlineMeta(bannerMetaItems);
  const submissionProgress = submissionStatus
    ? `${submissionStatus.submitted.length}/${submissionStatus.submitted.length + submissionStatus.pending.length} submitted`
    : null;
  const allSubmitted =
    submissionStatus && submissionStatus.pending.length === 0;
  const submissionStatusChip: HeaderStatusChipData | null = submissionProgress
    ? {
        icon: allSubmitted ? CircleCheck : Clock,
        label: submissionProgress,
        compactLabel: `${submissionStatus!.submitted.length}/${submissionStatus!.submitted.length + submissionStatus!.pending.length}`,
        className: 'border-sky-300/30 bg-sky-400/16 text-sky-50',
      }
    : null;
  const playersWindowSections = buildPlayersWindowSections({
    players,
    submissionStatus,
    phase: turn.phase,
    myUserId,
  });
  const buildStatusChip: HeaderStatusChipData | null =
    isBuildSubmission && buildProgress
      ? buildProgress.mode === 'build'
        ? {
            icon: Castle,
            label: (
              <span className="inline-flex items-center gap-2">
                <span>
                  {buildProgress.completed}/{buildProgress.total} placed
                </span>
                <span className="h-4 w-px bg-current/25" />
                <span className="inline-flex items-center gap-1.5">
                  <TankTokenIcon className="size-4" />
                  <span>{buildProgress.armies}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BattleshipTokenIcon className="size-4" />
                  <span>{buildProgress.fleets}</span>
                </span>
              </span>
            ),
            compactLabel: `${buildProgress.completed}/${buildProgress.total}`,
            className:
              'border-emerald-300/30 bg-emerald-400/18 text-emerald-50',
          }
        : {
            icon: Trash2,
            label: `${buildProgress.completed}/${buildProgress.total} disbands`,
            compactLabel: `${buildProgress.completed}/${buildProgress.total}`,
            className: 'border-amber-300/30 bg-amber-400/18 text-amber-50',
          }
      : null;

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
    setActiveFlyout('submit');
  };

  const summaryLines = isOrderSubmission
    ? myUnits.map((province) =>
        describeMainOrder(province, getMainDraft(province), positions),
      )
    : isRetreatSubmission
      ? myDislodgedUnits.map((unit) =>
          describeRetreatOrder(getRetreatDraft(unit.province), positions),
        )
      : isBuildSubmission && buildOrders.length > 0
        ? buildOrders.map(describeBuildOrder)
        : isBuildSubmission && remainingBuilds > 0
          ? Array.from({ length: remainingBuilds }, () => 'Waive')
          : [];
  const submissionPreviewTitle = isOrderSubmission
    ? 'Orders Ready to Submit'
    : isRetreatSubmission
      ? 'Retreats Ready to Submit'
      : isBuildSubmission
        ? 'Builds Ready to Submit'
        : 'Submission Preview';

  const selectedMainUnit = selectedMainProvince
    ? (positions[selectedMainProvince] ?? null)
    : null;
  const selectedMainDraft = selectedMainProvince
    ? getMainDraft(selectedMainProvince)
    : null;
  const selectedMainMoveTargets = selectedMainProvince
    ? getMoveTargets(selectedMainProvince, positions)
    : [];
  const selectedMainConvoyTargets = selectedMainProvince
    ? getConvoyMoveTargets(selectedMainProvince, positions)
    : [];
  const selectedMainSupportableUnits = selectedMainProvince
    ? getSupportableUnitProvinces(selectedMainProvince, positions)
    : [];
  const selectedMainConvoyableArmies = selectedMainProvince
    ? getConvoyableArmyProvincesForFleet(selectedMainProvince, positions)
    : [];
  const currentBuild =
    buildInteraction.kind === 'site'
      ? (currentPositiveBuilds.find(
          (build) => build.province === buildInteraction.province,
        ) ?? null)
      : null;
  const buildChoices =
    buildInteraction.kind === 'site'
      ? getBuildChoices(buildInteraction.province)
      : [];
  const armyBuildChoices = buildChoices.filter(
    (choice) => choice.unitType === 'army',
  );
  const fleetBuildChoices = buildChoices.filter(
    (choice) => choice.unitType === 'fleet',
  );

  const actionSubtitle = isOrderSubmission
    ? selectedMainProvince
      ? describeProvinceRef(selectedMainProvince)
      : 'Select a unit'
    : isRetreatSubmission
      ? retreatInteraction.kind === 'unit'
        ? describeProvinceRef(retreatInteraction.province)
        : 'Select a dislodged unit'
      : isBuildSubmission
        ? buildInteraction.kind === 'site'
          ? describeProvinceRef(buildInteraction.province)
          : buildInteraction.kind === 'disband'
            ? describeProvinceRef(buildInteraction.province)
            : 'Select a build site or unit'
        : 'Board status';

  const toggleFlyout = (panel: Exclude<FlyoutPanel, null>) => {
    setActiveFlyout((previous) => (previous === panel ? null : panel));
  };

  const clearCurrentBuildSelection = () => {
    if (buildInteraction.kind === 'site') {
      setBuildOrders((previous) =>
        previous.filter(
          (build) => build.province !== buildInteraction.province,
        ),
      );
      setBuildChoiceMode(null);
      setActiveFlyout('action');
      return;
    }

    if (buildInteraction.kind === 'disband') {
      setBuildOrders((previous) =>
        previous.filter(
          (build) => build.province !== buildInteraction.province,
        ),
      );
      setBuildInteraction({ kind: 'idle' });
      setBuildChoiceMode(null);
      setActiveFlyout('action');
    }
  };

  const selectBuildUnitType = (unitType: 'army' | 'fleet') => {
    if (buildInteraction.kind !== 'site') {
      return;
    }

    const matchingChoices = buildChoices.filter(
      (choice) => choice.unitType === unitType,
    );
    if (matchingChoices.length === 0) {
      return;
    }

    if (matchingChoices.length === 1) {
      const choice = matchingChoices[0];
      if (!choice) {
        return;
      }

      upsertBuild({
        action: 'build',
        province: buildInteraction.province,
        unitType: choice.unitType,
        coast: choice.coast,
      });
      return;
    }

    setBuildChoiceMode(unitType);
    setActiveFlyout('action');
  };

  const clearRetreatSelection = () => {
    if (retreatInteraction.kind !== 'unit') {
      return;
    }

    setRetreatOrders((previous) => ({
      ...previous,
      [retreatInteraction.province]: {
        unitProvince: retreatInteraction.province,
        retreatTo: null,
      },
    }));
    setActiveFlyout('action');
  };

  const stepBackMainInteraction = () => {
    if (mainInteraction.kind === 'idle') {
      return;
    }

    if (mainInteraction.kind === 'unit') {
      setMainInteraction({ kind: 'idle' });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'move') {
      setMainInteraction({ kind: 'unit', province: mainInteraction.province });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'support-unit') {
      setMainInteraction({ kind: 'unit', province: mainInteraction.province });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'support-target') {
      setMainInteraction({
        kind: 'support-unit',
        province: mainInteraction.province,
      });
      setActiveFlyout('action');
      return;
    }

    if (mainInteraction.kind === 'convoy-unit') {
      setMainInteraction({ kind: 'unit', province: mainInteraction.province });
      setActiveFlyout('action');
      return;
    }

    setMainInteraction({
      kind: 'convoy-unit',
      province: mainInteraction.province,
    });
    setActiveFlyout('action');
  };

  const canEditSelectedMainUnit =
    !!selectedMainProvince && !isLocked && !isSpectator && !!myPower;
  const canHoldSelectedMainUnit = canEditSelectedMainUnit;
  const canMoveSelectedMainUnit =
    (mainInteraction.kind === 'move' && !mainInteraction.viaConvoy) ||
    (selectedMainDraft?.orderType === 'move' && !selectedMainDraft.viaConvoy) ||
    (canEditSelectedMainUnit && selectedMainMoveTargets.length > 0);
  const canViaConvoySelectedMainUnit =
    (mainInteraction.kind === 'move' && mainInteraction.viaConvoy) ||
    (selectedMainDraft?.orderType === 'move' &&
      !!selectedMainDraft.viaConvoy) ||
    (canEditSelectedMainUnit &&
      selectedMainUnit?.unitType === 'army' &&
      selectedMainConvoyTargets.length > 0);
  const canSupportSelectedMainUnit =
    mainInteraction.kind === 'support-unit' ||
    mainInteraction.kind === 'support-target' ||
    selectedMainDraft?.orderType === 'support' ||
    (canEditSelectedMainUnit && selectedMainSupportableUnits.length > 0);
  const canConvoySelectedMainUnit =
    mainInteraction.kind === 'convoy-unit' ||
    mainInteraction.kind === 'convoy-target' ||
    selectedMainDraft?.orderType === 'convoy' ||
    (canEditSelectedMainUnit &&
      selectedMainUnit?.unitType === 'fleet' &&
      PROVINCES[selectedMainProvince]?.type === 'water' &&
      selectedMainConvoyableArmies.length > 0);
  const canStepBackMainInteraction =
    mainInteraction.kind !== 'idle' && !isLocked && !isSpectator && !!myPower;
  const canChooseRetreatAction =
    retreatInteraction.kind === 'unit' &&
    !isLocked &&
    !isSpectator &&
    !!myPower &&
    needsRetreatOrders;
  const canChooseBuildSiteAction =
    buildInteraction.kind === 'site' && !isLocked && !isSpectator && !!myPower;
  const canChooseBuildDisbandAction =
    buildInteraction.kind === 'disband' &&
    !isLocked &&
    !isSpectator &&
    !!myPower &&
    needsBuildOrders;
  const selectedBuildDisbandProvince =
    buildInteraction.kind === 'disband' ? buildInteraction.province : null;

  const toolbarPrimaryActions: ToolbarAction[] = isOrderSubmission
    ? [
        {
          id: 'hold',
          label:
            mainInteraction.kind === 'support-target' ? 'Support Hold' : 'Hold',
          icon: Shield,
          tooltip:
            mainInteraction.kind === 'support-target'
              ? 'Support the selected unit to hold in place'
              : 'Keep this unit in place',
          disabled: !canHoldSelectedMainUnit,
          active:
            !!selectedMainProvince &&
            (mainInteraction.kind === 'support-target'
              ? selectedMainDraft?.orderType === 'support' &&
                !selectedMainDraft.targetProvince &&
                selectedMainDraft.supportedUnitProvince ===
                  mainInteraction.supportedUnitProvince
              : (mainInteraction.kind === 'unit' &&
                  selectedMainDraft?.orderType === 'hold') ||
                selectedMainDraft?.orderType === 'hold'),
          onClick: () => {
            if (!selectedMainProvince) {
              return;
            }

            if (mainInteraction.kind === 'support-target') {
              commitMainOrder(selectedMainProvince, {
                orderType: 'support',
                targetProvince: null,
                supportedUnitProvince: mainInteraction.supportedUnitProvince,
                viaConvoy: false,
              });
              setBuildChoiceMode(null);
              setActiveFlyout('action');
              return;
            }

            resetMainOrder(selectedMainProvince);
            setBuildChoiceMode(null);
            setActiveFlyout('action');
          },
        },
        {
          id: 'move',
          label: 'Move',
          icon: ArrowRight,
          tooltip: 'Choose a destination on the map',
          disabled: !canMoveSelectedMainUnit,
          active:
            mainInteraction.kind === 'move'
              ? !mainInteraction.viaConvoy
              : selectedMainDraft?.orderType === 'move' &&
                !selectedMainDraft.viaConvoy,
          onClick: () => {
            if (!selectedMainProvince) {
              return;
            }

            setMainInteraction({
              kind: 'move',
              province: selectedMainProvince,
              viaConvoy: false,
            });
            setActiveFlyout('action');
          },
        },
        {
          id: 'via-convoy',
          label: 'Via Convoy',
          icon: Ship,
          tooltip: 'Route this army by convoy',
          disabled: !canViaConvoySelectedMainUnit,
          active:
            mainInteraction.kind === 'move'
              ? mainInteraction.viaConvoy
              : selectedMainDraft?.orderType === 'move' &&
                !!selectedMainDraft.viaConvoy,
          onClick: () => {
            if (!selectedMainProvince) {
              return;
            }

            setMainInteraction({
              kind: 'move',
              province: selectedMainProvince,
              viaConvoy: true,
            });
            setActiveFlyout('action');
          },
        },
        {
          id: 'support',
          label: 'Support',
          icon: HandHelping,
          tooltip: 'Support another unit',
          disabled: !canSupportSelectedMainUnit,
          active:
            mainInteraction.kind === 'support-unit' ||
            mainInteraction.kind === 'support-target' ||
            selectedMainDraft?.orderType === 'support',
          onClick: () => {
            if (!selectedMainProvince) {
              return;
            }

            setMainInteraction({
              kind: 'support-unit',
              province: selectedMainProvince,
            });
            setActiveFlyout('action');
          },
        },
        {
          id: 'convoy',
          label: 'Convoy',
          icon: ShipWheel,
          tooltip: 'Convoy an army across water',
          disabled: !canConvoySelectedMainUnit,
          active:
            mainInteraction.kind === 'convoy-unit' ||
            mainInteraction.kind === 'convoy-target' ||
            selectedMainDraft?.orderType === 'convoy',
          onClick: () => {
            if (!selectedMainProvince) {
              return;
            }

            setMainInteraction({
              kind: 'convoy-unit',
              province: selectedMainProvince,
            });
            setActiveFlyout('action');
          },
        },
        {
          id: mainInteraction.kind === 'idle' ? 'done' : 'back',
          label: mainInteraction.kind === 'unit' ? 'Done' : 'Back',
          icon: mainInteraction.kind === 'unit' ? Check : Undo2,
          tooltip:
            mainInteraction.kind === 'unit'
              ? 'Return to unit selection'
              : 'Step back one action',
          disabled: !canStepBackMainInteraction,
          onClick: stepBackMainInteraction,
        },
      ].filter((action) => !action.disabled)
    : isRetreatSubmission
      ? [
          {
            id: 'retreat-disband',
            label: 'Disband',
            icon: Trash2,
            tooltip: 'Disband this unit instead of retreating',
            disabled: !canChooseRetreatAction,
            onClick: clearRetreatSelection,
          },
          {
            id: 'retreat-done',
            label: 'Done',
            icon: Check,
            tooltip: 'Return to dislodged unit selection',
            disabled: !canChooseRetreatAction,
            onClick: () => {
              setRetreatInteraction({ kind: 'idle' });
              setActiveFlyout('action');
            },
          },
        ].filter((action) => !action.disabled)
      : isBuildSubmission && myBuildCount && myBuildCount.count > 0
        ? [
            {
              id: 'build-army',
              label: 'Build Army',
              icon: Castle,
              tooltip: 'Place an army here',
              disabled:
                !canChooseBuildSiteAction || armyBuildChoices.length === 0,
              active: currentBuild?.unitType === 'army',
              onClick: () => selectBuildUnitType('army'),
            },
            {
              id: 'build-fleet',
              label: 'Build Fleet',
              icon: Ship,
              tooltip: 'Place a fleet here',
              disabled:
                !canChooseBuildSiteAction || fleetBuildChoices.length === 0,
              active:
                currentBuild?.unitType === 'fleet' ||
                buildChoiceMode === 'fleet',
              onClick: () => selectBuildUnitType('fleet'),
            },
            {
              id: 'clear-build',
              label: 'Clear',
              icon: Trash2,
              tooltip: 'Remove the current build choice',
              disabled: !canChooseBuildSiteAction || !currentBuild,
              onClick: clearCurrentBuildSelection,
            },
            {
              id: 'done-build',
              label: 'Done',
              icon: Check,
              tooltip: 'Return to build site selection',
              disabled: !canChooseBuildSiteAction,
              onClick: () => {
                setBuildInteraction({ kind: 'idle' });
                setBuildChoiceMode(null);
                setActiveFlyout('action');
              },
            },
          ].filter((action) => !action.disabled)
        : isBuildSubmission
          ? [
              {
                id: 'clear-disband',
                label: 'Clear',
                icon: Trash2,
                tooltip: 'Remove this disband selection',
                disabled:
                  !canChooseBuildDisbandAction ||
                  !currentDisbands.some(
                    (build) => build.province === selectedBuildDisbandProvince,
                  ),
                onClick: clearCurrentBuildSelection,
              },
              {
                id: 'done-disband',
                label: 'Done',
                icon: Check,
                tooltip: 'Return to unit selection',
                disabled: !canChooseBuildDisbandAction,
                onClick: () => {
                  setBuildInteraction({ kind: 'idle' });
                  setBuildChoiceMode(null);
                  setActiveFlyout('action');
                },
              },
            ].filter((action) => !action.disabled)
          : [];

  const toolbarGroups = [
    toolbarPrimaryActions,
    [
      {
        id: 'summary',
        label: 'Summary',
        icon: ScrollText,
        tooltip: 'Review the current draft',
        active: activeFlyout === 'summary',
        onClick: () => toggleFlyout('summary'),
      },
      {
        id: 'submit',
        label: 'Submit',
        icon: Send,
        tooltip: 'Review and submit this phase',
        active: activeFlyout === 'submit',
        onClick: () => toggleFlyout('submit'),
      },
    ],
  ].filter((group) => group.length > 0);

  const supportHintFlyout: FlyoutContent | null =
    isOrderSubmission && activeFlyout === 'action'
      ? mainInteraction.kind === 'support-unit'
        ? {
            title: 'Support',
            subtitle: describeProvinceRef(mainInteraction.province),
            body: (
              <p className="text-sm text-muted-foreground">
                Select a highlighted unit to support.
              </p>
            ),
          }
        : mainInteraction.kind === 'support-target'
          ? {
              title: 'Support',
              subtitle: describeProvinceRef(mainInteraction.province),
              body: (
                <p className="text-sm text-muted-foreground">
                  Choose{' '}
                  <span className="font-medium text-foreground">Hold</span> to
                  support in place, or click a highlighted destination to
                  support a move.
                </p>
              ),
            }
          : null
      : null;

  return {
    positions,
    supplyCenters,
    myPower,
    myBuildCount,
    isSpectator,
    isLocked,
    needsRetreatOrders,
    needsBuildOrders,
    isOrderSubmission,
    isRetreatSubmission,
    isBuildSubmission,
    mainInteraction,
    retreatInteraction,
    buildInteraction,
    buildChoiceMode,
    activeFlyout,
    isPlayersWindowOpen,
    toolbarGroups,
    bannerMeta,
    buildStatusChip,
    submissionStatusChip,
    playersWindowSections,
    submissionProgress,
    buildProgress,
    supportHintFlyout,
    actionSubtitle,
    summaryLines,
    submissionPreviewTitle,
    activeMutation,
    canSubmitCurrentPhase,
    activeSelectedProvince,
    activeSelectedUnit,
    activeValidTargets,
    activeHighlightedUnits,
    activeAnnotations,
    currentBuild,
    currentDisbands,
    eligibleBuildProvinces,
    getMainDraft,
    getRetreatDraft,
    setMainInteraction,
    setActiveFlyout,
    setIsPlayersWindowOpen,
    handleSubmit,
    upsertBuild,
    onProvinceClick: isOrderSubmission
      ? handleMainProvinceClick
      : isRetreatSubmission
        ? handleRetreatProvinceClick
        : isBuildSubmission
          ? handleBuildProvinceClick
          : undefined,
    onUnitClick: isOrderSubmission
      ? handleMainUnitClick
      : isRetreatSubmission
        ? handleRetreatUnitClick
        : isBuildSubmission
          ? handleBuildUnitClick
          : undefined,
    mainPanelProps: {
      isSpectator,
      myPower,
      isLocked,
      mainInteraction,
      positions,
      mainValidTargets,
      highlightedMainUnits,
      getMainDraft,
      onCommitMainOrder: commitMainOrder,
      onSetMainInteraction: setMainInteraction,
    },
    retreatPanelProps: {
      isSpectator,
      myPower,
      needsRetreatOrders,
      isLocked,
      retreatInteraction,
      dislodgedUnits: turn.dislodgedUnits,
      getRetreatDescription: (province: string) =>
        describeRetreatOrder(getRetreatDraft(province), positions),
    },
    buildPanelProps: {
      isSpectator,
      myPower,
      needsBuildOrders,
      myBuildCount,
      isLocked,
      progress: buildProgress,
      buildInteraction,
      buildChoiceMode,
      currentBuild,
      currentDisbands,
      eligibleBuildProvinces,
      onChooseBuild: upsertBuild,
    },
  };
}
