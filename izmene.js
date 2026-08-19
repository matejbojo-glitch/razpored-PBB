/* Izmene: uradna legenda, barve in razvrstitev — EN SAM VIR.
 *
 * Vir: stolpec "kratica za aplikacijo" v delovnik.xlsx ("Razpored
 * delovnega časa - Služba za ZN in oskrbo", velja od 1. 7. 2022).
 *
 * Doslej so bile te iste stvari na treh mestih in vsako je poznalo drug
 * del resnice:
 *
 *   imenik.html  polna legenda (22 kratic, natančne barve in časi)
 *   index.html   classify() + BARVE — samo 7 grobih skupin
 *   admin.html   classify() + BARVE — samo 5 skupin, LD šteje kot "prosto"
 *
 * Posledica: ista izmena je bila v Imeniku ena barva, v Razporedu druga.
 * Odslej je legenda ena sama, obe grobi razvrstitvi pa sta iz nje
 * IZPELJANI, da se ne moreta razhajati.
 *
 * Odvisnosti: nobene.
 */
window.Izmene = (function () {
  "use strict";

  var STANJE_BARVA = {
    delo:     { oznaka: "D",   naziv: "Na delu",    barva: "#4F9B6B" },
    dezurstvo:{ oznaka: "DEŽ", naziv: "Dežurstvo",  barva: "#B3402A" },
    dopust:   { oznaka: "LD",  naziv: "Dopust",     barva: "#E06666" },
    bolniska: { oznaka: "BS",  naziv: "Bolniška",   barva: "#3F8F86" },
    prosto:   { oznaka: "",    naziv: "Prosto / ni v razporedu", barva: "#D8D2BE" },
  };

  // Odstranjene na uporabnikovo zahtevo (avgust 2026):
  //   DF7 "Flexi dopoldne 07:00-13:00" in DP7 "Flexi popoldne 14:00-20:00"
  //       - navzkrižno pokrivanje se ne vodi več kot svoja izmena; nobena
  //         pot v aplikaciji teh dveh kod ni ustvarjala.
  //   POM "Pomoč na drugem oddelku" - odstranjena tudi iz generatorja
  //       (tedenski preklop v admin.html -> Kalup zdaj samo še LD),
  //       zato nobena pot te kode ne ustvarja več. Če se v starih
  //       objavljenih razporedih vseeno pojavi, se izriše kot neznana
  //       koda: nevtralno siva, z besedilom "POM" - namenoma NE prazna,
  //       ker bi prazen dan izgledal kot prosto.
  //
  // URADNA legenda kratic - stolpec "kratica za aplikacijo" v delovnik.xlsx
  // ("Razpored delovnega časa - Služba za ZN in oskrbo", veljavnost od
  // 1. 7. 2022). Kratice so največ 3 znaki; edina izjema je DF12
  // (Dnevna 12 (7-19)), ki ima po dogovoru 4.
  //
  // Časi so vzeti iz LEGENDE na DNU datoteke, ne iz stolpca "Prisotnost" v
  // sredinski tabeli: pri N12/D12/DF12 sta si zapisa nasprotovala (videti je,
  // kot da so se vrstice zamaknile za eno), spodnja legenda pa je sama s
  // seboj skladna - nočna izmena je res ponoči, "(7-19)" je res 07:00-19:00 -
  // in se ujema z vrstico za pripravnike. Uporabnik je to izbiro potrdil.
  //
  // Vrstni red JE pomemben: prvo ujemanje obvelja, zato daljše/bolj določne
  // kode stojijo pred krajšimi ("DNEVNA12F" pred "DNEVNA12", "NOČNA12" in
  // "NOČNA od 19" pred "NOČNA", "popoldan do 19" pred "popoldan").
  //
  // Zapis: [vzorec, kratica, naziv, delovni čas, barva, stanje]
    var IZMENA_KRATICE = [
    [/^dežurstvo|^dezurstvo/,  "DEŽ",  "Dežurstvo (NZV)",         "PON-PET 15:30-07:00 · SO/NE in prazniki 07:00-07:00", "#B3402A", "dezurstvo"],
    // "DNEVNA12 (7-19)" je v predlogi zapisana tudi tako (49-krat v
    // 2026_SMS_RAZPORED); MORA stati pred /^dnevna12/, sicer pade na D12,
    // kar je DRUGA izmena (05:50-18:00 namesto 07:00-19:00).
    [/^dnevna12\(7-19\)|^dnevna12f/, "DF12", "Dnevna 12 (7-19)",  "SO/NE in prazniki 07:00-19:00", "#B49BD0", "delo"],
    [/^dnevna12/,              "D12",  "Dnevna 12",               "SO/NE in prazniki 05:50-18:00", "#8560A8", "delo"],
    [/^nočna12|^nocna12/,      "N12",  "Nočna 12",                "SO/NE in prazniki 17:50-06:00", "#2F4785", "delo"],
    [/^nočnaod19|^nocnaod19|^nočna11|^nocna11/, "N11", "Nočna 11 (od 19)", "PON-PET 18:50-06:00", "#7C90CE", "delo"],
    [/^nočna|^nocna/,          "N10",  "Nočna",                   "PON-PET 20:50-06:00", "#4A67B0", "delo"],
    [/^popoldando19/,          "PO5",  "Popoldan do 19",          "PON-PET 13:50-19:00", "#E8A867", "delo"],
    // "popoldan do 20" (10x v 2026_SMS_RAZPORED_2) je v uradni legendi NI.
    // Uporabnik je potrdil novo kratico po istem vzorcu kot obstoječi dve:
    // PO5 = 5 ur (do 19), PO6 = 6 ur (do 20), PO7 = 7 ur (do 21).
    [/^popoldando20/,          "PO6",  "Popoldan do 20",          "PON-PET 13:50-20:00", "#D98E4E", "delo"],
    // Omejen delovni čas (zdravstvena/zakonska omejitev na 4 oz. 6 ur na
    // dan). Vzorec /^dop\D*6/ ujame zapise kot "dopoldan (6h)",
    // "dopoldan 6 ur", "dop. 6h" - ne ujame pa "dop. 7.h-13.h" ali
    // "dopoldan (7-15h)", ker \D* ne more preskočiti števke.
    // MORA stati pred splošnima /^dopoldan/ in /^popoldan/.
    [/^dop\D*6/,               "DO6",  "Dopoldan 6 ur",           "omejitev 6 ur/dan", "#63B588", "delo"],
    [/^dop\D*4/,               "DO4",  "Dopoldan 4 ure",          "omejitev 4 ur/dan", "#A7DCC0", "delo"],
    [/^pop\D*4/,               "PO4",  "Popoldan 4 ure",          "omejitev 4 ur/dan", "#F0C08A", "delo"],
    [/^popoldan/,              "PO7",  "Popoldan",                "PON-PET 13:50-21:00", "#C9713F", "delo"],
    [/^do7|^dopoldan7/,        "DO7",  "Dopoldan (pripravnik)",   "PON-PET 07:00-14:00", "#8FCBA4", "delo"],
    // "PRISOTEN" je koda, ki jo aplikacija zapiše za NZV/vodje - to je po
    // uradni datoteki prva vrstica (DMS, PON-PET 07:00-15:00), torej DOP.
    // Ločene kratice "PRI" zato ni (uporabnikova izrecna zahteva).
    [/^dopoldan|^prisoten/,    "DOP",  "Dopoldan",                "PON-PET 05:50-14:00 · DMS/vodje 07:00-15:00", "#4F9B6B", "delo"],
    [/^kpu/,                   "KPU",  "Koriščenje prostih ur",   "", "#B8B29C", "prosto"],
    [/^ld/,                    "LD",   "Letni dopust",            "", "#E06666", "dopust"],
    [/^por/,                   "POR",  "Porodniški dopust",       "", "#E8A0C8", "dopust"],
    [/^sti/,                   "STI",  "Strokovno izobraževanje", "", "#B4A7D6", "dopust"],
    [/^bs/,                    "BS",   "Bolniški stalež",         "", "#3F8F86", "bolniska"],
  ];

  // Vrstica legende za dano kodo izmene. Vrstni red v IZMENA_KRATICE je
  // pomemben (bolj določena pravila stojijo pred splošnimi), zato se
  // vzame PRVO ujemanje.
  function vnos(sifra) {
    var t = String(sifra || "").toLowerCase().replace(/[\s.]+/g, "");
    if (!t) return null;
    // "prost" se v predlogi pojavi kot izrecna beseda, pomeni pa isto kot
    // prazna celica - ne sme dobiti kratice "PRO", ki bi izgledala kot
    // neznana izmena.
    if (t === "prost" || t === "prosto") return null;
    for (var i = 0; i < IZMENA_KRATICE.length; i++) {
      if (IZMENA_KRATICE[i][0].test(t)) return IZMENA_KRATICE[i];
    }
    return null;
  }

  // Vrstica legende po kratici (za odsotnosti iz Želja, ki nimajo kode
  // izmene - tam poznamo samo "LD"/"BS"/"STI").
  function poKratici(kratica) {
    for (var i = 0; i < IZMENA_KRATICE.length; i++) {
      if (IZMENA_KRATICE[i][1] === kratica) return IZMENA_KRATICE[i];
    }
    return null;
  }

  // "prost" v predlogi = prost dan, isto kot prazna celica.
  function jeProst(sifra) {
    var t = String(sifra || "").toLowerCase().replace(/[\s.]+/g, "");
    return t === "prost" || t === "prosto";
  }

  // Kratica za prikaz v ozki celici. Neznana koda se NE izgubi: skrajša se
  // na prve tri znake, da se vidi, da je tam nekaj vpisano - tiho prazna
  // celica bi izgledala kot prost dan, kar je pri razporedu nevarno.
  function kratica(sifra) {
    var v = vnos(sifra);
    if (v) return v[1];
    if (jeProst(sifra)) return "";
    return String(sifra || "").trim().slice(0, 3).toUpperCase();
  }

  // Polni naziv izmene (npr. "Nočna 11 (od 19)") - za opise ob kazalcu in
  // za legendo pod tabelo.
  function naziv(sifra) {
    var v = vnos(sifra);
    return v ? v[2] : String(sifra || "").trim();
  }

  // Delovni čas izmene ("PON-PET 13:50-19:00"), če je znan.
  function cas(sifra) {
    var v = vnos(sifra);
    return v ? v[3] : "";
  }

  // Barva celice; neznana koda dobi nevtralno sivo, da se loči od znanih.
  function barva(sifra) {
    var v = vnos(sifra);
    if (v) return v[4];
    return (String(sifra || "").trim() && !jeProst(sifra)) ? "#8B8672" : STANJE_BARVA.prosto.barva;
  }

  // Eno od petih stanj. Vir je ista tabela kot za kratice, da stanje in
  // barva ne moreta razhajati.
  function stanje(sifra) {
    var v = vnos(sifra);
    if (v) return v[5];
    if (jeProst(sifra)) return "prosto";
    return String(sifra || "").trim() ? "delo" : "prosto";
  }

  // Bela ali temna pisava glede na svetlost podlage (ITU-R BT.601) - brez
  // tega bi bila kratica na temni modri (N12) skoraj neberljiva.
  function barvaBesedila(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length < 6) return "#2B2717";
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#2B2717" : "#FFFFFF";
  }

  // --- Grobe skupine ---------------------------------------------------
  // Za poglede, ki ne rišejo 22 barv, ampak samo "kakšna izmena je to".
  // Namenoma NI izpeljana iz IZMENA_KRATICE po skupini (šesti stolpec) -
  // ta loči delo/dopust/bolniško, tu pa nas zanima DEL DNEVA. Ohranjena
  // je natanko tista razvrstitev, ki jo je imel index.html.
  function skupina(sifra) {
    // Brez presledkov: iz Sheets pride tudi "DNEVNA 12F" ali "NOČNA 12".
    var t = String(sifra || "").toLowerCase().replace(/\s+/g, "");
    if (t.indexOf("dežurstvo") === 0 || t.indexOf("dezurstvo") === 0) return "dez";
    if (t.indexOf("ld") === 0) return "ld";   // letni dopust - lastna barva, ločeno od KPU/prostega
    if (t.indexOf("kpu") === 0) return "off";
    if (t.indexOf("prisoten") === 0) return "dop"; // vodja je na svoji enoti (ni odsoten)
    if (t.indexOf("nočna12") >= 0) return "h12";
    if (t.indexOf("dnevna12") >= 0) return "h12";
    if (t.indexOf("nočna") === 0) return "noc";
    if (t.indexOf("dopoldan") === 0) return "dop";
    if (t.indexOf("popoldan") === 0) return "pop";
    return "off";
  }

  // Različica za GENERATOR (admin.html → Kalup): tam se šteje DEJANSKA
  // zasedba izmene na oddelku. Letni dopust, dežurstvo in oznaka
  // prisotnosti vodje ne pomenijo, da je nekdo na izmeni, zato padejo v
  // "off" - natanko tako, kot je štela prejšnja lastna kopija v
  // admin.html. Če se to zlije s skupina(), se pokritost začne šteti
  // narobe, zato sta ločeni funkciji in ne ena z zastavico.
  function skupinaGeneratorja(sifra) {
    var k = skupina(sifra);
    if (k === "dez" || k === "ld") return "off";
    var t = String(sifra || "").toLowerCase().replace(/\s+/g, "");
    if (t.indexOf("prisoten") === 0) return "off";
    return k;
  }

  // Barve grobih skupin - za poglede, ki rišejo skupino in ne posamezne
  // izmene. Usklajene z legendo: "dop" je ista zelena kot DOP, "pop" ista
  // oranžna kot PO7 itd.
  var SKUPINA_BARVA = {
    dop: "#4F9B6B", pop: "#C9713F", noc: "#4A67B0", h12: "#8560A8",
    off: "#8B8672", ld: "#E06666", dez: "#B3402A",
  };

  return {
    KRATICE: IZMENA_KRATICE,
    STANJE_BARVA: STANJE_BARVA,
    SKUPINA_BARVA: SKUPINA_BARVA,
    vnos: vnos,
    poKratici: poKratici,
    jeProst: jeProst,
    kratica: kratica,
    naziv: naziv,
    cas: cas,
    barva: barva,
    stanje: stanje,
    barvaBesedila: barvaBesedila,
    skupina: skupina,
    skupinaGeneratorja: skupinaGeneratorja,
  };
})();
