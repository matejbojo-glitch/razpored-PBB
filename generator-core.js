/* Razpored PBB — generator-core.js
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
  // 1) KALUP GENERATOR — 5-tedenska rotacija za izmenski (SMS/TZN) kader.
  //    Ista pravila, ki smo jih uporabili za generiranje oktobra 2026.
  // ---------------------------------------------------------------------
  var CYCLE = ["A", "B", "C", "D", "E"];
  var PAT = {
    A: ["KPU", "KPU", "popoldan", "popoldan", "popoldan do 19", "DNEVNA12", "DNEVNA12"],
    B: ["NOČNA", "NOČNA", "NOČNA", "KPU", "KPU", "", ""],
    C: ["LD", "LD", "LD", "LD", "LD", "", ""],
    D: ["dopoldan", "dopoldan", "dopoldan", "NOČNA", "NOČNA od 19", "", ""],
    E: ["popoldan", "popoldan", "KPU", "dopoldan", "dopoldan", "NOČNA12", "NOČNA12"],
  };
  function withH(pat) {
    var out = {};
    Object.keys(pat).forEach(function (k) {
      out[k] = pat[k].map(function (x) {
        return x.replace("popoldan do 19", "popoldan do 19h").replace("NOČNA od 19", "NOČNA od 19h");
      });
    });
    return out;
  }
  var PAT_H = withH(PAT);

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
   * opts.anchorMondayISO — ponedeljek, za katerega poznamo črko kalupa vsakega zaposlenega
   * opts.startISO / opts.endISO — razpon dni, ki jih generiramo (vključno)
   * opts.staff — [{ ime, vloga, startLetter: 'A'..'E', hsuffix: bool, dopustTedni: ["YYYY-MM-DD" (ponedeljek tistega tedna), ...] }]
   */
  function generirajKalup(opts) {
    var anchorMonday = toDate(opts.anchorMondayISO);
    var start = toDate(opts.startISO);
    var end = toDate(opts.endISO);
    var dnevi = [];
    for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      var izmene = {};
      opts.staff.forEach(function (z) {
        var mondayISO = fromDate(mondayOfWeek(d));
        var forced = (z.dopustTedni || []).indexOf(mondayISO) !== -1 ? "C" : null;
        izmene[z.ime] = shiftFor(z.startLetter, d, anchorMonday, !!z.hsuffix, forced);
      });
      dnevi.push({ datum: fromDate(d), dan: DNI[weekdayMon0(d)], izmene: izmene });
    }
    return { dnevi: dnevi };
  }

  // ---------------------------------------------------------------------
  // 2) GENERATOR DEŽURSTEV — pravičen razpored 24-urnih dežurstev za
  //    dežurni kader (DMS/DZN), z upoštevanjem:
  //      - minimalnega razmika med dvema dežurstvoma iste osebe
  //      - prostega dne takoj po dežurstvu (odgovor na ugotovitev, da je
  //        65 % dežurstev doslej sledilo delo brez počitka)
  //      - kumulativne pravičnosti: prednost ima oseba z najmanj dežurstvi
  // ---------------------------------------------------------------------
  /**
   * opts.startISO / opts.endISO — razpon dni, za katere razporejamo (1 dežurstvo/dan)
   * opts.minRazmikDni — najmanjši razmik med dvema dežurstvoma iste osebe (privzeto 3)
   * opts.prostDanPoDezurstvu — ali dan takoj po dežurstvu velja kot blokiran za redno delo (privzeto true)
   * opts.maxVikendMesecno — ali sme imeti oseba največ 1 soboto/nedeljo na koledarski mesec (privzeto true;
   *   iz pravila analize "Dežurstva 2026": vsak ima največ en vikend dan, sobota ALI nedelja, nikoli oboje)
   * opts.staff — [{ ime, obstojeceStevilo, zadnjeDezurstvo: "YYYY-MM-DD"|null, odsotnosti: ["YYYY-MM-DD", ...],
   *                 prostDanVTednu: "PO".."NE"|null, dopust: ["YYYY-MM-DD", ...], omejitve: ["YYYY-MM-DD", ...] }]
   *   prostDanVTednu — stalna omejitev osebe, da nikoli ne dežura na ta dan v tednu
   *   (npr. Matej Bojić: "PO", iz analize "Dežurstva 2026")
   *   dopust — dnevi letnega dopusta ("rdeče" v preglednici omejitev): blokirani so tudi ti dnevi
   *   SAMI PO SEBI, poleg tega se samodejno blokira dan pred ZAČETKOM vsakega strnjenega dopustnega
   *   bloka (in če se blok začne v ponedeljek, tudi petek pred njim — sobota vmes ostane prosta),
   *   po pravilu iz analize "Dežurstva 2026"
   *   omejitve — dnevi "rumene" omejitve: blokirani samo ti dnevi, brez pravila o dnevu prej
   */
  function generirajDezurstva(opts) {
    var start = toDate(opts.startISO);
    var end = toDate(opts.endISO);
    var minRazmik = opts.minRazmikDni != null ? opts.minRazmikDni : 3;
    var prostDanPo = opts.prostDanPoDezurstvu !== false;
    var maxVikendMesecno = opts.maxVikendMesecno !== false;

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
      var kandidati = opts.staff.filter(function (z) {
        var s = stanje[z.ime];
        if (s.odsotnosti.indexOf(iso) !== -1) return false;
        if (s.zadnje && diffDays(d, s.zadnje) < minRazmik) return false;
        if (z.prostDanVTednu && z.prostDanVTednu === DNI[wd]) return false;
        if (isVikend && maxVikendMesecno && (s.vikendMesec[mesecKey] || 0) >= 1) return false;
        return true;
      });

      if (kandidati.length === 0) {
        opozorila.push({ datum: iso, sporocilo: "Noben zaposleni ne izpolnjuje pogojev (razmik, odsotnost, prost dan ali vikend kvota) — potreben ročni vnos." });
        razpored.push({ datum: iso, dan: DNI[weekdayMon0(d)], zaposleni: null });
        continue;
      }

      kandidati = kandidati.slice().sort(function (a, b) {
        var sa = stanje[a.ime], sb = stanje[b.ime];
        if (sa.stevilo !== sb.stevilo) return sa.stevilo - sb.stevilo;
        var ga = sa.zadnje ? diffDays(d, sa.zadnje) : Infinity;
        var gb = sb.zadnje ? diffDays(d, sb.zadnje) : Infinity;
        if (ga !== gb) return gb - ga; // daljši počitek od zadnjega dežurstva ima prednost
        return a.ime.localeCompare(b.ime); // stabilen vrstni red, če je popolnoma enako
      });

      var izbran = kandidati[0];
      stanje[izbran.ime].stevilo += 1;
      stanje[izbran.ime].zadnje = new Date(d.getTime());
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

    return { razpored: razpored, opozorila: opozorila, stanje: stanjeOb, prostiDnevi: prostiDnevi };
  }

  var Generator = {
    generirajKalup: generirajKalup,
    generirajDezurstva: generirajDezurstva,
    util: { toDate: toDate, fromDate: fromDate, addDays: addDays, mondayOfWeek: mondayOfWeek, weekdayMon0: weekdayMon0, diffDays: diffDays },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Generator;
  } else {
    root.Generator = Generator;
  }
})(typeof window !== "undefined" ? window : this);
