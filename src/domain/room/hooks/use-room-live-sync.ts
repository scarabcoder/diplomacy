import { ORPCError, consumeEventIterator } from '@orpc/client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { client } from '@/rpc/client.ts';
import { orpcUtils } from '@/rpc/react.ts';
import type { RoomPageStateSnapshot } from '../live-state.ts';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 5000;

function applySnapshot(
  roomId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: RoomPageStateSnapshot,
) {
  queryClient.setQueryData(
    orpcUtils.room.getRoom.queryOptions({ input: { roomId } }).queryKey,
    snapshot.roomData,
  );
  queryClient.setQueryData(
    orpcUtils.game.getGameState.queryOptions({ input: { roomId } }).queryKey,
    snapshot.gameState,
  );
}

export function useRoomLiveSync(roomId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopStream: (() => Promise<void>) | null = null;
    let retryCount = 0;
    let shouldReconnect = true;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || !shouldReconnect || reconnectTimer) {
        return;
      }

      const delay = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** retryCount,
        RETRY_MAX_DELAY_MS,
      );

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        retryCount += 1;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      const iterator = client.room.watchRoomPageState({ roomId });
      stopStream = consumeEventIterator(iterator, {
        onEvent: (snapshot) => {
          retryCount = 0;
          applySnapshot(roomId, queryClient, snapshot);
        },
        onError: (error) => {
          if (
            error instanceof ORPCError &&
            ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)
          ) {
            shouldReconnect = false;
            return;
          }

          if (!disposed) {
            console.error('Room live sync failed', error);
          }
        },
        onFinish: () => {
          stopStream = null;
          scheduleReconnect();
        },
      });
    };

    connect();

    return () => {
      disposed = true;
      shouldReconnect = false;
      clearReconnectTimer();
      void stopStream?.();
    };
  }, [queryClient, roomId]);
}
