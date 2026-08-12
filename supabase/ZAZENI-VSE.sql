-- =====================================================================
--  RAZPORED PBB — vse potrebne posodobitve baze v enem zagonu
--
--  Prilepi CELO datoteko v Supabase → SQL Editor in klikni Run.
--  Traja nekaj sekund. Varno je pognati večkrat — ponovni zagon ne
--  spremeni ničesar.
--
--  Vrstni red ni naključen: imena se poenotijo PRVA, ker naslednji dve
--  skripti osebo iščeta po e-pošti in kot rezervo po imenu.
--
--  Na koncu se izpiše več razpredelnic. Poglej jih — povedo, kdo se ni
--  ujel (praviloma tisti, ki še nima računa v aplikaciji).
-- =====================================================================


-- =====================================================================
--  1 / 3  ENOTEN ZAPIS IMEN  (Priimek Ime, 69 oseb)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enoten zapis imen: povsod "Priimek Ime" (69 oseb).
--
-- Doslej sta v bazi soobstajala oba zapisa — večina "Ime Priimek"
-- (Aldin Gazibara), trije administratorji pa "PRIIMEK IME" z velikimi
-- črkami. To ni bilo le vprašanje videza:
--
--   * Imenik se razvršča po full_name, torej se je razvrščal po OSEBNEM
--     imenu (Ajla, Aldin, Aleksander, Alen, Alenka ...) namesto po
--     priimku, kar v kadrovskem imeniku ni uporabno.
--   * autoParafa() v index.html jemlje za priimek vse razen zadnje
--     besede (da zajame dvobesedne priimke). Pri zapisu "Ime Priimek" je
--     zato vračala prve tri črke OSEBNEGA imena — "Aldin Gazibara" je
--     dobil parafo "ALD" namesto "GAZ".
--
-- ZAKAJ JE VRSTNI RED TU ZANESLJIV: imena so iz kadrovskega izvoza
-- "Seznam zaposlenih ZN - vse", ki je zapisan kot "PRIIMEK IME". Za vseh
-- 69 vrstic je preverjeno, da se ZADNJA beseda ujema z osebnim imenom
-- iz e-pošte (ime.priimek@) — zato je znano, kateri del je priimek, tudi
-- pri dvobesednem priimku ("MAVRI TRATNIK MAGDALENA" -> "Mavri Tratnik
-- Magdalena"). Samodejnega obračanja po pravilu "zadnja beseda je
-- priimek" NAMENOMA ni: pri takem priimku bi ime obrnilo narobe.
-- Odvečni presledki iz izvoza ("BIZJAK  TEA") so odstranjeni.
--
-- VARNO ZA ZGODOVINO: admin.html išče zaprto zgodovino dežurstev in
-- ujemanja imen po vreči besed (velike črke, vrstni red ni pomemben),
-- zato preimenovanje ne izgubi ničesar. Na različici pred PR #64 pa BI —
-- najprej naložite novo različico aplikacije.
--
-- Ujemanje po e-pošti iz auth.users, ne po imenu, ki ga prav ta skripta
-- spreminja. Idempotentna: ponovni zagon je UPDATE 0.
-- Poženi v Supabase → SQL Editor.
-- ---------------------------------------------------------------------

begin;

create temporary table _imena (email text primary key, polno text not null)
  on commit drop;

insert into _imena (email, polno) values
  ('denis.dzamastagic@pb-begunje.si', 'Džamastagić Denis'),
  ('dino.alukic@pb-begunje.si', 'Alukić Dino'),
  ('matej.bojic@pb-begunje.si', 'Bojić Matej'),
  ('amal.perviz@pb-begunje.si', 'Perviz Amal'),
  ('marusa.salkic@pb-begunje.si', 'Salkić Maruša'),
  ('grega.arnez@pb-begunje.si', 'Arnež Grega'),
  ('tea.bizjak@pb-begunje.si', 'Bizjak Tea'),
  ('sasa.humar@pb-begunje.si', 'Humar Saša'),
  ('dijana.lelic@pb-begunje.si', 'Lelič Dijana'),
  ('mateja.lunar@pb-begunje.si', 'Lunar Mateja'),
  ('aleksander.maglic@pb-begunje.si', 'Maglić Aleksander'),
  ('magdalena.mavri@pb-begunje.si', 'Mavri Tratnik Magdalena'),
  ('rebeka.misotic@pb-begunje.si', 'Misotič Rebeka'),
  ('ines.music@pb-begunje.si', 'Mušič Ines'),
  ('teja.pogacnik@pb-begunje.si', 'Pogačnik Teja'),
  ('petra.subic@pb-begunje.si', 'Šubic Petra'),
  ('sasa.trpin@pb-begunje.si', 'Trpin Saša'),
  ('nina.hrovat@pb-begunje.si', 'Hrovat Nina'),
  ('tanja.torkar@pb-begunje.si', 'Torkar Tanja'),
  ('simona.tomazevic@pb-begunje.si', 'Tomaževič Simona'),
  ('metka.veluscek@pb-begunje.si', 'Velušček Metka'),
  ('dejan.vozel@pb-begunje.si', 'Vozel Dejan'),
  ('aldin.gazibara@pb-begunje.si', 'Gazibara Aldin'),
  ('nikolina.sofric@pb-begunje.si', 'Sofrić Nikolina'),
  ('nelvedin.becirovic@pb-begunje.si', 'Bećirović Nelvedin'),
  ('amin.dzinic@pb-begunje.si', 'Džinić Amin'),
  ('jure.karnicar@pb-begunje.si', 'Karničar Jure'),
  ('nadja.kodras@pb-begunje.si', 'Kodras Nadja'),
  ('jaka.meglic@pb-begunje.si', 'Meglič Jaka'),
  ('simona.mocnik@pb-begunje.si', 'Močnik Simona'),
  ('uros.mravlje@pb-begunje.si', 'Mravlje Uroš'),
  ('alma.muric@pb-begunje.si', 'Murić Alma'),
  ('merima.nuhanovic@pb-begunje.si', 'Nuhanović Merima'),
  ('luka.rant@pb-begunje.si', 'Rant Luka'),
  ('elma.rekic@pb-begunje.si', 'Rekić Elma'),
  ('erik.starc@pb-begunje.si', 'Starc Erik'),
  ('luka.stare@pb-begunje.si', 'Stare Luka'),
  ('mark.skantar@pb-begunje.si', 'Škantar Mark'),
  ('nikolina.tomasic@pb-begunje.si', 'Tomašić Nikolina'),
  ('enej.valjavec@pb-begunje.si', 'Valjavec Enej'),
  ('almedin.zekan@pb-begunje.si', 'Zekan Almedin'),
  ('anja.bajt@pb-begunje.si', 'Bajt Anja'),
  ('marija.bratusa@pb-begunje.si', 'Bratuša Marija'),
  ('mark.djedovic@pb-begunje.si', 'Djedović Mark'),
  ('tomaz.dolar@pb-begunje.si', 'Dolar Tomaž'),
  ('gentiana.gashi@pb-begunje.si', 'Gashi Gentiana'),
  ('ajla.huseinbasic@pb-begunje.si', 'Huseinbašić Ajla'),
  ('sara.jereb@pb-begunje.si', 'Jereb Sara'),
  ('eva.kogoj@pb-begunje.si', 'Kogoj Eva'),
  ('marko.kvrzic@pb-begunje.si', 'Kvržić Marko'),
  ('antonina.maler@pb-begunje.si', 'Maler Antonina'),
  ('alen.music@pb-begunje.si', 'Mušić Alen'),
  ('renata.peterman@pb-begunje.si', 'Peterman Renata'),
  ('matej.pogacnik@pb-begunje.si', 'Pogačnik Matej'),
  ('jana.rejc@pb-begunje.si', 'Rejc Jana'),
  ('anka.rozman@pb-begunje.si', 'Rozman Anka'),
  ('klara.rozman@pb-begunje.si', 'Rozman Klara'),
  ('natasa.smolej@pb-begunje.si', 'Smolej Nataša'),
  ('barbara.sodja@pb-begunje.si', 'Sodja Barbara'),
  ('jaka.susnik@pb-begunje.si', 'Sušnik Jaka'),
  ('robert.svetina@pb-begunje.si', 'Svetina Robert'),
  ('sabina.svetina@pb-begunje.si', 'Svetina Sabina'),
  ('sebina.sabic@pb-begunje.si', 'Šabić Sebina'),
  ('amira.talic@pb-begunje.si', 'Talić Amira'),
  ('mojca.uranker@pb-begunje.si', 'Uranker Mojca'),
  ('nejc.volaric@pb-begunje.si', 'Volarič Nejc'),
  ('urska.vovk@pb-begunje.si', 'Vovk Urška'),
  ('neja.vozel@pb-begunje.si', 'Vozel Neja'),
  ('maja.miljkovic@pb-begunje.si', 'Vrevc Maja');

-- Namerno JOIN in ne skalarna podpoizvedba: če bi v auth.users obstajala
-- dva računa z isto e-pošto, bi "= (select ...)" prekinil celo transakcijo
-- z nejasnim "more than one row returned by a subquery". Join tak primer
-- preprosto preimenuje oba profila in skripta se dokonča.
update public.profiles p
set full_name = i.polno
from _imena i
join auth.users u on lower(u.email) = i.email
where p.id = u.id
  and p.full_name is distinct from i.polno;

-- Nadzorni izpis 1: kdo iz seznama še nima računa (teh ni bilo mogoče preimenovati).
select i.email as brez_racuna
from _imena i
where not exists (select 1 from auth.users u where lower(u.email) = i.email)
order by 1;

-- Nadzorni izpis 2: profili, ki jih ta seznam NE pokriva in so videti
-- zapisani obratno ("Ime Priimek") — prva beseda se ujema z osebnim
-- imenom iz e-pošte. Te je treba popraviti ročno v Imeniku; skripta jih
-- namenoma ne ugiba, ker pri dvobesednem priimku ni mogoče vedeti, kje
-- se priimek konča.
select p.full_name, u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) not in (select email from _imena)
  and position(' ' in btrim(p.full_name)) > 0
  and lower(translate(split_part(btrim(p.full_name), ' ', 1),
                      'ČčĆćŽžŠšĐđ', 'CcCcZzSsDd'))
      = lower(split_part(split_part(u.email, '@', 1), '.', 1))
