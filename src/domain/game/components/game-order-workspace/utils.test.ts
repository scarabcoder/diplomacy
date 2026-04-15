import { describe, expect, test } from 'bun:test';
import { buildPlayersWindowSections } from './utils.ts';
import type { RoomPlayerSummary } from './types.ts';

const basePlayers: RoomPlayerSummary[] = [
  {
    id: 'spectator-z',
    userId: 'spectator-z',
    displayName: 'Zoe Spectator',
    power: null,
    role: 'member',
    status: 'active',
    isSpectator: true,
    isBot: false,
    activityTagline: null,
  },
  {
    id: 'france',
    userId: 'france-user',
    displayName: 'Beatrice France',
    power: 'france',
    role: 'creator',
    status: 'civil_disorder',
    isSpectator: false,
    isBot: false,
    activityTagline: null,
  },
  {
    id: 'england',
    userId: 'england-user',
    displayName: 'Alice England',
    power: 'england',
    role: 'member',
    status: 'active',
    isSpectator: false,
    isBot: false,
    activityTagline: null,
  },
  {
    id: 'germany-bot',
    userId: 'germany-bot',
    displayName: 'Bot Germany',
    power: 'germany',
    role: 'member',
    status: 'eliminated',
    isSpectator: false,
    isBot: true,
    activityTagline: null,
  },
  {
    id: 'spectator-a',
    userId: 'spectator-a',
    displayName: 'Ava Spectator',
    power: null,
    role: 'member',
    status: 'active',
    isSpectator: true,
    isBot: false,
    activityTagline: null,
  },
];

describe('buildPlayersWindowSections', () => {
  test('orders active powers canonically and groups spectators separately', () => {
    const sections = buildPlayersWindowSections({
      players: basePlayers,
      submissionStatus: {
        submitted: ['france'],
        pending: ['england'],
      },
      phase: 'order_submission',
      myUserId: 'england-user',
    });

    expect(sections.activePlayers.map((player) => player.power)).toEqual([
      'england',
      'france',
      'germany',
    ]);
    expect(
      sections.activePlayers.map((player) => player.submissionState),
    ).toEqual(['pending', 'submitted', null]);
    expect(sections.activePlayers[0]?.isCurrentUser).toBe(true);
    expect(sections.spectators.map((player) => player.displayName)).toEqual([
      'Ava Spectator',
      'Zoe Spectator',
    ]);
  });

  test('prioritizes pending powers ahead of already submitted powers', () => {
    const sections = buildPlayersWindowSections({
      players: [
        {
          id: 'england',
          userId: 'england-user',
          displayName: 'Alice England',
          power: 'england',
          role: 'member',
          status: 'active',
          isSpectator: false,
          isBot: false,
          activityTagline: null,
        },
        {
          id: 'turkey',
          userId: 'turkey-user',
          displayName: 'Tariq Turkey',
          power: 'turkey',
          role: 'member',
          status: 'active',
          isSpectator: false,
          isBot: false,
          activityTagline: null,
        },
      ],
      submissionStatus: {
        submitted: ['england'],
        pending: ['turkey'],
      },
      phase: 'order_submission',
      myUserId: null,
    });

    expect(sections.activePlayers.map((player) => player.power)).toEqual([
      'turkey',
      'england',
    ]);
  });

  test('suppresses submission states outside submission phases and for powers with no action due', () => {
    const resolutionSections = buildPlayersWindowSections({
      players: basePlayers,
      submissionStatus: {
        submitted: ['france'],
        pending: ['england'],
      },
      phase: 'order_resolution',
      myUserId: null,
    });

    expect(
      resolutionSections.activePlayers.map((player) => player.submissionState),
    ).toEqual([null, null, null]);

    const buildSections = buildPlayersWindowSections({
      players: basePlayers,
      submissionStatus: {
        submitted: ['france'],
        pending: [],
      },
      phase: 'build_submission',
      myUserId: null,
    });

    expect(
      buildSections.activePlayers.map((player) => player.submissionState),
    ).toEqual(['submitted', null, null]);
  });
});
