#!/usr/bin/env node
/* Preizkus "pametnega uvoza" (index.html: razvrstiListe, obdelajOddelekVrstice,
 * obdelajNzvVrstice) - uporabnik je prosil za možnost, da naloži ENO
 * datoteko (lahko z več zavihki, kot pravi delovni zvezek "2026 SMS
 * RAZPORED") namesto ročnega lepljenja Google Sheets povezave za vsak
 * oddelek/mesec posebej, in da aplikacija sama prepozna vsebino vsakega
 * lista.
 *
 * Preverja:
 *  1) razvrstiListe pravilno loči liste, poimenovane po znani kodi oddelka
 *     (PO_ODDELKIH_KODE, ne glede na velikost črk/presledke), od preostalih;
 *  2) obdelajOddelekVrstice (izvlečeno iz uvoziOddelek) na listu, oblikovanem
 *     kot pravi C1 zavihek, najde iste zapise kot prej (refaktoring ni nič
 *     spremenil v vedenju);
 *  3) obdelajNzvVrstice (izvlečeno iz uvoziNzv) na listu, oblikovanem kot
 *     pravi NZV zavihek, najde enote IN LD/IZOB/BS odsotnosti;
 *  4) list, ki ni ne prepoznan oddelek ne NZV oblika (npr. "KALUP" - legenda,
 *     ne razpored), ne vrne nobenega zapisa - v pravi funkciji
 *     uvoziDatotekoPametno to pomeni "preskočen list", ne napaka.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html, zato preizkus ne more
 * zaostati za kodo.
 *
 * Zagon: node skripte/preveri-pametni-uvoz.mjs
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
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  izvleci("priimekZacetnica"),
  izvleci("parafaOd"),
  izvleci("monthRange"),
  constVKotVar(izvleciConst("PO_ODDELKIH_KODE")),
  izvleci("najdiVrsticoImen"),
  constVKotVar(izvleciConst("NZV_ENOTE")),
  izvleci("nzvNazivVKodo"),
  izvleci("poisciEnoteNzv"),
  constVKotVar(izvleciConst("NZV_ODSOTNOST_KIND")),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  izvleci("obdelajOddelekVrstice"),
  izvleci("obdelajNzvVrstice"),
  izvleci("razvrstiListe"),
].join("\n\n");

const sandbox = {
  window: { ImportUtils: { normalizirajDatum: normalizirajDatum } },
  console,
};
function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (m) { const [, d, mo, y] = m; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return t;
}
vm.createContext(sandbox);
vm.runInContext(koda, sandbox);
const { razvrstiListe, obdelajOddelekVrstice, obdelajNzvVrstice } = sandbox;

console.log("1) razvrstiListe loči oddelčne liste (po imenu) od preostalih");
{
  const listi = [
    { naziv: "C1", vrsteVrstic: [["c1 podatki"]] },
    { naziv: " flexi ", vrsteVrstic: [["flexi podatki"]] }, // presledki + male črke - mora se ujemati
    { naziv: "KALUP", vrsteVrstic: [["legenda"]] },
    { naziv: "September 2026", vrsteVrstic: [["nzv podatki"]] },
  ];
  const { oddelki, preostali } = razvrstiListe(listi);
  jseq(oddelki.map(o => o.koda).sort(), ["C1", "FLEXI"], "C1 in FLEXI (ne glede na presledke/velikost črk) prepoznana kot oddelka");
  jseq(preostali.map(l => l.naziv), ["KALUP", "September 2026"], "KALUP in September 2026 gresta v 'preostali' (niso znana koda oddelka)");
}

console.log("2) obdelajOddelekVrstice na C1-oblikovanem listu");
{
  const vrsteVrstic = [
    ["C1 odd", "", "DŽINIĆ A.", "STARC E."],
    ["", "", "SMS / TZN", "SMS / TZN"],
    ["JUNIJ", ""],
    ["1. 6. 2026", "PO", "LD", "NOČNA"],
    ["2. 6. 2026", "TO", "popoldan", "KPU"],
  ];
  const poKratkem = { "DŽINIĆ A.": "dzinic-id", "STARC E.": "starc-id" };
  const { zapisi, najdenDatum, najdenaGlava, neujemanja } = obdelajOddelekVrstice(vrsteVrstic, "C1", "2026-06", poKratkem);
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo");
  jseq(zapisi.length, 4, "4 zapisi (2 osebi x 2 dneva)");
  const prvi = zapisi.find(z => z.employee_id === "dzinic-id" && z.work_date === "2026-06-01");
  jseq(prvi, { employee_id: "dzinic-id", department_code: "C1", work_date: "2026-06-01", shift_code: "LD" }, "DŽINIĆ A. / 1.6. -> pravilen zapis z wardCode='C1'");
  trdi(neujemanja.size === 0, "brez neujemanj");
}

console.log("3) obdelajNzvVrstice na NZV-oblikovanem listu (enote + LD/IZOB/BS)");
{
  const vrsteVrstic = [
    ["Razpored SEPTEMBER 2026"],
    ["", "PDZN", "SOBO", "ŽO", "E1", "E2", "D", "MO", "B", "C", "C1", "PO", "A", "B1,B2", "DB", "SA DOP", "SA POP", "URGENCA", "U2", "DEŽURSTVO", "LD", "IZOB", "BS"],
    ["1. 9. 2026", "KAR", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "BOJ", "NOV, PET", "", ""],
  ];
  const poParafi = { KAR: { id: "karnicar-id", full_name: "Karničar Jure" }, BOJ: { id: "bojic-id", full_name: "Bojić Matej" }, NOV: { id: "novak-id", full_name: "Novak Ana" }, PET: { id: "petek-id", full_name: "Petek Iza" } };
  const { zapisi, dopusti, najdenDatum, najdenaGlava, neujemanja } = obdelajNzvVrstice(vrsteVrstic, "2026-09", poParafi, "admin-id");
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo enot");
  const pdzn = zapisi.find(z => z.employee_id === "karnicar-id" && z.department_code === "PDZN");
  trdi(!!pdzn, "PDZN / KAR -> zapis v schedule_entries");
  jseq(dopusti.length, 2, "2 vpisa odsotnosti (NOV in PET v stolpcu LD)");
  trdi(dopusti.every(d => d.kind === "ld" && d.created_by === "admin-id"), "oba LD vpisa imata kind='ld' in pravi created_by");
  trdi(neujemanja.size === 0, "brez neujemanj");
}

console.log("4) list, ki ni ne oddelek ne NZV (npr. 'KALUP' legenda), ne vrne ničesar");
{
  const vrsteVrstic = [
    ["LEGENDA"],
    ["SMS / TZN", "07:00-15:00"],
    ["LD", "letni dopust"],
    ["KPU", "koriščenje prostih ur"],
  ];
  const { zapisi, dopusti, najdenDatum } = obdelajNzvVrstice(vrsteVrstic, "2026-09", {}, "admin-id");
  jseq(zapisi.length, 0, "0 zapisov razporeda");
  jseq(dopusti.length, 0, "0 zapisov odsotnosti");
  trdi(!najdenDatum, "sploh ne najde datumskih vrstic (legenda ni razpored) - v pravi funkciji to pomeni 'preskočen list'");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
