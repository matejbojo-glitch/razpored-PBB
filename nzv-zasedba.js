/* Stalna zasedba NZV – EN SAM VIR pravila.
 *
 * Za vodje in administratorje se dnevni razpored ne objavlja: njihova
 * enota je stalna in zapisana v lead_departments.enote. Zato se njihova
 * prisotnost IZPELJE. Isto pravilo potrebujeta dva zaslona:
 *
 *   - index.html  → Po oddelkih → NZV  (dnevi × enote)
 *   - imenik.html → Razpredelnica      (osebe × dnevi)
 *
 * Prej je bilo napisano posebej na vsakem – in vsakič je kje manjkalo:
 * v NZV mreži so bili prazni stolpci enot, v Razpredelnici pa cele
 * vrstice ljudi brez enega samega vnosa. Enaka zgodba kot pri delovniku
 * (glej prazniki.js) – dokler je pravilo razpršeno, bo vedno kje ušlo.
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

  // --- Kaj je DELOVIŠČE in kaj le pripadnost -----------------------------
  // schedule_entries.department_code ne pove vedno, KJE oseba tisti dan
  // dela. Štiri kode so pripadnost skupini, ne kraj dela:
  //
  //   DEZ / NEDEZ  dežurni oz. nedežurni kader (kdo je v obtoku dežurstev)
  //   NZV          vodje in administratorji kot skupina
  //   FLEXI        plavajoče osebje (pravi oddelek je v pokriva_oddelek)
  //
  // Brez tega je vodja na dežurni dan v "Moj razpored" videl
  // "Dopoldne (DEZ)" - dopoldne pa dela na svoji enoti (MO), dežurstvo je
  // šele zvečer. Uporabnikova pripomba, avgust 2026.
  var NI_DELOVISCE = ["DEZ", "NEDEZ", "NZV", "FLEXI"];
  function jeDelovisce(koda) {
    var t = String(koda || "").trim().toUpperCase();
    return !!t && NI_DELOVISCE.indexOf(t) < 0;
  }

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
  // "B1/SOB/NOB") – glej supabase/nzv-nosilci-oddelkov.sql.
  // Pozor: "SOB" iz zapisa "B1/SOB/NOB" NI enota SOBO. To je bila napačna
  // domneva, zaradi katere sta se Mavri Tratnik in Šubic prikazovala v
  // stolpcu SOBO, kjer nimata kaj iskati - nosilka SOBO je Velušček Metka
  // (njen zapis se glasi natanko "SOBO"). Dokler ni pojasnjeno, kaj sta
  // "SOB" in "NOB", se kot neznani oznaki tiho preskočita.
  var ENOTA_PSEVDONIM = { "ŽO": "ZO", "UA": "URGENCA", "B1": "B1B2", "B2": "B1B2" };

  // Berljiv zapis enote za prikaz: "ZO" se piše "ŽO", "B1B2" pa "B1,B2".
  // Vrstni red je primarna enota najprej, dodatne sledijo le, če so različne.
  function formatirajOddelke(primarni, dodatni) {
    function key(value) {
      return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/Ž/g, "Z")
        .replace(/Š/g, "S")
        .replace(/Č/g, "C")
        .replace(/Ć/g, "C");
    }
    function display(value) {
      var v = String(value || "").trim();
      if (!v) return "";
      return v
        .replace(/ZO/gi, "ŽO")
        .replace(/B1B2/gi, "B1,B2")
        .replace(/\s*,\s*/g, ", ");
    }
    function norm(value) {
      if (value == null) return [];
      if (Array.isArray(value)) {
        return value.reduce(function (out, item) {
          return out.concat(norm(item));
        }, []);
      }
      return String(value).split(/[\/,+]/)
        .map(function (del) { return display(del); })
        .filter(function (v) { return !!v; })
        .filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
    }

    var prim = norm(primarni);
    var dod = norm(dodatni);
    var pri = prim.length ? key(prim[0]) : "";
    var vsi = prim.concat(dod);
    var out = [];
    var dodano = {};

    function dodaj(v) {
      if (!v || dodano[key(v)]) return;
      dodano[key(v)] = true;
      out.push(display(v));
    }

    if (prim.length) {
      dodaj(prim[0]);
    }
    var mo = vsi.filter(function (v) { return key(v) === "MO"; });
    var zo = vsi.filter(function (v) { return key(v) === "ZO"; });
    var ostalo = vsi.filter(function (v) {
      var k = key(v);
      return k !== "MO" && k !== "ZO";
    });

    if (mo.length && zo.length) {
      if (pri === "MO") {
        dodaj("ŽO");
      } else if (pri === "ZO") {
        dodaj("MO");
      } else {
        dodaj("MO");
        dodaj("ŽO");
      }
    }
    ostalo.forEach(dodaj);

    if (!out.length) {
      var preostali = (prim.length ? prim : dod).filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
      preostali.forEach(dodaj);
    }

    return out.filter(Boolean).join(", ");
  }

  function normalizirajNazivOddelka(value) {
    var deli = String(value || "")
      .split(/[\/,+]/)
      .map(function (v) { return String(v).trim(); })
      .filter(Boolean)
      .map(function (v) { return v.replace(/ZO/gi, "ŽO"); })
      .filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
    var imaMo = deli.some(function (v) { return String(v).replace(/Ž/g, "Z").toUpperCase() === "MO" || String(v).toUpperCase() === "MO"; });
    var imaZo = deli.some(function (v) { return String(v).replace(/Ž/g, "Z").toUpperCase() === "ZO" || String(v).toUpperCase() === "ZO"; });
    if (imaMo && imaZo) {
      return ["MO", "ŽO"].filter(function (part) {
        return deli.some(function (v) {
          return String(v).replace(/Ž/g, "Z").toUpperCase() === (part === "MO" ? "MO" : "ZO");
        });
      }).join(", ");
    }
    return formatirajOddelke(value, null);
  }

  if (typeof window !== "undefined") {
    window.formatirajOddelke = formatirajOddelke;
    window.normalizirajNazivOddelka = normalizirajNazivOddelka;
  }

  // "saKoda" je stolpec SA, ki ta dan velja (glej saStolpec) – oznaka
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
  // odsotnost_do), ne po posameznih dnevih v leave_entries – npr.
  // porodniška do julija 2027. Brez "do" velja odprto naprej.
  function trajnoOdsoten(zapisNosilca, datum) {
    var v = zapisNosilca;
    return !!(v && v.odsotnost_tip && (!v.odsotnost_do || datum <= v.odsotnost_do));
  }

  // Uradna kratica za daljšo odsotnost – da vrstica v Razpredelnici ne
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

  // Stalna zasedba ene osebe čez dano obdobje – kaj bi imel nosilec enote
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
  // Organizacijske ENOTE v stolpcih uradne predloge "Letni dopusti in
  // omejitve za NZV". Doslej je bil ta seznam zapisan samo v index.html;
  // odkar ga potrebuje tudi generator (admin.html), je tu, da se kopiji ne
  // moreta raziti - prav to je bil vzrok, da je generator delal po drugih
  // pravilih kot prikaz.
  var ENOTE = [
    ["PDZN", "PDZN"], ["SOBO", "SOBO"], ["ZO", "ŽO"], ["E1", "E1"], ["E2", "E2"], ["D", "D"], ["MO", "MO"],
    ["B", "B"], ["C", "C"], ["C1", "C1"], ["PO", "PO"], ["A", "A"], ["B1B2", "B1,B2"], ["DB", "DB"],
    ["URGENCA", "URGENCA"], ["U2", "U2"],
  ];
  // Vrstni red stolpcev v uradni predlogi ima "SA DOP"/"SA POP" MED "DB" in
  // "URGENCA", ne na koncu - zato prikazni vrstni red sestavimo posebej.
  var STOLPCI = (function () {
    var brezUrgence = ENOTE.filter(function (v) { return v[0] !== "URGENCA" && v[0] !== "U2"; });
    var urgencaU2 = ENOTE.filter(function (v) { return v[0] === "URGENCA" || v[0] === "U2"; });
    return brezUrgence.concat([["SADOP", "SA DOP"], ["SAPOP", "SA POP"]], urgencaU2);
  })();
  var KODE_STOLPCEV = STOLPCI.map(function (v) { return v[0]; });

  // Zadnji trije stolpci uradne predloge niso enote, ampak POVZETEK
  // odsotnosti tega dne (glej leave_entries.kind).
  var KIND_KODA = { ld: "LD", sti: "IZOB", bs: "BS" };
  var KIND_KODA_VREDNOSTI = Object.keys(KIND_KODA).map(function (k) { return KIND_KODA[k]; });

  // Kdo je ta dan na kateri enoti - s podrobnostmi.
  //
  // Vrne { vrstice, enakovredni }:
  //   vrstice      kot razporedDneva (nosilec + kode + berljiv zapis enot)
  //   enakovredni  koda enote -> imena, ki so za to enoto ENAKO ustrezna
  //
  // "enakovredni" obstaja zaradi uporabnikovega pravila (avgust 2026):
  // "Humar je prva SA, nadomesti jo Trpin ali Bizjak ... se določi sproti."
  // Kadar ima več nadomeščevalcev ISTO prednost, ni ene same pravilne
  // rešitve - katera koli od njih je v redu. Razpored zato izbere prvo
  // (da je predlog določen in se ne spreminja med osvežitvami), pregled
  // odstopanj pa sprejme vse. Brez tega bi vsak dan javljal napako pri
  // tisti od obeh, ki tokrat ni bila izbrana.
  function razporedDnevaPodrobno(opts) {
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

    // 1. raven: kdo prevzame odsotnega in kako.
    //
    // Dve različni pravili, ker uporabnik za različne pare zahteva
    // različno (obe sta v tabeli nadomescanja, stolpec poleg_svoje):
    //
    //   PRESELITEV (privzeto, poleg_svoje = false)
    //     Salkić (C1) odsotna -> Arnež gre s C na C1, svoj C zapusti,
    //     C prevzame Lunar POLEG svojega B. Tri osebe, tri enote.
    //
    //   POLEG SVOJE (poleg_svoje = true)
    //     Alukić (ŽO) odsoten -> Bojić ima MO IN ŽO. Svoje enote ne
    //     zapusti, zato je tudi ne prevzema nihče, in Džamastagić
    //     ostane prost - ta pride na vrsto šele, ko ni NOBENEGA od
    //     obeh. Uporabnikovo pravilo, avgust 2026:
    //     "Ko Alukić ni, je Bojić na MO + ŽO; če Bojić ni, je Alukić
    //      ŽO + MO; če ni obeh, je Džamastagić."
    var preseljen = {};   // ključ nadomeščevalca -> kode enot, ki jih prevzame
    var preseljenBesedilo = {}; // isti ključ -> berljiv zapis ("C1"), za izpis
    var dodatno = {};           // ključ -> kode enot POLEG svoje
    var dodatnoBesedilo = {};
    function prevzemiPoleg(k, kode, besedilo) {
      dodatno[k] = (dodatno[k] || []).concat(kode);
      dodatnoBesedilo[k] = (dodatnoBesedilo[k] || []).concat([besedilo]);
    }
    // Enakovredni nadomeščevalci: vsi, ki imajo isto prednost kot izbrani
    // in tisti dan niso odsotni. Katera koli od njih je pravilna rešitev.
    var enakovredni = {};
    function zabeleziEnakovredne(kandidati, izbrani, kode) {
      var stopnja = izbrani.prednost || 1;
      var imena = kandidati
        .filter(function (k) { return (k.prednost || 1) === stopnja && !jeOdsoten(k.nadomesca); })
        .map(function (k) { return k.nadomesca; });
      if (imena.length < 2) return;   // ena sama možnost - ni kaj izbirati
      kode.forEach(function (koda) {
        var ze = enakovredni[koda] = enakovredni[koda] || [];
        imena.forEach(function (i) { if (ze.indexOf(i) < 0) ze.push(i); });
      });
    }
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
          if (jeOdsoten(kandidati[i].nadomesca)) continue;
          // Kdor se je že preselil, je drugje - ne more prevzeti še ene
          // enote, ne na en ne na drug način.
          if (preseljen[kn]) continue;
          var kode = vKode(kandidati[i].enota || v.enote);
          if (!kode.length) continue;
          if (kandidati[i].poleg_svoje) {
            // Svojo enoto obdrži, zato zanjo NI 2. ravni: ni je zapustil.
            prevzemiPoleg(kn, kode, kandidati[i].enota || v.enote);
            zabeleziEnakovredne(kandidati, kandidati[i], kode);
            break;
          }
          // Kdor že pokriva tujo enoto poleg svoje, se ne seli še tretjič.
          if (dodatno[kn]) continue;
          preseljen[kn] = kode;
          preseljenBesedilo[kn] = kandidati[i].enota || v.enote;
          zabeleziEnakovredne(kandidati, kandidati[i], kode);
          break;
        }
      });

    // 2. raven: zapuščene enote prevzame naslednji, in to POLEG svojih.
    // Velja SAMO za preselitve - kdor svoje enote ni zapustil, je nima
    // kdo prevzeti.
    // Kdo od preseljenih je svojo staro enoto res oddal. Če je ni oddal
    // nihče, jo obdrži sam (glej spodaj) - delo na njej ne izgine.
    var zapuscenoPokrito = {};
    Object.keys(preseljen).forEach(function (kb) {
      var b = poKljucu[kb];
      if (!b || !b.enote) return;
      var kandidati = zaNosilca[kb] || [];
      for (var i = 0; i < kandidati.length; i++) {
        var kc = kljuc(kandidati[i].nadomesca);
        // Kdor je sam odsoten ali se je že preselil, ne more prevzeti še
        // ene enote - sicer bi bil hkrati na dveh koncih.
        if (jeOdsoten(kandidati[i].nadomesca) || preseljen[kc]) continue;
        prevzemiPoleg(kc, vKode(b.enote), b.enote);
        zapuscenoPokrito[kb] = true;
        break;
      }
    });

    var out = [];
    nosilci.forEach(function (v) {
      if (!v.enote || jeOdsoten(v.full_name)) return;
      var k = kljuc(v.full_name);
      // Preseljeni praviloma NIMA več svoje enote - to je bistvo
      // preselitve (Salkić odsotna -> Arnež gre s C na C1, njegov C
      // prevzame Lunar).
      //
      // Izjema: če njegove stare enote ni prevzel NIHČE, jo obdrži sam in
      // pokriva obe. To se zgodi pri vzajemnih parih, kjer se dva
      // nadomeščata med sabo in tretjega ni: Lelič (E2) in Maglić (E1)
      // sta drug drugemu edini nadomeščevalec, zato ob Leličini odsotnosti
      // E1 nima kdo prevzeti - Maglić ima tisti dan E2 in E1. Brez tega bi
      // enota E1 tisti dan v razporedu izginila, čeprav delo na njej ostaja.
      var kode = preseljen[k] ? preseljen[k].slice() : vKode(v.enote);
      if (preseljen[k] && !zapuscenoPokrito[k]) {
        vKode(v.enote).forEach(function (koda) {
          if (kode.indexOf(koda) < 0) kode.push(koda);
        });
      }
      (dodatno[k] || []).forEach(function (koda) {
        if (kode.indexOf(koda) < 0) kode.push(koda);
      });
      // Berljiv zapis enot za izpis ("C1", "B, C") - kode so namenjene
      // stolpcem mreže in za človeka niso najbolj razumljive ("SADOP",
      // "B1B2"). Vrstni red je isti kot pri kodah, razen pri prikazu se
      // ureditev zgradi po primarni enoti in dodatnih enotah.
      var primarni = preseljen[k] ? preseljenBesedilo[k] : v.enote;
      var dodatne = (preseljen[k] && !zapuscenoPokrito[k] ? [v.enote] : [])
        .concat(dodatnoBesedilo[k] || [])
        .filter(Boolean);
      var besedilo = primarni;
      dodatne.forEach(function (dodatna) {
        besedilo = formatirajOddelke(besedilo, dodatna);
      });
      if (kode.length) out.push({ nosilec: v, kode: kode, enote: besedilo });
    });
    return { vrstice: out, enakovredni: enakovredni };
  }

  // -------------------------------------------------------------------
  // Ročno prepisana celica -> nazaj v osebe.
  //
  // Koordinator v mreži NZV celico prepiše na roko (tako je delal v
  // Sheets in tako dela naprej). Doslej je tak popravek spremenil samo
  // prikaz in izvoz, objava v Supabase pa je ostala pri IZRAČUNANI
  // vrednosti - torej si videl eno, zaposleni pa je dobil drugo. Da se
  // popravek lahko objavi, ga je treba prebrati nazaj v konkretne osebe.
  //
  // Vrne { osebe, neznani, dvoumni }. Kar ni ENOLIČNO prepoznano, se NE
  // objavi in se pove - v razporedu je tiho ugibanje, kdo je "BOJ",
  // nevarnejše od jasnega opozorila.
  //
  // Prebere: kratico ("BOJ"), celo ime ("Bojić Matej", tudi obrnjeno ali
  // brez strešic - prek imena.js) in več oseb v isti celici, ločenih s
  // presledkom, vejico, poševnico ali plusom. Vprašaj (predlog) in
  // zvezdica (daljša odsotnost) sta oznaki prikaza, ne del imena.
  function razberiCelico(opts) {
    var besedilo = String(opts.besedilo == null ? "" : opts.besedilo);
    var nosilci = opts.nosilci || [];
    var kljuc = opts.kljuc;
    var vKratico = opts.kratica;

    var poImenu = {};      // ključ celega imena -> ime
    var poKratici = {};    // kratica -> [imena]
    nosilci.forEach(function (v) {
      var ime = v.full_name || v.ime || v;
      poImenu[kljuc(ime)] = ime;
      var kr = kljuc(vKratico(ime));
      (poKratici[kr] = poKratici[kr] || []).push(ime);
    });

    var deli = besedilo.split(/[\s,;\/+]+/)
      .map(function (t) { return t.replace(/[?*]+/g, "").trim(); })
      .filter(Boolean);

    var osebe = [], neznani = [], dvoumni = [];
    for (var i = 0; i < deli.length; i++) {
      // Celo ime sta dve besedi ("Bojić Matej"), zato najprej poskusi par.
      if (i + 1 < deli.length) {
        var par = poImenu[kljuc(deli[i] + " " + deli[i + 1])];
        if (par) { osebe.push(par); i++; continue; }
      }
      var celo = poImenu[kljuc(deli[i])];
      if (celo) { osebe.push(celo); continue; }
      var zadetki = poKratici[kljuc(deli[i])] || [];
      if (zadetki.length === 1) osebe.push(zadetki[0]);
      else if (zadetki.length > 1) dvoumni.push(deli[i]);
      else neznani.push(deli[i]);
    }
    // Ista oseba dvakrat v celici je za razpored en sam zapis.
    var videni = {}, enkratni = [];
    osebe.forEach(function (ime) {
      var k = kljuc(ime);
      if (!videni[k]) { videni[k] = true; enkratni.push(ime); }
    });
    return { osebe: enkratni, neznani: neznani, dvoumni: dvoumni };
  }

  // -------------------------------------------------------------------
  // Predlog za zapolnitev vrzeli ("Predlagaj mesec").
  //
  // Uporabnik: "načeloma je tako, da se na koncu Denis Džamastagić odloči
  // in izpolni manjkajoče vrzeli." To tu ostane ČLOVEKOVA odločitev -
  // aplikacija vrzeli samo najde in za vsako predlaga osebo, predlog pa
  // se objavi šele po potrditvi (ista pot kot predlogi nadomeščanja).
  //
  // Vrzel je enota, ki je ta mesec v uporabi, a je tisti delovni dan
  // NIHČE ne pokriva. Namenoma se NE zapolnjuje:
  //   - stolpcev odsotnosti (LD/IZOB/BS) in DEŽURSTVA (to je svoj razpored),
  //   - tiste od SA DOP/SA POP, ki ta dan ni na vrsti (prazna je pravilno),
  //   - vikendov in praznikov (NZV takrat po enotah ne dela).
  //
  // Kandidat mora biti tisti dan prisoten. Med prisotnimi ima prednost
  // tisti z najmanj enotami ta dan (kdor še nima nobene, pred tistim, ki
  // že pokriva dve), nato tisti z najmanj predlogi doslej ta mesec
  // (obremenitev se ne nabere na eni osebi), nazadnje po abecedi - da je
  // izid ponovljiv in se med osvežitvami ne premetava.
  function predlagajZapolnitev(opts) {
    var dnevi = opts.dnevi || [];
    var stolpci = opts.stolpci || [];
    var nosilci = opts.nosilci || [];
    var kljuc = opts.kljuc;
    var jeOdsoten = opts.jeOdsoten;
    var saKodaZa = opts.saKodaZa || function () { return null; };
    var jeProstDan = opts.jeProstDan || function () { return false; };

    var zaPolnit = stolpci.filter(function (k) {
      return jeDelovisce(k) && KIND_KODA_VREDNOSTI.indexOf(k) === -1 && k !== "DEZURSTVO";
    });
    var stPredlogov = {};
    nosilci.forEach(function (v) { stPredlogov[kljuc(v.full_name)] = 0; });

    var predlogi = [];
    dnevi.forEach(function (dn) {
      if (jeProstDan(dn.datum)) return;
      var saDanes = saKodaZa(dn.datum);
      // Ta dan že zasedene enote na osebo - za "kdo je najmanj obremenjen".
      var zasedenost = {};
      nosilci.forEach(function (v) { zasedenost[kljuc(v.full_name)] = 0; });
      zaPolnit.forEach(function (k) {
        var vsebina = (dn.celice[k] || "").trim();
        if (!vsebina) return;
        razberiCelico({ besedilo: vsebina, nosilci: nosilci, kljuc: kljuc, kratica: opts.kratica })
          .osebe.forEach(function (ime) { zasedenost[kljuc(ime)] = (zasedenost[kljuc(ime)] || 0) + 1; });
      });

      zaPolnit.forEach(function (k) {
        if ((dn.celice[k] || "").trim()) return;                       // ni vrzel
        if ((k === "SADOP" || k === "SAPOP") && saDanes && k !== saDanes) return; // ta dan ni na vrsti
        var kandidati = nosilci.filter(function (v) { return !jeOdsoten(v.full_name, dn.datum); });
        if (!kandidati.length) return;
        kandidati.sort(function (a, b) {
          var ka = kljuc(a.full_name), kb = kljuc(b.full_name);
          return (zasedenost[ka] || 0) - (zasedenost[kb] || 0)
            || (stPredlogov[ka] || 0) - (stPredlogov[kb] || 0)
            || (a.full_name < b.full_name ? -1 : a.full_name > b.full_name ? 1 : 0);
        });
        var izbrani = kandidati[0];
        var kl = kljuc(izbrani.full_name);
        zasedenost[kl] = (zasedenost[kl] || 0) + 1;
        stPredlogov[kl] = (stPredlogov[kl] || 0) + 1;
        predlogi.push({ datum: dn.datum, stolpec: k, ime: izbrani.full_name });
      });
    });
    return predlogi;
  }

  // Ista oseba je isti dan pogosto na VEČ enotah - v uporabnikovi datoteki
  // "Letni dopusti in omejitve za NZV" je takih primerov 98 v septembru in 79
  // v avgustu 2026 (npr. 1. 9. je Džamastagić na PDZN, SOBO IN U2, Lelič na
  // E1 in E2, Arnež na B in C). To je normalno stanje, ne napaka v predlogi.
  //
  // schedule_entries pa ima unique (employee_id, work_date): en zapis na
  // osebo in dan. Vsaka nadaljnja enota iste osebe je bila zato ob shranjevanju
  // ali zavrnjena ("ON CONFLICT DO UPDATE command cannot affect row a second
  // time") ali tiho prepisana - natanko to so "pomanjkljive celice".
  //
  // Rešitev je stolpec, ki v aplikaciji za to že obstaja: pokriva_oddelek
  // (FLEXI ga uporablja za "C/E2"). Prva enota po vrstnem redu stolpcev v
  // predlogi gre v department_code, vse nadaljnje pa v pokriva_oddelek,
  // ločene s poševnico - enak zapis, kot ga pozna enoteVKode.
  //
  // Dežurstvo ni enota, ampak stanje: če je oseba tisti dan dežurna IN na
  // enoti (med tednom je to pravilo, ne izjema), obvelja shift_code
  // "DEŽURSTVO", enote pa se ohranijo v department_code/pokriva_oddelek.
  function zdruziNzvZapise(zapisi) {
    const poOsebiInDnevu = new Map();
    (zapisi || []).forEach(z => {
      const kljuc = z.employee_id + "|" + z.work_date;
      const prej = poOsebiInDnevu.get(kljuc);
      if (!prej) {
        poOsebiInDnevu.set(kljuc, { employee_id: z.employee_id, work_date: z.work_date,
          department_code: z.department_code, shift_code: z.shift_code,
          stolpci: z.stolpec ? [z.stolpec] : [] });
        return;
      }
      // Dežurstvo nima svojega stolpca enote (stolpec je undefined) in ne sme
      // prevzeti department_code, če je oseba tisti dan tudi na enoti.
      if (!z.stolpec) { prej.shift_code = z.shift_code; return; }
      if (!prej.stolpci.length) {
        // Doslej samo dežurstvo - enota postane primarna, dežurstvo ostane
        // v shift_code.
        prej.department_code = z.department_code;
        prej.stolpci = [z.stolpec];
        return;
      }
      if (prej.stolpci.indexOf(z.stolpec) < 0) prej.stolpci.push(z.stolpec);
    });
    return [...poOsebiInDnevu.values()].map(v => {
      const zapis = { employee_id: v.employee_id, department_code: v.department_code,
                      work_date: v.work_date, shift_code: v.shift_code };
      // Kdaj sam department_code NE zadostuje in je treba izpisati cel seznam
      // stolpcev:
      //   - oseba je na več enotah hkrati;
      //   - oseba je dežurna. Takrat shift_code nosi "DEŽURSTVO" in ne več
      //     "Dopoldne"/"Popoldne" - pri SA pa je prav izmena edino, kar loči
      //     stolpec SA DOP od SA POP. Brez tega je Trpin 9. 9. 2026 (SA POP
      //     in hkrati dežurna) pristala v stolpcu SA DOP.
      const potrebenSeznam = v.stolpci.length > 1
        || (v.stolpci.length === 1 && String(v.shift_code || "").toUpperCase() === "DEŽURSTVO");
      if (potrebenSeznam) zapis.pokriva_oddelek = v.stolpci.join("/");
      return zapis;
    });
  }

  // -------------------------------------------------------------------
  // Obratna smer od razporedDneva: kdo pokriva POSAMEZNO ENOTO na
  // posamezen dan.
  //
  // razporedDneva pove, katere enote pokriva posamezna oseba - to je
  // pravi pogled, kadar gledaš človeka. Na oddelčnem razporedu pa je
  // vprašanje obrnjeno: "kdo je iz NZV danes zadolžen za C1?" Odgovor
  // mora biti ISTI in mora upoštevati nadomeščanja: če je Salkić (C1) na
  // dopustu, C1 tisti dan pokriva Arnež (C), njegov C pa Lunar (B) - ki
  // je tako hkrati na B in na C. Tudi če gre za en sam dan.
  //
  // opts:
  //   nosilci     vrstice lead_departments
  //   pari        vrstice nadomescanja
  //   kljuc       window.Imena.kljuc
  //   datumi      [ISO, ...]
  //   jeOdsoten   (ime, datum) -> bool (dopust/bolniška/študijski)
  //   saKodaZa    (datum) -> "SADOP"|"SAPOP"|null (neobvezno)
  //   jeProstDan  (datum) -> bool; NZV ob vikendih in praznikih po enotah
  //               ne dela, zato tak dan ostane prazen
  //   veljavne    dovoljene kode stolpcev (neobvezno)
  //
  // Vrne { "ENOTA|DATUM": [ime, ...] }.
  function zasedbaEnot(opts) {
    var datumi = opts.datumi || [];
    var jeProstDan = opts.jeProstDan || function () { return false; };
    var saKodaZa = opts.saKodaZa || function () { return null; };
    var objavljeno = opts.objavljeno || {};
    var out = {};
    datumi.forEach(function (datum) {
      if (jeProstDan(datum)) return;
      // OBJAVLJEN razpored NZV ima prednost pred izpeljavo po pravilih.
      // Koordinator v mreži NZV marsikaj določi ročno (vskoči nekdo tretji,
      // dogovor se sklene sproti) - kar objavi, je odslej resnica tudi za
      // oddelek. Pravilo nadomeščanja se uporabi samo za dneve, za katere
      // objavljenega razporeda še ni.
      //
      // Prevzame se CEL DAN, ne posamezna enota: mešanje objavljenega in
      // izpeljanega znotraj istega dne bi dalo protislovje (na C1 bi bila
      // hkrati Salkić iz pravila in nekdo drug iz objave).
      if (objavljeno[datum] && objavljeno[datum].length) {
        objavljeno[datum].forEach(function (vrstica) {
          (vrstica.kode || []).forEach(function (koda) {
            var k = koda + "|" + datum;
            (out[k] = out[k] || []).push(vrstica.ime);
          });
        });
        return;
      }
      razporedDneva({
        nosilci: opts.nosilci,
        pari: opts.pari,
        kljuc: opts.kljuc,
        jeOdsoten: function (ime) { return opts.jeOdsoten(ime, datum); },
        saKoda: saKodaZa(datum),
        veljavne: opts.veljavne,
      }).forEach(function (vrstica) {
        vrstica.kode.forEach(function (koda) {
          var k = koda + "|" + datum;
          (out[k] = out[k] || []).push(vrstica.nosilec.full_name);
        });
      });
    });
    return out;
  }

  // Katere enote nosi EN objavljen zapis razporeda.
  //
  // schedule_entries ima en zapis na osebo in dan, oseba pa je pogosto na
  // več enotah - dodatne so v pokriva_oddelek (glej zdruziNzvZapise). Če
  // je pokriva_oddelek izpolnjen, je v njem CEL seznam enot tega dne in je
  // merodajen; sicer velja department_code. Kode, ki niso delovišče
  // (DEZ/NEDEZ/NZV/FLEXI), niso enota in se izpustijo.
  function enoteIzZapisa(zapis, veljavne) {
    if (!zapis) return [];
    var dovoljena = function (koda) {
      if (!jeDelovisce(koda)) return false;
      return veljavne ? veljavne.indexOf(koda) >= 0 : KODE_STOLPCEV.indexOf(koda) >= 0;
    };
    var izPokrivanja = String(zapis.pokriva_oddelek || "").split(/[\/,+]/)
      .map(function (x) { return x.trim().toUpperCase(); })
      .filter(dovoljena);
    if (izPokrivanja.length) return izPokrivanja;
    var primarna = String(zapis.department_code || "").trim().toUpperCase();
    return dovoljena(primarna) ? [primarna] : [];
  }

  // Ovoj za klicatelje, ki potrebujejo samo razpored (mreža, Razpredelnica,
  // generator) - podrobnosti o enakovrednih uporablja le pregled odstopanj.
  function razporedDneva(opts) {
    return razporedDnevaPodrobno(opts).vrstice;
  }

  return {
    VLOGE: VLOGE,
    NI_DELOVISCE: NI_DELOVISCE,
    jeDelovisce: jeDelovisce,
    ENOTE: ENOTE,
    STOLPCI: STOLPCI,
    KODE_STOLPCEV: KODE_STOLPCEV,
    KIND_KODA: KIND_KODA,
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
    razporedDnevaPodrobno: razporedDnevaPodrobno,
    razberiCelico: razberiCelico,
    predlagajZapolnitev: predlagajZapolnitev,
    zdruziNzvZapise: zdruziNzvZapise,
    zasedbaEnot: zasedbaEnot,
    enoteIzZapisa: enoteIzZapisa,
    formatirajOddelke: formatirajOddelke,
  };
})();
