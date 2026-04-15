import { type CSSProperties, type Dispatch, type SetStateAction, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Gavel,
  Loader2,
  MessageSquare,
  Play,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  InviteCode,
  ParchmentPanel,
  SectionKicker,
  StatusSeal,
  WarRoomStage,
} from '@/components/surfaces/war-room.tsx';
import { Button } from '@/components/ui/button.tsx';
import { GamePhaseResultsScreen } from '@/domain/game/components/GamePhaseResultsScreen.tsx';
import { GameOrderWorkspace } from '@/domain/game/components/GameOrderWorkspace.tsx';
import { POWERS, type Power } from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { RoomMessagesPanel } from '@/domain/message/components/RoomMessagesPanel.tsx';
import { useRoomMessageSync } from '@/domain/message/hooks/use-room-message-sync.ts';
import { useRoomLiveSync } from '@/domain/room/hooks/use-room-live-sync.ts';
import { orpcUtils } from '@/rpc/react.ts';

const powerMeta: Record<Power, { theater: string; palette: string }> = {
  england: {
    theater: 'North Sea command',
    palette:
      'border-[oklch(0.63_0.08_250)] bg-[oklch(0.95_0.02_248)] text-[oklch(0.32_0.07_248)]',
  },
  france: {
    theater: 'Western front',
    palette:
      'border-[oklch(0.65_0.1_28)] bg-[oklch(0.95_0.024_28)] text-[oklch(0.37_0.12_28)]',
  },
  germany: {
    theater: 'Central pressure',
    palette:
      'border-[oklch(0.55_0.03_80)] bg-[oklch(0.94_0.01_80)] text-[oklch(0.3_0.03_70)]',
  },
  russia: {
    theater: 'Continental depth',
    palette:
      'border-[oklch(0.64_0.09_300)] bg-[oklch(0.95_0.02_300)] text-[oklch(0.37_0.09_300)]',
  },
  austria: {
    theater: 'Balkan hinge',
    palette:
      'border-[oklch(0.63_0.09_18)] bg-[oklch(0.95_0.024_18)] text-[oklch(0.37_0.11_18)]',
  },
  italy: {
    theater: 'Mediterranean balance',
    palette:
      'border-[oklch(0.63_0.1_145)] bg-[oklch(0.95_0.02_145)] text-[oklch(0.34_0.09_145)]',
  },
  turkey: {
    theater: 'Eastern gate',
    palette:
      'border-[oklch(0.68_0.13_82)] bg-[oklch(0.96_0.025_82)] text-[oklch(0.42_0.1_74)]',
  },
};

