import {
  type QueryClient,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from '@tanstack/react-router';
import { type ReactNode, StrictMode, useEffect } from 'react';
import { orpcUtils } from '@/rpc/react.ts';
// @ts-ignore
import appCss from '../styles/app.css?url';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, interactive-widget=resizes-content',
      },
      { title: 'Diplomacy' },
    ],
    links: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useSuspenseQuery(orpcUtils.auth.getUserSession.queryOptions());

  useEffect(() => {
    const eventListener = (event: StorageEvent) => {
      if (event.key === 'sessionChange') {
        try {
          void router.invalidate();
          void queryClient.resetQueries();
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', eventListener);
    return () => window.removeEventListener('storage', eventListener);
  }, [queryClient, router]);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <StrictMode>
      <html>
        <head>
          <HeadContent />
        </head>
        <body suppressHydrationWarning>
          <div id="app" suppressHydrationWarning>
            {children}
          </div>
          <Scripts />
        </body>
      </html>
    </StrictMode>
  );
}
