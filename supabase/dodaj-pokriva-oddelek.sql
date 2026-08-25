-- ---------------------------------------------------------------------
-- FLEXI razpored: da se uvoz zavihka FLEXI sploh shrani
--
-- Kaj naredi: doda stolpec, v katerega se zapiše, KATERI ODDELEK oseba
-- tisti dan pokriva (npr. "C/E2"). Brez njega uvoz zavihka FLEXI vse
-- vrstice s kombinirano oznako preskoči in razpored FLEXI ostane prazen.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse spodaj -> Run.
-- Pognati je varno tudi večkrat.
--
-- Isto vsebino ima supabase/schema.sql, razdelek 34 - če poženeš celotno
-- shemo, tega ni treba posebej.
-- ---------------------------------------------------------------------
alter table public.razpored add column if not exists pokriva_oddelek text;

-- Kontrola: stolpec mora obstajati.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'razpored' and column_name = 'pokriva_oddelek';
