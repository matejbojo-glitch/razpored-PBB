-- ---------------------------------------------------------------------
-- Trajna dežurna pravila (veljajo do preklica) za 14 oseb dežurnega kroga.
--
-- Ista vsebina kot v schema.sql, izluščena kot samostojna skripta, da je
-- ni treba iskati sredi celotne sheme.
--
-- ZAKAJ UJEMANJE PO VREČI BESED IN NE PO IMENU: imena so bila poenotena
-- iz "PRIIMEK IME" v "Priimek Ime". Natančna primerjava bi tiho ujela nič
-- vrstic in pravila bi ostala nenastavljena, brez vsakega opozorila.
-- Primerja se torej množica besed v velikih črkah, kar prenese oba
-- zapisa in tudi dvobesedni priimek.
--
-- coalesce() v update delu ščiti poznejše ročne popravke v Imeniku —
-- ponovni zagon ne povozi tega, kar je admin medtem spremenil.
-- Poženi v Supabase → SQL Editor.
-- ---------------------------------------------------------------------

with vhod (full_name, min_m, max_m, day_off, weekdays_only) as (
  values
    ('ALUKIĆ DINO', 2, 3, null, false),
    ('ARNEŽ GREGA', 2, 3, null, false),
    ('BOJIĆ MATEJ', 2, 3, 'PO', false),
    ('DŽAMASTAGIĆ DENIS', 2, 3, null, false),
    ('PERVIZ AMAL', 2, 3, null, false),
    ('TOMAŽEVIČ SIMONA', 2, 3, null, false),
    ('TORKAR TANJA', 2, 3, null, false),
    ('HROVAT NINA', 2, 3, null, false),
    ('ŠUBIC PETRA', 2, 3, null, false),
    ('LUNAR MATEJA', 2, 3, null, false),
    ('MAVRI TRATNIK MAGDALENA', 2, 3, null, false),
    ('VELUŠČEK METKA', 2, 2, null, false),
    -- Trajna omejitev: eno dežurstvo na mesec in nikoli ob vikendu.
    ('SALKIĆ MARUŠA', 1, 1, null, true),
    ('TRPIN SAŠA', 1, 1, null, true)
),
kljuc as (
  select v.*, (select string_agg(d, ' ' order by d)
               from unnest(string_to_array(upper(v.full_name), ' ')) d) as k
  from vhod v
),
ujemanje as (
  select k.*, p.id as profile_id
  from kljuc k
  join public.profiles p on (
    select string_agg(d, ' ' order by d)
    from unnest(string_to_array(upper(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')), ' ')) d
  ) = k.k
),
vpis as (
  insert into public.profile_hr_details
    (profile_id, duty_min_monthly, duty_max_monthly, duty_day_off, duty_weekdays_only)
  select profile_id, min_m, max_m, day_off, weekdays_only from ujemanje
  on conflict (profile_id) do update set
    duty_min_monthly   = coalesce(public.profile_hr_details.duty_min_monthly, excluded.duty_min_monthly),
    duty_max_monthly   = coalesce(public.profile_hr_details.duty_max_monthly, excluded.duty_max_monthly),
    duty_day_off       = coalesce(public.profile_hr_details.duty_day_off, excluded.duty_day_off),
    duty_weekdays_only = coalesce(public.profile_hr_details.duty_weekdays_only, excluded.duty_weekdays_only)
  returning profile_id
)
select 'nastavljenih' as kaj, count(*)::text as podrobnost from vpis
union all
select 'ni najden v aplikaciji', full_name
from kljuc where k not in (select k from ujemanje)
order by 1, 2;

-- Kontrolni izpis po zagonu:
--   select p.full_name, h.duty_min_monthly, h.duty_max_monthly, h.duty_weekdays_only, h.duty_day_off
--   from public.profiles p join public.profile_hr_details h on h.profile_id = p.id
--   where h.duty_max_monthly is not null order by p.full_name;
