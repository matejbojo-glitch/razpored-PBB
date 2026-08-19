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
  var ENOTA_PSEVDONIM = { "ŽO": "ZO", "UA": "URGENCA", "SOB": "SOBO", "B1": "B1B2", "B2": "B1B2" };

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
  };
})();
