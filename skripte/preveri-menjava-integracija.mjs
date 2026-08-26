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

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
