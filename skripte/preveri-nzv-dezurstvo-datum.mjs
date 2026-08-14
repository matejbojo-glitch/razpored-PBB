#!/usr/bin/env node
/* Preizkus celotne poti NZV uvoza iz PRAVE .xlsx datoteke, "od konca do
 * konca": realen datumski zapis z znano plavajočo napako (glej
 * preveri-xlsx-datum.mjs) -> xlsxVsiListi/xlsxCelicaVBesedilo
 * (import-utils.js) -> obdelajNzvVrstice (index.html) -> zapis za
 * schedule_entries.
 *
 * Uporabnik je izrecno prosil, naj preverim NATANČNO, da (a) je popravek
 * datuma (preveri-xlsx-datum.mjs) veljaven tudi za NZV uvoz (ne samo za
 * oddelčnega), in (b) da dežurstvo, uvoženo prek NZV, konča na PRAVEM dnevu
 * v zapisu, ki ga "Moj razpored" prikaže (poizvedba tam je samo po
 * employee_id + work_date, brez omejitve na department_code - zato
 * department_code="DEZ" ne prepreči prikaza, glej index.html MyScheduleView).
 *
 * Ta preizkus je edini, ki dejansko VERIŽI obe že ločeno testirani stvari
 * (datumsko zaokroževanje IN NZV razčlenjevanje) skozi PRAVO XLSX knjižnico
 * - lovi napake, ki bi jih vsak preizkus posebej lahko zgrešil.
 *
 * Zagon: node skripte/preveri-nzv-dezurstvo-datum.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

// EN sam vm kontekst za VSE (XLSX + izvlečene funkcije iz obeh datotek) -
// ločeni konteksti bi imeli vsak svoj "Date" konstruktor, kar bi
// "instanceof Date" v xlsxCelicaVBesedilo tiho pokvarilo (glej isto opombo
// v preveri-xlsx-datum.mjs - to NI mogoče v pravem brskalniku, kjer je
// window.XLSX in ostala koda v isti globalni realnosti).
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "xlsx.core.min.js"), "utf8"), sandbox);
if (!sandbox.XLSX) throw new Error("XLSX ni naložen iz xlsx.core.min.js.");

const importUtilsSrc = readFileSync(join(koren, "import-utils.js"), "utf8");
const htmlSrc = readFileSync(join(koren, "index.html"), "utf8");

function izvleciFn(src, ime) {
  const zac = src.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni.");
  let globina = 0, zacTelo = src.indexOf("{", zac);
  for (let i = zacTelo; i < src.length; i++) {
    if (src[i] === "{") globina++;
    else if (src[i] === "}") { globina--; if (globina === 0) return src.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciVrstico(src, oznaka) {
  const re = new RegExp("^\\s*" + oznaka.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*$", "m");
  const m = src.match(re);
  if (!m) throw new Error("Vrstice " + oznaka + " ni.");
  return m[0];
}
function izvleciConst(src, ime) {
  const zac = src.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni.");
  const konec = src.indexOf(";\n", zac);
  return src.slice(zac, konec + 1);
}
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

// Iz import-utils.js: samo datumsko-zaokrožitvena jedra (ista imena kot v
// preveri-xlsx-datum.mjs), da lahko ročno sestavimo "vrsteVrstic" iz
// resničnih XLSX celic - preberiVseListe sam po sebi uporablja
// FileReader/File, ki ju v Node ni brez dodatnega polyfilla.
const importUtilsKoda = [
  izvleciVrstico(importUtilsSrc, "const DAN_MS"),
  izvleciVrstico(importUtilsSrc, "const ISO_CAS_RX"),
  izvleciFn(importUtilsSrc, "zaokroziNaDan"),
  izvleciFn(importUtilsSrc, "xlsxCelicaVBesedilo"),
].join("\n\n");
vm.runInContext(importUtilsKoda, sandbox);

const indexKoda = [
  izvleciVrstico(htmlSrc, "const ISO_DATUM_RX"),
  izvleciFn(htmlSrc, "monthRange"),
  constVKotVar(izvleciConst(htmlSrc, "NZV_ENOTE")),
  izvleciFn(htmlSrc, "nzvNazivVKodo"),
  izvleciFn(htmlSrc, "poisciEnoteNzv"),
  izvleciFn(htmlSrc, "vrsticaJePrazna"),
  izvleciFn(htmlSrc, "obdelajBlok"),
  constVKotVar(izvleciConst(htmlSrc, "NZV_ODSOTNOST_KIND")),
  izvleciFn(htmlSrc, "obdelajNzvVrstice"),
].join("\n\n");
// ImportUtils.normalizirajDatum: v pravi aplikaciji je to LOČENA funkcija v
// import-utils.js (ne xlsxCelicaVBesedilo) - obdelajNzvVrstice jo kliče na
// VSAKI celici (tudi tistih, ki jih je xlsxCelicaVBesedilo že spremenila v
// "YYYY-MM-DD"), zato jo tu ponovimo enako kot v preveri-nzv-sheets.mjs.
sandbox.window = {
  ImportUtils: {
    normalizirajDatum: function (s) {
      const t = (s || "").toString().trim();
      if (!t) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
      const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
      if (m) { const [, d, mo, y] = m; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
      return t;
    },
  },
};
vm.runInContext(indexKoda, sandbox);
const { xlsxCelicaVBesedilo, obdelajNzvVrstice } = sandbox;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Zgradi PRAVO .xlsx celico z znano "pokvarjeno" serijsko številko (ista
// velikost napake kot pri resničnem izvozu iz Google Sheets, glej
// preveri-xlsx-datum.mjs) in jo takoj pretvori v besedilo prek
// xlsxCelicaVBesedilo - natanko to zaporedje kot v pravi xlsxVsiListi.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serijskaZaDatum(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86400000); }
function datumskoBesediloIzXlsx(y, m, d, epsilon) {
  const serial = serijskaZaDatum(y, m, d) + (epsilon || 0);
  const ws = { "!ref": "A1:A1", A1: { t: "n", v: serial, z: "m/d/yyyy" } };
  const wb = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const buf = sandbox.XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const wb2 = sandbox.XLSX.read(buf, { type: "array", cellDates: true });
  return xlsxCelicaVBesedilo(wb2.Sheets["Sheet1"]["A1"].v);
}

console.log("1) datumsko besedilo iz PRAVE .xlsx celice, z resnično velikostjo napake Google Sheets izvoza");
{
  const datum1sept = datumskoBesediloIzXlsx(2026, 9, 1, -0.000000012);
  jseq(datum1sept, "2026-09-01", "1. 9. 2026 s plavajočo napako -> pravilno prebran datum (ne 31. 8.)");
}

console.log("2) cela NZV vrstica (Dežurstvo stolpec) iz PRAVIH .xlsx datumskih celic -> pravi zapis za schedule_entries");
{
  const GLAVA = ["PDZN", "SOBO", "ŽO", "E1", "E2", "D", "MO", "B", "C", "C1", "PO", "A", "B1,B2", "DB", "SA DOP", "SA POP", "URGENCA", "U2", "DEŽURSTVO", "LD", "IZOB", "BS"];
  function prazneVrednosti() { return GLAVA.map(() => ""); }
  const vrstica1 = prazneVrednosti(); vrstica1[GLAVA.indexOf("DEŽURSTVO")] = "BOJ";
  const vrstica2 = prazneVrednosti(); vrstica2[GLAVA.indexOf("DEŽURSTVO")] = "SAL"; vrstica2[GLAVA.indexOf("LD")] = "NOV";

  // Datumski stolpec (A) PRIDE iz prave XLSX celice z napako - enako kot bi
  // ga xlsxVsiListi v resnici prebral iz naloženega delovnega zvezka.
  const vrsteVrstic = [
    ["Razpored SEPTEMBER 2026", ...GLAVA.slice(1).map(() => "")],
    ["", ...GLAVA],
    [datumskoBesediloIzXlsx(2026, 9, 1, -0.000000012), ...vrstica1],
    [datumskoBesediloIzXlsx(2026, 9, 2, 0.000000012), ...vrstica2],
  ];

  const poParafi = {
    BOJ: { id: "bojic-id", full_name: "Bojić Matej" },
    SAL: { id: "salkic-id", full_name: "Salkić Maruša" },
    NOV: { id: "novak-id", full_name: "Novak Ana" },
  };
  const { zapisi, dopusti, najdenDatum, najdenaGlava, neujemanja } = obdelajNzvVrstice(vrsteVrstic, "2026-09", poParafi, "admin-id");

  trdi(najdenDatum && najdenaGlava, "najde datume in glavo enot");
  trdi(neujemanja.size === 0, "brez neujemanj parafe");

  const dez1 = zapisi.find(z => z.employee_id === "bojic-id");
  jseq(dez1, { employee_id: "bojic-id", department_code: "DEZ", work_date: "2026-09-01", shift_code: "DEŽURSTVO" },
    "BOJ (1.9.) -> pravi zapis: employee_id, department_code='DEZ', work_date='2026-09-01' (NE '2026-08-31'), shift_code='DEŽURSTVO'");

  const dez2 = zapisi.find(z => z.employee_id === "salkic-id");
  jseq(dez2, { employee_id: "salkic-id", department_code: "DEZ", work_date: "2026-09-02", shift_code: "DEŽURSTVO" },
    "SAL (2.9.) -> pravi zapis za pravi dan");

  // KLJUČNO za "Moj razpored": zapis NE VSEBUJE nobenega polja, ki bi
  // izmenjavo omejilo na oddelek - MyScheduleView v index.html bere
  // schedule_entries SAMO prek .eq("employee_id", userId), brez
  // .eq("department_code", ...), zato department_code="DEZ" ne prepreči
  // prikaza v "Moj razpored" (potrjeno z branjem kode, glej opombo zgoraj).
  trdi("employee_id" in dez1 && "work_date" in dez1 && "shift_code" in dez1,
    "zapis ima natanko polja, ki jih MyScheduleView poizveduje (employee_id, work_date) + shift_code za prikaz");

  const ld = dopusti.find(d => d.full_name === "Novak Ana");
  jseq(ld, { full_name: "Novak Ana", work_date: "2026-09-02", kind: "ld", created_by: "admin-id" },
    "NOV (LD, 2.9.) -> pravi vpis odsotnosti za pravi dan (isti popravek datuma velja tudi za LD/IZOB/BS stolpce)");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
