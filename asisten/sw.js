const CACHE_NAME = 'asisten-fister-v1';
const urlsToCache = [
  './index.html',
  'https://i.ibb.co.com/nqxh13MB/logo-fister.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});