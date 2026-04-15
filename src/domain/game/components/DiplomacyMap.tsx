import { useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button.tsx';
import classicMapAssetUrl from '@/domain/game/assets-classic-map.svg?url';
import type { OrderAnnotation } from '@/domain/game/engine/order-drafting.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import { POWER_COLORS } from '@/domain/game/engine/types.ts';
import type {
  Power,
  SupplyCenterOwnership,
  UnitPositions,
  UnitType,
} from '@/domain/game/engine/types.ts';
import { getBaseProvince, getCoast } from '@/domain/game/lib/province-refs.ts';
import { useClassicMap } from '@/domain/game/hooks/use-classic-map.ts';
import { Territory } from './Territory.tsx';
import { UnitMarker } from './UnitMarker.tsx';

const OVERLAY_WATER_COLOR = '#7da6cc';
const OVERLAY_LAND_COLOR = '#d5b67b';

interface DiplomacyMapProps {
  positions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  selectedProvince?: string | null;
  selectedUnitProvince?: string | null;
  validTargets?: string[];
  highlightedUnitProvinces?: string[];
  annotations?: OrderAnnotation[];
  overlayUnits?: Array<{
    id: string;
    province: string;
    power: Power;
    unitType: UnitType;
    coast?: string | null;
    isGhost?: boolean;
    isEmphasized?: boolean;
  }>;
  hiddenUnitProvinces?: string[];
  hideControls?: boolean;
  interactionLocked?: boolean;
  onProvinceClick?: (provinceId: string) => void;
  onUnitClick?: (provinceId: string) => void;
}

function getAnnotationColor(annotation: OrderAnnotation): string {
  const tone = 'tone' in annotation ? annotation.tone : undefined;

  if (tone === 'failure') {
    return '#ef4444';
  }

  if (tone === 'info') {
    return '#94a3b8';
  }

  if (annotation.kind === 'retreat') {
    return '#10b981';
  }

  if (annotation.kind === 'support') {
    return '#f59e0b';
  }

  if (annotation.kind === 'convoy') {
    return '#38bdf8';
  }

  if (annotation.kind === 'build') {
    return '#65a30d';
  }

  if (annotation.kind === 'disband') {
    return '#ef4444';
  }

  if (annotation.kind === 'hold') {
    return '#22c55e';
  }

  return '#f8fafc';
}

function getTerritoryFill(
  id: string,
  supplyCenters: SupplyCenterOwnership,
): string {
  const province = PROVINCES[getBaseProvince(id)];
  if (province?.type === 'water') return OVERLAY_WATER_COLOR;

  const owner = supplyCenters[getBaseProvince(id)];
  if (owner) {
    return lightenColor(POWER_COLORS[owner as Power], 0.35);
  }

  return OVERLAY_LAND_COLOR;
}

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);

  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function getAnnotationCenter(
  centers: Record<string, { x: number; y: number }>,
  provinceRef: string,
) {
  return centers[provinceRef] ?? centers[getBaseProvince(provinceRef)];
}

function drawArrowPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = Math.min(22, distance * 0.18);
  const startX = from.x + (dx / distance) * offset;
  const startY = from.y + (dy / distance) * offset;
  const endX = to.x - (dx / distance) * offset;
  const endY = to.y - (dy / distance) * offset;

  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

