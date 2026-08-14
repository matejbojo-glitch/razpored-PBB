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

// v29: Faza 2 — izbira kanalov obveščanja po osebi (Nastavitve → Kam naj
// pridejo obvestila) in dostava po e-pošti — cache-first, zato dvig verzije.

// v30: koledarska naročnina — vklop/izklop sinhronizacije po osebi
// (Nastavitve → Koledar) — cache-first, zato dvig verzije.
// v31: uvodna kartica na Razporedu (namestitev na domači zaslon + vklop
// obvestil) — spremenjena index.html in theme.css, zato dvig verzije.
// v32: ločeni dnevni 12-urni izmeni (DNEVNA12 05:50-18:00 in DNEVNA12F
// 07:00-19:00) — spremenjeni delovni-cas.js, dashboard-core.js,
// index.html in admin.html. Brez dviga bi zaposleni še naprej videli
// stare ure.

// v33: "DEZ" je spet dodeljiv v Imeniku (kot članstvo, ne domači oddelek)
// in Dežurstva javijo, koga od 14 manjka — spremenjena imenik.html in
// admin.html.

// v34: neprosojna lepljiva glava (prekrivanje besedila) in enako široke
// vrstice Imenika — spremenjene imenik/zelje/obrazec/nastavitve/admin.

// v35: enoten zapis imen "Priimek Ime" — spremenjeni login/imenik/admin/
// index (naslovi stolpcev, polje ob registraciji, komentar pri parafi).

// v36: uvoz (📥) in izvoz (⬇) na Razporedu sta se preselila v vrstico
// ikon zgoraj desno (poleg ⚙ in 🚪) — prej sta zasedala vrstico pod
// izbirnikom meseca. Spremenjeni index.html in nav.js (nav.js je
// cache-first, zato je dvig verzije nujen).

// v37: izvoz je na VSEH straneh v vrstici ikon zgoraj desno (register
// izvoznih virov v export-buttons.js), uvoz zna prebrati še .json/.jsonl/
// .gsheet in pri slikah/Wordu pove, zakaj ne gre. Spremenjeni
// export-buttons.js, import-utils.js, nav.js in vse strani —
// prvi trije so cache-first, zato je dvig verzije nujen.

// v38: uvoz dobi svojo ikono 📥 z menijem (isti register kot izvoz) —
// na vsaki strani našteje, kaj je tam mogoče uvoziti. Želje dobijo uvoz
// iz Google Sheets. Spremenjeni export-buttons.js in strani.

// v39: Želje je mogoče uvoziti s fotografije razpredelnice — bere se
// BARVA celice (ne besedilo), mrežo določi uporabnik z dotikom štirih
// vogalov. Spremenjena zelje.html.

// v40: še zadnji izvozi (CSV, JSON osnova, PDF) na Generatorju in
// Statistiki so v meniju ikone ⬇ — v vsebini ni več izvoznih gumbov.
// Spremenjeni export-buttons.js, admin.html, dashboard.html.

// v41: dežurna pravila (najmanj/največ na mesec, prost dan, samo med
// tednom) je mogoče trajno urejati v Imeniku — doslej jih je bilo mogoče
// spremeniti le za eno generiranje. Spremenjena imenik.html.

// v42: enotna postavitev — širine vsebine so ena lestvica v theme.css
// (.wrap / .wrap.wide / .wrap.polna), strani pa ne nosijo več svojih
// kopij skupnih razredov (.card, .sub, .field, h2.section, p.hint,
// .submitBtn). Spremenjeni theme.css in vse strani.

// v43: seznami zaposlenih so strnjeni — vidno je samo ime, klik na vrstico
// razpre osnovne podatke, klik na ime odpre celoten zapis. Vzorec je zdaj
// ena skupna komponenta (oseba-vrstica.js), ne kopija na vsaki strani.
// Spremenjeni imenik.html, admin.html, theme.css; nov oseba-vrstica.js.

// v44: "Po oddelkih" (SMS razpored) po vzoru uradne predloge "2026 SMS
// RAZPORED" — celica zdaj kaže CELO kodo izmene (prej kvečjemu 3 znake, kar
// je KPU brez razločevanja od prazne celice prikazovalo enako kot "–").
// Admin lahko razpored zdaj tudi zapiše NAZAJ v obstoječ Google Sheets
// dokument (samo v ujemajoče se celice - imena/oblika/podpisi ostanejo
// nedotaknjeni). Ob tem popravljena resnična napaka pri uvozu IN pisanju:
// prazna vrstica sredi mesečnega bloka je doslej nepovratno prekinila
// branje vseh dni za njo. Spremenjeni index.html, gsheets-client.js.

// v45: NZV pogled usklajen z uradno predlogo "Letni dopusti in omejitve za
// NZV" — vrstni red stolpcev popravljen (SA DOP/SA POP med DB in URGENCA,
// ne na koncu) in dodani trije novi povzetni stolpci LD/IZOB/BS (kdo je ta
// dan na letnem dopustu/strokovnem izobraževanju/bolniški - iz leave_entries,
// isti vir kot Želje → Razpredelnica). Uvoz teh treh stolpcev piše v
// leave_entries (ne schedule_entries kot ostale enote). "Zapiši nazaj v
// Sheets" zdaj deluje tudi za NZV (prej samo za navadne oddelke). Spremenjen
// index.html.

