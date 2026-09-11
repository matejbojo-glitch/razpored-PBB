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
["imena.js", "parafa.js", "izmene.js", "import-utils.js", "nzv-zasedba.js"].forEach((d) => {
  vm.runInContext(readFileSync(join(koren, d), "utf8"), okno);
});
const { Imena, Parafa, Izmene, ImportUtils, NzvZasedba } = okno;

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
  // Peti stolpec v izmene.js je barva; v kopiji je tretji (vmesnih podatkov
  // - naziv, delovni cas - kopija ne potrebuje). Primerja se oboje, kar
  // kopija nosi, in v istem vrstnem redu: prvo ujemanje obvelja.
  const izvirnik = Izmene.KRATICE.map((v) => [v[0].source, v[1], v[4]]);
  const kopija = K.KRATICE.map((v) => [v[0].source, v[1], v[2]]);
  jseq(kopija, izvirnik, "vzorci, kratice IN barve, v istem vrstnem redu");
  jseq(K.BARVA_PROSTO, Izmene.STANJE_BARVA.prosto.barva, "barva prostega dne");
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

console.log("7b) FLEXI: isti zapisi kot obdelajFlexiVrstice() iz index.html");
{
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
  const pesk = { window: okno, console };
  vm.createContext(pesk);
  vm.runInContext([
    izvleciVrstico("const ISO_DATUM_RX"),
    izvleciVrstico("const VLOGA_RX"),
    izvleciVrstico("const IME_S_PIKO_RX"),
    readFileSync(join(koren, "datum.js"), "utf8"),
    "var monthRange = window.Datum.obseg;",
    izvleci("vrsticaJePrazna"),
    izvleci("obdelajBlok"),
    izvleci("najdiVrsticoImenFlexi"),
    izvleci("obdelajFlexiVrstice"),
  ].join("\n\n"), pesk);

  // Oblika po pravem zavihku FLEXI: par stolpcev (oddelek + izmena) na
  // osebo, ime v glavi nad DESNIM stolpcem para, stolpec "DODATNO ..." kot
  // povzetek, in ponovljeno ime (blok stolpcev se v pravi datoteki enkrat
  // ponovi z drugačnimi vrednostmi).
  const V = [
    ["FLEXI", "", "", "ALUKIĆ D.", "", "KOVAČ A.", "", "DODATNO C/E2 7-19", "", "ALUKIĆ D."],
    ["1. 6. 2026", "PO", "C", "dopoldan", "E2", "popoldan", "", "Novak", "D", "NOČNA"],
    ["2. 6. 2026", "TO", "D", "NOČNA", "C1", "LD", "", "", "C", "dopoldan"],
  ];
  const ZAM = V.map((v) => (v.length ? ["", ...v] : v));

  const poKratkem = {};
  poKratkem[Parafa.kratkoKljuc("ALUKIĆ D.")] = "alukic";
  poKratkem[Parafa.kratkoKljuc("KOVAČ A.")] = "kovac";

  [[V, "brez zamika"], [ZAM, "z zamikom 1"]].forEach(([vv, opis]) => {
    const iz = pesk.obdelajFlexiVrstice(vv, "2026-06", poKratkem).zapisi
      .map((z) => [z.employee_id, z.work_date, z.shift_code, z.pokriva_oddelek].join("|")).sort();
    const kop = K.koordinateFlexi(vv, "2026-06-01", "2026-06-30").celice
      .filter((c) => poKratkem[c.kljuc] && c.oddelek)
      .map((c) => [poKratkem[c.kljuc], c.datum, c.vrednost === "Prosto" ? "" : c.vrednost, c.oddelek].join("|")).sort();
    jseq(kop, iz, `FLEXI, ${opis}: isti zapisi (oseba, dan, izmena, pokriti oddelek)`);
  });

  // Zamik stolpcev je pri FLEXI kritičen: izmena in oddelek sta SOSEDNJA
  // stolpca, zato zamik za ena pomeni, da se za izmeno prebere oznaka
  // oddelka, za oddelek pa kratica dneva. Prav to je bilo v index.html
  // narobe do septembra 2026.
  const brez = K.koordinateFlexi(V, "2026-06-01", "2026-06-30").celice;
  const zam = K.koordinateFlexi(ZAM, "2026-06-01", "2026-06-30").celice;
  jseq(zam.map((c) => c.stolpec - 1), brez.map((c) => c.stolpec), "zamik premakne stolpce, ne vsebine");
  jseq(zam.map((c) => c.vrednost + "/" + c.oddelek), brez.map((c) => c.vrednost + "/" + c.oddelek),
    "izmena in pokriti oddelek ostaneta ista");
  trdi(brez.every((c) => c.stolpecOddelka === c.stolpec - 1), "oddelek je vedno stolpec levo od izmene");
  trdi(!brez.some((c) => /DODATNO/i.test(c.ime)), "stolpec »DODATNO ...« ni oseba in se izpusti");
  const alukic = brez.filter((c) => c.kljuc === Parafa.kratkoKljuc("ALUKIĆ D.") && c.datum === "2026-06-01");
  jseq(alukic.length, 1, "ponovljeno ime v isti glavi se upošteva samo enkrat (prva pojavitev)");
  jseq(alukic[0] && alukic[0].vrednost, "dopoldan", "in to LEVA pojavitev");
}

