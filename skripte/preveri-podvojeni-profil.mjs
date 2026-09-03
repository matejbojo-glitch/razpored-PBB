#!/usr/bin/env node
/* Preizkus supabase/pocisti-podvojeni-profil-susnik.sql na PRAVI bazi.
 *
 * Zakaj v bazi in ne z branjem: skripta briše profil. Zanima nas, ali
 * VAROVALKE res držijo - ne kako so napisane. Preverjeno je oboje:
 *   1. odvečni profil (brez ene same vezane vrstice) res odide;
 *   2. če ima odvečni profil KAKRŠNO KOLI vezano vrstico, se ne zgodi nič
 *      (drugače bi kaskade tiho odnesle podatke);
 *   3. če profila, ki ga obdržimo, ni, se prav tako ne zgodi nič
 *      (drugače bi ob pomoti izginila zadnja vrstica osebe);
 *   4. drugi zagon ne stori nič.
 *
 * Zagon: node skripte/preveri-podvojeni-profil.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-podvojeni-profil";
const BAZA = "preveri_podvojeni_profil";
const OBDRZI = "jaka.susnik@pb-begunje.si";
const ODSTRANI = "susnik.jaka@pb-begunje.si";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}
function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -F"|" -d ${BAZA} -f ${DELO}/_u.sql`);
}
try { pg("psql -At -c 'select 1'"); }
catch { console.log("PostgreSQL ni na voljo – preizkus preskočen."); process.exit(0); }

mkdirSync(DELO, { recursive: true });
writeFileSync(join(DELO, "prep.sql"), `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin; end if;
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

const skripta = readFileSync(join(koren, "supabase/pocisti-podvojeni-profil-susnik.sql"), "utf8");
trdi(skripta.includes(ODSTRANI) && skripta.includes(OBDRZI),
  "skripta naslavlja oba profila po e-pošti (ne po imenu, ki je pri obeh enako)");

function postavi() {
  pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
  psql(readFileSync(join(DELO, "prep.sql"), "utf8"));
  psql(readFileSync(join(koren, "supabase/schema.sql"), "utf8"));
}
function zasej({ obdrzi = true } = {}) {
  // Profile ustvari sprožilec handle_new_user ob vstavku v auth.users.
  const vrstice = [];
  if (obdrzi) vrstice.push(OBDRZI);
  vrstice.push(ODSTRANI);
  psql(vrstice.map(e =>
    `insert into auth.users (id, email) values (gen_random_uuid(), '${e}');\n` +
    `update public.profili set full_name = 'Sušnik Jaka', department_code = ` +
    (e === OBDRZI ? "'C1'" : "null") + ` where email = '${e}';`
  ).join("\n"));
}
const ostali = () => psql(`select coalesce(string_agg(email, ',' order by email), '') from auth.users;`).trim();
const pozeni = () => psql(skripta);

console.log("1) odvečni profil brez ene same vezane vrstice se izbriše");
postavi(); zasej();
eq(ostali(), [OBDRZI, ODSTRANI].sort().join(","), "pred zagonom sta oba");
pozeni();
eq(ostali(), OBDRZI, "po zagonu ostane samo profil, ki ga obdržimo");

console.log("2) drugi zagon ne stori nič");
pozeni();
eq(ostali(), OBDRZI, "stanje je nespremenjeno");

console.log("3) če ima odvečni profil VEZANO VRSTICO, se ne izbriše");
// Ravno to varuje pred tiho izgubo podatkov prek kaskad: če je bil v
// vmesnem času na "napačni" profil kaj vpisano, mora skripta odnehati in
// pustiti človeku, da vrstice najprej preveže.
for (const [opis, vstavek] of [
  ["razpored", `insert into public.razpored (employee_id, work_date, shift_code, department_code)
                select id, '2026-09-01', 'DOP', 'C1' from public.profili where email = '${ODSTRANI}';`],
  ["želje", `insert into public.zelje_zaposlenih (profile_id, full_name, department_code, obdobje, opis)
             select id, 'Sušnik Jaka', 'C1', '1. 9. 2026', 'x' from public.profili where email = '${ODSTRANI}';`],
  ["kadrovski podatki", `insert into public.kadrovski_podatki (profile_id)
             select id from public.profili where email = '${ODSTRANI}';`],
]) {
  postavi(); zasej();
  psql(vstavek);
  pozeni();
  eq(ostali(), [OBDRZI, ODSTRANI].sort().join(","), `${opis} na odvečnem profilu zaustavi brisanje`);
}

console.log("4) če profila, ki ga obdržimo, ni, se prav tako ne zgodi nič");
postavi(); zasej({ obdrzi: false });
pozeni();
eq(ostali(), ODSTRANI, "zadnji zapis osebe ne sme izginiti");

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
