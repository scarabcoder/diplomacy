import { createMiddleware } from '@tanstack/react-start';

export const authContextMiddleware = createMiddleware({
  type: 'request',
}).server(async ({ next, request }) => {
  const [{ getRequestHeaders }, { auth }] = await Promise.all([
    import('@tanstack/react-start/server'),
    import('@/domain/auth/auth.ts'),
  ]);
  const ctx = await auth.$context;

  const { runWithEndpointContext } = await import('@better-auth/core/context');

  const context = {
    ...ctx,
    baseURL: request.headers.get('origin') || ctx.baseURL,
  };

  return await runWithEndpointContext(
    {
      context: context as unknown as Parameters<
        typeof runWithEndpointContext
      >[0]['context'],
      headers: getRequestHeaders(),
      request,
    },
    () => {
      return next();
    },
  );
});
