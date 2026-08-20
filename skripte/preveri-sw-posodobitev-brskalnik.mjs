#!/usr/bin/env node
/* Preizkus V PRAVEM BRSKALNIKU: ali nova različica aplikacije res pride
 * do odprte strani – brez ročnega osveževanja.
 *
 * Zakaj poleg preveri-nova-razlicica.mjs: tisti preizkus preverja LOGIKO
 * v nav.js (z lažnim navigator.serviceWorker). Tu pa teče pravi service
 * worker v pravem Chromiumu: namesti se, prevzame nadzor, nato se
 * različica predpomnilnika dvigne – in preverimo, da se stran res sama
 * osveži IN da se po osvežitvi tudi res naloži do konca. Prav ta pot je
 * bila vzrok, da je uporabnik večkrat poročal "stanje je isto" tudi po
 * objavljeni spremembi.
 *
 * Ta preizkus je odkril dva ločena hrošča, ki ju logični preizkus ni
 * mogel videti:
 *   1. stran se je sicer osvežila, a je nato OBTIČALA na beli – zunanja
 *      pisava (fonts.googleapis.com, @import v theme.css) ni odgovorila,
 *      slogovna datoteka pa blokira izvajanje vseh skript za sabo, zato
 *      se nav.js sploh ni izvedel. Popravljeno v sw.js (rok + rezervna
 *      pisava);
 *   2. brez ponovnega obiska (2. korak spodaj) preizkus meri napačno
 *      stvar – ob PRVEM obisku stran namenoma ne osvežuje.
 *
 * Strežemo z lokalnega strežnika (127.0.0.1), ker service worker v
 * brskalniku deluje samo v varnem kontekstu – file:// ne zadošča.
 *
 * Zagon: node skripte/preveri-sw-posodobitev-brskalnik.mjs
 *        (CHROMIUM_PATH=... če Chromium ni na privzeti poti)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// sw.js strežemo IZ POMNILNIKA, da lahko sredi preizkusa "objavimo" novo
// različico, ne da bi se dotaknili datoteke v repozitoriju. Vse ostalo se
// streže iz pravega repozitorija - service worker mora predpomniti
// resnične datoteke, sicer namestitev spodleti in preizkus meri napačno
// stvar (prav to se je zgodilo pri prvem poskusu z delno kopijo).
let swVsebina = readFileSync(join(koren, "sw.js"), "utf8");

// Najmanjša stran, ki naredi natanko to, kar naredi aplikacija: vključi
// theme.css (ta z @import poteguje zunanjo pisavo - prav ta je stran
// zaustavljala), naloži nav.js in registrira service worker. React ni
// potreben - zanima nas samo pot posodobitve.
const STRAN = `<!doctype html>
<html lang="sl"><head><meta charset="utf-8"><title>Preizkus</title>
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      media="print" onload="this.media='all'"></head>
<body>
<script>window.React = { createElement: function () {} };</script>
<script src="nav.js"></script>
<script>
  // Štejemo nalaganja strani, da vidimo samodejno osvežitev.
  var n = Number(sessionStorage.getItem("nalozitve") || "0") + 1;
  sessionStorage.setItem("nalozitve", String(n));
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
</script>
</body></html>`;

const TIPI = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
};
const streznik = createServer((req, res) => {
  const pot = (req.url || "/").split("?")[0];
  const posljI = (vsebina, tip) => {
    // "no-cache" je nujno: sicer bi brskalnik sw.js stregel iz svojega
    // predpomnilnika in posodobitve sploh ne bi opazil.
    res.writeHead(200, { "Content-Type": tip, "Cache-Control": "no-cache" });
    res.end(vsebina);
  };
  if (pot === "/" || pot === "/stran.html") return posljI(STRAN, TIPI[".html"]);
  if (pot === "/sw.js") return posljI(swVsebina, TIPI[".js"]);
  // Brskalnik jo zahteva sam od sebe; brez nje bi bila v konzoli napaka
  // 404, ki z aplikacijo nima nič.
  if (pot === "/favicon.ico") return posljI("", "image/x-icon");
  try {
    const vsebina = readFileSync(join(koren, pot.slice(1)));
    posljI(vsebina, TIPI[extname(pot)] || "application/octet-stream");
  } catch (e) {
    res.writeHead(404); res.end("ni najdeno");
  }
});
await new Promise(r => streznik.listen(0, "127.0.0.1", r));
const naslov = `http://127.0.0.1:${streznik.address().port}/stran.html`;

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const kontekst = await brskalnik.newContext();
const stran = await kontekst.newPage();
const napakeKonzole = [];
stran.on("pageerror", e => napakeKonzole.push(String(e)));
stran.on("console", m => { if (m.type() === "error") napakeKonzole.push(m.text()); });

// V tem okolju ni izhoda na splet, zato zahteva na fonts.googleapis.com
// obvisi - natanko tako, kot obvisi zaposlenemu brez signala. To je
// namenoma DEL preizkusa, ne motnja: prav to je stran zaustavljalo.
const jePisava = u => /fonts\.(googleapis|gstatic)\.com/.test(u);

async function pocakaj(fn, kolikokrat = 60, razmik = 250) {
  for (let i = 0; i < kolikokrat; i++) {
    try { if (await fn()) return true; } catch (e) { /* med osvežitvijo je kontekst za hip nedosegljiv */ }
    await new Promise(r => setTimeout(r, razmik));
  }
  return false;
}

