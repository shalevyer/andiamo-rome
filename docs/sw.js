const PREFIX = 'andiamo-public-' + new URL(self.registration.scope).pathname;
const CACHE = PREFIX + 'fae3bf21d04b';
const base = self.registration.scope;
const asset = name => new URL(name, base).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', 'app.js?v=fae3bf21d04b', 'app.css?v=fae3bf21d04b', 'rome-warm.jpg', 'favicon.svg', 'google-sans-hebrew.woff2', 'google-sans-latin.woff2'].map(asset))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(base)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(asset('./'), copy)); }
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(asset('./')))));
  } else if (/\.(js|css|woff2?|jpg|svg|png)$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => {});
      return response;
    }));
  }
});
