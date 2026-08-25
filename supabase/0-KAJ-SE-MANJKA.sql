-- ---------------------------------------------------------------------
-- KAJ ŠE MANJKA? — poženi TO PRVO
--
-- Ta poizvedba NIČESAR ne spremeni. Samo pogleda stanje baze in izpiše
-- seznam: kaj je urejeno in katero datoteko je treba še pognati.
--
-- Kako: Supabase -> SQL Editor -> prilepi vse -> Run.
--
-- Vsaka točka VEDNO izpiše svojo vrstico. Če je ni mogoče preveriti, to
-- tudi piše - manjkajoča vrstica se ne sme brati kot "vse v redu".
-- ---------------------------------------------------------------------

create temp table if not exists pbb_pregled (zap int, tocka text, stanje text);
truncate pbb_pregled;

do $$
declare
  n int;
  slabi int := 0;
  ima_enote boolean;
begin
  ima_enote := to_regclass('public.nosilci_oddelkov') is not null
    and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'nosilci_oddelkov'
                   and column_name = 'enote');

  -- 1) Enote nosilcev: brez tega Razpredelnica ne ve, kdo je na kateri enoti.
  if to_regclass('public.nosilci_oddelkov') is null then
    insert into pbb_pregled values (1, 'Enote nosilcev', 'NAPAKA: tabele nosilci_oddelkov ni -> poženi schema.sql');
  elsif not ima_enote then
    insert into pbb_pregled values (1, 'Enote nosilcev', 'MANJKA -> poženi nzv-nosilci-oddelkov.sql');
  else
    execute 'select count(*) from public.nosilci_oddelkov where coalesce(enote, '''') <> ''''' into n;
    insert into pbb_pregled values (1, 'Enote nosilcev',
      case when n = 0 then 'PRAZNO -> poženi nzv-nosilci-oddelkov.sql'
           else 'OK (' || n || ' nosilcev ima enoto)' end);
  end if;

  -- 2) Lastne enote (Lelič ima E2, ne "E2/E1").
  if not ima_enote then
    insert into pbb_pregled values (2, 'Lastne enote (brez prevzetih)', 'NI MOGOČE PREVERITI (najprej točka 1)');
  else
    -- Šteti VSE sestavljene enote ne pove nič: štiri so pravilne
    -- (Tomaževič A/PO, Bizjak UA/SA/B2, Mušič in Trpin UA/SA). Zato
    -- gledamo POIMENSKO tiste, ki sestavljene enote NE smejo imeti -
    -- to so pari, kjer je prevzeta enota zmotno pristala med lastnimi.
    execute 'select count(*) from public.nosilci_oddelkov
              where enote like ''%/%''
                and translate(upper(full_name), ''ĆŽŠČ'', ''CZSC'') ~
                    ''^(ARNEZ|MAGLIC|LELIC|MAVRI TRATNIK|SUBIC)''' into n;
    insert into pbb_pregled values (2, 'Lastne enote (brez prevzetih)',
      case when n > 0 then 'POPRAVI (' || n || ' oseb) -> poženi nzv-lastne-enote.sql'
           else 'OK' end);
  end if;

  -- 3) Nadomeščanja: brez tega ni Lelič -> Maglić.
  if to_regclass('public.nadomescanja') is null then
    insert into pbb_pregled values (3, 'Nadomeščanja', 'MANJKA -> poženi nzv-nadomescanja.sql');
  else
    execute 'select count(*) from public.nadomescanja' into n;
    insert into pbb_pregled values (3, 'Nadomeščanja',
      case when n = 0 then 'PRAZNO -> poženi nzv-nadomescanja.sql' else 'OK (' || n || ' parov)' end);
  end if;

  -- 4) Nastavitve SA (tedensko menjavanje dopoldan/popoldan).
  if to_regclass('public.nzv_nastavitve') is null then
    insert into pbb_pregled values (4, 'Nastavitve SA', 'MANJKA -> poženi nzv-nastavitve.sql');
  else
    insert into pbb_pregled values (4, 'Nastavitve SA', 'OK (tabela obstaja)');
  end if;

  -- 5) Pokvarjeni zapisi imen (ALUKIÄ† DINO ipd.).
  if to_regclass('public.nosilci_oddelkov') is null and to_regclass('public.nadomescanja') is null then
    insert into pbb_pregled values (5, 'Pokvarjeni zapisi imen', 'NI MOGOČE PREVERITI (tabel še ni)');
  else
    if to_regclass('public.nosilci_oddelkov') is not null then
      execute 'select count(*) from public.nosilci_oddelkov where full_name ~ ''[ÄÅÂ]''' into n;
      slabi := slabi + n;
    end if;
    if to_regclass('public.nadomescanja') is not null then
      execute 'select count(*) from public.nadomescanja where nosilec ~ ''[ÄÅÂ]'' or nadomesca ~ ''[ÄÅÂ]''' into n;
      slabi := slabi + n;
    end if;
    insert into pbb_pregled values (5, 'Pokvarjeni zapisi imen',
      case when slabi = 0 then 'OK (ni jih)'
           else 'NAJDENIH ' || slabi || ' -> poženi nzv-pocisti-pokvarjena-imena.sql' end);
  end if;

  -- 6) Nosilec enote PO.
  if not ima_enote then
    insert into pbb_pregled values (6, 'Nosilec enote PO (Tomaževič Simona)', 'NI MOGOČE PREVERITI (najprej točka 1)');
  else
    -- Pravilna vrednost je "A/PO" (Tomaževič pokriva A IN PO), zato ne
    -- primerjamo z "PO", ampak iščemo PO MED enotami. Prej je ta točka
    -- javila "MANJKA", tudi kadar je bilo vse pravilno nastavljeno.
    execute 'select count(*) from public.nosilci_oddelkov
              where ''/'' || upper(enote) || ''/'' like ''%/PO/%''
                and translate(upper(full_name), ''Ć'', ''Č'') like ''TOMAŽEVIČ%''' into n;
    insert into pbb_pregled values (6, 'Nosilec enote PO (Tomaževič Simona)',
      case when n = 0 then 'MANJKA -> poženi nzv-po-tomazevic.sql' else 'OK' end);
  end if;

  -- 7) Imena oddelkov - samo kozmetika, nič ne pokvari.
  if to_regclass('public.oddelki') is null then
    insert into pbb_pregled values (7, 'Imena oddelkov (kozmetika)', 'NI MOGOČE PREVERITI (tabele oddelki ni)');
  else
    execute 'select count(*) from public.oddelki where name like ''% - ODDELEK''' into n;
    insert into pbb_pregled values (7, 'Imena oddelkov (kozmetika)',
      case when n = 0 then 'OK' else 'STARI ZAPIS (' || n || ') -> poženi imena-oddelkov-tipografija.sql' end);
  end if;

  -- 8) September: ali so v razporedu ljudje, ki jih je uvoz prej preskočil.
  if to_regclass('public.razpored') is null or to_regclass('public.profili') is null then
    insert into pbb_pregled values (8, 'September: prej preskočeni zaposleni', 'NI MOGOČE PREVERITI (manjka razpored/profili)');
  else
    execute 'select count(distinct p.full_name)
               from public.razpored se
               join public.profili p on p.id = se.employee_id
              where se.work_date between date ''2026-09-01'' and date ''2026-09-30''
                and (upper(p.full_name) like ''BE%IROVI%''
                  or upper(p.full_name) like ''GAZIBARA%''
                  or upper(p.full_name) like ''STARE%''
                  or upper(p.full_name) like ''ROZMAN%'')' into n;
    insert into pbb_pregled values (8, 'September: prej preskočeni zaposleni',
      case when n < 4 then 'NEPOPOLNO (' || n || ' od 4) -> ponovno uvozi september v aplikaciji'
           else 'OK (vsi 4 so v razporedu)' end);
  end if;

  -- 9) Nadomeščanje POLEG svoje enote (Alukić / Bojić / Džamastagić).
  if to_regclass('public.nadomescanja') is null then
    insert into pbb_pregled values (9, 'Nadomeščanje poleg svoje enote', 'NI MOGOČE PREVERITI (tabele nadomescanja ni)');
  elsif not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'nadomescanja'
         and column_name = 'poleg_svoje') then
    insert into pbb_pregled values (9, 'Nadomeščanje poleg svoje enote',
      'MANJKA STOLPEC -> poženi nzv-nadomescanja-poleg-svoje.sql');
  else
    execute 'select count(*) from public.nadomescanja where poleg_svoje' into n;
    insert into pbb_pregled values (9, 'Nadomeščanje poleg svoje enote',
      case when n >= 10 then 'OK (' || n || ' parov)'
           else 'STOLPEC JE, VREDNOSTI NI (' || n || ' od 10) -> poženi nzv-nadomescanja-poleg-svoje.sql' end);
  end if;

  -- 10) pokriva_oddelek: nujen za NZV, kjer je ista oseba isti dan pogosto
  --     na več enotah (Džamastagić PDZN + SOBO + U2). Brez tega stolpca
  --     razpored zmore le eno enoto na osebo in dan.
  if to_regclass('public.razpored') is null then
    insert into pbb_pregled values (10, 'Stolpec pokriva_oddelek', 'NI MOGOČE PREVERITI (tabele razpored ni)');
  elsif not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'razpored'
         and column_name = 'pokriva_oddelek') then
    insert into pbb_pregled values (10, 'Stolpec pokriva_oddelek',
      'MANJKA -> poženi dodaj-pokriva-oddelek.sql (brez njega se pri uvozu NZV izgubijo dodatne enote)');
  else
    insert into pbb_pregled values (10, 'Stolpec pokriva_oddelek', 'OK');
  end if;
end $$;

select zap as "št.", tocka as "kaj", stanje as "stanje / kaj narediti"
  from pbb_pregled order by zap;

-- 11) Matična številka pri vodjih/nosilcih enot (nosilci_oddelkov)
-- Manjka -> poženi supabase/nzv-maticne-stevilke-vodij.sql
select 'nzv-maticne-stevilke-vodij.sql' as skripta,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'nosilci_oddelkov'
            and column_name = 'employee_code'
       ) then 'OK – stolpec obstaja'
       else 'MANJKA – poženi supabase/nzv-maticne-stevilke-vodij.sql' end as stanje;

-- 12) Podvojena Lelič Dijana v nosilci_oddelkov (dva zapisa istega imena)
-- Če vrne "MANJKA" -> poženi supabase/pocisti-podvojeno-lelic.sql
select 'pocisti-podvojeno-lelic.sql' as skripta,
       case when (select count(*) from public.nosilci_oddelkov
                   where translate(upper(full_name), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%') > 1
       then 'MANJKA – Lelič je v tabeli dvakrat, poženi supabase/pocisti-podvojeno-lelic.sql'
       else 'OK – en sam zapis' end as stanje;
