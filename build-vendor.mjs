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

const skupno = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  logLevel: "info",
};

// 1) Osnovni sveženj - naloži se na VSAKI strani, sinhrono (glej zgoraj).
await build({
  ...skupno,
  entryPoints: [join(koren, "vendor-app.entry.js")],
  outfile: join(koren, "vendor-app.min.js"),
});

// 2) Knjižnici za preglednice - ločeno, ker se naložita šele ob prvem
// izvozu/uvozu (VendorIzvoz.nalozi v export-utils.js). Prej sta bili v
// svežnju zgoraj in sta vsako stran obtežili za 1,3 MB, čeprav ju velika
// večina uporabnikov nikoli ne potrebuje.
await build({
  ...skupno,
  entryPoints: [join(koren, "vendor-izvoz.entry.js")],
  outfile: join(koren, "vendor-izvoz.min.js"),
});

console.log("✓ vendor-app.min.js (React, ReactDOM, supabase) + vendor-izvoz.min.js (XLSX, ExcelJS) zgrajena");
