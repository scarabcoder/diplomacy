import type { Power, SupplyCenterOwnership, UnitPositions } from './types.ts';
import { ARMY_ADJACENCIES, FLEET_ADJACENCIES } from './map-adjacencies.ts';
import { PROVINCES } from './map-provinces.ts';
import {
  HOME_SUPPLY_CENTERS,
  INITIAL_SUPPLY_CENTERS,
  STARTING_POSITIONS,
  SUPPLY_CENTERS,
} from './map-setup.ts';
import { getBaseProvince } from '../lib/province-refs.ts';

export {
  ARMY_ADJACENCIES,
  FLEET_ADJACENCIES,
  HOME_SUPPLY_CENTERS,
  INITIAL_SUPPLY_CENTERS,
  PROVINCES,
  STARTING_POSITIONS,
  SUPPLY_CENTERS,
};
export { getBaseProvince, getCoast } from '../lib/province-refs.ts';

export function isMultiCoast(provinceId: string): boolean {
  const province = PROVINCES[provinceId];
  return province?.coasts != null && province.coasts.length > 0;
}

export function getArmyMoves(province: string): string[] {
  return ARMY_ADJACENCIES[province] ?? [];
}

export function getFleetMoves(
  province: string,
  coast?: string | null,
): string[] {
  if (coast) {
    return FLEET_ADJACENCIES[`${province}/${coast}`] ?? [];
  }

  return FLEET_ADJACENCIES[province] ?? [];
}

export function isAdjacent(
  from: string,
  to: string,
  unitType: 'army' | 'fleet',
  fromCoast?: string | null,
): boolean {
  if (unitType === 'army') {
    return getArmyMoves(from).includes(getBaseProvince(to));
  }

  const destinations = getFleetMoves(from, fromCoast);
  if (destinations.includes(to)) {
    return true;
  }

  const baseDestination = getBaseProvince(to);
  if (isMultiCoast(baseDestination) && !to.includes('/')) {
    return destinations.some(
      (destination) => getBaseProvince(destination) === baseDestination,
    );
  }

  return false;
}

export function countSupplyCenters(
  ownership: SupplyCenterOwnership,
): Record<Power, number> {
  const counts: Record<Power, number> = {
    england: 0,
    france: 0,
    germany: 0,
    russia: 0,
    austria: 0,
    italy: 0,
    turkey: 0,
  };

  for (const power of Object.values(ownership)) {
    if (power) {
      counts[power]++;
    }
  }

  return counts;
}

export function countUnits(positions: UnitPositions): Record<Power, number> {
  const counts: Record<Power, number> = {
    england: 0,
    france: 0,
    germany: 0,
    russia: 0,
    austria: 0,
    italy: 0,
    turkey: 0,
  };

  for (const unit of Object.values(positions)) {
    counts[unit.power]++;
  }

  return counts;
}
