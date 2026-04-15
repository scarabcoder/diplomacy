import type { UnitPositions } from '../types.ts';
import { getBaseProvince } from '../../lib/province-refs.ts';
import type { InternalOrder } from './internal-order.ts';

export function cutSupport(internalOrders: InternalOrder[]): boolean {
  let changed = false;

  for (const internalOrder of internalOrders) {
    if (
      internalOrder.order.orderType !== 'support' ||
      internalOrder.resolved ||
      internalOrder.supportCut
    ) {
      continue;
    }

    for (const attacker of internalOrders) {
      if (attacker.order.orderType !== 'move' || attacker.resolved) {
        continue;
      }

      const attackTarget = getBaseProvince(attacker.order.targetProvince ?? '');
      if (attackTarget !== internalOrder.order.unitProvince) {
        continue;
      }

      const supportTarget = internalOrder.order.targetProvince
        ? getBaseProvince(internalOrder.order.targetProvince)
        : internalOrder.order.supportedUnitProvince!;

      if (attacker.order.unitProvince === supportTarget) {
        continue;
      }

      if (attacker.order.power === internalOrder.order.power) {
        continue;
      }

      internalOrder.supportCut = true;
      internalOrder.success = false;
      internalOrder.resultType = 'cut';
      internalOrder.resolved = true;
      changed = true;
      break;
    }
  }

  return changed;
}

export function resolveMoves(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): boolean {
  let changed = false;
  const movesByDestination = new Map<string, InternalOrder[]>();

  for (const internalOrder of internalOrders) {
    if (internalOrder.order.orderType !== 'move' || internalOrder.resolved) {
      continue;
    }

    const destination = getBaseProvince(internalOrder.order.targetProvince!);
    if (!movesByDestination.has(destination)) {
      movesByDestination.set(destination, []);
    }
    movesByDestination.get(destination)!.push(internalOrder);
  }

  for (const [destination, movers] of movesByDestination) {
    for (const mover of movers) {
      mover.attackStrength = calculateAttackStrength(mover, internalOrders);
    }

    const defender = findDefender(destination, internalOrders, positions);
    const holdStrength = calculateHoldStrength(
      destination,
      defender,
      internalOrders,
    );

    if (movers.length === 1) {
      const mover = movers[0]!;
      const headToHead = findHeadToHead(mover, internalOrders);
      if (headToHead) {
        resolveHeadToHead(mover, headToHead, internalOrders);
        changed = true;
        continue;
      }

      if (mover.attackStrength > holdStrength) {
        if (defender && defender.order.power === mover.order.power) {
          mover.resolved = true;
          mover.success = false;
          mover.resultType = 'bounced';
          changed = true;
          continue;
        }

        mover.resolved = true;
        mover.success = true;
        mover.resultType = 'executed';

        if (defender && !defender.resolved) {
          defender.dislodged = true;
          defender.dislodgedFrom = mover.order.unitProvince;
          defender.resolved = true;
          defender.success = false;
          defender.resultType = 'dislodged';
        }

        changed = true;
      } else if (
        allSupportsResolved(mover, internalOrders) &&
        allSupportsResolved(defender, internalOrders)
      ) {
        mover.resolved = true;
        mover.success = false;
        mover.resultType = 'bounced';
        changed = true;
      }

      continue;
    }

    const maxStrength = Math.max(
      ...movers.map((mover) => mover.attackStrength),
    );
    const strongestMovers = movers.filter(
      (mover) => mover.attackStrength === maxStrength,
    );

    if (strongestMovers.length > 1) {
      const allReady = movers.every((mover) =>
        allSupportsResolved(mover, internalOrders),
      );

      if (allReady) {
        for (const mover of movers) {
          if (mover.resolved) {
            continue;
          }

          mover.resolved = true;
          mover.success = false;
          mover.resultType = 'bounced';
        }
        changed = true;
      }

      continue;
    }

    const winner = strongestMovers[0]!;
    if (winner.attackStrength > holdStrength) {
      if (defender && defender.order.power === winner.order.power) {
        for (const mover of movers) {
          if (mover.resolved) {
            continue;
          }

          mover.resolved = true;
          mover.success = false;
          mover.resultType = 'bounced';
        }
        changed = true;
        continue;
      }

      winner.resolved = true;
      winner.success = true;
      winner.resultType = 'executed';

      for (const mover of movers) {
        if (mover === winner || mover.resolved) {
          continue;
        }

        mover.resolved = true;
        mover.success = false;
        mover.resultType = 'bounced';
      }

      if (defender && !defender.resolved) {
        defender.dislodged = true;
        defender.dislodgedFrom = winner.order.unitProvince;
        defender.resolved = true;
        defender.success = false;
        defender.resultType = 'dislodged';
      }

      changed = true;
      continue;
    }

    const allReady = movers.every((mover) =>
      allSupportsResolved(mover, internalOrders),
    );

    if (allReady) {
      for (const mover of movers) {
        if (mover.resolved) {
          continue;
        }

        mover.resolved = true;
        mover.success = false;
        mover.resultType = 'bounced';
      }
      changed = true;
    }
  }

  return resolveCircularMovement(internalOrders) || changed;
}

function calculateAttackStrength(
  mover: InternalOrder,
  allOrders: InternalOrder[],
): number {
  let strength = 1;
  const destination = getBaseProvince(mover.order.targetProvince!);

  for (const internalOrder of allOrders) {
    if (
      internalOrder.order.orderType === 'support' &&
      !internalOrder.supportCut &&
      !internalOrder.resolved &&
      internalOrder.order.supportedUnitProvince === mover.order.unitProvince &&
      internalOrder.order.targetProvince &&
      getBaseProvince(internalOrder.order.targetProvince) === destination
    ) {
      strength++;
    }
  }

  return strength;
}

