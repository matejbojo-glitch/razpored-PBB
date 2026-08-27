/* Razpored PBB – razpored-oblike.js
 *
 * Branje in pisanje razporeda v obliki DVEH ŽIVIH preglednic, ki ju
 * bolnišnica že vzdržuje ročno:
 *
 *   1) "2026 SMS RAZPORED"              – oddelčni razpored izmen
 *   2) "Letni dopusti in omejitve za NZV" – dnevna mreža enot
 *
 * Zakaj svoj modul in ne kar splošni uvoz/izvoz: ti dve preglednici imata
 * postavitev, ki je splošna tabela (glava + vrstice) ne opiše. En zavihek
 * nosi VEČ mesečnih blokov, zloženih enega pod drugim, vsak s svojo glavo
 * imen, svojim podpisnim blokom in svojim naborom ljudi (ekipa se med
 * meseci spreminja).
 *
 * Ključna ugotovitev iz PRAVIH datotek (avgust 2026): obe sta organsko
 * zrasli in nista čisti predlogi. V "Letni dopusti" je ~35 blokov v
 * pomešanem vrstnem redu, dve različni postavitvi, podvojeni meseci
 * (december 2026 trikrat) in ponekod angleške kratice dni (Su, Mo, We).
 * V "SMS RAZPORED" oznaka zavihka niha: "C1 odd", "C odd", "Dodd" (brez
 * presledka), "E2 odd", "FLEXI".
 *
 * Zato branje NE sme sloneti na natančnem zapisu glave. Blok se prepozna
 * po OBLIKI: vrstica z imenom meseca, nad njo vrstica z imeni, pod njo
 * vrstice, katerih prvi stolpec je datum. Tako se ujamejo tudi zapisi, ki
 * jih danes še ni.
 */
