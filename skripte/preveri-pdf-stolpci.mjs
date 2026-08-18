#!/usr/bin/env node
/* Preizkus pdfKoscjiVTabelo() (import-utils.js) - rekonstrukcije PRAVIH
 * stolpcev iz PDF-ja.
 *
 * Doslej je uvoz iz PDF-ja vrnil samo golo besedilo (vsaka vrstica en sam
 * string), zato je bil PDF v aplikaciji povsod izrecno zavrnjen z "PDF ni
 * podprt za ta uvoz (ni stolpcev)". pdf.js pa za vsak košček besedila pove
 * tudi njegovo vodoravno lego in širino - stolpce je torej mogoče najti po
 * "navpičnem belem prostoru" med njimi.
 *
 * Fixture posnema obliko URADNEGA dokumenta "Razporeditev zaposlenih v UA in
 * DEŽ" (4 stolpci: DATUM | Urgenca ZDR | Dežurstvo ZDR | Dežurstvo dipl.
 * m.s./zn.), vključno z dvema posebnostma resničnih PDF-jev:
 *   1. ime in priimek v ISTI celici sta dva ločena koščka besedila (majhen
 *      presledek) - ne smeta postati dva stolpca;
 *   2. celica z zapisom "Ime Priimek (Drugo Ime)" - oklepajni del ostane v
 *      isti celici.
 *
 * Zagon: node skripte/preveri-pdf-stolpci.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(koren, "import-utils.js"), "utf8");

// import-utils.js je IIFE, ki se pripne na window in ob nalaganju ne kliče
// ničesar brskalniškega - zadošča prazen "window" objekt.
const sandbox = { window: {}, console, FileReader: function () {}, XLSX: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { pdfKoscjiVTabelo } = sandbox.window.ImportUtils;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Pomožno: en košček besedila, kot ga vrne pdf.js (x, y, širina, besedilo).
// Širina ~ 4.5 točke na znak pri 9pt pisavi - dovolj natančno za preizkus.
function k(x, y, str) { return { x, y, sirina: str.length * 4.5, str }; }

// Stolpci se začnejo pri X = 50 / 130 / 300 / 450 - med njimi je prazen pas,
// znotraj celice pa so besede tesno skupaj.
const KOSCKI = [
  // glava
  k(50, 700, "DATUM"), k(130, 700, "Urgenca ZDR"), k(300, 700, "Dežurstvo ZDR"), k(450, 700, "Dežurstvo dipl. m.s./zn."),
  // 1. vrstica - ime in priimek sta LOČENA koščka v isti celici
  k(50, 680, "1. SO"), k(130, 680, "Žan"), k(148, 680, "Dovč"),
  k(300, 680, "Tanja"), k(325, 680, "Torkar"), k(450, 680, "Bojić"), k(475, 680, "Matej"),
  // 2. vrstica - zapis z oklepajem ostane v isti celici
  k(50, 660, "2. NE"), k(130, 660, "Ana"), k(148, 660, "Kos"), k(168, 660, "(Jana Nov)"),
  k(300, 660, "Grega"), k(330, 660, "Arnež"), k(450, 660, "Salkić"), k(478, 660, "Maruša"),
  // 3. vrstica - prazna celica v sredini (nihče ni razporejen)
  k(50, 640, "3. PO"), k(450, 640, "Trpin"), k(478, 640, "Saša"),
];

console.log("1) štirje stolpci uradnega dokumenta se pravilno ločijo");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  trdi(t.length === 4, `dobljene 4 vrstice (glava + 3 dnevi), dobil ${t.length}`);
  jseq(t[0], ["DATUM", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."], "glava: 4 ločeni stolpci");
}

console.log("2) več besed v ISTI celici ostane skupaj (ne postane več stolpcev)");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  jseq(t[1], ["1. SO", "Žan Dovč", "Tanja Torkar", "Bojić Matej"], "1. vrstica: ime+priimek združena v eno celico");
}

console.log("3) zapis z oklepajem ('Ime Priimek (Drugo)') ostane ena celica");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  jseq(t[2], ["2. NE", "Ana Kos (Jana Nov)", "Grega Arnež", "Salkić Maruša"], "2. vrstica: oklepajni del ni svoj stolpec");
}

console.log("4) prazna celica ostane prazna, ostali stolpci se NE zamaknejo");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  jseq(t[3], ["3. PO", "", "", "Trpin Saša"], "3. vrstica: manjkajoča sredina ne premakne zadnjega stolpca");
}

console.log("5) navadno besedilo (dopis, ne preglednica) da EN stolpec");
{
  // Vse na isti levi legi, druga pod drugo - ni tabele.
  const dopis = [k(70, 700, "Zadeva: Razporeditev zaposlenih"), k(70, 685, "Spoštovani,"), k(70, 670, "v prilogi pošiljamo razpored.")];
  const t = pdfKoscjiVTabelo(dopis);
  trdi(t.every(v => v.length === 1), "brez tabele -> vsaka vrstica en sam stolpec (kličoča stran ponudi ročno urejanje)");
  trdi(t.length === 3, `tri vrstice besedila, dobil ${t.length}`);
}

console.log("6) košček brez podatka o širini (nekateri PDF-ji) ne zruši razporeda v stolpce");
{
  const brezSirine = KOSCKI.map(x => ({ ...x, sirina: 0 }));
  const t = pdfKoscjiVTabelo(brezSirine);
  jseq(t[0], ["DATUM", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."], "glava se pravilno loči tudi brez širin (ocena iz dolžine besedila)");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
