-- =====================================================================
-- Razpored PBB – TRDA MEJA PODATKOV: razpored velja od 2026-09-01 naprej
--
-- ZAHTEVA (uporabnik, september 2026)
-- "Za podatke in app naj bodo podatki iz razporeda aktualni samo od
-- septembra 2026 naprej." Januar–avgust 2026 so oddelani: razpored je bil
-- izveden, ure obračunane, meseci zaključeni.
--
-- Aplikacija je to mejo na enem mestu imela že prej – pravičnost dežurstev
-- bere živo iz Supabase šele od 2026-09-01, pred tem pa uporablja zaprto
-- zgodovino (admin.html, nalozizDezurnaStanja). Odslej velja povsod.
--
-- KAJ TA DATOTEKA NAREDI
--   1. Ustvari arhivsko tabelo in vanjo PRESELI vse vrstice pred mejo.
--      Nič se ne zavrže – 9128 vrstic brez povratka bi bil nesorazmeren
--      ukrep za nekaj, kar je v resnici sprememba OBSEGA prikaza.
--   2. Postavi sprožilec, ki zapise pred mejo odslej tiho preskoči.
--
-- ZAKAJ MEJA V BAZI IN NE SAMO V EDGE FUNKCIJI
-- V razpored piše več poti: nočna uskladitev iz Sheets, dogodkovna pot iz
-- Apps Scripta, objava iz generatorja in ročni uvoz v index.html. Meja,
-- napisana v eni od njih, velja samo zanjo; tu velja za vse. Edge funkcija
-- mejo vseeno pozna (MEJA_PODATKOV v sheets-vhod/index.ts) – tam prihrani
-- delo in pravilno poroča, koliko celic je sploh obdelala.
--
-- ZAKAJ SPROŽILEC TIHO PRESKOČI IN NE JAVI NAPAKE
-- Uskladitev piše v svežnjih po 200 vrstic. Izjema bi prekinila cel
-- svežanj in s tem zavrgla tudi veljavne vrstice od septembra naprej, ki
-- so v njem. Preskok prizadene natanko vrstico, ki v aplikacijo ne sodi.
--
-- OPOZORILO ZA IZBRIS (velja tudi za vsak prihodnji množični izbris)
-- Na razpored visita dva sprožilca AFTER DELETE:
--   sheet_sync_izhod_trg – vrstici brez razlog='sheets' ob izbrisu zapiše
--     v izhodno vrsto shift_code = NULL, kar v Google listu POBRIŠE celico;
--   schedule_entries_audit – zapiše vrstico v dnevnik_razporeda.
-- Zato se izbris spodaj izvede z obema začasno izklopljenima, znotraj ene
-- transakcije (ALTER TABLE vzame ACCESS EXCLUSIVE ključavnico, zato v tem
-- oknu v razpored ne more pisati nihče drug).
--
-- KAKO POGNATI: Supabase → SQL Editor → New query → prilepi vse → Run.
-- Datoteka je pisana tako, da je ponoven zagon neškodljiv: "create table
-- if not exists", "drop trigger if exists", arhiviranje z "where not
-- exists" in izbris, ki najprej preveri, da je arhiv popoln. Vsebina je
-- bila v produkciji pognana ENKRAT (16. 9. 2026); ponovnega zagona nad
-- produkcijo nismo preizkusili, zato pred drugim zagonom raje najprej
-- poženi samo kontrolno poizvedbo na dnu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · Arhiv
-- ---------------------------------------------------------------------
create table if not exists public.razpored_arhiv_pred_2026_09 (
  id              bigint,
  employee_id     uuid        not null,
  department_code text        not null,
  work_date       date        not null,
  shift_code      text        not null,
  updated_at      timestamptz,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz,
  pokriva_oddelek text,
  razlog          text,
  arhivirano      timestamptz not null default now()
);

comment on table public.razpored_arhiv_pred_2026_09 is
  'Razpored pred 2026-09-01. Aplikacija ga ne bere; hranjen samo za povratek.';

-- Namenoma BREZ politik: nihče prek API-ja ne bere in ne piše.
alter table public.razpored_arhiv_pred_2026_09 enable row level security;

