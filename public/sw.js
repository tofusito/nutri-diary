const CACHE = 'nutri-shell-v7';
const SHELL = ['/', '/manifest.webmanifest', '/noodle-shadow-180.png', '/noodle-shadow-192.png', '/noodle-shadow-512.png'];

// Without skipWaiting a new worker stays parked until every window closes. A
// home screen app is suspended rather than closed, so the old one could keep
// serving a stale build for days. The page reloads itself when this takes over.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('nutri-shell-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  const asset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/noodle') || url.pathname === '/manifest.webmanifest';
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && !response.redirected && new URL(response.url).origin === url.origin) {
        const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('/', copy)));
      }
      return response;
    }).catch(() => caches.match('/')));
  } else if (asset) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && !response.redirected) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy))); }
      return response;
    })));
  }
});
