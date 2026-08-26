#!/usr/bin/env node
/* Varovalke v supabase/schema.sql ne smejo preverjati IMENA omejitve.
 *
 * Zakaj svoj preizkus: baza, ki je nastala pred preimenovanjem tabel v
 * slovenska imena, obdrži stara imena omejitev - ALTER TABLE ... RENAME TO
 * preimenuje tabelo, imen omejitev pa ne. Varovalka oblike
 *   if not exists (select 1 from pg_constraint where conname = '...')
 * zato stare omejitve ne vidi in doda DRUGO, vsebinsko enako. Nastane 35
 * podvojenih tujih ključev v 22 tabelah, PostgREST pa ob dveh enakih
 * razmerjih vrne
 *   "Could not embed because more than one relationship was found"
 * in Imenik se ne naloži.
 *
 * Varovalke morajo zato preverjati OBLIKO omejitve (tabela, stolpci, ciljna
 * tabela) prek public.tuji_kljuc_ze_obstaja / enolicna_omejitev_ze_obstaja,
 * primarni ključ pa po vrsti omejitve (contype = 'p').
 *
 * Zagon: node skripte/preveri-shema-varovalke.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

console.log("1) nobena varovalka ne preverja imena omejitve");
const vrstice = shema.split("\n");
const poImenu = [];
vrstice.forEach((v, i) => {
  if (/pg_constraint[\s\S]*conname\s*=/.test(v)) poImenu.push(`${i + 1}: ${v.trim()}`);
});
trdi(poImenu.length === 0, poImenu.length === 0
  ? "varovalk po imenu ni"
  : `varovalk po imenu: ${poImenu.length} – ${poImenu[0]}`);

console.log("2) pomožni funkciji za preverjanje po obliki obstajata");
for (const f of ["tuji_kljuc_ze_obstaja", "enolicna_omejitev_ze_obstaja"]) {
  const ima = new RegExp(`create or replace function public\\.${f}`).test(shema);
  trdi(ima, ima ? f : `manjka funkcija public.${f}`);
}

console.log("3) varovalke za tuje ključe in UNIQUE jih res uporabljajo");
const fkUporab = (shema.match(/if not public\.tuji_kljuc_ze_obstaja\(/g) || []).length;
const uUporab = (shema.match(/if not public\.enolicna_omejitev_ze_obstaja\(/g) || []).length;
trdi(fkUporab >= 40, `varovalk za tuje ključe po obliki: ${fkUporab}`);
trdi(uUporab >= 7, `varovalk za UNIQUE po obliki: ${uUporab}`);

console.log("4) primarni ključi se preverjajo po vrsti omejitve, ne po imenu");
const pkPoVrsti = (shema.match(/contype\s*=\s*'p'/g) || []).length;
trdi(pkPoVrsti > 0, `preverjanj contype = 'p': ${pkPoVrsti}`);

console.log("5) obstaja razdelek, ki pospravi že nastale podvojitve");
const imaPospravljanje = /4b\. POSPRAVLJANJE ŽE NASTALIH PODVOJITEV/.test(shema)
  && /drop constraint/i.test(shema);
trdi(imaPospravljanje, imaPospravljanje
  ? "razdelek 4b je prisoten"
  : "manjka razdelek, ki odvrže podvojene omejitve v že obstoječi bazi");

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  process.exit(1);
}
console.log("VSE V REDU");
