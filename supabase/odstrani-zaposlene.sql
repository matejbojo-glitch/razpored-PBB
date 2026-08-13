-- =====================================================================
-- Trajen izbris zaposlenih, ki niso več v delovnem razmerju
-- =====================================================================
-- Zaženi v Supabase → SQL Editor. Poženi ukaze PO VRSTI, od 0 do 7.
-- Vsak ukaz je samostojen (ne uporablja začasnih tabel — v Supabase SQL
-- Editorju vsak ukaz dobi svojo sejo in začasne tabele med ukazi ne
-- preživijo), zato se seznam ljudi ponovi v vsakem. Za spremembo seznama
-- popravi VSE pojavitve bloka "cilj(email, ime)".
--
-- Ujemanje je namenoma dvojno:
--   * po e-pošti (zanesljivo, iz auth.users),
--   * po imenu kot "vreči besed" (imena_se_ujemata) — isto ime se v
--     aplikaciji pojavlja kot "Priimek Ime", "IME PRIIMEK" ipd.
--
-- ZAKAJ JE VRSTNI RED POMEMBEN — dvoje, oboje preverjeno na pravi bazi:
--   1. Menjave, obrazci in avtorstvo vnosov v razporedu NIMAJO kaskade.
--      Brez ukazov 1–4 pade ukaz 5 z napako o tujem ključu.
--   2. Baza ima sprožilce dnevnika (log_leave_entry_change, profiles_audit,
--      schedule_entries_audit). Ti ob izbrisu SAMI zapišejo novo vrstico z
--      imenom izbrisane osebe. Zato dnevnikov ni mogoče počistiti prej —
--      ukaz 7 jih pobriše ŠELE ZA IZBRISOM in zato res deluje.
--
-- PREDPOGOJ: v bazi mora biti odsek 30 iz supabase/schema.sql (povezave
-- "kdo je vnesel/odobril" dobijo "on delete set null"). Brez njega izbris
-- ustavi tuji ključ na schedule_entries.created_by, polja pa ni mogoče niti
-- izprazniti, ker ga sprožilec schedule_entries_touch ob UPDATE vrne na
-- staro vrednost. Odsek 30 je varno pognati večkrat.
--
-- Izbris je dokončen; podatkov ni mogoče povrniti. Če želiš osebo samo
-- umakniti iz seznamov in obdržati zgodovino, ji raje v Imeniku odstrani
-- oddelek.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) PREGLED — najprej poženi SAMO tega in preveri, kdo bo izbrisan.
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id, p.full_name from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id, p.full_name from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
)
select
  i.full_name as kaj,
  concat_ws(' · ',
    'razpored: ' || (select count(*) from public.schedule_entries s where s.employee_id = i.id),
    'menjave: '  || (select count(*) from public.swap_requests w where w.requester_id = i.id or w.target_id = i.id),
    'obrazci: '  || (select count(*) from public.obrazci o where o.vlagatelj_id = i.id or o.sodelavec_id = i.id),
    'dopust/omejitve: ' || (select count(*) from public.leave_entries l where public.imena_se_ujemata(l.full_name, i.full_name)),
    'želje: '    || (select count(*) from public.employee_wishes z where z.profile_id = i.id)
  ) as podrobnost
from ids i
order by 1;


-- ---------------------------------------------------------------------
-- 1) Menjave — requester_id/target_id sta NOT NULL brez kaskade, zato se
--    take menjave izbrišejo. Kjer je oseba nastopala samo kot odobritelj
--    (vodja/admin), se polje izprazni: menjava dveh drugih ljudi mora
--    ostati v zgodovini.
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
),
zbrisane as (
  delete from public.swap_requests
  where requester_id in (select id from ids) or target_id in (select id from ids)
  returning 1
),
sproscene as (
  update public.swap_requests
  set lead_id = case when lead_id in (select id from ids) then null else lead_id end,
      admin_id = case when admin_id in (select id from ids) then null else admin_id end
  where lead_id in (select id from ids) or admin_id in (select id from ids)
  returning 1
)
select 'menjave izbrisane' as kaj, (select count(*) from zbrisane) as podrobnost
union all
select 'menjave brez odobritelja', (select count(*) from sproscene);


-- ---------------------------------------------------------------------
-- 2) Obrazci — vlagatelj_id/sodelavec_id sta "on delete restrict".
--    obrazci_dnevnik se pobriše sam (kaskada z obrazca).
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
),
zbrisani as (
  delete from public.obrazci
  where vlagatelj_id in (select id from ids) or sodelavec_id in (select id from ids)
  returning 1
)
select 'obrazci izbrisani' as kaj, (select count(*) from zbrisani) as podrobnost;


