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
  function kratkoKljuc(ime) {
    var k = String(ime || "").trim().toUpperCase();
    return KRATKO_PSEVDONIM[k] || k;
  }

  return { PRESTOP: PRESTOP, auto: auto, zaDatum: zaDatum, jeIzpeljana: jeIzpeljana, trki: trki,
           kratkoKljuc: kratkoKljuc, KRATKO_PSEVDONIM: KRATKO_PSEVDONIM };
})();
