/* Razpored PBB — parafa.js
 * Edini vir resnice o parafi (kratki oznaki osebe, npr. "BOJ"), ki jo
 * uradne predloge uporabljajo namesto polnega imena.
 *
 * Prej je ista logika živela samo v index.html; ker jo potrebuje tudi
 * Imenik (pregled paraf za vse zaposlene), je tu v skupni datoteki -
 * podvojena bi bila nevarna, ker gre za preslikavo oznaka → OSEBA v
 * bolnišničnem razporedu: tiho razhajanje med dvema kopijama bi pomenilo,
 * da je izmena pripisana napačnemu človeku.
 *
 * Navadna (ne-Babel) datoteka, naložena kot <script src="parafa.js">.
 */
window.Parafa = (function () {

  // Parafa se je za del kadra spremenila z veljavnostjo od 1.10.2026
  // (uradna prenova, ne popravek napake): profiles.parafa hrani NOVO
  // (velja od tega datuma dalje), profiles.parafa_pred_oktobrom_2026 pa
  // STARO (veljala do 30.9.2026), in sicer SAMO za osebe, ki jim je bila
  // dejansko spremenjena (glej supabase/posodobi-parafe-oktober-2026.sql).
  var PRESTOP = "2026-10";

  // Groba privzeta oznaka, kadar parafa ni izrecno nastavljena: prve tri
  // črke priimka. POZOR - prav to je vir trkov: dva Pogačnika brez
  // izrecne parafe oba dobita "POG", uvoz pa take oznake ne more
  // enolično pripisati osebi in jo (pravilno) zavrne. Zato Imenik
  // izpeljane parafe posebej označi in trke poudari.
  function auto(fullName) {
    var deli = String(fullName || "").trim().split(/\s+/);
    var priimek = deli.length > 1 ? deli.slice(0, -1).join("") : (deli[0] || "");
    return priimek.slice(0, 3).toUpperCase();
  }

  // "datum" je delovni dan ("LLLL-MM-DD") ALI mesec ("LLLL-MM") razporeda
  // oz. dopusta, na katerega se parafa nanaša - NE današnji dan.
  function zaDatum(profil, datum) {
    if (!profil) return auto("");
    if (datum && String(datum).slice(0, 7) < PRESTOP && profil.parafa_pred_oktobrom_2026) {
      return profil.parafa_pred_oktobrom_2026;
    }
    return profil.parafa || auto(profil.full_name);
  }

  // Ali je parafa za ta datum izrecno nastavljena (in katera) ali samo
  // izpeljana iz priimka - Imenik to loči, ker so izpeljane vir trkov.
  function jeIzpeljana(profil, datum) {
    if (!profil) return true;
    if (datum && String(datum).slice(0, 7) < PRESTOP && profil.parafa_pred_oktobrom_2026) return false;
    return !profil.parafa;
  }

  // Skupine oseb, ki si za dani datum delijo isto parafo. Vrne samo
  // TRKE (2+ oseb) - to so oznake, ki jih uvoz ne more enolično pripisati.
  function trki(profili, datum) {
    var poParafi = {};
    (profili || []).forEach(function (p) {
      var k = zaDatum(p, datum).toUpperCase();
      if (!k) return;
      (poParafi[k] = poParafi[k] || []).push(p);
    });
    var out = {};
    Object.keys(poParafi).forEach(function (k) {
      if (poParafi[k].length > 1) out[k] = poParafi[k];
    });
    return out;
  }

  // Kdo je LASTNIK posamezne parafe za dani datum.
  //
  // Ključno pravilo: IZRECNO nastavljena parafa premaga IZPELJANO.
  // Izpeljana parafa (prve tri črke priimka) je samo privzetek aplikacije,
  // ne pa oznaka, ki bi jo oseba kdaj imela na papirju. Brez tega pravila
  // je vsak par sodelavcev z enakim začetkom priimka videti kot trk in
  // uvoz obe osebi preskoči - čeprav v uradnem registru paraf oznako
  // nedvoumno nosi samo ena od njiju.
  //
  // Resnično stanje iz uradnega izvoza paraf (14. 8. 2026):
  //   POG - izrecno jo ima Pogačnik Teja (do 30. 9. 2026; od 1. 10. "PT").
  //         Pogačnik Matej uradne parafe NIMA, aplikacija mu jo je le
  //         izpeljala iz priimka. "POG" v dokumentu torej pomeni Tejo.
  //   TOM - izrecno jo ima Tomaževič Simona (od 1. 10. "ST").
  //         Tomašić Nikolina uradne parafe nima.
  // Po 1. 10. 2026, ko se Teja/Simona preimenujeta, oznaki POG/TOM
  // ostaneta prosti in ju prevzameta Matej oz. Nikolina - to pravilo
  // izpelje samo od sebe, brez posebnega primera.
  //
  // Vrne { poParafi, podvojene }: "poParafi" so enolično razrešene oznake,
  // "podvojene" pa tiste, ki jih res ni mogoče razrešiti (dve IZRECNI
  // parafi sta enaki, ali pa nobena ni izrecna in je izpeljanih več).
  function lastniki(profili, datum) {
    var skupine = {};
    (profili || []).forEach(function (p) {
      var k = zaDatum(p, datum).toUpperCase();
      if (!k) return;
      (skupine[k] = skupine[k] || []).push(p);
    });
    var poParafi = {};
    var podvojene = [];
    Object.keys(skupine).forEach(function (k) {
      var vsi = skupine[k];
      var izrecni = vsi.filter(function (p) { return !jeIzpeljana(p, datum); });
      var kandidati = izrecni.length ? izrecni : vsi;
      if (kandidati.length === 1) poParafi[k] = kandidati[0];
      else podvojene.push(k);
    });
    return { poParafi: poParafi, podvojene: podvojene };
  }

  // Uporabnikom IZRECNO POTRJENI popravki kratkih zapisov ("Priimek I.") iz
  // uradnih predlog, kjer se zapis v datoteki razlikuje od Imenika. Ključ je
  // to, kar piše v PREDLOGI, vrednost pa pravilna oblika iz Imenika.
  //
  // Namenoma ozek, ročno potrjen seznam - NE splošno pravilo. Napačna
  // dodelitev bi pomenila izmeno, pripisano napačnemu človeku, zato sme sem
  // priti samo zapis, ki ga je uporabnik izrecno potrdil.
  //   VALJAVEC A. -> VALJAVEC E.  (v predlogi napačna začetnica; oseba je
  //                                Valjavec Enej - uporabnik potrdil)
  var KRATKO_PSEVDONIM = { "VALJAVEC A.": "VALJAVEC E." };

  // Kratko ime, prebrano IZ PREDLOGE, pretvori v ključ za iskanje po
  // Imeniku (kratkaImenaMapa gradi ključe iz full_name prek priimekZacetnica).
  // Psevdonim se uporabi na ZAPISU IZ PREDLOGE (tam je "VALJAVEC A."),
  // šele nato se oboje zvede na skupni ključ prek imena.js - ta prenese
  // razlike v strešicah in okrajšano ime ("BEČIROVIĆ N." proti
  // "Bećirović Nelvedin"), česar dobesedna primerjava ni.
  function kratkoKljuc(ime) {
    var k = String(ime || "").trim().toUpperCase();
    return window.Imena.kratkiKljuc(KRATKO_PSEVDONIM[k] || k);
  }

  return { PRESTOP: PRESTOP, auto: auto, zaDatum: zaDatum, jeIzpeljana: jeIzpeljana, trki: trki,
           lastniki: lastniki, kratkoKljuc: kratkoKljuc, KRATKO_PSEVDONIM: KRATKO_PSEVDONIM };
})();
