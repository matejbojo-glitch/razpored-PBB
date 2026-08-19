#!/usr/bin/env node
/* Preizkus "Moj razpored" (index.html) za nosilce enot NZV.
 *
 * Isti manjko kot pri NZV mreži in Imenik → Razpredelnici, le na tretjem
 * zaslonu: za vodje se dnevni razpored ne objavlja, zato je vodja v
 * svojem razporedu videl prazne delovne dneve, čeprav vsak delovni dan
 * dela na svoji enoti.
 *
 * Preverjamo pravilo (window.NzvZasedba.stalnaZasedba) natanko tako, kot
 * ga uporablja MyScheduleView in izvoz — vključno s tem, kar se NE sme
 * zgoditi: objavljena izmena, dežurstvo in dopust se nikoli ne prepišejo.
 *
 * Zagon: node skripte/preveri-moj-razpored-nzv.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "index.html"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);

// classify + nzvPrikaz iz index.html: kar zaslon dejansko izpiše.
function izvleciFn(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0;
  for (let i = html.indexOf("{", zac); i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
// classify živi v izmene.js (skupni modul za vse zaslone).
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
vm.runInContext("var classify = window.Izmene.skupina;", sandbox);
vm.runInContext(izvleciFn("nzvPrikaz"), sandbox);

const { stalnaZasedba } = sandbox.window.NzvZasedba;
const { nzvPrikaz } = sandbox;

const NOSILEC = { full_name: "TOMAŽEVIČ SIMONA", enote: "A", odsotnost_tip: null, odsotnost_do: null };
const PORODNISKA = { full_name: "POGAČNIK TEJA", enote: "E1", odsotnost_tip: "porodniška", odsotnost_do: "2027-07-31" };

function dneviMeseca(leto, mesec) {
  const zadnji = new Date(leto, mesec, 0).getDate();
  const out = [];
  for (let d = 1; d <= zadnji; d++) {
    out.push(`${leto}-${String(mesec).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}
const SEPTEMBER = dneviMeseca(2026, 9);

// Natanko tako, kot to počne MyScheduleView: objavljeni vnosi najprej,
// izpeljava le v prazne dneve.
function mojRazpored(objavljeni, nosilec = NOSILEC, datumi = SEPTEMBER) {
  const m = Object.assign({}, objavljeni);
  stalnaZasedba(nosilec, datumi, d => !!m[d]).forEach(x => { m[x.datum] = x.sifra; });
  return m;
}

console.log("1) Vodja ima izpolnjen vsak delovni dan — prej so bili prazni");
{
  const m = mojRazpored({});
  const delovni = SEPTEMBER.filter(d => !sandbox.window.Prazniki.jeDelaProstDan(d));
  const manjka = delovni.filter(d => !m[d]);
  trdi(manjka.length === 0, `vseh ${delovni.length} delovnih dni septembra je izpolnjenih`
    + (manjka.length ? ` — manjkajo ${manjka.join(", ")}` : ""));
  eq(m["2026-09-01"], "PRISOTEN", "1.9. (torek)");
  eq(m["2026-09-30"], "PRISOTEN", "30.9. (sreda) — do konca meseca");
}

console.log("2) Vikend in dela prost praznik ostaneta prazna");
{
  const m = mojRazpored({});
  eq(m["2026-09-05"], undefined, "sobota 5.9.");
  eq(m["2026-09-06"], undefined, "nedelja 6.9.");
  const dec = mojRazpored({}, NOSILEC, dneviMeseca(2026, 12));
  eq(dec["2026-12-25"], undefined, "božič 25.12.2026 (petek)");
  eq(dec["2026-12-24"], "PRISOTEN", "24.12.2026 je navaden delovni dan");
}

console.log("3) Objavljena izmena, dežurstvo in dopust se ne prepišejo");
{
  const m = mojRazpored({
    "2026-09-02": "DEŽURSTVO",
    "2026-09-03": "LD",
    "2026-09-04": "popoldan",
  });
  eq(m["2026-09-02"], "DEŽURSTVO", "dežurstvo ostane");
  eq(m["2026-09-03"], "LD", "letni dopust ostane");
  eq(m["2026-09-04"], "popoldan", "objavljena izmena ostane");
  eq(m["2026-09-01"], "PRISOTEN", "prazen dan se še vedno dopolni");
}

console.log("4) Kar zaslon izpiše (nzvPrikaz) je smiselno");
{
  const m = mojRazpored({ "2026-09-02": "DEŽURSTVO" });
  eq(nzvPrikaz(m["2026-09-01"], "TO", true, "2026-09-01"), "PRISOTEN", "navaden delovni dan");
  eq(nzvPrikaz(m["2026-09-02"], "SR", true, "2026-09-02"), "PRISOTEN + DEŽURSTVO",
    "dežurstvo med tednom je po redni prisotnosti");
  eq(nzvPrikaz(m["2026-09-05"], "SO", true, "2026-09-05"), "", "sobota ostane prazna");
}

console.log("5) Porodniška zapolni mesec z uradno kratico");
{
  const m = mojRazpored({}, PORODNISKA);
  eq(m["2026-09-01"], "POR", "1.9.");
  eq(m["2026-09-30"], "POR", "30.9.");
  eq(m["2026-09-06"], undefined, "vikend ostane prazen");
}

console.log("6) Kdor ni nosilec enote, ostane nedotaknjen");
{
  eq(Object.keys(mojRazpored({}, null)).length, 0, "brez zapisa nosilca ni dopolnitev");
  eq(Object.keys(mojRazpored({}, { full_name: "X", enote: null })).length, 0,
    "prazne enote pomenijo, da oseba ni nosilec oddelka");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
