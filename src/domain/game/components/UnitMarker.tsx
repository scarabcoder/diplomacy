import { memo } from 'react';
import { POWER_COLORS, type Power } from '@/domain/game/engine/types.ts';
import { BattleshipTokenGlyph, TankTokenGlyph } from './unit-token-icons.tsx';

interface UnitMarkerProps {
  cx: number;
  cy: number;
  power: Power;
  unitType: 'army' | 'fleet';
  isSelected?: boolean;
  isEmphasized?: boolean;
  isGhost?: boolean;
  onClick?: () => void;
}

export const UnitMarker = memo(function UnitMarker({
  cx,
  cy,
  power,
  unitType,
  isSelected = false,
  isEmphasized = false,
  isGhost = false,
  onClick,
}: UnitMarkerProps) {
  const color = POWER_COLORS[power];

  // Use a lighter text color for dark backgrounds, darker for light
  const textColor = power === 'russia' ? '#1a1a1a' : '#fff';
  const strokeColor = isSelected
    ? '#f8fafc'
    : isEmphasized
      ? '#fbbf24'
      : '#1a1a1a';
  const strokeWidth = isSelected ? 3 : isEmphasized ? 2.5 : 1.5;
  const radius = isSelected ? 12 : isEmphasized ? 11 : 10;
  const iconTransform =
    unitType === 'army'
      ? 'translate(-6.8 -8.35) scale(0.57)'
      : 'translate(-6.95 -8.2) scale(0.57)';

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      pointerEvents={onClick ? 'all' : 'none'}
      cursor={onClick ? 'pointer' : 'default'}
      onClick={onClick}
    >
      <circle
        r={radius}
        fill={color}
        fillOpacity={isGhost ? 0.4 : 1}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <g
        transform={iconTransform}
        fill={textColor}
        stroke={textColor}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        color={textColor}
        opacity={isGhost ? 0.6 : 1}
        pointerEvents="none"
      >
        {unitType === 'army' ? <TankTokenGlyph /> : <BattleshipTokenGlyph />}
      </g>
    </g>
  );
});
