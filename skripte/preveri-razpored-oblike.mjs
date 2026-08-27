#!/usr/bin/env node
/* Branje in pisanje razporeda v obliki obeh živih preglednic bolnišnice.
 *
 * Vzorec v skripte/vzorci/sms-razpored-vzorec.json je izrezan iz PRAVE
 * datoteke "2026 SMS RAZPORED" (stanje 26.8.2026), ne izmišljen - prav
 * njene nepravilnosti so tisto, kar mora branje prenesti:
 *   - oznaka zavihka niha: "C1 odd", "C odd", "Dodd" (brez presledka!)
 *   - v zavihku C so od stolpca "FLEXI M" naprej osebe v PARIH stolpcev
 *   - en zavihek nosi več mesečnih blokov, zloženih pod seboj
 *   - pod vsakim blokom je podpisni blok z datumom izdelave
 *
 * Zagon: node skripte/preveri-razpored-oblike.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
global.window = {};
new Function(readFileSync(join(koren, "razpored-oblike.js"), "utf8"))();
const O = global.window.RazporedOblike;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const vzorec = JSON.parse(readFileSync(join(koren, "skripte/vzorci/sms-razpored-vzorec.json"), "utf8"));

console.log("1) datum se prebere v vseh zapisih, ki se v datotekah res pojavljajo");
eq(O._vDatum("1. 9. 2026"), { leto: 2026, mesec: 9, dan: 1 }, "»1. 9. 2026« (zapis v preglednici)");
eq(O._vDatum("1\\. 9. 2026"), { leto: 2026, mesec: 9, dan: 1 }, "z ubežno piko");
eq(O._vDatum("1.9.2026"), { leto: 2026, mesec: 9, dan: 1 }, "brez presledkov");
eq(O._vDatum("2026-09-01"), { leto: 2026, mesec: 9, dan: 1 }, "kot ga vrne Excel");
eq(O._vDatum("SEPTEMBER"), null, "ime meseca ni datum");
eq(O._vDatum(""), null, "prazna celica ni datum");

console.log("2) oznaka oddelka prenese vse zapise iz prave datoteke");
eq(O._ocistiOznako("C1 odd"), "C1", "»C1 odd«");
eq(O._ocistiOznako("C odd"), "C", "»C odd«");
eq(O._ocistiOznako("Dodd"), "D", "»Dodd« – brez presledka, kot je v datoteki");
eq(O._ocistiOznako("E2 odd"), "E2", "»E2 odd«");
eq(O._ocistiOznako("FLEXI"), "FLEXI", "»FLEXI« – brez pripone");

console.log("3) v pravem vzorcu se najdejo vsi mesečni bloki");
const bloki = O.najdiBloke(vzorec);
eq(bloki.map(b => b.oznaka + "/" + O.MESECI[b.mesec - 1] + " " + b.leto),
   ["C1/SEPTEMBER 2026", "C/SEPTEMBER 2026", "D/JUNIJ 2026"],
   "trije bloki, pravi oddelki in meseci");
eq(bloki.map(b => b.dnevi.length), [30, 30, 30], "vsak blok ima vse dneve svojega meseca");
trdi(bloki[0].imena.slice(0, 3).join(", ") === "DŽINIĆ A., STARC E., KARNIČAR J.",
  "imena iz glave: " + bloki[0].imena.slice(0, 3).join(", "));
// V pravi datoteki je "GAZIBARA  A." z DVEMA presledkoma. Če se presledki ne
// strnejo, se tako ime ob uvozu ne ujame z osebo v aplikaciji in njena
// izmena tiho izpade - zato je to preverjeno posebej.
trdi(bloki[0].imena.indexOf("GAZIBARA A.") !== -1,
  "podvojen presledek v imenu je strnjen (»GAZIBARA  A.« -> »GAZIBARA A.«)");
trdi(!bloki[0].imena.some(i => /\s{2,}/.test(i)), "nobeno ime nima podvojenih presledkov");
trdi(bloki[0].izpolnjenih > 200, `izpolnjenih celic v C1: ${bloki[0].izpolnjenih}`);
trdi(/^Datum:/.test(bloki[0].verzija), "pod blokom se najde datum izdelave: " + bloki[0].verzija);

console.log("3b) enak izid, če datoteka nima vodilnega praznega stolpca");
{
  // Živa Google preglednica ima levo prazen stolpec, izvoz v .xlsx pa ga
  // ponekod nima - in obstoječi uvoz v aplikaciji bere datum v PRVEM
  // stolpcu. Trdo določen stolpec bi torej delal samo za eno od obeh
  // datotek. Tu se preveri, da odmik ne spremeni ničesar.
  const brezRoba = vzorec.map(v => (v.length ? v.slice(1) : v));
  const b2 = O.najdiBloke(brezRoba);
  eq(b2.map(b => b.oznaka + "/" + O.MESECI[b.mesec - 1]),
     bloki.map(b => b.oznaka + "/" + O.MESECI[b.mesec - 1]),
     "najdejo se isti bloki");
  eq(b2.map(b => b.izpolnjenih), bloki.map(b => b.izpolnjenih), "in enako izpolnjenih celic");
  eq(O.preberiBlok(brezRoba, b2[0]).length, O.preberiBlok(vzorec, bloki[0]).length,
     "in enako prebranih zapisov");
  eq(b2[0].stolpecDatuma, 0, "stolpec datuma se prepozna kot prvi");
  eq(bloki[0].stolpecDatuma, 1, "v izvirniku pa kot drugi");
}

console.log("4) vsebina bloka se prebere v prave zapise");
const zapisi = O.preberiBlok(vzorec, bloki[0]);
const prvi = zapisi.filter(z => z.datum === "2026-09-01");
eq(prvi.slice(0, 3).map(z => z.ime + "=" + z.koda),
   ["DŽINIĆ A.=LD", "STARC E.=KPU", "KARNIČAR J.=popoldan"],
   "1. september v oddelku C1");
trdi(zapisi.every(z => z.oddelek === "C1"), "vsi zapisi nosijo svoj oddelek");
// 5. in 6. september sta sobota in nedelja - takrat večina ne dela in celice
// so prazne. Prazna celica NE sme postati zapis, sicer bi uvoz pobrisal
// izmeno, ki je v aplikaciji morda vpisana pravilno.
trdi(!zapisi.some(z => !z.koda), "nobena prazna celica ni postala zapis");
const sobota = zapisi.filter(z => z.datum === "2026-09-05");
eq(sobota.map(z => z.ime + "=" + z.koda),
   ["STARC E.=DNEVNA12", "KARNIČAR J.=NOČNA12", "BEČIROVIĆ N.=NOČNA12", "POGAČNIK M.=DNEVNA12"],
   "v soboto so zapisani samo tisti, ki delajo");

console.log("5) podvojeni mesec vrne VSE najdene, da lahko stran vpraša");
const dvojni = O.najdiBloke(vzorec.concat(vzorec));
eq(O.blokiZaMesec(dvojni, 2026, 9).length, 4, "september se pojavi štirikrat (2 oddelka × 2 kopiji)");
trdi(O.blokiZaMesec(dvojni, 2026, 9).every(b => b.opis && b.verzija !== undefined),
  "vsak ima opis in oznako verzije za prikaz uporabniku");

console.log("6) pisanje v obliki »2026 SMS RAZPORED«");
const izpis = O.vSMSObliko({
  oddelek: "C1", leto: 2026, mesec: 9,
  imena: [{ ime: "DŽINIĆ A.", vloga: "SMS / TZN" }, { ime: "GAZIBARA A.", vloga: "DMS / DZN" }],
  izmena: (o, d) => (d.getDate() === 1 ? (o.ime === "DŽINIĆ A." ? "LD" : "dopoldan") : ""),
  pripravil: "Matej Bojić, dipl. zn. Strokovni vodja V",
  odobril: "Denis Džamastagić, dipl. zn.",
  datumIzdelave: new Date(2026, 7, 27),
});
eq(izpis[0].slice(0, 4), ["", "C1 odd", "", "DŽINIĆ A."], "glava z oznako oddelka in imeni");
eq(izpis[1].slice(0, 5), ["", "SEPTEMBER", "", "SMS / TZN", "DMS / DZN"], "vrstica z mesecem in vlogami");
eq(izpis[2], ["", "1. 9. 2026", "TO", "LD", "dopoldan"], "prvi dan z datumom in kratico dneva");
eq(izpis[3].slice(0, 3), ["", "2. 9. 2026", "SR"], "drugi dan");
trdi(izpis.filter(v => v.length && v[1] && O._vDatum(v[1])).length === 30, "september ima 30 dni");
trdi(izpis.some(v => (v[1] || "").indexOf("Datum: 27. 8. 2026") === 0), "podpisni blok ima datum izdelave");
trdi(izpis.some(v => v.indexOf("Pregledal in odobril:") !== -1), "in vrstico za odobritev");

console.log("7) kar se zapiše, se prebere nazaj enako (sklenjen krog)");
{
  const podatki = { "2026-09-01": { "DŽINIĆ A.": "LD", "GAZIBARA A.": "dopoldan" },
                    "2026-09-15": { "DŽINIĆ A.": "NOČNA" } };
  const kljuc = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
                     + "-" + String(d.getDate()).padStart(2, "0");
  const zapisano = O.vSMSObliko({
    oddelek: "C1", leto: 2026, mesec: 9,
    imena: [{ ime: "DŽINIĆ A." }, { ime: "GAZIBARA A." }],
    izmena: (o, d) => (podatki[kljuc(d)] || {})[o.ime] || "",
    pripravil: "X", odobril: "Y",
  });
  const nazajBloki = O.najdiBloke(zapisano);
  eq(nazajBloki.length, 1, "najde se en blok");
  const nazaj = O.preberiBlok(zapisano, nazajBloki[0]);
  eq(nazaj.map(z => z.datum + " " + z.ime + "=" + z.koda),
     ["2026-09-01 DŽINIĆ A.=LD", "2026-09-01 GAZIBARA A.=dopoldan", "2026-09-15 DŽINIĆ A.=NOČNA"],
     "prebrani zapisi so isti kot vpisani");
}

console.log("8) pisanje v obliki »Letni dopusti in omejitve za NZV«");
{
  const m = O.vNZVObliko({
    leto: 2026, mesec: 9, enote: ["PDZN", "SOBO", "ŽO"],
    vEnoti: (e, d) => (d.getDate() === 2 && e === "PDZN" ? "DŽA" : ""),
    vStolpcu: (s, d) => (d.getDate() === 2 && s === "LD" ? "TOM, LEL" : ""),
    pripravil: "Denis Džamastagić", datumIzdelave: new Date(2026, 7, 27),
  });
  eq(m[0], ["SEPTEMBER 2026"], "naslov meseca");
  eq(m[1], ["DATUM", "PDZN", "SOBO", "ŽO", "DEŽURSTVO", "OMEJITVE", "LD", "IZOB", "BS"],
     "glava: enote in zbirni stolpci");
  eq(m[3], ["2. 9. 2026", "DŽA", "", "", "", "", "TOM, LEL", "", ""],
     "v celico gre kratica osebe, odsotni v svoj stolpec");
  trdi(m.filter(v => v.length && O._vDatum(v[0])).length === 30, "september ima 30 dni");
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
