-- Enkratna skripta: nastavi vloge admin/vodja glede na ZAPOSLENI_1.8.xlsx (stolpec STATUS).
-- Poženi VSAKIC, ko se novi ljudje s spodnjega seznama registrirajo (varno za ponovni zagon --
-- update prizadene samo ze obstojece profile, e-poste, ki se niso registrirale, se preprosto
-- ne ujemajo z nobeno vrstico in ostanejo nedotaknjene).

-- Administratorji (STROKOVNI VODJA / PDZN):
update public.profili set role = 'admin'
where id in (select id from auth.users where email in ('dino.alukic@pb-begunje.si', 'matej.bojic@pb-begunje.si', 'denis.dzamastagic@pb-begunje.si'));

-- Vodje ekip/oddelkov:
update public.profili set role = 'vodja'
where id in (select id from auth.users where email in (
  'grega.arnez@pb-begunje.si',
  'tea.bizjak@pb-begunje.si',
  'nina.hrovat@pb-begunje.si', -- POZOR: ta datoteka pise "Hrovat", prejsnja analiza in koda uporabljata "Horvat" - glej roster/README.md, popravi email pred uporabo, ce je "Horvat" pravilno
  'dijana.lelic@pb-begunje.si',
  'mateja.lunar@pb-begunje.si',
  'aleksander.maglic@pb-begunje.si',
  'magdalena.mavritratnik@pb-begunje.si',
  'rebeka.misotic@pb-begunje.si',
  'ines.music@pb-begunje.si',
  'amal.perviz@pb-begunje.si',
  'teja.pogacnik@pb-begunje.si',
  'marusa.salkic@pb-begunje.si',
  'nikolina.sofric@pb-begunje.si',
  'petra.subic@pb-begunje.si',
  'simona.tomazevic@pb-begunje.si',
  'tanja.torkar@pb-begunje.si',
  'sasa.trpin@pb-begunje.si',
  'metka.veluscek@pb-begunje.si'
));

-- Preveri rezultat (kdo je zdaj kaj, in kdo od zgornjih se se ni registriral):
select u.email, p.full_name, p.role
from auth.users u left join public.profili p on p.id = u.id
where u.email in ('dino.alukic@pb-begunje.si', 'grega.arnez@pb-begunje.si', 'tea.bizjak@pb-begunje.si', 'matej.bojic@pb-begunje.si', 'nina.hrovat@pb-begunje.si', 'sasa.humar@pb-begunje.si', 'dijana.lelic@pb-begunje.si', 'mateja.lunar@pb-begunje.si', 'aleksander.maglic@pb-begunje.si', 'magdalena.mavritratnik@pb-begunje.si', 'rebeka.misotic@pb-begunje.si', 'ines.music@pb-begunje.si', 'amal.perviz@pb-begunje.si', 'teja.pogacnik@pb-begunje.si', 'marusa.salkic@pb-begunje.si', 'nikolina.sofric@pb-begunje.si', 'petra.subic@pb-begunje.si', 'simona.tomazevic@pb-begunje.si', 'tanja.torkar@pb-begunje.si', 'sasa.trpin@pb-begunje.si', 'denis.dzamastagic@pb-begunje.si', 'metka.veluscek@pb-begunje.si', 'anja.bajt@pb-begunje.si', 'nelvedin.becirovic@pb-begunje.si', 'marija.bratusa@pb-begunje.si', 'mark.djedovic@pb-begunje.si', 'tomaz.dolar@pb-begunje.si', 'amin.dzinic@pb-begunje.si', 'gentiana.gashi@pb-begunje.si', 'ajla.huseinbasic@pb-begunje.si', 'sara.jereb@pb-begunje.si', 'jure.karnicar@pb-begunje.si', 'nadja.kodras@pb-begunje.si', 'eva.kogoj@pb-begunje.si', 'marko.kvrzic@pb-begunje.si', 'antonina.maler@pb-begunje.si', 'jaka.meglic@pb-begunje.si', 'simona.mocnik@pb-begunje.si', 'uros.mravlje@pb-begunje.si', 'alma.muric@pb-begunje.si', 'alen.music@pb-begunje.si', 'merima.nuhanovic@pb-begunje.si', 'renata.peterman@pb-begunje.si', 'matej.pogacnik@pb-begunje.si', 'luka.rant@pb-begunje.si', 'jana.rejc@pb-begunje.si', 'elma.rekic@pb-begunje.si', 'anka.rozman@pb-begunje.si', 'klara.rozman@pb-begunje.si', 'natasa.smolej@pb-begunje.si', 'barbara.sodja@pb-begunje.si', 'erik.starc@pb-begunje.si', 'luka.stare@pb-begunje.si', 'jaka.susnik@pb-begunje.si', 'robert.svetina@pb-begunje.si', 'sabina.svetina@pb-begunje.si', 'sebina.sabic@pb-begunje.si', 'mark.skantar@pb-begunje.si', 'amira.talic@pb-begunje.si', 'nikolina.tomasic@pb-begunje.si', 'mojca.uranker@pb-begunje.si', 'enej.valjavec@pb-begunje.si', 'nejc.volaric@pb-begunje.si', 'urska.vovk@pb-begunje.si', 'neja.vozel@pb-begunje.si', 'maja.vrevc@pb-begunje.si', 'almedin.zekan@pb-begunje.si', 'aldin.gazibara@pb-begunje.si', 'dejan.vozel@pb-begunje.si')
order by p.role, u.email;
