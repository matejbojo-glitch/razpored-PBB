-- ---------------------------------------------------------------------
-- PREIMENOVANJE TABEL V SLOVENSKA IMENA (avgust 2026)
--
-- ZAŽENI TO PRVO, PRED schema.sql, na OBSTOJEČI bazi.
--
-- Zakaj je to nujno: schema.sql ustvarja tabele s "create table if not
-- exists". Na bazi, kjer podatki že živijo pod starimi (angleškimi) imeni,
-- bi to ustvarilo 25 PRAZNIH novih tabel poleg starih - aplikacija bi
-- kazala prazen razpored, podatki pa bi tiho obtičali v starih tabelah.
-- Ta skripta zato tabele PREIMENUJE (alter table ... rename to), kar
-- podatke, indekse, tuje ključe in RLS politike ohrani.
--
-- Varno je pognati večkrat: vsako preimenovanje se izvede samo, če stara
-- tabela še obstaja IN nova še ne. Na povsem novi bazi ne naredi nič
-- (in je ni treba poganjati - dovolj je schema.sql).
--
-- Po tej skripti poženi še supabase/schema.sql.
-- ---------------------------------------------------------------------

do $$
declare
  par record;
begin
  for par in
    select * from (values
      -- (staro ime, novo ime)
      ('departments',               'oddelki'),
      ('profiles',                  'profili'),
      ('profile_departments',       'pokriva_oddelek'),
      ('schedule_entries',          'razpored'),
      ('swap_requests',             'zahtevki_za_menjavo'),
      -- revizijske sledi / dnevniki
      ('schedule_entries_log',      'dnevnik_razporeda'),
      ('leave_entries_log',         'dnevnik_odsotnosti'),
      ('profiles_log',              'dnevnik_profilov'),
      ('admin_view_as_log',         'dnevnik_ogledov'),
      -- ostale tabele
      ('absence_color_map',         'barvne_oznake'),
      ('calendar_tokens',           'koledarski_zetoni'),
      ('contact_imports',           'uvozi_kontaktov'),
      ('contact_phones',            'telefoni_kontaktov'),
      ('department_shift_minimums', 'minimalna_zasedba'),
      ('duty_doctors',              'dezurni_zdravniki'),
      ('employee_wishes',           'zelje_zaposlenih'),
      ('lead_departments',          'nosilci_oddelkov'),
      ('leave_balance_history',     'zgodovina_stanja_dopusta'),
      ('leave_entries',             'odsotnosti'),
      ('notification_settings',     'nastavitve_obvestil'),
      ('notifications',             'obvestila'),
      ('profile_hr_details',        'kadrovski_podatki'),
      ('push_subscriptions',        'potisne_narocnine')
    ) as t(staro, novo)
  loop
    if to_regclass('public.' || par.staro) is not null
       and to_regclass('public.' || par.novo) is null then
      execute format('alter table public.%I rename to %I', par.staro, par.novo);
      raise notice 'preimenovano: % -> %', par.staro, par.novo;
    end if;
  end loop;
end $$;

-- Pogledi se ne preimenujejo, ampak odstranijo - schema.sql jih ustvari na
-- novo z novimi imeni in nad preimenovanimi tabelami. (Pogled, ki še kaže
-- na staro ime, bi ob preimenovanju tabele samodejno sledil, a bi obdržal
-- staro ime - zato raje čisto na novo.)
drop view if exists public.contact_imports_public cascade;
drop view if exists public.leave_balance_obdobja cascade;
drop view if exists public.leave_balance_pregled cascade;

-- Kontrola: izpiše, katere tabele zdaj obstajajo. Po uspešnem zagonu tu ne
-- sme biti nobenega starega (angleškega) imena s seznama zgoraj.
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
