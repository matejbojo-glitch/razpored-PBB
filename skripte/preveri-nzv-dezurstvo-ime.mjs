#!/usr/bin/env node
/* Preizkus obdelajNzvVrstice() (index.html) - resnična napaka, najdena z
 * dry-run-om PRAVIH uporabnikovih datotek ("Letni_dopusti_in_omejitve_za_
 * NZV.xlsx", "2026_SMS_RAZPORED.xlsx", avgust/september 2026): stolpec
 * DEŽURSTVO uradne predloge NE vsebuje parafe (kot vsi ostali stolpci -
 * "GA", "MAG" ipd.), ampak POLNO IME osebe (npr. "Grega Arnež", včasih z
 * nazivom "dr. Tanja Torkar") - dokazano na pravi naloženi datoteki, ne
 * domneva. Star obdelajNzvVrstice je stolpec DEŽURSTVO obravnaval enako
 * kot vse ostale (iskal parafo) - vsak dežurstveni vpis je zato TIHO
 * odpadel (v poročilu se je izgubil med pričakovanimi "neujemanji"), zato
 * dežurstvo ni bilo nikoli vidno v NZV pregledu niti v "Moj razpored" -
 * ne glede na to, da MyScheduleView pravilno prikaže VSAK schedule_entries
 * zapis (glej preveri-nzv-dezurstvo-datum.mjs) - vpisa preprosto ni bilo.
 *
 * Preverja:
 *   1. DEŽURSTVO stolpec se ujema po POLNEM IMENU (vreča besed), ne po
 *      parafi - tudi če je vsebina cel niz kratkih črk, ki bi po nesreči
 *      lahko izgledal kot parafa;
 *   2. naziv pred imenom ("dr. ") se pravilno odstrani pred ujemanjem;
 *   3. vsi OSTALI stolpci (enote, LD/IZOB/BS) se ŠE VEDNO ujemajo po
 *      parafi kot doslej - popravek ne sme pokvariti ničesar drugega
 *      (regresija);
 *   4. oseba, ki je v DEŽURSTVO stolpcu, a je ni v aplikaciji, konča v
 *      poročilu "neujemanja" (njeno polno ime), ne izgine tiho.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html, zato preizkus ne more
 * zaostati za kodo.
 *
 * Zagon: node skripte/preveri-nzv-dezurstvo-ime.mjs
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
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  const konec = html.indexOf(";\n", zac);
  if (konec === -1) throw new Error("Konec konstante " + ime + " ni najden.");
  return html.slice(zac, konec + 1);
}
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani),
  // zato ga naložimo in monthRange samo preimenujemo - enako, kot to
  // naredi index.html.
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  // NZV_ENOTE/NZV_STOLPCI zdaj kažeta na skupni nzv-zasedba.js (prej sta
  // bila zapisana v index.html), zato mora biti modul naložen PRED njima.
  readFileSync(join(koren, "imena.js"), "utf8"),
  readFileSync(join(koren, "nzv-zasedba.js"), "utf8"),
  constVKotVar(izvleciConst("NZV_ENOTE")),
  izvleci("razvrstiSA"),
  izvleci("poisciEnoteNzv"),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  izvleci("nzvNazivVKodo"),
  constVKotVar(izvleciConst("NZV_KIND_KODA")),
  constVKotVar(izvleciConst("NZV_ODSOTNOST_KIND")),
  // Ujemanje imen živi v imena.js (skupni modul), zato ga tu ne luščimo
  // iz index.html, ampak naložimo in samo preimenujemo v stara imena, ki
  // jih izluščene funkcije kličejo.
  readFileSync(join(koren, "imena.js"), "utf8"),
  "var normalizirajImeNzv = window.Imena.normaliziraj;",
  "var imenaSeUjemataNzv = window.Imena.seUjemata;",
  constVKotVar(izvleciVrstico("const NAZIV_OSEBE_RX")),
  izvleci("ocistiNazivOsebe"),
  izvleci("obdelajNzvVrstice"),
].join("\n\n");

// "window" mora kazati na sam sandbox, ker skupni moduli (imena.js,
// nzv-zasedba.js) nanj obesijo svoje objekte. Vsebina prejšnjega
// nadomestka (ImportUtils) se zato prestavi naravnost v sandbox.
const sandbox = { console };
sandbox.window = sandbox;
sandbox.ImportUtils = { normalizirajDatum };
vm.createContext(sandbox);
vm.runInContext(koda, sandbox);
const { obdelajNzvVrstice } = sandbox;

const PROFILI = [
  { id: "p-arnez", full_name: "ARNEŽ GREGA" },
  { id: "p-torkar", full_name: "TORKAR TANJA" },
  { id: "p-bojic", full_name: "BOJIĆ MATEJ" },
  { id: "p-hrovat", full_name: "HROVAT NINA" },
];
// "GA" bi bila prava parafa Arnež Grega - namenoma NI v poParafi (samo
// imena za DEŽURSTVO), da preizkus ne more po nesreči "uspeti" prek napačne
// (parafa) poti namesto prave (ime) poti.
const POPARAFI = {};

// Fixture natanko po vzoru uradne predloge "Letni dopusti in omejitve za
// NZV" (glava: DATUM | PDZN | ... | DEŽURSTVO | LD | IZOB | BS) - DEŽURSTVO
// vsebuje polna imena, LD parafe (kot v resnični datoteki). Prava datoteka
// ima med glavo in prvim dnem eno povsem prazno vrstico ("za zrak") - ta pa
// je v resničnem branju (xlsxVsiListi, sheet_to_json z blankrows:false) že
// ODSTRANJENA, preden pride do te funkcije, zato je tu NAMENOMA ni (glava
// mora biti neposredno nad prvim dnem, glej poisciEnoteNzv).
const VRSTICE = [
  ["AVGUST 2026"],
  ["DATUM", "PDZN", "DEŽURSTVO", "LD"],
  ["2026-08-03", "", "Grega Arnež", ""],
  ["2026-08-04", "", "dr. Tanja Torkar", "HRO"],
  ["2026-08-05", "", "Nekdo Neznan", ""],
];

console.log("1) DEŽURSTVO stolpec se ujema po polnem imenu, ne po parafi");
{
  const { zapisi, neujemanja } = obdelajNzvVrstice(VRSTICE, "2026-08", POPARAFI, "admin-id", PROFILI);
  const dez = zapisi.filter(z => z.department_code === "DEZ");
  trdi(dez.length === 2, `2 zapisa DEŽURSTVO najdena (dobil ${dez.length})`);
  trdi(dez.some(z => z.employee_id === "p-arnez" && z.work_date === "2026-08-03" && z.shift_code === "DEŽURSTVO"),
    "Arnež Grega dobi DEŽURSTVO na 3.8.2026");
  trdi(!neujemanja.has("GA") && !neujemanja.has("Grega Arnež"),
    "'Grega Arnež' se NE pojavi v neujemanjih (pravilno ujet po imenu)");
}

console.log("2) naziv pred imenom ('dr. ') se pravilno odstrani");
{
  const { zapisi } = obdelajNzvVrstice(VRSTICE, "2026-08", POPARAFI, "admin-id", PROFILI);
  const torkar = zapisi.find(z => z.employee_id === "p-torkar");
  trdi(!!torkar, "'dr. Tanja Torkar' se ujame z 'TORKAR TANJA' (naziv odstranjen pred primerjavo)");
  trdi(torkar && torkar.work_date === "2026-08-04", "na pravem dnevu (4.8.2026)");
}

console.log("3) oseba v DEŽURSTVO stolpcu, ki je ni v aplikaciji, konča v poročilu (ne izgine tiho)");
{
  const { neujemanja } = obdelajNzvVrstice(VRSTICE, "2026-08", POPARAFI, "admin-id", PROFILI);
  trdi(neujemanja.has("Nekdo Neznan"), "'Nekdo Neznan' je v neujemanjih");
}

console.log("4) ostali stolpci (LD) se ŠE VEDNO ujemajo po parafi kot doslej (regresija)");
{
  const poParafi = { HRO: { id: "p-hrovat", full_name: "HROVAT NINA" } };
  const { dopusti } = obdelajNzvVrstice(VRSTICE, "2026-08", poParafi, "admin-id", PROFILI);
  trdi(dopusti.length === 1 && dopusti[0].full_name === "HROVAT NINA" && dopusti[0].kind === "ld" && dopusti[0].work_date === "2026-08-04",
    "LD 'HRO' na 4.8.2026 se ujame s Hrovat Nino prek parafe (nespremenjeno)");
}

console.log("5) ocistiNazivOsebe ne pokvari imena BREZ naziva");
{
  const { ocistiNazivOsebe } = sandbox;
  trdi(ocistiNazivOsebe("Grega Arnež") === "Grega Arnež", "ime brez naziva ostane nespremenjeno");
  trdi(ocistiNazivOsebe("dr. Tanja Torkar") === "Tanja Torkar", "'dr. ' se odstrani");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
