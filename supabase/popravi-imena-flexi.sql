-- ---------------------------------------------------------------------
-- Sedem oseb, ki se pri uvozu razporeda niso ujele z Imenikom
--
-- Zakaj: uvoz išče osebo po kratkem zapisu iz preglednice ("VREVC M.").
-- Če je ime v Imeniku zapisano drugače - v obratnem vrstnem redu
-- ("Maja Vrevc" -> kratko "MAJA V.") ali brez strešice ("Kvrzic") - se
-- ujemanje ne zgodi in VSE izmene te osebe se tiho izgubijo.
--
-- Kaj naredi: uskladi zapis imena z URADNIM seznamom zaposlenih
-- (Seznam_zaposlenih_ZN, oba izvoza se ujemata) v obliki "PRIIMEK IME".
--
-- Ujemanje gre po E-POŠTI (zanesljiv, enoličen ključ), šele če je ni, po
-- imenu brez strešic. Osebo, ki je sploh ni v Imeniku, skripta NE ustvari
-- (za to je uvoz v Imeniku, ki nastavi tudi oddelek in vlogo) - samo jo
-- izpiše na koncu.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat; drugi zagon ne spremeni ničesar.
-- ---------------------------------------------------------------------
do $$
declare
  v record;
  v_id uuid;
  v_staro text;
  v_kako text;
  v_popravljenih int := 0;
  v_ze_ok int := 0;
  v_manjka text := '';
begin
  for v in
    select * from (values
      ('nelvedin.becirovic@pb-begunje.si', 'BEĆIROVIĆ NELVEDIN'),
      ('jaka.susnik@pb-begunje.si',        'SUŠNIK JAKA'),
      ('luka.rant@pb-begunje.si',          'RANT LUKA'),
      ('barbara.sodja@pb-begunje.si',      'SODJA BARBARA'),
      ('marko.kvrzic@pb-begunje.si',       'KVRŽIĆ MARKO'),
      ('ajla.huseinbasic@pb-begunje.si',   'HUSEINBAŠIĆ AJLA'),
      -- Vrevc Maja je v Imeniku zapisana obrnjeno ("Maja Vrevc"), zato
      -- se v razporedu prikaže kot "MAJA V." namesto "VREVC M.".
      (null,                               'VREVC MAJA')
    ) as t(email, pravo_ime)
  loop
    v_id := null;

    -- 1) po e-pošti (enolično)
    if v.email is not null then
      select id, full_name into v_id, v_staro
      from public.profiles where lower(email) = lower(v.email) limit 1;
      v_kako := 'po e-pošti';
    end if;

    -- 2) sicer po imenu brez strešic, ne glede na vrstni red besed
    if v_id is null then
      select id, full_name into v_id, v_staro
      from public.profiles p
      where (
        select array_agg(w order by w) from unnest(regexp_split_to_array(
          translate(upper(trim(p.full_name)), 'ČĆŠŽĐ', 'CCSZD'), '\s+')) w
      ) = (
        select array_agg(w order by w) from unnest(regexp_split_to_array(
          translate(upper(trim(v.pravo_ime)), 'ČĆŠŽĐ', 'CCSZD'), '\s+')) w
      )
      limit 1;
      v_kako := 'po imenu (brez strešic)';
    end if;

    if v_id is null then
      v_manjka := v_manjka || '  - ' || v.pravo_ime || coalesce(' (' || v.email || ')', '') || E'\n';
    elsif v_staro is distinct from v.pravo_ime then
      update public.profiles set full_name = v.pravo_ime where id = v_id;
      v_popravljenih := v_popravljenih + 1;
      raise notice 'POPRAVLJENO (%): "%" -> "%"', v_kako, v_staro, v.pravo_ime;
    else
      v_ze_ok := v_ze_ok + 1;
      raise notice 'ŽE V REDU: "%"', v.pravo_ime;
    end if;
  end loop;

  raise notice '---';
  raise notice 'Popravljenih imen: %, že pravilnih: %', v_popravljenih, v_ze_ok;
  if v_manjka <> '' then
    raise notice 'NI V IMENIKU (dodaj jih prek Imenik -> uvoz zaposlenih, da dobijo tudi oddelek in vlogo):';
    raise notice '%', v_manjka;
  else
    raise notice 'Vseh sedem oseb je v Imeniku.';
  end if;
end $$;

-- Kontrola: kako so te osebe zapisane zdaj.
select full_name, email, department_code
from public.profiles
where translate(upper(full_name), 'ČĆŠŽĐ', 'CCSZD') in
  ('BECIROVIC NELVEDIN','SUSNIK JAKA','RANT LUKA','SODJA BARBARA',
   'KVRZIC MARKO','HUSEINBASIC AJLA','VREVC MAJA')
order by full_name;
