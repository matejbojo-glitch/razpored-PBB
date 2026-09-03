#!/usr/bin/env node
/* Preizkus obdelajZdravnikiVrstice() (index.html) - uvoz uradnega mesečnega
 * dokumenta "Razporeditev zaposlenih v UA in DEŽ".
 *
 * ZAKAJ JE BIL TA PREIZKUS PRENOVLJEN
 *
 * Prejšnja različica je imela v fixture vgrajeno NAPAČNO predpostavko - da
 * so datum, dnevna kratica in ime "Urgenca ZDR" v ENI celici, "Dežurstvo
 * ZDR" pa v stolpcu 1. Ker je fixture pritrjeval isto napako kot koda, je
 * preizkus veselo prehajal, uporabnik pa je v "Moj razpored" ob dežurstvu
 * videl "DEŽ: TO" in "DEŽ: ČE" - to nista imeni zdravnikov, ampak kratici
 * za torek in četrtek.
 *
 * Fixture spodaj je zdaj DOBESEDEN izpis pdfKoscjiVTabelo na PRAVI
 * datoteki uporabnika (Razporeditev ... september 2026), izmerjen s
 * suhim zagonom. Resnična oblika ima PET stolpcev:
 *
 *   0 datum | 1 dan | 2 Urgenca ZDR | 3 Dežurstvo ZDR | 4 dipl. m.s./zn.
 *
 * in tri pasti, ki jih fixture namenoma vsebuje:
 *   - števke datuma so razbite s presledki ("1 0 . 9 . 2026" = 10. 9.);
 *   - oklepaj z zamenjavo se razlije v naslednji stolpec in ostane
 *     NEZAPRT ("Luka Vučkič ( Špela Žagar Gabron");
 *   - ob vikendih urgentne ambulante ni, zato je stolpec 2 prazen.
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
  let globina = 0;
  const zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  return html.slice(zac, html.indexOf(";\n", zac) + 1).replace(/^const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) { trdi(a === b, opis + (a === b ? "" : ` – dobil "${a}", pričakoval "${b}"`)); }

const sandbox = { console };
sandbox.window = sandbox; // skupni moduli se predstavijo prek window, kot v brskalniku
vm.createContext(sandbox);
vm.runInContext([
  izvleciConst("ZDR_DAN_RX"), izvleciConst("ZDR_PRIVZETI_STOLPCI"),
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani),
  // zato ga naložimo in monthRange samo preimenujemo - enako, kot to
  // naredi index.html.
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  izvleci("zdrDatum"), izvleci("najdiStolpceZdravnikov"),
  izvleci("zdrIme"), izvleci("obdelajZdravnikiVrstice"),
].join("\n\n"), sandbox);
const { obdelajZdravnikiVrstice, zdrDatum, zdrIme, najdiStolpceZdravnikov } = sandbox;

// Dobesedno iz suhega zagona na pravi datoteki (september 2026).
const VRSTICE = [
  ["Zaposleni"],
  ["Zadeva: Razporeditev", "", "zaposlenih v urgentno", "ambulanto in neprekinjeno zdravstveno", "varstvo – september 202 6"],
  ["Dežurstvo"],
  ["", "", "Urgenca ZDR", "Dežurstvo ZDR", ""],
  ["dipl. m.s./zn."],
  ["1 . 9 . 2026",  "TO", "Vanja Hreščak",           "Tjaša Petrič ( Vlade Milanović )",       "Denis Džamastagić"],
  ["2 . 9 . 2026",  "SR", "Maja Stanković",          "Dr. Lea Žmuc Veranič",                   "Maruša Salkić"],
  ["4 . 9 . 2026",  "PE", "Luka Vučkič",             "Nastja Jagodic ( Pia Lapajne )",         "Dino Alukić"],
  ["5 . 9 . 2026",  "SO", "",                        "Maja Stanković",                         "Magdalena Mavri Tratnik"],
  ["1 0 . 9 . 2026","ČE", "Tanja Cebin Skale",       "Matjaž Demšar",                          "Amal Perviz"],
  ["11 . 9 . 2026", "PE", "Špela Žagar Gabron",      "Luka Vučkič ( Špela Žagar Gabron",       ") dr. Tanja Torkar"],
  // Podpisni blok na dnu: datum, ki se NE poveča - tu se branje ustavi.
  ["Velja od: 1 . 9 . 2026", "", "", "", ""],
  ["1 . 9 . 2026", "", "Vlade Milanović", "Denis Džamastagić", ""],
];

console.log("1) datum: presledki med števkami ne smejo pokvariti dneva");
{
  eq(zdrDatum("1 . 9 . 2026"), "2026-09-01", "enomestni dan");
  eq(zdrDatum("1 0 . 9 . 2026"), "2026-09-10", "števka razbita s presledkom (10., ne 1.)");
  eq(zdrDatum("11 . 9 . 2026"), "2026-09-11", "dvomestni dan");
  trdi(zdrDatum("TO") === null, "kratica dneva ni datum");
  trdi(zdrDatum("") === null, "prazna celica ni datum");
  trdi(zdrDatum("Velja od: 1.9.2026") === null, "besedilo pred datumom se ne prizna kot datum");
}

console.log("2) stolpci se poiščejo po GLAVI, ne po fiksnih mestih");
{
  const st = najdiStolpceZdravnikov(VRSTICE);
  eq(st.urgenca, 2, "Urgenca ZDR je stolpec 2");
  eq(st.dezurstvo, 3, "Dežurstvo ZDR je stolpec 3");
  eq(st.sestra, 4, "dipl. m.s./zn. je stolpec 4");
  // Brez glave mora pasti nazaj na znano razporeditev, ne odpovedati.
  const brezGlave = najdiStolpceZdravnikov([["1 . 9 . 2026", "TO", "A", "B", "C"]]);
  eq(brezGlave.urgenca, 2, "brez glave: privzeto stolpec 2");
}

console.log("3) zamenjava v oklepaju: obvelja PRVO ime");
{
  eq(zdrIme("Tjaša Petrič ( Vlade Milanović )"), "Tjaša Petrič", "zaprt oklepaj");
  // V PDF-ju se oklepaj razlije v naslednji stolpec in ostane NEZAPRT -
  // rezanje "od ( do )" bi tu odpovedalo, zato režemo od prvega oklepaja.
  eq(zdrIme("Luka Vučkič ( Špela Žagar Gabron"), "Luka Vučkič", "NEZAPRT oklepaj");
  eq(zdrIme("Matjaž Demšar"), "Matjaž Demšar", "brez oklepaja ostane cel");
  eq(zdrIme("  Dr. Lea  Žmuc   Veranič "), "Lea Žmuc Veranič", "naziv in odvečni presledki se počistijo");
  // Uporabnik je javil prazna dežurstva: uvoz je celico razlomil sredi
  // oklepaja ("(dipl. m.s.\n) Saša Trpin") in v bazo je šel ostanek
  // ") Saša Trpin", ki se ni ujel z nobenim profilom. Vodilna ločila in
  // nazivi zato ne smejo priti skozi.
  eq(zdrIme(") Saša Trpin"), "Saša Trpin", "ostanek ') ' iz razlomljene celice");
  eq(zdrIme(") dr. Tanja Torkar"), "Tanja Torkar", "ostanek ') ' skupaj z nazivom");
  eq(zdrIme("Ana Novak (dipl. m. s.)"), "Ana Novak", "naziv v oklepaju za imenom");
}

console.log("4) uvoz cele tabele");
{
  const { zapisi, najdenDatum } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  trdi(najdenDatum, "najde datume");
  const zaDan = (d, k) => (zapisi.find(z => z.work_date === d && z.kind === k) || {}).full_name;

  // TO JE NAPAKA, KI JO JE UPORABNIK VIDEL: prej je tu pisalo "TO".
  eq(zaDan("2026-09-01", "dezurstvo"), "Tjaša Petrič", "1.9. dežurni zdravnik NI kratica dneva");
  eq(zaDan("2026-09-01", "urgenca"), "Vanja Hreščak", "1.9. urgenca");
  eq(zaDan("2026-09-01", "sestra"), "Denis Džamastagić", "1.9. dežurna dipl. m.s./zn.");
  trdi(!zapisi.some(z => /^(PO|TO|SR|ČE|PE|SO|NE)$/i.test(z.full_name)),
    "NOBEN zapis ni kratica dneva");
  trdi(!zapisi.some(z => z.full_name.includes("(")), "noben zapis ne vsebuje oklepaja");

  eq(zaDan("2026-09-10", "urgenca"), "Tanja Cebin Skale", "10.9. (razbita števka) pristane na pravem dnevu");
  eq(zaDan("2026-09-11", "dezurstvo"), "Luka Vučkič", "11.9. nezaprt oklepaj");
  eq(zaDan("2026-09-11", "sestra"), "Tanja Torkar", "11.9. razlomljena celica ') dr. Tanja Torkar' pride v bazo čista");
  trdi(!zapisi.some(z => /^[^A-Za-zČŠŽĆĐčšžćđ]/.test(z.full_name)),
    "noben zapis se ne začne z ločilom");
}

console.log("5) vikend nima urgentne ambulante");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  trdi(!zapisi.some(z => z.work_date === "2026-09-05" && z.kind === "urgenca"),
    "5.9. (sobota): prazna urgenca ne ustvari praznega zapisa");
  eq((zapisi.find(z => z.work_date === "2026-09-05" && z.kind === "dezurstvo") || {}).full_name,
    "Maja Stanković", "dežurstvo ob soboti se vseeno zabeleži");
}

console.log("6) podpisni blok na dnu ne prepiše pravih dni");
{
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  eq((zapisi.find(z => z.work_date === "2026-09-01" && z.kind === "dezurstvo") || {}).full_name,
    "Tjaša Petrič", "1.9. ostane prvotni zapis, ne 'Denis Džamastagić' iz podpisnega bloka");
  eq(zapisi.filter(z => z.work_date === "2026-09-01").length, 3,
    "za 1.9. natanko trije zapisi (urgenca, dežurstvo, sestra)");
}

console.log("7) drug mesec se ne uvozi");
{
  const { zapisi, najdenDatum } = obdelajZdravnikiVrstice(VRSTICE, "2026-08");
  eq(zapisi.length, 0, "za avgust iz septembrske datoteke ni zapisov");
  trdi(!najdenDatum, "in to se javi kot 'ni najdenih datumov'");
}

console.log("8) tretji krog (dipl. m.s./zn.) se res shrani");
{
  // Uporabnikova zahteva: vsi trije krogi na enem mestu. Prej je ta
  // stolpec odpadel, ker ga omejitev "kind" v bazi ni dovolila.
  const { zapisi } = obdelajZdravnikiVrstice(VRSTICE, "2026-09");
  trdi(zapisi.some(z => z.kind === "sestra"), "vrsta 'sestra' se sploh pojavi");
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");
  // Po konsolidaciji sheme (avgust 2026) je omejitev zapisana v obliki, ki
  // jo izpiše PostgreSQL sam - "kind = ANY (ARRAY['urgenca'::text, ...])" -
  // namesto nekdanjega "kind in ('urgenca', ...)". Pomen je isti, zato
  // sprejmemo OBA zapisa; preverja se, da so dovoljene vse tri vrste.
  const vseTriVrste =
    /kind in \('urgenca', 'dezurstvo', 'sestra'\)/.test(shema) ||
    (/kind = ANY/i.test(shema) &&
      ["urgenca", "dezurstvo", "sestra"].every(v => new RegExp(`'${v}'::text`).test(shema)));
  trdi(vseTriVrste, "shema dovoljuje vse tri vrste");
  const dodatek = readFileSync(join(koren, "supabase", "dodaj-dezurno-sestro.sql"), "utf8");
  trdi(/drop constraint if exists duty_doctors_kind_check/.test(dodatek),
    "za obstoječe baze obstaja ločena skripta");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
