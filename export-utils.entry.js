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

  // Opis vsake oblike na enem mestu - pripona, kaj piše v oknu "Shrani kot"
  // in vrsta vsebine za Blob.
  var VRSTE = {
    xlsx: { pripona: "xlsx", opis: "Excel",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      koncnice: [".xlsx"] },
    json: { pripona: "json", opis: "JSON", mime: "application/json", koncnice: [".json"] },
    png:  { pripona: "png",  opis: "Slika PNG", mime: "image/png", koncnice: [".png"] },
    jpeg: { pripona: "jpg",  opis: "Slika JPEG", mime: "image/jpeg", koncnice: [".jpg", ".jpeg"] },
  };

  function sPripono(ime, pripona) {
    var re = new RegExp("\\." + pripona + "$", "i");
    return re.test(ime) ? ime : ime + "." + pripona;
  }

  // Okno "Shrani kot" (showSaveFilePicker) sme brskalnik odpreti SAMO, dokler
  // traja uporabnikov klik. Izdelava datoteke (Excel, slika) pa je asinhrona
  // in traja - če bi okno odprli šele za njo, bi bil klik že "porabljen" in
  // Chrome zavrne z varnostno napako (v nekaterih okoljih klic celo obvisi in
  // gumb za vedno ostane v stanju "Izvažam ...").
  //
  // Zato je shranjevanje razdeljeno na dvoje: pripraviCilj() se pokliče TAKOJ
  // ob kliku, izdelava datoteke šele nato, zapis pa gre v že izbrano datoteko.
  // Stranski učinek je tudi prijaznejši vrstni red za uporabnika: najprej
  // pove, kam naj gre, potem počaka.
  //
  // Firefox in Safari showSaveFilePicker nimata - tam pripraviCilj() vrne
  // null in shrani() pade nazaj na običajen prenos v mapo Prenosi. To ni
  // napaka in se ne javlja; datoteko uporabnik dobi tako ali tako.
  async function pripraviCilj(imeDatoteke, vrsta) {
    var v = VRSTE[vrsta];
    if (!v || typeof window === "undefined" || !window.showSaveFilePicker) return null;
    var accept = {};
    accept[v.mime] = v.koncnice;
    try {
      return await window.showSaveFilePicker({
        suggestedName: sPripono(imeDatoteke, v.pripona),
        types: [{ description: v.opis, accept: accept }],
      });
    } catch (err) {
      // Uporabnik je okno zaprl - to ni napaka, ampak premislek. Poseben
      // zaznamek pove shrani(), naj ne shrani niti po stari poti.
      if (err && err.name === "AbortError") return "preklic";
      return null;
    }
  }

  async function shrani(blob, imeDatoteke, vrsta, cilj) {
    if (cilj === "preklic") return false;
    var v = VRSTE[vrsta] || { pripona: "" };
    var ime = v.pripona ? sPripono(imeDatoteke, v.pripona) : imeDatoteke;
    if (cilj) {
      try {
        var tok = await cilj.createWritable();
        await tok.write(blob);
        await tok.close();
        return true;
      } catch (err) {
        // Zapis v izbrano datoteko ni uspel (npr. odvzeta pravica) - raje
        // običajen prenos kot izgubljen izvoz.
      }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = ime;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Rahlo zamaknjen revoke – takojšen bi v nekaterih brskalnikih (Safari)
    // lahko prekinil prenos, ki se šele začenja.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  function preveriListe(listi) {
    if (!listi || !listi.length) throw new Error("Ni podatkov za izvoz.");
  }

  async function izvoziXLSX(imeDatoteke, listi, cilj) {
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
    var blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await shrani(blob, imeDatoteke, "xlsx", cilj);
  }

  // ---------------------------------------------------------------- JSON
  // Zapiše natanko tisto strukturo, ki jo strani že sestavljajo za Excel -
  // torej ne nova, vzporedna oblika, ki bi se lahko razšla z Excelom.
  // Nazaj jo prebere uvoz (import-utils.js).
  async function izvoziJSON(imeDatoteke, listi, cilj) {
    preveriListe(listi);
    var vsebina = {
      aplikacija: "Razpored PBB",
      razlicica: 1,
      nastalo: new Date().toISOString(),
      naslov: String(imeDatoteke || "").replace(/\.[a-z]+$/i, ""),
      listi: listi.map(function (l) {
        return { ime: l.ime || "List", glave: l.glave || [], vrstice: l.vrstice || [] };
      }),
    };
    var blob = new Blob([JSON.stringify(vsebina, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    await shrani(blob, imeDatoteke, "json", cilj);
  }

  // ------------------------------------------------------------ PNG / JPEG
  // Slika se nariše iz PODATKOV, ne s posnetkom zaslona: tako je izid enak
  // ne glede na to, koliko je stran odmaknjena, kako širok je zaslon in
  // ali je vmes odprt kakšen meni.
  var CEL_ODMIK = 10;      // notranji odmik v celici
  var VRSTICA_V = 26;      // višina vrstice
  var PISAVA = '"Segoe UI", Roboto, Arial, sans-serif';

  function izmeriStolpce(ctx, l) {
    var vse = (l.glave && l.glave.length ? [l.glave] : []).concat(l.vrstice || []);
    var sirine = [];
    vse.forEach(function (vrstica) {
      (vrstica || []).forEach(function (celica, i) {
        var t = celica == null ? "" : String(celica);
        var w = ctx.measureText(t).width + CEL_ODMIK * 2;
        if (!sirine[i] || w > sirine[i]) sirine[i] = w;
      });
    });
    // Zgornja meja na stolpec: en zelo dolg zapis (npr. opomba) sicer
    // raztegne sliko v nekaj tisoč pikslov širine in postane neuporabna.
    return sirine.map(function (w) { return Math.min(Math.ceil(w), 420); });
  }

  function narisiList(l, barveOzadja) {
    var meri = document.createElement("canvas").getContext("2d");
    meri.font = "13px " + PISAVA;
    var sirine = izmeriStolpce(meri, l);
    var sirina = sirine.reduce(function (a, b) { return a + b; }, 0) || 200;
    var imaGlave = !!(l.glave && l.glave.length);
    var vrstic = (l.vrstice || []).length + (imaGlave ? 1 : 0);
    var naslovV = l.ime ? 34 : 0;
    var visina = naslovV + vrstic * VRSTICA_V + 2;

    // Na zaslonih z visoko gostoto pik bi slika pri razmerju 1 izpadla
    // mehka, zato rišemo v dvojni ločljivosti.
    var r = 2;
    var platno = document.createElement("canvas");
    platno.width = Math.max(1, Math.ceil(sirina * r));
    platno.height = Math.max(1, Math.ceil(visina * r));
    var ctx = platno.getContext("2d");
    ctx.scale(r, r);

    ctx.fillStyle = barveOzadja;
    ctx.fillRect(0, 0, sirina, visina);
    ctx.textBaseline = "middle";

    var y = 0;
    if (l.ime) {
      ctx.fillStyle = "#1c1a15";
      ctx.font = "700 15px " + PISAVA;
      ctx.fillText(String(l.ime), CEL_ODMIK, naslovV / 2);
      y = naslovV;
    }

    var vrstice = (imaGlave ? [l.glave] : []).concat(l.vrstice || []);
    vrstice.forEach(function (vrstica, vi) {
      var glava = imaGlave && vi === 0;
      if (glava) { ctx.fillStyle = "#efe9da"; ctx.fillRect(0, y, sirina, VRSTICA_V); }
      else if (vi % 2 === 0) { ctx.fillStyle = "#f7f5ee"; ctx.fillRect(0, y, sirina, VRSTICA_V); }
      ctx.font = (glava ? "700 " : "") + "13px " + PISAVA;
      ctx.fillStyle = "#1c1a15";
      var x = 0;
      sirine.forEach(function (w, ci) {
        var t = (vrstica || [])[ci];
        t = t == null ? "" : String(t);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, VRSTICA_V);
        ctx.clip();
        ctx.fillText(t, x + CEL_ODMIK, y + VRSTICA_V / 2);
        ctx.restore();
        x += w;
      });
      ctx.strokeStyle = "#e2dccd";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + VRSTICA_V - 0.5);
      ctx.lineTo(sirina, y + VRSTICA_V - 0.5);
      ctx.stroke();
      y += VRSTICA_V;
    });
    return platno;
  }

  // Več listov se zloži enega pod drugega v ENO sliko - slika je en sam
  // dokument in ločene datoteke na list bi pomenile več prenosov naenkrat,
  // kar brskalniki blokirajo.
  function zloziPodSeboj(platna, barveOzadja) {
    if (platna.length === 1) return platna[0];
    var w = Math.max.apply(null, platna.map(function (p) { return p.width; }));
    var razmik = 24;
    var h = platna.reduce(function (a, p) { return a + p.height; }, 0) + razmik * (platna.length - 1);
    var skupno = document.createElement("canvas");
    skupno.width = w; skupno.height = h;
    var ctx = skupno.getContext("2d");
    ctx.fillStyle = barveOzadja;
    ctx.fillRect(0, 0, w, h);
    var y = 0;
    platna.forEach(function (p) { ctx.drawImage(p, 0, y); y += p.height + razmik; });
    return skupno;
  }

  async function izvoziSliko(imeDatoteke, listi, vrsta, cilj) {
    preveriListe(listi);
    // JPEG ne pozna prosojnosti - brez bele podlage bi bilo ozadje črno.
    var ozadje = "#ffffff";
    var platna = listi.map(function (l) { return narisiList(l, ozadje); });
    var platno = zloziPodSeboj(platna, ozadje);
    var jpeg = vrsta === "jpeg";
    var blob = await new Promise(function (resolve, reject) {
      platno.toBlob(function (b) {
        b ? resolve(b) : reject(new Error("Slike ni bilo mogoče izdelati."));
      }, jpeg ? "image/jpeg" : "image/png", jpeg ? 0.92 : undefined);
    });
    await shrani(blob, imeDatoteke, jpeg ? "jpeg" : "png", cilj);
  }

  // ----------------------------------------------------------------- PDF
  // PDF nastane skozi tiskalniško okno brskalnika ("Shrani kot PDF"), ne
  // skozi dodatno knjižnico: knjižnica za PDF bi pomenila novih nekaj sto
  // kilobajtov na vsako nalaganje strani, pisave s šumniki pa bi bilo
  // treba vgraditi posebej. Strani, ki imajo svojo, lepšo tiskalniško
  // postavitev, jo obdržijo (glej "pdf" v export-buttons.js) - to je
  // rezerva za vse ostale vire.
  function izvoziPDF(naslov, listi) {
    preveriListe(listi);
    var ovoj = document.createElement("div");
    ovoj.className = "izvozPdfOvoj";
    var h = document.createElement("h1");
    h.textContent = naslov || "Izvoz";
    ovoj.appendChild(h);

    listi.forEach(function (l) {
      if (l.ime && listi.length > 1) {
        var h2 = document.createElement("h2");
        h2.textContent = l.ime;
        ovoj.appendChild(h2);
      }
      var t = document.createElement("table");
      if (l.glave && l.glave.length) {
        var thead = document.createElement("thead");
        var tr = document.createElement("tr");
        l.glave.forEach(function (g) {
          var th = document.createElement("th");
          th.textContent = g == null ? "" : String(g);
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        t.appendChild(thead);
      }
      var tbody = document.createElement("tbody");
      (l.vrstice || []).forEach(function (vrstica) {
        var tr2 = document.createElement("tr");
        (vrstica || []).forEach(function (c) {
          var td = document.createElement("td");
          td.textContent = c == null ? "" : String(c);
          tr2.appendChild(td);
        });
        tbody.appendChild(tr2);
      });
      t.appendChild(tbody);
      ovoj.appendChild(t);
    });

    document.body.appendChild(ovoj);
    try {
      if (window.PrintFit && typeof window.PrintFit.natisni === "function") {
        window.PrintFit.natisni(ovoj, { orientacija: "landscape" });
      } else {
        window.print();
      }
    } finally {
      // Odstranimo šele po tiskanju; nekateri brskalniki tiskalniško okno
      // odprejo asinhrono, zato z zamikom.
      setTimeout(function () {
        if (ovoj.parentNode) ovoj.parentNode.removeChild(ovoj);
      }, 1000);
    }
  }

  window.ExportUtils = {
    izvoziXLSX: izvoziXLSX,
    izvoziJSON: izvoziJSON,
    izvoziPNG: function (ime, listi, cilj) { return izvoziSliko(ime, listi, "png", cilj); },
    izvoziJPEG: function (ime, listi, cilj) { return izvoziSliko(ime, listi, "jpeg", cilj); },
    izvoziPDF: izvoziPDF,
    pripraviCilj: pripraviCilj,
    shrani: shrani,
  };
})();
