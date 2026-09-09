/* Statistika razporeda – izračun števil nad mrežo in branje že
 * sestavljenega razporeda iz datoteke.
 *
 * Zakaj svoja datoteka: števila v Generatorju se morajo preračunati ob
 * VSAKI spremembi mreže (generiranje, ročni popravek celice, naložena
 * datoteka), zato mora biti izračun čista funkcija brez stanja – tako ga
 * React lahko požene znova ob vsakem izrisu in se prikaz ne more razhajati
 * z mrežo. Enak izračun bo lahko uporabila tudi Statistika (dashboard.html),
 * ne da bi se logika podvojila.
 *
 * Ure, kratice, barve in prazniki se NE računajo tu: prevzeti so iz
 * delovni-cas.js, izmene.js in prazniki.js, ki so za to edini vir.
 *
 * Odvisnosti: izmene.js, delovni-cas.js, prazniki.js, datum.js in
 * (samo za branje datotek) import-utils.js.
 */
window.Statistika = (function () {
  "use strict";

  // Nočne izmene so že naštete v delovni-cas.js (pravilo počitka po nočni);
  // tu se samo prebere isti seznam, da se kopiji ne moreta raziti.
  function nocne() {
    return (window.DelovniCas && window.DelovniCas.NOCNE_IZMENE) || ["N12", "N11", "N10"];
  }

  function jeProstDan(iso) {
    return !!(window.Prazniki && window.Prazniki.jeDelaProstDan(iso));
  }

  // Ure ene celice. DEŽ je odvisen od datuma (15,5 h med tednom, 24 h ob
  // dela prostem dnevu), zato gre izračun prek DelovniCas in ne prek
  // preproste tabele.
  function ureCelice(datum, kratica) {
    if (!window.DelovniCas) return 0;
    return window.DelovniCas.izracunajUreMeseca([{ datum: datum, sifra: kratica }]);
  }

  function prazenIzkaz(ime) {
    return {
      ime: ime, izmen: 0, ur: 0, nocnih: 0, vikendnih: 0,
      dezurstev: 0, odsotnosti: 0, prostih: 0,
      // Letni dopust se šteje posebej: v "ur" je vštet (glej spodaj), tu
      // pa ostane viden, da se v prikazu loči delo od dopusta.
      ldDni: 0, ldUr: 0,
    };
  }

  /* Glavni izračun.
   *
   * opts:
   *   dnevi     [{ datum, dan }]          – stolpci mreže
   *   staff     [{ ime }]                 – vrstice mreže
   *   vrednost  (ime, datum) -> šifra     – TISTO, kar je v celici na
   *                                         zaslonu (torej z ročnimi popravki)
   *   vrzeli    [{ datum, bucket, primanjkljaj }] – iz izracunajVrzeli()
   *   krsitve   [{ resnost }]             – iz DelovniCas.preveriPravila()
   *
   * Vrne enotno strukturo, ki jo prikaz samo izriše (nič več računanja v
   * komponentah – sicer se števili v traku in v predalu razideta).
   */
  function izracunaj(opts) {
    var dnevi = (opts && opts.dnevi) || [];
    var staff = (opts && opts.staff) || [];
    var vrednost = (opts && opts.vrednost) || function () { return ""; };
    var vrzeli = (opts && opts.vrzeli) || [];
    var krsitve = (opts && opts.krsitve) || [];
    var NOCNE = nocne();

    var skupno = {
      celic: 0, izmen: 0, ur: 0, nocnih: 0, vikendnih: 0,
      dezurstev: 0, odsotnosti: 0, prostih: 0, ldDni: 0, ldUr: 0,
    };
    // Groba razporeditev dela po delu dneva – za vrstico deležev v predalu.
    var poSkupinah = { dop: 0, pop: 0, noc: 0, h12: 0, dez: 0 };
    var poOsebi = [];

    staff.forEach(function (z) {
      var o = prazenIzkaz(z.ime);
      dnevi.forEach(function (dn) {
        var sifra = vrednost(z.ime, dn.datum);
        var kratica = window.Izmene.kratica(sifra);
        var stanje = window.Izmene.stanje(sifra);
        var prostDan = jeProstDan(dn.datum);
        skupno.celic++;
        if (stanje === "delo" || stanje === "dezurstvo") {
          o.ur += ureCelice(dn.datum, kratica);
          if (prostDan) o.vikendnih++;
          if (stanje === "dezurstvo") o.dezurstev++;
          else {
            o.izmen++;
            if (NOCNE.indexOf(kratica) !== -1) o.nocnih++;
          }
          var sk = window.Izmene.skupina(sifra);
          if (Object.prototype.hasOwnProperty.call(poSkupinah, sk)) poSkupinah[sk]++;
        } else if (stanje === "prosto") {
          o.prostih++;
        } else {
          // dopust, bolniška, kroženje – oseba tisti dan oddelka ne pokriva
          o.odsotnosti++;
          // LETNI DOPUST ŠTEJE MED URE (uporabnikova zahteva, september
          // 2026): dan LD je po uradnem šifrantu 8 ur in tako je tudi
          // plačan, zato mora biti v obremenitvi osebe. Brez tega je
          // primerjava med ljudmi zavajajoča - kdor je bil teden na
          // dopustu, izpade kot manj obremenjen, čeprav mu je mesečna
          // obveznost polna. Ure so vzete iz iste tabele kot vse ostale
          // (URE_SIFRANT v delovni-cas.js, LD = 8 h), ne iz svoje kopije.
          if (kratica === "LD") {
            var ldUr = ureCelice(dn.datum, "LD");
            o.ldDni++;
            o.ldUr += ldUr;
            o.ur += ldUr;
          }
        }
      });
      o.ur = Math.round(o.ur * 10) / 10;
      o.ldUr = Math.round(o.ldUr * 10) / 10;
      poOsebi.push(o);
      skupno.ldDni += o.ldDni;
      skupno.ldUr += o.ldUr;
      skupno.izmen += o.izmen;
      skupno.ur += o.ur;
      skupno.nocnih += o.nocnih;
      skupno.vikendnih += o.vikendnih;
      skupno.dezurstev += o.dezurstev;
      skupno.odsotnosti += o.odsotnosti;
      skupno.prostih += o.prostih;
    });
    skupno.ur = Math.round(skupno.ur * 10) / 10;
    skupno.ldUr = Math.round(skupno.ldUr * 10) / 10;

    // Največ ur ima ena oseba – merilo za stolpce obremenjenosti. Brez tega
    // bi bili vsi stolpci enako dolgi ali pa bi jih bilo treba deliti s
    // skupnimi urami, kar pri 20 ljudeh ne pokaže razlik.
    var najvecUr = poOsebi.reduce(function (m, o) { return Math.max(m, o.ur); }, 0);
    // Razpon ur (najmanj/največ) je edino, kar pove, ali je razpored
    // pravičen – povprečje samo po sebi tega ne pove.
    var najmanjUr = poOsebi.length
      ? poOsebi.reduce(function (m, o) { return Math.min(m, o.ur); }, Infinity) : 0;
    var povprecje = poOsebi.length ? skupno.ur / poOsebi.length : 0;

    var manjka = vrzeli.reduce(function (v, x) { return v + (Number(x.primanjkljaj) || 0); }, 0);
    var dneviZVrzeljo = {};
    vrzeli.forEach(function (v) { dneviZVrzeljo[v.datum] = true; });

    var pov = window.DelovniCas.povzetek(krsitve);

    return {
      skupno: skupno,
      poSkupinah: poSkupinah,
      poOsebi: poOsebi.sort(function (a, b) { return b.ur - a.ur || (a.ime < b.ime ? -1 : 1); }),
      najvecUr: najvecUr,
      najmanjUr: najmanjUr === Infinity ? 0 : najmanjUr,
      povprecneUr: Math.round(povprecje * 10) / 10,
      vrzeli: {
        skupaj: manjka,
        mest: vrzeli.length,
        dni: Object.keys(dneviZVrzeljo).length,
      },
      krsitve: { kriticnih: pov.kriticnih, opozoril: pov.opozoril, skupaj: pov.skupaj },
      // Ena sama številka za značko na gumbu: kar mora koordinator rešiti,
      // preden razpored objavi.
      nerazresenih: vrzeli.length + pov.kriticnih,
      oseb: staff.length,
      dni: dnevi.length,
    };
  }

  // --- branje že sestavljenega razporeda iz datoteke -------------------
  //
  // Generator zna razpored IZVOZITI (JSON za mobilno aplikacijo, CSV,
  // Excel); doslej ga ni znal prebrati nazaj. Brez tega je bilo vsako
  // preverjanje že sestavljenega razporeda mogoče šele po objavi.
  //
  // Prepoznata se dve obliki:
  //   1. lastni JSON izvoz  { mesec, oddelki: [{ koda, naziv, zaposleni, dnevi }] }
  //   2. mreža oseba × dan  (CSV/Excel/JSON tabela): prva vrstica so datumi,
  //      prvi stolpec imena – natanko to, kar zapiše "Izvozi CSV".

  function beriBesedilo(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Datoteke ni bilo mogoče prebrati.")); };
      fr.onload = function () { resolve(String(fr.result || "")); };
      fr.readAsText(file);
    });
  }

  function jeIsoDatum(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

  // Datum iz glave stolpca: "2026-11-01", "1. 11. 2026" in "1.11.2026"
  // vse pridejo iz naših izvozov, zato jih prebere ista pot kot uvoz
  // (import-utils.js). Rezerva spodaj velja samo, kadar te datoteke ni -
  // brez nje bi vsak slovensko zapisan datum tiho odpadel in uporabnik bi
  // dobil "ni najti vrstice z datumi" nad datoteko, ki datume ima.
  function datumIzCelice(c) {
    var t = String(c == null ? "" : c).trim();
    var iso = window.ImportUtils ? window.ImportUtils.normalizirajDatum(t) : t;
    if (jeIsoDatum(iso)) return iso;
    var m = /^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/.exec(t);
    if (!m) return null;
    return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }

  function dneviIzMreze(vrsteVrstic) {
    // Glava je prva vrstica z vsaj tremi datumi – tako se preskočijo
    // naslovi, prazne vrstice in morebitna vrstica z imenom lista.
    var glavaIdx = -1, stolpci = null;
    for (var i = 0; i < vrsteVrstic.length && glavaIdx === -1; i++) {
      var v = vrsteVrstic[i] || [];
      var najdeni = [];
      for (var j = 1; j < v.length; j++) {
        var iso = datumIzCelice(v[j]);
        if (iso) najdeni.push({ stolpec: j, datum: iso });
      }
      if (najdeni.length >= 3) { glavaIdx = i; stolpci = najdeni; }
    }
    if (glavaIdx === -1) {
      throw new Error("V datoteki ni najti vrstice z datumi (pričakovana je mreža: prva vrstica datumi, prvi stolpec imena).");
    }
    var imena = [], izmenePoDnevu = {};
    stolpci.forEach(function (s) { izmenePoDnevu[s.datum] = {}; });
    for (var r = glavaIdx + 1; r < vrsteVrstic.length; r++) {
      var vrsta = vrsteVrstic[r] || [];
      var ime = String(vrsta[0] == null ? "" : vrsta[0]).trim();
      if (!ime) continue;
      // Vrstice s seštevki ("Skupaj", "SKUPAJ ur") niso osebe.
      if (/^skupaj/i.test(ime)) continue;
      if (imena.indexOf(ime) === -1) imena.push(ime);
      stolpci.forEach(function (s) {
        var c = vrsta[s.stolpec];
        izmenePoDnevu[s.datum][ime] = String(c == null ? "" : c).trim();
      });
    }
    if (!imena.length) throw new Error("V datoteki ni najti nobene vrstice z imenom osebe.");
    return {
      imena: imena,
      dnevi: stolpci.map(function (s) {
        return { datum: s.datum, dan: window.Datum.dan2(s.datum), izmene: izmenePoDnevu[s.datum] };
      }),
    };
  }

  function mesecIzDni(dnevi) {
    return dnevi.length ? dnevi[0].datum.slice(0, 7) : "";
  }

  // Skupna oblika rezultata – ista kot jo naredi generiranje, da mreža,
  // izvozi in objava delajo z uvoženim razporedom brez izjem. Razlika je
  // samo "uvozeno": pričakovane zasedbe po dnevih ni (ni kalupa, iz
  // katerega bi se izpeljala), zato se vrzeli lahko računajo le iz
  // nastavljenih minimumov po izmenah.
  function rezultatIzMreze(opts) {
    var dnevi = opts.dnevi;
    return {
      koda: opts.koda, naziv: opts.naziv, mesec: opts.mesec || mesecIzDni(dnevi),
      dnevi: dnevi,
      staff: opts.imena.map(function (ime) { return { ime: ime, vloga: "SMS / TZN" }; }),
      opozorila: [],
      pricakovanoPoDnevih: {},
      uvozeno: { datoteka: opts.datoteka, oblika: opts.oblika },
    };
  }

  function izLastnegaJson(podatki, izbranaKoda, datoteka) {
    var oddelki = (podatki && podatki.oddelki) || [];
    if (!oddelki.length) return null;
    // Če je v datoteki več oddelkov, se vzame tisti, ki je izbran v
    // Generatorju – sicer bi se tiho prikazal tuj razpored.
    var o = oddelki.filter(function (x) { return x && x.koda === izbranaKoda; })[0] || oddelki[0];
    var dnevi = (o.dnevi || []).map(function (dn) {
      return {
        datum: dn.datum,
        dan: dn.dan || window.Datum.dan2(dn.datum),
        izmene: dn.izmene || {},
      };
    }).filter(function (dn) { return jeIsoDatum(dn.datum); });
    if (!dnevi.length) return null;
    var imena = [];
    (o.zaposleni || []).forEach(function (z) {
      var ime = typeof z === "string" ? z : (z && z.ime);
      if (ime && imena.indexOf(ime) === -1) imena.push(ime);
    });
    // Zaposleni v datoteki so lahko izpuščeni (starejši izvozi) – takrat se
    // imena preberejo iz samih dni, da nobena vrstica ne izgine.
    dnevi.forEach(function (dn) {
      Object.keys(dn.izmene).forEach(function (ime) { if (imena.indexOf(ime) === -1) imena.push(ime); });
    });
    return rezultatIzMreze({
      koda: o.koda || izbranaKoda, naziv: o.naziv || o.koda || izbranaKoda,
      mesec: podatki.mesec || mesecIzDni(dnevi),
      dnevi: dnevi, imena: imena, datoteka: datoteka, oblika: "JSON (izvoz aplikacije)",
    });
  }

  /* Prebere datoteko in vrne rezultat v obliki, ki jo Generator že riše.
   * "izbranaKoda"/"izbranNaziv" se uporabita, kadar ju datoteka sama ne
   * pove (CSV/Excel mreža nima podatka, za kateri oddelek gre). */
  function razporedIzDatoteke(file, izbranaKoda, izbranNaziv) {
    var ime = (file.name || "").toLowerCase();
    if (/\.json$/.test(ime)) {
      return beriBesedilo(file).then(function (t) {
        var podatki = null;
        try { podatki = JSON.parse(t); }
        catch (e) { throw new Error("Datoteka ni veljaven JSON: " + (e.message || e)); }
        var iz = izLastnegaJson(podatki, izbranaKoda, file.name);
        if (iz) return iz;
        // Ni naš izvoz razporeda – naj ga prebere splošna pot (tabela).
        return prekoUvoza(file, izbranaKoda, izbranNaziv);
      });
    }
    return prekoUvoza(file, izbranaKoda, izbranNaziv);
  }

  function prekoUvoza(file, izbranaKoda, izbranNaziv) {
    if (!window.ImportUtils) return Promise.reject(new Error("Branje datotek ni na voljo."));
    return window.ImportUtils.preberiDatoteko(file).then(function (res) {
      if (res.tip === "pdf-besedilo") {
        throw new Error("PDF brez prave tabele ni podprt – uporabi CSV, Excel ali JSON izvoz.");
      }
      if (res.tip === "gsheet") {
        throw new Error("Bližnjica .gsheet ne vsebuje podatkov – izvozi list kot CSV/Excel.");
      }
      var mreza = dneviIzMreze(res.vrsteVrstic || []);
      return rezultatIzMreze({
        koda: izbranaKoda, naziv: izbranNaziv || izbranaKoda,
        dnevi: mreza.dnevi, imena: mreza.imena, datoteka: file.name,
        oblika: (res.tip || "tabela").toUpperCase(),
      });
    });
  }

  return {
    izracunaj: izracunaj,
    razporedIzDatoteke: razporedIzDatoteke,
    // Izpostavljeno za preizkuse in za morebitno rabo v uvozu.
    dneviIzMreze: dneviIzMreze,
  };
})();
