// Razpored PBB — service worker
// Faza 4: dodana prijava/vloge — HTML strani zdaj network-first (da nova
// objava vedno pride skozi), knjižnice ostajajo cache-first (nespremenljive
// med objavami). Prazna delovanje brez signala ostaja kot rezerva iz cacha.
// v3: nov logo/barve bolnišnice — dvignjena verzija, da se slikovne datoteke
// (ikone, logo-pbb.png), ki so cache-first, ponovno prenesejo.

const CACHE = 'razpored-pbb-v3';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './menjave.html',
  './admin.html',
  './dashboard.html',
  './zelje.html',
  './manifest.json',
  './generator-core.js',
  './dashboard-core.js',
  './dashboard-baseline.json',
  './icon-192.png',
  './icon-512.png',
  './logo-pbb.png',
  './react.production.min.js',
  './react-dom.production.min.js',
  './babel.min.js',
  './supabase-js.min.js',
  './supabase-client.js',
  './nav.js'
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

// network-first za HTML/JSON (da uporabnik vedno dobi svežo objavo in svež
// razpored, brez čakanja na novo različico service workerja), cache-first
// samo za nespremenljive knjižnice — rezerva iz cacha ostane, če ni signala.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isHtmlOrData = event.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.json')
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isHtmlOrData) {
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