console.log("7c) NZV: tabele in zapisi so isti kot v nzv-zasedba.js / index.html");
{
  jseq(K.NZV_ENOTE, NzvZasedba.ENOTE, "seznam enot");
  jseq(K.NZV_STOLPCI, NzvZasedba.STOLPCI, "vrstni red stolpcev (SA DOP/SA POP med DB in URGENCA)");
  trdi(K.nzvZapisZaStolpec("B").shift_code === NzvZasedba.IZMENA_PRISOTEN,
    "navadna enota se zapiše kot " + NzvZasedba.IZMENA_PRISOTEN);
  jseq(K.nzvZapisZaStolpec("SADOP"), { department_code: "SA", shift_code: "Dopoldne" }, "SA DOP");
  jseq(K.nzvZapisZaStolpec("SAPOP"), { department_code: "SA", shift_code: "Popoldne" }, "SA POP");
  jseq(K.nzvZapisZaStolpec("DEZ"), { department_code: "DEZ", shift_code: "DEŽURSTVO" }, "dežurstvo");

  // Združevanje: ista oseba na več enotah istega dne mora pristati v ENEM
  // zapisu, dežurstvo pa ne sme prevzeti enote.
  const primeri = [
    [{ employee_id: "a", work_date: "2026-09-01", department_code: "B", shift_code: "PRISOTEN", stolpec: "B" },
     { employee_id: "a", work_date: "2026-09-01", department_code: "C", shift_code: "PRISOTEN", stolpec: "C" }],
    [{ employee_id: "b", work_date: "2026-09-01", department_code: "DEZ", shift_code: "DEŽURSTVO" },
     { employee_id: "b", work_date: "2026-09-01", department_code: "SA", shift_code: "Popoldne", stolpec: "SAPOP" }],
    [{ employee_id: "c", work_date: "2026-09-01", department_code: "DEZ", shift_code: "DEŽURSTVO" }],
  ];
  primeri.forEach((vhod, i) => {
    jseq(K.zdruziNzvZapise(vhod), NzvZasedba.zdruziNzvZapise(vhod), `zdruziNzvZapise, primer ${i + 1}`);
  });
}

