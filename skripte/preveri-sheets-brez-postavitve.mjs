#!/usr/bin/env node
/* Sinhronizacija sme spreminjati SAMO vsebino obstoječih celic.
 *
 * Google list, v katerega piše, je uradni, ročno voden in podpisan
 * dokument. Napačen klic bi vanj dodal vrstico, stolpec ali zavihek, ali
 * povozil oblikovanje - in tega nihče ne bi takoj opazil. Obljuba v
 * dokumentaciji tega ne prepreči; ta preizkus ga.
 *
 * Preverja STATIČNO, nad vsemi datotekami sinhronizacije:
 *  - edina naslova Google Sheets API sta values.get in values:batchUpdate;
 *  - nikjer ni klica, ki spreminja POSTAVITEV (insertDimension,
 *    deleteDimension, mergeCells, repeatCell, addSheet, appendCells ...);
 *  - Apps Script na dokumentu ne piše v preglednico, samo bere in pošlje.
 *
 * Zagon: node skripte/preveri-sheets-brez-postavitve.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// Cela sinhronizacija, brez izjem - novo datoteko je treba dodati sem.
const DATOTEKE = [
  "supabase/functions/_shared/google-sheets.ts",
  "supabase/functions/_shared/sheets-koordinate.js",
  "supabase/functions/sheets-izhod/index.ts",
  "supabase/functions/sheets-vhod/index.ts",
  "supabase/apps-script/sinhronizacija.gs",
];

// Iskanje teče po KODI, ne po komentarjih: v google-sheets.ts so ti
// klici našteti prav zato, da je zapisano, česa koda ne dela. Komentar,
// ki jih omenja, ni klic.
// (Naslovi https:// so zaščiteni z dvopičjem pred poševnicama.)
function brezKomentarjev(vsebina) {
  return vsebina
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, "$1");
}

// Vse, kar spremeni POSTAVITEV lista (ne vsebine celice).
const PREPOVEDANO = [
  "values:append", "values.append", "appendCells",
  "insertDimension", "deleteDimension", "moveDimension", "updateDimensionProperties",
  "autoResizeDimensions", "insertRange", "deleteRange",
  "mergeCells", "unmergeCells", "repeatCell", "updateCells",
  "addSheet", "deleteSheet", "duplicateSheet", "updateSheetProperties",
  "addConditionalFormatRule", "setDataValidation", "addProtectedRange",
  "spreadsheets.batchUpdate", "spreadsheets:batchUpdate",
];

// Apps Script sme brati in pošiljati, ne pa pisati v preglednico.
const PREPOVEDANO_V_SKRIPTU = [
  "setValue", "setValues", "insertRows", "insertColumns", "deleteRow", "deleteColumn",
  "setBackground", "setFontWeight", "setNumberFormat", "insertSheet", "clear(",
];

console.log("1) nikjer ni klica, ki bi spremenil postavitev lista");
DATOTEKE.forEach((rel) => {
  const vsebina = brezKomentarjev(readFileSync(join(koren, rel), "utf8"));
  const najdeno = PREPOVEDANO.filter((p) => vsebina.includes(p));
  trdi(najdeno.length === 0, rel + (najdeno.length ? " – najdeno: " + najdeno.join(", ") : ""));
});

console.log("2) edina naslova Google Sheets API sta values.get in values:batchUpdate");
{
  const vsebina = DATOTEKE.map((rel) => readFileSync(join(koren, rel), "utf8")).join("\n");
  // Vsak zapis naslova sheets.googleapis.com mora voditi na /spreadsheets;
  // pot za njim pregledamo spodaj po sestavljenih delih.
  const naslovi = [...vsebina.matchAll(/https:\/\/sheets\.googleapis\.com[^\s"'`]*/g)].map((m) => m[0]);
  trdi(naslovi.length > 0, "naslov Sheets API je sploh najden (" + naslovi.length + ")");
  trdi(naslovi.every((n) => n === "https://sheets.googleapis.com/v4/spreadsheets"),
    "vsi naslovi so osnovni /v4/spreadsheets, pot se sestavi posebej: " + [...new Set(naslovi)].join(", "));

  // Kar se na osnovo pripne: samo "/values/<obseg>" (get) in
  // "/values:batchUpdate" (pisanje).
  const poti = [...vsebina.matchAll(/\$\{SHEETS_API\}[^`]*/g)].map((m) => m[0]);
  trdi(poti.length === 2, "na osnovni naslov se pripenjata natanko dve poti (" + poti.length + ")");
  trdi(poti.some((p) => p.includes("/values/")), "ena je branje /values/<obseg>");
  trdi(poti.some((p) => p.includes("/values:batchUpdate")), "druga je pisanje /values:batchUpdate");

  // Metoda POST se sme uporabiti samo za batchUpdate in za prijavo
  // (oauth2.googleapis.com/token) - branje je GET.
  const gs = readFileSync(join(koren, "supabase/functions/_shared/google-sheets.ts"), "utf8");
  const postov = (gs.match(/method:\s*"POST"/g) || []).length;
  trdi(postov === 2, "v google-sheets.ts sta natanko dva POST klica (žeton + batchUpdate), našel " + postov);
}

console.log("3) piše se z valueInputOption, brez posegov v obliko");
{
  const gs = readFileSync(join(koren, "supabase/functions/_shared/google-sheets.ts"), "utf8");
  trdi(gs.includes('valueInputOption: "USER_ENTERED"'), "valueInputOption je USER_ENTERED (kot »Zapiši nazaj v Sheets«)");
  trdi(!/includeValuesInResponse|responseValueRenderOption/.test(gs), "brez nepotrebnih dodatkov v odgovoru");
}

console.log("4) Apps Script na dokumentu ne piše v preglednico");
{
  const skript = brezKomentarjev(readFileSync(join(koren, "supabase/apps-script/sinhronizacija.gs"), "utf8"));
  const najdeno = PREPOVEDANO_V_SKRIPTU.filter((p) => skript.includes(p));
  trdi(najdeno.length === 0, "sinhronizacija.gs samo bere" + (najdeno.length ? " – najdeno: " + najdeno.join(", ") : ""));
  trdi(skript.includes("x-sheets-secret"), "sporočilo nosi skrivnost x-sheets-secret");
  trdi(/getRow\(\)|getColumn\(\)/.test(skript), "pošlje se koordinata celice, ne vsebina razporeda");
}

console.log("5) v vrsto pišeta samo Edge Functions (service_role)");
{
  const sql = readFileSync(join(koren, "supabase/sheets-sinhronizacija.sql"), "utf8");
  trdi(/enable row level security/.test(sql), "RLS je vklopljen");
  trdi(!/for (insert|delete)[\s\S]{0,80}to authenticated/i.test(sql),
    "prijavljeni uporabnik ne dobi pravice vstavljanja ali brisanja v vrsti");
  trdi(/revoke all on function public\.sheet_sync_prevzemi\(int\) from authenticated/.test(sql),
    "prevzem vrste ni dosegljiv iz brskalnika");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("Vse v redu.");
