-- ---------------------------------------------------------------------
-- Dežurni kader (DMS/DZN) — članstvo za vseh 14 oseb dežurnega kroga.
--
-- "DEZ" ni oddelek, ampak ČLANSTVO. Generator → Dežurstva bere krog prav
-- iz njega. NZV tega ne nadomesti — NZV so vsi vodje in administratorji,
-- dežurstvo pa opravlja le del njih.
--
-- Članstvo se doda kot SEKUNDARNI oddelek (sort_order > 0), da ostane
-- domači oddelek osebe nedotaknjen: primarni poganja generator kalupa in
-- stolpec "Enota", dežurstvo pa ni domači oddelek nikogar.
--
-- Mavri Tratnik Magdalena je navedena z DVEMA e-poštama: kadrovski izvoz
-- ima "magdalena.mavri@", roster/nastavi-vloge.sql pa
-- "magdalena.mavritratnik@". Katera je bila uporabljena ob registraciji,
-- od tu ni vidno. Izpis manjkajočih zato šteje OSEBO, ne vrstice.
--
-- ZAKAJ EN SAM STAVEK: Supabase SQL Editor poganja stavke prek
-- povezovalnika, kjer vsak stavek lahko dobi svojo sejo — začasna tabela
-- iz prejšnjega stavka takrat ne obstaja.
--
-- Varno za ponovni zagon.
-- ---------------------------------------------------------------------

with vhod (email, full_name) as (
  values
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
    ('metka.veluscek@pb-begunje.si', 'VELUŠČEK METKA'),
    ('marusa.salkic@pb-begunje.si', 'SALKIĆ MARUŠA'),
    ('sasa.trpin@pb-begunje.si', 'TRPIN SAŠA'),
    ('magdalena.mavritratnik@pb-begunje.si', 'MAVRI TRATNIK MAGDALENA')
),
ujemanje as (
  select v.full_name, v.email,
         coalesce(
           (select u.id from auth.users u where lower(u.email) = v.email limit 1),
           (select p.id from public.profiles p where upper(p.full_name) = upper(v.full_name) limit 1)
         ) as profile_id
  from vhod v
),
enolicno as (
  select distinct on (profile_id) profile_id
  from ujemanje
  where profile_id is not null
  order by profile_id
),
dodaj as (
  insert into public.profile_departments (profile_id, department_code, sort_order)
  select e.profile_id, 'DEZ',
         coalesce((select max(pd.sort_order) + 1
                   from public.profile_departments pd
                   where pd.profile_id = e.profile_id), 1)
  from enolicno e
  on conflict (profile_id, department_code) do nothing
  returning profile_id
)
select 'na novo dodanih v dežurni krog' as kaj, count(*)::text as podrobnost from dodaj
union all
select 'še nima računa', full_name || '  <' || string_agg(email, ' / ' order by email) || '>'
from ujemanje
group by full_name
having count(profile_id) = 0
order by 1, 2;
