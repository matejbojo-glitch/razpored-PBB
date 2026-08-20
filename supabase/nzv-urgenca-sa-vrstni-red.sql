-- ---------------------------------------------------------------------
-- URGENCA in SA: vrstni red nadomeščanja
--
-- Uporabnikova navedba, avgust 2026, dobesedno:
--
--   "Trpin je prva v urgenci, nato Bizjak"
--   "Humar je prva SA, nadomesti jo Trpin ali Bizjak ... se določi sproti"
--
-- Dvoje je bilo prej narobe:
--
--  1) Pri Mušič (URGENCA/SA) je bila kot prva nadomeščevalka vpisana
--     Bizjak. Ko je Mušič na bolniški, razpored dejansko pokrije Trpin -
--     v septembru 2026 je bilo zaradi tega 10 javljenih odstopanj.
--
--  2) Pri Humar (SA) je bila Bizjak prva, Trpin druga. V resnici sta
--     ENAKOVREDNI in se določi sproti. Zato dobita ISTO prednost: kdor
--     koli od njiju je pravilna rešitev. Aplikacija za predlog še vedno
--     izbere eno (da je predlog določen), pregled odstopanj pa odslej
--     sprejme obe - sicer bi vsak dan javil napako pri tisti, ki tokrat
--     ni bila izbrana (glej razporedDnevaPodrobno v nzv-zasedba.js).
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------

-- 1) URGENCA: Trpin prva, nato Bizjak.
update public.nadomescanja set prednost = 1
 where nosilec = 'MUŠIČ INES' and nadomesca = 'TRPIN SAŠA';
update public.nadomescanja set prednost = 2
 where nosilec = 'MUŠIČ INES' and nadomesca = 'BIZJAK TEA';

-- 2) SA: Humar je nosilka, Trpin in Bizjak sta ENAKOVREDNI (ista prednost).
update public.nadomescanja set prednost = 1
 where nosilec = 'HUMAR SAŠA' and nadomesca in ('TRPIN SAŠA', 'BIZJAK TEA');

-- Kontrola: kdo nadomešča koga in v kakšnem vrstnem redu.
-- Kjer sta dve vrstici z isto prednostjo, je katera koli od njiju pravilna.
select nosilec as "odsoten",
       string_agg(nadomesca || ' (' || prednost || ')', ', ' order by prednost, nadomesca)
         as "nadomeščajo (prednost)",
       case when min(prednost) = max(prednost) and count(*) > 1
            then 'enakovredni - določi se sproti' else 'po vrstnem redu' end as "kako"
from public.nadomescanja
where nosilec in ('MUŠIČ INES', 'HUMAR SAŠA', 'TRPIN SAŠA', 'BIZJAK TEA')
group by nosilec
order by nosilec;
