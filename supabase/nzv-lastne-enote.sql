-- ---------------------------------------------------------------------
-- NZV: "enote" naj vsebujejo SAMO lastno enoto nosilca
--
-- Uporabnikovo pravilo (avgust 2026), povedano na primeru:
--
--   Salkić (C1) je odsotna  ->  Arnež se PRESELI na C1 (na svojem C ga ni)
--                           ->  Lunar poleg svojega B pokrije še C
--
-- Iz tega sledi, da prevzeta enota NE sodi v stolpec "enote". Tam je
-- doslej pisalo "C/C1" za Arneža, kar je pomenilo, da je na obeh enotah
-- VSAK dan - tudi kadar je Salkić prisotna in C1 pokriva sama. Prevzem
-- je zapisan v tabeli nadomescanja in se uporabi samo ob odsotnosti.
--
-- Kaj se popravi:
--   ARNEŽ GREGA        "C/C1"        -> "C"    (C1 je Salkićin)
--   MAGLIĆ ALEKSANDER  "E1/D"        -> "E1"   (D je Pervizov)
--   LELIČ DIJANA       "E2/E1"       -> "E2"   (E1 je Maglićev)
--   MAVRI TRATNIK M.   "B1/SOB/NOB"  -> "B1"   (glej spodaj)
--   ŠUBIC PETRA        "B1/SOB/NOB"  -> "B1"
--
-- "SOB" in "NOB" nista enoti (uporabnikova potrditev) - zaradi njiju sta
-- se Mavri Tratnik in Šubic prikazovala v stolpcu SOBO, kjer nimata kaj
-- iskati; nosilka SOBO je Velušček Metka.
--
-- NE spreminjamo:
--   TOMAŽEVIČ SIMONA "A/PO"   - res pokriva obe enoti (uporabnikova navedba)
--   BIZJAK / MUŠIČ / TRPIN "UA/SA…" - vse tri res delajo v UA in SA
--
-- Popravimo tudi dve vrstici v nadomescanja, kjer je bila v stolpcu
-- "enota" zapisana enota NADOMEŠČEVALCA namesto enote ODSOTNEGA:
--   Lelič odsotna -> Maglić prevzame "E2/E1"  ->  pravilno "E2"
--   Mavri/Šubic   -> "B1/SOB/NOB"             ->  pravilno "B1"
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------

update public.nosilci_oddelkov set enote = 'C'  where full_name = 'ARNEŽ GREGA'        and enote <> 'C';
update public.nosilci_oddelkov set enote = 'E1' where full_name = 'MAGLIĆ ALEKSANDER'  and enote <> 'E1';
update public.nosilci_oddelkov set enote = 'E2' where full_name = 'LELIČ DIJANA'       and enote <> 'E2';
update public.nosilci_oddelkov set enote = 'B1' where full_name in ('MAVRI TRATNIK MAGDALENA', 'ŠUBIC PETRA') and enote <> 'B1';

update public.nadomescanja set enota = 'E2'
 where nosilec = 'LELIČ DIJANA' and nadomesca = 'MAGLIĆ ALEKSANDER';

update public.nadomescanja set enota = 'B1'
 where nosilec in ('MAVRI TRATNIK MAGDALENA', 'ŠUBIC PETRA');

-- Preverba: stolpec "enote" naj ne vsebuje več oznak SOB/NOB, prevzete
-- enote pa naj bodo samo v tabeli nadomescanja.
select full_name, department_code, enote
  from public.nosilci_oddelkov
 where enote is not null
 order by full_name;
