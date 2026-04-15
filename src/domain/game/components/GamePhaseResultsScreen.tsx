import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Trophy } from 'lucide-react';
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
import { getBaseProvince } from '@/domain/game/lib/province-refs.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { DiplomacyMap } from './DiplomacyMap.tsx';
import { UnitMarker } from './UnitMarker.tsx';

const LOOP_MOVE_MS = 3000;
const LOOP_FADE_MS = 500;
const LOOP_PAUSE_MS = 500;
const LOOP_TOTAL_MS = LOOP_MOVE_MS + LOOP_FADE_MS + LOOP_PAUSE_MS;

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [loopElapsedMs, setLoopElapsedMs] = useState(0);

  const movingUnits = useMemo(
    () =>
      payload.annotations
        .filter(
          (annotation): annotation is PhaseResultAnnotation & {
            to: string;
            power: NonNullable<PhaseResultAnnotation['power']>;
            unitType: NonNullable<PhaseResultAnnotation['unitType']>;
          } =>
            (annotation.kind === 'move' || annotation.kind === 'retreat') &&
            annotation.tone === 'success' &&
            Boolean(annotation.to) &&
            Boolean(annotation.power) &&
            Boolean(annotation.unitType),
        )
        .map((annotation) => ({
          id: annotation.id,
          from: annotation.from,
          to: annotation.to,
          power: annotation.power,
          unitType: annotation.unitType,
        })),
    [payload.annotations],
  );

  const hasAnimation = !prefersReducedMotion && movingUnits.length > 0;

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
    setLoopElapsedMs(0);

    if (!hasAnimation) {
      return;
    }

    let animationFrame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      setLoopElapsedMs((now - startedAt) % LOOP_TOTAL_MS);
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [hasAnimation, phaseResultId]);

  const isMoving = hasAnimation && loopElapsedMs < LOOP_MOVE_MS;
  const isFading =
    hasAnimation &&
    loopElapsedMs >= LOOP_MOVE_MS &&
    loopElapsedMs < LOOP_MOVE_MS + LOOP_FADE_MS;

  const moveProgress = isMoving
    ? easeInOut(loopElapsedMs / LOOP_MOVE_MS)
    : isFading
      ? 1
      : 0;

  const overlayOpacity = isMoving
    ? 1
    : isFading
      ? 1 - easeInOut((loopElapsedMs - LOOP_MOVE_MS) / LOOP_FADE_MS)
      : 0;

  const hiddenSourceProvinces =
    overlayOpacity > 0
      ? movingUnits.map((unit) => getBaseProvince(unit.from))
      : [];

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

  const boardPositions = hasAnimation
    ? payload.boardBefore.positions
    : payload.boardAfter.positions;
  const boardSupplyCenters = hasAnimation
    ? payload.boardBefore.supplyCenters
    : payload.boardAfter.supplyCenters;

  const alerts = payload.alerts ?? [];

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
              <div className="relative h-[58vh] min-h-[32rem] overflow-hidden">
                <DiplomacyMap
                  key={phaseResultId}
                  positions={boardPositions}
                  supplyCenters={boardSupplyCenters}
                  annotations={payload.annotations}
                  overlayUnits={beforeOverlayUnits}
                  hiddenUnitProvinces={hiddenSourceProvinces}
                  renderOverlay={(mapData) =>
                    movingUnits.length > 0 && overlayOpacity > 0 ? (
                      <g
                        className="moving-units"
                        pointerEvents="none"
                        opacity={overlayOpacity}
                      >
                        {movingUnits.map((unit) => {
                          const start =
                            mapData.centers[unit.from] ??
                            mapData.centers[getBaseProvince(unit.from)];
                          const end =
                            mapData.centers[unit.to] ??
                            mapData.centers[getBaseProvince(unit.to)];
                          if (!start || !end) {
                            return null;
                          }

                          const cx =
                            start.x + (end.x - start.x) * moveProgress;
                          const cy =
                            start.y + (end.y - start.y) * moveProgress;

                          return (
                            <UnitMarker
                              key={unit.id}
                              cx={cx}
                              cy={cy}
                              power={unit.power}
                              unitType={unit.unitType}
                              isEmphasized
                            />
                          );
                        })}
                      </g>
                    ) : null
                  }
                />
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
