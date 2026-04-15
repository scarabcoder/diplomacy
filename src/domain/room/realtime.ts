import { EventPublisher } from '@orpc/server';
import { notifyRoomPageStateUpdated } from '@/rpc/mcp-bot-sessions.ts';

export type RoomRealtimeCause =
  | 'join_room'
  | 'select_power'
  | 'deselect_power'
  | 'set_ready'
  | 'start_game'
  | 'fill_bots'
  | 'submit_orders'
  | 'submit_retreats'
  | 'submit_builds'
  | 'finalize_phase'
  | 'bot_activity';

export type RoomRealtimeEvent = {
  roomId: string;
  cause: RoomRealtimeCause;
  at: string;
};

const roomPublishers = new Map<
  string,
  EventPublisher<{ update: RoomRealtimeEvent }>
>();
const roomStateVersions = new Map<string, number>();

function getRoomPublisher(roomId: string) {
  let publisher = roomPublishers.get(roomId);
  if (!publisher) {
    publisher = new EventPublisher<{ update: RoomRealtimeEvent }>({
      maxBufferedEvents: 1,
    });
    roomPublishers.set(roomId, publisher);
  }

  return publisher;
}

function releaseRoomPublisher(roomId: string, publisher: EventPublisher<any>) {
  if (publisher.size === 0 && roomPublishers.get(roomId) === publisher) {
    roomPublishers.delete(roomId);
  }
}

export function publishRoomEvent(roomId: string, cause: RoomRealtimeCause) {
  const publisher = getRoomPublisher(roomId);
  const nextVersion = (roomStateVersions.get(roomId) ?? 0) + 1;
  roomStateVersions.set(roomId, nextVersion);
  publisher.publish('update', {
    roomId,
    cause,
    at: new Date().toISOString(),
  });
  void notifyRoomPageStateUpdated(roomId);
  releaseRoomPublisher(roomId, publisher);
}

export function getRoomStateVersion(roomId: string) {
  return roomStateVersions.get(roomId) ?? 0;
}

export function subscribeRoomEvents(
  roomId: string,
  options?: { signal?: AbortSignal; maxBufferedEvents?: number },
) {
  return getRoomPublisher(roomId).subscribe('update', options);
}

export async function* watchRoomPageStateStream({
  roomId,
  playerId,
  signal,
}: {
  roomId: string;
  playerId: string | null;
  signal?: AbortSignal;
}) {
  const { getRoomPageStateSnapshot } = await import('./live-state.ts');

  yield await getRoomPageStateSnapshot(roomId, playerId);

  const publisher = getRoomPublisher(roomId);
  const iterator = subscribeRoomEvents(roomId, {
    signal,
    maxBufferedEvents: 1,
  });

  try {
    for await (const _event of iterator) {
      yield await getRoomPageStateSnapshot(roomId, playerId);
    }
  } finally {
    await iterator.return?.();
    releaseRoomPublisher(roomId, publisher);
  }
}
