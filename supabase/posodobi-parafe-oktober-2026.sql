-- ---------------------------------------------------------------------
-- Parafa se je za del kadra spremenila z veljavnostjo od 1.10.2026
-- (uradna prenova poimenovanja, ne popravek napake) - spodnjih 21 oseb je
-- do 30.9.2026 imelo eno parafo, od 1.10.2026 dalje pa drugo. Ta skripta
-- zapiše OBE vrednosti:
--   * profiles.parafa                     = nova (velja od 1.10.2026 dalje)
--   * profiles.parafa_pred_oktobrom_2026  = stara (veljala do 30.9.2026)
--
-- Aplikacija (index.html, parafaOd()) med njima izbira glede na dejanski
-- datum razporeda/dopusta, ne glede na to, kdaj je bila skripta pognana:
-- meseci PRED oktobrom 2026 v NZV prikažejo staro parafo, oktober 2026
-- dalje novo.
--
-- MAGLIĆ ALEKSANDER se parafa dejansko NI spremenila - vseeno je spodaj
-- (stara = nova), da je seznam popoln in v kodi ni potreben poseben primer
-- zanj. BOJIĆ MATEJ SE JE spremenil (uporabnik popravil prvotno napačno
-- domnevo "brez spremembe"): do 30.9.2026 "BOJ" (starejši, neuraden zapis
-- v NZV predlogi), od 1.10.2026 dalje "MBO" (uradna parafa).
--
-- Ujemanje po `imena_se_ujemata()` (vreča besed, ne glede na vrstni red
-- Priimek/Ime in velikost črk - glej schema.sql), enako kot vnesi-parafe.sql.
-- Varno za ponoven zagon (UPDATE prepiše na isto vrednost, če ni sprememb).
-- ---------------------------------------------------------------------

with vhod (full_name, nova, stara) as (
  values
  ('BOJIĆ MATEJ', 'MBO', 'BOJ'),
  ('HROVAT NINA', 'NH', 'HRO'),
  ('HUMAR SAŠA', 'SH', 'HUM'),
  ('SALKIĆ MARUŠA', 'MSA', 'SAL'),
  ('LUNAR MATEJA', 'ML', 'LUN'),
  ('MAVRI TRATNIK MAGDALENA', 'MMT', 'TRA'),
  ('ŠUBIC PETRA', 'PŠ', 'ŠUB'),
  ('TOMAŽEVIČ SIMONA', 'ST', 'TOM'),
  ('TORKAR TANJA', 'TT', 'TOR'),
  ('TRPIN SAŠA', 'STR', 'TRP'),
  ('VELUŠČEK METKA', 'MV', 'VEL'),
  ('ALUKIĆ DINO', 'DA', 'ALU'),
  ('DŽAMASTAGIĆ DENIS', 'DD', 'DŽA'),
  ('PERVIZ AMAL', 'AP', 'PER'),
  ('MISOTIČ REBEKA', 'MRE', 'MIS'),
  ('ARNEŽ GREGA', 'GA', 'ARN'),
  ('LELIČ DIJANA', 'DIL', 'LEL'),
  ('POGAČNIK TEJA', 'PT', 'POG'),
  ('VOZEL DEJAN', 'DV', 'VOZ'),
  ('MAGLIĆ ALEKSANDER', 'MAG', 'MAG'),
  ('SOFRIĆ NIKOLINA', 'NSO', 'SOF')
),
posodobljeno as (
  update public.profiles p
  set parafa = v.nova,
      parafa_pred_oktobrom_2026 = v.stara
  from vhod v
  where public.imena_se_ujemata(p.full_name, v.full_name)
  returning p.id, v.full_name
)
select 'posodobljenih' as kaj, count(*)::text as podrobnost from posodobljeno
union all
select 'NI NAJDEN PROFIL (preveri ime ročno v Imeniku)', v.full_name
from vhod v
where not exists (select 1 from posodobljeno u where public.imena_se_ujemata(u.full_name, v.full_name))
union all
select 'POZOR: dve vrstici iz izvoza sta se ujemali z istim profilom', string_agg(v.full_name, ' / ' order by v.full_name)
from vhod v
join public.profiles p on public.imena_se_ujemata(p.full_name, v.full_name)
group by p.id having count(*) > 1
order by 1, 2;
