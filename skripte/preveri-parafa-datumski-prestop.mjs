#!/usr/bin/env node
/* Preizkus parafaOd()/parafaMapa() (index.html) - parafa se je za del
 * kadra spremenila z veljavnostjo od 1.10.2026 (profiles.parafa = nova,
 * profiles.parafa_pred_oktobrom_2026 = stara, glej
 * supabase/posodobi-parafe-oktober-2026.sql). Preverja tri stvari, ki jih
 * ni mogoče zanesljivo preveriti samo z branjem kode:
 *  1) za osebo, ki JE spremenila parafo, se dnevi/meseci PRED 1.10.2026
 *     prevedejo v STARO parafo, dnevi/meseci OD 1.10.2026 dalje pa v NOVO
 *     (natančno na meji: 30.9. -> stara, 1.10. -> nova);
 *  2) za osebo BREZ parafa_pred_oktobrom_2026 (velika večina kadra) datum
 *     ne vpliva na rezultat - regresijski preizkus, da popravek ne pokvari
 *     obstoječega, datumsko-neodvisnega obnašanja;
 *  3) parafaMapa() (obratna preslikava parafa->oseba za uvoz) uporabi
 *     pravo stran prestopa za CEL ciljni mesec naenkrat.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html (ne prepisane tu), zato
 * preizkus ne more zaostati za kodo.
 *
 * Zagon: node skripte/preveri-parafa-datumski-prestop.mjs
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

const koda = [
  constVKotVar(izvleciVrstico("const PARAFA_PRESTOP")),
  izvleci("autoParafa"),
  izvleci("parafaOd"),
  izvleci("parafaMapa"),
].join("\n\n");

// autoParafa/parafaOd v index.html sta odslej samo tanka ovoja nad skupno
// parafa.js (edini vir resnice, ker isto preslikavo oznaka → oseba
// potrebuje tudi Imenik) - zato mora biti v peskovniku najprej ta.
// Preizkus s tem še vedno preverja PRAVO kodo, ki teče v aplikaciji,
// vključno z ovojema: če bi se ovoj razšel s skupno datoteko, tu pade.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
vm.runInContext(koda, sandbox);
const { parafaOd, parafaMapa, autoParafa, PARAFA_PRESTOP } = sandbox;

console.log("1) PARAFA_PRESTOP je pravi datum meje");
trdi(PARAFA_PRESTOP === "2026-10", `PARAFA_PRESTOP = "${PARAFA_PRESTOP}" (pričakovano "2026-10")`);

console.log("2) oseba, ki JE spremenila parafo (Hrovat Nina: stara HRO, nova NH)");
{
  const oseba = { full_name: "HROVAT NINA", parafa: "NH", parafa_pred_oktobrom_2026: "HRO" };
  trdi(parafaOd(oseba, "2026-09-15") === "HRO", `dan sredi septembra -> stara (dobil "${parafaOd(oseba, "2026-09-15")}")`);
  trdi(parafaOd(oseba, "2026-09-30") === "HRO", `30.9.2026 (zadnji dan pred prestopom) -> stara (dobil "${parafaOd(oseba, "2026-09-30")}")`);
  trdi(parafaOd(oseba, "2026-10-01") === "NH", `1.10.2026 (prvi dan po prestopu) -> nova (dobil "${parafaOd(oseba, "2026-10-01")}")`);
  trdi(parafaOd(oseba, "2026-10-15") === "NH", `dan sredi oktobra -> nova (dobil "${parafaOd(oseba, "2026-10-15")}")`);
  trdi(parafaOd(oseba, "2027-03-01") === "NH", `datum precej po prestopu -> nova (dobil "${parafaOd(oseba, "2027-03-01")}")`);
  trdi(parafaOd(oseba, "2026-09") === "HRO", `mesec (ne dan) pred prestopom -> stara (dobil "${parafaOd(oseba, "2026-09")}")`);
  trdi(parafaOd(oseba, "2026-10") === "NH", `mesec (ne dan) po prestopu -> nova (dobil "${parafaOd(oseba, "2026-10")}")`);
}

console.log("3) oseba BREZ parafa_pred_oktobrom_2026 (večina kadra) - datum ne vpliva (regresija)");
{
  const oseba = { full_name: "URANKER MOJCA", parafa: "MU", parafa_pred_oktobrom_2026: null };
  trdi(parafaOd(oseba, "2026-01-01") === "MU", `davno pred prestopom -> nespremenjena parafa (dobil "${parafaOd(oseba, "2026-01-01")}")`);
  trdi(parafaOd(oseba, "2026-10-01") === "MU", `na dan prestopa -> nespremenjena parafa (dobil "${parafaOd(oseba, "2026-10-01")}")`);
  trdi(parafaOd(oseba, "2027-06-01") === "MU", `davno po prestopu -> nespremenjena parafa (dobil "${parafaOd(oseba, "2027-06-01")}")`);
  trdi(parafaOd(oseba) === "MU", `brez podanega datuma -> nespremenjena parafa (dobil "${parafaOd(oseba)}")`);
}

console.log("4) oseba brez KAKRŠNEKOLI parafe -> autoParafa iz imena, ne glede na datum");
{
  const oseba = { full_name: "Novak Ana", parafa: null, parafa_pred_oktobrom_2026: null };
  const pricakovano = autoParafa("Novak Ana");
  trdi(parafaOd(oseba, "2026-05-01") === pricakovano, `pred prestopom -> autoParafa (dobil "${parafaOd(oseba, "2026-05-01")}", pričakovano "${pricakovano}")`);
  trdi(parafaOd(oseba, "2026-11-01") === pricakovano, `po prestopu -> autoParafa (dobil "${parafaOd(oseba, "2026-11-01")}", pričakovano "${pricakovano}")`);
}

console.log("5) parafaOd(null, ...) ne vrže napake");
{
  let vrglo = false;
  let rezultat;
  try { rezultat = parafaOd(null, "2026-10-01"); } catch (e) { vrglo = true; }
  trdi(!vrglo && rezultat === "", `parafaOd(null, ...) vrne prazen niz, ne napake (dobil ${JSON.stringify(rezultat)})`);
}

console.log("6) parafaMapa() uporabi pravo stran prestopa za CEL ciljni mesec");
{
  const profili = [
    { full_name: "HROVAT NINA", parafa: "NH", parafa_pred_oktobrom_2026: "HRO" },
    { full_name: "URANKER MOJCA", parafa: "MU", parafa_pred_oktobrom_2026: null },
  ];
  const { poParafi: sept } = parafaMapa(profili, "2026-09");
  trdi(sept["HRO"] && sept["HRO"].full_name === "HROVAT NINA", `september 2026: "HRO" najde Hrovat Nino`);
  trdi(!sept["NH"], `september 2026: "NH" (nova parafa) se NE najde - še ni veljala`);
  trdi(sept["MU"] && sept["MU"].full_name === "URANKER MOJCA", `september 2026: "MU" (nespremenjena) najde Uranker Mojco`);

  const { poParafi: okt } = parafaMapa(profili, "2026-10");
  trdi(okt["NH"] && okt["NH"].full_name === "HROVAT NINA", `oktober 2026: "NH" najde Hrovat Nino`);
  trdi(!okt["HRO"], `oktober 2026: "HRO" (stara parafa) se NE najde - ne velja več`);
  trdi(okt["MU"] && okt["MU"].full_name === "URANKER MOJCA", `oktober 2026: "MU" (nespremenjena) najde Uranker Mojco`);
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
