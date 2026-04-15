import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { orpcUtils } from '@/rpc/react.ts';
import type {
  PhaseResultAlert,
  PhaseResultAnnotation,
  GamePhaseResultPayload,
  PhaseResultItem,
  PhaseResultStatus,
} from '@/domain/game/phase-results.ts';
import {
  useClassicMap,
  type ClassicMapData,
} from '@/domain/game/hooks/use-classic-map.ts';
import { getBaseProvince } from '@/domain/game/lib/province-refs.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { DiplomacyMap } from './DiplomacyMap.tsx';
import { UnitMarker } from './UnitMarker.tsx';

const REPLAY_CAMERA_MOVE_DURATION_MS = 1000;
const REPLAY_ACTION_ANIMATION_DURATION_MS = 1000;
const REPLAY_ACTION_HOLD_DURATION_MS = 1500;
const REPLAY_RESET_DURATION_MS = 1000;
const REPLAY_MAX_CAMERA_SCALE = 3.2;
const REPLAY_MIN_CAMERA_SCALE = 1.85;
const REPLAY_FOCUS_PADDING_PX = 90;
const REPLAY_MIN_FOCUS_WIDTH_PX = 180;
const REPLAY_MIN_FOCUS_HEIGHT_PX = 140;

type ReplayCameraFrame = {
  scale: number;
  translateX: number;
  translateY: number;
};

type ReplayViewport = {
  width: number;
  height: number;
};

type ReplayActionStep = {
  annotation: PhaseResultAnnotation;
  movingUnit: {
    id: string;
    from: string;
    to: string;
    power: NonNullable<PhaseResultAnnotation['power']>;
    unitType: NonNullable<PhaseResultAnnotation['unitType']>;
  } | null;
};

const DEFAULT_CAMERA_FRAME: ReplayCameraFrame = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function statusClasses(status: PhaseResultStatus): string {
  if (status === 'success') {
    return 'bg-emerald-100 text-emerald-900';
  }

  if (status === 'failure') {
    return 'bg-rose-100 text-rose-900';
  }

  return 'bg-slate-200 text-slate-800';
}

function itemStatusLabel(item: PhaseResultItem): string {
  if (item.status === 'success') {
    return 'Resolved';
  }

  if (item.status === 'failure') {
    return 'Rejected';
  }

  return 'Note';
}

function alertClasses(tone: PhaseResultAlert['tone']): string {
  if (tone === 'danger') {
    return 'border-rose-200 bg-rose-50/90 text-rose-950';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50/90 text-amber-950';
  }

  return 'border-slate-200 bg-slate-50/90 text-slate-950';
}

function phaseLabel(phase: GamePhaseResultPayload['phase']): string {
  if (phase === 'order_submission') {
    return 'Orders';
  }

  if (phase === 'retreat_submission') {
    return 'Retreats';
  }

  return 'Adjustments';
}

