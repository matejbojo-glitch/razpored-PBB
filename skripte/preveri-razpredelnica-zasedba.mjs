#!/usr/bin/env node
/* Preizkus Imenik → Razpredelnica: stalna zasedba nosilcev enot.
 *
 * Zakaj obstaja: uporabnik je poslal posnetek, na katerem imajo nekateri
 * ljudje (Mušič Ines, Tomaževič Simona, Magdalena Mavri Tratnik) v celi
 * vrstici komaj kakšen vnos ali nobenega, razpored pa se je zdel, kot da
 * se konča sredi meseca. Vzrok je bil isti kot pri NZV mreži: mreža se
 * je polnila samo iz objavljenih schedule_entries, za vodje pa se dnevni
 * razpored ne objavlja — njihova enota je stalna in zapisana v
 * lead_departments.
 *
 * Preverjamo:
 *   - nosilec ima vnos za VSAK delovni dan meseca, od prvega do zadnjega;
 *   - sobota, nedelja in dela prosti praznik ostanejo prazni;
 *   - objavljen vnos in odsotnost imata prednost pred izpeljavo;
 *   - daljša odsotnost (porodniška) zapolni mesec z uradno kratico POR,
 *     ne pusti prazne vrstice;
 *   - oddelčni kader (vloga user) se ne izpeljuje — ti imajo objavljen
 *     razpored in vikende delajo normalno;
 *   - izpeljane celice so označene, da jih izris loči od objavljenih.
 *
 * Preizkus poganja RESNIČNO kodo iz imenik.html (izsek useEffect-a, ki
 * gradi mrežo), ne svoje kopije pravila.
 *
 * Zagon: node skripte/preveri-razpredelnica-zasedba.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "imenik.html"), "utf8");

function izvleciFn(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v imenik.html.");
  let globina = 0;
  for (let i = html.indexOf("{", zac); i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciBlok(zacetek, konec) {
  const z = html.indexOf(zacetek);
  if (z === -1) throw new Error("Bloka " + zacetek + " ni v imenik.html.");
  const k = html.indexOf(konec, z);
  if (k === -1) throw new Error("Konca bloka " + zacetek + " ni v imenik.html.");
  return html.slice(z, k + konec.length).replace(/^const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// ---------------------------------------------------------------------
// Sandbox z resnično kodo
// ---------------------------------------------------------------------
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
// Ujemanje imen živi v imena.js (skupni modul za vse zaslone).
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext("var imenaSeUjemataBrezStresic = window.Imena.seUjemata;", sandbox);
// Uradna legenda in razvrstitev izmen živijo v izmene.js (skupni modul
// za vse zaslone) - tu jih naložimo in preimenujemo v imena, ki jih
// uporablja izluščena koda iz imenik.html.
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
vm.runInContext([
  "var vnosPoKratici = window.Izmene.poKratici;",
  "var izmenaKratica = window.Izmene.kratica;",
  "var izmenaBarva = window.Izmene.barva;",
  "var stanjeIzKode = window.Izmene.stanje;",
].join("\n"), sandbox);

// Izsek iz useEffect-a v StanjeRazpredelnica: del, ki iz objavljenih
// vnosov, odsotnosti in nosilcev zgradi mrežo "id|datum". Prenesen
// dobesedno iz imenik.html — če se tam spremeni, se mora spremeniti tudi
// tu, sicer preizkus začne preverjati zastarelo pravilo.
const zacetekIzseka = html.indexOf("      const m2 = {};");
const konecIzseka = html.indexOf("      setPoDnevih(m2);");
if (zacetekIzseka === -1 || konecIzseka === -1) {
  throw new Error("Izseka gradnje mreže (m2 … setPoDnevih) ni najti v imenik.html.");
}
const izsek = html.slice(zacetekIzseka, konecIzseka);
// V izseku sta dve stvari, ki ju tu ni: JE_NZV_VLOGA in KIND_KRATICA.
vm.runInContext(`
var JE_NZV_VLOGA = new Set(["vodja", "admin"]);
var KIND_KRATICA = { ld: "LD", bs: "BS", sti: "STI", omejitev: null };
function zgradiMrezo(seznam, nosilci, vpisi, odsotnosti, dnevi, pokrivanja){
  pokrivanja = pokrivanja || [];
  var jeNzvOseba = {};
  seznam.forEach(function (p) { jeNzvOseba[p.id] = JE_NZV_VLOGA.has(p.role); });
${izsek.replace(/^ {6}const m2 = \{\};/m, "  var m2 = {};")
        .replace(/^ {6}const jeNzvOseba[\s\S]*?\n(?= {6})/m, "")
        .replace(/^ {6}seznam\.forEach\(p => \{ jeNzvOseba.*$/m, "")}
  return m2;
}`, sandbox);

const profil = (id, full_name, role = "vodja") => ({ id, full_name, role, department_code: "NZV" });
const SEZNAM = [
  profil("a", "Alukić Dino", "admin"),
  profil("m", "Mušič Ines"),
  profil("t", "Tomaževič Simona"),
  profil("p", "Pogačnik Teja"),
  profil("t2", "Torkar Tanja"),
  profil("n", "Novak Ana", "user"),
];
// Pari nadomeščanj - potrebni, ker mreža odslej računa tudi enoto, na
// kateri je oseba TA DAN (preselitev ob tuji odsotnosti).
const POKRIVANJA = [
  { nosilec: "ALUKIĆ DINO", nadomesca: "TORKAR TANJA", enota: "ŽO", prednost: 1 },
];
const NOSILCI = [
  { full_name: "ALUKIĆ DINO", inicialke: "ALU", enote: "ŽO", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "MUŠIČ INES", inicialke: "MUŠ", enote: "UA/SA", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "TOMAŽEVIČ SIMONA", inicialke: "TOM", enote: "A", odsotnost_tip: null, odsotnost_do: null },
  { full_name: "POGAČNIK TEJA", inicialke: "POG", enote: "E1", odsotnost_tip: "porodniška", odsotnost_do: "2027-07-31" },
  { full_name: "TORKAR TANJA", inicialke: "TOR", enote: "DB", odsotnost_tip: null, odsotnost_do: null },
];

// September 2026 (30 dni). 1.9. je torek, 5./6., 12./13., 19./20., 26./27. vikendi.
function dneviMeseca(leto, mesec) {
  const zadnji = new Date(leto, mesec, 0).getDate();
  const out = [];
  for (let d = 1; d <= zadnji; d++) {
    const iso = `${leto}-${String(mesec).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(iso + "T00:00:00").getDay();
    out.push({ iso, dan: d, vikend: dow === 0 || dow === 6 });
  }
  return out;
}
const DNEVI = dneviMeseca(2026, 9);

function mreza({ vpisi = [], odsotnosti = [], nosilci = NOSILCI, dnevi = DNEVI } = {}) {
  return sandbox.zgradiMrezo(SEZNAM, nosilci, vpisi, odsotnosti, dnevi, POKRIVANJA);
}

console.log("1) Nosilec ima vnos za VSAK delovni dan — do konca meseca, ne le do določenega dne");
{
  const m = mreza();
  const delovni = DNEVI.filter(d => !sandbox.window.Prazniki.jeDelaProstDan(d.iso));
  ["a", "m", "t"].forEach(id => {
    const manjka = delovni.filter(d => !m[id + "|" + d.iso]).map(d => d.dan);
    trdi(manjka.length === 0,
      `${id}: vseh ${delovni.length} delovnih dni je zapolnjenih` + (manjka.length ? ` — manjkajo dnevi ${manjka.join(", ")}` : ""));
  });
  eq(m["m|2026-09-30"].kratica, "DOP", "Mušič Ines ima vnos tudi 30.9. (zadnji dan meseca)");
  eq(m["t|2026-09-01"].kratica, "DOP", "Tomaževič Simona ima vnos že 1.9. (prvi dan meseca)");
}

console.log("2) Vikend in dela prost praznik ostaneta prazna");
{
  const m = mreza();
  eq(m["a|2026-09-05"], undefined, "sobota 5.9.");
  eq(m["a|2026-09-06"], undefined, "nedelja 6.9.");
  const dec = dneviMeseca(2026, 12);
  const md = mreza({ dnevi: dec });
  eq(md["a|2026-12-24"].kratica, "DOP", "četrtek 24.12.2026 je delovni dan");
  eq(md["a|2026-12-25"], undefined, "petek 25.12.2026 (božič) je prost");
}

console.log("3) Daljša odsotnost zapolni mesec z uradno kratico, ne pusti prazne vrstice");
{
  const m = mreza();
  eq(m["p|2026-09-01"].kratica, "POR", "Pogačnik Teja — porodniški dopust");
  eq(m["p|2026-09-30"].kratica, "POR", "in to do konca meseca");
  eq(m["p|2026-09-05"], undefined, "vikend ostane prazen tudi njej");
}

console.log("4) Objavljen vnos in odsotnost imata prednost pred izpeljavo");
{
  const m = mreza({
    vpisi: [{ employee_id: "a", work_date: "2026-09-02", shift_code: "DEŽURSTVO" }],
    odsotnosti: [{ full_name: "Mušič Ines", work_date: "2026-09-03", kind: "ld" }],
  });
  eq(m["a|2026-09-02"].kratica, "DEŽ", "objavljeno dežurstvo obvelja");
  trdi(!m["a|2026-09-02"].izpeljano, "objavljena celica ni označena kot izpeljana");
  eq(m["m|2026-09-03"].kratica, "LD", "letni dopust obvelja pred izpeljano prisotnostjo");
  eq(m["a|2026-09-01"].kratica, "DOP", "ostali dnevi so še vedno izpeljani");
  trdi(m["a|2026-09-01"].izpeljano === true, "izpeljana celica je označena");
}

console.log("4b) Celica pove tudi ENOTO, in to po dejanskem razporedu");
{
  // Uporabnikova zahteva: v Razpredelnici mora biti vidno, na katerem
  // oddelku je oseba - pravilno glede na vnešen razpored, ne le stalna
  // enota. Ob nadomeščanju se ta spremeni.
  const m = mreza();
  eq(m["a|2026-09-01"].enota, "ŽO", "Alukić na svoji enoti");
  eq(m["m|2026-09-01"].enota, "UA/SA", "Mušič na svojih enotah");

  // Ko je Alukić odsoten, ga po tabeli pokrivanj nadomesti Torkar - ta se
  // PRESELI na ŽO in na svojem DB je tisti dan ni.
  const m2 = mreza({ odsotnosti: [{ full_name: "Alukić Dino", work_date: "2026-09-02", kind: "ld" }] });
  eq(m2["t2|2026-09-02"] && m2["t2|2026-09-02"].enota, "ŽO", "Torkar se preseli na ŽO");
  eq(m2["a|2026-09-02"].kratica, "LD", "Alukić je tisti dan na dopustu");
  trdi(!m2["a|2026-09-02"].enota, "ob dopustu se enota ne izpiše - tisti dan ni na nobeni");
}

console.log("5) Oddelčni kader se NE izpeljuje — nima zapisa nosilca");
{
  const m = mreza();
  eq(m["n|2026-09-01"], undefined, "Novak Ana (vloga user) ostane prazna");
}

console.log("6) Nosilec brez zapisanih enot se ne izpeljuje");
{
  const m = mreza({
    nosilci: [{ full_name: "ALUKIĆ DINO", inicialke: "ALU", enote: null, odsotnost_tip: null, odsotnost_do: null }],
  });
  eq(m["a|2026-09-01"], undefined, "prazne enote pomenijo, da ni nosilec oddelka");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
