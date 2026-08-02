// Razpored PBB — service worker
// Faza 1: samo za branje. Predpomni lupino aplikacije, da razpored
// deluje tudi brez signala (npr. v kleti, izolirani sobi).

const CACHE = 'razpored-pbb-v1';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './dashboard.html',
  './zelje.html',
  './manifest.json',
  './data-oktober-2026.json',
  './generator-core.js',
  './dashboard-core.js',
  './dashboard-baseline.json',
  './icon-192.png',
  './icon-512.png',
  './react.production.min.js',
  './react-dom.production.min.js',
  './babel.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first za podatke (da uporabnik dobi svež razpored, ko je na voljo),
// cache-first za vse ostalo (lupina aplikacije naj se naloži takoj)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