order by p.full_name;

commit;

-- Preveri po zagonu — imenik mora biti razvrščen po priimku:
--   select full_name from public.profiles order by full_name limit 10;

-- =====================================================================
--  2 / 3  MATIČNE ŠTEVILKE  (šifre zaposlenih, 69 oseb)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Matične številke (šifre zaposlenih) — uskladitev s kadrovskim izvozom
-- "Seznam zaposlenih ZN - vse" (69 oseb).
--
-- Vir je kadrovska evidenca, zato je TA datoteka merodajna: obstoječe
-- vrednosti se PREPIŠEJO. (Prejšnji seed je z coalesce() ščitil ročne
-- popravke v Imeniku; tokrat je izrecno naročeno, da velja izvoz.)
--
-- Ujemanje teče po e-pošti iz auth.users — ta je v izvozu enolična za
-- vseh 69 vrstic, medtem ko se imena med sistemi pišejo različno
-- (HROVAT/HORVAT ...). Ime je uporabljeno samo kot rezerva, kadar
-- e-pošta v auth.users še ne obstaja.
--
-- Skripta je idempotentna — ponovni zagon ne spremeni ničesar.
-- Poženi v Supabase → SQL Editor.
-- ---------------------------------------------------------------------

begin;

create temporary table _kadrovska (
  employee_code text not null,
  email text not null,
  full_name text not null
) on commit drop;

