/* Razpored PBB – dopust.js
 *
 * Preostanek letnega dopusta na enem mestu za vse zaslone.
 *
 * ZAKAJ TAKO IN NE DRUGAČE
 * Stanje dopusta v Imeniku (kadrovski_podatki.leave_balance_days) pride iz
 * KADRISA in ga uvoz vsak mesec prepiše (glej sync_leave_balance_to_hr_details
 * v supabase/schema.sql). Če bi aplikacija to polje sama popravljala, bi ji
 * naslednji uvoz popravek pobrisal - dva vira bi se prepirala za isto polje.
 *
 * Zato se stanje NE prepisuje, ampak IZPELJE:
 *
 *     preostanek = stanje iz Kadrisa (na dan leave_balance_asof)
 *                − dnevi LD, vpisani v Željah OD tega dne naprej
 *
 * Kadris ostane vir resnice za izhodišče, aplikacija pa odšteje, kar je
 * bilo od takrat vpisano. Ob naslednjem uvozu se izhodišče premakne naprej
 * in okno odštevanja se samo od sebe skrči - popravka ni treba nikjer
 * razveljavljati.
 *
 * Posledica, ki jo je uporabnik zahteval: ko STI (strokovno izobraževanje)
 * prekrije dan letnega dopusta, vrstica LD izgine in preostanek se sam
 * poveča za en dan - "vrne se v kvoto", brez ročnega posega.
 *
 * ŠTEJEJO SAMO DELOVNI DNEVI. Letni dopust se v Sloveniji odmerja v
 * delovnih dneh, v Razpredelnici Želje pa je mogoče pobarvati tudi soboto,
 * nedeljo ali praznik (npr. ko se barva cel teden naenkrat). Tak dan ne
 * porabi kvote. Kateri dan je prost, pove prazniki.js - en sam vir za vse
 * zaslone, da se seznam praznikov ne podvaja.
 */
window.Dopust = (function () {
  "use strict";

  function jeDelovni(iso) {
    return !window.Prazniki.jeDelaProstDan(iso);
  }

  // Koliko dni letnega dopusta je porabljenih od vključno "odISO" naprej.
  // "datumi" je seznam ISO datumov (kind = "ld") ene osebe.
  function porabljeniDnevi(datumi, odISO) {
    var videni = {};
    (datumi || []).forEach(function (iso) {
      if (!iso) return;
      if (odISO && iso < odISO) return;      // Kadris to obdobje že upošteva
      if (!jeDelovni(iso)) return;           // vikend/praznik ne porabi kvote
      videni[iso] = true;                    // isti dan šteje enkrat
    });
    return Object.keys(videni).length;
  }

  /* stanje({ kvota, kadris, naDan, ldDatumi }) ->
   *   { kvota, kadris, naDan, porabljeno, preostanek, jeIzpeljano }
   *
   * "kvota"   – letni dopust skupaj (annual_leave_total), lahko null
   * "kadris"  – stanje iz Kadrisa (leave_balance_days), lahko null
   * "naDan"   – leave_balance_asof (ISO), lahko null
   * "ldDatumi"– ISO datumi te osebe z vpisanim LD
   *
   * Kadar stanja iz Kadrisa ni, preostanka ni mogoče izpeljati (ne vemo,
   * od kod odštevati) - vrne se null in zaslon naj pove "ni podatka".
   * Porabljeni dnevi so znani vedno, zato se vrnejo tudi takrat.
   */
  function stanje(opts) {
    opts = opts || {};
    var kadris = (opts.kadris === null || opts.kadris === undefined || opts.kadris === "")
      ? null : Number(opts.kadris);
    var kvota = (opts.kvota === null || opts.kvota === undefined || opts.kvota === "")
      ? null : Number(opts.kvota);
    var naDan = opts.naDan || null;
    var porabljeno = porabljeniDnevi(opts.ldDatumi, naDan);
    var preostanek = (kadris === null || !isFinite(kadris)) ? null : kadris - porabljeno;
    return {
      kvota: isFinite(kvota) ? kvota : null,
      kadris: (kadris !== null && isFinite(kadris)) ? kadris : null,
      naDan: naDan,
      porabljeno: porabljeno,
      preostanek: preostanek,
      // Ali se preostanek RAZLIKUJE od surovega Kadrisovega stanja - samo
      // takrat je vredno posebej pojasniti, od kod razlika.
      jeIzpeljano: porabljeno > 0,
    };
  }

  return { porabljeniDnevi: porabljeniDnevi, stanje: stanje };
})();
