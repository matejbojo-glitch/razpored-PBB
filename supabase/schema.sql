-- Razpored PBB — Supabase shema (faza 4)
-- Tri vloge (admin / vodja / user) + dvostopenjska odobritev menjav izmen.
--
-- Zaženite CELO to datoteko enkrat v Supabase Dashboard → SQL Editor
-- (na novem ali obstoječem projektu). Varno je pognati večkrat zaradi
-- "if not exists" / "or replace" na večini objektov, RAZEN policy-jev,
-- ki se najprej pobrišejo in ponovno ustvarijo.
--
-- Po tem glej SUPABASE-SETUP.md za: nastavitve Auth, prvi admin račun,
-- uvoz obstoječih JSON razporedov.

-- ---------------------------------------------------------------------
-- 0) Razširitve
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) departments — 6 oddelkov SMS/TZN + dežurni/nedežurni kader
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  code text primary key,
  name text not null
);

insert into public.departments (code, name) values
  ('B',  'B - ODDELEK'),
  ('C',  'C - ODDELEK'),
  ('C1', 'C1 - ODDELEK'),
  ('D',  'D - ODDELEK'),
  ('E1', 'E1 - ODDELEK'),
  ('E2', 'E2 - ODDELEK'),
  ('DEZ',   'Dežurni kader (DMS/DZN)'),
  ('NEDEZ', 'Nedežurni kader (DMS/DZN)'),
  -- Dodatne kode enot, ki jih vodijo nosilci oddelkov/vodje (iz
  -- "Predloga razporeda vodje NZV") — ločeno od kod zgoraj, ker gre za
  -- vodstveno pokritost enote, ne za SMS/ZZT izmenski kalup.
  ('PDZN', 'PDZN — pomočnik direktorja za ZN'),
  ('SOBO', 'SOBO'),
  ('ZO',   'ŽO'),
  ('MO',   'MO'),
  ('PO',   'PO'),
  ('A',    'A - ODDELEK'),
  ('B1B2', 'B1, B2'),
  ('DB',   'DB'),
  ('SA',   'SA'),
  ('URGENCA', 'Urgenca'),
  ('U2',   'U2')
on conflict (code) do update set name = excluded.name;

-- ---------------------------------------------------------------------
-- 2) profiles — 1:1 z auth.users, nosi vlogo in oddelek/ekipo
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'user' check (role in ('admin', 'vodja', 'user')),
  department_code text references public.departments (code) on update cascade,
  created_at timestamptz not null default now()
);

-- Varovalka: "create table if not exists" zgoraj je no-op, če "profiles"
-- že obstaja (npr. iz prejšnjega delnega zagona ali ročnega urejanja v
-- Table Editorju) — NE doda manjkajočih stolpcev nazaj. Spodnje
-- "add column if not exists" to zagotovi, ne glede na to, v kakšnem
-- stanju je tabela pred tem zagonom.
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists department_code text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'vodja', 'user'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_department_code_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_department_code_fkey
      foreign key (department_code) references public.departments (code) on update cascade;
  end if;
end $$;

-- Enkratna migracija: če v tej bazi zaradi ročnega urejanja v Table
-- Editorju obstaja ločen stolpec "Admin" (z veliko začetnico, namesto
-- prave vloge v "role"), prenesi njegovo vrednost v "role" in stolpec
-- odstrani. Koda (ta datoteka, login.html, admin.html, menjave.html,
-- supabase-client.js) povsod dosledno uporablja "role" — to ostaja
-- edino veljavno ime, "Admin" ni nikjer v kodi referenciran.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'Admin'
  ) then
    execute 'update public.profiles set role = "Admin" where "Admin" is not null';
    execute 'alter table public.profiles drop column "Admin"';
  end if;
end $$;

-- Ob registraciji ALI Auth → "Invite user" (auth.users insert) samodejno
-- ustvari profil z vlogo 'user'. Ime se vzame iz signUp({ options: { data:
-- { full_name } } }); pri povabilu po e-pošti te metapodatke večinoma ni,
-- zato pade nazaj na e-poštni naslov — admin ga kasneje popravi v
-- admin.html → Uporabniki.
--
-- Sprožilec teče v transakciji GoTrue (Supabase Auth) storitve, ki jo
-- izvaja vloga supabase_auth_admin, ne "postgres" iz SQL Editorja — zato
-- spodnji grant-i, brez njih lahko GoTrue vrne generično napako
-- "Database error saving new user", ko sprožilec zaradi manjkajočih
-- pravic ne more zapisati v public.profiles.
--
-- Dodatno: telo je zavito v exception handler, da napaka pri ustvarjanju
-- profila (npr. začasna težava, podvojen vnos) NIKOLI ne prepreči
-- ustvarjanja samega Auth računa — brez tega bi vsaka nepričakovana
-- napaka tu pomenila, da se noben nov uporabnik ne more registrirati/biti
-- povabljen, dokler je ne odpravimo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Neznano ime'),
    'user',
    new.email
  )
  on conflict (id) do update set email = excluded.email where profiles.email is null;
  return new;
