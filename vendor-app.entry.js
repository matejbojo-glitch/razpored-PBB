/* Razpored PBB – vendor-app.entry.js
 * Vir za vendor-app.js (glej build-vendor.mjs). Nadomesti ročno prenesene
 * react.production.min.js, react-dom.production.min.js, babel.min.js,
 * supabase-js.min.js, xlsx.core.min.js in exceljs.min.js: iste globalne
 * spremenljivke (window.React, window.ReactDOM, window.supabase,
 * window.XLSX, window.ExcelJS), zdaj pa iz pravih npm odvisnosti.
 *
 * NAMENOMA ni <script type="module">: build-vendor.mjs to z esbuild strne
 * v EN klasičen (ne-modulski) IIFE sveženj, da se izvede sinhrono in v
 * pravem vrstnem redu pred nav.js/oseba-vrstica.js/export-buttons.js in
 * inline React kodo strani – enako kot so se prej izvedle stare *.min.js
 * datoteke. Modulski <script> bi se (kot vsi moduli) izvedel odloženo,
 * po vseh klasičnih <script>, kar bi te tri datoteke pokvarilo.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs/dist/exceljs.min.js";

window.React = React;
window.ReactDOM = { createRoot };
window.supabase = { createClient };
window.XLSX = XLSX;
window.ExcelJS = ExcelJS;
