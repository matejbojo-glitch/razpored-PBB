/* Razpored PBB – src/shared/delovni-cas.js
 *
 * EDINI vir resnice o izmenah (ure, trajanje, ali je nočna), o
 * delovnopravnih pravilih IN o dela prostih dnevih (vikendi, prazniki).
 * Prej je bilo to razbito na tri mesta: koreski delovni-cas.js (brskalnik),
 * supabase/functions/_shared/delovni-cas.js (ročna bajt-za-bajt kopija za
 * Edge Function) in prazniki.js (prazniki/vikendi, ločeno). Tu je združeno
 * v en pravi ES modul, ki ga Edge funkcije in Node skripte uvozijo
 * neposredno (import), namesto da bi vsaka gradila svojo kopijo.
 *
 * Brskalniške strani (index.html, admin.html, obrazec.html …) tega modula
 * NE nalagajo neposredno – nalagajo se klasično prek <script src=
 * "delovni-cas.js">, ki mora ostati brez `import`/`export`, da ga brskalnik
 * izvede sinhrono, v točno določenem vrstnem redu z ostalimi <script>
 * značkami (glej opombo na vrhu korenskega delovni-cas.js). Zato korenska
 * datoteka ostaja svoja, ročno usklajena kopija te logike – ne re-export.
 *
 * Ure so iz uradne legende "Razpored delovnega časa – Služba za ZN in
 * oskrbo" (velja od 1. 7. 2022). Prazniki so slovenski DELA PROSTI dnevi.
 */

