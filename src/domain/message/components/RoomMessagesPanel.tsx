import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, MessageSquare, Plus, Send, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import type { Power } from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { cn } from '@/lib/utils.ts';
import { client } from '@/rpc/client.ts';
import { orpcUtils } from '@/rpc/react.ts';
import { describeArchivedReason } from '../utils.ts';

const TYPING_THROTTLE_MS = 3_000;

type RoomMessagePlayer = {
  id: string;
  displayName: string;
  power: Power | null;
  status: 'active' | 'civil_disorder' | 'eliminated';
  isSpectator: boolean;
  isBot?: boolean;
};

type ThreadSummary = {
  id: string;
  kind: 'direct' | 'group';
  status: 'active' | 'archived';
  archivedReason: 'participant_eliminated' | 'room_completed' | null;
  participantPlayerIds: string[];
  lastMessage: {
    id: string;
    senderPlayerId: string;
    body: string;
    createdAt: Date;
  } | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  canSend: boolean;
};

function formatTimestamp(value: Date | null) {
  if (!value) {
    return 'No messages yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildPlayerLabel(
  player: RoomMessagePlayer | undefined,
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned',
) {
  if (!player) {
    return {
      primary: 'Unknown player',
      secondary: null,
    };
  }

  if (roomStatus !== 'lobby' && player.power) {
    return {
      primary: (
        <PowerName
          className="gap-1.5"
          flagClassName="h-3.5 w-5"
          power={player.power}
        />
      ),
      secondary: player.displayName,
    };
  }

  return {
    primary: player.displayName,
    secondary: player.power ? (
      <PowerName
        className="gap-1.5"
        flagClassName="h-3.5 w-5"
        power={player.power}
      />
    ) : null,
  };
}

function buildThreadTitle(
  thread: ThreadSummary,
  playersById: Map<string, RoomMessagePlayer>,
  currentPlayerId: string,
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned',
): ReactNode {
  const otherPlayers = thread.participantPlayerIds
    .filter((playerId) => playerId !== currentPlayerId)
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is RoomMessagePlayer => player != null);

  if (thread.kind === 'direct') {
    return buildPlayerLabel(otherPlayers[0], roomStatus).primary;
  }

  if (otherPlayers.length <= 3) {
    return otherPlayers.map((player, index) => (
      <Fragment key={player.id}>
        {index > 0 ? ', ' : null}
        {buildPlayerLabel(player, roomStatus).primary}
      </Fragment>
    ));
  }

  return `${otherPlayers.length} players`;
}

function buildThreadSubtitle(
  thread: ThreadSummary,
  playersById: Map<string, RoomMessagePlayer>,
  currentPlayerId: string,
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned',
): ReactNode {
  if (thread.lastMessage) {
    const sender =
      thread.lastMessage.senderPlayerId === currentPlayerId
        ? 'You'
        : buildPlayerLabel(
            playersById.get(thread.lastMessage.senderPlayerId),
            roomStatus,
          ).primary;

    return (
      <>
        {sender}: {thread.lastMessage.body}
      </>
    );
  }

  return thread.participantPlayerIds
    .filter((playerId) => playerId !== currentPlayerId)
    .map((playerId, index) => (
      <Fragment key={playerId}>
        {index > 0 ? ' · ' : null}
        {buildPlayerLabel(playersById.get(playerId), roomStatus).primary}
      </Fragment>
    ));
}

function TypingIndicator({
  typingPlayers,
  roomStatus,
}: {
  typingPlayers: RoomMessagePlayer[];
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned';
}) {
  if (typingPlayers.length === 0) {
    return null;
  }

  let label: ReactNode;
  if (typingPlayers.length === 1) {
    const name = buildPlayerLabel(typingPlayers[0], roomStatus).primary;
    label = <>{name} is typing</>;
  } else if (typingPlayers.length === 2) {
    const a = buildPlayerLabel(typingPlayers[0], roomStatus).primary;
    const b = buildPlayerLabel(typingPlayers[1], roomStatus).primary;
    label = <>{a} and {b} are typing</>;
  } else {
    label = <>{typingPlayers.length} players are typing</>;
  }

  return (
    <div className="flex items-center gap-2 px-1 pt-2 text-xs text-[color:var(--ink-soft)]">
      <span className="inline-flex gap-0.5">
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
      </span>
      <span className="italic">{label}</span>
    </div>
  );
}