insert into _kadrovska (employee_code, email, full_name) values
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
  ('1143', 'luka.stare@pb-begunje.si', 'STARE LUKA'),
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
  ('974', 'maja.miljkovic@pb-begunje.si', 'VREVC MAJA');

-- Poveži vsako vrstico s profilom: najprej po e-pošti, sicer po imenu.
-- "limit 1" v podpoizvedbi je nujen — če bi imela dva profila enako
-- ime, bi navaden join podvojil vrstico kadrovske.
create temporary table _ujemanje on commit drop as
select k.employee_code,
       k.email,
       k.full_name,
       coalesce(
         (select u.id from auth.users u where lower(u.email) = k.email limit 1),
         (select p.id from public.profiles p where upper(p.full_name) = upper(k.full_name) limit 1)
       ) as profile_id,
       case when exists (select 1 from auth.users u where lower(u.email) = k.email) then 'e-pošta'
            when exists (select 1 from public.profiles p where upper(p.full_name) = upper(k.full_name)) then 'ime'
            else null end as kljuc
from _kadrovska k;

-- Če bi dve vrstici kadrovske pokazali na isti profil (ujemanje po imenu),
-- bi "on conflict do update" odpovedal z "cannot affect row a second time".
-- Tak primer je napaka v podatkih, ne nekaj, kar bi smeli tiho izbrati:
do $$
declare v_podvojeni text;
begin
  select string_agg(imena, '; ') into v_podvojeni
  from (select string_agg(full_name, ' = ' order by full_name) as imena
        from _ujemanje where profile_id is not null
        group by profile_id having count(*) > 1) t;
  if v_podvojeni is not null then
    raise exception 'Dve vrstici kadrovske kažeta na isti profil: %', v_podvojeni;
  end if;
end $$;

-- Kdo se ni ujemal (nima še računa v aplikaciji) — izpiše se na koncu.
insert into public.profile_hr_details (profile_id, employee_code)
select profile_id, employee_code from _ujemanje where profile_id is not null
on conflict (profile_id) do update
  set employee_code = excluded.employee_code,
      updated_at = now();

-- Nadzorni izpis: koliko usklajenih in kdo je izpadel.
select kljuc, count(*) as oseb from _ujemanje where profile_id is not null group by kljuc;
select full_name, employee_code, email from _ujemanje where profile_id is null order by full_name;

commit;

-- Preveri po zagonu (mora vrniti 69 oz. toliko, kolikor je oseb z računom):
--   select count(*) from public.profile_hr_details where employee_code is not null;

-- =====================================================================
--  3 / 3  DEŽURNI KADER  (članstvo za vseh 14)
-- =====================================================================

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
