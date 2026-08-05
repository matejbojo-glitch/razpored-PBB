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

-- POZOR: ker je zgornji "create table IF NOT EXISTS" na obstoječi (že prej
-- ustvarjeni) tabeli no-op, stolpcev, dodanih pozneje, NI SMELO biti znotraj
-- tega bloka (bili so v prejšnji različici te datoteke - napaka, ki je
-- povzročila "column employee_code does not exist" pri poganjanju pogleda
-- spodaj na bazi, kjer je contact_imports že obstajala pred to spremembo).
-- "alter table add column if not exists" deluje pravilno v obeh primerih
-- (nova IN že obstoječa tabela), zato se od tu naprej dosledno uporablja to.
alter table public.contact_imports add column if not exists employee_code text;
alter table public.contact_imports add column if not exists birth_date date;
alter table public.contact_imports add column if not exists position_name text;
alter table public.contact_imports add column if not exists manager_name text;
alter table public.contact_imports add column if not exists parental_leave text;
alter table public.contact_imports add column if not exists annual_leave_total integer;
alter table public.contact_imports add column if not exists leave_balance_days integer;
alter table public.contact_imports add column if not exists leave_balance_asof date;

alter table public.contact_imports enable row level security;
drop policy if exists contact_imports_admin on public.contact_imports;
create policy contact_imports_admin on public.contact_imports
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- contact_imports_public: na izrecno željo morajo biti VSI vneseni podatki
-- takoj vidni v Imeniku, TUDI za še ne povezane (neregistrirane) osebe — ne
-- samo adminu v "Uvoz zaposlenih". Osnovna tabela contact_imports ostaja
-- admin-only (ureja jo samo admin), ta pogled pa istim vidnostnim pravilom
-- kot pri registriranih profilih (e-pošta vsem, telefon admin+vodja, HR
-- polja samo admin — ni "lastnika", ker oseba še ni registrirana) izpostavi
-- BRANJE vsem prijavljenim. Pogled ni "security invoker": teče s pravicami
-- lastnika (privzeto obnašanje navadnega pogleda), zato prebere vse vrstice
-- ne glede na RLS na contact_imports — vidnost posameznih stolpcev namesto
-- tega vsili spodnja CASE logika, ovrednotena za VSAKEGA klicatelja posebej
-- (current_role_is bere iz profiles glede na auth.uid() klicatelja).
create or replace view public.contact_imports_public as
select
  id, full_name, department_code, role, linked_profile_id, created_at, email,
  case when public.current_role_is('admin') or public.current_role_is('vodja') then phone else null end as phone,
  case when public.current_role_is('admin') then employee_code else null end as employee_code,
  case when public.current_role_is('admin') then birth_date else null end as birth_date,
  case when public.current_role_is('admin') then position_name else null end as position_name,
  case when public.current_role_is('admin') then manager_name else null end as manager_name,
  case when public.current_role_is('admin') then parental_leave else null end as parental_leave,
  case when public.current_role_is('admin') then annual_leave_total else null end as annual_leave_total,
  case when public.current_role_is('admin') then leave_balance_days else null end as leave_balance_days,
  case when public.current_role_is('admin') then leave_balance_asof else null end as leave_balance_asof
from public.contact_imports;

grant select on public.contact_imports_public to authenticated;

-- profile_hr_details: dodatni HR podatki (šifra zaposlenega, datum rojstva,
-- naziv delovnega mesta, vodja, starševsko varstvo, letni dopust), ki se
-- prekopirajo iz contact_imports ob "Poveži". Bolj občutljivi kot telefon
-- (rojstni datum!), zato ožja vidljivost kot pri contact_phones: lastnik vidi
-- SAMO svoje ("vsak vidi podatke samo zase"), admin vidi in ureja vse,
-- vodja NIMA dostopa (ni bilo izrecno naročeno, za razliko od telefona).
create table if not exists public.profile_hr_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  employee_code text,
  birth_date date,
  position_name text,
  manager_name text,
  parental_leave text,
  annual_leave_total integer,
  updated_at timestamptz not null default now()
);

-- Ista past kot pri contact_imports zgoraj (glej opombo tam) - leave_balance_*
-- je bil prej pomotoma znotraj "create table if not exists", kar na že
-- obstoječi tabeli ne naredi ničesar.
alter table public.profile_hr_details add column if not exists leave_balance_days integer;
alter table public.profile_hr_details add column if not exists leave_balance_asof date;

alter table public.profile_hr_details enable row level security;
drop policy if exists profile_hr_details_select on public.profile_hr_details;
create policy profile_hr_details_select on public.profile_hr_details
  for select to authenticated using (
    profile_id = auth.uid() or public.current_role_is('admin')
  );
drop policy if exists profile_hr_details_admin_write on public.profile_hr_details;
create policy profile_hr_details_admin_write on public.profile_hr_details
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

-- profile_departments: en zaposleni lahko pokriva VEČ oddelkov (na izrecno
-- željo, prikazano/urejano v Imeniku) - "primaren" (sort_order najnižji) je
-- tisti, ki šteje za generator urnika. Namenoma NE spreminja WARDS_META /
-- lead_departments / obstoječega generatorja (admin.html) - ta še naprej
-- uporablja izključno profiles.department_code (=primarni oddelek), da se
-- ne tvega regresij v že delujočem generiranju razporeda. Sprožilec spodaj
-- profiles.department_code drži usklajen s "primarnim" vnosom tukaj, ne
-- glede na to, kateri del aplikacije department_code spremeni.
create table if not exists public.profile_departments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  department_code text not null references public.departments (code) on update cascade,
  sort_order integer not null default 0,
  unique (profile_id, department_code)
);

