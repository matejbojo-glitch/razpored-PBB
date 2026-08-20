#!/usr/bin/env node
/* Preizkus "Moj razpored" (index.html) za nosilce enot NZV.
 *
 * Isti manjko kot pri NZV mreži in Imenik → Razpredelnici, le na tretjem
 * zaslonu: za vodje se dnevni razpored ne objavlja, zato je vodja v
 * svojem razporedu videl prazne delovne dneve, čeprav vsak delovni dan
 * dela na svoji enoti.
 *
 * Preverjamo pravilo (window.NzvZasedba.stalnaZasedba) natanko tako, kot
 * ga uporablja MyScheduleView in izvoz – vključno s tem, kar se NE sme
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
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
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
// nzvPrikaz kliče shiftLabel (preslikava PRISOTEN -> dopoldan), zato
// mora biti v peskovniku tudi ta.
vm.runInContext(izvleciFn("shiftLabel"), sandbox);
vm.runInContext(izvleciFn("nzvPrikaz"), sandbox);
// prikazNaZaslonu je ZADNJI korak pred izpisom. Prejšnja različica tega
// testa je klicala samo nzvPrikaz in zato ni opazila, da je zaslon
// rezultat pognal še enkrat skozi shiftLabel in ga skrčil nazaj na golo
// "Dopoldne" (enota in dežurstvo sta izginila). Odslej se preverja
// natanko tisto, kar uporabnik prebere.
vm.runInContext(izvleciFn("prikazNaZaslonu"), sandbox);

const { stalnaZasedba } = sandbox.window.NzvZasedba;
const { nzvPrikaz, prikazNaZaslonu } = sandbox;
// Natanko veriga iz MyScheduleView: <span className="txt">{prikazNaZaslonu(prikaz)}</span>
const naZaslonu = (sifra, dan, datum, enota) =>
  prikazNaZaslonu(nzvPrikaz(sifra, dan, true, datum, enota));

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

console.log("1) Vodja ima izpolnjen vsak delovni dan – prej so bili prazni");
{
  const m = mojRazpored({});
  const delovni = SEPTEMBER.filter(d => !sandbox.window.Prazniki.jeDelaProstDan(d));
  const manjka = delovni.filter(d => !m[d]);
  trdi(manjka.length === 0, `vseh ${delovni.length} delovnih dni septembra je izpolnjenih`
    + (manjka.length ? ` – manjkajo ${manjka.join(", ")}` : ""));
  eq(m["2026-09-01"], "PRISOTEN", "1.9. (torek)");
  eq(m["2026-09-30"], "PRISOTEN", "30.9. (sreda) – do konca meseca");
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

console.log("4) Kar zaslon RES izpiše (nzvPrikaz -> prikazNaZaslonu)");
{
  const m = mojRazpored({ "2026-09-02": "DEŽURSTVO" });
  eq(naZaslonu(m["2026-09-01"], "TO", "2026-09-01", ""), "Dopoldne", "navaden delovni dan (PRISOTEN se izpiše kot dopoldan)");
  eq(naZaslonu(m["2026-09-02"], "SR", "2026-09-02", ""), "Dopoldne + Dežurstvo",
    "dežurstvo med tednom je po redni prisotnosti");
  eq(naZaslonu(m["2026-09-05"], "SO", "2026-09-05", ""), "Prosto", "sobota je prosta");
}

console.log("4b) Enota v ISTI vrstici – to je bilo na zaslonu pokvarjeno");
{
  // Regresija (avgust 2026): nzvPrikaz je sestavil pravilno besedilo,
  // zaslon pa ga je pognal še enkrat skozi shiftLabel. vnos() pobriše
  // presledke in pike, zato se je "Dopoldne (MO) + Dežurstvo" ujel z
  // /^dopoldne/ in se skrčil nazaj na "Dopoldne". Uporabnik je videl gol
  // "Dopoldne" na vseh dneh, čeprav je bila enota pravilno izračunana.
  eq(naZaslonu("PRISOTEN", "PO", "2026-08-24", "MO"), "Dopoldne (MO)",
    "vodja na svoji enoti: Dopoldne (MO)");
  eq(naZaslonu("DEŽURSTVO", "SR", "2026-08-26", "MO"), "Dopoldne (MO) + Dežurstvo",
    "dežurstvo med tednom: enota IN dežurstvo, oboje v isti vrstici");
  eq(naZaslonu("PRISOTEN", "TO", "2026-08-25", "E2, E1"), "Dopoldne (E2, E1)",
    "ob nadomeščanju se izpišeta obe enoti (Maglić, ko je Lelić na dopustu)");
  eq(naZaslonu("popoldan", "ČE", "2026-08-27", "C1"), "Popoldne (C1)",
    "popoldanska izmena na drugi enoti");
  eq(naZaslonu("DEŽURSTVO", "NE", "2026-08-30", "MO"), "Dežurstvo",
    "vikendno dežurstvo je cel dan – brez dopoldanskega dela in brez enote");
}

console.log("4c) Na odsotnosti se enota NE pripiše (tisti dan ni na nobeni enoti)");
{
  eq(naZaslonu("LD", "PO", "2026-08-24", "MO"), "Letni dopust", "letni dopust");
  eq(naZaslonu("BS", "TO", "2026-08-25", "MO"), "Bolniški stalež", "bolniški stalež");
  eq(naZaslonu("STI", "SR", "2026-08-26", "MO"), "Strokovno izobraževanje", "strokovno izobraževanje");
  eq(naZaslonu("KPU", "ČE", "2026-08-27", "MO"), "Koriščenje prostih ur", "koriščenje prostih ur");
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

console.log("7) Gosta mreža ('Po oddelkih'): kratica za odsotnosti, cel naziv za delo");
{
  // Uporabnikova odločitev (avgust 2026): kratica v razpredelnici, cela
  // beseda v "Moj razpored". Delovne izmene ostanejo Dopoldne/Popoldne/
  // Nočna, ker je prav ta zapis zahteval za celotno aplikacijo.
  const g = sandbox.window.Izmene.nazivZaMrezo;
  eq(g("dopoldan"), "Dopoldne", "dopoldan");
  eq(g("popoldan"), "Popoldne", "popoldan");
  eq(g("NOČNA"), "Nočna", "nočna");
  eq(g("DNEVNA12"), "Dnevna 12", "dnevna 12");
  eq(g("LD"), "LD", "letni dopust je kratica, ne stavek");
  eq(g("BS"), "BS", "bolniški stalež");
  eq(g("POR"), "POR", "porodniški dopust");
  eq(g("STI"), "STI", "strokovno izobraževanje");
  eq(g("KPU"), "KPU", "koriščenje prostih ur");
  eq(g(""), "", "prazna celica ostane prazna");
  // Ista šifra v "Moj razpored" pove cel stavek – tam je prostora dovolj.
  eq(sandbox.window.Izmene.naziv("LD"), "Letni dopust", "v Moj razpored ostane cel naziv");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
