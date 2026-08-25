-- ---------------------------------------------------------------------
-- Tabela menjave_izmen + pogled pogled_menjave (predlagatelj <-> prevzemnik)
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse spodaj -> Run.
-- Pognati je varno vec kot enkrat (vse je "if not exists" / "or replace").
--
-- Prilagojeno dejanski shemi tega projekta:
--   * profili nima stolpcev "priimek_ime" in "vloga" -> uporabljamo
--     profili.full_name (zapis "Priimek Ime") in profili.role prek
--     pomoznih funkcij public.current_role_is() / public.current_department().
--   * oddelki nima uuid kljuca -> oddelki.code je text, zato oddelek_koda text.
--   * izmene so uradne kratice iz sifranta (DF12, D12, N12, N11, N10, PO5,
--     PO6, DO6, DO4, PO4, PO7, DO7, DOP, DEZ, LD, POR, STI, BS, KPU);
--     prazen niz pomeni prosto.
-- ---------------------------------------------------------------------

-- 1. Tabela zahtevkov in potrjenih menjav izmen
create table if not exists public.menjave_izmen (
    id uuid primary key default gen_random_uuid(),
    oddelek_koda text not null,
    datum_menjave date not null,

    -- Predlagatelj menjave (kdo da pobudo)
    predlagatelj_id uuid not null,
    predlagatelj_ime text not null,               -- posnetek "Priimek Ime" ob oddaji
    predlagatelj_izmena_stara text not null,
    predlagatelj_izmena_nova text,                -- prazno = prosto

    -- Prevzemnik (s kom se menja)
    prevzemnik_id uuid not null,
    prevzemnik_ime text not null,
    prevzemnik_izmena_stara text not null,
    prevzemnik_izmena_nova text,

    -- Potek menjave
    status text not null default 'v_cakanju',

    -- Opombe in revizijska sled
    razlog text,
    zavrnitev_razlog text,
    odobril_vodja_id uuid,
    odobreno_ob timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint menjave_izmen_status_check check (status = any (array[
        'v_cakanju'::text,
        'potrjeno_sodelavec'::text,
        'potrjeno_vodja'::text,
        'zavrnjeno'::text,
        'preklicano'::text
    ])),
    constraint menjave_izmen_razlicni_osebi check (predlagatelj_id <> prevzemnik_id)
);

-- Tuji kljuci (loceno, da skripta tece tudi na bazi, kjer tabela ze obstaja)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menjave_izmen_oddelek_fkey') then
    execute 'alter table public.menjave_izmen
      add constraint menjave_izmen_oddelek_fkey
      foreign key (oddelek_koda) references public.oddelki(code) on update cascade';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menjave_izmen_predlagatelj_fkey') then
    execute 'alter table public.menjave_izmen
      add constraint menjave_izmen_predlagatelj_fkey
      foreign key (predlagatelj_id) references public.profili(id) on delete cascade';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menjave_izmen_prevzemnik_fkey') then
    execute 'alter table public.menjave_izmen
      add constraint menjave_izmen_prevzemnik_fkey
      foreign key (prevzemnik_id) references public.profili(id) on delete cascade';
  end if;
  -- Sled avtorstva prezivi izbris vodje (isto pravilo kot odsek 30 v schema.sql)
  if not exists (select 1 from pg_constraint where conname = 'menjave_izmen_odobril_vodja_fkey') then
    execute 'alter table public.menjave_izmen
      add constraint menjave_izmen_odobril_vodja_fkey
      foreign key (odobril_vodja_id) references public.profili(id) on delete set null';
  end if;
end $$;

-- Indeksi za poizvedbe po oddelku, datumu, udelezencih in statusu
create index if not exists menjave_izmen_oddelek_idx on public.menjave_izmen using btree (oddelek_koda);
create index if not exists menjave_izmen_datum_idx on public.menjave_izmen using btree (datum_menjave);
create index if not exists menjave_izmen_predlagatelj_idx on public.menjave_izmen using btree (predlagatelj_id);
create index if not exists menjave_izmen_prevzemnik_idx on public.menjave_izmen using btree (prevzemnik_id);
create index if not exists menjave_izmen_status_idx on public.menjave_izmen using btree (status);

-- 2. Osvezevanje updated_at
create or replace function public.menjave_izmen_touch() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  new.updated_at := now();
  if TG_OP = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists menjave_izmen_touch on public.menjave_izmen;
create trigger menjave_izmen_touch before insert or update on public.menjave_izmen
  for each row execute function public.menjave_izmen_touch();

-- 3. Pogled za vmesnik (admin.html, izmene.js)
--    security_invoker: pogled spostuje RLS klicatelja, ne lastnika.
create or replace view public.pogled_menjave with (security_invoker='true') as
  select
    m.id,
    m.oddelek_koda,
    m.datum_menjave,
    m.status,
    m.razlog,
    m.zavrnitev_razlog,
    m.created_at,
    m.updated_at,
    m.odobreno_ob,

    m.predlagatelj_id,
    m.predlagatelj_ime,
    m.predlagatelj_izmena_stara,
    m.predlagatelj_izmena_nova,

    m.prevzemnik_id,
    m.prevzemnik_ime,
    m.prevzemnik_izmena_stara,
    m.prevzemnik_izmena_nova,

    m.odobril_vodja_id,
    v.full_name as odobril_vodja_ime
  from public.menjave_izmen m
  left join public.profili v on v.id = m.odobril_vodja_id;

revoke all on public.pogled_menjave from anon;
grant select on public.pogled_menjave to authenticated;

-- 4. Varnost na vrstico (RLS)
alter table public.menjave_izmen enable row level security;

-- Branje: udelezenca, admin, koordinator ali vodja svojega oddelka
drop policy if exists menjave_izmen_select on public.menjave_izmen;
create policy menjave_izmen_select on public.menjave_izmen for select to authenticated
  using (
    predlagatelj_id = auth.uid()
    or prevzemnik_id = auth.uid()
    or public.current_role_is('admin'::text)
    or public.current_is_koordinator()
    or (public.current_role_is('vodja'::text) and public.current_department() = oddelek_koda)
  );

-- Vnos: vsak prijavljen zaposleni le zase
drop policy if exists menjave_izmen_insert on public.menjave_izmen;
create policy menjave_izmen_insert on public.menjave_izmen for insert to authenticated
  with check (predlagatelj_id = auth.uid());

-- Posodobitev statusa: udelezenca potrjujeta, vodja/admin dokoncno odobri
drop policy if exists menjave_izmen_update on public.menjave_izmen;
create policy menjave_izmen_update on public.menjave_izmen for update to authenticated
  using (
    predlagatelj_id = auth.uid()
    or prevzemnik_id = auth.uid()
    or public.current_role_is('admin'::text)
    or (public.current_role_is('vodja'::text) and public.current_department() = oddelek_koda)
  )
  with check (
    predlagatelj_id = auth.uid()
    or prevzemnik_id = auth.uid()
    or public.current_role_is('admin'::text)
    or (public.current_role_is('vodja'::text) and public.current_department() = oddelek_koda)
  );

-- Brisanje: samo admin (ostali menjavo "preklicejo" prek statusa)
drop policy if exists menjave_izmen_delete on public.menjave_izmen;
create policy menjave_izmen_delete on public.menjave_izmen for delete to authenticated
  using (public.current_role_is('admin'::text));

-- Hitro preverjanje (sme vrniti 0 vrstic)
select count(*) as vseh_menjav from public.pogled_menjave;
