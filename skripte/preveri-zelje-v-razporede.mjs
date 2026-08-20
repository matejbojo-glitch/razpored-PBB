#!/usr/bin/env node
/* Ali se dopusti in omejitve iz Želja → Razpredelnica RES prenesejo v vse
 * tri razporede: Oddelki (Kalup), NZV in Dežurstva.
 *
 * Zakaj obstaja: uporabnik je javil, da pri kreiranju oktobra dopustov in
 * omejitev iz razpredelnice ne prenese v razpored. Vzrok je bil, da so
 * imena v leave_entries zapisana RAZLIČNO:
 *
 *   ročni vnos v Razpredelnici  ->  tako kot v Imeniku   ("Bojić Matej")
 *   uvoz iz CSV (zelje.html)    ->  z VELIKIMI črkami    ("BOJIĆ MATEJ")
 *
 * Dežurstva so iskala z izZelja[z.ime] - torej surovo ime proti ključu z
 * velikimi črkami - in niso našla NIČESAR. Kalup je primerjal dobesedno in
 * je našel le tisto, kar se je slučajno ujemalo črko v črko. NZV je edini
 * uporabljal skupni modul imena.js in je deloval.
 *
 * Odslej vse tri poti uporabljajo isti ključ (imena.js).
 *
 * Zagon: node skripte/preveri-zelje-v-razporede.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const admin = readFileSync(join(koren, "admin.html"), "utf8");
const index = readFileSync(join(koren, "index.html"), "utf8");

function izvleci(src, ime, kw = "function ") {
  const z = src.indexOf(kw + ime + "(");
  if (z === -1) throw new Error("Ni " + kw + ime + " v izvorni datoteki.");
  let g = 0;
  for (let i = src.indexOf("{", z); i < src.length; i++) {
    if (src[i] === "{") g++;
    else if (src[i] === "}") { g--; if (!g) return src.slice(z, i + 1); }
  }
  throw new Error("Konec " + ime + " ni najden.");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Osebje, kot ga pozna Imenik.
const OSEBJE = ["Bojić Matej", "Hrovat Nina", "Arnež Grega"];
// leave_entries: namenoma MEŠANI zapisi, kot v resnični bazi.
const LEAVE = [
  { full_name: "Bojić Matej", work_date: "2026-10-05", kind: "ld" },        // ročni vnos
  { full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "ld" },        // uvoz CSV
  { full_name: "ARNEŽ GREGA", work_date: "2026-10-07", kind: "omejitev" },  // uvoz CSV
  { full_name: "BOJIC MATEJ", work_date: "2026-10-08", kind: "omejitev" },  // brez strešice
  { full_name: "Nekdo Tuj",   work_date: "2026-10-09", kind: "ld" },        // ni med osebjem
];

let kind = null;
const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sb);
sb.client = {
  from() {
    const q = {};
    ["select", "eq", "gte", "lte", "in"].forEach(m => { q[m] = (a, b) => { if (m === "eq" && a === "kind") kind = b; return q; }; });
    q.then = (res, rej) => Promise.resolve({
      data: LEAVE.filter(x => (kind ? x.kind === kind : true)), error: null,
    }).then(res, rej);
    return q;
  },
};
vm.runInContext([
  izvleci(admin, "kljucImena"),
  izvleci(admin, "nalozizOmejitve", "async function "),
  izvleci(admin, "nalozizLdTedne", "async function "),
].join("\n\n"), sb);

console.log("1) kljucImena uporablja SKUPNI modul (imena.js), ne svoje različice");
{
  jseq(sb.kljucImena("Bojić Matej"), sb.window.Imena.kljuc("Bojić Matej"),
    "isti ključ kot imena.js");
  jseq(sb.kljucImena("BOJIC MATEJ"), sb.kljucImena("Bojić Matej"),
    "zapis brez strešice se ujame z zapisom s strešico");
  jseq(sb.kljucImena("Matej Bojić"), sb.kljucImena("Bojić Matej"),
    "obrnjen vrstni red besed se ujame");
}

console.log("2) KALUP – omejitve (rumeno) pridejo do generatorja");
{
  kind = null;
  const m = await sb.nalozizOmejitve("2026-10-01", "2026-10-31", OSEBJE);
  jseq(m["Arnež Grega"], ["2026-10-07"], "omejitev, uvožena z VELIKIMI črkami, se najde");
  jseq(m["Bojić Matej"], ["2026-10-08"], "omejitev brez strešice se najde");
  trdi(!("Nekdo Tuj" in m) && !("NEKDO TUJ" in m),
    "kdor ni med osebjem tega oddelka, se ne prilepi nikomur");
  const podKljuci = Object.keys(m);
  trdi(podKljuci.every(k => OSEBJE.includes(k)),
    "izid je pod IMENI OSEBJA, ne pod imeni iz leave_entries – " + JSON.stringify(podKljuci));
}

console.log("3) KALUP – letni dopust se pretvori v cele tedne pod imenom osebja");
{
  // Teden šteje za dopustniški pri vsaj 3 dneh LD.
  const trije = [
    { full_name: "HROVAT NINA", work_date: "2026-10-05", kind: "ld" },
    { full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "ld" },
    { full_name: "HROVAT NINA", work_date: "2026-10-07", kind: "ld" },
  ];
  const prejsnji = LEAVE.splice(0, LEAVE.length, ...trije);
  kind = null;
  const ld = await sb.nalozizLdTedne("2026-10-01", "2026-10-31", ["2026-10-05"], OSEBJE);
  jseq(Object.keys(ld), ["Hrovat Nina|2026-10-05"],
    "ključ je IME OSEBJA + ponedeljek, čeprav je v bazi zapisan z velikimi črkami");
  jseq(ld["Hrovat Nina|2026-10-05"], "LD", "teden je označen kot dopustniški");
  LEAVE.splice(0, LEAVE.length, ...prejsnji);
}

console.log("4) KALUP – en sam dan LD NE izprazni celega tedna");
{
  const en = [{ full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "ld" }];
  const prejsnji = LEAVE.splice(0, LEAVE.length, ...en);
  kind = null;
  const ld = await sb.nalozizLdTedne("2026-10-01", "2026-10-31", ["2026-10-05"], OSEBJE);
  jseq(Object.keys(ld), [], "en dan LD sredi tedna ni 'prosti teden'");
  LEAVE.splice(0, LEAVE.length, ...prejsnji);
}

console.log("5) DEŽURSTVA – dopusti in omejitve pridejo v kader");
{
  // Natanko koda iz nalozitIzZelja + uporabiVZelja (DezurstvaTab).
  trdi(/const key = kljucImena\(row\.full_name\);/.test(admin),
    "nalozitIzZelja ključi prek kljucImena, ne prek surovih velikih črk");
  trdi(/izZelja\[kljucImena\(z\.ime\)\]/.test(admin),
    "uporabiVZelja išče po istem ključu");
  const grouped = {};
  LEAVE.forEach(row => {
    const key = sb.kljucImena(row.full_name);
    if (!key) return;
    if (!grouped[key]) grouped[key] = { dopust: [], omejitve: [] };
    if (row.kind === "ld") grouped[key].dopust.push(row.work_date);
    else grouped[key].omejitve.push(row.work_date);
  });
  const zaOsebo = ime => grouped[sb.kljucImena(ime)] || { dopust: [], omejitve: [] };
  jseq(zaOsebo("Bojić Matej").dopust, ["2026-10-05"], "Bojić – dopust iz ročnega vnosa");
  jseq(zaOsebo("Bojić Matej").omejitve, ["2026-10-08"], "Bojić – omejitev brez strešice");
  jseq(zaOsebo("Hrovat Nina").dopust, ["2026-10-06"], "Hrovat – dopust, uvožen z velikimi črkami");
  jseq(zaOsebo("Arnež Grega").omejitve, ["2026-10-07"], "Arnež – omejitev, uvožena z velikimi črkami");
}

console.log("6) NZV – ostaja na skupnem modulu (tu je delovalo že prej)");
{
  trdi(/imenaSeUjemataNzv\(p\.full_name, d\.full_name\)/.test(index),
    "odsotnosti se ujemajo prek imena.js");
  trdi(/odsotenDan\.add\(kljucImenaNzv\(d\.full_name\)/.test(index),
    "izpeljava odsotnosti prav tako");
}

console.log("7) Nikjer v adminu ni več dobesedne primerjave imen iz leave_entries");
{
  trdi(!/\(row\.full_name \|\| ""\)\.toUpperCase\(\)/.test(admin),
    "ni več ključa 'surovo ime z velikimi črkami'");
  trdi(!/map\[r\.full_name\] = map\[r\.full_name\]/.test(admin),
    "omejitve niso več pod surovim imenom iz baze");
  trdi(!/const k = r\.full_name \+ "\|" \+ mo;/.test(admin),
    "LD tedni niso več pod surovim imenom iz baze");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
