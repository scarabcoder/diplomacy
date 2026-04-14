import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/domain/auth/auth.ts';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: ({ request }) => {
        return auth.handler(request);
      },
    },
  },
});
