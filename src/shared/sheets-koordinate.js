/* Razpored PBB – src/shared/sheets-koordinate.js
 *
 * EDINI vir resnice o tem, KATERA CELICA v Google listu pomeni KATERO
 * osebo in KATERI dan. Uporabljata ga obe Edge Functions za
 * sinhronizacijo ("sheets-izhod" in "sheets-vhod").
 *
 * ZAKAJ SVOJA DATOTEKA IN NE UVOZ OBSTOJEČE KODE
 * Ista logika v brskalniku živi v index.html (obdelajBlok,
 * najdiVrsticoImen, pripraviPosodobitveOddelka), v imena.js, parafa.js,
 * izmene.js in import-utils.js. Te datoteke so klasične skripte
 * (window.X = ...), brez `export` - brskalnik jih mora izvesti sinhrono
 * v določenem vrstnem redu, Deno pa jih zato ne more uvoziti. Isti
 * razlog kot pri _shared/delovni-cas.js.
 *
 * Ker je to kopija logike, jo varuje skripte/preveri-sheets-deljena-koda.mjs:
 * na istem naboru primerov mora dati ISTE odgovore kot izvirniki, in
 * kopija v supabase/functions/_shared/ mora biti bajt za bajt enaka tej
 * datoteki. Razhajanje pade v preizkusu, ne na pravem dokumentu.
 *
 * Odvisnosti: nobene.
 */

// --- Imena (izvirnik: imena.js, parafa.js) ----------------------------
// Znane tipkarske napake in okrajšave, ki so POTRJENE kot ista oseba.
export const PSEVDONIM = { "HORVAT": "HROVAT", "TOMAŽEVIĆ": "TOMAŽEVIČ" };
export const KRATKO_PSEVDONIM = { "VALJAVEC A.": "VALJAVEC E." };
const NAZIV = { "DR.": true, "MAG.": true, "PROF.": true, "SPEC.": true, "DIPL.": true, "UNIV.": true };

export function brezStresic(s) {
  return String(s || "").toUpperCase()
    .replace(/[ČĆ]/g, "C").replace(/Š/g, "S").replace(/Ž/g, "Z").replace(/Đ/g, "D");
}

function jeZetonImena(b) {
  return !!b && !NAZIV[b] && /[A-ZČŠŽĆĐ]/.test(b);
}

export function normaliziraj(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ")
    .split(" ")
    .filter(jeZetonImena)
    .map(function (b) { return PSEVDONIM[b] || b; })
    .join(" ");
}

// "Bećirović Nelvedin" in "BEČIROVIĆ N." dasta oba "BECIROVIC|N".
export function kratkiKljuc(s) {
  const besede = brezStresic(normaliziraj(s)).replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (!besede.length) return "";
  if (besede.length === 1) return besede[0] + "|";
  return besede.slice(0, -1).join(" ") + "|" + besede[besede.length - 1].charAt(0);
}

// Kratko ime, prebrano IZ LISTA (glava stolpca), v isti ključ.
export function kratkoKljuc(ime) {
  const k = String(ime || "").trim().toUpperCase();
  return kratkiKljuc(KRATKO_PSEVDONIM[k] || k);
}

// --- Izmene (izvirnik: izmene.js) -------------------------------------
// Samo [vzorec, kratica]; barve, nazivi in časi so stvar prikaza in tu
// niso potrebni. Vrstni red JE pomemben - prvo ujemanje obvelja.
// [vzorec, kratica, barva]. Barve so iste kot v aplikaciji (izmene.js,
// peti stolpec tamkajšnje tabele) - preveri-sheets-deljena-koda.mjs ju
// primerja vrstico za vrstico, da se ne moreta raziti.
const IZMENA_KRATICE = [
  [/^dežurstvo|^dezurstvo/, "DEŽ", "#B3402A"],
  [/^dnevna12\(7-19\)|^dnevna12f/, "DF12", "#B49BD0"],
  [/^dnevna12/, "D12", "#8560A8"],
  [/^nočna12|^nocna12/, "N12", "#2F4785"],
  [/^nočnaod19|^nocnaod19|^nočna11|^nocna11/, "N11", "#7C90CE"],
  [/^nočna|^nocna/, "N10", "#4A67B0"],
  [/^popoldando19|^popoldnedo19/, "PO5", "#E8A867"],
  [/^popoldando20|^popoldnedo20/, "PO6", "#D98E4E"],
  [/^dop\D*6/, "DO6", "#63B588"],
  [/^dop\D*4/, "DO4", "#A7DCC0"],
  [/^pop\D*4/, "PO4", "#F0C08A"],
  [/^popoldan|^popoldne/, "PO7", "#C9713F"],
  [/^do7|^dopoldan7/, "DO7", "#8FCBA4"],
  [/^dopoldan|^dopoldne|^prisoten/, "DOP", "#4F9B6B"],
  [/^kpu/, "KPU", "#B8B29C"],
  [/^ld/, "LD", "#E06666"],
  [/^por/, "POR", "#E8A0C8"],
  [/^sti/, "STI", "#B4A7D6"],
  [/^bs/, "BS", "#3F8F86"],
  [/^kro/, "KRO", "#9FC5E8"],
];