export const Route = createFileRoute('/_authenticated/rooms/$roomId/')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.room.getRoom.queryOptions({ input: { roomId: params.roomId } }),
    );
  },
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const queryClient = useQueryClient();
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [latestCreatedBots, setLatestCreatedBots] = useState<
    Array<{
      botId: string;
      playerId: string;
      roomId: string;
      power: Power;
      displayName: string;
      token: string;
    }>
  >([]);
  const [messageShortcutRequest, setMessageShortcutRequest] = useState({
    key: 0,
    participantPlayerIds: [] as string[],
  });
  useRoomLiveSync(roomId);

  const { data } = useSuspenseQuery(
    orpcUtils.room.getRoom.queryOptions({
      input: { roomId },
    }),
  );

  const { data: session } = useSuspenseQuery(
    orpcUtils.auth.getUserSession.queryOptions(),
  );

  const invalidateRoom = () => {
    void queryClient.invalidateQueries({
      queryKey: orpcUtils.room.getRoom.queryOptions({ input: { roomId } })
        .queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpcUtils.game.getGameState.queryOptions({ input: { roomId } })
        .queryKey,
    });
  };

  const { room, players } = data;
  const myPlayer = players.find((player) => player.userId === session?.user.id);
  const isCreator = myPlayer?.role === 'creator';
  const canAccessMessages = !!myPlayer && !myPlayer.isSpectator;

  const { typingByThread } = useRoomMessageSync(roomId, canAccessMessages);

  const { data: messageThreads } = useQuery({
    ...orpcUtils.message.listThreads.queryOptions({
      input: { roomId },
    }),
    enabled: canAccessMessages,
  });

  const unreadThreadCount =
    messageThreads?.items.filter((thread) => thread.unreadCount > 0).length ??
    0;

  const handleMessagePlayer = (playerId: string) => {
    setMessageShortcutRequest((current) => ({
      key: current.key + 1,
      participantPlayerIds: [playerId],
    }));
    setIsMessagesOpen(true);
  };

  const messagesPanel = (
    <RoomMessagesPanel
      roomId={roomId}
      roomStatus={room.status}
      players={players}
      myPlayer={myPlayer ?? null}
      isOpen={isMessagesOpen}
      onClose={() => setIsMessagesOpen(false)}
      shortcutRequest={messageShortcutRequest}
      typingByThread={typingByThread}
    />
  );

  if (room.status !== 'lobby') {
    return (
      <>
        <ActiveRoomView
          roomId={roomId}
          room={room}
          players={players}
          myPlayer={myPlayer}
          myUserId={session?.user.id ?? null}
          onUpdate={invalidateRoom}
          unreadThreadCount={unreadThreadCount}
          isMessagesOpen={isMessagesOpen}
          onToggleMessages={() => setIsMessagesOpen((current) => !current)}
          onMessagePlayer={handleMessagePlayer}
        />
        {messagesPanel}
      </>
    );
  }

  return (
    <>
      <WarRoomStage>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
          <ParchmentPanel className="stagger-panel px-5 py-5 sm:px-6" style={{ '--stagger-index': 0 } as CSSProperties}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Link
                  className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-[color:var(--accent-navy)] transition hover:text-[color:var(--accent-oxblood)]"
                  to="/"
                >
                  <ArrowLeft className="size-4" />
                  Back to all rooms
                </Link>

                <div className="space-y-2">
                  <SectionKicker>Lobby</SectionKicker>
                  <h1 className="font-display text-4xl text-foreground sm:text-5xl">
                    {room.name}
                  </h1>
                  <p className="max-w-[48rem] text-base leading-7 text-muted-foreground sm:text-lg">
                    Assign powers, mark players ready, and start once every
                    active seat is set.
                  </p>
                </div>
              </div>

              <LobbyCodeActions
                canAccessMessages={canAccessMessages}
                code={room.code}
                onOpenMessages={() => setIsMessagesOpen(true)}
                unreadThreadCount={unreadThreadCount}
              />
            </div>
          </ParchmentPanel>

          <LobbyView
            createdBots={latestCreatedBots}
            isCreator={isCreator}
            myPlayer={myPlayer}
            onUpdate={invalidateRoom}
            players={players}
            room={room}
            roomId={roomId}
            setCreatedBots={setLatestCreatedBots}
          />
        </div>
      </WarRoomStage>
      {messagesPanel}
    </>
  );
}

