import { authRouter } from '@/domain/auth/router.ts';
import { roomRouter } from '@/domain/room/router.ts';
import { gameRouter } from '@/domain/game/router.ts';
import { orderRouter } from '@/domain/order/router.ts';

export const appRouter = {
  auth: authRouter,
  room: roomRouter,
  game: gameRouter,
  order: orderRouter,
};

export type AppRouter = typeof appRouter;
