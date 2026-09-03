-- Kroženje (KRO) kot nova vrsta vnosa v Razpredelnici Želje.
--
-- Zakaj: oseba tisti dan dela, a po razporedu DRUGEGA oddelka. Doslej tega
-- ni bilo mogoče vpisati - koordinator je kroženje vodil zunaj aplikacije,
-- generator (admin.html -> Generator -> Oddelki) pa je osebo vseeno
-- razporedil na izmeno matičnega oddelka in zanjo ni iskal nadomestila.
--
-- Zagon: Supabase -> SQL Editor -> prilepi in poženi. Varno je pognati
-- večkrat (obe omejitvi se najprej odstranita).
--
-- Vrste vnosov po tej spremembi:
--   omejitev  rumena želja - oseba dela, a ta dan ne more na svojo izmeno
--   ld        letni dopust
--   bs        bolniški stalež
--   sti       strokovno izobraževanje
--   kro       kroženje (dela na drugem oddelku)

alter table public.odsotnosti drop constraint if exists odsotnosti_kind_check;
alter table public.odsotnosti add constraint odsotnosti_kind_check
  check (kind in ('omejitev', 'ld', 'bs', 'sti', 'kro'));

-- Ista razširitev za barvne oznake: uvoz obarvane preglednice (Želje ->
-- "Uvozi barve") preslika barvo celice v vrsto vnosa, zato mora poznati
-- iste vrste kot tabela odsotnosti - sicer bi bilo kroženje mogoče vpisati
-- ročno, ne pa uvoziti.
alter table public.barvne_oznake drop constraint if exists barvne_oznake_kind_check;
alter table public.barvne_oznake add constraint barvne_oznake_kind_check
  check (kind in ('omejitev', 'ld', 'bs', 'sti', 'kro'));

-- Pregled stanja po zagonu.
select kind, count(*) as vnosov
from public.odsotnosti
group by kind
order by kind;
