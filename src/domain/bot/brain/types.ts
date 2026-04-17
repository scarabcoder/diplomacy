import type {
  GamePhaseEnum,
  PowerEnum,
} from '@/database/schema/game-schema.ts';

// --- Trigger types that activate the bot brain ---

export type BotBrainTrigger =
  | { type: 'game_start' }
  | { type: 'message_received'; threadId: string; senderPlayerId: string }
  | { type: 'phase_change'; phase: GamePhaseEnum }
  | { type: 'finalize_phase' };

// --- Memory types stored in bot_brain_state JSONB columns ---

export type BotObservation = {
  turn: number;
  phase: string;
  note: string;
};

export type BotRelationship = {
  trust: number; // -1 (enemy) to 1 (fully trusted ally)
  stance: 'allied' | 'friendly' | 'neutral' | 'suspicious' | 'hostile';
  notes: string[];
};

export type BotRelationships = Partial<Record<PowerEnum, BotRelationship>>;

// --- Bot info passed to the brain ---

export type BotBrainParams = {
  playerId: string;
  roomId: string;
  botId: string;
  power: PowerEnum;
  trigger: BotBrainTrigger;
};
