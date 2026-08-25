/* Razpored PBB – export-utils.entry.js
 * Vir za export-utils.js (glej build-export.mjs). Skupna izvozna logika
 * (Excel), ki jo vključujejo strani z razpredelnicami.
 *
 * Prej je pisala z window.XLSX (SheetJS) – ta je bil v aplikaciji doslej
 * vključen samo za BRANJE (uvoz, glej import-utils.js), pisanje
 * (XLSX.writeFile) pa je teklo sinhrono, na en kos, kar pri velikem
 * mesečnem razporedu (npr. cela NZV mreža, več deset ljudi × 31 dni) za
 * nekaj sekund zamrzne zaslon – noben klik, tudi ne na "prekliči", se v
 * tem času ne odzove.
 *
 * Zdaj piše z ExcelJS (že vgrajen v vendor-app.min.js kot window.ExcelJS,
 * glej vendor-app.entry.js in exceljs-vendor-shim.mjs – "exceljs" tu NI
 * ponovno vgrajen v ta sveženj, da se knjižnica po žici ne pošlje dvakrat):
 * pisanje je asinhrono (writeBuffer), vrstice pa se pri večjih listih
 * dodajajo po kosih z vmesnim vrniNadzoruBrskalniku(), da zaslon vmes
 * ostane odziven.
 *
 * NAMENOMA ni <script type="module"> v HTML-ju: build-export.mjs to z
 * esbuild strne v EN klasičen (ne-modulski) IIFE sveženj (glej
 * build-vendor.mjs za isti razlog) – export-buttons.js in inline React
 * koda strani berejo root.ExportUtils TAKOJ, ko jih razčlenjevalnik doseže;
 * modulski <script> bi se izvedel odloženo, po njih, in bi ju pokvaril.
 */
import ExcelJS from "exceljs";

(function () {
  "use strict";

  // listi: [{ ime, glave: [...], vrstice: [[...], ...] }] – vsak vnos postane
  // svoj zavihek v datoteki. Excel omejuje ime zavihka na 31 znakov in
  // prepoveduje nekaj posebnih znakov, zato oboje tu počistimo.
  function varnoImeLista(ime, uporabljena) {
    var ocisceno = (ime || "List").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "List";
    var koncno = ocisceno, i = 2;
    while (uporabljena[koncno]) { koncno = ocisceno.slice(0, 28) + " " + i; i++; }
    uporabljena[koncno] = true;
    return koncno;
  }

  // En prazen "tick" nazaj brskalniku (makrotask) – med njim se lahko
  // izriše naslednji video okvir in obdela čakajoč klik (npr. na gumb za
  // preklic izvoza).
  function vrniNadzoruBrskalniku() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  // Nad to mejo vrstic na list se ta dodajajo po kosih. Pod njo dodaten
  // async-preklop ne bi bil niti opazen niti koristen – bi le po nepotrebnem
  // podaljšal izvoz.
  var VRSTIC_NA_KOS = 200;

  async function dodajVrsticePoKosih(ws, vrstice) {
    for (var i = 0; i < vrstice.length; i++) {
      ws.addRow(vrstice[i]);
      if ((i + 1) % VRSTIC_NA_KOS === 0) await vrniNadzoruBrskalniku();
    }
  }

  function prenesiBuffer(buffer, imeDatoteke) {
    var blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = imeDatoteke;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Rahlo zamaknjen revoke – takojšen bi v nekaterih brskalnikih (Safari)
    // lahko prekinil prenos, ki se šele začenja.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function izvoziXLSX(imeDatoteke, listi) {
    if (!ExcelJS) throw new Error("Excel knjižnica (ExcelJS) ni naložena na tej strani.");
    if (!listi || !listi.length) throw new Error("Ni podatkov za izvoz.");

    var wb = new ExcelJS.Workbook();
    var uporabljena = {};
    for (var i = 0; i < listi.length; i++) {
      var l = listi[i];
      var ws = wb.addWorksheet(varnoImeLista(l.ime, uporabljena));
      if (l.glave && l.glave.length) ws.addRow(l.glave);
      await dodajVrsticePoKosih(ws, l.vrstice || []);
    }

    var buffer = await wb.xlsx.writeBuffer();
    var ime = /\.xlsx$/i.test(imeDatoteke) ? imeDatoteke : imeDatoteke + ".xlsx";
    prenesiBuffer(buffer, ime);
  }

  window.ExportUtils = { izvoziXLSX: izvoziXLSX };
})();
