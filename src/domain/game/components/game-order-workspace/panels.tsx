import { Button } from '@/components/ui/button.tsx';
import {
  canSupportHold,
  describeBuildOrder,
  describeMainOrder,
  describeProvinceRef,
  findDislodgedUnit,
  getBuildChoices,
  getConvoyMoveTargets,
  getConvoyableArmyProvincesForFleet,
  type BuildOrderDraft,
  type MainOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import type {
  DislodgedUnit,
  Power,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import type {
  BuildInteraction,
  BuildProgressState,
  MainInteraction,
  RetreatInteraction,
  SubmissionStatus,
} from './types.ts';

function renderPowerList(powers: Power[]) {
  return powers.map((power, index) => (
    <span key={power}>
      {index > 0 ? <span aria-hidden="true">, </span> : null}
      <PowerName className="gap-1.5" flagClassName="h-3 w-4.5" power={power} />
    </span>
  ));
}

export function BuildProgressCard({
  progress,
}: {
  progress: BuildProgressState;
}) {
  if (!progress) {
    return null;
  }

  if (progress.mode === 'build') {
    return (
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Build Progress
        </div>
        <div className="mt-1 text-sm font-medium text-foreground">
          {progress.completed} of {progress.total} units placed
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {progress.armies} arm{progress.armies === 1 ? 'y' : 'ies'} and{' '}
          {progress.fleets} fleet{progress.fleets === 1 ? '' : 's'} placed.{' '}
          {progress.remaining} remaining.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Disband Progress
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {progress.completed} of {progress.total} units selected
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {progress.remaining} remaining.
      </div>
    </div>
  );
}

export function MainActionPanel({
  isSpectator,
  myPower,
  isLocked,
  mainInteraction,
  positions,
  mainValidTargets,
  highlightedMainUnits,
  getMainDraft,
  onCommitMainOrder,
  onSetMainInteraction,
}: {
  isSpectator: boolean;
  myPower: Power | null;
  isLocked: boolean;
  mainInteraction: MainInteraction;
  positions: UnitPositions;
  mainValidTargets: string[];
  highlightedMainUnits: string[];
  getMainDraft: (province: string) => MainOrderDraft;
  onCommitMainOrder: (province: string, order: Partial<MainOrderDraft>) => void;
  onSetMainInteraction: (interaction: MainInteraction) => void;
}) {
  if (isSpectator || !myPower) {
    return (
      <p className="text-sm text-muted-foreground">
        Spectators can inspect the board but cannot submit orders.
      </p>
    );
  }

  if (isLocked) {
    return (
      <p className="text-sm text-muted-foreground">
        Orders submitted. Waiting for the rest of the board.
      </p>
    );
  }

  if (mainInteraction.kind === 'idle') {
    return (
      <p className="text-sm text-muted-foreground">
        Select one of your units to draft its order directly on the map.
      </p>
    );
  }

  const unit = positions[mainInteraction.province];
  if (!unit) {
    return null;
  }

  const convoyTargets = getConvoyMoveTargets(
    mainInteraction.province,
    positions,
  );
  const convoyableArmies = getConvoyableArmyProvincesForFleet(
    mainInteraction.province,
    positions,
  );

  if (mainInteraction.kind === 'unit') {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm">
          {describeMainOrder(
            mainInteraction.province,
            getMainDraft(mainInteraction.province),
            positions,
          )}
        </div>
        <p className="text-muted-foreground">
          Use the toolbar to hold, move, support, convoy, or finish with this
          unit.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-xs text-muted-foreground">
          {unit.unitType === 'army' && convoyTargets.length > 0
            ? 'Convoy move available.'
            : unit.unitType === 'fleet' &&
                PROVINCES[mainInteraction.province]?.type === 'water' &&
                convoyableArmies.length > 0
              ? 'Convoy order available.'
              : 'Additional options unlock when they are legal for the selected unit.'}
        </div>
      </div>
    );
  }

  if (mainInteraction.kind === 'move') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Select a{' '}
          {mainInteraction.viaConvoy ? 'convoy destination' : 'destination'} for{' '}
          {describeProvinceRef(mainInteraction.province)}.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {mainValidTargets.length > 0
            ? mainValidTargets.map(describeProvinceRef).join(', ')
            : 'No legal destinations available.'}
        </div>
      </div>
    );
  }

  if (mainInteraction.kind === 'support-unit') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Select any unit that {describeProvinceRef(mainInteraction.province)}{' '}
          can support.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {highlightedMainUnits.length > 0
            ? highlightedMainUnits.map(describeProvinceRef).join(', ')
            : 'No support targets available.'}
        </div>
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
          Supporting{' '}
          {describeProvinceRef(mainInteraction.supportedUnitProvince)} from{' '}
          {describeProvinceRef(mainInteraction.province)}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            disabled={!canHold}
            onClick={() =>
              onCommitMainOrder(mainInteraction.province, {
                orderType: 'support',
                targetProvince: null,
                supportedUnitProvince: mainInteraction.supportedUnitProvince,
                viaConvoy: false,
              })
            }
          >
            Support Hold
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onSetMainInteraction({
                kind: 'support-unit',
                province: mainInteraction.province,
              })
            }
          >
            Change Unit
          </Button>
        </div>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {mainValidTargets.length > 0
            ? `Support move to: ${mainValidTargets.map(describeProvinceRef).join(', ')}`
            : 'No support-move destinations available.'}
        </div>
      </div>
    );
  }

  if (mainInteraction.kind === 'convoy-unit') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Select an army for {describeProvinceRef(mainInteraction.province)} to
          convoy.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {highlightedMainUnits.length > 0
            ? highlightedMainUnits.map(describeProvinceRef).join(', ')
            : 'No convoyable armies available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Select a convoy destination for{' '}
        {describeProvinceRef(mainInteraction.supportedUnitProvince)}.
      </p>
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {mainValidTargets.length > 0
          ? mainValidTargets.map(describeProvinceRef).join(', ')
          : 'No convoy destinations available.'}
      </div>
    </div>
  );
}

