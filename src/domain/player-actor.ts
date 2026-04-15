import { ORPCError } from '@orpc/client';
import { and, eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import { gamePlayerTable } from '@/database/schema/game-schema.ts';
import type { BotSeatSession } from '@/domain/bot/auth.ts';
import type { ORPCContext } from '@/rpc/base.ts';

export type RpcActor =
  | {
      type: 'user';
      userId: string;
    }
  | {
      type: 'bot';
      botId: string;
      playerId: string;
      roomId: string;
    };

export function getRpcActor(
  context: Pick<ORPCContext, 'userSession' | 'botSession'>,
): RpcActor | null {
  if (context.userSession?.user.id) {
    return {
      type: 'user',
      userId: context.userSession.user.id,
    };
  }

  if (context.botSession) {
    return {
      type: 'bot',
      botId: context.botSession.botId,
      playerId: context.botSession.playerId,
      roomId: context.botSession.roomId,
    };
  }

  return null;
}

export function requireRpcActor(
  context: Pick<ORPCContext, 'userSession' | 'botSession'>,
): RpcActor {
  const actor = getRpcActor(context);

  if (!actor) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'You must be logged in to do that!',
    });
  }

  return actor;
}

export async function getRoomMembershipForActor(
  roomId: string,
  actor: RpcActor,
): Promise<typeof gamePlayerTable.$inferSelect | null> {
  if (actor.type === 'user') {
    return (
      (await selectOne(
        database
          .select()
          .from(gamePlayerTable)
          .where(
            and(
              eq(gamePlayerTable.roomId, roomId),
              eq(gamePlayerTable.userId, actor.userId),
            ),
          ),
      )) ?? null
    );
  }

  if (actor.roomId !== roomId) {
    return null;
  }

  return (
    (await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.id, actor.playerId),
            eq(gamePlayerTable.roomId, roomId),
            eq(gamePlayerTable.botId, actor.botId),
          ),
        ),
    )) ?? null
  );
}

export async function requireRoomMembershipForActor(
  roomId: string,
  actor: RpcActor,
  message = 'You are not a member of this room',
) {
  const membership = await getRoomMembershipForActor(roomId, actor);

  if (!membership) {
    throw new ORPCError('FORBIDDEN', { message });
  }

  return membership;
}

export function getActorPlayerId(
  actor: RpcActor,
  membership: typeof gamePlayerTable.$inferSelect,
) {
  if (actor.type === 'bot') {
    return actor.playerId;
  }

  return membership.id;
}

export function getBotSeatSessionActor(botSession: BotSeatSession): RpcActor {
  return {
    type: 'bot',
    botId: botSession.botId,
    playerId: botSession.playerId,
    roomId: botSession.roomId,
  };
}