insert into public.razpored_arhiv_pred_2026_09
  (id, employee_id, department_code, work_date, shift_code, updated_at,
   created_by, updated_by, created_at, pokriva_oddelek, razlog)
select id, employee_id, department_code, work_date, shift_code, updated_at,
       created_by, updated_by, created_at, pokriva_oddelek, razlog
from public.razpored
where work_date < date '2026-09-01'
  -- Ponoven zagon ne podvoji že arhiviranih vrstic.
  and not exists (
    select 1 from public.razpored_arhiv_pred_2026_09 a
     where a.employee_id = razpored.employee_id
       and a.work_date   = razpored.work_date);

-- ---------------------------------------------------------------------
-- 2 · Izbris preseljenih vrstic (z izklopljenima sprožilcema – glej zgoraj)
-- ---------------------------------------------------------------------
do $$
declare
  v_arhiv   bigint;
  v_brisano bigint;
begin
  -- Varovalo: brez popolnega arhiva se ne briše nič.
  select count(*) into v_arhiv
    from public.razpored r
   where r.work_date < date '2026-09-01'
     and not exists (
       select 1 from public.razpored_arhiv_pred_2026_09 a
        where a.employee_id = r.employee_id and a.work_date = r.work_date);
  if v_arhiv > 0 then
    raise exception 'V arhivu manjka % vrstic - izbris odpovedan', v_arhiv;
  end if;

  alter table public.razpored disable trigger sheet_sync_izhod_trg;
  alter table public.razpored disable trigger schedule_entries_audit;

  delete from public.razpored where work_date < date '2026-09-01';
  get diagnostics v_brisano = row_count;

  alter table public.razpored enable trigger sheet_sync_izhod_trg;
  alter table public.razpored enable trigger schedule_entries_audit;

  raise notice 'Izbrisanih vrstic pred mejo: %', v_brisano;
end $$;

-- ---------------------------------------------------------------------
-- 3 · Meja odslej velja za vsakega pisca
-- ---------------------------------------------------------------------
create or replace function public.razpored_meja_podatkov()
returns trigger
language plpgsql
as $$
begin
  if new.work_date < date '2026-09-01' then
    return null;   -- vrstica se ne zapiše; ostali del svežnja teče naprej
  end if;
  return new;
end;
$$;

comment on function public.razpored_meja_podatkov() is
  'Zavrne zapise pred 2026-09-01 (oddelani meseci). Glej razpored_arhiv_pred_2026_09.';

drop trigger if exists razpored_meja_podatkov_trg on public.razpored;

-- BEFORE in pred ostalimi sprožilci po imenu (Postgres jih sproži po
-- abecedi): vrstica, ki tu odpade, ne sme sprožiti ne revizije ne izhodne
-- sinhronizacije. Imena: "razpored_meja_" < "schedule_" < "trg_".
create trigger razpored_meja_podatkov_trg
  before insert or update on public.razpored
  for each row execute function public.razpored_meja_podatkov();

-- ---------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------
select
  (select count(*) from public.razpored)                          as vrstic_v_razporedu,
  (select min(work_date) from public.razpored)                    as najstarejsi_dan,
  (select count(*) from public.razpored_arhiv_pred_2026_09)       as vrstic_v_arhivu;

-- =====================================================================
-- POVRNITEV (če bi kdaj bila potrebna)
--
--   drop trigger razpored_meja_podatkov_trg on public.razpored;
--   insert into public.razpored
--     (employee_id, department_code, work_date, shift_code,
--      created_by, updated_by, pokriva_oddelek, razlog)
--   select employee_id, department_code, work_date, shift_code,
--          created_by, updated_by, pokriva_oddelek, razlog
--     from public.razpored_arhiv_pred_2026_09
--   on conflict (employee_id, work_date) do nothing;
--
-- Pozor: vsak tak vnos se uvrsti v izhodno vrsto za Google Sheets. Če se
-- povrnjeno NE sme vrniti v liste, vstavi z razlog = 'sheets'.
-- =====================================================================
