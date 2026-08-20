#!/usr/bin/env node
/* Preizkus pripraviPosodobitveOddelkaIzMreze() (sheets-mreza.js) – funkcije,
 * ki za Admin → Kalup "Zapiši predogled v Sheets" izračuna TOČNO katera
 * (vrstica, stolpec) v obstoječem Google Sheets listu ustreza kateri
 * (oseba, datum) v PREDOGLEDU generatorja (torej pred objavo v Supabase,
 * z upoštevanimi ročnimi popravki celic).
 *
 * sheets-mreza.js je NAMENOMA ločena kopija iste iskalne logike, ki jo za
 * že OBJAVLJEN razpored uporablja index.html (pripraviPosodobitveOddelka) –
 * admin.html je samostojna stran in do Babel/React funkcij v index.html ne
 * more priti. Ta preizkus:
 *   1. preveri isto obnašanje kot preveri-zapis-v-sheets.mjs (prazna vmesna
 *      vrstica, podpisni blok, drug nabor ljudi po mesecih, oseba brez
 *      stolpca), s fixture-jem v isti pravi obliki ("2026 SMS RAZPORED");
 *   2. preveri, da uporabi TRENUTNO vrednost predogleda (vključno z ročnim
 *      popravkom), ne surovega izračuna generatorja - to je bistvo funkcije
 *      ("kar vidiš, to se zapiše").
 *
 * Zagon: node skripte/preveri-sheets-mreza.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const koda = readFileSync(join(koren, "sheets-mreza.js"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (m) { const [, d, mo, y] = m; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return t;
}
const sandbox = { window: { ImportUtils: { normalizirajDatum } }, console };
vm.createContext(sandbox);
// Kratka imena iz predlog gredo skozi skupno parafa.js (window.Parafa.
// kratkoKljuc) - tam so uporabnikom potrjeni popravki zapisov, npr.
// "VALJAVEC A." -> "VALJAVEC E." Peskovnik jo mora imeti naloženo, sicer
// izvlečena koda kliče nedefiniran window.Parafa.
// parafa.js kratka imena zvede na skupni ključ prek imena.js.
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
vm.runInContext(koda, sandbox);
const { pripraviPosodobitveOddelkaIzMreze } = sandbox.window.SheetsMreza;

// Ista fixture oblika kot preveri-zapis-v-sheets.mjs (glej tam za razlago
// vsake posebnosti), tu "staff"/"vrednostZa" namesto "zaposleni"/"byEmpDate",
// ker predogled v Kalupu nima employee_id - samo polno ime.
function vrstica(datum, dan, sifre) { return [datum, dan, ...sifre]; }
const JUNIJ_IMENA = ["DŽINIĆ A.", "STARC E.", "KARNIČAR J.", "ZEKAN A."];
const JULIJ_IMENA = ["DŽINIĆ A.", "KARNIČAR J.", "ZEKAN A.", "DJEDOVIĆ M."];

const vrsteVrstic = [
  ["C1 odd", "", ...JUNIJ_IMENA],
  ["", "", "SMS / TZN", "SMS / TZN", "SMS / TZN", "SMS / TZN"],
  ["JUNIJ", ""],
  vrstica("1. 6. 2026", "PO", ["LD", "NOČNA", "popoldan", "LD"]),
  vrstica("2. 6. 2026", "TO", ["LD", "NOČNA", "popoldan", "LD"]),
  [],
  vrstica("3. 6. 2026", "SR", ["KPU", "NOČNA", "LD", "popoldan"]),
  [],
  ["Datum: 28.5.2026", "verzija 2"],
  [],
  ["Pripravil:", "", "", "", "Pregledal in odobril:"],
  [],
  ["C1 odd", "", ...JULIJ_IMENA],
  ["", "", "SMS / TZN", "SMS / TZN", "SMS / TZN", "SMS / TZN"],
  ["JULIJ", ""],
  vrstica("1. 7. 2026", "SR", ["popoldan", "NOČNA", "dopoldan", "KPU"]),
  vrstica("2. 7. 2026", "ČE", ["NOČNA", "LD", "popoldan", "dopoldan"]),
];

const staff = [
  { ime: "Džinić Amin" },
  { ime: "Starc Erik" },
  { ime: "Karničar Jure" },
  { ime: "Zekan Almedin" },
  { ime: "Djedović Mark" },
];
// Predogled generatorja + ročni popravek (KARNIČAR J. / 1.6. -> "POPOLDAN SPREMENJENO").
const PREDOGLED = {
  "Džinić Amin|2026-06-01": "LD", "Starc Erik|2026-06-01": "NOČNA", "Karničar Jure|2026-06-01": "POPOLDAN SPREMENJENO",
  "Džinić Amin|2026-07-01": "dopoldan", "Djedović Mark|2026-07-01": "prosto naj se ne zapiše",
};
const vrednostZa = (ime, datum) => PREDOGLED[ime + "|" + datum] || "";

console.log("1) junijski blok – koordinate za znane osebe, uporabi vrednost IZ PREDOGLEDA (z ročnim popravkom)");
{
  const { posodobitve, najdenDatum, najdenaGlava, neujemanja } =
    pripraviPosodobitveOddelkaIzMreze(vrsteVrstic, "2026-06", staff, vrednostZa);
  trdi(najdenDatum, "najde vrstice za junij");
  trdi(najdenaGlava, "najde vrstico z imeni nad junijskim blokom");
  const dzinic1junij = posodobitve.find(p => p.vrstica === 3 && p.stolpec === 2);
  jseq(dzinic1junij, { vrstica: 3, stolpec: 2, vrednost: "LD" }, "DŽINIĆ A. / 1. 6. -> vrstica 3, stolpec 2 (A=0,B=1,C=2)");
  const karnicar1junij = posodobitve.find(p => p.vrstica === 3 && p.stolpec === 4);
  jseq(karnicar1junij, { vrstica: 3, stolpec: 4, vrednost: "POPOLDAN SPREMENJENO" }, "KARNIČAR J. / 1. 6. -> ROČNI POPRAVEK iz predogleda, ne surov izračun");
  const karnicar3junij = posodobitve.find(p => p.vrstica === 6 && p.stolpec === 4);
  trdi(!!karnicar3junij, "blok se nadaljuje TUDI čez prazno vrstico (Sheets API vrne prazne vmesne vrstice kot [])");
  trdi(posodobitve.every(p => p.vrstica !== 8 && p.vrstica !== 10), "podpisni blok (Datum/Pripravil) ni med posodobitvami");
  trdi(neujemanja.size === 0, "vsa imena v juniju se ujemajo z znanimi osebami");
}

console.log("2) julijski blok – DRUG nabor ljudi, svoja glava");
{
  const { posodobitve, neujemanja } = pripraviPosodobitveOddelkaIzMreze(vrsteVrstic, "2026-07", staff, vrednostZa);
  const djedovic1julij = posodobitve.find(p => p.vrstica === 15 && p.stolpec === 5);
  jseq(djedovic1julij, { vrstica: 15, stolpec: 5, vrednost: "prosto naj se ne zapiše" }, "DJEDOVIĆ M. / 1. 7. -> vrstica 15, stolpec 5 (E)");
  trdi(neujemanja.size === 0, "vsa imena v juliju (drug nabor) se ujemajo, brez zamenjave s korakom iz junija");
}

console.log("3) oseba, ki v listu nima svojega stolpca");
{
  const brezEnega = staff.filter(z => z.ime !== "Zekan Almedin").concat([{ ime: "Novak Nekdo" }]);
  const { posodobitve, neujemanja } = pripraviPosodobitveOddelkaIzMreze(vrsteVrstic, "2026-06", brezEnega, vrednostZa);
  trdi(!posodobitve.some(p => p.stolpec === 5 /* ZEKAN A. stolpec */), "za osebo brez ustreznega imena v aplikaciji se ne piše nič");
  trdi(neujemanja.has("ZEKAN A."), "ZEKAN A. (v listu, a ne v seznamu zaposlenih klica) je javljen kot neujemanje, ne napaka");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
