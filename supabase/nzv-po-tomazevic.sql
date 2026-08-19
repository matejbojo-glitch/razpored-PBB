-- ---------------------------------------------------------------------
-- PO: nosilka je Tomaževič Simona
--
-- Stolpec "PO" v NZV mreži (Razpored -> Po oddelkih -> NZV) je bil edini
-- brez nosilca, zato je ostajal prazen čez cel mesec. Uporabnikova
-- navedba (avgust 2026): enoto PO pokriva Tomaževič Simona, ki je že
-- nosilka enote A.
--
-- Po zagonu se stolpec PO zapolni sam - enako kot A: vsak delovni dan
-- (PON-PET, brez dela prostih praznikov), ob njeni odsotnosti pa jo
-- nadomesti Velušček Metka, ki je zanjo že vpisana v tabeli nadomescanja.
--
-- Zakaj "A/PO" in ne dva zapisa: lead_departments ima eno vrstico na
-- osebo, več enot pa se piše v stolpec "enote" kot prosto besedilo
-- (glej nzv-nosilci-oddelkov.sql). department_code ostane "A" - to je
-- njena primarna enota in nanjo se veže tuji ključ.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
update public.lead_departments
   set enote = 'A/PO'
 where full_name = 'TOMAŽEVIČ SIMONA';

-- Preverba: mora vrniti eno vrstico z enote = 'A/PO'.
select full_name, department_code, enote, nadomesca
  from public.lead_departments
 where full_name = 'TOMAŽEVIČ SIMONA';
