// import-utils.js — skupna logika za uvoz podatkov iz CSV, Excel (.xlsx/.xls),
// Google Sheets (javno objavljena povezava) in PDF (izvleček besedila), ki jo
// deli več strani (imenik.html, admin.html ...). Navadna (ne-Babel) datoteka,
// naložena kot <script src="import-utils.js">, ker JSX tu ni potreben —
// enako kot supabase-client.js in generator-core.js.
//
// XLSX (SheetJS, vendoriran kot xlsx.core.min.js) se naloži klasično in je na
// voljo takoj. PDF.js (pdf.min.mjs) je ES modul in ga naložimo šele ob prvi
// uporabi (dynamic import) — velika knjižnica (worker ~1.3 MB), ni smisla, da
// bremeni vsako stran, ki uvoza PDF sploh ne uporabi.
window.ImportUtils = (function () {

  function csvBesedilaVVrstice(text) {
    // Preprost CSV parser: podpira narekovaje ("polje, z vejico") in \r\n/\n.
    const vrstice = [];
    let vrstica = [], polje = "", vNarekovajih = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (vNarekovajih) {
        if (c === '"') {
          if (text[i + 1] === '"') { polje += '"'; i++; }
          else vNarekovajih = false;
        } else polje += c;
      } else {
        if (c === '"') vNarekovajih = true;
        else if (c === ',') { vrstica.push(polje); polje = ""; }
        else if (c === '\r') { /* preskoči, \n sledi */ }
        else if (c === '\n') { vrstica.push(polje); vrstice.push(vrstica); vrstica = []; polje = ""; }
        else polje += c;
      }
    }
    if (polje !== "" || vrstica.length) { vrstica.push(polje); vrstice.push(vrstica); }
    return vrstice.filter(v => v.some(p => (p || "").trim() !== ""));
  }

  function xlsxCelicaVBesedilo(c) {
    if (c === null || c === undefined) return "";
    // cellDates:true (glej spodaj) pretvori datumsko oblikovane celice v JS
    // Date namesto Excel serijske številke — tu jo damo v ISO obliko
    // (YYYY-MM-DD), da se ujema s preostalo aplikacijo (datumi so povsod ISO).
    if (c instanceof Date && !isNaN(c)) {
      // getUTC* (ne krajevni čas) - SheetJS datumske celice bere kot UTC
      // polnoč, krajevni čas bi lahko ob negativnem UTC odmiku premaknil dan.
      const y = c.getUTCFullYear(), m = String(c.getUTCMonth()+1).padStart(2,"0"), d = String(c.getUTCDate()).padStart(2,"0");
      return `${y}-${m}-${d}`;
    }
    return String(c);
  }

  function xlsxVVrstice(arrayBuffer) {
    if (!window.XLSX) throw new Error("XLSX knjižnica ni naložena (manjka xlsx.core.min.js).");
    const wb = window.XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const prviList = wb.SheetNames[0];
    const sheet = wb.Sheets[prviList];
    const vrstice = window.XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
    return vrstice.map(v => v.map(xlsxCelicaVBesedilo));
  }

  let pdfjsPromise = null;
  function nalozipdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("./pdf.min.mjs").then(lib => {
        lib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.mjs";
        return lib;
      });
    }
    return pdfjsPromise;
  }

  // PDF nima zanesljive splošne "razpoznaj tabelo" logike v brskalniku brez
  // strežnika (glej prejšnjo analizo v roster/analiza-razporedov.md — za
  // barvne PDF preglednice smo uporabljali Python/PyMuPDF). Tu zato samo
  // izvlečemo golo besedilo po vrsticah (position-sortirano po Y, nato X) —
  // uporabnik/admin nato ročno preveri/uredi pred uvozom, enako kot pri
  // "prilepi CSV besedilo" polju.
  async function pdfVBesedilneVrstice(arrayBuffer) {
    const pdfjsLib = await nalozipdfjs();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const vrstice = [];
    for (let s = 1; s <= doc.numPages; s++) {
      const stran = await doc.getPage(s);
      const vsebina = await stran.getTextContent();
      const poVrsticah = new Map(); // zaokrožen Y -> [{x, str}]
      vsebina.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (!poVrsticah.has(y)) poVrsticah.set(y, []);
        poVrsticah.get(y).push({ x: item.transform[4], str: item.str });
      });
      const yji = Array.from(poVrsticah.keys()).sort((a, b) => b - a);
      yji.forEach(y => {
        const kosi = poVrsticah.get(y).sort((a, b) => a.x - b.x);
        const besedilo = kosi.map(k => k.str).join(" ").replace(/\s+/g, " ").trim();
        if (besedilo) vrstice.push(besedilo);
      });
    }
    return vrstice;
  }

  // Glavna vstopna točka: prebere File objekt (iz <input type="file">) in
  // vrne { vrsteVrstic: string[][], tip: "csv"|"xlsx"|"pdf-besedilo" }.
  // Za PDF je vsaka "vrstica" en sam string (golo besedilo), ne razdeljena
  // po stolpcih — kličoča koda naj to prikaže v urejljivem polju za pregled.
  function preberiDatoteko(file) {
    const ime = (file.name || "").toLowerCase();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Napaka pri branju datoteke."));
      if (ime.endsWith(".xlsx") || ime.endsWith(".xls") || ime.endsWith(".xlsb")) {
        reader.onload = () => {
          try { resolve({ vrsteVrstic: xlsxVVrstice(reader.result), tip: "xlsx" }); }
          catch (e) { reject(e); }
        };
        reader.readAsArrayBuffer(file);
      } else if (ime.endsWith(".pdf")) {
        reader.onload = () => {
          pdfVBesedilneVrstice(reader.result)
            .then(vrstice => resolve({ vrsteVrstic: vrstice.map(v => [v]), tip: "pdf-besedilo" }))
            .catch(reject);
        };
        reader.readAsArrayBuffer(file);
      } else {
        // .csv, .txt ali karkoli drugega — obravnavaj kot besedilo
        reader.onload = () => resolve({ vrsteVrstic: csvBesedilaVVrstice(String(reader.result || "")), tip: "csv" });
        reader.readAsText(file, "UTF-8");
      }
    });
  }

  // Google Sheets: brez OAuth/API ključa lahko beremo samo javno objavljene
  // preglednice ("Datoteka -> Skupna raba -> Objavi v spletu", ali povezava
  // za deljenje z dovoljenjem "Vsak, ki ima povezavo"). Iz poljubne
  // docs.google.com/spreadsheets/... povezave sestavimo CSV-izvozno povezavo
  // in jo preberemo kot CSV. Če preglednica ni javna, fetch spodleti (bo
  // vrnil prijavno stran ali 401/403) — to sporočimo uporabniku.
  function googleSheetCsvUrl(url) {
    const m = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) throw new Error("Ni videti kot povezava Google Sheets (pričakovano: docs.google.com/spreadsheets/d/...).");
    const id = m[1];
    const gidM = String(url).match(/[?#&]gid=([0-9]+)/);
    const gid = gidM ? gidM[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }

  async function preberiGoogleSheet(url) {
    const csvUrl = googleSheetCsvUrl(url);
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(
        `Google Sheets ni dostopen (${res.status}). Preveri, da je preglednica deljena z "Vsak, ki ima povezavo` +
        ` lahko ogleda" (Skupna raba), ne samo z določenimi osebami.`
      );
    }
    const text = await res.text();
    if (/^\s*<!DOCTYPE html/i.test(text)) {
      throw new Error("Google je vrnil prijavno stran namesto CSV — preglednica ni javno dostopna.");
    }
    return { vrsteVrstic: csvBesedilaVVrstice(text), tip: "csv" };
  }

  // Pretvori surove vrstice (string[][]) v vrstice-objekte glede na podano
  // seznam pričakovanih glav stolpcev (v vrstnem redu). Prva vrstica se šteje
  // za glavo, če se prvo polje (case-insensitive) ujema z eno od
  // moznaGlavaPrviStolpec vrednosti — sicer se privzame, da glave ni in se
  // stolpci mapirajo po vrstnem redu podanih imen.
  function vVrsticeObjekte(vrsteVrstic, imenaStolpcev, moznaGlavaPrviStolpec) {
    if (!vrsteVrstic.length) return [];
    let zacni = 0;
    const prvo = (vrsteVrstic[0][0] || "").trim().toLowerCase();
    if ((moznaGlavaPrviStolpec || []).some(g => prvo === g.toLowerCase())) zacni = 1;
    const out = [];
    for (let i = zacni; i < vrsteVrstic.length; i++) {
      const vrstica = vrsteVrstic[i];
      const obj = {};
      imenaStolpcev.forEach((ime, idx) => { obj[ime] = (vrstica[idx] || "").toString().trim(); });
      if (Object.values(obj).some(v => v !== "")) out.push(obj);
    }
    return out;
  }

  // Poišče vrstico glave med prvimi 15 vrsticami (ne samo vrstico 0) - nekateri
  // izvozi (npr. Kadris) imajo nad tabelo naslovne vrstice. Vrne indekse
  // stolpcev za vrstico z NAJVEČ ujemanji (vsaj 2, sicer privzame vrstico 0
  // za nazaj združljivost s tem, kar je klicalo to funkcijo prej).
  function najdiGlavo(vrsteVrstic, glaveMapa) {
    const meja = Math.min(vrsteVrstic.length, 15);
    let najboljsi = { vrstica: 0, indeksi: {}, steviloUjemanj: -1 };
    for (let i = 0; i < meja; i++) {
      const glava = (vrsteVrstic[i] || []).map(g => (g || "").toString().trim().toLowerCase());
      const indeksi = {};
      Object.keys(glaveMapa).forEach(kanonicno => {
        const mozne = glaveMapa[kanonicno].map(g => g.toLowerCase());
        const idx = glava.findIndex(g => mozne.includes(g));
        if (idx !== -1) indeksi[kanonicno] = idx;
      });
      const stevilo = Object.keys(indeksi).length;
      if (stevilo > najboljsi.steviloUjemanj) najboljsi = { vrstica: i, indeksi, steviloUjemanj: stevilo };
    }
    return najboljsi;
  }

  // Splošnejša različica za realne datoteke, kjer vrstni red stolpcev ni
  // znan vnaprej (npr. uraden HR izvoz z veliko stolpci v poljubnem
  // vrstnem redu). glaveMapa je { kanoničnoIme: [možne glave, case-
  // insensitive] }. Stolpci, ki jih ni v datoteki, ostanejo prazen string ""
  // v vsakem vrnjenem objektu.
  function vVrsticeObjekteGlave(vrsteVrstic, glaveMapa) {
    if (!vrsteVrstic.length) return { objekti: [], najdeniStolpci: [] };
    const { vrstica: glavaVrstica, indeksi } = najdiGlavo(vrsteVrstic, glaveMapa);
    const out = [];
    for (let i = glavaVrstica + 1; i < vrsteVrstic.length; i++) {
      const vrstica = vrsteVrstic[i];
      const obj = {};
      Object.keys(glaveMapa).forEach(kanonicno => {
        const idx = indeksi[kanonicno];
        obj[kanonicno] = idx !== undefined ? (vrstica[idx] || "").toString().trim() : "";
      });
      if (Object.values(obj).some(v => v !== "")) out.push(obj);
    }
    return { objekti: out, najdeniStolpci: Object.keys(indeksi) };
  }

  // Pretvori datum, zapisan kot besedilo v slovenski obliki DD.MM.LLLL (ali
  // DD/MM/LLLL) - tako HR izvozi (Excel) POGOSTO zapišejo "Datum rojstva" kot
  // navadno besedilo, ne kot pravo Excel datumsko celico - v ISO YYYY-MM-DD.
  // Brez tega bi npr. Postgres "date" stolpec "19.08.2002" razumel kot
  // MM.DD.LLLL (privzet vrstni red), kar bi za dneve >12 vrglo napako, za
  // ostale pa tiho zamenjalo dan/mesec. Že-ISO ali prazne vrednosti pustimo
  // pri miru.
  function normalizirajDatum(s) {
    const t = (s || "").toString().trim();
    if (!t) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    // Presledki po pikah ("1. 9. 2026") - tako realni Google Sheets datumi
    // (npr. "2026 SMS RAZPORED") običajno zapišejo datum, za razliko od
    // strogo "1.9.2026" brez presledkov.
    const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    return t;
  }

  return { preberiDatoteko, preberiGoogleSheet, vVrsticeObjekte, vVrsticeObjekteGlave, csvBesedilaVVrstice, normalizirajDatum };
})();