// code -> { zacetek, konec, ure, nocna, naziv }
// "zacetek"/"konec" sta "HH:MM"; konec <= zacetek pomeni prehod čez polnoč.
export const IZMENE = {
  "dopoldan":         { zacetek: "05:50", konec: "14:00", ure: 8 + 10/60,  nocna: false },
  "popoldan":         { zacetek: "13:50", konec: "21:00", ure: 7 + 10/60,  nocna: false },
  "popoldan do 19":   { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
  "popoldan do 19h":  { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
  "NOČNA":            { zacetek: "20:50", konec: "06:00", ure: 9 + 10/60,  nocna: true },
  "NOČNA od 19":      { zacetek: "18:50", konec: "06:00", ure: 11 + 10/60, nocna: true },
  "NOČNA od 19h":     { zacetek: "18:50", konec: "06:00", ure: 11 + 10/60, nocna: true },
  "NOČNA12":          { zacetek: "17:50", konec: "06:00", ure: 12 + 10/60, nocna: true },
  // Dnevni 12-urni izmeni sta DVE in nista izmenljivi:
  //   DNEVNA12  05:50-18:00 - oddelčna (10-minutna predaja kot pri vseh
  //             ostalih izmenah: ob 18:00 prevzame NOČNA12 ob 17:50),
  //             zato dejansko traja 12 h 10 min.
  //   DNEVNA12F 07:00-19:00 - flexi ("F"), točno 12 h, brez predaje.
  "DNEVNA12":         { zacetek: "05:50", konec: "18:00", ure: 12 + 10/60, nocna: false },
  "DNEVNA12F":        { zacetek: "07:00", konec: "19:00", ure: 12,         nocna: false },
  // Dežurstvo: med tednom 15:30-07:00, ob vikendih/praznikih 24 h
  // (07:00-07:00). Tu je zapisana samo delavniška varianta in BREZ ur -
  // vikend varianta bi zahtevala logiko po dnevu v tednu, ki je
  // aplikacija še nima. Zato dežurstvo tudi ne šteje v obračun ur
  // (glej zavihek Plače, kjer je prikazano kot število, ne ure).
  "DEŽURSTVO":        { zacetek: "15:30", konec: "07:00", ure: null,       nocna: true },
  // Vodje in administratorji (DMS): redni delovnik 07:00-15:00, torej
  // natanko 8 ur brez 10-minutne predaje, ki jo imajo oddelčne izmene.
  "PRISOTEN":         { zacetek: "07:00", konec: "15:00", ure: 8,          nocna: false },
  // Ista izmena, nov zapis (velika začetnica, kot v uradni legendi). Ključ
  // se normalizira z male-črke-brez-presledkov, zato "Nočna 12" in
  // "Dnevna 12" že sama padeta na "NOČNA12"/"DNEVNA12".
  "Dopoldne":         { zacetek: "05:50", konec: "14:00", ure: 8 + 10/60,  nocna: false },
  "Popoldne":         { zacetek: "13:50", konec: "21:00", ure: 7 + 10/60,  nocna: false },
  "Popoldne do 19":   { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
  "Popoldne do 19h":  { zacetek: "13:50", konec: "19:00", ure: 5 + 10/60,  nocna: false },
};

// Kode, ki NISO delo (odsotnost/prosto) – ne štejejo v počitek niti v ure.
// "KRO" (kroženje) je tu, ker oseba tisti dan res dela, a po razporedu
// DRUGEGA oddelka: njenih ur in časa izmene matični razpored ne pozna,
// zato bi vsaka predpostavka o njiju (npr. 07:00-15:00) lažno sprožila
// ali potlačila pravilo o počitku.
export const NI_DELO = ["LD", "KPU", "BS", "STI", "POR", "KRO", ""];

// Privzeta delovnopravna pravila. NAMENOMA nastavljiva (in ne trdo
// zapisana v kodo), ker gre za razlago kolektivne pogodbe/ZDR-1 in jih
// mora potrditi kadrovska – tu so samo izhodiščne vrednosti.
export const PRIVZETA_PRAVILA = {
  minPocitekUr: 10.7,            // najmanj ur med koncem ene in začetkom naslednje izmene
  // Dve meji, ne ena (uporabnikovo pravilo, avgust 2026): do 3 zaporedne
  // nočne so običajne in se ne javljajo. Nad tem gre "po dogovoru" - to je
  // opozorilo, ne napaka. Nad absolutno mejo pa ni več dogovora.
  //
  // Prej je bila meja 2, kar je pomenilo, da je že SAM kalup (vzorec B ima
  // tri zaporedne nočne) v vsakem razporedu javljal kršitve - opozorilo,
  // ki se pojavi vedno, nima nobene vrednosti.
  maxZaporednihNocnih: 3,        // do sem brez pripombe
  absolutnoMaxZaporednihNocnih: 5, // nad tem kritično, ne glede na dogovor
  maxTedenskihUr: 56,            // zgornja meja ur v 7 zaporednih dneh (opozorilo)
  zahtevajProstDanNaTeden: true, // vsaj en dan brez izmene v vsakem oknu 7 dni
};

// Zakonski razlogi za izjemo (prekoračitev), po katerih se izjema lahko
// evidentira namesto da bi bila obravnavana kot kršitev.
export const RAZLOGI_IZJEME = {
  POVECAN_OBSEG_DELA: "Povečan obseg dela",
  NEPRICAKOVANA_ODSOTNOST: "Nepričakovana odsotnost",
  NEPREKINJENO_ZDR_VARSTVO: "Neprekinjeno zdravstveno varstvo",
  MATERIALNA_SKODA_ZDRAVJE: "Preprečitev materialne škode / nevarnosti za zdravje",
  ODPRAVLJANJE_NESREC: "Odpravljanje posledic nesreč",
  NAGLA_OKVARA_SREDSTEV: "Nagla okvara delovnih sredstev",
};

// Razpored se uvaža iz Google Sheets, kjer isto izmeno kdo zapiše
// "DNEVNA12F", kdo "DNEVNA 12 F" in kdo z malimi črkami. Iskanje zato
// teče po ključu brez presledkov in v malih črkah.
// "(M)" na koncu kode = mentor pripravniku tisto izmeno (npr.
// "dopoldan (M)"). Ni svoja izmena - ure, trajanje in pravila počitka so
// od osnovne izmene, zato se pripona pri iskanju ključa odreže. Brez
// tega je "dopoldan (M)" neznana koda: 0 ur v obračunu plač in izmena,
// ki je pravilo počitka po nočni sploh ne vidi.
export function kljuc(s) { return (s || "").toLowerCase().replace(/\(\s*m\s*\)\s*$/, "").replace(/\s+/g, ""); }

const INDEKS = {};
Object.keys(IZMENE).forEach((k) => { INDEKS[kljuc(k)] = k; });
const NI_DELO_INDEKS = {};
NI_DELO.forEach((k) => { NI_DELO_INDEKS[kljuc(k)] = true; });

// Dežurstvo (NZV, 15:30-07:00) se obravnava posebej pri počitku - glej
// pocitekMedIzmenama spodaj.
export function jeDezurstvo(sifra) {
  return kljuc(sifra) === kljuc("DEŽURSTVO");
}

export function jeDelo(sifra) {
  const k = kljuc(sifra);
  if (NI_DELO_INDEKS[k]) return false;
  return !!INDEKS[k];
}

export function podatkiIzmene(sifra) {
  const kanonicna = INDEKS[kljuc(sifra)];
  return kanonicna ? IZMENE[kanonicna] : null;
}

// "HH:MM" -> minute od polnoči
function vMinute(hhmm) {
  const d = hhmm.split(":");
  return Number(d[0]) * 60 + Number(d[1]);
}

// Trajanje med dvema urama znotraj enega dne, s prehodom čez polnoč: če je
// "konec" <= "zacetek", se šteje, da izmena traja do te ure NASLEDNJI dan.
export function trajanjeUr(zacetekHHMM, konecHHMM) {
  const z = vMinute(zacetekHHMM), k = vMinute(konecHHMM);
  let minute = k - z;
  if (minute <= 0) minute += 24 * 60;
  return minute / 60;
}

// Vrne { zacetek: Date, konec: Date } za izmeno na dani ISO dan.
// Če se izmena konča ob uri, ki je <= začetku, se konča naslednji dan.
export function casovniOkvir(isoDan, sifra) {
  const izm = podatkiIzmene(sifra);
  if (!izm) return null;
  const zac = new Date(isoDan + "T00:00:00Z");
  zac.setUTCMinutes(vMinute(izm.zacetek));
  const kon = new Date(isoDan + "T00:00:00Z");
  kon.setUTCMinutes(vMinute(izm.konec));
  if (vMinute(izm.konec) <= vMinute(izm.zacetek)) kon.setUTCDate(kon.getUTCDate() + 1);
  return { zacetek: zac, konec: kon };
}

function razlikaUr(a, b) { return (b.getTime() - a.getTime()) / 3600000; }

export function dodajDni(isoDan, n) {
  const d = new Date(isoDan + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Koliko ur izmene pade v nočni okvir 22:00-06:00. Ločeno od IZMENE[...].ure
// (skupno trajanje izmene, uradna vrednost iz legende za obračun plač) in od
// IZMENE[...].nocna (samo da/ne, ali gre za "nočno izmeno" po imenu) - to je
// dejansko preštetih ur v uradnem nočnem oknu, npr. za doplačilo za nočno
// delo pri izmenah, ki se le deloma prekrivajo z njim (npr. "dopoldan", ki
// se začne ob 05:50).
export function nocneUreIzmene(isoDan, sifra) {
  const okvir = casovniOkvir(isoDan, sifra);
  if (!okvir) return 0;
  let ure = 0;
  [dodajDni(isoDan, -1), isoDan].forEach((dan) => {
    const nocZacetek = new Date(dan + "T00:00:00Z");
    nocZacetek.setUTCHours(22, 0, 0, 0);
    const nocKonec = new Date(dan + "T00:00:00Z");
    nocKonec.setUTCDate(nocKonec.getUTCDate() + 1);
    nocKonec.setUTCHours(6, 0, 0, 0);
    const od = okvir.zacetek > nocZacetek ? okvir.zacetek : nocZacetek;
    const doInc = okvir.konec < nocKonec ? okvir.konec : nocKonec;
    if (doInc > od) ure += razlikaUr(od, doInc);
  });
  return ure;
}

// --- Prazniki in vikendi (prej prazniki.js, zdaj združeno tu) ------------

// Velikonočna nedelja po anonimnem gregorijanskem algoritmu - potrebna,
// ker sta velikonočni ponedeljek in binkoštna nedelja premakljiva.
export function velikaNoc(leto) {
  const a = leto % 19, b = Math.floor(leto / 100), c = leto % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesec = Math.floor((h + l - 7 * m + 114) / 31);
  const dan = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(leto, mesec - 1, dan, 12);
}

function prazniskiKljuc(d) {
  const p = (n) => (String(n).length < 2 ? "0" + n : String(n));
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function zamikDni(d, dni) {
  const n = new Date(d.getTime());
  n.setDate(n.getDate() + dni);
  return n;
}

// Samo DELA PROSTI dnevi. Praznikov, ki dela NISO prosti (17. avgust,
// 15. september, 23. november), tu namenoma ni - na razpored ne vplivajo.
const STALNI_PRAZNIKI = [
  ["01-01", "novo leto"],
  ["01-02", "novo leto"],
  ["02-08", "Prešernov dan"],
  ["04-27", "dan upora proti okupatorju"],
  ["05-01", "praznik dela"],
  ["05-02", "praznik dela"],
  ["06-25", "dan državnosti"],
  ["08-15", "Marijino vnebovzetje"],
  ["10-31", "dan reformacije"],
  ["11-01", "dan spomina na mrtve"],
  ["12-25", "božič"],
  ["12-26", "dan samostojnosti in enotnosti"],
];

const praznikiPredpomnilnik = {};
function prazniciZaLeto(leto) {
  if (praznikiPredpomnilnik[leto]) return praznikiPredpomnilnik[leto];
  const m = {};
  STALNI_PRAZNIKI.forEach((p) => { m[leto + "-" + p[0]] = p[1]; });
  const vn = velikaNoc(leto);
  m[prazniskiKljuc(vn)] = "velikonočna nedelja";
  m[prazniskiKljuc(zamikDni(vn, 1))] = "velikonočni ponedeljek";
  m[prazniskiKljuc(zamikDni(vn, 49))] = "binkoštna nedelja";
  praznikiPredpomnilnik[leto] = m;
  return m;
}

// Datum se razčleni kot BESEDILO in sestavi ob 12:00 lokalnega časa - z
// "new Date(iso)" bi ga brskalnik v časovnem pasu za UTC premaknil na
// prejšnji dan.
function razcleniDatum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function jePraznik(iso) {
  const d = razcleniDatum(iso);
  return d ? !!prazniciZaLeto(d.getFullYear())[iso] : false;
}
export function nazivPraznika(iso) {
  const d = razcleniDatum(iso);
  return d ? (prazniciZaLeto(d.getFullYear())[iso] || "") : "";
}
export function jeVikend(iso) {
  const d = razcleniDatum(iso);
  if (!d) return false;
  const w = d.getDay();
  return w === 0 || w === 6;
}
// Sobota, nedelja ALI dela prost praznik.
export function jeDelaProstDan(iso) {
  return jeVikend(iso) || jePraznik(iso);
}

// --- Delovnopravna pravila -------------------------------------------------

// Počitek (v urah) med koncem prejšnje in začetkom naslednje izmene iste
// osebe. Vrne null, če ene od obeh šifer ne pozna (ni bilo mogoče izračunati
// časovnega okvira).
export function pocitekMedIzmenama(prejDatum, prejSifra, datumDatum, datumSifra) {
  const prej = casovniOkvir(prejDatum, prejSifra);
  const zdaj = casovniOkvir(datumDatum, datumSifra);
  if (!prej || !zdaj) return null;
  return razlikaUr(prej.konec, zdaj.zacetek);
}

/**
 * Preveri delovnopravna pravila za enega ali več zaposlenih.
 *
 * vnosi: [{ oseba, datum (ISO), sifra, izjema? }]
 *   "izjema" (true) pomeni, da je prekoračitev že evidentirana kot
 *   zakonska izjema – takrat se kršitev prijavi kot opozorilo, ne kot
 *   kritična napaka.
 * pravila: glej PRIVZETA_PRAVILA (delni objekt je dovolj)
 *
 * Vrne: [{ oseba, datum, vrsta, resnost: "kriticno"|"opozorilo", sporocilo }]
 */
export function preveriPravila(vnosi, pravila) {
  const p = Object.assign({}, PRIVZETA_PRAVILA, pravila || {});
  const krsitve = [];

  // Skupine po osebi, urejene po datumu.
  const poOsebi = {};
  (vnosi || []).forEach((v) => {
    if (!v || !v.datum) return;
    (poOsebi[v.oseba] = poOsebi[v.oseba] || []).push(v);
  });

  Object.keys(poOsebi).forEach((oseba) => {
    const seznam = poOsebi[oseba].slice().sort((a, b) =>
      a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
    const delovni = seznam.filter((v) => jeDelo(v.sifra));

    // --- 1) počitek med zaporednima izmenama ---
    for (let i = 1; i < delovni.length; i++) {
      // PO DEŽURSTVU sledi normalen delovnik in to je PRIČAKOVANO stanje,
      // ne kršitev: tako se zagotavlja neprekinjeno zdravstveno varstvo
      // (odločitev vodstva ZN, avgust 2026). Izjema velja SAMO za prehod
      // IZ dežurstva; prehod V dežurstvo in vsi ostali prehodi se
      // preverjajo naprej.
      if (jeDezurstvo(delovni[i - 1].sifra)) continue;
      const pocitek = pocitekMedIzmenama(
        delovni[i - 1].datum, delovni[i - 1].sifra,
        delovni[i].datum, delovni[i].sifra,
      );
      if (pocitek == null) continue;
      if (pocitek < p.minPocitekUr) {
        const jeIzjema = !!(delovni[i].izjema || delovni[i - 1].izjema);
        krsitve.push({
          oseba, datum: delovni[i].datum, vrsta: "pocitek",
          resnost: jeIzjema ? "opozorilo" : "kriticno",
          sporocilo: (pocitek < 0
              ? "Izmeni se prekrivata (" + delovni[i - 1].sifra + " → " + delovni[i].sifra + ")"
              : "Le " + (Math.round(pocitek * 10) / 10) + " h počitka med izmenama ("
                + delovni[i - 1].sifra + " → " + delovni[i].sifra + ")")
            + ", zahtevanih je " + p.minPocitekUr + " h."
            + (jeIzjema ? " Evidentirano kot izjema." : ""),
        });
      }
    }

    // --- 2) zaporedne nočne izmene ---
    let niz = 0, zacetekNiza = null, prejsnjiDatum = null;
    delovni.forEach((v) => {
      const izm = podatkiIzmene(v.sifra);
      const nocna = izm && izm.nocna;
      const zaporedni = prejsnjiDatum && dodajDni(prejsnjiDatum, 1) === v.datum;
      if (nocna && (zaporedni || niz === 0)) {
        if (niz === 0) zacetekNiza = v.datum;
        niz++;
      } else if (nocna) {
        niz = 1; zacetekNiza = v.datum;
      } else {
        niz = 0; zacetekNiza = null;
      }
      const absolutno = p.absolutnoMaxZaporednihNocnih;
      if (absolutno != null && niz > absolutno) {
        // Nad absolutno mejo dogovor ne pomaga - zato "kritično" tudi, če
        // je izjema evidentirana.
        krsitve.push({
          oseba, datum: v.datum, vrsta: "nocne",
          resnost: "kriticno",
          sporocilo: "Zaporednih nočnih izmen: " + niz + " (od " + zacetekNiza
            + ") – nad absolutno mejo " + absolutno + ", tega ni mogoče dogovoriti.",
        });
      } else if (niz > p.maxZaporednihNocnih) {
        // Med običajno in absolutno mejo: dopustno po dogovoru, zato
        // opozorilo in ne napaka.
        krsitve.push({
          oseba, datum: v.datum, vrsta: "nocne",
          resnost: "opozorilo",
          sporocilo: "Zaporednih nočnih izmen: " + niz + " (od " + zacetekNiza
            + ") – nad običajnimi " + p.maxZaporednihNocnih + ", dopustno po dogovoru"
            + (absolutno != null ? " do " + absolutno : "") + "."
            + (v.izjema ? " Evidentirano kot izjema." : ""),
        });
      }
      prejsnjiDatum = v.datum;
    });

    // --- 3) tedenske ure in prost dan v vsakem oknu 7 dni ---
    if (delovni.length) {
      const poDatumu = {};
      delovni.forEach((v) => { poDatumu[v.datum] = v; });
      const prvi = delovni[0].datum, zadnji = delovni[delovni.length - 1].datum;
      for (let d = prvi; d <= zadnji; d = dodajDni(d, 1)) {
        let ure = 0, delovnihDni = 0;
        for (let k = 0; k < 7; k++) {
          const dan = dodajDni(d, k);
          if (dan > zadnji) break;
          const v2 = poDatumu[dan];
          if (v2) {
            delovnihDni++;
            const izm2 = podatkiIzmene(v2.sifra);
            if (izm2 && izm2.ure) ure += izm2.ure;
          }
        }
        if (dodajDni(d, 6) > zadnji) break; // nepopolno okno – ne ocenjujemo
        if (ure > p.maxTedenskihUr) {
          krsitve.push({
            oseba, datum: d, vrsta: "tedenskeUre", resnost: "opozorilo",
            sporocilo: Math.round(ure) + " ur v 7 dneh od " + d + " (meja " + p.maxTedenskihUr + " h).",
          });
        }
        if (p.zahtevajProstDanNaTeden && delovnihDni === 7) {
          krsitve.push({
            oseba, datum: d, vrsta: "prostDan", resnost: "kriticno",
            sporocilo: "7 zaporednih delovnih dni od " + d + " – brez prostega dne.",
          });
        }
      }
    }
  });

  return krsitve;
}

// Povzetek za prikaz: koliko kritičnih in koliko opozoril.
export function povzetek(krsitve) {
  const kriticnih = krsitve.filter((k) => k.resnost === "kriticno").length;
  return { skupaj: krsitve.length, kriticnih, opozoril: krsitve.length - kriticnih };
}

// --- Uradni šifrant kratic (CLAUDE.md "Uradni šifrant kratic in izmen") -
//
// Ločeno od IZMENE zgoraj (drug, krajši nabor kod - DF12/D12/N12 ipd. - ki
// ga generator/aplikacija trenutno ne oddajata; ta šifrant je uradna
// referenca za obračun ur po kratici). DEŽ nima trdne vrednosti - glej
// ureDezurstva spodaj (medtedensko proti vikend/praznik).
export const URE_SIFRANT = {
  DF12: 12, D12: 12, N12: 12, N11: 11, N10: 10,
  PO5: 5, PO6: 6, DO6: 6, DO4: 4, PO4: 4, PO7: 7, DO7: 7, DOP: 8,
  LD: 8, POR: 8, STI: 8, BS: 8,
  // KRO: delovni dan na drugem oddelku. Ur tiste izmene matični razpored
  // ne pozna, zato se šteje kot poln delovni dan (8 h) - enako kot ostale
  // kode brez lastnega urnika.
  KRO: 8,
  KPU: 0, "": 0,
};

// Nočne izmene in kode, ki jim naslednji dan (11-urni počitek) NE smejo
// slediti - dnevne/dopoldanske izmene.
export const NOCNE_IZMENE = ["N12", "N11", "N10"];
export const PREPOVEDANE_PO_NOCNI = ["DF12", "D12", "DOP", "DO7", "DO6", "DO4"];

// Ali je prehod iz prejsnjaIzmena v naslednjaIzmena skladen z 11-urnim
// počitkom po nočni izmeni. false SAMO, če je prejšnja izmena nočna IN je
// naslednja na seznamu prepovedanih - vsi drugi prehodi so v redu.
export function preveriPocitek(prejsnjaIzmena, naslednjaIzmena) {
  if (NOCNE_IZMENE.indexOf(prejsnjaIzmena) === -1) return true;
  return PREPOVEDANE_PO_NOCNI.indexOf(naslednjaIzmena) === -1;
}

// Ure dežurstva (DEŽ) za en dan: med tednom 15:30-07:00 (15,5 h), ob
// vikendih in praznikih 07:00-07:00 (24 h) - isto razlikovanje kot pri
// DEŽURSTVO v IZMENE zgoraj.
export function ureDezurstva(iso) {
  return jeDelaProstDan(iso) ? 24 : 15.5;
}

// Vsota ur po URE_SIFRANT za poljuben seznam vnosov (npr. cel mesec ene
// osebe). vnosi: [{ datum (ISO), sifra }]. "DEŽ" se izračuna po datumu
// (ureDezurstva), neznane kode ne štejejo (0), ne vržejo napake.
export function izracunajUreMeseca(vnosi) {
  return (vnosi || []).reduce((vsota, v) => {
    if (!v) return vsota;
    if (v.sifra === "DEŽ") return vsota + ureDezurstva(v.datum);
    if (Object.prototype.hasOwnProperty.call(URE_SIFRANT, v.sifra)) return vsota + URE_SIFRANT[v.sifra];
    return vsota;
  }, 0);
}

// Ali dejansko število zaposlenih doseže zahtevani minimum. Splošen,
// samostojen preverjevalnik - klicatelj sam prešteje dejansko zasedbo (ni
// povezave na minimalna_zasedba v bazi).
export function preveriMinimalnoZasedbo(dejanskoStevilo, minimalnoStevilo) {
  return dejanskoStevilo >= minimalnoStevilo;
}