// Prosto (prazna celica) in neznana koda - isti barvi kot v aplikaciji
// (STANJE_BARVA.prosto oz. siva za neznano).
export const BARVA_PROSTO = "#D8D2BE";
export const BARVA_NEZNANO = "#8B8672";

// Izvožen zato, da preizkus lahko primerja tabelo z izvirnikom v
// izmene.js vrstico za vrstico - nova koda tam mora priti tudi sem.
export const KRATICE = IZMENA_KRATICE;

// Uradna kratica za zapis iz lista, ali null. null pomeni dvoje in
// klicatelj mora razlikovati: prazna celica / "prosto" (v redu) ali
// neznana koda (gre v sync_errors) - glej jePrazenZapis.
function vrsticaSifranta(sifra) {
  const t = String(sifra || "").toLowerCase().replace(/[\s.]+/g, "");
  if (!t) return null;
  if (t === "prost" || t === "prosto") return null;
  for (let i = 0; i < IZMENA_KRATICE.length; i++) {
    if (IZMENA_KRATICE[i][0].test(t)) return IZMENA_KRATICE[i];
  }
  return null;
}

export function kratica(sifra) {
  const v = vrsticaSifranta(sifra);
  return v ? v[1] : null;
}

// Prazna celica in izrecno zapisano "prosto" pomenita isto: prost dan.
// To NI napaka in ne sme v sync_errors.
export function jePrazenZapis(sifra) {
  const t = String(sifra || "").toLowerCase().replace(/[\s.]+/g, "");
  return !t || t === "prost" || t === "prosto";
}

// Primerjava dveh zapisov iste izmene. List piše "popoldan do 19",
// aplikacija "Popoldne do 19" - dobesedna primerjava bi ju imela za
// različna in bi se sinhronizacija lovila v krogu. Primerja se kratica.
export function istaIzmena(a, b) {
  if (jePrazenZapis(a) && jePrazenZapis(b)) return true;
  if (jePrazenZapis(a) !== jePrazenZapis(b)) return false;
  const ka = kratica(a), kb = kratica(b);
  // Dve neznani kodi sta enaki le, če sta dobesedno enaki - sicer bi vse
  // neznano veljalo za "že enako" in se ne bi nikoli zapisalo.
  if (ka === null || kb === null) {
    return String(a || "").trim() === String(b || "").trim();
  }
  return ka === kb;
}

// --- Datumi in zamik stolpcev (izvirnik: import-utils.js) -------------
export const ISO_DATUM_RX = /^\d{4}-\d{2}-\d{2}$/;

export function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return t;
}

// Noben zavihek uradnega dokumenta se ne začne v stolpcu A. Zamika ne
// ugibamo iz imena zavihka, ampak ga IZMERIMO: stolpec, v katerem je
// največ celic videti kot datum.
export function najdiZamikStolpcev(vrsteVrstic, najvecStolpcev) {
  const meja = najvecStolpcev || 8;
  const poStolpcu = [];
  (vrsteVrstic || []).forEach(function (vrstica) {
    if (!vrstica) return;
    for (let k = 0; k < meja && k < vrstica.length; k++) {
      if (ISO_DATUM_RX.test(normalizirajDatum(vrstica[k]))) {
        poStolpcu[k] = (poStolpcu[k] || 0) + 1;
      }
    }
  });
  let najboljsi = 0, najvec = 0;
  for (let k = 0; k < meja; k++) {
    if ((poStolpcu[k] || 0) > najvec) { najvec = poStolpcu[k]; najboljsi = k; }
  }
  return najvec > 0 ? najboljsi : 0;
}

