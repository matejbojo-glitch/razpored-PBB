/* Razpored PBB – vendor-izvoz.entry.js
 * Vir za vendor-izvoz.min.js (glej build-vendor.mjs).
 *
 * XLSX (0,42 MB) in ExcelJS (0,90 MB) sta bila prej del vendor-app.min.js in
 * sta se naložila ob vsakem odprtju vsake strani - skupaj 1,3 MB od 1,66 MB
 * svežnja, čeprav ju potrebuje samo izvoz/uvoz preglednic (redko, večinoma
 * administrator na računalniku). Zato sta zdaj tu, v svojem svežnju, ki ga
 * VendorIzvoz.nalozi() (export-utils.js) prinese šele ob prvi dejanski rabi.
 *
 * Globalni imeni (window.XLSX, window.ExcelJS) sta NAMENOMA enaki kot prej -
 * vsa obstoječa koda (export-utils.js, import-utils.js) ju najde brez
 * sprememb, samo počakati mora na nalaganje.
 */
import * as XLSX from "xlsx";
import ExcelJS from "exceljs/dist/exceljs.min.js";

window.XLSX = XLSX;
window.ExcelJS = ExcelJS;
