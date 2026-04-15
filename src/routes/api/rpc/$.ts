import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';
import { appRouter } from '@/rpc/router.ts';
import { handleLoggedRPCRequest } from '@/rpc/logged-rpc-handler.ts';

const handler = new RPCHandler(appRouter);

// Startup recovery: re-trigger bot activations for any games stuck in submission phases
void import('@/domain/bot/brain/bot-recovery.ts').then(
  ({ recoverPendingBotSubmissions }) => {
    void recoverPendingBotSubmissions();
  },
);

export const Route = createFileRoute('/api/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response, matched } = await handleLoggedRPCRequest(
          handler,
          request,
          'route',
        );

        if (matched) {
          return response;
        }

        return new Response(JSON.stringify({ error: 'No route was found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
