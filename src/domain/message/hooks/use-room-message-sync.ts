import { ORPCError, consumeEventIterator } from '@orpc/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { client } from '@/rpc/client.ts';
import { orpcUtils } from '@/rpc/react.ts';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 5000;
const TYPING_EXPIRY_MS = 6_000;

type TypingTimers = Map<string, Map<string, ReturnType<typeof setTimeout>>>;

export function useRoomMessageSync(roomId: string, enabled = true) {
  const queryClient = useQueryClient();
  const [typingByThread, setTypingByThread] = useState<Map<string, string[]>>(
    new Map(),
  );
  const typingTimersRef = useRef<TypingTimers>(new Map());

  const clearAllTypingTimers = useCallback(() => {
    for (const threadTimers of typingTimersRef.current.values()) {
      for (const timer of threadTimers.values()) {
        clearTimeout(timer);
      }
    }
    typingTimersRef.current.clear();
  }, []);

  const clearAllTypingState = useCallback(() => {
    clearAllTypingTimers();
    setTypingByThread(new Map());
  }, [clearAllTypingTimers]);

  const addTypingPlayer = useCallback(
    (threadId: string, playerId: string) => {
      // Clear existing expiry timer for this player/thread
      const threadTimers =
        typingTimersRef.current.get(threadId) ?? new Map<string, ReturnType<typeof setTimeout>>();
      const existing = threadTimers.get(playerId);
      if (existing) {
        clearTimeout(existing);
      }

      // Set new expiry timer
      const timer = setTimeout(() => {
        threadTimers.delete(playerId);
        if (threadTimers.size === 0) {
          typingTimersRef.current.delete(threadId);
        }
        setTypingByThread((prev) => {
          const next = new Map(prev);
          const players = (next.get(threadId) ?? []).filter(
            (id) => id !== playerId,
          );
          if (players.length === 0) {
            next.delete(threadId);
          } else {
            next.set(threadId, players);
          }
          return next;
        });
      }, TYPING_EXPIRY_MS);

      threadTimers.set(playerId, timer);
      typingTimersRef.current.set(threadId, threadTimers);

      // Update state
      setTypingByThread((prev) => {
        const next = new Map(prev);
        const players = next.get(threadId) ?? [];
        if (!players.includes(playerId)) {
          next.set(threadId, [...players, playerId]);
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

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

    const invalidateRoomMessageQueries = (threadId: string | null) => {
      void queryClient.invalidateQueries({
        queryKey: orpcUtils.message.listThreads.queryOptions({ input: { roomId } })
          .queryKey,
      });

      if (!threadId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: orpcUtils.message.getThread.queryOptions({
          input: { roomId, threadId },
        }).queryKey,
      });
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

      clearAllTypingState();

      const iterator = client.message.watchMessageEvents({ roomId });
      stopStream = consumeEventIterator(iterator, {
        onEvent: (event) => {
          retryCount = 0;

          if (
            event.cause === 'typing' &&
            event.playerId &&
            event.threadId
          ) {
            addTypingPlayer(event.threadId, event.playerId);
            return;
          }

          invalidateRoomMessageQueries(event.threadId);
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
            console.error('Message live sync failed', error);
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
      clearAllTypingState();
      void stopStream?.();
    };
  }, [addTypingPlayer, clearAllTypingState, enabled, queryClient, roomId]);

  return { typingByThread };
}
