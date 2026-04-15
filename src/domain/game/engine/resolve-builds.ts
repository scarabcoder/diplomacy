import {
  type BuildOrder,
  type BuildResult,
  type BuildCount,
  type UnitPositions,
  type SupplyCenterOwnership,
  type Power,
  POWERS,
} from './types.ts';
import {
  PROVINCES,
  HOME_SUPPLY_CENTERS,
  countSupplyCenters,
  countUnits,
  isMultiCoast,
} from './map-data.ts';

/**
 * Calculate how many units each power needs to build or disband.
 * Positive = can build, negative = must disband.
 */
export function calculateBuildCounts(
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
): BuildCount[] {
  const scCounts = countSupplyCenters(supplyCenters);
  const unitCounts = countUnits(positions);

  return POWERS.map((power) => {
    const diff = scCounts[power] - unitCounts[power];
    const availableHomeSCs =
      diff > 0 ? getAvailableHomeSCs(power, positions, supplyCenters) : [];

    return {
      power,
      count: diff,
      availableHomeSCs,
    };
  });
}

/**
 * Get unoccupied home supply centers that a power still controls.
 */
function getAvailableHomeSCs(
  power: Power,
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
): string[] {
  const homeSCs = HOME_SUPPLY_CENTERS[power];
  return homeSCs.filter(
    (sc) =>
      supplyCenters[sc] === power && // Power still controls this SC
      !positions[sc], // Province is unoccupied
  );
}

/**
 * Resolve build/disband orders for the build phase (after Fall turns).
 */
export function resolveBuilds(
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  builds: BuildOrder[],
): BuildResult {
  const newPositions: UnitPositions = { ...positions };
  const executed: BuildOrder[] = [];
  const failed: Array<{ order: BuildOrder; reason: string }> = [];

  const buildCounts = calculateBuildCounts(positions, supplyCenters);

  // Process each power's builds/disbands
  for (const power of POWERS) {
    const buildCount = buildCounts.find((bc) => bc.power === power);
    if (!buildCount || buildCount.count === 0) continue;

    const powerBuilds = builds.filter((b) => b.power === power);

    if (buildCount.count > 0) {
      // Power can build
      processBuildOrders(
        power,
        buildCount,
        powerBuilds,
        newPositions,
        supplyCenters,
        executed,
        failed,
      );
    } else {
      // Power must disband
      processDisbandOrders(
        power,
        buildCount,
        powerBuilds,
        newPositions,
        executed,
        failed,
      );
    }
  }

  return { newPositions, executed, failed };
}

function processBuildOrders(
  power: Power,
  buildCount: BuildCount,
  orders: BuildOrder[],
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  executed: BuildOrder[],
  failed: Array<{ order: BuildOrder; reason: string }>,
): void {
  let buildsRemaining = buildCount.count;
  const availableSCs = new Set(buildCount.availableHomeSCs);

  for (const order of orders) {
    if (buildsRemaining <= 0) break;

    if (order.action === 'waive') {
      buildsRemaining--;
      executed.push(order);
      continue;
    }

    if (order.action !== 'build') continue;

    // Validate build
    if (!order.unitType) {
      failed.push({ order, reason: 'Build requires a unit type' });
      continue;
    }

    if (!availableSCs.has(order.province)) {
      failed.push({
        order,
        reason: `${order.province} is not an available home supply center`,
      });
      continue;
    }

    if (positions[order.province]) {
      failed.push({
        order,
        reason: `${order.province} is already occupied`,
      });
      continue;
    }

    const province = PROVINCES[order.province];
    if (!province) {
      failed.push({ order, reason: `Unknown province: ${order.province}` });
      continue;
    }

    // Only armies can be built on inland provinces
    if (province.type === 'inland' && order.unitType === 'fleet') {
      failed.push({
        order,
        reason: 'Fleets cannot be built on inland provinces',
      });
      continue;
    }

    // Fleet on multi-coast province needs a coast
    if (
      order.unitType === 'fleet' &&
      isMultiCoast(order.province) &&
      !order.coast
    ) {
      failed.push({
        order,
        reason: `Fleet build at ${order.province} requires a coast specification`,
      });
      continue;
    }

    // Place the unit
    positions[order.province] = {
      power,
      unitType: order.unitType,
      coast: order.coast ?? null,
    };
    availableSCs.delete(order.province);
    buildsRemaining--;
    executed.push(order);
  }
}

function processDisbandOrders(
  power: Power,
  buildCount: BuildCount,
  orders: BuildOrder[],
  positions: UnitPositions,
  executed: BuildOrder[],
  failed: Array<{ order: BuildOrder; reason: string }>,
): void {
  let disbandsRequired = Math.abs(buildCount.count);
  const disbandOrders = orders.filter((o) => o.action === 'disband');

  // Process explicit disband orders
  for (const order of disbandOrders) {
    if (disbandsRequired <= 0) break;

    if (!positions[order.province]) {
      failed.push({
        order,
        reason: `No unit at ${order.province} to disband`,
      });
      continue;
    }

    const unitAtProvince = positions[order.province];
    if (unitAtProvince && unitAtProvince.power !== power) {
      failed.push({
        order,
        reason: `Unit at ${order.province} does not belong to ${power}`,
      });
      continue;
    }

    delete positions[order.province];
    disbandsRequired--;
    executed.push(order);
  }

  // Auto-disband if not enough explicit orders
  // Rule: disband units furthest from home supply centers
  // Tie-breaker: fleets before armies, then alphabetical by province
  if (disbandsRequired > 0) {
    const powerUnits = Object.entries(positions)
      .filter(([_, unit]) => unit.power === power)
      .sort((a, b) => {
        // Sort by distance from home (we approximate by not being in a home SC)
        const aIsHome = HOME_SUPPLY_CENTERS[power].includes(a[0]) ? 0 : 1;
        const bIsHome = HOME_SUPPLY_CENTERS[power].includes(b[0]) ? 0 : 1;
        if (aIsHome !== bIsHome) return bIsHome - aIsHome; // furthest first

        // Fleets before armies
        if (a[1].unitType !== b[1].unitType) {
          return a[1].unitType === 'fleet' ? -1 : 1;
        }

        // Alphabetical
        return a[0].localeCompare(b[0]);
      });

    // Disband from the end (furthest from home)
    for (let i = powerUnits.length - 1; i >= 0 && disbandsRequired > 0; i--) {
      const entry = powerUnits[i];
      if (!entry) continue;
      const [province, unit] = entry;
      const unitType = unit.unitType;
      delete positions[province];
      disbandsRequired--;
      executed.push({
        power,
        action: 'disband',
        province,
        unitType,
      });
    }
  }
}
