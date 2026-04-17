/* Diplomacy service worker — handles Web Push and notification clicks. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Diplomacy', body: event.data.text() };
  }

  const title = payload.title || 'Diplomacy';
  const options = {
    body: payload.body || '',
    tag: payload.tag,
    data: { url: payload.url || '/' },
    badge: '/favicon.svg',
    icon: '/favicon.svg',
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(target, self.location.origin);
          if (clientUrl.origin === targetUrl.origin) {
            await client.focus();
            if ('navigate' in client) {
              try {
                await client.navigate(targetUrl.href);
              } catch {
                // Some browsers disallow cross-origin navigate; focus alone is fine.
              }
            }
            return;
          }
        } catch {
          // Ignore URL parse errors.
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
