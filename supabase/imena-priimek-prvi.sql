-- ---------------------------------------------------------------------
-- Enoten zapis imen: povsod "Priimek Ime" (69 oseb).
--
-- Doslej sta v bazi soobstajala oba zapisa — večina "Ime Priimek"
-- (Aldin Gazibara), trije administratorji pa "PRIIMEK IME". To ni bilo
-- le vprašanje videza: imenik se razvršča po full_name, torej po OSEBNEM
-- imenu namesto po priimku, autoParafa() v index.html pa je za priimek
-- jemala napačni del ("Aldin Gazibara" -> "ALD" namesto "GAZ").
--
-- ZAKAJ JE VRSTNI RED ZANESLJIV: imena so iz kadrovskega izvoza, ki je
-- zapisan kot "PRIIMEK IME". Za vseh 69 vrstic je preverjeno, da se
-- ZADNJA beseda ujema z osebnim imenom iz e-pošte (ime.priimek@), zato
-- je znano, kateri del je priimek tudi pri dvobesednem ("MAVRI TRATNIK
-- MAGDALENA" -> "Mavri Tratnik Magdalena"). Samodejnega obračanja po
-- pravilu "zadnja beseda je priimek" NAMENOMA ni — tak priimek bi
-- obrnilo narobe.
--
-- ZAKAJ EN SAM STAVEK IN BREZ ZAČASNIH TABEL: Supabase SQL Editor
-- poganja stavke prek povezovalnika, kjer vsak stavek lahko dobi svojo
-- sejo. Začasna tabela iz prejšnjega stavka takrat ne obstaja več
-- ("relation _imena does not exist"). Seznam je zato vpisan neposredno
-- v poizvedbo.
--
-- Ujemanje po e-pošti iz auth.users, ne po imenu, ki ga prav ta poizvedba
-- spreminja. Varno za ponovni zagon: drugič ne spremeni ničesar.
-- ---------------------------------------------------------------------

with vhod (email, polno) as (
  values
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
    ('maja.miljkovic@pb-begunje.si', 'Vrevc Maja')
),
posodobitev as (
  update public.profiles p
  set full_name = v.polno
  from vhod v
  join auth.users u on lower(u.email) = v.email
  where p.id = u.id
    and p.full_name is distinct from v.polno
  returning p.id
)
select 'preimenovanih' as kaj, count(*)::text as podrobnost from posodobitev
union all
-- Kdo iz seznama še nima računa (teh ni mogoče preimenovati).
select 'še nima računa', v.email
from vhod v
where not exists (select 1 from auth.users u where lower(u.email) = v.email)
union all
-- Profili zunaj seznama, ki so videti zapisani obratno ("Ime Priimek"):
-- prva beseda se ujema z osebnim imenom iz e-pošte. Te je treba popraviti
-- ročno v Imeniku — poizvedba jih namenoma ne ugiba, ker pri dvobesednem
-- priimku ni mogoče vedeti, kje se priimek konča.
select 'ročno preveri (zunaj seznama)', p.full_name || '  <' || u.email || '>'
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) not in (select email from vhod)
  and position(' ' in btrim(p.full_name)) > 0
  and lower(translate(split_part(btrim(p.full_name), ' ', 1),
                      'ČčĆćŽžŠšĐđ', 'CcCcZzSsDd'))
      = lower(split_part(split_part(u.email, '@', 1), '.', 1))
order by 1, 2;
