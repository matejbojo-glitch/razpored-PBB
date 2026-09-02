/* Razpored PBB – oddelek A: kdo ga ta mesec pokriva – EN SAM VIR.
 *
 * Oddelek A ima svoj DOPOLDANSKI kader, popoldne in ponoči pa ga
 * pokrivata oddelka B in E1 – izmenično, cel mesec vsak. Izhodišče je
 * uporabnikova navedba (september 2026): september 2026 = B, oktober
 * 2026 = E1, nato izmenično naprej. Pravilo velja tudi za nazaj (avgust
 * 2026 = E1), da se prikaz starih mesecev ne ustavi.
 *
 * Tisti dan, ko je oseba iz pokrivajočega oddelka na POPOLDANSKI ali
 * NOČNI izmeni, se ji zraven izpiše črka A ("Popoldne (A)") – pove, da
 * tisto izmeno pokriva tudi oddelek A. Oznaka je IZPELJANA iz meseca in
 * izmene, ne vpisana v razpored: šifra izmene v bazi ostane taka, kot je
 * v bolnišničnih preglednicah (za razliko od "(M)", ki v preglednici
 * res je zapisana).
 *
 * Zakaj svoj modul: pravilo potrebujejo trije zasloni (oddelčna mreža,
 * Moj razpored, Razpredelnica stanja). Ena sama kopija je edini način,
 * da se ne razidejo – natanko tako, kot je bilo z izmenami pred
 * izmene.js.
 *
 * Odvisnosti: window.Izmene (uradna legenda kratic) – mora biti naložen
 * prej.
 *
 * Brez JSX in brez modulov: nalaga se kot navaden, sinhron <script>.
 */
window.OddelekA = (function () {
  "use strict";

  var KODA = "A";
  // Vrstni red je pomemben: prvi element velja za IZHODIŠČNI mesec.
  var POKRIVAJO = ["B", "E1"];
  var IZHODISCE = { leto: 2026, mesec: 9 };   // september 2026 = B

  function stMeseca(mesec) {
    var d = String(mesec || "").split("-");
    var l = Number(d[0]), m = Number(d[1]);
    if (!l || !m) return null;
    return (l - IZHODISCE.leto) * 12 + (m - IZHODISCE.mesec);
  }

  // Kateri oddelek ta mesec pokriva A. "YYYY-MM" -> "B" | "E1" | null.
  function pokriva(mesec) {
    var n = stMeseca(mesec);
    if (n === null) return null;
    // JS ostanek je pri negativnih številih negativen (-1 % 2 = -1),
    // zato za mesece pred izhodiščem popravimo v pozitivno območje.
    var i = ((n % POKRIVAJO.length) + POKRIVAJO.length) % POKRIVAJO.length;
    return POKRIVAJO[i];
  }

  // Ali ta izmena pokriva A: POPOLDANSKE in NOČNE. Kratice so iz uradne
  // legende (izmene.js):
  //   PO4 PO5 PO6 PO7   popoldne (13:50 -> 19:00/20:00/21:00, 4 ure)
  //   N10 N11 N12       nočne (20:50/18:50/17:50 -> 06:00)
  // Zunaj ostanejo dopoldanske (DOP, DO4, DO6, DO7), obe DNEVNI 12-urni
  // (D12 05:50-18:00, DF12 07:00-19:00 - to sta dnevni izmeni, ne nočni),
  // dežurstvo in odsotnosti.
  //
  // Zapisan je nabor KRATIC in ne besedila izmene, ker isto izmeno
  // preglednice zapišejo na več načinov ("popoldan", "Popoldne",
  // "popoldan do 19h"); kratica je ena sama. preveri-oddelek-a.mjs
  // preveri, da se seznam ujema z legendo - če se doda nova popoldanska
  // ali nočna izmena, test pade, namesto da bi tu tiho manjkala.
  var POKRIVNE_KRATICE = ["PO4", "PO5", "PO6", "PO7", "N10", "N11", "N12"];
  function jePokrivnaIzmena(sifra) {
    if (!sifra) return false;
    return POKRIVNE_KRATICE.indexOf(window.Izmene.kratica(sifra)) >= 0;
  }

  // Ali se tej celici pripiše oznaka. "oddelek" je oddelek OSEBE.
  function jeOznacena(mesec, oddelek, sifra) {
    return String(oddelek || "").trim().toUpperCase() === pokriva(mesec)
      && jePokrivnaIzmena(sifra);
  }

  // " (A)" ali "" - za pripenjanje k nazivu izmene.
  function oznaka(mesec, oddelek, sifra) {
    return jeOznacena(mesec, oddelek, sifra) ? " (" + KODA + ")" : "";
  }

  return {
    KODA: KODA,
    POKRIVNE_KRATICE: POKRIVNE_KRATICE,
    POKRIVAJO: POKRIVAJO,
    IZHODISCE: IZHODISCE,
    pokriva: pokriva,
    jePokrivnaIzmena: jePokrivnaIzmena,
    jeOznacena: jeOznacena,
    oznaka: oznaka,
  };
})();
