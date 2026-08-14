-- ---------------------------------------------------------------------
-- Parafe (kratke 2-4 črkovne oznake, npr. "BOJ", "DŽA") iz uradnega
-- izvoza "Parafe_ZN_14.08.2026.xlsx" (69 oseb, zavihek "ZN": Priimek in
-- ime | PARAFA | DM).
--
-- profiles.parafa je admin-urejljivo polje (Imenik) - uporablja ga uradna
-- predloga "Letni dopusti in omejitve za NZV" namesto polnega imena v
-- celicah (glej NzvView/parafaOd v index.html). Brez tega vnosa aplikacija
-- za NZV celice izpelje grobo SAMODEJNO privzeto parafo iz priimka
-- (autoParafa) - ta skripta jo nadomesti s PRAVO, uradno parafo osebe.
--
-- Ujemanje po `imena_se_ujemata()` (vreča besed, ne glede na vrstni red
-- Priimek/Ime in velikost črk - glej schema.sql), ker vrstni red zapisa v
-- viru NI dosleden (večina je "PRIIMEK IME", nekaj vrstic pa "IME
-- PRIIMEK" - npr. "ALEN MUŠIĆ", "ADNA MIDŽAN").
--
-- IZPUŠČENE 3 osebe iz izvoza, ki niso več zaposlene in so bile v tej
-- aplikaciji že trajno izbrisane (glej supabase/odstrani-zaposlene.sql):
-- Zaplotnik Alenka, Balek Mija, Sejdinović Mustafa - zanje ni profila, v
-- katerega bi se parafa zapisala.
--
-- "MAGKIĆ ALEKSANDER" (AMG) / "MAGLIĆ ALEKSANDER" (MA) v izvirnem izvozu
-- sta bili dve LOČENI vrstici za isto osebo (Aleksander Maglić - "Magkić"
-- je bila tiskarska napaka priimka) - uporabnik je potrdil, da je prava
-- parafa "MAG". Spodaj zato samo ENA vrstica z uradno pravo parafo.
--
-- Varno za ponovni zagon (UPDATE prepiše na isto vrednost, če ni sprememb).
-- ---------------------------------------------------------------------

with vhod (full_name, parafa) as (
  values
  ('BOJIĆ MATEJ', 'MBO'),
  ('HROVAT NINA', 'NH'),
  ('HUMAR SAŠA', 'SH'),
  ('SALKIĆ MARUŠA', 'MSA'),
  ('LUNAR MATEJA', 'ML'),
  ('MAVRI TRATNIK MAGDALENA', 'MMT'),
  ('ŠUBIC PETRA', 'PŠ'),
  ('TOMAŽEVIČ SIMONA', 'ST'),
  ('TORKAR TANJA', 'TT'),
  ('TRPIN SAŠA', 'STR'),
  ('VELUŠČEK METKA', 'MV'),
  ('ALUKIĆ DINO', 'DA'),
  ('BAJT ANJA', 'AB'),
  ('BIZJAK TEA', 'TB'),
  ('BRATUŠA MARIJA', 'MBR'),
  ('BURNAR SARA', 'SBU'),
  ('DOLAR TOMAŽ', 'TD'),
  ('DŽAMASTAGIĆ DENIS', 'DD'),
  ('DŽINIĆ AMIN', 'AD'),
  ('MALER ANTONINA', 'AMA'),
  ('MEGLIČ JAKA', 'JM'),
  ('MILJKOVIČ MAJA', 'MM'),
  ('MURIĆ ALMA', 'AM'),
  ('MUŠIČ INES', 'IM'),
  ('NUHANOVIĆ MERIMA', 'MN'),
  ('PERVIZ AMAL', 'AP'),
  ('PETERMAN RENATA', 'RP'),
  ('REJC JANA', 'JR'),
  ('ROZMAN ANKA', 'AR'),
  ('SVETINA ROBERT', 'RSV'),
  ('SVETINA SABINA', 'SSV'),
  ('ŠKANTAR MARK', 'MŠ'),
  ('URANKER MOJCA', 'MU'),
  ('URBANČIČ MATEJ', 'MUR'),
  ('VOLARIČ NEJC', 'NV'),
  ('VOVK URŠKA', 'UV'),
  ('ZEKAN ALMEDIN', 'AZE'),
  ('MRAVLJE UROŠ', 'UM'),
  ('MUŠIĆ ALEN', 'AMU'),
  ('ADNA MIDŽAN', 'AMI'),
  ('ANA MITROVA', 'ANM'),
  ('AMELA ŠARANOVIĆ', 'AMŠ'),
  ('ANA FRELIH', 'ANF'),
  ('NEJC KLINAR', 'NKL'),
  ('ALAN REKIĆ', 'ALR'),
  ('AMBROŽ SKAZA', 'AS'),
  ('REKIĆ ELMA', 'ER'),
  ('SMOLEJ NATAŠA', 'NS'),
  ('GAZIBARA ALDIN', 'AG'),
  ('ŠABIĆ SEBINA', 'ŠS'),
  ('TALIĆ AMIRA', 'AMT'),
  ('MISOTIČ REBEKA', 'MRE'),
  ('ARNEŽ GREGA', 'GA'),
  ('LELIČ DIJANA', 'DIL'),
  ('POGAČNIK TEJA', 'PT'),
  ('VOZEL DEJAN', 'DV'),
  ('MAGLIĆ ALEKSANDER', 'MAG'),
  ('STARC ERIK', 'SE'),
  ('GASHI GENTIANA', 'GG'),
  ('SIJAMHODŽIĆ NERMINA', 'SN'),
  ('DJEDOVIĆ MARK', 'DM'),
  ('SOFRIĆ NIKOLINA', 'NSO'),
  ('JEREB SARA', 'SAJ'),
  ('VOZEL NEJA', 'VN'),
  ('KOGOJ EVA', 'KE')
),
posodobljeno as (
  update public.profiles p
  set parafa = v.parafa
  from vhod v
  where public.imena_se_ujemata(p.full_name, v.full_name)
  returning p.id, v.full_name
)
select 'posodobljenih' as kaj, count(*)::text as podrobnost from posodobljeno
union all
select 'NI NAJDEN PROFIL (preveri ime ročno v Imeniku)', v.full_name || '  (parafa: ' || v.parafa || ')'
from vhod v
where not exists (select 1 from posodobljeno u where public.imena_se_ujemata(u.full_name, v.full_name))
union all
select 'POZOR: dve vrstici iz izvoza sta se ujemali z istim profilom', string_agg(v.full_name || '=' || v.parafa, ' / ' order by v.full_name)
from vhod v
join public.profiles p on public.imena_se_ujemata(p.full_name, v.full_name)
group by p.id having count(*) > 1
order by 1, 2;
