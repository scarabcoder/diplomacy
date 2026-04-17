import { describe, expect, it } from 'bun:test';
import {
  buildBuildPhaseResultPayload,
  buildOrderPhaseResultPayload,
  buildRetreatPhaseResultPayload,
  selectPendingPhaseResult,
} from './phase-results.ts';

describe('phase result payloads', () => {
  it('captures fall order results with updated supply centers', () => {
    const payload = buildOrderPhaseResultPayload({
      turn: {
        id: 'turn-1',
        turnNumber: 3,
        season: 'fall',
        year: 1901,
        phase: 'order_submission',
        unitPositions: {
          bur: { power: 'france', unitType: 'army', coast: null },
        },
        supplyCenters: {
          par: 'germany',
        },
        dislodgedUnits: [],
      },
      orders: [
        {
          power: 'france',
          unitType: 'army',
          unitProvince: 'bur',
          orderType: 'move',
          targetProvince: 'par',
          supportedUnitProvince: null,
          viaConvoy: false,
          coast: null,
        },
      ],
      orderResults: [
        {
          order: {
            power: 'france',
            unitType: 'army',
            unitProvince: 'bur',
            orderType: 'move',
            targetProvince: 'par',
            supportedUnitProvince: null,
            viaConvoy: false,
            coast: null,
          },
          success: true,
          resultType: 'executed',
          dislodgedFrom: null,
          retreatOptions: [],
        },
      ],
      resolvedPositions: {
        par: { power: 'france', unitType: 'army', coast: null },
      },
      dislodgedUnits: [],
    });

    expect(payload.boardAfter.positions.par?.power).toBe('france');
    expect(payload.boardAfter.supplyCenters.par).toBe('france');
    expect(payload.historicalNarration).toBeNull();
    expect(payload.groups[0]?.items[0]).toMatchObject({
      status: 'success',
      detail: 'Executed',
    });
  });

  it('surfaces retreats and forced destruction after order resolution', () => {
    const payload = buildOrderPhaseResultPayload({
      turn: {
        id: 'turn-alerts',
        turnNumber: 2,
        season: 'spring',
        year: 1901,
        phase: 'order_submission',
        unitPositions: {
          bur: { power: 'france', unitType: 'army', coast: null },
          kie: { power: 'germany', unitType: 'fleet', coast: null },
        },
        supplyCenters: {},
        dislodgedUnits: [],
      },
      orders: [],
      orderResults: [],
      resolvedPositions: {},
      dislodgedUnits: [
        {
          power: 'france',
          unitType: 'army',
          province: 'bur',
          coast: null,
          dislodgedFrom: 'par',
          retreatOptions: ['pic', 'gas'],
        },
        {
          power: 'germany',
          unitType: 'fleet',
          province: 'kie',
          coast: null,
          dislodgedFrom: 'den',
          retreatOptions: [],
        },
      ],
    });

    expect(payload.alerts).toMatchObject([
      {
        id: 'retreat-required',
        title: 'Retreat required',
        tone: 'warning',
        items: [
          {
            summary: 'Army in Burgundy must retreat',
            detail: 'Dislodged by Paris. Legal retreats: Picardy, Gascony.',
            power: 'france',
          },
        ],
      },
      {
        id: 'destroyed',
        title: 'Destroyed',
        tone: 'danger',
        items: [
          {
            summary: 'Fleet in Kiel is destroyed',
            detail:
              'Dislodged by Denmark. No legal retreat destinations remain.',
            power: 'germany',
          },
        ],
      },
    ]);
    expect(payload.historicalNarration).toBeNull();
  });

  it('categorizes retreat failures and disbands', () => {
    const payload = buildRetreatPhaseResultPayload({
      turn: {
        id: 'turn-2',
        turnNumber: 3,
        season: 'spring',
        year: 1901,
        phase: 'retreat_submission',
        unitPositions: {
          par: { power: 'germany', unitType: 'army', coast: null },
        },
        supplyCenters: {},
        dislodgedUnits: [
          {
            power: 'france',
            unitType: 'army',
            province: 'bur',
            coast: null,
            dislodgedFrom: 'par',
            retreatOptions: ['pic'],
          },
        ],
      },
      retreats: [
        {
          power: 'france',
          unitType: 'army',
          unitProvince: 'bur',
          retreatTo: 'bel',
        },
      ],
      result: {
        newPositions: {
          par: { power: 'germany', unitType: 'army', coast: null },
        },
        disbandedUnits: [
          {
            power: 'france',
            unitType: 'army',
            province: 'bur',
          },
        ],
        orderResults: [
          {
            order: {
              power: 'france',
              unitType: 'army',
              unitProvince: 'bur',
              retreatTo: 'bel',
            },
            success: false,
            resultType: 'failed',
            reason: 'Rejected: invalid retreat destination',
          },
        ],
      },
    });

    expect(
      payload.groups.find((group) => group.id === 'failure')?.items[0],
    ).toMatchObject({
      summary: 'A Burgundy -> Belgium',
      detail: 'Rejected: invalid retreat destination',
      status: 'failure',
    });
    expect(payload.historicalNarration).toBeNull();
  });

  it('tracks executed, rejected, and waived build adjustments', () => {
    const payload = buildBuildPhaseResultPayload({
      turn: {
        id: 'turn-3',
        turnNumber: 4,
        season: 'fall',
        year: 1901,
        phase: 'build_submission',
        unitPositions: {
          lon: { power: 'england', unitType: 'fleet', coast: null },
        },
        supplyCenters: {
          lon: 'england',
        },
        dislodgedUnits: [],
      },
      builds: [
        {
          power: 'england',
          action: 'build',
          unitType: 'army',
          province: 'edi',
          coast: null,
        },
        {
          power: 'england',
          action: 'waive',
          unitType: null,
          province: 'lon',
          coast: null,
        },
      ],
      result: {
        newPositions: {
          lon: { power: 'england', unitType: 'fleet', coast: null },
          edi: { power: 'england', unitType: 'army', coast: null },
        },
        executed: [
          {
            power: 'england',
            action: 'build',
            unitType: 'army',
            province: 'edi',
            coast: null,
          },
          {
            power: 'england',
            action: 'waive',
            unitType: null,
            province: 'lon',
            coast: null,
          },
        ],
        failed: [],
      },
    });

    expect(
      payload.groups.find((group) => group.id === 'success')?.items[0]?.detail,
    ).toBe('Executed');
    expect(
      payload.groups.find((group) => group.id === 'info')?.items[0]?.detail,
    ).toBe('Build waived');
    expect(payload.historicalNarration).toBeNull();

    const narratedPayload = {
      ...payload,
      historicalNarration:
        'France tightened its hold in the west while Germany absorbed the losses.',
    };
    expect(narratedPayload.historicalNarration).toContain('France');
  });
});

describe('selectPendingPhaseResult', () => {
  it('returns the oldest unacknowledged result created after the player joined', () => {
    const selected = selectPendingPhaseResult(
      [
        {
          id: 'old-before-join',
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
        },
        {
          id: 'acked',
          createdAt: new Date('2026-04-11T10:00:00.000Z'),
        },
        {
          id: 'pending',
          createdAt: new Date('2026-04-12T10:00:00.000Z'),
        },
      ],
      new Set(['acked']),
      new Date('2026-04-11T00:00:00.000Z'),
    );

    expect(selected?.id).toBe('pending');
  });
});
