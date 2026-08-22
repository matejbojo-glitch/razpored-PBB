-- =====================================================================
-- 2. KORAK – popravki baze in trajen izbris štirih zaposlenih
-- =====================================================================
-- Kopiraj CELOTNO datoteko, prilepi v Supabase → SQL Editor in klikni Run.
-- Vse spodaj je ena sama serija ukazov v pravem vrstnem redu; teči mora od
-- vrha proti dnu, zato ne poganjaj posameznih delov posebej.
--
-- Ko se konča, je zadnji izpis PREVERBA. Če je prazna (0 vrstic), je izbris
-- popoln. Če vrne kakšno vrstico, tam piše, kje je ime še ostalo.
--
-- Pred tem poženi 1. korak (supabase/1-PREGLED-KDO-BO-IZBRISAN.sql) in
-- preveri seznam – izbris je dokončen in podatkov ni mogoče povrniti.
--
-- Datoteka vsebuje tri stvari, v tem vrstnem redu:
--   A) manjkajoč stolpec schedule_entries.created_at,
--   B) popravek sprožilca in povezav "kdo je vnesel/odobril",
--   C) sam izbris (ukazi 1–7) in preverbo (ukaz 8).
-- A in B sta varna za večkraten zagon; po njiju je izbris sploh mogoč.
-- =====================================================================


-- ---------------------------------------------------------------------
-- A) Manjkajoči stolpci razporeda
-- ---------------------------------------------------------------------
alter table public.schedule_entries add column if not exists created_at timestamptz not null default now();
alter table public.schedule_entries add column if not exists created_by uuid references public.profiles (id);
alter table public.schedule_entries add column if not exists updated_by uuid references public.profiles (id);


-- ---------------------------------------------------------------------
-- B) Sprožilec in povezave "kdo je vnesel/odobril"
-- ---------------------------------------------------------------------
create or replace function public.schedule_entries_touch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at; -- datum objave se ob poznejšem urejanju ne spreminja
    -- Avtorja prve objave ohrani (upsert iz aplikacije pošlje prazno polje
    -- in bi ga sicer izbrisal) – RAZEN kadar ga prav zdaj prazni baza sama,
    -- ker je bil avtorjev račun izbrisan ("on delete set null", odsek 30).
    -- Takrat old.created_by kaže na profil, ki ne obstaja več; če ga vrnemo,
    -- v vrstici ostane viseča povezava na neobstoječo osebo.
    if not (new.created_by is null and old.created_by is not null
            and not exists (select 1 from public.profiles p where p.id = old.created_by)) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Kdo je vnesel/odobril, ni lastništvo, ampak sled. Ko oseba zapusti
-- bolnišnico in se njen račun izbriše, mora zapis ostati – samo brez
-- avtorja. Brez "on delete set null" te povezave izbris ustavijo, sprožilec
-- schedule_entries_touch pa poleg tega ob UPDATE avtorja vrne na staro
-- vrednost, tako da polja ni mogoče niti ročno izprazniti.
do $$
declare v record;
begin
  for v in
    select conname, conrelid::regclass as tabela, a.attname as stolpec
    from pg_constraint c
    join unnest(c.conkey) k on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype = 'a'   -- 'a' = no action (privzeto, blokira izbris)
      and (c.conrelid, a.attname) in (
        ('public.schedule_entries'::regclass, 'created_by'),
        ('public.schedule_entries'::regclass, 'updated_by'),
        ('public.schedule_entries_log'::regclass, 'changed_by'),
        ('public.profiles_log'::regclass, 'changed_by'),
        ('public.swap_requests'::regclass, 'lead_id'),
        ('public.swap_requests'::regclass, 'admin_id')
      )
  loop
    execute format('alter table %s drop constraint %I', v.tabela, v.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete set null',
                   v.tabela, v.conname, v.stolpec);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- C) Izbris
-- ---------------------------------------------------------------------
-- 1) Menjave – requester_id/target_id sta NOT NULL brez kaskade, zato se
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
-- 2) Obrazci – vlagatelj_id/sodelavec_id sta "on delete restrict".
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
-- 3) Vrstice, vezane na IME in ne na id – brez tega oseba še naprej visi
--    v Željah, v razpredelnici dopustov in med uvoženimi vizitkami.
--    (Dnevnik dopusta se počisti šele v ukazu 7 – sprožilec ga tu sproti
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
--    ukazu 6), da sprožilec dnevnika razporeda naredi svoje ZDAJ – ukaz 6
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
-- 5) Dnevnik razporeda za to osebo – zdaj, ko profil še obstaja in je
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
--    izbrisane osebe – brez tega ukaza ime ostane v dnevniku.
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
-- 8) PREVERBA – mora vrniti nič vrstic.
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
