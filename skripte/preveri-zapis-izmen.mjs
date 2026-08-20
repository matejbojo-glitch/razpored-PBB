#!/usr/bin/env node
/* Preizkus: izmene se uporabniku povsod izpišejo enako in pravilno -
 * "Dopoldne", "Popoldne", "Nočna" (velika začetnica, brez verzalk).
 *
 * Zakaj obstaja: šifre v bazi so zgodovinske in neenotne - "dopoldan"
 * (male črke), "NOČNA" (verzalke), "PRISOTEN". Aplikacija jih je ponekod
 * izpisovala takšne, kot so, zato je uporabnik na istem zaslonu videl
 * "dopoldan" in "NOČNA".
 *
 * Pravilo: uporabniku se izpiše NAZIV iz uradne legende (izmene.js),
 * šifra v bazi pa se NE spreminja - ostati mora tak zapis, kot je v
 * bolnišničnih preglednicah, sicer bi aplikacija v uradni Google Sheet
 * pisala drugo besedo, kot je v njem zdaj.
 *
 * Zagon: node skripte/preveri-zapis-izmen.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
const I = sandbox.window.Izmene;

console.log("1) naziv je pravilno zapisan, ne glede na to, kako je šifra");
{
  eq(I.naziv("dopoldan"), "Dopoldne", "dopoldan -> Dopoldne");
  eq(I.naziv("DOPOLDAN"), "Dopoldne", "verzalke prav tako");
  eq(I.naziv("PRISOTEN"), "Dopoldne", "PRISOTEN (vodje) -> Dopoldne");
  eq(I.naziv("popoldan"), "Popoldne", "popoldan -> Popoldne");
  eq(I.naziv("NOČNA"), "Nočna", "NOČNA -> Nočna");
  eq(I.naziv("nocna"), "Nočna", "brez strešice prav tako");
  eq(I.naziv("NOČNA12"), "Nočna 12", "NOČNA12 -> Nočna 12");
  eq(I.naziv("NOČNA od 19h"), "Nočna 11 (od 19)", "nočna od 19");
  eq(I.naziv("DNEVNA12"), "Dnevna 12", "DNEVNA12 -> Dnevna 12");
  eq(I.naziv("popoldan do 19"), "Popoldne do 19", "popoldan do 19");
  eq(I.naziv("DEŽURSTVO"), "Dežurstvo (NZV)", "dežurstvo");
}

console.log("2) sprejme tudi NOVO pisavo (če jo kdo vtipka ali prinese preglednica)");
{
  eq(I.naziv("dopoldne"), "Dopoldne", "dopoldne");
  eq(I.naziv("Popoldne"), "Popoldne", "Popoldne");
  eq(I.naziv("popoldne do 19"), "Popoldne do 19", "popoldne do 19");
  // In da to niso pokvarila starih vzorcev:
  eq(I.kratica("dopoldan"), "DOP", "stara pisava ima še vedno pravo kratico");
  eq(I.kratica("dopoldne"), "DOP", "nova pisava ima isto kratico");
  eq(I.barva("dopoldne"), I.barva("dopoldan"), "in isto barvo");
}

console.log("3) v nazivih legende ni več stare oblike");
{
  const naz = I.KRATICE.map(v => v[2]);
  const slabi = naz.filter(n => /Dopoldan|Popoldan/.test(n));
  trdi(slabi.length === 0, "nobenega 'Dopoldan'/'Popoldan'"
    + (slabi.length ? " – " + slabi.join(", ") : ""));
  const verzalke = naz.filter(n => /^[A-ZČŠŽ0-9 ()\-.]+$/.test(n) && n.length > 3);
  trdi(verzalke.length === 0, "noben naziv ni zapisan s samimi verzalkami"
    + (verzalke.length ? " – " + verzalke.join(", ") : ""));
  naz.forEach(n => {
    trdi(/^[A-ZČŠŽ]/.test(n), `"${n}" se začne z veliko začetnico`);
  });
}

console.log("4) zasloni izpisujejo NAZIV, ne surove šifre");
{
  const index = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/function shiftLabel\(sifra\)\{[\s\S]{0,160}window\.Izmene\.naziv\(sifra\)/.test(index),
    "index.html: shiftLabel vrne naziv iz legende");
  trdi(/\{shiftLabel\(sifra\)\}/.test(index),
    "index.html: celica v 'Po oddelkih' izpiše naziv");
  const obrazec = readFileSync(join(koren, "obrazec.html"), "utf8");
  trdi(/window\.Izmene\.naziv\(sifra\)/.test(obrazec),
    "obrazec.html (Menjava): izmena se izpiše prek legende");
  trdi(/<script src="izmene\.js"><\/script>/.test(obrazec),
    "obrazec.html legendo tudi naloži");
}

console.log("5) ŠIFRA V BAZI se NE spreminja (uradni Sheet ostane nedotaknjen)");
{
  // Generator še naprej ustvarja zgodovinske šifre; te gredo v bazo in v
  // Google Sheet. Če bi se spremenile, bi aplikacija v bolnišnični
  // dokument pisala drugo besedo, kot je v njem zdaj.
  const gen = readFileSync(join(koren, "generator-core.js"), "utf8");
  trdi(/"dopoldan"/.test(gen), "generator-core.js še vedno zapiše 'dopoldan'");
  trdi(/"popoldan"/.test(gen), "in 'popoldan'");
  const sheets = readFileSync(join(koren, "sheets-mreza.js"), "utf8");
  trdi(!/Izmene\.naziv|shiftLabel/.test(sheets),
    "zapis v Google Sheets ne uporablja prikaznega naziva");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