// --- Sprehod po blokih (izvirnik: index.html) -------------------------
const VLOGA_RX = /SMS|DMS|TZN|DZN/i;

function vrsticaJePrazna(vrstica) {
  return !vrstica || vrstica.length === 0
    || vrstica.every((c) => (c == null ? "" : String(c)).trim() === "");
}

// Glava (vrstica z imeni) stoji 1-3 vrstice nad prvim dnem bloka; vmes je
// lahko vrstica vloge ("SMS / TZN") ali prazna vrstica.
export function najdiVrsticoImen(vrsteVrstic, zacetekBloka, zamik) {
  zamik = zamik || 0;
  for (let i = zacetekBloka - 1, korakov = 0; i >= 0 && korakov < 6; i--, korakov++) {
    const vrstica = vrsteVrstic[i] || [];
    if (ISO_DATUM_RX.test(normalizirajDatum(vrstica[zamik]))) return null; // prejšnji blok
    const celica = (vrstica[zamik + 2] || "").trim();
    if (!celica) continue;
    if (VLOGA_RX.test(celica)) continue;
    return i;
  }
  return null;
}

// En strnjen sklop datumskih vrstic. Vrne indeks tik za sklopom.
export function obdelajBlok(vrsteVrstic, i, startISO, endISO, poisciGlavo, offset, obdelajVrstico, stanje, zamik) {
  zamik = zamik || 0;
  const glavaIdx = poisciGlavo(vrsteVrstic, i, zamik);
  const glava = glavaIdx != null ? vrsteVrstic[glavaIdx].slice(zamik + offset) : [];
  let j = i, praznihZapored = 0;
  while (j < vrsteVrstic.length) {
    if (vrsticaJePrazna(vrsteVrstic[j])) {
      if (++praznihZapored > 20) break;
      j++; continue;
    }
    praznihZapored = 0;
    const datum = normalizirajDatum(vrsteVrstic[j][zamik]);
    if (!ISO_DATUM_RX.test(datum)) break;
    if (datum >= startISO && datum <= endISO) {
      stanje.najdenDatum = true;
      if (glava.length) { stanje.najdenaGlava = true; obdelajVrstico(vrsteVrstic[j], glava, datum, j); }
    }
    j++;
  }
  return j;
}

// Vse celice oddelčnega zavihka, ki v obdobju [startISO, endISO] pomenijo
// (oseba, dan). To je EDINA točka, ki koordinate izračuna - obe smeri
// sinhronizacije jo uporabita, da se ne moreta razhajati:
//   app -> sheets: za vsako celico vzame vrednost iz baze,
//   sheets -> app: v seznamu poišče celico, ki jo je nekdo uredil.
// Indeksa "vrstica"/"stolpec" sta 0-based, kot ju vrne values.get.
export function koordinateOddelka(vrsteVrstic, startISO, endISO) {
  const celice = [];
  const imenaBrezKljuca = new Set();
  const stanje = { najdenDatum: false, najdenaGlava: false };
  const zamik = najdiZamikStolpcev(vrsteVrstic);
  let i = 0;
  while (i < vrsteVrstic.length) {
    const datum = normalizirajDatum((vrsteVrstic[i] || [])[zamik]);
    if (!ISO_DATUM_RX.test(datum)) { i++; continue; }
    i = obdelajBlok(vrsteVrstic, i, startISO, endISO, najdiVrsticoImen, 2, (vrstica, imena, datum, j) => {
      imena.forEach((ime, idx) => {
        const cisto = String(ime == null ? "" : ime).trim();
        if (!cisto) return;
        const kljuc = kratkoKljuc(cisto);
        if (!kljuc) { imenaBrezKljuca.add(cisto); return; }
        celice.push({
          vrstica: j,
          stolpec: zamik + 2 + idx,
          datum: datum,
          ime: cisto,
          kljuc: kljuc,
          vrednost: (vrstica[zamik + 2 + idx] == null ? "" : String(vrstica[zamik + 2 + idx])).trim(),
        });
      });
    }, stanje, zamik);
  }
  return {
    celice: celice,
    imenaBrezKljuca: [...imenaBrezKljuca],
    najdenDatum: stanje.najdenDatum,
    najdenaGlava: stanje.najdenaGlava,
    zamik: zamik,
  };
}

