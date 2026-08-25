-- ---------------------------------------------------------------------
-- Podvojena Lelič Dijana v nosilci_oddelkov
--
-- V razpredelnici se je pojavila dvakrat: enkrat kot "LELIĆ DIJANA" (s
-- Ć in BREZ enote) in enkrat kot "LELIČ DIJANA" (s Č in z enoto E2).
-- Pravilen je zapis s Č in z enoto - tako je v uradni predlogi NZV in
-- tako je povezan tudi z nadomeščanji (Maglić).
--
-- Zakaj je do tega prišlo: nosilci_oddelkov ima za primarni ključ IME,
-- zato sta dva različna zapisa istega imena dve različni vrstici. Ravno
-- to je razlog, da se je matična številka dodala tudi tja (glej
-- supabase/nzv-maticne-stevilke-vodij.sql).
--
-- VARNO ZA PONOVNI ZAGON: briše samo vrstico BREZ enot, in samo če
-- pravilna (z enoto) obstaja - da se ob pomoti ne izbriše zadnji zapis.
-- ---------------------------------------------------------------------

-- 1) Pregled pred brisanjem: kateri zapisi imena obstajajo.
select full_name, department_code, enote, employee_code
  from public.nosilci_oddelkov
 where translate(upper(full_name), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%'
 order by full_name;

-- 2) Nadomeščanja, ki bi po brisanju ostala brez para (mora biti prazno).
select * from public.nadomescanja
 where translate(upper(nosilec), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%'
    or translate(upper(nadomesca), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%';

-- 3) Brisanje odvečne vrstice.
delete from public.nosilci_oddelkov l
 where translate(upper(l.full_name), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%'
   and coalesce(l.enote, '') = ''
   and exists (
     select 1 from public.nosilci_oddelkov d
      where translate(upper(d.full_name), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%'
        and coalesce(d.enote, '') <> ''
   );

-- 4) Preveri: ostati mora ENA vrstica, z enoto E2.
select full_name, department_code, enote
  from public.nosilci_oddelkov
 where translate(upper(full_name), 'ČŠŽĆĐ', 'CSZCD') like 'LELIC%';