console.log("7d) NZV koordinate: iste celice kot pripraviPosodobitveNzv() iz index.html");
{
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
  const pesk = { window: okno, console };
  vm.createContext(pesk);
  vm.runInContext([
    izvleciVrstico("const ISO_DATUM_RX"),
    izvleciVrstico("const NZV_ENOTE"),
    izvleciVrstico("const NZV_STOLPCI"),
    izvleciVrstico("const NZV_GLAVA_NAJVEC_NAZAJ"),
    izvleciVrstico("const NZV_GLAVA_NAJMANJ_ZADETKOV"),
    readFileSync(join(koren, "datum.js"), "utf8"),
    "var monthRange = window.Datum.obseg;",
    izvleci("vrsticaJePrazna"),
    izvleci("obdelajBlok"),
    izvleci("nzvKljucGlave"),
    izvleci("nzvNazivVKodo"),
    izvleci("nzvNazivVKodoNorm"),
    izvleci("poisciEnoteNzv"),
    izvleci("pripraviPosodobitveNzv"),
  ].join("\n\n"), pesk);

  // Oblika po pravem dokumentu: med glavo enot in prvim datumom stoji
  // PRAZNA vrstica (tako je na vseh mesečnih listih).
  const GLAVA = ["DATUM", "PDZN", "SOBO", "ŽO", "E1", "E2", "SA DOP", "SA POP", "DEŽURSTVO", "LD", "IZOB", "BS"];
  const V = [
    ["SEPTEMBER 2026"],
    GLAVA,
    [],
    ["1. 9. 2026", "DŽA", "VEL", "ALU", "LEL", "PER", "TOR", "HUM", "Amal Perviz", "BOJ, VEL", "HRO", "LUN"],
    ["2. 9. 2026", "DŽA", "VEL", "ALU", "LEL", "PER", "TOR", "HUM", "Grega Arnež", "BIZ", "", ""],
  ];
  const ZAM = V.map((v) => (v.length ? ["", "", ...v] : v));

  [[V, "brez zamika"], [ZAM, "z zamikom 2"]].forEach(([vv, opis]) => {
    const iz = pesk.pripraviPosodobitveNzv(vv, "2026-09", {}).posodobitve
      .map((p) => p.vrstica + ":" + p.stolpec).sort();
    const kop = K.koordinateNzv(vv, "2026-09-01", "2026-09-30").celice
      .map((c) => c.vrstica + ":" + c.stolpec).sort();
    jseq(kop, iz, `NZV, ${opis}: iste (vrstica, stolpec)`);
  });

  const celice = K.koordinateNzv(V, "2026-09-01", "2026-09-30").celice;
  const prvi = (koda) => celice.find((c) => c.koda === koda && c.datum === "2026-09-01");
  jseq(prvi("PDZN") && [prvi("PDZN").stolpec, prvi("PDZN").vrednost], [1, "DŽA"], "PDZN / 1. 9.");
  jseq(prvi("SADOP") && prvi("SADOP").vrednost, "TOR", "SA DOP se prepozna po nazivu");
  jseq(prvi("DEZ") && prvi("DEZ").vrednost, "Amal Perviz", "DEŽURSTVO nosi polno ime, ne parafe");
  jseq(prvi("LD") && [prvi("LD").vrednost, prvi("LD").jeOdsotnost], ["BOJ, VEL", true],
    "LD je označen kot odsotnost, ne enota");
  trdi(celice.every((c) => c.vrstica >= 3), "glava in naslov meseca nista med celicami");
  trdi(K.koordinateNzv(V, "2026-09-01", "2026-09-30").najdenaGlava,
    "glava se najde tudi čez prazno vrstico pod njo");
}

console.log("7f) parafe: isti odgovor kot parafa.js");
{
  // Nabor pokriva oba dela prestopa 1. 10. 2026 in oba vira parafe
  // (izrecna, izpeljana), pa tudi trk dveh izpeljanih.
  const profili = [
    { id: "1", full_name: "Džamastagić Denis", parafa: "DŽA" },
    { id: "2", full_name: "Alukić Dino", parafa: "ALU", parafa_pred_oktobrom_2026: "DIN" },
    { id: "3", full_name: "Pogačnik Teja" },
    { id: "4", full_name: "Pogorevc Ana" },
    { id: "5", full_name: "Mavri Tratnik Magdalena", parafa: "TRA" },
  ];
  ["2026-09-15", "2026-10-01", "2026-09", "2026-10", "", null].forEach((datum) => {
    const kop = K.parafaLastniki(profili, datum);
    const iz = Parafa.lastniki(profili, datum);
    jseq(Object.keys(kop.poParafi).sort(), Object.keys(iz.poParafi).sort(),
      `parafaLastniki(${JSON.stringify(datum)}): iste parafe`);
    jseq(Object.keys(kop.poParafi).sort().map((k) => kop.poParafi[k].id),
      Object.keys(iz.poParafi).sort().map((k) => iz.poParafi[k].id),
      `parafaLastniki(${JSON.stringify(datum)}): iste osebe`);
    jseq([...kop.podvojene].sort(), [...iz.podvojene].sort(),
      `parafaLastniki(${JSON.stringify(datum)}): isti trki`);
  });
  const razhajanja = profili.filter((p) =>
    ["2026-09-15", "2026-10-01"].some((d) => K.parafaZaDatum(p, d) !== Parafa.zaDatum(p, d)));
  jseq(razhajanja.map((p) => p.full_name), [], "parafaZaDatum() se ujema na obeh straneh prestopa");
  jseq(K.parafaZaDatum(profili[1], "2026-09-15"), "DIN", "pred 1. 10. 2026 velja stara parafa");
  jseq(K.parafaZaDatum(profili[1], "2026-10-01"), "ALU", "od 1. 10. 2026 nova");
  trdi(K.parafaLastniki(profili, "2026-10").podvojene.indexOf("POG") >= 0,
    "dve izpeljani »POG« ostaneta dvoumni in se ne pripišeta nikomur");
  jseq(K.ocistiNazivOsebe("dr. Tanja Torkar"), "Tanja Torkar", "naziv pred imenom se odstrani");
  jseq(K.ocistiNazivOsebe("Grega Arnež"), "Grega Arnež", "ime brez naziva ostane");
}