// --- FLEXI: par stolpcev na osebo -------------------------------------
// Zavihek FLEXI ima drugačno obliko kot oddelčni: vsaka oseba zaseda PAR
// stolpcev - levi je oddelek, ki ga tisti dan pokriva, desni je izmena.
// Ime osebe stoji v glavi nad DESNIM (izmena). Zapis v razporedu gre v
// department_code "FLEXI", pokriti oddelek pa v pokriva_oddelek.
const IME_S_PIKO_RX = /^\S.*\s[A-ZČŠŽĐĆ]\.\s*$/;

// Glava FLEXI bloka se ne prepozna po tem, da ima vsebino v tretjem
// stolpcu (kot pri oddelkih), ampak po tem, da vsebuje vsaj eno ime
// oblike "Priimek I.".
export function najdiVrsticoImenFlexi(vrsteVrstic, zacetekBloka, zamik) {
  zamik = zamik || 0;
  for (let i = zacetekBloka - 1, korakov = 0; i >= 0 && korakov < 6; i--, korakov++) {
    const vrstica = vrsteVrstic[i] || [];
    if (ISO_DATUM_RX.test(normalizirajDatum(vrstica[zamik]))) return null;
    const imaIme = vrstica.some((c, idx) => idx >= zamik + 2 && IME_S_PIKO_RX.test((c || "").trim().toUpperCase()));
    if (!imaIme) continue;
    return i;
  }
  return null;
}

// Iste celice kot koordinateOddelka, le da vsak vnos nosi DVA stolpca:
// "stolpec" je izmena, "stolpecOddelka" pa oddelek levo od nje.
//
// Stolpci "DODATNO ..." se izpustijo: niso oseba, ampak povzetek, kdo
// tisti dan pokriva neko izmeno - ista izmena je zapisana že pri osebi
// sami, zato bi jo vpisati še enkrat pomenilo prepisati njen zapis.
//
// Isto ime se v glavi lahko pojavi večkrat (ponovljen blok stolpcev v
// pravi datoteki); obvelja PRVA (skrajno leva) pojavitev.
export function koordinateFlexi(vrsteVrstic, startISO, endISO) {
  const celice = [];
  const stanje = { najdenDatum: false, najdenaGlava: false };
  const zamik = najdiZamikStolpcev(vrsteVrstic);
  let i = 0;
  while (i < vrsteVrstic.length) {
    const datum = normalizirajDatum((vrsteVrstic[i] || [])[zamik]);
    if (!ISO_DATUM_RX.test(datum)) { i++; continue; }
    i = obdelajBlok(vrsteVrstic, i, startISO, endISO, najdiVrsticoImenFlexi, 0, (vrstica, glavaVrstica, datum, j) => {
      const videne = new Set();
      for (let c = 2; c < glavaVrstica.length; c++) {
        const ime = (glavaVrstica[c] || "").trim();
        if (/^DODATNO\b/i.test(ime)) continue;
        if (!ime || !IME_S_PIKO_RX.test(ime.toUpperCase())) continue;
        const kljuc = kratkoKljuc(ime);
        if (!kljuc || videne.has(kljuc)) continue;
        videne.add(kljuc);
        // "c" je indeks v glavi, ta pa je odrezana za "zamik" - glej isto
        // opombo pri obdelajFlexiVrstice v index.html.
        const stolpecIzmene = zamik + c;
        const stolpecOddelka = zamik + c - 1;
        celice.push({
          vrstica: j,
          stolpec: stolpecIzmene,
          stolpecOddelka: stolpecOddelka,
          datum: datum,
          ime: ime,
          kljuc: kljuc,
          vrednost: (vrstica[stolpecIzmene] == null ? "" : String(vrstica[stolpecIzmene])).trim(),
          oddelek: (vrstica[stolpecOddelka] == null ? "" : String(vrstica[stolpecOddelka])).trim().toUpperCase(),
        });
      }
    }, stanje, zamik);
  }
  return {
    celice: celice,
    najdenDatum: stanje.najdenDatum,
    najdenaGlava: stanje.najdenaGlava,
    zamik: zamik,
  };
}

