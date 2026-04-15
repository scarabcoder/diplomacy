import type {
  Order,
  OrderResult,
  ResolutionResult,
  UnitPositions,
} from './types.ts';
import {
  buildNewPositions,
  calculateDislodgements,
  findStandoffProvinces,
  getRetreatOptions,
} from './resolve-orders/board-state.ts';
import {
  createInternalOrders,
  finalizeUnresolvedOrders,
} from './resolve-orders/internal-order.ts';
import {
  markVoidConvoys,
  markVoidConvoyMoves,
} from './resolve-orders/convoys.ts';
import { cutSupport, resolveMoves } from './resolve-orders/move-resolution.ts';

/**
 * Resolve all orders for a turn according to the Diplomacy rules.
 *
 * This implements the full resolution algorithm including:
 * - Hold, Move, Support, Convoy orders
 * - Support cutting (Rules 13-16)
 * - Standoffs (Rule 3)
 * - Self-dislodgement prevention (Rule 12)
 * - Head-to-head battles (Rule 6)
 * - Circular movement (Rule 7)
 * - Convoy chains and disruption (Rules 17-22)
 * - Dislodgement and retreat options
 */
export function resolveOrders(
  positions: UnitPositions,
  orders: Order[],
): ResolutionResult {
  const allOrders = addDefaultHolds(positions, orders);
  const internalOrders = createInternalOrders(allOrders);

  markVoidConvoys(internalOrders);
  markVoidConvoyMoves(internalOrders, positions);

  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    changed = cutSupport(internalOrders) || changed;
    changed = resolveMoves(internalOrders, positions) || changed;
  }

  finalizeUnresolvedOrders(internalOrders);
  const dislodgedUnits = calculateDislodgements(internalOrders, positions);
  const newPositions = buildNewPositions(
    internalOrders,
    positions,
    dislodgedUnits,
  );
  const standoffProvinces = findStandoffProvinces(internalOrders);
  const orderResults: OrderResult[] = internalOrders.map((internalOrder) => ({
    order: internalOrder.order,
    success: internalOrder.success,
    resultType: internalOrder.resultType,
    dislodgedFrom: internalOrder.dislodgedFrom,
    retreatOptions: internalOrder.dislodged
      ? getRetreatOptions(
          internalOrder.order.unitProvince,
          internalOrder.order.unitType,
          positions[internalOrder.order.unitProvince]?.coast ?? null,
          internalOrder.dislodgedFrom!,
          newPositions,
          standoffProvinces,
        )
      : undefined,
  }));

  return {
    orderResults,
    newPositions,
    dislodgedUnits,
    standoffProvinces,
  };
}

function addDefaultHolds(positions: UnitPositions, orders: Order[]): Order[] {
  const orderedProvinces = new Set(orders.map((o) => o.unitProvince));
  const result = [...orders];

  for (const [province, unit] of Object.entries(positions)) {
    if (!orderedProvinces.has(province)) {
      result.push({
        power: unit.power,
        unitType: unit.unitType,
        unitProvince: province,
        orderType: 'hold',
      });
    }
  }

  return result;
}
