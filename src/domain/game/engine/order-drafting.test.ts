import { describe, expect, it } from 'bun:test';
import {
  getBuildChoices,
  getCoastalDestinationsForFleetArmy,
  getConvoyMoveTargets,
  getMoveTargets,
  getSupportMoveTargets,
  getSupportableUnitProvinces,
} from './order-drafting.ts';
import type { UnitPositions } from './types.ts';

describe('order drafting helpers', () => {
  it('includes convoy destinations for coastal armies across occupied fleet chains', () => {
    const positions: UnitPositions = {
      lon: { power: 'england', unitType: 'army', coast: null },
      eng: { power: 'england', unitType: 'fleet', coast: null },
      nth: { power: 'england', unitType: 'fleet', coast: null },
    };

    expect(getConvoyMoveTargets('lon', positions)).toEqual(
      expect.arrayContaining(['bel', 'bre', 'den', 'hol', 'nwy', 'pic', 'wal', 'yor']),
    );
    expect(getCoastalDestinationsForFleetArmy('eng', 'lon', positions)).toEqual(
      expect.arrayContaining(['bel', 'bre', 'pic', 'wal']),
    );
  });

  it('finds supportable units even when the supported unit is not adjacent', () => {
    const positions: UnitPositions = {
      mun: { power: 'germany', unitType: 'army', coast: null },
      par: { power: 'france', unitType: 'army', coast: null },
    };

    expect(getSupportableUnitProvinces('mun', positions)).toContain('par');
    expect(getSupportMoveTargets('mun', 'par', positions)).toContain('bur');
  });

  it('keeps fleet move targets coast-aware', () => {
    const positions: UnitPositions = {
      stp: { power: 'russia', unitType: 'fleet', coast: 'sc' },
    };

    expect(getMoveTargets('stp', positions)).toEqual(['bot', 'fin', 'lvn']);
  });

  it('offers the correct build choices for multi-coast home centers', () => {
    expect(getBuildChoices('stp')).toEqual([
      { unitType: 'army', coast: null },
      { unitType: 'fleet', coast: 'nc' },
      { unitType: 'fleet', coast: 'sc' },
    ]);
  });
});