// --- NZV: stolpci so ENOTE, ne osebe -----------------------------------
// Pri oddelkih in FLEXI je stolpec oseba, celica pa njena izmena. Pri NZV
// je obrnjeno: stolpec je organizacijska enota, celica pa pove, KDO (ena
// ali več paraf) enoto tisti dan pokriva. Zadnji trije stolpci
// (LD/IZOB/BS) niso enote, ampak povzetek odsotnosti in gredo v drugo
// tabelo.
//
// Vir tabele je nzv-zasedba.js; preveri-sheets-deljena-koda.mjs ju
// primerja vrstico za vrstico.
export const NZV_ENOTE = [
  ["PDZN", "PDZN"], ["SOBO", "SOBO"], ["ZO", "ŽO"], ["E1", "E1"], ["E2", "E2"], ["D", "D"], ["MO", "MO"],
  ["B", "B"], ["C", "C"], ["C1", "C1"], ["PO", "PO"], ["A", "A"], ["B1B2", "B1,B2"], ["DB", "DB"],
  ["URGENCA", "URGENCA"], ["U2", "U2"],
];

// Vrstni red v uradni predlogi ima "SA DOP"/"SA POP" MED "DB" in "URGENCA".
export const NZV_STOLPCI = (function () {
  const brezUrgence = NZV_ENOTE.filter((v) => v[0] !== "URGENCA" && v[0] !== "U2");
  const urgencaU2 = NZV_ENOTE.filter((v) => v[0] === "URGENCA" || v[0] === "U2");
  return brezUrgence.concat([["SADOP", "SA DOP"], ["SAPOP", "SA POP"]], urgencaU2);
})();

// LD/IZOB/BS -> vrsta odsotnosti v tabeli "odsotnosti".
export const NZV_ODSOTNOST_KIND = { LD: "ld", IZOB: "sti", BS: "bs" };

const NZV_GLAVA_NAJVEC_NAZAJ = 8;
const NZV_GLAVA_NAJMANJ_ZADETKOV = 2;

// Ista glava je v resničnih datotekah zapisana z različnimi presledki
// ("B1,B2" proti "B1, B2"), zato se pred primerjavo presledki odstranijo.
export function nzvKljucGlave(naziv) {
  return String(naziv || "").replace(/\s+/g, "").toUpperCase();
}

function nzvNazivVKodo() {
  const m = { "Dežurstvo": "DEZ", "DEŽURSTVO": "DEZ", "SA DOP": "SADOP", "SA POP": "SAPOP",
              "LD": "LD", "IZOB": "IZOB", "BS": "BS" };
  NZV_ENOTE.forEach(([koda, naziv]) => { m[naziv] = koda; });
  return m;
}

function nzvNazivVKodoNorm() {
  const vir = nzvNazivVKodo();
  const m = {};
  Object.keys(vir).forEach((k) => { m[nzvKljucGlave(k)] = vir[k]; });
  return m;
}

// Glava NZV bloka se ne prepozna po enem samem stolpcu, ampak po tem, da
// jih je v vrstici več znanih - med glavo in prvim datumom namreč stoji
// prazna vrstica.
export function poisciEnoteNzv(vrsteVrstic, zacetekBloka, zamik) {
  zamik = zamik || 0;
  const nazivVKodo = nzvNazivVKodoNorm();
  for (let i = zacetekBloka - 1, korakov = 0; i >= 0 && korakov < NZV_GLAVA_NAJVEC_NAZAJ; i--, korakov++) {
    const vrstica = vrsteVrstic[i] || [];
    if (ISO_DATUM_RX.test(normalizirajDatum(vrstica[zamik]))) return null;
    const zadetki = vrstica.slice(zamik + 1).filter((c) => nazivVKodo[nzvKljucGlave(c)]).length;
    if (zadetki >= NZV_GLAVA_NAJMANJ_ZADETKOV) return i;
  }
  return null;
}

