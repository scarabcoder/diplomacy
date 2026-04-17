import { client } from '@/rpc/client.ts';

export type WebPushSupport =
  | { supported: true }
  | { supported: false; reason: string };

export function checkWebPushSupport(): WebPushSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Not in a browser context' };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'Service workers are not supported' };
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'Push messaging is not supported' };
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'Notifications are not supported' };
  }
  return { supported: true };
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const support = checkWebPushSupport();
  if (!support.supported) return null;
  const existing = await navigator.serviceWorker.getRegistration(
    '/service-worker.js',
  );
  if (existing) return existing;
  return navigator.serviceWorker.register('/service-worker.js', {
    scope: '/',
  });
}

export async function subscribeToWebPush(): Promise<
  | { status: 'subscribed' }
  | { status: 'permission_denied' }
  | { status: 'unsupported'; reason: string }
  | { status: 'misconfigured' }
> {
  const support = checkWebPushSupport();
  if (!support.supported) {
    return { status: 'unsupported', reason: support.reason };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { status: 'permission_denied' };
  }

  const { publicKey } = await client.notification.getVapidPublicKey({});
  if (!publicKey) {
    return { status: 'misconfigured' };
  }

  const registration = await ensureServiceWorker();
  if (!registration) {
    return { status: 'unsupported', reason: 'Service worker failed to register' };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { status: 'misconfigured' };
  }

  await client.notification.subscribeWebPush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent.slice(0, 500),
  });

  return { status: 'subscribed' };
}

export async function unsubscribeFromWebPush(): Promise<{
  status: 'unsubscribed' | 'not_subscribed' | 'unsupported';
}> {
  const support = checkWebPushSupport();
  if (!support.supported) return { status: 'unsupported' };

  const registration = await navigator.serviceWorker.getRegistration(
    '/service-worker.js',
  );
  if (!registration) return { status: 'not_subscribed' };

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { status: 'not_subscribed' };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await client.notification.unsubscribeWebPush({ endpoint });

  return { status: 'unsubscribed' };
}

export async function getCurrentSubscriptionEndpoint(): Promise<string | null> {
  const support = checkWebPushSupport();
  if (!support.supported) return null;
  const registration = await navigator.serviceWorker.getRegistration(
    '/service-worker.js',
  );
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}
