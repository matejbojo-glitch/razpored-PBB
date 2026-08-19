/* Razpored PBB — prazniki.js
 * Slovenski DELA PROSTI dnevi in skupno pravilo "kdaj je za NZV prost dan".
 *
 * Zakaj svoja datoteka: pravilo "NZV dela od ponedeljka do petka; sobota,
 * nedelja IN prazniki so prosti, razen če je dežurstvo" mora veljati na
 * VSEH zaslonih enako - v "Moj razpored", v mreži "Po oddelkih -> NZV" in
 * v Imenik -> Razpredelnica. Doslej je živelo na dveh mestih posebej in
 * se je vsakič znova pokazalo, da kje manjka (nazadnje v Razpredelnici,
 * kjer je Alukić Dino v nedeljo 2. 8. 2026 kazal "LD", 9. in 16. 8. pa
 * "DOP"). Odslej je en sam vir.
 *
 * Navadna (ne-Babel) datoteka, naložena kot <script src="prazniki.js">.
 */
window.Prazniki = (function () {

  // Velikonočna nedelja po anonimnem gregorijanskem algoritmu - potrebna,
  // ker sta velikonočni ponedeljek in binkoštna nedelja premakljiva.
  function velikaNoc(leto) {
    var a = leto % 19, b = Math.floor(leto / 100), c = leto % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mesec = Math.floor((h + l - 7 * m + 114) / 31);
    var dan = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(leto, mesec - 1, dan, 12);
  }

  function kljuc(d) {
    var p = function (n) { return String(n).length < 2 ? "0" + n : String(n); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function zamik(d, dni) {
    var n = new Date(d.getTime());
    n.setDate(n.getDate() + dni);
    return n;
  }

  // Samo DELA PROSTI dnevi. Praznikov, ki dela NISO prosti (17. avgust,
  // 15. september, 23. november), tu namenoma ni - na razpored ne vplivajo.
  var STALNI = [
    ["01-01", "novo leto"],
    ["01-02", "novo leto"],
    ["02-08", "Prešernov dan"],
    ["04-27", "dan upora proti okupatorju"],
    ["05-01", "praznik dela"],
    ["05-02", "praznik dela"],
    ["06-25", "dan državnosti"],
    ["08-15", "Marijino vnebovzetje"],
    ["10-31", "dan reformacije"],
    ["11-01", "dan spomina na mrtve"],
    ["12-25", "božič"],
    ["12-26", "dan samostojnosti in enotnosti"],
  ];

  var predpomnilnik = {};
  function zaLeto(leto) {
    if (predpomnilnik[leto]) return predpomnilnik[leto];
    var m = {};
    STALNI.forEach(function (p) { m[leto + "-" + p[0]] = p[1]; });
    var vn = velikaNoc(leto);
    m[kljuc(vn)] = "velikonočna nedelja";
    m[kljuc(zamik(vn, 1))] = "velikonočni ponedeljek";
    m[kljuc(zamik(vn, 49))] = "binkoštna nedelja";
    predpomnilnik[leto] = m;
    return m;
  }

  // Delovni datum se razčleni kot BESEDILO in sestavi ob 12:00 lokalnega
  // časa - z "new Date(iso)" bi ga brskalnik v časovnem pasu za UTC
  // premaknil na prejšnji dan (ista past kot v datum.js).
  function razcleni(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }

  function jePraznik(iso) {
    var d = razcleni(iso);
    return d ? !!zaLeto(d.getFullYear())[iso] : false;
  }
  function naziv(iso) {
    var d = razcleni(iso);
    return d ? (zaLeto(d.getFullYear())[iso] || "") : "";
  }
  function jeVikend(iso) {
    var d = razcleni(iso);
    if (!d) return false;
    var w = d.getDay();
    return w === 0 || w === 6;
  }
  // Sobota, nedelja ALI dela prost praznik.
  function jeDelaProstDan(iso) {
    return jeVikend(iso) || jePraznik(iso);
  }

  return { jePraznik: jePraznik, jeVikend: jeVikend, jeDelaProstDan: jeDelaProstDan,
           naziv: naziv, velikaNoc: velikaNoc };
})();
