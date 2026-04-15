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

let modulePromise: Promise<WasmModule> | null = null;

async function loadModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const glueModule =
        (await import('../../../../rust/diplomacy-wasm/pkg/diplomacy_wasm_bg.js')) as WasmGlueModule;
      const wasmUrl = new URL(
        '../../../../rust/diplomacy-wasm/pkg/diplomacy_wasm_bg.wasm',
        import.meta.url,
      );
      const wasmBytes = await Bun.file(wasmUrl).arrayBuffer();
      const { instance } = await WebAssembly.instantiate(wasmBytes, {
        './diplomacy_wasm_bg.js': glueModule,
      });
      const exports = instance.exports as WasmInstanceExports;

      glueModule.__wbg_set_wasm(exports);
      exports.__wbindgen_start();

      return glueModule;
    })();
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

function normalizeDislodgedUnits(
  dislodgedUnits: DislodgedUnit[],
): DislodgedUnit[] {
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
  return wasm.adjudicateBuildPhase({
    positions: normalizePositions(positions),
    supplyCenters,
    builds: normalizeBuilds(builds),
  }) as BuildResolution;
}
