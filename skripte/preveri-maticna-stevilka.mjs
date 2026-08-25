#!/usr/bin/env node
/* Preizkus povezovanja oseb med viri po MATIČNI ŠTEVILKI.
 *
 * Aplikacija je ljudi doslej povezovala skoraj izključno po imenu. To je
 * tih vir izgub, ne kozmetika: nosilci_oddelkov (od koder pridejo imena za
 * razpored NZV) ima imena z VELIKIMI črkami ("ALUKIĆ DINO"), profili pa
 * "Priimek Ime" ("Alukić Dino" — supabase/imena-priimek-prvi.sql popravi
 * samo profili). Dobesedna primerjava zato ne najde nikogar. Enako
 * razhajanje delajo strešice (Bećirović/Becirovic) in dvobesedni priimki.
 *
 * Matična številka (kadrovski_podatki.employee_code) je stabilen ključ iz
 * Kadrisa, zato ima prednost; ime je rezerva, kadar številke ni — in tudi
 * takrat gre iskanje prek Imena.kljuc, ne dobesedno.
 *
 * Zagon: node skripte/preveri-maticna-stevilka.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
const Imena = sandbox.window.Imena;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const PROFILI = [
  { id: "a", full_name: "Alukić Dino", employee_code: "855" },
  { id: "b", full_name: "Bojić Matej", employee_code: "870" },
  { id: "c", full_name: "Bećirović Amir" },                       // brez matične
  { id: "d", full_name: "Mavri Tratnik Magdalena", employee_code: "925" },
];
const kazalo = Imena.kazalo(PROFILI);
const id = (ime, sifra) => { const p = kazalo.najdi(ime, sifra); return p ? p.id : null; };

console.log("1) matična številka je glavni ključ");
eq(id(null, "855"), "a", "sama številka najde osebo");
eq(id("popolnoma drugo ime", "870"), "b", "številka prevlada nad imenom");
eq(id("Alukić Dino", "925"), "d", "ob razhajanju odloči številka, ne ime");
eq(id("Nihče", "999"), null, "neznana številka ne najde nikogar");

console.log("2) ime kot rezerva – in ne dobesedno");
// Prav to razhajanje je pri objavi razporeda NZV izgubilo vseh 22 vodij.
eq(id("ALUKIĆ DINO"), "a", "velike črke (tako so imena v nosilci_oddelkov)");
eq(id("ALUKIC DINO"), "a", "izgubljene strešice");
eq(id("alukić dino"), "a", "male črke");
eq(id("  Alukić   Dino  "), "a", "odvečni presledki");
eq(id("Dino Alukić"), "a", "obrnjen vrstni red imena in priimka");
eq(id("BECIROVIC AMIR"), "c", "oseba brez matične številke se še vedno najde po imenu");
eq(id("MAVRI TRATNIK MAGDALENA"), "d", "dvobesedni priimek");
eq(id("Nihče Nikjer"), null, "neznano ime ne najde nikogar");
eq(id(""), null, "prazno ime ne najde nikogar");
eq(id(null), null, "manjkajoče ime ne vrže napake");

console.log("3) dvoumnosti se ne ugane");
// Dva človeka z istim imenom: če bi kazalo vrnilo prvega, bi razpored
// pristal pri napačni osebi. Rajši nič - klicatelj to javi kot manjkajoče.
const zDvojnikom = Imena.kazalo(PROFILI.concat([{ id: "e", full_name: "Alukić Dino" }]));
eq(zDvojnikom.najdi("Alukić Dino"), null, "podvojeno ime ne da zadetka");
eq(zDvojnikom.podvojenaImena, ["Alukić Dino"], "in se javi kot podvojeno");
// Z matično številko je ista oseba spet enolična - v tem je njena vrednost.
eq(zDvojnikom.najdi("Alukić Dino", "855").id, "a", "matična številka razreši tudi podvojeno ime");

console.log("4) uvoz imenika: vrstica brez e-pošte, a z matično številko");
const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
// vrsticaVZapis je znotraj komponente (const ... = (v) => {...}), zato se
// izlušči po oklepajih od "const vrsticaVZapis".
function izvleciPuscico(ime, src) {
  const z = src.indexOf("const " + ime + " = (");
  if (z === -1) throw new Error("Ni najden: " + ime);
  let g = 0;
  for (let k = src.indexOf("{", z); k < src.length; k++) {
    if (src[k] === "{") g++;
    else if (src[k] === "}") { g--; if (!g) return src.slice(z, k + 1).replace(/^const\s+/, "var "); }
  }
  throw new Error("Konec ni najden: " + ime);
}
sandbox.UNIT_TO_DEPT = {};
sandbox.ImportUtils = { normalizirajDatum: (v) => v || null };
vm.runInContext(izvleciPuscico("vrsticaVZapis", imenik), sandbox);
const vZapis = sandbox.vrsticaVZapis;

trdi(vZapis({ full_name: "Novak Ana", email: "ana@pb-begunje.si" }) !== null,
  "ime + e-pošta: sprejeto (kot doslej)");
trdi(vZapis({ full_name: "Novak Ana", employee_code: "912" }) !== null,
  "ime + matična številka brez e-pošte: SPREJETO (prej je odpadlo kot napaka)");
eq(vZapis({ full_name: "Novak Ana", employee_code: " 912 " }).employee_code, "912",
  "matična številka se obreže presledkov");
trdi(vZapis({ full_name: "Novak Ana" }) === null,
  "samo ime, brez e-pošte in brez številke: zavrnjeno (ni ključa za povezavo)");
trdi(vZapis({ email: "ana@pb-begunje.si", employee_code: "912" }) === null,
  "brez imena: zavrnjeno");

console.log("5) stolpec z matično številko se prepozna tudi kot »Mat.št«");
const glave = izvleciPuscico.name && (() => {
  const z = imenik.indexOf("const GLAVE_MAPA = {");
  return imenik.slice(z, imenik.indexOf("\n};", z) + 3).replace(/^const\s+/, "var ");
})();
vm.runInContext(glave, sandbox);
const aliasi = sandbox.GLAVE_MAPA.employee_code.map(a => a.toLowerCase());
["mat.št", "mat št", "matična številka", "employee_code"].forEach(a => {
  trdi(aliasi.includes(a), `glava »${a}« se prepozna kot matična številka`);
});

console.log("6) objava razporeda NZV to res uporablja");
const admin = readFileSync(join(koren, "admin.html"), "utf8");
trdi(/window\.Imena\.kazalo\(/.test(admin), "admin.html gradi kazalo oseb");
// Stara pot ne sme ostati: dobesedno iskanje imen v profili. Komentarji
// se izpustijo - o stari poti se sme PISATI (razlaga, zakaj je bila
// napačna), ne sme pa se je več klicati.
const adminBrezKomentarjev = admin.split("\n").filter(v => !/^\s*\/\//.test(v)).join("\n");
trdi(!/\.in\("full_name", imena\)/.test(adminBrezKomentarjev),
  "objava ne išče več z dobesednim .in(\"full_name\", …) – prav to ni našlo nikogar");
trdi((adminBrezKomentarjev.match(/window\.Imena\.kazalo\(/g) || []).length >= 2,
  "kazalo uporabljata obe objavi – razpored oddelkov in razpored NZV");

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
