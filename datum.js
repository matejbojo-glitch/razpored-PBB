/* Razpored PBB — datum.js
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

  // "27.10.2026" — osnovna oblika povsod, kjer je datum prikazan sam zase.
  function slo(vrednost) {
    var p = razcleni(vrednost);
    return p ? p.d + "." + p.m + "." + p.y : "";
  }

  // "27.10." — kadar je leto že razvidno iz konteksta (npr. mesečna tabela,
  // kjer je mesec/leto v glavi). Pika na koncu ostane, ker je v slovenščini
  // del zapisa datuma.
  function sloBrezLeta(vrednost) {
    var p = razcleni(vrednost);
    return p ? p.d + "." + p.m + "." : "";
  }

  // "27.10.2026 13:51" — za časovne žige (dnevnik sprememb ipd.).
  function sloSCasom(vrednost) {
    var p = razcleni(vrednost);
    if (!p) return "";
    var d = vrednost instanceof Date ? vrednost : new Date(vrednost);
    if (isNaN(d.getTime())) return slo(vrednost);
    return slo(vrednost) + " " + dvomestno(d.getHours()) + ":" + dvomestno(d.getMinutes());
  }

  return { slo: slo, sloBrezLeta: sloBrezLeta, sloSCasom: sloSCasom };
})();
