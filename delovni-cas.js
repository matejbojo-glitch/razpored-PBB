/* Razpored PBB – delovni-cas.js
 *
 * EDINI vir resnice o izmenah (ure, trajanje, ali je nočna) in o
 * delovnopravnih pravilih. Doslej je bila ista stvar zapisana dvakrat:
 * DELOVNI_ČAS v index.html (samo za prikaz ur) in TRAJANJE_UR v admin.html
 * (samo za izračun plač) – dve definiciji istega dejstva, ki bi se ob
 * spremembi urnika zlahka razšli. Tu sta združeni.
 *
 * Kanonični vir te logike je zdaj src/shared/delovni-cas.js (pravi ES
 * modul, uvožen v Edge funkcije in Node skripte prek `import`). Ta
 * datoteka je njegova ROČNO usklajena različica za brskalnik: mora ostati
 * brez `import`/`export`, da jo brskalnik izvede kot navaden, SINHRON
 * <script>, v točno določenem vrstnem redu z ostalimi <script> značkami na
 * strani (pravi ES modul se nalaga odloženo/asinhrono in bi ta vrstni red
 * podrl). skripte/preveri-delovni-cas.mjs preverja, da src/shared/
 * delovni-cas.js in supabase/functions/_shared/delovni-cas.js (kopija za
 * namestitev) ostajata usklajena; to datoteko je treba ob spremembi logike
 * ročno posodobiti zraven.
 *
 * Ure so iz uradne legende "Razpored delovnega časa – Služba za ZN in
 * oskrbo" (velja od 1. 7. 2022).
 *
 * Brez JSX in brez odvisnosti, da se naloži kot navaden <script> pred
 * babel skriptami – in da je preverljiv tudi v Node.
 */
