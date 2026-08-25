#!/usr/bin/env node
/* Preizkus supabase/posodobi-parafe-oktober-2026.sql na PRAVI bazi
 * PostgreSQL (isti vzorec kot preveri-vnesi-parafe.mjs) - preden admin to
 * skripto požene proti pravi produkcijski bazi, preverimo:
 *   1. da se VSEH vrstic iz izvoza pravilno ujema s profili;
 *   2. da OSEBA BREZ profila konča v poročilu "NI NAJDEN PROFIL", ne tiho
 *      izpade;
 *   3. da profili.parafa dobi NOVO parafo (velja od 1.10.2026), profili.
 *      parafa_pred_oktobrom_2026 pa STARO (veljala do 30.9.2026) - za obe
 *      osebi, ki se jima parafa dejansko ni spremenila (Bojić Matej,
 *      Maglić Aleksander), sta stara in nova enaki;
 *   4. da je varno za ponoven zagon.
 *
 * Zagon: node skripte/preveri-posodobi-parafe-oktober-2026.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-posodobi-parafe-oktober-2026";
const BAZA = "preveri_posodobi_parafe_oktober_2026";

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
const parafeSql = readFileSync(join(koren, "supabase/posodobi-parafe-oktober-2026.sql"), "utf8");
writeFileSync(join(DELO, "posodobi-parafe-oktober-2026.sql"), parafeSql);

console.log("1) supabase/schema.sql postavi delujočo bazo iz nič (vključno s stolpcem parafa_pred_oktobrom_2026)");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
psql(readFileSync(join(DELO, "prep.sql"), "utf8"));
psql(readFileSync(join(DELO, "schema.sql"), "utf8"));
trdi(true, "shema postavljena brez napak");

console.log("2) zaseji profile za VSAKO ime iz posodobi-parafe-oktober-2026.sql (izvlečeno iz .sql same) + 1 namenoma manjkajoč");
// full_name/nova/stara izvlečemo NEPOSREDNO iz vhod (...) values bloka v
// pravi .sql datoteki - tako preizkus preveri PRAVI seznam, ne svoje kopije.
const vhodStart = parafeSql.indexOf("with vhod (full_name, nova, stara) as (");
const valuesStart = parafeSql.indexOf("values", vhodStart);
const vhodEnd = parafeSql.indexOf("\n),\n", valuesStart);
const vhodBlok = parafeSql.slice(valuesStart + "values".length, vhodEnd);
const vrsticaRx = /\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
const vhodImena = [];
let m;
while ((m = vrsticaRx.exec(vhodBlok))) vhodImena.push({ full_name: m[1], nova: m[2], stara: m[3] });
trdi(vhodImena.length === 21, `izvlečenih ${vhodImena.length} vrstic iz posodobi-parafe-oktober-2026.sql (pričakovano 21)`);

const nespremenjeni = vhodImena.filter(v => v.nova === v.stara).map(v => v.full_name);
trdi(nespremenjeni.length === 1 && nespremenjeni.includes("MAGLIĆ ALEKSANDER"),
  `natanko 1 oseba ima enako staro in novo parafo (Maglić Aleksander) - dobil: ${nespremenjeni.join(", ")}`);
{
  const bojicVhod = vhodImena.find(v => v.full_name === "BOJIĆ MATEJ");
  trdi(bojicVhod && bojicVhod.stara === "BOJ" && bojicVhod.nova === "MBO",
    `Bojić Matej SE JE spremenil: stara "BOJ" (starejši NZV zapis), nova "MBO" (dobil stara="${bojicVhod && bojicVhod.stara}", nova="${bojicVhod && bojicVhod.nova}")`);
}

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

console.log("3) poženi posodobi-parafe-oktober-2026.sql na tej bazi");
const izhod = psql(readFileSync(join(DELO, "posodobi-parafe-oktober-2026.sql"), "utf8"));
console.log(izhod.trim().split("\n").map(l => "    " + l).join("\n"));

console.log("4) preveri rezultat");
{
  const stevilo = psql(`select count(*) from public.profili where parafa is not null and parafa_pred_oktobrom_2026 is not null;`).trim();
  trdi(stevilo === String(zaSeed.length), `vseh ${zaSeed.length} zasejanih profilov ima izpolnjeni OBE polji (dobil: ${stevilo})`);
}
{
  // Naključno preverjeni 3 osebe (ki SO spremenile parafo) - da sta PRAVI stari/novi parafi prišli na PRAVO osebo.
  const spremenjeni = zaSeed.filter(v => v.nova !== v.stara);
  const preveri = [spremenjeni[0], spremenjeni[Math.floor(spremenjeni.length / 2)], spremenjeni[spremenjeni.length - 1]];
  preveri.forEach(v => {
    const vrstica = psql(`select parafa, parafa_pred_oktobrom_2026 from public.profili where full_name = '${v.full_name.replace(/'/g, "''")}';`).trim();
    const [nova, stara] = vrstica.split("|");
    trdi(nova === v.nova && stara === v.stara, `"${v.full_name}" -> nova "${nova}", stara "${stara}" (pričakovano nova "${v.nova}", stara "${v.stara}")`);
  });
}
{
  const bojic = psql(`select parafa, parafa_pred_oktobrom_2026 from public.profili where full_name = 'BOJIĆ MATEJ';`).trim();
  const [nova, stara] = bojic.split("|");
  trdi(nova === "MBO" && stara === "BOJ", `"BOJIĆ MATEJ" -> nova "${nova}" (pričakovano "MBO"), stara "${stara}" (pričakovano "BOJ", starejši NZV zapis)`);
}
{
  const maglic = psql(`select parafa, parafa_pred_oktobrom_2026 from public.profili where full_name = 'MAGLIĆ ALEKSANDER';`).trim();
  const [nova, stara] = maglic.split("|");
  trdi(nova === "MAG" && stara === "MAG", `"MAGLIĆ ALEKSANDER" (parafa se ni spremenila) -> nova "${nova}", stara "${stara}" (obe "MAG")`);
}
{
  const jeVNiNajden = izhod.includes(izpuscen.full_name);
  trdi(jeVNiNajden, `izpuščena oseba "${izpuscen.full_name}" se pojavi v poročilu (NI NAJDEN PROFIL), ne izgine tiho`);
  const jePozor = izhod.toUpperCase().includes("POZOR");
  trdi(!jePozor, "brez 'POZOR' vrstice (noben profil ni po nesreči prejel dveh različnih vrstic iz izvoza)");
}

console.log("5) varno za ponovni zagon (drugi zagon ne podvoji/pokvari ničesar)");
{
  const izhod2 = psql(readFileSync(join(DELO, "posodobi-parafe-oktober-2026.sql"), "utf8"));
  const stevilo2 = psql(`select count(*) from public.profili where parafa is not null and parafa_pred_oktobrom_2026 is not null;`).trim();
  trdi(stevilo2 === String(zaSeed.length), "drugi zagon ne spremeni števila izpolnjenih paraf");
  trdi(!izhod2.toUpperCase().includes("POZOR"), "drugi zagon prav tako brez 'POZOR' vrstice");
}

pg(`dropdb --if-exists ${BAZA}`);

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