exception
  when others then
    raise warning 'handle_new_user: ustvarjanje profila za % ni uspelo: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Brez tega GoTrue (vloga supabase_auth_admin) pogosto ne more sprožiti
-- zgornje funkcije, kar se navzven kaže kot "Database error saving new user".
grant usage on schema public to supabase_auth_admin;
grant all on public.profiles to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3) schedule_entries — en zapis = en zaposleni, en dan, ena izmena
-- ---------------------------------------------------------------------
create table if not exists public.schedule_entries (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  department_code text not null references public.departments (code) on update cascade,
  work_date date not null,
  shift_code text not null default '',
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists schedule_entries_date_idx on public.schedule_entries (work_date);
create index if not exists schedule_entries_dept_idx on public.schedule_entries (department_code, work_date);

-- ---------------------------------------------------------------------
-- 4) swap_requests — dvostopenjska odobritev (vodja → admin)
-- ---------------------------------------------------------------------
create table if not exists public.swap_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id),
  requester_date date not null,
  target_id uuid not null references public.profiles (id),
  target_date date not null,
  note text,
  status text not null default 'pending_lead' check (
    status in ('pending_lead', 'pending_admin', 'approved', 'rejected_by_lead', 'rejected_by_admin')
  ),
  lead_id uuid references public.profiles (id),
  lead_decided_at timestamptz,
  lead_note text,
  admin_id uuid references public.profiles (id),
  admin_decided_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> target_id)
);
create index if not exists swap_requests_requester_idx on public.swap_requests (requester_id);
create index if not exists swap_requests_target_idx on public.swap_requests (target_id);
create index if not exists swap_requests_status_idx on public.swap_requests (status);

-- ---------------------------------------------------------------------
-- 5) notifications — obveščanje samo znotraj aplikacije
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  swap_request_id bigint references public.swap_requests (id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at);

create or replace function public.notify_swap_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
begin
  if new.status = old.status then
    return new;
  end if;
  msg := case new.status
    when 'pending_admin'     then 'Vodja je odobril predlog menjave — čaka na administratorja.'
    when 'approved'          then 'Menjava izmene je bila potrjena.'
    when 'rejected_by_lead'  then 'Vodja je zavrnil predlog menjave.'
    when 'rejected_by_admin' then 'Administrator je zavrnil predlog menjave.'
    else 'Status predloga menjave se je spremenil: ' || new.status
  end;
  insert into public.notifications (user_id, swap_request_id, message)
  values (new.requester_id, new.id, msg), (new.target_id, new.id, msg);
  return new;
end;
$$;

drop trigger if exists on_swap_status_change on public.swap_requests;
create trigger on_swap_status_change
  after update on public.swap_requests
  for each row execute function public.notify_swap_status_change();

-- ---------------------------------------------------------------------
-- 6) Pomožne funkcije za RLS
-- ---------------------------------------------------------------------
create or replace function public.current_role_is(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = p_role
  );
$$;

create or replace function public.current_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department_code from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 6b) Imenik (kontakti) — e-pošta na profiles, telefon v LOČENI tabeli
--     (contact_phones), da nivojsko vidljivost zagotavlja navadna
--     vrstična RLS, ne krhko stolpčno omejevanje na že široko
--     poizvedovani tabeli "profiles" (ki ima "select using (true)").
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

-- Enkraten popravek za profile, ustvarjene PRED to spremembo (sprožilec
-- spodaj odslej sam vpiše e-pošto ob registraciji; za obstoječe jo je
-- treba prekopirati iz auth.users, ki ni neposredno vidna odjemalcem).
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create table if not exists public.contact_phones (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now()
);

alter table public.contact_phones enable row level security;

