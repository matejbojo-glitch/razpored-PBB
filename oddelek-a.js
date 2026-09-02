/* Razpored PBB – oddelek A: kdo ga ta mesec pokriva – EN SAM VIR.
 *
 * Oddelek A ima svoj DOPOLDANSKI kader, popoldne in ponoči pa ga
 * pokrivata oddelka B in E1 – izmenično, cel mesec vsak. Izhodišče je
 * uporabnikova navedba (september 2026): september 2026 = B, oktober
 * 2026 = E1, nato izmenično naprej. Pravilo velja tudi za nazaj (avgust
 * 2026 = E1), da se prikaz starih mesecev ne ustavi.
 *
 * Tisti dan, ko je oseba iz pokrivajočega oddelka na izmeni, ki pokriva A,
 * se ji zraven izpiše črka A ("Popoldne (A)"). Oznaka je IZPELJANA iz
 * meseca, izmene in datuma, ne vpisana v razpored: šifra izmene v bazi
 * ostane taka, kot je v bolnišničnih preglednicah (za razliko od "(M)",
 * ki v preglednici res je zapisana).
 *
 * Katere izmene pokrivajo A:
 *   POPOLDNE in PONOČI  vsak dan (A svojega popoldanskega in nočnega
 *                       kadra nima),
 *   DNEVNA 12-urna      samo ob SOBOTAH, NEDELJAH in praznikih - takrat
 *                       tudi dopoldne ni nikogar z oddelka A, dnevno
 *                       službo pa po uradni legendi pokrivata prav D12
 *                       (05:50-18:00) in DF12 (07:00-19:00), ki sta
 *                       vikend/praznična izmena. Med tednom ima A svoj
 *                       dopoldanski kader, zato tam dnevna izmena
 *                       pokrivajočega oddelka NE pomeni pokrivanja A.
 *
 * Zakaj svoj modul: pravilo potrebujejo trije zasloni (oddelčna mreža,
 * Moj razpored, Razpredelnica stanja). Ena sama kopija je edini način,
 * da se ne razidejo – natanko tako, kot je bilo z izmenami pred
 * izmene.js.
 *
 * Odvisnosti: window.Izmene (uradna legenda kratic) in window.Prazniki
 * (kateri dan je dela prost) – oba se kličeta šele ob uporabi, a naj bosta
 * na strani naložena prej.
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

  // Kratice iz uradne legende (izmene.js), razvrščene po delu dneva.
  // Zapisane so KRATICE in ne besedila izmene, ker isto izmeno preglednice
  // zapišejo na več načinov ("popoldan", "Popoldne", "popoldan do 19h");
  // kratica je ena sama. preveri-oddelek-a.mjs preveri, da se seznami
  // ujemajo z legendo - če se doda nova izmena, test pade, namesto da bi
  // tu tiho manjkala.
  //
  //   PO4 PO5 PO6 PO7   popoldne (13:50 -> 19:00/20:00/21:00, 4 ure)
  //   N10 N11 N12       nočne (20:50/18:50/17:50 -> 06:00)
  //   D12 DF12          dnevni 12-urni (05:50-18:00 oz. 07:00-19:00) -
  //                     po uradni legendi vikend/praznična izmena
  // Zunaj ostanejo dopoldanske (DOP, DO4, DO6, DO7), dežurstvo in
  // odsotnosti.
  var VRSTE = [
    ["dnevna",   "Dnevna",   ["D12", "DF12"],               true],
    ["popoldne", "Popoldne", ["PO4", "PO5", "PO6", "PO7"],  false],
    ["nocna",    "Nočna",    ["N10", "N11", "N12"],         false],
  ];
  // Ime -> [naziv, kratice, samoProstiDan]
  var VRSTA_PO_KODI = {};
  VRSTE.forEach(function (v) { VRSTA_PO_KODI[v[0]] = { naziv: v[1], kratice: v[2], samoProstiDan: v[3] }; });

  // Katera vrsta pokrivanja je ta izmena tisti dan - ali null, če ne
  // pokriva. "iso" je potreben samo za dnevno 12-urno izmeno: ta pokriva A
  // le ob sobotah, nedeljah in praznikih. Brez datuma se dnevna NE šteje
  // (previdna izbira: raje manjkajoča oznaka kot napačna).
  function vrstaPokrivanja(sifra, iso) {
    if (!sifra) return null;
    var k = window.Izmene.kratica(sifra);
    for (var i = 0; i < VRSTE.length; i++) {
      if (VRSTE[i][2].indexOf(k) < 0) continue;
      if (VRSTE[i][3] && !(iso && window.Prazniki.jeDelaProstDan(iso))) return null;
      return VRSTE[i][0];
    }
    return null;
  }

  function jePokrivnaIzmena(sifra, iso) {
    return vrstaPokrivanja(sifra, iso) !== null;
  }

  // Ali se tej celici pripiše oznaka. "oddelek" je oddelek, na katerem
  // oseba TA DAN dela.
  function jeOznacena(mesec, oddelek, sifra, iso) {
    return String(oddelek || "").trim().toUpperCase() === pokriva(mesec)
      && jePokrivnaIzmena(sifra, iso);
  }

  // " (A)" ali "" - za pripenjanje k nazivu izmene.
  function oznaka(mesec, oddelek, sifra, iso) {
    return jeOznacena(mesec, oddelek, sifra, iso) ? " (" + KODA + ")" : "";
  }

  return {
    KODA: KODA,
    VRSTE: VRSTE,
    VRSTA_PO_KODI: VRSTA_PO_KODI,
    vrstaPokrivanja: vrstaPokrivanja,
    POKRIVAJO: POKRIVAJO,
    IZHODISCE: IZHODISCE,
    pokriva: pokriva,
    jePokrivnaIzmena: jePokrivnaIzmena,
    jeOznacena: jeOznacena,
    oznaka: oznaka,
  };
})();
