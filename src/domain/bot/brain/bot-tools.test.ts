import { describe, expect, it } from 'bun:test';
import { attachBotBoardReference, createBotTools } from './bot-tools.ts';

const baseToolContext = {
  botSession: {
    credentialId: crypto.randomUUID(),
    botId: crypto.randomUUID(),
    botName: 'Test Bot',
    playerId: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
  },
  roomId: crypto.randomUUID(),
  playerId: crypto.randomUUID(),
  power: 'england' as const,
};

describe('attachBotBoardReference', () => {
  it('adds an authoritative supply-center reference based on turn.supplyCenters', () => {
    const result = attachBotBoardReference({
      turn: {
        unitPositions: {
          ukr: { power: 'italy', unitType: 'army' },
          war: { power: 'italy', unitType: 'army' },
        },
        supplyCenters: {
          war: 'italy',
          mos: 'russia',
          sev: 'turkey',
        },
      },
    });

    expect(result.supplyCenterReference?.validSupplyCenters).toEqual([
      'mos',
      'sev',
      'war',
    ]);
    expect(result.supplyCenterReference?.countsByPower.italy).toBe(1);
    expect(result.supplyCenterReference?.countsByPower.russia).toBe(1);
    expect(result.supplyCenterReference?.countsByPower.turkey).toBe(1);
    expect(result.supplyCenterReference?.validSupplyCenters).not.toContain(
      'ukr',
    );
  });
});

describe('createBotTools', () => {
  it('exposes only the minimal finalize toolset', () => {
    const tools = createBotTools({
      ...baseToolContext,
      trigger: { type: 'finalize_phase' },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'get_game_state',
      'submit_orders',
      'submit_retreats',
      'submit_builds',
    ]);
  });

  it('keeps message-reply runs focused on reading and replying', () => {
    const tools = createBotTools({
      ...baseToolContext,
      trigger: {
        type: 'message_received',
        threadId: crypto.randomUUID(),
        senderPlayerId: crypto.randomUUID(),
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'get_game_state',
      'read_conversation',
      'send_message',
      'send_order_proposal',
      'set_observations',
      'update_relationship',
    ]);
  });
});
