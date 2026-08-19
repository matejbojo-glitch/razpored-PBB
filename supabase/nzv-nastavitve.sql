-- ---------------------------------------------------------------------
-- NZV: nastavitve, ki jih ureja administrator
--
-- Zaenkrat samo izmenična zasedba SA (specialistična ambulanta):
-- "SA je izmenično 1 teden dopoldne, drug teden popoldne, večinoma
-- Humar, Trpin, Bizjak; poleti je samo dopoldne."
--
-- Zakaj tabela in ne trdo v kodo: kateri teden je dopoldanski in kateri
-- meseci štejejo za "poletje", se lahko spremeni. Administrator to
-- popravi v aplikaciji (Po oddelkih -> NZV, vrstica nad mrežo), brez
-- posega v kodo in brez novega uvoza.
--
-- Ključi:
--   sa_liho_teden       'dop' ali 'pop' - kaj je SA v LIHIH ISO tednih
--                       (v sodih je samodejno obratno). Privzeto 'dop'.
--   sa_poletni_meseci   seznam mesecev, v katerih je SA SAMO dopoldne,
--                       npr. '7,8'. Prazna vrednost = ni poletne izjeme.
--
-- Vrednost je namenoma besedilo: tabela je splošna in bo sprejela tudi
-- prihodnje nastavitve, ne da bi jo bilo treba spreminjati.
--
-- URGENCA 2 (stolpec U2) NAMENOMA nima samodejnega pravila - kdo je tam,
-- določi administrator z objavo razporeda (uvoz iz Sheets, stolpec "U2").
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
create table if not exists public.nzv_nastavitve (
  kljuc text primary key,
  vrednost text,
  updated_at timestamptz not null default now()
);

alter table public.nzv_nastavitve enable row level security;

-- Brati mora vsak, ki vidi NZV mrežo (nastavitev vpliva na prikaz).
drop policy if exists nzv_nastavitve_select on public.nzv_nastavitve;
create policy nzv_nastavitve_select on public.nzv_nastavitve
  for select to authenticated using (true);

-- Pisati sme samo administrator.
drop policy if exists nzv_nastavitve_write on public.nzv_nastavitve;
create policy nzv_nastavitve_write on public.nzv_nastavitve
  for all to authenticated
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

-- Privzete vrednosti. "do nothing" pomeni, da poznejši popravki
-- administratorja v aplikaciji ob ponovnem zagonu te datoteke NE
-- padejo nazaj na privzeto.
insert into public.nzv_nastavitve (kljuc, vrednost) values
  ('sa_liho_teden', 'dop'),
  ('sa_poletni_meseci', '7,8')
on conflict (kljuc) do nothing;
