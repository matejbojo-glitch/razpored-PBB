#!/usr/bin/env node
/* Preizkus obdelajFlexiVrstice() (index.html) - nova podpora za zavihek
 * FLEXI v realni predlogi "2026_SMS_RAZPORED.xlsx", ki ga uvoz doslej
 * sploh ni znal prebrati (znana, dokumentirana vrzel).
 *
 * FLEXI ima DRUGAČNO obliko kot ostalih 6 oddelkov: vsaka oseba zaseda
 * PAR stolpcev (oddelek te izmene + izmena), ker flexi kader vsak dan
 * pokriva DRUG oddelek - department_code se torej prebere iz podatkov, ne
 * fiksen za ves list. Fixture spodaj je zvest posnetek REALNE strukture
 * (dry-run uporabnikove prave datoteke, avgust/september 2026, ne v
 * repozitoriju), vključno z dvema posebnostma, ki ju ima SAMO ta zavihek:
 *   1. ime osebe je v glavi NAD stolpcem IZMENE (drugi od dveh), stolpec
 *      pred njim (oddelek) nima lastne glave;
 *   2. cel blok stolpcev se v isti vrstici enkrat PONOVI, z delno
 *      drugačnimi vrednostmi za isti dan - uporabi se samo prva (leva)
 *      pojavitev vsakega imena.
 *
 * Preverja tudi, da neznana/kombinirana oznaka oddelka (npr. "C/E2",
 * opažena v pravi datoteki) NE pride do zapisa - department_code ima tuji
 * ključ na departments, zato bi tak zapis zavrnil CEL upsert.
 *
 * Zagon: node skripte/preveri-flexi-uvoz.mjs
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
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  izvleci("monthRange"),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  constVKotVar(izvleciVrstico("const IME_S_PIKO_RX")),
  izvleci("najdiVrsticoImenFlexi"),
  izvleci("obdelajFlexiVrstice"),
].join("\n\n");

const sandbox = { window: { ImportUtils: { normalizirajDatum } }, console };
vm.createContext(sandbox);
vm.runInContext(koda, sandbox);
const { obdelajFlexiVrstice } = sandbox;

// Zvest posnetek REALNE strukture (glava v vrstici 0, vloga v vrstici 1,
// prvi dan v vrstici 2 - "za zrak" vrstice med njimi so v pravem branju
// (blankrows:false) že odstranjene, glej preveri-nzv-dezurstvo-ime.mjs).
// Stolpec 21/22 "DODATNO C/E2 7-19" NI oseba (ne ustreza "Priimek I."
// vzorcu) - v pravi datoteki gre za opombo/povzetek, ne ime.
// Vsak stolpec je poravnan po INDEKSU med vsemi štirimi vrsticami spodaj
// (0=FLEXI/datum, 1=blank/dan, 2=oddelek Zaplotnik, 3=Zaplotnik ime/izmena,
// 4=oddelek Djedović, 5=Djedović ime/izmena, 6=oddelek Misotič (neveljaven,
// "C/E2"), 7=Misotič ime/izmena, 8=oddelek Burnar, 9=Burnar ime/izmena,
// 10-11=stolpec "DODATNO" (ni oseba), 12-17=PONOVLJEN blok - glej opombo).
const GLAVA = ["FLEXI", "", "", "ZAPLOTNIK A.", "", "DJEDOVIĆ M.", "", "MISOTIČ R.", "", "BURNAR S.", "", "DODATNO C/E2 7-19",
  // PONOVLJEN blok (opažen na pravi datoteki) - iste osebe, DELNO drugačne vrednosti za isti dan.
  "FLEXI", "", "", "ZAPLOTNIK A.", "", "DJEDOVIĆ M."];
const VLOGA = ["JUNIJ", "", "", "SMS / TZN", "", "SMS / TZN", "", "DMS / DZN", "", "SMS / TZN", "", "",
  "JUNIJ", "", "", "SMS / TZN", "", "SMS / TZN"];
const DAN1 = ["2026-06-01", "PO", "C", "popoldan", "C", "dopoldan", "C/E2", "dopoldan", "E2", "popoldan", "", "",
  "2026-06-01", "PO", "C", "NOČNA", "", ""]; // ponovljen blok: ZAPLOTNIK A. ima tu DRUGAČNO vrednost - mora se prezreti
const DAN2 = ["2026-06-02", "TO", "", "", "C", "popoldan", "C", "dopoldan", "E2", "dopoldan", "", "",
  "2026-06-02", "TO", "", "", "", ""];
for (const v of [GLAVA, VLOGA, DAN1, DAN2]) {
  if (v.length !== 18) throw new Error("Fixture napaka: pričakovana dolžina 18, dobil " + v.length + " (" + JSON.stringify(v) + ")");
}

const VRSTICE = [GLAVA, VLOGA, DAN1, DAN2];
const poKratkem = {
  "ZAPLOTNIK A.": "zaplotnik-id", // ne obstaja v resnici (izbrisana oseba) - tu namenoma OBSTAJA, da preverimo prezrtje ponovljenega bloka
  "DJEDOVIĆ M.": "djedovic-id",
  "MISOTIČ R.": "misotic-id",
  // "BURNAR S." namenoma NI v poKratkem - preveri "ni najden profil"
};
const veljavniOddelki = new Set(["C", "E2", "FLEXI"]);

console.log("1) osnovno branje: oddelek+izmena par, department_code prebran iz podatkov (ne fiksen)");
{
  const { zapisi, najdenDatum, najdenaGlava } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem, veljavniOddelki);
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo");
  const zaplotnik1 = zapisi.find(z => z.employee_id === "zaplotnik-id" && z.work_date === "2026-06-01");
  trdi(!!zaplotnik1 && zaplotnik1.department_code === "C" && zaplotnik1.shift_code === "popoldan",
    `ZAPLOTNIK A. / 1.6. -> department_code="C" (iz podatkov), shift_code="popoldan" (dobil ${JSON.stringify(zaplotnik1)})`);
  const djedovic2 = zapisi.find(z => z.employee_id === "djedovic-id" && z.work_date === "2026-06-02");
  trdi(!!djedovic2 && djedovic2.department_code === "C" && djedovic2.shift_code === "popoldan",
    "DJEDOVIĆ M. / 2.6. -> department_code='C', shift_code='popoldan'");
}

console.log("2) ponovljen blok stolpcev v isti vrstici - uporabi SAMO prvo (levo) pojavitev");
{
  const { zapisi } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem, veljavniOddelki);
  const zaplotnikVsi = zapisi.filter(z => z.employee_id === "zaplotnik-id" && z.work_date === "2026-06-01");
  trdi(zaplotnikVsi.length === 1, `ZAPLOTNIK A. / 1.6. -> natanko EN zapis, ne dva (dobil ${zaplotnikVsi.length})`);
  trdi(zaplotnikVsi[0] && zaplotnikVsi[0].shift_code === "popoldan",
    "uporabljena je vrednost iz PRVEGA (levega) bloka ('popoldan'), ne ponovljenega drugega ('NOČNA')");
}

console.log("3) neznana/kombinirana oznaka oddelka (npr. 'C/E2') se NE zapiše (tuji ključ bi zavrnil cel upsert)");
{
  const { zapisi, neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem, veljavniOddelki);
  const misotic1 = zapisi.find(z => z.employee_id === "misotic-id" && z.work_date === "2026-06-01");
  trdi(!misotic1, "MISOTIČ R. / 1.6. (oddelek 'C/E2') ni v zapisih");
  const jePrijavljeno = [...neujemanja].some(n => n.includes("MISOTIČ R.") && n.includes("C/E2"));
  trdi(jePrijavljeno, "neznana oznaka je prijavljena v neujemanjih, ne tiho izgubljena");
}

console.log("4) oseba brez profila konča v poročilu (ne izgine tiho)");
{
  const { neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem, veljavniOddelki);
  trdi(neujemanja.has("BURNAR S."), "'BURNAR S.' (ni v poKratkem) je v neujemanjih");
}

console.log("5) stolpec brez oblike 'Priimek I.' (npr. 'DODATNO C/E2 7-19') se prezre, ne poskuša ujeti kot oseba");
{
  const { neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem, veljavniOddelki);
  trdi(![...neujemanja].some(n => n.includes("DODATNO")), "'DODATNO C/E2 7-19' se NE pojavi v neujemanjih");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
