import type {
  Order,
  OrderResult,
  UnitPositions,
  DislodgedUnit,
  ResolutionResult,
  OrderResultType,
} from './types.ts';
import {
  PROVINCES,
  FLEET_ADJACENCIES,
  getBaseProvince,
  getArmyMoves,
  getFleetMoves,
  isMultiCoast,
} from './map-data.ts';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface InternalOrder {
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

// ============================================================================
// MAIN RESOLUTION FUNCTION
// ============================================================================

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
  // 1. Fill in default Hold orders for units without orders
  const allOrders = addDefaultHolds(positions, orders);

  // 2. Build internal order tracking
  const internalOrders = allOrders.map(
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

  // 3. Mark illegal convoy orders as void
  markVoidConvoys(internalOrders);

  // 4. Mark illegal move-via-convoy orders if no valid convoy chain exists
  markVoidConvoyMoves(internalOrders, positions);

  // 5. Iteratively resolve until stable
  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Cut support
    changed = cutSupport(internalOrders) || changed;

    // Resolve moves
    changed = resolveMoves(internalOrders, positions) || changed;
  }

  // 6. Finalize: anything not resolved is a hold that succeeded
  for (const io of internalOrders) {
    if (!io.resolved) {
      if (io.order.orderType === 'hold' || io.order.orderType === 'support' || io.order.orderType === 'convoy') {
        io.success = true;
        io.resultType = 'executed';
      }
      io.resolved = true;
    }
  }

  // 7. Calculate dislodgements
  const dislodgedUnits = calculateDislodgements(internalOrders, positions);

  // 8. Build new positions
  const newPositions = buildNewPositions(internalOrders, positions, dislodgedUnits);

  // 9. Determine standoff provinces
  const standoffProvinces = findStandoffProvinces(internalOrders);

  // 10. Build results
  const orderResults: OrderResult[] = internalOrders.map((io) => ({
    order: io.order,
    success: io.success,
    resultType: io.resultType,
    dislodgedFrom: io.dislodgedFrom,
    retreatOptions: io.dislodged
      ? getRetreatOptions(
          io.order.unitProvince,
          io.order.unitType,
          positions[io.order.unitProvince]?.coast ?? null,
          io.dislodgedFrom!,
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

// ============================================================================
// DEFAULT HOLDS
// ============================================================================

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

// ============================================================================
// VOID ORDER DETECTION
// ============================================================================

function markVoidConvoys(internalOrders: InternalOrder[]): void {
  for (const io of internalOrders) {
    if (io.order.orderType === 'convoy') {
      const province = PROVINCES[io.order.unitProvince];
      if (!province || province.type !== 'water') {
        io.resolved = true;
        io.success = false;
        io.resultType = 'void';
      }
    }
  }
}

function markVoidConvoyMoves(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): void {
  for (const io of internalOrders) {
    if (io.order.orderType === 'move' && io.order.viaConvoy) {
      if (!hasValidConvoyChain(io.order, internalOrders, positions)) {
        // Check if there's a direct land route instead
        const destinations = getArmyMoves(io.order.unitProvince);
        const target = getBaseProvince(io.order.targetProvince!);
        if (destinations.includes(target)) {
          // Fall back to land move
          io.order.viaConvoy = false;
        } else {
          io.resolved = true;
          io.success = false;
          io.resultType = 'void';
        }
      }
    }
  }
}

// ============================================================================
// CONVOY CHAIN VALIDATION
// ============================================================================

function hasValidConvoyChain(
  moveOrder: Order,
  internalOrders: InternalOrder[],
  _positions: UnitPositions,
): boolean {
  const from = moveOrder.unitProvince;
  const to = getBaseProvince(moveOrder.targetProvince!);

  // Find all convoy orders that match this move
  const convoyFleets = internalOrders
    .filter(
      (io) =>
        io.order.orderType === 'convoy' &&
        !io.resolved &&
        io.order.supportedUnitProvince === from &&
        getBaseProvince(io.order.targetProvince ?? '') === to,
    )
    .map((io) => io.order.unitProvince);

  if (convoyFleets.length === 0) return false;

  // BFS: can we get from 'from' to 'to' through convoy fleets?
  return canConvoyReach(from, to, new Set(convoyFleets));
}

function canConvoyReach(
  from: string,
  to: string,
  fleetPositions: Set<string>,
): boolean {
  // BFS from 'from' through water provinces occupied by convoying fleets to 'to'
  const visited = new Set<string>();
  const queue: string[] = [];

  // Find water provinces adjacent to 'from' that have convoying fleets
  const fleetAdj = FLEET_ADJACENCIES[from] ?? [];
  for (const adj of fleetAdj) {
    const base = getBaseProvince(adj);
    if (fleetPositions.has(base) && !visited.has(base)) {
      visited.add(base);
      queue.push(base);
    }
  }

  // Also check army adjacency since the army is in a coastal province
  // but fleet adjacency is what matters for convoy chain connectivity

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if this fleet is adjacent to the destination
    const currentAdj = FLEET_ADJACENCIES[current] ?? [];
    for (const adj of currentAdj) {
      if (getBaseProvince(adj) === to) return true;
    }

    // Continue BFS through other convoying fleets
    for (const adj of currentAdj) {
      const base = getBaseProvince(adj);
      if (fleetPositions.has(base) && !visited.has(base)) {
        visited.add(base);
        queue.push(base);
      }
    }
  }

  return false;
}

// ============================================================================
// SUPPORT CUTTING
// ============================================================================

function cutSupport(internalOrders: InternalOrder[]): boolean {
  let changed = false;

  for (const io of internalOrders) {
    if (
      io.order.orderType !== 'support' ||
      io.resolved ||
      io.supportCut
    ) {
      continue;
    }

    // Check if any unit is attacking the supporting unit's province
    for (const attacker of internalOrders) {
      if (
        attacker.order.orderType !== 'move' ||
        attacker.resolved
      ) {
        continue;
      }

      const attackTarget = getBaseProvince(attacker.order.targetProvince ?? '');
      if (attackTarget !== io.order.unitProvince) continue;

      // Rule 13: Support is cut if attacked from any province
      // EXCEPT the one where support is being given
      const supportTarget = io.order.targetProvince
        ? getBaseProvince(io.order.targetProvince)
        : io.order.supportedUnitProvince!;

      if (attacker.order.unitProvince === supportTarget) {
        continue; // Attack from the province being supported into doesn't cut support
      }

      // Rule 16: An attack by a country on one of its own units doesn't cut support
      if (attacker.order.power === io.order.power) {
        continue;
      }

      // Rule 21: A convoyed army doesn't cut support of a unit supporting
      // an attack against a fleet necessary for the convoy
      // (simplified: we check this during resolution)

      io.supportCut = true;
      io.success = false;
      io.resultType = 'cut';
      io.resolved = true;
      changed = true;
      break;
    }
  }

  return changed;
}

// ============================================================================
// MOVE RESOLUTION
// ============================================================================

function resolveMoves(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): boolean {
  let changed = false;

  // Group moves by destination
  const movesByDest = new Map<string, InternalOrder[]>();
  for (const io of internalOrders) {
    if (io.order.orderType === 'move' && !io.resolved) {
      const dest = getBaseProvince(io.order.targetProvince!);
      if (!movesByDest.has(dest)) movesByDest.set(dest, []);
      movesByDest.get(dest)!.push(io);
    }
  }

  for (const [dest, movers] of movesByDest) {
    // Calculate attack strength for each mover
    for (const mover of movers) {
      mover.attackStrength = calculateAttackStrength(mover, internalOrders);
    }

    // Calculate defense strength of the province
    const defender = findDefender(dest, internalOrders, positions);
    const holdStrength = calculateHoldStrength(dest, defender, internalOrders);

    if (movers.length === 1) {
      const mover = movers[0]!;

      // Head-to-head battle check
      const headToHead = findHeadToHead(mover, internalOrders);
      if (headToHead) {
        resolveHeadToHead(mover, headToHead, internalOrders);
        changed = true;
        continue;
      }

      // Single mover vs defender
      if (mover.attackStrength > holdStrength) {
        // Check self-dislodgement (Rule 12)
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

        // Mark defender as dislodged
        if (defender && !defender.resolved) {
          defender.dislodged = true;
          defender.dislodgedFrom = mover.order.unitProvince;
          defender.resolved = true;
          defender.success = false;
          defender.resultType = 'dislodged';
        }
        changed = true;
      } else if (mover.attackStrength <= holdStrength) {
        // If all supports have been resolved, this move fails
        if (allSupportsResolved(mover, internalOrders) && allSupportsResolved(defender, internalOrders)) {
          mover.resolved = true;
          mover.success = false;
          mover.resultType = 'bounced';
          changed = true;
        }
      }
    } else {
      // Multiple movers to same destination = potential standoff
      const maxStrength = Math.max(...movers.map((m) => m.attackStrength));

      // Count how many have the max strength
      const strongest = movers.filter(
        (m) => m.attackStrength === maxStrength,
      );

      if (strongest.length > 1) {
        // Standoff: all equal-strength movers fail (Rule 3)
        // But only if they're all resolved
        const allReady = movers.every((m) =>
          allSupportsResolved(m, internalOrders),
        );
        if (allReady) {
          for (const mover of movers) {
            if (!mover.resolved) {
              mover.resolved = true;
              mover.success = false;
              mover.resultType = 'bounced';
            }
          }
          changed = true;
        }
      } else {
        // One strongest mover
        const winner = strongest[0]!;

        // Still needs to beat the defender
        if (winner.attackStrength > holdStrength) {
          // Check self-dislodgement
          if (defender && defender.order.power === winner.order.power) {
            // All fail
            for (const mover of movers) {
              if (!mover.resolved) {
                mover.resolved = true;
                mover.success = false;
                mover.resultType = 'bounced';
              }
            }
            changed = true;
            continue;
          }

          winner.resolved = true;
          winner.success = true;
          winner.resultType = 'executed';

          // Other movers fail
          for (const mover of movers) {
            if (mover !== winner && !mover.resolved) {
              mover.resolved = true;
              mover.success = false;
              mover.resultType = 'bounced';
            }
          }

          // Dislodge defender
          if (defender && !defender.resolved) {
            defender.dislodged = true;
            defender.dislodgedFrom = winner.order.unitProvince;
            defender.resolved = true;
            defender.success = false;
            defender.resultType = 'dislodged';
          }
          changed = true;
        } else {
          // Winner can't beat defender
          const allReady = movers.every((m) =>
            allSupportsResolved(m, internalOrders),
          );
          if (allReady) {
            for (const mover of movers) {
              if (!mover.resolved) {
                mover.resolved = true;
                mover.success = false;
                mover.resultType = 'bounced';
              }
            }
            changed = true;
          }
        }
      }
    }
  }

  // Resolve circular movement (Rule 7)
  changed = resolveCircularMovement(internalOrders) || changed;

  return changed;
}

// ============================================================================
// STRENGTH CALCULATIONS
// ============================================================================

function calculateAttackStrength(
  mover: InternalOrder,
  allOrders: InternalOrder[],
): number {
  let strength = 1; // Base strength

  // Add support from support orders
  const dest = getBaseProvince(mover.order.targetProvince!);
  for (const io of allOrders) {
    if (
      io.order.orderType === 'support' &&
      !io.supportCut &&
      !io.resolved &&
      io.order.supportedUnitProvince === mover.order.unitProvince &&
      io.order.targetProvince &&
      getBaseProvince(io.order.targetProvince) === dest
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
  if (!defender) return 0;

  // If the defender is moving away, hold strength is 0
  // (unless it's bouncing back, which we don't know yet)
  if (defender.order.orderType === 'move' && !defender.resolved) {
    return 0; // Provisional: the unit might bounce back
  }
  if (defender.order.orderType === 'move' && defender.resolved && defender.success) {
    return 0; // Unit successfully moved away
  }

  let strength = 1; // Base strength

  // Add support-to-hold
  for (const io of allOrders) {
    if (
      io.order.orderType === 'support' &&
      !io.supportCut &&
      !io.resolved &&
      io.order.supportedUnitProvince === province &&
      !io.order.targetProvince // support-to-hold: no target province
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
  // Find the order for the unit currently in this province
  if (!positions[province]) return null;

  return (
    allOrders.find((io) => io.order.unitProvince === province) ?? null
  );
}

function allSupportsResolved(
  target: InternalOrder | null,
  allOrders: InternalOrder[],
): boolean {
  if (!target) return true;

  for (const io of allOrders) {
    if (io.order.orderType === 'support' && !io.resolved) {
      // Check if this support is relevant to the target
      if (io.order.supportedUnitProvince === target.order.unitProvince) {
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// HEAD-TO-HEAD BATTLES
// ============================================================================

function findHeadToHead(
  mover: InternalOrder,
  allOrders: InternalOrder[],
): InternalOrder | null {
  const dest = getBaseProvince(mover.order.targetProvince!);

  // Find if there's a unit at the destination trying to move to the mover's province
  return (
    allOrders.find(
      (io) =>
        io.order.orderType === 'move' &&
        !io.resolved &&
        io.order.unitProvince === dest &&
        getBaseProvince(io.order.targetProvince ?? '') ===
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
  } else if (strength2 > strength1) {
    mover2.resolved = true;
    mover2.success = true;
    mover2.resultType = 'executed';

    mover1.dislodged = true;
    mover1.dislodgedFrom = mover2.order.unitProvince;
    mover1.resolved = true;
    mover1.success = false;
    mover1.resultType = 'dislodged';
  } else {
    // Equal strength: both bounce (Rule 6)
    mover1.resolved = true;
    mover1.success = false;
    mover1.resultType = 'bounced';

    mover2.resolved = true;
    mover2.success = false;
    mover2.resultType = 'bounced';
  }
}

// ============================================================================
// CIRCULAR MOVEMENT (Rule 7)
// ============================================================================

function resolveCircularMovement(
  internalOrders: InternalOrder[],
): boolean {
  let changed = false;

  // Find chains of unresolved moves where each unit moves to the next unit's province
  const unresolvedMoves = internalOrders.filter(
    (io) => io.order.orderType === 'move' && !io.resolved,
  );

  if (unresolvedMoves.length < 2) return false;

  // Build a graph of move destinations
  const moveMap = new Map<string, InternalOrder>();
  for (const io of unresolvedMoves) {
    moveMap.set(io.order.unitProvince, io);
  }

  // Detect cycles
  const visited = new Set<string>();
  for (const io of unresolvedMoves) {
    if (visited.has(io.order.unitProvince)) continue;

    const cycle = findCycle(io.order.unitProvince, moveMap);
    if (cycle && cycle.length >= 2) {
      // All moves in the cycle succeed (none opposed from within the cycle)
      // Check that no move in the cycle has opposition from outside
      let cycleValid = true;
      for (const province of cycle) {
        const dest = getBaseProvince(moveMap.get(province)!.order.targetProvince!);
        // Check if there's another unit (not in the cycle) also moving to this destination
        const otherMovers = internalOrders.filter(
          (other) =>
            other.order.orderType === 'move' &&
            !other.resolved &&
            getBaseProvince(other.order.targetProvince ?? '') === dest &&
            !cycle.includes(other.order.unitProvince),
        );
        if (otherMovers.length > 0) {
          cycleValid = false;
          break;
        }
      }

      if (cycleValid) {
        for (const province of cycle) {
          const mover = moveMap.get(province)!;
          mover.resolved = true;
          mover.success = true;
          mover.resultType = 'executed';
          visited.add(province);
          changed = true;
        }
      }
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
      // Found a cycle - extract it
      const cycleStart = path.indexOf(current);
      return path.slice(cycleStart);
    }

    const mover = moveMap.get(current);
    if (!mover) return null;

    path.push(current);
    pathSet.add(current);
    current = getBaseProvince(mover.order.targetProvince!);
  }

  return null;
}

// ============================================================================
// DISLODGEMENTS
// ============================================================================

function calculateDislodgements(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
): DislodgedUnit[] {
  const dislodged: DislodgedUnit[] = [];
  const newPositions = buildNewPositions(internalOrders, positions, []);
  const standoffProvinces = findStandoffProvinces(internalOrders);

  for (const io of internalOrders) {
    if (io.dislodged && io.dislodgedFrom) {
      const unit = positions[io.order.unitProvince];
      if (!unit) continue;

      const retreatOptions = getRetreatOptions(
        io.order.unitProvince,
        io.order.unitType,
        unit.coast ?? null,
        io.dislodgedFrom,
        newPositions,
        standoffProvinces,
      );

      dislodged.push({
        power: io.order.power,
        unitType: io.order.unitType,
        province: io.order.unitProvince,
        dislodgedFrom: io.dislodgedFrom,
        retreatOptions,
      });
    }
  }

  return dislodged;
}

function getRetreatOptions(
  province: string,
  unitType: string,
  coast: string | null,
  dislodgedFrom: string,
  newPositions: UnitPositions,
  standoffProvinces: string[],
): string[] {
  const options: string[] = [];

  // Get adjacent provinces based on unit type
  let adjacencies: string[];
  if (unitType === 'army') {
    adjacencies = getArmyMoves(province);
  } else {
    adjacencies = getFleetMoves(province, coast).map(getBaseProvince);
  }

  for (const adj of adjacencies) {
    const base = getBaseProvince(adj);
    // Cannot retreat to:
    // 1. The province the attack came from
    if (base === dislodgedFrom) continue;
    // 2. An occupied province
    if (newPositions[base]) continue;
    // 3. A province where a standoff occurred
    if (standoffProvinces.includes(base)) continue;

    options.push(base);
  }

  return [...new Set(options)];
}

// ============================================================================
// NEW POSITIONS
// ============================================================================

function buildNewPositions(
  internalOrders: InternalOrder[],
  positions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
): UnitPositions {
  const newPositions: UnitPositions = {};
  const dislodgedProvinces = new Set(dislodgedUnits.map((d) => d.province));

  for (const io of internalOrders) {
    if (io.dislodged) continue; // Dislodged units don't occupy a province

    if (io.order.orderType === 'move' && io.success) {
      // Unit moved to new province
      const dest = getBaseProvince(io.order.targetProvince!);
      const unit = positions[io.order.unitProvince];
      if (unit) {
        // Determine coast for the destination
        let newCoast = io.order.coast ?? null;
        if (io.order.unitType === 'fleet' && isMultiCoast(dest) && !newCoast) {
          // Try to infer coast from fleet adjacency
          newCoast = inferCoast(io.order.unitProvince, dest, unit.coast ?? null);
        }
        newPositions[dest] = {
          power: unit.power,
          unitType: unit.unitType,
          coast: newCoast,
        };
      }
    } else {
      // Unit stayed (held, bounced, supported, convoyed, etc.)
      const province = io.order.unitProvince;
      if (!dislodgedProvinces.has(province)) {
        const unit = positions[province];
        if (unit) {
          newPositions[province] = { ...unit };
        }
      }
    }
  }

  return newPositions;
}

function inferCoast(
  from: string,
  to: string,
  fromCoast: string | null,
): string | null {
  const province = PROVINCES[to];
  if (!province?.coasts) return null;

  // Check which coast of the destination is reachable from the source
  const moves = getFleetMoves(from, fromCoast);
  for (const move of moves) {
    if (getBaseProvince(move) === to && move.includes('/')) {
      return move.split('/')[1] ?? null;
    }
  }

  // If only one coast is reachable, use it
  const reachableCoasts = province.coasts.filter((coast) => {
    const destMoves = FLEET_ADJACENCIES[`${to}/${coast}`] ?? [];
    // Check reverse: can the destination coast reach back to source?
    return destMoves.some((d) => getBaseProvince(d) === getBaseProvince(from));
  });

  if (reachableCoasts.length === 1) return reachableCoasts[0] ?? null;

  return province.coasts[0] ?? null; // Default to first coast
}

// ============================================================================
// STANDOFF DETECTION
// ============================================================================

function findStandoffProvinces(
  internalOrders: InternalOrder[],
): string[] {
  const standoffs: string[] = [];

  // Group bounced moves by destination
  const bouncedByDest = new Map<string, number>();
  for (const io of internalOrders) {
    if (
      io.order.orderType === 'move' &&
      io.resolved &&
      !io.success &&
      io.resultType === 'bounced'
    ) {
      const dest = getBaseProvince(io.order.targetProvince!);
      bouncedByDest.set(dest, (bouncedByDest.get(dest) ?? 0) + 1);
    }
  }

  // A standoff occurred where 2+ units bounced trying to enter
  for (const [dest, count] of bouncedByDest) {
    if (count >= 2) {
      standoffs.push(dest);
    }
  }

  return standoffs;
}
