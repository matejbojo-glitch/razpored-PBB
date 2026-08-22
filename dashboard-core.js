/* Razpored PBB – dashboard-core.js
 * Logika za nadzorno ploščo pravičnosti: iz izvozov generatorja (modul 2)
 * izračuna prispevek posameznega meseca in ga zlije z obstoječim stanjem.
 * Enako kot generator-core.js: deluje v brskalniku in v Node (za teste).
 */
(function (root) {
  "use strict";

  // Slovenski dela prosti dnevi 2026 (ZDPD) – stalen seznam, uporaben za
  // kateri koli mesec, ne le za obdobje, ki smo ga doslej analizirali.
  var PRAZ_2026 = [
    "2026-01-01", "2026-01-02", "2026-02-08", "2026-04-05", "2026-04-06",
    "2026-04-27", "2026-05-01", "2026-05-02", "2026-06-25", "2026-08-15",
    "2026-10-31", "2026-11-01", "2026-12-25", "2026-12-26",
  ];

  function weekdayMon0(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return (d.getUTCDay() + 6) % 7; // 0=PO..6=NE
  }

  // Natančnejša razvrstitev kot v koledarskem prikazu – tu moramo ločiti
  // nočno 12-urno izmeno od dnevne 12-urne, ker se za pravičnost štejeta
  // različno (nočna šteje med nočne ure, dnevna ne).
  function classifyForStats(sifra) {
    // Brez presledkov: iz Sheets pride tudi "DNEVNA 12F" ali "NOČNA 12".
    var t = (sifra || "").toLowerCase().replace(/\s+/g, "");
    if (t.indexOf("nočna") !== -1) return "noc"; // zajame NOČNA, NOČNA12, NOČNA od 19 ...
    if (t.indexOf("dnevna12") !== -1) return "dnevna12"; // tudi DNEVNA12F (flexi 07-19)
    // Obe pisavi: stari zapisi v bazi ("dopoldan") in novi iz kalupa
    // ("Dopoldne").
    if (t.indexOf("dopoldan") !== -1 || t.indexOf("dopoldne") !== -1) return "dop";
    if (t.indexOf("popoldan") !== -1 || t.indexOf("popoldne") !== -1) return "pop";
    return "off"; // LD, KPU, prazno
  }

  /**
   * Iz izvoza generatorja kalupa (ista oblika kot data-oktober-2026.json,
   * z enim ali več oddelki) izračuna prispevek meseca za vsakega zaposlenega.
   */
  function deltaFromKalupExport(exportJson) {
    var out = {};
    (exportJson.oddelki || []).forEach(function (oddelek) {
      (oddelek.dnevi || []).forEach(function (dn) {
        var isWeekend = weekdayMon0(dn.datum) >= 5;
        var isPraznik = PRAZ_2026.indexOf(dn.datum) !== -1;
        Object.keys(dn.izmene || {}).forEach(function (ime) {
          if (!out[ime]) out[ime] = { delo: 0, nocne: 0, nedpraz: 0, vikend: 0, ld: 0, kpu: 0, enota: oddelek.koda };
          var sifra = dn.izmene[ime];
          var cls = classifyForStats(sifra);
          if (cls === "off") {
            if ((sifra || "").toLowerCase().indexOf("ld") === 0) out[ime].ld += 1;
            else if ((sifra || "").toLowerCase().indexOf("kpu") === 0) out[ime].kpu += 1;
            return;
          }
          out[ime].delo += 1;
          if (cls === "noc") out[ime].nocne += 1;
          if (isWeekend) out[ime].vikend += 1;
          if (weekdayMon0(dn.datum) === 6 || isPraznik) out[ime].nedpraz += 1;
        });
      });
    });
    return out;
  }

  /** Zlije prispevek meseca (iz deltaFromKalupExport) v obstoječo osnovo SMS/TZN. */
  function mergeSmsBaseline(baseline, delta) {
    var byIme = {};
    baseline.forEach(function (z) { byIme[z.ime] = Object.assign({}, z); });
    Object.keys(delta).forEach(function (ime) {
      var d = delta[ime];
      if (!byIme[ime]) byIme[ime] = { ime: ime, enota: d.enota, delo: 0, nocne: 0, nedpraz: 0, vikend: 0, ld: 0, kpu: 0 };
      var z = byIme[ime];
      z.delo += d.delo; z.nocne += d.nocne; z.nedpraz += d.nedpraz;
      z.vikend += d.vikend; z.ld += d.ld; z.kpu += d.kpu;
    });
    return Object.keys(byIme).map(function (k) { return byIme[k]; });
  }

  /**
   * Zlije rezultat generatorja dežurstev (rezultat.stanje iz generator-core.js)
   * v obstoječo osnovo dežurnega kadra. Posodobi samo število dežurstev –
   * ur/REDI/NZV ta generator ne proizvaja, za to je potreben uvoz iz Kadrisa.
   */
  function mergeDezBaseline(baseline, novoStanje) {
    var byIme = {};
    baseline.forEach(function (z) { byIme[z.ime] = Object.assign({}, z); });
    novoStanje.forEach(function (s) {
      if (!byIme[s.ime]) byIme[s.ime] = { ime: s.ime, enota: "?", dezurstva: 0, ure: 0, redi: 0, nzv: 0 };
      byIme[s.ime].dezurstva += s.novih;
    });
    return Object.keys(byIme).map(function (k) { return byIme[k]; });
  }

  var Dashboard = {
    PRAZ_2026: PRAZ_2026,
    classifyForStats: classifyForStats,
    deltaFromKalupExport: deltaFromKalupExport,
    mergeSmsBaseline: mergeSmsBaseline,
    mergeDezBaseline: mergeDezBaseline,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Dashboard;
  } else {
    root.Dashboard = Dashboard;
  }
})(typeof window !== "undefined" ? window : this);
