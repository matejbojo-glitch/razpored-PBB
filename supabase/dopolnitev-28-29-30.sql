-- =====================================================================
-- Razpored PBB – DOPOLNITEV SHEME (sekcije 28, 29, 30)
--
-- Kaj doda:
--   28) Revizijska sled sprememb PRAVIC (kdo je komu dal/vzel dostop)
--   29) Ziva koledarska narocnina, z vklopom/izklopom sinhronizacije
--   30) Izbira kanalov obvescanja po osebi (e-posta / telefon / SMS)
--
-- KAKO POGNATI:
--   Supabase -> SQL Editor -> New query -> prilepi VSE spodaj -> Run.
--
-- Varno je pognati veckrat. NICESAR ne brise in NE spreminja obstojecih
-- podatkov.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 28) dnevnik_profilov – revizijska sled SPREMEMB PRAVIC (RBAC audit).
--
--     Sekcija 26 zgoraj revidira razpored (kdo je komu spremenil izmeno).
--     Kdo je komu podelil ali odvzel PRAVICE, pa doslej ni bilo nikjer
--     zabeleženo – administrator lahko v Generator → Uporabniki komurkoli
--     nastavi vlogo "admin", in po tem dejanju ni ostalo nobene sledi.
--     Za "pravno skladnost in varnost podatkov" je to večja vrzel od
--     revizije razporeda: brez nje ni mogoče odgovoriti na vprašanje
--     "kdo je tej osebi omogočil dostop do kadrovskih podatkov in kdaj".
--
--     Beležijo se samo štiri polja, ki dejansko določajo pravice:
--       role            – admin / vodja / user
--       department_code – kateri oddelek vodja vidi in ureja
--       vodja_id        – komu je oseba podrejena (veriga odobritev)
--       is_koordinator  – enostopenjska odobritev menjav
--     Ostala polja (ime, e-pošta, parafa, naziv) niso varnostno
--     relevantna in bi dnevnik samo napolnila.
--
--     Enak vzorec kot dnevnik_razporeda: append-only, piše izključno
--     sprožilec (security definer), bere samo admin.
-- ---------------------------------------------------------------------
create table if not exists public.dnevnik_profilov (
  id bigint generated always as identity primary key,
  profile_id uuid,
  profile_name text,
  polje text not null check (polje in ('role', 'department_code', 'vodja_id', 'is_koordinator')),
  stara_vrednost text,
  nova_vrednost text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid references public.profili (id),
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index if not exists profiles_log_profile_idx on public.dnevnik_profilov (profile_id, changed_at desc);
create index if not exists profiles_log_cas_idx on public.dnevnik_profilov (changed_at desc);

alter table public.dnevnik_profilov enable row level security;
drop policy if exists profiles_log_select_admin on public.dnevnik_profilov;
create policy profiles_log_select_admin on public.dnevnik_profilov
  for select to authenticated using (public.current_role_is('admin'));

create or replace function public.profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  akter_ime text;
  akter uuid;
begin
  akter := auth.uid();
  -- Ime akterja se zapiše ob dejanju in se pozneje NE osvežuje: če se
  -- oseba pozneje preimenuje ali izbriše, mora dnevnik še vedno brati
  -- tako, kot je bilo ob dogodku.
  select p.full_name into akter_ime from public.profili p where p.id = akter;

  if TG_OP = 'DELETE' then
    insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (old.id, old.full_name, 'role', old.role, null, 'delete', akter, akter_ime);
    return old;
  end if;

  if TG_OP = 'INSERT' then
    -- Ob registraciji je vloga vedno privzeta ('user'); vpiše se samo, če
    -- je račun nastal že z višjo vlogo (npr. prek uvoza).
    if new.role is distinct from 'user' then
      insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
      values (new.id, new.full_name, 'role', null, new.role, 'insert', akter, akter_ime);
    end if;
    return new;
  end if;

  -- UPDATE: po eno vrstico na vsako dejansko spremenjeno polje, da je
  -- dnevnik berljiv brez razbiranja, kaj se je v vrstici spremenilo.
  if old.role is distinct from new.role then
    insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'role', old.role, new.role, 'update', akter, akter_ime);
  end if;
  if old.department_code is distinct from new.department_code then
    insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'department_code', old.department_code, new.department_code, 'update', akter, akter_ime);
  end if;
  if old.vodja_id is distinct from new.vodja_id then
    -- Zapiše se IME vodje, ne uuid – dnevnik mora biti berljiv brez
    -- poizvedovanja. Kadar imena ni več mogoče razrešiti (vodja je bil
    -- pravkar izbrisan in je ta sprememba kaskada "on delete set null"),
    -- pade nazaj na uuid: brez tega bi vrstica izgledala kot prazno →
    -- prazno, torej kot sprememba, ki se ni zgodila.
    insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'vodja_id',
            coalesce((select p.full_name from public.profili p where p.id = old.vodja_id), old.vodja_id::text),
            coalesce((select p.full_name from public.profili p where p.id = new.vodja_id), new.vodja_id::text),
            'update', akter, akter_ime);
  end if;
  if old.is_koordinator is distinct from new.is_koordinator then
    insert into public.dnevnik_profilov (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'is_koordinator', old.is_koordinator::text, new.is_koordinator::text, 'update', akter, akter_ime);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_audit on public.profili;
