import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useMemo, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  DoorOpen,
  Loader2,
  LogOut,
  Plus,
  ScrollText,
  Sword,
  Users,
} from 'lucide-react';
import {
  CommandPanel,
  InviteCode,
  ParchmentPanel,
  SectionKicker,
  StatusSeal,
  WarRoomStage,
} from '@/components/surfaces/war-room.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { authClient } from '@/domain/auth/client.ts';
import type { Power } from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { orpcUtils } from '@/rpc/react.ts';

type RoomStatus = 'lobby' | 'playing' | 'completed' | 'abandoned';

const roomStatusOrder: Record<RoomStatus, number> = {
  playing: 0,
  lobby: 1,
  completed: 2,
  abandoned: 3,
};

const roomStatusMeta = {
  playing: { label: 'In progress', tone: 'danger' as const },
  lobby: { label: 'Lobby', tone: 'warning' as const },
  completed: { label: 'Completed', tone: 'success' as const },
  abandoned: { label: 'Abandoned', tone: 'neutral' as const },
};

export const Route = createFileRoute('/_authenticated/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.room.listMyRooms.queryOptions({
        input: { limit: 20, offset: 0 },
      }),
    );
  },
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSuspenseQuery(
    orpcUtils.auth.getUserSession.queryOptions(),
  );
  const { data: rooms } = useSuspenseQuery(
    orpcUtils.room.listMyRooms.queryOptions({
      input: { limit: 20, offset: 0 },
    }),
  );

  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const createRoomMutation = useMutation(
    orpcUtils.room.createRoom.mutationOptions(),
  );
  const joinRoomMutation = useMutation(
    orpcUtils.room.joinRoom.mutationOptions(),
  );

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((left, right) => {
        const statusDelta =
          roomStatusOrder[left.status as RoomStatus] -
          roomStatusOrder[right.status as RoomStatus];
        if (statusDelta !== 0) return statusDelta;
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      }),
    [rooms],
  );

  const groupedRooms = useMemo(
    () => ({
      playing: sortedRooms.filter((room) => room.status === 'playing'),
      lobby: sortedRooms.filter((room) => room.status === 'lobby'),
      closed: sortedRooms.filter(
        (room) => room.status === 'completed' || room.status === 'abandoned',
      ),
    }),
    [sortedRooms],
  );
  const roomHeading = session?.user.name
    ? `${session.user.name}'s rooms`
    : 'Your rooms';

  const handleCreateRoom = async () => {
    if (!roomName.trim()) return;
    const room = await createRoomMutation.mutateAsync({
      name: roomName.trim(),
    });
    setRoomName('');
    navigate({ to: '/rooms/$roomId', params: { roomId: room.id } });
  };

  const handleJoinRoom = async () => {
    if (joinCode.length !== 6) return;
    const result = await joinRoomMutation.mutateAsync({
      code: joinCode.toUpperCase(),
    });
    setJoinCode('');
    navigate({ to: '/rooms/$roomId', params: { roomId: result.room.id } });
  };

  const handleLogout = async () => {
    await authClient.signOut();
    queryClient.clear();
    localStorage.setItem('sessionChange', Date.now().toString());
    navigate({ to: '/login', replace: true });
  };

  return (
    <WarRoomStage>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
        <ParchmentPanel className="stagger-panel px-5 py-5 sm:px-6" style={{ '--stagger-index': 0 } as CSSProperties}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <SectionKicker>Rooms</SectionKicker>
              <div className="space-y-2">
                <h1 className="font-display text-4xl text-foreground sm:text-5xl">
                  {roomHeading}
                </h1>
                <p className="max-w-[52rem] text-base leading-7 text-muted-foreground sm:text-lg">
                  Create a room, join by code, or reopen one you already belong
                  to.
                </p>
              </div>
            </div>

            <Button
              className="h-11 self-start rounded-full border border-black/10 bg-white/70 px-5 text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-white sm:self-auto"
              onClick={handleLogout}
              variant="outline"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </ParchmentPanel>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
          <CommandPanel className="stagger-panel overflow-hidden px-5 py-5 sm:px-6 sm:py-6" style={{ '--stagger-index': 1 } as CSSProperties}>
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionKicker className="text-[oklch(0.84_0.04_80)] before:bg-[color:color-mix(in_oklab,var(--accent-brass)_72%,white_28%)]">
                  Create Room
                </SectionKicker>
                <h2 className="font-display text-3xl text-white sm:text-[2.4rem]">
                  Start a new room.
                </h2>
                <p className="max-w-[42rem] text-base leading-7 text-white/72">
                  Create a private room for your group, then assign powers once
                  everyone has joined.
                </p>
              </div>

              <form
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleCreateRoom();
                }}
              >
                <Input
                  className="h-13 rounded-[1.15rem] border-white/12 bg-white/10 px-4 text-base text-white placeholder:text-white/50 focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--accent-brass)_54%,transparent)] focus-visible:ring-offset-0"
                  id="room-name"
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="The Vienna Settlement"
                  value={roomName}
                />
                <Button
                  className="h-13 rounded-full px-5 text-sm font-bold uppercase tracking-[0.14em]"
                  disabled={!roomName.trim() || createRoomMutation.isPending}
                  type="submit"
                >
                  {createRoomMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {createRoomMutation.isPending ? 'Creating...' : 'Create room'}
                </Button>
              </form>

              <div className="grid gap-3 sm:grid-cols-3">
                <CommandStat label="Visibility" value="Private room" />
                <CommandStat label="Entry" value="Join by code" />
                <CommandStat label="Next" value="Choose powers" />
              </div>
            </div>
          </CommandPanel>

          <ParchmentPanel className="stagger-panel px-5 py-5 sm:px-6 sm:py-6" style={{ '--stagger-index': 2 } as CSSProperties}>
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionKicker>Join Room</SectionKicker>
                <h2 className="font-display text-2xl text-foreground">
                  Join an existing room.
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Enter the six-character room code exactly as shared by the
                  host.
                </p>
              </div>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleJoinRoom();
                }}
              >
                <label className="block space-y-2" htmlFor="join-code">
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-[color:var(--accent-navy)]">
                    Room code
                  </span>
                  <Input
                    className="h-14 rounded-[1.25rem] border-[color:color-mix(in_oklab,var(--accent-navy)_18%,var(--border)_82%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,white_18%)] px-4 text-center font-mono text-2xl tracking-[0.36em] text-foreground placeholder:tracking-[0.3em] focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_oklab,var(--accent-brass)_58%,transparent)] focus-visible:ring-offset-0"
                    id="join-code"
                    maxLength={6}
                    onChange={(event) =>
                      setJoinCode(event.target.value.toUpperCase().slice(0, 6))
                    }
                    placeholder="ABC123"
                    value={joinCode}
                  />
                </label>

                <Button
                  className="h-12 w-full rounded-full text-sm font-bold uppercase tracking-[0.14em]"
                  disabled={joinCode.length !== 6 || joinRoomMutation.isPending}
                  type="submit"
                >
                  {joinRoomMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <DoorOpen className="size-4" />
                  )}
                  {joinRoomMutation.isPending ? 'Joining...' : 'Join room'}
                </Button>
              </form>

              {joinRoomMutation.isError ? (
                <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200 motion-safe:fill-mode-both">
                  {joinRoomMutation.error.message}
                </p>
              ) : null}

              <div className="rounded-[1.2rem] bg-[color:color-mix(in_oklab,var(--paper-strong)_70%,white_30%)] px-4 py-4 text-sm leading-6 text-muted-foreground">
                Rooms entered by code open directly to the lobby or current
                board, depending on room state.
              </div>
            </div>
          </ParchmentPanel>
        </div>

        {sortedRooms.length === 0 ? (
          <ParchmentPanel className="stagger-panel px-6 py-8 text-center sm:px-10" style={{ '--stagger-index': 3 } as CSSProperties}>
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_28%,white_72%)] text-[color:var(--accent-oxblood)] motion-safe:animate-[gentle-breathe_3s_ease-in-out_infinite]">
                <ScrollText className="size-7" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-3xl text-foreground">
                  No rooms yet.
                </h2>
                <p className="text-base leading-7 text-muted-foreground">
                  Create a room above or join one by code. Your rooms appear
                  here grouped by status.
                </p>
              </div>
            </div>
          </ParchmentPanel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <RoomListSection
                emptyCopy="No active rooms need attention right now."
                icon={<Sword className="size-4" />}
                rooms={groupedRooms.playing}
                staggerIndex={3}
                title="In progress"
              />
              <RoomListSection
                emptyCopy="No open lobbies at the moment."
                icon={<Users className="size-4" />}
                rooms={groupedRooms.lobby}
                staggerIndex={4}
                title="Open lobbies"
              />
            </div>
            <RoomListSection
              emptyCopy="Completed or abandoned rooms appear here."
              icon={<ScrollText className="size-4" />}
              rooms={groupedRooms.closed}
              staggerIndex={5}
              title="Closed rooms"
            />
          </div>
        )}
      </div>
    </WarRoomStage>
  );
}

