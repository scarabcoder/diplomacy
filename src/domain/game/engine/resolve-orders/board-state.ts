import {
  FLEET_ADJACENCIES,
  PROVINCES,
  getArmyMoves,
  getFleetMoves,
  isMultiCoast,
} from '../map-data.ts';
import type { DislodgedUnit, UnitPositions, UnitType } from '../types.ts';
import { getBaseProvince } from '../../lib/province-refs.ts';
import type { InternalOrder } from './internal-order.ts';

export function calculateDislodgements(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): DislodgedUnit[] {
  const dislodgedUnits: DislodgedUnit[] = [];
  const newPositions = buildNewPositions(internalOrders, positions, []);
  const standoffProvinces = findStandoffProvinces(internalOrders);

  for (const internalOrder of internalOrders) {
    if (!internalOrder.dislodged || !internalOrder.dislodgedFrom) {
      continue;
    }

    const unit = positions[internalOrder.order.unitProvince];
    if (!unit) {
      continue;
    }

    dislodgedUnits.push({
      power: internalOrder.order.power,
      unitType: internalOrder.order.unitType,
      province: internalOrder.order.unitProvince,
      dislodgedFrom: internalOrder.dislodgedFrom,
      retreatOptions: getRetreatOptions(
        internalOrder.order.unitProvince,
        internalOrder.order.unitType,
        unit.coast ?? null,
        internalOrder.dislodgedFrom,
        newPositions,
        standoffProvinces,
      ),
    });
  }

  return dislodgedUnits;
}

export function getRetreatOptions(
  province: string,
  unitType: UnitType,
  coast: string | null,
  dislodgedFrom: string,
  newPositions: UnitPositions,
  standoffProvinces: string[],
): string[] {
  const adjacentProvinces =
    unitType === 'army'
      ? getArmyMoves(province)
      : getFleetMoves(province, coast).map(getBaseProvince);

  const options: string[] = [];
  for (const adjacentProvince of adjacentProvinces) {
    const baseProvince = getBaseProvince(adjacentProvince);
    if (baseProvince === dislodgedFrom) {
      continue;
    }

    if (newPositions[baseProvince]) {
      continue;
    }

    if (standoffProvinces.includes(baseProvince)) {
      continue;
    }

    options.push(baseProvince);
  }

  return [...new Set(options)];
}

export function buildNewPositions(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
): UnitPositions {
  const newPositions: UnitPositions = {};
  const dislodgedProvinces = new Set(
    dislodgedUnits.map((dislodgedUnit) => dislodgedUnit.province),
  );

  for (const internalOrder of internalOrders) {
    if (internalOrder.dislodged) {
      continue;
    }

    if (internalOrder.order.orderType === 'move' && internalOrder.success) {
      const destination = getBaseProvince(internalOrder.order.targetProvince!);
      const unit = positions[internalOrder.order.unitProvince];
      if (!unit) {
        continue;
      }

      let newCoast = internalOrder.order.coast ?? null;
      if (
        internalOrder.order.unitType === 'fleet' &&
        isMultiCoast(destination) &&
        !newCoast
      ) {
        newCoast = inferCoast(
          internalOrder.order.unitProvince,
          destination,
          unit.coast ?? null,
        );
      }

      newPositions[destination] = {
        power: unit.power,
        unitType: unit.unitType,
        coast: newCoast,
      };
      continue;
    }

    const province = internalOrder.order.unitProvince;
    if (dislodgedProvinces.has(province)) {
      continue;
    }

    const unit = positions[province];
    if (unit) {
      newPositions[province] = { ...unit };
    }
  }

  return newPositions;
}

export function findStandoffProvinces(
  internalOrders: InternalOrder[],
): string[] {
  const bouncedByDestination = new Map<string, number>();

  for (const internalOrder of internalOrders) {
    if (
      internalOrder.order.orderType !== 'move' ||
      !internalOrder.resolved ||
      internalOrder.success ||
      internalOrder.resultType !== 'bounced'
    ) {
      continue;
    }

    const destination = getBaseProvince(internalOrder.order.targetProvince!);
    bouncedByDestination.set(
      destination,
      (bouncedByDestination.get(destination) ?? 0) + 1,
    );
  }

  return [...bouncedByDestination.entries()]
    .filter(([, count]) => count >= 2)
    .map(([destination]) => destination);
}

function inferCoast(
  from: string,
  to: string,
  fromCoast: string | null,
): string | null {
  const province = PROVINCES[to];
  if (!province?.coasts) {
    return null;
  }

  const moves = getFleetMoves(from, fromCoast);
  for (const move of moves) {
    if (getBaseProvince(move) === to && move.includes('/')) {
      return move.split('/')[1] ?? null;
    }
  }

  const reachableCoasts = province.coasts.filter((coast) => {
    const destinationMoves = FLEET_ADJACENCIES[`${to}/${coast}`] ?? [];
    return destinationMoves.some(
      (destination) => getBaseProvince(destination) === getBaseProvince(from),
    );
  });

  if (reachableCoasts.length === 1) {
    return reachableCoasts[0] ?? null;
  }

  return province.coasts[0] ?? null;
}
