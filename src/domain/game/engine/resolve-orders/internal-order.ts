import type { Order, OrderResultType } from '../types.ts';

export interface InternalOrder {
  order: Order;
  resolved: boolean;
  success: boolean;
  resultType: OrderResultType;
  attackStrength: number;
  defendStrength: number;
  supportCut: boolean;
  dislodged: boolean;
  dislodgedFrom: string | null;
}

export function createInternalOrders(orders: Order[]): InternalOrder[] {
  return orders.map(
    (order): InternalOrder => ({
      order,
      resolved: false,
      success: false,
      resultType: 'bounced',
      attackStrength: 1,
      defendStrength: 0,
      supportCut: false,
      dislodged: false,
      dislodgedFrom: null,
    }),
  );
}

export function finalizeUnresolvedOrders(
  internalOrders: InternalOrder[],
): void {
  for (const internalOrder of internalOrders) {
    if (internalOrder.resolved) {
      continue;
    }

    if (
      internalOrder.order.orderType === 'hold' ||
      internalOrder.order.orderType === 'support' ||
      internalOrder.order.orderType === 'convoy'
    ) {
      internalOrder.success = true;
      internalOrder.resultType = 'executed';
    }

    internalOrder.resolved = true;
  }
}
