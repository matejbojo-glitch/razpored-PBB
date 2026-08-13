#!/usr/bin/env node
/* Preizkus izbrisa zaposlenega na PRAVI bazi PostgreSQL.
 *
 * Zakaj tak preizkus obstaja: izbris osebe se je v razvoju trikrat zalomil
 * na način, ki ga z branjem kode ni bilo videti —
 *   1. supabase/schema.sql ni znal postaviti delujoče baze (manjkal je
 *      stolpec schedule_entries.created_at, ki ga sprožilec nastavlja),
 *   2. sprožilci dnevnika ob izbrisu SAMI zapišejo novo vrstico z imenom
 *      izbrisane osebe — čiščenje dnevnika pred izbrisom torej ne zaleže,
 *   3. sprožilec schedule_entries_touch je izbrisanega avtorja vrnil nazaj
 *      in v vrstici pustil povezavo na profil, ki ne obstaja več.
 * Vsakega od teh treh pokaže samo pravi zagon proti pravi bazi.
 *
 * Preizkus posnema Supabase SQL Editor: vsak ukaz iz skripte za izbris se
 * požene v SVOJI seji (v Supabase gre vsak ukaz čez povezovalnik in dobi
 * svojo sejo, zato začasne tabele med ukazi ne preživijo).
 *
 * Zagon (potrebuje lokalni PostgreSQL in pravico do uporabnika postgres):
 *   node skripte/preveri-izbris-osebe.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-izbris-osebe";
const BAZA = "preveri_izbris_osebe";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function pg(ukaz, { tiho = false } = {}) {
  return execFileSync("su", ["postgres", "-c", ukaz], {
    encoding: "utf8",
    stdio: tiho ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
}
function psql(sql, { baza = BAZA } = {}) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -d ${baza} -f ${DELO}/_u.sql`);
}

try {
  pg("psql -At -c 'select 1'", { tiho: true });
} catch {
  console.log("PostgreSQL ni na voljo — preizkus preskočen.");
  process.exit(0);
}

mkdirSync(DELO, { recursive: true });

// --- 1) nadomestki za Supabase (auth shema, vloge) --------------------
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
writeFileSync(join(DELO, "izbris.sql"), readFileSync(join(koren, "supabase/odstrani-zaposlene.sql"), "utf8"));

console.log("1) supabase/schema.sql postavi delujočo bazo iz nič");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
try {
  pg(`psql -q -v ON_ERROR_STOP=1 -d ${BAZA} -f ${DELO}/prep.sql -f ${DELO}/schema.sql`);
  trdi(true, "shema se naloži brez napake");
} catch (e) {
  trdi(false, "shema se naloži brez napake: " + String(e.stderr || e).slice(0, 300));
  process.exit(1);
}

// --- 2) osnovni podatki -----------------------------------------------
// Dve osebi za izbris (ena po e-pošti, ena z drugače zapisanim imenom) in
// dve, ki morata preživeti.
const ODHAJA_A = "11111111-1111-1111-1111-111111111111";
const ODHAJA_B = "22222222-2222-2222-2222-222222222222";
const OSTANE_A = "55555555-5555-5555-5555-555555555555";
const OSTANE_B = "66666666-6666-6666-6666-666666666666";
psql(`
insert into auth.users (id, email) values
  ('${ODHAJA_A}','luka.stare@pb-begunje.si'),
  ('${ODHAJA_B}','nekdo.drug@pb-begunje.si'),
  ('${OSTANE_A}','ostane.a@pb-begunje.si'),
  ('${OSTANE_B}','ostane.b@pb-begunje.si');
insert into public.profiles (id, full_name, role, department_code) values
  ('${ODHAJA_A}','Stare Luka','user','C1'),
  ('${ODHAJA_B}','BALEK MIJA','user','C'),
  ('${OSTANE_A}','Bojić Matej','admin','NZV'),
  ('${OSTANE_B}','Hrovat Nina','vodja','NZV')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role,
  department_code = excluded.department_code;
update public.profiles set vodja_id = '${ODHAJA_A}' where id = '${OSTANE_B}';
insert into public.schedule_entries (employee_id, department_code, work_date, shift_code) values
  ('${ODHAJA_A}','C1','2026-09-01','dopoldan'),
  ('${OSTANE_A}','NZV','2026-09-01','DEŽURSTVO');
insert into public.swap_requests (requester_id, requester_date, target_id, target_date, lead_id) values
  ('${ODHAJA_A}','2026-09-02','${OSTANE_A}','2026-09-03', null),
  ('${OSTANE_A}','2026-09-04','${OSTANE_B}','2026-09-05','${ODHAJA_A}');
insert into public.obrazci (vrsta, vlagatelj_id, sodelavec_id) values
  ('menjava_sluzbe','${ODHAJA_A}','${OSTANE_A}'),
  ('menjava_sluzbe','${OSTANE_A}','${OSTANE_B}');
insert into public.leave_entries (full_name, work_date, kind) values
  ('STARE LUKA','2026-09-10','ld'),
  ('Bojić Matej','2026-09-12','ld');
insert into public.employee_wishes (full_name, department_code) values
  ('Stare Luka','C1'),
  ('MIJA BALEK','C'),
  ('Bojić Matej','NZV');
insert into public.contact_imports (full_name, email) values
  ('STARE LUKA','luka.stare@pb-begunje.si'),
  ('BOJIĆ MATEJ','ostane.a@pb-begunje.si');
`);

console.log("2) razpored je mogoče urejati (stolpec created_at obstaja)");
try {
  psql(`update public.schedule_entries set shift_code = 'popoldan' where employee_id = '${OSTANE_A}';`);
  trdi(true, "UPDATE na schedule_entries uspe");
} catch (e) {
  trdi(false, "UPDATE na schedule_entries uspe: " + String(e.stderr || e).slice(0, 200));
}

// Avtorstvo nastavimo z izklopljenimi sprožilci — sprožilec ga ob rednem
// pisanju prepiše z auth.uid() (v tem preizkusu prazno), zato preizkus brez
// tega sploh ne bi preveril povezave, ki izbris ustavi.
psql(`
set session_replication_role = replica;
update public.schedule_entries set created_by = '${ODHAJA_A}', updated_by = '${ODHAJA_A}'
 where employee_id = '${OSTANE_A}';
set session_replication_role = origin;
`);

console.log("3) skripta za izbris — vsak ukaz v svoji seji");
const brezKomentarjev = readFileSync(join(DELO, "izbris.sql"), "utf8")
  .split("\n").filter(v => !v.trim().startsWith("--")).join("\n");
const ukazi = brezKomentarjev.split(";").map(u => u.trim()).filter(Boolean);
trdi(ukazi.length >= 8, `skripta ima ${ukazi.length} ukazov`);
let zadnjiIzpis = "";
for (let i = 0; i < ukazi.length; i++) {
  try {
    zadnjiIzpis = psql(ukazi[i] + ";");
  } catch (e) {
    trdi(false, `ukaz ${i} uspe: ` + String(e.stderr || e).slice(0, 300));
    break;
  }
}
trdi(napake.length === 0, "vsi ukazi se izvedejo brez napake");
trdi(zadnjiIzpis.trim() === "", "zadnji ukaz (preverba) ne vrne nobene vrstice");

console.log("4) stanje po izbrisu");
function vrednost(sql) { return psql(sql).trim(); }
trdi(vrednost("select count(*) from public.profiles") === "2", "ostaneta natanko 2 profila");
trdi(vrednost("select string_agg(full_name, ', ' order by full_name) from public.profiles")
     === "Bojić Matej, Hrovat Nina", "ostaneta prava dva");
trdi(vrednost("select count(*) from auth.users") === "2", "ostaneta 2 računa");
trdi(vrednost(`select count(*) from public.schedule_entries s
  where s.created_by is not null and not exists (select 1 from public.profiles p where p.id = s.created_by)`) === "0",
  "v razporedu ni viseče povezave na izbrisanega avtorja");
trdi(vrednost(`select count(*) from public.schedule_entries s
  where s.updated_by is not null and not exists (select 1 from public.profiles p where p.id = s.updated_by)`) === "0",
  "isto za updated_by");
trdi(vrednost(`select count(*) from public.schedule_entries where employee_id = '${OSTANE_A}'`) === "1",
  "razpored osebe, ki ostane, je nedotaknjen");
trdi(vrednost("select count(*) from public.swap_requests") === "1", "menjava dveh drugih ostane");
trdi(vrednost("select coalesce(lead_id::text,'-') from public.swap_requests") === "-",
  "izbrisani odobritelj je izpraznjen, menjava pa ostane");
trdi(vrednost("select count(*) from public.obrazci") === "1", "obrazec brez izbrisanega ostane");
trdi(vrednost("select count(*) from public.leave_entries") === "1", "dopust osebe, ki ostane, ostane");
trdi(vrednost(`select count(*) from public.leave_entries_log l
  where public.imena_se_ujemata(l.full_name, 'Stare Luka')
     or public.imena_se_ujemata(l.full_name, 'Balek Mija')`) === "0",
  "dnevnik dopusta ne omenja več izbrisanih");
trdi(vrednost("select count(*) from public.employee_wishes") === "1", "želje osebe, ki ostane, ostanejo");
trdi(vrednost("select count(*) from public.contact_imports") === "1", "vizitka osebe, ki ostane, ostane");
trdi(vrednost(`select count(*) from public.profiles_log where profile_name in ('Stare Luka','BALEK MIJA')`) === "0",
  "dnevnik profilov ne omenja več izbrisanih");
trdi(vrednost(`select count(*) from public.profiles where vodja_id = '${ODHAJA_A}'`) === "0",
  "nihče nima več izbrisanega za vodjo");

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
