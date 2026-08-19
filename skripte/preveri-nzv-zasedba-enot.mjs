#!/usr/bin/env node
/* Preizkus nalozizPodatkeNzv() (index.html) — zapolnjenost stolpcev enot
 * v NZV mreži.
 *
 * Zakaj obstaja: uporabnik je poslal posnetek zaslona, na katerem so bili
 * stolpci PDZN, SOBO, MO, ŽO … prazni čez cel mesec. Vzrok ni bil manjkajoč
 * podatek, ampak to, da se je mreža polnila IZKLJUČNO iz objavljenih
 * schedule_entries — za vodje pa se dnevni razpored ne objavlja, ker je
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
// NZV_STOLPCI je IIFE čez več vrstic — ";\n" se v njem pojavi že prej.
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
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
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
  izvleciBlok("const NZV_STOLPCI = (() => {", "})();"),
  izvleciConst("NZV_KIND_KODA"),
  izvleciConst("JE_NZV_VLOGA"),
  izvleciConst("saNastavitveIz"),
  izvleciConst("saStolpec"),
  izvleciFn("nzvEnoteVKode"),
  izvleciAsyncFn("nalozizPodatkeNzv"),
].join("\n\n"), sandbox);

// Lažni Supabase odjemalec: vsak from() vrne "thenable", ki se razreši v
// { data } za svojo tabelo — natanko toliko, kolikor nalozizPodatkeNzv
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
  profil("Novak Ana", "NOV", "user"), // navadna sestra — v NZV mrežo NE sodi
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
];
const NADOMESCANJA = [
  { nosilec: "ALUKIĆ DINO", nadomesca: "BOJIĆ MATEJ", enota: "ŽO", prednost: 1 },
  { nosilec: "ALUKIĆ DINO", nadomesca: "DŽAMASTAGIĆ DENIS", enota: "ŽO", prednost: 2 },
  { nosilec: "ARNEŽ GREGA", nadomesca: "LUNAR MATEJA", enota: "C", prednost: 1 },
  { nosilec: "LUNAR MATEJA", nadomesca: "ARNEŽ GREGA", enota: "B", prednost: 1 },
  { nosilec: "SALKIĆ MARUŠA", nadomesca: "ARNEŽ GREGA", enota: "C1", prednost: 1 },
  { nosilec: "MAVRI TRATNIK MAGDALENA", nadomesca: "ŠUBIC PETRA", enota: "B1", prednost: 1 },
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
    eq(podatki["PDZN|2026-09-01"], "DŽA", "torek 1.9. — PDZN");
    eq(podatki["SOBO|2026-09-01"], "VEL", "torek 1.9. — SOBO (samo nosilka Velušček)");
    eq(podatki["MO|2026-09-01"], "BOJ", "torek 1.9. — MO");
    eq(podatki["ZO|2026-09-01"], "ALU", "torek 1.9. — ŽO");
    eq(podatki["PDZN|2026-09-30"], "DŽA", "sreda 30.9. — PDZN (cel mesec, ne le prvi dan)");
    trdi(izpeljano["PDZN|2026-09-01"] === true, "celica je označena kot izpeljana (za bledejši izris)");
  }

  console.log("2) Vikend in praznik ostaneta prazna — delovnik NZV je PON-PET");
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
    // "NOB" ni stolpec v uradni predlogi — ne sme se pojaviti nikjer.
    trdi(!Object.keys(podatki).some(k => k.startsWith("NOB|")), "neznana oznaka \"NOB\" ne ustvari stolpca");
  }

  console.log("3b) Enoto lahko pokriva več nosilcev — parafe se seštejejo, ne prepišejo");
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
    eq(podatki["SADOP|2026-07-08"], "BIZ", "8.7. (sod teden) prav tako dopoldne — poletna izjema");
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

  console.log("4) Trajna odsotnost (porodniška) — nosilka se ne vpisuje");
  {
    const { podatki } = await poglej();
    eq(podatki["E1|2026-09-01"] || "", "", "Pogačnik Teja je na porodniški do 31.7.2027 — E1 ostane prazen");
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

console.log("5b) Veriga se ustavi pri tretjem - ta se NE preseli");
{
  const { podatki } = await poglej({
    dopusti: [{ full_name: "Salkić Maruša", work_date: "2026-09-02", kind: "ld" }],
  });
  // Lunar je tretji: dobi C POLEG B. Če bi se tudi ona preselila, bi B
  // ostal prazen in veriga bi tekla v nedogled.
  trdi((podatki["B|2026-09-02"] || "").includes("LUN") && (podatki["C|2026-09-02"] || "").includes("LUN"),
    "tretji je na OBEH enotah hkrati");
}

console.log("5c) Če je prvi nadomeščevalec tudi odsoten, vskoči drugi");
{
  const { podatki } = await poglej({
    dopusti: [
      { full_name: "Dino Alukić", work_date: "2026-09-02", kind: "ld" },
      { full_name: "Bojić Matej", work_date: "2026-09-02", kind: "bs" },
    ],
  });
  eq(podatki["ZO|2026-09-02"], "DŽA", "ŽO prevzame drugi po prednosti");
  eq(podatki["PDZN|2026-09-02"] || "", "", "Džamastagić je preseljen - na svojem PDZN ga ni");
}

console.log("5d) Nihče ne more biti hkrati preseljen in prevzemnik");
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
    eq(podatki["MO|2026-09-01"] || "", "", "Bojić je tisti dan že v mreži — na MO se ne podvoji");
    eq(podatki["ZO|2026-09-01"], "ALU", "ostali nosilci so nedotaknjeni");
    eq(podatki["PDZN|2026-09-02"], "DŽA", "naslednji dan brez objave se izpeljava spet uporabi");
  }

  console.log("7) Navadni uporabniki (vloga user) v NZV mrežo ne pridejo");
  {
    const { podatki } = await poglej({
      vodje: [...VODJE, { full_name: "NOVAK ANA", enote: "D", odsotnost_tip: null, odsotnost_do: null }],
    });
    eq(podatki["D|2026-09-01"] || "", "", "Novak Ana ima vlogo user — stolpec D ostane prazen");
  }

  console.log("8) Brez tabel nadomescanja/lead_departments mreža deluje kot prej (ne sesuje se)");
  {
    const { podatki, izpeljano } = await poglej({ vodje: [], nadomescanja: [] });
    eq(Object.keys(izpeljano).length, 0, "nič izpeljanega");
    eq(Object.keys(podatki).length, 0, "mreža je prazna, a brez napake");
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
