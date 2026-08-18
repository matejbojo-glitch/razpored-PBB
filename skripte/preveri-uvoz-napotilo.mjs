#!/usr/bin/env node
/* Preizkus preberiUvozIzNaslova() (index.html) - razčlenjevanja naslova
 * "index.html?uvoz=1&oddelek=…&mesec=…", prek katerega zavihek "Oddelki"
 * (admin.html) napoti na uvoz razporeda.
 *
 * Zakaj je to vredno preizkusa: naslov je ZUNANJI vhod - uporabnik ga
 * lahko poljubno spremeni, shrani med zaznamke ali deli naprej. Vrednosti
 * iz njega gredo naravnost v izbiro oddelka in meseca, ki ju uvoz nato
 * uporabi za pisanje v razpored, zato se ne smeta prevzeti brez preverbe
 * (npr. "?oddelek=DEZ" ali "?mesec=2026-13" ne smeta obveljati). Neveljavna
 * vrednost mora pomeniti "uporabi privzeto", NE napake ali praznega zaslona.
 *
 * Zagon: node skripte/preveri-uvoz-napotilo.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "index.html"), "utf8");

function izvleci(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0, zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciVrstico(oznaka) {
  const re = new RegExp("^" + oznaka.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*$", "m");
  const m = html.match(re);
  if (!m) throw new Error("Vrstice " + oznaka + " ni v index.html.");
  return m[0];
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const koda = [
  izvleciVrstico("const PO_ODDELKIH_KODE"),
  izvleci("preberiUvozIzNaslova"),
].join("\n\n");

const sandbox = { console, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(koda, sandbox);
const { preberiUvozIzNaslova } = sandbox;

console.log("1) brez ?uvoz=1 se uvozno okno NE odpre");
{
  trdi(preberiUvozIzNaslova("") === null, "prazen naslov -> null");
  trdi(preberiUvozIzNaslova("?oddelek=C&mesec=2026-10") === null, "sam oddelek/mesec brez uvoz=1 -> null (navaden ogled razporeda)");
  trdi(preberiUvozIzNaslova("?uvoz=0") === null, "uvoz=0 -> null");
}

console.log("2) veljavno napotilo iz zavihka Oddelki");
{
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C1&mesec=2026-10"), { oddelek: "C1", mesec: "2026-10" }, "oddelek C1 + oktober 2026");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=FLEXI&mesec=2026-09"), { oddelek: "FLEXI", mesec: "2026-09" }, "FLEXI je veljavna skupina");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=NZV&mesec=2026-12"), { oddelek: "NZV", mesec: "2026-12" }, "NZV je veljavna skupina (ni v PO_ODDELKIH_KODE, obravnavan posebej)");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=c&mesec=2026-01"), { oddelek: "C", mesec: "2026-01" }, "male črke se normalizirajo v velike");
}

console.log("3) neveljaven oddelek pomeni 'privzeto', ne napake");
{
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=DEZ&mesec=2026-10"), { oddelek: null, mesec: "2026-10" },
    "'DEZ' ni skupina za uvoz razporeda -> oddelek null (mesec ostane veljaven)");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=<script>&mesec=2026-10"), { oddelek: null, mesec: "2026-10" },
    "neveljavna/zlonamerna vrednost -> null, ne pride do izbire oddelka");
  jseq(preberiUvozIzNaslova("?uvoz=1&mesec=2026-10"), { oddelek: null, mesec: "2026-10" }, "manjkajoč oddelek -> null");
}

console.log("4) neveljaven mesec pomeni 'privzeto' (tekoči mesec), ne napake");
{
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C&mesec=2026-13"), { oddelek: "C", mesec: null }, "mesec 13 ne obstaja -> null");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C&mesec=2026-00"), { oddelek: "C", mesec: null }, "mesec 00 ne obstaja -> null");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C&mesec=oktober"), { oddelek: "C", mesec: null }, "besedilo namesto YYYY-MM -> null");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C&mesec=2026-10-05"), { oddelek: "C", mesec: null }, "cel datum namesto meseca -> null");
  jseq(preberiUvozIzNaslova("?uvoz=1&oddelek=C"), { oddelek: "C", mesec: null }, "manjkajoč mesec -> null");
}

console.log("5) sam ?uvoz=1 (brez parametrov) odpre uvoz s privzetim oddelkom/mesecem");
{
  jseq(preberiUvozIzNaslova("?uvoz=1"), { oddelek: null, mesec: null }, "okno se odpre (ni null), oba parametra privzeta");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
