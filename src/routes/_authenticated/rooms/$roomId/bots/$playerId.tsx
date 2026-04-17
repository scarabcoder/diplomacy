import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import {
  ParchmentPanel,
  SectionKicker,
  StatusSeal,
  WarRoomStage,
} from '@/components/surfaces/war-room.tsx';
import type { Power } from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute(
  '/_authenticated/rooms/$roomId/bots/$playerId',
)({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.room.getRoom.queryOptions({
        input: { roomId: params.roomId },
      }),
    );
  },
  component: BotInspectionPage,
});

function BotInspectionPage() {
  const { roomId, playerId } = Route.useParams();

  const { data: roomData } = useSuspenseQuery(
    orpcUtils.room.getRoom.queryOptions({ input: { roomId } }),
  );

  const { data: brainState, isLoading: brainLoading } = useQuery(
    orpcUtils.bot.getBotBrainState.queryOptions({
      input: { roomId, playerId },
    }),
  );

  const { data: botMessages, isLoading: messagesLoading } = useQuery(
    orpcUtils.bot.getBotMessages.queryOptions({
      input: { roomId, playerId },
    }),
  );

  const players = (roomData as any).players as Array<{
    id: string;
    displayName: string;
    power: string | null;
    isBot: boolean;
    status: string;
  }>;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const botPlayer = playerMap.get(playerId);
  const botPower = botPlayer?.power as Power | null;

  return (
    <WarRoomStage>
      <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
        {/* Header */}
        <ParchmentPanel className="px-6 py-6">
          <Link
            to="/rooms/$roomId"
            params={{ roomId }}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to game room
          </Link>
          <SectionKicker>Bot Inspection</SectionKicker>
          <h1 className="mt-1 font-display text-3xl text-foreground">
            {botPower ? (
              <PowerName power={botPower} flagClassName="h-6 w-8" />
            ) : (
              (botPlayer?.displayName ?? 'Unknown Bot')
            )}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusSeal tone="info">Bot</StatusSeal>
            {botPlayer?.status === 'active' ? (
              <StatusSeal tone="success">Active</StatusSeal>
            ) : botPlayer?.status ? (
              <StatusSeal tone="warning">{botPlayer.status}</StatusSeal>
            ) : null}
          </div>
        </ParchmentPanel>

        {/* Strategic Plan */}
        <ParchmentPanel className="px-6 py-6">
          <SectionKicker>Strategic Plan</SectionKicker>
          {brainLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
          ) : brainState?.strategicPlan ? (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {brainState.strategicPlan}
              </p>
              {brainState.updatedAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Last updated:{' '}
                  {new Date(brainState.updatedAt).toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No strategic plan recorded yet.
            </p>
          )}
        </ParchmentPanel>

        {/* Relationships */}
        <ParchmentPanel className="px-6 py-6">
          <SectionKicker>Relationships</SectionKicker>
          {brainLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
          ) : brainState?.relationships &&
            Object.keys(brainState.relationships).length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries(brainState.relationships).map(
                ([power, rel]: [string, any]) => (
                  <div
                    key={power}
                    className="rounded-xl border border-black/8 bg-white/50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <PowerName
                        power={power as Power}
                        className="text-sm font-semibold"
                        flagClassName="h-4 w-5"
                      />
                      <StanceSeal stance={rel.stance} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Trust:
                      </span>
                      <TrustIndicator trust={rel.trust} />
                    </div>
                    {rel.notes && rel.notes.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {rel.notes.map((note: string, i: number) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="mt-0.5 shrink-0 text-current/40">
                              &bull;
                            </span>
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No relationship assessments recorded yet.
            </p>
          )}
        </ParchmentPanel>

        {/* Observations */}
        <ParchmentPanel className="px-6 py-6">
          <SectionKicker>Observations</SectionKicker>
          {brainLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
          ) : brainState?.observations && brainState.observations.length > 0 ? (
            <div className="mt-3 space-y-3">
              {brainState.observations.map((obs: any, i: number) => (
                <div
                  key={i}
                  className="rounded-xl border border-black/8 bg-white/50 px-4 py-3"
                >
                  <StatusSeal tone="neutral">
                    Turn {obs.turn} &middot; {obs.phase}
                  </StatusSeal>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">
                    {obs.note}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No observations recorded yet.
            </p>
          )}
        </ParchmentPanel>

        {/* Messages Sent */}
        <ParchmentPanel className="px-6 py-6">
          <SectionKicker>Messages Sent</SectionKicker>
          {messagesLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
          ) : botMessages?.messages && botMessages.messages.length > 0 ? (
            <div className="mt-3 space-y-3">
              {botMessages.messages.map((msg: any) => {
                const recipients = (msg.recipientPlayerIds as string[])
                  .map((id: string) => playerMap.get(id))
                  .filter(Boolean);

                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-black/8 bg-white/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>To:</span>
                      {recipients.length > 0 ? (
                        recipients.map((r: any, i: number) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1"
                          >
                            {i > 0 && <span>,</span>}
                            {r.power ? (
                              <PowerName
                                power={r.power as Power}
                                className="text-xs font-medium text-foreground"
                                flagClassName="h-3 w-4"
                              />
                            ) : (
                              <span className="font-medium text-foreground">
                                {r.displayName}
                              </span>
                            )}
                          </span>
                        ))
                      ) : (
                        <span>Unknown</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                      {msg.body}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No messages sent yet.
            </p>
          )}
        </ParchmentPanel>
      </div>
    </WarRoomStage>
  );
}

function StanceSeal({ stance }: { stance: string }) {
  const toneMap: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> =
    {
      allied: 'success',
      friendly: 'success',
      neutral: 'neutral',
      suspicious: 'warning',
      hostile: 'danger',
    };

  return <StatusSeal tone={toneMap[stance] ?? 'neutral'}>{stance}</StatusSeal>;
}

function TrustIndicator({ trust }: { trust: number }) {
  const tone: 'success' | 'warning' | 'danger' =
    trust > 0.3 ? 'success' : trust < -0.3 ? 'danger' : 'warning';

  const label =
    trust > 0.3 ? 'Trusted' : trust < -0.3 ? 'Distrusted' : 'Uncertain';

  return (
    <StatusSeal tone={tone}>
      {label} ({trust > 0 ? '+' : ''}
      {trust.toFixed(1)})
    </StatusSeal>
  );
}