// Kaj se za posamezen stolpec zapiše v razpored.
export function nzvZapisZaStolpec(koda) {
  if (koda === "SADOP") return { department_code: "SA", shift_code: "Dopoldne" };
  if (koda === "SAPOP") return { department_code: "SA", shift_code: "Popoldne" };
  if (koda === "DEZ") return { department_code: "DEZ", shift_code: "DEŽURSTVO" };
  return { department_code: koda, shift_code: "PRISOTEN" };
}

// Vse celice NZV zavihka v obdobju. "koda" je enota (ali LD/IZOB/BS/DEZ),
// "vrednost" pa vsebina celice - ena ali več paraf, ločenih z vejico.
export function koordinateNzv(vrsteVrstic, startISO, endISO) {
  const nazivVKodo = nzvNazivVKodoNorm();
  const celice = [];
  const stanje = { najdenDatum: false, najdenaGlava: false };
  const zamik = najdiZamikStolpcev(vrsteVrstic);
  let i = 0;
  while (i < vrsteVrstic.length) {
    const datum = normalizirajDatum((vrsteVrstic[i] || [])[zamik]);
    if (!ISO_DATUM_RX.test(datum)) { i++; continue; }
    i = obdelajBlok(vrsteVrstic, i, startISO, endISO, poisciEnoteNzv, 1, (vrstica, stolpci, datum, j) => {
      stolpci.forEach((naziv, idx) => {
        const koda = nazivVKodo[nzvKljucGlave(naziv)];
        if (!koda) return;
        // "idx" je indeks v glavi, ta pa je odrezana za zamik + 1.
        const stolpec = zamik + 1 + idx;
        celice.push({
          vrstica: j,
          stolpec: stolpec,
          datum: datum,
          koda: koda,
          naziv: String(naziv == null ? "" : naziv).trim(),
          jeOdsotnost: Object.prototype.hasOwnProperty.call(NZV_ODSOTNOST_KIND, koda),
          vrednost: (vrstica[stolpec] == null ? "" : String(vrstica[stolpec])).trim(),
        });
      });
    }, stanje, zamik);
  }
  return {
    celice: celice,
    najdenDatum: stanje.najdenDatum,
    najdenaGlava: stanje.najdenaGlava,
    zamik: zamik,
  };
}

// Ista oseba je lahko isti dan na več enotah - razpored pa dovoli en zapis
// na (oseba, dan). Dodatne enote gredo v pokriva_oddelek.
export function zdruziNzvZapise(zapisi) {
  const poOsebiInDnevu = new Map();
  (zapisi || []).forEach((z) => {
    const kljuc = z.employee_id + "|" + z.work_date;
    const prej = poOsebiInDnevu.get(kljuc);
    if (!prej) {
      poOsebiInDnevu.set(kljuc, {
        employee_id: z.employee_id, work_date: z.work_date,
        department_code: z.department_code, shift_code: z.shift_code,
        stolpci: z.stolpec ? [z.stolpec] : [],
      });
      return;
    }
    // Dežurstvo nima svojega stolpca enote in ne sme prevzeti
    // department_code, če je oseba tisti dan tudi na enoti.
    if (!z.stolpec) { prej.shift_code = z.shift_code; return; }
    if (!prej.stolpci.length) {
      prej.department_code = z.department_code;
      prej.stolpci = [z.stolpec];
      return;
    }
    if (prej.stolpci.indexOf(z.stolpec) < 0) prej.stolpci.push(z.stolpec);
  });
  return [...poOsebiInDnevu.values()].map((v) => {
    const zapis = {
      employee_id: v.employee_id, department_code: v.department_code,
      work_date: v.work_date, shift_code: v.shift_code,
    };
    const potrebenSeznam = v.stolpci.length > 1
      || (v.stolpci.length === 1 && String(v.shift_code || "").toUpperCase() === "DEŽURSTVO");
    if (potrebenSeznam) zapis.pokriva_oddelek = v.stolpci.join("/");
    return zapis;
  });
}

// --- Parafe (izvirnik: parafa.js) --------------------------------------
// NZV mreža ne piše imen, ampak PARAFE ("DŽA, ALU"). Ista oseba je imela
// pred 1. 10. 2026 lahko drugo parafo, zato se izbira po datumu razporeda,
// ne po današnjem dnevu.
export const PARAFA_PRESTOP = "2026-10";