-- ---------------------------------------------------------------------
-- 3) Vrstice, vezane na IME in ne na id — brez tega oseba še naprej visi
--    v Željah, v razpredelnici dopustov in med uvoženimi vizitkami.
--    (Dnevnik dopusta se počisti šele v ukazu 7 — sprožilec ga tu sproti
--    znova napolni.)
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
imena as (
  select c.ime from cilj c
  union
  select p.full_name from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c2.email) from cilj c2)
),
a as (
  delete from public.leave_entries l
  where exists (select 1 from imena i where public.imena_se_ujemata(l.full_name, i.ime))
  returning 1
),
b as (
  delete from public.employee_wishes z
  where exists (select 1 from imena i where public.imena_se_ujemata(z.full_name, i.ime))
  returning 1
),
c as (
  delete from public.leave_balance_history h
  where exists (select 1 from imena i where public.imena_se_ujemata(h.full_name, i.ime))
  returning 1
),
d as (
  delete from public.lead_departments ld
  where exists (select 1 from imena i where public.imena_se_ujemata(ld.full_name, i.ime))
  returning 1
),
e as (
  delete from public.contact_imports ci
  where lower(ci.email) in (select lower(c2.email) from cilj c2)
     or exists (select 1 from imena i where public.imena_se_ujemata(ci.full_name, i.ime))
  returning 1
)
select 'dopust/omejitve' as kaj, (select count(*) from a) as podrobnost
union all select 'želje', (select count(*) from b)
union all select 'stanje dopusta', (select count(*) from c)
union all select 'nosilci oddelkov', (select count(*) from d)
union all select 'uvožene vizitke', (select count(*) from e);


-- ---------------------------------------------------------------------
-- 4) Razpored osebe. Vnose izbrišemo tu izrecno (in ne šele s kaskado v
--    ukazu 6), da sprožilec dnevnika razporeda naredi svoje ZDAJ — ukaz 6
--    potem nima več česa zabeležiti. Avtorstva ni treba prazniti ročno:
--    povezave "kdo je vnesel/odobril" so po odseku 30 sheme "set null".
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
),
a as (
  delete from public.schedule_entries where employee_id in (select id from ids) returning 1
),
b as (
  update public.profiles set vodja_id = null
  where vodja_id in (select id from ids) returning 1
)
select 'vnosi v razporedu' as kaj, (select count(*) from a) as podrobnost
union all select 'osebe brez tega vodje', (select count(*) from b);


-- ---------------------------------------------------------------------
-- 5) Dnevnik razporeda za to osebo — zdaj, ko profil še obstaja in je
--    id še mogoče poiskati (po ukazu 6 tega ni več mogoče).
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
),
zbrisani as (
  delete from public.schedule_entries_log where employee_id in (select id from ids) returning 1
)
select 'dnevnik razporeda izbrisan' as kaj, (select count(*) from zbrisani) as podrobnost;


-- ---------------------------------------------------------------------
-- 6) Izbris računa. profiles → auth.users je "on delete cascade", zato ta
--    en ukaz odnese profil in vse, kar nanj kaskadno visi (oddelčna
--    članstva, HR podatki, telefoni, obvestila, naročnine na potisna
--    obvestila, koledarski žetoni, dnevnik ogledov).
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
),
zbrisani as (
  delete from auth.users where id in (select id from ids) returning 1
)
select 'računi izbrisani' as kaj, (select count(*) from zbrisani) as podrobnost;


-- ---------------------------------------------------------------------
-- 7) Sledi, ki jih je pustil sam izbris. Sprožilca log_leave_entry_change
--    in profiles_audit sta ob ukazih 3 in 6 zapisala novo vrstico z imenom
--    izbrisane osebe — brez tega ukaza ime ostane v dnevniku.
--    Tu se ujema SAMO po imenu, ker profilov (in id-jev) ni več.
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
a as (
  delete from public.leave_entries_log l
  where exists (select 1 from cilj c where public.imena_se_ujemata(l.full_name, c.ime))
  returning 1
),
b as (
  delete from public.profiles_log g
  where exists (select 1 from cilj c where public.imena_se_ujemata(g.profile_name, c.ime))
     or exists (select 1 from cilj c where public.imena_se_ujemata(g.changed_by_name, c.ime))
  returning 1
)
select 'dnevnik dopusta' as kaj, (select count(*) from a) as podrobnost
union all select 'dnevnik profilov', (select count(*) from b);


-- ---------------------------------------------------------------------
-- 8) PREVERBA — mora vrniti nič vrstic.
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
)
select 'profiles' as kje, p.full_name as kdo from public.profiles p, cilj c
  where public.imena_se_ujemata(p.full_name, c.ime)
union all
select 'auth.users', u.email from auth.users u, cilj c where lower(u.email) = lower(c.email)
union all
select 'leave_entries', l.full_name from public.leave_entries l, cilj c
  where public.imena_se_ujemata(l.full_name, c.ime)
union all
select 'leave_entries_log', l.full_name from public.leave_entries_log l, cilj c
  where public.imena_se_ujemata(l.full_name, c.ime)
union all
select 'employee_wishes', z.full_name from public.employee_wishes z, cilj c
  where public.imena_se_ujemata(z.full_name, c.ime)
union all
select 'lead_departments', ld.full_name from public.lead_departments ld, cilj c
  where public.imena_se_ujemata(ld.full_name, c.ime)
union all
select 'profiles_log', g.profile_name from public.profiles_log g, cilj c
  where public.imena_se_ujemata(g.profile_name, c.ime)
union all
select 'contact_imports', ci.full_name from public.contact_imports ci, cilj c
  where lower(ci.email) = lower(c.email) or public.imena_se_ujemata(ci.full_name, c.ime);
