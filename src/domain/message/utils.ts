import type { RoomStatusEnum } from '@/database/schema/game-schema.ts';
import type { PlayerStatusEnum } from '@/database/schema/game-schema.ts';
import type { RoomConversationArchivedReason } from '@/database/schema/message-schema.ts';

export function buildParticipantKey(playerIds: string[]) {
  return [...new Set(playerIds)].sort().join(':');
}

export function canAccessMessages(params: {
  isSpectator: boolean;
  isBot: boolean;
}) {
  return !params.isSpectator;
}

export function canWriteMessages(params: {
  roomStatus: RoomStatusEnum;
  playerStatus: PlayerStatusEnum;
  isSpectator: boolean;
  isBot: boolean;
}) {
  if (!canAccessMessages(params)) {
    return false;
  }

  if (params.roomStatus === 'completed') {
    return false;
  }

  return params.playerStatus !== 'eliminated';
}

export function describeArchivedReason(
  reason: RoomConversationArchivedReason | null,
) {
  if (reason === 'participant_eliminated') {
    return 'Archived because one of the participants was eliminated.';
  }

  if (reason === 'room_completed') {
    return 'Archived because the room is complete.';
  }

  return 'This conversation is read-only.';
}
