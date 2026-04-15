import { DiplomacyMap } from './DiplomacyMap.tsx';
import {
  ToolbarDock,
  WorkspaceFlyoutLayer,
  WorkspaceHeader,
} from './game-order-workspace/chrome.tsx';
import {
  BuildActionPanel,
  MainActionPanel,
  SubmitPanel,
  SummaryPanel,
  RetreatActionPanel,
} from './game-order-workspace/panels.tsx';
import type {
  FlyoutContent,
  GameOrderWorkspaceProps,
} from './game-order-workspace/types.ts';
import { useGameOrderWorkspace } from './game-order-workspace/use-game-order-workspace.tsx';

export function GameOrderWorkspace(props: GameOrderWorkspaceProps) {
  const workspace = useGameOrderWorkspace(props);

  const actionBody = workspace.isOrderSubmission ? (
    <MainActionPanel {...workspace.mainPanelProps} />
  ) : workspace.isRetreatSubmission ? (
    <RetreatActionPanel {...workspace.retreatPanelProps} />
  ) : workspace.isBuildSubmission ? (
    <BuildActionPanel {...workspace.buildPanelProps} />
  ) : (
    <p className="text-sm text-muted-foreground">
      The board is resolving. Actions are read-only until the next submission
      window opens.
    </p>
  );

  const flyout: FlyoutContent | null =
    workspace.activeFlyout === 'action'
      ? {
          title: workspace.isOrderSubmission
            ? 'Orders'
            : workspace.isRetreatSubmission
              ? 'Retreats'
              : workspace.isBuildSubmission
                ? 'Builds'
                : 'Board',
          subtitle: workspace.actionSubtitle,
          body: actionBody,
        }
      : workspace.activeFlyout === 'summary'
        ? {
            title: 'Summary',
            subtitle:
              workspace.isBuildSubmission && workspace.buildProgress
                ? workspace.buildProgress.mode === 'build'
                  ? `${workspace.buildProgress.completed}/${workspace.buildProgress.total} builds placed`
                  : `${workspace.buildProgress.completed}/${workspace.buildProgress.total} disbands selected`
                : (workspace.submissionProgress ?? 'Current draft'),
            body: (
              <SummaryPanel
                progress={workspace.buildProgress}
                summaryLines={workspace.summaryLines}
              />
            ),
          }
        : workspace.activeFlyout === 'submit'
          ? {
              title: 'Submit',
              subtitle: workspace.submissionProgress ?? 'Board status',
              body: (
                <SubmitPanel
                  isSpectator={workspace.isSpectator}
                  myPower={workspace.myPower}
                  isSubmissionOpen={
                    workspace.isOrderSubmission ||
                    workspace.isRetreatSubmission ||
                    workspace.isBuildSubmission
                  }
                  canSubmitCurrentPhase={workspace.canSubmitCurrentPhase}
                  submissionPreviewTitle={workspace.submissionPreviewTitle}
                  summaryLines={workspace.summaryLines}
                  submissionStatus={props.submissionStatus}
                  errorMessage={
                    workspace.activeMutation.isError
                      ? workspace.activeMutation.error.message
                      : null
                  }
                  isLocked={workspace.isLocked}
                  isPending={workspace.activeMutation.isPending}
                  onSubmit={() => void workspace.handleSubmit()}
                />
              ),
            }
          : null;

  const visibleFlyout =
    workspace.supportHintFlyout ??
    (workspace.activeFlyout === 'action' ? null : flyout);

  return (
    <div className="relative h-dvh overflow-hidden bg-[#e7dfc8] text-foreground">
      <WorkspaceHeader
        roomName={props.roomName}
        roomCode={props.roomCode}
        bannerMeta={workspace.bannerMeta}
        buildStatusChip={workspace.buildStatusChip}
        submissionStatusChip={workspace.submissionStatusChip}
        unreadThreadCount={props.unreadThreadCount}
        isMessagesOpen={props.isMessagesOpen}
        isPlayersWindowOpen={workspace.isPlayersWindowOpen}
        playersWindowSections={workspace.playersWindowSections}
        onMessagePlayer={props.onMessagePlayer}
        onInspectBot={props.onInspectBot}
        onToggleMessages={props.onToggleMessages}
        onClosePlayersWindow={() => workspace.setIsPlayersWindowOpen(false)}
        onTogglePlayersWindow={() =>
          workspace.setIsPlayersWindowOpen(!workspace.isPlayersWindowOpen)
        }
      />

      <div className="absolute inset-0 pt-14 sm:pt-12">
        <DiplomacyMap
          positions={workspace.positions}
          supplyCenters={workspace.supplyCenters}
          selectedProvince={workspace.activeSelectedProvince}
          selectedUnitProvince={workspace.activeSelectedUnit}
          validTargets={workspace.activeValidTargets}
          highlightedUnitProvinces={workspace.activeHighlightedUnits}
          annotations={workspace.activeAnnotations}
          onProvinceClick={workspace.onProvinceClick}
          onUnitClick={workspace.onUnitClick}
        />
      </div>

      <ToolbarDock toolbarGroups={workspace.toolbarGroups} />
      <WorkspaceFlyoutLayer
        flyout={visibleFlyout}
        onClose={() => workspace.setActiveFlyout(null)}
      />
    </div>
  );
}
