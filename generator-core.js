/* Razpored PBB – generator-core.js
 * Čista logika (brez UI), da jo je mogoče testirati neodvisno od brskalnika.
 * Deluje tako v brskalniku (window.Generator) kot v Node.js (module.exports).
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------
  // Skupne pomožne funkcije za delo z datumi (UTC, da se izognemo težavam
  // s poletnim/zimskim časom pri seštevanju dni).
  // ---------------------------------------------------------------------
  function toDate(iso) {
    var p = iso.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }
  function fromDate(d) {
    return d.toISOString().slice(0, 10);
  }
  function addDays(d, n) {
    var r = new Date(d.getTime());
    r.setUTCDate(r.getUTCDate() + n);
    return r;
  }
  function weekdayMon0(d) {
    return (d.getUTCDay() + 6) % 7; // 0=ponedeljek ... 6=nedelja
  }
  function mondayOfWeek(d) {
    return addDays(d, -weekdayMon0(d));
  }
  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  var DNI = ["PO", "TO", "SR", "ČE", "PE", "SO", "NE"];

  // ---------------------------------------------------------------------
  // 1) KALUP GENERATOR – 5-tedenska rotacija za izmenski (SMS/TZN) kader.
  //    Ista pravila, ki smo jih uporabili za generiranje oktobra 2026.
  // ---------------------------------------------------------------------
  var CYCLE = ["A", "B", "C", "D", "E"];
  // Zapis izmen je enak kot v uradni legendi (izmene.js): velika začetnica,
  // brez verzalk. Prej je kalup ustvarjal "dopoldan"/"NOČNA", uporabnik pa
  // je videl dve različni pisavi na istem zaslonu. Odjemalci (delovni-cas.js,
  // dashboard-core.js, admin.html) sprejemajo OBE pisavi, zato stari
  // razporedi v bazi in v preglednicah delujejo naprej nespremenjeno.
  var PAT = {
    A: ["KPU", "KPU", "Popoldne", "Popoldne", "Popoldne do 19", "Dnevna 12", "Dnevna 12"],
    B: ["Nočna", "Nočna", "Nočna", "KPU", "KPU", "", ""],
    C: ["LD", "LD", "LD", "LD", "LD", "", ""],
    D: ["Dopoldne", "Dopoldne", "Dopoldne", "Nočna", "Nočna od 19", "", ""],
    E: ["Popoldne", "Popoldne", "KPU", "Dopoldne", "Dopoldne", "Nočna 12", "Nočna 12"],
  };
  function withH(pat) {
    var out = {};
    Object.keys(pat).forEach(function (k) {
      out[k] = pat[k].map(function (x) {
        return x.replace("Popoldne do 19", "Popoldne do 19h").replace("Nočna od 19", "Nočna od 19h");
      });
    });
    return out;
  }
  var PAT_H = withH(PAT);

  // Pravilo počitka iz navodil projekta: po nočni izmeni (N12, N11, N10)
  // naslednji dan ni dovoljena dnevna/dopoldanska izmena (DF12, D12, DOP,
  // DO7, DO6, DO4). Popoldanske izmene pravilo ne prepoveduje.
  //
  // Kratice bere skupni šifrant (izmene.js), ne lasten seznam zapisov -
  // isti zapis izmene se v datotekah pojavlja v več oblikah ("NOČNA 12",
  // "nočna12", "Nočna 12") in vzporeden seznam bi se prej ali slej razšel.
  var NOCNE = { N12: true, N11: true, N10: true };
  var PREPOVEDANE_PO_NOCNI = { DF12: true, D12: true, DOP: true, DO7: true, DO6: true, DO4: true };

  function kraticaIzmene(sifra) {
    var I = root.Izmene;
    if (!I || typeof I.kratica !== "function") {
      throw new Error("Šifrant izmen (izmene.js) ni naložen - pravila počitka ni mogoče preveriti.");
    }
    return I.kratica(sifra);
  }

  function krsiPocitek(prejsnjaIzmena, naslednjaIzmena) {
    if (!prejsnjaIzmena || !naslednjaIzmena) return false;
    return !!NOCNE[kraticaIzmene(prejsnjaIzmena)]
        && !!PREPOVEDANE_PO_NOCNI[kraticaIzmene(naslednjaIzmena)];
  }

  function weekIndex(anchorMonday, d) {
    var wd = diffDays(mondayOfWeek(d), anchorMonday);
    return Math.floor(wd / 7);
  }

  function shiftFor(startLetter, d, anchorMonday, hsuffix, forcedLetter) {
    var table = hsuffix ? PAT_H : PAT;
    if (forcedLetter) return table[forcedLetter][weekdayMon0(d)];
    var wi = weekIndex(anchorMonday, d);
    var idx = (CYCLE.indexOf(startLetter) + (((wi % 5) + 5) % 5)) % 5;
    return table[CYCLE[idx]][weekdayMon0(d)];
  }

  /**
   * opts.anchorMondayISO – ponedeljek, za katerega poznamo črko kalupa vsakega zaposlenega
   * opts.startISO / opts.endISO – razpon dni, ki jih generiramo (vključno)
   * opts.staff – [{ ime, vloga, startLetter: 'A'..'E', hsuffix: bool,
   *                 dopustTedni: ["YYYY-MM-DD" (ponedeljek tistega tedna), ...],
   *                 omejitve: ["YYYY-MM-DD", ...] }]
   *   omejitve – dnevi "rumene" omejitve (iz Razpredelnice Želje): če oseba ta dan po kalupu dela,
   *   generator poišče nadomestilo med preostalim osebjem istega oddelka, ki je ta dan naravno prosto
   *   (prazna izmena po LASTNEM vzorcu – NE nekdo na LD/pomoči, da se ne krati zaslužen prost teden) in
   *   nima svoje omejitve/dopusta/pomoči isti dan. Nadomeščanja se pravično porazdelijo (kdor je
   *   nadomeščal manjkrat, ima prednost). Če nadomestila ni, izmena ostane zasedena in generator doda
   *   opozorilo – koordinator ročno popravi celico (glej "Kalup: poveži ročne popravke z objavo").
   */
  function generirajKalup(opts) {
    var anchorMonday = toDate(opts.anchorMondayISO);
    var start = toDate(opts.startISO);
    var end = toDate(opts.endISO);
    var dnevi = [];
    var opozorila = [];
    var substCount = {};
    // opts.prejsnjiDan – { ime: "izmena" } za DAN PRED startISO, prebran iz
    // objavljenega razporeda (ne iz kalupa!). Neobvezno: brez njega se
    // generator obnaša kot doslej.
    var prejsnjiDan = opts.prejsnjiDan || null;
    opts.staff.forEach(function (z) { substCount[z.ime] = 0; });

    for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      var iso = fromDate(d);
      var mondayISO = fromDate(mondayOfWeek(d));
      var izmene = {};

      opts.staff.forEach(function (z) {
        var forced = (z.dopustTedni || []).indexOf(mondayISO) !== -1 ? "C" : null;
        izmene[z.ime] = shiftFor(z.startLetter, d, anchorMonday, !!z.hsuffix, forced);
      });

      // Isto iskanje nadomestila uporabljata dva razloga: želja/omejitev
      // osebe in prenos iz prejšnjega meseca (počitek po nočni). Zato je
      // tu ena sama funkcija - drugače bi se pravilo o tem, kdo je "na
      // voljo", pri enem od obeh prej ali slej razšlo.
      function razbremeni(z, razlog) {
        var trenutna = izmene[z.ime];
        if (!trenutna) return; // že prost ta dan (vzorec/LD)

        var kandidati = opts.staff.filter(function (k) {
          if (k.ime === z.ime) return false;
          if (izmene[k.ime]) return false; // dela, na LD-tednu ali pomaga drugje – ni na voljo
          if ((k.omejitve || []).indexOf(iso) !== -1) return false;
          // Nadomestilo ne sme samo kršiti počitka po nočni iz prejšnjega
          // meseca - sicer bi težavo samo prestavili na drugo osebo.
          if (prejsnjiDan && krsiPocitek(prejsnjiDan[k.ime], trenutna)) return false;
          return true;
        }).sort(function (a, b) {
          if (substCount[a.ime] !== substCount[b.ime]) return substCount[a.ime] - substCount[b.ime];
          return a.ime.localeCompare(b.ime);
        });

        if (kandidati.length) {
          var nadomesti = kandidati[0];
          izmene[nadomesti.ime] = trenutna;
          izmene[z.ime] = "";
          substCount[nadomesti.ime] += 1;
        } else {
          opozorila.push({ datum: iso, sporocilo: z.ime + ": " + razlog(trenutna) });
        }
      }

      // Prenos iz prejšnjega meseca: kalup se sicer nadaljuje sam (rotacija
      // je vezana na stalno sidro), a prejšnji mesec je bil morda ROČNO
      // popravljen ali predelan z menjavami. Kdor je zadnji dan prejšnjega
      // meseca DEJANSKO delal nočno, ne sme prvega dne tega meseca na
      // dnevno/dopoldansko izmeno - tudi če kalup pravi drugače.
      if (prejsnjiDan && iso === opts.startISO) {
        opts.staff.forEach(function (z) {
          if (!krsiPocitek(prejsnjiDan[z.ime], izmene[z.ime])) return;
          var prejsnja = prejsnjiDan[z.ime];
          razbremeni(z, function (trenutna) {
            return "prejšnji mesec je končal z izmeno " + prejsnja + ", zato ta dan ne sme na "
              + trenutna + " (počitek po nočni), nadomestila pa na oddelku ni – preveri ročno.";
          });
        });
      }

      opts.staff.forEach(function (z) {
        if ((z.omejitve || []).indexOf(iso) === -1) return; // brez omejitve ta dan
        razbremeni(z, function (trenutna) {
          return "omejitev na ta dan, a nihče na oddelku ni na voljo za nadomestilo – izmena ("
            + trenutna + ") ostaja zasedena, preveri ročno.";
        });
      });

      dnevi.push({ datum: iso, dan: DNI[weekdayMon0(d)], izmene: izmene });
    }
    return { dnevi: dnevi, opozorila: opozorila };
  }

  // ---------------------------------------------------------------------
  // 2) GENERATOR DEŽURSTEV – pravičen razpored 24-urnih dežurstev za
  //    dežurni kader (DMS/DZN), z upoštevanjem:
  //      - minimalnega razmika med dvema dežurstvoma iste osebe
  //      - prostega dne takoj po dežurstvu (odgovor na ugotovitev, da je
  //        65 % dežurstev doslej sledilo delo brez počitka)
  //      - kumulativne pravičnosti: prednost ima oseba z najmanj dežurstvi
  // ---------------------------------------------------------------------
  /**
   * opts.startISO / opts.endISO – razpon dni, za katere razporejamo (1 dežurstvo/dan)
   * opts.minRazmikDni – najmanjši razmik med dvema dežurstvoma iste osebe (privzeto 3)
   * opts.prostDanPoDezurstvu – ali dan takoj po dežurstvu velja kot blokiran za redno delo (privzeto true)
   * opts.maxVikendMesecno – ali sme imeti oseba največ 1 soboto/nedeljo na koledarski mesec (privzeto true;
   *   iz pravila analize "Dežurstva 2026": vsak ima največ en vikend dan, sobota ALI nedelja, nikoli oboje –
   *   ta vikend dan se šteje kot eno od njenih mesečnih dežurstev, ne dodatno zraven)
   * opts.staff – [{ ime, obstojeceStevilo, zadnjeDezurstvo: "YYYY-MM-DD"|null, odsotnosti: ["YYYY-MM-DD", ...],
   *                 prostDanVTednu: "PO".."NE"|null, dopust: ["YYYY-MM-DD", ...], omejitve: ["YYYY-MM-DD", ...],
   *                 minMesecno: število|null, maxMesecno: število|null, samoMedTednom: bool }]
   *   prostDanVTednu – stalna omejitev osebe, da nikoli ne dežura na ta dan v tednu
   *   (npr. Matej Bojić: "PO", iz analize "Dežurstva 2026")
   *   samoMedTednom – trdo pravilo (iz "Zaposleni - Oddelki", Predloga razporeda vodje NZV): oseba nikoli
   *   ne dežura ob sobotah/nedeljah, ne glede na maxVikendMesecno (npr. Salkić Maruša, Trpin Saša: "1x
   *   dežurstvo na mesec med tednom")
   *   dopust – dnevi letnega dopusta ("rdeče" v preglednici omejitev): blokirani so tudi ti dnevi
   *   SAMI PO SEBI, poleg tega se samodejno blokira dan pred ZAČETKOM vsakega strnjenega dopustnega
   *   bloka (in če se blok začne v ponedeljek, tudi petek pred njim – sobota vmes ostane prosta),
   *   po pravilu iz analize "Dežurstva 2026"
   *   omejitve – dnevi "rumene" omejitve: blokirani samo ti dnevi, brez pravila o dnevu prej
   *   maxMesecno – trda zgornja meja števila dežurstev osebe na koledarski mesec ZNOTRAJ tega
   *   generiranja (npr. Salkić Maruša in Trpin Saša: 1; ostali privzeto brez trde meje, a glej minMesecno).
   *   Kandidat, ki bi to mejo presegel, se ta dan ne razporeja.
   *   minMesecno – mehak (informativen) cilj: če oseba ob koncu meseca ni dosegla tega števila, se doda
   *   opozorilo (generiranje se zaradi tega NE ustavi, ker bi lahko bilo neizvedljivo).
   */
  // Katera pravila krši, če na dani dan dežura dana oseba.
  //
  // EN SAM vir za dvoje: generator z njim pojasni dan, ki ga ne more
  // razrešiti (in izbere najmanj slabega kandidata), urejanje razporeda v
  // Admin -> Dežurstva pa z njim sproti pove, kaj se z ročnim popravkom
  // pokvari. Če bi bili dve kopiji, bi generator in zaslon trdila vsak
  // svoje o istem dnevu.
  //
  // Vrne seznam kršitev, urejen po teži - prva je najhujša.
  // "razpored" je CELOTNA dodelitev meseca ([{datum, zaposleni}, ...]),
  // ker sta razmik in vikendna kvota odvisna od preostalih dni.
  var KRSITVE_OPIS = {
    odsoten: "ta dan je odsoten (dopust ali omejitev)",
    prostDan: "ta dan v tednu ima po dogovoru prost",
    vikend: "dežura samo med tednom",
    razmik: "premalo dni od prejšnjega dežurstva",
    vikendKvota: "presega dovoljeno število vikendov v mesecu",
    maxMesecno: "presega dovoljeno število dežurstev v mesecu",
  };

  // Teža kršitve pri izbiri "najmanj slabega" kandidata za dan, ki ga ni
  // mogoče razrešiti brez kršitve. Nižje = manj hudo. Osebe na dopustu se
  // dotaknemo šele, ko res ni nikogar drugega; prekratek razmik je najmanj
  // hud, ker je stvar dogovora in ne odsotnosti.
  var KRSITVE_TEZA = { odsoten: 100, vikend: 50, prostDan: 40, maxMesecno: 30, vikendKvota: 20, razmik: 10 };

  function preveriDezurstva(opts) {
    var minRazmik = opts.minRazmikDni != null ? opts.minRazmikDni : 3;
    var maxVikendMesecno = opts.maxVikendMesecno !== false;
    var poImenu = {};
    (opts.staff || []).forEach(function (z) {
      var dopust = (z.dopust || []).slice().sort();
      var blokirano = {};
      (z.odsotnosti || []).forEach(function (iso) { blokirano[iso] = true; });
      (z.omejitve || []).forEach(function (iso) { blokirano[iso] = true; });
      dopust.forEach(function (iso) { blokirano[iso] = true; });
      dopust.forEach(function (iso) {
        var prejIso = fromDate(addDays(toDate(iso), -1));
        if (dopust.indexOf(prejIso) !== -1) return;
        blokirano[prejIso] = true;
        if (weekdayMon0(toDate(iso)) === 0) blokirano[fromDate(addDays(toDate(iso), -3))] = true;
      });
      poImenu[z.ime] = { z: z, blokirano: blokirano };
    });

    // Dnevi posamezne osebe po vrsti - za razmik in vikendno kvoto.
    var dneviOsebe = {};
    (opts.razpored || []).forEach(function (r) {
      if (!r.zaposleni) return;
      (dneviOsebe[r.zaposleni] = dneviOsebe[r.zaposleni] || []).push(r.datum);
    });
    Object.keys(dneviOsebe).forEach(function (ime) { dneviOsebe[ime].sort(); });

    return (opts.razpored || []).map(function (r) {
      var krsitve = [];
      var podatki = poImenu[r.zaposleni];
      if (r.zaposleni && podatki) {
        var z = podatki.z;
        var d = toDate(r.datum);
        var wd = weekdayMon0(d);
        var jeVikend = wd === 5 || wd === 6;
        var mesecKey = r.datum.slice(0, 7);
        if (podatki.blokirano[r.datum]) krsitve.push("odsoten");
        if (z.prostDanVTednu && z.prostDanVTednu === DNI[wd]) krsitve.push("prostDan");
        if (z.samoMedTednom && jeVikend) krsitve.push("vikend");
        // Razmik do NAJBLIŽJEGA prejšnjega dežurstva iste osebe - tudi
        // takega iz zgodovine (zadnjeDezurstvo), sicer bi prvi dnevi meseca
        // izpadli kot brezhibni.
        var moji = dneviOsebe[r.zaposleni] || [];
        var prej = null;
        moji.forEach(function (iso) { if (iso < r.datum && (!prej || iso > prej)) prej = iso; });
        if (z.zadnjeDezurstvo && z.zadnjeDezurstvo < r.datum && (!prej || z.zadnjeDezurstvo > prej)) {
          prej = z.zadnjeDezurstvo;
        }
        if (prej && diffDays(d, toDate(prej)) < minRazmik) krsitve.push("razmik");
        if (jeVikend && maxVikendMesecno) {
          var vikendovPrej = moji.filter(function (iso) {
            if (iso >= r.datum || iso.slice(0, 7) !== mesecKey) return false;
            var w = weekdayMon0(toDate(iso));
            return w === 5 || w === 6;
          }).length;
          if (vikendovPrej >= 1) krsitve.push("vikendKvota");
        }
        if (z.maxMesecno != null) {
          var vMesecuPrej = moji.filter(function (iso) {
            return iso <= r.datum && iso.slice(0, 7) === mesecKey;
          }).length;
          if (vMesecuPrej > z.maxMesecno) krsitve.push("maxMesecno");
        }
      }
      return { datum: r.datum, zaposleni: r.zaposleni || null, krsitve: krsitve };
    });
  }

  function generirajDezurstva(opts) {
    var start = toDate(opts.startISO);
    var end = toDate(opts.endISO);
    var minRazmik = opts.minRazmikDni != null ? opts.minRazmikDni : 3;
    var prostDanPo = opts.prostDanPoDezurstvu !== false;
    var maxVikendMesecno = opts.maxVikendMesecno !== false;
    var zaklenjeni = opts.zaklenjeni || {};   // datum -> ime, ki se ne sme premakniti

    var stanje = {};
    opts.staff.forEach(function (z) {
      var dopust = (z.dopust || []).slice().sort();
      var blokirano = {};
      (z.odsotnosti || []).forEach(function (iso) { blokirano[iso] = true; });
      (z.omejitve || []).forEach(function (iso) { blokirano[iso] = true; });
      dopust.forEach(function (iso) { blokirano[iso] = true; });
      dopust.forEach(function (iso) {
        var prejIso = fromDate(addDays(toDate(iso), -1));
        if (dopust.indexOf(prejIso) !== -1) return; // iso ni začetek bloka
        blokirano[prejIso] = true;
        if (weekdayMon0(toDate(iso)) === 0) { // blok se začne v ponedeljek -> tudi petek prej
          blokirano[fromDate(addDays(toDate(iso), -3))] = true;
        }
      });
      stanje[z.ime] = {
        stevilo: z.obstojeceStevilo || 0,
        zadnje: z.zadnjeDezurstvo ? toDate(z.zadnjeDezurstvo) : null,
        odsotnosti: Object.keys(blokirano),
        vikendMesec: {}, // "YYYY-MM" -> število sobot/nedelj v tem generiranju
        mesecStevilo: {}, // "YYYY-MM" -> število dežurstev v tem generiranju (za minMesecno/maxMesecno)
      };
    });

    var razpored = [];
    var opozorila = [];
    var prostiDnevi = {}; // ime -> [ISO, ...] dnevi, ko naj se osebe NE razporeja na redno izmeno

    for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      var iso = fromDate(d);
      var wd = weekdayMon0(d);
      var isVikend = wd === 5 || wd === 6; // SO ali NE
      var mesecKey = iso.slice(0, 7);
      // Že objavljeni dnevi se NE premešajo. Brez tega je ponovno
      // generiranje sredi meseca prerazporedilo tudi tisti del, ki je bil
      // že potrjen in sporočen ljudem.
      if (zaklenjeni[iso] && stanje[zaklenjeni[iso]]) {
        var zIme = zaklenjeni[iso];
        stanje[zIme].stevilo += 1;
        stanje[zIme].zadnje = new Date(d.getTime());
        stanje[zIme].mesecStevilo[mesecKey] = (stanje[zIme].mesecStevilo[mesecKey] || 0) + 1;
        if (isVikend) stanje[zIme].vikendMesec[mesecKey] = (stanje[zIme].vikendMesec[mesecKey] || 0) + 1;
        razpored.push({ datum: iso, dan: DNI[weekdayMon0(d)], zaposleni: zIme, zaklenjeno: true });
        if (prostDanPo) {
          if (!prostiDnevi[zIme]) prostiDnevi[zIme] = [];
          prostiDnevi[zIme].push(fromDate(addDays(d, 1)));
        }
        continue;
      }
      var kandidati = opts.staff.filter(function (z) {
        var s = stanje[z.ime];
        if (s.odsotnosti.indexOf(iso) !== -1) return false;
        if (s.zadnje && diffDays(d, s.zadnje) < minRazmik) return false;
        if (z.prostDanVTednu && z.prostDanVTednu === DNI[wd]) return false;
        if (z.samoMedTednom && isVikend) return false;
        if (isVikend && maxVikendMesecno && (s.vikendMesec[mesecKey] || 0) >= 1) return false;
        if (z.maxMesecno != null && (s.mesecStevilo[mesecKey] || 0) >= z.maxMesecno) return false;
        return true;
      });

      if (kandidati.length === 0) {
        // Prej je tak dan ostal PRAZEN in se ob objavi tiho izgubil.
        // Uporabnikova odločitev (avgust 2026): predlagaj najbližjega in
        // označi, katero pravilo krši - dan tako nikoli ne ostane prazen,
        // človek pa vidi, s čim se strinja oz. kaj naj zamenja.
        var oceneVsi = opts.staff.map(function (z) {
          var s = stanje[z.ime];
          var k = [];
          if (s.odsotnosti.indexOf(iso) !== -1) k.push("odsoten");
          if (z.prostDanVTednu && z.prostDanVTednu === DNI[wd]) k.push("prostDan");
          if (z.samoMedTednom && isVikend) k.push("vikend");
          if (s.zadnje && diffDays(d, s.zadnje) < minRazmik) k.push("razmik");
          if (isVikend && maxVikendMesecno && (s.vikendMesec[mesecKey] || 0) >= 1) k.push("vikendKvota");
          if (z.maxMesecno != null && (s.mesecStevilo[mesecKey] || 0) >= z.maxMesecno) k.push("maxMesecno");
          var teza = k.reduce(function (v, ime2) { return v + (KRSITVE_TEZA[ime2] || 1); }, 0);
          return { z: z, krsitve: k, teza: teza, stevilo: s.stevilo };
        }).sort(function (a, b) {
          if (a.teza !== b.teza) return a.teza - b.teza;
          if (a.stevilo !== b.stevilo) return a.stevilo - b.stevilo;
          return a.z.ime.localeCompare(b.z.ime);
        });
        if (!oceneVsi.length) {
          razpored.push({ datum: iso, dan: DNI[weekdayMon0(d)], zaposleni: null });
          continue;
        }
        var sila = oceneVsi[0];
        opozorila.push({ datum: iso, sporocilo: "Nihče ne izpolnjuje vseh pogojev. Predlagan je "
          + sila.z.ime + " – krši: "
          + sila.krsitve.map(function (k) { return KRSITVE_OPIS[k] || k; }).join(", ")
          + ". Preveri in po potrebi zamenjaj." });
        stanje[sila.z.ime].stevilo += 1;
        stanje[sila.z.ime].zadnje = new Date(d.getTime());
        stanje[sila.z.ime].mesecStevilo[mesecKey] = (stanje[sila.z.ime].mesecStevilo[mesecKey] || 0) + 1;
        if (isVikend) stanje[sila.z.ime].vikendMesec[mesecKey] = (stanje[sila.z.ime].vikendMesec[mesecKey] || 0) + 1;
        razpored.push({ datum: iso, dan: DNI[weekdayMon0(d)], zaposleni: sila.z.ime, sila: true });
        continue;
      }

      kandidati = kandidati.slice().sort(function (a, b) {
        var sa = stanje[a.ime], sb = stanje[b.ime];
        // Kdor še ni dosegel svojega mesečnega minimuma (minMesecno), ima
        // prednost pred vsemi, ki so ga že dosegli – ne glede na skupno
        // (celotno) število dežurstev doslej. To zagotavlja, da mesečni
        // minimum dejansko velja za vsakogar, ne le kot mehko opozorilo.
        var moA = a.minMesecno != null && (sa.mesecStevilo[mesecKey] || 0) < a.minMesecno;
        var moB = b.minMesecno != null && (sb.mesecStevilo[mesecKey] || 0) < b.minMesecno;
        if (moA !== moB) return moA ? -1 : 1;
        if (sa.stevilo !== sb.stevilo) return sa.stevilo - sb.stevilo;
        var ga = sa.zadnje ? diffDays(d, sa.zadnje) : Infinity;
        var gb = sb.zadnje ? diffDays(d, sb.zadnje) : Infinity;
        if (ga !== gb) return gb - ga; // daljši počitek od zadnjega dežurstva ima prednost
        return a.ime.localeCompare(b.ime); // stabilen vrstni red, če je popolnoma enako
      });

      var izbran = kandidati[0];
      stanje[izbran.ime].stevilo += 1;
      stanje[izbran.ime].zadnje = new Date(d.getTime());
      stanje[izbran.ime].mesecStevilo[mesecKey] = (stanje[izbran.ime].mesecStevilo[mesecKey] || 0) + 1;
      if (isVikend) {
        stanje[izbran.ime].vikendMesec[mesecKey] = (stanje[izbran.ime].vikendMesec[mesecKey] || 0) + 1;
      }
      razpored.push({ datum: iso, dan: DNI[weekdayMon0(d)], zaposleni: izbran.ime });

      if (prostDanPo) {
        var prostIso = fromDate(addDays(d, 1));
        if (!prostiDnevi[izbran.ime]) prostiDnevi[izbran.ime] = [];
        prostiDnevi[izbran.ime].push(prostIso);
      }
    }

    var mesecKljuci = [];
    for (var dm = start; dm.getTime() <= end.getTime(); dm = addDays(dm, 1)) {
      var mk = fromDate(dm).slice(0, 7);
      if (mesecKljuci.indexOf(mk) === -1) mesecKljuci.push(mk);
    }
    opts.staff.forEach(function (z) {
      if (z.minMesecno == null) return;
      mesecKljuci.forEach(function (mk) {
        var stevMesec = stanje[z.ime].mesecStevilo[mk] || 0;
        if (stevMesec < z.minMesecno) {
          opozorila.push({
            datum: mk,
            sporocilo: z.ime + " ima v mesecu " + mk + " samo " + stevMesec + " dežurstev (cilj: vsaj " + z.minMesecno + ") – zaradi omejitev/dopusta morda ni bilo mogoče doseči cilja."
          });
        }
      });
    });

    var stanjeOb = opts.staff
      .map(function (z) {
        var s = stanje[z.ime];
        return {
          ime: z.ime,
          steviloPrej: z.obstojeceStevilo || 0,
          steviloZdaj: s.stevilo,
          novih: s.stevilo - (z.obstojeceStevilo || 0),
        };
      })
      .sort(function (a, b) { return b.novih - a.novih; });

    // Kršitve se pripnejo prek preveriDezurstva - iste funkcije, ki jo
    // uporablja ročno urejanje na zaslonu. Tako generator in zaslon o istem
    // dnevu nikoli ne trdita vsak svoje.
    var preverba = {};
    preveriDezurstva({
      razpored: razpored, staff: opts.staff,
      minRazmikDni: minRazmik, maxVikendMesecno: maxVikendMesecno,
    }).forEach(function (r) { preverba[r.datum] = r.krsitve; });
    razpored.forEach(function (r) { r.krsitve = preverba[r.datum] || []; });

    return { razpored: razpored, opozorila: opozorila, stanje: stanjeOb, prostiDnevi: prostiDnevi };
  }

  // -------------------------------------------------------------------
  // "Predlagaj mesec" za razpored oddelka: kdo naj zapolni vrzel.
  //
  // Vrzel je izmena, ki tisti dan ne dosega minimuma (Generator -> Oddelki
  // -> "Pokritost po dnevih"). Doslej je aplikacija vrzel samo POKAZALA,
  // zapolniti pa jo je moral koordinator sam, dan za dnem. Tu se za vsako
  // vrzel predlaga oseba - predlog in nič več: v razpored se vpiše šele,
  // ko ga človek potrdi (enako kot pri mreži NZV).
  //
  // Kdo pride v poštev: kdor tisti dan NE dela (prazna celica po lastnem
  // vzorcu ali KPU). Dopust (LD) in "POMOČ DRUGJE" NISTA kandidata -
  // človeka na dopustu ni dovoljeno razporediti, tisti, ki pomaga drugje,
  // pa tisti dan ni na voljo temu oddelku.
  //
  // Vrstni red: najprej prosti dan po vzorcu, šele nato KPU (KPU je že
  // dogovorjeno koriščenje ur, zato je poseg vanj večji); nato tisti z
  // najmanj dosedanjimi predlogi ta mesec (obremenitev se ne nabere na
  // eni osebi), nazadnje po abecedi, da je izid ponovljiv.
  //
  // Delovnopravna pravila: predlog, ki bi ustvaril NOVO kritično kršitev
  // (prekratek počitek, preveč zaporednih nočnih, teden brez prostega
  // dne), se preskoči. Če drugega ni, se najmanj slab vseeno predlaga, a
  // označi z "opozorilo" - vrzel v bolnišnici ni brezplačna, zato je
  // odločitev človekova, ne tiho izpuščena.
  //
  // opts:
  //   vrzeli        [{ datum, bucket, primanjkljaj }]
  //   staff         [ime, ...]
  //   sifraZa       (ime, datum) -> trenutna šifra izmene
  //   vBucket       (sifra) -> "DOPOLDNE"|"POPOLDNE"|"PONOCI"|null
  //   sifraZaBucket (datum, bucket) -> šifra, ki naj se predlaga
  //   dnevi         [datum, ...] cel mesec (za preverjanje pravil)
  //   preveriPravila(vnosi) -> [{ oseba, datum, resnost }]
  function predlagajZapolnitevOddelka(opts) {
    var vrzeli = opts.vrzeli || [], staff = opts.staff || [], dnevi = opts.dnevi || [];
    var sifraZa = opts.sifraZa, vBucket = opts.vBucket, sifraZaBucket = opts.sifraZaBucket;
    var preveri = opts.preveriPravila || function () { return []; };

    var PROSTO = "";      // prazna celica: prost dan po lastnem vzorcu
    var KPU = "KPU";
    function stanjeOsebe(ime, datum) {
      var s = String(sifraZa(ime, datum) || "").trim();
      if (vBucket(s)) return null;                       // tisti dan že dela
      var t = s.toUpperCase();
      if (!t) return PROSTO;
      if (t.indexOf("KPU") === 0) return KPU;
      return null;                                       // LD, POMOČ DRUGJE ...
    }

    // Že sprejeti predlogi se štejejo naprej: druga vrzel istega dne ne sme
    // dobiti iste osebe, tretja pa ne tistega, ki je pravkar dobil prvo.
    var dodeljeno = {};                                  // "ime|datum" -> šifra
    var stPredlogov = {};
    staff.forEach(function (ime) { stPredlogov[ime] = 0; });
    function trenutna(ime, datum) {
      var k = ime + "|" + datum;
      return dodeljeno[k] != null ? dodeljeno[k] : sifraZa(ime, datum);
    }
    // Kritične kršitve te osebe, če bi dobila to šifro na ta dan.
    function kriticnihPo(ime, datum, sifra) {
      var vnosi = dnevi.map(function (d) {
        return { oseba: ime, datum: d, sifra: d === datum ? sifra : trenutna(ime, d) };
      });
      return preveri(vnosi).filter(function (k) { return k.resnost === "kriticno"; }).length;
    }

    var predlogi = [];
    vrzeli.forEach(function (vrzel) {
      var koliko = Math.max(1, Number(vrzel.primanjkljaj) || 1);
      var sifra = sifraZaBucket(vrzel.datum, vrzel.bucket);
      if (!sifra) return;
      for (var n = 0; n < koliko; n++) {
        var kandidati = [];
        staff.forEach(function (ime) {
          if (dodeljeno[ime + "|" + vrzel.datum] != null) return;   // ta dan že dobil vrzel
          var stanje = stanjeOsebe(ime, vrzel.datum);
          if (stanje === null) return;
          kandidati.push({ ime: ime, izKpu: stanje === KPU });
        });
        if (!kandidati.length) return;

        kandidati.forEach(function (k) {
          k.prej = kriticnihPo(k.ime, vrzel.datum, trenutna(k.ime, vrzel.datum));
          k.potem = kriticnihPo(k.ime, vrzel.datum, sifra);
          k.noveKrsitve = Math.max(0, k.potem - k.prej);
        });
        kandidati.sort(function (a, b) {
          return a.noveKrsitve - b.noveKrsitve
            || (a.izKpu ? 1 : 0) - (b.izKpu ? 1 : 0)
            || (stPredlogov[a.ime] || 0) - (stPredlogov[b.ime] || 0)
            || (a.ime < b.ime ? -1 : a.ime > b.ime ? 1 : 0);
        });
        var izbrani = kandidati[0];
        dodeljeno[izbrani.ime + "|" + vrzel.datum] = sifra;
        stPredlogov[izbrani.ime] = (stPredlogov[izbrani.ime] || 0) + 1;
        predlogi.push({
          datum: vrzel.datum, bucket: vrzel.bucket, oseba: izbrani.ime, sifra: sifra,
          izKpu: izbrani.izKpu,
          opozorilo: izbrani.noveKrsitve > 0
            ? "Ta predlog krši delovnopravno pravilo (npr. počitek med izmenama) – drugega prostega ni bilo."
            : (izbrani.izKpu ? "Oseba je ta dan na KPU (koriščenje prostih ur)." : null),
        });
      }
    });
    return predlogi;
  }

  var Generator = {
    generirajKalup: generirajKalup,
    krsiPocitek: krsiPocitek,
    predlagajZapolnitevOddelka: predlagajZapolnitevOddelka,
    generirajDezurstva: generirajDezurstva,
    preveriDezurstva: preveriDezurstva,
    KRSITVE_OPIS: KRSITVE_OPIS,
    util: { toDate: toDate, fromDate: fromDate, addDays: addDays, mondayOfWeek: mondayOfWeek, weekdayMon0: weekdayMon0, diffDays: diffDays },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Generator;
  } else {
    root.Generator = Generator;
  }
})(typeof window !== "undefined" ? window : this);
