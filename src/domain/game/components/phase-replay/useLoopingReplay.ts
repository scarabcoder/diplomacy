import { useEffect, useState } from 'react';
import { getBaseProvince } from '@/domain/game/lib/province-refs.ts';
import type { Power, UnitType } from '@/domain/game/engine/types.ts';

export const LOOP_MOVE_MS = 3000;
export const LOOP_FADE_MS = 500;
export const LOOP_PAUSE_MS = 500;
export const LOOP_TOTAL_MS = LOOP_MOVE_MS + LOOP_FADE_MS + LOOP_PAUSE_MS;

export type ReplayMovingUnit = {
  id: string;
  from: string;
  to: string;
  power: Power;
  unitType: UnitType;
};

function easeInOut(progress: number): number {
  return 0.5 - Math.cos(Math.PI * progress) / 2;
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefers(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);
  return prefers;
}

export type LoopingReplayState = {
  hasAnimation: boolean;
  moveProgress: number;
  overlayOpacity: number;
  hiddenSourceProvinces: string[];
};

/**
 * Drives the concurrent-loop replay animation. All units move in parallel over
 * LOOP_MOVE_MS, then the overlay fades over LOOP_FADE_MS, then pauses before
 * restarting. Used by both the phase-results screen and the in-chat proposal
 * dialog.
 */
export function useLoopingReplay(
  movingUnits: ReplayMovingUnit[],
  resetKey: string,
): LoopingReplayState {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [loopElapsedMs, setLoopElapsedMs] = useState(0);

  const hasAnimation = !prefersReducedMotion && movingUnits.length > 0;

  useEffect(() => {
    setLoopElapsedMs(0);
    if (!hasAnimation) return;

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
  }, [hasAnimation, resetKey]);

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

  return {
    hasAnimation,
    moveProgress,
    overlayOpacity,
    hiddenSourceProvinces,
  };
}
