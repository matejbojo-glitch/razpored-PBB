-- ---------------------------------------------------------------------
-- Oznaka "zamenjano" (↔) v Imeniku → Razpredelnica za VSE mesece
--
-- Kaj naredi: doda pogled menjave_javno, iz katerega aplikacija prebere,
-- kateri dnevi so bili zamenjani s POTRJENO menjavo.
--
-- Kako pognati: Supabase → SQL Editor → prilepi vse spodaj → Run.
-- Pognati je varno tudi večkrat (pogled se samo na novo ustvari).
--
-- Isto vsebino ima supabase/schema.sql, razdelek 33 - če poženeš celotno
-- shemo, tega ni treba posebej.
--
-- Zakaj pogled in ne sprememba pravic na tabeli obrazci: obrazci vsebuje
-- tudi opombe in razloge zavrnitve, ki so zasebni. Pogled izpostavi samo
-- kdo, s kom in katera dva dneva - nič drugega - in izključno za menjave,
-- ki so bile dokončno potrjene.
-- ---------------------------------------------------------------------
drop view if exists public.menjave_javno;
create view public.menjave_javno as
  select
    o.vlagatelj_id,
    o.sodelavec_id,
    (o.polja ->> 'datum_a')::date as datum_a,
    (o.polja ->> 'datum_b')::date as datum_b
  from public.obrazci o
  where o.vrsta = 'menjava_sluzbe'
    and o.status = 'zakljucen'
    and o.polja ? 'datum_a'
    and o.polja ? 'datum_b';

revoke all on public.menjave_javno from anon;
grant select on public.menjave_javno to authenticated;

-- Hitro preverjanje, da je vse na svojem mestu (sme vrniti tudi 0 vrstic,
-- če potrjenih menjav še ni):
select count(*) as potrjenih_menjav from public.menjave_javno;
