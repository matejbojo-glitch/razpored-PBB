#!/usr/bin/env node
/* Izhodna vrsta za sinhronizacijo z Google Sheets - preizkus na PRAVI bazi.
 *
 * Zakaj proti pravi bazi in ne z branjem SQL:
 *  - delni unikatni indeks (where status = 'caka') in "on conflict ... where"
 *    ali delujeta ali pa ne; iz besedila se to ne vidi,
 *  - zaščita pred neskončno zanko (sprememba, ki jo je prinesel Sheets, se
 *    vanj ne vrača) je pogoj v sprožilcu, ne pravilo na papirju,
 *  - sprožilec ne sme napolniti vrste za oddelke, ki niso povezani ali imajo
 *    sinhronizacijo ugasnjeno - sicer bi se vrsta polnila tudi, ko je vse
 *    izklopljeno.
 *
 * Zagon (potrebuje lokalni PostgreSQL):
 *   service postgresql start && node skripte/preveri-sheets-sinhronizacija.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-sheets-sinhronizacija";
const BAZA = "preveri_sheets_sinhronizacija";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = String(a) === String(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -d ${BAZA} -f ${DELO}/_u.sql`);
}
const vrednost = (sql) => psql(sql).trim();

try { pg("psql -At -c 'select 1'"); }
catch { console.log("PostgreSQL ni na voljo – preizkus preskočen."); process.exit(0); }

mkdirSync(DELO, { recursive: true });

// --- nadomestki za Supabase (auth shema, vloge) -----------------------
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
for (const d of ["schema.sql", "razlog-spremembe.sql", "sheets-povezave.sql", "sheets-sinhronizacija.sql"]) {
  writeFileSync(join(DELO, d), readFileSync(join(koren, "supabase", d), "utf8"));
}

console.log("1) skripte se naložijo v prazno bazo");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
try {
  pg(`psql -q -v ON_ERROR_STOP=1 -d ${BAZA} -f ${DELO}/prep.sql -f ${DELO}/schema.sql`
     + ` -f ${DELO}/razlog-spremembe.sql -f ${DELO}/sheets-povezave.sql -f ${DELO}/sheets-sinhronizacija.sql`);
  trdi(true, "schema.sql + razlog-spremembe.sql + sheets-povezave.sql + sheets-sinhronizacija.sql");
} catch (e) {
  trdi(false, "skripte se naložijo: " + String(e.stderr || e).slice(0, 500));
  process.exit(1);
}

// Ponoven zagon ne sme pasti - skripte se v Supabase SQL Editorju pogosto
// poženejo dvakrat.
try {
  pg(`psql -q -v ON_ERROR_STOP=1 -d ${BAZA} -f ${DELO}/sheets-sinhronizacija.sql`);
  trdi(true, "ponoven zagon sheets-sinhronizacija.sql ne pade");
} catch (e) {
  trdi(false, "ponoven zagon: " + String(e.stderr || e).slice(0, 300));
}
eq(vrednost("select count(*) from public.sheet_connections;"), "1",
   "ponoven zagon ne podvoji pilotne vrstice");

console.log("1b) schema.sql sam postavi vrsto in sprožilec (fresh baza ju ne pogreša)");
{
  // Isto vsebino nosita dve datoteki: schema.sql (postavitev iz nič) in
  // sheets-sinhronizacija.sql (za obstoječo bazo). Ker bi se lahko tiho
  // razšli, se primerja telo sprožilca iz obeh.
  const izlusci = (besedilo, ime) => {
    const zac = besedilo.indexOf("create or replace function public." + ime);
    if (zac === -1) return null;
    const kon = besedilo.indexOf("$$;", zac);
    return besedilo.slice(zac, kon + 3).replace(/\s+/g, " ").trim();
  };
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");
  const skripta = readFileSync(join(koren, "supabase", "sheets-sinhronizacija.sql"), "utf8");
  ["sheet_sync_ob_spremembi", "sheet_sync_prevzemi"].forEach((ime) => {
    const a = izlusci(shema, ime), b = izlusci(skripta, ime);
    trdi(!!a && a === b, `${ime}: schema.sql in sheets-sinhronizacija.sql sta usklajena`);
  });
  trdi(shema.includes("create table if not exists public.sheet_sync_izhod"), "schema.sql pozna sheet_sync_izhod");
  trdi(shema.includes("create table if not exists public.sync_errors"), "schema.sql pozna sync_errors");
}

// --- 2) osnovni podatki -----------------------------------------------
const OSEBA = "11111111-1111-1111-1111-111111111111";
const OSEBA2 = "22222222-2222-2222-2222-222222222222";
psql(`
insert into auth.users (id, email) values
  ('${OSEBA}','a.a@pb-begunje.si'), ('${OSEBA2}','b.b@pb-begunje.si')
on conflict do nothing;
insert into public.profili (id, full_name, role) values
  ('${OSEBA}','Novak Bine','user'), ('${OSEBA2}','Kovač Ana','user')
on conflict (id) do nothing;
insert into public.oddelki (code, name) values ('B','Oddelek B'), ('C','Oddelek C')
on conflict (code) do nothing;

-- Pilotna vrstica iz sheets-povezave.sql je privzeto UGASNJENA; vklopimo jo.
update public.sheet_connections set aktivno = true, app_v_sheets = true where skupina = 'B';
-- Povezan, a ugasnjen oddelek.
insert into public.sheet_connections (oznaka, skupina, spreadsheet_id, zavihek, aktivno, app_v_sheets)
values ('test C','C','1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4','C', false, true)
on conflict (spreadsheet_id, zavihek) do nothing;
`);

const caka = () => vrednost("select count(*) from public.sheet_sync_izhod where status = 'caka';");
const vse = () => vrednost("select count(*) from public.sheet_sync_izhod;");

console.log("2) vrsta se polni samo za vklopljene povezave");
psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code)
      values ('${OSEBA}','B','2026-11-02','DOP');`);
eq(caka(), "1", "zapis na povezanem in vklopljenem oddelku B napolni vrsto");

psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code)
      values ('${OSEBA2}','C','2026-11-02','DOP');`);
eq(caka(), "1", "zapis na povezanem, a UGASNJENEM oddelku C vrste ne napolni");

psql(`update public.sheet_connections set aktivno = true, app_v_sheets = false where skupina = 'C';
      update public.razpored set shift_code = 'PO5' where department_code = 'C';`);
eq(caka(), "1", "aktivna povezava brez smeri app_v_sheets vrste ne napolni");

console.log("3) ista celica čaka samo enkrat");
psql(`update public.razpored set shift_code = 'PO5'
       where employee_id = '${OSEBA}' and work_date = '2026-11-02';`);
eq(caka(), "1", "druga sprememba iste celice ne doda nove čakajoče vrstice");
eq(vrednost(`select shift_code from public.sheet_sync_izhod where status = 'caka';`), "PO5",
   "v vrsti ostane ZADNJE stanje celice");

console.log("4) sprememba brez razlike ne sproži ničesar");
const prejPosodobljeno = vrednost(`select ustvarjeno from public.sheet_sync_izhod where status='caka';`);
psql(`update public.razpored set shift_code = 'PO5'
       where employee_id = '${OSEBA}' and work_date = '2026-11-02';`);
eq(caka(), "1", "po nič-spremembi vrsta ni večja");
eq(vrednost(`select ustvarjeno from public.sheet_sync_izhod where status='caka';`), prejPosodobljeno,
   "po nič-spremembi se čakajoča vrstica niti ne osveži");

console.log("5) zaščita pred neskončno zanko");
psql(`update public.sheet_sync_izhod set status = 'koncano', obdelano = now();`);
psql(`update public.razpored set shift_code = 'N11', razlog = 'sheets'
       where employee_id = '${OSEBA}' and work_date = '2026-11-02';`);
eq(caka(), "0", "sprememba z razlogom 'sheets' se ne vrne v Sheets");
psql(`update public.razpored set shift_code = 'DOP', razlog = 'bolniška'
       where employee_id = '${OSEBA}' and work_date = '2026-11-02';`);
eq(caka(), "1", "sprememba z drugim razlogom se pošlje naprej");

console.log("6) obdelana vrstica ne blokira naslednje spremembe");
eq(vse(), "2", "poleg čakajoče ostane zapis o že obdelani");

console.log("7) izbris celice se pošlje kot prazna vrednost");
psql(`update public.sheet_sync_izhod set status = 'koncano', obdelano = now();
      delete from public.razpored where employee_id = '${OSEBA}' and work_date = '2026-11-02';`);
eq(caka(), "1", "izbris napolni vrsto");
eq(vrednost(`select coalesce(shift_code,'<null>') from public.sheet_sync_izhod where status='caka';`),
   "<null>", "izbrisana celica se zapiše kot prazna");

console.log("8) razlog spremembe pride v dnevnik");
eq(vrednost(`select razlog from public.dnevnik_razporeda
              where new_shift_code = 'DOP' and action = 'update' order by id desc limit 1;`),
   "bolniška", "dnevnik_razporeda hrani razlog");

console.log("9) napake so vidne in nič se ne zavrže tiho");
psql(`insert into public.sync_errors (smer, vrsta, podrobnosti)
      values ('sheets_v_app','neznano_ime','Vrstica 12: »Novak B.« nima ujemanja');`);
eq(vrednost(`select count(*) from public.sync_errors where not resen;`), "1",
   "nerešena napaka ostane vidna");
let zavrnjeno = false;
try { psql(`insert into public.sync_errors (smer, vrsta) values ('nekaj_tretjega','api');`); }
catch { zavrnjeno = true; }
trdi(zavrnjeno, "neznana smer sinhronizacije je zavrnjena");

console.log("10) tabeli sta zaščiteni z RLS");
eq(vrednost(`select count(*) from pg_tables
              where schemaname='public' and tablename in ('sheet_sync_izhod','sync_errors')
                and rowsecurity;`), "2", "RLS je vklopljen na obeh tabelah");
eq(vrednost(`select count(*) from pg_policies
              where schemaname='public' and tablename='sheet_sync_izhod' and cmd='SELECT';`), "1",
   "sheet_sync_izhod: administrator sme brati");
eq(vrednost(`select count(*) from pg_policies
              where schemaname='public' and tablename='sheet_sync_izhod' and cmd<>'SELECT';`), "0",
   "sheet_sync_izhod: pisanje ostane pri service_role");

console.log("11) prevzem vrste (sheet_sync_prevzemi)");
{
  psql(`delete from public.sheet_sync_izhod;`);
  psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code, razlog)
        values ('${OSEBA}','B','2026-11-03','DOP','popravek');`);
  eq(caka(), "1", "pred prevzemom ena vrstica čaka");
  eq(vrednost(`select count(*) from public.sheet_sync_prevzemi(500);`), "1", "prevzem vrne čakajočo vrstico");
  eq(vrednost(`select status from public.sheet_sync_izhod order by id desc limit 1;`), "v_teku",
     "prevzeta vrstica je označena kot v teku");
  eq(vrednost(`select count(*) from public.sheet_sync_prevzemi(500);`), "0",
     "drugi zagon iste vrstice ne vzame še enkrat");

  // Padla vrstica se vrne v igro šele po zamiku (1, 2, 4, 8, 16 minut).
  psql(`update public.sheet_sync_izhod set status='napaka', poskusi=1, napaka='test',
               obdelano = now() - interval '30 seconds';`);
  eq(vrednost(`select count(*) from public.sheet_sync_prevzemi(500);`), "0",
     "padla vrstica se pred iztekom zamika ne poskuša znova");
  psql(`update public.sheet_sync_izhod set obdelano = now() - interval '10 minutes';`);
  eq(vrednost(`select count(*) from public.sheet_sync_prevzemi(500);`), "1",
     "po izteku zamika se poskusi znova");

  // Po petih poskusih se neha in ostane vidno.
  psql(`update public.sheet_sync_izhod set status='napaka', poskusi=5,
               obdelano = now() - interval '2 hours';`);
  eq(vrednost(`select count(*) from public.sheet_sync_prevzemi(500);`), "0",
     "po petih poskusih se vrstica ne poskuša več");

  // Robna funkcija se predstavi kot service_role. Če ji pravice do zagona
  // ne vrnemo po "revoke all ... from public", dobi "permission denied"
  // in vrsta se ne izprazni nikoli.
  eq(vrednost(`select has_function_privilege('service_role',
                 'public.sheet_sync_prevzemi(int)', 'EXECUTE')::text;`), "true",
     "service_role sme pognati sheet_sync_prevzemi");
  eq(vrednost(`select has_function_privilege('authenticated',
                 'public.sheet_sync_prevzemi(int)', 'EXECUTE')::text;`), "false",
     "prijavljeni uporabnik je ne sme");
  eq(vrednost(`select count(*) from public.sheet_sync_izhod where status='napaka';`), "1",
     "in ostane vidna v pregledu, ne izbriše se");
}

console.log("12) usmerjanje: dva dokumenta z ISTOIMENSKIM zavihkom");
{
  psql(`insert into public.oddelki (code, name) values ('D','Oddelek D') on conflict (code) do nothing;
        insert into public.sheet_connections (oznaka, skupina, spreadsheet_id, zavihek, aktivno, sheets_v_app)
        values ('drug dokument – B','D','DRUG_DOKUMENT_ID','B', true, true);`);
  eq(vrednost(`select skupina from public.sheet_connections
                where spreadsheet_id = 'DRUG_DOKUMENT_ID' and zavihek = 'B';`), "D",
     "isto ime zavihka v drugem dokumentu vodi na svoj oddelek");
  eq(vrednost(`select count(*) from public.sheet_connections where zavihek = 'B';`), "2",
     "oba zavihka »B« obstajata drug ob drugem");
  let zavrnjeno = false;
  try { psql(`insert into public.sheet_connections (oznaka, skupina, spreadsheet_id, zavihek)
              values ('podvojeno','B','DRUG_DOKUMENT_ID','B');`); }
  catch { zavrnjeno = true; }
  trdi(zavrnjeno, "isti (dokument, zavihek) se ne da vpisati dvakrat");
}

pg(`dropdb --if-exists ${BAZA}`);

console.log("");
if (napake.length) { console.log(`NAPAKE (${napake.length}):`); napake.forEach(n => console.log(" - " + n)); process.exit(1); }
console.log("Vse v redu.");
