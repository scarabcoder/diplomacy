import { describe, expect, it } from 'bun:test';
import { resolveOrders } from './resolve-orders.ts';
import type { Order, UnitPositions } from './types.ts';

describe('resolveOrders', () => {
  it('marks equal-strength competing moves as a standoff', () => {
    const positions: UnitPositions = {
      mun: { power: 'germany', unitType: 'army', coast: null },
      par: { power: 'france', unitType: 'army', coast: null },
    };

    const orders: Order[] = [
      {
        power: 'germany',
        unitType: 'army',
        unitProvince: 'mun',
        orderType: 'move',
        targetProvince: 'bur',
      },
      {
        power: 'france',
        unitType: 'army',
        unitProvince: 'par',
        orderType: 'move',
        targetProvince: 'bur',
      },
    ];

    const result = resolveOrders(positions, orders);

    expect(result.standoffProvinces).toEqual(['bur']);
    expect(result.newPositions).toEqual(positions);
    expect(
      result.orderResults.map((orderResult) => orderResult.resultType),
    ).toEqual(['bounced', 'bounced']);
  });

  it('reports retreat options after a supported dislodgement', () => {
    const positions: UnitPositions = {
      bur: { power: 'france', unitType: 'army', coast: null },
      gas: { power: 'france', unitType: 'army', coast: null },
      par: { power: 'germany', unitType: 'army', coast: null },
    };

    const orders: Order[] = [
      {
        power: 'france',
        unitType: 'army',
        unitProvince: 'bur',
        orderType: 'move',
        targetProvince: 'par',
      },
      {
        power: 'france',
        unitType: 'army',
        unitProvince: 'gas',
        orderType: 'support',
        supportedUnitProvince: 'bur',
        targetProvince: 'par',
      },
      {
        power: 'germany',
        unitType: 'army',
        unitProvince: 'par',
        orderType: 'hold',
      },
    ];

    const result = resolveOrders(positions, orders);
    const dislodgedUnit = result.dislodgedUnits[0];

    expect(result.newPositions).toEqual({
      gas: positions.gas!,
      par: positions.bur!,
    });
    expect(dislodgedUnit).toMatchObject({
      province: 'par',
      dislodgedFrom: 'bur',
    });
    expect(dislodgedUnit?.retreatOptions.toSorted()).toEqual(['bre', 'pic']);
  });

  it('falls back to a direct land move when a convoy chain is missing', () => {
    const positions: UnitPositions = {
      lon: { power: 'england', unitType: 'army', coast: null },
    };

    const orders: Order[] = [
      {
        power: 'england',
        unitType: 'army',
        unitProvince: 'lon',
        orderType: 'move',
        targetProvince: 'wal',
        viaConvoy: true,
      },
    ];

    const result = resolveOrders(positions, orders);

    expect(result.newPositions).toEqual({
      wal: positions.lon!,
    });
    expect(result.orderResults[0]).toMatchObject({
      success: true,
      resultType: 'executed',
    });
  });
});