function RoomListSection({
  title,
  icon,
  rooms,
  emptyCopy,
  staggerIndex = 0,
}: Readonly<{
  title: string;
  icon: ReactNode;
  rooms: Array<{
    id: string;
    code: string;
    name: string;
    status: RoomStatus;
    updatedAt: Date | string;
    myPlayer: { role: string; isSpectator: boolean; power: Power | null };
  }>;
  emptyCopy: string;
  staggerIndex?: number;
}>) {
  return (
    <ParchmentPanel className="stagger-panel px-5 py-5 sm:px-6" style={{ '--stagger-index': staggerIndex } as CSSProperties}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_28%,white_72%)] text-[color:var(--accent-oxblood)]">
              {icon}
            </span>
            <div>
              <h2 className="font-display text-2xl text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {rooms.length} room{rooms.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-[1.3rem] bg-[color:color-mix(in_oklab,var(--paper-strong)_70%,white_30%)] px-4 py-5 text-sm leading-6 text-muted-foreground">
            {emptyCopy}
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room, index) => (
              <HomeRoomCard key={room.id} room={room} index={index} />
            ))}
          </div>
        )}
      </div>
    </ParchmentPanel>
  );
}

function HomeRoomCard({
  room,
  index = 0,
}: Readonly<{
  room: {
    id: string;
    code: string;
    name: string;
    status: RoomStatus;
    updatedAt: Date | string;
    myPlayer: { role: string; isSpectator: boolean; power: Power | null };
  };
  index?: number;
}>) {
  const meta = roomStatusMeta[room.status];
  const membershipItems: ReactNode[] = [
    room.myPlayer.role === 'creator' ? 'Creator' : null,
    room.myPlayer.isSpectator ? (
      'Spectator'
    ) : room.myPlayer.power ? (
      <PowerName
        className="gap-1.5"
        flagClassName="h-3 w-4.5"
        key="membership-power"
        power={room.myPlayer.power}
      />
    ) : (
      'Seat not chosen'
    ),
  ].filter((item) => item != null) as ReactNode[];

  return (
    <Link
      className="group block rounded-[1.35rem] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:fill-mode-both"
      params={{ roomId: room.id }}
      style={{ animationDelay: `${index * 60}ms` }}
      to="/rooms/$roomId"
    >
      <div className="rounded-[1.35rem] border border-black/10 bg-white/58 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-white/72">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl text-foreground">
                {room.name}
              </h3>
              <StatusSeal tone={meta.tone}>{meta.label}</StatusSeal>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {membershipItems.map((item, index) => (
                <Fragment key={`membership-${index}`}>
                  {index > 0 ? <span aria-hidden="true"> · </span> : null}
                  {item}
                </Fragment>
              ))}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
            <InviteCode code={room.code} className="px-4 py-2 text-[0.7rem]" />
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--accent-navy)]">
              Open room
              <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CommandStat({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-[1.2rem] border border-white/12 bg-white/8 px-4 py-4">
      <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-white/54">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
