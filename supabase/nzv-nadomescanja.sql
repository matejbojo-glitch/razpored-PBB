-- ---------------------------------------------------------------------
-- Kdo koga nadomešča ob odsotnosti (LD, BS) - seznam pokrivanj
--
-- Zakaj svoja tabela in ne stolpec: nosilci_oddelkov.nadomesca hrani ENO
-- ime, v resnici pa je pokrivanje vzajemno in večkratno. Trije
-- administratorji se pokrivajo navzkrižno:
--
--   Alukić Dino (ŽO)         nadomeščata Bojić Matej IN Džamastagić Denis
--   Bojić Matej (MO)         nadomeščata Alukić Dino IN Džamastagić Denis
--   Džamastagić Denis (PDZN) nadomeščata Alukić Dino IN Bojić Matej
--   Velušček Metka (SOBO)    nadomeščajo vsi trije (Džamastagić, Alukić, Bojić)
--
-- Nadomešča lahko SAMO EDEN ali OBA - odvisno od tega, kdo je odsoten.
-- Zato par (nosilec, nadomesca) in ne en sam stolpec.
--
-- Vsebina je uporabnikova urejena razpredelnica (Razpored_nadomescanj.xlsx,
-- "PREGLED IN RAZPORED NADOMEŠČANJ"). Tam sta obe smeri zapisani ločeno in
-- si na dveh mestih nasprotujeta - tu je razrešeno tako, da NIČ ne odpade:
--   - Salkić Maruša je pri Arnežu naveden kot "pokrivam", v svoji vrstici
--     pa ima "- ni zapisano -": par je vpisan (Arnež pokriva Salkić, C1);
--   - Maglić ima Perviza izbrisanega iz "pokrivam" (za vejico), Perviz pa
--     ga v svoji vrstici še vedno navaja: par je OHRANJEN, ker bi Perviz
--     sicer ostal brez vsakega nadomeščevalca. Če to ne drži, se izbriše
--     ena vrstica.
--
-- "enota" je enota ODSOTNEGA, ki jo nadomeščevalec prevzame - ne enota
-- nadomeščevalca. Nadomeščevalec se nanjo PRESELI: svojo enoto tisti dan
-- zapusti, prevzame pa jo naslednji v verigi, in to POLEG svoje
-- (uporabnikovo pravilo, glej supabase/nzv-lastne-enote.sql):
--
--   Salkić (C1) odsotna -> Arnež se preseli na C1 -> Lunar ima B in C
--
-- Pogačnik Teja NAMENOMA ostaja brez nadomeščevalca (uporabnikova izrecna
-- odločitev), čeprav je na porodniški do julija 2027.
--
-- "prednost" pove vrstni red: 1 = prvi na vrsti, 2 = če je tudi prvi
-- odsoten. Tako se ohrani zapis iz uradne predloge ("nadomeščanje Dino
-- Alukić, v primeru odsotnostih obeh Matej Bojić").
--
-- Iz te ene tabele se bereta OBE smeri:
--   - "kdo nadomešča mene"  -> vrstice, kjer sem jaz nosilec;
--   - "koga jaz pokrivam"   -> vrstice, kjer sem jaz nadomesca.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
create table if not exists public.nadomescanja (
  nosilec text not null,          -- kdo je odsoten (čigav oddelek je treba pokriti)
  nadomesca text not null,        -- kdo ga pokrije
  enota text,                     -- katero enoto s tem pokrije (prosto besedilo, glej nosilci_oddelkov.enote)
  prednost smallint not null default 1,
  primary key (nosilec, nadomesca)
);
alter table public.nadomescanja enable row level security;
drop policy if exists nadomescanja_select on public.nadomescanja;
create policy nadomescanja_select on public.nadomescanja
  for select to authenticated using (true);
drop policy if exists nadomescanja_write on public.nadomescanja;
create policy nadomescanja_write on public.nadomescanja
  for all to authenticated
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

insert into public.nadomescanja (nosilec, nadomesca, enota, prednost) values
  ('ALUKIĆ DINO',             'BOJIĆ MATEJ',             'ŽO',          1),
  ('ALUKIĆ DINO',             'DŽAMASTAGIĆ DENIS',       'ŽO',          2),
  ('ARNEŽ GREGA',             'LUNAR MATEJA',            'C',           1),
  -- Bizjak, Trpin in Mušič (vse tri UA/SA) se kombinirajo med seboj -
  -- uporabnikova izrecna navedba. Trpin je že spodaj; tu sta dopolnjeni
  -- še preostali dve smeri, da nobena od treh ne ostane brez kritja.
  ('BIZJAK TEA',              'TRPIN SAŠA',              'UA/SA/B2',    1),
  ('BIZJAK TEA',              'MUŠIČ INES',              'UA/SA/B2',    2),
  ('BOJIĆ MATEJ',             'ALUKIĆ DINO',             'MO',          1),
  ('BOJIĆ MATEJ',             'DŽAMASTAGIĆ DENIS',       'MO',          2),
  ('DŽAMASTAGIĆ DENIS',       'ALUKIĆ DINO',             'PDZN',        1),
  ('DŽAMASTAGIĆ DENIS',       'BOJIĆ MATEJ',             'PDZN',        2),
  ('HROVAT NINA',             'TORKAR TANJA',            'DB',          1),
  ('HUMAR SAŠA',              'BIZJAK TEA',              'SA',          1),
  ('HUMAR SAŠA',              'TRPIN SAŠA',              'SA',          2),
  ('LELIČ DIJANA',            'MAGLIĆ ALEKSANDER',       'E2',          1),
  ('LUNAR MATEJA',            'ARNEŽ GREGA',             'B',           1),
  ('MAGLIĆ ALEKSANDER',       'LELIČ DIJANA',            'E1',          1),
  ('MAVRI TRATNIK MAGDALENA', 'ŠUBIC PETRA',             'B1',          1),
  ('MUŠIČ INES',              'BIZJAK TEA',              'UA/SA',       1),
  ('MUŠIČ INES',              'TRPIN SAŠA',              'UA/SA',       2),
  ('PERVIZ AMAL',             'MAGLIĆ ALEKSANDER',       'D',           1),
  ('SALKIĆ MARUŠA',           'ARNEŽ GREGA',             'C1',          1),
  ('TOMAŽEVIČ SIMONA',        'VELUŠČEK METKA',          'A',           1),
  ('TORKAR TANJA',            'HROVAT NINA',             'DB',          1),
  ('TRPIN SAŠA',              'BIZJAK TEA',              'UA/SA',       1),
  ('TRPIN SAŠA',              'MUŠIČ INES',              'UA/SA',       2),
  ('VELUŠČEK METKA',          'DŽAMASTAGIĆ DENIS',       'SOBO',        1),
  ('VELUŠČEK METKA',          'ALUKIĆ DINO',             'SOBO',        2),
  ('VELUŠČEK METKA',          'BOJIĆ MATEJ',             'SOBO',        3),
  ('ŠUBIC PETRA',             'MAVRI TRATNIK MAGDALENA', 'B1',          1)
on conflict (nosilec, nadomesca) do update set
  enota = excluded.enota,
  prednost = excluded.prednost;

-- Kontrola 1: koga kdo pokriva (smer "jaz nadomeščam druge").
select nadomesca as "kdo pokriva",
       string_agg(nosilec || ' (' || coalesce(enota, '?') || ')', ', ' order by prednost, nosilec) as "koga / katero enoto"
from public.nadomescanja
group by nadomesca
order by nadomesca;

-- Kontrola 2: kdo nadomešča mene (smer, kot je zapisana v predlogi).
select nosilec as "odsoten",
       string_agg(nadomesca, ' -> ' order by prednost) as "nadomeščajo (po vrsti)"
from public.nadomescanja
group by nosilec
order by nosilec;
