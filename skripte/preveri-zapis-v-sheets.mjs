#!/usr/bin/env node
/* Preizkus pripraviPosodobitveOddelka() (index.html) — funkcije, ki za
 * "Zapiši nazaj v Sheets" izračuna TOČNO katera (vrstica, stolpec) v
 * obstoječem Google Sheets listu ustreza kateri (oseba, datum) v aplikaciji.
 *
 * Zakaj je ta preizkus nujen PRED prvo uporabo na pravem dokumentu: funkcija
 * piše naravnost v admin-ov ročno voden, podpisan dokument (glej
 * zapisiVObstojeciList v gsheets-client.js) — napačna vrstica ali stolpec bi
 * tiho prepisala TUJO celico (drugo osebo/drug dan), ne da bi kdorkoli to
 * takoj opazil. Ker v tem okolju ni dostopa do prave Google Sheets datoteke
 * (omrežna politika), je edini način preverjanja pravilnosti izračuna
 * fixture, zgrajen po natančni obliki resničnega dokumenta ("2026 SMS
 * RAZPORED"), ki ga je poslal uporabnik.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html (ne prepisane tu), zato
 * preizkus ne more zaostati za kodo.
 *
 * Zagon: node skripte/preveri-zapis-v-sheets.mjs
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
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  izvleci("priimekZacetnica"),
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani),
  // zato ga naložimo in monthRange samo preimenujemo - enako, kot to
  // naredi index.html.
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  izvleci("najdiVrsticoImen"),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  izvleci("pripraviPosodobitveOddelka"),
].join("\n\n");

const sandbox = {
  window: { ImportUtils: { normalizirajDatum: normalizirajDatum } },
  console,
};
// Ista normalizacija kot v pravi import-utils.js (glej tam), tu ročno
// ponovljena, ker je import-utils.js zavita v IIFE brez CommonJS izvoza.
function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (m) { const [, d, mo, y] = m; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return t;
}
vm.createContext(sandbox);
// Kratka imena iz predlog gredo skozi skupno parafa.js (window.Parafa.
// kratkoKljuc) - tam so uporabnikom potrjeni popravki zapisov, npr.
// "VALJAVEC A." -> "VALJAVEC E." Peskovnik jo mora imeti naloženo, sicer
// izvlečena koda kliče nedefiniran window.Parafa.
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
vm.runInContext(koda, sandbox);
const { pripraviPosodobitveOddelka } = sandbox;

// Fixture po natančni obliki, ki jo je uporabnik poslal za C1 (dva meseca,
// zavihek pisan brez presledka pod prejšnjim, drug nabor ljudi v juliju).
function vrstica(datum, dan, sifre) { return [datum, dan, ...sifre]; }
const JUNIJ_IMENA = ["DŽINIĆ A.", "STARC E.", "KARNIČAR J.", "ZEKAN A."];
const JULIJ_IMENA = ["DŽINIĆ A.", "KARNIČAR J.", "ZEKAN A.", "DJEDOVIĆ M."]; // STARC E. je odšla, prišel DJEDOVIĆ M.

const vrsteVrstic = [
  ["C1 odd", "", ...JUNIJ_IMENA],
  ["", "", "SMS / TZN", "SMS / TZN", "SMS / TZN", "SMS / TZN"],
  ["JUNIJ", ""],
  vrstica("1. 6. 2026", "PO", ["LD", "NOČNA", "popoldan", "LD"]),
  vrstica("2. 6. 2026", "TO", ["LD", "NOČNA", "popoldan", "LD"]),
  [], // prazna vrstica MED vrsticami bloka - vrne se kot [] iz Sheets API, ne sme prekiniti bloka
  vrstica("3. 6. 2026", "SR", ["KPU", "NOČNA", "LD", "popoldan"]),
  [],
  ["Datum: 28.5.2026", "verzija 2"],
  [],
  ["Pripravil:", "", "", "", "Pregledal in odobril:"],
  [],
  ["C1 odd", "", ...JULIJ_IMENA],
  ["", "", "SMS / TZN", "SMS / TZN", "SMS / TZN", "SMS / TZN"],
  ["JULIJ", ""],
  vrstica("1. 7. 2026", "SR", ["popoldan", "NOČNA", "dopoldan", "KPU"]),
  vrstica("2. 7. 2026", "ČE", ["NOČNA", "LD", "popoldan", "dopoldan"]),
];

const zaposleni = [
  { id: "dzinic", full_name: "Džinić Amin" },
  { id: "starc", full_name: "Starc Erik" },
  { id: "karnicar", full_name: "Karničar Jure" },
  { id: "zekan", full_name: "Zekan Almedin" },
  { id: "djedovic", full_name: "Djedović Mark" },
];
const byEmpDate = {
  "dzinic|2026-06-01": "LD", "starc|2026-06-01": "NOČNA", "karnicar|2026-06-01": "POPOLDAN SPREMENJENO",
  "dzinic|2026-07-01": "dopoldan", "djedovic|2026-07-01": "prosto naj se ne zapiše",
};

console.log("1) junijski blok — koordinate za znane osebe");
{
  const { posodobitve, najdenDatum, najdenaGlava, neujemanja } =
    pripraviPosodobitveOddelka(vrsteVrstic, "2026-06", zaposleni, byEmpDate);
  trdi(najdenDatum, "najde vrstice za junij");
  trdi(najdenaGlava, "najde vrstico z imeni nad junijskim blokom");
  // DŽINIĆ A. je 1. zaposleni v glavi (stolpec 2), 1. 6. je vrstica z indeksom 3.
  const dzinic1junij = posodobitve.find(p => p.vrstica === 3 && p.stolpec === 2);
  jseq(dzinic1junij, { vrstica: 3, stolpec: 2, vrednost: "LD" }, "DŽINIĆ A. / 1. 6. -> vrstica 3, stolpec 2 (A=0,B=1,C=2)");
  const starc1junij = posodobitve.find(p => p.vrstica === 3 && p.stolpec === 3);
  jseq(starc1junij, { vrstica: 3, stolpec: 3, vrednost: "NOČNA" }, "STARC E. / 1. 6. -> stolpec 3 (D), trenutna vrednost iz aplikacije");
  // Prazna vrstica ([]) med 2.6. in 3.6. se ne sme šteti kot konec bloka.
  const karnicar3junij = posodobitve.find(p => p.vrstica === 6 && p.stolpec === 4);
  trdi(!!karnicar3junij, "blok se nadaljuje TUDI čez prazno vrstico (Sheets API vrne prazne vmesne vrstice kot [])");
  trdi(posodobitve.every(p => p.vrstica !== 8 && p.vrstica !== 10), "podpisni blok (Datum/Pripravil) ni med posodobitvami");
  trdi(neujemanja.size === 0, "vsa imena v juniju se ujemajo z znanimi osebami");
}

console.log("2) julijski blok — DRUG nabor ljudi, svoja glava");
{
  const { posodobitve, neujemanja } = pripraviPosodobitveOddelka(vrsteVrstic, "2026-07", zaposleni, byEmpDate);
  // DJEDOVIĆ M. je v juliju 4. stolpec (E, indeks 5), v juniju ga sploh ni bilo.
  const djedovic1julij = posodobitve.find(p => p.vrstica === 15 && p.stolpec === 5);
  jseq(djedovic1julij, { vrstica: 15, stolpec: 5, vrednost: "prosto naj se ne zapiše" }, "DJEDOVIĆ M. / 1. 7. -> vrstica 15, stolpec 5 (E)");
  trdi(neujemanja.size === 0, "vsa imena v juliju (drug nabor) se ujemajo, brez zamenjave s korakom iz junija");
}

console.log("3) oseba, ki v listu nima svojega stolpca");
{
  const brezEnega = zaposleni.filter(z => z.id !== "zekan").concat([{ id: "nov", full_name: "Novak Nekdo" }]);
  const { posodobitve, neujemanja } = pripraviPosodobitveOddelka(vrsteVrstic, "2026-06", brezEnega, byEmpDate);
  trdi(!posodobitve.some(p => p.stolpec === 5 /* ZEKAN A. stolpec */), "za osebo brez ustreznega imena v aplikaciji se ne piše nič");
  trdi(neujemanja.has("ZEKAN A."), "ZEKAN A. (v listu, a ne v seznamu zaposlenih klica) je javljen kot neujemanje, ne napaka");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
