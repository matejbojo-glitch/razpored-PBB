#!/usr/bin/env node
/* Preizkus nalozizPodatkeNzv() (index.html) – zapolnjenost stolpcev enot
 * v NZV mreži.
 *
 * Zakaj obstaja: uporabnik je poslal posnetek zaslona, na katerem so bili
 * stolpci PDZN, SOBO, MO, ŽO … prazni čez cel mesec. Vzrok ni bil manjkajoč
 * podatek, ampak to, da se je mreža polnila IZKLJUČNO iz objavljenih
 * schedule_entries – za vodje pa se dnevni razpored ne objavlja, ker je
 * njihova enota stalna in zapisana v lead_departments.enote.
 *
 * Preverjamo torej ravno to, kar je manjkalo:
 *   - vsak delovni dan ima nosilec svojo parafo v svojem stolpcu;
 *   - sobota/nedelja/praznik ostanejo prazni (delovnik NZV je PON-PET);
 *   - ob odsotnosti nosilca (LD/BS iz leave_entries ali daljša odsotnost v
 *     lead_departments) se vpiše nadomeščevalec po vrstnem redu "prednost",
 *     in sicer tak, ki tisti dan ni odsoten tudi sam;
 *   - objavljen vnos v schedule_entries ima prednost pred izpeljavo in
 *     oseba se v istem dnevu ne podvoji;
 *   - sestavljene enote ("C/C1", "UA/SA") se razdelijo na prave stolpce,
 *     neznane oznake ("NOB") pa se tiho preskočijo.
 *
 * Zagon: node skripte/preveri-nzv-zasedba-enot.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "index.html"), "utf8");

function izvleciFn(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0;
  for (let i = html.indexOf("{", zac); i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciAsyncFn(ime) {
  const zac = html.indexOf("async function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0;
  for (let i = html.indexOf("{", zac); i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
// const-i, ki se končajo z ";\n" na isti ravni (enovrstični ali objektni).
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  return html.slice(zac, html.indexOf(";\n", zac) + 1).replace(/^const\s+/, "var ");
}
// NZV_STOLPCI je IIFE čez več vrstic – ";\n" se v njem pojavi že prej.
function izvleciBlok(zacetek, konec) {
  const z = html.indexOf(zacetek);
  if (z === -1) throw new Error("Bloka " + zacetek + " ni v index.html.");
  const k = html.indexOf(konec, z);
  if (k === -1) throw new Error("Konca bloka " + zacetek + " ni v index.html.");
  return html.slice(z, k + konec.length).replace(/^const\s+/, "var ");
}
function izvleciVrstico(oznaka) {
  const re = new RegExp("^\\s*" + oznaka.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*$", "m");
  const m = html.match(re);
  if (!m) throw new Error("Vrstice " + oznaka + " ni v index.html.");
  return m[0].replace(/^\s*const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
// Primerjava seznamov/objektov po vsebini - za odstopanja, kjer je izid
// seznam in ne posamezna vrednost.
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// ---------------------------------------------------------------------
// Sandbox z RESNIČNO kodo iz index.html/prazniki.js/parafa.js
// ---------------------------------------------------------------------
const sandbox = { console, window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
// Skupni vir pravila stalne zasedbe (isti modul uporablja tudi
// imenik.html -> Razpredelnica in index.html -> Moj razpored).
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
// classify živi v izmene.js (skupni modul za vse zaslone).
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
vm.runInContext("var classify = window.Izmene.skupina;", sandbox);
// Ujemanje imen živi v imena.js (skupni modul za vse zaslone), zato ga
// tu naložimo namesto da bi ga luščili iz index.html.
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext("var normalizirajImeNzv = window.Imena.normaliziraj;\n"
  + "var imenaSeUjemataNzv = window.Imena.seUjemata;\n"
  + "var kljucImenaNzv = window.Imena.kljuc;", sandbox);

vm.runInContext([
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani).
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  "var daysInRange = window.Datum.dnevi;",
  izvleciFn("parafaOd"),
  izvleciConst("NZV_ENOTE"),
  izvleciFn("razvrstiSA"),
  izvleciConst("NZV_STOLPCI"),
  // NZV_KODE_STOLPCEV: nalozizPodatkeNzv z njim preveri, ali pokriva_oddelek
  // res našteva stolpce NZV mreže (in ne FLEXI oznake kot "C/E2").
  izvleciConst("NZV_KODE_STOLPCEV"),
  izvleciConst("NZV_KIND_KODA"),
  izvleciConst("JE_NZV_VLOGA"),
  izvleciConst("saNastavitveIz"),
  izvleciConst("saStolpec"),
  izvleciFn("nzvEnoteVKode"),
  // Pregled odstopanj od pravil nadomeščanja - nalozizPodatkeNzv ga kliče.
  izvleciFn("kljucOdstopanja"),
  izvleciConst("ODSTOPANJA_PRESKOCI"),
  izvleciConst("ENOTE_KROGA_DEZURNIH"),
  izvleciFn("odstopanjaNzv"),
  izvleciAsyncFn("nalozizPodatkeNzv"),
].join("\n\n"), sandbox);

// Lažni Supabase odjemalec: vsak from() vrne "thenable", ki se razreši v
// { data } za svojo tabelo – natanko toliko, kolikor nalozizPodatkeNzv
// uporabi (select/in/gte/lte, brez filtriranja, ker ga tu ne rabimo).
function postaviOdjemalca(tabele) {
  sandbox.client = {
    from(ime) {
      const q = {};
      ["select", "in", "gte", "lte", "eq", "order"].forEach(m => { q[m] = () => q; });
      q.then = (res, rej) => Promise.resolve({ data: tabele[ime] || [], error: null }).then(res, rej);
      return q;
    },
  };
}

const profil = (full_name, parafa, role = "vodja") => ({ full_name, role, parafa, parafa_pred_oktobrom_2026: null });

// Realna podmnožica iz supabase/nzv-nosilci-oddelkov.sql + nzv-nadomescanja.sql.
const PROFILI = [
  profil("Alukić Dino", "ALU", "admin"),
  profil("Bojić Matej", "BOJ", "admin"),
  profil("Džamastagić Denis", "DŽA", "admin"),
  profil("Velušček Metka", "VEL"),
  profil("Arnež Grega", "ARN"),
  profil("Lunar Mateja", "LUN"),
  profil("Mavri Tratnik Magdalena", "TRA"),
  profil("Šubic Petra", "ŠUB"),
  profil("Bizjak Tea", "BIZ"),
  profil("Trpin Saša", "TRP"),
  profil("Mušič Ines", "MUŠ"),
  profil("Pogačnik Teja", "POG"),
  profil("Salkić Maruša", "SAL"),
  profil("Lelič Dijana", "LEL"),
  profil("Maglić Aleksander", "MAG"),
  profil("Novak Ana", "NOV", "user"), // navadna sestra – v NZV mrežo NE sodi
];
const VODJE = [
  { full_name: "ALUKIĆ DINO", enote: "ŽO", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "BOJIĆ MATEJ", enote: "MO", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "DŽAMASTAGIĆ DENIS", enote: "PDZN", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "VELUŠČEK METKA", enote: "SOBO", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "ARNEŽ GREGA", enote: "C", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "SALKIĆ MARUŠA", enote: "C1", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "LUNAR MATEJA", enote: "B", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "MAVRI TRATNIK MAGDALENA", enote: "B1", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "BIZJAK TEA", enote: "UA/SA/B2", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "POGAČNIK TEJA", enote: "E1", odsotnost_tip: "porodniška", odsotnost_do: "2027-07-31" },
  // Vzajemni par: nadomeščata se DRUG DRUGEGA in tretjega ni.
  // (Pogačnik je tudi nosilka E1, a je na porodniški do 2027, zato E1
  // dejansko drži Maglić - tako je tudi v nzv-nosilci-oddelkov.sql.)
  { full_name: "LELIČ DIJANA", enote: "E2", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "MAGLIĆ ALEKSANDER", enote: "E1", odsotnost_tip: null, odsotnost_do: null },
];
// "poleg_svoje" pove, da nadomeščevalec svoje enote NE zapusti, ampak
// pokriva obe (supabase/nzv-nadomescanja-poleg-svoje.sql). Uporabnikovo
// pravilo, avgust 2026: "Ko Alukić ni, je Bojić na MO + ŽO; če Bojić ni,
// je Alukić ŽO + MO; če ni obeh, je Džamastagić."
const NADOMESCANJA = [
  { nosilec: "ALUKIĆ DINO", nadomesca: "BOJIĆ MATEJ", enota: "ŽO", prednost: 1, poleg_svoje: true },
  { nosilec: "ALUKIĆ DINO", nadomesca: "DŽAMASTAGIĆ DENIS", enota: "ŽO", prednost: 2, poleg_svoje: true },
  { nosilec: "BOJIĆ MATEJ", nadomesca: "ALUKIĆ DINO", enota: "MO", prednost: 1, poleg_svoje: true },
  { nosilec: "BOJIĆ MATEJ", nadomesca: "DŽAMASTAGIĆ DENIS", enota: "MO", prednost: 2, poleg_svoje: true },
  { nosilec: "DŽAMASTAGIĆ DENIS", nadomesca: "ALUKIĆ DINO", enota: "PDZN", prednost: 1, poleg_svoje: true },
  { nosilec: "DŽAMASTAGIĆ DENIS", nadomesca: "BOJIĆ MATEJ", enota: "PDZN", prednost: 2, poleg_svoje: true },
  { nosilec: "ARNEŽ GREGA", nadomesca: "LUNAR MATEJA", enota: "C", prednost: 1 },
  { nosilec: "LUNAR MATEJA", nadomesca: "ARNEŽ GREGA", enota: "B", prednost: 1 },
  { nosilec: "SALKIĆ MARUŠA", nadomesca: "ARNEŽ GREGA", enota: "C1", prednost: 1 },
  { nosilec: "MAVRI TRATNIK MAGDALENA", nadomesca: "ŠUBIC PETRA", enota: "B1", prednost: 1 },
  { nosilec: "LELIČ DIJANA", nadomesca: "MAGLIĆ ALEKSANDER", enota: "E2", prednost: 1 },
  { nosilec: "MAGLIĆ ALEKSANDER", nadomesca: "LELIČ DIJANA", enota: "E1", prednost: 1 },
  // SOBO in A/PO: isti vzorec kot pri trojici zgoraj - nadomeščevalec svoje
  // enote NE zapusti. Uporabnikova potrditev, avgust 2026, dobesedno:
  // "ne, ostane na PDZN in pokriva tudi SOBO ... tako je pri njemu."
  { nosilec: "VELUŠČEK METKA", nadomesca: "DŽAMASTAGIĆ DENIS", enota: "SOBO", prednost: 1, poleg_svoje: true },
  { nosilec: "VELUŠČEK METKA", nadomesca: "ALUKIĆ DINO", enota: "SOBO", prednost: 2, poleg_svoje: true },
  { nosilec: "VELUŠČEK METKA", nadomesca: "BOJIĆ MATEJ", enota: "SOBO", prednost: 3, poleg_svoje: true },
];

// September 2026: 1.9. je torek. 5./6.9. je vikend. 12./13.9. vikend.
const MESEC = { startISO: "2026-09-01", endISO: "2026-09-30" };

async function poglej(dodatno = {}) {
  postaviOdjemalca({
    schedule_entries: dodatno.entries || [],
    leave_entries: dodatno.dopusti || [],
    profiles: PROFILI,
    lead_departments: dodatno.vodje || VODJE,
    nadomescanja: dodatno.nadomescanja || NADOMESCANJA,
    nzv_nastavitve: dodatno.nastavitve || [],
  });
  return sandbox.nalozizPodatkeNzv(MESEC.startISO, MESEC.endISO);
}

const test = async () => {
  console.log("1) Nosilec enote je vpisan vsak delovni dan (to je bilo prazno na posnetku)");
  {
    const { podatki, izpeljano } = await poglej();
    eq(podatki["PDZN|2026-09-01"], "DŽA", "torek 1.9. – PDZN");
    eq(podatki["SOBO|2026-09-01"], "VEL", "torek 1.9. – SOBO (samo nosilka Velušček)");
    eq(podatki["MO|2026-09-01"], "BOJ", "torek 1.9. – MO");
    eq(podatki["ZO|2026-09-01"], "ALU", "torek 1.9. – ŽO");
    eq(podatki["PDZN|2026-09-30"], "DŽA", "sreda 30.9. – PDZN (cel mesec, ne le prvi dan)");
    trdi(izpeljano["PDZN|2026-09-01"] === true, "celica je označena kot izpeljana (za bledejši izris)");
  }

  console.log("2) Vikend in praznik ostaneta prazna – delovnik NZV je PON-PET");
  {
    const { podatki } = await poglej();
    eq(podatki["PDZN|2026-09-05"] || "", "", "sobota 5.9.");
    eq(podatki["PDZN|2026-09-06"] || "", "", "nedelja 6.9.");
    eq(podatki["SOBO|2026-09-12"] || "", "", "sobota 12.9.");
  }
  {
    // 1.11.2026 je dan mrtvih (nedelja), 2.11. ponedeljek je navaden delovni
    // dan; 31.10.2026 (sobota) je dan reformacije. Preverimo praznik, ki
    // pade na DELOVNI dan: 25.12.2026 je petek (božič).
    postaviOdjemalca({ schedule_entries: [], leave_entries: [], profiles: PROFILI, lead_departments: VODJE, nadomescanja: NADOMESCANJA });
    const { podatki } = await sandbox.nalozizPodatkeNzv("2026-12-01", "2026-12-31");
    eq(podatki["PDZN|2026-12-24"], "DŽA", "četrtek 24.12.2026 je navaden delovni dan");
    eq(podatki["PDZN|2026-12-25"] || "", "", "petek 25.12.2026 (božič) je prost");
    eq(podatki["PDZN|2026-12-28"], "DŽA", "ponedeljek 28.12.2026 je spet delovni dan");
  }

  console.log("3) Sestavljene enote se razdelijo, neznane oznake se preskočijo");
  {
    const { podatki } = await poglej();
    // "enote" vsebuje SAMO lastno enoto: C1 je Salkićin in Arnež nanj
    // pride šele ob njeni odsotnosti (glej sklop 5).
    eq(podatki["C|2026-09-01"], "ARN", "Arnež na svojem C");
    eq(podatki["C1|2026-09-01"], "SAL", "C1 je Salkićin, ne Arnežev");
    eq(podatki["B1B2|2026-09-01"], "TRA, BIZ", "\"B1/SOB/NOB\" -> B1 in \"UA/SA/B2\" -> B2, oba v stolpec B1,B2");
    // "SOB" iz "B1/SOB/NOB" NI enota SOBO - napačna domneva, zaradi katere
  // sta Mavri Tratnik in Šubic pristajala v tujem stolpcu (uporabnikova
  // pripomba). Dokler ni pojasnjeno, kaj sta "SOB" in "NOB", se tiho
  // preskočita, nosilka SOBO pa je samo Velušček Metka.
  eq(podatki["SOBO|2026-09-01"], "VEL", "\"SOB\" ne pristane v stolpcu SOBO");
    eq(podatki["URGENCA|2026-09-01"], "BIZ", "\"UA\" -> URGENCA");
    // 1. 9. 2026 je ISO teden 36 (sod) -> po privzetku popoldanski teden.
    eq(podatki["SADOP|2026-09-01"] || "", "", "\"SA\" v sodem tednu ni v SA DOP");
    eq(podatki["SAPOP|2026-09-01"], "BIZ", "\"SA\" v sodem tednu je v SA POP");
    // "NOB" ni stolpec v uradni predlogi – ne sme se pojaviti nikjer.
    trdi(!Object.keys(podatki).some(k => k.startsWith("NOB|")), "neznana oznaka \"NOB\" ne ustvari stolpca");
  }

  console.log("3b) Enoto lahko pokriva več nosilcev – parafe se seštejejo, ne prepišejo");
  {
    const { podatki } = await poglej({
      vodje: [
        { full_name: "BIZJAK TEA", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
        { full_name: "TRPIN SAŠA", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
        { full_name: "MUŠIČ INES", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
      ],
    });
    eq(podatki["URGENCA|2026-09-01"], "BIZ, TRP, MUŠ", "vse tri, ki pokrivajo UA/SA");
    eq(podatki["SAPOP|2026-09-01"], "BIZ, TRP, MUŠ", "isto v SA POP (sod teden)");
  }

  console.log("3c) SA se izmenjuje TEDENSKO, poleti je samo dopoldne");
  {
    // ISO tedni septembra 2026: 1.9. = 36 (sod), 8.9. = 37 (liho),
    // 15.9. = 38 (sod). Privzetek: liho = dopoldne.
    const isoTeden = sandbox.window.NzvZasedba.isoTeden;
    eq(isoTeden("2026-09-01"), 36, "1.9.2026 je ISO teden 36");
    eq(isoTeden("2026-09-08"), 37, "8.9.2026 je ISO teden 37");
    const { podatki } = await poglej();
    eq(podatki["SAPOP|2026-09-01"], "BIZ", "sod teden -> popoldne");
    eq(podatki["SADOP|2026-09-08"], "BIZ", "naslednji (lih) teden -> dopoldne");
    eq(podatki["SADOP|2026-09-01"] || "", "", "isti dan ni hkrati v obeh stolpcih");
    eq(podatki["SAPOP|2026-09-08"] || "", "", "in obratno naslednji teden");
    // Cel teden ima isto polovico dneva - ne se izmenjuje po dnevih.
    eq(podatki["SADOP|2026-09-11"], "BIZ", "petek istega lihega tedna je še vedno dopoldne");
  }
  {
    // Poletje: julij in avgust sta po privzetku samo dopoldne, ne glede na teden.
    postaviOdjemalca({ schedule_entries: [], leave_entries: [], profiles: PROFILI, lead_departments: VODJE, nadomescanja: NADOMESCANJA, nzv_nastavitve: [] });
    const { podatki } = await sandbox.nalozizPodatkeNzv("2026-07-01", "2026-07-31");
    eq(podatki["SADOP|2026-07-01"], "BIZ", "1.7. (lih teden) dopoldne");
    eq(podatki["SADOP|2026-07-08"], "BIZ", "8.7. (sod teden) prav tako dopoldne – poletna izjema");
    eq(podatki["SAPOP|2026-07-08"] || "", "", "poleti popoldanskega stolpca ni");
  }
  {
    // Administrator obrne pravilo in nastavi drugačne poletne mesece.
    const { podatki } = await poglej({
      nastavitve: [
        { kljuc: "sa_liho_teden", vrednost: "pop" },
        { kljuc: "sa_poletni_meseci", vrednost: "9" },
      ],
    });
    eq(podatki["SADOP|2026-09-01"], "BIZ", "september je zdaj poletni mesec -> samo dopoldne");
    eq(podatki["SAPOP|2026-09-01"] || "", "", "popoldanskega stolpca septembra ni");
  }
  {
    const { podatki } = await poglej({
      nastavitve: [
        { kljuc: "sa_liho_teden", vrednost: "pop" },
        { kljuc: "sa_poletni_meseci", vrednost: "" },
      ],
    });
    eq(podatki["SADOP|2026-09-01"], "BIZ", "obrnjeno pravilo: sod teden je zdaj dopoldne");
    eq(podatki["SAPOP|2026-09-08"], "BIZ", "in lih teden popoldne");
  }

  console.log("4) Trajna odsotnost (porodniška) – nosilka se ne vpisuje");
  {
    const { podatki } = await poglej();
    // Prej je bil E1 prazen, ker je bila Pogačnik edina nosilka. Odkar je
    // v naboru tudi Maglić (kot v resnici), E1 drži on - bistvo trditve pa
    // ostaja isto: trajno odsotne osebe v mreži NI.
    eq(podatki["E1|2026-09-01"], "MAG", "E1 drži Maglić, ne Pogačnik");
    trdi(podatki["E1|2026-09-01"] !== "POG",
      "Pogačnik Teja je na porodniški do 31.7.2027 – v mreži je ni");
  }

  console.log("5) Ob odsotnosti: nadomeščevalec se PRESELI, tretji pokrije zapuščeno enoto");
{
  // Uporabnikov primer, dobesedno: "Salkić odsotna gre Arnež na C1,
  // Lunar ima B in C". Arneža torej na njegovem C tisti dan NI.
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Salkić Maruša", work_date: "2026-09-02", kind: "ld" }],
  });
  eq(podatki["C1|2026-09-02"], "ARN", "Arnež se preseli na C1");
  eq(podatki["C|2026-09-02"], "LUN", "na Arneževem C je Lunar - Arneža tam NI");
  eq(podatki["B|2026-09-02"], "LUN", "Lunar obdrži tudi svoj B");
  eq(podatki["LD|2026-09-02"], "SAL", "stolpec LD pokaže odsotnost");
  // Dan prej je vse po starem.
  eq(podatki["C1|2026-09-01"], "SAL", "dan prej je Salkić na svojem C1");
  eq(podatki["C|2026-09-01"], "ARN", "in Arnež na svojem C");
  eq(podatki["B|2026-09-01"], "LUN", "Lunar samo na B");
}

console.log("5b) Vzajemni par brez tretjega: nadomeščevalec pokriva OBE enoti");
{
  // Uporabnikov primer: "ko je Lelič na dopustu ima Maglić e2+e1 oddelek".
  // Lelič (E2) in Maglić (E1) sta drug drugemu EDINI nadomeščevalec, zato
  // Magličevega E1 ob njeni odsotnosti ni komu oddati. Prej je E1 tisti
  // dan iz razporeda preprosto izginil, čeprav delo na njem ostane.
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Lelič Dijana", work_date: "2026-09-02", kind: "ld" }],
  });
  eq(podatki["E2|2026-09-02"], "MAG", "Maglić prevzame Leličin E2");
  eq(podatki["E1|2026-09-02"], "MAG", "in POLEG tega obdrži svoj E1 (prej je E1 izginil)");
  eq(podatki["LD|2026-09-02"], "LEL", "stolpec LD pokaže Leličino odsotnost");

  // Berljiv zapis enot (to je tisto, kar piše v celici Razpredelnice)
  // mora povedati oboje, in v tem vrstnem redu.
  const NZ = sandbox.window.NzvZasedba;
  const vrstice = NZ.razporedDneva({
    nosilci: VODJE,
    pari: NADOMESCANJA,
    kljuc: sandbox.window.Imena.kljuc,
    jeOdsoten: (ime) => /LELI/i.test(ime),
    veljavne: null,
  });
  const mag = vrstice.find(v => /MAGLI/i.test(v.nosilec.full_name));
  eq(mag ? mag.enote : "", "E2, E1", "zapis enot za Maglića je \"E2, E1\"");

  // Dan prej je vsak na svojem.
  eq(podatki["E2|2026-09-01"], "LEL", "dan prej je Lelič na svojem E2");
  eq(podatki["E1|2026-09-01"], "MAG", "in Maglić na svojem E1");
}

console.log("5c) Obratna smer istega para deluje enako");
{
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Maglić Aleksander", work_date: "2026-09-03", kind: "ld" }],
  });
  eq(podatki["E1|2026-09-03"], "LEL", "Lelič prevzame Magličev E1");
  eq(podatki["E2|2026-09-03"], "LEL", "in obdrži svoj E2");
}

console.log("5d) Kjer TRETJI obstaja, se nadomeščevalec še vedno PRESELI");
{
  // Nadzorna točka za popravek 5c: pravilo ne sme pokvariti verige, kjer
  // zapuščeno enoto ima kdo prevzeti. Arnež gre s C na C1 in ga na C NI.
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Salkić Maruša", work_date: "2026-09-04", kind: "ld" }],
  });
  eq(podatki["C1|2026-09-04"], "ARN", "Arnež se preseli na C1");
  eq(podatki["C|2026-09-04"], "LUN", "na Arneževem C je Lunar - Arneža tam NI");
  eq(podatki["B|2026-09-04"], "LUN", "Lunar obdrži tudi svoj B");
}

console.log("5e) Veriga se ustavi pri tretjem - ta se NE preseli");
{
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Salkić Maruša", work_date: "2026-09-02", kind: "ld" }],
  });
  // Lunar je tretji: dobi C POLEG B. Če bi se tudi ona preselila, bi B
  // ostal prazen in veriga bi tekla v nedogled.
  trdi((podatki["B|2026-09-02"] || "").includes("LUN") && (podatki["C|2026-09-02"] || "").includes("LUN"),
    "tretji je na OBEH enotah hkrati");
}

console.log("5f) Če je prvi nadomeščevalec tudi odsoten, vskoči drugi");
{
  const { podatki } = await poglej({
    dopusti: [
      { full_name: "Dino Alukić", work_date: "2026-09-02", kind: "ld" },
      { full_name: "Bojić Matej", work_date: "2026-09-02", kind: "bs" },
    ],
  });
  eq(podatki["ZO|2026-09-02"], "DŽA", "ŽO prevzame drugi po prednosti");
  // Džamastagić svojega PDZN ne zapusti - to je bistvo pravila
  // "poleg svoje". Pokriva torej PDZN in ŽO hkrati.
  eq(podatki["PDZN|2026-09-02"], "DŽA", "PDZN obdrži - svoje enote ne zapusti");
}

console.log("5g) Nihče ne more biti hkrati preseljen in prevzemnik");
{
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Salkić Maruša", work_date: "2026-09-02", kind: "ld" }],
  });
  const vseCelice = Object.keys(podatki).filter(k => k.endsWith("|2026-09-02"));
  const kjeJeArn = vseCelice.filter(k => (podatki[k] || "").split(", ").includes("ARN"));
  eq(kjeJeArn.join(","), "C1|2026-09-02", "Arnež je samo na C1, nikjer drugje");
}

console.log("6) Objavljen razpored ima prednost, oseba se ne podvoji");
  {
    const { podatki, izpeljano } = await poglej({
      entries: [{
        department_code: "PDZN", work_date: "2026-09-01", shift_code: "PRISOTEN",
        profiles: profil("Bojić Matej", "BOJ", "admin"),
      }],
    });
    eq(podatki["PDZN|2026-09-01"], "BOJ", "objavljeni vnos obvelja pred izpeljanim nosilcem");
    trdi(!izpeljano["PDZN|2026-09-01"], "objavljena celica ni označena kot izpeljana");
    eq(podatki["MO|2026-09-01"] || "", "", "Bojić je tisti dan že v mreži – na MO se ne podvoji");
    eq(podatki["ZO|2026-09-01"], "ALU", "ostali nosilci so nedotaknjeni");
    eq(podatki["PDZN|2026-09-02"], "DŽA", "naslednji dan brez objave se izpeljava spet uporabi");
  }

  console.log("7) Navadni uporabniki (vloga user) v NZV mrežo ne pridejo");
  {
    const { podatki } = await poglej({
      vodje: [...VODJE, { full_name: "NOVAK ANA", enote: "D", odsotnost_tip: null, odsotnost_do: null }],
    });
    eq(podatki["D|2026-09-01"] || "", "", "Novak Ana ima vlogo user – stolpec D ostane prazen");
  }

  console.log("8) Brez tabel nadomescanja/lead_departments mreža deluje kot prej (ne sesuje se)");
  {
    const { podatki, izpeljano } = await poglej({ vodje: [], nadomescanja: [] });
    eq(Object.keys(izpeljano).length, 0, "nič izpeljanega");
    eq(Object.keys(podatki).length, 0, "mreža je prazna, a brez napake");
  }

// Skupna pomagala za pravila nadomeščanja: enote po osebi za dani nabor
// odsotnih. Beremo razporedDneva neposredno, ker nas zanima BERLJIV zapis
// enot ("MO, ŽO") - natanko to, kar piše v celici in v "Moj razpored".
const enoteZa = (odsotni, pari = NADOMESCANJA) => {
  const vrstice = sandbox.window.NzvZasedba.razporedDneva({
    nosilci: VODJE, pari, kljuc: sandbox.window.Imena.kljuc,
    jeOdsoten: (ime) => odsotni.some(o => new RegExp(o, "i").test(ime)),
    veljavne: null,
  });
  const m = {};
  vrstice.forEach(v => { m[v.nosilec.full_name] = v.enote; });
  return m;
};

console.log("5h) Trojica vodstvenih enot: nadomeščevalec pokriva OBE, tretji ostane prost");
{
  // Uporabnikovo pravilo, avgust 2026, dobesedno: "Ko Alukić ni, je Bojić
  // na MO + ŽO; če Bojić ni, je Alukić ŽO + MO; če ni obeh, je
  // Džamastagić." Prej je Bojić svoj MO ODDAL in šel na ŽO, MO pa je
  // pobral Džamastagić - v igri sta bila dva človeka namesto enega.
  const brezAlukica = enoteZa(["ALUKI"]);
  eq(brezAlukica["BOJIĆ MATEJ"], "MO, ŽO", "Alukić odsoten -> Bojić ima MO in ŽO");
  eq(brezAlukica["DŽAMASTAGIĆ DENIS"], "PDZN", "Džamastagić ostane samo na svojem PDZN");
  trdi(!brezAlukica["ALUKIĆ DINO"], "odsotnega Alukića ni nikjer");

  const brezBojica = enoteZa(["BOJI"]);
  eq(brezBojica["ALUKIĆ DINO"], "ŽO, MO", "Bojić odsoten -> Alukić ima ŽO in MO");
  eq(brezBojica["DŽAMASTAGIĆ DENIS"], "PDZN", "Džamastagić spet ostane na svojem");

  const brezObeh = enoteZa(["ALUKI", "BOJI"]);
  eq(brezObeh["DŽAMASTAGIĆ DENIS"], "PDZN, ŽO, MO",
    "ni obeh -> Džamastagić pokrije svoj PDZN in obe zapuščeni enoti");

  // Nobena enota ne sme izginiti, v nobenem od treh primerov.
  [["brez Alukića", brezAlukica], ["brez Bojića", brezBojica], ["brez obeh", brezObeh]]
    .forEach(([opis, m]) => {
      const vse = Object.values(m).join(", ").split(", ").map(x => x.trim());
      ["ŽO", "MO", "PDZN"].forEach(e => trdi(vse.includes(e), `${opis}: enota ${e} ni izginila`));
    });
}

console.log("5i) Brez stolpca poleg_svoje se NIČ ne spremeni (dokler SQL ni pognan)");
{
  // Pomembno: uporabnik SQL požene sam. Do takrat vrstice tega stolpca
  // nimajo in aplikacija se mora obnašati natanko kot prej - preselitev.
  const brezStolpca = NADOMESCANJA.map(({ poleg_svoje, ...r }) => r);
  const m = enoteZa(["ALUKI"], brezStolpca);
  eq(m["BOJIĆ MATEJ"], "ŽO", "brez stolpca se Bojić PRESELI na ŽO, kot doslej");
  eq(m["DŽAMASTAGIĆ DENIS"], "PDZN, MO", "in Džamastagić prevzame zapuščeni MO, kot doslej");
}

console.log("5j) Preselitvena veriga ostane nedotaknjena");
{
  // Nadzorna točka: novo pravilo velja SAMO za vrstice s poleg_svoje.
  // Salkić/Arnež/Lunar in Lelič/Maglić se ne smeta spremeniti.
  const brezSalkic = enoteZa(["SALKI"]);
  eq(brezSalkic["ARNEŽ GREGA"], "C1", "Arnež se še vedno PRESELI na C1 (svojega C nima)");
  eq(brezSalkic["LUNAR MATEJA"], "B, C", "Lunar še vedno pokrije C poleg svojega B");
  const brezLelic = enoteZa(["LELI"]);
  eq(brezLelic["MAGLIĆ ALEKSANDER"], "E2, E1", "vzajemni par brez tretjega: Maglić ima E2 in E1");
}

console.log("5k) DEZ / NEDEZ / NZV / FLEXI niso delovišča");
{
  // Vodja je na dežurni dan v "Moj razpored" videl "Dopoldne (DEZ)".
  // DEZ je pripadnost obtoku dežurstev, ne kraj dela - dopoldne dela na
  // svoji enoti, dežurstvo je šele zvečer. Uporabnikova pripomba.
  const jeDelovisce = sandbox.window.NzvZasedba.jeDelovisce;
  ["DEZ", "NEDEZ", "NZV", "FLEXI", "dez", " flexi ", "", null, undefined]
    .forEach(k => trdi(!jeDelovisce(k), `${JSON.stringify(k)} ni delovišče`));
  ["MO", "ŽO", "PDZN", "C1", "B", "SOBO", "mo"]
    .forEach(k => trdi(jeDelovisce(k), `${JSON.stringify(k)} JE delovišče`));
}

console.log("9) Pregled odstopanj: kje se objavljen razpored ne drži pravil");
{
  // Uporabnikova odločitev (avgust 2026): merodajna so PRAVILA, objavljen
  // razpored pa se ne popravlja sam - odstopanja se samo pokažejo.
  const vnos = (ime, kratica, koda, datum, sifra) => ({
    department_code: koda, pokriva_oddelek: null, work_date: datum, shift_code: sifra || "PRISOTEN",
    created_at: null, created_by: null, updated_at: null,
    profiles: profil(ime, kratica, "vodja"),
  });

  console.log("   a) razpored po pravilih -> nobenega odstopanja");
  {
    // Vsak nosilec na svoji enoti, nihče odsoten.
    const entries = [
      vnos("Džamastagić Denis", "DŽA", "PDZN", "2026-09-01"),
      vnos("Velušček Metka", "VEL", "SOBO", "2026-09-01"),
      vnos("Alukić Dino", "ALU", "ZO", "2026-09-01"),
    ];
    const { odstopanja } = await poglej({ entries });
    const naDan = odstopanja.filter(o => o.datum === "2026-09-01"
      && ["DŽA", "VEL", "ALU"].includes(o.oseba));
    jseq(naDan, [], "nosilci na svojih enotah ne sprožijo odstopanja");
  }

  console.log("   b) nosilec na enoti, ki je pravilo zanj ne predvideva");
  {
    const entries = [vnos("Alukić Dino", "ALU", "MO", "2026-09-01")];
    const { odstopanja } = await poglej({ entries });
    const o = odstopanja.find(x => x.oseba === "ALU" && x.datum === "2026-09-01");
    trdi(!!o && o.vrsta === "napacnaEnota", "Alukić na MO (njegova enota je ŽO) -> napačna enota");
    jseq(o ? o.napacne : [], ["MO"], "javi natanko MO kot napačno");
    trdi(!!o && o.poPravilu.includes("ZO"), "in pove, da bi po pravilu moral biti na ŽO");
  }

  console.log("   c) SESTAVLJENA enota: 'UA/SA' pomeni eno OD dveh, ne obeh hkrati");
  {
    // Bizjak ima enote "UA/SA/B2". Če je samo na URGENCI, to NI odstopanje -
    // prav ta primerjava po celici je prej javljala 41 lažnih odstopanj v
    // septembru 2026 (vsak dan "manjka BIZ na SA" in "manjka BIZ na B1B2").
    const entries = [vnos("Bizjak Tea", "BIZ", "URGENCA", "2026-09-01")];
    const { odstopanja } = await poglej({ entries });
    const o = odstopanja.filter(x => x.oseba === "BIZ" && x.datum === "2026-09-01");
    jseq(o, [], "Bizjak samo na URGENCI ni odstopanje (njena enota je UA/SA/B2)");
  }

  console.log("   d) po pravilu bi moral delati, v razporedu pa ga ni nikjer");
  {
    // Objavimo razpored za ta dan (da izpeljava ne zapolni celic), a brez
    // Veluščkove - čeprav ni odsotna.
    const entries = [
      vnos("Džamastagić Denis", "DŽA", "PDZN", "2026-09-01"),
      vnos("Velušček Metka", "VEL", "PDZN", "2026-09-01"),
    ];
    const { odstopanja } = await poglej({ entries });
    const o = odstopanja.find(x => x.oseba === "VEL" && x.datum === "2026-09-01");
    trdi(!!o && o.vrsta === "napacnaEnota", "Velušček na PDZN namesto na SOBO -> odstopanje");
  }

  console.log("   e) FLEXI (kdor ni nosilec enote) se NE šteje kot odstopanje");
  {
    // Uporabnikova odločitev: FLEXI kader se vpisuje ročno.
    const entries = [vnos("Novak Ana", "NOV", "C", "2026-09-01")];
    const { odstopanja } = await poglej({ entries });
    jseq(odstopanja.filter(o => o.oseba === "NOV"), [],
      "oseba, ki ni med nosilci enot, ni odstopanje");
  }

  console.log("   g) SA DOP in SA POP štejeta kot ENA enota");
  {
    // Kateri teden je dopoldanski, je NASTAVITEV (nzv_nastavitve), ne trdo
    // dejstvo. Če bi stolpca ločevali, bi vsak drug teden javilo lažno
    // odstopanje pri vseh, ki imajo SA v svojih enotah.
    for (const [sifra, opis] of [["Dopoldne", "SA DOP"], ["Popoldne", "SA POP"]]) {
      const entries = [vnos("Bizjak Tea", "BIZ", "SA", "2026-09-01", sifra)];
      const { odstopanja } = await poglej({ entries });
      jseq(odstopanja.filter(o => o.oseba === "BIZ"), [],
        `Bizjak v stolpcu ${opis} ni odstopanje (njena enota je UA/SA/B2)`);
    }
  }

  console.log("   f) enota brez nosilca se ne preverja, a se pove");
  {
    const { odstopanja, enoteBrezNosilca } = await poglej({});
    trdi((enoteBrezNosilca || []).includes("U2"),
      "U2 nima nosilca -> pove se posebej, namesto da bi vsak vpis tam javljal napako");
    jseq(odstopanja.filter(o => o.enota === "U2" || (o.napacne || []).includes("U2")), [],
      "in vpisi na U2 ne sprožijo odstopanja");
  }
}


console.log("10) SOBO: Džamastagić obdrži PDZN in pokrije še SOBO");
{
  // Uporabnikova potrditev, avgust 2026: "ne, ostane na PDZN in pokriva
  // tudi SOBO ... tako je pri njemu." Prej ga je pravilo PRESELILO na SOBO
  // in njegov PDZN je pobral Alukić - na razporedu za september 2026 je to
  // pomenilo 22 lažnih odstopanj, torej vsak delovni dan v mesecu.
  const brezVeluscek = enoteZa(["VELUŠČEK"]);
  eq(brezVeluscek["DŽAMASTAGIĆ DENIS"], "PDZN, SOBO",
    "Velušček odsotna -> Džamastagić ima PDZN IN SOBO");
  eq(brezVeluscek["ALUKIĆ DINO"], "ŽO", "Alukić ostane na svojem ŽO - PDZN ni zapuščen");
  eq(brezVeluscek["BOJIĆ MATEJ"], "MO", "in Bojić na svojem MO");

  // Če Džamastagića ni, pride na vrsto naslednji - prav tako poleg svoje.
  const brezObeh = enoteZa(["VELUŠČEK", "DŽAMASTAGIĆ"]);
  eq(brezObeh["ALUKIĆ DINO"], "ŽO, PDZN, SOBO",
    "ni Veluščkove ne Džamastagića -> Alukić pokrije svoj ŽO, PDZN in SOBO");

  // Nobena od treh enot ne sme izginiti.
  [["brez Veluščkove", brezVeluscek], ["brez obeh", brezObeh]].forEach(([opis, m]) => {
    const vse = Object.values(m).join(", ").split(", ").map(x => x.trim());
    ["PDZN", "SOBO", "ŽO", "MO"].forEach(e => trdi(vse.includes(e), `${opis}: enota ${e} ni izginila`));
  });
}


console.log("11) URGENCA in SA: vrstni red in enakovredni nadomeščevalci");
{
  // Svoji podatki, ker gre za skupino, ki je v ostalih sklopih ni
  // (supabase/nzv-urgenca-sa-vrstni-red.sql). Uporabnikova navedba:
  // "Trpin je prva v urgenci, nato Bizjak" in "Humar je prva SA,
  // nadomesti jo Trpin ali Bizjak ... se določi sproti". Zadnje pomeni
  // ISTO prednost - katera koli od njiju je pravilna rešitev.
  const NOSILCI = [
    { full_name: "HUMAR SAŠA", enote: "SA", odsotnost_tip: null, odsotnost_do: null },
    { full_name: "MUŠIČ INES", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
    { full_name: "TRPIN SAŠA", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
    { full_name: "BIZJAK TEA", enote: "UA/SA/B2", odsotnost_tip: null, odsotnost_do: null },
  ];
  const PARI = [
    { nosilec: "MUŠIČ INES", nadomesca: "TRPIN SAŠA", enota: "UA/SA", prednost: 1 },
    { nosilec: "MUŠIČ INES", nadomesca: "BIZJAK TEA", enota: "UA/SA", prednost: 2 },
    { nosilec: "HUMAR SAŠA", nadomesca: "TRPIN SAŠA", enota: "SA", prednost: 1 },
    { nosilec: "HUMAR SAŠA", nadomesca: "BIZJAK TEA", enota: "SA", prednost: 1 },
    { nosilec: "TRPIN SAŠA", nadomesca: "BIZJAK TEA", enota: "UA/SA", prednost: 1 },
  ];
  const NZ = sandbox.window.NzvZasedba;
  const podrobno = (odsotni) => NZ.razporedDnevaPodrobno({
    nosilci: NOSILCI, pari: PARI, kljuc: sandbox.window.Imena.kljuc,
    jeOdsoten: ime => odsotni.some(o => new RegExp(o, "i").test(ime)),
    saKoda: "SADOP", veljavne: null,
  });

  console.log("   a) URGENCA: ko Mušič ni, jo pokrije TRPIN in ne Bizjak");
  {
    const p = podrobno(["MUŠIČ"]);
    // Prednost 1 je Trpin; Bizjak je 2 in pride na vrsto le, če Trpin ni.
    jseq(p.enakovredni["URGENCA"], undefined,
      "Trpin in Bizjak tu NISTA enakovredni – imata različno prednost");
    const p2 = podrobno(["MUŠIČ", "TRPIN"]);
    const kdo = p2.vrstice.map(v => v.nosilec.full_name);
    trdi(kdo.includes("BIZJAK TEA"), "če ni ne Mušič ne Trpin, vskoči Bizjak");
  }

  console.log("   b) SA: Trpin IN Bizjak sta enakovredni, ko Humar ni");
  {
    const p = podrobno(["HUMAR"]);
    const zaSa = p.enakovredni["SADOP"] || [];
    trdi(zaSa.includes("TRPIN SAŠA") && zaSa.includes("BIZJAK TEA"),
      "obe sta zabeleženi kot enakovredni za SA – " + JSON.stringify(zaSa));
    const izbrane = p.vrstice.filter(v => (v.kode || []).includes("SADOP"));
    trdi(izbrane.length >= 1, "razpored kljub temu izbere eno (predlog mora biti določen)");
  }

  console.log("   c) Ena sama možnost ni 'enakovredna'");
  {
    const p = podrobno(["TRPIN"]);
    jseq(p.enakovredni["URGENCA"], undefined,
      "kjer je nadomeščevalec en sam, se enakovrednih ne zabeleži");
  }

  console.log("   d) Kdor je sam odsoten, ni enakovredna možnost");
  {
    // Če je poleg Humarjeve odsotna še Trpin, ostane ena sama možnost -
    // Bizjak. Takrat ni kaj "določati sproti" in enakovrednih ni.
    const p = podrobno(["HUMAR", "TRPIN"]);
    jseq(p.enakovredni["SADOP"], undefined,
      "odsotna Trpin se ne šteje med enakovredne");
  }

  console.log("   e) Enakovredna nadomeščevalka ni odstopanje");
  {
    // POZOR: pri pravih podatkih sta Trpin in Bizjak OBE nosilki UA/SA,
    // zato njun vpis na SA nikoli ni odstopanje - tudi brez tega pravila.
    // Prvi poskus tega preizkusa je bil zato ZELEN IZ NAPAČNEGA RAZLOGA.
    // Da preizkus res preveri PRAVILO in ne tega naključja, sta tu
    // nadomeščevalki z DRUGIH enot, ki SA sami ne pokrivata.
    const nosilci = [
      { full_name: "HUMAR SAŠA", enote: "SA", odsotnost_tip: null, odsotnost_do: null },
      { full_name: "MAVRI TRATNIK MAGDALENA", enote: "B1", odsotnost_tip: null, odsotnost_do: null },
      { full_name: "LUNAR MATEJA", enote: "B", odsotnost_tip: null, odsotnost_do: null },
    ];
    const pari = [
      { nosilec: "HUMAR SAŠA", nadomesca: "MAVRI TRATNIK MAGDALENA", enota: "SA", prednost: 1, poleg_svoje: true },
      { nosilec: "HUMAR SAŠA", nadomesca: "LUNAR MATEJA", enota: "SA", prednost: 1, poleg_svoje: true },
    ];
    const vnos = (ime, kratica, koda, datum, sifra) => ({
      department_code: koda, pokriva_oddelek: null, work_date: datum, shift_code: sifra || "PRISOTEN",
      created_at: null, created_by: null, updated_at: null, profiles: profil(ime, kratica, "vodja"),
    });
    const { odstopanja } = await poglej({
      vodje: nosilci, nadomescanja: pari,
      entries: [
        vnos("Lunar Mateja", "LUN", "SA", "2026-09-01", "Dopoldne"),
        vnos("Mavri Tratnik Magdalena", "TRA", "B1B2", "2026-09-01"),
      ],
      dopusti: [{ full_name: "Humar Saša", work_date: "2026-09-01", kind: "ld" }],
    });
    jseq(odstopanja.filter(o => o.oseba === "LUN" && o.datum === "2026-09-01"), [],
      "Lunar na SA (enakovredna možnost) ni odstopanje – določi se sproti");
    // Nadzorna točka: kdor NI med enakovrednimi, na isti enoti JE odstopanje.
    const { odstopanja: o2 } = await poglej({
      vodje: nosilci.concat([{ full_name: "ŠUBIC PETRA", enote: "B1", odsotnost_tip: null, odsotnost_do: null }]),
      nadomescanja: pari,
      entries: [vnos("Šubic Petra", "ŠUB", "SA", "2026-09-01", "Dopoldne")],
      dopusti: [{ full_name: "Humar Saša", work_date: "2026-09-01", kind: "ld" }],
    });
    trdi(o2.some(o => o.oseba === "ŠUB" && o.vrsta === "napacnaEnota"),
      "Šubic na SA (ni med nadomeščevalci) PA je odstopanje");
  }
}


console.log("12) URGENCO občasno pokrije kdor koli iz kroga dežurnih");
{
  // Uporabnikova navedba, avgust 2026: "urgenco občasno pokrivamo vsi, ki
  // dežuramo ... zato je tako". Tega ni mogoče vnaprej zapisati kot
  // pravilo nadomeščanja - odloči se sproti - zato vpis takega človeka na
  // URGENCI ni odstopanje. Arnež (nosilec C, je v krogu dežurnih) je bil
  // zaradi tega v septembru 2026 javljen 5-krat.
  const vnos = (ime, kratica, koda, datum) => ({
    department_code: koda, pokriva_oddelek: null, work_date: datum, shift_code: "PRISOTEN",
    created_at: null, created_by: null, updated_at: null, profiles: profil(ime, kratica, "vodja"),
  });
  const nosilci = [
    { full_name: "ARNEŽ GREGA", enote: "C", dezurstvo_dovoljeno: true, odsotnost_tip: null, odsotnost_do: null },
    { full_name: "TRPIN SAŠA", enote: "UA/SA", dezurstvo_dovoljeno: true, odsotnost_tip: null, odsotnost_do: null },
    // Lelič NI v krogu dežurnih (dezurstvo_dovoljeno = false v
    // nzv-nosilci-oddelkov.sql) - zanjo to pravilo ne velja.
    { full_name: "LELIČ DIJANA", enote: "E2", dezurstvo_dovoljeno: false, odsotnost_tip: null, odsotnost_do: null },
  ];

  console.log("   a) kdor dežura, na URGENCI ni odstopanje");
  {
    const { odstopanja } = await poglej({
      vodje: nosilci, nadomescanja: [],
      entries: [vnos("Arnež Grega", "ARN", "URGENCA", "2026-09-01")],
    });
    jseq(odstopanja.filter(o => o.oseba === "ARN"), [],
      "Arnež na URGENCI ni odstopanje – v krogu dežurnih je");
  }

  console.log("   b) kdor NE dežura, na URGENCI PA je odstopanje");
  {
    const { odstopanja } = await poglej({
      vodje: nosilci, nadomescanja: [],
      entries: [vnos("Lelič Dijana", "LEL", "URGENCA", "2026-09-01")],
    });
    trdi(odstopanja.some(o => o.oseba === "LEL" && o.vrsta === "napacnaEnota"),
      "Lelič ni v krogu dežurnih, zato je njen vpis na URGENCI odstopanje");
  }

  console.log("   c) pravilo velja SAMO za URGENCO, ne za druge enote");
  {
    const { odstopanja } = await poglej({
      vodje: nosilci, nadomescanja: [],
      entries: [vnos("Arnež Grega", "ARN", "E2", "2026-09-01")],
    });
    trdi(odstopanja.some(o => o.oseba === "ARN" && (o.napacne || []).includes("E2")),
      "Arnež na E2 je odstopanje – dogovor velja le za URGENCO");
    jseq([...sandbox.ENOTE_KROGA_DEZURNIH], ["URGENCA"],
      "nabor takih enot je natanko ena: URGENCA");
  }
}


console.log("13) Na dopustu IN hkrati v razporedu - svoja vrsta odstopanja");
{
  // V uporabnikovem razporedu za september 2026 sta Torkar (17., 18. 9.)
  // in Trpin (18. 9.) v stolpcu LD in hkrati na svoji enoti. (Tu je
  // uporabljena Lunar, ker Torkar v tem naboru profilov ni - brez profila
  // se oseba šteje za FLEXI in se ne preverja.) Prej se je to
  // pokazalo kot "napačna enota, po pravilu: -", kar ni razumljivo - gre
  // za protislovje v razporedu samem, ne za vprašanje prave enote.
  const vnos = (ime, kratica, koda, datum) => ({
    department_code: koda, pokriva_oddelek: null, work_date: datum, shift_code: "PRISOTEN",
    created_at: null, created_by: null, updated_at: null, profiles: profil(ime, kratica, "vodja"),
  });
  const { odstopanja } = await poglej({
    entries: [vnos("Lunar Mateja", "LUN", "B", "2026-09-01")],
    vodje: [{ full_name: "LUNAR MATEJA", enote: "B", odsotnost_tip: null, odsotnost_do: null }],
    nadomescanja: [],
    dopusti: [{ full_name: "Lunar Mateja", work_date: "2026-09-01", kind: "ld" }],
  });
  const o = odstopanja.find(x => x.oseba === "LUN" && x.datum === "2026-09-01");
  trdi(!!o && o.vrsta === "odsotenAVRazporedu",
    "na dopustu in v razporedu -> vrsta 'odsotenAVRazporedu', ne 'napacnaEnota'");
  jseq(o ? o.vRazporedu : [], ["B"], "pove, kje je vpisan");

  // Nadzorna točka: brez dopusta je isti vpis popolnoma v redu.
  const { odstopanja: o2 } = await poglej({
    entries: [vnos("Lunar Mateja", "LUN", "B", "2026-09-01")],
    vodje: [{ full_name: "LUNAR MATEJA", enote: "B", odsotnost_tip: null, odsotnost_do: null }],
    nadomescanja: [],
  });
  jseq(o2.filter(x => x.oseba === "LUN"), [],
    "brez vpisanega dopusta je Lunar na svojem B brez pripombe");
}

};

test().then(() => {
  console.log("");
  if (napake.length) {
    console.error(`NAPAKE (${napake.length}):`);
    napake.forEach(n => console.error("  - " + n));
    process.exit(1);
  }
  console.log("Vse v redu.");
}).catch(e => { console.error(e); process.exit(1); });
