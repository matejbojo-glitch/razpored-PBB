#!/usr/bin/env node
/* Preizkus generatorja dežurstev: kršitve pravil, zaklenjeni dnevi in
 * ročno urejanje razporeda (generator-core.js + admin.html).
 *
 * Zakaj obstaja: doslej generiranega razporeda ni bilo mogoče popraviti -
 * tabela je bila samo za gledanje. Dan, ki ga generator ni znal razrešiti,
 * je ostal PRAZEN in se ob objavi tiho izgubil (isto, kot je Velušček
 * izpadla iz NZV). Ponovno generiranje sredi meseca je premešalo tudi že
 * objavljeni del.
 *
 * Najpomembnejše je, da generator IN zaslon o istem dnevu ne trdita vsak
 * svoje: oba uporabljata isto funkcijo preveriDezurstva.
 *
 * Zagon: node skripte/preveri-dezurstva-urejanje.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const Generator = require(join(koren, "generator-core.js"));
const admin = readFileSync(join(koren, "admin.html"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const KADER = [
  { ime: "A", obstojeceStevilo: 0 },
  { ime: "B", obstojeceStevilo: 0 },
  { ime: "C", obstojeceStevilo: 0 },
  { ime: "D", obstojeceStevilo: 0 },
  { ime: "E", obstojeceStevilo: 0 },
];

console.log("1) preveriDezurstva pozna vsa pravila");
{
  const staff = [
    { ime: "A", dopust: ["2026-09-10"], prostDanVTednu: "PO", maxMesecno: 2, zadnjeDezurstvo: "2026-08-31" },
    { ime: "B", samoMedTednom: true },
  ];
  const razpored = [
    { datum: "2026-09-01", zaposleni: "A" },   // 1 dan po zgodovinskem dežurstvu
    { datum: "2026-09-05", zaposleni: "B" },   // sobota, B dežura samo med tednom
    { datum: "2026-09-07", zaposleni: "A" },   // ponedeljek = A ima prost dan
    { datum: "2026-09-10", zaposleni: "A" },   // A je na dopustu, hkrati 4. v mesecu (maks 2)
  ];
  const izid = {};
  Generator.preveriDezurstva({ razpored, staff, minRazmikDni: 3 })
    .forEach(r => { izid[r.datum] = r.krsitve; });
  jseq(izid["2026-09-01"], ["razmik"], "prekratek razmik do dežurstva iz ZGODOVINE se opazi");
  jseq(izid["2026-09-05"], ["vikend"], "kdor dežura samo med tednom, v soboto krši");
  trdi(izid["2026-09-07"].includes("prostDan"), "fiksen prost dan v tednu");
  trdi(izid["2026-09-10"].includes("odsoten"), "dopust");
  trdi(izid["2026-09-10"].includes("maxMesecno"), "presežen mesečni maksimum");
  Object.keys(Generator.KRSITVE_OPIS).forEach(k =>
    trdi(!!Generator.KRSITVE_OPIS[k], `kršitev "${k}" ima razlago v slovenščini`));
}

console.log("2) vikendna kvota: drugi vikend v istem mesecu krši");
{
  const staff = [{ ime: "A" }];
  const razpored = [
    { datum: "2026-09-05", zaposleni: "A" },   // sobota
    { datum: "2026-09-12", zaposleni: "A" },   // naslednja sobota
  ];
  const izid = {};
  Generator.preveriDezurstva({ razpored, staff, minRazmikDni: 0, maxVikendMesecno: true })
    .forEach(r => { izid[r.datum] = r.krsitve; });
  jseq(izid["2026-09-05"], [], "prvi vikend je v redu");
  jseq(izid["2026-09-12"], ["vikendKvota"], "drugi vikend istega meseca krši");
}

console.log("3) dan brez rešitve ne ostane prazen – predlaga najmanj slabega");
{
  // Dva človeka, razmik 3 dni: nekje mora generator popustiti.
  const res = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-08", minRazmikDni: 3,
    staff: [{ ime: "A", obstojeceStevilo: 0 }, { ime: "B", obstojeceStevilo: 0 }],
  });
  const prazni = res.razpored.filter(r => !r.zaposleni);
  jseq(prazni, [], "noben dan ne ostane brez dežurnega");
  const sila = res.razpored.filter(r => r.sila);
  trdi(sila.length > 0, "nekateri dnevi so označeni kot predlagani kljub pravilom");
  trdi(sila.every(r => (r.krsitve || []).length > 0), "pri vsakem takem dnevu piše, katero pravilo krši");
  trdi(res.opozorila.some(o => /Predlagan je/.test(o.sporocilo)),
    "opozorilo pove ime predlaganega in kršitev");
}

console.log("4) na dopustu se generator dotakne ŠELE, ko ni nikogar drugega");
{
  // A je ves teden na dopustu; B ima samo prekratek razmik. Popustiti mora
  // pri razmiku (teža 10), ne pri dopustu (teža 100).
  const res = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-03", minRazmikDni: 5,
    staff: [
      { ime: "A", obstojeceStevilo: 0, dopust: ["2026-09-01", "2026-09-02", "2026-09-03"] },
      { ime: "B", obstojeceStevilo: 0 },
    ],
  });
  const naDopustu = res.razpored.filter(r => (r.krsitve || []).includes("odsoten"));
  jseq(naDopustu, [], "nikogar ne postavi na dan, ko je na dopustu, če obstaja druga možnost");
  trdi(res.razpored.every(r => r.zaposleni === "B"), "vse prevzame B, čeprav krši razmik");
}

console.log("5) zaklenjeni (že objavljeni) dnevi se ne premešajo");
{
  const zaklenjeni = { "2026-09-01": "E", "2026-09-02": "E" };
  const res = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-10", minRazmikDni: 3,
    staff: KADER, zaklenjeni,
  });
  const prvi = res.razpored.find(r => r.datum === "2026-09-01");
  const drugi = res.razpored.find(r => r.datum === "2026-09-02");
  trdi(prvi.zaposleni === "E" && prvi.zaklenjeno, "1. 9. ostane E in je označen kot zaklenjen");
  trdi(drugi.zaposleni === "E" && drugi.zaklenjeno, "2. 9. prav tako");
  // Brez zaklepa bi generator izbral koga drugega - to je bistvo.
  const brez = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-10", minRazmikDni: 3, staff: KADER,
  });
  trdi(brez.razpored.find(r => r.datum === "2026-09-01").zaposleni !== "E",
    "brez zaklepa bi generator za 1. 9. izbral koga drugega – zaklep torej res deluje");
  // Zaklenjeni dnevi se štejejo v pravičnost (sicer bi E dobil še dodatna).
  const stanjeE = res.stanje.find(s => s.ime === "E");
  trdi(stanjeE.novih >= 2, "zaklenjena dneva se štejeta v število dežurstev osebe");
}

console.log("6) zaklep ne velja za osebo, ki je ni več v kadru");
{
  const res = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-04", minRazmikDni: 1,
    staff: KADER, zaklenjeni: { "2026-09-01": "NEKDO DRUG" },
  });
  const prvi = res.razpored.find(r => r.datum === "2026-09-01");
  trdi(!!prvi.zaposleni && prvi.zaposleni !== "NEKDO DRUG",
    "neznano ime v zaklepu se preskoči, dan pa se vseeno razporedi");
}

console.log("7) generator in zaslon uporabljata ISTO preverbo");
{
  const res = Generator.generirajDezurstva({
    startISO: "2026-09-01", endISO: "2026-09-30", minRazmikDni: 3, staff: KADER,
  });
  const znova = {};
  Generator.preveriDezurstva({
    razpored: res.razpored, staff: KADER, minRazmikDni: 3, maxVikendMesecno: true,
  }).forEach(r => { znova[r.datum] = r.krsitve; });
  const razlike = res.razpored.filter(r => JSON.stringify(r.krsitve) !== JSON.stringify(znova[r.datum]));
  jseq(razlike.map(r => r.datum), [],
    "kršitve iz generatorja so enake tistim, ki jih izračuna zaslon po ročnem popravku");
}

console.log("8) admin.html: razpored je urejljiv in objava upošteva popravke");
{
  trdi(/onChange=\{e => nastaviDezurnega\(r\.datum, e\.target\.value\)\}/.test(admin),
    "vsak dan ima spustni seznam za zamenjavo dežurnega");
  trdi(/Generator\.preveriDezurstva\(\{/.test(admin),
    "po ročnem popravku se kršitve preračunajo z isto funkcijo kot v generatorju");
  trdi(/zaklenjeni: zakleni/.test(admin) && /zakleniObjavljeno \? await nalozitObjavljena/.test(admin),
    "že objavljeni dnevi se preberejo iz baze in podajo generatorju");
  trdi(/🔒 \{r\.zaposleni\}/.test(admin), "zaklenjen dan je označen s ključavnico in ga ni mogoče zamenjati");
  trdi(/Generator\.KRSITVE_OPIS\[k\] \|\| k/.test(admin),
    "kršitve so na zaslonu izpisane v slovenščini, ne kot koda");
  trdi(/dni je ostalo brez dežurnega/.test(admin),
    "objava pove, če je kak dan ostal brez dežurnega");
  trdi(!/se ob spremembi meseca počistijo/.test(admin),
    "zastarela pomoč o čiščenju dopustov ob menjavi meseca je popravljena");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
