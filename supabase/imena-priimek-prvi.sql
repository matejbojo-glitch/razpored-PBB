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
