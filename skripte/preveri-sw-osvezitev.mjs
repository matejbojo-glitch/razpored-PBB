#!/usr/bin/env node
/* Preizkus service workerja (sw.js): ali dvig različice predpomnilnika
 * DEJANSKO prinese nove datoteke do uporabnika.
 *
 * Ozadje - resnična okvara: po objavi nove funkcije v parafa.js je uvoz
 * razporeda padel z "window.Parafa.lastniki is not a function", čeprav je
 * bila različica predpomnilnika dvignjena. Vzrok: cache.addAll jemlje
 * datoteke iz HTTP predpomnilnika BRSKALNIKA, zato je v NOV predpomnilnik
 * shranil STARO vsebino parafa.js. index.html se streže network-first
 * (torej svež), skupne .js datoteke pa cache-first (torej stare) - in
 * sveža stran je klicala funkcijo, ki je v stari datoteki ni bilo.
 *
 * Brez {cache:"reload"} bi se to ponovilo ob VSAKI spremembi skupne
 * datoteke, zato je tu preizkus, ne le popravek.
 *
 * Zagon: node skripte/preveri-sw-osvezitev.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(koren, "sw.js"), "utf8");
const index = readFileSync(join(koren, "index.html"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

console.log("1) namestitev obide HTTP predpomnilnik brskalnika");
{
  trdi(/new Request\(u, \{ cache: 'reload' \}\)/.test(sw),
    'addAll uporablja {cache:"reload"} (brez tega dvig različice ne pomeni nič)');
  trdi(!/cache\.addAll\(ASSETS\)\s*\)/.test(sw),
    "ni več golega cache.addAll(ASSETS)");
}

console.log("2) nova različica prevzame takoj, stare se pobrišejo");
{
  trdi(/self\.skipWaiting\(\)/.test(sw), "skipWaiting - ne čaka na zaprtje vseh zavihkov");
  trdi(/self\.clients\.claim\(\)/.test(sw), "clients.claim - prevzame že odprte zavihke");
  trdi(/keys\.filter\(\(k\) => k !== CACHE\)\.map\(\(k\) => caches\.delete\(k\)\)/.test(sw),
    "stari predpomnilniki se pobrišejo");
}

console.log("3) sam sw.js se ne sme streči iz HTTP predpomnilnika");
{
  trdi(/register\("sw\.js", \{ updateViaCache: "none" \}\)/.test(index),
    'registracija uporablja updateViaCache:"none"');
}

console.log("4) vsaka skupna .js datoteka, ki jo strani nalagajo, je v ASSETS");
{
  // Če datoteka NI v ASSETS, je cache-first pravilo (privzeta veja fetch)
  // vseeno postreže iz predpomnilnika, ko enkrat pride vanj - zato mora
  // biti na seznamu, da jo dvig različice osveži.
  const strani = ["index.html", "imenik.html", "admin.html", "zelje.html",
                  "obrazec.html", "dashboard.html", "nastavitve.html"];
  const potrebne = new Set();
  strani.forEach(f => {
    const h = readFileSync(join(koren, f), "utf8");
    for (const m of h.matchAll(/<script[^>]+src="\.?\/?([A-Za-z0-9._-]+\.js)"/g)) potrebne.add(m[1]);
  });
  const zac = sw.indexOf("const ASSETS = [");
  const seznam = sw.slice(zac, sw.indexOf("];", zac));
  [...potrebne].sort().forEach(f => {
    trdi(seznam.includes("'./" + f + "'"), `${f} je v ASSETS`);
  });
}

console.log("5) različica predpomnilnika je bila dvignjena");
{
  const m = sw.match(/const CACHE = 'razpored-pbb-v(\d+)';/);
  trdi(!!m, "različica je zapisana v pričakovani obliki");
  trdi(m && Number(m[1]) >= 64, `različica je vsaj v64 (dobil v${m ? m[1] : "?"})`);
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