function ParticipantChip({
  player,
  roomStatus,
}: {
  player: RoomMessagePlayer;
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned';
}) {
  const label = buildPlayerLabel(player, roomStatus);

  return (
    <div className="rounded-full border border-black/10 bg-white/72 px-3 py-1.5 text-xs text-[color:var(--ink-soft)]">
      <span className="font-semibold text-[color:var(--ink-strong)]">
        {label.primary}
      </span>
      {label.secondary ? (
        <span className="ml-1.5">{label.secondary}</span>
      ) : null}
    </div>
  );
}

export function RoomMessagesPanel({
  roomId,
  roomStatus,
  players,
  myPlayer,
  isOpen,
  onClose,
  shortcutRequest,
  typingByThread,
}: {
  roomId: string;
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned';
  players: RoomMessagePlayer[];
  myPlayer: RoomMessagePlayer | null;
  isOpen: boolean;
  onClose: () => void;
  shortcutRequest: { key: number; participantPlayerIds: string[] };
  typingByThread: Map<string, string[]>;
}) {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mobileShowList, setMobileShowList] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerSelection, setComposerSelection] = useState<string[]>([]);
  const [draftBody, setDraftBody] = useState('');

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const canAccessMessages = !!myPlayer && !myPlayer.isSpectator;
  const canStartThread =
    canAccessMessages &&
    roomStatus !== 'completed' &&
    myPlayer?.status !== 'eliminated';
  const eligibleComposePlayers = players.filter(
    (player) =>
      player.id !== myPlayer?.id &&
      !player.isSpectator &&
      player.status !== 'eliminated',
  );

  const threadsQuery = useQuery({
    ...orpcUtils.message.listThreads.queryOptions({
      input: { roomId },
    }),
    enabled: canAccessMessages,
  });

  const activeThreadQuery = useQuery({
    ...orpcUtils.message.getThread.queryOptions({
      input: {
        roomId,
        threadId: selectedThreadId ?? '',
      },
    }),
    enabled:
      canAccessMessages &&
      isOpen &&
      selectedThreadId != null &&
      !isComposerOpen,
  });

  const openOrCreateMutation = useMutation(
    orpcUtils.message.openOrCreateThread.mutationOptions({
      onSuccess: (result) => {
        void queryClient.invalidateQueries({
          queryKey: orpcUtils.message.listThreads.queryOptions({
            input: { roomId },
          }).queryKey,
        });
        setSelectedThreadId(result.thread.id);
        setIsComposerOpen(false);
      },
    }),
  );

  const sendMessageMutation = useMutation(
    orpcUtils.message.sendMessage.mutationOptions({
      onSuccess: async () => {
        setDraftBody('');
        await queryClient.invalidateQueries({
          queryKey: orpcUtils.message.listThreads.queryOptions({
            input: { roomId },
          }).queryKey,
        });
        if (selectedThreadId) {
          await queryClient.invalidateQueries({
            queryKey: orpcUtils.message.getThread.queryOptions({
              input: { roomId, threadId: selectedThreadId },
            }).queryKey,
          });
        }
      },
    }),
  );

  const markReadMutation = useMutation(
    orpcUtils.message.markThreadRead.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpcUtils.message.listThreads.queryOptions({
            input: { roomId },
          }).queryKey,
        });
        if (selectedThreadId) {
          await queryClient.invalidateQueries({
            queryKey: orpcUtils.message.getThread.queryOptions({
              input: { roomId, threadId: selectedThreadId },
            }).queryKey,
          });
        }
      },
    }),
  );

  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTyping = useCallback(() => {
    if (!selectedThreadId || typingThrottleRef.current) {
      return;
    }
    void client.message.startTyping({ roomId, threadId: selectedThreadId });
    typingThrottleRef.current = setTimeout(() => {
      typingThrottleRef.current = null;
    }, TYPING_THROTTLE_MS);
  }, [roomId, selectedThreadId]);

  useEffect(() => {
    return () => {
      if (typingThrottleRef.current) {
        clearTimeout(typingThrottleRef.current);
        typingThrottleRef.current = null;
      }
    };
  }, [selectedThreadId]);

  const threads = threadsQuery.data?.items ?? [];
  const activeThread = activeThreadQuery.data?.thread ?? null;
  const activeMessages = activeThreadQuery.data?.messages ?? [];
  const firstThreadId = threads[0]?.id ?? null;

  useEffect(() => {
    if (
      !isOpen ||
      isComposerOpen ||
      selectedThreadId ||
      firstThreadId == null ||
      (mobileShowList && window.matchMedia('(max-width: 639px)').matches)
    ) {
      return;
    }

    setSelectedThreadId(firstThreadId);
  }, [firstThreadId, isComposerOpen, isOpen, mobileShowList, selectedThreadId]);

  useEffect(() => {
    if (
      !isOpen ||
      shortcutRequest.key === 0 ||
      shortcutRequest.participantPlayerIds.length === 0
    ) {
      return;
    }

    void openOrCreateMutation.mutateAsync({
      roomId,
      participantPlayerIds: shortcutRequest.participantPlayerIds,
    });
  }, [isOpen, openOrCreateMutation, roomId, shortcutRequest]);

  useEffect(() => {
    if (
      !isOpen ||
      !selectedThreadId ||
      !activeThread ||
      activeThread.unreadCount === 0 ||
      markReadMutation.isPending
    ) {
      return;
    }

    void markReadMutation.mutateAsync({
      roomId,
      threadId: selectedThreadId,
    });
  }, [activeThread, isOpen, markReadMutation, roomId, selectedThreadId]);

  useEffect(() => {
    if (isOpen) {
      setMobileShowList(true);
    }
  }, [isOpen]);

  if (!isOpen || !canAccessMessages || !myPlayer) {
    return null;
  }

  const handleStartConversation = async () => {
    if (composerSelection.length === 0) {
      return;
    }

    await openOrCreateMutation.mutateAsync({
      roomId,
      participantPlayerIds: composerSelection,
    });
  };

  const handleSendMessage = async () => {
    if (!selectedThreadId || draftBody.trim().length === 0) {
      return;
    }

    await sendMessageMutation.mutateAsync({
      roomId,
      threadId: selectedThreadId,
      body: draftBody,
    });
  };

  const unreadThreadCount = threads.filter(
    (thread) => thread.unreadCount > 0,
  ).length;
  const panelTitle =
    roomStatus === 'completed' ? 'Archived Messages' : 'Messages';

  return (
    <>
      <button
        type="button"
        aria-label="Close messages"
        className="fixed inset-0 z-40 bg-[color:color-mix(in_oklab,var(--accent-navy)_24%,transparent)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 hidden w-[27rem] max-w-[calc(100vw-1rem)] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:fade-in-80 motion-safe:duration-300 sm:block">
        <div className="flex h-full flex-col border-l border-[color:color-mix(in_oklab,var(--border)_74%,var(--accent-brass)_26%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_94%,white_6%)_0%,color-mix(in_oklab,var(--paper-strong)_88%,var(--accent-brass)_12%)_100%)] shadow-[-20px_0_48px_rgba(66,48,24,0.24)]">
          <DrawerContent
            panelTitle={panelTitle}
            roomStatus={roomStatus}
            myPlayer={myPlayer}
            threads={threads}
            activeThread={activeThread}
            activeMessages={activeMessages}
            unreadThreadCount={unreadThreadCount}
            playersById={playersById}
            selectedThreadId={selectedThreadId}
            isComposerOpen={isComposerOpen}
            composerSelection={composerSelection}
            eligibleComposePlayers={eligibleComposePlayers}
            canStartThread={canStartThread}
            draftBody={draftBody}
            isBusy={
              threadsQuery.isLoading ||
              activeThreadQuery.isFetching ||
              openOrCreateMutation.isPending ||
              sendMessageMutation.isPending
            }
            roomId={roomId}
            typingByThread={typingByThread}
            onClose={onClose}
            onDraftBodyChange={setDraftBody}
            onTyping={handleTyping}
            onOpenComposer={() => {
              setComposerSelection([]);
              setIsComposerOpen(true);
              setMobileShowList(false);
            }}
            onCloseComposer={() => setIsComposerOpen(false)}
            onSelectThread={(threadId) => {
              setSelectedThreadId(threadId);
              setIsComposerOpen(false);
            }}
            onTogglePlayerSelection={(playerId) => {
              setComposerSelection((current) =>
                current.includes(playerId)
                  ? current.filter((id) => id !== playerId)
                  : [...current, playerId],
              );
            }}
            onStartConversation={() => void handleStartConversation()}
            onSendMessage={() => void handleSendMessage()}
          />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 top-16 z-50 motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:fade-in-80 motion-safe:duration-300 sm:hidden">
        <div className="flex h-full flex-col overflow-hidden rounded-t-[1.9rem] border border-b-0 border-[color:color-mix(in_oklab,var(--border)_74%,var(--accent-brass)_26%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_96%,white_4%)_0%,color-mix(in_oklab,var(--paper-strong)_90%,var(--accent-brass)_10%)_100%)] shadow-[0_-20px_48px_rgba(66,48,24,0.24)]">
          <DrawerContent
            panelTitle={panelTitle}
            roomStatus={roomStatus}
            myPlayer={myPlayer}
            threads={threads}
            activeThread={activeThread}
            activeMessages={activeMessages}
            unreadThreadCount={unreadThreadCount}
            playersById={playersById}
            selectedThreadId={selectedThreadId}
            isComposerOpen={isComposerOpen}
            composerSelection={composerSelection}
            eligibleComposePlayers={eligibleComposePlayers}
            canStartThread={canStartThread}
            draftBody={draftBody}
            isBusy={
              threadsQuery.isLoading ||
              activeThreadQuery.isFetching ||
              openOrCreateMutation.isPending ||
              sendMessageMutation.isPending
            }
            roomId={roomId}
            mobile
            mobileShowList={mobileShowList}
            typingByThread={typingByThread}
            onClose={onClose}
            onDraftBodyChange={setDraftBody}
            onTyping={handleTyping}
            onOpenComposer={() => {
              setComposerSelection([]);
              setIsComposerOpen(true);
              setMobileShowList(false);
            }}
            onCloseComposer={() => setIsComposerOpen(false)}
            onSelectThread={(threadId) => {
              setSelectedThreadId(threadId);
              setIsComposerOpen(false);
              setMobileShowList(false);
            }}
            onTogglePlayerSelection={(playerId) => {
              setComposerSelection((current) =>
                current.includes(playerId)
                  ? current.filter((id) => id !== playerId)
                  : [...current, playerId],
              );
            }}
            onStartConversation={() => void handleStartConversation()}
            onSendMessage={() => void handleSendMessage()}
            onDeselectThread={() => {
              setSelectedThreadId(null);
              setMobileShowList(true);
            }}
          />
        </div>
      </div>
    </>
  );
}

