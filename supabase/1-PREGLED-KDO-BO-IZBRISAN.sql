-- =====================================================================
-- 1. KORAK – samo pogled, NIČ SE NE IZBRIŠE
-- =====================================================================
-- Kopiraj celotno datoteko, prilepi v Supabase → SQL Editor in klikni Run.
-- Spodaj se izpiše, koga bo 2. korak izbrisal in koliko podatkov visi na
-- njem. Če se seznam ujema s pričakovanim, poženi še 2. korak
-- (supabase/2-IZBRISI-IN-POPRAVI.sql). Ta ukaz ničesar ne spreminja.
-- =====================================================================

-- 0) PREGLED – najprej poženi SAMO tega in preveri, kdo bo izbrisan.
-- ---------------------------------------------------------------------
with cilj(email, ime) as (values
  ('alenka.zaplotnik@pb-begunje.si', 'Zaplotnik Alenka'),
  ('mustafa.sejdinovic@pb-begunje.si', 'Sejdinović Mustafa'),
  ('mija.balek@pb-begunje.si', 'Balek Mija'),
  ('luka.stare@pb-begunje.si', 'Stare Luka')
),
ids as (
  select p.id, p.full_name from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) in (select lower(c.email) from cilj c)
  union
  select p.id, p.full_name from public.profiles p, cilj c
    where public.imena_se_ujemata(p.full_name, c.ime)
)
select
  i.full_name as kaj,
  concat_ws(' · ',
    'razpored: ' || (select count(*) from public.schedule_entries s where s.employee_id = i.id),
    'menjave: '  || (select count(*) from public.swap_requests w where w.requester_id = i.id or w.target_id = i.id),
    'obrazci: '  || (select count(*) from public.obrazci o where o.vlagatelj_id = i.id or o.sodelavec_id = i.id),
    'dopust/omejitve: ' || (select count(*) from public.leave_entries l where public.imena_se_ujemata(l.full_name, i.full_name)),
    'želje: '    || (select count(*) from public.employee_wishes z where z.profile_id = i.id)
  ) as podrobnost
from ids i
order by 1;
