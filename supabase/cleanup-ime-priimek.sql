-- ---------------------------------------------------------------------
-- Čiščenje: profiles.full_name, ki so še vedno zapisani "Ime Priimek"
-- namesto standardnega "Priimek Ime" (glej schema.sql, razdelek 35).
--
-- Kaj naredi:
--   1) Samodejno popravi VELIKE ČRKE ("ALUKIĆ DINO" -> "Alukić Dino") -
--      isto pravilo, ki ga odslej sproti uveljavlja sprožilec
--      trg_standardiziraj_polno_ime (schema.sql, razdelek 35). Ta korak je
--      tu samo za bazo, kjer schema.sql še ni bil ponovno pognan.
--   2) Samodejno OBRNE dvobesedna imena, kjer prva beseda ustreza
--      osebnemu imenu iz e-pošte (ime.priimek@) - npr. "Maja Vrevc" pri
--      maja.vrevc@... -> "Vrevc Maja". Samo za DVE besedi, ker pri treh in
--      več (npr. "Mavri Tratnik Magdalena") ni zanesljivo, kje se priimek
--      konča - take izpiše spodaj za ROČNI pregled, ne ugiba.
--   3) Izpiše preostale sumljive zapise (prva beseda = osebno ime iz
--      e-pošte, a TRI ali več besed) za ročni popravek v Imeniku.
--
-- Ujemanje gre po e-pošti (auth.users), diakritike se pri primerjavi
-- odstranijo (Č/Ć/Š/Ž/Đ -> C/C/S/Z/D), ker jih ime.priimek@ naslov nima.
-- Varno za ponovni zagon: drugi zagon ne spremeni ničesar.
-- ---------------------------------------------------------------------

-- 1) VELIKE ČRKE -> "Priimek Ime"
do $$
declare v_st int;
begin
  with popravljeni as (
    update public.profiles
    set full_name = initcap(full_name)
    where full_name is not null
      and full_name <> ''
      and full_name = upper(full_name)
      and full_name <> initcap(full_name)
    returning 1
  )
  select count(*) into v_st from popravljeni;
  raise notice 'Iz VELIKIH ČRK v "Priimek Ime": %', v_st;
end $$;

-- 2) Dvobesedna imena v obratnem vrstnem redu -> obrni
do $$
declare v_st int;
begin
  with kandidati as (
    select p.id, p.full_name,
           split_part(btrim(p.full_name), ' ', 1) as beseda1,
           split_part(btrim(p.full_name), ' ', 2) as beseda2
    from public.profiles p
    join auth.users u on u.id = p.id
    where array_length(regexp_split_to_array(btrim(p.full_name), '\s+'), 1) = 2
      and lower(translate(split_part(btrim(p.full_name), ' ', 1), 'ČčĆćŽžŠšĐđ', 'CcCcZzSsDd'))
          = lower(split_part(split_part(u.email, '@', 1), '.', 1))
  ),
  popravljeni as (
    update public.profiles p
    set full_name = initcap(k.beseda2 || ' ' || k.beseda1)
    from kandidati k
    where p.id = k.id
    returning 1
  )
  select count(*) into v_st from popravljeni;
  raise notice 'Obrnjenih dvobesednih imen ("Ime Priimek" -> "Priimek Ime"): %', v_st;
end $$;

-- 3) Preostali sumljivi zapisi (tri ali več besed) - SAMO izpis, brez
--    samodejnega popravka; popravi ročno v Imeniku.
select p.full_name, u.email
from public.profiles p
join auth.users u on u.id = p.id
where array_length(regexp_split_to_array(btrim(p.full_name), '\s+'), 1) >= 3
  and lower(translate(split_part(btrim(p.full_name), ' ', 1), 'ČčĆćŽžŠšĐđ', 'CcCcZzSsDd'))
      = lower(split_part(split_part(u.email, '@', 1), '.', 1))
order by p.full_name;
