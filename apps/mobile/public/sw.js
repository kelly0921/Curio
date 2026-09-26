const CACHE_VERSION = 'curio-shell-v1';
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function cacheKeyWithoutQuery(url) {
  return new Request(`${url.origin}${url.pathname}`);
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_expo/')
    || url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/pwa/')
    || /\.(?:css|ico|js|png|svg|webp|woff2?)$/iu.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    const safeCacheKey = cacheKeyWithoutQuery(url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(safeCacheKey, copy));
          }
          return response;
        })
        .catch(async () => (
          await caches.match(safeCacheKey)
          || await caches.match('/')
          || await caches.match('/offline.html')
        )),
    );
    return;
  }

  if (!isStaticAsset(url)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