(function (root) {
  "use strict";

  // code -> { zacetek, konec, ure, nocna, naziv }
  // "zacetek"/"konec" sta "HH:MM"; konec <= zacetek pomeni prehod čez polnoč.
  var IZMENE = {
    "dopoldan":         { zacetek: "05:50", konec: "14:00", ure: 8 + 10/60,  nocna: false },
    "popoldan":         { zacetek: "13:50", konec: "21:00", ure: 7 + 10/60,  nocna: false },
    "popoldan do 19":   { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
    "popoldan do 19h":  { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
    "NOČNA":            { zacetek: "20:50", konec: "06:00", ure: 9 + 10/60,  nocna: true },
    "NOČNA od 19":      { zacetek: "18:50", konec: "06:00", ure: 11 + 10/60, nocna: true },
    "NOČNA od 19h":     { zacetek: "18:50", konec: "06:00", ure: 11 + 10/60, nocna: true },
    "NOČNA12":          { zacetek: "17:50", konec: "06:00", ure: 12 + 10/60, nocna: true },
    // Dnevni 12-urni izmeni sta DVE in nista izmenljivi:
    //   DNEVNA12  05:50-18:00 - oddelčna (10-minutna predaja kot pri vseh
    //             ostalih izmenah: ob 18:00 prevzame NOČNA12 ob 17:50),
    //             zato dejansko traja 12 h 10 min.
    //   DNEVNA12F 07:00-19:00 - flexi ("F"), točno 12 h, brez predaje.
    // Doslej je obstajala samo prva, obračunana na 12 h namesto 12 h 10 min;
    // uradna legenda pa je pod enim samim imenom "Dnevna 12" navajala ure
    // druge (07:00-19:00). Od tod dolgotrajno neujemanje 12,00 : 12,17.
    "DNEVNA12":         { zacetek: "05:50", konec: "18:00", ure: 12 + 10/60, nocna: false },
    "DNEVNA12F":        { zacetek: "07:00", konec: "19:00", ure: 12,         nocna: false },
    // Dežurstvo: med tednom 15:30-07:00, ob vikendih/praznikih 24 h
    // (07:00-07:00). Tu je zapisana samo delavniška varianta in BREZ ur -
    // vikend varianta bi zahtevala logiko po dnevu v tednu, ki je
    // aplikacija še nima. Zato dežurstvo tudi ne šteje v obračun ur
    // (glej zavihek Plače, kjer je prikazano kot število, ne ure).
    "DEŽURSTVO":        { zacetek: "15:30", konec: "07:00", ure: null,       nocna: true },
    // Vodje in administratorji (DMS): redni delovnik 07:00-15:00, torej
    // natanko 8 ur brez 10-minutne predaje, ki jo imajo oddelčne izmene.
    // "PRISOTEN" je koda, ki jo aplikacija zapiše ob objavi razporeda NZV
    // (admin.html -> NZV). Doslej je bila med NI_DELO in ni štela v ure -
    // na uporabnikovo izrecno odločitev odslej šteje.
    "PRISOTEN":         { zacetek: "07:00", konec: "15:00", ure: 8,          nocna: false },
    // Ista izmena, nov zapis (velika začetnica, kot v uradni legendi).
    // Generator odslej ustvarja te, v bazi in v preglednicah pa so še
    // stari zapisi - zato morata delovati OBA. Ključ se normalizira z
    // male-črke-brez-presledkov, zato "Nočna 12" in "Dnevna 12" že sama
    // padeta na "NOČNA12"/"DNEVNA12" in ju tu ni treba naštevati.
    "Dopoldne":         { zacetek: "05:50", konec: "14:00", ure: 8 + 10/60,  nocna: false },
    "Popoldne":         { zacetek: "13:50", konec: "21:00", ure: 7 + 10/60,  nocna: false },
    "Popoldne do 19":   { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
    "Popoldne do 19h":  { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
  };

  // Kode, ki NISO delo (odsotnost/prosto) – ne štejejo v počitek niti v ure.
  var NI_DELO = ["LD", "KPU", "BS", "STI", "POR", ""];

  // Privzeta delovnopravna pravila. NAMENOMA nastavljiva (in ne trdo
  // zapisana v kodo), ker gre za razlago kolektivne pogodbe/ZDR-1 in jih
  // mora potrditi kadrovska – tu so samo izhodiščne vrednosti.
  var PRIVZETA_PRAVILA = {
    minPocitekUr: 10.7,        // najmanj ur med koncem ene in začetkom naslednje izmene
    maxZaporednihNocnih: 2,    // največ zaporednih nočnih izmen
    maxTedenskihUr: 56,        // zgornja meja ur v 7 zaporednih dneh (opozorilo)
    zahtevajProstDanNaTeden: true, // vsaj en dan brez izmene v vsakem oknu 7 dni
  };

  // Zakonski razlogi za izjemo (prekoračitev), po katerih se izjema lahko
  // evidentira namesto da bi bila obravnavana kot kršitev.
  var RAZLOGI_IZJEME = {
    POVECAN_OBSEG_DELA: "Povečan obseg dela",
    NEPRICAKOVANA_ODSOTNOST: "Nepričakovana odsotnost",
    NEPREKINJENO_ZDR_VARSTVO: "Neprekinjeno zdravstveno varstvo",
    MATERIALNA_SKODA_ZDRAVJE: "Preprečitev materialne škode / nevarnosti za zdravje",
    ODPRAVLJANJE_NESREC: "Odpravljanje posledic nesreč",
    NAGLA_OKVARA_SREDSTEV: "Nagla okvara delovnih sredstev",
  };

  // Razpored se uvaža iz Google Sheets, kjer isto izmeno kdo zapiše
  // "DNEVNA12F", kdo "DNEVNA 12 F" in kdo z malimi črkami. Iskanje zato
  // teče po ključu brez presledkov in v malih črkah – sicer bi se
  // neujemajoč zapis tiho obravnaval kot "ni izmena" in bi izpadel iz
  // obračuna ur in iz preverjanja počitka.
  function kljuc(s) { return (s || "").toLowerCase().replace(/\s+/g, ""); }

  var INDEKS = {};
  Object.keys(IZMENE).forEach(function (k) { INDEKS[kljuc(k)] = k; });
  var NI_DELO_INDEKS = {};
  NI_DELO.forEach(function (k) { NI_DELO_INDEKS[kljuc(k)] = true; });

  // Dežurstvo (NZV, 15:30-07:00) se obravnava posebej pri počitku - glej
  // preveriPravila spodaj.
  function jeDezurstvo(sifra) {
    return kljuc(sifra) === kljuc("DEŽURSTVO");
  }

  function jeDelo(sifra) {
    var k = kljuc(sifra);
    if (NI_DELO_INDEKS[k]) return false;
    return !!INDEKS[k];
  }

  function podatkiIzmene(sifra) {
    var kanonicna = INDEKS[kljuc(sifra)];
    return kanonicna ? IZMENE[kanonicna] : null;
  }

  // "HH:MM" -> minute od polnoči
  function vMinute(hhmm) {
    var d = hhmm.split(":");
    return Number(d[0]) * 60 + Number(d[1]);
  }

  // Trajanje med dvema urama znotraj enega dne, s prehodom čez polnoč: če
  // je "konec" <= "zacetek", se šteje, da izmena traja do te ure NASLEDNJI
  // dan.
  function trajanjeUr(zacetekHHMM, konecHHMM) {
    var z = vMinute(zacetekHHMM), k = vMinute(konecHHMM);
    var minute = k - z;
    if (minute <= 0) minute += 24 * 60;
    return minute / 60;
  }

  // Vrne { zacetek: Date, konec: Date } za izmeno na dani ISO dan.
  // Če se izmena konča ob uri, ki je <= začetku, se konča naslednji dan.
  function casovniOkvir(isoDan, sifra) {
    var izm = podatkiIzmene(sifra);
    if (!izm) return null;
    var zac = new Date(isoDan + "T00:00:00Z");
    zac.setUTCMinutes(vMinute(izm.zacetek));
    var kon = new Date(isoDan + "T00:00:00Z");
    kon.setUTCMinutes(vMinute(izm.konec));
    if (vMinute(izm.konec) <= vMinute(izm.zacetek)) kon.setUTCDate(kon.getUTCDate() + 1);
    return { zacetek: zac, konec: kon };
  }

  function razlikaUr(a, b) { return (b.getTime() - a.getTime()) / 3600000; }

  function dodajDni(isoDan, n) {
    var d = new Date(isoDan + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Koliko ur izmene pade v nočni okvir 22:00-06:00. Ločeno od
  // IZMENE[...].ure (skupno trajanje, za obračun plač) in od
  // IZMENE[...].nocna (samo da/ne) - dejansko preštetih ur v uradnem
  // nočnem oknu, npr. za izmene, ki se le deloma prekrivajo z njim.
  function nocneUreIzmene(isoDan, sifra) {
    var okvir = casovniOkvir(isoDan, sifra);
    if (!okvir) return 0;
    var ure = 0;
    [dodajDni(isoDan, -1), isoDan].forEach(function (dan) {
      var nocZacetek = new Date(dan + "T00:00:00Z");
      nocZacetek.setUTCHours(22, 0, 0, 0);
      var nocKonec = new Date(dan + "T00:00:00Z");
      nocKonec.setUTCDate(nocKonec.getUTCDate() + 1);
      nocKonec.setUTCHours(6, 0, 0, 0);
      var od = okvir.zacetek > nocZacetek ? okvir.zacetek : nocZacetek;
      var doInc = okvir.konec < nocKonec ? okvir.konec : nocKonec;
      if (doInc > od) ure += razlikaUr(od, doInc);
    });
    return ure;
  }

  // Prazniki/vikendi: EN SAM VIR je prazniki.js (window.Prazniki), ki se
  // na vseh straneh nalaga PRED delovni-cas.js - glej vrstni red <script>
  // značk. Tu samo posredujemo, da ima klicatelj vse na enem mestu
  // (window.DelovniCas), brez podvajanja logike velikonočnega algoritma.
  function jePraznik(iso) { return !!(root.Prazniki && root.Prazniki.jePraznik(iso)); }
  function jeVikend(iso) { return !!(root.Prazniki && root.Prazniki.jeVikend(iso)); }
  function jeDelaProstDan(iso) { return !!(root.Prazniki && root.Prazniki.jeDelaProstDan(iso)); }
  function nazivPraznika(iso) { return root.Prazniki ? root.Prazniki.naziv(iso) : ""; }

  // Počitek (v urah) med koncem prejšnje in začetkom naslednje izmene iste
  // osebe. Vrne null, če ene od obeh šifer ne pozna.
  function pocitekMedIzmenama(prejDatum, prejSifra, datumDatum, datumSifra) {
    var prej = casovniOkvir(prejDatum, prejSifra);
    var zdaj = casovniOkvir(datumDatum, datumSifra);
    if (!prej || !zdaj) return null;
    return razlikaUr(prej.konec, zdaj.zacetek);
  }

  /**
   * Preveri delovnopravna pravila za enega ali več zaposlenih.
   *
   * vnosi: [{ oseba, datum (ISO), sifra, izjema? }]
   *   "izjema" (true) pomeni, da je prekoračitev že evidentirana kot
   *   zakonska izjema – takrat se kršitev prijavi kot opozorilo, ne kot
   *   kritična napaka.
   * pravila: glej PRIVZETA_PRAVILA (delni objekt je dovolj)
   *
   * Vrne: [{ oseba, datum, vrsta, resnost: "kriticno"|"opozorilo", sporocilo }]
   */
  function preveriPravila(vnosi, pravila) {
    var p = Object.assign({}, PRIVZETA_PRAVILA, pravila || {});
    var krsitve = [];

    // Skupine po osebi, urejene po datumu.
    var poOsebi = {};
    (vnosi || []).forEach(function (v) {
      if (!v || !v.datum) return;
      (poOsebi[v.oseba] = poOsebi[v.oseba] || []).push(v);
    });

    Object.keys(poOsebi).forEach(function (oseba) {
      var seznam = poOsebi[oseba].slice().sort(function (a, b) {
        return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0;
      });
      var delovni = seznam.filter(function (v) { return jeDelo(v.sifra); });

      // --- 1) počitek med zaporednima izmenama ---
      for (var i = 1; i < delovni.length; i++) {
        // PO DEŽURSTVU sledi normalen delovnik in to je PRIČAKOVANO
        // stanje, ne kršitev: tako se zagotavlja neprekinjeno zdravstveno
        // varstvo (odločitev vodstva ZN, avgust 2026).
        //
        // Brez te izjeme bi vsako dežurstvo med tednom javilo "0 h
        // počitka": dežurstvo se konča ob 07:00, dopoldanska izmena se ob
        // 07:00 začne. Opozorilo bi bilo torej stalno in bi prav zato
        // izgubilo pomen - med množico pričakovanih se prave kršitve ne
        // bi več videlo.
        //
        // Izjema velja SAMO za prehod IZ dežurstva. Prehod V dežurstvo in
        // vsi ostali prehodi se preverjajo naprej.
        if (jeDezurstvo(delovni[i - 1].sifra)) continue;
        var pocitek = pocitekMedIzmenama(
          delovni[i - 1].datum, delovni[i - 1].sifra,
          delovni[i].datum, delovni[i].sifra
        );
        if (pocitek == null) continue;
        if (pocitek < p.minPocitekUr) {
          var jeIzjema = !!(delovni[i].izjema || delovni[i - 1].izjema);
          krsitve.push({
            oseba: oseba, datum: delovni[i].datum, vrsta: "pocitek",
            resnost: jeIzjema ? "opozorilo" : "kriticno",
            sporocilo: (pocitek < 0
                ? "Izmeni se prekrivata (" + delovni[i - 1].sifra + " → " + delovni[i].sifra + ")"
                : "Le " + (Math.round(pocitek * 10) / 10) + " h počitka med izmenama ("
                  + delovni[i - 1].sifra + " → " + delovni[i].sifra + ")")
              + ", zahtevanih je " + p.minPocitekUr + " h."
              + (jeIzjema ? " Evidentirano kot izjema." : ""),
          });
        }
      }

      // --- 2) zaporedne nočne izmene ---
      var niz = 0, zacetekNiza = null, prejsnjiDatum = null;
      delovni.forEach(function (v) {
        var izm = podatkiIzmene(v.sifra);
        var nocna = izm && izm.nocna;
        var zaporedni = prejsnjiDatum && dodajDni(prejsnjiDatum, 1) === v.datum;
        if (nocna && (zaporedni || niz === 0)) {
          if (niz === 0) zacetekNiza = v.datum;
          niz++;
        } else if (nocna) {
          niz = 1; zacetekNiza = v.datum;
        } else {
          niz = 0; zacetekNiza = null;
        }
        if (niz > p.maxZaporednihNocnih) {
          krsitve.push({
            oseba: oseba, datum: v.datum, vrsta: "nocne",
            resnost: v.izjema ? "opozorilo" : "kriticno",
            sporocilo: "Zaporednih nočnih izmen: " + niz + " (od " + zacetekNiza
              + "), dovoljeno največ " + p.maxZaporednihNocnih + "."
              + (v.izjema ? " Evidentirano kot izjema." : ""),
          });
        }
        prejsnjiDatum = v.datum;
      });

      // --- 3) tedenske ure in prost dan v vsakem oknu 7 dni ---
      if (delovni.length) {
        var poDatumu = {};
        delovni.forEach(function (v) { poDatumu[v.datum] = v; });
        var prvi = delovni[0].datum, zadnji = delovni[delovni.length - 1].datum;
        for (var d = prvi; d <= zadnji; d = dodajDni(d, 1)) {
          var ure = 0, delovnihDni = 0;
          for (var k = 0; k < 7; k++) {
            var dan = dodajDni(d, k);
            if (dan > zadnji) break;
            var v2 = poDatumu[dan];
            if (v2) {
              delovnihDni++;
              var izm2 = podatkiIzmene(v2.sifra);
              if (izm2 && izm2.ure) ure += izm2.ure;
            }
          }
          if (dodajDni(d, 6) > zadnji) break; // nepopolno okno – ne ocenjujemo
          if (ure > p.maxTedenskihUr) {
            krsitve.push({
              oseba: oseba, datum: d, vrsta: "tedenskeUre", resnost: "opozorilo",
              sporocilo: Math.round(ure) + " ur v 7 dneh od " + d + " (meja " + p.maxTedenskihUr + " h).",
            });
          }
          if (p.zahtevajProstDanNaTeden && delovnihDni === 7) {
            krsitve.push({
              oseba: oseba, datum: d, vrsta: "prostDan", resnost: "kriticno",
              sporocilo: "7 zaporednih delovnih dni od " + d + " – brez prostega dne.",
            });
          }
        }
      }
    });

    return krsitve;
  }

  // Povzetek za prikaz: koliko kritičnih in koliko opozoril.
  function povzetek(krsitve) {
    var kriticnih = krsitve.filter(function (k) { return k.resnost === "kriticno"; }).length;
    return { skupaj: krsitve.length, kriticnih: kriticnih, opozoril: krsitve.length - kriticnih };
  }

  // --- Uradni šifrant kratic (CLAUDE.md "Uradni šifrant kratic in izmen") -
  //
  // Ločeno od IZMENE zgoraj (drug, krajši nabor kod - DF12/D12/N12 ipd. -
  // ki ga generator/aplikacija trenutno ne oddajata; ta šifrant je uradna
  // referenca za obračun ur po kratici). DEŽ nima trdne vrednosti - glej
  // ureDezurstva spodaj (medtedensko proti vikend/praznik).
  var URE_SIFRANT = {
    DF12: 12, D12: 12, N12: 12, N11: 11, N10: 10,
    PO5: 5, PO6: 6, DO6: 6, DO4: 4, PO4: 4, PO7: 7, DO7: 7, DOP: 8,
    LD: 8, POR: 8, STI: 8, BS: 8,
    KPU: 0, "": 0,
  };

  // Nočne izmene in kode, ki jim naslednji dan (11-urni počitek) NE smejo
  // slediti - dnevne/dopoldanske izmene.
  var NOCNE_IZMENE = ["N12", "N11", "N10"];
  var PREPOVEDANE_PO_NOCNI = ["DF12", "D12", "DOP", "DO7", "DO6", "DO4"];

  // Ali je prehod iz prejsnjaIzmena v naslednjaIzmena skladen z 11-urnim
  // počitkom po nočni izmeni. false SAMO, če je prejšnja izmena nočna IN je
  // naslednja na seznamu prepovedanih - vsi drugi prehodi so v redu.
  function preveriPocitek(prejsnjaIzmena, naslednjaIzmena) {
    if (NOCNE_IZMENE.indexOf(prejsnjaIzmena) === -1) return true;
    return PREPOVEDANE_PO_NOCNI.indexOf(naslednjaIzmena) === -1;
  }

  // Ure dežurstva (DEŽ) za en dan: med tednom 15:30-07:00 (15,5 h), ob
  // vikendih in praznikih 07:00-07:00 (24 h) - isto razlikovanje kot pri
  // DEŽURSTVO v IZMENE zgoraj.
  function ureDezurstva(iso) {
    return jeDelaProstDan(iso) ? 24 : 15.5;
  }

  // Vsota ur po URE_SIFRANT za poljuben seznam vnosov (npr. cel mesec ene
  // osebe). vnosi: [{ datum (ISO), sifra }]. "DEŽ" se izračuna po datumu
  // (ureDezurstva), neznane kode ne štejejo (0), ne vržejo napake.
  function izracunajUreMeseca(vnosi) {
    return (vnosi || []).reduce(function (vsota, v) {
      if (!v) return vsota;
      if (v.sifra === "DEŽ") return vsota + ureDezurstva(v.datum);
      if (Object.prototype.hasOwnProperty.call(URE_SIFRANT, v.sifra)) return vsota + URE_SIFRANT[v.sifra];
      return vsota;
    }, 0);
  }

  // Ali dejansko število zaposlenih doseže zahtevani minimum. Splošen,
  // samostojen preverjevalnik - klicatelj sam prešteje dejansko zasedbo
  // (ni povezave na minimalna_zasedba v bazi).
  function preveriMinimalnoZasedbo(dejanskoStevilo, minimalnoStevilo) {
    return dejanskoStevilo >= minimalnoStevilo;
  }

  root.DelovniCas = {
    IZMENE: IZMENE,
    NI_DELO: NI_DELO,
    jeDezurstvo: jeDezurstvo,
    kljuc: kljuc,
    PRIVZETA_PRAVILA: PRIVZETA_PRAVILA,
    URE_SIFRANT: URE_SIFRANT,
    NOCNE_IZMENE: NOCNE_IZMENE,
    PREPOVEDANE_PO_NOCNI: PREPOVEDANE_PO_NOCNI,
    preveriPocitek: preveriPocitek,
    ureDezurstva: ureDezurstva,
    izracunajUreMeseca: izracunajUreMeseca,
    preveriMinimalnoZasedbo: preveriMinimalnoZasedbo,
    RAZLOGI_IZJEME: RAZLOGI_IZJEME,
    jeDelo: jeDelo,
    podatkiIzmene: podatkiIzmene,
    casovniOkvir: casovniOkvir,
    trajanjeUr: trajanjeUr,
    nocneUreIzmene: nocneUreIzmene,
    jePraznik: jePraznik,
    jeVikend: jeVikend,
    jeDelaProstDan: jeDelaProstDan,
    nazivPraznika: nazivPraznika,
    pocitekMedIzmenama: pocitekMedIzmenama,
    preveriPravila: preveriPravila,
    povzetek: povzetek,
  };
})(typeof window !== "undefined" ? window : globalThis);
