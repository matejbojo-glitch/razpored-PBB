#!/usr/bin/env node
/* Preizkus NZV Google Sheets krogov (index.html) na fixture-ju v obliki
 * resničnega dokumenta "Letni dopusti in omejitve za NZV" (dan × enota
 * mreža, DATUM | PDZN | SOBO | … | DB | SA DOP | SA POP | URGENCA | U2 |
 * DEŽURSTVO | LD | IZOB | BS), ki ga je uporabnik poslal kot posnetke
 * zaslona za avgust/september 2026.
 *
 * Preverja tri stvari, ki jih ni mogoče zanesljivo preveriti samo z branjem
 * kode:
 *  1) nazivVKodo/NZV_STOLPCI se ujemata z resničnim vrstnim redom stolpcev
 *     predloge (SA DOP/SA POP MED DB in URGENCA, ne na koncu);
 *  2) pripraviPosodobitveNzv (zapis nazaj) najde PRAVE koordinate (vrstica,
 *     stolpec) za enote IN za nove LD/IZOB/BS stolpce, prek prazne vmesne
 *     vrstice, ne glede na to, v katerem vrstnem redu je resnični dokument
 *     stolpce dejansko zložil (glava se bere iz lista, ne iz NZV_STOLPCI);
 *  3) uvoziNzv razdeli uvožene vrstice na "razpored" (schedule_entries) in
 *     "odsotnost" (leave_entries) glede na stolpec - LD/IZOB/BS gredo v
 *     drugo tabelo kot enote, ker gre za drugačno vrsto podatka.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html (ne prepisane tu), zato
 * preizkus ne more zaostati za kodo.
 *
 * Zagon: node skripte/preveri-nzv-sheets.mjs
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
// NZV_ENOTE/NZV_STOLPCI/NZV_KIND_KODA so večvrstični const-i, ne funkcije -
// izvlečemo od deklaracije do prvega ";" na koncu izraza.
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  const konec = html.indexOf(";\n", zac);
  if (konec === -1) throw new Error("Konec konstante " + ime + " ni najden.");
  return html.slice(zac, konec + 1);
}
// NZV_STOLPCI je IIFE ("const X = (() => { ... })();") - vsebuje svoj lasten
// ";\n" SREDI izraza, zato navadni izvleciConst (prvi ";\n") ne zadostuje;
// tu poravnamo zavite oklepaje kot pri izvleci() za funkcije.
function izvleciConstIife(ime) {
  const zac = html.indexOf("const " + ime + " = (() => {");
  if (zac === -1) throw new Error("IIFE konstante " + ime + " ni v index.html.");
  const zacTelo = html.indexOf("{", zac);
  let globina = 0, i = zacTelo;
  for (; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) break; }
  }
  const konec = html.indexOf(";\n", i);
  if (konec === -1) throw new Error("Konec IIFE konstante " + ime + " ni najden.");
  return html.slice(zac, konec + 1);
}

// vm.runInContext ne izpostavi top-level "const"/"let" kot lastnosti
// sandbox objekta (za razliko od "var"/"function") - za konstante, ki jih
// preizkus potrebuje NAZAJ iz sandboxa (ne samo funkcije), zato preslikamo
// v "var" pred izvedbo.
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani),
  // zato ga naložimo in monthRange samo preimenujemo - enako, kot to
  // naredi index.html.
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  // NZV_ENOTE/NZV_STOLPCI zdaj kažeta na skupni nzv-zasedba.js (prej sta
  // bila zapisana v index.html), zato mora biti modul naložen PRED njima.
  readFileSync(join(koren, "imena.js"), "utf8"),
  readFileSync(join(koren, "nzv-zasedba.js"), "utf8"),
  constVKotVar(izvleciConst("NZV_ENOTE")),
  izvleci("razvrstiSA"),
  constVKotVar(izvleciConst("NZV_STOLPCI")),
  constVKotVar(izvleciConst("NZV_KIND_KODA")),
  izvleci("nzvNazivVKodo"),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  izvleci("pripraviPosodobitveNzv"),
  constVKotVar(izvleciConst("NZV_ODSOTNOST_KIND")),
  izvleci("nzvKljucGlave"),
  izvleci("nzvNazivVKodoNorm"),
  izvleciVrstico("const NZV_GLAVA_NAJVEC_NAZAJ"),
  izvleciVrstico("const NZV_GLAVA_NAJMANJ_ZADETKOV"),
  izvleci("poisciEnoteNzv"),
  izvleciVrstico("const NAZIV_OSEBE_RX"),
  izvleci("ocistiNazivOsebe"),
  "var imenaSeUjemataNzv = window.Imena.seUjemata;",
  izvleci("nzvZapisZaStolpec"),
  // zdruziNzvZapise je zdaj v skupnem nzv-zasedba.js (uporablja ga tudi
  // objava razporeda NZV iz Generatorja), zato se vzame od tam.
  "var zdruziNzvZapise = window.NzvZasedba.zdruziNzvZapise;",
  izvleci("nzvVnosiIzMreze"),
  izvleci("obdelajNzvVrstice"),
].join("\n\n");

// "window" mora kazati na sam sandbox, ker skupni moduli (imena.js,
// nzv-zasedba.js) nanj obesijo svoje objekte. Vsebina prejšnjega
// nadomestka (ImportUtils) se zato prestavi naravnost v sandbox.
const sandbox = { console };
sandbox.window = sandbox;
sandbox.ImportUtils = { normalizirajDatum: normalizirajDatum };
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
const { NZV_STOLPCI, nzvNazivVKodo, pripraviPosodobitveNzv } = sandbox;

console.log("0) vrstni red NZV_STOLPCI ustreza uradni predlogi (SA DOP/SA POP MED DB in URGENCA)");
{
  const kode = NZV_STOLPCI.map(([k]) => k);
  const dbIdx = kode.indexOf("DB"), sadopIdx = kode.indexOf("SADOP"), sapopIdx = kode.indexOf("SAPOP"), urgencaIdx = kode.indexOf("URGENCA");
  trdi(dbIdx < sadopIdx && sadopIdx < sapopIdx && sapopIdx < urgencaIdx, "DB < SA DOP < SA POP < URGENCA v prikaznem vrstnem redu");
}

// Fixture po obliki resnične predloge "Letni dopusti in omejitve za NZV"
// (glave stolpcev DATUM | PDZN | … | DB | SA DOP | SA POP | URGENCA | U2 |
// DEŽURSTVO | LD | IZOB | BS, mesečni naslov eno vrstico nad glavo).
function vrstica(datum, vrednosti) { return [datum, ...vrednosti]; }
const GLAVA = ["PDZN", "SOBO", "ŽO", "E1", "E2", "D", "MO", "B", "C", "C1", "PO", "A", "B1,B2", "DB", "SA DOP", "SA POP", "URGENCA", "U2", "DEŽURSTVO", "LD", "IZOB", "BS"];
const SEPTEMBER_GLAVA = [...GLAVA]; // ista glava, ampak SVOJA vrstica v listu - preverja, da se blok ne "spomni" napačne

const vrsteVrstic = [
  ["Razpored AVGUST 2026", ...GLAVA.slice(1).map(() => "")],
  ["", ...GLAVA],
  vrstica("1. 8. 2026", ["KAR", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "BOJ", "NOV, PET", "", ""]),
  vrstica("2. 8. 2026", ["KAR", "", "", "", "", "", "", "", "", "", "", "", "", "", "DOL", "", "", "", "SAL", "NOV", "", "REJ"]),
  [], // prazna vrstica sredi bloka
  vrstica("3. 8. 2026", ["ZEK", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "DOL", "", "", "TRP", "", "REJ", ""]),
  [],
  ["v1: 6.8.2026 ob 13:15"],
  [],
  ["Razpored pripravil:", "Denis Džamastagić"],
  [],
  ["Razpored SEPTEMBER 2026", ...GLAVA.slice(1).map(() => "")],
  ["", ...SEPTEMBER_GLAVA],
  vrstica("1. 9. 2026", ["ZEK", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "BOJ", "", "NOV", ""]),
];

console.log("1) avgustovski blok – enote IN LD/IZOB/BS najdejo prave koordinate");
{
  const podatki = { "PDZN|2026-08-01": "KAR", "DEZ|2026-08-01": "BOJ", "LD|2026-08-01": "NOV, PET" };
  const { posodobitve, najdenDatum, najdenaGlava } = pripraviPosodobitveNzv(vrsteVrstic, "2026-08", podatki);
  trdi(najdenDatum, "najde vrstice za avgust");
  trdi(najdenaGlava, "najde vrstico z glavami enot nad avgustovskim blokom");
  // vrstica z indeksom 2 je 1.8.2026; PDZN je stolpec 1 (offset=1, prvi v glavi).
  const pdzn = posodobitve.find(p => p.vrstica === 2 && p.stolpec === 1);
  jseq(pdzn, { vrstica: 2, stolpec: 1, vrednost: "KAR" }, "PDZN / 1.8. -> vrstica 2, stolpec 1, trenutna vrednost iz aplikacije");
  const dezIdx = 1 + GLAVA.indexOf("DEŽURSTVO");
  const dez = posodobitve.find(p => p.vrstica === 2 && p.stolpec === dezIdx);
  jseq(dez, { vrstica: 2, stolpec: dezIdx, vrednost: "BOJ" }, "DEŽURSTVO / 1.8. -> najde svoj stolpec po nazivu, ne po fiksnem indeksu");
  const ldIdx = 1 + GLAVA.indexOf("LD");
  const ld = posodobitve.find(p => p.vrstica === 2 && p.stolpec === ldIdx);
  jseq(ld, { vrstica: 2, stolpec: ldIdx, vrednost: "NOV, PET" }, "LD / 1.8. -> nov stolpec (odsotnost, ne enota) najden po nazivu");
  // Prazna vrstica sredi avgustovskega bloka (med 2.8. in 3.8.) ne sme prekiniti bloka.
  const zek3avg = posodobitve.find(p => p.vrstica === 5 && p.stolpec === 1);
  trdi(!!zek3avg, "blok se nadaljuje TUDI čez prazno vrstico sredi avgustovskega bloka");
  trdi(posodobitve.every(p => p.vrstica !== 7 && p.vrstica !== 9), "podpisni/verzijski blok (v1:/Razpored pripravil) ni med posodobitvami");
}

console.log("2) septembrski blok – svoja glava, ne pobere avgustovskih vrednosti");
{
  const podatki = { "PDZN|2026-09-01": "ZEK" }; // september nima vrednosti za DEZ/LD, samo PDZN
  const { posodobitve } = pripraviPosodobitveNzv(vrsteVrstic, "2026-09", podatki);
  const pdzn = posodobitve.find(p => p.vrstica === 13 && p.stolpec === 1);
  jseq(pdzn, { vrstica: 13, stolpec: 1, vrednost: "ZEK" }, "PDZN / 1.9. -> vrstica 13 (lastna glava septembra, ne avgustova)");
  const dezIdx = 1 + GLAVA.indexOf("DEŽURSTVO");
  const dezSept = posodobitve.find(p => p.vrstica === 13 && p.stolpec === dezIdx);
  jseq(dezSept, { vrstica: 13, stolpec: dezIdx, vrednost: "" }, "DEŽURSTVO / 1.9. -> prazno (v aplikaciji za ta dan ni vpisa), ne avgustovo BOJ");
}

console.log("3) uvoziNzv loči enote (schedule_entries) od LD/IZOB/BS (leave_entries)");
{
  const nazivVKodo = nzvNazivVKodo();
  jseq(nazivVKodo["PDZN"], "PDZN", "PDZN se prevede v kodo enote");
  jseq(nazivVKodo["LD"], "LD", "LD se prevede v svojo kodo (ne v enoto)");
  trdi(sandbox.NZV_ODSOTNOST_KIND["LD"] === "ld" && sandbox.NZV_ODSOTNOST_KIND["IZOB"] === "sti" && sandbox.NZV_ODSOTNOST_KIND["BS"] === "bs",
    "NZV_ODSOTNOST_KIND preslika LD/IZOB/BS v leave_entries.kind ld/sti/bs");
}

console.log("4) PRAVA oblika datoteke: prazna vrstica med glavo in prvim datumom");
{
  // Uporabnikova datoteka "Letni dopusti in omejitve za NZV" ima na VSEH 20
  // mesečnih listih: naslov (vrstica 1), glava (vrstica 2), PRAZNA vrstica
  // (3), prvi datum (4). Prejšnji poisciEnoteNzv je pogledal natanko eno
  // vrstico višje, tam našel prazno in vrnil null - zato se glava ni našla
  // NIKOLI in uvoz je tiho prinesel NIČ. Fixture zgoraj tega ni ujel, ker
  // ima glavo neposredno nad datumom.
  //
  // Glava je tu zapisana tako, kot je v resnični datoteki: "B1, B2" s
  // presledkom (aplikacija sama piše "B1,B2").
  const G = ["PDZN", "SOBO", "ŽO", "E1", "E2", "D", "MO", "B", "C", "C1", "PO", "A",
             "B1, B2", "DB", "SA DOP", "SA POP", "URGENCA", "U2", "DEŽURSTVO", "LD", "IZOB", "BS"];
  const prazna = G.map(() => "");
  const vrsticaZa = (datum, v) => [datum, ...G.map((_, i) => v[i] || "")];
  const list = [
    ["SEPTEMBER 2026"],
    ["DATUM", ...G],
    [],                                   // <- prav ta vrstica je vse podrla
    vrsticaZa("2026-09-01", ["DŽA", "DŽA", "ALU", "LEL", "LEL, SOF", "PER", "ALU", "ARN", "ARN", "SAL",
                             "TOM", "TOM", "TRA", "TOR", "HUM", "", "TRP", "DŽA",
                             "Denis Džamastagić", "BOJ,VEL, MIS", "", "MUŠ"]),
    vrsticaZa("2026-09-09", prazna.map((_, i) => G[i] === "SA POP" ? "TRP" : "")).map((c, i) =>
      i === 1 + G.indexOf("DEŽURSTVO") ? "Saša Trpin" : c),
  ];
  const parafe = ["DŽA", "ALU", "LEL", "SOF", "PER", "ARN", "SAL", "TOM", "TRA", "TOR", "HUM", "TRP",
                  "BOJ", "VEL", "MIS", "MUŠ"];
  const poParafi = {};
  parafe.forEach(p => { poParafi[p] = { id: p, full_name: p }; });
  const profili = [{ id: "DŽA", full_name: "Denis Džamastagić" }, { id: "TRP", full_name: "Saša Trpin" }];
  const r = sandbox.obdelajNzvVrstice(list, "2026-09", poParafi, "me", profili);

  trdi(r.najdenaGlava, "glava se najde TUDI čez prazno vrstico (prej se ni nikoli)");
  trdi(r.zapisi.length > 0, "uvoz sploh kaj prinese");
  jseq([...r.neujemanja], [], "vse parafe in imena se ujamejo");

  const najdi = (id, datum) => r.zapisi.find(z => z.employee_id === id && z.work_date === datum);
  // Isto pravilo kot nalozizPodatkeNzv: če je pokriva_oddelek izpolnjen, je
  // v njem CEL seznam stolpcev in je merodajen; sicer velja department_code
  // (pri SA se dopoldan/popoldan razbere iz izmene).
  const enoteZa = (z) => {
    const izPokrivanja = String(z.pokriva_oddelek || "").split("/").map(x => x.trim()).filter(Boolean);
    const kode = izPokrivanja.length
      ? izPokrivanja.slice()
      : [z.department_code === "SA" ? sandbox.razvrstiSA(z.shift_code) : z.department_code];
    if (/^DEŽURSTVO$/i.test(z.shift_code) && !kode.includes("DEZ")) kode.push("DEZ");
    return kode;
  };

  // Glava s presledkom.
  const tra = najdi("TRA", "2026-09-01");
  trdi(!!tra && enoteZa(tra).includes("B1B2"), '"B1, B2" s presledkom se ujame z B1B2 (prej je cel stolpec odpadel)');

  // Ena oseba, več enot.
  const dza = najdi("DŽA", "2026-09-01");
  jseq(dza ? enoteZa(dza).sort() : [], ["DEZ", "PDZN", "SOBO", "U2"],
    "Džamastagić je 1.9. na PDZN, SOBO IN U2 - in hkrati dežuren");
  trdi(dza && dza.shift_code === "DEŽURSTVO", "dežurstvo obvelja kot izmena, enote pa se ohranijo");
  const lel = najdi("LEL", "2026-09-01");
  jseq(lel ? enoteZa(lel).sort() : [], ["E1", "E2"], "Lelič je na E1 in E2");
  const arn = najdi("ARN", "2026-09-01");
  jseq(arn ? enoteZa(arn).sort() : [], ["B", "C"], "Arnež je na B in C");

  // Baza dovoli EN zapis na osebo in dan - to je bil vir izgube.
  const kljuci = r.zapisi.map(z => z.employee_id + "|" + z.work_date);
  jseq(kljuci.length, new Set(kljuci).size, "noben par oseba+dan se ne ponovi (unique v schedule_entries)");

  // SA POP + dežurstvo hkrati: pol dneva se ne sme izgubiti.
  const trp = najdi("TRP", "2026-09-09");
  trdi(!!trp && enoteZa(trp).includes("SAPOP"),
    "Trpin je 9.9. na SA POP in hkrati dežurna - stolpec ostane SA POP, ne SA DOP");
  trdi(!!trp && !enoteZa(trp).includes("SADOP"), "in NE pristane hkrati v SA DOP");
}

console.log("5) nič se ne izgubi: vsaka celica lista je najdena v uvoženih zapisih");
{
  // Isti krog kot pri preverjanju prave datoteke: vsak trojček
  // (datum, stolpec, oseba) iz lista se mora dati prebrati nazaj iz
  // uvoženih zapisov - ne več, ne manj.
  const G = ["PDZN", "SOBO", "ŽO", "E1", "E2", "SA DOP", "SA POP", "DEŽURSTVO", "LD", "BS"];
  const list = [
    ["AVGUST 2026"], ["DATUM", ...G], [],
    ["2026-08-03", "DŽA", "DŽA", "ALU", "LEL", "LEL, SOF", "HUM", "", "Dino Alukić", "BOJ, VEL", "MUŠ"],
    ["2026-08-04", "DŽA", "", "ALU", "MAG", "LEL", "", "TRP", "Saša Trpin", "VEL", ""],
  ];
  const parafe = ["DŽA", "ALU", "LEL", "SOF", "HUM", "TRP", "BOJ", "VEL", "MUŠ", "MAG"];
  const poParafi = {}; parafe.forEach(p => { poParafi[p] = { id: p, full_name: p }; });
  const profili = [{ id: "ALU", full_name: "Dino Alukić" }, { id: "TRP", full_name: "Saša Trpin" }];
  const r = sandbox.obdelajNzvVrstice(list, "2026-08", poParafi, "me", profili);

  const KODA = { "PDZN": "PDZN", "SOBO": "SOBO", "ŽO": "ZO", "E1": "E1", "E2": "E2",
                 "SA DOP": "SADOP", "SA POP": "SAPOP", "DEŽURSTVO": "DEZ" };
  const IME = { "Dino Alukić": "ALU", "Saša Trpin": "TRP" };
  const pricakovano = new Set(), pricakovaneOds = new Set();
  list.slice(3).forEach(v => G.forEach((n, i) => {
    const c = (v[1 + i] || "").trim(); if (!c) return;
    if (n === "DEŽURSTVO") { pricakovano.add(`${v[0]}|DEZ|${IME[c]}`); return; }
    if (n === "LD" || n === "BS") {
      c.split(",").map(x => x.trim()).filter(Boolean)
        .forEach(p => pricakovaneOds.add(`${v[0]}|${n}|${p}`));
      return;
    }
    c.split(",").map(x => x.trim()).filter(Boolean)
      .forEach(p => pricakovano.add(`${v[0]}|${KODA[n]}|${p}`));
  }));

  const dobljeno = new Set();
  r.zapisi.forEach(z => {
    const prim = z.department_code === "SA" ? sandbox.razvrstiSA(z.shift_code) : z.department_code;
    const izPokrivanja = String(z.pokriva_oddelek || "").split("/").map(x => x.trim()).filter(Boolean);
    const kode = izPokrivanja.length ? izPokrivanja : [prim];
    if (/^DEŽURSTVO$/i.test(z.shift_code) && !kode.includes("DEZ")) kode.push("DEZ");
    kode.forEach(k => dobljeno.add(`${z.work_date}|${k}|${z.employee_id}`));
  });
  const dobljeneOds = new Set(r.dopusti.map(d => `${d.work_date}|${{ ld: "LD", bs: "BS" }[d.kind]}|${d.full_name}`));

  const izgubljeno = [...pricakovano].filter(x => !dobljeno.has(x))
    .concat([...pricakovaneOds].filter(x => !dobljeneOds.has(x)));
  const odvec = [...dobljeno].filter(x => !pricakovano.has(x));
  jseq(izgubljeno, [], `nobena od ${pricakovano.size + pricakovaneOds.size} celic se ne izgubi`);
  jseq(odvec, [], "in nič se ne pojavi na mestu, kjer tega v listu ni");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