window.RazporedOblike = (function () {
  "use strict";

  var MESECI = ["JANUAR","FEBRUAR","MAREC","APRIL","MAJ","JUNIJ",
                "JULIJ","AVGUST","SEPTEMBER","OKTOBER","NOVEMBER","DECEMBER"];
  var DNEVI = ["NE","PO","TO","SR","ČE","PE","SO"];

  // Poleg obrezovanja tudi strne podvojene presledke. V pravi datoteki je
  // npr. "GAZIBARA  A." z dvema presledkoma - brez tega se tako ime ob
  // uvozu ne bi ujelo z osebo v aplikaciji in bi njena izmena tiho izpadla.
  function bt(v) { return v == null ? "" : String(v).replace(/\s+/g, " ").trim(); }

  // Markdown/izvozni zapisi ponekod ubežijo piko ("1\. 9. 2026"), Excel pa
  // datumsko celico vrne kot "2026-09-01" (glej import-utils.js). Sprejmemo
  // oboje in še "1.9.2026".
  function vDatum(vrednost) {
    var s = bt(vrednost).replace(/\\/g, "");
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { leto: +iso[1], mesec: +iso[2], dan: +iso[3] };
    var sl = s.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/);
    if (sl) return { leto: +sl[3], mesec: +sl[2], dan: +sl[1] };
    return null;
  }

  function mesecStevilka(besedilo) {
    var i = MESECI.indexOf(bt(besedilo).toUpperCase());
    return i === -1 ? null : i + 1;
  }

  function zapisiDatum(d) { return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); }
  function dniVMesecu(leto, mesec) { return new Date(leto, mesec, 0).getDate(); }
  function jeVikend(d) { return d.getDay() === 0 || d.getDay() === 6; }

  // ------------------------------------------------------------ PISANJE
  //
  // Postavitev je posneta po pravi datoteki, stolpec za stolpcem:
  //   stolpec 0 – prazen (levi rob)
  //   stolpec 1 – oznaka oddelka / ime meseca / datum
  //   stolpec 2 – prazen / prazen / kratica dneva
  //   stolpec 3+ – po ena oseba
  //
  // Podpisni blok na dnu je del uradnega dokumenta, ne okras: brez njega
  // izvožene preglednice ni mogoče uporabiti kot razpored za objavo.
  function vSMSObliko(opis) {
    var oddelek = bt(opis.oddelek) || "ODD";
    var imena = opis.imena || [];
    var leto = opis.leto, mesec = opis.mesec;
    var vrstice = [];

    var glava = ["", oddelek + " odd", ""];
    imena.forEach(function (o) { glava.push(bt(o.ime)); });
    vrstice.push(glava);

    var vloge = ["", MESECI[mesec - 1], ""];
    imena.forEach(function (o) { vloge.push(bt(o.vloga) || "SMS / TZN"); });
    vrstice.push(vloge);

    var dni = dniVMesecu(leto, mesec);
    for (var dan = 1; dan <= dni; dan++) {
      var d = new Date(leto, mesec - 1, dan);
      var v = ["", zapisiDatum(d), DNEVI[d.getDay()]];
      imena.forEach(function (o) { v.push(bt(opis.izmena(o, d))); });
      vrstice.push(v);
    }

    vrstice.push([]);
    vrstice.push(["", "Datum: " + zapisiDatum(opis.datumIzdelave || new Date())]);
    var podpisi = ["", "Pripravil:"];
    while (podpisi.length < 9) podpisi.push("");
    podpisi.push("Pregledal in odobril:");
    vrstice.push(podpisi);
    var imenaPodpisnikov = ["", bt(opis.pripravil)];
    while (imenaPodpisnikov.length < 9) imenaPodpisnikov.push("");
    imenaPodpisnikov.push(bt(opis.odobril));
    vrstice.push(imenaPodpisnikov);
    return vrstice;
  }

  // Mreža dan × enota. V celico gre KRATICA OSEBE, ki tisti dan pokriva to
  // enoto - tako je v pravi datoteki ("DŽA", "VEL", "Perviz, POG"). Zadnji
  // stolpci naštejejo odsotne.
  function vNZVObliko(opis) {
    var enote = opis.enote || [];
    var dodatni = opis.dodatniStolpci || ["DEŽURSTVO", "OMEJITVE", "LD", "IZOB", "BS"];
    var leto = opis.leto, mesec = opis.mesec;
    var vrstice = [];
    vrstice.push([MESECI[mesec - 1] + " " + leto]);
    vrstice.push(["DATUM"].concat(enote, dodatni));

    var dni = dniVMesecu(leto, mesec);
    for (var dan = 1; dan <= dni; dan++) {
      var d = new Date(leto, mesec - 1, dan);
      var v = [zapisiDatum(d)];
      enote.forEach(function (e) { v.push(bt(opis.vEnoti(e, d))); });
      dodatni.forEach(function (s) { v.push(bt(opis.vStolpcu(s, d))); });
      vrstice.push(v);
    }
    vrstice.push([]);
    vrstice.push(["v1: " + zapisiDatum(opis.datumIzdelave || new Date())]);
    vrstice.push(["Razpored pripravil: " + bt(opis.pripravil)]);
    return vrstice;
  }

  // ------------------------------------------------------------- BRANJE
  //
  // Blok se prepozna po OBLIKI, ne po zapisu glave (glej uvod). Zaporedne
  // datumske vrstice tvorijo en blok; vrstica nad prvo je vrstica mesecev,
  // nad njo pa vrstica imen.
  // V kateri stolpec pade datum, ni vnaprej znano: živa preglednica ima pred
  // njim še prazen stolpec (levi rob), izvoz v .xlsx pa ga ponekod nima.
  // Namesto trdega števila stolpec poiščemo. Vse ostalo je vezano NANJ:
  // kratica dneva je takoj za njim, izmene (in imena v glavi) pa dva naprej.
  function stolpecZDatumom(vrstica) {
    var v = vrstica || [];
    for (var i = 0; i < Math.min(v.length, 4); i++) if (vDatum(v[i])) return i;
    return -1;
  }

  function najdiBloke(vrsteVrstic) {
    var vrstice = vrsteVrstic || [];
    var bloki = [], tekoci = null;

    function zakljuci() {
      if (tekoci && tekoci.dnevi.length) bloki.push(tekoci);
      tekoci = null;
    }

    for (var i = 0; i < vrstice.length; i++) {
      var v = vrstice[i] || [];
      var sd = stolpecZDatumom(v);
      var d = sd === -1 ? null : vDatum(v[sd]);
      // Blok se prekine tudi, če se stolpec datuma vmes premakne - to ni več
      // isti blok, ampak nov, drugače postavljen.
      if (!d || (tekoci && sd !== tekoci.stolpecDatuma)) zakljuci();
      if (!d) continue;
      if (!tekoci) {
        var vrsticaMeseca = vrstice[i - 1] || [];
        var vrsticaImen = vrstice[i - 2] || [];
        tekoci = {
          stolpecDatuma: sd,
          stolpecPodatkov: sd + 2,
          oznaka: ocistiOznako(vrsticaImen[sd]),
          mesec: mesecStevilka(vrsticaMeseca[sd]) || d.mesec,
          leto: d.leto,
          vrsticaImen: i - 2,
          vrsticaOd: i,
          imena: vrsticaImen.slice(sd + 2).map(bt),
          vloge: vrsticaMeseca.slice(sd + 2).map(bt),
          dnevi: [],
        };
      }
      tekoci.vrsticaDo = i;
      tekoci.dnevi.push({ datum: d, vrstica: i });
    }
    zakljuci();

    bloki.forEach(function (b) {
      b.izpolnjenih = 0;
      b.dnevi.forEach(function (dan) {
        (vrstice[dan.vrstica] || []).slice(b.stolpecPodatkov).forEach(function (c) {
          if (bt(c)) b.izpolnjenih++;
        });
      });
      b.verzija = najdiVerzijo(vrstice, b.vrsticaDo);
      b.opis = (b.oznaka ? b.oznaka + " · " : "") + MESECI[b.mesec - 1] + " " + b.leto;
    });
    return bloki;
  }

  // "C1 odd", "C odd", "Dodd" (brez presledka!), "E2 odd", "FLEXI" -> koda.
  function ocistiOznako(vrednost) {
    var s = bt(vrednost);
    if (!s) return "";
    s = s.replace(/\s*odd\.?\s*$/i, "").replace(/odd\.?$/i, "").trim();
    return s.toUpperCase();
  }

  // Pod blokom stoji vrstica z datumom izdelave ("Datum: 11.6.2026") ali
  // oznako verzije ("v1: 8.6.2026 ob 13:15"). Uporabnik jo vidi, ko izbira
  // med podvojenimi meseci - zato jo poberemo, ne pa da po njej sklepamo.
  function najdiVerzijo(vrstice, odVrstice) {
    for (var i = odVrstice + 1; i < Math.min(vrstice.length, odVrstice + 8); i++) {
      var v = vrstice[i] || [];
      for (var j = 0; j < v.length; j++) {
        var s = bt(v[j]);
        if (/(^|\s)(datum|v\d+)\s*:/i.test(s)) return s;
      }
    }
    return "";
  }

  // Iz enega bloka naredi ravne zapise. Prazna celica pomeni prost dan in se
  // NE vrne - prazen zapis bi ob uvozu pobrisal izmeno, ki je v aplikaciji
  // morda vpisana pravilno.
  function preberiBlok(vrsteVrstic, blok) {
    var vrstice = vrsteVrstic || [];
    var out = [];
    blok.dnevi.forEach(function (dan) {
      var v = vrstice[dan.vrstica] || [];
      blok.imena.forEach(function (ime, k) {
        if (!ime) return;
        var koda = bt(v[blok.stolpecPodatkov + k]);
        if (!koda) return;
        out.push({
          oddelek: blok.oznaka,
          ime: ime,
          leto: dan.datum.leto, mesec: dan.datum.mesec, dan: dan.datum.dan,
          datum: dan.datum.leto + "-" + String(dan.datum.mesec).padStart(2, "0")
                 + "-" + String(dan.datum.dan).padStart(2, "0"),
          koda: koda,
        });
      });
    });
    return out;
  }

  // Isti mesec se v pravi datoteki pojavi tudi po trikrat. Namesto tihega
  // ugibanja vrnemo VSE najdene, da lahko stran vpraša uporabnika.
  function blokiZaMesec(bloki, leto, mesec) {
    return bloki.filter(function (b) { return b.leto === leto && b.mesec === mesec; });
  }

  return {
    MESECI: MESECI, DNEVI: DNEVI,
    vSMSObliko: vSMSObliko,
    vNZVObliko: vNZVObliko,
    najdiBloke: najdiBloke,
    preberiBlok: preberiBlok,
    blokiZaMesec: blokiZaMesec,
    _vDatum: vDatum,
    _ocistiOznako: ocistiOznako,
  };
})();
