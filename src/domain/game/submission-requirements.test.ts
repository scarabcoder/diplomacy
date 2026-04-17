import { describe, expect, it } from 'bun:test';
import { getPowersRequiringSubmission } from './submission-requirements.ts';
import type { Power } from '@/domain/game/engine/types.ts';

describe('getPowersRequiringSubmission', () => {
  const players: Array<{
    power: Power | null;
    status: 'active' | 'eliminated';
    isSpectator: boolean;
  }> = [
    {
      power: 'france',
      status: 'active' as const,
      isSpectator: false,
    },
    {
      power: 'germany',
      status: 'active' as const,
      isSpectator: false,
    },
    {
      power: 'italy',
      status: 'eliminated' as const,
      isSpectator: false,
    },
    {
      power: null,
      status: 'active' as const,
      isSpectator: true,
    },
  ];

  it('ignores active powers with no units during order submission', () => {
    const required = getPowersRequiringSubmission(
      {
        phase: 'order_submission',
        unitPositions: {
          par: { power: 'france', unitType: 'army', coast: null },
        },
        dislodgedUnits: null,
        supplyCenters: {},
      },
      players,
    );

    expect(required).toEqual(['france']);
  });

  it('includes only active powers with dislodged units during retreat submission', () => {
    const required = getPowersRequiringSubmission(
      {
        phase: 'retreat_submission',
        unitPositions: {},
        dislodgedUnits: [
          {
            power: 'france',
            unitType: 'army',
            province: 'bur',
            coast: null,
            dislodgedFrom: 'mun',
            retreatOptions: ['par'],
          },
          {
            power: 'italy',
            unitType: 'fleet',
            province: 'tys',
            coast: null,
            dislodgedFrom: 'wes',
            retreatOptions: ['tun'],
          },
        ],
        supplyCenters: {},
      },
      players,
    );

    expect(required).toEqual(['france']);
  });

  it('includes only active powers with build or disband actions due', () => {
    const required = getPowersRequiringSubmission(
      {
        phase: 'build_submission',
        unitPositions: {
          par: { power: 'france', unitType: 'army', coast: null },
          mar: { power: 'france', unitType: 'army', coast: null },
          ber: { power: 'germany', unitType: 'army', coast: null },
        },
        dislodgedUnits: null,
        supplyCenters: {
          par: 'france',
          mar: 'france',
          bre: 'france',
          ber: 'germany',
        },
      },
      players,
    );

    expect(required).toEqual(['france']);
  });
});
