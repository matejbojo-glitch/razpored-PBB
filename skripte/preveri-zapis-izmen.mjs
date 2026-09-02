#!/usr/bin/env node
/* Preizkus: izmene se uporabniku povsod izpišejo enako in pravilno -
 * "Dopoldne", "Popoldne", "Nočna" (velika začetnica, brez verzalk).
 *
 * Zakaj obstaja: šifre v bazi so zgodovinske in neenotne - "dopoldan"
 * (male črke), "NOČNA" (verzalke), "PRISOTEN". Aplikacija jih je ponekod
 * izpisovala takšne, kot so, zato je uporabnik na istem zaslonu videl
 * "dopoldan" in "NOČNA".
 *
 * Pravilo: uporabniku se izpiše NAZIV iz uradne legende (izmene.js),
 * šifra v bazi pa se NE spreminja - ostati mora tak zapis, kot je v
 * bolnišničnih preglednicah, sicer bi aplikacija v uradni Google Sheet
 * pisala drugo besedo, kot je v njem zdaj.
 *
 * Zagon: node skripte/preveri-zapis-izmen.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
const I = sandbox.window.Izmene;

console.log("1) naziv je pravilno zapisan, ne glede na to, kako je šifra");
{
  eq(I.naziv("dopoldan"), "Dopoldne", "dopoldan -> Dopoldne");
  eq(I.naziv("DOPOLDAN"), "Dopoldne", "verzalke prav tako");
  eq(I.naziv("PRISOTEN"), "Dopoldne", "PRISOTEN (vodje) -> Dopoldne");
  eq(I.naziv("popoldan"), "Popoldne", "popoldan -> Popoldne");
  eq(I.naziv("NOČNA"), "Nočna", "NOČNA -> Nočna");
  eq(I.naziv("nocna"), "Nočna", "brez strešice prav tako");
  eq(I.naziv("NOČNA12"), "Nočna 12", "NOČNA12 -> Nočna 12");
  eq(I.naziv("NOČNA od 19h"), "Nočna 11 (od 19)", "nočna od 19");
  eq(I.naziv("DNEVNA12"), "Dnevna 12", "DNEVNA12 -> Dnevna 12");
  eq(I.naziv("popoldan do 19"), "Popoldne do 19", "popoldan do 19");
  eq(I.naziv("DEŽURSTVO"), "Dežurstvo (NZV)", "dežurstvo");
}

console.log("2) sprejme tudi NOVO pisavo (če jo kdo vtipka ali prinese preglednica)");
{
  eq(I.naziv("dopoldne"), "Dopoldne", "dopoldne");
  eq(I.naziv("Popoldne"), "Popoldne", "Popoldne");
  eq(I.naziv("popoldne do 19"), "Popoldne do 19", "popoldne do 19");
  // In da to niso pokvarila starih vzorcev:
  eq(I.kratica("dopoldan"), "DOP", "stara pisava ima še vedno pravo kratico");
  eq(I.kratica("dopoldne"), "DOP", "nova pisava ima isto kratico");
  eq(I.barva("dopoldne"), I.barva("dopoldan"), "in isto barvo");
}

console.log("3) v nazivih legende ni več stare oblike");
{
  const naz = I.KRATICE.map(v => v[2]);
  const slabi = naz.filter(n => /Dopoldan|Popoldan/.test(n));
  trdi(slabi.length === 0, "nobenega 'Dopoldan'/'Popoldan'"
    + (slabi.length ? " – " + slabi.join(", ") : ""));
  const verzalke = naz.filter(n => /^[A-ZČŠŽ0-9 ()\-.]+$/.test(n) && n.length > 3);
  trdi(verzalke.length === 0, "noben naziv ni zapisan s samimi verzalkami"
    + (verzalke.length ? " – " + verzalke.join(", ") : ""));
  naz.forEach(n => {
    trdi(/^[A-ZČŠŽ]/.test(n), `"${n}" se začne z veliko začetnico`);
  });
}

console.log("4) zasloni izpisujejo NAZIV, ne surove šifre");
{
  const index = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/function shiftLabel\(sifra\)\{[\s\S]{0,160}window\.Izmene\.naziv\(sifra\)/.test(index),
    "index.html: shiftLabel vrne naziv iz legende");
  // "Po oddelkih" je gosta mreža: delovne izmene s polnim nazivom,
  // odsotnosti s kratico (LD, BS, KPU) - uporabnikova odločitev,
  // avgust 2026. Zato nazivZaMrezo in ne shiftLabel.
  trdi(/\{window\.Izmene\.nazivZaMrezo\(sifra\)\}/.test(index),
    "index.html: celica v 'Po oddelkih' izpiše naziv iz legende");
  // "Moj razpored" pa izpiše ŽE sestavljeno besedilo (z enoto in
  // dežurstvom) - nikoli še enkrat skozi shiftLabel, sicer se skrči
  // nazaj na golo "Dopoldne".
  //
  // Od septembra 2026 ima ta pogled dve obliki (koledar PON-NED na širokem
  // zaslonu, seznam po dnevih na telefonu), zato besedilo pripravi ena sama
  // skupna funkcija celicaDneva - obe obliki izpišeta njen rezultat. Prav
  // zato je preverba tu vezana na to pripravo in ne na posamezen izris:
  // dokler gre besedilo skozi prikazNaZaslonu ENKRAT, je pravilo izpolnjeno
  // v obeh oblikah hkrati.
  // Od septembra 2026 se besedilu lahko pripne še oznaka "(A)" (izmena
  // pokriva tudi oddelek A) - prikazNaZaslonu se zato ne izvede še enkrat,
  // le rezultat se podaljša.
  trdi(/besedilo: prikazNaZaslonu\(prikaz\)( \+ oznakaA)?,/.test(index)
    && /\{prikazNaZaslonu\(todayPrikaz\)\}/.test(index),
    "index.html: 'Moj razpored' izpiše prikazNaZaslonu, ne shiftLabel");
  trdi(/\{c\.besedilo\}/.test(index),
    "index.html: oba prikaza (koledar in seznam) izpišeta isto pripravljeno besedilo");
  trdi(!/\{shiftLabel\((prikaz|todayPrikaz)\)\}/.test(index),
    "index.html: nikjer dvojnega izpisa shiftLabel(nzvPrikaz(...))");
  const obrazec = readFileSync(join(koren, "obrazec.html"), "utf8");
  trdi(/window\.Izmene\.naziv\(sifra\)/.test(obrazec),
    "obrazec.html (Menjava): izmena se izpiše prek legende");
  trdi(/<script src="izmene\.js"><\/script>/.test(obrazec),
    "obrazec.html legendo tudi naloži");
}

console.log("5) generator ustvarja NOVI zapis (uporabnikova odločitev)");
{
  // Prej je kalup ustvarjal "dopoldan"/"NOČNA" in uporabnik je videl dve
  // pisavi na istem zaslonu. Odslej ustvarja enak zapis kot legenda.
  // Posledica, ki jo je uporabnik izrecno sprejel: v razpored in v
  // bolnišnični Google Sheet se odslej zapiše nova beseda.
  // Komentarje odstranimo: v njih je stara pisava navedena kot POJASNILO
  // ("prej je kalup ustvarjal dopoldan/NOČNA") in preizkus bi se ujel na
  // lastnem besedilu namesto na kodi.
  const gen = readFileSync(join(koren, "generator-core.js"), "utf8")
    .split("\n").filter(v => !/^\s*(\/\/|\*|\/\*)/.test(v)).join("\n");
  trdi(/"Dopoldne"/.test(gen), "kalup zapiše 'Dopoldne'");
  trdi(/"Popoldne"/.test(gen), "in 'Popoldne'");
  trdi(/"Nočna"/.test(gen), "in 'Nočna'");
  trdi(!/"dopoldan"|"popoldan"|"NOČNA"/.test(gen), "stare pisave ne ustvarja več");
}

console.log("6) STARI zapisi v bazi in v preglednicah delujejo NAPREJ");
{
  // To je pogoj, brez katerega bi sprememba pokvarila že objavljene
  // razporede: ure, statistika in pokritost se računajo iz šifre.
  const sb = { console }; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sb);
  const DC = sb.window.DelovniCas;
  [["dopoldan", "Dopoldne"], ["popoldan", "Popoldne"],
   ["popoldan do 19", "Popoldne do 19"], ["NOČNA", "Nočna"],
   ["NOČNA12", "Nočna 12"], ["DNEVNA12", "Dnevna 12"],
   ["NOČNA od 19h", "Nočna od 19h"]].forEach(([stara, nova]) => {
    const a = DC.podatkiIzmene ? DC.podatkiIzmene(stara) : DC.IZMENE[stara];
    const b = DC.podatkiIzmene ? DC.podatkiIzmene(nova) : DC.IZMENE[nova];
    trdi(!!a && !!b && a.zacetek === b.zacetek && a.konec === b.konec && a.ure === b.ure,
      `"${stara}" in "${nova}" imata iste ure`);
  });

  const sb2 = { console }; sb2.window = sb2;
  vm.createContext(sb2);
  vm.runInContext(readFileSync(join(koren, "dashboard-core.js"), "utf8"), sb2);
  const DB = sb2.window.DashboardCore || sb2.DashboardCore;
  if (DB && DB.classifyForStats) {
    eq(DB.classifyForStats("Dopoldne"), DB.classifyForStats("dopoldan"), "statistika: dopoldne = dopoldan");
    eq(DB.classifyForStats("Popoldne"), DB.classifyForStats("popoldan"), "statistika: popoldne = popoldan");
    eq(DB.classifyForStats("Nočna"), "noc", "statistika: Nočna je nočna");
  } else {
    trdi(/dopoldne/.test(readFileSync(join(koren, "dashboard-core.js"), "utf8")),
      "dashboard-core.js prepozna tudi 'dopoldne'");
  }

  const adm = readFileSync(join(koren, "admin.html"), "utf8");
  trdi(/startsWith\("dopoldne"\)/.test(adm), "admin.html (pokritost) prepozna 'dopoldne'");
  trdi(/startsWith\("popoldne"\)/.test(adm), "in 'popoldne'");
}

console.log("7) obvezna kopija src/shared/delovni-cas.js je usklajena");
{
  const a = readFileSync(join(koren, "src", "shared", "delovni-cas.js"), "utf8");
  const b = readFileSync(join(koren, "supabase", "functions", "_shared", "delovni-cas.js"), "utf8");
  trdi(a === b, "koledarska naročnina računa po istem pravilu kot aplikacija");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