// Kadar parafa ni izrecno nastavljena: prve tri črke priimka. Prav to je
// vir trkov (dva Pogačnika oba dobita "POG"), zato se taka oznaka NE
// pripiše nikomur - gre med dvoumne.
export function parafaAuto(fullName) {
  const deli = String(fullName || "").trim().split(/\s+/);
  const priimek = deli.length > 1 ? deli.slice(0, -1).join("") : (deli[0] || "");
  return priimek.slice(0, 3).toUpperCase();
}

export function parafaZaDatum(profil, datum) {
  if (!profil) return parafaAuto("");
  if (datum && String(datum).slice(0, 7) < PARAFA_PRESTOP && profil.parafa_pred_oktobrom_2026) {
    return profil.parafa_pred_oktobrom_2026;
  }
  return profil.parafa || parafaAuto(profil.full_name);
}

function parafaJeIzpeljana(profil, datum) {
  if (!profil) return true;
  if (datum && String(datum).slice(0, 7) < PARAFA_PRESTOP && profil.parafa_pred_oktobrom_2026) return false;
  return !profil.parafa;
}

// Parafa -> oseba, za dani datum. Izrecno nastavljena parafa premaga
// izpeljano; kadar ostane več kandidatov, oznaka pristane med dvoumnimi in
// se NE pripiše nikomur.
export function parafaLastniki(profili, datum) {
  const skupine = {};
  (profili || []).forEach((p) => {
    const k = parafaZaDatum(p, datum).toUpperCase();
    if (!k) return;
    (skupine[k] = skupine[k] || []).push(p);
  });
  const poParafi = {};
  const podvojene = [];
  Object.keys(skupine).forEach((k) => {
    const vsi = skupine[k];
    const izrecni = vsi.filter((p) => !parafaJeIzpeljana(p, datum));
    const kandidati = izrecni.length ? izrecni : vsi;
    if (kandidati.length === 1) poParafi[k] = kandidati[0];
    else podvojene.push(k);
  });
  return { poParafi: poParafi, podvojene: podvojene };
}

// Stolpec DEŽURSTVO piše POLNO IME, ne parafe - in pred njim je lahko naziv
// ("dr. Tanja Torkar"), ki bi pri primerjavi "vreča besed" zgrešil ujemanje.
const NAZIV_OSEBE_RX = /^(dr|mag|prim|doc|prof|as)\.\s*/i;
export function ocistiNazivOsebe(s) {
  return String(s || "").replace(NAZIV_OSEBE_RX, "").trim();
}

// --- Ime zavihka iz meseca --------------------------------------------
// NZV dokument nima enega zavihka na oddelek, ampak enega na MESEC
// ("Razpored SEPTEMBER 2026"). Povezava zato ne hrani imena, ampak vzorec;
// ime se sestavi iz meseca, tako kot ga sestavi človek.
export const MESECI_VELIKO = ["JANUAR", "FEBRUAR", "MAREC", "APRIL", "MAJ", "JUNIJ",
  "JULIJ", "AVGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER"];

export function jeVzorecZavihka(vzorec) {
  return /\{MESEC\}|\{LETO\}/.test(String(vzorec || ""));
}

// "Razpored {MESEC} {LETO}" + "2026-09" -> "Razpored SEPTEMBER 2026".
export function imeZavihka(vzorec, mesecYYYYMM) {
  const v = String(vzorec || "");
  if (!jeVzorecZavihka(v)) return v;
  const deli = String(mesecYYYYMM || "").split("-");
  const leto = deli[0] || "";
  const m = Number(deli[1]);
  const mesec = m >= 1 && m <= 12 ? MESECI_VELIKO[m - 1] : "";
  return v.replace(/\{MESEC\}/g, mesec).replace(/\{LETO\}/g, leto);
}

