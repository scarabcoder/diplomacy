import { EventPublisher } from '@orpc/server';
import { notifyMessageEventsUpdated } from '@/rpc/mcp-bot-sessions.ts';

export type MessageRealtimeCause =
  | 'thread_created'
  | 'message_sent'
  | 'thread_archived'
  | 'thread_read'
  | 'typing';

export type MessageRealtimeEvent = {
  roomId: string;
  threadId: string | null;
  cause: MessageRealtimeCause;
  at: string;
  playerId?: string;
};

export type BufferedMessageRealtimeEvent = MessageRealtimeEvent & {
  sequence: number;
};

const roomPublishers = new Map<
  string,
  EventPublisher<{ update: MessageRealtimeEvent }>
>();
const roomEventBuffers = new Map<string, BufferedMessageRealtimeEvent[]>();
const roomSequenceCounters = new Map<string, number>();
const MESSAGE_EVENT_BUFFER_SIZE = 200;

function getRoomPublisher(roomId: string) {
  let publisher = roomPublishers.get(roomId);
  if (!publisher) {
    publisher = new EventPublisher<{ update: MessageRealtimeEvent }>({
      maxBufferedEvents: 20,
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

export function publishMessageEvent(
  roomId: string,
  cause: MessageRealtimeCause,
  threadId: string | null,
) {
  const sequence = (roomSequenceCounters.get(roomId) ?? 0) + 1;
  roomSequenceCounters.set(roomId, sequence);
  const publisher = getRoomPublisher(roomId);
  const event = {
    roomId,
    cause,
    threadId,
    at: new Date().toISOString(),
  };
  const bufferedEvents = roomEventBuffers.get(roomId) ?? [];
  bufferedEvents.push({
    ...event,
    sequence,
  });
  if (bufferedEvents.length > MESSAGE_EVENT_BUFFER_SIZE) {
    bufferedEvents.splice(0, bufferedEvents.length - MESSAGE_EVENT_BUFFER_SIZE);
  }
  roomEventBuffers.set(roomId, bufferedEvents);
  publisher.publish('update', event);
  void notifyMessageEventsUpdated(roomId);
  releaseRoomPublisher(roomId, publisher);
}

export function getBufferedMessageEvents(roomId: string) {
  return [...(roomEventBuffers.get(roomId) ?? [])];
}

export function subscribeMessageEvents(
  roomId: string,
  options?: { signal?: AbortSignal; maxBufferedEvents?: number },
) {
  return getRoomPublisher(roomId).subscribe('update', options);
}

export async function* watchMessageEventStream({
  roomId,
  signal,
}: {
  roomId: string;
  signal?: AbortSignal;
}) {
  const publisher = getRoomPublisher(roomId);
  const iterator = subscribeMessageEvents(roomId, {
    signal,
    maxBufferedEvents: 20,
  });

  try {
    for await (const event of iterator) {
      yield event;
    }
  } finally {
    await iterator.return?.();
    releaseRoomPublisher(roomId, publisher);
  }
}

const TYPING_HEARTBEAT_INTERVAL_MS = 4_000;

export function publishTypingEvent(
  roomId: string,
  threadId: string,
  playerId: string,
) {
  const publisher = getRoomPublisher(roomId);
  publisher.publish('update', {
    roomId,
    cause: 'typing',
    threadId,
    playerId,
    at: new Date().toISOString(),
  });
  releaseRoomPublisher(roomId, publisher);
}

export async function withTypingHeartbeat<T>(
  roomId: string,
  threadId: string,
  playerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  publishTypingEvent(roomId, threadId, playerId);
  const interval = setInterval(() => {
    publishTypingEvent(roomId, threadId, playerId);
  }, TYPING_HEARTBEAT_INTERVAL_MS);

  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
}
