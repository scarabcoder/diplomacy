import { describe, expect, it } from 'bun:test';

import {
  adjudicateBuildPhase,
  adjudicateMainPhase,
  adjudicateRetreatPhase,
  validateMainOrders,
} from './rust-engine.ts';

describe('rust-engine adjudicator', () => {
  it('allows armies to move between gal and ukr', async () => {
    const validation = await validateMainOrders(
      {
        gal: { power: 'austria', unitType: 'army', coast: null },
      },
      [
        {
          power: 'austria',
          unitType: 'army',
          unitProvince: 'gal',
          orderType: 'move',
          targetProvince: 'ukr',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('allows fleets to move between con and smy', async () => {
    const validation = await validateMainOrders(
      {
        con: { power: 'turkey', unitType: 'fleet', coast: null },
      },
      [
        {
          power: 'turkey',
          unitType: 'fleet',
          unitProvince: 'con',
          orderType: 'move',
          targetProvince: 'smy',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('rejects illegal main-phase orders', async () => {
    const validation = await validateMainOrders(
      {
        par: { power: 'france', unitType: 'army', coast: null },
      },
      [
        {
          power: 'france',
          unitType: 'army',
          unitProvince: 'par',
          orderType: 'move',
          targetProvince: 'lon',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.message).toContain('cannot reach lon');
  });

  it('resolves translated sea provinces and coasted units in the main phase', async () => {
    const result = await adjudicateMainPhase(
      {
        wes: { power: 'france', unitType: 'fleet', coast: null },
        stp: { power: 'russia', unitType: 'fleet', coast: 'sc' },
      },
      [
        {
          power: 'france',
          unitType: 'fleet',
          unitProvince: 'wes',
          orderType: 'move',
          targetProvince: 'gol',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
        {
          power: 'russia',
          unitType: 'fleet',
          unitProvince: 'stp',
          orderType: 'move',
          targetProvince: 'lvn',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(result.orderResults).toHaveLength(2);
    expect(result.orderResults.every((order) => order.success)).toBe(true);
    expect(result.newPositions.gol).toMatchObject({
      power: 'france',
      unitType: 'fleet',
    });
    expect(result.newPositions.lvn).toMatchObject({
      power: 'russia',
      unitType: 'fleet',
    });
    expect(result.standoffProvinces).toEqual([]);
  });

  it('allows fleets to move from nth to nrg', async () => {
    const validation = await validateMainOrders(
      {
        nth: { power: 'england', unitType: 'fleet', coast: null },
      },
      [
        {
          power: 'england',
          unitType: 'fleet',
          unitProvince: 'nth',
          orderType: 'move',
          targetProvince: 'nrg',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const result = await adjudicateMainPhase(
      {
        nth: { power: 'england', unitType: 'fleet', coast: null },
      },
      [
        {
          power: 'england',
          unitType: 'fleet',
          unitProvince: 'nth',
          orderType: 'move',
          targetProvince: 'nrg',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
    );

    expect(result.orderResults).toHaveLength(1);
    expect(result.orderResults[0]).toMatchObject({
      success: true,
      resultType: 'executed',
    });
    expect(result.newPositions.nrg).toMatchObject({
      power: 'england',
      unitType: 'fleet',
    });
  });

  it('preserves exact retreat coasts', async () => {
    const result = await adjudicateRetreatPhase(
      {
        wes: { power: 'italy', unitType: 'fleet', coast: null },
      },
      [
        {
          power: 'france',
          unitType: 'fleet',
          province: 'gol',
          coast: null,
          dislodgedFrom: 'tys',
          retreatOptions: ['spa/sc'],
        },
      ],
      [
        {
          power: 'france',
          unitType: 'fleet',
          unitProvince: 'gol',
          retreatTo: 'spa/sc',
        },
      ],
    );

    expect(result.disbandedUnits).toEqual([]);
    expect(result.newPositions.spa).toMatchObject({
      power: 'france',
      unitType: 'fleet',
      coast: 'sc',
    });
  });

  it('adjudicates build phases', async () => {
    const result = await adjudicateBuildPhase(
      {
        edi: { power: 'england', unitType: 'fleet', coast: null },
        lvp: { power: 'england', unitType: 'army', coast: null },
      },
      {
        lon: 'england',
        edi: 'england',
        lvp: 'england',
      },
      [
        {
          power: 'england',
          action: 'build',
          unitType: 'fleet',
          province: 'lon',
          coast: null,
        },
      ],
    );

    expect(result.failed).toEqual([]);
    expect(result.executed).toHaveLength(1);
    expect(result.newPositions.lon).toMatchObject({
      power: 'england',
      unitType: 'fleet',
    });
  });
});
