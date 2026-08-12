-- ---------------------------------------------------------------------
-- Poenoti zapis imen treh administratorjev z ostalimi zaposlenimi.
--
-- V Imeniku so vsi zapisani kot "Ime Priimek" (Aldin Gazibara, Alen
-- Mušić ...), trije administratorji pa kot "PRIIMEK IME" z velikimi
-- črkami — v abecednem seznamu izstopajo in delujejo kot napaka.
--
-- ZAKAJ SAMO TE TRI IN ZAKAJ NAŠTETE POIMENSKO: samodejna pretvorba
-- "PRIIMEK IME" -> "Ime Priimek" ni zanesljiva, ker iz zapisa ni
-- razvidno, koliko besed je priimek ("MAVRI TRATNIK MAGDALENA" ima
-- dvobesedni priimek). Napačno obrnjeno ime je slabše od velikih črk,
-- zato so tu samo tri osebe, ki jih je uporabnik izrecno navedel, s
-- pravilnim zapisom, preverjenim ročno.
--
-- VARNO ZA ZGODOVINO DEŽURSTEV: admin.html od te različice išče zaprto
-- osnovo (jan.-avg. 2026) po vreči besed v velikih črkah, ne po točnem
-- zapisu, zato "Dino Alukić" najde isto zgodovino kot "ALUKIĆ DINO".
-- Če bi to skripto pognali na STAREJŠI različici aplikacije, bi tem
-- trem tiho izginilo 21 dežurstev vsakemu in generator pravičnosti bi
-- jim naložil preveč — najprej torej naložite novo različico.
--
-- Ujemanje po e-pošti iz auth.users (stabilna), ne po imenu, ki ga prav
-- ta skripta spreminja. Idempotentna: ponovni zagon ne naredi ničesar.
-- Poženi v Supabase → SQL Editor.
-- ---------------------------------------------------------------------

begin;

update public.profiles p
set full_name = v.novo
from (values
  ('dino.alukic@pb-begunje.si',       'Dino Alukić'),
  ('matej.bojic@pb-begunje.si',       'Matej Bojić'),
  ('denis.dzamastagic@pb-begunje.si', 'Denis Džamastagić')
) as v(email, novo)
where p.id = (select u.id from auth.users u where lower(u.email) = v.email)
  and p.full_name is distinct from v.novo;

-- Nadzorni izpis: kako so zapisani zdaj.
select u.email, p.full_name
from auth.users u join public.profiles p on p.id = u.id
where lower(u.email) in ('dino.alukic@pb-begunje.si', 'matej.bojic@pb-begunje.si',
                         'denis.dzamastagic@pb-begunje.si')
order by p.full_name;

commit;
