const CACHE = 'nutri-shell-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nutri-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  const asset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon') || url.pathname === '/manifest.webmanifest';
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && !response.redirected && new URL(response.url).origin === url.origin) {
        const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('/', copy)));
      }
      return response;
    }).catch(() => caches.match('/')));
  } else if (asset) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && !response.redirected) { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(request,copy))); }
      return response;
    })));
  }
});
