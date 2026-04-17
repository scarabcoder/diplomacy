import { describe, expect, it } from 'bun:test';
import {
  attachHistoricalNarration,
  buildHistoricalNarrationContext,
  shouldGenerateHistoricalNarration,
} from './historical-narrator.ts';
import type { GamePhaseResultPayload } from './phase-results.ts';

describe('shouldGenerateHistoricalNarration', () => {
  it('generates narration after spring orders without retreats', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'order_submission',
        season: 'spring',
        dislodgedUnits: [],
      }),
    ).toBe(true);
  });

  it('generates narration after spring retreats', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'retreat_submission',
        season: 'spring',
        dislodgedUnits: [],
      }),
    ).toBe(true);
  });

  it('does not generate narration after orders when retreats are required', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'order_submission',
        season: 'fall',
        dislodgedUnits: [
          {
            power: 'germany',
            unitType: 'army',
            province: 'par',
            coast: null,
            dislodgedFrom: 'bur',
            retreatOptions: ['pic'],
          },
        ],
      }),
    ).toBe(false);
  });

  it('generates narration after fall orders even when builds are needed next', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'order_submission',
        season: 'fall',
        dislodgedUnits: [],
      }),
    ).toBe(true);
  });

  it('generates narration after fall orders when no retreats remain', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'order_submission',
        season: 'fall',
        dislodgedUnits: [],
      }),
    ).toBe(true);
  });

  it('generates narration after fall retreats even when builds are needed next', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'retreat_submission',
        season: 'fall',
        dislodgedUnits: [],
      }),
    ).toBe(true);
  });

  it('does not generate narration after build adjustments', () => {
    expect(
      shouldGenerateHistoricalNarration({
        phase: 'build_submission',
        season: 'fall',
        dislodgedUnits: [],
      }),
    ).toBe(false);
  });
});

describe('buildHistoricalNarrationContext', () => {
  it('includes prior phase outcomes when building final-turn narration input', () => {
    const context = buildHistoricalNarrationContext([
      createPayload({
        phase: 'order_submission',
        headline: 'Fall 1901 orders resolved',
        groups: [
          {
            id: 'success',
            title: 'Executed',
            items: [
              {
                id: 'france-bur',
                power: 'france',
                summary: 'A Burgundy -> Paris',
                detail: 'Executed',
                status: 'success',
              },
            ],
          },
        ],
      }),
      createPayload({
        phase: 'retreat_submission',
        headline: 'Fall 1901 retreats resolved',
        groups: [
          {
            id: 'info',
            title: 'Disbanded',
            items: [
              {
                id: 'germany-par',
                power: 'germany',
                summary: 'A Paris D',
                detail: 'Disbanded',
                status: 'info',
              },
            ],
          },
        ],
      }),
      createPayload({
        phase: 'build_submission',
        headline: 'Fall 1901 adjustments resolved',
        groups: [
          {
            id: 'success',
            title: 'Executed adjustments',
            items: [
              {
                id: 'france-mar',
                power: 'france',
                summary: 'Build A Marseilles',
                detail: 'Executed',
                status: 'success',
              },
            ],
          },
        ],
      }),
    ]);

    expect(context).toHaveLength(3);
    expect(context[0]?.groups[0]?.items).toContain(
      'A Burgundy -> Paris (Executed)',
    );
    expect(context[1]?.groups[0]?.items).toContain('A Paris D (Disbanded)');
    expect(context[2]?.groups[0]?.items).toContain(
      'Build A Marseilles (Executed)',
    );
  });
});

describe('attachHistoricalNarration', () => {
  it('adds narration to a fall order payload even when earlier same-season results exist', async () => {
    const payload = await attachHistoricalNarration({
      existingPayloads: [
        createPayload({
          phase: 'retreat_submission',
          season: 'spring',
          headline: 'Spring 1901 retreats resolved',
        }),
      ],
      payload: createPayload({
        phase: 'order_submission',
        season: 'fall',
        headline: 'Fall 1901 orders resolved',
      }),
      dislodgedUnits: [],
      generateNarration: async (payloads) => {
        expect(payloads).toHaveLength(2);
        expect(payloads[1]?.headline).toBe('Fall 1901 orders resolved');
        return 'Autumn war spread across the western front.';
      },
    });

    expect(payload.historicalNarration).toBe(
      'Autumn war spread across the western front.',
    );
  });

  it('does not add narration to build adjustment payloads', async () => {
    const payload = await attachHistoricalNarration({
      existingPayloads: [
        createPayload({
          phase: 'order_submission',
          season: 'fall',
          headline: 'Fall 1901 orders resolved',
        }),
      ],
      payload: createPayload({
        phase: 'build_submission',
        season: 'fall',
        headline: 'Fall 1901 adjustments resolved',
      }),
      dislodgedUnits: [],
      generateNarration: async () => 'should not be used',
    });

    expect(payload.historicalNarration).toBeNull();
  });
});

function createPayload(
  overrides: Partial<GamePhaseResultPayload>,
): GamePhaseResultPayload {
  return {
    turnNumber: 1,
    season: 'fall',
    year: 1901,
    phase: 'order_submission',
    headline: 'Fall 1901 orders resolved',
    historicalNarration: null,
    winnerPower: null,
    boardBefore: {
      positions: {},
      supplyCenters: {},
      dislodgedUnits: [],
    },
    boardAfter: {
      positions: {},
      supplyCenters: {},
      dislodgedUnits: [],
    },
    annotations: [],
    groups: [],
    ...overrides,
  };
}
