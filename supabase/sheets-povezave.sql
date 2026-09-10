-- Razpored PBB – POVEZANI GOOGLE LISTI (sheet_connections)
--
-- ZAKAJ
-- Doslej je bila povezava do Google Sheets shranjena v brskalniku posamezne
-- osebe (localStorage, ključ "kalup-sheets-url-<oddelek>"). To pomeni: druga
-- oseba na drugem računalniku je ni videla, ob čiščenju brskalnika je
-- izginila, in nikjer ni bilo zapisano, KATERI zavihek katerega dokumenta
-- pripada kateremu oddelku.
--
-- Ta tabela je edini vir resnice za to. Koda nikjer ne vsebuje
-- spreadsheet_id ali imena zavihka - nov dokument je nova vrstica tukaj.
--
-- ZAKAJ IME ZAVIHKA IN NE gid
-- gid je stabilen, dokler zavihka nihče ne izbriše in znova ustvari; ime pa
-- je tisto, kar vidita človek in Sheets API pri branju obsega ("B!A1:ZZ3000").
-- gid je zato shranjen samo za orientacijo in se nikjer ne uporablja za
-- naslavljanje.
--
-- PRIVZETO JE VSE UGASNJENO
-- Nova vrstica ne začne pisati v uradni dokument, dokler je nekdo izrecno ne
-- vklopi. Pri razporedu, ki ga bere cel oddelek, je tiho samodejno pisanje
-- nevarnejše od enega dodatnega klika.
--
-- Skripta je varno ponovljiva.

-- 1) Tabela --------------------------------------------------------------
create table if not exists public.sheet_connections (
  id              uuid primary key default gen_random_uuid(),
  oznaka          text not null,                     -- "2026 SMS RAZPORED – B"
  skupina         text not null,                     -- 'B','C','C1','D','E1','E2','FLEXI','NZV'
  spreadsheet_id  text not null,
  zavihek         text not null,                     -- IME zavihka, ne gid
  gid             text,                              -- samo za orientacijo
  oblika          text not null default 'oddelek',   -- 'oddelek' | 'flexi' | 'nzv'
  app_v_sheets    boolean not null default false,
  sheets_v_app    boolean not null default false,
  -- Ali se poleg vrednosti prenese tudi BARVA celice (po šifrantu izmen).
  -- Ločeno stikalo, ker barvanje prepiše ročno oblikovanje tistih celic.
  barve           boolean not null default false,
  aktivno         boolean not null default false,
  opomba          text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profili(id),
  constraint sheet_connections_oblika_check check (oblika in ('oddelek','flexi','nzv')),
  unique (spreadsheet_id, zavihek)
);

-- Za baze, kjer je tabela nastala prej (stolpec "barve" je iz septembra
-- 2026), da ponoven zagon te skripte ne zahteva ročnega popravka.
alter table public.sheet_connections
  add column if not exists barve boolean not null default false;

comment on table public.sheet_connections is
  'Kateri zavihek katerega Google dokumenta pripada kateremu oddelku in v katero smer se sme sinhronizirati. Privzeto je vse ugasnjeno.';

-- 2) Kdo sme kaj ---------------------------------------------------------
-- Isti vzorec kot oddelki/minimalna_zasedba: samo administrator. Povezava
-- do uradnega dokumenta ni stvar, ki bi jo smel spreminjati kdorkoli.
alter table public.sheet_connections enable row level security;

drop policy if exists sheet_connections_admin on public.sheet_connections;
create policy sheet_connections_admin on public.sheet_connections
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- 3) Zavihki dokumenta "2026 SMS RAZPORED" -------------------------------
-- ID dokumenta "2026 SMS RAZPORED" je že vpisan. Za DRUG dokument ga vzemi
-- iz njegovega naslova - to je niz med "/d/" in "/edit":
--   docs.google.com/spreadsheets/d/<TU_JE_ID>/edit#gid=...
--
-- Odkomentiran je SAMO oddelek B - pilotni oddelek (razdelek 8 načrta).
-- Ostale odkomentiraj šele, ko bo pilot tekel brez pripomb.
--
-- Vrstice so zapisane z "on conflict do nothing", da ponovni zagon skripte
-- ne povozi nastavitev, ki jih je nekdo medtem vklopil v aplikaciji.

insert into public.sheet_connections (oznaka, skupina, spreadsheet_id, zavihek, oblika, opomba)
values ('2026 SMS RAZPORED – B', 'B', '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'B', 'oddelek',
        'Pilotni oddelek. Datum je v stolpcu C, podatki se začnejo v vrstici 2.')
on conflict (spreadsheet_id, zavihek) do nothing;

-- insert into public.sheet_connections (oznaka, skupina, spreadsheet_id, zavihek, oblika, opomba)
-- values ('2026 SMS RAZPORED – C',    'C',    '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'C',    'oddelek', 'Dva bloka drug ob drugem.'),
--        ('2026 SMS RAZPORED – C1',   'C1',   '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'C1',   'oddelek', 'En blok, datum v stolpcu B.'),
--        ('2026 SMS RAZPORED – D',    'D',    '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'D',    'oddelek', 'En blok, brez FLEXI parov.'),
--        ('2026 SMS RAZPORED – E1',   'E1',   '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'E1',   'oddelek', 'Dva bloka, datum v stolpcu C.'),
--        ('2026 SMS RAZPORED – E2',   'E2',   '1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'E2',   'oddelek', 'Dva bloka.'),
--        ('2026 SMS RAZPORED – FLEXI','FLEXI','1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4', 'FLEXI','flexi',   'Pari stolpcev (oddelek + izmena) na osebo.')
-- on conflict (spreadsheet_id, zavihek) do nothing;

-- 4) Preverjanje ---------------------------------------------------------
-- select oznaka, skupina, zavihek, oblika, aktivno, app_v_sheets, sheets_v_app
--   from public.sheet_connections order by skupina;
