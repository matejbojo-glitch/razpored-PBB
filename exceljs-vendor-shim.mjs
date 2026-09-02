/* Alias-tarča za "exceljs" v build-export.mjs (glej esbuild `alias`).
 *
 * export-utils.entry.js ima dobeseden `import ExcelJS from "exceljs"`, a
 * prava knjižnica NI vgrajena tu - je v vendor-izvoz.min.js, ki se naloži
 * šele ob prvem izvozu/uvozu (glej VendorIzvoz.nalozi v
 * export-utils.entry.js). Če bi jo export-utils.js vgradil vase, bi se
 * ExcelJS (0,90 MB) poslala v vsako stran, tudi kadar nihče ničesar ne
 * izvaža - prav to smo odpravili.
 *
 * Zato tu NI vrednosti ob nalaganju (prej: `export default window.ExcelJS`,
 * kar je bilo prebrano takoj in bi bilo zdaj vedno undefined), ampak
 * funkcija, ki globalno spremenljivko prebere ŠELE OB KLICU - takrat je
 * sveženj že naložen.
 */
export default function vrniExcelJS() {
  return typeof window !== "undefined" ? window.ExcelJS : undefined;
}
