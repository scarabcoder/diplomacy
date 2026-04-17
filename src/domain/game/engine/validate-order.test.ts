import { describe, expect, it } from 'bun:test';

import { validateOrder } from './validate-order.ts';

describe('validateOrder', () => {
  it('allows armies to move between edi and lvp', () => {
    const result = validateOrder(
      {
        edi: { power: 'england', unitType: 'army' },
      },
      {
        power: 'england',
        unitType: 'army',
        unitProvince: 'edi',
        orderType: 'move',
        targetProvince: 'lvp',
        supportedUnitProvince: null,
        viaConvoy: false,
        coast: null,
      },
    );

    expect(result).toEqual({ valid: true });
  });

  it('allows fleets to move between edi and yor', () => {
    const result = validateOrder(
      {
        edi: { power: 'england', unitType: 'fleet', coast: null },
      },
      {
        power: 'england',
        unitType: 'fleet',
        unitProvince: 'edi',
        orderType: 'move',
        targetProvince: 'yor',
        supportedUnitProvince: null,
        viaConvoy: false,
        coast: null,
      },
    );

    expect(result).toEqual({ valid: true });
  });

  it('allows fleets to move between nwy and stp/nc', () => {
    const result = validateOrder(
      {
        nwy: { power: 'england', unitType: 'fleet', coast: null },
      },
      {
        power: 'england',
        unitType: 'fleet',
        unitProvince: 'nwy',
        orderType: 'move',
        targetProvince: 'stp/nc',
        supportedUnitProvince: null,
        viaConvoy: false,
        coast: null,
      },
    );

    expect(result).toEqual({ valid: true });
  });

  it('rejects a coast suffix for non-multi-coast fleet moves', () => {
    const result = validateOrder(
      {
        ank: { power: 'turkey', unitType: 'fleet', coast: null },
      },
      {
        power: 'turkey',
        unitType: 'fleet',
        unitProvince: 'ank',
        orderType: 'move',
        targetProvince: 'bla',
        supportedUnitProvince: null,
        viaConvoy: false,
        coast: 'xx',
      },
    );

    expect(result).toEqual({
      valid: false,
      reason: 'bla does not accept a coast specification',
    });
  });
});
