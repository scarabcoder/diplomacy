import type {
  RetreatOrder,
  RetreatResult,
  UnitPositions,
  DislodgedUnit,
  Power,
  UnitType,
} from './types.ts';
import { getBaseProvince } from '../lib/province-refs.ts';

/**
 * Resolve retreat orders.
 *
 * Rules:
 * - If two+ dislodged units retreat to the same province, all are disbanded.
 * - If a retreat destination is invalid (not in retreatOptions), the unit is disbanded.
 * - Missing retreat orders = disband.
 */
export function resolveRetreats(
  currentPositions: UnitPositions,
  dislodgedUnits: DislodgedUnit[],
  retreats: RetreatOrder[],
): RetreatResult {
  const newPositions: UnitPositions = { ...currentPositions };
  const disbandedUnits: Array<{
    power: Power;
    unitType: UnitType;
    province: string;
  }> = [];

  // Build a map of retreat orders by province
  const retreatMap = new Map<string, RetreatOrder>();
  for (const retreat of retreats) {
    retreatMap.set(retreat.unitProvince, retreat);
  }

  // Collect all retreat destinations to detect collisions
  const retreatDestinations = new Map<string, RetreatOrder[]>();

  for (const dislodged of dislodgedUnits) {
    const retreat = retreatMap.get(dislodged.province);

    if (!retreat || !retreat.retreatTo) {
      // No retreat order or explicit disband
      disbandedUnits.push({
        power: dislodged.power,
        unitType: dislodged.unitType,
        province: dislodged.province,
      });
      continue;
    }

    const dest = getBaseProvince(retreat.retreatTo);

    // Validate retreat destination
    if (!dislodged.retreatOptions.includes(dest)) {
      // Invalid destination — disband
      disbandedUnits.push({
        power: dislodged.power,
        unitType: dislodged.unitType,
        province: dislodged.province,
      });
      continue;
    }

    // Check if destination is already occupied (by non-dislodged unit)
    if (newPositions[dest]) {
      disbandedUnits.push({
        power: dislodged.power,
        unitType: dislodged.unitType,
        province: dislodged.province,
      });
      continue;
    }

    // Track destination for collision detection
    if (!retreatDestinations.has(dest)) {
      retreatDestinations.set(dest, []);
    }
    retreatDestinations.get(dest)!.push(retreat);
  }

  // Resolve collisions: if 2+ units retreat to the same province, both are disbanded
  for (const [dest, retreatsToSameDest] of retreatDestinations) {
    if (retreatsToSameDest.length > 1) {
      // All retreating to the same province are disbanded
      for (const retreat of retreatsToSameDest) {
        const dislodged = dislodgedUnits.find(
          (d) => d.province === retreat.unitProvince,
        );
        if (dislodged) {
          disbandedUnits.push({
            power: dislodged.power,
            unitType: dislodged.unitType,
            province: dislodged.province,
          });
        }
      }
    } else {
      // Single unit retreating here — place it
      const retreat = retreatsToSameDest[0]!;
      const dislodged = dislodgedUnits.find(
        (d) => d.province === retreat.unitProvince,
      );
      if (dislodged) {
        newPositions[dest] = {
          power: dislodged.power,
          unitType: dislodged.unitType,
          coast: null, // TODO: handle coast for fleet retreats to multi-coast provinces
        };
      }
    }
  }

  return { newPositions, disbandedUnits, orderResults: [] };
}
