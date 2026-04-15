import type { Order, UnitPositions } from './types.ts';
import {
  PROVINCES,
  getArmyMoves,
  getFleetMoves,
  isMultiCoast,
} from './map-data.ts';
import { getBaseProvince } from '../lib/province-refs.ts';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a single order against the map and current positions.
 * This checks structural legality (unit exists, adjacency, unit type constraints).
 * It does NOT check strategic validity (support matching, convoy chains, etc.)
 * — that is handled during resolution.
 */
export function validateOrder(
  positions: UnitPositions,
  order: Order,
): ValidationResult {
  // Check the unit exists at the specified province
  const unit = positions[order.unitProvince];
  if (!unit) {
    return { valid: false, reason: `No unit at ${order.unitProvince}` };
  }

  // Check the unit belongs to the ordering power
  if (unit.power !== order.power) {
    return {
      valid: false,
      reason: `Unit at ${order.unitProvince} belongs to ${unit.power}, not ${order.power}`,
    };
  }

  // Check unit type matches
  if (unit.unitType !== order.unitType) {
    return {
      valid: false,
      reason: `Unit at ${order.unitProvince} is a ${unit.unitType}, not a ${order.unitType}`,
    };
  }

  switch (order.orderType) {
    case 'hold':
      return validateHold();
    case 'move':
      return validateMove(positions, order, unit.coast);
    case 'support':
      return validateSupport(positions, order, unit.coast);
    case 'convoy':
      return validateConvoy(positions, order);
    default:
      return { valid: false, reason: `Unknown order type: ${order.orderType}` };
  }
}

function validateHold(): ValidationResult {
  return { valid: true };
}

function validateMove(
  _positions: UnitPositions,
  order: Order,
  unitCoast?: string | null,
): ValidationResult {
  if (!order.targetProvince) {
    return { valid: false, reason: 'Move order requires a target province' };
  }

  const target = getBaseProvince(order.targetProvince);
  const targetProvince = PROVINCES[target];
  if (!targetProvince) {
    return {
      valid: false,
      reason: `Unknown province: ${order.targetProvince}`,
    };
  }

  if (order.unitType === 'army') {
    // Armies cannot move to water provinces
    if (targetProvince.type === 'water') {
      return { valid: false, reason: 'Armies cannot move to water provinces' };
    }

    // Check adjacency (for armies, convoy can bypass adjacency)
    if (!order.viaConvoy) {
      const destinations = getArmyMoves(order.unitProvince);
      if (!destinations.includes(target)) {
        return {
          valid: false,
          reason: `${order.unitProvince} is not adjacent to ${target} for army movement`,
        };
      }
    }
    // If viaConvoy, adjacency is validated during resolution (convoy chain check)
  } else {
    // Fleet
    // Fleets cannot move to inland provinces
    if (targetProvince.type === 'inland') {
      return { valid: false, reason: 'Fleets cannot move to inland provinces' };
    }

    // For multi-coast destination, coast must be specified if there are multiple options
    if (isMultiCoast(target) && targetProvince.type === 'coastal') {
      if (!order.coast) {
        // Check if only one coast is reachable — if so, auto-infer is OK during resolution
        // For validation, we'll be lenient and allow it
      }
    }

    // Check fleet adjacency
    const destinations = getFleetMoves(order.unitProvince, unitCoast);
    const isAdj = destinations.some((d) => getBaseProvince(d) === target);
    if (!isAdj) {
      return {
        valid: false,
        reason: `${order.unitProvince} is not adjacent to ${target} for fleet movement`,
      };
    }
  }

  return { valid: true };
}

function validateSupport(
  positions: UnitPositions,
  order: Order,
  unitCoast?: string | null,
): ValidationResult {
  if (!order.supportedUnitProvince) {
    return {
      valid: false,
      reason: 'Support order requires a supported unit province',
    };
  }

  const supportedUnit = positions[order.supportedUnitProvince];
  if (!supportedUnit) {
    return {
      valid: false,
      reason: `No unit at ${order.supportedUnitProvince} to support`,
    };
  }

  // Determine the province the supporting unit needs to be adjacent to
  // For support-to-hold: the supported unit's province
  // For support-to-move: the target province (where the supported unit is moving)
  const supportTarget = order.targetProvince
    ? getBaseProvince(order.targetProvince)
    : order.supportedUnitProvince;

  // The supporting unit must be able to move to the support target province
  // (even though it won't actually move)
  if (order.unitType === 'army') {
    const destinations = getArmyMoves(order.unitProvince);
    if (!destinations.includes(supportTarget)) {
      return {
        valid: false,
        reason: `${order.unitProvince} cannot reach ${supportTarget} to give support`,
      };
    }
  } else {
    const destinations = getFleetMoves(order.unitProvince, unitCoast);
    const isAdj = destinations.some(
      (d) => getBaseProvince(d) === supportTarget,
    );
    if (!isAdj) {
      return {
        valid: false,
        reason: `${order.unitProvince} cannot reach ${supportTarget} to give support`,
      };
    }
  }

  return { valid: true };
}

function validateConvoy(
  positions: UnitPositions,
  order: Order,
): ValidationResult {
  // Only fleets can convoy
  if (order.unitType !== 'fleet') {
    return { valid: false, reason: 'Only fleets can convoy' };
  }

  // The convoying fleet must be in a water province
  const province = PROVINCES[order.unitProvince];
  if (!province || province.type !== 'water') {
    return {
      valid: false,
      reason: 'Convoying fleet must be in a water province',
    };
  }

  // Must specify which unit is being convoyed and where
  if (!order.supportedUnitProvince) {
    return {
      valid: false,
      reason: 'Convoy order requires the convoyed unit province',
    };
  }

  if (!order.targetProvince) {
    return {
      valid: false,
      reason: 'Convoy order requires a target province',
    };
  }

  // The convoyed unit must be an army
  const convoyedUnit = positions[order.supportedUnitProvince];
  if (convoyedUnit && convoyedUnit.unitType !== 'army') {
    return { valid: false, reason: 'Only armies can be convoyed' };
  }

  return { valid: true };
}
