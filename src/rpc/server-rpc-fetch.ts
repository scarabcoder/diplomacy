import { RPCHandler } from '@orpc/server/fetch';
import { handleLoggedRPCRequest } from '@/rpc/logged-rpc-handler.ts';
import { appRouter } from '@/rpc/router.ts';

let cachedHandler: RPCHandler<any> | null = null;

function getHandler(): RPCHandler<any> {
  if (!cachedHandler) {
    cachedHandler = new RPCHandler(appRouter);
  }
  return cachedHandler;
}

export async function handleServerRpcFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Record<string, string>,
): Promise<Response> {
  const mergedHeaders = new Headers(init?.headers);
  for (const [key, value] of Object.entries(headers)) {
    mergedHeaders.set(key, value);
  }

  const request =
    input instanceof Request
      ? input
      : new Request(input.toString(), { ...init, headers: mergedHeaders });

  const { response, matched } = await handleLoggedRPCRequest(
    getHandler(),
    request,
    'server-client',
  );

  if (matched) {
    return response;
  }

  return new Response(JSON.stringify({ error: 'No route was found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
