#!/usr/bin/env node
/* Preizkus, da SQL in JS ujemata imena ENAKO.
 *
 * Isto dejstvo je zapisano na dveh mestih: imena.js (brskalnik) in
 * public.imena_kljuc / imena_se_ujemata (baza, supabase/schema.sql).
 * Doslej sta se razhajala - SQL različica ni poznala strešic ne
 * potrjenih tipkarskih napak, zato se je "Nina Horvat" v aplikaciji
 * ujela s "Hrovat Nina", v SQL skriptah pa ne; take osebe so uvozi in
 * seedi tiho izpustili.
 *
 * Preizkus zato PORTIRA SQL funkciji v pravo bazo in ju na istem naboru
 * primerov primerja z odgovori imena.js. Ni dovolj brati kode: pravilo
 * mora dati isti odgovor, ne le izgledati enako.
 *
 * Zahteva delujoč PostgreSQL (service postgresql start). Brez njega se
 * preizkus PRESKOČI s pojasnilom - ne pade, da ne blokira okolij brez
 * baze.
 *
 * Zagon: node skripte/preveri-imena-sql.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- JS stran -------------------------------------------------------
const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
const I = sandbox.window.Imena;

// --- SQL stran ------------------------------------------------------
const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");
const zac = shema.indexOf("create or replace function public.imena_kljuc(a text)");
if (zac === -1) { console.error("public.imena_kljuc ni v schema.sql"); process.exit(1); }
const kon = shema.indexOf("$$;", shema.indexOf("public.imena_kljuc(a) = public.imena_kljuc(b)")) + 3;
const funkcije = shema.slice(zac, kon);

function psql(args) {
  return execFileSync("su", ["postgres", "-c", "psql " + args], { encoding: "utf8" });
}
let bazaNaVoljo = true;
try { psql("-tAc 'select 1'"); } catch (e) { bazaNaVoljo = false; }
if (!bazaNaVoljo) {
  console.log("  … PostgreSQL ni na voljo – preizkus preskočen.");
  console.log("    (zaženi 'service postgresql start' in poskusi znova)");
  process.exit(0);
}
writeFileSync("/tmp/imena-fn.sql", funkcije + "\n");
psql("-qc 'drop database if exists imenatest;' -c 'create database imenatest;'");
psql("-d imenatest -q -f /tmp/imena-fn.sql");

const sqlKljuc = (s) => psql(`-d imenatest -tAc "select public.imena_kljuc(${literal(s)});"`).trim();
const sqlUjemata = (a, b) =>
  psql(`-d imenatest -tAc "select public.imena_se_ujemata(${literal(a)}, ${literal(b)});"`).trim() === "t";
function literal(s) {
  if (s === null || s === undefined) return "null";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

console.log("1) ključ imena je v SQL in v JS enak");
{
  const primeri = [
    "Alukić Dino", "ALUKIĆ DINO", "Dino Alukić",
    "Mavri Tratnik Magdalena", "Magdalena Mavri Tratnik",
    "Nina Horvat", "Hrovat Nina",
    "Tomaževič Simona", "Tomažević Simona",
    "Bećirović Amir", "Becirovic Amir",
    ") Saša Trpin", ") dr. Tanja Torkar", "dr. Tanja Torkar", "Torkar Tanja",
    "  DŽAMASTAGIĆ   DENIS ", "Džamastagić Denis",
    "Novak Ana", "Novak Ane", "Mag Ana",
  ];
  primeri.forEach(p => eq(sqlKljuc(p), I.kljuc(p), `ključ za ${JSON.stringify(p)}`));
}

console.log("2) odgovor na \"je to ista oseba\" je enak");
{
  const pari = [
    ["Alukić Dino", "Dino Alukić", true],
    ["Nina Horvat", "Hrovat Nina", true],
    ["Tomažević Simona", "Tomaževič Simona", true],
    ["Bećirović Amir", "Becirovic Amir", true],
    [") Saša Trpin", "Trpin Saša", true],
    [") dr. Tanja Torkar", "Torkar Tanja", true],
    ["dr. Tanja Torkar", "Torkar Tanja", true],
    ["Magdalena Mavri Tratnik", "Mavri Tratnik Magdalena", true],
    // In kar se NE sme zliti.
    ["Novak Ana", "Novak Ane", false],
    ["Novak Ana", "Novak Eva", false],
    ["dr. Tanja Torkar", "Torkar Metka", false],
    ["Mag Ana", "Ana Novak", false],
    ["", "", false],
    ["   ", "Novak Ana", false],
    [null, null, false],
  ];
  pari.forEach(([a, b, pricakovano]) => {
    const vSql = sqlUjemata(a, b), vJs = I.seUjemata(a, b);
    trdi(vSql === vJs && vSql === pricakovano,
      `${JSON.stringify(a)} ~ ${JSON.stringify(b)} → ${pricakovano ? "ista" : "različni"}`
      + (vSql === vJs ? "" : ` – SQL ${vSql}, JS ${vJs}`));
  });
}

console.log("3) ohlapnejše ujemanje ne zlije dveh RAZLIČNIH oseb");
{
  // Ista varovalka kot v preveri-imena.mjs, a pognana skozi SQL: nova
  // funkcija je OHLAPNEJŠA od prejšnje, zato mora na resničnem seznamu
  // vsak ostati sam zase.
  const csv = readFileSync(join(koren, "roster", "imenik-uvoz.csv"), "utf8");
  const imena = csv.split("\n").slice(1).map(v => (v.split(",")[0] || "").trim()).filter(Boolean);
  trdi(imena.length > 40, `seznam prebran (${imena.length} oseb)`);

  // En sam klic v bazo namesto enega na osebo.
  const vrednosti = imena.map(i => "(" + literal(i) + ")").join(",");
  const izpis = psql(`-d imenatest -tAc "with v(ime) as (values ${vrednosti})`
    + ` select public.imena_kljuc(ime) || '|' || ime from v;"`).trim().split("\n");
  const poKljucu = {};
  const trki = [];
  izpis.forEach(vrstica => {
    const meja = vrstica.indexOf("|");
    const k = vrstica.slice(0, meja), ime = vrstica.slice(meja + 1);
    if (poKljucu[k] && poKljucu[k] !== ime) trki.push(`${poKljucu[k]} ⟷ ${ime}`);
    else poKljucu[k] = ime;
  });
  trdi(trki.length === 0, "nobeni dve različni osebi nimata istega ključa v SQL"
    + (trki.length ? " – trki: " + trki.join("; ") : ""));

  // In da se SQL ključ ujema z JS ključem za VSAKO osebo s seznama.
  const razlike = imena.filter((ime, i) => izpis[i].slice(0, izpis[i].indexOf("|")) !== I.kljuc(ime));
  trdi(razlike.length === 0, "za vsako osebo s seznama SQL in JS vrneta isti ključ"
    + (razlike.length ? " – razlike: " + razlike.slice(0, 5).join(", ") : ""));
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
