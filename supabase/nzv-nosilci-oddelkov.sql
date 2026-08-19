-- ---------------------------------------------------------------------
-- NZV: nosilci oddelkov, pravila dežurstva in SEZNAM POKRIVANJ
--
-- Vir: Predloga_razporeda_682026_2.xlsx, zavihek "Zaposleni - Oddelki"
-- (20 vodij/administratorjev). Ta datoteka je NOVEJŠA od vrednosti, ki so
-- bile v shemi ob prvi postavitvi - npr. Alukić Dino je bil tam PDZN,
-- v resnici pa je nosilec ŽO.
--
-- Kaj prinese novega:
--   - enote: nosilec ima lahko VEČ oddelkov ("C/C1", "B1/SOB/NOB"). Zato
--     nov stolpec "enote" kot prosto besedilo - department_code ima tuji
--     ključ na departments in take kombinacije zavrne (ista rešitev kot
--     pokriva_oddelek pri FLEXI). department_code ostane PRVA prepoznana
--     koda, da obstoječi pogledi delajo naprej.
--   - nadomesca: kdo prevzame ob odsotnosti (LD, BS) - to je "seznam
--     pokrivanj", ki se prikaže v Imenik -> Razpredelnica.
--   - pravila dežurstva (dovoljeno / max na mesec / samo med tednom),
--     omejitev ur na dan in trenutna daljša odsotnost.
--
-- Opomba k imenom: v opombah so zapisana v obliki "Ime Priimek" in ne
-- vedno z istimi strešicami ("Dijana Lelić" proti "Lelič Dijana"), zato
-- se nadomeščevalec poišče po priimku BREZ strešic.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
alter table public.lead_departments add column if not exists enote text;
alter table public.lead_departments add column if not exists inicialke text;
alter table public.lead_departments add column if not exists mat_st text;
alter table public.lead_departments add column if not exists letni_dopust_dni integer;

insert into public.lead_departments
  (full_name, inicialke, mat_st, department_code, enote, letni_dopust_dni,
   dezurstvo_dovoljeno, max_mesecno, samo_med_tednom, ur_na_dan,
   odsotnost_tip, odsotnost_do, nadomesca, opomba)