// v46: "Uvoz razporeda" (Po oddelkih/NZV) dobi enostavnejšo pot - namesto da
// mora admin za VSAK oddelek posebej kopirati pravo #gid= povezavo iz
// Google Sheets, lahko zdaj naloži EN Excel izvoz (lahko cel delovni
// zvezek z več zavihki, npr. "2026 SMS RAZPORED") in aplikacija sama
// prepozna, kateri zavihek je kateri oddelek/mesec, ter uvozi vse naenkrat
// (uvoziDatotekoPametno). Prejšnja pot (lepljenje povezave, en oddelek/
// zavihek naenkrat) ostane na voljo kot "Ali ročno …". Spremenjeni
// index.html, import-utils.js.

// v47: popravek resnične napake v46 - "Naloži datoteko (samodejno)" je pri
// večzavihkovni datoteki (npr. cel "2026 SMS RAZPORED") pisalo VSE zavihke
// v EN SAM Postgres upsert stavek; če je ista oseba za isti dan nastopila v
// dveh zavihkih (npr. FLEXI pokritost + matični oddelek), je Postgres to
// zavrnil z "ON CONFLICT DO UPDATE command cannot affect row a second
// time" in CEL uvoz je spodletel. Zdaj se vsak zavihek zapiše LOČENO
// (zaporedoma), z dodatnim čiščenjem morebitnih podvojenih vrstic ZNOTRAJ
// istega zavihka (zdruziPoKljucu) - poznejši zavihek/vrednost prepiše
// prejšnjo za ta dan, namesto da bi celoten uvoz padel. Spremenjen
// index.html.

// v48: popravljena RESNIČNA napaka "vpisi pristanejo na napačnem dnevu" pri
// uvozu iz naložene .xlsx datoteke (na VSEH oddelkih) - Excel/Google Sheets
// shranita datum kot serijsko število, ki pri izvozu iz Google Sheets
// pogosto NI točno cel dan (drobna plavajoča napaka, npr. 46173.999999988
// namesto 46174 za isti dan); brez zaokroževanja se je to prebralo kot
// prejšnji dan tik pred polnočjo. xlsxCelicaVBesedilo (import-utils.js)
// zdaj zaokroži na najbližji dan - potrjeno s pravim branjem/pisanjem
// xlsx.core.min.js (preveri-xlsx-datum.mjs). Ista napaka bi lahko doslej
// prizadela tudi druge, starejše uvoze iz .xlsx (npr. HR uvoz v Imeniku).
// Dodatno: "Moj razpored" zdaj prikaže tudi LD, vpisan samo v Želje →
// Razpredelnica (leave_entries) - prej se je za osebe, ki nimajo objavljene
// izmene po osebi (NZV/vodje), letni dopust kazal kot navaden prost dan.
// Spremenjena index.html, import-utils.js.

// v49: "Po oddelkih"/NZV dobi ročen gumb "↔️ Širši prikaz (kot ležeče)" -
// dosedanja široka postavitev tabele je bila vezana IZKLJUČNO na
// @media (orientation: landscape), kar se na telefonu s samodejnim
// obračanjem zaslona IZKLOPLJENIM (pogosto v nastavitvah Androida) nikoli
// ne sproži, ne glede na to, kako uporabnik drži telefon. Gumb doseže isto
// postavitev (html.sirsiPogled v <style>) ne glede na dejansko orientacijo
// naprave, izbira se zapomni (localStorage). Spremenjen index.html.

// v50: popravek pravega hrošča v gumbu iz v49 - uporabnikov posnetek
// zaslona (pravi telefon, samodejno obračanje IZKLOPLJENO) je pokazal, da
// prejšnja rešitev (samo table-layout:fixed na nespremenjeni ozki širini)
// tabelo samo STISNE, je ne razširi. "Širši prikaz" zdaj namesto tega
// resnično ZAVRTI celo stran za 90° (CSS transform na <body>, klasičen
// "prisilno ležeče" trik) - telefon dejansko dobi širino svoje višine.
// Gumb preimenovan v "🔄 Obrni na ležeči prikaz"/"📱 Nazaj na pokončni
// prikaz", da opiše dejansko (novo) vedenje. Spremenjen index.html.

// v51: popravek pravega hrošča v51 iz v50 - nov uporabnikov posnetek
// zaslona (tokrat s telefonom, ki JE fizično zavrten v ležečo lego, medtem
// ko je ročni "Širši prikaz" iz v50 ostal vklopljen) je pokazal, da stran
// takrat ostane stisnjena v majhen pas na sredini zaslona, obdana s črnim
// - ročni CSS zasuk (rotate(90deg) na body) in prava ležeča orientacija
// ustvarita konflikt (100vh/100vw se ob fizičnem obratu ne prerešita
// zanesljivo). Popravek: nov JS poslušalec (matchMedia "orientation:
// landscape") ročni zasuk SAM izklopi, takoj ko telefon postane resnično
// ležeč - takrat že obstoječ @media (orientation: landscape) sam poskrbi
// za širok prikaz, ročni trik pa se umakne, še preden pride do konflikta.
// Spremenjen index.html.

const CACHE = 'razpored-pbb-v51';
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
  './export-buttons.js',
  './oseba-vrstica.js'
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