function calculateHoldStrength(
  province: string,
  defender: InternalOrder | null,
  allOrders: InternalOrder[],
): number {
  if (!defender) {
    return 0;
  }

  if (defender.order.orderType === 'move' && !defender.resolved) {
    return 0;
  }

  if (
    defender.order.orderType === 'move' &&
    defender.resolved &&
    defender.success
  ) {
    return 0;
  }

  let strength = 1;
  for (const internalOrder of allOrders) {
    if (
      internalOrder.order.orderType === 'support' &&
      !internalOrder.supportCut &&
      !internalOrder.resolved &&
      internalOrder.order.supportedUnitProvince === province &&
      !internalOrder.order.targetProvince
    ) {
      strength++;
    }
  }

  return strength;
}

function findDefender(
  province: string,
  allOrders: InternalOrder[],
  positions: UnitPositions,
): InternalOrder | null {
  if (!positions[province]) {
    return null;
  }

  return (
    allOrders.find(
      (internalOrder) => internalOrder.order.unitProvince === province,
    ) ?? null
  );
}

function allSupportsResolved(
  target: InternalOrder | null,
  allOrders: InternalOrder[],
): boolean {
  if (!target) {
    return true;
  }

  for (const internalOrder of allOrders) {
    if (
      internalOrder.order.orderType === 'support' &&
      !internalOrder.resolved &&
      internalOrder.order.supportedUnitProvince === target.order.unitProvince
    ) {
      return false;
    }
  }

  return true;
}

function findHeadToHead(
  mover: InternalOrder,
  allOrders: InternalOrder[],
): InternalOrder | null {
  const destination = getBaseProvince(mover.order.targetProvince!);

  return (
    allOrders.find(
      (internalOrder) =>
        internalOrder.order.orderType === 'move' &&
        !internalOrder.resolved &&
        internalOrder.order.unitProvince === destination &&
        getBaseProvince(internalOrder.order.targetProvince ?? '') ===
          mover.order.unitProvince,
    ) ?? null
  );
}

function resolveHeadToHead(
  mover1: InternalOrder,
  mover2: InternalOrder,
  allOrders: InternalOrder[],
): void {
  const strength1 = calculateAttackStrength(mover1, allOrders);
  const strength2 = calculateAttackStrength(mover2, allOrders);

  mover1.attackStrength = strength1;
  mover2.attackStrength = strength2;

  if (strength1 > strength2) {
    mover1.resolved = true;
    mover1.success = true;
    mover1.resultType = 'executed';

    mover2.dislodged = true;
    mover2.dislodgedFrom = mover1.order.unitProvince;
    mover2.resolved = true;
    mover2.success = false;
    mover2.resultType = 'dislodged';
    return;
  }

  if (strength2 > strength1) {
    mover2.resolved = true;
    mover2.success = true;
    mover2.resultType = 'executed';

    mover1.dislodged = true;
    mover1.dislodgedFrom = mover2.order.unitProvince;
    mover1.resolved = true;
    mover1.success = false;
    mover1.resultType = 'dislodged';
    return;
  }

  mover1.resolved = true;
  mover1.success = false;
  mover1.resultType = 'bounced';

  mover2.resolved = true;
  mover2.success = false;
  mover2.resultType = 'bounced';
}

function resolveCircularMovement(internalOrders: InternalOrder[]): boolean {
  let changed = false;
  const unresolvedMoves = internalOrders.filter(
    (internalOrder) =>
      internalOrder.order.orderType === 'move' && !internalOrder.resolved,
  );

  if (unresolvedMoves.length < 2) {
    return false;
  }

  const moveMap = new Map<string, InternalOrder>();
  for (const internalOrder of unresolvedMoves) {
    moveMap.set(internalOrder.order.unitProvince, internalOrder);
  }

  const visited = new Set<string>();
  for (const internalOrder of unresolvedMoves) {
    if (visited.has(internalOrder.order.unitProvince)) {
      continue;
    }

    const cycle = findCycle(internalOrder.order.unitProvince, moveMap);
    if (!cycle || cycle.length < 2) {
      continue;
    }

    let cycleValid = true;
    for (const province of cycle) {
      const destination = getBaseProvince(
        moveMap.get(province)!.order.targetProvince!,
      );
      const otherMovers = internalOrders.filter(
        (other) =>
          other.order.orderType === 'move' &&
          !other.resolved &&
          getBaseProvince(other.order.targetProvince ?? '') === destination &&
          !cycle.includes(other.order.unitProvince),
      );

      if (otherMovers.length > 0) {
        cycleValid = false;
        break;
      }
    }

    if (!cycleValid) {
      continue;
    }

    for (const province of cycle) {
      const mover = moveMap.get(province)!;
      mover.resolved = true;
      mover.success = true;
      mover.resultType = 'executed';
      visited.add(province);
      changed = true;
    }
  }

  return changed;
}

function findCycle(
  start: string,
  moveMap: Map<string, InternalOrder>,
): string[] | null {
  const path: string[] = [];
  const pathSet = new Set<string>();
  let current: string | null = start;

  while (current) {
    if (pathSet.has(current)) {
      const cycleStart = path.indexOf(current);
      return path.slice(cycleStart);
    }

    const mover = moveMap.get(current);
    if (!mover) {
      return null;
    }

    path.push(current);
    pathSet.add(current);
    current = getBaseProvince(mover.order.targetProvince!);
  }

  return null;
}