function LobbyView({
  roomId,
  room,
  players,
  myPlayer,
  isCreator,
  createdBots,
  setCreatedBots,
  onUpdate,
}: {
  roomId: string;
  room: any;
  players: any[];
  myPlayer: any;
  isCreator: boolean;
  createdBots: Array<{
    botId: string;
    playerId: string;
    roomId: string;
    power: Power;
    displayName: string;
    token: string;
  }>;
  setCreatedBots: Dispatch<
    SetStateAction<
      Array<{
        botId: string;
        playerId: string;
        roomId: string;
        power: Power;
        displayName: string;
        token: string;
      }>
    >
  >;
  onUpdate: () => void;
}) {
  const [copiedBotId, setCopiedBotId] = useState<string | null>(null);
  const selectPowerMutation = useMutation(
    orpcUtils.room.selectPower.mutationOptions(),
  );
  const deselectPowerMutation = useMutation(
    orpcUtils.room.deselectPower.mutationOptions(),
  );
  const setReadyMutation = useMutation(
    orpcUtils.room.setReady.mutationOptions(),
  );
  const startGameMutation = useMutation(
    orpcUtils.room.startGame.mutationOptions(),
  );
  const fillBotsMutation = useMutation(
    orpcUtils.room.fillBots.mutationOptions(),
  );

  const activePlayers = players.filter((player) => !player.isSpectator);
  const spectators = players.filter((player) => player.isSpectator);
  const claimedPlayers = activePlayers.filter((player) => player.power);
  const undecidedPlayers = activePlayers.filter((player) => !player.power);
  const readyPlayers = activePlayers.filter((player) => player.isReady);
  const allReady =
    activePlayers.length === 7 &&
    activePlayers.every((player) => player.isReady);

  const handleSelectPower = async (power: Power) => {
    await selectPowerMutation.mutateAsync({ roomId, power });
    onUpdate();
  };

  const handleDeselectPower = async () => {
    await deselectPowerMutation.mutateAsync({ roomId });
    onUpdate();
  };

  const handleSetReady = async (ready: boolean) => {
    await setReadyMutation.mutateAsync({ roomId, ready });
    onUpdate();
  };

  const handleStartGame = async () => {
    await startGameMutation.mutateAsync({ roomId });
    onUpdate();
  };

  const handleCopyBotToken = async (botId: string, token: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedBotId(botId);
    window.setTimeout(() => {
      setCopiedBotId((current) => (current === botId ? null : current));
    }, 1600);
  };

  const startSummary = allReady
    ? 'All active seats are ready.'
    : activePlayers.length < 7
      ? `${activePlayers.length}/7 active seats filled.`
      : `${readyPlayers.length}/${activePlayers.length} active players ready.`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.14fr)_20rem]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <LobbySummaryCard
            delay={0}
            label="Seats filled"
            tone="warning"
            value={`${activePlayers.length}/7`}
          />
          <LobbySummaryCard
            delay={50}
            label="Powers claimed"
            tone="info"
            value={`${claimedPlayers.length}/7`}
          />
          <LobbySummaryCard
            delay={100}
            label="Ready to start"
            tone={allReady ? 'success' : 'neutral'}
            value={
              allReady
                ? 'Yes'
                : `${readyPlayers.length}/${activePlayers.length || 0}`
            }
          />
        </div>

        <ParchmentPanel className="stagger-panel px-5 py-5 sm:px-6" style={{ '--stagger-index': 1 } as CSSProperties}>
          <div className="space-y-5">
            <div className="space-y-2">
              <SectionKicker>Power Assignment</SectionKicker>
              <h2 className="font-display text-3xl text-foreground">
                Choose a power.
              </h2>
              <p className="max-w-[44rem] text-sm leading-7 text-muted-foreground sm:text-base">
                Each tile represents one playable power. Claimed powers show
                whether the seat is ready, reserved by the creator, or filled by
                a bot.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {POWERS.map((power) => {
                const owner = activePlayers.find(
                  (player) => player.power === power,
                );
                const isMine = myPlayer?.power === power;
                const isTaken = !!owner && !isMine;
                const isSpectator = myPlayer?.isSpectator;
                const meta = powerMeta[power];

                return (
                  <button
                    key={power}
                    className={`rounded-[1.45rem] border px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] transition duration-200 ease-out ${
                      meta.palette
                    } ${
                      isMine
                        ? 'ring-2 ring-[color:var(--accent-brass)] ring-offset-2 ring-offset-[color:var(--paper)]'
                        : 'hover:-translate-y-0.5 hover:shadow-lg'
                    } ${isTaken || isSpectator ? 'opacity-70' : ''}`}
                    disabled={
                      isTaken || isSpectator || selectPowerMutation.isPending
                    }
                    onClick={() =>
                      isMine
                        ? void handleDeselectPower()
                        : void handleSelectPower(power)
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <PowerName
                          className="font-display text-2xl"
                          flagClassName="h-5 w-7"
                          power={power}
                        />
                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] opacity-75">
                          {meta.theater}
                        </div>
                      </div>
                      {owner ? (
                        <StatusSeal
                          tone={owner.isReady ? 'success' : 'warning'}
                        >
                          {owner.isReady ? 'Ready' : 'Taken'}
                        </StatusSeal>
                      ) : (
                        <StatusSeal tone="neutral">Open</StatusSeal>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {isMine ? (
                        <StatusSeal tone="dark">Your seat</StatusSeal>
                      ) : null}
                      {owner?.role === 'creator' ? (
                        <StatusSeal tone="info">Creator</StatusSeal>
                      ) : null}
                      {owner?.isBot ? (
                        <StatusSeal tone="neutral">Bot</StatusSeal>
                      ) : null}
                    </div>

                    <p className="mt-4 text-sm leading-6 opacity-82">
                      {owner
                        ? isMine
                          ? myPlayer?.isReady
                            ? 'You have this power and are marked ready.'
                            : 'You have this power. Mark ready when you are set.'
                          : owner.isBot
                            ? 'This seat is currently filled by an automated player.'
                            : 'This power is already taken.'
                        : isSpectator
                          ? 'Spectators can view the lobby but cannot choose a power.'
                          : 'Choose this power for the opening phase.'}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SeatInfoCard
                label="Unassigned players"
                value={String(undecidedPlayers.length)}
              />
              <SeatInfoCard
                label="Spectators"
                value={String(spectators.length)}
              />
              <SeatInfoCard
                label="Room creator"
                value={isCreator ? 'You' : 'Another player'}
              />
            </div>
          </div>
        </ParchmentPanel>

        {myPlayer?.isSpectator ? (
          <ParchmentPanel className="px-5 py-5 sm:px-6">
            <div className="space-y-3">
              <SectionKicker>Spectator Status</SectionKicker>
              <h2 className="font-display text-2xl text-foreground">
                You are observing this room.
              </h2>
              <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                Spectators can watch the lobby and the board, but cannot claim a
                power or mark ready. This usually happens when all active seats
                are already occupied.
              </p>
            </div>
          </ParchmentPanel>
        ) : null}

        {createdBots.length > 0 ? (
          <ParchmentPanel className="px-5 py-5 sm:px-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <SectionKicker>Bot Credentials</SectionKicker>
                <h2 className="font-display text-2xl text-foreground">
                  Save these seat tokens now.
                </h2>
                <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                  These bearer tokens are only shown once when the bot seat is
                  created. Each token maps to a single room seat and is what the
                  bot MCP uses to act as that player.
                </p>
              </div>

              <div className="space-y-3">
                {createdBots.map((bot) => (
                  <div
                    className="rounded-[1.25rem] border border-black/10 bg-white/60 px-4 py-4"
                    key={bot.botId}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold text-foreground">
                          {bot.displayName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <PowerName
                            className="font-semibold text-foreground"
                            flagClassName="h-4 w-6"
                            power={bot.power}
                          />
                        </div>
                      </div>
                      <Button
                        className="h-10 rounded-full px-4 text-xs font-bold uppercase tracking-[0.14em]"
                        onClick={() => void handleCopyBotToken(bot.botId, bot.token)}
                        type="button"
                        variant="outline"
                      >
                        {copiedBotId === bot.botId ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedBotId === bot.botId ? 'Copied' : 'Copy token'}
                      </Button>
                    </div>
                    <code className="mt-3 block overflow-x-auto rounded-[1rem] bg-[color:var(--ink-soft)]/6 px-3 py-3 text-xs leading-6 text-foreground">
                      {bot.token}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </ParchmentPanel>
        ) : null}
      </div>

      <div className="space-y-6">
        <ParchmentPanel className="stagger-panel sticky top-5 px-5 py-5 sm:px-6" style={{ '--stagger-index': 2 } as CSSProperties}>
          <div className="space-y-5">
            <div className="space-y-2">
              <SectionKicker>Room Status</SectionKicker>
              <h2 className="font-display text-2xl text-foreground">
                {startSummary}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Share the code{' '}
                <span className="font-semibold">{room.code}</span> with other
                players until every active seat is accounted for.
              </p>
            </div>

            <div className="rounded-[1.25rem] bg-[color:color-mix(in_oklab,var(--paper-strong)_70%,white_30%)] px-4 py-4">
              <div className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[color:var(--accent-navy)]">
                Your current role
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {myPlayer?.isSpectator ? (
                  'Spectator'
                ) : myPlayer?.power ? (
                  <PowerName
                    className="font-display text-2xl"
                    flagClassName="h-5 w-7"
                    power={myPlayer.power as Power}
                  />
                ) : (
                  'Unassigned'
                )}
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {myPlayer?.isSpectator
                  ? 'Observation only. Wait for an available seat or continue following the room.'
                  : myPlayer?.power
                    ? myPlayer.isReady
                      ? 'Your power is selected and marked ready.'
                      : 'Power selected, but not ready yet.'
                    : 'Choose one of the seven powers before marking yourself ready.'}
              </div>
            </div>

            {!myPlayer?.isSpectator ? (
              <div className="space-y-3">
                <Button
                  className="h-12 w-full rounded-full text-sm font-bold uppercase tracking-[0.14em]"
                  disabled={!myPlayer?.power || setReadyMutation.isPending}
                  onClick={() => void handleSetReady(!myPlayer?.isReady)}
                  variant={myPlayer?.isReady ? 'outline' : 'default'}
                >
                  {setReadyMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : myPlayer?.isReady ? (
                    <Check className="size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {myPlayer?.isReady ? 'Mark not ready' : 'Mark ready'}
                </Button>

                {isCreator && activePlayers.length < 7 ? (
                  <Button
                    className="h-12 w-full rounded-full border border-black/10 bg-white/72 text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-white"
                    disabled={fillBotsMutation.isPending}
                    onClick={async () => {
                      const result = await fillBotsMutation.mutateAsync({
                        roomId,
                      });
                      setCreatedBots(result.createdBots);
                      onUpdate();
                    }}
                    variant="outline"
                  >
                    {fillBotsMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Users className="size-4" />
                    )}
                    {fillBotsMutation.isPending
                      ? 'Filling seats...'
                      : 'Fill empty seats with bots'}
                  </Button>
                ) : null}

                {isCreator ? (
                  <Button
                    className="h-12 w-full rounded-full text-sm font-bold uppercase tracking-[0.14em]"
                    disabled={!allReady || startGameMutation.isPending}
                    onClick={() => void handleStartGame()}
                  >
                    {startGameMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    {startGameMutation.isPending
                      ? 'Starting game...'
                      : 'Start game'}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {startGameMutation.isError ? (
              <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200 motion-safe:fill-mode-both">
                {startGameMutation.error.message}
              </p>
            ) : null}

            <div className="rounded-[1.25rem] border border-black/10 bg-white/55 px-4 py-4 text-sm leading-6 text-muted-foreground">
              {isCreator
                ? 'Only the room creator can start the game. The start control unlocks when all seven active seats are filled and every seat is ready.'
                : 'The room creator starts the game once the lobby is full and every active seat is ready.'}
            </div>
          </div>
        </ParchmentPanel>
      </div>
    </div>
  );
}

function LobbyCodeActions({
  code,
  canAccessMessages,
  unreadThreadCount,
  onOpenMessages,
}: Readonly<{
  code: string;
  canAccessMessages: boolean;
  unreadThreadCount: number;
  onOpenMessages: () => void;
}>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <InviteCode code={code} />
      {canAccessMessages ? (
        <Button
          className="h-11 rounded-full border border-black/10 bg-white/70 px-5 text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-white"
          onClick={onOpenMessages}
          type="button"
          variant="outline"
        >
          <MessageSquare className="size-4" />
          {unreadThreadCount > 0 ? `${unreadThreadCount} unread` : 'Messages'}
        </Button>
      ) : null}
      <Button
        className={`h-11 rounded-full border border-black/10 bg-white/70 px-5 text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-white ${copied ? 'motion-safe:animate-[seal-pulse_300ms_ease]' : ''}`}
        onClick={() => void handleCopy()}
        type="button"
        variant="outline"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy code'}
      </Button>
    </div>
  );
}

function LobbySummaryCard({
  label,
  value,
  tone,
  delay = 0,
}: Readonly<{
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'warning' | 'info';
  delay?: number;
}>) {
  return (
    <ParchmentPanel
      className="px-4 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="space-y-3">
        <StatusSeal tone={tone}>{label}</StatusSeal>
        <div className="font-display text-3xl text-foreground">{value}</div>
      </div>
    </ParchmentPanel>
  );
}

function SeatInfoCard({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-[1.25rem] border border-black/10 bg-white/56 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
      <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[color:var(--accent-navy)]">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ActiveRoomView({
  roomId,
  room,
  players,
  myPlayer,
  myUserId,
  onUpdate,
  unreadThreadCount,
  isMessagesOpen,
  onToggleMessages,
  onMessagePlayer,
}: {
  roomId: string;
  room: any;
  players: any[];
  myPlayer: any;
  myUserId: string | null;
  onUpdate: () => void;
  unreadThreadCount: number;
  isMessagesOpen: boolean;
  onToggleMessages: () => void;
  onMessagePlayer: (playerId: string) => void;
}) {
  const { data: gameState } = useSuspenseQuery(
    orpcUtils.game.getGameState.queryOptions({ input: { roomId } }),
  );
  const navigate = useNavigate();

  if (gameState?.pendingPhaseResult) {
    return (
      <GamePhaseResultsScreen
        roomName={room.name}
        roomCode={room.code}
        phaseResultId={gameState.pendingPhaseResult.id}
        payload={gameState.pendingPhaseResult.payload}
        onAcknowledged={onUpdate}
      />
    );
  }

  if (room.status === 'completed') {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-3xl">
          <CompletedView
            room={room}
            players={players}
            unreadThreadCount={unreadThreadCount}
            canAccessMessages={
              !!myPlayer && !myPlayer.isSpectator
            }
            onOpenMessages={onToggleMessages}
          />
        </div>
      </div>
    );
  }

  if (!gameState?.turn) {
    return <p className="p-8">Loading game state...</p>;
  }

  const isCreator = myPlayer?.role === 'creator';
  const isSubmissionPhase = [
    'order_submission',
    'retreat_submission',
    'build_submission',
  ].includes(gameState.turn.phase);
  const hasBots = players.some((p: any) => p.isBot && !p.isSpectator);
  const showFinalizeButton = isCreator && isSubmissionPhase && hasBots;

  const handleInspectBot = isCreator
    ? (playerId: string) => {
        void navigate({
          to: '/rooms/$roomId/bots/$playerId',
          params: { roomId, playerId },
        });
      }
    : undefined;

  return (
    <>
      <GameOrderWorkspace
        roomCode={room.code}
        roomId={roomId}
        roomName={room.name}
        players={players}
        turn={gameState.turn}
        submissionStatus={
          gameState.submissionStatus
            ? {
                submitted: gameState.submissionStatus.submitted as Power[],
                pending: gameState.submissionStatus.pending as Power[],
              }
            : null
        }
        buildCounts={gameState.buildCounts}
        myUserId={myUserId}
        myPower={(myPlayer?.power as Power | null) ?? null}
        isSpectator={!!myPlayer?.isSpectator}
        mySubmission={gameState.mySubmission}
        onSubmitted={onUpdate}
        unreadThreadCount={unreadThreadCount}
        isMessagesOpen={isMessagesOpen}
        onToggleMessages={onToggleMessages}
        onMessagePlayer={onMessagePlayer}
        onInspectBot={handleInspectBot}
      />
      {showFinalizeButton && (
        <FinalizePhaseButton roomId={roomId} onFinalized={onUpdate} />
      )}
    </>
  );
}

function FinalizePhaseButton({
  roomId,
  onFinalized,
}: {
  roomId: string;
  onFinalized: () => void;
}) {
  const finalizeMutation = useMutation(
    orpcUtils.room.finalizePhase.mutationOptions(),
  );

  const handleFinalize = async () => {
    await finalizeMutation.mutateAsync({ roomId });
    onFinalized();
  };

  return (
    <div className="fixed bottom-5 left-5 z-50 hidden md:block">
      <Button
        className="h-11 rounded-full border border-black/10 bg-white/90 px-5 text-sm font-bold uppercase tracking-[0.14em] text-foreground shadow-lg backdrop-blur-sm hover:bg-white"
        disabled={finalizeMutation.isPending}
        onClick={() => void handleFinalize()}
        type="button"
        variant="outline"
      >
        <Gavel className="size-4" />
        {finalizeMutation.isPending ? 'Finalizing...' : 'Finalize phase'}
      </Button>
      {finalizeMutation.isError && (
        <p className="mt-2 max-w-xs rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {finalizeMutation.error.message}
        </p>
      )}
    </div>
  );
}

function CompletedView({
  room,
  players,
  unreadThreadCount,
  canAccessMessages,
  onOpenMessages,
}: {
  room: any;
  players: any[];
  unreadThreadCount: number;
  canAccessMessages: boolean;
  onOpenMessages: () => void;
}) {
  const winner = players.find(
    (player) => player.id === room.winnerPlayerId,
  );

  return (
    <ParchmentPanel className="px-6 py-6">
      <div className="space-y-3">
        <SectionKicker>Completed</SectionKicker>
        <h1 className="font-display text-3xl text-foreground">Room complete</h1>
        {winner ? (
          <p className="text-lg text-muted-foreground">
            Winner:{' '}
            {winner.power ? (
              <PowerName
                className="font-semibold text-foreground"
                flagClassName="h-4 w-6"
                power={winner.power as Power}
              />
            ) : null}
          </p>
        ) : (
          <p className="text-lg text-muted-foreground">Game ended</p>
        )}
        <div className="pt-2">
          <StatusSeal tone="info">
            <Crown className="mr-1 size-3.5" />
            Final result
          </StatusSeal>
        </div>
        {canAccessMessages ? (
          <div className="pt-3">
            <Button
              className="h-11 rounded-full border border-black/10 bg-white/72 px-5 text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-white"
              onClick={onOpenMessages}
              type="button"
              variant="outline"
            >
              <MessageSquare className="size-4" />
              {unreadThreadCount > 0
                ? `${unreadThreadCount} unread`
                : 'Archived messages'}
            </Button>
          </div>
        ) : null}
      </div>
    </ParchmentPanel>
  );
}
