import { memo } from 'react';
import { POWER_COLORS, type Power } from '@/domain/game/engine/types.ts';

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
  const label = unitType === 'army' ? 'A' : 'F';

  // Use a lighter text color for dark backgrounds, darker for light
  const textColor = power === 'russia' ? '#1a1a1a' : '#fff';
  const strokeColor = isSelected ? '#f8fafc' : isEmphasized ? '#fbbf24' : '#1a1a1a';
  const strokeWidth = isSelected ? 3 : isEmphasized ? 2.5 : 1.5;
  const radius = isSelected ? 12 : isEmphasized ? 11 : 10;

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
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fillOpacity={isGhost ? 0.6 : 1}
        fontSize={11}
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
});
