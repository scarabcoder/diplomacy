import type {
  BuildOrder,
  BuildResult,
  DislodgedUnit,
  Order,
  ResolutionResult,
  RetreatOrder,
  RetreatOrderResult,
  RetreatResult,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import { resolveBuilds } from '@/domain/game/engine/resolve-builds.ts';
import { resolveOrders } from '@/domain/game/engine/resolve-orders.ts';
import { validateOrder } from '@/domain/game/engine/validate-order.ts';
import { getBaseProvince } from '@/domain/game/lib/province-refs.ts';

type WasmModule = {
  validateMainOrders(input: unknown): unknown;
  adjudicateMainPhase(input: unknown): unknown;
  adjudicateRetreatPhase(input: unknown): unknown;
  adjudicateBuildPhase(input: unknown): unknown;
};

type WasmGlueModule = WasmModule & {
  __wbg_set_wasm(exports: WebAssembly.Exports): void;
};

type WasmInstanceExports = WebAssembly.Exports & {
  __wbindgen_start(): void;
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

type ModuleLoader = () => Promise<WasmModule>;

let modulePromise: Promise<WasmModule> | null = null;
const defaultModuleLoader: ModuleLoader = async () => {
  const glueModule =
    // Vite SSR cannot resolve a fully variable dynamic import here.
    (await import(
      '../../../../rust/diplomacy-wasm/pkg/diplomacy_wasm_bg.js'
    )) as WasmGlueModule;
  const wasmPath = `${process.cwd()}/rust/diplomacy-wasm/pkg/diplomacy_wasm_bg.wasm`;
  const wasmBytes = await Bun.file(wasmPath).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    './diplomacy_wasm_bg.js': glueModule,
  });
  const exports = instance.exports as WasmInstanceExports;

  glueModule.__wbg_set_wasm(exports);
  exports.__wbindgen_start();

  return glueModule;
};
let moduleLoader: ModuleLoader = defaultModuleLoader;

function normalizeOptionalCoast(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCoastForUnit(
  province: string,
  unitType: 'army' | 'fleet',
  coast: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalCoast(coast);
  if (!normalized || unitType !== 'fleet') {
    return null;
  }

  const provinceData = PROVINCES[province];
  const validCoasts = provinceData?.coasts ?? [];
  if (validCoasts.length === 0) {
    return null;
  }

  return validCoasts.includes(normalized) ? normalized : null;
}

async function loadModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = moduleLoader().catch((error) => {
      modulePromise = null;
      throw error;
    });
  }

  return modulePromise;
}

function shouldLogFallbackWarning(): boolean {
  return process.env.NODE_ENV !== 'test';
}

function logMainPhaseFallback(
  operation: 'validateMainOrders' | 'adjudicateMainPhase',
  error: unknown,
) {
  if (!shouldLogFallbackWarning()) {
    return;
  }

  console.warn(
    `[rust-engine] ${operation} failed in WASM; falling back to TypeScript adjudicator`,
    error,
  );
}

