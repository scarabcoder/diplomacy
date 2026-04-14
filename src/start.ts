import { createStart } from '@tanstack/react-start';
import { authContextMiddleware } from '@/domain/auth/auth-context-middleware.ts';

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authContextMiddleware],
  };
});
