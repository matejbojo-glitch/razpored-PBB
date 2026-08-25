#!/usr/bin/env node
/* Zgradi export-utils.js iz export-utils.entry.js: en klasičen (ne-modulski)
 * IIFE sveženj z esbuild – isti razlog kot build-vendor.mjs. "exceljs" se
 * pri gradnji preslika (alias) na exceljs-vendor-shim.mjs, ki v teku bere
 * window.ExcelJS – knjižnica je tako v vsako stran poslana po žici samo
 * ENKRAT, v vendor-app.min.js, ne še enkrat tudi tukaj.
 *
 * export-buttons.js NI del te gradnje: nima lastnih uvozov (root.ExportUtils
 * bere kot doslej), zato ostaja navaden, ročno urejan <script>.
 *
 * Zagon: node build-export.mjs (samodejno tudi pred `npm run dev`/`build`)
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(koren, "export-utils.entry.js")],
  outfile: join(koren, "export-utils.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: false, // ostane berljiv/diffable kot ostale modularne *.js datoteke
  charset: "utf8", // šumniki v sporočilih ostanejo čitljivi, ne \uXXXX
  alias: { exceljs: join(koren, "exceljs-vendor-shim.mjs") },
  logLevel: "info",
});

console.log("✓ export-utils.js zgrajen (ExcelJS bere iz window.ExcelJS, glej vendor-app.min.js)");
