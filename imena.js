/* Ujemanje imen med viri – EN SAM VIR pravila.
 *
 * Isto osebo pišejo trije različni viri vsak po svoje:
 *
 *   profiles.full_name        "Mavri Tratnik Magdalena"  (kar je vpisala sama)
 *   leave_entries.full_name   "Magdalena Mavri Tratnik"  (roster, drug vrstni red)
 *   lead_departments          "MAVRI TRATNIK MAGDALENA"  (uradna predloga, velike črke)
 *
 * Poleg tega se v resničnih dokumentih pojavljajo strešične različice
 * ("Alukić" / "Alukic") in dve POTRJENI tipkarski napaki v izvornih
 * datotekah ("Horvat" namesto "Hrovat", "Tomažević" namesto "Tomaževič").
 *
 * Doslej je imel vsak zaslon svojo različico primerjave in vsaka je bila
 * drugače stroga:
 *
 *   zelje.html   vreča besed                              (brez strešic NE, psevdonimov NE)
 *   admin.html   vreča besed                              (brez strešic NE, psevdonimov NE)
 *   imenik.html  vreča besed + brez strešic               (psevdonimov NE)
 *   index.html   vreča besed + psevdonima                 (brez strešic NE)
 *
 * Posledica ni bila teoretična: ista oseba se je na enem zaslonu našla,
 * na drugem pa ne – dopust je bil viden v Imeniku in neviden v Željah.
 * Zato je tu ENA primerjava, ki zna vse troje hkrati.
 *
 * Odvisnosti: nobene.
 */
