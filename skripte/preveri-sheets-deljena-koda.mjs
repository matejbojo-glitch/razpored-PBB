#!/usr/bin/env node
/* src/shared/sheets-koordinate.js se ne sme razhajati z izvirniki.
 *
 * Zakaj datoteka sploh obstaja: obe Edge Functions za sinhronizacijo
 * (sheets-izhod, sheets-vhod) tečeta v Denu in ne moreta uvoziti
 * imena.js, parafa.js, izmene.js, import-utils.js ne kode iz index.html -
 * to so klasične skripte (window.X = ...), brez izvozov. Kopija je zato
 * nujna, razhajanje med njo in izvirnikom pa nevarno: Edge Function bi
 * pisala v DRUGO celico kot uvoz, ki jo bere človek. Isti razlog in isti
 * vzorec kot preveri-delovni-cas.mjs.
 *
 * Kar se tu preverja, ni "izgleda enako", ampak "daje enak odgovor":
 * tabele se primerjajo vrstico za vrstico, funkcije pa na istem naboru
 * primerov, vključno s koordinatami na fixture-ju v obliki pravega
 * dokumenta "2026 SMS RAZPORED".
 *
 * Zagon: node skripte/preveri-sheets-deljena-koda.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- izvirniki v peskovniku (brskalniške skripte) ----------------------
const okno = { console };
okno.window = okno;
vm.createContext(okno);
["imena.js", "parafa.js", "izmene.js", "import-utils.js"].forEach((d) => {
  vm.runInContext(readFileSync(join(koren, d), "utf8"), okno);
});
const { Imena, Parafa, Izmene, ImportUtils } = okno;

// --- kopija, ki jo uporabljata Edge Functions -------------------------
const K = await import(join(koren, "src/shared/sheets-koordinate.js"));

console.log("1) kopija v supabase/functions/_shared/ je bajt za bajt enaka");
{
  const a = readFileSync(join(koren, "src/shared/sheets-koordinate.js"), "utf8");
  const b = readFileSync(join(koren, "supabase/functions/_shared/sheets-koordinate.js"), "utf8");
  trdi(a === b, "src/shared/sheets-koordinate.js == supabase/functions/_shared/sheets-koordinate.js"
    + (a === b ? "" : " – popravi z:  cp src/shared/sheets-koordinate.js supabase/functions/_shared/"));
}

console.log("2) šifrant izmen je isti kot v izmene.js");
{
  const izvirnik = Izmene.KRATICE.map((v) => [v[0].source, v[1]]);
  const kopija = K.KRATICE.map((v) => [v[0].source, v[1]]);
  jseq(kopija, izvirnik, "vzorci in kratice, v istem vrstnem redu");
}

console.log("3) tabele popravkov imen so iste");
{
  jseq(K.PSEVDONIM, Imena.PSEVDONIM, "PSEVDONIM (imena.js)");
  jseq(K.KRATKO_PSEVDONIM, Parafa.KRATKO_PSEVDONIM, "KRATKO_PSEVDONIM (parafa.js)");
}

console.log("4) kratica izmene: isti odgovor kot Izmene.vnos()");
{
  // Nabor: vsak uradni zapis iz izmene.js (moznosti() jih izpelje iz
  // šifranta, torej nova koda pride v nabor sama) + zapisi, kot jih res
  // piše dokument "2026 SMS RAZPORED", + robni primeri.
  const nabor = Izmene.moznosti().map((m) => m.zapis).concat([
    "dopoldan", "popoldan", "popoldan do 19", "popoldan do 20", "NOČNA", "NOČNA od 19",
    "DNEVNA12", "DNEVNA12 (7-19)", "Nočna 12", "KPU", "LD", "BS", "STI", "POR", "KRO",
    "Dežurstvo", "dop. 6h", "dopoldan (6h)", "pop. 4 ure", "PRISOTEN",
    "popoldan ", " LD ", "prosto", "prost", "", null, undefined, "nekaj čisto tretjega",
  ]);
  const razhajanja = nabor.filter((z) => {
    const v = Izmene.vnos(z);
    return K.kratica(z) !== (v ? v[1] : null);
  });
  jseq(razhajanja, [], `kratica() se ujema na vseh ${nabor.length} primerih`);
}

console.log("5) ključ kratkega imena: isti odgovor kot Parafa.kratkoKljuc()");
{
  const nabor = [
    "DŽINIĆ A.", "BEČIROVIĆ N.", "Bećirović Nelvedin", "VALJAVEC A.", "VALJAVEC E.",
    "MAVRI TRATNIK M.", "Mavri Tratnik Magdalena", "HORVAT N.", "HROVAT N.",
    "TOMAŽEVIĆ T.", "dr. Tanja Torkar", ") Saša Trpin", "ROZMAN A.", "ROZMAN K.",
    "STARC E.", "", "   ", "ENOBESEDNO",
  ];
  const razhajanja = nabor.filter((n) => K.kratkoKljuc(n) !== Parafa.kratkoKljuc(n));
  jseq(razhajanja, [], `kratkoKljuc() se ujema na vseh ${nabor.length} primerih`);
  const razhajanjaPolna = nabor.filter((n) => K.kratkiKljuc(n) !== Imena.kratkiKljuc(n));
  jseq(razhajanjaPolna, [], "kratkiKljuc() se ujema z imena.js");
}

console.log("6) datum in zamik stolpcev: isti odgovor kot import-utils.js");
{
  const datumi = ["2026-06-01", "1. 6. 2026", "01.06.2026", "1/6/2026", "JUNIJ", "", null, "2026-06-01T00:00:00Z"];
  const razhajanja = datumi.filter((d) => K.normalizirajDatum(d) !== ImportUtils.normalizirajDatum(d));
  jseq(razhajanja, [], "normalizirajDatum()");
}

// --- fixture v obliki pravega dokumenta -------------------------------
function vrstica(datum, dan, sifre) { return [datum, dan, ...sifre]; }
const JUNIJ_IMENA = ["DŽINIĆ A.", "STARC E.", "KARNIČAR J.", "ZEKAN A."];
const JULIJ_IMENA = ["DŽINIĆ A.", "KARNIČAR J.", "ZEKAN A.", "DJEDOVIĆ M."];
const VRSTICE = [
  ["C1 odd", "", ...JUNIJ_IMENA],
  ["", "", "SMS / TZN", "SMS / TZN", "SMS / TZN", "SMS / TZN"],
  ["JUNIJ", ""],
  vrstica("1. 6. 2026", "PO", ["LD", "NOČNA", "popoldan", "LD"]),
  vrstica("2. 6. 2026", "TO", ["LD", "NOČNA", "popoldan", "LD"]),
  [],
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
// Zavihek "B" pravega dokumenta se začne v C2 - Sheets API vrne vodilne
// prazne celice. Zamik MORA biti izmerjen, ne privzet.
const ZAMAKNJENE = VRSTICE.map((v) => (v.length ? ["", "", ...v] : v));

{
  const razhajanja = [VRSTICE, ZAMAKNJENE].filter(
    (vv) => K.najdiZamikStolpcev(vv) !== ImportUtils.najdiZamikStolpcev(vv));
  jseq(razhajanja.length, 0, "najdiZamikStolpcev() na fixture-ju (0 in 2)");
  jseq([K.najdiZamikStolpcev(VRSTICE), K.najdiZamikStolpcev(ZAMAKNJENE)], [0, 2], "izmerjena zamika");
}

console.log("7) koordinate: iste celice kot pripraviPosodobitveOddelka() iz index.html");
{
  // Funkcije se izvlečejo iz PRAVEGA index.html, ne prepišejo sem.
  const html = readFileSync(join(koren, "index.html"), "utf8");
  function izvleci(ime) {
    const zac = html.indexOf("function " + ime + "(");
    if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
    let globina = 0;
    for (let i = html.indexOf("{", zac); i < html.length; i++) {
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
  const peskovnik = { window: okno, console };
  vm.createContext(peskovnik);
  vm.runInContext([
    izvleciVrstico("const ISO_DATUM_RX"),
    izvleciVrstico("const VLOGA_RX"),
    readFileSync(join(koren, "datum.js"), "utf8"),
    "var monthRange = window.Datum.obseg;",
    izvleci("najdiVrsticoImen"),
    izvleci("vrsticaJePrazna"),
    izvleci("obdelajBlok"),
    izvleci("pripraviPosodobitveOddelka"),
  ].join("\n\n"), peskovnik);

  const zaposleni = [
    { id: "dzinic", full_name: "Džinić Amin" },
    { id: "starc", full_name: "Starc Erik" },
    { id: "karnicar", full_name: "Karničar Jure" },
    { id: "zekan", full_name: "Zekan Almedin" },
    { id: "djedovic", full_name: "Djedović Mark" },
  ];
  [["2026-06", "junij"], ["2026-07", "julij"]].forEach(([mesec, ime]) => {
    [[VRSTICE, "brez zamika"], [ZAMAKNJENE, "z zamikom 2"]].forEach(([vv, opis]) => {
      const iz = peskovnik.pripraviPosodobitveOddelka(vv, mesec, zaposleni, {})
        .posodobitve.map((p) => p.vrstica + ":" + p.stolpec).sort();
      const { startISO, endISO } = okno.window.Datum.obseg(mesec);
      const kop = K.koordinateOddelka(vv, startISO, endISO)
        .celice.map((c) => c.vrstica + ":" + c.stolpec).sort();
      jseq(kop, iz, `${ime}, ${opis}: iste (vrstica, stolpec)`);
    });
  });

  // Osebo, ki je index.html ne pozna (ni med zaposlenimi), kopija vseeno
  // vrne - z njenim ključem. To je NAMERNO: usmerjanje po osebah je stvar
  // Edge Function, ki neznano ime zapiše v sync_errors, ne tiho izpusti.
  const { startISO, endISO } = okno.window.Datum.obseg("2026-06");
  const celice = K.koordinateOddelka(VRSTICE, startISO, endISO).celice;
  trdi(celice.some((c) => c.kljuc === Parafa.kratkoKljuc("ZEKAN A.")),
    "koordinateOddelka vrne tudi osebo, ki je aplikacija (še) ne pozna");
  trdi(celice.every((c) => c.vrstica !== 8 && c.vrstica !== 10),
    "podpisni blok ni med celicami");
  const dzinic1junij = celice.find((c) => c.vrstica === 3 && c.stolpec === 2);
  jseq(dzinic1junij && [dzinic1junij.datum, dzinic1junij.vrednost], ["2026-06-01", "LD"],
    "DŽINIĆ A. / 1. 6. -> vrstica 3, stolpec 2, vrednost iz lista");
}

console.log("8) primerjava vrednosti prenese razliko v zapisu (zaščita pred zanko)");
{
  trdi(K.istaIzmena("popoldan do 19", "Popoldne do 19"), "»popoldan do 19« = »Popoldne do 19«");
  trdi(K.istaIzmena("popoldan ", "popoldan"), "odvečen presledek ne šteje kot sprememba");
  trdi(K.istaIzmena("", "prosto"), "prazna celica = »prosto«");
  trdi(!K.istaIzmena("dopoldan", "popoldan"), "različni izmeni sta različni");
  trdi(!K.istaIzmena("", "dopoldan"), "prazno proti izmeni je sprememba");
  trdi(K.istaIzmena("XYZ", "XYZ"), "dve enaki neznani kodi sta enaki");
  trdi(!K.istaIzmena("XYZ", "ABC"), "dve različni neznani kodi nista enaki");
}

console.log("9) naslavljanje celic: samo A1 obseg, brez ustvarjanja česarkoli");
{
  jseq([K.stolpecVCrko(0), K.stolpecVCrko(2), K.stolpecVCrko(25), K.stolpecVCrko(26), K.stolpecVCrko(51)],
       ["A", "C", "Z", "AA", "AZ"], "stolpecVCrko()");
  jseq(K.obsegCelice("B", 1, 2), "'B'!C2", "obsegCelice() za zavihek B, vrstica 2, stolpec C");
  jseq(K.obsegCelice("Odd 'B'", 0, 0), "'Odd ''B'''!A1", "narekovaj v imenu zavihka se podvoji");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("Vse v redu.");
