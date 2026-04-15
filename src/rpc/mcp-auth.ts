import type { RequestInfo } from '@modelcontextprotocol/sdk/types.js';
import { authenticateBotCredentialToken, touchBotCredential } from '@/domain/bot/auth.ts';
import type { ORPCContext } from '@/rpc/base.ts';

export type ResolveMcpOrpcContextOptions = {
  request?: Request;
  requestInfo?: RequestInfo;
  context?: Partial<ORPCContext> & Record<string, unknown>;
};

function toHeaders(source?: HeadersInit | RequestInfo['headers']): Headers {
  const headers = new Headers();

  if (!source) {
    return headers;
  }

  if (source instanceof Headers) {
    return new Headers(source);
  }

  if (Array.isArray(source)) {
    return new Headers(source);
  }

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
}

function toRequest(requestInfo?: RequestInfo): Request | undefined {
  if (!requestInfo?.url) {
    return undefined;
  }

  return new Request(requestInfo.url.toString(), {
    headers: toHeaders(requestInfo.headers),
  });
}

export function getBearerToken(headers: Headers) {
  const authorization = headers.get('authorization');

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

export async function authenticateBotMcpRequest(request: Request) {
  const token = getBearerToken(request.headers);

  if (!token) {
    return null;
  }

  const session = await authenticateBotCredentialToken(token);

  if (!session) {
    return null;
  }

  await touchBotCredential(session.credentialId);

  return session;
}

export async function resolveMcpOrpcContext(
  options: ResolveMcpOrpcContextOptions = {},
): Promise<ORPCContext & Record<string, unknown>> {
  const request = options.request ?? toRequest(options.requestInfo);
  const context = options.context ?? {};
  const headers = toHeaders(context.headers ?? request?.headers);

  return {
    ...context,
    headers,
    request,
    userSession: null,
    botSession: context.botSession ?? null,
  } as ORPCContext & Record<string, unknown>;
}
