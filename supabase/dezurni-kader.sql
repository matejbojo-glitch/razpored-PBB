-- ---------------------------------------------------------------------
-- Dežurni kader (DMS/DZN) — članstvo za vseh 14 oseb dežurnega kroga.
--
-- Zakaj je to potrebno: "DEZ" ni oddelek, ampak ČLANSTVO. Generator →
-- Dežurstva bere krog prav iz njega. Ko je bil izbirnik oddelkov v
-- Imeniku omejen na 8 kod za razpored, DEZ ni bilo več mogoče nikjer
-- dodeliti, zato so na seznamu ostali samo tisti, ki so kodo nosili od
-- prej. NZV tega ne nadomesti — NZV so vsi vodje in administratorji,
-- dežurstvo pa opravlja le del njih.
--
-- Članstvo se doda kot SEKUNDARNI oddelek (sort_order > 0), da ostane
-- domači oddelek osebe nedotaknjen: primarni poganja generator kalupa in
-- stolpec "Enota", dežurstvo pa ni domači oddelek nikogar.
--
-- Ujemanje teče po e-pošti iz auth.users (enolična za vseh 14), ime je
-- samo rezerva. Skripta je idempotentna.
-- Poženi v Supabase → SQL Editor.
-- ---------------------------------------------------------------------

begin;

create temporary table _dezurni (email text not null, full_name text not null)
  on commit drop;

insert into _dezurni (email, full_name) values
  ('dino.alukic@pb-begunje.si', 'ALUKIĆ DINO'),
  ('grega.arnez@pb-begunje.si', 'ARNEŽ GREGA'),
  ('matej.bojic@pb-begunje.si', 'BOJIĆ MATEJ'),
  ('denis.dzamastagic@pb-begunje.si', 'DŽAMASTAGIĆ DENIS'),
  ('amal.perviz@pb-begunje.si', 'PERVIZ AMAL'),
  ('simona.tomazevic@pb-begunje.si', 'TOMAŽEVIČ SIMONA'),
  ('tanja.torkar@pb-begunje.si', 'TORKAR TANJA'),
  ('nina.hrovat@pb-begunje.si', 'HROVAT NINA'),
  ('petra.subic@pb-begunje.si', 'ŠUBIC PETRA'),
  ('mateja.lunar@pb-begunje.si', 'LUNAR MATEJA'),
  ('magdalena.mavri@pb-begunje.si', 'MAVRI TRATNIK MAGDALENA'),
  -- Ista oseba, druga e-pošta: kadrovski izvoz navaja "magdalena.mavri@",
  -- roster/nastavi-vloge.sql pa "magdalena.mavritratnik@". Kateri od obeh
  -- je bil uporabljen ob registraciji, od tu ni vidno, zato sta navedena
  -- oba — ujame se tisti, ki v auth.users obstaja, drugi ostane brez
  -- profila in se izpiše spodaj. "on conflict do nothing" poskrbi, da
  -- oseba ne dobi članstva dvakrat, če bi obstajala oba računa.
  ('magdalena.mavritratnik@pb-begunje.si', 'MAVRI TRATNIK MAGDALENA'),
  ('metka.veluscek@pb-begunje.si', 'VELUŠČEK METKA'),
  ('marusa.salkic@pb-begunje.si', 'SALKIĆ MARUŠA'),
  ('sasa.trpin@pb-begunje.si', 'TRPIN SAŠA');

create temporary table _dez_ujemanje on commit drop as
select d.full_name,
       d.email,
       coalesce(
         (select u.id from auth.users u where lower(u.email) = d.email limit 1),
         (select p.id from public.profiles p where upper(p.full_name) = upper(d.full_name) limit 1)
       ) as profile_id
from _dezurni d;

-- Dodaj DEZ kot sekundarno članstvo. sort_order je postavljen za vse
-- obstoječe oddelke osebe, da ne prevzame mesta primarnega (sort_order 0).
insert into public.profile_departments (profile_id, department_code, sort_order)
select u.profile_id, 'DEZ',
       coalesce((select max(pd.sort_order) + 1 from public.profile_departments pd
                 where pd.profile_id = u.profile_id), 1)
from _dez_ujemanje u
where u.profile_id is not null
on conflict (profile_id, department_code) do nothing;

-- Nadzorni izpis: kdo še nima računa v aplikaciji (teh skripta ne more
-- dodati). Šteje se OSEBA, ne vrstica — kdor je naveden z dvema
-- e-poštama, manjka le, če se ni ujemala nobena od njiju.
select full_name, string_agg(email, ' / ' order by email) as preizkusene_eposte
from _dez_ujemanje
group by full_name
having count(profile_id) = 0
order by full_name;

commit;

-- Preveri po zagonu — mora vrniti 14:
--   select count(distinct p.id)
--   from public.profiles p
--   left join public.profile_departments pd on pd.profile_id = p.id
--   where p.department_code = 'DEZ' or pd.department_code = 'DEZ';
