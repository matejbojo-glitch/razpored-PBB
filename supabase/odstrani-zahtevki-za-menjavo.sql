-- ---------------------------------------------------------------------
-- Odstranitev opuščene tabele zahtevki_za_menjavo (nekdanja swap_requests)
--
-- POZOR: IZBRIS JE DOKONČEN. Podatkov v zahtevki_za_menjavo in vsebine
-- stolpca obvestila.swap_request_id po zagonu ni mogoče povrniti.
-- Pred zagonom naredi varnostno kopijo (Supabase → Database → Backups).
--
-- Zakaj: menjave tečejo prek obrazci z vrsta = 'menjava_sluzbe'
-- (caka_sodelavca → caka_vodjo → caka_koordinatorja → zakljucen).
-- Stran menjave.html je bila ukinjena in združena v obrazec.html
-- (sw.js, v14), zato tabela, njene funkcije, sprožilec in politika od
-- takrat niso več v uporabi - preveril sem, da jih nobena datoteka v
-- projektu (js, html, mjs, Edge funkcije) ne kliče.
--
-- Ta datoteka je NAMENOMA ločena od schema.sql: schema.sql se poganja
-- večkrat in ne sme brisati podatkov. Iz schema.sql so ti objekti že
-- odstranjeni, zato sam zagon sheme tabele v obstoječi bazi NE odstrani -
-- to naredi šele ta skripta.
--
-- Kako pognati: Supabase → SQL Editor → prilepi vse spodaj → Run.
-- Zagon je varen tudi večkrat (vse je "if exists").
-- ---------------------------------------------------------------------

-- 1. Kaj bo izbrisano - izpis pred posegom
do $$
declare
  v_zahtevkov bigint := 0;
  v_obvestil bigint := 0;
begin
  if to_regclass('public.zahtevki_za_menjavo') is null then
    raise notice 'Tabela zahtevki_za_menjavo ne obstaja - ni kaj odstraniti.';
    return;
  end if;

  execute 'select count(*) from public.zahtevki_za_menjavo' into v_zahtevkov;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.obvestila'::regclass
      and attname = 'swap_request_id' and not attisdropped
  ) then
    execute 'select count(*) from public.obvestila where swap_request_id is not null'
      into v_obvestil;
  end if;

  raise notice 'Za izbris: % zahtevkov za menjavo, % obvestil s povezavo nanje.',
    v_zahtevkov, v_obvestil;
end $$;

-- 2. Sprožilec in funkcije
drop trigger if exists on_swap_status_change on public.zahtevki_za_menjavo;

drop function if exists public.notify_swap_status_change();
drop function if exists public.submit_swap_request(uuid, date, date, text);
drop function if exists public.decide_swap_lead(bigint, boolean, text);
drop function if exists public.decide_swap_admin(bigint, boolean, text);

-- 3. Politika RLS (odpade skupaj s tabelo, a naj bo izrecno)
drop policy if exists swap_select on public.zahtevki_za_menjavo;

-- 4. Povezava iz obvestil (tuji ključ + stolpec)
alter table public.obvestila drop constraint if exists obvestila_swap_request_id_fkey;
alter table public.obvestila drop column if exists swap_request_id;

-- 5. Tabela in njeno zaporedje
drop table if exists public.zahtevki_za_menjavo;
drop sequence if exists public.zahtevki_za_menjavo_id_seq;

-- 6. Preverjanje - obe vrednosti morata biti prazni oz. 0
select
  to_regclass('public.zahtevki_za_menjavo') as tabela_se_obstaja,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('notify_swap_status_change', 'submit_swap_request',
                        'decide_swap_lead', 'decide_swap_admin')) as funkcij_ostalo;