function easeInOut(progress: number): number {
  return 0.5 - Math.cos(Math.PI * progress) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function interpolateCameraFrame(
  from: ReplayCameraFrame,
  to: ReplayCameraFrame,
  progress: number,
): ReplayCameraFrame {
  return {
    scale: interpolateNumber(from.scale, to.scale, progress),
    translateX: interpolateNumber(from.translateX, to.translateX, progress),
    translateY: interpolateNumber(from.translateY, to.translateY, progress),
  };
}

function getAnnotationFocusPoints(
  annotation: PhaseResultAnnotation,
  centers: ClassicMapData['centers'],
) {
  return [annotation.from, annotation.to, annotation.aux]
    .filter((value): value is string => Boolean(value))
    .map(
      (provinceRef) =>
        centers[provinceRef] ?? centers[getBaseProvince(provinceRef)],
    )
    .filter((center): center is { x: number; y: number } => Boolean(center));
}

function getCameraFrameForAnnotation(
  annotation: PhaseResultAnnotation,
  mapData: ClassicMapData | null,
  viewport: ReplayViewport,
): ReplayCameraFrame {
  if (!mapData || viewport.width <= 0 || viewport.height <= 0) {
    return DEFAULT_CAMERA_FRAME;
  }

  const points = getAnnotationFocusPoints(annotation, mapData.centers);
  if (points.length === 0) {
    return DEFAULT_CAMERA_FRAME;
  }

  const fitScale = Math.min(
    viewport.width / mapData.width,
    viewport.height / mapData.height,
  );
  const renderedWidth = mapData.width * fitScale;
  const renderedHeight = mapData.height * fitScale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  const screenPoints = points.map((point) => ({
    x: offsetX + point.x * fitScale,
    y: offsetY + point.y * fitScale,
  }));
  const xs = screenPoints.map((point) => point.x);
  const ys = screenPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boxWidth = Math.max(maxX - minX, REPLAY_MIN_FOCUS_WIDTH_PX);
  const boxHeight = Math.max(maxY - minY, REPLAY_MIN_FOCUS_HEIGHT_PX);
  const targetScale = clamp(
    Math.min(
      viewport.width / (boxWidth + REPLAY_FOCUS_PADDING_PX * 2),
      viewport.height / (boxHeight + REPLAY_FOCUS_PADDING_PX * 2),
    ),
    REPLAY_MIN_CAMERA_SCALE,
    REPLAY_MAX_CAMERA_SCALE,
  );

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const unclampedTranslateX = viewport.width / 2 - centerX * targetScale;
  const unclampedTranslateY = viewport.height / 2 - centerY * targetScale;

  return {
    scale: targetScale,
    translateX: clamp(
      unclampedTranslateX,
      viewport.width * (1 - targetScale),
      0,
    ),
    translateY: clamp(
      unclampedTranslateY,
      viewport.height * (1 - targetScale),
      0,
    ),
  };
}

export function GamePhaseResultsScreen({
  roomName,
  roomCode,
  phaseResultId,
  payload,
  onAcknowledged,
}: {
  roomName: string;
  roomCode: string;
  phaseResultId: string;
  payload: GamePhaseResultPayload;
  onAcknowledged: () => void;
}) {
  const acknowledgeMutation = useMutation(
    orpcUtils.game.acknowledgePhaseResult.mutationOptions(),
  );
  const mapData = useClassicMap();
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const [replayCount, setReplayCount] = useState(0);
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mapViewport, setMapViewport] = useState<ReplayViewport>({
    width: 0,
    height: 0,
  });

  const actionSteps = useMemo<ReplayActionStep[]>(
    () =>
      payload.annotations
        .filter((annotation) => annotation.kind !== 'hold')
        .map((annotation) => ({
          annotation,
          movingUnit:
            (annotation.kind === 'move' || annotation.kind === 'retreat') &&
            annotation.to &&
            annotation.power &&
            annotation.unitType &&
            annotation.tone === 'success'
              ? {
                  id: annotation.id,
                  from: annotation.from,
                  to: annotation.to,
                  power: annotation.power,
                  unitType: annotation.unitType,
                }
              : null,
        })),
    [payload.annotations],
  );
  const replayStepDurationMs =
    REPLAY_CAMERA_MOVE_DURATION_MS +
    REPLAY_ACTION_ANIMATION_DURATION_MS +
    REPLAY_ACTION_HOLD_DURATION_MS;
  const replayActionDurationMs = actionSteps.length * replayStepDurationMs;
  const totalReplayDurationMs =
    replayActionDurationMs + REPLAY_RESET_DURATION_MS;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => {
      mediaQuery.removeEventListener('change', updatePreference);
    };
  }, []);

  useEffect(() => {
    const element = mapViewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateViewport = () => {
      const nextViewport = {
        width: element.clientWidth,
        height: element.clientHeight,
      };

      setMapViewport((current) =>
        current.width === nextViewport.width &&
        current.height === nextViewport.height
          ? current
          : nextViewport,
      );
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setReplayElapsedMs(0);

    if (prefersReducedMotion || actionSteps.length === 0) {
      return;
    }

    let animationFrame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(now - startedAt, totalReplayDurationMs);
      setReplayElapsedMs(elapsed);
      if (elapsed < totalReplayDurationMs) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [
    actionSteps.length,
    phaseResultId,
    prefersReducedMotion,
    replayCount,
    totalReplayDurationMs,
  ]);

  const cameraFrames = useMemo(
    () =>
      actionSteps.map((step) =>
        getCameraFrameForAnnotation(step.annotation, mapData, mapViewport),
      ),
    [actionSteps, mapData, mapViewport],
  );
  const hasAnimatedReplay = !prefersReducedMotion && actionSteps.length > 0;
  const isReplaying =
    hasAnimatedReplay && replayElapsedMs < replayActionDurationMs;
  const isResetting =
    hasAnimatedReplay &&
    replayElapsedMs >= replayActionDurationMs &&
    replayElapsedMs < totalReplayDurationMs;
  const resolvedBoardProgress = hasAnimatedReplay
    ? isResetting
      ? easeInOut(
          (replayElapsedMs - replayActionDurationMs) / REPLAY_RESET_DURATION_MS,
        )
      : replayElapsedMs >= totalReplayDurationMs
        ? 1
        : 0
    : 1;
  const showResolvedBoard = resolvedBoardProgress === 1;
  const interactionLocked =
    hasAnimatedReplay && replayElapsedMs < totalReplayDurationMs;
  const activeStepIndex = isReplaying
    ? Math.min(
        actionSteps.length - 1,
        Math.floor(replayElapsedMs / replayStepDurationMs),
      )
    : null;
  const activeStep =
    activeStepIndex === null ? null : actionSteps[activeStepIndex];
  const activeStepElapsedMs =
    activeStepIndex === null
      ? 0
      : replayElapsedMs - activeStepIndex * replayStepDurationMs;
  const activeStepProgress =
    activeStepIndex === null
      ? 0
      : easeInOut(
          Math.min(1, activeStepElapsedMs / REPLAY_CAMERA_MOVE_DURATION_MS),
        );
  const activeActionElapsedMs =
    activeStepIndex === null
      ? 0
      : Math.max(0, activeStepElapsedMs - REPLAY_CAMERA_MOVE_DURATION_MS);
  const activeActionProgress =
    activeStepIndex === null
      ? 0
      : easeInOut(
          Math.min(
            1,
            activeActionElapsedMs / REPLAY_ACTION_ANIMATION_DURATION_MS,
          ),
        );
  const isAnimatingAction =
    activeStepIndex !== null &&
    activeStepElapsedMs >= REPLAY_CAMERA_MOVE_DURATION_MS &&
    activeActionElapsedMs <=
      REPLAY_ACTION_ANIMATION_DURATION_MS + REPLAY_ACTION_HOLD_DURATION_MS;
  const currentCameraFrame = isReplaying
    ? interpolateCameraFrame(
        activeStepIndex && activeStepIndex > 0
          ? (cameraFrames[activeStepIndex - 1] ?? DEFAULT_CAMERA_FRAME)
          : DEFAULT_CAMERA_FRAME,
        cameraFrames[activeStepIndex ?? 0] ?? DEFAULT_CAMERA_FRAME,
        activeStepProgress,
      )
    : isResetting
      ? interpolateCameraFrame(
          cameraFrames[cameraFrames.length - 1] ?? DEFAULT_CAMERA_FRAME,
          DEFAULT_CAMERA_FRAME,
          resolvedBoardProgress,
        )
      : DEFAULT_CAMERA_FRAME;
  const replayLayerStyle = {
    transformOrigin: '0 0',
    transform: `translate3d(${currentCameraFrame.translateX}px, ${currentCameraFrame.translateY}px, 0) scale(${currentCameraFrame.scale})`,
    willChange: interactionLocked ? 'transform' : 'auto',
  } as const;
  const activeAnnotation = isReplaying
    ? (activeStep?.annotation ?? null)
    : null;
  const activeMovingUnit = isReplaying
    ? (activeStep?.movingUnit ?? null)
    : null;
  const activeMoveProgress = activeMovingUnit ? activeActionProgress : 0;
  const mapAnnotations = activeAnnotation ? [activeAnnotation] : [];
  const beforeOverlayUnits =
    payload.phase === 'retreat_submission'
      ? payload.boardBefore.dislodgedUnits.map((unit) => ({
          id: `before-${unit.power}-${unit.province}`,
          province: unit.province,
          power: unit.power,
          unitType: unit.unitType,
          coast: unit.coast ?? null,
          isGhost: true,
          isEmphasized: true,
        }))
      : [];
  const afterOverlayUnits =
    payload.phase === 'order_submission'
      ? payload.boardAfter.dislodgedUnits.map((unit) => ({
          id: `after-${unit.power}-${unit.province}`,
          province: unit.province,
          power: unit.power,
          unitType: unit.unitType,
          coast: unit.coast ?? null,
          isGhost: true,
          isEmphasized: true,
        }))
      : [];
  const beforeOpacity = 1 - resolvedBoardProgress;
  const afterOpacity = resolvedBoardProgress;
  const beforeMapClassName = '';
  const afterMapClassName = '';
  const annotationClassName =
    activeAnnotation || showResolvedBoard || isResetting
      ? 'opacity-100 translate-y-0'
      : 'opacity-0 translate-y-1';
  const replayMapKey = `${phaseResultId}-${replayCount}`;
  const alerts = payload.alerts ?? [];
  const hiddenBeforeUnits =
    activeMovingUnit && isAnimatingAction
      ? [getBaseProvince(activeMovingUnit.from)]
      : [];
  const hiddenAfterUnits =
    activeMovingUnit &&
    activeActionElapsedMs < REPLAY_ACTION_ANIMATION_DURATION_MS &&
    resolvedBoardProgress < 1
      ? [getBaseProvince(activeMovingUnit.to)]
      : [];
  const replayStatusLabel = showResolvedBoard
    ? 'Resolved board'
    : isResetting
      ? 'Settling board'
      : activeStepIndex !== null
        ? `Reviewing action ${activeStepIndex + 1} of ${actionSteps.length}`
        : 'Adjudicating';

  return (
    <div className="min-h-dvh bg-[linear-gradient(160deg,#f7f1df_0%,#e4d5b3_40%,#d0c2a6_100%)] px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/10 bg-white/88 p-6 shadow-xl backdrop-blur md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {roomName} · {roomCode} · {phaseLabel(payload.phase)}
            </div>
            <div>
              <h1 className="font-serif text-3xl text-slate-950 md:text-4xl">
                {payload.headline}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Replay the adjudication, review every accepted move, and inspect
                anything the engine rejected.
              </p>
            </div>
            {payload.winnerPower ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
                <Trophy className="size-4" />
                <PowerName
                  className="gap-1.5"
                  flagClassName="h-3.5 w-5"
                  power={payload.winnerPower}
                />
                <span>wins the board.</span>
              </div>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setReplayCount((value) => value + 1)}
            >
              <RotateCcw className="mr-2 size-4" />
              Replay
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={acknowledgeMutation.isPending}
              onClick={async () => {
                await acknowledgeMutation.mutateAsync({
                  phaseResultId,
                });
                onAcknowledged();
              }}
            >
              Continue
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.95fr)]">
          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/86 shadow-xl backdrop-blur">
            <CardContent className="p-0">
              <div
                ref={mapViewportRef}
                className="relative h-[58vh] min-h-[32rem] overflow-hidden"
              >
                <div
                  className={`absolute inset-0 z-[1] ${interactionLocked ? 'pointer-events-none' : 'pointer-events-auto'}`}
                  style={replayLayerStyle}
                >
                  <div
                    className={`absolute inset-0 ${beforeMapClassName} pointer-events-none`}
                    style={{ opacity: beforeOpacity }}
                  >
                    <DiplomacyMap
                      key={`before-${replayMapKey}`}
                      positions={payload.boardBefore.positions}
                      supplyCenters={payload.boardBefore.supplyCenters}
                      annotations={mapAnnotations}
                      overlayUnits={beforeOverlayUnits}
                      hiddenUnitProvinces={hiddenBeforeUnits}
                      hideControls
                      interactionLocked
                    />
                  </div>
                  <div
                    className={`absolute inset-0 ${afterMapClassName} ${
                      interactionLocked
                        ? 'pointer-events-none'
                        : 'pointer-events-auto'
                    }`}
                    style={{ opacity: afterOpacity }}
                  >
                    <DiplomacyMap
                      key={`after-${replayMapKey}`}
                      positions={payload.boardAfter.positions}
                      supplyCenters={payload.boardAfter.supplyCenters}
                      annotations={mapAnnotations}
                      overlayUnits={afterOverlayUnits}
                      hiddenUnitProvinces={hiddenAfterUnits}
                      hideControls
                      interactionLocked={interactionLocked}
                    />
                  </div>
                  {mapData && activeMovingUnit ? (
                    <div className="pointer-events-none absolute inset-0 z-[5]">
                      <svg
                        viewBox={`0 0 ${mapData.width} ${mapData.height}`}
                        className="h-full w-full"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {(() => {
                          const start =
                            mapData.centers[activeMovingUnit.from] ??
                            mapData.centers[
                              getBaseProvince(activeMovingUnit.from)
                            ];
                          const end =
                            mapData.centers[activeMovingUnit.to] ??
                            mapData.centers[
                              getBaseProvince(activeMovingUnit.to)
                            ];
                          if (!start || !end) {
                            return null;
                          }

                          const cx =
                            start.x + (end.x - start.x) * activeMoveProgress;
                          const cy =
                            start.y + (end.y - start.y) * activeMoveProgress;

                          return (
                            <UnitMarker
                              key={activeMovingUnit.id}
                              cx={cx}
                              cy={cy}
                              power={activeMovingUnit.power}
                              unitType={activeMovingUnit.unitType}
                              isEmphasized
                            />
                          );
                        })()}
                      </svg>
                    </div>
                  ) : null}
                </div>
                <div className="pointer-events-none absolute left-4 top-4 z-10">
                  <div
                    className={`rounded-full border border-black/10 bg-white/84 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-lg backdrop-blur transition-all duration-300 ease-out ${annotationClassName}`}
                  >
                    {replayStatusLabel}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {alerts.map((alert) => (
              <Card
                key={alert.id}
                className={`rounded-[2rem] border shadow-xl backdrop-blur ${alertClasses(
                  alert.tone,
                )}`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="size-5" />
                    {alert.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alert.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.4rem] border border-current/10 bg-white/50 p-4"
                    >
                      <div className="text-sm font-semibold">
                        {item.summary}
                      </div>
                      {item.detail ? (
                        <div className="mt-1 text-sm opacity-80">
                          {item.detail}
                        </div>
                      ) : null}
                      {item.power ? (
                        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                          <PowerName
                            className="gap-1.5"
                            flagClassName="h-3 w-4.5"
                            power={item.power}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            {payload.groups.map((group) => (
              <Card
                key={group.id}
                className="rounded-[2rem] border-black/10 bg-white/88 shadow-xl backdrop-blur"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-slate-950">
                    {group.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.4rem] border border-black/10 bg-black/[0.03] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">
                            {item.summary}
                          </div>
                          {item.detail ? (
                            <div className="mt-1 text-sm text-slate-600">
                              {item.detail}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(
                            item.status,
                          )}`}
                        >
                          {itemStatusLabel(item)}
                        </span>
                      </div>
                      {item.power ? (
                        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <PowerName
                            className="gap-1.5"
                            flagClassName="h-3 w-4.5"
                            power={item.power}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
