-- ---------------------------------------------------------------------
-- Počisti podvojene vrstice s pokvarjenim zapisom imena
--
-- V Imenik -> Razpredelnica -> Pregled nadomeščanj se poleg pravilnih
-- vrstic prikazujejo še podvojene s pokvarjenimi imeni:
--
--   ALUKIÄ† DINO        namesto  ALUKIĆ DINO
--   Å UBIC PETRA        namesto  ŠUBIC PETRA
--   ARNEÅ½ GREGA        namesto  ARNEŽ GREGA
--   DÅ½AMASTAGIÄ† DENIS namesto  DŽAMASTAGIĆ DENIS
--   HUMAR SAÅ A         namesto  HUMAR SAŠA
--
-- To je znana napaka pri kodiranju: besedilo v UTF-8 je bilo prebrano kot
-- Latin-1, zato je vsak znak s strešico razpadel na dva ("Ć" -> "Ä†",
-- "Š" -> "Å ", "Ž" -> "Å½"). Nastalo je ob nekem prejšnjem vnosu, kjer se
-- je besedilo med potjo prekodiralo.
--
-- Take vrstice nimajo enot in se ne povežejo z nobeno osebo, zato so v
-- pregledu videti kot prazne ("- ni zapisano -"). Tu se izbrišejo.
--
-- Prepoznamo jih po znakih Ä, Å in Â, ki se v pravilnih zapisih NE
-- pojavijo: preverjeno na vseh 20 nosilcih (slovenska imena uporabljajo
-- Č, Ć, Š, Ž, Đ - nobenega od teh treh).
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------

-- Najprej POGLEJ, kaj bo izbrisano (ta poizvedba ničesar ne spremeni).
select 'nosilci_oddelkov' as tabela, full_name as vrednost
  from public.nosilci_oddelkov
 where full_name ~ '[ÄÅÂ]'
union all
select 'nadomescanja (nosilec)', nosilec
  from public.nadomescanja
 where nosilec ~ '[ÄÅÂ]'
union all
select 'nadomescanja (nadomesca)', nadomesca
  from public.nadomescanja
 where nadomesca ~ '[ÄÅÂ]'
order by 1, 2;

-- Šele nato izbriši.
delete from public.nadomescanja
 where nosilec ~ '[ÄÅÂ]' or nadomesca ~ '[ÄÅÂ]';

delete from public.nosilci_oddelkov
 where full_name ~ '[ÄÅÂ]';

-- Preverba: spodnja poizvedba mora vrniti 0 vrstic.
select full_name from public.nosilci_oddelkov where full_name ~ '[ÄÅÂ]';
