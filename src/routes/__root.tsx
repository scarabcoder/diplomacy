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
import { PostHogProvider } from 'posthog-js/react';
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
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
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
          <PostHogProvider
            apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN!}
            options={{
              api_host: '/ingest',
              ui_host:
                import.meta.env.VITE_PUBLIC_POSTHOG_HOST ||
                'https://us.posthog.com',
              defaults: '2025-05-24',
              capture_exceptions: true,
              debug: import.meta.env.DEV,
            }}
          >
            <div id="app" suppressHydrationWarning>
              {children}
            </div>
          </PostHogProvider>
          <Scripts />
        </body>
      </html>
    </StrictMode>
  );
}
