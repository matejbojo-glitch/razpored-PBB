#!/usr/bin/env node
/* Vsaka datoteka s seznama ASSETS v service workerju mora po gradnji res
 * obstajati v dist/.
 *
 * Zakaj svoj preizkus: po prehodu na Vite je na seznamu ostalo sedem datotek,
 * ki jih v dist/ ni več - theme.css (zgradi se z zgoščeno vrednostjo v imenu)
 * ter react/react-dom/babel/supabase-js/xlsx/exceljs (združeni v
 * vendor-app.min.js). cache.addAll() je atomaren, zato je ena sama 404
 * zavrnila CELOTNO namestitev in nov service worker se sploh ni namestil.
 * Pri uporabnikih s starim service workerjem je zato ostal aktiven stari, ki
 * nespremenljive datoteke servira iz svojega predpomnilnika - torej stare
 * skripte ob novem HTML. Prav to je razbilo objavljeno stran.
 *
 * Noben obstoječi preizkus tega ni ujel: vsi berejo datoteke iz korena
 * projekta (kjer stare datoteke še ležijo), nihče pa ni gledal v dist/ -
 * torej v tisto, kar Netlify dejansko objavi.
 *
 * Zagon: npm run build && node skripte/preveri-sw-precache.mjs
 */
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(koren, "dist");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

console.log("1) dist/sw.js obstaja in ima seznam ASSETS");
const swPot = join(dist, "sw.js");
if (!existsSync(swPot)) {
  console.error("\nNEUSPEŠNO – dist/sw.js ni. Najprej poženi `npm run build`.");
  process.exit(1);
}
// dist/ mora biti SVEŽ. Sicer preizkus bere star seznam ASSETS in molči
// tudi takrat, ko je v izvorni kodi nova stran, ki se sploh ne zgradi -
// natanko to se je zgodilo pri uvoz.html (manjkala je med vhodi v
// vite.config.mjs, dist/sw.js pa je bil star in nove vrstice ni imel).
{
  const zgrajen = statSync(swPot).mtimeMs;
  const izvorne = ["sw.js", "vite.config.mjs", ...readdirSync(koren).filter(d => d.endsWith(".html"))];
  const mlajse = izvorne.filter(d => existsSync(join(koren, d)) && statSync(join(koren, d)).mtimeMs > zgrajen);
  if (mlajse.length) {
    console.error(`\nNEUSPEŠNO – dist/ je starejši od izvorne kode (${mlajse.join(", ")}).` +
      "\nPoženi `npm run build` in preizkus ponovi - sicer bi bral star seznam.");
    process.exit(1);
  }
  console.log("  ✓ dist/ je novejši od izvorne kode");
}

const sw = readFileSync(swPot, "utf8");
const ujem = sw.match(/const ASSETS = \[([\s\S]*?)\n\];/);
trdi(!!ujem, "seznam ASSETS je najden");
if (!ujem) { console.error("\nNEUSPEŠNO"); process.exit(1); }

const vnosi = [...ujem[1].matchAll(/'(\.\/[^']*)'/g)]
  .map((m) => m[1].replace(/^\.\//, ""))
  .filter((p) => p !== "");
trdi(vnosi.length > 20, `vnosov na seznamu: ${vnosi.length}`);

console.log("2) vsaka predpomnjena datoteka res obstaja v dist/");
for (const p of vnosi) {
  const jeTam = existsSync(join(dist, p));
  trdi(jeTam, jeTam ? p : `${p} JE NA SEZNAMU, a ga v dist/ NI – namestitev service workerja bo odpovedala`);
}

console.log("2b) vsaka stran iz korena je med vhodi v vite.config.mjs in v dist/");
{
  // Vite zgradi SAMO tisto, kar je našteto med "input". Stran, ki jo
  // pozabimo dodati, na objavljeni strani vrne 404 - v razvoju pa deluje,
  // ker vite dev servira neposredno iz korena. Zato se to opazi šele v živo.
  const vite = readFileSync(join(koren, "vite.config.mjs"), "utf8");
  const vhodi = new Set([...vite.matchAll(/stran\("([^"]+\.html)"\)/g)].map(m => m[1]));
  for (const d of readdirSync(koren).filter(d => d.endsWith(".html"))) {
    trdi(vhodi.has(d), vhodi.has(d)
      ? `${d} je med vhodi`
      : `${d} NI med vhodi v vite.config.mjs - ne zgradi se in v živo vrne 404`);
    trdi(existsSync(join(dist, d)), existsSync(join(dist, d))
      ? `${d} je zgrajen v dist/`
      : `${d} se ni zgradil v dist/`);
  }
}

console.log("3) skupni slog (assets/*.css) je predpomnjen pod zgrajenim imenom");
const imaSlog = vnosi.some((p) => p.startsWith("assets/") && p.endsWith(".css"));
trdi(imaSlog, imaSlog
  ? "zgrajeni slog je na seznamu"
  : "na seznamu ni nobene assets/*.css – vstavljanje v vite.config.mjs ne deluje");

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  process.exit(1);
}
console.log("VSE V REDU");