function renderAnnotation(
  annotation: OrderAnnotation,
  centers: Record<string, { x: number; y: number }>,
) {
  const from = getAnnotationCenter(centers, annotation.from);
  if (!from) {
    return null;
  }

  if (annotation.kind === 'hold') {
    const color = getAnnotationColor(annotation);
    return (
      <circle
        key={annotation.id}
        cx={from.x}
        cy={from.y}
        r={16}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray="4 3"
      />
    );
  }

  if (annotation.kind === 'build') {
    const color = getAnnotationColor(annotation);
    return (
      <g key={annotation.id}>
        <circle
          cx={from.x}
          cy={from.y}
          r={14}
          fill={color}
          fillOpacity={0.92}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="4 3"
        />
        <text
          x={from.x}
          y={from.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
          fill="#0f172a"
        >
          {annotation.unitType === 'fleet' ? 'F' : 'A'}
        </text>
      </g>
    );
  }

  if (annotation.kind === 'disband') {
    const color = getAnnotationColor(annotation);
    return (
      <g key={annotation.id}>
        <circle
          cx={from.x}
          cy={from.y}
          r={16}
          fill="none"
          stroke={color}
          strokeWidth={3}
        />
        <path
          d={`M ${from.x - 10} ${from.y - 10} L ${from.x + 10} ${from.y + 10} M ${from.x + 10} ${from.y - 10} L ${from.x - 10} ${from.y + 10}`}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    );
  }

  const to = annotation.to ? getAnnotationCenter(centers, annotation.to) : null;
  if (!to) {
    return null;
  }

  const color = getAnnotationColor(annotation);
  const dashArray =
    annotation.kind === 'support'
      ? '5 4'
      : annotation.kind === 'convoy'
        ? '3 4'
        : undefined;
  const marker =
    annotation.kind === 'support' || annotation.kind === 'convoy'
      ? 'url(#order-dot)'
      : 'url(#order-arrow)';

  return (
    <g key={annotation.id}>
      <path
        d={drawArrowPath(from, to)}
        fill="none"
        stroke={color}
        strokeWidth={annotation.kind === 'support' ? 3 : 4}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        markerEnd={marker}
      />
      {annotation.aux &&
        (() => {
          const aux = getAnnotationCenter(centers, annotation.aux);
          if (!aux) {
            return null;
          }

          return (
            <path
              d={drawArrowPath(to, aux)}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeDasharray="5 4"
              strokeLinecap="round"
              markerEnd="url(#order-arrow)"
            />
          );
        })()}
    </g>
  );
}

export function DiplomacyMap({
  positions,
  supplyCenters,
  selectedProvince = null,
  selectedUnitProvince = null,
  validTargets = [],
  highlightedUnitProvinces = [],
  annotations = [],
  overlayUnits = [],
  hiddenUnitProvinces = [],
  hideControls = false,
  interactionLocked = false,
  onProvinceClick,
  onUnitClick,
}: DiplomacyMapProps) {
  const mapData = useClassicMap();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const validTargetSet = new Set(validTargets);
  const highlightedUnitSet = new Set(highlightedUnitProvinces);
  const hiddenUnitSet = new Set(hiddenUnitProvinces.map(getBaseProvince));
  const hoveredBaseId = hoveredId ? getBaseProvince(hoveredId) : null;
  const selectedBaseProvince = selectedProvince
    ? getBaseProvince(selectedProvince)
    : null;

  if (!mapData) {
    return (
      <div className="h-full w-full overflow-hidden rounded-lg border bg-[#e7dfc8] p-6 text-sm text-muted-foreground">
        Loading map...
      </div>
    );
  }

  const baseProvinceOverlays = mapData.provinces.filter(
    (province) => !getCoast(province.id) && province.id in PROVINCES,
  );
  const coastOverlays = mapData.provinces.filter((province) =>
    Boolean(getCoast(province.id)),
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#e7dfc8]">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={5}
        disabled={interactionLocked}
        centerOnInit
        centerZoomedOut
        limitToBounds
        wheel={{ step: 0.08, disabled: interactionLocked }}
        panning={{ disabled: interactionLocked }}
        pinch={{ disabled: interactionLocked }}
        doubleClick={{ disabled: true }}
      >
        {({ resetTransform, zoomIn, zoomOut }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%' }}
            >
              <svg
                viewBox={`0 0 ${mapData.width} ${mapData.height}`}
                className="h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <marker
                    id="order-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="5"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                  </marker>
                  <marker
                    id="order-dot"
                    markerWidth="6"
                    markerHeight="6"
                    refX="3"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <circle cx="3" cy="3" r="2.4" fill="currentColor" />
                  </marker>
                </defs>

                <image
                  href={classicMapAssetUrl}
                  width={mapData.width}
                  height={mapData.height}
                  preserveAspectRatio="none"
                />

                <g className="territories">
                  {baseProvinceOverlays.map((province) => {
                    const provinceData = PROVINCES[province.id];
                    if (!provinceData) return null;

                    const isSelected =
                      selectedProvince === province.id ||
                      selectedBaseProvince === province.id ||
                      selectedUnitProvince === province.id;
                    const isValidTarget =
                      validTargetSet.has(province.id) ||
                      [...validTargetSet].some(
                        (target) => getBaseProvince(target) === province.id,
                      );

                    return (
                      <Territory
                        key={province.id}
                        id={province.id}
                        d={province.d}
                        fill={getTerritoryFill(province.id, supplyCenters)}
                        fillOpacity={
                          provinceData.type === 'water'
                            ? 0.14
                            : provinceData.supplyCenter
                              ? 0.18
                              : 0.1
                        }
                        isSelected={isSelected}
                        isHovered={hoveredBaseId === province.id}
                        isValidTarget={isValidTarget}
                        onClick={() => onProvinceClick?.(province.id)}
                        onMouseEnter={() => setHoveredId(province.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      />
                    );
                  })}
                </g>

                <g className="coasts">
                  {coastOverlays.map((province) => {
                    const isSelected = selectedProvince === province.id;
                    const isValidTarget = validTargetSet.has(province.id);
                    const isHovered = hoveredId === province.id;
                    // Coast overlays only need to capture clicks when
                    // they're explicitly valid targets (e.g., fleet moves
                    // to a specific coast). Otherwise, let clicks pass
                    // through to the base territory underneath.
                    const needsInteraction =
                      isSelected || isValidTarget;

                    return (
                      <path
                        key={province.id}
                        data-territory-id={province.id}
                        d={province.d}
                        fill="transparent"
                        stroke={
                          isSelected || isValidTarget || isHovered
                            ? '#fbbf24'
                            : 'transparent'
                        }
                        strokeWidth={
                          isSelected || isValidTarget || isHovered ? 3 : 0
                        }
                        filter={isSelected ? 'url(#glow)' : undefined}
                        cursor={needsInteraction ? 'pointer' : undefined}
                        pointerEvents={needsInteraction ? 'all' : 'none'}
                        onClick={
                          needsInteraction
                            ? () => onProvinceClick?.(province.id)
                            : undefined
                        }
                        onMouseEnter={
                          needsInteraction
                            ? () => setHoveredId(province.id)
                            : undefined
                        }
                        onMouseLeave={
                          needsInteraction
                            ? () => setHoveredId(null)
                            : undefined
                        }
                        style={{
                          transition: 'stroke-width 150ms ease',
                        }}
                      />
                    );
                  })}
                </g>

                <g
                  className="annotations"
                  pointerEvents="none"
                  style={{ color: '#f8fafc' }}
                >
                  {annotations.map((annotation) =>
                    renderAnnotation(annotation, mapData.centers),
                  )}
                </g>

                <g className="supply-centers" pointerEvents="none">
                  {Object.entries(supplyCenters).map(([provinceId, owner]) => {
                    const center = mapData.centers[provinceId];
                    if (!center) return null;

                    return (
                      <g
                        key={`sc-${provinceId}`}
                        transform={`translate(${center.x}, ${center.y})`}
                      >
                        <circle
                          r={5}
                          fill={
                            owner ? POWER_COLORS[owner as Power] : '#6b7280'
                          }
                          stroke="#2f2417"
                          strokeWidth={1.5}
                        />
                        <circle r={2.2} fill="#fff" fillOpacity={0.85} />
                      </g>
                    );
                  })}
                </g>

                <g className="units">
                  {Object.entries(positions).map(([province, unit]) => {
                    if (hiddenUnitSet.has(getBaseProvince(province))) {
                      return null;
                    }

                    const provinceRef = unit.coast
                      ? `${province}/${unit.coast}`
                      : province;
                    const center =
                      mapData.centers[provinceRef] ??
                      mapData.centers[province] ??
                      mapData.centers[getBaseProvince(province)];
                    if (!center) return null;

                    return (
                      <UnitMarker
                        key={`unit-${provinceRef}`}
                        cx={center.x}
                        cy={center.y}
                        power={unit.power}
                        unitType={unit.unitType}
                        isSelected={selectedUnitProvince === province}
                        isEmphasized={highlightedUnitSet.has(province)}
                        onClick={() => onUnitClick?.(province)}
                      />
                    );
                  })}
                </g>

                <g className="overlay-units" pointerEvents="none">
                  {overlayUnits.map((unit) => {
                    const provinceRef = unit.coast
                      ? `${unit.province}/${unit.coast}`
                      : unit.province;
                    const center =
                      mapData.centers[provinceRef] ??
                      mapData.centers[unit.province] ??
                      mapData.centers[getBaseProvince(unit.province)];
                    if (!center) {
                      return null;
                    }

                    return (
                      <UnitMarker
                        key={unit.id}
                        cx={center.x}
                        cy={center.y}
                        power={unit.power}
                        unitType={unit.unitType}
                        isEmphasized={unit.isEmphasized}
                        isGhost={unit.isGhost}
                      />
                    );
                  })}
                </g>

                {hoveredId &&
                  (() => {
                    const provinceId = getBaseProvince(hoveredId);
                    const province = PROVINCES[provinceId];
                    const center =
                      mapData.centers[hoveredId] ?? mapData.centers[provinceId];
                    if (!province || !center) return null;

                    const unit = positions[provinceId];
                    const owner = supplyCenters[provinceId];
                    const coast = getCoast(hoveredId);

                    let tooltipText = province.name;
                    if (coast) {
                      tooltipText += ` (${coast.toUpperCase()})`;
                    }
                    if (unit) {
                      tooltipText += ` — ${unit.unitType === 'army' ? 'Army' : 'Fleet'} (${unit.power})`;
                    }
                    if (owner) {
                      tooltipText += province.supplyCenter
                        ? ` [SC: ${owner}]`
                        : ` [Owned by ${owner}]`;
                    } else if (province.supplyCenter) {
                      tooltipText += ' [SC: neutral]';
                    }

                    return (
                      <g pointerEvents="none">
                        <rect
                          x={center.x - 86}
                          y={center.y - 32}
                          width={172}
                          height={24}
                          rx={4}
                          fill="#111827"
                          fillOpacity={0.92}
                        />
                        <text
                          x={center.x}
                          y={center.y - 17}
                          textAnchor="middle"
                          fill="#fff"
                          fontSize={10}
                          fontFamily="system-ui, sans-serif"
                        >
                          {tooltipText}
                        </text>
                      </g>
                    );
                  })()}
              </svg>
            </TransformComponent>

            <div className="pointer-events-none absolute right-4 top-4 z-10 flex gap-2">
              <div
                className={
                  hideControls
                    ? 'pointer-events-none opacity-0'
                    : 'pointer-events-auto flex gap-2 rounded-full border border-black/10 bg-white/85 p-1 shadow-lg backdrop-blur transition-opacity'
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-3"
                  onClick={() => zoomOut(0.2)}
                >
                  -
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-3"
                  onClick={() => resetTransform(250)}
                >
                  100%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-3"
                  onClick={() => zoomIn(0.2)}
                >
                  +
                </Button>
              </div>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
