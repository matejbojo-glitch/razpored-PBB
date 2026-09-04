/* Razpored PBB – nazaj.js
 *
 * Gumb "nazaj" v brskalniku mora vrniti na PREJŠNJI POGLED, ne na prejšnjo
 * spletno stran (uporabnikovo navodilo za celotno aplikacijo, september
 * 2026).
 *
 * ZAKAJ JE BILA TEŽAVA
 * Strani so enostranske aplikacije: zavihki (Razpored → Oddelki, Generator →
 * NZV …) se preklapljajo s stanjem v Reactu, naslov v vrstici pa ostane
 * isti. Brskalnik zato o teh preklopih ne ve nič in "nazaj" odnese
 * uporabnika s strani ven - navadno na prijavo ali na prejšnjo aplikacijo.
 * Človek, ki je kliknil tri zavihke globoko, je z enim klikom izgubil vse.
 *
 * KAKO JE REŠENO
 * Izbira zavihka se zapiše v NASLOV (?tab=nzv) prek history.pushState, ob
 * "nazaj" (popstate) pa se prebere nazaj. Naslov je s tem tudi deljiv in
 * osvežitev strani ne izgubi mesta - oboje je koristno samo po sebi.
 *
 * Isti vzorec je bil že v imenik.html (odprt profil ?id=…); tu je izluščen,
 * da ga vse strani uporabljajo enako in se ne razidejo.
 *
 * UPORABA (React):
 *   const [tab, setTab] = useState(() => window.Nazaj.beri("tab", "kalup"));
 *   window.Nazaj.uporabi("tab", "kalup", setTab);      // v useEffect
 *   ... onClick={() => { setTab("nzv"); window.Nazaj.zapisi("tab", "nzv"); }}
 * ali krajše prek pomočnika:
 *   const naTab = window.Nazaj.krmar("tab", "kalup", setTab);
 *   ... onClick={() => naTab("nzv")}
 */
window.Nazaj = (function () {
  "use strict";

  function naslov() {
    try { return new URL(window.location.href); } catch (e) { return null; }
  }

  // Vrednost iz naslova; kadar je ni (ali je naslov nedostopen), privzeta.
  function beri(kljuc, privzeto) {
    var u = naslov();
    if (!u) return privzeto;
    var v = u.searchParams.get(kljuc);
    return (v === null || v === "") ? privzeto : v;
  }

  // Zapiše izbiro v naslov kot NOV vnos v zgodovini, da "nazaj" pride na
  // prejšnjo izbiro. Privzeta vrednost se iz naslova odstrani, da naslov
  // ostane čist ("?tab=kalup" ni ničesar bolj povedno kot brez njega).
  function zapisi(kljuc, vrednost, privzeto) {
    var u = naslov();
    if (!u) return;
    if (vrednost === null || vrednost === undefined || vrednost === privzeto) {
      u.searchParams.delete(kljuc);
    } else {
      u.searchParams.set(kljuc, String(vrednost));
    }
    // Isti naslov ne sme dodati vnosa v zgodovino - sicer bi bilo treba
    // "nazaj" pritisniti večkrat za en sam premik.
    if (u.href === window.location.href) return;
    try { window.history.pushState(null, "", u); } catch (e) { /* ni usodno */ }
  }

  // Poslušalec za "nazaj"/"naprej". Vrne funkcijo za odjavo, da jo je
  // mogoče neposredno vrniti iz React useEffect.
  function uporabi(kljuc, privzeto, nastavi) {
    var naSpremembo = function () { nastavi(beri(kljuc, privzeto)); };
    window.addEventListener("popstate", naSpremembo);
    return function () { window.removeEventListener("popstate", naSpremembo); };
  }

  // Pomočnik: ena funkcija, ki hkrati nastavi stanje in zapiše naslov.
  function krmar(kljuc, privzeto, nastavi) {
    return function (vrednost) {
      nastavi(vrednost);
      zapisi(kljuc, vrednost, privzeto);
    };
  }

  return { beri: beri, zapisi: zapisi, uporabi: uporabi, krmar: krmar };
})();