function DrawerContent({
  panelTitle,
  roomStatus,
  myPlayer,
  threads,
  activeThread,
  activeMessages,
  unreadThreadCount,
  playersById,
  selectedThreadId,
  isComposerOpen,
  composerSelection,
  eligibleComposePlayers,
  canStartThread,
  draftBody,
  isBusy,
  roomId: _roomId,
  mobile = false,
  typingByThread,
  onClose,
  onDraftBodyChange,
  onTyping,
  onOpenComposer,
  onCloseComposer,
  onSelectThread,
  onTogglePlayerSelection,
  onStartConversation,
  onSendMessage,
  onDeselectThread,
  mobileShowList,
}: {
  panelTitle: string;
  roomStatus: 'lobby' | 'playing' | 'completed' | 'abandoned';
  myPlayer: RoomMessagePlayer;
  threads: ThreadSummary[];
  activeThread: ThreadSummary | null;
  activeMessages: Array<{
    id: string;
    senderPlayerId: string;
    body: string;
    createdAt: Date;
  }>;
  unreadThreadCount: number;
  playersById: Map<string, RoomMessagePlayer>;
  selectedThreadId: string | null;
  isComposerOpen: boolean;
  composerSelection: string[];
  eligibleComposePlayers: RoomMessagePlayer[];
  canStartThread: boolean;
  draftBody: string;
  isBusy: boolean;
  roomId: string;
  mobile?: boolean;
  typingByThread: Map<string, string[]>;
  onClose: () => void;
  onDraftBodyChange: (value: string) => void;
  onTyping: () => void;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onSelectThread: (threadId: string) => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onStartConversation: () => void;
  onSendMessage: () => void;
  onDeselectThread?: () => void;
  mobileShowList?: boolean;
}) {
  const activeParticipants = (activeThread?.participantPlayerIds ?? [])
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is RoomMessagePlayer => player != null);
  const isReadOnly = activeThread ? !activeThread.canSend : false;

  const typingPlayers = useMemo(() => {
    if (!selectedThreadId) return [];
    return (typingByThread.get(selectedThreadId) ?? [])
      .filter((id) => id !== myPlayer.id)
      .map((id) => playersById.get(id))
      .filter((p): p is RoomMessagePlayer => p != null);
  }, [typingByThread, selectedThreadId, myPlayer.id, playersById]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevThreadIdRef = useRef<string | null>(null);

  const lastMessageId =
    activeMessages.length > 0
      ? activeMessages[activeMessages.length - 1]!.id
      : null;

  // Scroll to bottom on thread switch (before paint) so user never sees top
  useLayoutEffect(() => {
    if (selectedThreadId && selectedThreadId !== prevThreadIdRef.current) {
      prevThreadIdRef.current = selectedThreadId;
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [selectedThreadId]);

  // Smooth-scroll to bottom when a genuinely new message arrives
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !lastMessageId) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lastMessageId]);

  return (
    <>
      {mobile && !mobileShowList ? null : (
        <div
          className={cn(
            'flex items-start justify-between gap-4 border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-4 py-4',
            mobile && 'px-4 pt-3',
          )}
        >
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--accent-oxblood)]">
              Private Channels
            </div>
            <h2 className="mt-1 font-display text-[1.45rem] leading-none text-[color:var(--ink-strong)]">
              {panelTitle}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
              {unreadThreadCount > 0
                ? `${unreadThreadCount} thread${unreadThreadCount === 1 ? '' : 's'} need attention.`
                : 'Coordinate privately with room players.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)]"
            aria-label="Close messages"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {mobile && !mobileShowList ? null : (
          <div className="border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-full border border-[color:color-mix(in_oklab,var(--border)_74%,var(--accent-brass)_26%)] bg-white/72 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
                {threads.length} thread{threads.length === 1 ? '' : 's'}
              </div>
              {canStartThread ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-black/10 bg-white/72 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-white"
                  onClick={onOpenComposer}
                >
                  <Plus className="size-4" />
                  New Thread
                </Button>
              ) : null}
            </div>
          </div>
        )}

        <div
          className={cn(
            'grid min-h-0 flex-1 grid-rows-[minmax(14rem,18rem)_minmax(0,1fr)]',
            mobile &&
              !mobileShowList &&
              (isComposerOpen || selectedThreadId) &&
              'grid-rows-[0fr_minmax(0,1fr)]',
          )}
        >
          <div
            className={cn(
              'overflow-y-auto border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-3 py-3',
              mobile &&
                !mobileShowList &&
                (isComposerOpen || selectedThreadId) &&
                'invisible min-h-0 overflow-hidden border-b-0 py-0',
            )}
          >
            {threads.length > 0 ? (
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={cn(
                      'w-full rounded-[1.4rem] border px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.64)] transition duration-200 ease-out',
                      selectedThreadId === thread.id && !isComposerOpen
                        ? 'border-[color:var(--accent-brass)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_62%,white_38%)_0%,color-mix(in_oklab,var(--paper-strong)_76%,var(--accent-brass)_24%)_100%)]'
                        : 'border-black/10 bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] hover:-translate-y-0.5 hover:bg-white',
                    )}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[color:var(--ink-strong)]">
                          {buildThreadTitle(
                            thread,
                            playersById,
                            myPlayer.id,
                            roomStatus,
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-[color:var(--ink-soft)]">
                          {buildThreadSubtitle(
                            thread,
                            playersById,
                            myPlayer.id,
                            roomStatus,
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
                          {formatTimestamp(thread.lastMessageAt)}
                        </div>
                        {thread.unreadCount > 0 ? (
                          <div className="mt-2 inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--accent-oxblood)_30%,white_70%)] bg-[color:color-mix(in_oklab,var(--accent-oxblood)_10%,white_90%)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent-oxblood)]">
                            {thread.unreadCount} new
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="inline-flex rounded-full border border-black/10 bg-white/72 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
                        {thread.kind === 'direct' ? 'Direct' : 'Group'}
                      </div>
                      {thread.status === 'archived' ? (
                        <div className="inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--accent-brass)_36%,white_64%)] bg-[color:color-mix(in_oklab,var(--accent-brass)_14%,white_86%)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-strong)]">
                          Read-only
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-[color:color-mix(in_oklab,var(--border)_72%,var(--accent-brass)_28%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 py-5 text-sm text-[color:var(--ink-soft)]">
                No conversations yet. Start a direct or group thread to
                coordinate before the next move.
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col px-4 py-4">
            {isComposerOpen ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {mobile && onDeselectThread ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-full"
                        aria-label="Back to threads"
                        onClick={() => {
                          onCloseComposer();
                          onDeselectThread();
                        }}
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                    ) : null}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-oxblood)]">
                        New Thread
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[color:var(--ink-strong)]">
                        Choose participants
                      </div>
                    </div>
                  </div>
                  {mobile ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)]"
                      aria-label="Close messages"
                      onClick={onClose}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      aria-label="Close composer"
                      onClick={onCloseComposer}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                  Select one or more room players. The exact participant set
                  shares one thread.
                </p>
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto space-y-2">
                  {eligibleComposePlayers.map((player) => {
                    const selected = composerSelection.includes(player.id);
                    const label = buildPlayerLabel(player, roomStatus);

                    return (
                      <button
                        key={player.id}
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between rounded-[1.35rem] border px-3.5 py-3 text-left',
                          selected
                            ? 'border-[color:var(--accent-brass)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_66%,white_34%)_0%,color-mix(in_oklab,var(--paper-strong)_80%,var(--accent-brass)_20%)_100%)]'
                            : 'border-black/10 bg-white/72 hover:bg-white',
                        )}
                        onClick={() => onTogglePlayerSelection(player.id)}
                      >
                        <div>
                          <div className="text-sm font-semibold text-[color:var(--ink-strong)]">
                            {label.primary}
                          </div>
                          {label.secondary ? (
                            <div className="mt-1 text-xs text-[color:var(--ink-soft)]">
                              {label.secondary}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full border',
                            selected
                              ? 'border-[color:var(--accent-brass)] bg-[color:var(--accent-brass)] text-[color:var(--paper)]'
                              : 'border-black/10 bg-white/72 text-transparent',
                          )}
                        >
                          <Check className="size-4" />
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {composerSelection.map((playerId) => {
                    const player = playersById.get(playerId);
                    return player ? (
                      <ParticipantChip
                        key={playerId}
                        player={player}
                        roomStatus={roomStatus}
                      />
                    ) : null;
                  })}
                </div>
                <Button
                  type="button"
                  className="mt-4 h-11 rounded-full text-sm font-semibold uppercase tracking-[0.16em]"
                  disabled={composerSelection.length === 0 || isBusy}
                  onClick={onStartConversation}
                >
                  <Users className="size-4" />
                  Open Thread
                </Button>
              </div>
            ) : activeThread ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] pb-3">
                  {mobile && onDeselectThread ? (
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-soft)] hover:text-[color:var(--ink-strong)]"
                        onClick={onDeselectThread}
                      >
                        <ArrowLeft className="size-3.5" />
                        Threads
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)]"
                        aria-label="Close messages"
                        onClick={onClose}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-oxblood)]">
                    {activeThread.kind === 'direct'
                      ? 'Direct Thread'
                      : 'Group Thread'}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[color:var(--ink-strong)]">
                    {buildThreadTitle(
                      activeThread,
                      playersById,
                      myPlayer.id,
                      roomStatus,
                    )}
                  </div>
                  {activeThread.status === 'archived' ? (
                    <div className="mt-3 rounded-[1.2rem] border border-[color:color-mix(in_oklab,var(--accent-brass)_40%,white_60%)] bg-[color:color-mix(in_oklab,var(--accent-brass)_12%,white_88%)] px-3 py-3 text-sm text-[color:var(--ink-soft)]">
                      {describeArchivedReason(activeThread.archivedReason)}
                    </div>
                  ) : null}
                </div>
                <div
                  ref={messagesContainerRef}
                  className="mt-4 min-h-0 flex-1 overflow-y-auto space-y-3 pr-1"
                >
                  {activeMessages.length > 0 ? (
                    activeMessages.map((message) => {
                      const isMine = message.senderPlayerId === myPlayer.id;
                      const sender = buildPlayerLabel(
                        playersById.get(message.senderPlayerId),
                        roomStatus,
                      );

                      return (
                        <div
                          key={message.id}
                          className={cn(
                            'rounded-[1.35rem] border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.64)]',
                            isMine
                              ? 'ml-6 border-[color:color-mix(in_oklab,var(--accent-navy)_28%,white_72%)] bg-[color:color-mix(in_oklab,var(--accent-navy)_8%,white_92%)]'
                              : 'mr-6 border-black/10 bg-white/72',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
                              {isMine ? 'You' : sender.primary}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
                              {formatTimestamp(message.createdAt)}
                            </div>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--ink-strong)]">
                            {message.body}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[1.35rem] border border-dashed border-[color:color-mix(in_oklab,var(--border)_72%,var(--accent-brass)_28%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 py-5 text-sm text-[color:var(--ink-soft)]">
                      No messages yet. Use this thread to align on negotiations,
                      alliances, and tactical timing.
                    </div>
                  )}
                </div>
                <TypingIndicator
                  typingPlayers={typingPlayers}
                  roomStatus={roomStatus}
                />
                <div className="mt-4 border-t border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] pt-4">
                  <textarea
                    className="min-h-24 w-full rounded-[1.2rem] border border-black/10 bg-white/74 px-3.5 py-3 text-sm text-[color:var(--ink-strong)] outline-none ring-0 placeholder:text-[color:var(--ink-soft)] focus:border-[color:var(--accent-brass)]"
                    disabled={isReadOnly}
                    onChange={(event) => {
                      onDraftBodyChange(event.target.value);
                      if (event.target.value.trim().length > 0) {
                        onTyping();
                      }
                    }}
                    placeholder={
                      isReadOnly
                        ? 'This thread is archived.'
                        : 'Write a private message to this thread.'
                    }
                    value={draftBody}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-[color:var(--ink-soft)]">
                      {isReadOnly
                        ? 'Read-only history'
                        : 'Messages are room-private and immutable.'}
                    </div>
                    <Button
                      type="button"
                      className="h-10 rounded-full text-xs font-semibold uppercase tracking-[0.16em]"
                      disabled={
                        isReadOnly || draftBody.trim().length === 0 || isBusy
                      }
                      onClick={onSendMessage}
                    >
                      <Send className="size-4" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[1.45rem] border border-dashed border-[color:color-mix(in_oklab,var(--border)_72%,var(--accent-brass)_28%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 py-5 text-center text-sm text-[color:var(--ink-soft)]">
                <div className="space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/72 text-[color:var(--ink-soft)]">
                    <MessageSquare className="size-5" />
                  </div>
                  <p>Select a thread to read or send messages.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
