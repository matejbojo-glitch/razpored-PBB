/* Razpored PBB – datum.js
 * Ena sama, skupna oblika datuma za VSO aplikacijo: dan.mesec.leto brez
 * presledkov, npr. "27.10.2026" (izrecna zahteva uporabnika).
 *
 * Zakaj skupna datoteka in ne toLocaleDateString("sl-SI") po straneh:
 * slovenska privzeta oblika vstavlja presledke ("27. 10. 2026"), kar je v
 * ozkih stolpcih (npr. stolpec DATUM v NZV mreži) povzročalo obrezano
 * besedilo ("1. 9. 20…"), obenem pa so posamezne strani uporabljale vsaka
 * svojo različico (nekje "1. sep. 2026", drugje "1. 9. 2026") - datum je bil
 * zato v aplikaciji zapisan na tri različne načine.
 *
 * Navadna (ne-Babel) datoteka, naložena kot <script src="datum.js">, enako
 * kot delovni-cas.js in import-utils.js.
 */
window.Datum = (function () {

  function dvomestno(n) { return String(n).padStart(2, "0"); }

  // Sprejme "YYYY-MM-DD" (delovni datum iz baze), poln časovni žig
  // ("2026-08-11T13:51:22+02:00", npr. obrazci.ustvarjen) ali Date.
  // ISO datum brez časa se namenoma razčleni kot BESEDILO, ne prek Date -
  // "new Date('2026-10-27')" se razume kot polnoč UTC in v časovnem pasu za
  // UTC prikaže prejšnji dan.
  function razcleni(vrednost) {
    if (vrednost == null || vrednost === "") return null;
    if (vrednost instanceof Date) {
      if (isNaN(vrednost.getTime())) return null;
      return { d: vrednost.getDate(), m: vrednost.getMonth() + 1, y: vrednost.getFullYear() };
    }
    var s = String(vrednost).trim();
    var samoDatum = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (samoDatum) return { d: Number(samoDatum[3]), m: Number(samoDatum[2]), y: Number(samoDatum[1]) };
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear() };
  }

  // "27.10.2026" – osnovna oblika povsod, kjer je datum prikazan sam zase.
  function slo(vrednost) {
    var p = razcleni(vrednost);
    return p ? p.d + "." + p.m + "." + p.y : "";
  }

  // "27.10." – kadar je leto že razvidno iz konteksta (npr. mesečna tabela,
  // kjer je mesec/leto v glavi). Pika na koncu ostane, ker je v slovenščini
  // del zapisa datuma.
  function sloBrezLeta(vrednost) {
    var p = razcleni(vrednost);
    return p ? p.d + "." + p.m + "." : "";
  }

  // "13:51" – samo ura, kadar je dan razviden iz konteksta (npr.
  // "Shranjeno 13:51" takoj po shranjevanju).
  function cas(vrednost) {
    var d = vrednost instanceof Date ? vrednost : new Date(vrednost);
    if (isNaN(d.getTime())) return "";
    return dvomestno(d.getHours()) + ":" + dvomestno(d.getMinutes());
  }

  // "27.10.2026 13:51" – za časovne žige (dnevnik sprememb ipd.).
  function sloSCasom(vrednost) {
    var p = razcleni(vrednost);
    if (!p) return "";
    var d = vrednost instanceof Date ? vrednost : new Date(vrednost);
    if (isNaN(d.getTime())) return slo(vrednost);
    return slo(vrednost) + " " + dvomestno(d.getHours()) + ":" + dvomestno(d.getMinutes());
  }

  // -------------------------------------------------------------------
  // Koledarski izračuni
  //
  // Doslej je imela vsaka stran svojo različico istih štirih računov
  // (zadnji dan v mesecu, sestava ISO datuma, obseg meseca, seznam dni) -
  // ponekod v lokalnem času, drugod v UTC, z dvema različnima naboroma
  // kratic za dneve. Izidi so bili enaki, a nič ni jamčilo, da tako
  // ostane. Tu je en sam vir.
  //
  // Dogovor: mesec je VEDNO 1-12 (kot ga bere človek in kot je v
  // "YYYY-MM"), nikoli 0-11 kot pri Date - prav ta razlika je bila v
  // starih kopijah vir zmede.
  // -------------------------------------------------------------------

  // ISO datum se razčleni kot BESEDILO in sestavi ob 12:00 lokalno, ne
  // prek "new Date(iso)" - ta se razume kot polnoč UTC in v časovnem pasu
  // za UTC vrne prejšnji dan. Ista previdnost kot v prazniki.js.
  function vDatum(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }

  // Zadnji dan v mesecu (28-31). "Dan 0 naslednjega meseca" je zadnji dan
  // tega - zato mesec tu ni zmanjšan za 1.
  function zadnjiDan(leto, mesec) {
    return new Date(Number(leto), Number(mesec), 0).getDate();
  }

  // "YYYY-MM-DD" iz sestavnih delov (mesec 1-12).
  function iso(leto, mesec, dan) {
    return leto + "-" + dvomestno(mesec) + "-" + dvomestno(dan);
  }

  // "2026-11" -> { startISO: "2026-11-01", endISO: "2026-11-30" }
  function obseg(mesecStr) {
    var d = String(mesecStr || "").split("-");
    var leto = Number(d[0]), mesec = Number(d[1]);
    return { startISO: iso(leto, mesec, 1), endISO: iso(leto, mesec, zadnjiDan(leto, mesec)) };
  }

  // Kratici dneva sta v aplikaciji DVE in obe sta v rabi:
  //   dan2 "PO TO SR ČE PE SO NE"    - ozki stolpci (Moj razpored, NZV mreža)
  //   dan3 "PON TOR SRE ČET PET SOB NED" - širši (Kalup, Želje)
  // Računa se iz istega mesta, izpis pa ostaja tak, kot je bil.
  var DAN2 = ["PO", "TO", "SR", "ČE", "PE", "SO", "NE"];       // 0 = ponedeljek
  var DAN3 = ["NED", "PON", "TOR", "SRE", "ČET", "PET", "SOB"]; // 0 = nedelja

  function dan2(isoDatum) {
    var d = vDatum(isoDatum);
    return d ? DAN2[(d.getDay() + 6) % 7] : "";
  }
  function dan3(isoDatum) {
    var d = vDatum(isoDatum);
    return d ? DAN3[d.getDay()] : "";
  }

  // "2026-08" -> "avgust 2026". Ime meseca je zapisano tu in ne prek
  // toLocaleDateString("sl-SI"): tam bi bilo treba sestaviti Date iz
  // "2026-08-01", kar je polnoč UTC in v pasu za UTC vrne julij.
  var MESECI = ["januar", "februar", "marec", "april", "maj", "junij",
                "julij", "avgust", "september", "oktober", "november", "december"];
  function mesecLeto(mesecStr) {
    var d = String(mesecStr || "").split("-");
    var m = Number(d[1]);
    if (!(m >= 1 && m <= 12)) return "";
    return MESECI[m - 1] + " " + d[0];
  }

  // Vsi dnevi med dvema ISO datuma (oba vključena):
  //   [{ datum: "2026-11-01", dan: "NE" }, ...]
  function dnevi(startISO, endISO) {
    var out = [];
    var d = vDatum(startISO), konec = vDatum(endISO);
    if (!d || !konec) return out;
    while (d.getTime() <= konec.getTime()) {
      out.push({ datum: iso(d.getFullYear(), d.getMonth() + 1, d.getDate()), dan: DAN2[(d.getDay() + 6) % 7] });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  return {
    slo: slo, sloBrezLeta: sloBrezLeta, sloSCasom: sloSCasom, cas: cas,
    zadnjiDan: zadnjiDan, iso: iso, obseg: obseg, mesecLeto: mesecLeto, MESECI: MESECI,
    dan2: dan2, dan3: dan3, dnevi: dnevi,
  };
})();
