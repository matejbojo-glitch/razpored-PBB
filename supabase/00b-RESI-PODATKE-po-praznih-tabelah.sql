-- ---------------------------------------------------------------------
-- REŠEVANJE PODATKOV: podatki so ostali v starih (angleških) tabelah
--
-- KDAJ TO POTREBUJEŠ
-- Če si schema.sql pognal, NE DA bi prej pognal 00-preimenuj-tabele.sql.
-- Takrat je nastalo 25 PRAZNIH tabel s slovenskimi imeni POLEG starih
-- angleških, v katerih so vsi tvoji podatki. Aplikacija bere nove (prazne),
-- zato kaže prazen razpored, manjkajo gumbi Generator/Statistika (ker tvoj
-- profil ni v novi tabeli profili, aplikacija ne ve, da si admin), v
-- koledarju pa se namesto letnega dopusta izpiše "prosto".
--
-- Preveri z:
--   select count(*) from public.schedule_entries;  -- stara: tvoji podatki
--   select count(*) from public.razpored;          -- nova: verjetno 0
--
-- KAJ NAREDI
-- Za vsak par (stara angleška, nova slovenska): ČE nova obstaja in je
-- PRAZNA, stara pa obstaja in ima vrstice, potem novo prazno odvrže in
-- staro preimenuje na njeno mesto. Podatki, indeksi in tuji ključi ostanejo.
--
-- VARNOST
-- Tabele s podatki se NIKOLI ne odvrže. Če ima nova tabela že kakšno
-- vrstico, se par preskoči in izpiše opozorilo - takrat se oglasi, ker je
-- treba podatke združiti ročno.
--
-- KAKO POGNATI (Supabase -> SQL Editor)
--   1. to datoteko
--   2. nato supabase/schema.sql  (obnovi poglede, politike in tuje ključe)
-- ---------------------------------------------------------------------

do $$
declare
  par record;
  vrstic_nova bigint;
  vrstic_stara bigint;
  presteto int := 0;
  preskoceno int := 0;
begin
  for par in
    select * from (values
      ('profiles',                'profili'),
      ('schedule_entries',        'razpored'),
      ('leave_entries',           'odsotnosti'),
      ('employee_wishes',         'zelje_zaposlenih'),
      ('departments',             'oddelki'),
      ('lead_departments',        'nosilci_oddelkov'),
      ('profile_departments',     'pokriva_oddelek'),
      ('profile_hr_details',      'kadrovski_podatki'),
      ('swap_requests',           'zahtevki_za_menjavo'),
      ('duty_doctors',            'dezurni_zdravniki'),
      ('notifications',           'obvestila'),
      ('notification_settings',   'nastavitve_obvestil'),
      ('push_subscriptions',      'potisne_narocnine'),
      ('calendar_tokens',         'koledarski_zetoni'),
      ('absence_color_map',       'barvne_oznake'),
      ('contact_imports',         'uvozi_kontaktov'),
      ('contact_phones',          'telefoni_kontaktov'),
      ('department_shift_minimums','minimalna_zasedba'),
      ('leave_balance_history',   'zgodovina_dopusta'),
      ('profiles_log',            'dnevnik_profilov'),
      ('schedule_entries_log',    'dnevnik_razporeda'),
      ('leave_entries_log',       'dnevnik_odsotnosti'),
      ('admin_view_as_log',       'dnevnik_ogledov')
    ) as t(stara, nova)
  loop
    -- Oba morata obstajati, sicer ni česa reševati.
    if to_regclass('public.' || par.stara) is null then continue; end if;
    if to_regclass('public.' || par.nova)  is null then continue; end if;

    execute format('select count(*) from public.%I', par.nova)  into vrstic_nova;
    execute format('select count(*) from public.%I', par.stara) into vrstic_stara;

    if vrstic_nova > 0 then
      -- Nova tabela ni prazna - ne diramo je. To je pričakovano pri
      -- šifrantih (oddelki, nosilci_oddelkov, minimalna_zasedba), ki jih
      -- schema.sql sama napolni; takrat je stara tabela le odvečen ostanek
      -- in ni česa reševati.
      if vrstic_nova = vrstic_stara then
        raise notice 'PRESKOČENO (in to je v redu): % ima % vrstic - napolnila jo je schema.sql. Stara % z enakim številom vrstic je le ostanek; podatki NISO izgubljeni.',
          par.nova, vrstic_nova, par.stara;
      else
        raise warning 'PRESKOČENO: % ima % vrstic, stara % pa % - števili se RAZLIKUJETA. Ničesar nisem spremenil; javi se, da to pogledava skupaj.',
          par.nova, vrstic_nova, par.stara, vrstic_stara;
      end if;
      preskoceno := preskoceno + 1;
      continue;
    end if;

    if vrstic_stara = 0 then
      -- Obe prazni: nič se ne izgubi, a tudi ni česa reševati. Prazno novo
      -- vseeno odvržemo in staro preimenujemo, da ostane ena sama tabela.
      execute format('drop table public.%I cascade', par.nova);
      execute format('alter table public.%I rename to %I', par.stara, par.nova);
      raise notice 'obe prazni, združeno: % -> %', par.stara, par.nova;
      presteto := presteto + 1;
      continue;
    end if;

    -- Glavni primer: stara ima podatke, nova je prazna.
    execute format('drop table public.%I cascade', par.nova);
    execute format('alter table public.%I rename to %I', par.stara, par.nova);
    raise notice 'REŠENO: % (% vrstic) -> %', par.stara, vrstic_stara, par.nova;
    presteto := presteto + 1;
  end loop;

  raise notice '---';
  raise notice 'Preimenovanih tabel: %', presteto;
  if preskoceno > 0 then
    raise notice 'Preskočenih (nova ni bila prazna): % - glej opozorila zgoraj.', preskoceno;
  end if;
  raise notice 'ZDAJ POŽENI ŠE supabase/schema.sql, da se obnovijo pogledi,';
  raise notice 'politike in tuji ključi, ki jih je odvrgel "drop ... cascade".';
end $$;
