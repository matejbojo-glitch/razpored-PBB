#!/usr/bin/env node
/* Enotnost uvoza podatkov.
 *
 * ZAKAJ
 * Uvozi v aplikaciji so združeni v en sam vzorec: vsaka stran svoj uvoz
 * PRIJAVI s komponento <RazporedUvozVir kljuc="..."/>, katalog uvoz.html
 * pa jih našteje in vsakega odpre s povezavo "<stran>.html?uvoz=<kljuc>".
 * Sprožilec te povezave živi v viru samem (export-buttons.js), zato
 * povezava deluje le, če vir z istim ključem na tisti strani res obstaja
 * IN je izrisan.
 *
 * To sta dva zapisa iste stvari in prav zato se razideta. Opaženo
 * (september 2026, ta preizkus je nastal po tem):
 *   - vnos "Omejitve za NZV" je v katalogu obljubljal uvoz omejitev
 *     (ime, dopust, omejitve), klik pa je odprl uvoz VLOG IN ODDELKOV
 *     (full_name, role, department_code) - kdor je sledil opisu, je
 *     pripravil napačno datoteko;
 *   - vir za kvote dopusta je stal ZNOTRAJ zložljivega razdelka, ta pa
 *     zaprtih otrok ne izriše, zato se ni prijavil in povezava iz kataloga
 *     ni odprla ničesar.
 *
 * KAJ SE PREVERJA
 *   1. vsak ključ v katalogu ima vir na strani, na katero katalog kaže;
 *   2. vsak prijavljen vir je v katalogu (sicer je uvoz nedosegljiv);
 *   3. noben vir ne stoji znotraj <Zlozljivo> (se ne bi prijavil);
 *   4. vnosi datotek uporabljajo skupni seznam pripon, razen kjer je
 *      ožji nabor namenoma (te izjeme so naštete spodaj in utemeljene).
 *
 * Zagon: node skripte/preveri-uvoz-enotnost.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const STRANI = ["index.html", "admin.html", "imenik.html", "zelje.html",
  "dashboard.html", "obrazec.html", "nastavitve.html", "uvoz.html"];

// --- 1) kaj je prijavljeno -------------------------------------------
// "kljuc" ni nujno v isti vrstici kot ime komponente (index.html ga ima v
// naslednji), zato se bere cel blok elementa.
const vir = new Map();          // kljuc -> { stran, odsek }
for (const stran of STRANI) {
  const t = readFileSync(join(koren, stran), "utf8");
  const re = /<RazporedUvozVir[\s\S]{0,300}?kljuc=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(t))) vir.set(m[1], { stran, odsek: m.index });
}

// --- 2) kaj je v katalogu --------------------------------------------
const katalogVir = readFileSync(join(koren, "uvoz.html"), "utf8");
const katalog = new Map();      // kljuc -> [strani]
{
  const re = /href:\s*["']([^"'?]+)\?([^"']+)["']/g;
  let m;
  while ((m = re.exec(katalogVir))) {
    const kljuc = new URLSearchParams(m[2]).get("uvoz");
    if (!kljuc) continue;
    if (!katalog.has(kljuc)) katalog.set(kljuc, []);
    katalog.get(kljuc).push(m[1]);
  }
}

console.log("1) Katalog in prijavljeni viri se ujemajo");
{
  trdi(vir.size > 0, `prijavljenih virov: ${vir.size}`);
  trdi(katalog.size > 0, `ključev v katalogu: ${katalog.size}`);

  const mrtve = [...katalog.keys()].filter((k) => !vir.has(k));
  trdi(mrtve.length === 0,
    "vsak ključ v katalogu ima svoj vir" + (mrtve.length ? " – manjka: " + mrtve.join(", ") : ""));

  const skriti = [...vir.keys()].filter((k) => !katalog.has(k));
  trdi(skriti.length === 0,
    "vsak vir je v katalogu (sicer je uvoz nedosegljiv)"
    + (skriti.length ? " – manjka v uvoz.html: " + skriti.join(", ") : ""));

  const napacnaStran = [...katalog].filter(([k, strani]) =>
    vir.has(k) && !strani.includes(vir.get(k).stran));
  trdi(napacnaStran.length === 0,
    "katalog kaže na pravo stran"
    + (napacnaStran.length
      ? " – " + napacnaStran.map(([k, s]) => `${k}: katalog ${s.join("/")}, vir ${vir.get(k).stran}`).join("; ")
      : ""));
}

console.log("2) Viri niso zaprti v zložljive razdelke");
{
  // Zlozljivo otrok, dokler je zaprt, SPLOH ne izriše (admin.html,
  // funkcija Zlozljivo: "{odprto && <div className='vsebina'>}"), zato se
  // vir v njem ne prijavi in "?uvoz=<kljuc>" ne odpre ničesar.
  for (const [kljuc, { stran, odsek }] of vir) {
    const t = readFileSync(join(koren, stran), "utf8");
    const pred = t.slice(0, odsek);
    // Groba, a zadostna meritev: koliko <Zlozljivo> je odprtih na tem mestu.
    const odprtih = (pred.match(/<Zlozljivo\b/g) || []).length;
    const zaprtih = (pred.match(/<\/Zlozljivo>/g) || []).length;
    trdi(odprtih === zaprtih,
      `vir "${kljuc}" (${stran}) stoji zunaj zložljivih razdelkov`);
  }
}

console.log("3) Vnosi datotek uporabljajo skupni seznam pripon");
{
  const utils = readFileSync(join(koren, "import-utils.js"), "utf8");
  const m = utils.match(/PODPRTE_PRIPONE\s*=\s*"([^"]+)"/);
  trdi(!!m, "import-utils.js ima en sam seznam podprtih pripon");

  // Utemeljene izjeme: ožji nabor je TU pravilen, ne pozabljen.
  //   razporedIzDatoteke (statistika-core.js) PDF in .gsheet izrecno
  //     zavrne ("PDF brez prave tabele ni podprt"), zato ju izbirnik
  //     datotek niti ne sme ponuditi;
  //   obnovitev iz JSON in uvoz fotografije sta po naravi enoformatna.
  const IZJEME = [
    { vzorec: '".json,.csv,.txt,.xlsx,.xls,.xlsb"', zakaj: "mreža generatorja – PDF/.gsheet uvoznik zavrne" },
    { vzorec: '"application/json"', zakaj: "obnovitev iz JSON" },
    { vzorec: '"image/*"', zakaj: "uvoz fotografije" },
    { vzorec: '".xlsx,.xls"', zakaj: "samo Excel" },
  ];
  for (const stran of STRANI) {
    const t = readFileSync(join(koren, stran), "utf8");
    const re = /accept=(\{window\.ImportUtils\.PODPRTE_PRIPONE\}|"[^"]*")/g;
    let a;
    while ((a = re.exec(t))) {
      const v = a[1];
      if (v === "{window.ImportUtils.PODPRTE_PRIPONE}") continue;
      const izjema = IZJEME.find((i) => i.vzorec === v);
      trdi(!!izjema, `${stran}: accept=${v} je ali skupni seznam ali utemeljena izjema`
        + (izjema ? ` (${izjema.zakaj})` : ""));
    }
  }
}

console.log("4) Uvoz razporeda posodobi statistiko brez osvežitve strani");
{
  const admin = readFileSync(join(koren, "admin.html"), "utf8");
  // Uvoz mora pisati v ISTO stanje kot generiranje (rezultat), sicer se
  // predal ne preračuna.
  trdi(/const rez = await window\.Statistika\.razporedIzDatoteke\(/.test(admin),
    "uvoz mreže gre skozi skupno pot Statistika.razporedIzDatoteke");
  const uvozBlok = admin.slice(admin.indexOf("const naloziRazporedIzDatoteke"),
    admin.indexOf("const naloziRazporedIzDatoteke") + 2500);
  trdi(/setRezultat\(/.test(uvozBlok), "in nastavi isto stanje kot generiranje (setRezultat)");
  // Predal se preračuna iz rezultata IN ročnih popravkov - torej tudi ob
  // urejanju celice, ne le ob uvozu.
  const memo = admin.match(/const statistika = useMemo\([\s\S]*?\), \[([^\]]*)\]\);/);
  trdi(!!memo, "statistika je useMemo z izrecnimi odvisnostmi");
  if (memo) {
    const odv = memo[1].split(",").map((s) => s.trim());
    ["rezultat", "popravki", "krsitve"].forEach((k) =>
      trdi(odv.includes(k), `preračuna se ob spremembi "${k}"`));
  }
}

console.log("5) Poslovni pravili sta tam, kjer se izračunata");
{
  const dc = readFileSync(join(koren, "delovni-cas.js"), "utf8");
  const stat = readFileSync(join(koren, "statistika-core.js"), "utf8");
  const admin = readFileSync(join(koren, "admin.html"), "utf8");

  // LD = 8 h in šteje med delovne ure.
  trdi(/LD:\s*8\b/.test(dc), "LD je v šifrantu ur 8 h");
  trdi(/o\.ur \+= ldUr/.test(stat), "in se prišteje k skupnim uram zaposlenega");

  // Prost dan se meri po KOLEDARSKEM TEDNU, ne po dolžini niza.
  trdi(/ponedeljekTedna\(/.test(dc), "prost dan se meri po koledarskem tednu (PON–NED)");
  trdi(/vrsta: "prostDan"/.test(dc), "kršitev ima svojo vrsto");
  // Besedilo v vmesniku ne sme obljubljati drugačnega pravila.
  const brezKomentarjev = admin.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  trdi(!/največ 7 zaporednih delovnih dni/.test(brezKomentarjev),
    "vmesnik ne obljublja meje »največ 7 zaporednih delovnih dni«");
  trdi(/prost dan v vsakem koledarskem tednu/.test(brezKomentarjev),
    "ampak pove pravo pravilo");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
