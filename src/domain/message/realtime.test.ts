import { describe, expect, it } from 'bun:test';
import {
  getBufferedMessageEvents,
  publishMessageEvent,
  subscribeMessageEvents,
} from './realtime.ts';

describe('message realtime publisher', () => {
  it('only delivers events to subscribers in the same room', async () => {
    const alphaIterator = subscribeMessageEvents('room-alpha');
    const bravoIterator = subscribeMessageEvents('room-bravo');

    publishMessageEvent('room-alpha', 'message_sent', 'thread-1');

    const alphaEvent = await alphaIterator.next();
    const bravoEvent = await Promise.race([
      bravoIterator.next(),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 20),
      ),
    ]);

    expect(alphaEvent.done).toBe(false);
    expect(alphaEvent.value).toMatchObject({
      roomId: 'room-alpha',
      cause: 'message_sent',
      threadId: 'thread-1',
    });
    expect(bravoEvent).toBe('timeout');

    await alphaIterator.return?.();
    await bravoIterator.return?.();
  });

  it('buffers events with monotonically increasing sequence numbers', () => {
    const roomId = `room-buffer-${crypto.randomUUID()}`;

    publishMessageEvent(roomId, 'thread_created', 'thread-1');
    publishMessageEvent(roomId, 'message_sent', 'thread-1');

    expect(getBufferedMessageEvents(roomId)).toEqual([
      expect.objectContaining({
        roomId,
        cause: 'thread_created',
        threadId: 'thread-1',
        sequence: 1,
      }),
      expect.objectContaining({
        roomId,
        cause: 'message_sent',
        threadId: 'thread-1',
        sequence: 2,
      }),
    ]);
  });
});
