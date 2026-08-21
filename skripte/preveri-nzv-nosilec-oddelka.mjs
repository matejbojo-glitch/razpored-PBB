#!/usr/bin/env node
/* Preizkus: kdo iz NZV je posamezen dan zadolžen za posamezen ODDELEK.
 *
 * Uporabnikovo pravilo (avgust 2026): "C1 Salkić, C Arnež, B Lunar. V
 * primeru LD ali druge odsotnosti je vnešen Arnež na C1, Lunar je v
 * razpredelnicah na B in C oddelku. Isto velja za E2 (Lelić), E1 (Maglić)
 * in D (Perviz). Tudi če je samo 1 dan naj bo na seznamu namesto odsotne
 * osebe."
 *
 * To je obratna smer od razporedDneva (ta pove, katere enote pokriva
 * posamezna oseba). Oddelčni razpored sprašuje obrnjeno — "kdo je danes za
 * C1?" — in odgovor mora biti ISTI, sicer bi mreža NZV in oddelčni
 * razpored trdila vsak svoje.
 *
 * Zagon: node skripte/preveri-nzv-nosilec-oddelka.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
const NZ = sandbox.window.NzvZasedba;
const kljuc = sandbox.window.Imena.kljuc;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Nosilci in nadomeščanja natanko po uporabnikovem opisu.
const NOSILCI = [
  { full_name: "Salkić Maruša", enote: "C1" },
  { full_name: "Arnež Grega", enote: "C" },
  { full_name: "Lunar Petra", enote: "B" },
  { full_name: "Lelić Dijana", enote: "E2" },
  { full_name: "Maglić Sanja", enote: "E1" },
  { full_name: "Perviz Amela", enote: "D" },
];
const PARI = [
  { nosilec: "Salkić Maruša", nadomesca: "Arnež Grega", enota: "C1", prednost: 1 },
  { nosilec: "Arnež Grega", nadomesca: "Lunar Petra", enota: "C", prednost: 1 },
  { nosilec: "Lelić Dijana", nadomesca: "Maglić Sanja", enota: "E2", prednost: 1 },
];
const DNEVI = ["2026-10-05", "2026-10-06", "2026-10-07"];   // PON, TOR, SRE

const zasedba = (odsotni, dnevi) => NZ.zasedbaEnot({
  nosilci: NOSILCI, pari: PARI, kljuc,
  datumi: dnevi || DNEVI,
  jeOdsoten: (ime, datum) => (odsotni || []).some(o =>
    kljuc(o.ime) === kljuc(ime) && o.dnevi.includes(datum)),
});
const kdoJeNa = (z, enota, datum) => (z[enota + "|" + datum] || []).slice().sort();

console.log("1) običajen dan: vsak je na svojem oddelku");
{
  const z = zasedba([]);
  eq(kdoJeNa(z, "C1", "2026-10-05"), ["Salkić Maruša"], "C1 je Salkić");
  eq(kdoJeNa(z, "C", "2026-10-05"), ["Arnež Grega"], "C je Arnež");
  eq(kdoJeNa(z, "B", "2026-10-05"), ["Lunar Petra"], "B je Lunar");
  eq(kdoJeNa(z, "E2", "2026-10-05"), ["Lelić Dijana"], "E2 je Lelić");
  eq(kdoJeNa(z, "E1", "2026-10-05"), ["Maglić Sanja"], "E1 je Maglić");
  eq(kdoJeNa(z, "D", "2026-10-05"), ["Perviz Amela"], "D je Perviz");
}

console.log("2) veriga nadomeščanja (uporabnikov primer)");
{
  // Salkić na dopustu -> Arnež na C1, Lunar pa na B IN C.
  const z = zasedba([{ ime: "Salkić Maruša", dnevi: ["2026-10-05"] }]);
  eq(kdoJeNa(z, "C1", "2026-10-05"), ["Arnež Grega"], "C1 prevzame Arnež");
  eq(kdoJeNa(z, "B", "2026-10-05"), ["Lunar Petra"], "B ostane Lunar");
  eq(kdoJeNa(z, "C", "2026-10-05"), ["Lunar Petra"], "in Lunar je hkrati še na C");
  trdi(!kdoJeNa(z, "C1", "2026-10-05").includes("Salkić Maruša"),
    "odsotne osebe ni več pod njenim oddelkom");
  // Naslednji dan je Salkić spet tu - nadomeščanje se ne "zalepi".
  eq(kdoJeNa(z, "C1", "2026-10-06"), ["Salkić Maruša"], "naslednji dan je C1 spet Salkić");
  eq(kdoJeNa(z, "C", "2026-10-06"), ["Arnež Grega"], "in C spet Arnež");
}

console.log("3) tudi en sam dan šteje");
{
  // Ravno to je uporabnik izrecno zahteval: "Tudi če je samo 1 dan naj bo
  // na seznamu namesto odsotne osebe."
  const z = zasedba([{ ime: "Lelić Dijana", dnevi: ["2026-10-06"] }]);
  eq(kdoJeNa(z, "E2", "2026-10-05"), ["Lelić Dijana"], "prvi dan E2 pokriva Lelić");
  eq(kdoJeNa(z, "E2", "2026-10-06"), ["Maglić Sanja"], "en sam dan odsotnosti: E2 pokriva Maglić");
  eq(kdoJeNa(z, "E1", "2026-10-06"), ["Maglić Sanja"], "in ostane tudi na svojem E1");
  eq(kdoJeNa(z, "E2", "2026-10-07"), ["Lelić Dijana"], "tretji dan spet Lelić");
}

console.log("4) brez nadomeščevalca oddelek ostane brez nosilca – in se to vidi");
{
  // Perviz nima para v PARI. Če je odsotna, D tisti dan NIMA nosilca. Tega
  // se ne sme prikriti tako, da bi vskočil kdorkoli - koordinator mora
  // videti, da je oddelek nepokrit.
  const z = zasedba([{ ime: "Perviz Amela", dnevi: ["2026-10-05"] }]);
  eq(kdoJeNa(z, "D", "2026-10-05"), [], "D tisti dan nima nosilca");
  eq(kdoJeNa(z, "D", "2026-10-06"), ["Perviz Amela"], "naslednji dan spet Perviz (kontrola)");
}

console.log("5) vikendi in prazniki");
{
  // NZV ob vikendih in praznikih po enotah ne dela - prazno je pravilno.
  const zVikendom = NZ.zasedbaEnot({
    nosilci: NOSILCI, pari: PARI, kljuc,
    datumi: ["2026-10-10", "2026-10-12"],           // SO, PON
    jeOdsoten: () => false,
    jeProstDan: (d) => d === "2026-10-10",
  });
  eq(kdoJeNa(zVikendom, "C1", "2026-10-10"), [], "v soboto ni nosilca");
  eq(kdoJeNa(zVikendom, "C1", "2026-10-12"), ["Salkić Maruša"], "v ponedeljek je");
}

console.log("6) ista pot kot mreža NZV (brez druge kopije pravila)");
{
  // Če bi zasedbaEnot računala po svoje, bi oddelčni razpored in mreža NZV
  // lahko trdila vsak svoje. Zato se primerja z razporedDneva.
  const odsotni = [{ ime: "Salkić Maruša", dnevi: ["2026-10-05"] }];
  const z = zasedba(odsotni);
  const izMreze = {};
  NZ.razporedDneva({
    nosilci: NOSILCI, pari: PARI, kljuc,
    jeOdsoten: (ime) => odsotni.some(o => kljuc(o.ime) === kljuc(ime) && o.dnevi.includes("2026-10-05")),
  }).forEach(({ nosilec, kode }) => {
    kode.forEach(k => { (izMreze[k] = izMreze[k] || []).push(nosilec.full_name); });
  });
  ["B", "C", "C1", "D", "E1", "E2"].forEach(enota => {
    eq(kdoJeNa(z, enota, "2026-10-05"), (izMreze[enota] || []).slice().sort(),
      `${enota}: oddelčni pogled se ujema z mrežo NZV`);
  });
}

console.log("7) ročni vpis v razporedu NZV prevlada nad pravilom");
{
  // Uporabnik: "v razporedu NZV bo nekdo označen najbrž ročno, takrat se
  // prenese v ta razpored." Pravilo nadomeščanja je torej samo izhodišče -
  // ko koordinator mesec objavi, velja objavljeno. Sicer bi oddelek kazal
  // pravilo, mreža NZV pa dejansko stanje.
  const objavljeno = { "2026-10-05": [
    { ime: "Perviz Amela", kode: ["C1"] },      // vskočil je nekdo tretji
    { ime: "Lunar Petra", kode: ["B"] },
  ]};
  const z = NZ.zasedbaEnot({
    nosilci: NOSILCI, pari: PARI, kljuc, datumi: DNEVI,
    jeOdsoten: () => false, objavljeno,
  });
  eq(kdoJeNa(z, "C1", "2026-10-05"), ["Perviz Amela"], "objavljeni vnos prevlada nad pravilom");
  eq(kdoJeNa(z, "B", "2026-10-05"), ["Lunar Petra"], "in velja za vse enote tistega dne");
  // Cel dan se prevzame iz objave: enota, ki je objava ne omenja, tisti dan
  // OSTANE PRAZNA. Mešanje objavljenega in izpeljanega bi dalo protislovje
  // (na C1 hkrati Perviz iz objave in Salkić iz pravila).
  eq(kdoJeNa(z, "C", "2026-10-05"), [], "enota, ki je objava ne omenja, ostane prazna");
  // Dnevi brez objave se še naprej izpeljejo po pravilu.
  eq(kdoJeNa(z, "C1", "2026-10-06"), ["Salkić Maruša"], "dan brez objave se izpelje po pravilu");
  eq(kdoJeNa(z, "C", "2026-10-06"), ["Arnež Grega"], "in tam veriga deluje kot prej");
}

console.log("8) enote iz objavljenega zapisa");
{
  // Baza dovoli EN zapis na osebo in dan, oseba pa je pogosto na več
  // enotah - dodatne so v pokriva_oddelek. Brez branja tega stolpca bi
  // oddelek videl samo prvo enoto.
  eq(NZ.enoteIzZapisa({ department_code: "PDZN", pokriva_oddelek: "PDZN/SOBO/U2" }),
    ["PDZN", "SOBO", "U2"], "pokriva_oddelek nosi cel seznam enot");
  eq(NZ.enoteIzZapisa({ department_code: "C1", pokriva_oddelek: "" }), ["C1"],
    "brez pokriva_oddelek velja department_code");
  eq(NZ.enoteIzZapisa({ department_code: "C1", pokriva_oddelek: "C1, C" }), ["C1", "C"],
    "ločilo je lahko tudi vejica");
  // DEZ/NEDEZ/NZV/FLEXI so pripadnost skupini, ne delovišče - kot enota se
  // ne smejo prikazati, sicer bi se pod oddelkom pojavil "DEZ".
  eq(NZ.enoteIzZapisa({ department_code: "DEZ" }), [], "dežurstvo ni enota");
  eq(NZ.enoteIzZapisa({ department_code: "NZV" }), [], "NZV ni enota");
  eq(NZ.enoteIzZapisa({ department_code: "XYZ" }), [], "neznana koda se zavrže");
  eq(NZ.enoteIzZapisa(null), [], "manjkajoč zapis ne vrže napake");
}

console.log("9) obe strani res kličeta skupno logiko");
{
  const brezKomentarjev = (pot) => readFileSync(join(koren, pot), "utf8")
    .split("\n").filter(v => !/^\s*\/\//.test(v)).join("\n");
  trdi(/window\.NzvZasedba\.zasedbaEnot\(/.test(brezKomentarjev("index.html")),
    "oddelčni razpored (index.html) kliče zasedbaEnot");
  // Razpredelnica je bila avgusta 2026 prenesena iz Imenika v Razpored,
  // zato sta oba pogleda (stolpec NZV na oddelku in vrstice nosilcev v
  // razpredelnici) zdaj v index.html - vsak s svojim klicem.
  const vir = brezKomentarjev("index.html");
  trdi((vir.match(/window\.NzvZasedba\.zasedbaEnot\(/g) || []).length >= 2,
    "oba pogleda kličeta isto zasedbaEnot, ne vsak svoje kopije");
  // Objava mora priti do OBEH, sicer bi eden kazal pravilo, drugi pa
  // dejansko stanje.
  trdi((vir.match(/objavljeno,/g) || []).length >= 2,
    "oba predata objavljen razpored NZV v izračun");
  trdi(!/window\.NzvZasedba\.zasedbaEnot\(/.test(brezKomentarjev("imenik.html")),
    "v imenik.html tega izračuna ni več (razpredelnica je prenesena)");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
