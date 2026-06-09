/**
 * Genera public/sw.js con la config Firebase del proyecto actual (.env.local).
 * Ejecutar antes de cada build/deploy.
 */
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env.local');
const outPath = path.join(rootDir, 'public', 'sw.js');

function readEnv() {
  if (!fs.existsSync(envPath)) {
    console.warn('generate-fcm-sw: .env.local no encontrado, usando placeholders.');
    return {};
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = readEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

const swContent = `/* Auto-generado por scripts/generate-fcm-sw.mjs — no editar a mano */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

const CACHE_NAME = 'dualgi-3d-cache-v9';
const STATIC_ASSETS = [
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  '/favicon.svg',
];

firebase.initializeApp(${JSON.stringify(firebaseConfig, null, 2)});
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
`;

fs.writeFileSync(outPath, swContent, 'utf8');
console.log(`generate-fcm-sw: sw.js generado para proyecto ${firebaseConfig.projectId || '(sin projectId)'}`);
