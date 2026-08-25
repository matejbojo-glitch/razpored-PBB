(() => {
  // exceljs-vendor-shim.mjs
  var exceljs_vendor_shim_default = typeof window !== "undefined" ? window.ExcelJS : void 0;

  // export-utils.entry.js
  (function() {
    "use strict";
    function varnoImeLista(ime, uporabljena) {
      var ocisceno = (ime || "List").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "List";
      var koncno = ocisceno, i = 2;
      while (uporabljena[koncno]) {
        koncno = ocisceno.slice(0, 28) + " " + i;
        i++;
      }
      uporabljena[koncno] = true;
      return koncno;
    }
    function vrniNadzoruBrskalniku() {
      return new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });
    }
    var VRSTIC_NA_KOS = 200;
    async function dodajVrsticePoKosih(ws, vrstice) {
      for (var i = 0; i < vrstice.length; i++) {
        ws.addRow(vrstice[i]);
        if ((i + 1) % VRSTIC_NA_KOS === 0) await vrniNadzoruBrskalniku();
      }
    }
    function prenesiBuffer(buffer, imeDatoteke) {
      var blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = imeDatoteke;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() {
        URL.revokeObjectURL(url);
      }, 1e3);
    }
    async function izvoziXLSX(imeDatoteke, listi) {
      if (!exceljs_vendor_shim_default) throw new Error("Excel knjižnica (ExcelJS) ni naložena na tej strani.");
      if (!listi || !listi.length) throw new Error("Ni podatkov za izvoz.");
      var wb = new exceljs_vendor_shim_default.Workbook();
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
    window.ExportUtils = { izvoziXLSX };
  })();
})();
