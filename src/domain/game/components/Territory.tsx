import { memo } from 'react';

interface TerritoryProps {
  id: string;
  d: string;
  fill: string;
  fillOpacity?: number;
  isSelected: boolean;
  isHovered: boolean;
  isValidTarget: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const Territory = memo(function Territory({
  id,
  d,
  fill,
  fillOpacity,
  isSelected,
  isHovered,
  isValidTarget,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: TerritoryProps) {
  let opacity = 1;
  let strokeColor = 'transparent';
  let strokeWidth = 0;
  let filter: string | undefined;

  if (isSelected) {
    strokeColor = '#fff';
    strokeWidth = 2.5;
    filter = 'url(#glow)';
  } else if (isValidTarget) {
    strokeColor = '#fbbf24';
    strokeWidth = 2;
    opacity = 0.85;
  } else if (isHovered) {
    strokeColor = '#fbbf24';
    strokeWidth = 1.5;
    opacity = 0.8;
  }

  return (
    <path
      data-territory-id={id}
      d={d}
      fill={fill}
      fillOpacity={(fillOpacity ?? 1) * opacity}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      filter={filter}
      cursor="pointer"
      pointerEvents="all"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        transition: 'fill-opacity 150ms ease, stroke-width 150ms ease',
      }}
    />
  );
});
