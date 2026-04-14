import { useState } from 'react';
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { authClient } from '@/domain/auth/client.ts';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_authenticated/')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.room.listMyRooms.queryOptions({ input: { limit: 20, offset: 0 } }),
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
    orpcUtils.room.listMyRooms.queryOptions({ input: { limit: 20, offset: 0 } }),
  );

  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const createRoomMutation = useMutation(
    orpcUtils.room.createRoom.mutationOptions(),
  );
  const joinRoomMutation = useMutation(
    orpcUtils.room.joinRoom.mutationOptions(),
  );

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
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Diplomacy</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Sign out
        </Button>
      </div>

      <p className="text-muted-foreground mb-8">
        Welcome, {session?.user.name || 'Player'}
      </p>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Create Room</CardTitle>
            <CardDescription>Start a new game</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="My Diplomacy Game"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>
              <Button
                onClick={handleCreateRoom}
                disabled={!roomName.trim() || createRoomMutation.isPending}
              >
                {createRoomMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join Room</CardTitle>
            <CardDescription>Enter a 6-character code</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="join-code">Room Code</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                  }
                  placeholder="ABC123"
                  maxLength={6}
                  className="font-mono tracking-widest text-center text-lg"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={joinCode.length !== 6 || joinRoomMutation.isPending}
              >
                {joinRoomMutation.isPending ? 'Joining...' : 'Join'}
              </Button>
              {joinRoomMutation.isError && (
                <p className="text-sm text-destructive">
                  {joinRoomMutation.error.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {rooms && rooms.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Rooms</h2>
          <div className="flex flex-col gap-3">
            {rooms.map((room) => (
              <Link
                key={room.id}
                to="/rooms/$roomId"
                params={{ roomId: room.id }}
                className="block"
              >
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{room.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Code: {room.code} &middot;{' '}
                        {room.myPlayer.isSpectator
                          ? 'Spectator'
                          : room.myPlayer.power
                            ? room.myPlayer.power.charAt(0).toUpperCase() +
                              room.myPlayer.power.slice(1)
                            : 'No power selected'}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        room.status === 'lobby'
                          ? 'bg-yellow-100 text-yellow-800'
                          : room.status === 'playing'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {room.status}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
