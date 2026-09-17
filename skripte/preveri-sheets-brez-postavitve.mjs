#!/usr/bin/env node
/* Sinhronizacija sme spreminjati SAMO vsebino obstoječih celic.
 *
 * Google list, v katerega piše, je uradni, ročno voden in podpisan
 * dokument. Napačen klic bi vanj dodal vrstico, stolpec ali zavihek, ali
 * povozil oblikovanje - in tega nihče ne bi takoj opazil. Obljuba v
 * dokumentaciji tega ne prepreči; ta preizkus ga.
 *
 * Preverja STATIČNO, nad vsemi datotekami sinhronizacije:
 *  - Sheets API se kliče na natanko štirih naslovih: branje vrednosti,
 *    zapis vrednosti, seznam zavihkov (samo imena in številke) in
 *    barvanje;
 *  - nikjer ni klica, ki spreminja POSTAVITEV (insertDimension,
 *    deleteDimension, mergeCells, addSheet, appendCells, updateCells ...);
 *  - barvanje se sestavi na ENEM mestu in se dotakne ENE celice in DVEH
 *    lastnosti (glej tudi preveri-sheets-deljena-koda.mjs, razdelek 8c);
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
  "mergeCells", "unmergeCells", "updateCells", "updateBorders",
  "addSheet", "deleteSheet", "duplicateSheet", "updateSheetProperties",
  "addConditionalFormatRule", "setDataValidation", "addProtectedRange",
  "cutPaste", "copyPaste", "findReplace", "sortRange", "clearBasicFilter",
];
// "repeatCell" in "spreadsheets:batchUpdate" NISTA na seznamu: barvanje ju
// potrebuje in ju ni mogoče nadomestiti z values.*. Namesto pavšalne
// prepovedi ju omejuje razdelek 3 spodaj - zahteva se sestavi na enem
// samem mestu in se dotakne ene celice ter dveh lastnosti.

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
  trdi(poti.length === 4, "na osnovni naslov se pripenjajo natanko štiri poti (" + poti.length + ")");
  trdi(poti.some((p) => p.includes("/values/")), "1. branje vrednosti /values/<obseg>");
  trdi(poti.some((p) => p.includes("/values:batchUpdate")), "2. zapis vrednosti /values:batchUpdate");
  trdi(poti.some((p) => p.includes("?fields=sheets.properties(sheetId,title)")),
    "3. seznam zavihkov, omejen na sheetId in title (nobene celice)");
  trdi(poti.some((p) => /\}:batchUpdate/.test(p)), "4. barvanje :batchUpdate");
  trdi(!/includeGridData/.test(vsebina), "seznam zavihkov ne bere vsebine celic (brez includeGridData)");

  // Metoda POST se sme uporabiti samo za batchUpdate in za prijavo
  // (oauth2.googleapis.com/token) - branje je GET.
  const gs = readFileSync(join(koren, "supabase/functions/_shared/google-sheets.ts"), "utf8");
  const postov = (gs.match(/method:\s*"POST"/g) || []).length;
  trdi(postov === 3, "v google-sheets.ts so natanko trije POST klici (žeton + vrednosti + barve), našel " + postov);
}

console.log("3) piše se z valueInputOption, brez posegov v obliko");
{
  const gs = readFileSync(join(koren, "supabase/functions/_shared/google-sheets.ts"), "utf8");
  trdi(gs.includes('valueInputOption: "USER_ENTERED"'), "valueInputOption je USER_ENTERED (kot »Zapiši nazaj v Sheets«)");
  trdi(!/includeValuesInResponse|responseValueRenderOption/.test(gs), "brez nepotrebnih dodatkov v odgovoru");
}

console.log("3b) barvanje: ena celica, dve lastnosti, sestavljeno na enem mestu");
{
  const gs = brezKomentarjev(readFileSync(join(koren, "supabase/functions/_shared/google-sheets.ts"), "utf8"));
  const koord = readFileSync(join(koren, "supabase/functions/_shared/sheets-koordinate.js"), "utf8");

  // Zahteva se sestavi SAMO v sheets-koordinate.js (zahtevaBarve), ki ga
  // preveri-sheets-deljena-koda.mjs preveri po vsebini, ne po besedilu.
  trdi(!gs.includes("repeatCell"),
    "google-sheets.ts zahteve ne sestavlja sam - samo odpošlje, kar dobi");
  trdi(/body: JSON\.stringify\(\{ requests: zahteve \}\)/.test(gs),
    "v telo gre natanko seznam prejetih zahtev");
  trdi((koord.match(/repeatCell/g) || []).length === 1,
    "repeatCell se pojavi na enem samem mestu v vsej sinhronizaciji");
  trdi(koord.includes('"userEnteredFormat(backgroundColor,textFormat.foregroundColor)"'),
    "barvanje spremeni samo ozadje in barvo pisave");
  trdi(/endRowIndex: Number\(vrstica\) \+ 1/.test(koord) && /endColumnIndex: Number\(stolpec\) \+ 1/.test(koord),
    "obseg zahteve je ena sama celica");
}

console.log("4) Apps Script na dokumentu ne piše v preglednico");
{
  const skript = brezKomentarjev(readFileSync(join(koren, "supabase/apps-script/sinhronizacija.gs"), "utf8"));
  const najdeno = PREPOVEDANO_V_SKRIPTU.filter((p) => skript.includes(p));
  trdi(najdeno.length === 0, "sinhronizacija.gs samo bere" + (najdeno.length ? " – najdeno: " + najdeno.join(", ") : ""));
  trdi(skript.includes("x-sheets-secret"), "sporočilo nosi skrivnost x-sheets-secret");
  trdi(/getRow\(\)|getColumn\(\)/.test(skript), "pošlje se koordinata celice, ne vsebina razporeda");
}

console.log("4b) NZV: varovalke pri brisanju (list je merodajen za DAN, ne za več)");
{
  // Pri NZV je celica seznam oseb, zato se ob spremembi uskladi CEL DAN -
  // vključno z brisanjem tistih, ki jih v listu ni več. To je edino mesto
  // v sinhronizaciji, ki briše, zato so varovalke preverjene po besedilu:
  // destruktivne poti ni mogoče varno pognati v preizkusu.
  const vhod = brezKomentarjev(readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8"));

  trdi(/if \(!najdenDatum \|\| !najdenaGlava \|\| !nzvCelice\.length\)[\s\S]{0,400}?return await napaka/.test(vhod),
    "če zavihka ni bilo mogoče razbrati, se NE briše nič");

  const brisanja = [...vhod.matchAll(/\.from\("razpored"\)\s*\.delete\(\)([\s\S]{0,200})/g)].map((m) => m[1]);
  trdi(brisanja.length > 0, "brisanje razporeda je v kodi (" + brisanja.length + "x)");
  trdi(brisanja.every((rep) => /\.eq\("work_date", datum\)/.test(rep)),
    "vsako brisanje je omejeno na EN dan");
  trdi(brisanja.every((rep) => /\.in\("employee_id", odvec\)/.test(rep)),
    "vsako brisanje je omejeno na poimensko naštete osebe");
  trdi(/const odvec = \(obstojeci \|\| \[\]\)[\s\S]{0,300}?!obdrzi\.has\(String\(id\)\)/.test(vhod),
    "seznam za brisanje nastane iz vrstic, ki so bile prebrane pri osebju NZV");
  trdi(/\.select\("employee_id"\)\.eq\("work_date", datum\)\.in\("employee_id", idjiNzv\)/.test(vhod),
    "obstoječe vrstice se berejo samo za osebje NZV - razpored oddelkov se ne pogleda");
  trdi(/\.from\("profili"\)[\s\S]{0,200}?\.eq\("department_code", povezava\.skupina\)/.test(vhod),
    "osebje NZV je določeno s skupino povezave, ne uganjeno");

  trdi(/\.update\(\{ razlog: "sheets" \}\)[\s\S]{0,200}?\.from\("razpored"\)\s*\.delete\(\)/.test(vhod),
    "pred izbrisom se vrstici nastavi razlog 'sheets' (sicer bi se izbris vračal v Sheets)");

  const brisanjaOds = [...vhod.matchAll(/\.from\("odsotnosti"\)\s*\.delete\(\)([\s\S]{0,200})/g)].map((m) => m[1]);
  trdi(brisanjaOds.every((rep) => /\.eq\("work_date", datum\)/.test(rep) && /\.in\("full_name", odvecIme\)/.test(rep)),
    "brisanje odsotnosti je omejeno na en dan in na poimensko naštete osebe");

  trdi(/razlog: "sheets"/.test(vhod), "vsak zapis nosi razlog 'sheets' (vidno v Reviziji)");
}

console.log("4c) pregled napak ne sme zaliti sam sebe");
{
  // Iz pravih podatkov (11. 9. 2026): ena večja izbira v listu je ustvarila
  // 1411 vnosov "celica ni v mreži", ena oseba na napačnem zavihku pa 326
  // enakih vnosov - prave napake so se izgubile med njimi.
  const vhod = brezKomentarjev(readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8"));

  trdi(/async function zabelezi\(vrsta: string/.test(vhod),
    "vsi vpisi napak gredo skozi eno funkcijo");
  trdi(/\.eq\("resen", false\)[\s\S]{0,400}?if \(ze && ze\.length\) return;/.test(vhod),
    "ista NEREŠENA napaka se ne vpiše dvakrat");
  // Pri "zunaj_mreze" se besedilo med tekoma spreminja (nosi število in
  // primere koordinat), zato primerjava po besedilu ne prepreči kopičenja:
  // izmerjeno 17. 9. 2026 je bilo 63 takih nerešenih vrstic v enem dnevu in
  // 39 novih v nekaj minutah po ročnem čiščenju. Ključ je zato (vrsta,
  // zavihek) - ena odprta vrstica na zavihek, primeri v njej pa ostanejo.
  trdi(/const KLJUC_PO_ZAVIHKU = \["zunaj_mreze"\];/.test(vhod),
    "vrste s spremenljivim besedilom se odpravljajo po zavihku, ne po besedilu");
  trdi(/KLJUC_PO_ZAVIHKU\.includes\(vrsta\)[\s\S]{0,120}?\.eq\("zavihek"/.test(vhod),
    "in ključ se res uporabi");

  const vpisi = (vhod.match(/from\("sync_errors"\)\s*\.insert/g) || []).length;
  trdi(vpisi === 1, "vpis v sync_errors je na enem samem mestu (najdenih " + vpisi + ")");

  trdi(/if \(vrsta === "zunaj_mreze"\) \{[\s\S]{0,200}?zunajMreze\+\+/.test(vhod),
    "celice zunaj mreže se štejejo, ne zapisujejo po kosih");
  trdi(/if \(zunajMreze\) \{[\s\S]{0,300}?zabelezi\("zunaj_mreze"/.test(vhod),
    "ob koncu se zapiše EN povzetek");
  trdi(/zunajPrimeri\.length < 5/.test(vhod),
    "povzetek nosi nekaj primerov, da se da ugotoviti, kje je bilo");
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
