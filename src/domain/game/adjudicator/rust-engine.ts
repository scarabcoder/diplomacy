import { createRequire } from 'node:module';
import type {
  BuildOrder,
  BuildResult,
  DislodgedUnit,
  Order,
  ResolutionResult,
  RetreatOrder,
  RetreatResult,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';

const require = createRequire(import.meta.url);

type WasmModule = {
  validateMainOrders(input: unknown): unknown;
  adjudicateMainPhase(input: unknown): unknown;
  adjudicateRetreatPhase(input: unknown): unknown;
  adjudicateBuildPhase(input: unknown): unknown;
};

type ValidationError = {
  unitProvince: string;
  message: string;
};

type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

type BuildResolution = BuildResult & {
  failed: Array<{ order: BuildOrder; reason: string }>;
};

let modulePromise: Promise<WasmModule> | null = null;

function coerceModule(mod: unknown): WasmModule {
  const candidate =
    mod && typeof mod === 'object' && 'validateMainOrders' in mod
      ? mod
      : (mod as { default?: unknown }).default;

  return candidate as WasmModule;
}

async function loadModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = Promise.resolve().then(() =>
      coerceModule(
        require('../../../../rust/diplomacy-wasm/pkg/diplomacy_wasm.js'),
      ),
    );
  }

  return modulePromise;
}

function normalizePositions(positions: UnitPositions): UnitPositions {
  return Object.fromEntries(
    Object.entries(positions).map(([province, unit]) => [
      province,
      {
        power: unit.power,
        unitType: unit.unitType,
        coast: unit.coast ?? null,
      },
    ]),
  );
}

function normalizeOrders(orders: Order[]): Order[] {
  return orders.map((order) => ({
    ...order,
    targetProvince: order.targetProvince ?? null,
    supportedUnitProvince: order.supportedUnitProvince ?? null,
    viaConvoy: order.viaConvoy ?? false,
    coast: order.coast ?? null,
  }));
}

function normalizeDislodgedUnits(dislodgedUnits: DislodgedUnit[]): DislodgedUnit[] {
  return dislodgedUnits.map((unit) => ({
    ...unit,
    coast: unit.coast ?? null,
  }));
}

function normalizeRetreats(retreats: RetreatOrder[]): RetreatOrder[] {
  return retreats.map((retreat) => ({
    ...retreat,
    retreatTo: retreat.retreatTo ?? null,
  }));
}

function normalizeBuilds(builds: BuildOrder[]): BuildOrder[] {
  return builds.map((build) => ({
    ...build,
    unitType: build.unitType ?? null,
    coast: build.coast ?? null,
  }));
}

export async function validateMainOrders(
  positions: UnitPositions,
  orders: Order[],
): Promise<ValidationResult> {
  const wasm = await loadModule();
  return wasm.validateMainOrders({
    positions: normalizePositions(positions),
    orders: normalizeOrders(orders),
  }) as ValidationResult;
}

export async function adjudicateMainPhase(
  positions: UnitPositions,
  orders: Order[],
): Promise<ResolutionResult> {
  const wasm = await loadModule();
  return wasm.adjudicateMainPhase({
    positions: normalizePositions(positions),
    orders: normalizeOrders(orders),
  }) as ResolutionResult;
}

export async function adjudicateRetreatPhase(
  currentPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
  retreats: RetreatOrder[],
): Promise<RetreatResult> {
  const wasm = await loadModule();
  return wasm.adjudicateRetreatPhase({
    currentPositions: normalizePositions(currentPositions),
    dislodgedUnits: normalizeDislodgedUnits(dislodgedUnits),
    retreats: normalizeRetreats(retreats),
  }) as RetreatResult;
}

export async function adjudicateBuildPhase(
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  builds: BuildOrder[],
): Promise<BuildResolution> {
  const wasm = await loadModule();
  return wasm.adjudicateBuildPhase({
    positions: normalizePositions(positions),
    supplyCenters,
    builds: normalizeBuilds(builds),
  }) as BuildResolution;
}
