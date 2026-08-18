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

  // Excel/Google Sheets shranjujeta datum kot "serijsko število" (št. dni od
  // fiksnega izhodišča) - CELO za navadne, brez-urne datume ta številka
  // pogosto NI točno cel dan, ampak ima drobno plavajočo napako (npr.
  // 46173.999999988 namesto točno 46174 za isti dan) - resnično se to
  // zgodi pri izvozu iz Google Sheets. Knjižnica (xlsx.core.min.js) to
  // brez zaokroževanja pretvori v čas TIK PRED polnočjo PRAVEGA dne (npr.
  // "23:59:59.998" prejšnjega koledarskega dne) - golo odrezanje prvih 10
  // znakov ISO niza bi zato vrnilo NAPAČEN, za en dan prestavljen datum.
  // Najden in preverjen na resničnem zapisu/branju prek xlsx.core.min.js,
  // glej skripte/preveri-xlsx-datum.mjs - to je bil pravi vzrok napake
  // "vpisi pristanejo na napačnem dnevu" pri uvozu iz naložene .xlsx
  // datoteke (CSV/Google Sheets pot te napake nima, ker izvozi besedilo
  // datuma, ne binarno serijsko številko).
  const DAN_MS = 24 * 60 * 60 * 1000;
  const ISO_CAS_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  function zaokroziNaDan(casovniZig){
    const zaokrozenDan = Math.round(casovniZig / DAN_MS);
    const d = new Date(zaokrozenDan * DAN_MS);
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth()+1).padStart(2,"0"), dd = String(d.getUTCDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }
  function xlsxCelicaVBesedilo(c) {
    if (c === null || c === undefined) return "";
    // cellDates:true (glej spodaj) BI moral pretvoriti datumsko oblikovane
    // celice v JS Date - ta vendorirana različica xlsx.core.min.js pa
    // dejansko vrne ISO niz S ČASOM (npr. "2026-06-01T00:00:00.000Z"), ne
    // Date objekta - zato preverimo OBOJE, defenzivno.
    if (c instanceof Date && !isNaN(c)) return zaokroziNaDan(c.getTime());
    if (typeof c === "string" && ISO_CAS_RX.test(c)) {
      const t = Date.parse(c);
      if (!isNaN(t)) return zaokroziNaDan(t);
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

  // Za "pametni uvoz" (glej index.html uvoziDatotekoPametno) - za razliko od
  // xlsxVVrstice zgoraj prebere VSE zavihke naenkrat, ne samo prvega, da
  // klicatelj lahko samodejno prepozna, kateri zavihek je kateri
  // oddelek/mesec (npr. pravi delovni zvezek "2026 SMS RAZPORED" ima en
  // zavihek na oddelek).
  function xlsxVsiListi(arrayBuffer) {
    if (!window.XLSX) throw new Error("XLSX knjižnica ni naložena (manjka xlsx.core.min.js).");
    const wb = window.XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    return wb.SheetNames.map(naziv => {
      const vrstice = window.XLSX.utils.sheet_to_json(wb.Sheets[naziv], { header: 1, blankrows: false, defval: "" });
      return { naziv, vrsteVrstic: vrstice.map(v => v.map(xlsxCelicaVBesedilo)) };
    });
  }

  // Prebere File objekt v { listi: [{ naziv, vrsteVrstic }] } - eden na
  // vsak zavihek za pravi Excel delovni zvezek (.xlsx/.xls/.xlsb); za
  // CSV/besedilo je "list" en sam, poimenovan po datoteki (brez pripone),
  // ker CSV nima pojma zavihkov.
  function preberiVseListe(file) {
    const ime = (file.name || "").toLowerCase();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Napaka pri branju datoteke."));
      if (ime.endsWith(".xlsx") || ime.endsWith(".xls") || ime.endsWith(".xlsb")) {
        reader.onload = () => {
          try { resolve({ listi: xlsxVsiListi(reader.result) }); }
          catch (e) { reject(e); }
        };
        reader.readAsArrayBuffer(file);
      } else if (ime.endsWith(".csv") || ime.endsWith(".txt")) {
        reader.onload = () => {
          const naziv = (file.name || "list").replace(/\.[^.]+$/, "");
          resolve({ listi: [{ naziv, vrsteVrstic: csvBesedilaVVrstice(String(reader.result || "")) }] });
        };
        reader.readAsText(file, "UTF-8");
      } else if (ime.endsWith(".pdf")) {
        // PDF nima zavihkov - cel dokument je en "list". Stolpci se
        // rekonstruirajo po navpičnem belem prostoru (glej pdfKoscjiVTabelo);
        // če jih ni najti (navaden dopis, ne preglednica), to javimo z jasnim
        // sporočilom namesto tihega uvoza ene same "stolpčne" kolone.
        reader.onload = () => {
          pdfVTabelo(reader.result).then(vrsteVrstic => {
            if (!vrsteVrstic.some(v => v.length > 1)) {
              reject(new Error(
                "V tem PDF-ju ni bilo mogoče prepoznati stolpcev (videti je kot navadno besedilo, ne preglednica). "
                + "Za samodejni uvoz razporeda uporabi .xlsx/.csv izvoz ali PDF, ki vsebuje pravo tabelo."
              ));
              return;
            }
            const naziv = (file.name || "list").replace(/\.[^.]+$/, "");
            resolve({ listi: [{ naziv, vrsteVrstic }] });
          }).catch(reject);
        };
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error(
          "Ta vrsta datoteke ni podprta za samodejni uvoz (pričakovano: .xlsx, .xls, .csv ali .pdf) - "
          + "izvozi razpored iz Google Sheets/Excela v eno od teh oblik."
        ));
      }
    });
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

  // Iz koščkov besedila ENE strani rekonstruira PRAVE stolpce (ne samo
  // besedilnih vrstic, kot je delala prejšnja različica). pdf.js za vsak
  // košček pove tudi njegovo vodoravno lego in širino, zato stolpce najdemo
  // po "navpičnem belem prostoru": vse koščke projiciramo na os X, združimo
  // prekrivajoče se odseke, in kjer med njimi ostane dovolj širok prazen pas
  // (minPresledek), je meja med stolpcema. Ta pristop pravilno obdrži skupaj
  // več besed v ISTI celici ("Grega Arnež" = dve besedi, majhen presledek),
  // hkrati pa loči sosednja stolpca (velik presledek).
  //
  // Zakaj ne preprosto gručenje X-lege začetkov: besede znotraj ene celice se
  // začenjajo na različnih X, zato bi vsaka beseda postala svoj "stolpec".
  //
  // Meje stolpcev se računajo SAMO iz vrstic s "tipičnim" (najpogostejšim)
  // številom koščkov na strani (>= 2) - potrjeno na pravem uradnem dokumentu
  // ("Razporeditev zaposlenih v UA in DEŽ"): naslovna vrstica ("Zadeva: ...")
  // je EN sam košček, širok skoraj celo stran - če bi ga uporabili za
  // določanje pasov, bi s svojo širino "prekril" meje med vsemi pravimi
  // stolpci in ves dokument sesul v en sam stolpec. Enako lahko naredi
  // podpisni blok na dnu. Vrstice, ki ne ustrezajo tipičnemu številu
  // koščkov (naslov, podpis, ali redka vrstica, kjer je PDF dva soseda
  // pomotoma združil v en košček), se še vedno izpišejo - le da jih, če
  // imajo samo EN košček, obravnavamo kot golo besedilo (cela vrstica en
  // sam stolpec), ne poskušamo jih siliti v mrežo.
  //
  // Ostane hevristika (PDF ne nosi podatka o tabeli) - zato uvoz rezultat
  // vedno pokaže v predogledu, preden karkoli zapiše.
  function pdfKoscjiVTabelo(koscki, minPresledek) {
    const prag = minPresledek == null ? 8 : minPresledek; // v PDF točkah (1/72")
    if (!koscki.length) return [];
    // 1) Vrstice: koščki z (zaokroženo) isto navpično lego. Y v PDF raste
    //    navzgor, zato padajoče = od vrha strani navzdol.
    const poVrsticah = new Map();
    koscki.forEach(k => {
      const y = Math.round(k.y);
      if (!poVrsticah.has(y)) poVrsticah.set(y, []);
      poVrsticah.get(y).push(k);
    });
    const vrsticeY = Array.from(poVrsticah.keys()).sort((a, b) => b - a);

    // 2) Tipično število koščkov na vrstico (mode med vrsticami z >= 2) -
    //    samo te vrstice smejo določati meje stolpcev.
    const steviloPoVrstici = vrsticeY.map(y => poVrsticah.get(y).length);
    const stevec = new Map();
    steviloPoVrstici.forEach(n => { if (n >= 2) stevec.set(n, (stevec.get(n) || 0) + 1); });
    let tipicno = 0, najvecKrat = 0;
    stevec.forEach((krat, n) => { if (krat > najvecKrat) { najvecKrat = krat; tipicno = n; } });

    // 3) Pasovi SAMO iz tipičnih vrstic.
    const odseki = [];
    vrsticeY.forEach(y => {
      const vrstica = poVrsticah.get(y);
      if (vrstica.length !== tipicno) return;
      vrstica.forEach(k => odseki.push([k.x, k.x + (k.sirina > 0 ? k.sirina : String(k.str || "").length * 4)]));
    });
    odseki.sort((a, b) => a[0] - b[0]);
    const pasovi = [];
    odseki.forEach(([a, b]) => {
      const zadnji = pasovi[pasovi.length - 1];
      if (zadnji && a - zadnji[1] < prag) { if (b > zadnji[1]) zadnji[1] = b; }
      else pasovi.push([a, b]);
    });

    // 4) Izris: vrstica z EDINIM koščkom (naslov, podpis, opomba) -> en sam
    //    stolpec, ne poskušamo je uvrstiti v pasove. Ostale vrstice (tudi
    //    tiste, ki ne ustrezajo "tipičnemu" številu - npr. vikend dan brez
    //    zasedbe v enem stolpcu) se razporedijo po pasovih kot običajno.
    const vrstice = [];
    vrsticeY.forEach(y => {
      const kosckiVrstice = poVrsticah.get(y).sort((a, b) => a.x - b.x);
      if (!pasovi.length || kosckiVrstice.length === 1) {
        const besedilo = kosckiVrstice.map(k => String(k.str || "")).join(" ").replace(/\s+/g, " ").trim();
        if (besedilo) vrstice.push([besedilo]);
        return;
      }
      const celice = pasovi.map(() => []);
      kosckiVrstice.forEach(k => {
        // Pas, ki vsebuje začetek koščka; sicer najbližji (košček lahko rahlo
        // štrli čez rob pasu, npr. pri drugačni pisavi v isti tabeli).
        let idx = pasovi.findIndex(p => k.x >= p[0] - 0.5 && k.x <= p[1] + 0.5);
        if (idx === -1) {
          let najboljse = Infinity;
          pasovi.forEach((p, i) => {
            const d = k.x < p[0] ? p[0] - k.x : (k.x > p[1] ? k.x - p[1] : 0);
            if (d < najboljse) { najboljse = d; idx = i; }
          });
        }
        if (idx >= 0) celice[idx].push(String(k.str || ""));
      });
      const vrstica = celice.map(c => c.join(" ").replace(/\s+/g, " ").trim());
      if (vrstica.some(c => c !== "")) vrstice.push(vrstica);
    });
    return vrstice;
  }

  async function pdfVTabelo(arrayBuffer) {
    const pdfjsLib = await nalozipdfjs();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let vse = [];
    for (let s = 1; s <= doc.numPages; s++) {
      const stran = await doc.getPage(s);
      const vsebina = await stran.getTextContent();
      const koscki = vsebina.items
        .filter(item => String(item.str || "").trim() !== "")
        .map(item => ({ x: item.transform[4], y: item.transform[5], sirina: item.width || 0, str: item.str }));
      // Stolpci se iščejo NA VSAKI STRANI POSEBEJ - uradni dokumenti imajo
      // pogosto drugačno postavitev na prvi strani (glava z logotipom) kot na
      // naslednjih, skupno iskanje bi ju zlilo v napačne stolpce.
      vse = vse.concat(pdfKoscjiVTabelo(koscki));
    }
    return vse;
  }

  // Glavna vstopna točka: prebere File objekt (iz <input type="file">) in
  // vrne { vrsteVrstic: string[][], tip: "csv"|"xlsx"|"pdf-besedilo" }.
  // Za PDF je vsaka "vrstica" en sam string (golo besedilo), ne razdeljena
  // po stolpcih — kličoča koda naj to prikaže v urejljivem polju za pregled.
  // JSON v isto obliko kot CSV/Excel (vrstice x stolpci), da ga preostala
  // uvozna logika obravnava enako.
  //   .jsonl  — en zapis na vrstico
  //   .json   — polje objektov, polje polj, ali objekt z enim poljem znotraj
  //   .gsheet — NI podatek, ampak bližnjica iz Google Drive z URL-jem; vrne
  //             se povezava, ki jo stran nato uvozi po običajni poti
  // Glave se sestavijo iz unije ključev, da manjkajoč ključ v posameznem
  // zapisu ne premakne stolpcev.
  function jsonVVrstice(besedilo, ime) {
    const t = besedilo.trim();
    if (!t) throw new Error("Datoteka je prazna.");

    if (ime.endsWith(".gsheet")) {
      let url = null;
      try { url = (JSON.parse(t) || {}).url || null; } catch (e) { /* spodaj */ }
      if (!url) throw new Error("V .gsheet datoteki ni povezave do preglednice.");
      return { vrsteVrstic: [], tip: "gsheet", url: url };
    }

    let zapisi;
    if (ime.endsWith(".jsonl")) {
      zapisi = t.split(/\r?\n/).filter(v => v.trim()).map((v, i) => {
        try { return JSON.parse(v); }
        catch (e) { throw new Error("Vrstica " + (i + 1) + " ni veljaven JSON."); }
      });
    } else {
      let podatki;
      try { podatki = JSON.parse(t); }
      catch (e) { throw new Error("Datoteka ni veljaven JSON: " + (e.message || e)); }
      if (Array.isArray(podatki)) zapisi = podatki;
      else if (podatki && typeof podatki === "object") {
        // Objekt ovija podatke (npr. { "vrstice": [...] }) — vzemi prvo polje.
        const polje = Object.keys(podatki).find(k => Array.isArray(podatki[k]));
        if (!polje) throw new Error("V JSON datoteki ni seznama zapisov.");
        zapisi = podatki[polje];
      } else throw new Error("V JSON datoteki ni seznama zapisov.");
    }
    if (!zapisi.length) return { vrsteVrstic: [], tip: "json" };

    if (Array.isArray(zapisi[0])) {
      return { vrsteVrstic: zapisi.map(v => v.map(c => (c == null ? "" : String(c)))), tip: "json" };
    }
    const glave = [];
    zapisi.forEach(z => Object.keys(z || {}).forEach(k => { if (!glave.includes(k)) glave.push(k); }));
    const vrstice = zapisi.map(z => glave.map(k => {
      const v = (z || {})[k];
      return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
    }));
    return { vrsteVrstic: [glave, ...vrstice], tip: "json" };
  }

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
          pdfVTabelo(reader.result)
            .then(vrsteVrstic => {
              // Če je PDF navadno besedilo (dopis, opomba), ne preglednica,
              // ima rezultat en sam stolpec - to javimo kot "pdf-besedilo",
              // da kličoča stran ponudi ročno urejanje namesto uvoza tabele.
              const vecStolpcev = vrsteVrstic.some(v => v.length > 1);
              resolve({ vrsteVrstic, tip: vecStolpcev ? "pdf" : "pdf-besedilo" });
            })
            .catch(reject);
        };
        reader.readAsArrayBuffer(file);
      } else if (ime.endsWith(".json") || ime.endsWith(".jsonl") || ime.endsWith(".gsheet")) {
        reader.onload = () => {
          try { resolve(jsonVVrstice(String(reader.result || ""), ime)); }
          catch (e) { reject(e); }
        };
        reader.readAsText(file, "UTF-8");
      } else if (ime.endsWith(".heic") || ime.endsWith(".heif") || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(ime)) {
        // Slika razporeda ni berljiva brez OCR, tega pa aplikacija nima.
        // Namesto tihe napake ("prazna datoteka") povemo, kaj storiti — ker
        // bi napačno prebran razpored pomenil napačne izmene ljudem.
        reject(new Error(
          "Slik (" + ime.split(".").pop() + ") aplikacija ne zna prebrati — za to bi bilo potrebno "
          + "prepoznavanje besedila, ki ga nima. Razpored izvozi iz Excela/Google Sheets "
          + "(.xlsx, .csv) ali prilepi povezavo do Google preglednice."
        ));
      } else if (ime.endsWith(".docx") || ime.endsWith(".doc")) {
        reject(new Error(
          "Wordovih datotek aplikacija ne zna prebrati. Če je razpored v tabeli, jo v Wordu "
          + "označi in prilepi v Excel ali Google Sheets, nato uvozi .xlsx/.csv."
        ));
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

  // Enoten seznam za "accept" na <input type=file> — da vse strani ponujajo
  // isto in da se ne razide s tem, kar preberiDatoteko dejansko zna.
  const PODPRTE_PRIPONE = ".csv,.txt,.xlsx,.xls,.xlsb,.json,.jsonl,.gsheet,.pdf";

  return { preberiDatoteko, preberiVseListe, preberiGoogleSheet, vVrsticeObjekte, vVrsticeObjekteGlave, csvBesedilaVVrstice, normalizirajDatum, jsonVVrstice, pdfKoscjiVTabelo, PODPRTE_PRIPONE };
})();
