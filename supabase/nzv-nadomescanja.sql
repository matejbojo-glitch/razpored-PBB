-- ---------------------------------------------------------------------
-- Kdo koga nadomešča ob odsotnosti (LD, BS) - seznam pokrivanj
--
-- Zakaj svoja tabela in ne stolpec: lead_departments.nadomesca hrani ENO
-- ime, v resnici pa je pokrivanje vzajemno in večkratno. Trije
-- administratorji se pokrivajo navzkrižno:
--
--   Alukić Dino (ŽO)        nadomeščata Bojić Matej IN Džamastagić Denis
--   Bojić Matej (MO)        nadomeščata Alukić Dino IN Džamastagić Denis
--   Džamastagić Denis (PDZN) nadomeščata Alukić Dino IN Bojić Matej
--   Velušček Metka (SOBO)   nadomešča Džamastagić Denis
--
-- Nadomešča lahko SAMO EDEN ali OBA - odvisno od tega, kdo je odsoten.
-- Zato par (nosilec, nadomesca) in ne en sam stolpec.
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
  enota text,                     -- katero enoto s tem pokrije (prosto besedilo, glej lead_departments.enote)
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
  -- Trije administratorji, navzkrižno (uporabnikov izrecni popravek):
  ('ALUKIĆ DINO',             'BOJIĆ MATEJ',             'ŽO',         1),
  ('ALUKIĆ DINO',             'DŽAMASTAGIĆ DENIS',       'ŽO',         2),
  ('BOJIĆ MATEJ',             'ALUKIĆ DINO',             'MO',         1),
  ('BOJIĆ MATEJ',             'DŽAMASTAGIĆ DENIS',       'MO',         2),
  ('DŽAMASTAGIĆ DENIS',       'ALUKIĆ DINO',             'PDZN',       1),
  ('DŽAMASTAGIĆ DENIS',       'BOJIĆ MATEJ',             'PDZN',       2),
  ('VELUŠČEK METKA',          'DŽAMASTAGIĆ DENIS',       'SOBO',       1),
  -- Preostali, iz uradne predloge (zavihek "Zaposleni - Oddelki"):
  ('ARNEŽ GREGA',             'LUNAR MATEJA',            'C/C1',       1),
  ('HROVAT NINA',             'TORKAR TANJA',            'DB',         1),
  ('HUMAR SAŠA',              'BIZJAK TEA',              'SA',         1),
  ('HUMAR SAŠA',              'TRPIN SAŠA',              'SA',         2),
  ('LELIČ DIJANA',            'MAGLIĆ ALEKSANDER',       'E2/E1',      1),
  ('LUNAR MATEJA',            'ARNEŽ GREGA',             'B',          1),
  ('MAGLIĆ ALEKSANDER',       'LELIČ DIJANA',            'E1/D',       1),
  ('MAVRI TRATNIK MAGDALENA', 'ŠUBIC PETRA',             'B1/SOB/NOB', 1),
  ('PERVIZ AMAL',             'MAGLIĆ ALEKSANDER',       'D',          1),
  ('ŠUBIC PETRA',             'MAVRI TRATNIK MAGDALENA', 'B1/SOB/NOB', 1),
  ('TOMAŽEVIČ SIMONA',        'VELUŠČEK METKA',          'A',          1),
  ('TORKAR TANJA',            'HROVAT NINA',             'DB',         1),
  ('TRPIN SAŠA',              'BIZJAK TEA',              'UA/SA',      1),
  ('TRPIN SAŠA',              'MUŠIČ INES',              'UA/SA',      2)
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
