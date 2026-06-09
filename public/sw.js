const CACHE_NAME = 'dualgi-3d-cache-v2';
const STATIC_ASSETS = ['/manifest.json', '/pwa-192.png', '/pwa-512.png', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // No interceptar Firebase, Google ni bundles de la app (siempre red)
  if (
    url.pathname.startsWith('/assets/') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML: siempre intentar red primero para no quedar con build viejo
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Íconos/manifest: cache con fallback a red
  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
