import type { ElementType, ReactNode } from 'react';
import type {
  BuildOrderDraft,
  MainOrderDraft,
  RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  BuildCount,
  DislodgedUnit,
  GamePhase,
  PlayerStatus,
  Power,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';

export type GameTurnState = {
  id: string;
  season: 'spring' | 'fall';
  year: number;
  phase: GamePhase;
  unitPositions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  dislodgedUnits: DislodgedUnit[];
};

export type SubmissionStatus = {
  submitted: Power[];
  pending: Power[];
};

export type RoomPlayerSummary = {
  id: string;
  userId: string;
  displayName: string;
  power: Power | null;
  role: 'creator' | 'member';
  status: PlayerStatus;
  isSpectator: boolean;
  isBot: boolean;
  activityTagline: string | null;
};

export type PlayerSubmissionState = 'submitted' | 'pending' | null;

export type PlayersWindowEntry = RoomPlayerSummary & {
  isCurrentUser: boolean;
  powerLabel: string;
  submissionState: PlayerSubmissionState;
};

export type PlayersWindowSections = {
  activePlayers: PlayersWindowEntry[];
  spectators: PlayersWindowEntry[];
};

export type MainSubmissionRecord = {
  unitProvince: string;
  orderType: 'hold' | 'move' | 'support' | 'convoy';
  targetProvince: string | null;
  supportedUnitProvince: string | null;
  viaConvoy: boolean;
};

export type RetreatSubmissionRecord = {
  unitProvince: string;
  retreatTo: string | null;
};

export type BuildSubmissionRecord = {
  action: 'build' | 'disband' | 'waive';
  province: string;
  unitType: 'army' | 'fleet' | null;
  coast: string | null;
};

export type MySubmission =
  | {
      phase: 'order_submission';
      orders: MainSubmissionRecord[];
    }
  | {
      phase: 'retreat_submission';
      retreats: RetreatSubmissionRecord[];
    }
  | {
      phase: 'build_submission';
      builds: BuildSubmissionRecord[];
    }
  | null;

export type MainInteraction =
  | { kind: 'idle' }
  | { kind: 'unit'; province: string }
  | { kind: 'move'; province: string; viaConvoy: boolean }
  | { kind: 'support-unit'; province: string }
  | { kind: 'support-target'; province: string; supportedUnitProvince: string }
  | { kind: 'convoy-unit'; province: string }
  | { kind: 'convoy-target'; province: string; supportedUnitProvince: string };

export type RetreatInteraction =
  | { kind: 'idle' }
  | { kind: 'unit'; province: string };

export type BuildInteraction =
  | { kind: 'idle' }
  | { kind: 'site'; province: string }
  | { kind: 'disband'; province: string };

export type FlyoutPanel = 'action' | 'summary' | 'submit' | null;

export type ToolbarAction = {
  id: string;
  label: string;
  icon: ElementType;
  onClick: () => void;
  tooltip?: string;
  disabled?: boolean;
  active?: boolean;
};

export type HeaderStatusChipData = {
  icon: ElementType;
  label: ReactNode;
  className?: string;
};

export type FlyoutContent = {
  title: string;
  subtitle?: string;
  body: ReactNode;
};

export type BuildProgressState =
  | {
      mode: 'build';
      total: number;
      completed: number;
      remaining: number;
      armies: number;
      fleets: number;
      builds: BuildOrderDraft[];
      disbands: BuildOrderDraft[];
    }
  | {
      mode: 'disband';
      total: number;
      completed: number;
      remaining: number;
      armies: number;
      fleets: number;
      builds: BuildOrderDraft[];
      disbands: BuildOrderDraft[];
    }
  | null;

export type GameOrderWorkspaceProps = {
  roomId: string;
  roomName: string;
  roomCode: string;
  players: RoomPlayerSummary[];
  turn: GameTurnState;
  submissionStatus: SubmissionStatus | null;
  buildCounts: BuildCount[] | null;
  myUserId: string | null;
  myPower: Power | null;
  isSpectator: boolean;
  mySubmission: MySubmission;
  onSubmitted: () => void;
  unreadThreadCount: number;
  isMessagesOpen: boolean;
  onToggleMessages: () => void;
  onMessagePlayer: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
};

export type MainDraftMap = Record<string, MainOrderDraft>;
export type RetreatDraftMap = Record<string, RetreatOrderDraft>;
