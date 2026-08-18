#!/usr/bin/env node
/* Preizkus pdfKoscjiVTabelo() (import-utils.js) - rekonstrukcije PRAVIH
 * stolpcev iz PDF-ja.
 *
 * Doslej je uvoz iz PDF-ja vrnil samo golo besedilo (vsaka vrstica en sam
 * string), zato je bil PDF v aplikaciji povsod izrecno zavrnjen z "PDF ni
 * podprt za ta uvoz (ni stolpcev)". pdf.js pa za vsak košček besedila pove
 * tudi njegovo vodoravno lego in širino - stolpce je torej mogoče najti po
 * "navpičnem belem prostoru" med njimi.
 *
 * Fixture posnema obliko URADNEGA dokumenta "Razporeditev zaposlenih v UA in
 * DEŽ" (4 stolpci: DATUM | Urgenca ZDR | Dežurstvo ZDR | Dežurstvo dipl.
 * m.s./zn.) - dejansko preverjeno na PRAVI datoteki uporabnika (dry-run,
 * glej spodaj testa 7 in 8 za dve resnični napaki, ki ju je ta preizkus
 * ujel PREDEN je bila koda popravljena).
 *
 * Zagon: node skripte/preveri-pdf-stolpci.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(koren, "import-utils.js"), "utf8");

// import-utils.js je IIFE, ki se pripne na window in ob nalaganju ne kliče
// ničesar brskalniškega - zadošča prazen "window" objekt.
const sandbox = { window: {}, console, FileReader: function () {}, XLSX: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { pdfKoscjiVTabelo } = sandbox.window.ImportUtils;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Pomožno: en košček besedila, kot ga vrne pdf.js (x, y, širina, besedilo).
// Širina ~ 4.5 točke na znak pri 9pt pisavi - dovolj natančno za preizkus.
function k(x, y, str) { return { x, y, sirina: str.length * 4.5, str }; }

// Stolpci se začnejo pri X = 50 / 130 / 300 / 450 - med njimi je prazen pas.
// Cela imena so tu (kot pri PRAVEM dokumentu, glej pdf-koscki-dez.json v
// dry-run analizi) navadno EN sam košček na celico - "besede v isti celici
// ostanejo skupaj" torej ni tu glavno vprašanje (to preverja izoliran test
// 2b spodaj, s svojo, ločeno fixture), glavno vprašanje je STABILNA delitev
// na 4 stolpce, ko so v dokumentu ŠE druge, ne-tabelarne vrstice (naslov,
// podpisni blok) ali posamezne "pokvarjene" vrstice (glej teste 7 in 8).
const KOSCKI = [
  // glava
  k(50, 700, "DATUM"), k(130, 700, "Urgenca ZDR"), k(300, 700, "Dežurstvo ZDR"), k(450, 700, "Dežurstvo dipl. m.s./zn."),
  // 1. vrstica
  k(50, 680, "1. SO"), k(130, 680, "Žan Dovč"), k(300, 680, "Tanja Torkar"), k(450, 680, "Bojić Matej"),
  // 2. vrstica - zapis z oklepajem ostane v isti celici
  k(50, 660, "2. NE"), k(130, 660, "Ana Kos (Jana Nov)"), k(300, 660, "Grega Arnež"), k(450, 660, "Salkić Maruša"),
  // 3. vrstica - prazna celica v sredini (nihče ni razporejen)
  k(50, 640, "3. PO"), k(450, 640, "Trpin Saša"),
  // 4. vrstica
  k(50, 620, "4. TO"), k(130, 620, "Vanja Hreščak"), k(300, 620, "Ajda Skočir"), k(450, 620, "Amal Perviz"),
];

console.log("1) štirje stolpci uradnega dokumenta se pravilno ločijo");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  trdi(t.length === 5, `dobljenih 5 vrstic (glava + 4 dnevi), dobil ${t.length}`);
  jseq(t[0], ["DATUM", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."], "glava: 4 ločeni stolpci");
}

console.log("2) zapis z oklepajem ('Ime Priimek (Drugo)') ostane ena celica");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  jseq(t[2], ["2. NE", "Ana Kos (Jana Nov)", "Grega Arnež", "Salkić Maruša"], "2. vrstica: oklepajni del ni svoj stolpec");
}

console.log("2b) več BESED (ločeni koščki) v ISTI celici ostane skupaj (ne postane več stolpcev)");
{
  // Ista 4-stolpčna oblika, a tu je "Žan Dovč" ločen na dva koščka (ime,
  // priimek) - kot pdf.js občasno vrne, kadar se pisava/velikost znotraj
  // ene celice rahlo spremeni. Lastna, majhna fixture (ne mešana v glavno
  // KOSCKI), da ne vpliva na stabilnost "tipičnega števila koščkov na
  // vrstico" pri ostalih testih.
  const K2 = [
    k(50, 700, "DATUM"), k(130, 700, "Urgenca ZDR"), k(300, 700, "Dežurstvo ZDR"), k(450, 700, "Dežurstvo dipl."),
    k(50, 680, "1. SO"), k(130, 680, "Žan"), k(148, 680, "Dovč"), k(300, 680, "Tanja Torkar"), k(450, 680, "Bojić Matej"),
    k(50, 660, "2. NE"), k(130, 660, "Ajda Skočir"), k(300, 660, "Grega Arnež"), k(450, 660, "Salkić Maruša"),
  ];
  const t = pdfKoscjiVTabelo(K2);
  jseq(t[1], ["1. SO", "Žan Dovč", "Tanja Torkar", "Bojić Matej"], "ime+priimek (2 ločena koščka) združena v eno celico");
}

console.log("3) prazna celica ostane prazna, ostali stolpci se NE zamaknejo");
{
  const t = pdfKoscjiVTabelo(KOSCKI);
  jseq(t[3], ["3. PO", "", "", "Trpin Saša"], "3. vrstica: manjkajoča sredina ne premakne zadnjega stolpca");
}

console.log("4) navadno besedilo (dopis, ne preglednica) da EN stolpec");
{
  // Vse na isti levi legi, druga pod drugo - ni tabele.
  const dopis = [k(70, 700, "Zadeva: Razporeditev zaposlenih"), k(70, 685, "Spoštovani,"), k(70, 670, "v prilogi pošiljamo razpored.")];
  const t = pdfKoscjiVTabelo(dopis);
  trdi(t.every(v => v.length === 1), "brez tabele -> vsaka vrstica en sam stolpec (kličoča stran ponudi ročno urejanje)");
  trdi(t.length === 3, `tri vrstice besedila, dobil ${t.length}`);
}

console.log("5) košček brez podatka o širini (nekateri PDF-ji) ne zruši razporeda v stolpce");
{
  const brezSirine = KOSCKI.map(x => ({ ...x, sirina: 0 }));
  const t = pdfKoscjiVTabelo(brezSirine);
  jseq(t[0], ["DATUM", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."], "glava se pravilno loči tudi brez širin (ocena iz dolžine besedila)");
}

console.log("6) NASLOVNA vrstica, ki sega čez skoraj celo širino strani, NE sesuje delitve na stolpce");
{
  // Prava napaka, najdena na resničnem dokumentu "Razporeditev zaposlenih v
  // UA in DEŽ": naslov ("Zadeva: Razporeditev zaposlenih v urgentno
  // ambulanto ...") je EN sam košček, širok skoraj celo stran - če bi ta
  // košček (edini v svoji vrstici) štel pri določanju pasov, bi s svojo
  // širino premostil VSE prave meje med stolpci in ves dokument sesul v en
  // sam "stolpec". Naslov ima samo EN košček v svoji vrstici, zato mora biti
  // iz določanja pasov izključen (glej "tipično število koščkov na
  // vrstico" v pdfKoscjiVTabelo).
  const zNaslovom = [
    k(50, 750, "Zadeva: Razporeditev zaposlenih v urgentno ambulanto in neprekinjeno zdravstveno varstvo"), // 1 košček, širina ~490
    ...KOSCKI,
  ];
  const t = pdfKoscjiVTabelo(zNaslovom);
  jseq(t[0], ["Zadeva: Razporeditev zaposlenih v urgentno ambulanto in neprekinjeno zdravstveno varstvo"],
    "naslovna vrstica ostane SVOJ, en sam stolpec (ni v pasovih)");
  jseq(t[1], ["DATUM", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."],
    "glava POD naslovom se KLJUB NJEMU pravilno razdeli na 4 stolpce, ne na 1");
}

console.log("7) posamezna vrstica, kjer PDF dva soseda pomotoma združi v EN košček, ne pokvari OSTALIH vrstic");
{
  // Prava napaka na istem dokumentu: PDF je za nekaj datumov (npr. "10. 9.
  // 2026 ČE Tanja Cebin Skale") datum+dan+ime PRVEGA stolpca združil v EN
  // sam košček (namesto ločenih "10. 9. 2026" in "ČE Tanja Cebin Skale"),
  // medtem ko je za VEČINO drugih datumov ostal ločen. Taka vrstica ima
  // manj koščkov kot običajno (3 namesto 4) in je zato izključena iz
  // določanja pasov - a mora ŠE VEDNO priti v izpis (bo pristala v enem
  // od obstoječih pasov, morda nepopolno razdeljena - admin to popravi v
  // predogledu), NE sme pa vplivati na pasove, po katerih se pravilno
  // razdelijo VSE OSTALE vrstice.
  const zZdruzenoVrstico = [
    ...KOSCKI,
    k(50, 600, "5. SR Tanja Cebin Skale"), // datum+dan+ime PRVEGA stolpca v EN kosček (širina sega v stolpec "Urgenca ZDR")
    k(300, 600, "Matjaž Demšar"), // preostala dva stolpca te vrstice sta ločena kot običajno
    k(450, 600, "Amal Perviz"),
  ];
  const t = pdfKoscjiVTabelo(zZdruzenoVrstico);
  jseq(t[1], ["1. SO", "Žan Dovč", "Tanja Torkar", "Bojić Matej"],
    "obstoječa (dobro ločena) 1. vrstica je ŠE VEDNO pravilno razdeljena na 4 stolpce");
  const najdena = t.find(v => v.some(c => c.includes("Tanja Cebin Skale")));
  trdi(!!najdena, "združena vrstica (5. SR) se pojavi v izpisu, ne izgine tiho");
  trdi(!!najdena && najdena.some(c => c.includes("Matjaž Demšar")) && najdena.some(c => c.includes("Amal Perviz")),
    "preostala dva (ločena) stolpca te vrstice ostaneta pravilno razdeljena");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
