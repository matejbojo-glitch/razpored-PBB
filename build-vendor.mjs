#!/usr/bin/env node
/* Zgradi vendor-app.min.js iz vendor-app.entry.js: en klasičen (ne-modulski)
 * IIFE sveženj z esbuild, ki nastavi window.React / window.ReactDOM /
 * window.supabase / window.XLSX / window.ExcelJS iz pravih npm paketov.
 *
 * Zakaj vnaprej zgrajena datoteka v korenu (ne <script type="module">
 * z uvozi neposredno v HTML): strani še vedno nalagajo nav.js,
 * oseba-vrstica.js, export-buttons.js in inline <script> kot navadne
 * klasične skripte (zaradi obstoječih preizkusov v skripte/*.mjs, ki
 * iščejo dobesedne <script src="...">) – ti se izvedejo TAKOJ, ko jih
 * razčlenjevalnik doseže. Modulski <script> bi se izvedel odloženo, po
 * vseh njih, zato React/ReactDOM/supabase v tistem trenutku še ne bi
 * obstajali. Klasičen sveženj to reši enako, kot je nekoč delal
 * react.production.min.js.
 *
 * Zagon: node build-vendor.mjs (samodejno tudi pred `npm run dev`/`build`)
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(koren, "vendor-app.entry.js")],
  outfile: join(koren, "vendor-app.min.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  logLevel: "info",
});

console.log("✓ vendor-app.min.js zgrajen (React, ReactDOM, supabase, XLSX, ExcelJS)");
