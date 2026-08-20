-- ---------------------------------------------------------------------
-- Nadomeščanje POLEG svoje enote (Alukić / Bojić / Džamastagić)
--
-- Uporabnikovo pravilo, avgust 2026, dobesedno:
--
--   "Ko Alukić ni, je Bojić na MO + ŽO; če Bojić ni, je Alukić ŽO + MO;
--    če ni obeh, je Džamastagić."
--
-- Do zdaj je aplikacija poznala samo eno vrsto nadomeščanja - PRESELITEV:
-- nadomeščevalec svojo enoto zapusti in gre na enoto odsotnega, njegovo
-- staro enoto pa prevzame naslednji v verigi. To je pravilno za Salkić /
-- Arnež / Lunar (uporabnikov lastni primer v nzv-lastne-enote.sql):
--
--   Salkić (C1) odsotna  ->  Arnež gre s C na C1  ->  Lunar ima B in C
--
-- Za trojico vodstvenih enot pa ni: tam nadomeščevalec svoje enote NE
-- zapusti, ampak pokriva OBE. Posledica je pomembna in ne le kozmetična -
-- ker Bojić svojega MO ne odda, Džamastagić ostane na svojem PDZN in
-- pride na vrsto šele, ko ni NOBENEGA od obeh. Prej ga je aplikacija
-- vsakič potegnila na MO.
--
-- Zato stolpec in ne nova tabela: obe vrsti sta isto razmerje
-- (kdo koga pokrije), razlikuje se samo, ali svojo enoto obdrži.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
alter table public.nadomescanja
  add column if not exists poleg_svoje boolean not null default false;

comment on column public.nadomescanja.poleg_svoje is
  'true = nadomeščevalec obdrži svojo enoto in pokrije še enoto odsotnega '
  '(Bojić: MO + ŽO). false = preseli se na enoto odsotnega, svojo odda '
  'naslednjemu v verigi (Arnež: s C na C1, C prevzame Lunar).';

-- Trojica vodstvenih enot: vsi trije se pokrivajo POLEG svoje enote.
-- Vključena je tudi smer za Džamastagića - uporabnik je izrecno opisal
-- samo prvi dve, tretja je zapisana enako, ker gre za isto vzajemno
-- razmerje treh enakovrednih nosilcev. Če za Džamastagića velja kaj
-- drugega, se spodaj pobriše njegovi dve vrstici.
update public.nadomescanja
   set poleg_svoje = true
 where (nosilec, nadomesca) in (
   ('ALUKIĆ DINO',       'BOJIĆ MATEJ'),
   ('ALUKIĆ DINO',       'DŽAMASTAGIĆ DENIS'),
   ('BOJIĆ MATEJ',       'ALUKIĆ DINO'),
   ('BOJIĆ MATEJ',       'DŽAMASTAGIĆ DENIS'),
   ('DŽAMASTAGIĆ DENIS', 'ALUKIĆ DINO'),
   ('DŽAMASTAGIĆ DENIS', 'BOJIĆ MATEJ')
 );

-- Kontrola: katera vrsta velja za koga.
select nosilec as "odsoten",
       nadomesca as "pokrije",
       enota as "katero enoto",
       prednost as "vrstni red",
       case when poleg_svoje then 'poleg svoje (obdrži svojo)'
            else 'preselitev (svojo odda naprej)' end as "vrsta"
from public.nadomescanja
order by nosilec, prednost;
