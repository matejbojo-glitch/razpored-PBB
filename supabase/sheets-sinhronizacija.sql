-- Razpored PBB – SINHRONIZACIJA Z GOOGLE SHEETS: vrsta in napake
--
-- Predpogoj: supabase/sheets-povezave.sql (tabela sheet_connections) in
-- supabase/razlog-spremembe.sql (stolpec razlog).
--
-- ZAKAJ IZHODNA VRSTA IN NE NEPOSREDEN KLIC
-- Objava enega meseca za oddelek je okrog 300 vrstic. Če bi vsaka sprožila
-- svoj klic proti Google Sheets API (kvota ~60 zahtev/min), bi takoj zadeli
-- 429. Vrstice se zato samo odložijo tukaj, Edge Function pa jih enkrat na
-- minuto pobere, ZDRUŽI po zavihkih in odpošlje en sam batchUpdate na
-- zavihek - 7 zahtev na minuto namesto 300.
--
-- ZAKAJ SPROŽILEC IN NE DATABASE WEBHOOK
-- Sprožilec teče v ISTI transakciji kot zapis: če se objava razporeda
-- povrne (rollback), se povrne tudi vrsta. Webhook prek pg_net bi v takem
-- primeru poslal spremembo, ki se ni zgodila.
--
-- Skripta je varno ponovljiva.

-- 1) Izhodna vrsta -------------------------------------------------------
create table if not exists public.sheet_sync_izhod (
  id              bigserial primary key,
  povezava_id     uuid not null references public.sheet_connections(id) on delete cascade,
  employee_id     uuid not null,
  work_date       date not null,
  shift_code      text,
  status          text not null default 'caka',
  poskusi         int  not null default 0,
  napaka          text,
  ustvarjeno      timestamptz not null default now(),
  obdelano        timestamptz,
  constraint sheet_sync_izhod_status_check
    check (status in ('caka','v_teku','koncano','napaka'))
);

-- Ista celica, ki se spremeni petkrat pred objavo, ne potrebuje petih
-- zapisov v Sheets - pomembno je zadnje stanje. Delni unikatni indeks
-- poskrbi, da za (povezava, oseba, dan) čaka kvečjemu ena vrstica.
create unique index if not exists sheet_sync_izhod_caka_uniq
  on public.sheet_sync_izhod (povezava_id, employee_id, work_date)
  where status = 'caka';

create index if not exists sheet_sync_izhod_status_idx
  on public.sheet_sync_izhod (status, ustvarjeno);

comment on table public.sheet_sync_izhod is
  'Vrsta celic, ki čakajo na zapis v Google Sheets. Polni jo sprožilec na razporedu, prazni Edge Function "sheets-izhod".';

-- 2) Napake, ki se NE popravijo same ------------------------------------
-- Nič se ne zavrže tiho: kar ni mogoče enolično razbrati, pristane tu in
-- ostane vidno, dokler tega nekdo ne uredi. Isto načelo kot poročilo
-- "Brez ujemanja imena" po uvozu.
create table if not exists public.sync_errors (
  id              bigserial primary key,
  smer            text not null,               -- 'app_v_sheets' | 'sheets_v_app'
  vrsta           text not null,               -- 'neznano_ime','dvoumno_ime','neznana_koda',
                                               -- 'brez_datuma','nepovezan_zavihek',
                                               -- 'brez_stolpca','brez_vrstice','api'
  povezava_id     uuid references public.sheet_connections(id) on delete set null,
  spreadsheet_id  text,
  zavihek         text,
  work_date       date,
  podrobnosti     text,
  resen           boolean not null default false,
  ustvarjeno      timestamptz not null default now(),
  constraint sync_errors_smer_check check (smer in ('app_v_sheets','sheets_v_app'))
);

create index if not exists sync_errors_nereseni_idx
  on public.sync_errors (resen, ustvarjeno desc);

comment on table public.sync_errors is
  'Kar sinhronizacije ni bilo mogoče enolično razbrati. Nič se ne popravi samodejno in nič se ne zavrže tiho.';

-- 3) Kdo sme kaj ---------------------------------------------------------
-- Bere administrator, piše samo service_role (Edge Functions). Politike
-- veljajo za vlogo "authenticated"; service_role gre mimo RLS.
alter table public.sheet_sync_izhod enable row level security;
alter table public.sync_errors      enable row level security;

drop policy if exists sheet_sync_izhod_admin_read on public.sheet_sync_izhod;
create policy sheet_sync_izhod_admin_read on public.sheet_sync_izhod
  for select to authenticated using (public.current_role_is('admin'));

drop policy if exists sync_errors_admin_read on public.sync_errors;
create policy sync_errors_admin_read on public.sync_errors
  for select to authenticated using (public.current_role_is('admin'));

