import { FLEET_ADJACENCIES, PROVINCES, getArmyMoves } from '../map-data.ts';
import type { UnitPositions } from '../types.ts';
import { getBaseProvince } from '../../lib/province-refs.ts';
import type { InternalOrder } from './internal-order.ts';

export function markVoidConvoys(internalOrders: InternalOrder[]): void {
  for (const internalOrder of internalOrders) {
    if (internalOrder.order.orderType !== 'convoy') {
      continue;
    }

    const province = PROVINCES[internalOrder.order.unitProvince];
    if (!province || province.type !== 'water') {
      internalOrder.resolved = true;
      internalOrder.success = false;
      internalOrder.resultType = 'void';
    }
  }
}

export function markVoidConvoyMoves(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): void {
  for (const internalOrder of internalOrders) {
    if (
      internalOrder.order.orderType !== 'move' ||
      !internalOrder.order.viaConvoy
    ) {
      continue;
    }

    if (hasValidConvoyChain(internalOrder.order, internalOrders, positions)) {
      continue;
    }

    const destinations = getArmyMoves(internalOrder.order.unitProvince);
    const target = getBaseProvince(internalOrder.order.targetProvince!);
    if (destinations.includes(target)) {
      internalOrder.order.viaConvoy = false;
      continue;
    }

    internalOrder.resolved = true;
    internalOrder.success = false;
    internalOrder.resultType = 'void';
  }
}

function hasValidConvoyChain(
  moveOrder: InternalOrder['order'],
  internalOrders: InternalOrder[],
  _positions: UnitPositions,
): boolean {
  const from = moveOrder.unitProvince;
  const to = getBaseProvince(moveOrder.targetProvince!);

  const convoyFleets = internalOrders
    .filter(
      (internalOrder) =>
        internalOrder.order.orderType === 'convoy' &&
        !internalOrder.resolved &&
        internalOrder.order.supportedUnitProvince === from &&
        getBaseProvince(internalOrder.order.targetProvince ?? '') === to,
    )
    .map((internalOrder) => internalOrder.order.unitProvince);

  if (convoyFleets.length === 0) {
    return false;
  }

  return canConvoyReach(from, to, new Set(convoyFleets));
}

function canConvoyReach(
  from: string,
  to: string,
  fleetPositions: Set<string>,
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const adjacentProvince of FLEET_ADJACENCIES[from] ?? []) {
    const baseProvince = getBaseProvince(adjacentProvince);
    if (fleetPositions.has(baseProvince) && !visited.has(baseProvince)) {
      visited.add(baseProvince);
      queue.push(baseProvince);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const adjacentProvinces = FLEET_ADJACENCIES[current] ?? [];

    for (const adjacentProvince of adjacentProvinces) {
      if (getBaseProvince(adjacentProvince) === to) {
        return true;
      }
    }

    for (const adjacentProvince of adjacentProvinces) {
      const baseProvince = getBaseProvince(adjacentProvince);
      if (fleetPositions.has(baseProvince) && !visited.has(baseProvince)) {
        visited.add(baseProvince);
        queue.push(baseProvince);
      }
    }
  }

  return false;
}
