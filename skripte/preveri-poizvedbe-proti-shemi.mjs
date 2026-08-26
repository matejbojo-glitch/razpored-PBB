#!/usr/bin/env node
/* Vsaka poizvedba v aplikaciji mora ustrezati supabase/schema.sql.
 *
 * Zakaj svoj preizkus: napake te vrste se pokažejo šele pri uporabniku, ker
 * gre za razhajanje med kodo in bazo, ne za napako v kodi sami. V zadnjih
 * dneh so se zvrstile tri:
 *   - Imenik: "Could not embed because more than one relationship was found
 *     for 'profili' and 'telefoni_kontaktov'" (podvojen tuji ključ);
 *   - prazen Imenik zaradi manjkajočega stolpca profili.is_koordinator;
 *   - NZV pogled bere tabeli nadomescanja in nzv_nastavitve, ki ju
 *     schema.sql sploh ni ustvarila.
 *
 * Preverja štiri stvari:
 *   1. vsaka tabela/pogled iz .from("...") obstaja v shemi;
 *   2. vsaka funkcija iz .rpc("...") obstaja v shemi;
 *   3. vsak stolpec iz .select(...) obstaja v tisti tabeli;
 *   4. vsako vgnezdeno branje (embed) ima natanko ENO razmerje - dve enaki
 *      pomenita napako "more than one relationship" v PostgREST.
 *
 * Zagon: node skripte/preveri-poizvedbe-proti-shemi.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  if (!pogoj) napake.push(opis);
  return pogoj;
}

// ---------------------------------------------------------------- shema
const stolpci = new Map();   // relacija -> Set(stolpec)
function dodaj(rel, stolpec) {
  if (!stolpci.has(rel)) stolpci.set(rel, new Set());
  stolpci.get(rel).add(stolpec);
}

// create table ... ( ... )
for (const m of shema.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
  const rel = m[1];
  dodaj(rel, "*");
  for (const vrstica of m[2].split("\n")) {
    const v = vrstica.trim();
    if (!v || v.startsWith("--") || /^(constraint|primary key|unique|check|foreign key)\b/i.test(v)) continue;
    const im = v.match(/^"?(\w+)"?\s+/);
    if (im) dodaj(rel, im[1]);
  }
}
// alter table ... add column if not exists
for (const m of shema.matchAll(/alter table (?:only )?public\.(\w+)\s+add column if not exists\s+"?(\w+)"?/gi)) {
  dodaj(m[1], m[2]);
}
// pogledi: create view ... as select ... - stolpce beremo iz aliasov/imen
const pogledi = new Set();
for (const m of shema.matchAll(/create (?:or replace )?view public\.(\w+)/gi)) {
  pogledi.add(m[1]);
  dodaj(m[1], "*");
}
const funkcije = new Set();
for (const m of shema.matchAll(/create (?:or replace )?function public\.(\w+)/gi)) funkcije.add(m[1]);

// tuji ključi: rel -> tarča -> koliko razmerij
const razmerja = new Map();
function dodajRazmerje(otrok, stars) {
  const k = otrok + "->" + stars;
  razmerja.set(k, (razmerja.get(k) || 0) + 1);
}
for (const m of shema.matchAll(/if not public\.tuji_kljuc_ze_obstaja\(\s*'public\.(\w+)',\s*array\[([^\]]*)\],\s*'([\w.]+)'\s*\)/gi)) {
  const tarca = m[3].replace(/^public\./, "");
  dodajRazmerje(m[1], tarca);
}

// ------------------------------------------------------------ aplikacija
const datoteke = readdirSync(koren).filter(f =>
  (f.endsWith(".html") || f.endsWith(".js")) &&
  !/\.min\.js$|^vendor-app|^react|^babel|^exceljs|^xlsx|^supabase-js/.test(f));

// Iz .select("...") potegne stolpce prve ravni in imena vgnezdenih branj.
function razcleniSelect(izraz) {
  const svoji = [], vgnezdeni = [];
  let globina = 0, zacetek = 0;
  const deli = [];
  for (let i = 0; i <= izraz.length; i++) {
    const z = izraz[i];
    if (z === "(") globina++;
    else if (z === ")") globina--;
    if ((z === "," && globina === 0) || i === izraz.length) {
      deli.push(izraz.slice(zacetek, i).trim());
      zacetek = i + 1;
    }
  }
  for (const d of deli) {
    if (!d) continue;
    const vg = d.match(/^([\w]+)(?:!([\w]+))?\s*\(/);
    if (vg) { vgnezdeni.push({ rel: vg[1], namig: vg[2] || null }); continue; }
    const ime = d.replace(/^[\w]+:/, "").trim();      // alias:stolpec
    if (/^[\w*]+$/.test(ime)) svoji.push(ime);
  }
  return { svoji, vgnezdeni };
}

let steviloPoizvedb = 0;
const preverjeneTabele = new Set(), preverjeneFunkcije = new Set();

for (const f of datoteke) {
  const vsebina = readFileSync(join(koren, f), "utf8");

  for (const m of vsebina.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)\s*\n?\s*\.select\(\s*["'`]([^"'`]*)["'`]/g)) {
    steviloPoizvedb++;
    const [, rel, izraz] = m;
    preverjeneTabele.add(rel);
    if (!stolpci.has(rel)) { napake.push(`${f}: tabele/pogleda "${rel}" v shemi ni`); continue; }
    if (pogledi.has(rel)) continue;                   // stolpcev pogleda ne razčlenjujemo
    const { svoji, vgnezdeni } = razcleniSelect(izraz);
    for (const c of svoji) {
      if (c === "*") continue;
      if (!stolpci.get(rel).has(c)) napake.push(`${f}: ${rel}.${c} – stolpca v shemi ni`);
    }
    for (const v of vgnezdeni) {
      if (!stolpci.has(v.rel)) { napake.push(`${f}: vgnezdeno branje "${v.rel}" – relacije v shemi ni`); continue; }
      if (v.namig) continue;                          // izrecen namig razreši dvoumnost
      const koliko = (razmerja.get(v.rel + "->" + rel) || 0) + (razmerja.get(rel + "->" + v.rel) || 0);
      if (koliko > 1) {
        napake.push(`${f}: ${rel} ↔ ${v.rel} ima ${koliko} razmerij, vgnezdeno branje pa je brez namiga `
          + `– PostgREST bo vrnil "more than one relationship"`);
      }
    }
  }

  for (const m of vsebina.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
    preverjeneTabele.add(m[1]);
    if (!stolpci.has(m[1])) napake.push(`${f}: .from("${m[1]}") – relacije v shemi ni`);
  }
  for (const m of vsebina.matchAll(/\.rpc\(\s*["'`](\w+)["'`]/g)) {
    preverjeneFunkcije.add(m[1]);
    if (!funkcije.has(m[1])) napake.push(`${f}: .rpc("${m[1]}") – funkcije v shemi ni`);
  }
}

console.log(`Pregledanih datotek: ${datoteke.length}`);
console.log(`Relacij v shemi: ${stolpci.size}, funkcij: ${funkcije.size}, razmerij: ${razmerja.size}`);
console.log(`Poizvedb s .select(): ${steviloPoizvedb}`);
console.log(`Relacij, ki jih aplikacija bere: ${preverjeneTabele.size}`);
console.log(`Funkcij, ki jih aplikacija kliče: ${preverjeneFunkcije.size}`);
console.log("");

if (napake.length) {
  for (const n of [...new Set(napake)]) console.error("  ✗ " + n);
  console.error(`\nNEUSPEŠNO – ${new Set(napake).size} napak`);
  process.exit(1);
}
console.log("VSE V REDU");
