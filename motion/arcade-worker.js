const cachePrefix = 'pixel-arcade-shell-';
const version = cachePrefix + 'v1';
const offline = new URL('arcade-offline.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.add(offline)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(cachePrefix) && key !== version)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Keep account requests, game assets and embedded game navigations on their existing network paths.
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' ||
      url.origin !== self.location.origin || url.pathname !== new URL(self.registration.scope).pathname) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(offline)) || Response.error()));
});
