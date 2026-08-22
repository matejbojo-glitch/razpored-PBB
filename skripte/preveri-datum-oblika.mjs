#!/usr/bin/env node
/* Preizkus datum.js – ene same oblike datuma za vso aplikacijo
 * (dan.mesec.leto brez presledkov, npr. "27.10.2026").
 *
 * Zakaj: slovenska privzeta oblika (toLocaleDateString("sl-SI")) vstavlja
 * presledke – "27. 10. 2026" – kar se je v ozkem stolpcu DATUM v NZV mreži
 * obrezalo v neuporabno "1. 9. 20…". Poleg tega je bil datum po straneh
 * zapisan na tri različne načine ("1. 9. 2026", "1. sep. 2026", "1. 9.").
 *
 * Preverja tudi past s časovnim pasom: "new Date('2026-10-27')" se razume
 * kot polnoč UTC, zato bi v pasu ZA UTC (npr. Amerika) prikazalo 26.10.
 * Delovni datumi so v bazi "YYYY-MM-DD" brez ure, zato jih datum.js
 * razčleni kot besedilo, ne prek Date.
 *
 * Zagon: node skripte/preveri-datum-oblika.mjs
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
  trdi(a === b, opis + (a === b ? "" : ` – dobil "${a}", pričakoval "${b}"`));
}

const sandbox = { window: {}, console, Date, isNaN, Number, String, RegExp };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "datum.js"), "utf8"), sandbox);
const Datum = sandbox.window.Datum;

console.log("1) osnovna oblika: dan.mesec.leto brez presledkov");
{
  eq(Datum.slo("2026-10-27"), "27.10.2026", "27.10.2026");
  eq(Datum.slo("2026-09-01"), "1.9.2026", "vodilne ničle se odstranijo (1.9.2026, ne 01.09.2026)");
  eq(Datum.slo("2026-12-31"), "31.12.2026", "zadnji dan v letu");
}

console.log("2) delovni datum se NE premakne zaradi časovnega pasu");
{
  // Ista past kot pri uvozu iz Excela: "YYYY-MM-DD" mora ostati isti dan
  // ne glede na pas, v katerem brskalnik teče.
  const staraTZ = process.env.TZ;
  try {
    process.env.TZ = "America/New_York"; // UTC-5/-4, torej ZA UTC
    const sb = { window: {}, console, Date, isNaN, Number, String, RegExp };
    vm.createContext(sb);
    vm.runInContext(readFileSync(join(koren, "datum.js"), "utf8"), sb);
    eq(sb.window.Datum.slo("2026-10-27"), "27.10.2026", "v pasu UTC-5 ostane 27.10., ne 26.10.");
  } finally {
    if (staraTZ === undefined) delete process.env.TZ; else process.env.TZ = staraTZ;
  }
}

console.log("3) različice: brez leta, s časom");
{
  eq(Datum.sloBrezLeta("2026-10-27"), "27.10.", "brez leta (mesečna tabela, kjer je leto v glavi)");
  const zigom = Datum.sloSCasom("2026-08-11T13:51:22Z");
  trdi(/^11\.8\.2026 \d{2}:\d{2}$/.test(zigom), `časovni žig -> "11.8.2026 HH:MM" (dobil "${zigom}")`);
}

console.log("4) prazne/neveljavne vrednosti ne zrušijo prikaza");
{
  eq(Datum.slo(null), "", "null -> prazen niz");
  eq(Datum.slo(""), "", "prazen niz -> prazen niz");
  eq(Datum.slo(undefined), "", "undefined -> prazen niz");
  eq(Datum.slo("ni datum"), "", "neveljavno besedilo -> prazen niz (ne 'Invalid Date')");
}

console.log("5) sprejme tudi Date objekt");
{
  eq(Datum.slo(new Date(2026, 9, 27)), "27.10.2026", "Date objekt (mesec je 0-osnovan) -> 27.10.2026");
}

console.log("6) nobena stran ne uporablja več privzete slovenske oblike s presledki");
{
  const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
  strani.forEach(ime => {
    const vsebina = readFileSync(join(koren, ime), "utf8");
    // toLocaleDateString("sl-SI") brez izrecnih možnosti da "27. 10. 2026".
    const zadetki = [...vsebina.matchAll(/toLocaleDateString\(\s*["']sl-SI["']\s*\)/g)];
    trdi(zadetki.length === 0, `${ime}: brez golega toLocaleDateString("sl-SI") (najdenih ${zadetki.length})`);
  });
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
