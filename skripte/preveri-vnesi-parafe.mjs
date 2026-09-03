#!/usr/bin/env node
/* Preizkus supabase/vnesi-parafe.sql na PRAVI bazi PostgreSQL (isti vzorec
 * kot preveri-izbris-osebe.mjs) - preden admin to skripto požene proti
 * pravi produkcijski bazi, preverimo:
 *   1. da se VSEH vrstic iz izvoza pravilno ujema s profili (po
 *      full_name, prek imena_se_ujemata - vreča besed, neodvisno od
 *      vrstnega reda Priimek/Ime);
 *   2. da OSEBA BREZ profila (npr. ker izvoz vsebuje ime, ki ga v
 *      aplikaciji (še) ni) konča v poročilu "NI NAJDEN PROFIL", ne tiho
 *      izpade;
 *   3. da "MAGLIĆ ALEKSANDER" dobi PRAVO, uporabnikom potrjeno parafo
 *      "MAG" (prvotni izvoz je isto osebo pomotoma navedel dvakrat, kot
 *      "Magkić"/AMG in "Maglić"/MA - obe napačni, popravljeno na eno
 *      vrstico z eno pravo parafo, glej .sql datoteko).
 *
 * Zagon: node skripte/preveri-vnesi-parafe.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-vnesi-parafe";
const BAZA = "preveri_vnesi_parafe";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql, { baza = BAZA } = {}) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -F"|" -d ${baza} -f ${DELO}/_u.sql`);
}

try {
  pg("psql -At -c 'select 1'");
} catch {
  console.log("PostgreSQL ni na voljo – preizkus preskočen.");
  process.exit(0);
}

mkdirSync(DELO, { recursive: true });

writeFileSync(join(DELO, "prep.sql"), `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
`);
writeFileSync(join(DELO, "schema.sql"), readFileSync(join(koren, "supabase/schema.sql"), "utf8"));
const parafeSql = readFileSync(join(koren, "supabase/vnesi-parafe.sql"), "utf8");
writeFileSync(join(DELO, "vnesi-parafe.sql"), parafeSql);

console.log("1) supabase/schema.sql postavi delujočo bazo iz nič");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
psql(readFileSync(join(DELO, "prep.sql"), "utf8"));
psql(readFileSync(join(DELO, "schema.sql"), "utf8"));
trdi(true, "shema postavljena brez napak");

console.log("2) zaseji profile za VSAKO ime iz vnesi-parafe.sql (izvlečeno iz .sql same, da test ne more zaostati) + 1 namenoma manjkajoč");
// full_name-e izvlečemo NEPOSREDNO iz vhod (...) values bloka v pravi .sql
// datoteki - tako preizkus preveri PRAVI seznam, ne svoje kopije.
const vhodStart = parafeSql.indexOf("with vhod (full_name, parafa) as (");
const valuesStart = parafeSql.indexOf("values", vhodStart);
const vhodEnd = parafeSql.indexOf("\n),\n", valuesStart);
const vhodBlok = parafeSql.slice(valuesStart + "values".length, vhodEnd);
const vrsticaRx = /\('([^']+)',\s*'([^']+)'\)/g;
const vhodImena = [];
let m;
while ((m = vrsticaRx.exec(vhodBlok))) vhodImena.push({ full_name: m[1], parafa: m[2] });
trdi(vhodImena.length === 65, `izvlečenih ${vhodImena.length} vrstic iz vnesi-parafe.sql (pričakovano 65)`);
trdi(vhodImena.filter(v => v.full_name === "MAGLIĆ ALEKSANDER").length === 1, "'MAGLIĆ ALEKSANDER' se pojavi natanko enkrat (ne več dvakrat pod dvema zapisoma priimka)");

// Vsak profil dobi full_name IDENTIČEN vhodnemu imenu (najbolj pogost realni
// primer - HR izvoz in aplikacija se ujemata) - razen zadnjega imena na
// seznamu, ki ga NAMENOMA izpustimo (test "ni najden profil"), da preverimo
// da manjkajoč profil konča v poročilu, ne povzroči napake.
const izpuscen = vhodImena[vhodImena.length - 1];
const zaSeed = vhodImena.slice(0, -1);
// handle_new_user() sprožilec ob insert v auth.users SAM ustvari ujemajočo
// vrstico v public.profili (glej schema.sql) - profili.id ima FK na
// auth.users.id, zato profila ni mogoče vstaviti neposredno brez tega.
const seedSql = zaSeed.map((v, i) =>
  `insert into auth.users (id, email) values (gen_random_uuid(), 'oseba${i}@test.local');`
).join("\n") + "\n" + zaSeed.map((v, i) =>
  `update public.profili set full_name = '${v.full_name.replace(/'/g, "''")}' where email = 'oseba${i}@test.local';`
).join("\n");
psql(seedSql);
trdi(true, `zasejanih ${zaSeed.length} profilov (izpuščen: "${izpuscen.full_name}", za test 'ni najden profil')`);

console.log("3) poženi vnesi-parafe.sql na tej bazi");
const izhod = psql(readFileSync(join(DELO, "vnesi-parafe.sql"), "utf8"));
console.log(izhod.trim().split("\n").map(l => "    " + l).join("\n"));

console.log("4) preveri rezultat");
{
  const stevilo = psql(`select count(*) from public.profili where parafa is not null;`).trim();
  trdi(stevilo === String(zaSeed.length), `vseh ${zaSeed.length} zasejanih profilov ima izpolnjeno parafo (dobil: ${stevilo})`);
}
{
  // Naključno preverjeni 3 osebe - da je PRAVA (ne katera koli) parafa prišla na PRAVO osebo.
  // Branje nazaj gre prek imena_se_ujemata(), ne prek `full_name = '...'`: sprožilec
  // trg_standardiziraj_polno_ime (schema.sql) zapisano IME V CELOTI Z VELIKIMI ČRKAMI
  // pretvori v initcap, zato dobesedna primerjava z vhodnim zapisom ne najde vrstice.
  const preveri = [zaSeed[0], zaSeed[Math.floor(zaSeed.length / 2)], zaSeed[zaSeed.length - 1]];
  preveri.forEach(v => {
    const dobljena = psql(`select parafa from public.profili where public.imena_se_ujemata(full_name, '${v.full_name.replace(/'/g, "''")}');`).trim();
    trdi(dobljena === v.parafa, `"${v.full_name}" -> parafa "${dobljena}" (pričakovano "${v.parafa}")`);
  });
}
{
  const maglic = psql(`select parafa from public.profili where public.imena_se_ujemata(full_name, 'MAGLIĆ ALEKSANDER');`).trim();
  trdi(maglic === "MAG", `"MAGLIĆ ALEKSANDER" -> parafa "${maglic}" (pričakovano potrjeno "MAG", ne stara "AMG"/"MA")`);
}
{
  const stolpci = psql(
    `select kaj, podrobnost from (
       select 'posodobljenih' as kaj, count(*)::text as podrobnost from public.profili where parafa is not null
     ) t;`
  );
  trdi(true, "poročilo (izpisano zgoraj pod korakom 3) ročno preveri vsebino - 'NI NAJDEN PROFIL' vrstica in brez 'POZOR' vrstice");
}
{
  const jeVNiNajden = izhod.includes(izpuscen.full_name);
  trdi(jeVNiNajden, `izpuščena oseba "${izpuscen.full_name}" se pojavi v poročilu (NI NAJDEN PROFIL), ne izgine tiho`);
  const jePozor = izhod.toUpperCase().includes("POZOR");
  trdi(!jePozor, "brez 'POZOR' vrstice (noben profil ni po nesreči prejel dveh različnih vrstic iz izvoza)");
}

console.log("5) varno za ponovni zagon (drugi zagon ne podvoji/pokvari ničesar)");
{
  const izhod2 = psql(readFileSync(join(DELO, "vnesi-parafe.sql"), "utf8"));
  const stevilo2 = psql(`select count(*) from public.profili where parafa is not null;`).trim();
  trdi(stevilo2 === String(zaSeed.length), "drugi zagon ne spremeni števila izpolnjenih paraf");
  trdi(!izhod2.toUpperCase().includes("POZOR"), "drugi zagon prav tako brez 'POZOR' vrstice");
}

pg(`dropdb --if-exists ${BAZA}`);

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
