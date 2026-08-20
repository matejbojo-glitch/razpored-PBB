#!/usr/bin/env node
/* Preizkus prazniki.js – slovenski dela prosti dnevi in skupno pravilo
 * "kdaj je za NZV prost dan".
 *
 * Ozadje: uporabnik je pravilo ponovil že večkrat ("delovnik od ponedeljka
 * do petka, sobota nedelja IN PRAZNIKI prosto, razen dežurstvo"), vsakič
 * pa se je pokazalo, da kje manjka - nazadnje v Imenik -> Razpredelnica,
 * kjer je Alukić Dino v nedeljo 2. 8. 2026 kazal "LD", v nedeljah 9. in
 * 16. 8. pa "DOP".
 *
 * Vzrok je bil vsakič isti: pravilo je bilo napisano posebej na vsakem
 * zaslonu. Zato je zdaj en sam vir (prazniki.js), ta preizkus pa poleg
 * samih datumov preverja tudi, da ga VSI trije zasloni res uporabljajo.
 *
 * Zagon: node skripte/preveri-prazniki.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
const P = sandbox.window.Prazniki;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) { trdi(a === b, opis + (a === b ? "" : ` – dobil "${a}", pričakoval "${b}"`)); }

console.log("1) stalni dela prosti dnevi");
{
  [["2026-01-01", "novo leto"], ["2026-01-02", "novo leto"], ["2026-02-08", "Prešernov dan"],
   ["2026-04-27", "dan upora proti okupatorju"], ["2026-05-01", "praznik dela"],
   ["2026-05-02", "praznik dela"], ["2026-06-25", "dan državnosti"],
   ["2026-08-15", "Marijino vnebovzetje"], ["2026-10-31", "dan reformacije"],
   ["2026-11-01", "dan spomina na mrtve"], ["2026-12-25", "božič"],
   ["2026-12-26", "dan samostojnosti in enotnosti"]].forEach(([d, n]) => eq(P.naziv(d), n, d));
}

console.log("2) premakljivi prazniki (velika noč se računa, ne prepisuje)");
{
  eq(P.naziv("2026-04-05"), "velikonočna nedelja", "2026");
  eq(P.naziv("2026-04-06"), "velikonočni ponedeljek", "2026");
  eq(P.naziv("2026-05-24"), "binkoštna nedelja", "2026 (49 dni po veliki noči)");
  eq(P.naziv("2027-03-28"), "velikonočna nedelja", "2027 – drugo leto, drug datum");
  eq(P.naziv("2027-03-29"), "velikonočni ponedeljek", "2027");
  eq(P.naziv("2025-04-21"), "velikonočni ponedeljek", "2025 – nazaj v preteklost");
}

console.log("3) prazniki, ki dela NISO prosti, se NE štejejo");
{
  // Sicer bi razpored po nepotrebnem izpraznil delovne dneve.
  [["2026-08-17", "združitev prekmurskih Slovencev"],
   ["2026-09-15", "vrnitev Primorske"],
   ["2026-11-23", "Rudolf Maister"]].forEach(([d, kaj]) => {
    eq(P.naziv(d), "", `${d} (${kaj}) ni dela prost`);
    trdi(!P.jePraznik(d), `${d} torej ni "praznik" za razpored`);
  });
}

console.log("4) vikend in kombinacija");
{
  trdi(P.jeVikend("2026-08-01"), "1. 8. 2026 je sobota");
  trdi(P.jeVikend("2026-08-02"), "2. 8. 2026 je nedelja");
  trdi(!P.jeVikend("2026-08-03"), "3. 8. 2026 je ponedeljek");
  trdi(P.jeDelaProstDan("2026-08-01"), "sobota je dela prosta");
  trdi(P.jeDelaProstDan("2026-04-06"), "velikonočni ponedeljek je dela prost, čeprav ni vikend");
  trdi(!P.jeDelaProstDan("2026-08-19"), "navadna sreda ni dela prosta");
}

console.log("5) neveljaven vhod ne sme veljati za praznik");
{
  ["", null, undefined, "nekaj", "2026-13-01", "1.8.2026"].forEach(v =>
    trdi(!P.jeDelaProstDan(v), `neveljavno: ${JSON.stringify(v)}`));
}

console.log("6) datum se razčleni kot BESEDILO (časovni pas ne sme premakniti dneva)");
{
  const src = readFileSync(join(koren, "prazniki.js"), "utf8");
  trdi(/new Date\(Number\(m\[1\]\), Number\(m\[2\]\) - 1, Number\(m\[3\]\), 12\)/.test(src),
    "sestavi se po delih ob 12:00, ne prek new Date(iso)");
  // Neposreden dokaz: v pasu za UTC bi "new Date('2026-08-15')" pomenil 14. 8.
  trdi(P.jePraznik("2026-08-15"), "15. 8. ostane praznik ne glede na časovni pas");
}

console.log("7) pravilo uporabljajo VSI zasloni, ne le eden");
{
  const index = readFileSync(join(koren, "index.html"), "utf8");
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const admin = readFileSync(join(koren, "admin.html"), "utf8");

  trdi(/<script src="prazniki\.js"><\/script>/.test(index), "index.html nalaga prazniki.js");
  trdi(/<script src="prazniki\.js"><\/script>/.test(imenik), "imenik.html nalaga prazniki.js");
  trdi(/<script src="prazniki\.js"><\/script>/.test(admin), "admin.html nalaga prazniki.js");

  // a) Moj razpored
  trdi(/datum \? window\.Prazniki\.jePraznik\(datum\) : false/.test(index),
    "Moj razpored (nzvPrikaz) upošteva praznik");
  // Bistvo je, da je DATUM podan; za njim lahko sledijo še drugi
  // argumenti (od avgusta 2026 tudi delovišče), zato zapisa ne vežemo na
  // zaklepaj.
  trdi(/nzvPrikaz\(sifra, dn\.dan, jeNzv, dn\.datum[,)]/.test(index),
    "in mu je datum tudi podan (sicer bi pravilo tiho odpadlo)");

  // b) mreža Po oddelkih -> NZV
  trdi(/window\.Prazniki\.jeDelaProstDan\(r\.work_date\)/.test(index),
    "mreža NZV: enote upoštevajo praznike");
  trdi(/window\.Prazniki\.jeDelaProstDan\(d\.work_date\)/.test(index),
    "mreža NZV: LD/IZOB/BS prav tako");

  // c) Imenik -> Razpredelnica – tu je pravilo nazadnje manjkalo
  trdi(/jeNzvOseba\[v\.employee_id\]\s*\n\s*&& window\.Prazniki\.jeDelaProstDan\(v\.work_date\)/.test(imenik),
    "Razpredelnica: izmene NZV se ob prostih dneh izpustijo");
  trdi(/jeNzvOseba\[id\] && window\.Prazniki\.jeDelaProstDan\(o\.work_date\)/.test(imenik),
    "Razpredelnica: dopust/bolniška se za NZV vodita samo za delovne dni");
  trdi(/stanjeIzKode\(v\.shift_code\) !== "dezurstvo"/.test(imenik),
    "Razpredelnica: DEŽURSTVO ob prostem dnevu OSTANE");
  trdi(/const JE_NZV_VLOGA = new Set\(window\.NzvZasedba\.VLOGE\);/.test(imenik),
    "Razpredelnica ve, kdo je NZV – nabor vlog iz skupnega vira");
  trdi(/select\("id, full_name, role, department_code"\)/.test(imenik),
    "in vlogo tudi res prebere (sicer bi bil filter vedno prazen)");

  // d) Generator (admin.html -> NZV): tu je bila ČETRTA kopija, ki je ta
  // preizkus dotlej sploh ni pokrival - lasten velikonočni algoritem in
  // svoj seznam datumov. Prav tako tiha razlika bi se pokazala šele v
  // letu, ko se datuma razideta.
  trdi(/const isPraznik = window\.Prazniki\.jePraznik\(iso\);/.test(admin),
    "admin.html (NZV razpored) upošteva praznike iz skupnega vira");

  // Nobene lastne kopije pravila več.
  trdi(!/function jeVikendISO/.test(index),
    "index.html nima več svoje kopije izračuna vikenda");
  trdi(!/function easterSunday2|FIXED_HOLIDAYS2|function jeDanPraznik2/.test(admin),
    "admin.html nima več svoje kopije izračuna praznikov");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
