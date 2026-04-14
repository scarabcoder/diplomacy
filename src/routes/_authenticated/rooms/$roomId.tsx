import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { GameOrderWorkspace } from '@/domain/game/components/GameOrderWorkspace.tsx';
import { POWERS, type Power } from '@/domain/game/engine/types.ts';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_authenticated/rooms/$roomId')({
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
      queryKey: orpcUtils.room.getRoom.queryOptions({ input: { roomId } }).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpcUtils.game.getGameState.queryOptions({ input: { roomId } }).queryKey,
    });
  };

  const { room, players } = data;
  const myPlayer = players.find((player) => player.userId === session?.user.id);
  const isCreator = room.createdBy === session?.user.id;

  if (room.status === 'playing') {
    return (
      <GameView
        roomId={roomId}
        room={room}
        myPlayer={myPlayer}
        onUpdate={invalidateRoom}
      />
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">{room.name}</h1>
        </div>
        <span className="font-mono text-lg bg-muted px-3 py-1 rounded tracking-widest">
          {room.code}
        </span>
      </div>

      {room.status === 'lobby' && (
        <LobbyView
          roomId={roomId}
          room={room}
          players={players}
          myPlayer={myPlayer}
          isCreator={isCreator}
          onUpdate={invalidateRoom}
        />
      )}

      {room.status === 'completed' && (
        <CompletedView room={room} players={players} />
      )}
    </div>
  );
}

function LobbyView({
  roomId,
  room,
  players,
  myPlayer,
  isCreator,
  onUpdate,
}: {
  roomId: string;
  room: any;
  players: any[];
  myPlayer: any;
  isCreator: boolean;
  onUpdate: () => void;
}) {
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
  const allReady =
    activePlayers.length === 7 && activePlayers.every((player) => player.isReady);

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

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Share the code <span className="font-mono font-bold">{room.code}</span>{' '}
        with other players to join. Need 7 players to start.
      </p>

      <div>
        <h2 className="text-lg font-semibold mb-3">Choose Your Power</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {POWERS.map((power) => {
            const owner = activePlayers.find((player) => player.power === power);
            const isMine = myPlayer?.power === power;
            const isTaken = !!owner && !isMine;
            const isSpectator = myPlayer?.isSpectator;

            return (
              <Button
                key={power}
                variant={isMine ? 'default' : 'outline'}
                disabled={isTaken || isSpectator || selectPowerMutation.isPending}
                onClick={() =>
                  isMine ? handleDeselectPower() : handleSelectPower(power)
                }
                className="capitalize"
              >
                {power}
                {owner && (
                  <span className="text-xs ml-1">
                    {isMine ? '(you)' : '(taken)'}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-3">
          Players ({activePlayers.length}/7)
        </h2>
        <div className="space-y-2">
          {activePlayers.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-2 rounded border"
            >
              <div className="flex items-center gap-2">
                <span className="capitalize font-medium">
                  {player.power ?? 'Undecided'}
                </span>
                {player.isBot && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">bot</span>
                )}
                {player.userId === room.createdBy && (
                  <span className="text-xs bg-muted px-1 rounded">host</span>
                )}
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  player.isReady
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {player.isReady ? 'Ready' : 'Not ready'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {myPlayer && !myPlayer.isSpectator && (
        <div className="flex gap-3">
          <Button
            variant={myPlayer.isReady ? 'outline' : 'default'}
            onClick={() => handleSetReady(!myPlayer.isReady)}
            disabled={!myPlayer.power || setReadyMutation.isPending}
          >
            {myPlayer.isReady ? 'Unready' : 'Ready Up'}
          </Button>

          {isCreator && activePlayers.length < 7 && (
            <Button
              variant="outline"
              onClick={async () => {
                await fillBotsMutation.mutateAsync({ roomId });
                onUpdate();
              }}
              disabled={fillBotsMutation.isPending}
            >
              {fillBotsMutation.isPending ? 'Adding...' : 'Fill with Bots'}
            </Button>
          )}

          {isCreator && (
            <Button
              onClick={handleStartGame}
              disabled={!allReady || startGameMutation.isPending}
            >
              {startGameMutation.isPending ? 'Starting...' : 'Start Game'}
            </Button>
          )}
        </div>
      )}

      {startGameMutation.isError && (
        <p className="text-sm text-destructive">
          {startGameMutation.error.message}
        </p>
      )}
    </div>
  );
}

function GameView({
  roomId,
  room,
  myPlayer,
  onUpdate,
}: {
  roomId: string;
  room: any;
  myPlayer: any;
  onUpdate: () => void;
}) {
  const { data: gameState } = useSuspenseQuery({
    ...orpcUtils.game.getGameState.queryOptions({ input: { roomId } }),
    refetchInterval: 5000,
  });

  if (!gameState?.turn) {
    return <p className="p-8">Loading game state...</p>;
  }

  return (
    <GameOrderWorkspace
      roomId={roomId}
      roomName={room.name}
      roomCode={room.code}
      turn={gameState.turn}
      submissionStatus={gameState.submissionStatus}
      buildCounts={gameState.buildCounts}
      myPower={(myPlayer?.power as Power | null) ?? null}
      isSpectator={!!myPlayer?.isSpectator}
      mySubmission={gameState.mySubmission}
      onSubmitted={onUpdate}
    />
  );
}

function CompletedView({ room, players }: { room: any; players: any[] }) {
  const winner = players.find((player) => player.userId === room.winnerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game Over</CardTitle>
      </CardHeader>
      <CardContent>
        {winner ? (
          <p className="text-lg">
            Winner: <span className="font-bold capitalize">{winner.power}</span>
          </p>
        ) : (
          <p className="text-lg text-muted-foreground">Game ended</p>
        )}
      </CardContent>
    </Card>
  );
}