export function RetreatActionPanel({
  isSpectator,
  myPower,
  needsRetreatOrders,
  isLocked,
  retreatInteraction,
  dislodgedUnits,
  getRetreatDescription,
}: {
  isSpectator: boolean;
  myPower: Power | null;
  needsRetreatOrders: boolean;
  isLocked: boolean;
  retreatInteraction: RetreatInteraction;
  dislodgedUnits: DislodgedUnit[];
  getRetreatDescription: (province: string) => string;
}) {
  if (isSpectator || !myPower) {
    return (
      <p className="text-sm text-muted-foreground">
        Spectators can inspect the board but cannot submit orders.
      </p>
    );
  }

  if (!needsRetreatOrders) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no units to retreat this phase.
      </p>
    );
  }

  if (isLocked) {
    return (
      <p className="text-sm text-muted-foreground">
        Retreats submitted. Waiting for the board to resolve.
      </p>
    );
  }

  if (retreatInteraction.kind === 'idle') {
    return (
      <p className="text-sm text-muted-foreground">
        Select one of your dislodged units, then choose a retreat destination on
        the map or disband it.
      </p>
    );
  }

  const selectedUnit = findDislodgedUnit(
    dislodgedUnits,
    retreatInteraction.province,
  );
  if (!selectedUnit) {
    return null;
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {getRetreatDescription(retreatInteraction.province)}
      </div>
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {selectedUnit.retreatOptions.length > 0
          ? selectedUnit.retreatOptions.map(describeProvinceRef).join(', ')
          : 'No legal retreat destinations.'}
      </div>
      <p className="text-xs text-muted-foreground">
        Click a destination on the map to retreat, or use the toolbar to disband
        or finish.
      </p>
    </div>
  );
}

