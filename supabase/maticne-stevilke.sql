-- ---------------------------------------------------------------------
-- Matične številke (šifre zaposlenih) iz kadrovskega izvoza
-- "Seznam zaposlenih ZN - vse" (69 oseb).
--
-- Vir je kadrovska evidenca, zato je merodajna: obstoječe vrednosti se
-- PREPIŠEJO.
--
-- Ujemanje teče po e-pošti iz auth.users – ta je v izvozu enolična za
-- vseh 69 vrstic, imena pa se med sistemi pišejo različno (ena oseba
-- ima e-pošto na prejšnji priimek). Ime je le rezerva.
--
-- ZAKAJ EN SAM STAVEK: Supabase SQL Editor poganja stavke prek
-- povezovalnika, kjer vsak stavek lahko dobi svojo sejo – začasna tabela
-- iz prejšnjega stavka takrat ne obstaja.
--
-- Varno za ponovni zagon.
-- ---------------------------------------------------------------------

with vhod (employee_code, email, full_name) as (
  values
    ('912', 'denis.dzamastagic@pb-begunje.si', 'DŽAMASTAGIĆ DENIS'),
    ('823', 'dino.alukic@pb-begunje.si', 'ALUKIĆ DINO'),
    ('855', 'matej.bojic@pb-begunje.si', 'BOJIĆ MATEJ'),
    ('887', 'amal.perviz@pb-begunje.si', 'PERVIZ AMAL'),
    ('925', 'marusa.salkic@pb-begunje.si', 'SALKIĆ MARUŠA'),
    ('1092', 'grega.arnez@pb-begunje.si', 'ARNEŽ GREGA'),
    ('989', 'tea.bizjak@pb-begunje.si', 'BIZJAK  TEA'),
    ('705', 'sasa.humar@pb-begunje.si', 'HUMAR SAŠA'),
    ('1090', 'dijana.lelic@pb-begunje.si', 'LELIČ DIJANA'),
    ('844', 'mateja.lunar@pb-begunje.si', 'LUNAR MATEJA'),
    ('1001', 'aleksander.maglic@pb-begunje.si', 'MAGLIĆ ALEKSANDER'),
    ('833', 'magdalena.mavri@pb-begunje.si', 'MAVRI TRATNIK MAGDALENA'),
    ('1163', 'rebeka.misotic@pb-begunje.si', 'MISOTIČ REBEKA'),
    ('926', 'ines.music@pb-begunje.si', 'MUŠIČ INES'),
    ('1058', 'teja.pogacnik@pb-begunje.si', 'POGAČNIK TEJA'),
    ('905', 'petra.subic@pb-begunje.si', 'ŠUBIC PETRA'),
    ('870', 'sasa.trpin@pb-begunje.si', 'TRPIN SAŠA'),
    ('820', 'nina.hrovat@pb-begunje.si', 'HROVAT NINA'),
    ('965', 'tanja.torkar@pb-begunje.si', 'TORKAR TANJA'),
    ('793', 'simona.tomazevic@pb-begunje.si', 'TOMAŽEVIČ SIMONA'),
    ('834', 'metka.veluscek@pb-begunje.si', 'VELUŠČEK METKA'),
    ('991', 'dejan.vozel@pb-begunje.si', 'VOZEL DEJAN'),
    ('1141', 'aldin.gazibara@pb-begunje.si', 'GAZIBARA ALDIN'),
    ('1174', 'nikolina.sofric@pb-begunje.si', 'SOFRIĆ NIKOLINA'),
    ('1069', 'nelvedin.becirovic@pb-begunje.si', 'BEĆIROVIĆ NELVEDIN'),
    ('826', 'amin.dzinic@pb-begunje.si', 'DŽINIĆ AMIN'),
    ('1145', 'jure.karnicar@pb-begunje.si', 'KARNIČAR JURE'),
    ('1089', 'nadja.kodras@pb-begunje.si', 'KODRAS NADJA'),
    ('987', 'jaka.meglic@pb-begunje.si', 'MEGLIČ JAKA'),
    ('1084', 'simona.mocnik@pb-begunje.si', 'MOČNIK SIMONA'),
    ('997', 'uros.mravlje@pb-begunje.si', 'MRAVLJE UROŠ'),
    ('964', 'alma.muric@pb-begunje.si', 'MURIĆ ALMA'),
    ('909', 'merima.nuhanovic@pb-begunje.si', 'NUHANOVIĆ MERIMA'),
    ('1072', 'luka.rant@pb-begunje.si', 'RANT LUKA'),
    ('1106', 'elma.rekic@pb-begunje.si', 'REKIĆ ELMA'),
    ('1164', 'erik.starc@pb-begunje.si', 'STARC ERIK'),
    ('963', 'mark.skantar@pb-begunje.si', 'ŠKANTAR MARK'),
    ('1035', 'nikolina.tomasic@pb-begunje.si', 'TOMAŠIĆ  NIKOLINA'),
    ('1102', 'enej.valjavec@pb-begunje.si', 'VALJAVEC ENEJ'),
    ('852', 'almedin.zekan@pb-begunje.si', 'ZEKAN ALMEDIN'),
    ('830', 'anja.bajt@pb-begunje.si', 'BAJT ANJA'),
    ('691', 'marija.bratusa@pb-begunje.si', 'BRATUŠA MARIJA'),
    ('1172', 'mark.djedovic@pb-begunje.si', 'DJEDOVIĆ MARK'),
    ('747', 'tomaz.dolar@pb-begunje.si', 'DOLAR TOMAŽ'),
    ('1167', 'gentiana.gashi@pb-begunje.si', 'GASHI GENTIANA'),
    ('1086', 'ajla.huseinbasic@pb-begunje.si', 'HUSEINBAŠIĆ AJLA'),
    ('994', 'sara.jereb@pb-begunje.si', 'JEREB SARA'),
    ('1180', 'eva.kogoj@pb-begunje.si', 'KOGOJ EVA'),
    ('1051', 'marko.kvrzic@pb-begunje.si', 'KVRŽIĆ MARKO'),
    ('971', 'antonina.maler@pb-begunje.si', 'MALER ANTONINA'),
    ('1109', 'alen.music@pb-begunje.si', 'MUŠIĆ ALEN'),
    ('818', 'renata.peterman@pb-begunje.si', 'PETERMAN RENATA'),
    ('1075', 'matej.pogacnik@pb-begunje.si', 'POGAČNIK MATEJ'),
    ('973', 'jana.rejc@pb-begunje.si', 'REJC JANA'),
    ('715', 'anka.rozman@pb-begunje.si', 'ROZMAN ANKA'),
    ('1062', 'klara.rozman@pb-begunje.si', 'ROZMAN KLARA'),
    ('1133', 'natasa.smolej@pb-begunje.si', 'SMOLEJ NATAŠA'),
    ('1073', 'barbara.sodja@pb-begunje.si', 'SODJA BARBARA'),
    ('1022', 'jaka.susnik@pb-begunje.si', 'SUŠNIK JAKA'),
    ('633', 'robert.svetina@pb-begunje.si', 'SVETINA ROBERT'),
    ('676', 'sabina.svetina@pb-begunje.si', 'SVETINA SABINA'),
    ('1152', 'sebina.sabic@pb-begunje.si', 'ŠABIĆ SEBINA'),
    ('1159', 'amira.talic@pb-begunje.si', 'TALIĆ AMIRA'),
    ('604', 'mojca.uranker@pb-begunje.si', 'URANKER MOJCA'),
    ('865', 'nejc.volaric@pb-begunje.si', 'VOLARIČ NEJC'),
    ('657', 'urska.vovk@pb-begunje.si', 'VOVK URŠKA'),
    ('1179', 'neja.vozel@pb-begunje.si', 'VOZEL NEJA'),
    ('974', 'maja.miljkovic@pb-begunje.si', 'VREVC MAJA')
),
ujemanje as (
  select v.employee_code, v.email, v.full_name,
         coalesce(
           (select u.id from auth.users u where lower(u.email) = v.email limit 1),
           (select p.id from public.profiles p where upper(p.full_name) = upper(v.full_name) limit 1)
         ) as profile_id
  from vhod v
),
-- Če bi dve vrstici kadrovske pokazali na isti profil, bi "on conflict do
-- update" odpovedal z "cannot affect row a second time". distinct on to
-- prepreči, primer pa se izpiše spodaj kot "POZOR", da ne ostane tih.
enolicno as (
  select distinct on (profile_id) profile_id, employee_code
  from ujemanje
  where profile_id is not null
  order by profile_id, employee_code
),
vpis as (
  insert into public.profile_hr_details (profile_id, employee_code)
  select profile_id, employee_code from enolicno
  on conflict (profile_id) do update
    set employee_code = excluded.employee_code,
        updated_at = now()
  returning profile_id
)
select 'usklajenih' as kaj, count(*)::text as podrobnost from vpis
union all
select 'še nima računa', full_name || '  (' || employee_code || ')  <' || email || '>'
from ujemanje where profile_id is null
union all
select 'POZOR: dve osebi na isti profil', string_agg(full_name, ' = ' order by full_name)
from ujemanje where profile_id is not null
group by profile_id having count(*) > 1
order by 1, 2;
