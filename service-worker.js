self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('pvr-cache').then(cache =>
      cache.addAll([
        '/',
        '/index.html',
        '/style.css',
        '/script.js',
        '/manifest.json',
        '/icon-512x512.png'
      ])
    )
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(resp =>
      resp || fetch(e.request)
    )
  );
});
