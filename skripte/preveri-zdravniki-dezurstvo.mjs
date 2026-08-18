#!/usr/bin/env node
/* Preizkus obdelajZdravnikiVrstice() (index.html) - uvoz uradnega mesečnega
 * dokumenta "Razporeditev zaposlenih v UA in DEŽ" (dežurni zdravniki -
 * ločeno od negovalnega 14-osebnega kroga, ki ga aplikacija že pozna).
 *
 * Fixture posnema TOČNO obliko, ki jo na tem dokumentu vrne
 * pdfKoscjiVTabelo (glej preveri-pdf-stolpci.mjs in import-utils.js) -
 * potrjeno na PRAVI datoteki uporabnika (dry-run, izven repozitorija):
 *   - stolpec 0: datum + dnevna kratica + ime "Urgenca ZDR" POGOSTO v ENI
 *     celici (datum in ime sta si v izvirniku PDF blizu), na vikendih je
 *     "Urgenca ZDR" prazna (samo datum + dnevna kratica);
 *   - stolpec 1: "Dežurstvo ZDR" - občasno v obliki "Ime Priimek (Drugo
 *     Ime Priimek)", kar pomeni ZAMENJAVO (uporabnik potrdil: prva oseba
 *     dejansko dela, druga v oklepaju je bila prvotno razporejena);
 *   - stolpec 2: "Dežurstvo dipl. m.s./zn." - isti 14-osebni krog, ki ga
 *     NZV uvoz že pozna (obdelajNzvVrstice) - ta funkcija ga namenoma
 *     PRESKOČI (ne podvoji zapisa).
 *   - na dnu dokumenta je podpisni/opombni blok, ki lahko naključno
 *     vsebuje niz, videti kot datum (npr. "Velja od: 1. 9. 2026") - ne
 *     sme se pomotoma uvoziti/prepisati čez pravi 1. dan v mesecu.
 *
 * Zagon: node skripte/preveri-zdravniki-dezurstvo.mjs
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
  izvleci("monthRange"),
  izvleciVrstico("const ZDR_DATUM_RX"),
  izvleciVrstico("const ZDR_DAN_RX"),
  izvleci("obdelajZdravnikiVrstice"),
].join("\n\n");

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(koda, sandbox);
const { obdelajZdravnikiVrstice } = sandbox;

// Vrsteh vrstic po pdfKoscjiVTabelo za avgust/september - datum+dan+ime
// "Urgenca ZDR" pogosto ena celica, vikend brez urgence, ena vrstica z
// zamenjavo v Dežurstvo ZDR, tretji stolpec (dipl. m.s./zn.) namenoma
// vsebuje podatek, ki NE sme priti v izpis.
const VRSTICE = [
  ["Zadeva: Razporeditev zaposlenih v urgentno ambulanto in neprekinjeno zdravstveno varstvo"], // naslov, ne podatkovna vrstica
  ["1. 9. 2026 TO Vanja Hreščak", "Tjaša Petrič (Vlade Milanović)", "Denis Džamastagić"],
  ["2. 9. 2026 SR Maja Stanković", "Dr. Lea Žmuc Veranič", "Maruša Salkić"],
  ["5. 9. 2026 SO", "Maja Stanković", "Magdalena Mavri Tratnik"], // vikend - "Urgenca ZDR" prazna
  ["30. 9. 2026 SR Luka Vučkič", "Tanja Cebin Skale", "Denis Džamastagić"],
  ["Velja od: Pripravila:", "Skrbnik Pregledal:", "Odobril:"], // podpisni blok, ni podatkovna vrstica
  ["1. 9. 2026 Vlade Milanović", "dokumenta: Strokovna direktorica", "Dr. Lea Žmuc Veranič"], // naključno "videti kot datum", a je ZA zadnjim pravim dnem
];

console.log("1) datum+dan+ime 'Urgenca ZDR' iz ENE celice se pravilno razdeli");
{
  const { zapisi, najdenDatum } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  trdi(najdenDatum, "najde vrstice za september");
  const u1 = zapisi.find(z => z.work_date === "2026-09-01" && z.kind === "urgenca");
  jseq(u1, { work_date: "2026-09-01", kind: "urgenca", full_name: "Vanja Hreščak" }, "1.9. Urgenca ZDR -> 'Vanja Hreščak' (brez dnevne kratice 'TO')");
}

console.log("2) zapis 'Ime (Drugo Ime)' v Dežurstvo ZDR -> uporabi SAMO prvo ime (zamenjava)");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  const d1 = zapisi.find(z => z.work_date === "2026-09-01" && z.kind === "dezurstvo");
  jseq(d1, { work_date: "2026-09-01", kind: "dezurstvo", full_name: "Tjaša Petrič" }, "1.9. Dežurstvo ZDR -> 'Tjaša Petrič' (brez '(Vlade Milanović)')");
}

console.log("3) vikend brez 'Urgenca ZDR' ne ustvari praznega/napačnega zapisa");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  const u5 = zapisi.find(z => z.work_date === "2026-09-05" && z.kind === "urgenca");
  trdi(!u5, "5.9. (SO) brez zapisa 'urgenca' (stolpec je v izvirniku prazen)");
  const d5 = zapisi.find(z => z.work_date === "2026-09-05" && z.kind === "dezurstvo");
  jseq(d5, { work_date: "2026-09-05", kind: "dezurstvo", full_name: "Maja Stanković" }, "5.9. Dežurstvo ZDR se kljub temu prebere pravilno");
}

console.log("4) 'Dežurstvo dipl. m.s./zn.' (3. stolpec, že pokrit prek NZV uvoza) se NE podvoji");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  trdi(!zapisi.some(z => z.full_name.includes("Denis Džamastagić")), "'Denis Džamastagić' (3. stolpec) se ne pojavi v zapisih");
}

console.log("5) podpisni blok na dnu, ki naključno vsebuje niz videti kot datum, se NE uvozi čez zadnji pravi dan");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  const zadnji30 = zapisi.filter(z => z.work_date === "2026-09-30");
  jseq(zadnji30, [
    { work_date: "2026-09-30", kind: "urgenca", full_name: "Luka Vučkič" },
    { work_date: "2026-09-30", kind: "dezurstvo", full_name: "Tanja Cebin Skale" },
  ], "30.9. ostane pravi zapis - 'Velja od: 1. 9. 2026' (nazaj na 1.) se prezre, ne prepiše čez 30.9.");
  trdi(!zapisi.some(z => z.full_name === "Vlade Milanović" && z.kind === "urgenca" && z.work_date === "2026-09-01"),
    "napačen 'nazaj-grede' zapis (iz podpisnega bloka) ni prepisal pravega 1.9.");
}

console.log("6) naslovna vrstica (brez datuma) se tiho prezre, ne javi napake");
{
  const { najdenDatum } = obdelajZdravnikiVrstice([VRSTICE[0]], "2026-09");
  trdi(!najdenDatum, "sama naslovna vrstica (brez pravega datuma) -> najdenDatum=false, uvoz to javi kot jasno napako");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