export function BuildActionPanel({
  isSpectator,
  myPower,
  needsBuildOrders,
  myBuildCount,
  isLocked,
  progress,
  buildInteraction,
  buildChoiceMode,
  currentBuild,
  currentDisbands,
  eligibleBuildProvinces,
  onChooseBuild,
}: {
  isSpectator: boolean;
  myPower: Power | null;
  needsBuildOrders: boolean;
  myBuildCount: { count: number } | null;
  isLocked: boolean;
  progress: BuildProgressState;
  buildInteraction: BuildInteraction;
  buildChoiceMode: 'army' | 'fleet' | null;
  currentBuild: BuildOrderDraft | null;
  currentDisbands: BuildOrderDraft[];
  eligibleBuildProvinces: string[];
  onChooseBuild: (build: BuildOrderDraft) => void;
}) {
  if (isSpectator || !myPower) {
    return (
      <p className="text-sm text-muted-foreground">
        Spectators can inspect the board but cannot submit orders.
      </p>
    );
  }

  if (!needsBuildOrders || !myBuildCount) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no build or disband decisions this phase.
      </p>
    );
  }

  if (isLocked) {
    return (
      <div className="space-y-3">
        <BuildProgressCard progress={progress} />
        <p className="text-sm text-muted-foreground">
          Build submission locked. Waiting for the phase to resolve.
        </p>
      </div>
    );
  }

  if (myBuildCount.count < 0) {
    return (
      <div className="space-y-3 text-sm">
        <BuildProgressCard progress={progress} />
        <p className="text-muted-foreground">
          Select {progress?.total ?? 0} unit{progress?.total === 1 ? '' : 's'}{' '}
          on the map to disband.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {currentDisbands.length > 0
            ? currentDisbands.map(describeBuildOrder).join(', ')
            : 'No units selected yet.'}
        </div>
        {buildInteraction.kind === 'disband' ? (
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
            Selected: {describeProvinceRef(buildInteraction.province)}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Use the toolbar to clear the current selection or finish.
        </p>
      </div>
    );
  }

  if (buildInteraction.kind !== 'site') {
    return (
      <div className="space-y-3 text-sm">
        <BuildProgressCard progress={progress} />
        <p className="text-muted-foreground">
          Select one of your eligible home centers to place a new unit.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {eligibleBuildProvinces.map(describeProvinceRef).join(', ')}
        </div>
      </div>
    );
  }

  const choices = getBuildChoices(buildInteraction.province);

  return (
    <div className="space-y-3 text-sm">
      <BuildProgressCard progress={progress} />
      <p className="text-muted-foreground">
        {buildChoiceMode
          ? `Choose a ${buildChoiceMode === 'army' ? 'unit' : 'fleet coast'} for ${describeProvinceRef(buildInteraction.province)}.`
          : `Use the toolbar to choose what to build in ${describeProvinceRef(buildInteraction.province)}.`}
      </p>
      {currentBuild ? (
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {describeBuildOrder(currentBuild)}
        </div>
      ) : null}
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {choices
          .map((choice) =>
            choice.unitType === 'army'
              ? 'Army'
              : `Fleet${choice.coast ? ` (${choice.coast.toUpperCase()})` : ''}`,
          )
          .join(', ')}
      </div>
      {buildChoiceMode ? (
        <div className="grid gap-2">
          {choices
            .filter((choice) => choice.unitType === buildChoiceMode)
            .map((choice) => (
              <Button
                key={`${choice.unitType}-${choice.coast ?? 'base'}`}
                type="button"
                variant="outline"
                onClick={() =>
                  onChooseBuild({
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
      ) : (
        <p className="text-xs text-muted-foreground">
          If a fleet has multiple coasts, tapping the fleet icon opens those
          coast choices here.
        </p>
      )}
    </div>
  );
}

export function SummaryPanel({
  progress,
  summaryLines,
}: {
  progress: BuildProgressState;
  summaryLines: string[];
}) {
  return (
    <div className="space-y-3">
      <BuildProgressCard progress={progress} />
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-black/10 bg-black/[0.03] p-3">
        {summaryLines.length > 0 ? (
          summaryLines.map((line, index) => (
            <div key={`${line}-${index}`} className="text-sm">
              {line}
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">
            No submission required for your power in this phase.
          </div>
        )}
      </div>
    </div>
  );
}

export function SubmitPanel({
  isSpectator,
  myPower,
  isSubmissionOpen,
  canSubmitCurrentPhase,
  submissionPreviewTitle,
  summaryLines,
  submissionStatus,
  errorMessage,
  isLocked,
  isPending,
  onSubmit,
}: {
  isSpectator: boolean;
  myPower: Power | null;
  isSubmissionOpen: boolean;
  canSubmitCurrentPhase: boolean;
  submissionPreviewTitle: string;
  summaryLines: string[];
  submissionStatus: SubmissionStatus | null;
  errorMessage: string | null;
  isLocked: boolean;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm text-muted-foreground">
        {isSpectator || !myPower
          ? 'Spectators can inspect the board but cannot submit orders.'
          : isSubmissionOpen
            ? canSubmitCurrentPhase
              ? 'Review your draft, then submit when ready.'
              : 'Complete the required selections before submitting.'
            : 'No submission is open while the board resolves.'}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {submissionPreviewTitle}
        </div>
        <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-black/10 bg-black/[0.03] p-3">
          {summaryLines.length > 0 ? (
            summaryLines.map((line, index) => (
              <div key={`${line}-${index}`} className="text-sm">
                {line}
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">
              No submission required for your power in this phase.
            </div>
          )}
        </div>
      </div>
      {submissionStatus ? (
        <div className="space-y-2">
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm">
            <span className="font-medium">Submitted:</span>{' '}
            {submissionStatus.submitted.length > 0
              ? renderPowerList(submissionStatus.submitted)
              : 'None'}
          </div>
          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-sm">
            <span className="font-medium">Waiting:</span>{' '}
            {submissionStatus.pending.length > 0
              ? renderPowerList(submissionStatus.pending)
              : 'No one'}
          </div>
        </div>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      {isLocked ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Submitted.
        </div>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={!canSubmitCurrentPhase || isPending}
          onClick={onSubmit}
        >
          {isPending ? 'Submitting...' : 'Submit'}
        </Button>
      )}
    </div>
  );
}
