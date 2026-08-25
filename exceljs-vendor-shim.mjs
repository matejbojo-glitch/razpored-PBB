/* Alias-tarča za "exceljs" v build-export.mjs (glej esbuild `alias`).
 *
 * export-utils.entry.js ima dobeseden `import ExcelJS from "exceljs"`, a
 * prava knjižnica je ŽE vgrajena enkrat v vendor-app.min.js (window.ExcelJS,
 * glej vendor-app.entry.js), ki ga vsaka stran naloži PRVI, pred
 * export-utils.js. Če bi jo export-utils.js vgradil še enkrat vase, bi se
 * ExcelJS (velika knjižnica) v vsako stran poslala dvakrat po žici. Ta
 * datoteka torej ni prava knjižnica – je preslikava na že naloženo
 * globalno spremenljivko.
 */
export default (typeof window !== "undefined" ? window.ExcelJS : undefined);