window.Imena = (function () {
  "use strict";

  // Znane, POTRJENE tipkarske napake v izvornih dokumentih (ne domneva):
  // isti osebi sta se v uradnih predlogah izmenično pisali tako in tako.
  // Namenoma samo ti dve natančni besedi.
  var PSEVDONIM = { "HORVAT": "HROVAT", "TOMAŽEVIĆ": "TOMAŽEVIČ" };

  // Strešice se v izvozih iz različnih sistemov izgubljajo, zato jih pri
  // primerjavi odstranimo. Ć in Č se oba preslikata v C: dve OSEBI, ki bi
  // se razlikovali samo po tem znaku (isti priimek, isto ime), v resnici
  // ne obstajata – preveri-imena.mjs to preveri na resničnem seznamu.
  function brezStresic(s) {
    return String(s || "").toUpperCase()
      .replace(/[ČĆ]/g, "C").replace(/Š/g, "S").replace(/Ž/g, "Z").replace(/Đ/g, "D");
  }

  // Velike črke, en presledek, popravek znanih tipkarskih napak.
  // Psevdonimi se uporabijo PRED odstranitvijo strešic, ker gre pri
  // "HORVAT" -> "HROVAT" za zamenjan vrstni red črk, ne za strešico.
  function normaliziraj(s) {
    return String(s || "").trim().toUpperCase().replace(/\s+/g, " ")
      .split(" ").map(function (b) { return PSEVDONIM[b] || b; }).join(" ");
  }

  // Ključ za primerjavo in za uporabo v Set/slovarju: "vreča besed" –
  // vrstni red besed ni pomemben, ker viri pišejo enkrat "Priimek Ime" in
  // drugič "Ime Priimek".
  function kljuc(s) {
    return brezStresic(normaliziraj(s)).split(" ").filter(Boolean).sort().join(" ");
  }

  function seUjemata(a, b) {
    var ka = kljuc(a), kb = kljuc(b);
    return !!ka && ka === kb;
  }

  // Ključ za KRATKO obliko "PRIIMEK X.", kot jo uporablja preglednica
  // "2026 SMS RAZPORED" v glavi stolpca. Primerjati ga mora s polnim
  // imenom iz Imenika, zato se oboje zvede na isto: priimek (lahko iz več
  // besed) + prva črka imena.
  //
  //   "Bećirović Nelvedin"  -> "BECIROVIC|N"
  //   "BEČIROVIĆ N."        -> "BECIROVIC|N"   (druga strešica, ista oseba)
  //
  // Prav ta razlika (Ć proti Č) je povzročila, da se Bećirović pri uvozu
  // ni povezal in je njegov stolpec ostal prazen - dobesedna primerjava
  // nizov tega ni prenesla.
  function kratkiKljuc(s) {
    var besede = brezStresic(normaliziraj(s)).replace(/\./g, " ").split(/\s+/).filter(Boolean);
    if (!besede.length) return "";
    if (besede.length === 1) return besede[0] + "|";
    return besede.slice(0, -1).join(" ") + "|" + besede[besede.length - 1].charAt(0);
  }

  // "MAVRI TRATNIK MAGDALENA" -> "Mavri". V ozkem stolpcu zadošča priimek
  // (prva beseda), polno ime je v opisu ob kazalcu.
  function kratkoIme(polno) {
    var deli = String(polno || "").trim().split(/\s+/);
    if (!deli.length || !deli[0]) return "";
    var priimek = deli[0];
    return priimek.charAt(0).toUpperCase() + priimek.slice(1).toLowerCase();
  }

  // -------------------------------------------------------------------
  // Kazalo oseb: MATIČNA ŠTEVILKA najprej, ime šele potem.
  //
  // Aplikacija je ljudi med viri doslej povezovala izključno po imenu.
  // To je vir tihih izgub: lead_departments ima imena z velikimi črkami
  // ("ALUKIĆ DINO"), profiles pa "Priimek Ime" ("Alukić Dino"), zato
  // dobesedna primerjava (.in("full_name", ...)) ne najde NIKOGAR -
  // razpored se "objavi", vsi pa so poročani kot "brez profila". Enako
  // razhajanje delajo strešice (Bećirović/Becirovic) in dvobesedni
  // priimki.
  //
  // Matična številka (profile_hr_details.employee_code) je stabilen
  // ključ iz Kadrisa in se ne spreminja, zato ima prednost; ime je
  // rezerva, ko številke ni. Iskanje po imenu gre prek kljuc(), ne
  // dobesedno - to je isto pravilo kot povsod drugod v aplikaciji.
  //
  // profili: [{ id, full_name, employee_code? }]
  // Vrne { najdi(ime, sifra), podvojeneSifre, podvojenaImena }.
  function kazalo(profili) {
    var poSifri = {}, poImenu = {};
    var podvojeneSifre = [], podvojenaImena = [];
    (profili || []).forEach(function (p) {
      var sifra = String(p.employee_code == null ? "" : p.employee_code).trim();
      if (sifra) {
        if (poSifri[sifra] && poSifri[sifra].id !== p.id) podvojeneSifre.push(sifra);
        else poSifri[sifra] = p;
      }
      var k = kljuc(p.full_name);
      if (!k) return;
      if (poImenu[k] && poImenu[k].id !== p.id) podvojenaImena.push(p.full_name);
      else poImenu[k] = p;
    });
    return {
      poSifri: poSifri,
      poImenu: poImenu,
      podvojeneSifre: podvojeneSifre,
      podvojenaImena: podvojenaImena,
      // Podvojeno ime NI zadetek: dva "Novak Ana" bi pomenila, da razpored
      // pristane pri napačni osebi. Takrat rajši nič - klicatelj to javi.
      najdi: function (ime, sifra) {
        var s = String(sifra == null ? "" : sifra).trim();
        if (s && poSifri[s]) return poSifri[s];
        var k = kljuc(ime);
        if (!k) return null;
        if (podvojenaImena.some(function (n) { return kljuc(n) === k; })) return null;
        return poImenu[k] || null;
      },
    };
  }

  return {
    PSEVDONIM: PSEVDONIM,
    brezStresic: brezStresic,
    normaliziraj: normaliziraj,
    kljuc: kljuc,
    seUjemata: seUjemata,
    kratkiKljuc: kratkiKljuc,
    kratkoIme: kratkoIme,
    kazalo: kazalo,
  };
})();