create trigger profiles_audit
  after insert or update or delete on public.profili
  for each row execute function public.profiles_audit();

-- ---------------------------------------------------------------------
-- 29) Živa koledarska naročnina (iCal subscription).
--
--     Doslej je bil izvoz .ics ENKRATEN prenos: kar si prenesel, je v
--     telefonu obtičalo takšno, kot je bilo – sprememba razporeda se v
--     koledarju ni poznala. Tu se doda naslov, na katerega se koledar
--     naroči in ga sam občasno osveži.
--
--     ZAKAJ LOČENA TABELA IN NE STOLPEC V profili:
--     politika profiles_select je "for select to authenticated using
--     (true)" – vsak prijavljen vidi VSE vrstice tabele profili. Če bi
--     žeton živel tam, bi vsak zaposleni videl žetone vseh sodelavcev in
--     se lahko naročil na njihov razpored. Zato svoja tabela, kjer
--     politika omeji branje na lastnika vrstice.
--
--     Žeton je nosilni podatek (kdor ga ima, vidi razpored te osebe brez
--     prijave – koledarski odjemalci se ne znajo prijaviti), zato:
--       * 32 naključnih bajtov iz pgcrypto (ne uuid, ki je deloma
--         predvidljiv in se ponekod izpisuje v naslovih),
--       * bere ga IZKLJUČNO lastnik; niti admin ne, ker ga ne potrebuje –
--         admin razpored že vidi v aplikaciji,
--       * zamenljiv z eno potezo (koledar_token_ponastavi), s čimer
--         prejšnja povezava takoj neha delovati.
-- ---------------------------------------------------------------------
create table if not exists public.koledarski_zetoni (
  profile_id uuid primary key references public.profili (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
-- Stikalo za vklop/izklop sinhronizacije. Ločeno od brisanja žetona:
-- izklop naj povezavo USTAVI, ne pa pozabi – kdor jo pozneje spet vklopi,
-- naj mu ni treba znova urejati koledarja na telefonu. Ob izklopu vir
-- vrne 404, enako kot pri neveljavnem žetonu.
alter table public.koledarski_zetoni add column if not exists enabled boolean not null default true;

alter table public.koledarski_zetoni enable row level security;
-- Samo lastnik. Brez insert/update/delete politik – vse gre prek
-- security definer funkcij spodaj.
drop policy if exists calendar_tokens_own on public.koledarski_zetoni;
create policy calendar_tokens_own on public.koledarski_zetoni
  for select to authenticated using (profile_id = auth.uid());

-- OPOMBA o generiranju žetona: uporabljamo dva gen_random_uuid() brez
-- pomišljajev (2 x 32 = 64 šestnajstiških znakov), NE encode(gen_random_bytes...).
-- gen_random_bytes prihaja iz razširitve pgcrypto, ta pa v Supabase ni v shemi
-- "public" ampak v "extensions" – ob "set search_path = public, pg_temp" je
-- torej nedosegljiva in klic odpove z "function gen_random_bytes(integer) does
-- not exist". gen_random_uuid() je od PostgreSQL 13 del jedra, zato deluje
-- povsod in brez razširitev. Naključnost ostaja kriptografska (2 x 122 bita).
-- Vrne obstoječi žeton prijavljene osebe ali ga ob prvem klicu ustvari.
create or replace function public.koledar_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Ni prijave.';
  end if;
  select token into v_token from public.koledarski_zetoni where profile_id = auth.uid();
  if v_token is not null then
    return v_token;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.koledarski_zetoni (profile_id, token) values (auth.uid(), v_token)
  on conflict (profile_id) do update set token = excluded.token
  returning token into v_token;
  return v_token;
end;
$$;

-- Vklop/izklop sinhronizacije. Žeton se pri izklopu OHRANI, da po
-- ponovnem vklopu ista povezava spet deluje in koledarja na telefonu ni
-- treba znova nastavljati. Kdor želi povezavo dokončno razveljaviti,
-- uporabi koledar_token_ponastavi().
create or replace function public.koledar_sinhronizacija(p_vklop boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stanje boolean;
begin
  if auth.uid() is null then
    raise exception 'Ni prijave.';
  end if;
  -- Če vrstice še ni in se vklaplja, jo ustvarimo z novim žetonom.
  insert into public.koledarski_zetoni (profile_id, token, enabled)
  values (auth.uid(), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_vklop)
  on conflict (profile_id) do update set enabled = excluded.enabled
  returning enabled into v_stanje;
  return v_stanje;
end;
$$;

-- Zamenja žeton – prejšnja povezava takoj preneha delovati (za primer,
-- ko je bila povezava pomotoma deljena).
create or replace function public.koledar_token_ponastavi()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Ni prijave.';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.koledarski_zetoni (profile_id, token, created_at, last_used_at)
  values (auth.uid(), v_token, now(), null)
  on conflict (profile_id) do update
    set token = excluded.token, created_at = now(), last_used_at = null
  returning token into v_token;
  return v_token;
end;
$$;

-- Uporabi jo IZKLJUČNO robna funkcija "koledar" s service_role ključem:
-- iz žetona dobi osebo in njen razpored. Ni dosegljiva navadnemu
-- (authenticated) uporabniku, ker bi sicer lahko kdorkoli z ugibanjem
-- žetona bral tuje razporede prek RPC.
create or replace function public.koledar_razpored(p_token text, p_od date, p_do date)
returns table (full_name text, work_date date, shift_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
begin
  -- "and ct.enabled" pomeni, da izklopljena sinhronizacija izgleda
  -- popolnoma enako kot neveljaven žeton – brez namiga, ali oseba obstaja.
  select ct.profile_id into v_profile
  from public.koledarski_zetoni ct
  where ct.token = p_token and ct.enabled;
  if v_profile is null then
    return; -- neveljaven žeton ali izklopljena sinhronizacija
  end if;
  update public.koledarski_zetoni set last_used_at = now() where profile_id = v_profile;
  return query
    select p.full_name, se.work_date, se.shift_code
    from public.razpored se
    join public.profili p on p.id = se.employee_id
    where se.employee_id = v_profile
      and se.work_date between p_od and p_do
      and coalesce(se.shift_code, '') <> ''
    order by se.work_date;
end;
$$;

revoke all on function public.koledar_razpored(text, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 30) nastavitve_obvestil – kanali obveščanja po osebi.
--
--     Doslej je bilo obveščanje vse-ali-nič in vezano na NAPRAVO: potisna
--     obvestila si vklopil na telefonu (potisne_narocnine), drugih poti
--     ni bilo. Tu se doda izbira po OSEBI: e-pošta, potisno obvestilo in
--     (pozneje) SMS, vsak posebej.
--
--     Zakaj privzeto vklopljena e-pošta in potisno obvestilo: kdor si
--     potisnih ni vklopil na nobeni napravi, brez e-pošte ne bi izvedel
--     ničesar. Prazna vrstica (osebe, ki nastavitev ni odprla) se zato
--     obravnava kot "oboje vklopljeno" - glej coalesce v robni funkciji.
--
--     SMS je pripravljen kot zastavica, a ga nič še ne pošilja: zahteva
--     plačljivega ponudnika. Dokler ga ni, vklop ne naredi ničesar in je
--     v vmesniku tako tudi označen - raje vidna neaktivna možnost kot
--     tiho neizpolnjena obljuba.
-- ---------------------------------------------------------------------
create table if not exists public.nastavitve_obvestil (
  profile_id uuid primary key references public.profili (id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  -- Vrste dogodkov; obe privzeto vklopljeni.
  opomnik_izmene boolean not null default true,
  sprememba_razporeda boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.nastavitve_obvestil enable row level security;

drop policy if exists notif_settings_select on public.nastavitve_obvestil;
create policy notif_settings_select on public.nastavitve_obvestil
  for select to authenticated
  using (profile_id = auth.uid() or public.current_role_is('admin'));

drop policy if exists notif_settings_upsert on public.nastavitve_obvestil;
create policy notif_settings_upsert on public.nastavitve_obvestil
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists notif_settings_update on public.nastavitve_obvestil;
create policy notif_settings_update on public.nastavitve_obvestil
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Sled o dostavi po e-pošti; push_sent_at (sekcija 27) že obstaja.
alter table public.obvestila add column if not exists email_sent_at timestamptz;
create index if not exists notifications_email_pending_idx
  on public.obvestila (created_at) where email_sent_at is null;

-- Robna funkcija potrebuje e-pošto in nastavitve prejemnikov v enem
-- klicu. profili.email je berljiv vsem prijavljenim, a funkcija teče s
-- service_role - ta pogled je tu zato, da je poizvedba na enem mestu in
-- da se ne pošilja osebam, ki so kanal izklopile.
create or replace function public.prejemniki_obvestil(p_ids uuid[])
returns table (
  profile_id uuid,
  email text,
  full_name text,
  email_enabled boolean,
  push_enabled boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.email, p.full_name,
         coalesce(ns.email_enabled, true),
         coalesce(ns.push_enabled, true)
  from public.profili p
  left join public.nastavitve_obvestil ns on ns.profile_id = p.id
  where p.id = any(p_ids);
$$;

revoke all on function public.prejemniki_obvestil(uuid[]) from public, anon, authenticated;
