#!/usr/bin/env node
/* Preizkus preberiNapotiloIzNaslova (admin.html) – razčlenjevanje naslova
 * "admin.html?tab=kalup&oddelek=C1&mesec=2026-10", prek katerega stran
 * Želje napoti v Generator z že izbranim oddelkom in mesecem.
 *
 * Zakaj je to vredno preizkusa: naslov je ZUNANJI vhod. Uporabnik ga lahko
 * spremeni, shrani med zaznamke ali deli naprej, mesec pa se v aplikaciji
 * povsod zapisuje kot YYYY-MM. Če bi se vrednostim zaupalo, bi napačna
 * koda oddelka pomenila prazen ali napačen razpored – v bolnišnici torej
 * mesec, generiran za napačno skupino ljudi. Zato: neveljavna vrednost
 * pomeni "uporabi privzeto", nikoli tihega ugibanja.
 *
 * Zagon: node skripte/preveri-generiraj-napotilo.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "admin.html"), "utf8");

function izvleci(ime) {
  const z = html.indexOf("function " + ime + "(");
  if (z === -1) throw new Error("Funkcije " + ime + " ni v admin.html.");
  let g = 0;
  const t = html.indexOf("{", z);
  for (let k = t; k < html.length; k++) {
    if (html[k] === "{") g++;
    else if (html[k] === "}") { g--; if (!g) return html.slice(z, k + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciConst(ime) {
  const z = html.indexOf("const " + ime + " ");
  if (z === -1) throw new Error("const " + ime + " ni v admin.html.");
  return html.slice(z, html.indexOf(";\n", z) + 1).replace(/^const\s+/, "var ");
}
// WARDS_META je večvrstičen objekt – vzemi ga do zaključnega "};".
function izvleciWardsMeta() {
  const z = html.indexOf("const WARDS_META = {");
  if (z === -1) throw new Error("WARDS_META ni v admin.html.");
  const konec = html.indexOf("\n};", z);
  return html.slice(z, konec + 3).replace(/^const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console, URLSearchParams };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext([
  izvleciWardsMeta(),
  izvleciConst("NAPOTILO_ZAVIHKI"),
  izvleci("preberiNapotiloIzNaslova"),
].join("\n"), sandbox);
const beri = sandbox.preberiNapotiloIzNaslova;

console.log("1) navadno napotilo iz Želja");
eq(beri("?tab=kalup&oddelek=C1&mesec=2026-10"),
  { tab: "kalup", oddelek: "C1", pod: null, mesec: "2026-10" },
  "oddelek C1, oktober 2026");
eq(beri("?tab=nzv&pod=dez&mesec=2026-10"),
  { tab: "nzv", oddelek: null, pod: "dez", mesec: "2026-10" },
  "NZV → dežurstva");
eq(beri("?tab=nzv&pod=vodje&mesec=2026-12"),
  { tab: "nzv", oddelek: null, pod: "vodje", mesec: "2026-12" },
  "NZV → vodstvena pokritost");

console.log("2) brez napotila se stran odpre po svoje");
eq(beri(""), null, "prazen naslov ni napotilo");
eq(beri("?nekaj=drugega"), null, "tuji parametri niso napotilo");
eq(beri(null), null, "manjkajoč naslov ne vrže napake");

console.log("3) neveljavne vrednosti pomenijo 'privzeto', ne napake");
eq(beri("?tab=izmisljen&oddelek=C1"),
  { tab: null, oddelek: "C1", pod: null, mesec: null },
  "neznan zavihek se zavrže, oddelek ostane");
// Ključno: FLEXI in NZV NISTA oddelka rotacijskega generatorja (WARDS_META
// jih ne pozna). Če bi se prepustila naprej, bi Kalup zavihek generiral
// prazen ali napačen mesec namesto da ostane pri privzetem oddelku.
eq(beri("?tab=kalup&oddelek=FLEXI").oddelek, null, "FLEXI ni oddelek generatorja rotacije");
eq(beri("?tab=kalup&oddelek=NZV").oddelek, null, "NZV ni oddelek generatorja rotacije");
eq(beri("?tab=kalup&oddelek=XYZ").oddelek, null, "izmišljena koda oddelka se zavrže");
eq(beri("?tab=nzv&pod=nekaj").pod, null, "neznan podzavihek se zavrže");

console.log("4) mesec mora biti YYYY-MM in resničen mesec");
// Zavihek je dodan zato, da napotilo obstaja tudi takrat, ko je mesec
// zavrnjen - sicer je izid null (nič veljavnega) in meseca ni kaj brati.
const mesecIz = (v) => { const n = beri("?tab=kalup&mesec=" + v); return n ? n.mesec : "BREZ NAPOTILA"; };
eq(mesecIz("2026-13"), null, "trinajsti mesec se zavrže");
eq(mesecIz("2026-00"), null, "ničti mesec se zavrže");
eq(mesecIz("2026-1"), null, "brez vodilne ničle se zavrže (oblika povsod enaka)");
eq(mesecIz("oktober"), null, "besedilo se zavrže");
eq(mesecIz("2026-09"), "2026-09", "september 2026 je veljaven");
eq(mesecIz("2027-01"), "2027-01", "januar prihodnjega leta je veljaven");
// Sam neveljaven mesec brez česa drugega ni napotilo - stran se odpre
// povsem privzeto, namesto da bi se odprl napačen zavihek.
eq(beri("?mesec=2026-13"), null, "naslov s samim neveljavnim mesecem ni napotilo");

console.log("5) drobnarije zapisa iz resničnih povezav");
eq(beri("?tab=KALUP&oddelek=c1&mesec=2026-10"),
  { tab: "kalup", oddelek: "C1", pod: null, mesec: "2026-10" },
  "velike/male črke ne motijo");
eq(beri("?tab=kalup&oddelek=%20C1%20&mesec=2026-10").oddelek, "C1", "presledki okoli vrednosti ne motijo");
eq(beri("tab=kalup&oddelek=B").oddelek, "B", "naslov brez vodilnega vprašaja");

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