alter table public.profile_departments enable row level security;
drop policy if exists profile_departments_select on public.profile_departments;
create policy profile_departments_select on public.profile_departments
  for select to authenticated using (true);
drop policy if exists profile_departments_admin_write on public.profile_departments;
create policy profile_departments_admin_write on public.profile_departments
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

create or replace function public.sync_primary_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.department_code is null then
    return new;
  end if;
  -- Vse ostale oddelke te osebe premakni za enega nazaj, nato nov primarni
  -- oddelek postavi na sort_order 0 (upsert, če ga na seznamu še ni bilo).
  update public.profile_departments
  set sort_order = sort_order + 1
  where profile_id = new.id and department_code <> new.department_code;

  insert into public.profile_departments (profile_id, department_code, sort_order)
  values (new.id, new.department_code, 0)
  on conflict (profile_id, department_code) do update set sort_order = 0;
  return new;
end;
$$;

drop trigger if exists trg_sync_primary_department on public.profiles;
create trigger trg_sync_primary_department
  after insert or update of department_code on public.profiles
  for each row execute function public.sync_primary_department();

-- Enkraten (idempotenten) zagon za profile, ki so department_code dobili
-- PREDEN je ta sprožilec obstajal - sprožilec sam se namreč ne požene za
-- pretekle vrstice, samo za bodoče insert/update.
insert into public.profile_departments (profile_id, department_code, sort_order)
select id, department_code, 0 from public.profiles
where department_code is not null
on conflict (profile_id, department_code) do nothing;

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

-- ---------------------------------------------------------------------
-- 8) Mesečna zgodovina stanja dopusta (Kadris) + trend
--    Na izrecno željo: admin vsak mesec uvozi izvoz iz Kadrisa (ime,
--    šifra zaposlenega/"Mat.št", leto, mesec, DOPUST). employee_code je
--    edini stabilen ključ med meseci (zaporedna št. se spreminja, imena se
--    včasih zapišejo drugače) - ista logika kot že uveljavljen
--    profile_hr_details.employee_code, zato se prek njega samodejno
--    poveže s pravim profilom, če je znan.
-- ---------------------------------------------------------------------
create table if not exists public.leave_balance_history (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null,
  full_name text not null,
  leto smallint not null check (leto between 2020 and 2100),
  mesec smallint not null check (mesec between 1 and 12),
  dnevi numeric(5,1) not null check (dnevi >= 0),
  profile_id uuid references public.profiles (id) on delete set null,
  uvozeno timestamptz not null default now(),
  uvozil uuid references auth.users (id) on delete set null,
  unique (employee_code, leto, mesec)
);

comment on column public.leave_balance_history.dnevi is 'Preostali dnevi dopusta na prvi dan meseca (stolpec DOPUST v Kadrisu)';

create index if not exists idx_leave_balance_history_obdobje on public.leave_balance_history (leto, mesec);
create index if not exists idx_leave_balance_history_profile on public.leave_balance_history (profile_id);

alter table public.leave_balance_history enable row level security;
drop policy if exists leave_balance_history_select on public.leave_balance_history;
create policy leave_balance_history_select on public.leave_balance_history
  for select to authenticated using (
    public.current_role_is('admin') or profile_id = auth.uid()
  );
drop policy if exists leave_balance_history_admin_write on public.leave_balance_history;
create policy leave_balance_history_admin_write on public.leave_balance_history
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- Pregled s primerjavo s prejšnjim mesecem (lag). security_invoker: pogled
-- spoštuje RLS zgoraj, torej ne-admin vidi kvečjemu svojo vrstico.
create or replace view public.leave_balance_pregled
with (security_invoker = true) as
select
  h.id, h.employee_code, h.full_name, h.leto, h.mesec, h.dnevi, h.profile_id, h.uvozeno,
  lag(h.dnevi) over (partition by h.employee_code order by h.leto, h.mesec) as dnevi_prejsnji,
  h.dnevi - lag(h.dnevi) over (partition by h.employee_code order by h.leto, h.mesec) as sprememba
from public.leave_balance_history h;

create or replace view public.leave_balance_obdobja
with (security_invoker = true) as
select leto, mesec, count(*) as stevilo_oseb, max(uvozeno) as zadnji_uvoz
from public.leave_balance_history
group by leto, mesec
order by leto desc, mesec desc;

-- Ob vsakem uvozu drži profile_hr_details.leave_balance_days/asof usklajena
-- z NAJNOVEJŠIM mesecem te osebe v zgodovini - tako Imenik (trenutno stanje)
-- in ta zgodovina (trend) nikoli ne razideta, ne glede na to, v katerem
-- vrstnem redu admin uvozi mesece.
create or replace function public.sync_leave_balance_to_hr_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  najnovejsi record;
begin
  if new.profile_id is null then
    return new;
  end if;

  select leto, mesec into najnovejsi
  from public.leave_balance_history
  where employee_code = new.employee_code
  order by leto desc, mesec desc
  limit 1;

  if najnovejsi.leto = new.leto and najnovejsi.mesec = new.mesec then
    insert into public.profile_hr_details (profile_id, leave_balance_days, leave_balance_asof, updated_at)
    values (new.profile_id, new.dnevi, make_date(new.leto, new.mesec, 1), now())
    on conflict (profile_id) do update set
      leave_balance_days = excluded.leave_balance_days,
      leave_balance_asof = excluded.leave_balance_asof,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_leave_balance on public.leave_balance_history;
create trigger trg_sync_leave_balance
  after insert or update of dnevi, profile_id on public.leave_balance_history
  for each row execute function public.sync_leave_balance_to_hr_details();
