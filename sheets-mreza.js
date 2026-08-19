// sheets-mreza.js — piše PREDOGLED (osnutek, še ne objavljen v Supabase) iz
// Admin → Kalup nazaj v obstoječi Google Sheets dokument, na iste koordinate,
// ki jih index.html uporablja za že objavljen razpored (glej tam
// pripraviPosodobitveOddelka/zapisiOddelekVSheets - ista logika iskanja
// bloka/glave po datumu, tu prirejena za osnutek iz generatorja namesto za
// vrstice iz schedule_entries). Namenoma LOČENA kopija teh pomožnih funkcij
// (ne <script src> iz index.html), ker je index.html samostojna, testirana
// Babel/React stran brez izvoza svojih funkcij navzven - admin.html je
// ločena stran in tako do njih ne more priti. Glej
// skripte/preveri-sheets-mreza.mjs za preverjanje, da ta kopija ostaja
// usklajena z index.html.
window.SheetsMreza = (function () {

  const ISO_DATUM_RX = /^\d{4}-\d{2}-\d{2}$/;
  const VLOGA_RX = /SMS|DMS|TZN|DZN/i;

  function monthRange(monthStr){
    const [y,m] = monthStr.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2,"0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    return { startISO:start, endISO:end };
  }

  function vrsticaJePrazna(vrstica){
    return !vrstica || vrstica.length === 0 || vrstica.every(c => (c == null ? "" : String(c)).trim() === "");
  }

  function obdelajBlok(vrsteVrstic, i, startISO, endISO, poisciGlavo, offset, obdelajVrstico, stanje){
    const glavaIdx = poisciGlavo(vrsteVrstic, i);
    const glava = glavaIdx != null ? vrsteVrstic[glavaIdx].slice(offset) : [];
    let j = i, praznihZapored = 0;
    while (j < vrsteVrstic.length) {
      if (vrsticaJePrazna(vrsteVrstic[j])) {
        if (++praznihZapored > 20) break;
        j++; continue;
      }
      praznihZapored = 0;
      const datum = window.ImportUtils.normalizirajDatum(vrsteVrstic[j][0]);
      if (!ISO_DATUM_RX.test(datum)) break;
      if (datum >= startISO && datum <= endISO) {
        stanje.najdenDatum = true;
        if (glava.length) { stanje.najdenaGlava = true; obdelajVrstico(vrsteVrstic[j], glava, datum, j); }
      }
      j++;
    }
    return j;
  }

  function najdiVrsticoImen(vrsteVrstic, zacetekBloka){
    for (let i = zacetekBloka - 1, korakov = 0; i >= 0 && korakov < 6; i--, korakov++) {
      const vrstica = vrsteVrstic[i] || [];
      if (ISO_DATUM_RX.test(window.ImportUtils.normalizirajDatum(vrstica[0]))) return null;
      const celica = (vrstica[2] || "").trim();
      if (!celica) continue;
      if (VLOGA_RX.test(celica)) continue;
      return i;
    }
    return null;
  }

  // staff: [{ime}, ...] (profiles.full_name) - isti seznam, ki ga prikazuje
  // predogled v Admin → Kalup. vrednostZa(ime, datum) -> trenutna vrednost
  // CELICE V PREDOGLEDU (torej z upoštevanimi ročnimi popravki, ista
  // funkcija "celica" kot uporablja tabela na zaslonu) - zato zapis v Sheets
  // vedno odraža natanko to, kar admin trenutno vidi/je popravil, še preden
  // (ali namesto da) klikne "Objavi v Supabase".
  function pripraviPosodobitveOddelkaIzMreze(vrsteVrstic, ciljniMesec, staff, vrednostZa){
    const { startISO, endISO } = monthRange(ciljniMesec);
    const poKratkem = {};
    const podvojena = new Set();
    (staff || []).forEach(z => {
      // Isti ključ kot pri uvozu (window.Imena.kratkiKljuc): priimek brez
      // strešic + prva črka imena. Dobesedna primerjava nizov je puščala
      // neujemanja pri različnem zapisu strešic (Bećirović / Bečirović).
      const kratko = window.Imena.kratkiKljuc(z.ime);
      if (kratko in poKratkem) podvojena.add(kratko); else poKratkem[kratko] = z;
    });
    podvojena.forEach(k => delete poKratkem[k]);
    const posodobitve = [];
    const neujemanja = new Set();
    podvojena.forEach(k => neujemanja.add(k + " (ujema se z več osebami - uredi ročno)"));
    const stanje = { najdenDatum: false, najdenaGlava: false };
    let i = 0;
    while (i < vrsteVrstic.length) {
      const datum = window.ImportUtils.normalizirajDatum((vrsteVrstic[i] || [])[0]);
      if (!ISO_DATUM_RX.test(datum)) { i++; continue; }
      i = obdelajBlok(vrsteVrstic, i, startISO, endISO, najdiVrsticoImen, 2, (vrstica, imena, datum, j) => {
        imena.forEach((ime, idx) => {
          const z = poKratkem[window.Parafa.kratkoKljuc(ime)];
          if (!z) { if (ime) neujemanja.add(ime); return; }
          posodobitve.push({ vrstica: j, stolpec: 2 + idx, vrednost: vrednostZa(z.ime, datum) });
        });
      }, stanje);
    }
    return { posodobitve, najdenDatum: stanje.najdenDatum, najdenaGlava: stanje.najdenaGlava, neujemanja };
  }

  return { pripraviPosodobitveOddelkaIzMreze };
})();
