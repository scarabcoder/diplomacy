import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import NotFound from './not-found';
import { routeTree } from './routeTree.gen';
import { findFunctionPaths } from '@/lib/serialization.ts';

export function getRouter() {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if ('status' in error && error.status !== 500) return false;
          return failureCount < 1;
        },
      },
      dehydrate: {
        shouldDehydrateQuery: (query) => {
          const functionPaths = findFunctionPaths(query.state.data);
          if (functionPaths.length > 0) {
            return false;
          }

          if (query.state.status === 'error') {
            return false;
          }

          return true;
        },
        shouldRedactErrors: () => {
          return true;
        },
      },
      mutations: {
        onError: (error) => {
          console.error(
            'Mutation error:',
            'message' in error ? error.message : error,
          );
        },
      },
    },
  });

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      Wrap: ({ children }) => <>{children}</>,
      defaultNotFoundComponent: NotFound,
    }),
    queryClient,
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
