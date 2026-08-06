/* Razpored PBB — export-utils.js
 * Skupna izvozna logika (Excel), ki jo vključujejo strani z razpredelnicami.
 * Bere xlsx.core.min.js (SheetJS, window.XLSX) — ta je do zdaj v aplikaciji
 * vključen samo za BRANJE (uvoz), pisanje (XLSX.writeFile) je bilo
 * neuporabljeno kljub temu, da knjižnica to že polno podpira.
 * Nima builda: nalaga se kot navaden <script>, po xlsx.core.min.js.
 */
(function (root) {
  "use strict";

  // listi: [{ ime, glave: [...], vrstice: [[...], ...] }] — vsak vnos postane
  // svoj zavihek v datoteki. Excel omejuje ime zavihka na 31 znakov in
  // prepoveduje nekaj posebnih znakov, zato oboje tu počistimo.
  function varnoImeLista(ime, uporabljena) {
    var ocisceno = (ime || "List").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "List";
    var koncno = ocisceno, i = 2;
    while (uporabljena[koncno]) { koncno = ocisceno.slice(0, 28) + " " + i; i++; }
    uporabljena[koncno] = true;
    return koncno;
  }

  function izvoziXLSX(imeDatoteke, listi) {
    if (!root.XLSX) throw new Error("Excel knjižnica (xlsx.core.min.js) ni naložena na tej strani.");
    if (!listi || !listi.length) throw new Error("Ni podatkov za izvoz.");
    var wb = root.XLSX.utils.book_new();
    var uporabljena = {};
    listi.forEach(function (l) {
      var ws = root.XLSX.utils.aoa_to_sheet([l.glave || []].concat(l.vrstice || []));
      root.XLSX.utils.book_append_sheet(wb, ws, varnoImeLista(l.ime, uporabljena));
    });
    var ime = /\.xlsx$/i.test(imeDatoteke) ? imeDatoteke : imeDatoteke + ".xlsx";
    root.XLSX.writeFile(wb, ime);
  }

  root.ExportUtils = { izvoziXLSX: izvoziXLSX };
})(typeof window !== "undefined" ? window : this);
