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
// v18: theme.css dobi barvno kodirane značke za izmene (swatch-*, nov --ld
// zelena za letni dopust) + zložljiva pomoč (.infoToggle/.infoPanel) —
// cache-first, zato dvig verzije.
// v19: export-buttons.js dobi nov neobvezen "ical" prop (izvoz osebnega
// razporeda v .ics za "Moj razpored") — cache-first, zato dvig verzije.
// v20: potisna obvestila (Web Push) — nov push-client.js v precache, sam
// sw.js dobi 'push'/'notificationclick' poslušalca. Dvig verzije je tu
// nujen tudi zato, da se nov service worker sploh namesti (brez tega stari
// SW brez push poslušalca ostane aktiven in obvestila ne bi delovala).
// v21: prenova UI/UX — theme.css dobi skupne kartične gradnike (KPI
// kartice, stolpčni graf, toplotna karta, časovna premica, napredkovne
// vrstice, avatar s statusom, modalno okno, koledar na dotik) —
// cache-first, zato dvig verzije.
// v22: prenova Generatorja (nadzorna plošča "Generiraj takoj", zložljivi
// razdelki, značke vlog, vrstice napredka) — theme.css spet spremenjen
// (prikaz pravil kot bloka), zato dvig verzije.
// v23: nov skupni delovni-cas.js (edini vir resnice o urah izmen +
// preverjanje delovnopravnih pravil) — cache-first, zato dvig verzije in
// vpis v precache.
// v24: Generator (Kalup) — delovnopravne kršitve zdaj obarvajo tudi
// posamezne celice v mreži (rdeč/oranžen rob + opomba na hover), ne samo
// povzetek zgoraj — cache-first, zato dvig verzije.
// v25: zavihek "Uporabniki" (admin.html) prenovljen na kartični prikaz
// (isti vzorec kot Imenik) namesto vodoravno-drseče tabele — bolj
// uporabno na mobilnem — cache-first, zato dvig verzije.
// v26: Faza 1 (skladnost) — revizija sprememb pravic (Revizija → Pravice
// in dostopi), delovnopravno opozorilo pri menjavi (obrazec.html zdaj
// nalaga delovni-cas.js) in "Po oddelkih" odprt vsem zaposlenim za vse
// oddelke — cache-first, zato dvig verzije.

// v27: Faza 2 — živa koledarska naročnina (Nastavitve → Koledar), nova
// robna funkcija "koledar" in RazporedAuth.SUPABASE_URL v supabase-client.js
// — cache-first, zato dvig verzije.

// v28: Faza 3 — matična številka v zbirnem izvozu ur za plače (računovodstvo
// in Kadris osebo prepoznata po njej, ne po imenu) + opozorilo na osebe, ki
// je še nimajo — cache-first, zato dvig verzije.

const CACHE = 'razpored-pbb-v28';
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
  './push-client.js',
  './delovni-cas.js',
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

// ---------------------------------------------------------------------
// Potisna obvestila (Web Push). Vsebino pošlje Edge Function
// posiljaj-push kot JSON { naslov, telo, url } — glej
// supabase/functions/posiljaj-push/index.ts in PUSH-SETUP.md.
// ---------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let podatki = {};
  try {
    podatki = event.data ? event.data.json() : {};
  } catch (e) {
    // Če vsebina ni JSON (npr. testni push iz DevTools), jo pokažemo kot golo besedilo.
    podatki = { telo: event.data ? event.data.text() : '' };
  }
  const naslov = podatki.naslov || 'Razpored PBB';
  const moznosti = {
    body: podatki.telo || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    lang: 'sl',
    data: { url: podatki.url || 'index.html' },
    // Brez tega bi bilo na Androidu obvestilo tiho zavrnjeno, ker smo se
    // naročili z userVisibleOnly:true.
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(naslov, moznosti));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cilj = (event.notification.data && event.notification.data.url) || 'index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((seznam) => {
      // Če je aplikacija že odprta, jo samo osvežimo na pravo stran
      // (namesto da odpremo še eno okno/zavihek).
      for (const odjemalec of seznam) {
        if ('focus' in odjemalec) {
          if ('navigate' in odjemalec) odjemalec.navigate(cilj).catch(() => {});
          return odjemalec.focus();
        }
      }
      return self.clients.openWindow(cilj);
    })
  );
});
