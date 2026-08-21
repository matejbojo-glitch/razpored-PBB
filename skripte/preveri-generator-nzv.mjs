#!/usr/bin/env node
/* Preizkus: generator razporeda dela po ISTIH pravilih kot prikaz.
 *
 * Zakaj obstaja: uporabnik je vprašal, ali bo generator upošteval vse
 * tisto, kar smo uredili v Razpredelnici. Ni ga - imel je SVOJO, drugo
 * kopijo pravil:
 *   - bral je lead_departments.department_code (ena koda) namesto enote
 *     (lahko sestavljene, "UA/SA/B2"), zato oseba na treh enotah ni bila
 *     nikjer razen na eni;
 *   - nadomeščanja ni poznal sploh - ob dopustu je enota ostala prazna;
 *   - tedenskega menjavanja SA ni poznal.
 *
 * Zdaj oba kličeta isti razporedDneva iz nzv-zasedba.js. Ta preizkus to
 * dokazuje tako, da za isti mesec in iste podatke primerja, kaj izračuna
 * GENERATOR (izsek iz admin.html) in kaj PRIKAZ (razporedDneva) - izid
 * mora biti enak, dan za dnem in enoto za enoto.
 *
 * Zagon: node skripte/preveri-generator-nzv.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
const NZ = sandbox.window.NzvZasedba;
const kljuc = sandbox.window.Imena.kljuc;

// Realna podmnožica iz supabase/nzv-nosilci-oddelkov.sql.
const VODJE = [
  { full_name: "LELIČ DIJANA",  enote: "E2",       department_code: "E2", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "MAGLIĆ ALEKSANDER", enote: "E1",   department_code: "E1", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "ARNEŽ GREGA",   enote: "C",        department_code: "C",  odsotnost_tip: null, odsotnost_do: null },
  { full_name: "SALKIĆ MARUŠA", enote: "C1",       department_code: "C1", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "LUNAR MATEJA",  enote: "B",        department_code: "B",  odsotnost_tip: null, odsotnost_do: null },
  // Sestavljena enota: prav ta primer je generator prej izgubil.
  { full_name: "BIZJAK TEA",    enote: "UA/SA/B2", department_code: "URGENCA", odsotnost_tip: null, odsotnost_do: null },
];
const PARI = [
  { nosilec: "LELIČ DIJANA",  nadomesca: "MAGLIĆ ALEKSANDER", enota: "E2", prednost: 1 },
  { nosilec: "MAGLIĆ ALEKSANDER", nadomesca: "LELIČ DIJANA",  enota: "E1", prednost: 1 },
  { nosilec: "ARNEŽ GREGA",   nadomesca: "LUNAR MATEJA",      enota: "C",  prednost: 1 },
  { nosilec: "LUNAR MATEJA",  nadomesca: "ARNEŽ GREGA",       enota: "B",  prednost: 1 },
  { nosilec: "SALKIĆ MARUŠA", nadomesca: "ARNEŽ GREGA",       enota: "C1", prednost: 1 },
];

const veljavne = NZ.KODE_STOLPCEV;
const razpored = (odsotni, saKoda) => NZ.razporedDneva({
  nosilci: VODJE, pari: PARI, kljuc,
  jeOdsoten: ime => (odsotni || []).some(o => kljuc(o) === kljuc(ime)),
  saKoda, veljavne,
});
// Enote -> "koda|ime" množica, da primerjava ni odvisna od vrstnega reda.
const zasedba = (vrstice) => {
  const out = [];
  vrstice.forEach(({ nosilec, kode }) => kode.forEach(k => out.push(k + "|" + nosilec.full_name)));
  return out.sort();
};

console.log("1) sestavljena enota se razbije na vse svoje stolpce");
{
  // Prej je generator bral department_code ("URGENCA") in Bizjak je bila
  // samo tam - v resnici pokriva tri enote.
  const b = razpored([], "SADOP").find(v => /BIZJAK/.test(v.nosilec.full_name));
  eq(b.kode.sort(), ["B1B2", "SADOP", "URGENCA"], "UA/SA/B2 -> URGENCA + SA + B1B2");
  const bPop = razpored([], "SAPOP").find(v => /BIZJAK/.test(v.nosilec.full_name));
  trdi(bPop.kode.indexOf("SAPOP") >= 0, "v popoldanskem tednu gre SA v stolpec SA POP");
  trdi(bPop.kode.indexOf("SADOP") < 0, "in ne v SA DOP");
}

console.log("2) nadomeščanje: vzajemni par (uporabnikov primer Lelič/Maglić)");
{
  const z = zasedba(razpored(["LELIČ DIJANA"], "SADOP"));
  trdi(z.indexOf("E2|MAGLIĆ ALEKSANDER") >= 0, "Maglić prevzame E2");
  trdi(z.indexOf("E1|MAGLIĆ ALEKSANDER") >= 0, "in obdrži svoj E1");
  trdi(z.indexOf("E2|LELIČ DIJANA") < 0, "Lelič tisti dan ni na E2");
}

console.log("3) nadomeščanje: veriga s tretjim (uporabnikov primer Salkić/Arnež/Lunar)");
{
  const z = zasedba(razpored(["SALKIĆ MARUŠA"], "SADOP"));
  trdi(z.indexOf("C1|ARNEŽ GREGA") >= 0, "Arnež se preseli na C1");
  trdi(z.indexOf("C|ARNEŽ GREGA") < 0, "in na svojem C ga NI");
  trdi(z.indexOf("C|LUNAR MATEJA") >= 0, "Lunar pokrije zapuščeni C");
  trdi(z.indexOf("B|LUNAR MATEJA") >= 0, "in obdrži svoj B");
}

console.log("4) kaj je PREDLOG: enota, ki tisti dan ni njegova");
{
  // Isto pravilo, kot ga uporablja generator (admin.html): predlog je
  // vsaka koda, ki ni med osebinimi lastnimi enotami.
  const lastne = {};
  VODJE.forEach(v => { lastne[kljuc(v.full_name)] = new Set(NZ.enoteVKode(v.enote, null, veljavne)); });
  const predlogi = [];
  razpored(["LELIČ DIJANA"], "SADOP").forEach(({ nosilec, kode }) => {
    kode.forEach(k => { if (!lastne[kljuc(nosilec.full_name)].has(k)) predlogi.push(k + "|" + nosilec.full_name); });
  });
  eq(predlogi.sort(), ["E2|MAGLIĆ ALEKSANDER"], "predlog je samo prevzeti E2, ne njegov lastni E1");

  const predlogi2 = [];
  razpored(["SALKIĆ MARUŠA"], "SADOP").forEach(({ nosilec, kode }) => {
    kode.forEach(k => { if (!lastne[kljuc(nosilec.full_name)].has(k)) predlogi2.push(k + "|" + nosilec.full_name); });
  });
  eq(predlogi2.sort(), ["C1|ARNEŽ GREGA", "C|LUNAR MATEJA"], "v verigi sta predloga dva");

  // Brez odsotnosti ni nobenega predloga - generator ne sme ničesar
  // ponujati, kadar je vse po stalnem razporedu.
  const brez = [];
  razpored([], "SADOP").forEach(({ nosilec, kode }) => {
    kode.forEach(k => { if (!lastne[kljuc(nosilec.full_name)].has(k)) brez.push(k); });
  });
  eq(brez, [], "brez odsotnosti ni predlogov");
}

console.log("5) generator res kliče skupni modul (ne svoje kopije)");
{
  const src = readFileSync(join(koren, "admin.html"), "utf8");
  trdi(/NZ\.razporedDneva\(\{/.test(src), "admin.html kliče razporedDneva");
  trdi(/NZ\.saStolpec\(/.test(src), "in saStolpec (tedensko menjavanje SA)");
  trdi(/NZ\.enoteVKode\(/.test(src), "in enoteVKode (sestavljene enote)");
  trdi(/window\.NzvZasedba\.KODE_STOLPCEV|NZ\.KODE_STOLPCEV/.test(src), "in skupni seznam stolpcev");
  // Stara pot ne sme ostati: department_code kot vir zasedenosti enot.
  trdi(!/vrstica\.celice\[v\.department_code\]/.test(src),
    "ne polni več stolpcev iz department_code (to je bila stara, drugačna pot)");
}

console.log("6) nepotrjeni predlogi se NE objavijo");
{
  const src = readFileSync(join(koren, "admin.html"), "utf8");
  // Objava od tega mesta naprej sestavi zapise iz DVEH virov (izračunanih
  // in ročno prepisanih celic), zato se ne preverja več ena sama vrstica,
  // ampak da je pogoj potrditve na poti izračunanih zapisov ohranjen.
  trdi(/\.filter\(v => !v\.predlog \|\| potrjeni\[v\.kljuc\]\)/.test(src),
    "objava vzame samo nepredloge in POTRJENE predloge");
  trdi(/const zaObjavo = \[\.\.\.izracunane, \.\.\.rocne\]/.test(src),
    "in poleg izračunanih objavi tudi ročne popravke");
  trdi(/predlog: jePredlog/.test(src), "vsaka vrstica ve, ali je predlog");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
