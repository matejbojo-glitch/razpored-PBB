#!/usr/bin/env node
/* Preizkus window.Parafa.lastniki() — kdo je lastnik parafe.
 *
 * Ozadje: uvoz razporeda je javljal "POG (parafa se ujema z več osebami)"
 * in "TOM (…)" ter OBE osebi preskočil, torej izgubil njune izmene.
 * Vzrok ni bil v podatkih, ampak v aplikaciji: parafo, ki ni izrecno
 * nastavljena, si aplikacija izpelje iz prvih treh črk priimka. Zato je
 * vsak par sodelavcev z enakim začetkom priimka izgledal kot trk -
 * čeprav v uradnem registru paraf oznako nosi samo eden od njiju.
 *
 * Resnično stanje (uradni izvoz paraf 14. 8. 2026 + seznam zaposlenih):
 *   POG - izrecno Pogačnik Teja; Pogačnik Matej uradne parafe NIMA.
 *   TOM - izrecno Tomaževič Simona; Tomašić Nikolina uradne parafe nima.
 * Oba para RES nastopata v razporedu (2026_SMS_RAZPORED.xlsx: Pogačnik T.
 * na C/FLEXI, Pogačnik M. na C1/D, Tomašić N. na D), zato to ni bila
 * teoretična težava - izmene so se dejansko izgubljale.
 *
 * Zagon: node skripte/preveri-parafa-lastnik.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
const P = sandbox.window.Parafa;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) { trdi(a === b, opis + (a === b ? "" : ` — dobil "${a}", pričakoval "${b}"`)); }

// Profili kot jih vrne Supabase. Parafe so iz uradnega izvoza; kdor je v
// izvozu ni imel, je tu brez nje (točno tako, kot je v bazi).
const POGACNIK_TEJA    = { id: "t", full_name: "Pogačnik Teja",    parafa: "PT", parafa_pred_oktobrom_2026: "POG" };
const POGACNIK_MATEJ   = { id: "m", full_name: "Pogačnik Matej",   parafa: null, parafa_pred_oktobrom_2026: null };
const TOMAZEVIC_SIMONA = { id: "s", full_name: "Tomaževič Simona", parafa: "ST", parafa_pred_oktobrom_2026: "TOM" };
const TOMASIC_NIKOLINA = { id: "n", full_name: "Tomašić Nikolina", parafa: null, parafa_pred_oktobrom_2026: null };
const PROFILI = [POGACNIK_TEJA, POGACNIK_MATEJ, TOMAZEVIC_SIMONA, TOMASIC_NIKOLINA];

console.log("1) izhodišče: izpeljana parafa se res prekriva z izrecno");
{
  eq(P.zaDatum(POGACNIK_MATEJ, "2026-08"), "POG", "Pogačnik Matej dobi izpeljano POG");
  eq(P.zaDatum(POGACNIK_TEJA, "2026-08"), "POG", "Pogačnik Teja ima izrecno POG (do 30. 9. 2026)");
  trdi(P.jeIzpeljana(POGACNIK_MATEJ, "2026-08"), "Matejeva je IZPELJANA");
  trdi(!P.jeIzpeljana(POGACNIK_TEJA, "2026-08"), "Tejina je IZRECNA");
}

console.log("2) avgust 2026: izrecna parafa premaga izpeljano — nič se ne izgubi");
{
  const { poParafi, podvojene } = P.lastniki(PROFILI, "2026-08");
  eq(podvojene.length, 0, "nobene nerazrešljive parafe");
  eq((poParafi.POG || {}).id, "t", '"POG" pripada Pogačnik Teji, ne Mateju');
  eq((poParafi.TOM || {}).id, "s", '"TOM" pripada Tomaževič Simoni, ne Nikolini');
}

console.log("3) po 1. 10. 2026 se POG/TOM sprostita in ju prevzameta druga dva");
{
  const { poParafi, podvojene } = P.lastniki(PROFILI, "2026-10");
  eq(podvojene.length, 0, "še vedno nič nerazrešljivega");
  eq((poParafi.PT || {}).id, "t", "Teja je odslej PT");
  eq((poParafi.ST || {}).id, "s", "Simona je odslej ST");
  eq((poParafi.POG || {}).id, "m", '"POG" zdaj pripada Pogačnik Mateju (Teja se je preimenovala)');
  eq((poParafi.TOM || {}).id, "n", '"TOM" zdaj pripada Tomašić Nikolini');
}

console.log("4) natančno na meji prestopa");
{
  eq((P.lastniki(PROFILI, "2026-09-30").poParafi.POG || {}).id, "t", "30. 9. 2026 še Teja");
  eq((P.lastniki(PROFILI, "2026-10-01").poParafi.POG || {}).id, "m", "1. 10. 2026 že Matej");
}

console.log("5) PRAVI trki ostanejo trki — pravilo ne sme skriti dvoumnosti");
{
  // Dve IZRECNI enaki parafi: tega aplikacija ne sme razrešiti sama.
  const dveIzrecni = [
    { id: "a", full_name: "Novak Ana",  parafa: "NOV", parafa_pred_oktobrom_2026: null },
    { id: "b", full_name: "Novak Bine", parafa: "NOV", parafa_pred_oktobrom_2026: null },
  ];
  const r1 = P.lastniki(dveIzrecni, "2026-08");
  trdi(r1.podvojene.indexOf("NOV") !== -1, "dve izrecni enaki parafi -> ostane trk");
  trdi(!r1.poParafi.NOV, "trk se NE pripiše nikomur (raje nič kot napačni osebi)");

  // Nobena ni izrecna, obe izpeljani enaki: prav tako nerazrešljivo.
  const dveIzpeljani = [
    { id: "c", full_name: "Kovač Cilka", parafa: null, parafa_pred_oktobrom_2026: null },
    { id: "d", full_name: "Kovač Dane",  parafa: null, parafa_pred_oktobrom_2026: null },
  ];
  const r2 = P.lastniki(dveIzpeljani, "2026-08");
  trdi(r2.podvojene.indexOf("KOV") !== -1, "dve izpeljani enaki parafi -> ostane trk");
  trdi(!r2.poParafi.KOV, "prav tako se ne pripiše nikomur");
}

console.log("6) tri osebe: ena izrecna, dve izpeljani -> izrecna zmaga");
{
  const trije = [
    { id: "x", full_name: "Kovačič Iva", parafa: "KOV", parafa_pred_oktobrom_2026: null },
    { id: "y", full_name: "Kovač Jure",  parafa: null,  parafa_pred_oktobrom_2026: null },
    { id: "z", full_name: "Kovše Lea",   parafa: null,  parafa_pred_oktobrom_2026: null },
  ];
  const { poParafi, podvojene } = P.lastniki(trije, "2026-08");
  eq((poParafi.KOV || {}).id, "x", "edina izrecna dobi oznako");
  eq(podvojene.length, 0, "izpeljani dve ne ustvarita trka, ker izrecna obstaja");
}

console.log("7) index.html res uporablja skupno razreševanje (brez druge kopije)");
{
  const html = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/window\.Parafa\.lastniki\(profili, datum\)/.test(html),
    "parafaMapa kliče window.Parafa.lastniki");
  trdi(!/if \(parafa in m\) \{ podvojene\.add/.test(html),
    "stara, prestroga logika je odstranjena");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