try {
  console.log("1) service worker se namesti in prevzame nadzor nad stranjo");
  await stran.goto(naslov, { waitUntil: "load" });
  await stran.evaluate(() => navigator.serviceWorker.ready);
  // Ob prvem obisku stran še ni pod nadzorom - postane šele po
  // clients.claim() oz. ob naslednjem nalaganju.
  const podNadzorom = await pocakaj(() => stran.evaluate(() => !!navigator.serviceWorker.controller));
  trdi(podNadzorom, "stran je pod nadzorom delavca (clients.claim deluje)");

  const razlicicaPrej = await stran.evaluate(async () => (await caches.keys()).find(k => k.startsWith("razpored-pbb-")));
  trdi(!!razlicicaPrej, `predpomnilnik je ustvarjen (${razlicicaPrej})`);

  console.log("2) vse skupne datoteke so res v predpomnilniku, ne le naštete");
  {
    const vCache = await stran.evaluate(async (ime) => {
      const c = await caches.open(ime);
      return (await c.keys()).map(r => new URL(r.url).pathname);
    }, razlicicaPrej);
    ["/nav.js", "/theme.css"].forEach(f => {
      trdi(vCache.includes(f), `${f} je predpomnjen`);
    });
  }

  console.log("3) vrnitev na stran (kot vsak naslednji obisk zaposlenega)");
  {
    // Šele TA obisk je pravi preizkus: stran je zdaj pod nadzorom delavca
    // že ob zagonu skripte - natanko tako, kot jo dobi zaposleni, ki
    // aplikacijo odpre drugič. Ob prvem obisku se namenoma NE osvežuje
    // (datoteke so bile pravkar naložene z omrežja).
    await stran.reload({ waitUntil: "load" });
    const krmilnik = await stran.evaluate(() => !!navigator.serviceWorker.controller);
    trdi(krmilnik, "stran je ob zagonu skript že pod nadzorom delavca");
    const naloz = await stran.evaluate(() => Number(sessionStorage.getItem("nalozitve")));
    trdi(naloz === 2, `to je drugo nalaganje (nalaganj: ${naloz})`);
  }

  // Čas se meri od trenutka, ko sprožimo posodobitev, do trenutka, ko je
// osvežena stran spet uporabna. Meriti šele po 4. sklopu ne pove nič -
// takrat je čakanje na pisavo že mimo.
  let zacetekOsvezitve = 0;

  console.log("4) nova različica: stran se SAMA osveži (brez ročnega F5)");
  {
    const prejNalozitev = await stran.evaluate(() => Number(sessionStorage.getItem("nalozitve")));
    // Nova objava = dvignjena različica predpomnilnika.
    const nova = swVsebina.replace(/razpored-pbb-v(\d+)/, (m, v) => "razpored-pbb-v" + (Number(v) + 1));
    trdi(nova !== swVsebina, "različica v sw.js je dvignjena (simulacija objave)");
    swVsebina = nova;

    // Sprožimo preverjanje posodobitve, tako kot brskalnik ob obisku.
    zacetekOsvezitve = Date.now();
    await stran.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });

    // Počakamo na samodejno osvežitev: število nalaganj mora narasti.
    await pocakaj(async () =>
      (await stran.evaluate(() => Number(sessionStorage.getItem("nalozitve")))) > prejNalozitev,
      150, 100);
    const poNalozitvi = await stran.evaluate(() => Number(sessionStorage.getItem("nalozitve")));
    trdi(poNalozitvi > prejNalozitev,
      `stran se je sama osvežila (nalaganj: ${prejNalozitev} -> ${poNalozitvi})`);
    trdi(poNalozitvi === prejNalozitev + 1,
      "in to natanko enkrat - brez zanke osveževanja");
  }

  console.log("5) po samodejni osvežitvi se stran res naloži do konca");
  {
    // TU se je skrival pravi hrošč: stran se JE osvežila, a je nato
    // obtičala na beli, ker zunanja pisava ni odgovorila. Za uporabnika
    // je bilo to videti enako kot "nič se ni spremenilo" - le da tokrat
    // ni bilo niti vsebine.
    // Meriti je treba tudi ČAS. Brez roka v sw.js se stran ne zaustavi
    // nujno za vedno - odvisno od omrežja lahko obvisi 13 sekund ali pa
    // za vedno. Oboje je za zaposlenega, ki na telefonu odpira razpored,
    // enako neuporabno, zato je meja del preizkusa.
    // Izmerjeno: s popravkom ~4,5 s (od tega 3 s rok za pisavo), brez
    // popravka 13 s ali več. Meja 9 s loči oboje z veliko rezerve na
    // obeh straneh, zato preizkus ni občutljiv na hitrost stroja.
    const ZGORNJA_MEJA_MS = 9000;
    const naloziloSe = await pocakaj(
      () => stran.evaluate(() => document.readyState === "complete"), 80, 100);
    const trajalo = Date.now() - zacetekOsvezitve;
    trdi(naloziloSe, "nalaganje se je zaključilo (ni obtičalo na beli strani)");
    trdi(trajalo < ZGORNJA_MEJA_MS,
      `in to v razumnem času od objave (${trajalo} ms, meja ${ZGORNJA_MEJA_MS} ms)`);
    const navNalozen = await stran.evaluate(() => typeof window.RazporedNav === "function");
    trdi(navNalozen, "nav.js se je izvedel (navigacija je na voljo)");
  }

  console.log("6) zunanja pisava ne zaustavi strani, tudi če omrežja ni");
  {
    // sw.js po kratkem roku vrne prazen, a veljaven CSS, da se
    // razčlenjevalnik strani sprosti; videz pade na rezervno pisavo
    // (theme.css: ui-serif, Georgia, serif).
    // Preizkusiti je treba PRAVO slogovno datoteko (<link>), ne golega
    // fetch(): rezervo dobi samo zahteva z destination "style", gola
    // fetch() zahteva pa ima destination "" in zanjo je pošteno, da
    // spodleti. Prav slogovna datoteka je tista, ki zaustavi stran.
    const slog = await stran.evaluate(() => new Promise((resolve) => {
      const zacetek = Date.now();
      const el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = "https://fonts.googleapis.com/css2?family=Fraunces&display=swap&t=" + Date.now();
      const konec = (izid) => resolve({ izid: izid, ms: Date.now() - zacetek });
      el.onload = () => konec("naloženo");
      el.onerror = () => konec("napaka");
      setTimeout(() => konec("obviselo"), 15000);
      document.head.appendChild(el);
    }));
    trdi(slog.izid === "naloženo",
      `slogovna datoteka se je razrešila (izid: ${slog.izid}) - stran se ne zaustavi`);
    trdi(slog.ms < 8000, `in to v ${slog.ms} ms, ne v nedogled`);

    // Datoteka pisave (ne slog) pošteno spodleti - a HITRO, ne da visi.
    const pisava = await stran.evaluate(async () => {
      const zacetek = Date.now();
      try {
        await fetch("https://fonts.gstatic.com/s/fraunces/v1/test.woff2");
        return { spodletelo: false, ms: Date.now() - zacetek };
      } catch (e) {
        return { spodletelo: true, ms: Date.now() - zacetek };
      }
    });
    trdi(pisava.spodletelo, "datoteka pisave pošteno spodleti (ne vrne pokvarjene pisave)");
    trdi(pisava.ms < 8000, `in to v ${pisava.ms} ms, ne v nedogled`);
  }

  console.log("7) zunanja pisava nikjer ne zadržuje izrisa strani");
  {
    // Strukturno jamstvo, ki velja tudi ob PRVEM obisku, ko service
    // workerja še ni: prijavno stran novi zaposleni odpre brez njega, in
    // če bi pisava blokirala, se sploh ne bi mogel prijaviti.
    const css = readFileSync(join(koren, "theme.css"), "utf8");
    trdi(!/@import\s+url\(\s*['"]?https?:/.test(css),
      "theme.css nima @import na zunanji naslov (ta zadržuje vse skripte za sabo)");

    const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
    const blokirne = strani.filter(f => {
      const src = readFileSync(join(koren, f), "utf8");
      const vrstice = src.split(/<link\b/).slice(1)
        .filter(v => /fonts\.googleapis\.com/.test(v.split(">")[0]));
      if (!vrstice.length) return false;
      return !vrstice.every(v => /media\s*=\s*["']print["']/.test(v.split(">")[0]));
    });
    trdi(blokirne.length === 0,
      `nobena stran ne nalaga pisave blokirno (${strani.length} strani)`
      + (blokirne.length ? " - blokirne: " + blokirne.join(", ") : ""));

    // In da prijavna stran pisavo sploh ima (sicer bi bila "neblokirna" po
    // pomoti zato, ker je ni).
    const prijava = readFileSync(join(koren, "login.html"), "utf8");
    trdi(/fonts\.googleapis\.com/.test(prijava), "prijavna stran pisavo vseeno vključi");
  }

  console.log("8) po posodobitvi se stare datoteke ne strežejo več");
  {
    const kljuci = await stran.evaluate(async () => (await caches.keys()).filter(k => k.startsWith("razpored-pbb-")));
    trdi(kljuci.length === 1,
      `ostal je samo nov predpomnilnik (${kljuci.join(", ")}) - stari je pobrisan`);
    trdi(kljuci[0] !== razlicicaPrej, "in to je res NOVA različica");
  }

  console.log("9) brez napak v konzoli");
  {
    // Neuspele zahteve na Google Fonts so pričakovane: v tem okolju ni
    // izhoda na splet. Pomembno je, da stran kljub temu deluje - to
    // preveri 5. in 6. sklop.
    const prave = napakeKonzole.filter(n => !jePisava(n) && !/Failed to load resource/.test(n));
    trdi(prave.length === 0,
      "med celotno potjo ni napak" + (prave.length ? ": " + prave.slice(0, 3).join(" | ") : ""));
  }
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
