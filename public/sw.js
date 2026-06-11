/* Auto-generado por scripts/generate-fcm-sw.mjs — no editar a mano */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

const CACHE_NAME = 'dualgi-3d-cache-v9';
const STATIC_ASSETS = [
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  '/favicon.svg',
];

firebase.initializeApp({
  "apiKey": "AIzaSyDhSZUTwx7-TQ0cxrxsQO4_RYKdMo9ppC8",
  "authDomain": "dualgi3de.firebaseapp.com",
  "projectId": "dualgi3de",
  "storageBucket": "dualgi3de.firebasestorage.app",
  "messagingSenderId": "756959344919",
  "appId": "1:756959344919:web:968cc4b3092191444d9f52"
});
const messaging = firebase.messaging();

function actionTitleForNotification(linkPath, orderId) {
  if (orderId) return 'Ver pedido';
  if (linkPath && linkPath.indexOf('accounts') >= 0) return 'Ver cuentas';
  if (linkPath && linkPath.indexOf('my-account') >= 0) return 'Ver mi cuenta';
  if (linkPath && linkPath.indexOf('my-orders') >= 0) return 'Ver pedidos';
  return 'Abrir';
}

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Nueva notificación';
  const body = payload.notification?.body || payload.data?.body || '';
  const linkPath = payload.data?.linkPath || '/';
  const orderId = payload.data?.orderId || '';
  const tag = payload.data?.notificationId || 'dualgi-notification';

  return self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    data: { linkPath, orderId },
    actions: [{ action: 'open', title: actionTitleForNotification(linkPath, orderId) }],
  });
});

async function cacheStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    STATIC_ASSETS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok && response.status === 200) {
          await cache.put(url, response);
        }
      } catch {
        // ignorar assets que fallen al precachear
      }
    })
  );
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheStaticAssets());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const linkPath = e.notification.data?.linkPath || '/';
  const url = new URL(linkPath, self.location.origin).href;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => {
            if ('navigate' in focused) {
              return focused.navigate(url);
            }
            return focused;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/sounds/') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
  }
});
