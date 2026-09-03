#!/usr/bin/env node
/* Menjava od začetka do konca, na PRAVI bazi PostgreSQL, za vse skupine
 * oddelkov in obe novi varnostni pravili (uporabnikova zahteva: "naredi
 * testno menjavo od začetka do konca menjave na vseh zaposlenih").
 *
 * Kaj se tu preveri, česar noben drug preizkus ni:
 *   1. IZVEDBA MENJAVE JE BILA NAPAČNA (resen hrošč, odkrit s tem
 *      preizkusom): obrazec_potrdi_koordinator je vsakega pustil na
 *      SVOJEM datumu in zamenjal samo kodo izmene - v nasprotju s tem, kar
 *      predogled v obrazec.html (NovObrazec) dejansko obljubi uporabniku
 *      pred oddajo (vsak prevzame DATUM/ODDELEK drugega). Pri različnih
 *      datumih je bil rezultat v bazi drugačen od tega, kar je bilo
 *      prikazano. Ta preizkus preveri KONČNO STANJE RAZPORED, ne le status
 *      obrazca.
 *   2. Menjava je bila mogoča med POLJUBNIMA zaposlenima v celi bolnišnici -
 *      mozni_sodelavci ni preverjal niti oddelka niti spola. Zdaj: enak
 *      oddelek (FLEXI izjema), dežurstvo samo z dežurnim, in na C1/D mora
 *      po menjavi ostati dovolj moških (C1: 2, D: 1) - trd blok, brez
 *      izjeme. Varnostni pas se preveri TUDI ob končni potrditvi (stanje
 *      se je od predloga do potrditve lahko spremenilo).
 *
 * Zagon (potrebuje lokalni PostgreSQL in pravico do uporabnika postgres):
 *   node skripte/preveri-menjava-integracija.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-menjava-integracija";
const BAZA = "preveri_menjava_integracija";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -d ${BAZA} -f ${DELO}/_u.sql`);
}
// Kot zgoraj, a napaka NI usodna - vrne besedilo napake namesto da vrže.
function psqlPricakujNapako(sql) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  try {
    pg(`psql -q -v ON_ERROR_STOP=1 -At -d ${BAZA} -f ${DELO}/_u.sql`);
    return null;
  } catch (e) {
    return String(e.stderr || e);
  }
}
function kotOseba(uid, sql) {
  return psql(`set request.jwt.uid = '${uid}';\n${sql}`);
}
function vrstice(sql) {
  const izpis = psql(sql).trim();
  return izpis === "" ? [] : izpis.split("\n");
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
  -- supabase_auth_admin: Supabase jo ustvari sam, plain PostgreSQL pa ne.
  -- Brez nje se schema.sql ustavi na "GRANT USAGE ON SCHEMA public TO
  -- supabase_auth_admin" in ta preizkus se sploh ni mogel izvesti - do
  -- septembra 2026 se je zato TIHO preskakoval povsod, kjer baza ni tekla,
  -- in ni nikoli preveril ničesar.
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
-- V nasprotju z drugimi preizkusi te seje auth.uid() TU MORA vrniti PRAVO
-- osebo - vsa tri stanja menjave (sodelavec/vodja/koordinator) preverjajo
-- "sem jaz res upravičen do te odločitve", kar brez seje-odvisnega uid ni
-- mogoče preveriti resnično.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.uid', true), '')::uuid
$$;
`);
writeFileSync(join(DELO, "schema.sql"), readFileSync(join(koren, "supabase/schema.sql"), "utf8"));

console.log("1) supabase/schema.sql postavi delujočo bazo iz nič");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
try {
  pg(`psql -q -v ON_ERROR_STOP=1 -d ${BAZA} -f ${DELO}/prep.sql -f ${DELO}/schema.sql`);
  trdi(true, "shema se naloži brez napake");
} catch (e) {
  trdi(false, "shema se naloži brez napake: " + String(e.stderr || e).slice(0, 400));
  process.exit(1);
}

// --- osebe -------------------------------------------------------------
const B1 = "10000000-0000-0000-0000-000000000001"; // oddelek B
const B2 = "10000000-0000-0000-0000-000000000002"; // oddelek B
const C1 = "20000000-0000-0000-0000-000000000001"; // oddelek C
const C1_M1 = "30000000-0000-0000-0000-000000000001"; // C1, moški
const C1_M2 = "30000000-0000-0000-0000-000000000002"; // C1, moški
const C1_M3 = "30000000-0000-0000-0000-000000000003"; // C1, moški (rezerva)
const C1_Z1 = "30000000-0000-0000-0000-000000000004"; // C1, ženska
const D_M1 = "40000000-0000-0000-0000-000000000001"; // D, moški
const D_Z1 = "40000000-0000-0000-0000-000000000002"; // D, ženska
const D_NEZNAN = "40000000-0000-0000-0000-000000000003"; // D, spol ni vnesen
const FLEXI1 = "50000000-0000-0000-0000-000000000001"; // FLEXI, moški
const DEZ1 = "60000000-0000-0000-0000-000000000001"; // DEZ
const DEZ2 = "60000000-0000-0000-0000-000000000002"; // DEZ
const ADMIN = "70000000-0000-0000-0000-000000000001"; // admin (potrjuje navadne menjave)
const KOORD = "70000000-0000-0000-0000-000000000002"; // vodja + koordinator (potrjuje dežurstva)

psql(`
insert into public.oddelki (code, name) values
  ('B','B'),('C','C'),('C1','C1'),('D','D'),('FLEXI','FLEXI'),('DEZ','DEZ')
on conflict (code) do nothing;

insert into auth.users (id, email) values
  ('${B1}','b1@t.si'),('${B2}','b2@t.si'),('${C1}','c1x@t.si'),
  ('${C1_M1}','c1m1@t.si'),('${C1_M2}','c1m2@t.si'),('${C1_M3}','c1m3@t.si'),('${C1_Z1}','c1z1@t.si'),
  ('${D_M1}','dm1@t.si'),('${D_Z1}','dz1@t.si'),('${D_NEZNAN}','dn@t.si'),
  ('${FLEXI1}','flexi@t.si'),('${DEZ1}','dez1@t.si'),('${DEZ2}','dez2@t.si'),
  ('${ADMIN}','admin@t.si'),('${KOORD}','koord@t.si');

update public.profili set full_name='B Prvi', department_code='B', vodja_id='${ADMIN}' where id='${B1}';
update public.profili set full_name='B Drugi', department_code='B' where id='${B2}';
update public.profili set full_name='C Oseba', department_code='C', vodja_id='${ADMIN}' where id='${C1}';
update public.profili set full_name='C1 Prvi', department_code='C1' where id='${C1_M1}';
update public.profili set full_name='C1 Drugi', department_code='C1' where id='${C1_M2}';
update public.profili set full_name='C1 Tretji', department_code='C1' where id='${C1_M3}';
update public.profili set full_name='C1 Zenska', department_code='C1', vodja_id='${ADMIN}' where id='${C1_Z1}';
update public.profili set full_name='D Prvi', department_code='D' where id='${D_M1}';
update public.profili set full_name='D Zenska', department_code='D', vodja_id='${ADMIN}' where id='${D_Z1}';
update public.profili set full_name='D Neznan', department_code='D' where id='${D_NEZNAN}';
update public.profili set full_name='Flexi Oseba', department_code='FLEXI', vodja_id='${ADMIN}' where id='${FLEXI1}';
update public.profili set full_name='Dez Prvi', department_code='DEZ', vodja_id='${ADMIN}' where id='${DEZ1}';
update public.profili set full_name='Dez Drugi', department_code='DEZ' where id='${DEZ2}';
update public.profili set full_name='Admin Oseba', role='admin' where id='${ADMIN}';
update public.profili set full_name='Koord Oseba', role='vodja', is_koordinator=true where id='${KOORD}';

insert into public.kadrovski_podatki (profile_id, spol) values
  ('${C1_M1}','M'),('${C1_M2}','M'),('${C1_M3}','M'),('${C1_Z1}','Z'),
  ('${D_M1}','M'),('${D_Z1}','Z'),('${FLEXI1}','M')
on conflict (profile_id) do update set spol = excluded.spol;
-- D_NEZNAN namenoma NIMA vrstice v kadrovski_podatki - preverja privzeto
-- obnašanje "manjkajoč spol = ni moški".

insert into public.razpored (employee_id, department_code, work_date, shift_code) values
  ('${B1}','B','2026-09-10','Dopoldan'),
  ('${B2}','B','2026-09-15','Nočna'),
  ('${C1}','C','2026-09-21','Dopoldan'),
  ('${C1_M1}','C1','2026-09-20','Nočna12'),
  ('${C1_M2}','C1','2026-09-20','Nočna12'),
  ('${C1_M3}','C1','2026-09-25','Nočna12'),
  ('${C1_Z1}','C1','2026-09-25','Nočna12'),
  ('${D_M1}','D','2026-09-20','Dopoldan'),
  ('${D_Z1}','D','2026-09-21','Dopoldan'),
  ('${D_NEZNAN}','D','2026-09-22','Dopoldan'),
  ('${FLEXI1}','FLEXI','2026-09-20','Dopoldan'),
  ('${DEZ1}','DEZ','2026-09-22','Dežurstvo'),
  ('${DEZ2}','DEZ','2026-09-24','Dežurstvo')
on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, department_code = excluded.department_code;
`);

// Pomožnik: celotna pot obrazca do konca (oddaja -> sodelavec -> vodja/koord).
function izvediMenjavo({ vlagatelj, sodelavec, datumA, izmenaA, datumB, izmenaB, vodja }) {
  const id = kotOseba(vlagatelj, `
    insert into public.obrazci (vrsta, status, vlagatelj_id, sodelavec_id, polja) values
      ('menjava_sluzbe','osnutek','${vlagatelj}','${sodelavec}',
       jsonb_build_object('datum_a','${datumA}','izmena_a','${izmenaA}','datum_b','${datumB}','izmena_b','${izmenaB}'))
    returning id;`).trim();
  const oddajaNapaka = psqlPricakujNapako(kotOsebaSql(vlagatelj, `select public.obrazec_oddaj('${id}');`));
  if (oddajaNapaka) return { id, korak: "oddaja", napaka: oddajaNapaka };
  const sodelavecNapaka = psqlPricakujNapako(kotOsebaSql(sodelavec, `select public.obrazec_potrdi_sodelavec('${id}', true);`));
  if (sodelavecNapaka) return { id, korak: "sodelavec", napaka: sodelavecNapaka };
  // Menjava dežurstva (je_dezurstvo) preskoči vodjo in gre naravnost h
  // koordinatorju; navadna menjava gre skozi vodjo, KONČNO pa jo vseeno
  // potrdi administrator, ne koordinator (koordinator je izključno za
  // dežurstva - glej obrazec_potrdi_koordinator v schema.sql).
  const jeDez = psql(`select je_dezurstvo from public.obrazci where id='${id}';`).trim() === "t";
  const status = psql(`select status from public.obrazci where id='${id}';`).trim();
  if (status === "caka_vodjo") {
    const napakaVodja = psqlPricakujNapako(kotOsebaSql(vodja, `select public.obrazec_potrdi_vodja('${id}', true);`));
    if (napakaVodja) return { id, korak: "vodja", napaka: napakaVodja };
  }
  const koncniPotrjevalec = jeDez ? KOORD : ADMIN;
  const napakaKoncna = psqlPricakujNapako(kotOsebaSql(koncniPotrjevalec, `select public.obrazec_potrdi_koordinator('${id}', true);`));
  if (napakaKoncna) return { id, korak: "koncna_potrditev", napaka: napakaKoncna };
  return { id, korak: "zakljucen", napaka: null };
}
function kotOsebaSql(uid, sql) { return `set request.jwt.uid = '${uid}';\n${sql}`; }

// Kot izvediMenjavo, a za ENOSMERNO oddajo dežurstva (vrsta='oddaja_dezurstva') -
// vlagatelj ne dobi nič nazaj, samo sodelavec prevzame njegov datum.
function izvediOddajo({ vlagatelj, sodelavec, datum }) {
  const id = kotOseba(vlagatelj, `
    insert into public.obrazci (vrsta, status, vlagatelj_id, sodelavec_id, polja) values
      ('oddaja_dezurstva','osnutek','${vlagatelj}','${sodelavec}', jsonb_build_object('datum','${datum}'))
    returning id;`).trim();
  const oddajaNapaka = psqlPricakujNapako(kotOsebaSql(vlagatelj, `select public.obrazec_oddaj('${id}');`));
  if (oddajaNapaka) return { id, korak: "oddaja", napaka: oddajaNapaka };
  const sodelavecNapaka = psqlPricakujNapako(kotOsebaSql(sodelavec, `select public.obrazec_potrdi_sodelavec('${id}', true);`));
  if (sodelavecNapaka) return { id, korak: "sodelavec", napaka: sodelavecNapaka };
  // oddaja_dezurstva je vedno "je_dezurstvo" - gre naravnost h koordinatorju.
  const napakaKoncna = psqlPricakujNapako(kotOsebaSql(KOORD, `select public.obrazec_potrdi_koordinator('${id}', true);`));
  if (napakaKoncna) return { id, korak: "koncna_potrditev", napaka: napakaKoncna };
  return { id, korak: "zakljucen", napaka: null };
}

console.log("2) isti oddelek (B), različna datuma – dovoljeno, KONČNO STANJE pravilno");
{
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${B1}','2026-09-10') where profile_id='${B2}';`);
  trdi(kandidati.length === 1, "B2 je med možnimi sodelavci za B1");
  const r = izvediMenjavo({ vlagatelj: B1, sodelavec: B2, datumA: "2026-09-10", izmenaA: "Dopoldan", datumB: "2026-09-15", izmenaB: "Nočna", vodja: ADMIN });
  trdi(r.korak === "zakljucen", "menjava gre do konca: " + JSON.stringify(r));
  const stanje = vrstice(`select employee_id||'|'||department_code||'|'||work_date||'|'||shift_code from public.razpored
    where employee_id in ('${B1}','${B2}') and work_date in ('2026-09-10','2026-09-15') order by employee_id, work_date;`);
  trdi(stanje.join(";") === `${B1}|B|2026-09-10|;${B1}|B|2026-09-15|Nočna;${B2}|B|2026-09-10|Dopoldan;${B2}|B|2026-09-15|`,
    "vsak je prevzel PRAVI datum/oddelek/izmeno drugega, svoj izvirni dan pa je prazen: " + stanje.join(" | "));
}

console.log("3) različna oddelka (C1-oseba proti C-osebi), brez FLEXI – blokirano");
{
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${C1_M1}','2026-09-20') where profile_id='${C1}';`);
  trdi(kandidati.length === 0, "oseba iz oddelka C ni med možnimi sodelavci za osebo iz C1");
}

console.log("4) FLEXI menja s komerkoli – oddelčna omejitev zanj ne velja");
{
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${FLEXI1}','2026-09-20') where profile_id='${D_M1}';`);
  trdi(kandidati.length === 1, "D Prvi je med možnimi sodelavci za FLEXI osebo");
}

console.log("5) dežurstvo samo z dežurnim – DEZ-DEZ dovoljeno, DEZ-nedežurni blokirano");
{
  const dovoljeno = vrstice(`select full_name from public.mozni_sodelavci('${DEZ1}','2026-09-22') where profile_id='${DEZ2}';`);
  trdi(dovoljeno.length === 1, "DEZ2 je med možnimi sodelavci za DEZ1");
  // DEZ1 je namenoma izpuščen iz te preverbe: dežurstvo dan prej blokira
  // (blokirani_dnevi), kar bi masiralo, ali oddelčni filter sploh kaj dela.
  // DEZ2 (druga dežurna oseba, brez take kolizije) je čist preizkus SAMO
  // oddelčnega pravila.
  const blokirano = vrstice(`select full_name from public.mozni_sodelavci('${C1}','2026-09-21') where profile_id='${DEZ2}';`);
  trdi(blokirano.length === 0, "dežurni ni ponujen osebi iz nedežurnega oddelka (C)");
}

console.log("6) C1: menjava, ki ne poruši praga (vsaj 2 moška), je dovoljena in gre do konca");
{
  // C1_M1 (2026-09-20, skupaj z M2 = 2 moška) <-> C1_Z1 (2026-09-25, skupaj z M3 = 1 moški + Z1)
  // Po menjavi: 09-20 ostaneta M2+Z1 (1 moški) - PREMALO. Zato mora biti
  // blokirano - to je scenarij #7. Za "dovoljeno" potrebujemo dan, kjer
  // odhod enega moškega ne podre praga: dodamo tretjega moškega na 09-20.
  psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code) values
    ('${C1_M3}','C1','2026-09-20','Nočna12')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${C1_M1}','2026-09-20') where profile_id='${C1_Z1}';`);
  trdi(kandidati.length === 1, "C1 Zenska je ponujena, ker odhod enega moškega (od treh) ne podre praga na 09-20 - vseeno pa PRAG na njeni STRANI (09-25) šteje: " + JSON.stringify(kandidati));
}

console.log("7) C1: menjava, ki bi podrla prag (samo 2 moška, oba potrebna), je blokirana - v predlogu IN pri končni potrditvi");
{
  psql(`delete from public.razpored where employee_id='${C1_M3}' and work_date='2026-09-20';`);
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${C1_M1}','2026-09-20') where profile_id='${C1_Z1}';`);
  trdi(kandidati.length === 0, "C1 Zenska ni ponujena kot možna sodelavka - odvzela bi drugega od dveh potrebnih moških");

  // Varnostni pas: neposredno vrinemo obrazec (kot bi nekdo obšel vmesnik) in preverimo, da ga KONČNA potrditev zavrne.
  psql(`update public.profili set vodja_id='${ADMIN}' where id='${C1_M1}';`);
  const r = izvediMenjavo({ vlagatelj: C1_M1, sodelavec: C1_Z1, datumA: "2026-09-20", izmenaA: "Nočna12", datumB: "2026-09-25", izmenaB: "Nočna12", vodja: ADMIN });
  trdi(r.korak === "koncna_potrditev" && /dovolj moških/.test(r.napaka || ""),
    "varnostni pas ob KONČNI potrditvi zavrne menjavo: " + JSON.stringify(r));
  const stanjeNespremenjeno = vrstice(`select shift_code from public.razpored where employee_id='${C1_M1}' and work_date='2026-09-20';`);
  trdi(stanjeNespremenjeno[0] === "Nočna12", "razpored ostane NESPREMENJEN po zavrnjeni menjavi");
}

console.log("8) D: manjkajoč spol šteje kot 'ni moški' - menjava, ki bi edinega moškega odstranila, je blokirana");
{
  // D_M1 (09-20, edini moški na D tisti dan) <-> D_NEZNAN (09-22, spol ni vnesen)
  psql(`update public.profili set vodja_id='${ADMIN}' where id in ('${D_M1}','${D_NEZNAN}');`);
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${D_M1}','2026-09-20') where profile_id='${D_NEZNAN}';`);
  trdi(kandidati.length === 0, "oseba z nevnesenim spolom ni ponujena za edino moško mesto na D");
}

console.log("9) D: menjava z znanim moškim je dovoljena in gre do konca (prag D = 1)");
{
  // D_Z1 (09-21, ženska, sama ta dan) <-> D_M1 (09-20). Da odhod D_M1 z
  // 09-20 NE podre praga, dobi 09-20 rezervnega moškega (D_M2) - enak vzorec
  // kot scenarij #6 za C1. Brez rezerve bi bila TA menjava upravičeno
  // blokirana (glej scenarij #8) - namen #9 je pokazati, da prag DOVOLI
  // menjavo, kadar je po njej na obeh straneh res dosežen (ne obratno).
  const D_M2 = "40000000-0000-0000-0000-000000000004";
  psql(`insert into auth.users (id, email) values ('${D_M2}','dm2@t.si')
      on conflict (id) do nothing;
    update public.profili set full_name='D Drugi', department_code='D' where id='${D_M2}';
    insert into public.kadrovski_podatki (profile_id, spol) values ('${D_M2}','M')
      on conflict (profile_id) do update set spol=excluded.spol;
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${D_M2}','D','2026-09-20','Dopoldan')
      on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;
    update public.profili set vodja_id='${ADMIN}' where id='${D_Z1}';`);
  const r = izvediMenjavo({ vlagatelj: D_Z1, sodelavec: D_M1, datumA: "2026-09-21", izmenaA: "Dopoldan", datumB: "2026-09-20", izmenaB: "Dopoldan", vodja: ADMIN });
  trdi(r.korak === "zakljucen", "D: menjava, ki na OBEH straneh ohrani prag 1, gre do konca: " + JSON.stringify(r));
  const stanje = vrstice(`select employee_id||'|'||work_date||'|'||shift_code from public.razpored
    where employee_id in ('${D_Z1}','${D_M1}') and work_date in ('2026-09-20','2026-09-21') order by employee_id, work_date;`);
  trdi(stanje.join(";") === `${D_M1}|2026-09-20|;${D_M1}|2026-09-21|Dopoldan;${D_Z1}|2026-09-20|Dopoldan;${D_Z1}|2026-09-21|`,
    "in končno stanje ima prave datume/izmene: " + stanje.join(" | "));
}

console.log("10) dežurstvo: širše okno (±45 dni) NAJDE oddaljenega dežurnega, a razmik-pravilo ga izloči, če bi vlagatelj po menjavi sam pristal z dežurstvom dan pred/po");
{
  // DEZ3/DEZ4 oddaljeno (2026-11-05, 44 dni od DEZ1-jevega 09-22 – staro
  // okno ±7 dni bi ju popolnoma zgrešilo) ponujata isti datum, oba brez
  // lastnih kolizij - preprost, čist par kandidatov.
  const DEZ3 = "60000000-0000-0000-0000-000000000003";
  const DEZ4 = "60000000-0000-0000-0000-000000000004";
  psql(`
    insert into auth.users (id, email) values ('${DEZ3}','dez3@t.si'),('${DEZ4}','dez4@t.si') on conflict (id) do nothing;
    update public.profili set full_name='Dez Tretji', department_code='DEZ' where id='${DEZ3}';
    update public.profili set full_name='Dez Cetrti', department_code='DEZ' where id='${DEZ4}';
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${DEZ3}','DEZ','2026-11-05','Dežurstvo'),
      ('${DEZ4}','DEZ','2026-11-05','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);

  const sirokoOkno = vrstice(`select full_name from public.mozni_sodelavci('${DEZ1}','2026-09-22') where profile_id in ('${DEZ3}','${DEZ4}') order by full_name;`);
  trdi(sirokoOkno.length === 2, "oba oddaljena dežurna (44 dni stran) sta med možnimi sodelavci - staro okno ±7 dni bi ju zgrešilo: " + JSON.stringify(sirokoOkno));

  // DEZ1 dobi ŠE eno, nepovezano dežurstvo tik ob 2026-11-05 (11-04) - po
  // menjavi bi DEZ1 pristal na 11-05, dan ob svojem lastnem 11-04
  // dežurstvu. Noben od dosedanjih preverjanj počitka (pocitek_ustreza) tega
  // ne zazna, ker vedno preverja SAMO kandidatovo stran, nikoli vlagateljevo
  // - zato je bilo to pravo odkrito varnostno odprtino, ne le teoretično.
  psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${DEZ1}','DEZ','2026-11-04','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);
  const zOviro = vrstice(`select full_name from public.mozni_sodelavci('${DEZ1}','2026-09-22') where profile_id in ('${DEZ3}','${DEZ4}');`);
  trdi(zOviro.length === 0, "oba izginila, ko bi vlagatelj sam pristal z dežurstvom dan pred/po novem datumu: " + JSON.stringify(zOviro));

  // past: brez razmik-pravila (samo staro pocitek_ustreza) bi oba OSTALA
  // ponujena, kljub oviri - dokaz, da gre za resnično nov, ne podvojen pas.
  const past = vrstice(`select p.full_name from public.razpored se join public.profili p on p.id=se.employee_id
    where se.work_date between date '2026-09-22' - 45 and date '2026-09-22' + 45
      and se.employee_id in ('${DEZ3}','${DEZ4}') and se.department_code='DEZ'
      and public.pocitek_ustreza(se.employee_id, se.work_date, 'Dežurstvo')
      and public.pocitek_ustreza('${DEZ1}', '2026-09-22', se.shift_code);`);
  trdi(past.length === 2, "past: brez novega razmik-pravila bi staro pocitek_ustreza oba napačno spustila skozi: " + JSON.stringify(past));

  console.log("11) ista ovira blokira menjavo tudi ob KONČNI potrditvi, po njeni odstranitvi pa menjava uspe s pravilnim stanjem");
  psql(`update public.profili set vodja_id='${ADMIN}' where id in ('${DEZ1}','${DEZ3}');`);
  const rBlokirano = izvediMenjavo({ vlagatelj: DEZ1, sodelavec: DEZ3, datumA: "2026-09-22", izmenaA: "Dežurstvo", datumB: "2026-11-05", izmenaB: "Dežurstvo", vodja: ADMIN });
  trdi(rBlokirano.korak === "koncna_potrditev" && /dežurstvo dan pred ali po/.test(rBlokirano.napaka || ""),
    "varnostni pas ob KONČNI potrditvi zavrne menjavo: " + JSON.stringify(rBlokirano));

  psql(`delete from public.razpored where employee_id='${DEZ1}' and work_date='2026-11-04';`);
  const rUspesno = izvediMenjavo({ vlagatelj: DEZ1, sodelavec: DEZ3, datumA: "2026-09-22", izmenaA: "Dežurstvo", datumB: "2026-11-05", izmenaB: "Dežurstvo", vodja: ADMIN });
  trdi(rUspesno.korak === "zakljucen", "po odstranitvi ovire ista menjava uspe: " + JSON.stringify(rUspesno));
  const stanjeKoncno = vrstice(`select employee_id||'|'||work_date||'|'||shift_code from public.razpored
    where employee_id in ('${DEZ1}','${DEZ3}') and work_date in ('2026-09-22','2026-11-05') order by employee_id, work_date;`);
  trdi(stanjeKoncno.join(";") === `${DEZ1}|2026-09-22|;${DEZ1}|2026-11-05|Dežurstvo;${DEZ3}|2026-09-22|Dežurstvo;${DEZ3}|2026-11-05|`,
    "in končno stanje ima prave datume: " + stanjeKoncno.join(" | "));
}

console.log("12) dežurstvo: pretekel datum se ne ponudi, FLEXI izjema (menjaj s komerkoli) zanj NE velja");
{
  // Relativno na DANES (ne fiksen datum iz 2026), da preizkus ne postane
  // krhek, ko koledar preteče čez trdo kodirane datume drugod v tej datoteki.
  const [danes] = vrstice(`select current_date::text;`);
  const zaN = n => vrstice(`select (date '${danes}' + ${n})::text;`)[0];
  const DEZ5 = "60000000-0000-0000-0000-000000000005"; // ponuja PRETEKLO dežurstvo - ne sme se ponuditi
  const DEZ6 = "60000000-0000-0000-0000-000000000006"; // veljavno prihodnje dežurstvo - sme se ponuditi
  const FLEXI2 = "50000000-0000-0000-0000-000000000002"; // FLEXI "dežurstvo" - zanj velja izjema NE
  psql(`
    insert into auth.users (id, email) values ('${DEZ5}','dez5@t.si'),('${DEZ6}','dez6@t.si'),('${FLEXI2}','flexi2@t.si')
      on conflict (id) do nothing;
    update public.profili set full_name='Dez Peti', department_code='DEZ' where id='${DEZ5}';
    update public.profili set full_name='Dez Sesti', department_code='DEZ' where id='${DEZ6}';
    update public.profili set full_name='Flexi Drugi', department_code='FLEXI' where id='${FLEXI2}';
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${DEZ1}','DEZ','${zaN(15)}','Dežurstvo'),
      ('${DEZ5}','DEZ','${zaN(-5)}','Dežurstvo'),
      ('${DEZ6}','DEZ','${zaN(30)}','Dežurstvo'),
      ('${FLEXI2}','FLEXI','${zaN(31)}','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);
  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${DEZ1}','${zaN(15)}') where profile_id in ('${DEZ5}','${DEZ6}','${FLEXI2}') order by full_name;`);
  trdi(JSON.stringify(kandidati) === JSON.stringify(["Dez Sesti"]),
    "samo veljaven prihodnji dežurni je ponujen - pretekel datum in FLEXI izjema sta izločena: " + JSON.stringify(kandidati));

  const past = vrstice(`select p.full_name from public.razpored se join public.profili p on p.id=se.employee_id
    where se.employee_id in ('${DEZ5}','${FLEXI2}')
      and se.work_date between date '${zaN(15)}' - 45 and date '${zaN(15)}' + 45
      and public.pocitek_ustreza(se.employee_id, '${zaN(15)}', se.shift_code)
      and public.pocitek_ustreza(se.employee_id, se.work_date, 'Dežurstvo')
      and ('DEZ' = se.department_code or 'DEZ' = 'FLEXI' or se.department_code = 'FLEXI');`);
  trdi(past.length === 2, "past: brez novih pogojev (current_date/strog DEZ-DEZ) bi oba napačno šla skozi: " + JSON.stringify(past));
}

console.log("13) enosmerna oddaja dežurstva komurkoli iz KROGA DEŽURNIH (izjema poleg navadne menjave), brez povratne izmene");
{
  const [danes] = vrstice(`select current_date::text;`);
  const zaN = n => vrstice(`select (date '${danes}' + ${n})::text;`)[0];
  const NZV_A = "90000000-0000-0000-0000-000000000001"; // oddaja - domači oddelek NZV, dežuren prek pokriva_oddelek
  const NZV_B = "90000000-0000-0000-0000-000000000002"; // prevzame - prost, čist, dežuren prek pokriva_oddelek
  const NZV_C = "90000000-0000-0000-0000-000000000003"; // na dopustu, dežurna - mora biti izločena (odsotnost)
  const NZV_D = "90000000-0000-0000-0000-000000000004"; // ima sosednje dežurstvo - mora biti izločen (razmik)
  const NZV_E = "90000000-0000-0000-0000-000000000005"; // NZV admin/vodja, a NI del kroga dežurnih - mora biti izločen
  const datum = zaN(15);
  psql(`
    insert into auth.users (id, email) values
      ('${NZV_A}','nzva@t.si'),('${NZV_B}','nzvb@t.si'),('${NZV_C}','nzvc@t.si'),('${NZV_D}','nzvd@t.si'),('${NZV_E}','nzve@t.si')
      on conflict (id) do nothing;
    update public.profili set full_name='NZV Oddajalec', department_code='NZV' where id='${NZV_A}';
    update public.profili set full_name='NZV Prejemnik', department_code='NZV', vodja_id='${ADMIN}' where id='${NZV_B}';
    update public.profili set full_name='NZV Odsotna', department_code='NZV' where id='${NZV_C}';
    update public.profili set full_name='NZV Dezuren', department_code='NZV' where id='${NZV_D}';
    update public.profili set full_name='NZV Administratorka', department_code='NZV' where id='${NZV_E}';
    insert into public.pokriva_oddelek (profile_id, department_code) values
      ('${NZV_A}','DEZ'), ('${NZV_B}','DEZ'), ('${NZV_C}','DEZ'), ('${NZV_D}','DEZ');
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${NZV_A}','DEZ','${datum}','Dežurstvo'),
      ('${NZV_D}','DEZ','${zaN(14)}','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;
    insert into public.odsotnosti (full_name, work_date, kind) values ('NZV Odsotna','${datum}','ld');`);

  const kandidati = vrstice(`select full_name from public.mozni_prejemniki_dezurstva('${NZV_A}','${datum}') where profile_id in ('${NZV_B}','${NZV_C}','${NZV_D}','${NZV_E}','${FLEXI1}') order by full_name;`);
  trdi(JSON.stringify(kandidati) === JSON.stringify(["NZV Prejemnik"]),
    "samo prosta oseba IZ KROGA DEŽURNIH je ponujena - odsotna, sosednje-dežurna, navaden NZV administrator (ni v krogu) in FLEXI so izločeni: " + JSON.stringify(kandidati));

  const past = vrstice(`select full_name from public.profili p
    where p.department_code = 'NZV' and p.id <> '${NZV_A}'
      and p.id in ('${NZV_B}','${NZV_C}','${NZV_D}','${NZV_E}')
      and not exists (select 1 from public.blokirani_dnevi('${datum}','${datum}') b where b.profile_id = p.id)
      and public.pocitek_ustreza(p.id, '${datum}', 'DEŽURSTVO')
      and public.dezurstvo_razmik_ustreza(p.id, '${datum}', '${datum}')
    order by full_name;`);
  trdi(past.length === 2 && past.includes("NZV Administratorka"),
    "past: brez pravila 'del kroga dežurnih' bi se navaden NZV administrator napačno ponudil: " + JSON.stringify(past));

  const r = izvediOddajo({ vlagatelj: NZV_A, sodelavec: NZV_B, datum });
  trdi(r.korak === "zakljucen", "oddaja gre do konca (sprejem sodelavca + koordinator, brez vodje): " + JSON.stringify(r));
  trdi(psql(`select vodja_id from public.obrazci where id='${r.id}';`).trim() === "",
    "vodja ni bil vpleten (skip, isto kot pri menjavi dežurstva)");
  const stanje = vrstice(`select employee_id||'|'||department_code||'|'||shift_code from public.razpored
    where employee_id in ('${NZV_A}','${NZV_B}') and work_date='${datum}' order by employee_id;`);
  trdi(stanje.join(";") === `${NZV_A}|DEZ|;${NZV_B}|DEZ|DEŽURSTVO`,
    "vlagatelj je prost, sodelavec prevzame dežurstvo - BREZ da bi vlagatelj kaj dobil nazaj: " + stanje.join(" | "));

  // past: brez varnostnega pasu ob končni potrditvi bi se dalo obiti iskanje
  // in oddati dežurstvo neposredno odsotni osebi. A dobi NOVO dežurstvo na
  // ISTI datum, na katerega je NZV_C že zgoraj prijavljena na dopustu.
  psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code) values ('${NZV_A}','DEZ','${datum}','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);
  const rBlokirano = izvediOddajo({ vlagatelj: NZV_A, sodelavec: NZV_C, datum });
  trdi(rBlokirano.korak === "koncna_potrditev" && /odsoten/.test(rBlokirano.napaka || ""),
    "varnostni pas ob KONČNI potrditvi zavrne oddajo osebi na dopustu, tudi mimo iskanja: " + JSON.stringify(rBlokirano));

  // past: neposredna oddaja osebi izven kroga dežurnih (mimo iskanja) mora
  // biti zavrnjena tudi ob KONČNI potrditvi, ne le v iskanju.
  psql(`insert into public.razpored (employee_id, department_code, work_date, shift_code) values ('${NZV_A}','DEZ','${zaN(16)}','Dežurstvo')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);
  const rZunajKroga = izvediOddajo({ vlagatelj: NZV_A, sodelavec: NZV_E, datum: zaN(16) });
  trdi(rZunajKroga.korak === "koncna_potrditev" && /ni del kroga dežurnih/.test(rZunajKroga.napaka || ""),
    "varnostni pas ob KONČNI potrditvi zavrne oddajo osebi izven kroga dežurnih, tudi mimo iskanja: " + JSON.stringify(rZunajKroga));
}

// --- 15) NZV: menjava rednega delovnega dne ---------------------------
console.log("15) NZV lahko zamenja svoj redni delovni dan (šifra PRISOTEN)");
{
  // Uporabnik je javil: "postopek menjave ne deluje in se ne prenese v
  // razpored, trenutno govorim za NZV".
  //
  // V pravi bazi je 336 od 395 prihodnjih vrstic NZV zapisanih s šifro
  // PRISOTEN (redni delovni dan nosilca). izmena_cas te šifre ni poznal in
  // je vrnil NULL, mozni_sodelavci pa vsakega kandidata brez ur izloči -
  // zato NZV ni videl NIKOGAR za menjavo in menjave ni bilo mogoče niti
  // začeti. Enako je veljalo za nov zapis kalupa ("Dopoldne"/"Popoldne").
  // Relativno na danes, iz istega razloga kot v scenariju 13.
  const [danesN] = vrstice(`select current_date::text;`);
  const cezN = n => vrstice(`select (date '${danesN}' + ${n})::text;`)[0];
  const NZVX = "80000000-0000-0000-0000-000000000010";
  const NZVY = "80000000-0000-0000-0000-000000000011";
  const dA = cezN(6), dB = cezN(7);
  psql(`
    insert into public.oddelki (code, name) values ('NZV','NZV') on conflict (code) do nothing;
    insert into auth.users (id, email) values ('${NZVX}','nzvx@t.si'),('${NZVY}','nzvy@t.si')
      on conflict (id) do nothing;
    update public.profili set full_name='NZV Iks', department_code='NZV', vodja_id='${ADMIN}' where id='${NZVX}';
    update public.profili set full_name='NZV Ipsilon', department_code='NZV' where id='${NZVY}';
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${NZVX}','NZV','${dA}','PRISOTEN'),
      ('${NZVY}','NZV','${dB}','PRISOTEN')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);

  // Vse šifre, ki se v pravi bazi res pojavljajo in morajo imeti ure -
  // brez njih jih mozni_sodelavci izloči in menjave ni mogoče niti začeti.
  const brezUr = vrstice(`
    select s from unnest(array['PRISOTEN','Dopoldne','Popoldne','Popoldne do 19',
                               'Nočna 12','Dnevna 12','dopoldan','popoldan','NOČNA']) s
     where (select zacetek from public.izmena_cas(s)) is null;`);
  trdi(brezUr.length === 0,
    "vse delovne šifre iz prave baze imajo ure" + (brezUr.length ? " – brez ur: " + brezUr.join(", ") : ""));

  const kandidati = vrstice(`select full_name from public.mozni_sodelavci('${NZVX}','${dA}');`);
  trdi(kandidati.includes("NZV Ipsilon"),
    "NZV vidi sodelavca za menjavo – dobil: " + (kandidati.join(", ") || "(prazno)"));

  const r = izvediMenjavo({ vlagatelj: NZVX, sodelavec: NZVY, datumA: dA, izmenaA: "PRISOTEN",
                            datumB: dB, izmenaB: "PRISOTEN", vodja: ADMIN });
  trdi(r.korak === "zakljucen", "menjava gre skozi vso pot do konca: " + JSON.stringify(r));

  // In - kar je uporabnik izrecno omenil - se PRENESE V RAZPORED: vsak
  // prevzame datum drugega.
  const stanje = vrstice(`select work_date::text||'='||employee_id from public.razpored
    where employee_id in ('${NZVX}','${NZVY}') and work_date in ('${dA}','${dB}')
      and coalesce(shift_code,'') <> '' order by work_date;`);
  trdi(stanje.join(";") === `${dA}=${NZVY};${dB}=${NZVX}`,
    "razpored po menjavi: vsak je na datumu drugega – dobil: " + stanje.join(" | "));
}

// --- 16) administrator izvede menjavo TAKOJ, mimo sodelavca/vodje --------
console.log("16) administrator lahko v skrajnem primeru menjavo izvede TAKOJ, mimo sodelavca/vodje - a trde varovalke ostanejo");
{
  const AX = "a0000000-0000-0000-0000-000000000001"; // B, vlagatelj
  const AY = "a0000000-0000-0000-0000-000000000002"; // B, sodelavec
  psql(`
    insert into auth.users (id, email) values ('${AX}','ax@t.si'),('${AY}','ay@t.si') on conflict (id) do nothing;
    update public.profili set full_name='Admin Menjava Prvi', department_code='B' where id='${AX}';
    update public.profili set full_name='Admin Menjava Drugi', department_code='B' where id='${AY}';
    insert into public.razpored (employee_id, department_code, work_date, shift_code) values
      ('${AX}','B','2026-10-05','Dopoldan'),
      ('${AY}','B','2026-10-06','Nočna')
    on conflict (employee_id, work_date) do update set shift_code=excluded.shift_code, department_code=excluded.department_code;`);

  // a) navaden uporabnik (ni admin) je zavrnjen.
  const napakaNiAdmin = psqlPricakujNapako(kotOsebaSql(AX,
    `select public.obrazec_admin_izvedi_menjavo('${AX}','${AY}','2026-10-05','2026-10-06', null);`));
  trdi(!!napakaNiAdmin && /Samo administrator/.test(napakaNiAdmin),
    "navaden zaposleni ne more klicati admin-poti: " + (napakaNiAdmin || "(ni napake)"));

  // b) admin izvede menjavo v ENEM koraku - brez oddaje/sodelavca/vodje.
  const idTakoj = kotOseba(ADMIN,
    `select public.obrazec_admin_izvedi_menjavo('${AX}','${AY}','2026-10-05','2026-10-06', 'Zaposleni na bolniški, ne utegne sam');`).trim();
  trdi(!!idTakoj, "admin dobi nazaj id ustvarjenega obrazca: " + idTakoj);
  const statusTakoj = psql(`select status from public.obrazci where id='${idTakoj}';`).trim();
  trdi(statusTakoj === "zakljucen", "obrazec je takoj v stanju 'zakljucen', brez vmesnih korakov: " + statusTakoj);
  const stanjeTakoj = vrstice(`select employee_id||'|'||work_date||'|'||shift_code from public.razpored
    where employee_id in ('${AX}','${AY}') and work_date in ('2026-10-05','2026-10-06') order by employee_id, work_date;`);
  trdi(stanjeTakoj.join(";") === `${AX}|2026-10-05|;${AX}|2026-10-06|Nočna;${AY}|2026-10-05|Dopoldan;${AY}|2026-10-06|`,
    "razpored je zamenjan enako kot pri navadni menjavi: " + stanjeTakoj.join(" | "));
  const obvestili = vrstice(`select user_id from public.obvestila where user_id in ('${AX}','${AY}') order by user_id;`);
  trdi(obvestili.length === 2, "oba dobita obvestilo, da je admin menjavo izvedel zanju: " + obvestili.length);

  // c) sama-s-sabo je zavrnjeno.
  const napakaIsta = psqlPricakujNapako(kotOsebaSql(ADMIN,
    `select public.obrazec_admin_izvedi_menjavo('${AX}','${AX}','2026-10-05','2026-10-06', null);`));
  trdi(!!napakaIsta && /ista oseba/.test(napakaIsta), "vlagatelj in sodelavec ne moreta biti ista oseba: " + (napakaIsta || "(ni napake)"));

  // d) trde varovalke NISO preglašene - ista C1 kršitev kot v scenariju 7,
  // tokrat prek admin-takojšnje poti: odvzem enega od dveh potrebnih moških.
  const napakaSpol = psqlPricakujNapako(kotOsebaSql(ADMIN,
    `select public.obrazec_admin_izvedi_menjavo('${C1_M1}','${C1_Z1}','2026-09-20','2026-09-25', 'nujno');`));
  trdi(!!napakaSpol && /dovolj moških/.test(napakaSpol),
    "admin-takojšnja pot NE preglasi spolnega pravila C1 - zavrnjena enako kot navadna menjava: " + (napakaSpol || "(ni napake)"));
  const stanjeC1 = vrstice(`select employee_id||'|'||work_date||'|'||shift_code from public.razpored
    where employee_id in ('${C1_M1}','${C1_Z1}') and work_date in ('2026-09-20','2026-09-25') order by employee_id, work_date;`);
  trdi(stanjeC1.join(";") === `${C1_M1}|2026-09-20|Nočna12;${C1_Z1}|2026-09-25|Nočna12`,
    "razpored ostane NESPREMENJEN po zavrnjeni admin-takojšnji menjavi: " + stanjeC1.join(" | "));
}

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
