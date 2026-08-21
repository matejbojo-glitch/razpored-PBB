-- ---------------------------------------------------------------------
-- Matična številka za vodje/nosilce enot (lead_departments)
--
-- ZAKAJ: lead_departments ima za primarni ključ IME ("ALUKIĆ DINO"), v
-- profiles pa so imena zapisana kot "Priimek Ime" ("Alukić Dino" – tako
-- jih je poenotil imena-priimek-prvi.sql, ki popravi SAMO profiles).
-- Aplikacija je zato osebo iz razporeda NZV iskala v profiles po
-- dobesednem imenu in je ni našla: razpored se je "objavil" z nič zapisi,
-- vsi pa so bili poročani kot "brez profila".
--
-- Aplikacija to od zdaj naprej prenese sama (išče prek skupnega kazala:
-- matična številka, ime kot rezerva in ne dobesedno). Ta skripta je
-- naslednji korak: v lead_departments doda matično številko, da postane
-- povezava med tabelama stabilna tudi takrat, ko se ime kje spremeni
-- (poroka, popravek zapisa, dvobesedni priimek).
--
-- VARNO ZA PONOVNI ZAGON: stolpec se doda samo, če ga še ni, številke pa
-- se prepišejo iz profile_hr_details in NE povozijo že vpisanih.
-- ---------------------------------------------------------------------

alter table public.lead_departments
  add column if not exists employee_code text;

-- Prepis iz profilov. Ujemanje imena je tu namenoma ohlapno (velike/male
-- črke in strešice se izenačijo), ker se prav v tem tabeli razhajata.
-- unaccent ni povsod nameščen, zato se strešice zamenjajo ročno.
update public.lead_departments l
set employee_code = h.employee_code
from public.profiles p
join public.profile_hr_details h on h.profile_id = p.id
where l.employee_code is null
  and h.employee_code is not null
  and translate(upper(l.full_name), 'ČŠŽĆĐ', 'CSZCD')
      = translate(upper(p.full_name), 'ČŠŽĆĐ', 'CSZCD');

-- Pregled: kdo je ostal brez matične številke (te je treba dopolniti
-- ročno v Imeniku -> odpri osebo -> HR kartica, ali pa oseba res še nima
-- računa v aplikaciji).
select full_name, department_code, employee_code
  from public.lead_departments
 where employee_code is null
 order by full_name;