values
  ('ALUKIĆ DINO', 'ALU', '823', 'ZO', 'ŽO', 12, true, null, false, null, null, null, 'BOJIĆ MATEJ', 'ob odsotnosti (LD, BS) nadomeščanje Bojić Matej'),
  ('ARNEŽ GREGA', 'ARN', '1092', 'C', 'C/C1', 27, true, null, false, null, null, null, 'LUNAR MATEJA', 'ob odsotnosti (LD, BS) nadomeščanje Lunar Mateja'),
  ('BIZJAK TEA', 'BIZ', '989', 'URGENCA', 'UA/SA/B2', 8, false, null, false, 6, null, null, null, 'delo po 6 ur'),
  ('BOJIĆ MATEJ', 'BOJ', '855', 'MO', 'MO', 25, true, null, false, null, null, null, 'ALUKIĆ DINO', 'ob odsotnosti (LD, BS) nadomeščanje Dino Alukić'),
  ('DŽAMASTAGIĆ DENIS', 'DŽA', '912', 'PDZN', 'PDZN', 19, true, null, false, null, null, null, 'ALUKIĆ DINO', 'Pomočnik direktorja za zdravstveno nego, ob odsotnosti (LD, BS) nadomeščanje Dino Alukić, v primeru odsotnostih obeh Matej Bojić'),
  ('HROVAT NINA', 'HRO', '820', 'DB', 'DB', 23, true, null, false, null, null, null, 'TORKAR TANJA', 'ob odsotnosti (LD, BS) nadomeščanje Torkar Tanja'),
  ('HUMAR SAŠA', 'HUM', '705', 'SA', 'SA', 32, false, null, false, null, null, null, 'BIZJAK TEA', 'ob odsotnosti (LD, BS) nadomeščanje Bizjak Tea, v primeru odsotnostih obeh Trpin Saša'),
  ('LELIČ DIJANA', 'LEL', '1090', 'E2', 'E2/E1', 20, false, null, false, null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('LUNAR MATEJA', 'LUN', '844', 'B', 'B', 28, true, null, false, null, null, null, 'ARNEŽ GREGA', 'ob odsotnosti (LD, BS) nadomeščanje Arnež Grega'),
  ('MAGLIĆ ALEKSANDER', 'MAG', '1001', 'E1', 'E1/D', 18, false, null, false, null, null, null, 'LELIČ DIJANA', 'ob odsotnosti (LD, BS) nadomeščanje Dijana Lelić'),
  ('MAVRI TRATNIK MAGDALENA', 'TRA', '833', 'B1B2', 'B1/SOB/NOB', 29, true, null, false, null, null, null, 'ŠUBIC PETRA', 'ob odsotnosti (LD, BS) nadomeščanje Šubic Petra'),
  ('MUŠIČ INES', 'MUŠ', '926', 'URGENCA', 'UA/SA', 27, false, null, false, 7, null, null, null, 'delo po 7 ur'),
  ('PERVIZ AMAL', 'PER', '887', 'D', 'D', 12, true, null, false, null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('POGAČNIK TEJA', 'POG', '1058', 'E1', 'E1', 35, false, null, false, null, 'porodniška', '2027-07-31', null, 'trenutno porodniška - do julij 2027'),
  ('SALKIĆ MARUŠA', 'SAL', '925', 'C1', 'C1', 19, true, 1, true, null, null, null, null, '1x dežurstvo na mesec med tednom'),
  ('ŠUBIC PETRA', 'ŠUB', '905', 'B1B2', 'B1/SOB/NOB', 28, true, null, false, null, null, null, 'MAVRI TRATNIK MAGDALENA', 'ob odsotnosti (LD, BS) Magdalena Mavri Tratnik'),
  -- Nosilka enote A IN enote PO (uporabnikova navedba, avgust 2026) -
  -- PO doslej ni imela nobenega nosilca, zato je stolpec v NZV mreži
  -- ostajal prazen.
  ('TOMAŽEVIČ SIMONA', 'TOM', '793', 'A', 'A/PO', 37, true, null, false, null, null, null, 'VELUŠČEK METKA', 'ob odsotnosti (LD, BS) nadomeščanje Velušček Metka'),
  ('TORKAR TANJA', 'TOR', '965', 'DB', 'DB', 23, true, null, false, null, null, null, 'HROVAT NINA', 'ob odsotnosti (LD, BS) nadomeščanje Hrovat Nina'),
  ('TRPIN SAŠA', 'TRP', '870', 'URGENCA', 'UA/SA', 17, true, 1, true, null, null, null, 'BIZJAK TEA', 'ob odsotnosti (LD, BS) Bizjak Tea, Musić Ines'),
  ('VELUŠČEK METKA', 'VEL', '834', 'SOBO', 'SOBO', 41, true, 2, false, null, null, null, 'DŽAMASTAGIĆ DENIS', 'ob odsotnosti (LD, BS) nadomeščanje Džamastagić Denis')
on conflict (full_name) do update set
  inicialke = excluded.inicialke,
  mat_st = excluded.mat_st,
  department_code = coalesce(excluded.department_code, public.lead_departments.department_code),
  enote = excluded.enote,
  letni_dopust_dni = excluded.letni_dopust_dni,
  dezurstvo_dovoljeno = excluded.dezurstvo_dovoljeno,
  max_mesecno = excluded.max_mesecno,
  samo_med_tednom = excluded.samo_med_tednom,
  ur_na_dan = excluded.ur_na_dan,
  odsotnost_tip = excluded.odsotnost_tip,
  odsotnost_do = excluded.odsotnost_do,
  nadomesca = excluded.nadomesca,
  opomba = excluded.opomba;

-- Kontrola: kdo nosi katere enote in kdo ga nadomešča.
select full_name, inicialke, department_code, enote, nadomesca,
       dezurstvo_dovoljeno, max_mesecno, samo_med_tednom, ur_na_dan, odsotnost_tip
from public.lead_departments
order by full_name;
