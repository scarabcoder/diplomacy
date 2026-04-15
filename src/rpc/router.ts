import { authRouter } from '@/domain/auth/router.ts';
import { botRouter } from '@/domain/bot/router.ts';
import { roomRouter } from '@/domain/room/router.ts';
import { gameRouter } from '@/domain/game/router.ts';
import { messageRouter } from '@/domain/message/router.ts';
import { orderRouter } from '@/domain/order/router.ts';

export const appRouter = {
  auth: authRouter,
  bot: botRouter,
  room: roomRouter,
  game: gameRouter,
  message: messageRouter,
  order: orderRouter,
};

export type AppRouter = typeof appRouter;
