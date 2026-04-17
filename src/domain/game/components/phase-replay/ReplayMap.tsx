import type { OrderAnnotation } from '@/domain/game/engine/order-drafting.ts';
import type {
  DislodgedUnit,
  Power,
  SupplyCenterOwnership,
  UnitPositions,
  UnitType,
} from '@/domain/game/engine/types.ts';
import { getBaseProvince } from '@/domain/game/lib/province-refs.ts';
import { DiplomacyMap } from '../DiplomacyMap.tsx';
import { UnitMarker } from '../UnitMarker.tsx';
import { useLoopingReplay, type ReplayMovingUnit } from './useLoopingReplay.ts';

type OverlayUnit = {
  id: string;
  province: string;
  power: Power;
  unitType: UnitType;
  coast?: string | null;
  isGhost?: boolean;
  isEmphasized?: boolean;
};

export type ReplayMapProps = {
  positions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  annotations: OrderAnnotation[];
  movingUnits: ReplayMovingUnit[];
  resetKey: string;
  overlayUnits?: OverlayUnit[];
  dislodgedUnits?: DislodgedUnit[];
};

/**
 * Renders a DiplomacyMap with a looping replay animation of the supplied
 * movingUnits. Reused by the phase-results screen and the order-proposal
 * viewing dialog.
 */
export function ReplayMap({
  positions,
  supplyCenters,
  annotations,
  movingUnits,
  resetKey,
  overlayUnits,
  dislodgedUnits,
}: ReplayMapProps) {
  const { hasAnimation, moveProgress, overlayOpacity, hiddenSourceProvinces } =
    useLoopingReplay(movingUnits, resetKey);

  const resolvedOverlayUnits: OverlayUnit[] =
    overlayUnits ??
    (dislodgedUnits
      ? dislodgedUnits.map((unit) => ({
          id: `dislodged-${unit.power}-${unit.province}`,
          province: unit.province,
          power: unit.power,
          unitType: unit.unitType,
          coast: unit.coast ?? null,
          isGhost: true,
          isEmphasized: true,
        }))
      : []);

  return (
    <DiplomacyMap
      key={resetKey}
      positions={positions}
      supplyCenters={supplyCenters}
      annotations={annotations}
      overlayUnits={resolvedOverlayUnits}
      hiddenUnitProvinces={hasAnimation ? hiddenSourceProvinces : []}
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
              if (!start || !end) return null;

              const cx = start.x + (end.x - start.x) * moveProgress;
              const cy = start.y + (end.y - start.y) * moveProgress;

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
  );
}