-- Telefon vidijo: lastnik (svoj), admin (vsi) in vodja (vsi) — navaden
-- uporabnik tuje telefonske številke NE vidi (samo e-pošto, ki je na
-- profiles in torej vidna vsem). To je prava vrstična RLS: če vrstica ni
-- vidna klicatelju, PostgREST pri vgnezdenem povpraševanju
-- profiles→contact_phones vrne phone: null, ne napake.
drop policy if exists contact_phones_select on public.contact_phones;
create policy contact_phones_select on public.contact_phones
  for select to authenticated using (
    profile_id = auth.uid()
    or public.current_role_is('admin')
    or public.current_role_is('vodja')
  );

drop policy if exists contact_phones_upsert_own on public.contact_phones;
create policy contact_phones_upsert_own on public.contact_phones
  for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists contact_phones_update_own on public.contact_phones;
create policy contact_phones_update_own on public.contact_phones
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists contact_phones_admin_all on public.contact_phones;
create policy contact_phones_admin_all on public.contact_phones
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- contact_imports: admin vnaprej naloži seznam vseh zaposlenih (ime,
-- e-pošta, telefon, predlagana vloga/oddelek), preden se ti sami
-- registrirajo (ni service_role ključa za neposredno ustvarjanje Auth
-- računov — glej SUPABASE-SETUP.md). Ko se oseba dejansko registrira s to
-- e-pošto, admin v Imeniku njen nov profil ročno "poveže" s to vrstico
-- (linked_profile_id) — s tem se telefon/vloga/oddelek prekopirajo vanj.
create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  role text check (role in ('admin', 'vodja', 'user')),
  department_code text references public.departments (code) on update cascade,
  linked_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.contact_imports enable row level security;
drop policy if exists contact_imports_admin on public.contact_imports;
create policy contact_imports_admin on public.contact_imports
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- ---------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.swap_requests enable row level security;
alter table public.notifications enable row level security;

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select to authenticated using (true);

drop policy if exists departments_write_admin on public.departments;
create policy departments_write_admin on public.departments
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- profiles: vsi prijavljeni vidijo vsa imena (potrebno za izbiro sodelavca
-- pri predlogu menjave); ureja jih samo admin (vloga, oddelek, ime).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- schedule_entries: berejo vsi prijavljeni, za VSE oddelke (dogovorjeno);
-- pišejo (kalup/dežurstva) samo admin.
drop policy if exists schedule_select on public.schedule_entries;
create policy schedule_select on public.schedule_entries
  for select to authenticated using (true);

drop policy if exists schedule_write_admin on public.schedule_entries;
create policy schedule_write_admin on public.schedule_entries
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- swap_requests: neposreden insert/update je zavrnjen (privzeto, ker ni
-- ustrezne "for insert/update" policy) — vse spremembe gredo prek spodnjih
-- SECURITY DEFINER funkcij, ki eksplicitno preverijo pravice klicatelja.
drop policy if exists swap_select on public.swap_requests;
create policy swap_select on public.swap_requests
  for select to authenticated using (
    requester_id = auth.uid()
    or target_id = auth.uid()
    or public.current_role_is('admin')
    or (
      public.current_role_is('vodja')
      and public.current_department() = (select department_code from public.profiles where id = requester_id)
    )
  );

-- notifications: vsak vidi in označi kot prebrano samo svoje.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8) RPC funkcije — edina pot za pisanje v swap_requests / izvedbo menjave
-- ---------------------------------------------------------------------