-- Administrator sme napako označiti za rešeno - to je edino pisanje, ki ga
-- potrebuje aplikacija.
drop policy if exists sync_errors_admin_resi on public.sync_errors;
create policy sync_errors_admin_resi on public.sync_errors
  for update to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- 4) Sprožilec, ki polni vrsto ------------------------------------------
-- Vrsta se polni SAMO za oddelke, ki so v sheet_connections, so aktivni in
-- imajo vklopljeno smer app_v_sheets. Za nepovezane oddelke se ne zgodi nič
-- - tudi ko je sinhronizacija ugasnjena, razpored deluje kot doslej.
create or replace function public.sheet_sync_ob_spremembi() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
as $$
declare
  v_dept text;
  v_koda text;
  v_datum date;
  v_oseba uuid;
  r record;
begin
  if TG_OP = 'DELETE' then
    v_dept := old.department_code; v_koda := null;
    v_datum := old.work_date;      v_oseba := old.employee_id;
  else
    -- Brez dejanske spremembe ni kaj pošiljati. To je hkrati polovica
    -- zaščite pred neskončno zanko: kar pride iz Sheetsa in je enako
    -- obstoječemu, ne sproži UPDATE, torej se vrsta ne napolni.
    if TG_OP = 'UPDATE'
       and old.shift_code is not distinct from new.shift_code
       and old.department_code is not distinct from new.department_code
       -- Pri FLEXI se lahko spremeni SAMO pokriti oddelek (ista izmena,
       -- drug oddelek). Brez tega pogoja taka sprememba ne bi prišla v
       -- vrsto in bi list ostal pri starem oddelku.
       and old.pokriva_oddelek is not distinct from new.pokriva_oddelek then
      return new;
    end if;
    v_dept := new.department_code; v_koda := new.shift_code;
    v_datum := new.work_date;      v_oseba := new.employee_id;
  end if;

  -- Sprememba, ki jo je PRINESEL Sheets, se vanj ne vrača. Druga polovica
  -- zaščite pred zanko - razlog vpiše Edge Function "sheets-vhod".
  if TG_OP <> 'DELETE' and new.razlog = 'sheets' then
    return new;
  end if;

  for r in
    select id from public.sheet_connections
     where skupina = v_dept and aktivno and app_v_sheets
  loop
    insert into public.sheet_sync_izhod (povezava_id, employee_id, work_date, shift_code)
    values (r.id, v_oseba, v_datum, v_koda)
    on conflict (povezava_id, employee_id, work_date) where status = 'caka'
      do update set shift_code = excluded.shift_code, ustvarjeno = now();
  end loop;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists sheet_sync_izhod_trg on public.razpored;
create trigger sheet_sync_izhod_trg
  after insert or update or delete on public.razpored
  for each row execute function public.sheet_sync_ob_spremembi();


-- 5) Prevzem vrstic iz vrste ---------------------------------------------
-- Edge Function ne sme sama počistiti vrste s tremi ločenimi poizvedbami:
-- dva hkratna zagona bi isto vrstico vzela dvakrat. "for update skip
-- locked" poskrbi, da vsak zagon dobi svoj kos in da se zagona ne čakata.
--
-- Poleg čakajočih vrstic prevzame tudi tiste, ki so PADLE in še niso
-- izčrpale petih poskusov - z naraščajočim zamikom (1, 2, 4, 8, 16 minut),
-- da se ob izpadu Google API ne trka vanj vsako minuto.
create or replace function public.sheet_sync_prevzemi(p_najvec int default 500)
    RETURNS setof public.sheet_sync_izhod
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
as $$
begin
  return query
  update public.sheet_sync_izhod v
     set status = 'v_teku'
   where v.id in (
     select z.id from public.sheet_sync_izhod z
      where z.status = 'caka'
         or (z.status = 'napaka' and z.poskusi < 5
             and z.obdelano < now() - (interval '1 minute' * power(2, z.poskusi)))
      order by z.ustvarjeno
      limit greatest(1, coalesce(p_najvec, 500))
      for update skip locked
   )
  returning v.*;
end;
$$;

-- Vrsto prevzema samo service_role (Edge Function), nihče iz brskalnika.
-- Privzeto pravico do zagona ima PUBLIC; ko jo odvzamemo, jo izgubi tudi
-- service_role, zato mu jo je treba izrecno vrniti - sicer robna funkcija
-- dobi "permission denied for function" in vrsta se nikoli ne izprazni.
revoke all on function public.sheet_sync_prevzemi(int) from public;
revoke all on function public.sheet_sync_prevzemi(int) from anon;
revoke all on function public.sheet_sync_prevzemi(int) from authenticated;
grant execute on function public.sheet_sync_prevzemi(int) to service_role;

-- 6) Preverjanje ---------------------------------------------------------
-- select status, count(*) from public.sheet_sync_izhod group by status;
-- select vrsta, count(*) from public.sync_errors where not resen group by vrsta;
