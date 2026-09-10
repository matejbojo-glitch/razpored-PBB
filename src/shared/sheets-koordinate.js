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