-- Zaposleni odda predlog menjave: jaz (moj datum/izmena) <-> sodelavec (njegov datum/izmena).
create or replace function public.submit_swap_request(
  p_target_id uuid,
  p_requester_date date,
  p_target_date date,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_target_id = auth.uid() then
    raise exception 'Ne moreš predlagati menjave sam s seboj.';
  end if;
  insert into public.swap_requests (requester_id, requester_date, target_id, target_date, note, status)
  values (auth.uid(), p_requester_date, p_target_id, p_target_date, p_note, 'pending_lead')
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_swap_request(uuid, date, date, text) to authenticated;

-- 1. stopnja: vodja ekipe predlagatelja odobri ali zavrne.
create or replace function public.decide_swap_lead(
  p_swap_id bigint,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req_dept text;
begin
  if not public.current_role_is('vodja') then
    raise exception 'Samo vodja lahko odloča na prvi stopnji.';
  end if;

  select p.department_code into v_req_dept
  from public.swap_requests s join public.profiles p on p.id = s.requester_id
  where s.id = p_swap_id and s.status = 'pending_lead'
  for update of s;

  if v_req_dept is null then
    raise exception 'Predlog ne obstaja ali ni več v čakanju na vodjo.';
  end if;
  if v_req_dept is distinct from public.current_department() then
    raise exception 'Ta predlog ni iz tvoje ekipe.';
  end if;

  update public.swap_requests
  set status = case when p_approve then 'pending_admin' else 'rejected_by_lead' end,
      lead_id = auth.uid(),
      lead_decided_at = now(),
      lead_note = p_note,
      updated_at = now()
  where id = p_swap_id;
end;
$$;
grant execute on function public.decide_swap_lead(bigint, boolean, text) to authenticated;

-- 2. stopnja: administrator dokončno potrdi ali zavrne; ob potrditvi
-- dejansko zamenja izmene v schedule_entries (atomarno, en klic).
create or replace function public.decide_swap_admin(
  p_swap_id bigint,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_requester_shift text;
  v_target_shift text;
begin
  if not public.current_role_is('admin') then
    raise exception 'Samo administrator lahko dokončno odloča.';
  end if;

  select * into v_req from public.swap_requests
  where id = p_swap_id and status = 'pending_admin'
  for update;

  if v_req.id is null then
    raise exception 'Predlog ne obstaja ali ni več v čakanju na administratorja.';
  end if;

  if p_approve then
    select shift_code into v_requester_shift from public.schedule_entries
      where employee_id = v_req.requester_id and work_date = v_req.requester_date;
    select shift_code into v_target_shift from public.schedule_entries
      where employee_id = v_req.target_id and work_date = v_req.target_date;

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    select v_req.requester_id, department_code, v_req.requester_date, coalesce(v_target_shift, ''), now()
    from public.profiles where id = v_req.requester_id
    on conflict (employee_id, work_date)
      do update set shift_code = excluded.shift_code, updated_at = now();

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    select v_req.target_id, department_code, v_req.target_date, coalesce(v_requester_shift, ''), now()
    from public.profiles where id = v_req.target_id
    on conflict (employee_id, work_date)
      do update set shift_code = excluded.shift_code, updated_at = now();
  end if;

  update public.swap_requests
  set status = case when p_approve then 'approved' else 'rejected_by_admin' end,
      admin_id = auth.uid(),
      admin_decided_at = now(),
      admin_note = p_note,
      updated_at = now()
  where id = p_swap_id;
end;
$$;
grant execute on function public.decide_swap_admin(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9) leave_entries — barvna razpredelnica dopustov/omejitev (zavihek
--    "Želje"), ki jo generator dežurstev/vodij bere samodejno.
--    Nadomešča prejšnji ročni vnos "2026-09-01, 2026-09-02 ..." v
--    admin.html z vizualnim pobarvanim koledarjem (glej zelje.html).
-- ---------------------------------------------------------------------
create table if not exists public.leave_entries (
  id bigint generated always as identity primary key,
  full_name text not null,
  work_date date not null,
  kind text not null check (kind in ('omejitev', 'ld', 'bs', 'sti')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (full_name, work_date)
);

create table if not exists public.leave_entries_log (
  id bigint generated always as identity primary key,
  full_name text not null,
  work_date date not null,
  from_kind text,
  to_kind text,
  editor_id uuid references auth.users (id) on delete set null,
  editor_name text,
  created_at timestamptz not null default now()
);

alter table public.leave_entries enable row level security;
alter table public.leave_entries_log enable row level security;

drop policy if exists leave_entries_select on public.leave_entries;
create policy leave_entries_select on public.leave_entries
  for select to authenticated using (true);

-- Ime v leave_entries.full_name je prosto besedilo iz statičnega
-- roster-seznama (npr. "BOJIĆ MATEJ"), profiles.full_name pa karkoli je
-- oseba vpisala ob samoregistraciji (npr. "Matej Bojić") — zato primerjava
-- ni nujno enaka niz, primerjamo brez oziru na velikost črk/presledke in
-- dovolimo obrnjen vrstni red "ime priimek" <-> "priimek ime".
create or replace function public.current_full_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select full_name from public.profiles where id = auth.uid();
$$;

-- Primerja kot "vrečo besed" (ne glede na vrstni red), da "PRIIMEK IME"
-- (roster) ujema "Ime Priimek" (kakor koli je oseba vpisala ob
-- registraciji) — deluje za poljubno število besed, ne samo za dve.
create or replace function public.imena_se_ujemata(a text, b text)
returns boolean
language sql
stable
as $$
  select a is not null and b is not null and (
    select array_agg(w order by w) from unnest(regexp_split_to_array(upper(trim(a)), '\s+')) w
  ) = (
    select array_agg(w order by w) from unnest(regexp_split_to_array(upper(trim(b)), '\s+')) w
  );
$$;

-- Rok za vnos: 10. v mesecu PRED mesecem "work_date", do 23:59:59.
create or replace function public.leave_entry_rok_odprt(p_work_date date)
returns boolean
language sql
stable
as $$
  select now() <= (
    date_trunc('month', p_work_date) - interval '1 month' + interval '9 days 23 hours 59 minutes 59 seconds'
  );
$$;

-- Samo admin ureja katero koli vrstico, kadar koli. "vodja" IN "user" oba
-- urejata SAMO svojo vrstico (ujemanje imena, glej zgoraj) in samo do roka
-- (10. v prejšnjem mesecu) — po tem je zaklenjeno tudi zanju. Uveljavljeno
-- tu (RLS), ne samo v vmesniku, ker bi sicer kdorkoli z neposrednim klicem
-- API-ja lahko obšel omejitev v UI.
drop policy if exists leave_entries_write on public.leave_entries;
create policy leave_entries_write on public.leave_entries
  for all to authenticated
  using (
    public.current_role_is('admin')
    or (public.imena_se_ujemata(full_name, public.current_full_name()) and public.leave_entry_rok_odprt(work_date))
  )
  with check (
    public.current_role_is('admin')
    or (public.imena_se_ujemata(full_name, public.current_full_name()) and public.leave_entry_rok_odprt(work_date))
  );

-- Zgodovina sprememb je vidna samo administratorjem (na izrecno navodilo:
-- "sledljivo in vidno samo uporabnikom admin") — vodja in user je v UI
-- sploh ne prikažeta, tu pa je zaklenjeno tudi za neposreden klic API-ja.
drop policy if exists leave_entries_log_select on public.leave_entries_log;
create policy leave_entries_log_select on public.leave_entries_log
  for select to authenticated using (public.current_role_is('admin'));

-- Vpisi v dnevnik gredo samo prek sprožilca spodaj (SECURITY DEFINER), ne
-- neposredno od odjemalca — zato ni potrebe po "insert" politiki za
-- authenticated na leave_entries_log.

create or replace function public.log_leave_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_name text;
begin
  select full_name into v_editor_name from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.leave_entries_log (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (new.full_name, new.work_date, null, new.kind, auth.uid(), v_editor_name);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.leave_entries_log (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (new.full_name, new.work_date, old.kind, new.kind, auth.uid(), v_editor_name);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.leave_entries_log (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (old.full_name, old.work_date, old.kind, null, auth.uid(), v_editor_name);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_leave_entry_change on public.leave_entries;
create trigger on_leave_entry_change
  after insert or update or delete on public.leave_entries
  for each row execute function public.log_leave_entry_change();

-- ---------------------------------------------------------------------
-- 10) lead_departments — 22 vodij/nosilcev oddelkov (iz "Predloga
--     razporeda vodje NZV"): domači oddelek, ali sodelujejo pri
--     dežurstvih, mesečna kvota/omejitve, nadomeščanje ob odsotnosti.
--     Ločeno od profiles.department_code, ker gre za VODSTVENO
--     pokritost enote (en vodja = ena "domača" enota), ne za vlogo v
--     Supabase Auth pomenu.
-- ---------------------------------------------------------------------
create table if not exists public.lead_departments (
  full_name text primary key,
  department_code text references public.departments (code) on update cascade,
  dezurstvo_dovoljeno boolean not null default false,
  max_mesecno integer,
  samo_med_tednom boolean not null default false,
  delovnik text,
  ur_na_dan numeric,
  odsotnost_tip text,
  odsotnost_do date,
  nadomesca text,
  opomba text
);

alter table public.lead_departments enable row level security;
drop policy if exists lead_departments_select on public.lead_departments;
create policy lead_departments_select on public.lead_departments
  for select to authenticated using (true);
drop policy if exists lead_departments_write_admin on public.lead_departments;
create policy lead_departments_write_admin on public.lead_departments
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

insert into public.lead_departments
  (full_name, department_code, dezurstvo_dovoljeno, max_mesecno, samo_med_tednom, delovnik, ur_na_dan, odsotnost_tip, odsotnost_do, nadomesca, opomba)
values
  ('ALUKIĆ DINO', 'PDZN', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'BOJIĆ MATEJ', 'ob odsotnosti (LD, BS) nadomeščanje Bojić Matej'),
  ('ARNEŽ GREGA', 'C1', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'LUNAR MATEJA', 'ob odsotnosti (LD, BS) nadomeščanje Lunar Mateja'),
  ('BIZJAK TEA', 'SA', false, null, false, 'dopoldne/popoldne', 6, null, null, null, 'delo po 6 ur'),
  ('BOJIĆ MATEJ', 'PDZN', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ALUKIĆ DINO', 'ob odsotnosti (LD, BS) nadomeščanje Dino Alukić'),
  ('DŽAMASTAGIĆ DENIS', 'PDZN', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ALUKIĆ DINO', 'Pomočnik direktorja za zdravstveno nego; ob odsotnosti nadomeščanje Dino Alukić, nato Matej Bojić'),
  ('HROVAT NINA', 'DB', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'TORKAR TANJA', 'ob odsotnosti (LD, BS) nadomeščanje Torkar Tanja'),
  ('HUMAR SAŠA', 'SA', false, null, false, 'dopoldne/popoldne', null, null, null, 'BIZJAK TEA', 'ob odsotnosti (LD, BS) nadomeščanje Bizjak Tea, nato Trpin Saša'),
  ('LELIĆ DIJANA', 'E2', false, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('LUNAR MATEJA', 'B', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ARNEŽ GREGA', 'ob odsotnosti (LD, BS) nadomeščanje Arnež Grega'),
  ('MAGLIĆ ALEKSANDER', 'E1', false, null, false, 'dopoldne 7.00-15.30', null, null, null, 'LELIĆ DIJANA', 'ob odsotnosti (LD, BS) nadomeščanje Dijana Lelić'),
  ('MAVRI TRATNIK MAGDALENA', 'B1B2', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ŠUBIC PETRA', 'ob odsotnosti (LD, BS) nadomeščanje Šubic Petra'),
  ('MISOTIČ REBEKA', 'C', false, null, false, 'dopoldne/popoldne', null, null, null, null, null),
  ('MUŠIČ INES', 'SA', false, null, false, 'dopoldne', 7, null, null, null, 'delo po 7 ur'),
  ('PERVIZ AMAL', 'D', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('POGAČNIK TEJA', 'E1', false, null, false, 'dopoldne 7.00-15.30', null, 'porodniška', '2027-07-31', null, 'trenutno porodniška - do julij 2027'),
  ('SALKIĆ MARUŠA', 'C1', true, 1, true, 'dopoldne 7.00-15.30', null, null, null, null, '1x dežurstvo na mesec med tednom'),
  ('SOFRIĆ NIKOLINA', 'E2', false, null, false, 'dopoldne/popoldne', null, null, null, null, null),
  ('ŠUBIC PETRA', 'B1B2', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAVRI TRATNIK MAGDALENA', 'ob odsotnosti (LD, BS) nadomeščanje Magdalena Mavri Tratnik'),
  ('TOMAŽEVIČ SIMONA', 'A', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'VELUŠČEK METKA', 'ob odsotnosti (LD, BS) nadomeščanje Velušček Metka'),
  ('TORKAR TANJA', 'DB', true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'HROVAT NINA', 'ob odsotnosti (LD, BS) nadomeščanje Hrovat Nina'),
  ('TRPIN SAŠA', 'SA', true, 1, true, 'dopoldne 7.00-15.30', null, null, null, null, 'ob odsotnosti (LD, BS) Bizjak Tea, Musić Ines'),
  ('VELUŠČEK METKA', 'SOBO', true, 2, false, 'dopoldne 7.00-15.30', null, null, null, 'DŽAMASTAGIĆ DENIS', 'ob odsotnosti (LD, BS) nadomeščanje Džamastagić Denis')
on conflict (full_name) do update set
  department_code = excluded.department_code,
  dezurstvo_dovoljeno = excluded.dezurstvo_dovoljeno,
  max_mesecno = excluded.max_mesecno,
  samo_med_tednom = excluded.samo_med_tednom,
  delovnik = excluded.delovnik,
  ur_na_dan = excluded.ur_na_dan,
  odsotnost_tip = excluded.odsotnost_tip,
  odsotnost_do = excluded.odsotnost_do,
  nadomesca = excluded.nadomesca,
  opomba = excluded.opomba;
