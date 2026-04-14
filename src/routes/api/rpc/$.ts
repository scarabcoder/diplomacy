import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';
import { appRouter } from '@/rpc/router.ts';
import { handleLoggedRPCRequest } from '@/rpc/logged-rpc-handler.ts';

const handler = new RPCHandler(appRouter);

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
