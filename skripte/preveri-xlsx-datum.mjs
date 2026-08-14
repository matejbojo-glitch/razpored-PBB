#!/usr/bin/env node
/* Preizkus xlsxCelicaVBesedilo (import-utils.js) - resnična napaka, ki jo je
 * prijavil uporabnik: pri uvozu razporeda iz naložene .xlsx datoteke so
 * vpisi pristali na NAPAČNEM dnevu (za en dan zamaknjeno), na VSEH oddelkih.
 *
 * Vzrok, potrjen s to skripto na PRAVEM vendoriranem xlsx.core.min.js
 * (branje/pisanje resničnega .xlsx zapisa, ne domneva): Excel/Google Sheets
 * shranita datum kot "serijsko število" (dni od izhodišča), ki pri izvozu
 * iz Google Sheets pogosto NI točno cel dan, ampak ima drobno plavajočo
 * napako (npr. 46173.999999988 namesto točno 46174 za isti koledarski
 * dan). Knjižnica to brez zaokroževanja pretvori v čas TIK PRED polnočjo
 * PRAVEGA dne - golo odrezanje prvih 10 znakov ISO niza bi zato vrnilo za
 * en dan prestavljen datum. Popravek zaokroži na najbližji dan.
 *
 * Ta napaka je specifična za pot "Naloži datoteko" (nova v tej seji) - pot
 * "prilepi Google Sheets povezavo" (obstoječa, testirana skozi celotno
 * sejo) datuma bere kot BESEDILO iz CSV izvoza, ne kot binarno serijsko
 * številko, zato te napake nima.
 *
 * Funkcije se izvlečejo iz PRAVEGA import-utils.js, testni .xlsx zapis pa
 * se dejansko zgradi/prebere prek PRAVEGA vendoriranega xlsx.core.min.js
 * (ne simulacija) - tako preizkus ne more zaostati za kodo.
 *
 * Zagon: node skripte/preveri-xlsx-datum.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

// POMEMBNO: XLSX in izvlečene funkcije MORAJO teči v ISTEM vm kontekstu -
// vsak ločen vm.createContext() dobi svoj lasten "Date" konstruktor, zato bi
// "instanceof Date" (v xlsxCelicaVBesedilo) med dvema ločenima kontekstoma
// vedno vrnil false, čeprav je v pravem brskalniku (ena sama globalna
// realnost - window.XLSX in ostala koda v istem oknu) to nemogoče - taka
// napaka bi bila samo artefakt preizkusa, ne prave kode.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "xlsx.core.min.js"), "utf8"), sandbox);
const XLSX = sandbox.XLSX;
if (!XLSX) throw new Error("XLSX ni naložen iz xlsx.core.min.js.");

const importUtilsSrc = readFileSync(join(koren, "import-utils.js"), "utf8");
function izvleci(ime) {
  const zac = importUtilsSrc.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v import-utils.js.");
  let globina = 0, zacTelo = importUtilsSrc.indexOf("{", zac);
  for (let i = zacTelo; i < importUtilsSrc.length; i++) {
    if (importUtilsSrc[i] === "{") globina++;
    else if (importUtilsSrc[i] === "}") { globina--; if (globina === 0) return importUtilsSrc.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciVrstico(oznaka) {
  const re = new RegExp("^\\s*" + oznaka.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*$", "m");
  const m = importUtilsSrc.match(re);
  if (!m) throw new Error("Vrstice " + oznaka + " ni v import-utils.js.");
  return m[0];
}

const koda = [
  izvleciVrstico("const DAN_MS"),
  izvleciVrstico("const ISO_CAS_RX"),
  izvleci("zaokroziNaDan"),
  izvleci("xlsxCelicaVBesedilo"),
].join("\n\n");
vm.runInContext(koda, sandbox);
const { xlsxCelicaVBesedilo } = sandbox;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// Zgradi PRAVI .xlsx zapis z znano serijsko številko v A1, ga prebere nazaj
// prek PRAVEGA XLSX.read(cellDates:true) in vrne dejansko celico, ki jo je
// knjižnica vrnila (Date objekt ALI ISO niz - odvisno od različice) - enako
// kot jo v resnici vidi xlsxVVrstice/xlsxVsiListi v import-utils.js.
function preberiCeloPoSerijski(serial) {
  const ws = { "!ref": "A1:A1", A1: { t: "n", v: serial, z: "m/d/yyyy" } };
  const wb = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const wb2 = XLSX.read(buf, { type: "array", cellDates: true });
  return wb2.Sheets["Sheet1"]["A1"].v;
}

// Excel epoch (upošteva namerno napačno 1900 prestopno leto - standardna
// formula, isto kot jo uporablja Excel/Google Sheets/xlsx.js).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serijskaZaDatum(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86400000);
}

console.log("1) točna cela serijska številka (brez napake) -> pravi dan");
{
  const serial = serijskaZaDatum(2026, 6, 1);
  const celica = preberiCeloPoSerijski(serial);
  trdi(xlsxCelicaVBesedilo(celica) === "2026-06-01", `serial=${serial} -> "${xlsxCelicaVBesedilo(celica)}" (pričakovano "2026-06-01")`);
}

console.log("2) RESNIČNA napaka - drobna plavajoča napaka POD celo številko (Google Sheets izvoz)");
{
  const tocna = serijskaZaDatum(2026, 6, 1);
  const zEpsilonom = tocna - 0.000000012; // ista velikost napake kot v resničnem izvozu
  const celica = preberiCeloPoSerijski(zEpsilonom);
  const rezultat = xlsxCelicaVBesedilo(celica);
  trdi(rezultat === "2026-06-01", `serial=${zEpsilonom} (skoraj cel, tik pod mejo) -> "${rezultat}" MORA ostati "2026-06-01", NE "2026-05-31" - to je bila prava napaka uporabnika`);
}

console.log("3) drobna plavajoča napaka NAD celo številko");
{
  const tocna = serijskaZaDatum(2026, 8, 15);
  const zEpsilonom = tocna + 0.000000012;
  const celica = preberiCeloPoSerijski(zEpsilonom);
  const rezultat = xlsxCelicaVBesedilo(celica);
  trdi(rezultat === "2026-08-15", `serial=${zEpsilonom} -> "${rezultat}" (pričakovano "2026-08-15")`);
}

console.log("4) več datumov čez cel avgust 2026 (vsi z isto velikostjo napake, kot pri uporabniku)");
{
  let vseOK = true;
  for (let dan = 1; dan <= 31; dan++) {
    const tocna = serijskaZaDatum(2026, 8, dan);
    const celica = preberiCeloPoSerijski(tocna - 0.000000012);
    const pricakovano = `2026-08-${String(dan).padStart(2, "0")}`;
    if (xlsxCelicaVBesedilo(celica) !== pricakovano) { vseOK = false; break; }
  }
  trdi(vseOK, "vseh 31 dni avgusta 2026 se pravilno prebere (isti vzorec napake kot v resničnem izvozu 'Po oddelkih')");
}

console.log("5) besedilna celica (ni datumska) ostane nedotaknjena");
{
  trdi(xlsxCelicaVBesedilo("NOČNA od 19") === "NOČNA od 19", "navadno besedilo (koda izmene) se ne spremeni");
  trdi(xlsxCelicaVBesedilo("DOLAR T.") === "DOLAR T.", "ime osebe se ne spremeni");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