console.log("7e) ime zavihka iz meseca in nazaj");
{
  const VZOREC = "Razpored {MESEC} {LETO}";
  jseq(K.imeZavihka(VZOREC, "2026-09"), "Razpored SEPTEMBER 2026", "mesec -> ime zavihka");
  jseq(K.imeZavihka(VZOREC, "2026-01"), "Razpored JANUAR 2026", "januar");
  jseq(K.imeZavihka("B", "2026-09"), "B", "ime brez oznak ostane nespremenjeno");
  jseq(K.mesecIzImenaZavihka(VZOREC, "Razpored SEPTEMBER 2026"), "2026-09", "ime zavihka -> mesec");
  jseq(K.mesecIzImenaZavihka(VZOREC, "Razpored september 2026"), "2026-09", "male črke se tolerirajo");
  jseq(K.mesecIzImenaZavihka(VZOREC, "Razpored JUNIJ 2025"), "2025-06", "drugo leto");
  jseq(K.mesecIzImenaZavihka(VZOREC, "September 2026"), null, "druga družina zavihkov se NE ujame");
  jseq(K.mesecIzImenaZavihka(VZOREC, "List29"), null, "ostanek »List29« se ne ujame");
  jseq(K.mesecIzImenaZavihka(VZOREC, "Razpored NEKAJ 2026"), null, "neznano ime meseca se ne ujame");
  jseq(K.mesecIzImenaZavihka("B", "B"), null, "brez vzorca ni ugibanja meseca");
  trdi(K.jeVzorecZavihka(VZOREC) && !K.jeVzorecZavihka("FLEXI"), "vzorec se loči od navadnega imena");
  // Vsi meseci se morajo peljati tja in nazaj.
  const krog = [];
  for (let m = 1; m <= 12; m++) {
    const mm = "2026-" + String(m).padStart(2, "0");
    if (K.mesecIzImenaZavihka(VZOREC, K.imeZavihka(VZOREC, mm)) !== mm) krog.push(mm);
  }
  jseq(krog, [], "vseh 12 mesecev preživi pot tja in nazaj");
}

console.log("8b) barve: isti odgovor kot Izmene.barva() / Izmene.barvaBesedila()");
{
  const nabor = Izmene.moznosti().map((m) => m.zapis).concat([
    "dopoldan", "Nočna 12", "popoldan do 19", "LD", "KPU", "", "prosto", "XYZ neznano",
  ]);
  const razhajanja = nabor.filter((z) => K.barvaZaZapis(z) !== Izmene.barva(z));
  jseq(razhajanja, [], `barvaZaZapis() se ujema z Izmene.barva() na ${nabor.length} primerih`);
  const razhajanjaPisave = ["#4F9B6B", "#2F4785", "#E8A867", "#FFFFFF", "#000000", "", "abc"]
    .filter((h) => K.barvaBesedila(h) !== Izmene.barvaBesedila(h));
  jseq(razhajanjaPisave, [], "barvaBesedila() se ujema z izmene.js");
  jseq(K.hexVRgb("#FFFFFF"), { red: 1, green: 1, blue: 1 }, "hexVRgb() bele");
  jseq(K.hexVRgb("#000000"), { red: 0, green: 0, blue: 0 }, "hexVRgb() črne");
}

console.log("8c) zahteva za barvanje se dotakne ENE celice in DVEH lastnosti");
{
  const zahteva = K.zahtevaBarve(7, 4, 5, "#4F9B6B");
  jseq(Object.keys(zahteva), ["repeatCell"], "zahteva je izključno repeatCell");
  const z = zahteva.repeatCell;
  jseq(z.range, { sheetId: 7, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 6 },
    "obseg je natanko ena celica");
  jseq(z.fields, "userEnteredFormat(backgroundColor,textFormat.foregroundColor)",
    "spremenita se samo ozadje in barva pisave");
  jseq(Object.keys(z.cell.userEnteredFormat).sort(), ["backgroundColor", "textFormat"],
    "v zahtevi ni nobene druge oblikovne lastnosti");
  jseq(Object.keys(z.cell.userEnteredFormat.textFormat), ["foregroundColor"],
    "od pisave se dotakne samo barve (krepko/ležeče/velikost ostanejo)");
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