function normalizePositions(positions: UnitPositions): UnitPositions {
  return Object.fromEntries(
    Object.entries(positions).map(([province, unit]) => [
      province,
      {
        power: unit.power,
        unitType: unit.unitType,
        coast: normalizeCoastForUnit(province, unit.unitType, unit.coast),
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
    coast: normalizeOptionalCoast(order.coast),
  }));
}

function normalizeDislodgedUnits(
  dislodgedUnits: DislodgedUnit[],
): DislodgedUnit[] {
  return dislodgedUnits.map((unit) => ({
    ...unit,
    coast: normalizeOptionalCoast(unit.coast),
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
    coast:
      build.action === 'build' && build.unitType
        ? normalizeCoastForUnit(build.province, build.unitType, build.coast)
        : normalizeOptionalCoast(build.coast),
  }));
}

function logBuildPhaseFallback(error: unknown) {
  if (!shouldLogFallbackWarning()) {
    return;
  }

  console.warn(
    '[rust-engine] adjudicateBuildPhase failed in WASM; falling back to TypeScript adjudicator',
    error,
  );
}

function fallbackAdjudicateBuildPhase(
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  builds: BuildOrder[],
  error: unknown,
): BuildResolution {
  logBuildPhaseFallback(error);
  return resolveBuilds(positions, supplyCenters, builds);
}

function deriveRetreatOrderResults(
  currentPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
  retreats: RetreatOrder[],
  result: Omit<RetreatResult, 'orderResults'>,
): RetreatOrderResult[] {
  const disbandedProvinces = new Set(
    result.disbandedUnits.map((unit) => unit.province),
  );
  const retreatTargetCounts = new Map<string, number>();

  for (const retreat of retreats) {
    if (retreat.retreatTo) {
      retreatTargetCounts.set(
        retreat.retreatTo,
        (retreatTargetCounts.get(retreat.retreatTo) ?? 0) + 1,
      );
    }
  }

  return retreats.map((retreat) => {
    if (!retreat.retreatTo) {
      return {
        order: retreat,
        success: false,
        resultType: 'disbanded',
        reason: 'Disbanded',
      };
    }

    const dislodged = dislodgedUnits.find(
      (unit) => unit.province === retreat.unitProvince,
    );
    if (!dislodged) {
      return {
        order: retreat,
        success: false,
        resultType: 'failed',
        reason: 'No dislodged unit found for retreat',
      };
    }

    if (!disbandedProvinces.has(retreat.unitProvince)) {
      return {
        order: retreat,
        success: true,
        resultType: 'retreated',
        reason: null,
      };
    }

    if (retreatTargetCounts.get(retreat.retreatTo)! > 1) {
      return {
        order: retreat,
        success: false,
        resultType: 'failed',
        reason: 'Rejected: conflicting retreats to the same province',
      };
    }

    if (!dislodged.retreatOptions.includes(retreat.retreatTo)) {
      return {
        order: retreat,
        success: false,
        resultType: 'failed',
        reason: 'Rejected: invalid retreat destination',
      };
    }

    if (currentPositions[getBaseProvince(retreat.retreatTo)]) {
      return {
        order: retreat,
        success: false,
        resultType: 'failed',
        reason: 'Rejected: destination is occupied',
      };
    }

    return {
      order: retreat,
      success: false,
      resultType: 'failed',
      reason: 'Rejected: retreat failed during adjudication',
    };
  });
}

function fallbackValidateMainOrders(
  positions: UnitPositions,
  orders: Order[],
  error: unknown,
): ValidationResult {
  logMainPhaseFallback('validateMainOrders', error);

  const errors = orders.flatMap((order) => {
    const validation = validateOrder(positions, order);
    if (validation.valid) {
      return [];
    }

    return [
      {
        unitProvince: order.unitProvince,
        message: validation.reason ?? 'Invalid order submission',
      },
    ];
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

function fallbackAdjudicateMainPhase(
  positions: UnitPositions,
  orders: Order[],
  error: unknown,
): ResolutionResult {
  logMainPhaseFallback('adjudicateMainPhase', error);
  return resolveOrders(positions, orders);
}

export function __setModuleLoaderForTests(loader: ModuleLoader | null) {
  moduleLoader = loader ?? defaultModuleLoader;
  modulePromise = null;
}

export async function validateMainOrders(
  positions: UnitPositions,
  orders: Order[],
): Promise<ValidationResult> {
  const normalizedPositions = normalizePositions(positions);
  const normalizedOrders = normalizeOrders(orders);

  try {
    const wasm = await loadModule();
    return wasm.validateMainOrders({
      positions: normalizedPositions,
      orders: normalizedOrders,
    }) as ValidationResult;
  } catch (error) {
    return fallbackValidateMainOrders(
      normalizedPositions,
      normalizedOrders,
      error,
    );
  }
}

export async function adjudicateMainPhase(
  positions: UnitPositions,
  orders: Order[],
): Promise<ResolutionResult> {
  const normalizedPositions = normalizePositions(positions);
  const normalizedOrders = normalizeOrders(orders);

  try {
    const wasm = await loadModule();
    return wasm.adjudicateMainPhase({
      positions: normalizedPositions,
      orders: normalizedOrders,
    }) as ResolutionResult;
  } catch (error) {
    return fallbackAdjudicateMainPhase(
      normalizedPositions,
      normalizedOrders,
      error,
    );
  }
}

export async function adjudicateRetreatPhase(
  currentPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
  retreats: RetreatOrder[],
): Promise<RetreatResult> {
  const wasm = await loadModule();
  const result = wasm.adjudicateRetreatPhase({
    currentPositions: normalizePositions(currentPositions),
    dislodgedUnits: normalizeDislodgedUnits(dislodgedUnits),
    retreats: normalizeRetreats(retreats),
  }) as Omit<RetreatResult, 'orderResults'>;

  return {
    ...result,
    orderResults: deriveRetreatOrderResults(
      currentPositions,
      dislodgedUnits,
      retreats,
      result,
    ),
  };
}

export async function adjudicateBuildPhase(
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  builds: BuildOrder[],
): Promise<BuildResolution> {
  const wasm = await loadModule();
  const normalizedPositions = normalizePositions(positions);
  const normalizedBuilds = normalizeBuilds(builds);

  try {
    return wasm.adjudicateBuildPhase({
      positions: normalizedPositions,
      supplyCenters,
      builds: normalizedBuilds,
    }) as BuildResolution;
  } catch (error) {
    return fallbackAdjudicateBuildPhase(
      normalizedPositions,
      supplyCenters,
      normalizedBuilds,
      error,
    );
  }
}
