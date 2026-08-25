-- ---------------------------------------------------------------------
-- Poenotenje imen oddelkov (samo prikaz, koda oddelka se NE spremeni)
--
-- Zakaj: ista stvar se je pisala na tri načine —
--   Generator:  "B - ODDELEK"       (vezaj, vse velike črke)
--   Želje:      "B - oddelek (SMS/TZN)"
--   Novejši:    "FLEXI – plavajoče osebje"   (pomišljaj, male črke)
--
-- Po slovenskem pravopisu se med besedama piše pomišljaj (–), ne vezaj
-- (-), občna imena ("oddelek") pa se ne pišejo z velikimi črkami. Vse je
-- torej poenoteno na obliko "B – oddelek".
--
-- Spremeni se SAMO stolpec name (kar vidi uporabnik v spustnih seznamih).
-- Stolpec code je ključ, na katerega so vezani razporedi, in ostane
-- nedotaknjen — zato ta poizvedba ne more pokvariti nobenega razporeda.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------

-- Najprej POGLEJ, kaj se bo spremenilo (ta poizvedba ničesar ne spremeni).
select code,
       name                                  as staro_ime,
       replace(name, ' - ODDELEK', ' – oddelek') as novo_ime
  from public.oddelki
 where name like '% - ODDELEK'
 order by code;

-- Šele nato posodobi.
update public.oddelki
   set name = replace(name, ' - ODDELEK', ' – oddelek')
 where name like '% - ODDELEK';

-- Preverba: spodnja poizvedba mora vrniti 0 vrstic.
select code, name from public.oddelki where name like '% - ODDELEK';

-- In pregled končnega stanja.
select code, name from public.oddelki order by code;
