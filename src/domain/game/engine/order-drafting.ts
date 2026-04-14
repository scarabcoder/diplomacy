import {
  FLEET_ADJACENCIES,
  HOME_SUPPLY_CENTERS,
  PROVINCES,
  getArmyMoves,
  getBaseProvince,
  getFleetMoves,
  isMultiCoast,
} from './map-data.ts';
import type {
  BuildCount,
  DislodgedUnit,
  Power,
  Unit,
  UnitPositions,
} from './types.ts';

export interface MainOrderDraft {
  unitProvince: string;
  orderType: 'hold' | 'move' | 'support' | 'convoy';
  targetProvince: string | null;
  supportedUnitProvince: string | null;
  viaConvoy: boolean;
}

export interface RetreatOrderDraft {
  unitProvince: string;
  retreatTo: string | null;
}

export interface BuildOrderDraft {
  action: 'build' | 'disband' | 'waive';
  province: string;
  unitType: 'army' | 'fleet' | null;
  coast: string | null;
}

export interface OrderAnnotation {
  id: string;
  kind: 'hold' | 'move' | 'support' | 'convoy' | 'retreat' | 'build' | 'disband';
  from: string;
  to?: string;
  aux?: string;
  power?: Power;
  unitType?: 'army' | 'fleet';
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isWaterProvince(province: string): boolean {
  return PROVINCES[getBaseProvince(province)]?.type === 'water';
}

function isCoastalProvince(province: string): boolean {
  return PROVINCES[getBaseProvince(province)]?.type === 'coastal';
}

function getProvinceRegionRefs(province: string): string[] {
  if (!isMultiCoast(province)) {
    return [province];
  }

  const coasts = PROVINCES[province]?.coasts ?? [];
  return coasts.map((coast) => `${province}/${coast}`);
}

function getCoastalWaterNeighbors(province: string): string[] {
  const refs = new Set<string>();

  for (const regionRef of getProvinceRegionRefs(province)) {
    const coast = regionRef.includes('/') ? regionRef.split('/')[1] ?? null : null;
    const moves = getFleetMoves(province, coast);
    for (const move of moves) {
      if (isWaterProvince(move)) {
        refs.add(getBaseProvince(move));
      }
    }
  }

  const directMoves = getFleetMoves(province);
  for (const move of directMoves) {
    if (isWaterProvince(move)) {
      refs.add(getBaseProvince(move));
    }
  }

  return [...refs];
}

function getCoastalDestinationsTouchedByWater(waterProvince: string): string[] {
  const bordering = FLEET_ADJACENCIES[waterProvince] ?? [];
  return unique(
    bordering
      .map((region) => getBaseProvince(region))
      .filter((province) => isCoastalProvince(province)),
  );
}

function getOccupiedWaterFleets(positions: UnitPositions): string[] {
  return Object.entries(positions)
    .filter(
      ([province, unit]) =>
        unit.unitType === 'fleet' && PROVINCES[province]?.type === 'water',
    )
    .map(([province]) => province);
}

function getWaterFleetGraph(positions: UnitPositions): Record<string, string[]> {
  const occupied = new Set(getOccupiedWaterFleets(positions));
  const graph: Record<string, string[]> = {};

  for (const province of occupied) {
    const adjacent = getFleetMoves(province)
      .map((target) => getBaseProvince(target))
      .filter((target) => occupied.has(target));
    graph[province] = unique(adjacent);
  }

  return graph;
}

function getFleetComponent(
  start: string,
  graph: Record<string, string[]>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const next of graph[current] ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return visited;
}

function getArmyConvoyComponents(
  province: string,
  positions: UnitPositions,
): Array<Set<string>> {
  const graph = getWaterFleetGraph(positions);
  const components: Array<Set<string>> = [];
  const seen = new Set<string>();

  for (const waterNeighbor of getCoastalWaterNeighbors(province)) {
    if (!graph[waterNeighbor] || seen.has(waterNeighbor)) {
      continue;
    }

    const component = getFleetComponent(waterNeighbor, graph);
    for (const fleetProvince of component) {
      seen.add(fleetProvince);
    }
    components.push(component);
  }

  return components;
}

export function getMoveTargets(
  province: string,
  positions: UnitPositions,
): string[] {
  const unit = positions[province];
  if (!unit) {
    return [];
  }

  if (unit.unitType === 'army') {
    return getArmyMoves(province);
  }

  return getFleetMoves(province, unit.coast);
}

export function getConvoyMoveTargets(
  province: string,
  positions: UnitPositions,
): string[] {
  const unit = positions[province];
  if (!unit || unit.unitType !== 'army' || !isCoastalProvince(province)) {
    return [];
  }

  const destinations = new Set<string>();
  for (const component of getArmyConvoyComponents(province, positions)) {
    for (const fleetProvince of component) {
      for (const destination of getCoastalDestinationsTouchedByWater(fleetProvince)) {
        if (destination !== province) {
          destinations.add(destination);
        }
      }
    }
  }

  return [...destinations];
}

function getPotentialMoveTargets(
  province: string,
  positions: UnitPositions,
): string[] {
  const directTargets = getMoveTargets(province, positions);
  const convoyTargets = getConvoyMoveTargets(province, positions);
  return unique([...directTargets, ...convoyTargets]);
}

function canUnitReachTarget(
  province: string,
  unit: Unit,
  target: string,
): boolean {
  if (unit.unitType === 'army') {
    return getArmyMoves(province).includes(getBaseProvince(target));
  }

  const exactTargets = getFleetMoves(province, unit.coast);
  if (exactTargets.includes(target)) {
    return true;
  }

  return exactTargets.some((candidate) => getBaseProvince(candidate) === getBaseProvince(target));
}

export function getSupportableUnitProvinces(
  supporterProvince: string,
  positions: UnitPositions,
): string[] {
  const supporter = positions[supporterProvince];
  if (!supporter) {
    return [];
  }

  return Object.entries(positions)
    .filter(([province]) => province !== supporterProvince)
    .filter(([province]) => {
      if (canUnitReachTarget(supporterProvince, supporter, province)) {
        return true;
      }

      return getPotentialMoveTargets(province, positions).some((target) =>
        canUnitReachTarget(supporterProvince, supporter, target),
      );
    })
    .map(([province]) => province);
}

export function getSupportMoveTargets(
  supporterProvince: string,
  supportedProvince: string,
  positions: UnitPositions,
): string[] {
  const supporter = positions[supporterProvince];
  const supported = positions[supportedProvince];
  if (!supporter || !supported) {
    return [];
  }

  return getPotentialMoveTargets(supportedProvince, positions).filter((target) =>
    canUnitReachTarget(supporterProvince, supporter, target),
  );
}

export function canSupportHold(
  supporterProvince: string,
  supportedProvince: string,
  positions: UnitPositions,
): boolean {
  const supporter = positions[supporterProvince];
  if (!supporter) {
    return false;
  }

  return canUnitReachTarget(supporterProvince, supporter, supportedProvince);
}

export function getConvoyableArmyProvincesForFleet(
  fleetProvince: string,
  positions: UnitPositions,
): string[] {
  const fleet = positions[fleetProvince];
  if (!fleet || fleet.unitType !== 'fleet' || PROVINCES[fleetProvince]?.type !== 'water') {
    return [];
  }

  const graph = getWaterFleetGraph(positions);
  const fleetComponent = getFleetComponent(fleetProvince, graph);

  return Object.entries(positions)
    .filter(
      ([province, unit]) =>
        unit.unitType === 'army' && isCoastalProvince(province),
    )
    .filter(([province]) =>
      getCoastalWaterNeighbors(province).some((waterNeighbor) =>
        fleetComponent.has(waterNeighbor),
      ),
    )
    .filter(([province]) =>
      getCoastalDestinationsForFleetArmy(fleetProvince, province, positions).length > 0,
    )
    .map(([province]) => province);
}

export function getCoastalDestinationsForFleetArmy(
  fleetProvince: string,
  armyProvince: string,
  positions: UnitPositions,
): string[] {
  const fleet = positions[fleetProvince];
  const army = positions[armyProvince];
  if (
    !fleet
    || fleet.unitType !== 'fleet'
    || PROVINCES[fleetProvince]?.type !== 'water'
    || !army
    || army.unitType !== 'army'
    || !isCoastalProvince(armyProvince)
  ) {
    return [];
  }

  const graph = getWaterFleetGraph(positions);
  const fleetComponent = getFleetComponent(fleetProvince, graph);
  const touchesOrigin = getCoastalWaterNeighbors(armyProvince).some((waterNeighbor) =>
    fleetComponent.has(waterNeighbor),
  );

  if (!touchesOrigin) {
    return [];
  }

  const destinations = new Set<string>();
  for (const waterProvince of fleetComponent) {
    for (const destination of getCoastalDestinationsTouchedByWater(waterProvince)) {
      if (destination !== armyProvince) {
        destinations.add(destination);
      }
    }
  }

  return [...destinations];
}

export function getEligibleBuildProvinces(
  power: Power,
  buildCount: BuildCount | null,
): string[] {
  if (!buildCount || buildCount.power !== power || buildCount.count <= 0) {
    return [];
  }

  return buildCount.availableHomeSCs;
}

export function getBuildChoices(province: string): Array<{
  unitType: 'army' | 'fleet';
  coast: string | null;
}> {
  const provinceData = PROVINCES[province];
  if (!provinceData) {
    return [];
  }

  const choices: Array<{ unitType: 'army' | 'fleet'; coast: string | null }> = [];

  if (provinceData.type !== 'water') {
    choices.push({ unitType: 'army', coast: null });
  }

  if (provinceData.type === 'coastal') {
    const coasts = provinceData.coasts ?? [];
    if (coasts.length === 0) {
      choices.push({ unitType: 'fleet', coast: null });
    } else {
      for (const coast of coasts) {
        choices.push({ unitType: 'fleet', coast });
      }
    }
  }

  return choices;
}

export function getDefaultWaiveProvince(power: Power): string {
  return HOME_SUPPLY_CENTERS[power][0] ?? 'par';
}

export function getMainOrderAnnotations(
  orders: Record<string, MainOrderDraft>,
  positions: UnitPositions,
): OrderAnnotation[] {
  const annotations: OrderAnnotation[] = [];

  for (const [province, order] of Object.entries(orders)) {
    const unit = positions[province];
    if (!unit) {
      continue;
    }

    if (order.orderType === 'hold') {
      annotations.push({
        id: `hold-${province}`,
        kind: 'hold',
        from: province,
        power: unit.power,
        unitType: unit.unitType,
      });
      continue;
    }

    if (order.orderType === 'move' && order.targetProvince) {
      annotations.push({
        id: `move-${province}-${order.targetProvince}`,
        kind: 'move',
        from: province,
        to: order.targetProvince,
        power: unit.power,
        unitType: unit.unitType,
      });
      continue;
    }

    if (order.orderType === 'support' && order.supportedUnitProvince) {
      annotations.push({
        id: `support-${province}-${order.supportedUnitProvince}-${order.targetProvince ?? 'hold'}`,
        kind: 'support',
        from: province,
        to: order.supportedUnitProvince,
        aux: order.targetProvince ?? undefined,
        power: unit.power,
        unitType: unit.unitType,
      });
      continue;
    }

    if (
      order.orderType === 'convoy'
      && order.supportedUnitProvince
      && order.targetProvince
    ) {
      annotations.push({
        id: `convoy-${province}-${order.supportedUnitProvince}-${order.targetProvince}`,
        kind: 'convoy',
        from: province,
        to: order.supportedUnitProvince,
        aux: order.targetProvince,
        power: unit.power,
        unitType: unit.unitType,
      });
    }
  }

  return annotations;
}

export function getRetreatAnnotations(
  retreats: Record<string, RetreatOrderDraft>,
  positions: UnitPositions,
): OrderAnnotation[] {
  const annotations: OrderAnnotation[] = [];

  for (const [province, retreat] of Object.entries(retreats)) {
    const unit = positions[province];
    if (!unit) {
      continue;
    }

    if (retreat.retreatTo) {
      annotations.push({
        id: `retreat-${province}-${retreat.retreatTo}`,
        kind: 'retreat',
        from: province,
        to: retreat.retreatTo,
        power: unit.power,
        unitType: unit.unitType,
      });
    } else {
      annotations.push({
        id: `retreat-disband-${province}`,
        kind: 'disband',
        from: province,
        power: unit.power,
        unitType: unit.unitType,
      });
    }
  }

  return annotations;
}

export function getBuildAnnotations(
  builds: BuildOrderDraft[],
  positions: UnitPositions,
): OrderAnnotation[] {
  return builds
    .filter((build) => build.action !== 'waive')
    .map((build) => {
      if (build.action === 'disband') {
        const unit = positions[build.province];
        return {
          id: `disband-${build.province}`,
          kind: 'disband' as const,
          from: build.province,
          power: unit?.power,
          unitType: unit?.unitType,
        };
      }

      return {
        id: `build-${build.province}-${build.unitType ?? 'unknown'}-${build.coast ?? 'base'}`,
        kind: 'build' as const,
        from: build.coast ? `${build.province}/${build.coast}` : build.province,
        power: undefined,
        unitType: build.unitType ?? undefined,
      };
    });
}

export function findDislodgedUnit(
  dislodgedUnits: DislodgedUnit[],
  province: string,
): DislodgedUnit | undefined {
  return dislodgedUnits.find((unit) => unit.province === province);
}

export function describeProvinceRef(provinceRef: string): string {
  const base = getBaseProvince(provinceRef);
  const province = PROVINCES[base];
  if (!province) {
    return provinceRef.toUpperCase();
  }

  if (!provinceRef.includes('/')) {
    return province.name;
  }

  const coast = provinceRef.split('/')[1]?.toUpperCase();
  return `${province.name} (${coast})`;
}

export function describeMainOrder(
  province: string,
  order: MainOrderDraft,
  positions: UnitPositions,
): string {
  const unit = positions[province];
  const unitLabel = unit?.unitType === 'army' ? 'A' : 'F';
  const origin = describeProvinceRef(province);

  if (order.orderType === 'hold') {
    return `${unitLabel} ${origin} HOLD`;
  }

  if (order.orderType === 'move' && order.targetProvince) {
    const prefix = order.viaConvoy ? ' VIA CONVOY' : '';
    return `${unitLabel} ${origin} -> ${describeProvinceRef(order.targetProvince)}${prefix}`;
  }

  if (order.orderType === 'support' && order.supportedUnitProvince) {
    const supportedUnit = positions[order.supportedUnitProvince];
    const supportedLabel = supportedUnit?.unitType === 'army' ? 'A' : 'F';
    if (order.targetProvince) {
      return `${unitLabel} ${origin} S ${supportedLabel} ${describeProvinceRef(order.supportedUnitProvince)} -> ${describeProvinceRef(order.targetProvince)}`;
    }

    return `${unitLabel} ${origin} S ${supportedLabel} ${describeProvinceRef(order.supportedUnitProvince)} HOLD`;
  }

  if (
    order.orderType === 'convoy'
    && order.supportedUnitProvince
    && order.targetProvince
  ) {
    return `${unitLabel} ${origin} C A ${describeProvinceRef(order.supportedUnitProvince)} -> ${describeProvinceRef(order.targetProvince)}`;
  }

  return `${unitLabel} ${origin} HOLD`;
}

export function describeRetreatOrder(
  retreat: RetreatOrderDraft,
  positions: UnitPositions,
): string {
  const unit = positions[retreat.unitProvince];
  const unitLabel = unit?.unitType === 'army' ? 'A' : 'F';
  const origin = describeProvinceRef(retreat.unitProvince);

  if (!retreat.retreatTo) {
    return `${unitLabel} ${origin} DISBAND`;
  }

  return `${unitLabel} ${origin} -> ${describeProvinceRef(retreat.retreatTo)}`;
}

export function describeBuildOrder(build: BuildOrderDraft): string {
  if (build.action === 'waive') {
    return 'Waive';
  }

  if (build.action === 'disband') {
    return `Disband ${describeProvinceRef(build.province)}`;
  }

  const unitLabel = build.unitType === 'army' ? 'Army' : 'Fleet';
  const suffix = build.coast ? ` (${build.coast.toUpperCase()})` : '';
  return `Build ${unitLabel} at ${describeProvinceRef(build.province)}${suffix}`;
}
