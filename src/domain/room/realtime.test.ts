import { describe, expect, it } from 'bun:test';
import {
  getRoomStateVersion,
  publishRoomEvent,
  subscribeRoomEvents,
} from './realtime.ts';

describe('room realtime publisher', () => {
  it('only delivers events to subscribers in the same room', async () => {
    const alphaIterator = subscribeRoomEvents('room-alpha');
    const bravoIterator = subscribeRoomEvents('room-bravo');

    publishRoomEvent('room-alpha', 'set_ready');

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
      cause: 'set_ready',
    });
    expect(bravoEvent).toBe('timeout');

    await alphaIterator.return?.();
    await bravoIterator.return?.();
  });

  it('increments the room page-state version for each published event', () => {
    const roomId = `room-version-${crypto.randomUUID()}`;

    expect(getRoomStateVersion(roomId)).toBe(0);

    publishRoomEvent(roomId, 'set_ready');
    publishRoomEvent(roomId, 'fill_bots');

    expect(getRoomStateVersion(roomId)).toBe(2);
  });
});
