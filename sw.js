// Offline cache: serve cached files instantly, refresh them in the background.
const CACHE = 'suika-angka-v8';
const ASSETS = ['./', 'index.html', 'style.css', 'js/meta.js', 'js/audio.js', 'js/ads-config.js', 'js/native.js', 'js/ads.js', 'fonts/fredoka-latin.woff2', 'privacy.html', 'js/game.js', 'js/intro.js', 'vendor/matter.min.js', 'icon.svg', 'icon-180.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const net = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});
