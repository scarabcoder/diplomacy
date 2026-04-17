import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server';
import type { AppRouter } from '@/rpc/router.ts';

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [first] = value.split(',', 1);
  return first?.trim() || null;
}

const getRpcUrl = createIsomorphicFn()
  .server((): string => {
    const request = getRequest();
    const url = new URL(request.url);
    const forwardedProto =
      firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
      firstHeaderValue(request.headers.get('x-forwarded-protocol'));
    const forwardedHost = firstHeaderValue(
      request.headers.get('x-forwarded-host'),
    );
    const host = forwardedHost ?? firstHeaderValue(request.headers.get('host'));

    if (forwardedProto && host) {
      return `${forwardedProto}://${host}/api/rpc`;
    }

    if (host) {
      return `${url.protocol}//${host}/api/rpc`;
    }

    return new URL('/api/rpc', url).toString();
  })
  .client((): string => {
    return `${window.location.origin}/api/rpc`;
  });

const getRpcHeaders = createIsomorphicFn()
  .server((): Record<string, string> => {
    const cookie = getRequestHeaders()?.get?.('cookie');
    return cookie ? { cookie } : {};
  })
  .client((): Record<string, string> => {
    return {};
  });

const rpcFetch = createIsomorphicFn()
  .server(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { handleServerRpcFetch } = await import(
        '@/rpc/server-rpc-fetch.ts'
      );
      return handleServerRpcFetch(input, init, getRpcHeaders());
    },
  )
  .client(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return globalThis.fetch(input, init);
    },
  );

const link = new RPCLink({
  url: () => getRpcUrl(),
  headers: () => getRpcHeaders(),
  fetch: (request, init) => rpcFetch(request, init),
});

export const client = createORPCClient<RouterClient<AppRouter>>(link);
