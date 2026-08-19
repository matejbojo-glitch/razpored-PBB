/* Stalna zasedba NZV — EN SAM VIR pravila.
 *
 * Za vodje in administratorje se dnevni razpored ne objavlja: njihova
 * enota je stalna in zapisana v lead_departments.enote. Zato se njihova
 * prisotnost IZPELJE. Isto pravilo potrebujeta dva zaslona:
 *
 *   - index.html  → Po oddelkih → NZV  (dnevi × enote)
 *   - imenik.html → Razpredelnica      (osebe × dnevi)
 *
 * Prej je bilo napisano posebej na vsakem — in vsakič je kje manjkalo:
 * v NZV mreži so bili prazni stolpci enot, v Razpredelnici pa cele
 * vrstice ljudi brez enega samega vnosa. Enaka zgodba kot pri delovniku
 * (glej prazniki.js) — dokler je pravilo razpršeno, bo vedno kje ušlo.
 *
 * Odvisnost: prazniki.js (delovni dan) mora biti naložen prej.
 */
window.NzvZasedba = (function () {
  "use strict";

  // Kdo sodi v NZV: vodje in administratorji. Zanje velja delovnik
  // PON-PET (vikendi in prazniki prosti, razen dežurstva) in zanje se
  // izpeljuje stalna zasedba. Navadni uporabniki ("user") so razporejeni
  // po oddelkih in vikende delajo normalno.
  var VLOGE = ["vodja", "admin"];
  function jeNzvVloga(vloga) { return VLOGE.indexOf(vloga) >= 0; }

  // --- Izmenična zasedba SA -------------------------------------------
  // "SA je izmenično 1 teden dop, drug popoldne … poleti je samo
  // dopoldne" (uporabnikova navedba). Izmenjava teče po ISO tednu in ne
  // po "prvem/drugem tednu v mesecu": tako se ob prelomu meseca in leta
  // nikoli ne podvoji ali preskoči.
  function isoTeden(iso) {
    var d = new Date(iso + "T00:00:00");
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dan = t.getUTCDay() || 7;             // 1=PO … 7=NE
    t.setUTCDate(t.getUTCDate() + 4 - dan);   // četrtek istega tedna določa leto
    var zacetek = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - zacetek) / 86400000 + 1) / 7);
  }

  // Privzetka veljata, dokler tabele nzv_nastavitve ni oz. dokler je
  // administrator ne popravi (supabase/nzv-nastavitve.sql).
  var SA_PRIVZETO = { lihoTeden: "dop", poletniMeseci: [7, 8] };

  function saNastavitveIz(vrstice) {
    var m = {};
    (vrstice || []).forEach(function (r) { m[r.kljuc] = r.vrednost; });
    var zapisMesecev = m.sa_poletni_meseci == null ? "7,8" : m.sa_poletni_meseci;
    return {
      lihoTeden: m.sa_liho_teden === "pop" ? "pop" : "dop",
      poletniMeseci: String(zapisMesecev).split(",")
        .map(function (x) { return Number(String(x).trim()); })
        .filter(function (n) { return n >= 1 && n <= 12; }),
    };
  }

  // Kateri stolpec SA ta dan velja: "SADOP" ali "SAPOP".
  function saStolpec(datum, nastavitve) {
    var n = nastavitve || SA_PRIVZETO;
    if ((n.poletniMeseci || []).indexOf(Number(String(datum).slice(5, 7))) >= 0) return "SADOP";
    var vLihem = n.lihoTeden === "pop" ? "SAPOP" : "SADOP";
    var vSodem = vLihem === "SADOP" ? "SAPOP" : "SADOP";
    return isoTeden(datum) % 2 === 1 ? vLihem : vSodem;
  }

  // --- Enote nosilca ---------------------------------------------------
  // Uradna predloga zapisuje enote kot prosto besedilo ("C/C1", "UA/SA",
  // "B1/SOB/NOB") — glej supabase/nzv-nosilci-oddelkov.sql.
  // Pozor: "SOB" iz zapisa "B1/SOB/NOB" NI enota SOBO. To je bila napačna
  // domneva, zaradi katere sta se Mavri Tratnik in Šubic prikazovala v
  // stolpcu SOBO, kjer nimata kaj iskati - nosilka SOBO je Velušček Metka
  // (njen zapis se glasi natanko "SOBO"). Dokler ni pojasnjeno, kaj sta
  // "SOB" in "NOB", se kot neznani oznaki tiho preskočita.
  var ENOTA_PSEVDONIM = { "ŽO": "ZO", "UA": "URGENCA", "B1": "B1B2", "B2": "B1B2" };

  // "saKoda" je stolpec SA, ki ta dan velja (glej saStolpec) — oznaka
  // "SA" se preslika vanj. Brez nje bi bila ista oseba hkrati v
  // dopoldanskem IN popoldanskem stolpcu, česar v resnici ni.
  // "veljavne" je nabor kod, ki v mreži res obstajajo; neznana oznaka
  // (npr. "NOB") se tiho preskoči, da se ne vrine stolpec, ki ga ni.
  function enoteVKode(enote, saKoda, veljavne) {
    var kode = [];
    String(enote || "").split(/[\/,+]/).forEach(function (del) {
      var t = del.trim().toUpperCase();
      if (!t) return;
      var koda = t === "SA" ? (saKoda || "SADOP") : (ENOTA_PSEVDONIM[t] || t);
      if (veljavne && veljavne.indexOf(koda) < 0) return;
      if (kode.indexOf(koda) < 0) kode.push(koda);
    });
    return kode;
  }

  // --- Odsotnost -------------------------------------------------------
  // Daljša odsotnost je zapisana pri nosilcu samem (odsotnost_tip +
  // odsotnost_do), ne po posameznih dnevih v leave_entries — npr.
  // porodniška do julija 2027. Brez "do" velja odprto naprej.
  function trajnoOdsoten(zapisNosilca, datum) {
    var v = zapisNosilca;
    return !!(v && v.odsotnost_tip && (!v.odsotnost_do || datum <= v.odsotnost_do));
  }

  // Uradna kratica za daljšo odsotnost — da vrstica v Razpredelnici ne
  // ostane prazna, ampak pove, ZAKAJ je oseba odsotna. Namenoma samo
  // znani vrsti; neznane vrste raje ne ugibamo.
  function dolgaOdsotnostKratica(tip) {
    var t = String(tip || "").toLowerCase();
    if (/porod/.test(t)) return "POR";
    if (/bolni/.test(t)) return "BS";
    return null;
  }

  // Koda izmene, ki jo aplikacija zapiše za prisotnega vodjo/DMS. Ista
  // koda kot pri objavi razporeda, zato jo legenda že prepozna (→ DOP,
  // "PON-PET 07:00-15:00").
  var IZMENA_PRISOTEN = "PRISOTEN";

  // Stalna zasedba ene osebe čez dano obdobje — kaj bi imel nosilec enote
  // na posamezen dan, če ni objavljenega vnosa. Vrne SAMO dopolnitve;
  // kam in kako se vpišejo, je stvar klicatelja, ker vsak od treh
  // zaslonov riše drugače (šifra izmene, celica z barvo, parafa).
  //
  //   zapisNosilca  vrstica iz lead_departments (enote, odsotnost_tip/do)
  //   datumi        seznam ISO datumov (npr. cel mesec)
  //   jeZapolnjen   f(datum) -> true, če dan že ima objavljen vnos
  //
  // Vrne [{ datum, sifra, odsotnost }]. "odsotnost" pove, da gre za
  // daljšo odsotnost (POR/BS) in ne za prisotnost.
  function stalnaZasedba(zapisNosilca, datumi, jeZapolnjen) {
    var out = [];
    if (!zapisNosilca || !zapisNosilca.enote) return out;
    var dolga = dolgaOdsotnostKratica(zapisNosilca.odsotnost_tip);
    (datumi || []).forEach(function (datum) {
      if (jeZapolnjen && jeZapolnjen(datum)) return;
      // Delovnik NZV je PON-PET; vikendi in dela prosti prazniki so prosti.
      if (window.Prazniki.jeDelaProstDan(datum)) return;
      if (trajnoOdsoten(zapisNosilca, datum)) {
        if (dolga) out.push({ datum: datum, sifra: dolga, odsotnost: true });
        return;
      }
      out.push({ datum: datum, sifra: IZMENA_PRISOTEN, odsotnost: false });
    });
    return out;
  }

  // --- Kdo je ta dan na kateri enoti -----------------------------------
  // Uporabnikovo pravilo (avgust 2026), povedano na primeru:
  //
  //   Salkić (C1) je odsotna  ->  Arnež PRESELI na C1 (na svojem C ga ni)
  //                           ->  Lunar poleg svojega B pokrije še C
  //
  // Torej dve različni ravni, ki se ne smeta zamešati:
  //   1. nadomeščevalec odsotnega se PRESELI - prevzame njegovo enoto in
  //      svojo zapusti;
  //   2. tretji, ki pokrije zapuščeno enoto, se NE preseli - to enoto
  //      dobi POLEG svoje. Tu se veriga ustavi.
  //
  // Vhod:
  //   nosilci      vrstice lead_departments (full_name, enote, odsotnost_*)
  //   pari         vrstice nadomescanja (nosilec, nadomesca, enota, prednost)
  //   kljuc(ime)   normalizacija imena v primerljiv ključ (glej imena.js)
  //   jeOdsoten(ime) -> bool za ta dan
  //   saKoda       stolpec SA, ki ta dan velja (glej saStolpec)
  //   veljavne     nabor kod, ki v mreži obstajajo
  //
  // Vrne [{ nosilec, kode, enote }] - kdo je ta dan na katerih enotah;
  // "kode" so stolpci mreže, "enote" berljiv zapis za izpis.
  function razporedDneva(opts) {
    var nosilci = opts.nosilci || [], pari = opts.pari || [];
    var kljuc = opts.kljuc, jeOdsoten = opts.jeOdsoten;
    var vKode = function (enote) { return enoteVKode(enote, opts.saKoda, opts.veljavne); };

    var poKljucu = {};
    nosilci.forEach(function (v) { poKljucu[kljuc(v.full_name)] = v; });

    // Nadomeščevalci posameznega nosilca, urejeni po prednosti.
    var zaNosilca = {};
    pari.slice()
      .sort(function (a, b) { return (a.prednost || 1) - (b.prednost || 1); })
      .forEach(function (n) {
        var k = kljuc(n.nosilec);
        (zaNosilca[k] = zaNosilca[k] || []).push(n);
      });

    // 1. raven: kdo se preseli in kam.
    var preseljen = {};   // ključ nadomeščevalca -> kode enot, ki jih prevzame
    var preseljenBesedilo = {}; // isti ključ -> berljiv zapis ("C1"), za izpis
    // Vrstni red mora biti določen (ne po naključju iz baze), sicer bi ob
    // dveh hkratnih odsotnostih isti nadomeščevalec enkrat pripadel enemu
    // in drugič drugemu.
    nosilci.slice()
      .sort(function (a, b) { return String(a.full_name).localeCompare(String(b.full_name)); })
      .forEach(function (v) {
        if (!v.enote || !jeOdsoten(v.full_name)) return;
        var kandidati = zaNosilca[kljuc(v.full_name)] || [];
        for (var i = 0; i < kandidati.length; i++) {
          var kn = kljuc(kandidati[i].nadomesca);
          if (jeOdsoten(kandidati[i].nadomesca) || preseljen[kn]) continue;
          var kode = vKode(kandidati[i].enota || v.enote);
          if (!kode.length) continue;
          preseljen[kn] = kode;
          preseljenBesedilo[kn] = kandidati[i].enota || v.enote;
          break;
        }
      });

    // 2. raven: zapuščene enote prevzame naslednji, in to POLEG svojih.
    var dodatno = {};
    var dodatnoBesedilo = {};
    Object.keys(preseljen).forEach(function (kb) {
      var b = poKljucu[kb];
      if (!b || !b.enote) return;
      var kandidati = zaNosilca[kb] || [];
      for (var i = 0; i < kandidati.length; i++) {
        var kc = kljuc(kandidati[i].nadomesca);
        // Kdor je sam odsoten ali se je že preselil, ne more prevzeti še
        // ene enote - sicer bi bil hkrati na dveh koncih.
        if (jeOdsoten(kandidati[i].nadomesca) || preseljen[kc]) continue;
        dodatno[kc] = (dodatno[kc] || []).concat(vKode(b.enote));
        dodatnoBesedilo[kc] = (dodatnoBesedilo[kc] || []).concat([b.enote]);
        break;
      }
    });

    var out = [];
    nosilci.forEach(function (v) {
      if (!v.enote || jeOdsoten(v.full_name)) return;
      var k = kljuc(v.full_name);
      // Preseljeni NIMA več svoje enote - to je bistvo preselitve.
      var kode = preseljen[k] ? preseljen[k].slice() : vKode(v.enote);
      (dodatno[k] || []).forEach(function (koda) {
        if (kode.indexOf(koda) < 0) kode.push(koda);
      });
      // Berljiv zapis enot za izpis ("C1", "B, C") - kode so namenjene
      // stolpcem mreže in za človeka niso najbolj razumljive ("SADOP",
      // "B1B2"). Vrstni red je isti kot pri kodah.
      var besedilo = [preseljen[k] ? preseljenBesedilo[k] : v.enote]
        .concat(dodatnoBesedilo[k] || [])
        .filter(Boolean).join(", ");
      if (kode.length) out.push({ nosilec: v, kode: kode, enote: besedilo });
    });
    return out;
  }

  return {
    VLOGE: VLOGE,
    jeNzvVloga: jeNzvVloga,
    isoTeden: isoTeden,
    SA_PRIVZETO: SA_PRIVZETO,
    saNastavitveIz: saNastavitveIz,
    saStolpec: saStolpec,
    enoteVKode: enoteVKode,
    trajnoOdsoten: trajnoOdsoten,
    dolgaOdsotnostKratica: dolgaOdsotnostKratica,
    IZMENA_PRISOTEN: IZMENA_PRISOTEN,
    stalnaZasedba: stalnaZasedba,
    razporedDneva: razporedDneva,
  };
})();
