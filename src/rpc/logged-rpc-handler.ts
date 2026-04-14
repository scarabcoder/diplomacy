import type { RPCHandler } from '@orpc/server/fetch';
import { serializeError } from 'serialize-error';
import { createLogger } from '@/lib/logger.ts';

const rpcLogger = createLogger('orpc');
const BODY_LOG_LIMIT = 4000;

function truncate(value: string): string {
  if (value.length <= BODY_LOG_LIMIT) {
    return value;
  }

  return `${value.slice(0, BODY_LOG_LIMIT)}…`;
}

async function safeReadBody(request: Request): Promise<string | null> {
  try {
    const text = await request.clone().text();
    return text ? truncate(text) : null;
  } catch (error) {
    return `[unavailable: ${String(error)}]`;
  }
}

async function safeReadResponseBody(response: Response): Promise<string | null> {
  try {
    const text = await response.clone().text();
    return text ? truncate(text) : null;
  } catch (error) {
    return `[unavailable: ${String(error)}]`;
  }
}

function requestMeta(request: Request) {
  const url = new URL(request.url);

  return {
    method: request.method,
    pathname: url.pathname,
    search: url.search || '',
    contentType: request.headers.get('content-type'),
  };
}

export async function handleLoggedRPCRequest(
  handler: RPCHandler<any>,
  request: Request,
  source: 'route' | 'server-client',
) {
  const start = performance.now();
  const meta = requestMeta(request);
  const requestBodyPromise =
    request.method === 'GET' || request.method === 'HEAD'
      ? Promise.resolve<string | null>(null)
      : safeReadBody(request);

  try {
    const { response, matched } = await handler.handle(request, {
      prefix: '/api/rpc',
      context: { headers: request.headers, request },
    });

    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    if (!matched) {
      if (process.env.ORPC_DEBUG === 'true') {
        rpcLogger.info(
          {
            source,
            matched,
            durationMs,
            ...meta,
          },
          'oRPC request did not match a procedure',
        );
      }

      return { response, matched };
    }

    if (response.status >= 500) {
      const [requestBody, responseBody] = await Promise.all([
        requestBodyPromise,
        safeReadResponseBody(response),
      ]);

      rpcLogger.error(
        {
          source,
          matched,
          durationMs,
          status: response.status,
          ...meta,
          requestBody,
          responseBody,
        },
        'oRPC request returned a 5xx response',
      );
    } else if (process.env.ORPC_DEBUG === 'true') {
      rpcLogger.info(
        {
          source,
          matched,
          durationMs,
          status: response.status,
          ...meta,
        },
        'oRPC request completed',
      );
    }

    return { response, matched };
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const requestBody = await requestBodyPromise;

    rpcLogger.error(
      {
        source,
        durationMs,
        ...meta,
        requestBody,
        error: serializeError(error),
      },
      'oRPC request threw an unhandled exception',
    );

    throw error;
  }
}
