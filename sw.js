// Razpored PBB — service worker
// Faza 4: dodana prijava/vloge — HTML strani zdaj network-first (da nova
// objava vedno pride skozi), knjižnice ostajajo cache-first (nespremenljive
// med objavami). Prazna delovanje brez signala ostaja kot rezerva iz cacha.
// v3: nov logo/barve bolnišnice — dvignjena verzija, da se slikovne datoteke
// (ikone, logo-pbb.png), ki so cache-first, ponovno prenesejo.
// v4: dodana stran imenik.html (kontakti/imenik zaposlenih).
// v5: dodana stran nastavitve.html (ikona ⚙️ poleg odjave).
// v6: dodan uvoz Excel/Google Sheets/PDF (xlsx.core.min.js, import-utils.js) —
// pdf.min.mjs/pdf.worker.min.mjs se NISTA dodala v precache, ker se naložita
// šele ob prvi uporabi uvoza PDF (dynamic import), splošni fetch-handler spodaj
// pa ju po prvem nalaganju vseeno predpomni (cache-first veja za ne-HTML/JSON).
// v7: import-utils.js razširjen (glava-po-imenu mapiranje stolpcev, datumi iz
// Excela) — dvignjena verzija, da se cache-first predpomnjena stara različica
// datoteke povsod zamenja s to novo.
// v8: popravek pravega hrošča — "Datum rojstva" kot besedilo DD.MM.LLLL (ne
// prava Excel datumska celica) se je pošiljalo v Postgres "date" stolpec
// nepretvorjeno, kar je za dneve >12 vrglo napako, za ostale pa tiho
// zamenjalo dan/mesec (import-utils.js normalizirajDatum()).
// v9: dodana stran reset-geslo.html (pozabljeno geslo) + korak "nastavi
// geslo" takoj po registraciji v login.html.
// v10: nov skupni theme.css (vizualna prenova) — dodan v precache, da je
// oblikovanje na voljo tudi brez signala; dvignjena verzija, da se povsod
// takoj prenese.
// v11: nova stran obrazec.html (evidentiranje prisotnosti/menjava službe) +
// posodobljen nav.js (dodana ikona "Obrazec"). nav.js se je do zdaj serviral
// cache-first (ni HTML/JSON), zato brez dviga verzije nova ikona v navigaciji
// ne bi nikoli prišla do uporabnikov z že nameščenim service workerjem.
// v12: spletna/namizna različica — nav.js dobi zgornjo (namizno) navigacijsko
// vrstico namesto spodnje na širokih zaslonih, theme.css dobi širše "wrap.wide"
// prelome. Oba se servirata cache-first (nista .html/.json), zato spet
// potreben dvig verzije, da sprememba doseže brskalnike z že nameščenim SW.
// v13: Excel/Google Sheets izvoz na vseh straneh z razpredelnicami — 3 nove
// skupne datoteke (export-utils.js, gsheets-client.js, export-buttons.js),
// vse cache-first, zato v precache in nova verzija.
// v14: menjave.html (swap_requests, dvostopenjski vodja→admin) ukinjena —
// združena v obrazec.html ("Menjava", nav.js dobi en sam vnos namesto dveh).
// menjave.html odstranjena iz precache (dvig verzije, da cache.addAll ne
// poskuša naložiti ukinjene datoteke in podre namestitve service workerja).
// v15: nav.js gumb "Pravičnost" preimenovan v "Statistika" — cache-first,
// zato dvig verzije.
// v16: export-buttons.js dobi "compact" ikonski način izvoza (mobilna
// prilagoditev index.html) — cache-first, zato dvig verzije. manifest.json
// se ob tem tudi na novo prenese (orientation: "any" namesto zaklenjeno na
// pokončno, da telefon lahko obrne zaslon).
// v17: import-utils.js popravek normalizirajDatum (datumi s presledki po
// pikah, "1. 9. 2026") — cache-first, zato dvig verzije.

const CACHE = 'razpored-pbb-v17';
const ASSETS = [
  './',
  './index.html',
  './theme.css',
  './login.html',
  './reset-geslo.html',
  './obrazec.html',
  './admin.html',
  './dashboard.html',
  './zelje.html',
  './imenik.html',
  './nastavitve.html',
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
  './nav.js',
  './xlsx.core.min.js',
  './import-utils.js',
  './export-utils.js',
  './gsheets-client.js',
  './export-buttons.js'
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
