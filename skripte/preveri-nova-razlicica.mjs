#!/usr/bin/env node
/* Preizkus: nova različica aplikacije pride do uporabnika brez ročnega
 * dvojnega osveževanja.
 *
 * Zakaj obstaja: uporabnik je večkrat poročal "stanje je isto" tudi po
 * tem, ko je bila sprememba že objavljena. Service worker sicer kliče
 * skipWaiting() + clients.claim(), a stran, ki je TA HIP odprta, je svoje
 * .js datoteke naložila prej — iz starega predpomnilnika. Videti je bilo
 * treba osvežiti DVAKRAT, česar ni razumno pričakovati.
 *
 * Preverjamo torej celotno pot:
 *   1. vse skripte, ki jih strani nalagajo, so tudi v predpomnilniku
 *      (sicer nova datoteka sploh ne pride zraven);
 *   2. service worker prevzame takoj (skipWaiting + clients.claim);
 *   3. stran ob prevzemu sama osveži — a NE, če je uporabnik že tipkal,
 *      ker bi to pomenilo izgubljen vnos v Menjavi;
 *   4. osveži samo enkrat (brez zanke) in ne ob prvem obisku.
 *
 * Zagon: node skripte/preveri-nova-razlicica.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

console.log("1) vse naložene skripte so tudi v predpomnilniku");
{
  const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
  const nalozene = new Set();
  strani.forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    (src.match(/src="([a-z0-9-]+\.js)"/g) || []).forEach(m => {
      nalozene.add(m.replace(/src="|"/g, ""));
    });
  });
  const sw = readFileSync(join(koren, "sw.js"), "utf8");
  const vCache = new Set((sw.match(/'\.\/[a-z0-9-]+\.js'/g) || []).map(m => m.replace(/'|\.\//g, "")));

  const manjkajo = [...nalozene].filter(f => !vCache.has(f)).sort();
  trdi(manjkajo.length === 0, `vseh ${nalozene.size} skript je v ASSETS`
    + (manjkajo.length ? ` — manjkajo: ${manjkajo.join(", ")}` : ""));
}

console.log("2) service worker prevzame takoj, ne šele ob zaprtju vseh zavihkov");
{
  const sw = readFileSync(join(koren, "sw.js"), "utf8");
  trdi(/self\.skipWaiting\(\)/.test(sw), "install kliče skipWaiting()");
  trdi(/self\.clients\.claim\(\)/.test(sw), "activate kliče clients.claim()");
  // Brez tega bi brskalnik sam stregel sw.js iz HTTP predpomnilnika in
  // nova različica bi prišla šele čez ure.
  const index = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/updateViaCache:\s*"none"/.test(index), "registracija uporablja updateViaCache:\"none\"");
  // Nova različica mora dvigniti tudi ime predpomnilnika, sicer se stare
  // .js datoteke strežejo naprej.
  trdi(/razpored-pbb-v\d+/.test(sw), "ime predpomnilnika vsebuje različico");
}

console.log("3) stran ob prevzemu sama osveži (brez ročnega dvojnega F5)");
{
  const { osvezitve, trak } = poglej({ imelDelavca: true, tipkal: false });
  eq(osvezitve, 1, "osveži se natanko enkrat");
  eq(trak, null, "brez odvečnega obvestila");
}

console.log("4) če je uporabnik že tipkal, se NE osveži sam");
{
  // V Menjavi bi samodejni skok pomenil izgubljen vnos, zato takrat
  // odloči uporabnik.
  const { osvezitve, trak } = poglej({ imelDelavca: true, tipkal: true });
  eq(osvezitve, 0, "brez samodejne osvežitve");
  trdi(!!trak, "namesto tega se prikaže vrstica z gumbom");
}

console.log("5) ob PRVEM obisku ni odvečne osvežitve");
{
  // Takrat se delavec šele namesti; stran je že naložila najnovejše
  // datoteke z omrežja in osveževanje ne bi ničesar spremenilo.
  const { osvezitve } = poglej({ imelDelavca: false, tipkal: false });
  eq(osvezitve, 0, "brez osvežitve");
}

console.log("6) nikoli več kot enkrat (brez zanke)");
{
  const { osvezitve } = poglej({ imelDelavca: true, tipkal: false, sprozi: 3 });
  eq(osvezitve, 1, "trije dogodki dajo eno samo osvežitev");
}

console.log("7) brez service workerja se ne zruši");
{
  const sb = pesek({ brezSW: true });
  vm.runInContext(readFileSync(join(koren, "nav.js"), "utf8"), sb);
  trdi(true, "nav.js se naloži tudi brez podpore za service worker");
}

// ---------------------------------------------------------------------
function pesek(opts) {
  const o = opts || {};
  const stanje = { osvezitve: 0, trak: null, poslusalci: {} };
  const sb = {
    console,
    React: { createElement() {} },
    location: { reload() { stanje.osvezitve++; } },
    document: {
      readyState: "complete",
      addEventListener(t, f) { (stanje.poslusalci[t] = stanje.poslusalci[t] || []).push(f); },
      querySelector() { return stanje.trak; },
      createElement() {
        return { className: "", textContent: "", onclick: null, appendChild() {} };
      },
      body: { appendChild(el) { stanje.trak = el; } },
    },
    navigator: o.brezSW ? {} : {
      serviceWorker: {
        controller: o.imelDelavca ? {} : null,
        addEventListener(t, f) { (stanje.poslusalci["sw:" + t] = stanje.poslusalci["sw:" + t] || []).push(f); },
      },
    },
  };
  sb.window = sb;
  sb._stanje = stanje;
  vm.createContext(sb);
  return sb;
}

function poglej(opts) {
  const sb = pesek(opts);
  vm.runInContext(readFileSync(join(koren, "nav.js"), "utf8"), sb);
  const stanje = sb._stanje;
  if (opts.tipkal) {
    (stanje.poslusalci["input"] || []).forEach(f => f({ target: { tagName: "INPUT" } }));
  }
  const kolikokrat = opts.sprozi || 1;
  for (let i = 0; i < kolikokrat; i++) {
    (stanje.poslusalci["sw:controllerchange"] || []).forEach(f => f());
  }
  return { osvezitve: stanje.osvezitve, trak: stanje.trak };
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
