import { ORPCError } from '@orpc/client';
import { os } from '@orpc/server';
import { serializeError } from 'serialize-error';
import { auth } from '@/domain/auth/auth.ts';
import {
  sanitizeUserSession,
  type UserSession,
} from '@/domain/auth/auth-types.ts';
import { createLogger } from '@/lib/logger.ts';

/**
 * Initial context provided to all oRPC procedures.
 */
export type ORPCContext = {
  headers: Headers;
  request?: Request;
  userSession?: UserSession | null;
};

const o = os.$context<ORPCContext>();
const rpcProcedureLogger = createLogger('orpc-procedure');

/**
 * Auth middleware — fetches the user session from cookies.
 * Session is optional (null if not authenticated).
 */
const authMiddleware = o.middleware(async ({ context, next }) => {
  if ('userSession' in context) {
    return next({
      context: { userSession: context.userSession ?? null },
    });
  }

  const rawSession = (await auth.api.getSession({
    headers: context.headers,
  })) as unknown;
  const session = sanitizeUserSession(rawSession);

  return next({
    context: { userSession: session },
  });
});

/**
 * Procedure error logging middleware.
 * Logs the original exception and decoded input before oRPC serializes it.
 */
const errorLoggingMiddleware = o.middleware(async (options, input) => {
  try {
    return await options.next();
  } catch (error) {
    const path = options.path.join('.');
    const request = options.context.request;
    const url = request ? new URL(request.url) : null;

    if (error instanceof ORPCError) {
      if (
        process.env.ORPC_DEBUG === 'true'
        || error.code === 'INTERNAL_SERVER_ERROR'
      ) {
        rpcProcedureLogger.warn(
          {
            path,
            code: error.code,
            message: error.message,
            method: request?.method,
            pathname: url?.pathname,
            search: url?.search || '',
            userId:
              'userSession' in options.context
                ? options.context.userSession?.user.id
                : undefined,
            input,
            error: serializeError(error),
          },
          'oRPC procedure raised an ORPCError',
        );
      }
    } else {
      rpcProcedureLogger.error(
        {
          path,
          method: request?.method,
          pathname: url?.pathname,
          search: url?.search || '',
          userId:
            'userSession' in options.context
              ? options.context.userSession?.user.id
              : undefined,
          input,
          error: serializeError(error),
        },
        'oRPC procedure threw an unhandled exception',
      );
    }

    throw error;
  }
});

/**
 * Require auth middleware — throws UNAUTHORIZED if no session.
 */
const requireAuthMiddleware = o.middleware(async ({ context, next }) => {
  const userSession = (context as any).userSession as UserSession;

  if (!userSession) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'You must be logged in to do that!',
    });
  }

  return next({
    context: {
      userSession: userSession as NonNullable<typeof userSession>,
    },
  });
});

/**
 * Base procedures:
 *
 * - `pub`    — public, session is optional (may be null)
 * - `authed` — requires authentication
 */
export const pub = o.use(authMiddleware).use(errorLoggingMiddleware);
export const authed = pub.use(requireAuthMiddleware);
