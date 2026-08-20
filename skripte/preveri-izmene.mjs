#!/usr/bin/env node
/* Preizkus izmene.js – uradna legenda, barve in razvrstitev izmen.
 *
 * Zakaj obstaja: iste stvari so bile na treh mestih in vsako je poznalo
 * drug del resnice – imenik.html polno uradno legendo (19 kratic z
 * natančnimi barvami), index.html in admin.html pa vsak svojo grobo
 * razvrstitev v 7 oz. 5 skupin. Posledica: ista izmena je bila v Imeniku
 * ena barva in v Razporedu druga.
 *
 * Najpomembnejši del je 1. sklop: razvrstitev je zdaj skupna, zato na
 * naboru resničnih kod dokažemo, da se izid NI SPREMENIL – ne za
 * Razpored (index.html) ne za Generator (admin.html). Stari različici
 * sta tu prepisani dobesedno, tako kot sta bili pred poenotenjem.
 *
 * Zagon: node skripte/preveri-izmene.mjs
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
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
const I = sandbox.window.Izmene;

// ---------------------------------------------------------------------
// Stari, PODVOJENI različici – prepisani dobesedno iz index.html in
// admin.html, kakršni sta bili pred poenotenjem. Služita samo kot merilo.
// ---------------------------------------------------------------------
function staraRazpored(sifra) {
  const t = (sifra || "").toLowerCase().replace(/\s+/g, "");
  if (t.startsWith("dežurstvo") || t.startsWith("dezurstvo")) return "dez";
  if (t.startsWith("ld")) return "ld";
  if (t.startsWith("kpu")) return "off";
  if (t.startsWith("prisoten")) return "dop";
  if (t.includes("nočna12")) return "h12";
  if (t.includes("dnevna12")) return "h12";
  if (t.startsWith("nočna")) return "noc";
  if (t.startsWith("dopoldan")) return "dop";
  if (t.startsWith("popoldan")) return "pop";
  return "off";
}
function staraGenerator(sifra) {
  const t = (sifra || "").toLowerCase().replace(/\s+/g, "");
  if (t.startsWith("ld")) return "off";
  if (t.startsWith("kpu")) return "off";
  if (t.includes("nočna12")) return "h12";
  if (t.includes("dnevna12")) return "h12";
  if (t.startsWith("nočna")) return "noc";
  if (t.startsWith("dopoldan")) return "dop";
  if (t.startsWith("popoldan")) return "pop";
  return "off";
}

// Vse kode, ki jih aplikacija dejansko sreča: celoten besednjak
// generatorja (generator-core.js PAT/PAT_H), uradna legenda in zapisi, ki
// prihajajo iz Google Sheets (s presledki, z veliko/malo začetnico).
const KODE = [
  "", null, undefined, "prost", "prosto",
  "dopoldan", "popoldan", "popoldan do 19", "popoldan do 19h", "popoldan do 20",
  "NOČNA", "NOČNA od 19", "NOČNA od 19h", "NOČNA12", "NOČNA 12",
  "DNEVNA12", "DNEVNA 12", "DNEVNA12 (7-19)", "DNEVNA 12F", "DNEVNA12F",
  "KPU", "LD", "POMOČ DRUGJE", "DEŽURSTVO", "PRISOTEN", "PRISOTEN + DEŽURSTVO",
  "BS", "STI", "POR",
  "dop. 7.h-13.h", "pop. 14.h-20.h", "dopoldan (6h)", "dopoldan (4h)", "popoldan (4h)",
  "nekaj čisto drugega",
];

console.log("1) razvrstitev se s poenotenjem NI spremenila");
{
  const razlikeR = KODE.filter(k => I.skupina(k) !== staraRazpored(k));
  trdi(razlikeR.length === 0, `Razpored: vseh ${KODE.length} kod da isti izid kot prej`
    + (razlikeR.length ? " – razlike: " + razlikeR.map(k => `${JSON.stringify(k)}: ${staraRazpored(k)}→${I.skupina(k)}`).join(", ") : ""));

  const razlikeG = KODE.filter(k => I.skupinaGeneratorja(k) !== staraGenerator(k));
  trdi(razlikeG.length === 0, `Generator: vseh ${KODE.length} kod da isti izid kot prej`
    + (razlikeG.length ? " – razlike: " + razlikeG.map(k => `${JSON.stringify(k)}: ${staraGenerator(k)}→${I.skupinaGeneratorja(k)}`).join(", ") : ""));
}

console.log("2) razvrstitvi se RAZLIKUJETA točno tam, kjer se morata");
{
  // Kdor je na dopustu ali dežuren, NI na izmeni na oddelku - generator
  // ga zato ne sme šteti k zasedbi. To je edina razlika in mora ostati.
  eq(I.skupina("LD"), "ld", "Razpored: letni dopust ima svojo barvo");
  eq(I.skupinaGeneratorja("LD"), "off", "Generator: letni dopust ne šteje k zasedbi");
  eq(I.skupina("DEŽURSTVO"), "dez", "Razpored: dežurstvo ima svojo barvo");
  eq(I.skupinaGeneratorja("DEŽURSTVO"), "off", "Generator: dežurstvo ni izmena na oddelku");
  eq(I.skupina("PRISOTEN"), "dop", "Razpored: vodja na svoji enoti šteje kot dopoldan");
  eq(I.skupinaGeneratorja("PRISOTEN"), "off", "Generator: vodja ni v oddelčni zasedbi");
  // Povsod drugod morata biti enaki.
  const drugod = KODE.filter(k => !/^(ld|dežurstvo|prisoten)/i.test(String(k || "").trim()));
  const neujemanja = drugod.filter(k => I.skupina(k) !== I.skupinaGeneratorja(k));
  trdi(neujemanja.length === 0, "drugod sta razvrstitvi enaki"
    + (neujemanja.length ? " – razhajata se pri: " + neujemanja.map(k => JSON.stringify(k)).join(", ") : ""));
}

console.log("3) uradna legenda je popolna in nedvoumna");
{
  eq(I.KRATICE.length, 19, "19 vrstic uradne legende");
  const kratice = I.KRATICE.map(v => v[1]);
  eq(new Set(kratice).size, kratice.length, "nobena kratica se ne ponovi");
  const predolge = kratice.filter(k => k.length > 3 && k !== "DF12");
  trdi(predolge.length === 0, "kratice so največ 3 znaki (edina izjema DF12)"
    + (predolge.length ? " – predolge: " + predolge.join(", ") : ""));
  const brezBarve = I.KRATICE.filter(v => !/^#[0-9A-Fa-f]{6}$/.test(v[4]));
  trdi(brezBarve.length === 0, "vsaka vrstica ima veljavno barvo"
    + (brezBarve.length ? " – brez: " + brezBarve.map(v => v[1]).join(", ") : ""));
  const barve = I.KRATICE.map(v => v[4].toUpperCase());
  eq(new Set(barve).size, barve.length, "nobeni dve izmeni nimata iste barve (sicer se v mreži ne ločita)");
}

console.log("4) barve in kratice za resnične kode");
{
  // Vrstni red v legendi je pomemben: bolj določena pravila morajo stati
  // pred splošnimi, sicer izmena pade na napačno vrstico.
  eq(I.kratica("DNEVNA12 (7-19)"), "DF12", "DNEVNA12 (7-19) ni D12");
  eq(I.kratica("DNEVNA12"), "D12", "navadna DNEVNA12 pa je");
  eq(I.kratica("NOČNA od 19"), "N11", "nočna od 19 ni navadna nočna");
  eq(I.kratica("NOČNA"), "N10", "navadna nočna");
  eq(I.kratica("popoldan do 20"), "PO6", "popoldan do 20");
  eq(I.kratica("popoldan do 19"), "PO5", "popoldan do 19");
  eq(I.kratica("popoldan"), "PO7", "navaden popoldan");
  eq(I.kratica("dopoldan (6h)"), "DO6", "omejitev 6 ur");
  eq(I.kratica("popoldan (4h)"), "PO4", "omejitev 4 ure - pred splošnim popoldnem");
  eq(I.kratica("PRISOTEN"), "DOP", "PRISOTEN je po uradni datoteki dopoldan");
  eq(I.kratica("prost"), "", "'prost' je prost dan, ne kratica");
  eq(I.kratica("nekaj čisto drugega"), "NEK", "neznana koda se ne izgubi tiho");
  eq(I.barva("nekaj čisto drugega"), "#8B8672", "neznana koda dobi nevtralno sivo");
  eq(I.barva(""), I.STANJE_BARVA.prosto.barva, "prazno je barva prostega dne");
}

console.log("4b) odstranjene kode (DF7, DP7, POM) se obravnavajo kot neznane");
{
  // Uporabnikova odločitev (avgust 2026): navzkrižno pokrivanje se ne
  // vodi več kot svoja izmena, "Pomoč na drugem oddelku" pa ni več v
  // legendi. Nobena od teh kod ne sme ostati v legendi …
  ["DF7", "DP7", "POM"].forEach(k => trdi(!I.poKratici(k), `kratice ${k} ni več v legendi`));
  // … in če se taka koda vseeno pojavi (stari objavljeni razporedi jo
  // še vsebujejo), se mora obravnavati kot NEZNANA: siva, a z vidnim
  // besedilom - tiho prazna celica bi izgledala kot prost dan.
  eq(I.barva("POMOČ DRUGJE"), "#8B8672", "POMOČ DRUGJE dobi nevtralno sivo");
  eq(I.kratica("POMOČ DRUGJE"), "POM", "in ostane vidna kot 'POM'");
  eq(I.stanje("POMOČ DRUGJE"), "delo", "šteje se kot delo, ne kot prost dan");
  // Štetje pokritosti ostane, kar je bilo: "POMOČ DRUGJE" je bila že prej
  // izvzeta po imenu v admin.html, ne prek legende.
  eq(I.skupinaGeneratorja("POMOČ DRUGJE"), "off", "in se ne šteje k zasedbi izmene");
}

console.log("5) pisava je berljiva na vsaki barvi iz legende");
{
  const neberljive = I.KRATICE.filter(v => {
    const t = I.barvaBesedila(v[4]);
    return t !== "#FFFFFF" && t !== "#2B2717";
  });
  trdi(neberljive.length === 0, "vsaka barva dobi belo ali temno pisavo");
  eq(I.barvaBesedila("#2F4785"), "#FFFFFF", "na temni modri (N12) bela pisava");
  eq(I.barvaBesedila("#A7DCC0"), "#2B2717", "na svetli zeleni (DO4) temna pisava");
}

console.log("6) pravilo uporabljajo VSI zasloni, ne le eden");
{
  const strani = ["index.html", "imenik.html", "admin.html"];
  strani.forEach(s => {
    const src = readFileSync(join(koren, s), "utf8");
    trdi(/<script src="izmene\.js"><\/script>/.test(src), `${s} nalaga izmene.js`);
    trdi(/window\.Izmene\./.test(src), `${s} ga tudi res uporabi`);
  });

  const index = readFileSync(join(koren, "index.html"), "utf8");
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const admin = readFileSync(join(koren, "admin.html"), "utf8");

  // Nobene lastne kopije razvrstitve ali legende več.
  trdi(!/^function classify\(sifra\)\{/m.test(index), "index.html nima več svoje classify()");
  trdi(!/^function classify\(sifra\)\{/m.test(admin), "admin.html nima več svoje classify()");
  trdi(!/^const IZMENA_KRATICE = \[/m.test(imenik), "imenik.html nima več svoje kopije legende");
  trdi(!/const BARVE = \{ dop:/.test(index + admin), "nobena stran nima več svoje tabele barv");

  // Razpored (Po oddelkih) mora barvati po legendi in izpisovati POLNO
  // ime izmene, ne kratice – uporabnikova izrecna zahteva.
  trdi(/window\.Izmene\.barva\(sifra\)/.test(index),
    "Po oddelkih: barva celice je iz uradne legende");
  // Polno ime pride iz legende (shiftLabel -> Izmene.naziv), ne iz surove
  // šifre: šifre so neenotne ("dopoldan", "NOČNA"), naziv pa je pravilno
  // zapisan ("Dopoldne", "Nočna").
  trdi(/<span className="swatch" title=\{opisIzmene\}[\s\S]{0,220}\{shiftLabel\(sifra\)\}/.test(index),
    "Po oddelkih: v celici je POLNO ime izmene iz legende, ne kratica");
  trdi(/const legendaIzmen = useMemo/.test(index),
    "Po oddelkih: legenda pod tabelo je izpeljana iz izmen tega meseca");

  // Generator mora ostati na SVOJI razvrstitvi.
  trdi(/const classify = window\.Izmene\.skupinaGeneratorja;/.test(admin),
    "admin.html uporablja generatorsko razvrstitev, ne splošne");
  trdi(/const classify = window\.Izmene\.skupina;/.test(index),
    "index.html uporablja splošno razvrstitev");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