// Obratno: iz imena zavihka razbere mesec, če se ujema z vzorcem.
// Vrne "YYYY-MM" ali null. Primerja se brez velikih/malih črk, ker so
// zavihki v dokumentu pisani različno ("Razpored JUNIJ 2026").
export function mesecIzImenaZavihka(vzorec, ime) {
  const v = String(vzorec || "");
  if (!jeVzorecZavihka(v)) return null;
  const ubezi = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vzorecRe = new RegExp("^" + v.split(/(\{MESEC\}|\{LETO\})/)
    .map((del) => (del === "{MESEC}" ? "([A-ZČŠŽa-zčšž]+)" : del === "{LETO}" ? "(\\d{4})" : ubezi(del)))
    .join("") + "$", "i");
  const zadetek = String(ime || "").trim().match(vzorecRe);
  if (!zadetek) return null;
  // Vrstni red skupin sledi vrstnemu redu oznak v vzorcu.
  const oznake = v.match(/\{MESEC\}|\{LETO\}/g) || [];
  let mesec = "", leto = "";
  oznake.forEach((o, k) => {
    if (o === "{MESEC}") mesec = zadetek[k + 1];
    else leto = zadetek[k + 1];
  });
  const idx = MESECI_VELIKO.indexOf(nzvKljucGlave(mesec));
  if (idx < 0 || !/^\d{4}$/.test(leto)) return null;
  return leto + "-" + String(idx + 1).padStart(2, "0");
}

// --- Naslavljanje celic (A1) ------------------------------------------
// 0 -> "A", 25 -> "Z", 26 -> "AA". Uporablja se SAMO za obseg v
// values.batchUpdate; nobene druge oblike naslavljanja ni.
export function stolpecVCrko(idx) {
  let n = Number(idx) + 1, s = "";
  while (n > 0) {
    const o = (n - 1) % 26;
    s = String.fromCharCode(65 + o) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Ime zavihka gre v obseg v enojnih narekovajih; narekovaj v imenu se
// podvoji ("Odd 'B'" -> "'Odd ''B'''!C2").
export function obsegCelice(zavihek, vrstica, stolpec) {
  const ime = String(zavihek || "").replace(/'/g, "''");
  return `'${ime}'!${stolpecVCrko(stolpec)}${Number(vrstica) + 1}`;
}

// --- Barve (izvirnik: izmene.js) --------------------------------------
// Barva ozadja za zapis iz razporeda. Prazna celica dobi barvo "prosto",
// neznana koda pa nevtralno sivo - namenoma NE ostane brez barve, ker bi
// bila potem videti kot prosti dan.
export function barvaZaZapis(sifra) {
  if (jePrazenZapis(sifra)) return BARVA_PROSTO;
  const v = vrsticaSifranta(sifra);
  return v ? v[2] : BARVA_NEZNANO;
}

// Črna ali bela pisava, kar je na tej barvi berljivo. Brez tega bi bila
// nočna izmena (temno modra) črna na temnem.
export function barvaBesedila(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return "#2B2717";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#2B2717" : "#FFFFFF";
}

// "#4F9B6B" -> { red: 0.31, green: 0.61, blue: 0.42 } (Google hoče deleže).
export function hexVRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return { red: 0, green: 0, blue: 0 };
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// Polji, ki ju barvanje sme spremeniti - in nobenega drugega. Zapisano
// tukaj kot ena sama konstanta, da preizkus preveri natanko to, kar gre
// v zahtevo (preveri-sheets-brez-postavitve.mjs).
export const BARVNA_POLJA = "userEnteredFormat(backgroundColor,textFormat.foregroundColor)";

// Ena zahteva za pobarvanje ENE celice. Obseg je vedno ena sama celica
// (konec = začetek + 1), zato ta zahteva ne more seči čez rob celice, ki
// jo je sinhronizacija tisti hip tudi zapisala.
export function zahtevaBarve(sheetId, vrstica, stolpec, hexOzadje) {
  const ozadje = hexVRgb(hexOzadje);
  const pisava = hexVRgb(barvaBesedila(hexOzadje));
  return {
    repeatCell: {
      range: {
        sheetId: Number(sheetId),
        startRowIndex: Number(vrstica), endRowIndex: Number(vrstica) + 1,
        startColumnIndex: Number(stolpec), endColumnIndex: Number(stolpec) + 1,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: ozadje,
          textFormat: { foregroundColor: pisava },
        },
      },
      fields: BARVNA_POLJA,
    },
  };
}
