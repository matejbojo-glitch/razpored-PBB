-- ---------------------------------------------------------------------
-- Matična številka za vodje/nosilce enot (nosilci_oddelkov)
--
-- ZAKAJ: nosilci_oddelkov ima za primarni ključ IME ("ALUKIĆ DINO"), v
-- profili pa so imena zapisana kot "Priimek Ime" ("Alukić Dino" – tako
-- jih je poenotil imena-priimek-prvi.sql, ki popravi SAMO profili).
-- Aplikacija je zato osebo iz razporeda NZV iskala v profili po
-- dobesednem imenu in je ni našla: razpored se je "objavil" z nič zapisi,
-- vsi pa so bili poročani kot "brez profila".
--
-- Aplikacija to od zdaj naprej prenese sama (išče prek skupnega kazala:
-- matična številka, ime kot rezerva in ne dobesedno). Ta skripta je
-- naslednji korak: v nosilci_oddelkov doda matično številko, da postane
-- povezava med tabelama stabilna tudi takrat, ko se ime kje spremeni
-- (poroka, popravek zapisa, dvobesedni priimek).
--
-- VARNO ZA PONOVNI ZAGON: stolpec se doda samo, če ga še ni, številke pa
-- se prepišejo iz kadrovski_podatki in NE povozijo že vpisanih.
-- ---------------------------------------------------------------------

alter table public.nosilci_oddelkov
  add column if not exists employee_code text;

-- Prepis iz profilov. Ujemanje imena je tu namenoma ohlapno (velike/male
-- črke in strešice se izenačijo), ker se prav v tem tabeli razhajata.
-- unaccent ni povsod nameščen, zato se strešice zamenjajo ročno.
update public.nosilci_oddelkov l
set employee_code = h.employee_code
from public.profili p
join public.kadrovski_podatki h on h.profile_id = p.id
where l.employee_code is null
  and h.employee_code is not null
  and translate(upper(l.full_name), 'ČŠŽĆĐ', 'CSZCD')
      = translate(upper(p.full_name), 'ČŠŽĆĐ', 'CSZCD');

-- Pregled: kdo je ostal brez matične številke (te je treba dopolniti
-- ročno v Imeniku -> odpri osebo -> HR kartica, ali pa oseba res še nima
-- računa v aplikaciji).
select full_name, department_code, employee_code
  from public.nosilci_oddelkov
 where employee_code is null
 order by full_name;
