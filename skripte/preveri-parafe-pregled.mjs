#!/usr/bin/env node
/* Preizkus parafa.js — skupne logike paraf, ki jo uporabljata razpored
 * (index.html) in Imenik (pregled paraf za vse zaposlene).
 *
 * Ozadje: uvoz razporeda pripiše izmeno osebi po PARAFI. Uporabnikovo
 * poročilo uvoza je pokazalo dve vrsti težav, ki ju je bilo doslej nemogoče
 * videti kjerkoli v aplikaciji:
 *   - "parafa se ujema z več osebami" (POG, TOM) - TRK: dve osebi imata
 *     isto oznako, zato je uvoz ne more enolično pripisati in vpis odpade;
 *   - parafa iz predloge, ki je aplikacija ne pozna (BOJ, TOM, BIZ, MUŠ).
 * Najpogostejši vir trkov je IZPELJANA parafa: kdor je nima izrecno
 * nastavljene, dobi prve tri črke priimka - dva Pogačnika torej oba "POG".
 *
 * Zagon: node skripte/preveri-parafe-pregled.mjs
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
  trdi(a === b, opis + (a === b ? "" : ` — dobil "${a}", pričakoval "${b}"`));
}

const sandbox = { window: {}, console, String, Object };
vm.createContext(sandbox);
// parafa.js kratka imena zvede na skupni ključ prek imena.js.
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
const Parafa = sandbox.window.Parafa;

const HROVAT = { full_name: "Hrovat Nina", parafa: "NH", parafa_pred_oktobrom_2026: "HRO" };
const URANKER = { full_name: "Uranker Mojca", parafa: "MU" };
const POGACNIK_T = { full_name: "Pogačnik Teja", parafa: "PT", parafa_pred_oktobrom_2026: "POG" };
const POGACNIK_M = { full_name: "Pogačnik Miha" }; // brez izrecne parafe -> izpeljana "POG"

console.log("1) izpeljana parafa: prve tri črke priimka");
{
  eq(Parafa.auto("Pogačnik Miha"), "POG", "Pogačnik Miha -> POG");
  eq(Parafa.auto("Mavri Tratnik Magdalena"), "MAV", "večbesedni priimek -> prve tri črke združenega priimka");
  eq(Parafa.auto(""), "", "prazno ime -> prazen niz (ne vrže napake)");
}

console.log("2) parafa je vezana na DATUM razporeda, ne na današnji dan");
{
  eq(Parafa.zaDatum(HROVAT, "2026-09"), "HRO", "september 2026 -> stara parafa");
  eq(Parafa.zaDatum(HROVAT, "2026-09-30"), "HRO", "30.9.2026 (zadnji dan pred prestopom) -> stara");
  eq(Parafa.zaDatum(HROVAT, "2026-10-01"), "NH", "1.10.2026 (prvi dan po prestopu) -> nova");
  eq(Parafa.zaDatum(URANKER, "2026-09"), "MU", "oseba brez spremembe je od datuma neodvisna");
}

console.log("3) 'izpeljana' se pravilno loči od izrecno nastavljene");
{
  trdi(Parafa.jeIzpeljana(POGACNIK_M, "2026-09") === true, "Pogačnik Miha (brez parafe) -> izpeljana");
  trdi(Parafa.jeIzpeljana(URANKER, "2026-09") === false, "Uranker Mojca (parafa 'MU') -> ni izpeljana");
  trdi(Parafa.jeIzpeljana(POGACNIK_T, "2026-09") === false, "Pogačnik Teja v septembru (stara 'POG') -> ni izpeljana");
  trdi(Parafa.jeIzpeljana(POGACNIK_T, "2026-10") === false, "Pogačnik Teja v oktobru (nova 'PT') -> ni izpeljana");
}

console.log("4) TRK: dve osebi z isto parafo — natanko primer 'POG' iz uporabnikovega poročila");
{
  // Septembra ima Pogačnik Teja staro parafo "POG", Pogačnik Miha pa
  // izpeljano "POG" - uvoz take oznake ne more pripisati eni osebi.
  const trkiSep = Parafa.trki([HROVAT, URANKER, POGACNIK_T, POGACNIK_M], "2026-09");
  trdi(!!trkiSep["POG"], "september: 'POG' je prepoznan kot trk");
  trdi(trkiSep["POG"] && trkiSep["POG"].length === 2, `v trku sta natanko 2 osebi (dobil ${trkiSep["POG"] ? trkiSep["POG"].length : 0})`);
  const imena = (trkiSep["POG"] || []).map(o => o.full_name).sort();
  trdi(imena.join(" + ") === "Pogačnik Miha + Pogačnik Teja", `trk našteje obe osebi (dobil "${imena.join(" + ")}")`);
  trdi(Object.keys(trkiSep).length === 1, `samo ena parafa je v trku, ostale so čiste (dobil ${Object.keys(trkiSep).length})`);
}

console.log("5) isti nabor oseb je v OKTOBRU brez trka (Teja dobi novo 'PT')");
{
  const trkiOkt = Parafa.trki([HROVAT, URANKER, POGACNIK_T, POGACNIK_M], "2026-10");
  trdi(Object.keys(trkiOkt).length === 0,
    `oktober: brez trkov, ker Pogačnik Teja preide na "PT" (dobil ${JSON.stringify(Object.keys(trkiOkt))})`);
}

console.log("6) prazen/neveljaven vhod ne zruši pregleda");
{
  trdi(Object.keys(Parafa.trki([], "2026-09")).length === 0, "prazen seznam -> brez trkov");
  trdi(Object.keys(Parafa.trki(null, "2026-09")).length === 0, "null -> brez trkov (ne vrže napake)");
  eq(Parafa.zaDatum(null, "2026-09"), "", "zaDatum(null) -> prazen niz");
}

console.log("7) potrjeni popravki kratkih zapisov iz predlog (Priimek I.)");
{
  // V uradni predlogi piše "VALJAVEC A.", oseba pa je Valjavec Enej -
  // uporabnik je to izrecno potrdil. Brez tega popravka uvoz njegovih
  // izmen tiho ne bi zapisal (ime bi pristalo med "brez ujemanja").
  eq(Parafa.kratkoKljuc("VALJAVEC A."), "VALJAVEC|E", "VALJAVEC A. -> VALJAVEC E. (potrjeno: Valjavec Enej)");
  eq(Parafa.kratkoKljuc("valjavec a."), "VALJAVEC|E", "male črke se najprej normalizirajo");
  eq(Parafa.kratkoKljuc("  VALJAVEC A.  "), "VALJAVEC|E", "presledki okoli ne motijo");
  // Seznam mora ostati OZEK - vsak vpis pomeni izmeno, pripisano konkretni
  // osebi, zato sme sem samo uporabnikom potrjen zapis.
  eq(Parafa.kratkoKljuc("KARNIČAR J."), "KARNICAR|J", "ime brez potrjenega psevdonima se samo zvede na ključ");
  trdi(Object.keys(Parafa.KRATKO_PSEVDONIM).length === 1,
    `seznam popravkov je ozek: ${Object.keys(Parafa.KRATKO_PSEVDONIM).length} vpis(ov)`);
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
