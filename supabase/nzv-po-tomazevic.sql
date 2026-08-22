-- ---------------------------------------------------------------------
-- PO: nosilka je Tomaževič Simona
--
-- OPOMBA: če poženeš nzv-nosilci-oddelkov.sql, tega NE potrebuješ —
-- tam je Tomaževič že vpisana z enotama "A/PO". Ta datoteka je manjši
-- popravek za primer, ko so nosilci že vneseni in manjka samo PO.
--
-- Stolpec "PO" v NZV mreži je bil edini brez nosilca, zato je ostajal
-- prazen čez cel mesec. Uporabnikova navedba (avgust 2026): enoto PO
-- pokriva Tomaževič Simona, ki je že nosilka enote A.
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
-- Priimek se v virih pojavlja z DVEMA strešicama ("Tomaževič" in
-- "Tomažević") - to je znana, potrjena tipkarska napaka v uradnih
-- predlogah (glej PSEVDONIM v imena.js). Zato tu ne primerjamo
-- dobesedno: tak zapis bi ob drugi strešici tiho popravil NIČ vrstic in
-- videti bi bilo, kot da je vse v redu.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------

update public.lead_departments
   set enote = 'A/PO'
 where translate(upper(full_name), 'Ć', 'Č') like 'TOMAŽEVIČ%'
   and coalesce(enote, '') <> 'A/PO';

-- Preverba: mora vrniti vrstico z enote = 'A/PO'.
-- Če vrne 0 vrstic, osebe v tabeli NI - takrat poženi nzv-nosilci-oddelkov.sql.
select full_name, department_code, enote, nadomesca,
       case when enote = 'A/PO' then 'OK' else 'NAPAKA: enote niso A/PO' end as stanje
  from public.lead_departments
 where translate(upper(full_name), 'Ć', 'Č') like 'TOMAŽEVIČ%';
