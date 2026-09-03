#!/usr/bin/env node
/* Ali se dopusti in omejitve iz Želja → Razpredelnica RES prenesejo v vse
 * tri razporede: Oddelki (Kalup), NZV in Dežurstva.
 *
 * Zakaj obstaja: uporabnik je javil, da pri kreiranju oktobra dopustov in
 * omejitev iz razpredelnice ne prenese v razpored. Vzrok je bil, da so
 * imena v odsotnosti zapisana RAZLIČNO:
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
const zelje = readFileSync(join(koren, "zelje.html"), "utf8");

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
// odsotnosti: namenoma MEŠANI zapisi, kot v resnični bazi.
const LEAVE = [
  { full_name: "Bojić Matej", work_date: "2026-10-05", kind: "ld" },        // ročni vnos
  { full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "ld" },        // uvoz CSV
  { full_name: "ARNEŽ GREGA", work_date: "2026-10-07", kind: "omejitev" },  // uvoz CSV
  { full_name: "BOJIC MATEJ", work_date: "2026-10-08", kind: "omejitev" },  // brez strešice
  { full_name: "Nekdo Tuj",   work_date: "2026-10-09", kind: "ld" },        // ni med osebjem
];

const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sb);
sb.client = {
  from() {
    const q = {};
    let vrste = null;
    ["select", "eq", "gte", "lte", "in"].forEach(m => {
      q[m] = (a, b) => {
        if (m === "eq" && a === "kind") vrste = [b];
        if (m === "in" && a === "kind") vrste = b;
        return q;
      };
    });
    q.then = (res, rej) => Promise.resolve({
      data: LEAVE.filter(x => (vrste ? vrste.includes(x.kind) : true)), error: null,
    }).then(res, rej);
    return q;
  },
};
vm.runInContext([
  izvleci(admin, "kljucImena"),
  // Preslikava vrst iz Razpredelnice Želje v kode, ki jih kalup vpiše v celico.
  admin.match(/^const ZELJE_KODA = .*$/m)[0].replace(/^const /, "var "),
  // Ena sama poizvedba za vse vrste želja; prej sta bili dve (omejitve
  // in dopust), vsaka je poznala samo svoj del vrst.
  izvleci(admin, "nalozizZelje", "async function "),
  izvleci(admin, "ldTedniIzDni"),
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
  const { omejitve: m } = await sb.nalozizZelje("2026-10-01", "2026-10-31", OSEBJE);
  jseq(m["Arnež Grega"], ["2026-10-07"], "omejitev, uvožena z VELIKIMI črkami, se najde");
  jseq(m["Bojić Matej"], ["2026-10-08"], "omejitev brez strešice se najde");
  trdi(!("Nekdo Tuj" in m) && !("NEKDO TUJ" in m),
    "kdor ni med osebjem tega oddelka, se ne prilepi nikomur");
  const podKljuci = Object.keys(m);
  trdi(podKljuci.every(k => OSEBJE.includes(k)),
    "izid je pod IMENI OSEBJA, ne pod imeni iz odsotnosti – " + JSON.stringify(podKljuci));
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
  const { ldDnevi } = await sb.nalozizZelje("2026-10-01", "2026-10-31", OSEBJE);
  const ld = sb.ldTedniIzDni(ldDnevi, ["2026-10-05"]);
  jseq(Object.keys(ld), ["Hrovat Nina|2026-10-05"],
    "ključ je IME OSEBJA + ponedeljek, čeprav je v bazi zapisan z velikimi črkami");
  jseq(ld["Hrovat Nina|2026-10-05"], "LD", "teden je označen kot dopustniški");
  LEAVE.splice(0, LEAVE.length, ...prejsnji);
}

console.log("4) KALUP – en sam dan LD NE izprazni celega tedna");
{
  const en = [{ full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "ld" }];
  const prejsnji = LEAVE.splice(0, LEAVE.length, ...en);
  const { ldDnevi } = await sb.nalozizZelje("2026-10-01", "2026-10-31", OSEBJE);
  const ld = sb.ldTedniIzDni(ldDnevi, ["2026-10-05"]);
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

console.log("7) Nikjer v adminu ni več dobesedne primerjave imen iz odsotnosti");
{
  trdi(!/\(row\.full_name \|\| ""\)\.toUpperCase\(\)/.test(admin),
    "ni več ključa 'surovo ime z velikimi črkami'");
  trdi(!/map\[r\.full_name\] = map\[r\.full_name\]/.test(admin),
    "omejitve niso več pod surovim imenom iz baze");
  trdi(!/const k = r\.full_name \+ "\|" \+ mo;/.test(admin),
    "LD tedni niso več pod surovim imenom iz baze");
}

console.log("8) KATERA vrsta odsotnosti gre v kateri razpored");
{
  // Štiri barve iz Razpredelnice pomenijo različne stvari in ne sodijo
  // povsod enako:
  //   ld       letni dopust     – nikjer ne dela
  //   bs       bolniška         – nikjer ne dela
  //   sti      izobraževanje    – ni na oddelku
  //   omejitev rumena           – JE na delu, le omejeno
  //
  // Kalup prej bolniške in izobraževanja SPLOH NI bral: oseba na bolniški
  // je vseeno pristala na izmeni in zanjo se ni iskalo nadomestila.
  jseq(Object.keys(sb.ZELJE_KODA).slice().sort(), ["bs", "kro", "ld", "sti"],
    "kalup pozna bolniško, kroženje, letni dopust in izobraževanje");
  jseq(sb.ZELJE_KODA.bs, "BS", "in vsaka ima svojo kodo za celico");
  trdi(!("omejitev" in sb.ZELJE_KODA),
    "rumena omejitev tu ne sme biti – oseba tisti dan DELA, le omejeno, zato ima svojo pot");

  // Bolniška, izobraževanje in kroženje gredo v "odsotnosti" (koda v
  // celico), rumena omejitev pa v "omejitve" (oseba dela). Kalup prej
  // bolniške in izobraževanja SPLOH NI bral: oseba na bolniški je vseeno
  // pristala na izmeni in zanjo se ni iskalo nadomestila.
  const razlicne = [
    { full_name: "HROVAT NINA", work_date: "2026-10-06", kind: "bs" },
    { full_name: "HROVAT NINA", work_date: "2026-10-07", kind: "sti" },
    { full_name: "HROVAT NINA", work_date: "2026-10-08", kind: "kro" },
    { full_name: "HROVAT NINA", work_date: "2026-10-09", kind: "omejitev" },
  ];
  const prejsnji = LEAVE.splice(0, LEAVE.length, ...razlicne);
  const { odsotnosti, omejitve } = await sb.nalozizZelje("2026-10-01", "2026-10-31", OSEBJE);
  jseq(odsotnosti["Hrovat Nina"],
    { "2026-10-06": "BS", "2026-10-07": "STI", "2026-10-08": "KRO" },
    "bolniška, izobraževanje in kroženje blokirajo dan na oddelku, vsak s svojo kodo");
  jseq(omejitve["Hrovat Nina"], ["2026-10-09"],
    "rumena omejitev ostane v svoji poti, ne med odsotnostmi");
  LEAVE.splice(0, LEAVE.length, ...prejsnji);

  // NZV namenoma NE upošteva rumene omejitve: oseba tisti dan dela, le z
  // omejitvijo - nadomeščanja zato ni treba sprožiti.
  trdi(/\.in\("kind", \["ld", "sti", "bs"\]\)/.test(index),
    "NZV bere ld/sti/bs, rumene omejitve pa namenoma ne");
  trdi(!/\.in\("kind", \["ld", "sti", "bs", "omejitev"\]\)/.test(index),
    "in se to ni po nesreči spremenilo");

  // Dežurstva vzamejo VSE: kar ni letni dopust, je omejitev za tisti dan.
  trdi(/if \(row\.kind === "ld"\) grouped\[key\]\.dopust\.push/.test(admin)
    && /else grouped\[key\]\.omejitve\.push/.test(admin),
    "dežurstva: ld -> dopust, vse ostalo (omejitev/bs/sti) -> omejitev za ta dan");
}

console.log("9) NZV GENERATOR (Admin → NZV) upošteva dopuste");
{
  // To je DRUGA koda kot prikaz NZV v index.html. Uporabnik je javil, da so
  // Alukić, Arnež in Džamastagić 1. in 2. 10. 2026 v Željah rdeči (LD),
  // generator pa jih vseeno postavi na PDZN/ŽO/E1.
  //
  // Vzrok: leaveMap je bil ključen s SUROVIM imenom iz odsotnosti
  // ("Alukić Dino"), iskalo pa se je z imenom iz nosilci_oddelkov
  // ("ALUKIĆ DINO"). Dve tabeli, dve pisavi, dobesedna primerjava.
  trdi(/leaveMap\[window\.Imena\.kljuc\(r\.full_name\) \+ "\|" \+ r\.work_date\]/.test(admin),
    "leaveMap je ključen prek imena.js");
  trdi(/const kind = leaveMap\[kljucIme\(ime\) \+ "\|" \+ iso\];/.test(admin),
    "jeOdsotenNa išče po istem ključu");
  trdi(!/leaveMap\[\(v \? v\.full_name : ime\) \+ "\|" \+ iso\]/.test(admin),
    "stara dobesedna primerjava je odstranjena");
  trdi(!/const kind = leaveMap\[v\.full_name \+ "\|" \+ iso\];/.test(admin),
    "in tudi druga pojavitev iste primerjave");

  // Konkretno: imeni iz obeh tabel se morata zvesti na isti ključ.
  jseq(sb.window.Imena.kljuc("ALUKIĆ DINO"), sb.window.Imena.kljuc("Alukić Dino"),
    "'ALUKIĆ DINO' (nosilci_oddelkov) in 'Alukić Dino' (odsotnosti) sta ista oseba");

  // Rumena omejitev za NZV NI odsotnost - to ostane.
  const kolona = admin.match(/const LEAVE_KOLONA = \{[^}]*\}/)[0];
  trdi(/ld:/.test(kolona) && /bs:/.test(kolona) && /sti:/.test(kolona),
    "NZV generator šteje ld, bs in sti kot odsotnost");
  trdi(!/omejitev:/.test(kolona),
    "rumene omejitve NE - oseba tisti dan dela");
}

console.log("10) RAZPREDELNICA pokaže tudi drugače zapisano ime");
{
  // Uvoz iz CSV shrani imena z VELIKIMI črkami. Ob dobesedni primerjavi
  // taka vrstica v razpredelnici sploh NI bila vidna, čeprav je v bazi
  // bila - razporedi (ki berejo po ključu) pa so jo upoštevali. Zaslon in
  // razpored sta si tako nasprotovala.
  trdi(/poKljucu\[window\.Imena\.kljuc\(r\.full_name\)\] \|\| r\.full_name/.test(zelje),
    "vrstice se preslikajo na ime osebe iz seznama");
  trdi(!/\(data \|\| \[\]\)\.forEach\(r => \{ m\[r\.full_name \+ "\|" \+ r\.work_date\] = r\.kind; \}\);/.test(zelje),
    "stara dobesedna primerjava je odstranjena");
  // Popravek take celice ne sme ustvariti DRUGE vrstice za isto osebo/dan.
  trdi(/const staroIme = zapisanoIme\[ime \+ "\|" \+ iso\];/.test(zelje)
    && /if \(staroIme && staroIme !== ime\)/.test(zelje),
    "ob popravku se vrstica s staro pisavo imena pobriše");
  trdi(/\.delete\(\)\.eq\("full_name", staroIme\)\.eq\("work_date", iso\)/.test(zelje),
    "in to natanko tista vrstica, ne katera koli");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
