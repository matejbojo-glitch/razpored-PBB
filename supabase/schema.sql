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

-- ---------------------------------------------------------------------
-- 12) absence_color_map — pomni, katera barva celice v uvoženem barvnem
--     koledarju odsotnosti (Kadris) pomeni katero vrsto (leave_entries.kind),
--     da administratorju vsak mesec ni treba znova ročno določati istih
--     barv. Sam uvoz piše neposredno v obstoječ leave_entries (upsert, brez
--     brisanja), zato ta tabela hrani SAMO preslikavo barva->vrsta, ne
--     podatkov o odsotnostih samih.
-- ---------------------------------------------------------------------
create table if not exists public.absence_color_map (
  barva text primary key,
  kind text check (kind in ('omejitev', 'ld', 'bs', 'sti')),
  prezri boolean not null default false,
  posodobil uuid references auth.users (id) on delete set null,
  posodobljeno timestamptz not null default now(),
  check ((prezri and kind is null) or (not prezri and kind is not null))
);

comment on table public.absence_color_map is 'ARGB barva celice iz uvoženega Excela -> vrsta odsotnosti (leave_entries.kind); prezri=true pomeni "ni odsotnost, ne uvažaj"';

alter table public.absence_color_map enable row level security;
drop policy if exists absence_color_map_admin on public.absence_color_map;
create policy absence_color_map_admin on public.absence_color_map
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

-- ---------------------------------------------------------------------
-- 13) admin_view_as_log — revizijska sled za "Prijavi se kot" (admin vidi
--     aplikacijo iz perspektive izbranega uporabnika, brez poznavanja/
--     ponastavljanja njegovega gesla). To NI prava zamenjava seje: prava
--     Supabase avtentikacija ostane administratorjeva (varno brez
--     service_role ključa na strežniku, ki ga to brez-strežniško
--     postavljanje nima), samo odjemalec (supabase-client.js) med ogledom
--     lokalno preslika profil/"jaz" na ciljno osebo - zato je vsak
--     začetek/konec ogleda zabeležen tu, admin_id pa je vedno resnični
--     prijavljeni administrator (auth.uid()), ne more se ponarejati.
-- ---------------------------------------------------------------------
create table if not exists public.admin_view_as_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete cascade,
  admin_email text,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  target_full_name text,
  target_email text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_admin_view_as_log_admin on public.admin_view_as_log (admin_id);

alter table public.admin_view_as_log enable row level security;

-- Celotna sled je vidna VSEM administratorjem (ne samo tistemu, ki je
-- ogled začel) - namenoma, ker je smisel revizijske sledi nadzor, ne
-- zasebnost pred drugimi administratorji.
drop policy if exists admin_view_as_log_select on public.admin_view_as_log;
create policy admin_view_as_log_select on public.admin_view_as_log
  for select to authenticated using (public.current_role_is('admin'));

-- Vpis/zaključek vrstice pa lahko naredi SAMO administrator o svojem
-- lastnem ogledu (admin_id mora biti resnični auth.uid()) - da en admin
-- ne bi mogel beležiti (ali predčasno zaključiti) ogleda v imenu drugega.
drop policy if exists admin_view_as_log_insert on public.admin_view_as_log;
create policy admin_view_as_log_insert on public.admin_view_as_log
  for insert to authenticated with check (public.current_role_is('admin') and admin_id = auth.uid());

drop policy if exists admin_view_as_log_update on public.admin_view_as_log;
create policy admin_view_as_log_update on public.admin_view_as_log
  for update to authenticated using (public.current_role_is('admin') and admin_id = auth.uid())
  with check (public.current_role_is('admin') and admin_id = auth.uid());

-- ---------------------------------------------------------------------
-- 14) employee_wishes — "Seznam želja" (zelje.html), razdeljen po
--     oddelkih. Na izrecno navodilo: samo 6 SMS/TZN oddelkov (B/C/C1/D/
--     E1/E2) + "VODJE" (nosilci oddelkov) - ostali oddelčni kod (DEZ,
--     NEDEZ, PDZN, SOBO ...) NISO del te funkcije, zato "department_code"
--     tu NI vezan na splošno tabelo departments (ki jih vse vsebuje),
--     ampak ima svojo, namenoma ožjo omejitev. Prej je bil ta seznam
--     samo lokalen (IndexedDB v brskalniku, brez deljenja med napravami/
--     uporabniki) - zdaj je v Supabase, da "uporabnik vidi samo svoj
--     oddelek, admin/vodja vse" sploh lahko drži (RLS spodaj).
-- ---------------------------------------------------------------------
create table if not exists public.employee_wishes (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  department_code text not null check (department_code in ('B', 'C', 'C1', 'D', 'E1', 'E2', 'VODJE')),
  obdobje text,
  opis text,
  slika text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_employee_wishes_dept on public.employee_wishes (department_code);

alter table public.employee_wishes enable row level security;

drop policy if exists employee_wishes_select on public.employee_wishes;
create policy employee_wishes_select on public.employee_wishes
  for select to authenticated using (
    public.current_role_is('admin') or public.current_role_is('vodja')
    or department_code = public.current_department()
  );

-- Admin/vodja lahko vnese željo za katero koli osebo/oddelek (npr. sporočeno
-- po telefonu); navaden uporabnik samo zase, v svoj lasten oddelek - da si
-- ne bi mogel "podtakniti" želje v tuj oddelek.
drop policy if exists employee_wishes_insert on public.employee_wishes;
create policy employee_wishes_insert on public.employee_wishes
  for insert to authenticated with check (
    public.current_role_is('admin') or public.current_role_is('vodja')
    or (profile_id = auth.uid() and department_code = public.current_department())
  );

-- Admin/vodja lahko urejata svoje vnose brez dodatnih omejitev (enako kot pri
-- insertu - vodja vnaša/ureja tudi za druge osebe/oddelke). Navaden uporabnik
-- pa mora tudi po popravku ostati znotraj istih omejitev kot pri insertu
-- (svoj oddelek, svoje ime) - drugače bi lahko z update-om (mimo insert
-- pravila) "premaknil" svojo željo v tuj oddelek ali jo pripisal drugemu imenu.
drop policy if exists employee_wishes_update on public.employee_wishes;
create policy employee_wishes_update on public.employee_wishes
  for update to authenticated
  using (public.current_role_is('admin') or created_by = auth.uid())
  with check (
    public.current_role_is('admin')
    or (created_by = auth.uid() and public.current_role_is('vodja'))
    or (
      created_by = auth.uid()
      and department_code = public.current_department()
      and full_name = (select full_name from public.profiles where id = auth.uid())
    )
  );

drop policy if exists employee_wishes_delete on public.employee_wishes;
create policy employee_wishes_delete on public.employee_wishes
  for delete to authenticated using (public.current_role_is('admin') or created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 15) profiles.rotation_slot — nadomešča trdo kodirano drugo kolono
--     (rotacijska črka A-E) v admin.html WARDS_META.staff. RLS ni nova:
--     rotation_slot je navaden profiles stolpec, torej ga že pokrivata
--     obstoječa profiles_select (vsi ga vidijo) in profiles_update_admin
--     (samo admin ga ureja, prek Imenika) - enako kot department_code.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists rotation_slot text check (rotation_slot in ('A','B','C','D','E'));

-- Enkratna zasnovna vrednost = isti podatek, ki je bil doslej trdo kodiran
-- v WARDS_META (izpeljan iz analize dejanskega razporeda, glej
-- roster/analiza-razporedov.md). "and rotation_slot is null" naredi to
-- varno za ponovni zagon: ne prepiše ročnega popravka, ki ga admin naredi
-- pozneje v Imeniku.
update public.profiles p set rotation_slot = v.slot
from (values
  ('ROZMAN A.', 'E'), ('SVETINA S.', 'A'), ('REJC J.', 'D'), ('DOLAR T.', 'C'), ('VOVK U.', 'B'),
  ('ŠABIĆ S.', 'A'), ('KODRAS N.', 'B'), ('ROZMAN K.', 'C'), ('MOČNIK S.', 'D'), ('SMOLEJ N.', 'E'),
  ('DŽINIĆ A.', 'B'), ('STARC E.', 'E'), ('KARNIČAR J.', 'D'), ('ZEKAN A.', 'A'), ('ŠKANTAR M.', 'B'),
  ('VALJAVEC E.', 'C'), ('BEĆIROVIĆ N.', 'D'), ('SUŠNIK J.', 'A'), ('POGAČNIK M.', 'A'), ('GAZIBARA A.', 'C'),
  ('MURIĆ A.', 'D'), ('RANT L.', 'B'), ('REKIĆ E.', 'B'), ('MEGLIČ J.', 'C'),
  ('NUHANOVIĆ M.', 'C'), ('TOMAŠIĆ N.', 'A'), ('MRAVLJE U.', 'C'), ('VOZEL D.', 'E'),
  ('BRATUŠA M.', 'C'), ('SVETINA R.', 'E'), ('URANKER M.', 'A'), ('PETERMAN R.', 'D'), ('MALER A.', 'B'),
  ('MUŠIĆ A.', 'B'), ('BAJT A.', 'C'), ('VOLARIČ N.', 'E'), ('SODJA B.', 'D'), ('TALIĆ A.', 'A')
) as v(full_name, slot)
where p.full_name = v.full_name and p.rotation_slot is null;

-- ---------------------------------------------------------------------
-- 16) profile_hr_details.duty_* — osebne nastavitve dežurnega kadra
--     (min/maks dežurstev na mesec, prost dan v tednu, samo med tednom),
--     prej trdo kodirane v admin.html DEZURNI_ZACETNO. RLS ni nova - te
--     kolone pokrivata obstoječi profile_hr_details_select/_admin_write.
--     Št. dežurstev/zadnje dežurstvo NISTA tu - ti dve se od te spremembe
--     dalje računata živo iz schedule_entries (glej nalozizDezurniKader v
--     admin.html), zato ne potrebujeta stolpca ne seed vrednosti.
-- ---------------------------------------------------------------------
alter table public.profile_hr_details add column if not exists duty_min_monthly integer;
alter table public.profile_hr_details add column if not exists duty_max_monthly integer;
alter table public.profile_hr_details add column if not exists duty_day_off text check (duty_day_off in ('PO','TO','SR','ČE','PE','SO','NE'));
alter table public.profile_hr_details add column if not exists duty_weekdays_only boolean;

-- Enkratna zasnovna vrednost = isti podatek, ki je bil doslej trdo kodiran
-- v DEZURNI_ZACETNO. "coalesce(obstoječe, novo)" v update delu naredi to
-- varno za ponovni zagon: ne prepiše poznejšega ročnega popravka.
insert into public.profile_hr_details (profile_id, duty_min_monthly, duty_max_monthly, duty_day_off, duty_weekdays_only)
select p.id, v.min_m, v.max_m, v.day_off, v.weekdays_only
from (values
  ('ALUKIĆ DINO', 2, 3, null, false),
  ('ARNEŽ GREGA', 2, 3, null, false),
  ('BOJIĆ MATEJ', 2, 3, 'PO', false),
  ('DŽAMASTAGIĆ DENIS', 2, 3, null, false),
  ('PERVIZ AMAL', 2, 3, null, false),
  ('TOMAŽEVIČ SIMONA', 2, 3, null, false),
  ('TORKAR TANJA', 2, 3, null, false),
  ('HROVAT NINA', 2, 3, null, false),
  ('ŠUBIC PETRA', 2, 3, null, false),
  ('LUNAR MATEJA', 2, 3, null, false),
  ('MAVRI TRATNIK MAGDALENA', 2, 3, null, false),
  ('VELUŠČEK METKA', 2, 2, null, false),
  ('SALKIĆ MARUŠA', 1, 1, null, true),
  ('TRPIN SAŠA', 1, 1, null, true)
) as v(full_name, min_m, max_m, day_off, weekdays_only)
-- Ujemanje po VREČI BESED (velike črke, vrstni red ni pomemben), ne po
-- točnem zapisu: imena so bila medtem poenotena iz "PRIIMEK IME" v
-- "Priimek Ime", zato bi natančna primerjava tiho ujela nič vrstic in
-- dežurna pravila bi ostala nenastavljena, brez vsakega opozorila.
join public.profiles p on (
  select string_agg(d, ' ' order by d)
  from unnest(string_to_array(upper(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')), ' ')) d
) = (
  select string_agg(d, ' ' order by d)
  from unnest(string_to_array(upper(v.full_name), ' ')) d
)
on conflict (profile_id) do update set
  duty_min_monthly = coalesce(public.profile_hr_details.duty_min_monthly, excluded.duty_min_monthly),
  duty_max_monthly = coalesce(public.profile_hr_details.duty_max_monthly, excluded.duty_max_monthly),
  duty_day_off = coalesce(public.profile_hr_details.duty_day_off, excluded.duty_day_off),
  duty_weekdays_only = coalesce(public.profile_hr_details.duty_weekdays_only, excluded.duty_weekdays_only);

-- ---------------------------------------------------------------------
-- 17) FLEXI oddelek + department_shift_minimums + profile_hr_details.employee_code
--     Del kontrolnega seznama za jutri — tri stvari, ki so bile v Google
--     Sheets predlogah (Hospital/NZV/Dežurstva, 6.8.2026) uporabljene kot
--     "osnutek"/"referenca", zdaj postanejo pravi del aplikacije.
-- ---------------------------------------------------------------------

-- FLEXI kot pravi oddelek — plavajoče osebje, ki dela v več oddelkih hkrati
-- (glej roster/analiza-razporedov.md §4). Rotacijski generator
-- (generirajKalup/WARDS_META) namerno ostaja nedotaknjen — FLEXI kader se
-- še vedno ne razporeja samodejno, to je znana, dokumentirana omejitev.
-- Novi oddelek se avtomatsko pojavi v Imeniku (dropdown bere departments),
-- brez sprememb UI kode.
insert into public.departments (code, name) values
  ('FLEXI', 'FLEXI — plavajoče osebje (več oddelkov)')
on conflict (code) do update set name = excluded.name;

-- Minimumi po oddelku × izmeni — natančnejši nadomestek za "bazni kalup"
-- primerjavo, ki jo PokritostPoDnevih (admin.html) doslej uporablja.
-- Osnutek številk je iz starega analiznega prototipa (schedule_data.json,
-- department_requirements) — NI potrjen s strani koordinatorja, zato
-- admin.html to prikaže kot urejljivo tabelo, ne kot trdno pravilo.
create table if not exists public.department_shift_minimums (
  department_code text not null references public.departments (code) on update cascade,
  shift_bucket text not null check (shift_bucket in ('DOPOLDNE', 'POPOLDNE', 'PONOCI')),
  min_dms integer,
  min_sms integer,
  min_flexi integer,
  note text,
  updated_at timestamptz not null default now(),
  primary key (department_code, shift_bucket)
);

alter table public.department_shift_minimums enable row level security;

drop policy if exists dept_min_select on public.department_shift_minimums;
create policy dept_min_select on public.department_shift_minimums
  for select to authenticated using (true);

drop policy if exists dept_min_write on public.department_shift_minimums;
create policy dept_min_write on public.department_shift_minimums
  for all to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));

insert into public.department_shift_minimums (department_code, shift_bucket, min_dms, min_sms, min_flexi, note) values
  ('B', 'DOPOLDNE', 1, 1, null, null),
  ('B', 'POPOLDNE', null, 1, null, null),
  ('B', 'PONOCI', null, 1, null, null),
  ('C', 'DOPOLDNE', 1, 1, 1, null),
  ('C', 'POPOLDNE', null, 1, 1, null),
  ('C', 'PONOCI', null, 1, null, null),
  ('C1', 'DOPOLDNE', 1, 2, null, '1 SMS + Gazibara Aldin'),
  ('C1', 'POPOLDNE', null, 2, null, '1 SMS + Gazibara Aldin'),
  ('C1', 'PONOCI', null, 2, null, '1 SMS + Gazibara Aldin'),
  ('D', 'DOPOLDNE', 1, 2, null, null),
  ('D', 'POPOLDNE', null, 2, null, null),
  ('D', 'PONOCI', null, 2, null, null),
  ('E1', 'DOPOLDNE', 1, null, null, null),
  ('E1', 'POPOLDNE', null, 1, null, null),
  ('E1', 'PONOCI', null, 1, null, null),
  ('E2', 'DOPOLDNE', 1, 1, 1, null),
  ('E2', 'POPOLDNE', null, 1, 1, null),
  ('E2', 'PONOCI', null, 1, null, null)
on conflict (department_code, shift_bucket) do nothing;

-- Matična številka — enkraten seed za 68 oseb (47 SMS/TZN izmenskih delavcev
-- + 22 vodij/nosilcev oddelkov, iz "Zaposleni - SMS-DMS" in "Zaposleni -
-- Oddelki", 6.8.2026). `profile_hr_details.employee_code` stolpec je že
-- obstajal (uvožen prek HR podatkov), a doslej neizpolnjen za te osebe.
-- `imena_se_ujemata()` namesto točnega ujemanja, ker profiles.full_name
-- lahko odstopa po vrstnem redu/velikosti črk od "PRIIMEK IME" seznama
-- (glej komentar ob imena_se_ujemata zgoraj). Coalesce ščiti poznejši
-- ročni popravek v Imeniku.
insert into public.profile_hr_details (profile_id, employee_code)
select p.id, v.employee_code
from (values
  ('ALUKIĆ DINO', '823'),
  ('ARNEŽ GREGA', '1092'),
  ('BAJT ANJA', '830'),
  ('BEĆIROVIĆ NELVEDIN', '1069'),
  ('BIZJAK TEA', '989'),
  ('BOJIĆ MATEJ', '855'),
  ('BRATUŠA MARIJA', '691'),
  ('DJEDOVIĆ MARK', '1172'),
  ('DOLAR TOMAŽ', '747'),
  ('DŽAMASTAGIĆ DENIS', '912'),
  ('DŽINIĆ AMIN', '826'),
  ('GASHI GENTIANA', '1167'),
  ('GAZIBARA ALDIN', '1141'),
  ('HROVAT NINA', '820'),
  ('HUMAR SAŠA', '705'),
  ('HUSEINBAŠIĆ AJLA', '1086'),
  ('JEREB SARA', '994'),
  ('KARNIČAR JURE', '1145'),
  ('KODRAS NADJA', '1089'),
  ('KOGOJ EVA', '1180'),
  ('KVRŽIĆ MARKO', '1051'),
  ('LELIČ DIJANA', '1090'),
  ('LUNAR MATEJA', '844'),
  ('MAGLIĆ ALEKSANDER', '1001'),
  ('MALER ANTONINA', '971'),
  ('MAVRI TRATNIK MAGDALENA', '833'),
  ('MEGLIČ JAKA', '987'),
  ('MISOTIČ REBEKA', '1163'),
  ('MOČNIK SIMONA', '1084'),
  ('MRAVLJE UROŠ', '997'),
  ('MURIĆ ALMA', '964'),
  ('MUŠIĆ ALEN', '1109'),
  ('MUŠIČ INES', '926'),
  ('NUHANOVIĆ MERIMA', '909'),
  ('PERVIZ AMAL', '887'),
  ('PETERMAN RENATA', '818'),
  ('POGAČNIK MATEJ', '1075'),
  ('POGAČNIK TEJA', '1058'),
  ('RANT LUKA', '1072'),
  ('REJC JANA', '973'),
  ('REKIĆ ELMA', '1106'),
  ('ROZMAN ANKA', '715'),
  ('ROZMAN KLARA', '1062'),
  ('SALKIĆ MARUŠA', '925'),
  ('SMOLEJ NATAŠA', '1133'),
  ('SODJA BARBARA', '1073'),
  ('SOFRIĆ NIKOLINA', '1174'),
  ('STARC ERIK', '1164'),
  ('SUŠNIK JAKA', '1022'),
  ('SVETINA ROBERT', '633'),
  ('SVETINA SABINA', '676'),
  ('TALIĆ AMIRA', '1159'),
  ('TOMAŠIĆ NIKOLINA', '1035'),
  ('TOMAŽEVIČ SIMONA', '793'),
  ('TORKAR TANJA', '965'),
  ('TRPIN SAŠA', '870'),
  ('URANKER MOJCA', '604'),
  ('VALJAVEC ENEJ', '1102'),
  ('VELUŠČEK METKA', '834'),
  ('VOLARIČ NEJC', '865'),
  ('VOVK URŠKA', '657'),
  ('VOZEL DEJAN', '991'),
  ('VOZEL NEJA', '1179'),
  ('VREVC MAJA', '974'),
  ('ZEKAN ALMEDIN', '852'),
  ('ŠABIĆ SEBINA', '1152'),
  ('ŠKANTAR MARK', '963'),
  ('ŠUBIC PETRA', '905')
) as v(full_name, employee_code)
join public.profiles p on public.imena_se_ujemata(p.full_name, v.full_name)
on conflict (profile_id) do update set
  employee_code = coalesce(public.profile_hr_details.employee_code, excluded.employee_code);

-- ---------------------------------------------------------------------
-- 18) Oddelek/vloga po e-pošti — dopolnilo k skripte/uvoz-racunov.mjs
--     Ta skripta samo ustvari Auth račune (prazen department_code, role
--     privzeto 'user'); ta blok jih takoj po tem samodejno izpolni za
--     osebe, kjer je vir (roster/zaposleni-vloge-gesla.csv) nedvoumen.
--     Ujemanje po e-pošti (ne po imenu) — bolj zanesljivo, ker e-pošto
--     pozna handle_new_user() natančno (iz auth.users.email), brez
--     razhajanj v zapisu imena.
--
--     "coalesce(department_code, ...)" in "role samo če je še 'user'"
--     naredita to varno za ponovni zagon: ne prepišeta poznejšega
--     ročnega popravka v Imeniku, in NIKOLI ne povrneta admina/vodjo
--     nazaj na 'user'.
--
--     10 vodij/adminov (Alukić Dino, Arnež Grega, Bizjak Tea, Bojić Matej,
--     Lelić Dijana, Maglić Aleksander, Mavri Tratnik Magdalena, Mušič Ines,
--     Šubic Petra, Trpin Saša), ki jim prvotno (iz zaposleni-vloge-gesla.csv)
--     ni bilo mogoče dodeliti nedvoumnega oddelka, imajo tu department_code
--     dopolnjen iz že obstoječe tabele (10) lead_departments — ta natančno
--     pozna njihov "domači" oddelek (isti vir, ki že polni Statistiko/Vodje).
--
--     Tri osebe, ki jim noben vir ni dal konkretnega oddelka (Zaplotnik
--     Alenka, Balek Mija, Sejdinović Mustafa), so 13. 8. 2026 zapustile
--     bolnišnico in so iz tega seznama odstranjene — skupaj s Stare Luko.
--     Za njihov izbris iz obstoječe baze glej supabase/odstrani-zaposlene.sql.
--     Za "FLEXI/<oddelek>" zapise je department_code=
--     'FLEXI' (primarni), spodnji drugi insert pa doda njihov "domači"
--     oddelek kot SEKUNDARNO članstvo prek profile_departments (oseba je
--     hkrati FLEXI in npr. E2/C/A).
-- ---------------------------------------------------------------------
update public.profiles p set
  department_code = coalesce(p.department_code, v.dept),
  role = case when p.role = 'user' then coalesce(v.role, p.role) else p.role end
from (values
  ('ajla.huseinbasic@pb-begunje.si', 'FLEXI', 'user'),
  ('aldin.gazibara@pb-begunje.si', 'C1', 'user'),
  ('aleksander.maglic@pb-begunje.si', 'E1', 'vodja'),
  ('alen.music@pb-begunje.si', 'E2', 'user'),
  ('alma.muric@pb-begunje.si', 'D', 'user'),
  ('almedin.zekan@pb-begunje.si', 'C1', 'user'),
  ('amal.perviz@pb-begunje.si', 'D', 'vodja'),
  ('amin.dzinic@pb-begunje.si', 'C1', 'user'),
  ('amira.talic@pb-begunje.si', 'E2', 'user'),
  ('anja.bajt@pb-begunje.si', 'E2', 'user'),
  ('anka.rozman@pb-begunje.si', 'B', 'user'),
  ('antonina.maler@pb-begunje.si', 'E1', 'user'),
  ('barbara.sodja@pb-begunje.si', 'E2', 'user'),
  ('dejan.vozel@pb-begunje.si', 'D', 'user'),
  ('denis.dzamastagic@pb-begunje.si', 'PDZN', 'admin'),
  ('dijana.lelic@pb-begunje.si', 'E2', 'vodja'),
  ('dino.alukic@pb-begunje.si', 'PDZN', 'admin'),
  ('elma.rekic@pb-begunje.si', 'D', 'user'),
  ('enej.valjavec@pb-begunje.si', 'C1', 'user'),
  ('erik.starc@pb-begunje.si', 'C1', 'user'),
  ('eva.kogoj@pb-begunje.si', 'FLEXI', 'user'),
  ('gentiana.gashi@pb-begunje.si', 'FLEXI', 'user'),
  ('grega.arnez@pb-begunje.si', 'C1', 'vodja'),
  ('ines.music@pb-begunje.si', 'SA', 'vodja'),
  ('jaka.meglic@pb-begunje.si', 'D', 'user'),
  ('jaka.susnik@pb-begunje.si', 'C1', 'user'),
  ('jana.rejc@pb-begunje.si', 'B', 'user'),
  ('jure.karnicar@pb-begunje.si', 'C1', 'user'),
  ('klara.rozman@pb-begunje.si', 'C', 'user'),
  ('luka.rant@pb-begunje.si', 'D', 'user'),
  ('magdalena.mavritratnik@pb-begunje.si', 'B1B2', 'vodja'),
  ('maja.vrevc@pb-begunje.si', 'FLEXI', 'user'),
  ('marija.bratusa@pb-begunje.si', 'E1', 'user'),
  ('mark.djedovic@pb-begunje.si', 'C', 'user'),
  ('mark.skantar@pb-begunje.si', 'C1', 'user'),
  ('marko.kvrzic@pb-begunje.si', 'FLEXI', 'user'),
  ('marusa.salkic@pb-begunje.si', 'C1', 'vodja'),
  ('matej.bojic@pb-begunje.si', 'PDZN', 'admin'),
  ('matej.pogacnik@pb-begunje.si', 'C1', 'user'),
  ('mateja.lunar@pb-begunje.si', 'B', 'vodja'),
  ('merima.nuhanovic@pb-begunje.si', 'D', 'user'),
  ('metka.veluscek@pb-begunje.si', 'SOBO', 'vodja'),
  ('mojca.uranker@pb-begunje.si', 'E1', 'user'),
  ('nadja.kodras@pb-begunje.si', 'C', 'user'),
  ('natasa.smolej@pb-begunje.si', 'C', 'user'),
  ('neja.vozel@pb-begunje.si', 'FLEXI', 'user'),
  ('nejc.volaric@pb-begunje.si', 'E2', 'user'),
  ('nelvedin.becirovic@pb-begunje.si', 'C1', 'user'),
  ('nikolina.sofric@pb-begunje.si', 'E2', 'vodja'),
  ('nikolina.tomasic@pb-begunje.si', 'D', 'user'),
  ('nina.hrovat@pb-begunje.si', 'DB', 'vodja'),
  ('petra.subic@pb-begunje.si', 'B1B2', 'vodja'),
  ('rebeka.misotic@pb-begunje.si', 'C', 'vodja'),
  ('renata.peterman@pb-begunje.si', 'E1', 'user'),
  ('robert.svetina@pb-begunje.si', 'E1', 'user'),
  ('sabina.svetina@pb-begunje.si', 'B', 'user'),
  ('sara.jereb@pb-begunje.si', 'FLEXI', 'user'),
  ('sasa.humar@pb-begunje.si', 'SA', 'user'),
  ('sasa.trpin@pb-begunje.si', 'SA', 'vodja'),
  ('sebina.sabic@pb-begunje.si', 'C1', 'user'),
  ('simona.mocnik@pb-begunje.si', 'D', 'user'),
  ('simona.tomazevic@pb-begunje.si', 'A', 'vodja'),
  ('tanja.torkar@pb-begunje.si', 'DB', 'vodja'),
  ('tea.bizjak@pb-begunje.si', 'SA', 'vodja'),
  ('teja.pogacnik@pb-begunje.si', 'E1', 'vodja'),
  ('tomaz.dolar@pb-begunje.si', 'B', 'user'),
  ('uros.mravlje@pb-begunje.si', 'D', 'user'),
  ('urska.vovk@pb-begunje.si', 'B', 'user')
) as v(email, dept, role)
where lower(p.email) = v.email;

-- FLEXI osebe: sekundarno članstvo v "domačem" oddelku (glej opombo zgoraj).
insert into public.profile_departments (profile_id, department_code, sort_order)
select p.id, v.dept2, 1
from (values
  ('gentiana.gashi@pb-begunje.si', 'E2'),
  ('ajla.huseinbasic@pb-begunje.si', 'E2'),
  ('sara.jereb@pb-begunje.si', 'C'),
  ('eva.kogoj@pb-begunje.si', 'E2'),
  ('marko.kvrzic@pb-begunje.si', 'C'),
  ('neja.vozel@pb-begunje.si', 'C'),
  ('maja.vrevc@pb-begunje.si', 'A')
) as v(email, dept2)
join public.profiles p on lower(p.email) = v.email
on conflict (profile_id, department_code) do nothing;

-- ---------------------------------------------------------------------
-- 19) Obrazec "Zahtevek za spremembo evidence delovnega časa in razporeda"
--     Digitalna različica papirnatega obrazca PB Begunje istega imena
--     (prvotno "Obvestilo koordinatorici za razporejanje kadra v ZN" -
--     preimenovano na izrecno željo uporabnika). Namenoma LOČEN od
--     obstoječega swap_requests (menjave.html) — ta obrazec je širši
--     (3 kategorije: ročno evidentiranje / menjava službe / drugo) in za
--     menjavo dodaja korak "sodelavec mora najprej privoliti" ter
--     preverjanje 11-urnega počitka, česar swap_requests ne počne.
--
--     Prilagojeno iz zunanjega referenčnega gradiva (druga aplikacija,
--     shema profili/zaposleni_kadris) na obstoječo shemo profiles/
--     departments/schedule_entries — brez "koordinator" kot 4. vloge:
--     ta korak opravi kdorkoli ima role='admin' (enako kot povsod drugod
--     v aplikaciji, npr. 2. stopnja pri swap_requests).
-- ---------------------------------------------------------------------

-- Neposredni vodja — ločeno od profile_hr_details.manager_name (ki je
-- samo prikazno prosto besedilo). Ta stolpec je prava FK-povezava, ker ga
-- spodnje RPC funkcije uporabljajo za usmerjanje odobritev. Admin ga
-- ureja v Imeniku (nov dropdown izbirnik druge osebe).
alter table public.profiles add column if not exists vodja_id uuid references public.profiles (id) on delete set null;

create table if not exists public.obrazci (
  id uuid primary key default gen_random_uuid(),
  stevilka text unique,
  vrsta text not null check (vrsta in ('rocno_evidentiranje', 'menjava_sluzbe', 'drugo')),
  status text not null default 'osnutek'
    check (status in ('osnutek', 'caka_sodelavca', 'caka_vodjo', 'caka_koordinatorja', 'zakljucen', 'zavrnjen', 'preklican')),
  vlagatelj_id uuid not null references public.profiles (id) on delete restrict,
  sodelavec_id uuid references public.profiles (id) on delete restrict,
  vodja_id uuid references public.profiles (id) on delete set null,
  koordinator_id uuid references public.profiles (id) on delete set null,
  polja jsonb not null default '{}'::jsonb,
  ustvarjen timestamptz not null default now(),
  zakljucen_dne timestamptz,
  razlog_zavrnitve text,
  constraint obrazci_sodelavec_le_pri_menjavi check (vrsta = 'menjava_sluzbe' or sodelavec_id is null),
  constraint obrazci_sodelavec_ni_vlagatelj check (sodelavec_id is null or sodelavec_id <> vlagatelj_id)
);
create index if not exists idx_obrazci_vlagatelj on public.obrazci (vlagatelj_id);
create index if not exists idx_obrazci_sodelavec on public.obrazci (sodelavec_id);
create index if not exists idx_obrazci_status on public.obrazci (status);

create sequence if not exists public.obrazci_zap;

create or replace function public.obrazec_stevilka()
returns trigger language plpgsql as $$
begin
  if new.stevilka is null then
    new.stevilka := 'OBV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.obrazci_zap')::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists ob_vstavljanju_obrazca on public.obrazci;
create trigger ob_vstavljanju_obrazca before insert on public.obrazci
  for each row execute function public.obrazec_stevilka();

create table if not exists public.obrazci_dnevnik (
  id bigint generated always as identity primary key,
  obrazec_id uuid not null references public.obrazci (id) on delete cascade,
  stopnja smallint not null,
  dejanje text not null,
  uporabnik_id uuid references public.profiles (id) on delete set null,
  ime_ob_dejanju text,
  vloga_ob_dejanju text,
  opomba text,
  cas timestamptz not null default now()
);
create index if not exists idx_obrazci_dnevnik_obrazec on public.obrazci_dnevnik (obrazec_id, cas);

alter table public.obrazci enable row level security;
alter table public.obrazci_dnevnik enable row level security;

drop policy if exists obrazci_select on public.obrazci;
create policy obrazci_select on public.obrazci for select to authenticated using (
  vlagatelj_id = auth.uid()
  or sodelavec_id = auth.uid()
  or vodja_id = auth.uid()
  or public.current_role_is('admin')
);

-- Vlagatelj sme vstaviti samo svoj osnutek. Vse nadaljnje spremembe gredo
-- skozi spodnje funkcije — tu ni pravila za update, zato tudi neposreden
-- klic API mimo funkcij ne more obiti verige odobritev.
drop policy if exists obrazci_insert on public.obrazci;
create policy obrazci_insert on public.obrazci for insert to authenticated
  with check (vlagatelj_id = auth.uid() and status = 'osnutek');

drop policy if exists obrazci_dnevnik_select on public.obrazci_dnevnik;
create policy obrazci_dnevnik_select on public.obrazci_dnevnik for select to authenticated using (
  exists (
    select 1 from public.obrazci o where o.id = obrazci_dnevnik.obrazec_id
    and (o.vlagatelj_id = auth.uid() or o.sodelavec_id = auth.uid() or o.vodja_id = auth.uid() or public.current_role_is('admin'))
  )
);

create or replace function public.zapisi_v_dnevnik(
  p_obrazec uuid, p_stopnja smallint, p_dejanje text, p_opomba text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_ime text; v_vloga text;
begin
  select full_name, role into v_ime, v_vloga from public.profiles where id = auth.uid();
  insert into public.obrazci_dnevnik (obrazec_id, stopnja, dejanje, uporabnik_id, ime_ob_dejanju, vloga_ob_dejanju, opomba)
  values (p_obrazec, p_stopnja, p_dejanje, auth.uid(), v_ime, v_vloga, p_opomba);
end;
$$;
revoke execute on function public.zapisi_v_dnevnik(uuid, smallint, text, text) from public, anon, authenticated;

-- STOPNJA 1 — oddaja
create or replace function public.obrazec_oddaj(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o public.obrazci; v_vodja uuid; v_status text;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.vlagatelj_id <> auth.uid() then raise exception 'Oddaš lahko samo svoj obrazec'; end if;
  if o.status <> 'osnutek' then raise exception 'Obrazec je že oddan'; end if;

  select vodja_id into v_vodja from public.profiles where id = auth.uid();
  if v_vodja is null then raise exception 'Nimaš določenega neposrednega vodje — admin ga mora najprej nastaviti v Imeniku.'; end if;

  if o.vrsta = 'menjava_sluzbe' then
    if o.sodelavec_id is null then raise exception 'Pri menjavi je treba izbrati sodelavca'; end if;
    v_status := 'caka_sodelavca';
  else
    v_status := 'caka_vodjo';
  end if;

  update public.obrazci set status = v_status, vodja_id = v_vodja where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 1::smallint, 'ODDANO');
  return v_status;
end;
$$;
grant execute on function public.obrazec_oddaj(uuid) to authenticated;

-- STOPNJA 2 — sodelavec potrdi (samo menjava)
create or replace function public.obrazec_potrdi_sodelavec(p_id uuid, p_sprejmi boolean, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o public.obrazci;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.sodelavec_id <> auth.uid() then raise exception 'Nisi izbrani sodelavec'; end if;
  if o.status <> 'caka_sodelavca' then raise exception 'Obrazec ni v stanju čakanja na sodelavca'; end if;

  if p_sprejmi then
    update public.obrazci set status = 'caka_vodjo' where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 2::smallint, 'SODELAVEC_POTRDIL', p_opomba);
    return 'caka_vodjo';
  else
    update public.obrazci set status = 'zavrnjen', razlog_zavrnitve = p_opomba where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 2::smallint, 'SODELAVEC_ZAVRNIL', p_opomba);
    return 'zavrnjen';
  end if;
end;
$$;
grant execute on function public.obrazec_potrdi_sodelavec(uuid, boolean, text) to authenticated;

-- STOPNJA 3 — neposredni vodja
create or replace function public.obrazec_potrdi_vodja(p_id uuid, p_sprejmi boolean, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o public.obrazci;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.vodja_id <> auth.uid() then raise exception 'Nisi neposredni vodja vlagatelja'; end if;
  if o.status <> 'caka_vodjo' then raise exception 'Obrazec ni v stanju čakanja na vodjo'; end if;

  if p_sprejmi then
    update public.obrazci set status = 'caka_koordinatorja' where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 3::smallint, 'VODJA_ODOBRIL', p_opomba);
    return 'caka_koordinatorja';
  else
    update public.obrazci set status = 'zavrnjen', razlog_zavrnitve = p_opomba where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 3::smallint, 'VODJA_ZAVRNIL', p_opomba);
    return 'zavrnjen';
  end if;
end;
$$;
grant execute on function public.obrazec_potrdi_vodja(uuid, boolean, text) to authenticated;

-- STOPNJA 4 — koordinator (role='admin'); ob potrditvi menjave zamenja
-- schedule_entries.shift_code med vlagateljem in sodelavcem — isti vzorec
-- kot decide_swap_admin (glej zgoraj), samo brez zaposleni_kadris/mat_st
-- posrednika, ker so profiles.id že stabilen ključ.
create or replace function public.obrazec_potrdi_koordinator(p_id uuid, p_sprejmi boolean, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  o public.obrazci;
  v_dan_a date; v_dan_b date;
  v_izmena_a text; v_izmena_b text;
  v_dept_a text; v_dept_b text;
begin
  if not public.current_role_is('admin') then
    raise exception 'Za končno potrditev nimaš pravic';
  end if;

  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.status <> 'caka_koordinatorja' then raise exception 'Obrazec ni v stanju čakanja na koordinatorja'; end if;

  if not p_sprejmi then
    update public.obrazci set status = 'zavrnjen', razlog_zavrnitve = p_opomba, koordinator_id = auth.uid() where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 4::smallint, 'KOORDINATOR_ZAVRNIL', p_opomba);
    return 'zavrnjen';
  end if;

  if o.vrsta = 'menjava_sluzbe' then
    v_dan_a := (o.polja ->> 'datum_a')::date;
    v_dan_b := (o.polja ->> 'datum_b')::date;

    select shift_code into v_izmena_a from public.schedule_entries where employee_id = o.vlagatelj_id and work_date = v_dan_a;
    select shift_code into v_izmena_b from public.schedule_entries where employee_id = o.sodelavec_id and work_date = v_dan_b;
    select department_code into v_dept_a from public.profiles where id = o.vlagatelj_id;
    select department_code into v_dept_b from public.profiles where id = o.sodelavec_id;

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    values (o.vlagatelj_id, v_dept_a, v_dan_a, coalesce(v_izmena_b, ''), now())
    on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, updated_at = now();

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    values (o.sodelavec_id, v_dept_b, v_dan_b, coalesce(v_izmena_a, ''), now())
    on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, updated_at = now();
  end if;

  update public.obrazci set status = 'zakljucen', koordinator_id = auth.uid(), zakljucen_dne = now() where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 4::smallint, 'KOORDINATOR_POTRDIL', p_opomba);
  return 'zakljucen';
end;
$$;
grant execute on function public.obrazec_potrdi_koordinator(uuid, boolean, text) to authenticated;

-- Preklic s strani vlagatelja, dokler ni zaključen
create or replace function public.obrazec_preklici(p_id uuid, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o public.obrazci;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.vlagatelj_id <> auth.uid() then raise exception 'Prekličeš lahko samo svoj obrazec'; end if;
  if o.status in ('zakljucen', 'zavrnjen', 'preklican') then raise exception 'Obrazca v tem stanju ni mogoče preklicati'; end if;

  update public.obrazci set status = 'preklican', razlog_zavrnitve = p_opomba where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 0::smallint, 'VLAGATELJ_PREKLICAL', p_opomba);
  return 'preklican';
end;
$$;
grant execute on function public.obrazec_preklici(uuid, text) to authenticated;

-- Kaj čaka name — enako kot obstoječi "Menjave" rumen klicaj, samo za ta obrazec.
create or replace view public.obrazci_moja_naloga
with (security_invoker = true) as
select o.*,
  case
    when o.status = 'caka_sodelavca' and o.sodelavec_id = auth.uid() then 'potrdi_kot_sodelavec'
    when o.status = 'caka_vodjo' and o.vodja_id = auth.uid() then 'odobri_kot_vodja'
    when o.status = 'caka_koordinatorja' and public.current_role_is('admin') then 'potrdi_kot_koordinator'
  end as moje_dejanje
from public.obrazci o;

-- ---------------------------------------------------------------------
-- 19b) Pomožne funkcije za menjavo: kdo je odsoten, kdo je na voljo,
--      preverjanje 11-urnega počitka. Isti nabor kod izmen kot
--      generator-core.js/admin.html classify() — glede na to, da je
--      shift_code prosto besedilo, ujemanje po predponi (ne po tabeli
--      točnih vrednosti), da zajame vse dosedanje zapise (npr. "popoldan
--      do 19h" ali "popoldan do 19" — oboje).
-- ---------------------------------------------------------------------

-- Meje in "čez polnoč" za znane kode izmen. Vrne null, če koda ne pomeni
-- dela (LD/KPU/prazno/POMOČ DRUGJE) — take dneve pocitek_ustreza spodaj
-- preskoči.
create or replace function public.izmena_cas(p_sifra text)
returns table (zacetek time, konec time, cez_polnoc boolean)
language plpgsql immutable as $$
declare t text := lower(trim(coalesce(p_sifra, '')));
begin
  if t = '' or t like 'ld%' or t like 'kpu%' or t = 'pomoč drugje' then
    return;
  elsif t like '%nočna12%' then
    return query select time '17:50', time '06:00', true;
  elsif t like '%dnevna12%' then
    return query select time '07:00', time '19:00', false;
  elsif t like 'nočna od 19%' then
    return query select time '18:50', time '06:00', true;
  elsif t like 'nočna%' then
    return query select time '20:50', time '06:00', true;
  elsif t like 'dopoldan%' then
    return query select time '05:50', time '14:00', false;
  elsif t like 'popoldan do 19%' then
    return query select time '13:50', time '19:00', false;
  elsif t like 'popoldan%' then
    return query select time '13:50', time '21:00', false;
  elsif t like 'dežurstvo%' then
    return query select time '07:00', time '07:00', true; -- 24 ur
  end if;
  return;
end;
$$;

-- Ali bi oseba p_profile_id na p_datum v izmeni p_sifra ohranila 11 ur
-- počitka pred/po vseh svojih že razporejenih izmenah v okolici (±2 dni)?
-- Izjema (interno pravilo PB Begunje, glej PROMPTmenjavasluzbe.md): iz
-- "popoldan do 19" (konec 19.00) na "dopoldan"/"dnevna12" naslednji dan
-- (začetek 05.50/07.00) je dovoljeno kljub <11h, ker traja le ~10h50m/11h10m.
create or replace function public.pocitek_ustreza(p_profile_id uuid, p_datum date, p_sifra text)
returns boolean language plpgsql stable as $$
declare
  nova record; nova_od timestamp; nova_do timestamp;
  r record; sosed record; od timestamp; do_ timestamp;
begin
  select * into nova from public.izmena_cas(p_sifra);
  if nova is null then return true; end if; -- ne dela ta dan, počitek ni relevanten

  nova_od := p_datum + nova.zacetek;
  nova_do := p_datum + nova.konec + (case when nova.cez_polnoc then interval '1 day' else interval '0' end);

  for r in
    select se.work_date, se.shift_code from public.schedule_entries se
    where se.employee_id = p_profile_id and se.work_date between p_datum - 2 and p_datum + 2 and se.work_date <> p_datum
  loop
    select * into sosed from public.izmena_cas(r.shift_code);
    if sosed is null then continue; end if;
    od := r.work_date + sosed.zacetek;
    do_ := r.work_date + sosed.konec + (case when sosed.cez_polnoc then interval '1 day' else interval '0' end);

    if r.work_date = p_datum - 1 and lower(trim(r.shift_code)) like 'popoldan do 19%'
       and (lower(trim(p_sifra)) like 'dopoldan%' or lower(trim(p_sifra)) like 'dnevna12%') then
      continue; -- interna izjema, glej komentar zgoraj
    end if;

    if nova_od < do_ + interval '11 hours' and od < nova_do + interval '11 hours' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Kdo je odsoten (dopust/omejitev/bolniška/študijski) med p_od in p_do,
-- vključno s pravilom "dan pred dopustom" (in petek prej, če se blok LD
-- začne v ponedeljek) — enako pravilo, kot ga generator-core.js/
-- generirajDezurstva že uporablja, tu na voljo kot splošna SQL funkcija.
create or replace function public.blokirani_dnevi(p_od date, p_do date)
returns table (profile_id uuid, datum date)
language sql stable as $$
  with le as (
    select p.id as profile_id, l.work_date, l.kind
    from public.leave_entries l
    join public.profiles p on public.imena_se_ujemata(p.full_name, l.full_name)
    where l.work_date between p_od - 3 and p_do
  ),
  ld_bloki as (
    select profile_id, work_date,
      lag(work_date) over (partition by profile_id order by work_date) as prejsnji
    from le where kind = 'ld'
  ),
  ld_pred as (
    select profile_id,
      (work_date - 1) as datum
    from ld_bloki where prejsnji is null or work_date - prejsnji > 1
    union
    select profile_id, (work_date - 3) as datum
    from ld_bloki
    where (prejsnji is null or work_date - prejsnji > 1) and extract(dow from work_date) = 1
  )
  select profile_id, work_date as datum from le where work_date between p_od and p_do
  union
  select profile_id, datum from ld_pred where datum between p_od and p_do;
$$;

-- Kandidati za menjavo izmene z osebo p_profile_id na dan p_datum: nekdo
-- drug, ki ima znotraj ±7 dni izmeno, ki jo je mogoče zamenjati, tisti dan
-- ni odsoten, in po zamenjavi OBEMA ostane 11 ur počitka.
create or replace function public.mozni_sodelavci(p_profile_id uuid, p_datum date)
returns table (
  profile_id uuid, full_name text, njihova_izmena text, njihov_datum date,
  moj_zacetek time, njihov_zacetek time, jaz_pridem_prej boolean
)
language plpgsql stable security invoker as $$
declare v_moja_sifra text;
begin
  select shift_code into v_moja_sifra from public.schedule_entries
    where employee_id = p_profile_id and work_date = p_datum;

  return query
  select p.id, p.full_name, se.shift_code, se.work_date,
    (select zacetek from public.izmena_cas(v_moja_sifra)),
    (select zacetek from public.izmena_cas(se.shift_code)),
    (select zacetek from public.izmena_cas(v_moja_sifra)) < (select zacetek from public.izmena_cas(se.shift_code))
  from public.schedule_entries se
  join public.profiles p on p.id = se.employee_id
  where se.work_date between p_datum - 7 and p_datum + 7
    and se.employee_id <> p_profile_id
    and se.shift_code is not null and se.shift_code <> ''
    and (select zacetek from public.izmena_cas(se.shift_code)) is not null
    and not exists (select 1 from public.blokirani_dnevi(p_datum, p_datum) b where b.profile_id = p.id)
    and not exists (select 1 from public.blokirani_dnevi(se.work_date, se.work_date) b where b.profile_id = p_profile_id)
    and public.pocitek_ustreza(p.id, p_datum, se.shift_code)
    and public.pocitek_ustreza(se.employee_id, se.work_date, v_moja_sifra)
  order by p.full_name;
end;
$$;
grant execute on function public.mozni_sodelavci(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 20) Enkraten popravek: full_name je bil za te 3 admin račune dobesedno
--     enak e-pošti namesto pravega imena (handle_new_user() je verjetno
--     padel nazaj na e-pošto, ker takrat ni dobil pravih metapodatkov o
--     imenu — glej tudi popravek uvoza v imenik.html, ki to od zdaj naprej
--     prepreči za bodoče uvoze). "coalesce" ni potreben - te tri vrednosti
--     so bile potrjeno napačne (enake e-pošti), zato je varno prepisati.
-- ---------------------------------------------------------------------
update public.profiles p set full_name = v.full_name
from (values
  ('matej.bojic@pb-begunje.si', 'BOJIĆ MATEJ'),
  ('denis.dzamastagic@pb-begunje.si', 'DŽAMASTAGIĆ DENIS'),
  ('dino.alukic@pb-begunje.si', 'ALUKIĆ DINO')
) as v(email, full_name)
where lower(p.email) = v.email and p.full_name = p.email;

-- ---------------------------------------------------------------------
-- 21) Enostopenjska odobritev menjav, kjer je udeležen vodja
--     ("Menjave dejansko potrebujejo samo vodje ki dežurajo" — vodja ne more
--     smiselno odločati o lastni menjavi na 1. stopnji, zato taka menjava
--     preskoči navadno dvostopenjsko verigo (vodja→admin) in gre naravnost
--     na EN sam korak, ki ga sme potrditi izključno oseba z zastavico
--     is_koordinator = true (privzeto samo Denis Džamastagić — glej seed
--     spodaj). Zastavica je urejljiva v Imeniku (admin), da ni trajno trdo
--     vezana na eno osebo. Ob potrditvi se menjava neposredno izvede v
--     schedule_entries — enak vzorec kot obstoječi decide_swap_admin.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_koordinator boolean not null default false;

update public.profiles set is_koordinator = true where lower(email) = 'denis.dzamastagic@pb-begunje.si';

alter table public.swap_requests drop constraint if exists swap_requests_status_check;
alter table public.swap_requests add constraint swap_requests_status_check check (
  status in (
    'pending_lead', 'pending_admin', 'pending_koordinator',
    'approved', 'rejected_by_lead', 'rejected_by_admin', 'rejected_by_koordinator'
  )
);

create or replace function public.current_is_koordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_koordinator from public.profiles where id = auth.uid()), false);
$$;

-- submit_swap_request: če je predlagatelj ALI sodelavec vodja, usmeri
-- naravnost na pending_koordinator namesto na običajni pending_lead.
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
  v_requester_role text;
  v_target_role text;
  v_status text;
begin
  if p_target_id = auth.uid() then
    raise exception 'Ne moreš predlagati menjave sam s seboj.';
  end if;

  select role into v_requester_role from public.profiles where id = auth.uid();
  select role into v_target_role from public.profiles where id = p_target_id;

  if v_requester_role = 'vodja' or v_target_role = 'vodja' then
    v_status := 'pending_koordinator';
  else
    v_status := 'pending_lead';
  end if;

  insert into public.swap_requests (requester_id, requester_date, target_id, target_date, note, status)
  values (auth.uid(), p_requester_date, p_target_id, p_target_date, p_note, v_status)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_swap_request(uuid, date, date, text) to authenticated;

-- Enostopenjska odločitev koordinatorja za menjave z udeleženim vodjo.
-- Namenoma NE preverja current_role_is('admin') - dostop je izključno
-- prek is_koordinator, tudi če je koordinator hkrati admin (Denis je).
create or replace function public.decide_swap_koordinator(
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
  if not public.current_is_koordinator() then
    raise exception 'Samo koordinator lahko odloča o tej menjavi.';
  end if;

  select * into v_req from public.swap_requests
  where id = p_swap_id and status = 'pending_koordinator'
  for update;

  if v_req.id is null then
    raise exception 'Predlog ne obstaja ali ni več v čakanju na koordinatorja.';
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
  set status = case when p_approve then 'approved' else 'rejected_by_koordinator' end,
      admin_id = auth.uid(),
      admin_decided_at = now(),
      admin_note = p_note,
      updated_at = now()
  where id = p_swap_id;
end;
$$;
grant execute on function public.decide_swap_koordinator(bigint, boolean, text) to authenticated;

-- swap_select: koordinator mora videti pending_koordinator vrstice tudi če
-- ni admin (dostop naj bo neodvisen od role, samo od zastavice).
drop policy if exists swap_select on public.swap_requests;
create policy swap_select on public.swap_requests
  for select to authenticated using (
    requester_id = auth.uid()
    or target_id = auth.uid()
    or public.current_role_is('admin')
    or public.current_is_koordinator()
    or (
      public.current_role_is('vodja')
      and public.current_department() = (select department_code from public.profiles where id = requester_id)
    )
  );

-- notify_swap_status_change: dopolni sporočila za novo enostopenjsko pot.
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
    when 'pending_admin'           then 'Vodja je odobril predlog menjave — čaka na administratorja.'
    when 'pending_koordinator'     then 'Predlog menjave čaka na potrditev koordinatorja.'
    when 'approved'                then 'Menjava izmene je bila potrjena.'
    when 'rejected_by_lead'        then 'Vodja je zavrnil predlog menjave.'
    when 'rejected_by_admin'       then 'Administrator je zavrnil predlog menjave.'
    when 'rejected_by_koordinator' then 'Koordinator je zavrnil predlog menjave.'
    else 'Status predloga menjave se je spremenil: ' || new.status
  end;
  insert into public.notifications (user_id, swap_request_id, message)
  values (new.requester_id, new.id, msg), (new.target_id, new.id, msg);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 22) POPRAVEK sekcije 21 + prava izvedba: "vodja ki dežura" iz uporabnikove
--     zahteve NI pomenilo "vodja je udeležen v menjavi" (napačna predpostavka
--     sekcije 21), ampak "menjava DEŽURSTVA" (izmena, ne vloga osebe).
--     Poleg tega je uporabnik naročil ENO združeno stran "Menjava" namesto
--     ločenih menjave.html (swap_requests, dvostopenjski vodja→admin) +
--     obrazec.html (obrazci, štiristopenjski sodelavec→vodja→koordinator).
--     menjave.html je ukinjena (glej commit) - swap_requests ostane v bazi
--     nedotaknjen (brez izgube morebitnih obstoječih vrstic), samo brez UI
--     poti vanj. Vsa nova logika za menjave gre prek sistema "obrazci", ki
--     že ima pravo verigo za navadne menjave (sodelavec → vodja →
--     koordinator/admin) - dodana je samo veja za menjavo dežurstva, ki
--     preskoči korak vodje in gre h koordinatorju, potrdi pa jo lahko
--     izključno oseba z is_koordinator=true (ne kdorkoli admin).
-- ---------------------------------------------------------------------

-- Prekliči napačno usmerjanje submit_swap_request iz sekcije 21 - nazaj na
-- izvirno obnašanje (vedno pending_lead). Funkcija ostane v bazi (varno, ni
-- podatkov), le brez UI, ki bi jo klicala.
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

-- decide_swap_koordinator je bila specifična za napačno vodja-usmerjanje -
-- ni več potrebna (obrazci sistem ima svojo obrazec_potrdi_koordinator).
drop function if exists public.decide_swap_koordinator(bigint, boolean, text);

-- obrazci.je_dezurstvo: samodejno zaznano ob oddaji (glej obrazec_oddaj
-- spodaj) - ali je izmena predlagatelja ALI sodelavca na dan menjave
-- "DEŽURSTVO". Taka menjava preskoči stopnjo neposrednega vodje in gre
-- naravnost h koordinatorju, a to stopnjo sme potrditi izključno oseba z
-- is_koordinator=true (za razliko od navadne menjave, kjer koordinatorsko
-- stopnjo opravi kdorkoli ima role='admin').
alter table public.obrazci add column if not exists je_dezurstvo boolean not null default false;

-- STOPNJA 1 — oddaja (popravljena: zazna je_dezurstvo, vodja ni obvezen,
-- če ga menjava dežurstva sploh ne bo potrebovala).
create or replace function public.obrazec_oddaj(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  o public.obrazci;
  v_vodja uuid;
  v_status text;
  v_je_dez boolean := false;
  v_izmena_a text;
  v_izmena_b text;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.vlagatelj_id <> auth.uid() then raise exception 'Oddaš lahko samo svoj obrazec'; end if;
  if o.status <> 'osnutek' then raise exception 'Obrazec je že oddan'; end if;

  if o.vrsta = 'menjava_sluzbe' then
    if o.sodelavec_id is null then raise exception 'Pri menjavi je treba izbrati sodelavca'; end if;

    select shift_code into v_izmena_a from public.schedule_entries
      where employee_id = o.vlagatelj_id and work_date = (o.polja ->> 'datum_a')::date;
    select shift_code into v_izmena_b from public.schedule_entries
      where employee_id = o.sodelavec_id and work_date = (o.polja ->> 'datum_b')::date;
    v_je_dez := (lower(coalesce(v_izmena_a, '')) like 'dežurstvo%') or (lower(coalesce(v_izmena_b, '')) like 'dežurstvo%');

    v_status := 'caka_sodelavca';
  else
    v_status := 'caka_vodjo';
  end if;

  -- Neposrednega vodjo potrebujemo samo, če bo obrazec dejansko šel skozi
  -- njegovo stopnjo — menjava dežurstva jo preskoči (glej
  -- obrazec_potrdi_sodelavec spodaj), zato zanjo vodja ni pogoj za oddajo.
  if not (o.vrsta = 'menjava_sluzbe' and v_je_dez) then
    select vodja_id into v_vodja from public.profiles where id = auth.uid();
    if v_vodja is null then raise exception 'Nimaš določenega neposrednega vodje — admin ga mora najprej nastaviti v Imeniku.'; end if;
  end if;

  update public.obrazci set status = v_status, vodja_id = v_vodja, je_dezurstvo = v_je_dez where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 1::smallint, 'ODDANO');
  return v_status;
end;
$$;
grant execute on function public.obrazec_oddaj(uuid) to authenticated;

-- STOPNJA 2 — sodelavec potrdi (popravljena: menjava dežurstva gre naravnost
-- h koordinatorju, brez vodje).
create or replace function public.obrazec_potrdi_sodelavec(p_id uuid, p_sprejmi boolean, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare o public.obrazci; v_naslednji text;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.sodelavec_id <> auth.uid() then raise exception 'Nisi izbrani sodelavec'; end if;
  if o.status <> 'caka_sodelavca' then raise exception 'Obrazec ni v stanju čakanja na sodelavca'; end if;

  if p_sprejmi then
    v_naslednji := case when o.je_dezurstvo then 'caka_koordinatorja' else 'caka_vodjo' end;
    update public.obrazci set status = v_naslednji where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 2::smallint, 'SODELAVEC_POTRDIL', p_opomba);
    return v_naslednji;
  else
    update public.obrazci set status = 'zavrnjen', razlog_zavrnitve = p_opomba where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 2::smallint, 'SODELAVEC_ZAVRNIL', p_opomba);
    return 'zavrnjen';
  end if;
end;
$$;
grant execute on function public.obrazec_potrdi_sodelavec(uuid, boolean, text) to authenticated;

-- STOPNJA 4 — koordinator (popravljena: menjava dežurstva zahteva
-- is_koordinator=true, navadna menjava ostane role='admin' kot doslej).
create or replace function public.obrazec_potrdi_koordinator(p_id uuid, p_sprejmi boolean, p_opomba text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  o public.obrazci;
  v_dan_a date; v_dan_b date;
  v_izmena_a text; v_izmena_b text;
  v_dept_a text; v_dept_b text;
begin
  select * into o from public.obrazci where id = p_id;
  if not found then raise exception 'Obrazec ne obstaja'; end if;
  if o.status <> 'caka_koordinatorja' then raise exception 'Obrazec ni v stanju čakanja na koordinatorja'; end if;

  if o.je_dezurstvo then
    if not public.current_is_koordinator() then
      raise exception 'Menjavo dežurstva lahko potrdi izključno koordinator.';
    end if;
  else
    if not public.current_role_is('admin') then
      raise exception 'Za končno potrditev nimaš pravic';
    end if;
  end if;

  if not p_sprejmi then
    update public.obrazci set status = 'zavrnjen', razlog_zavrnitve = p_opomba, koordinator_id = auth.uid() where id = p_id;
    perform public.zapisi_v_dnevnik(p_id, 4::smallint, 'KOORDINATOR_ZAVRNIL', p_opomba);
    return 'zavrnjen';
  end if;

  if o.vrsta = 'menjava_sluzbe' then
    v_dan_a := (o.polja ->> 'datum_a')::date;
    v_dan_b := (o.polja ->> 'datum_b')::date;

    select shift_code into v_izmena_a from public.schedule_entries where employee_id = o.vlagatelj_id and work_date = v_dan_a;
    select shift_code into v_izmena_b from public.schedule_entries where employee_id = o.sodelavec_id and work_date = v_dan_b;
    select department_code into v_dept_a from public.profiles where id = o.vlagatelj_id;
    select department_code into v_dept_b from public.profiles where id = o.sodelavec_id;

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    values (o.vlagatelj_id, v_dept_a, v_dan_a, coalesce(v_izmena_b, ''), now())
    on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, updated_at = now();

    insert into public.schedule_entries (employee_id, department_code, work_date, shift_code, updated_at)
    values (o.sodelavec_id, v_dept_b, v_dan_b, coalesce(v_izmena_a, ''), now())
    on conflict (employee_id, work_date) do update set shift_code = excluded.shift_code, updated_at = now();
  end if;

  update public.obrazci set status = 'zakljucen', koordinator_id = auth.uid(), zakljucen_dne = now() where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 4::smallint, 'KOORDINATOR_POTRDIL', p_opomba);
  return 'zakljucen';
end;
$$;
grant execute on function public.obrazec_potrdi_koordinator(uuid, boolean, text) to authenticated;

-- Kaj čaka name (popravljeno: koordinatorska naloga je vidna glede na
-- je_dezurstvo - is_koordinator za dežurstvo, kateri koli admin za navadno).
-- "create or replace view" tu ne deluje: obrazci.je_dezurstvo je bil dodan
-- k tabeli PRED to spremembo, zato "select o.*" zdaj vrne ta nov stolpec na
-- mestu, kjer je bil prej zadnji stolpec "moje_dejanje" - Postgres to bere
-- kot preimenovanje obstoječega stolpca, kar CREATE OR REPLACE VIEW
-- prepoveduje (42P16). Pravi popravek je drop+create (varno: na pogled se
-- ne sklicuje noben drug DB objekt, samo odjemalec prek PostgREST).
drop view if exists public.obrazci_moja_naloga;
create view public.obrazci_moja_naloga
with (security_invoker = true) as
select o.*,
  case
    when o.status = 'caka_sodelavca' and o.sodelavec_id = auth.uid() then 'potrdi_kot_sodelavec'
    when o.status = 'caka_vodjo' and o.vodja_id = auth.uid() then 'odobri_kot_vodja'
    when o.status = 'caka_koordinatorja' and o.je_dezurstvo and public.current_is_koordinator() then 'potrdi_kot_koordinator'
    when o.status = 'caka_koordinatorja' and not o.je_dezurstvo and public.current_role_is('admin') then 'potrdi_kot_koordinator'
  end as moje_dejanje
from public.obrazci o;

-- obrazci_select: razširjeno na "vse menjave v tekočem mesecu" - na izrecno
-- željo naj bo seznam menjav (kdo ↔ kdo, kdaj, status) viden vsem
-- prijavljenim, ne samo udeležencem/vodji/adminu. Namenoma omejeno na
-- vrsta='menjava_sluzbe' in izključi 'osnutek' (neoddan predlog ni "javen").
-- Ostali dve vrsti (ročno evidentiranje/drugo) ostajata vidni samo
-- udeležencem in adminu - širša vidnost ni bila naročena zanju.
drop policy if exists obrazci_select on public.obrazci;
create policy obrazci_select on public.obrazci for select to authenticated using (
  vlagatelj_id = auth.uid()
  or sodelavec_id = auth.uid()
  or vodja_id = auth.uid()
  or public.current_role_is('admin')
  or public.current_is_koordinator()
  or (
    vrsta = 'menjava_sluzbe'
    and status <> 'osnutek'
    and date_trunc('month', (polja ->> 'datum_a')::date) = date_trunc('month', current_date)
  )
);

-- ---------------------------------------------------------------------
-- 23) NZV kot oddelek za razporede (vodje + admin) — na izrecno željo so
--     oddelki za KREIRANJE/GENERIRANJE RAZPOREDA odslej izključno:
--     B, C, C1, D, E1, E2, FLEXI (vsi z vlogo 'user') in NZV (vsi z vlogo
--     'vodja' ali 'admin', vključno z dežurstvi — glej admin.html "NZV"
--     zavihek, ki združi obstoječa Vodje+Dežurstva na eno mesto, logika
--     generiranja ostane nespremenjena). FLEXI je bil dodan že v sekciji
--     17 in ostaja ročno voden bazen brez samodejnega kalupa (namerna,
--     na izrecno željo potrjena odločitev).
--
--     Namenoma NE brišemo/ne diramo starih department kod (DEZ, NEDEZ,
--     PDZN, SOBO, ZO, MO, PO, A, B1B2, DB, SA, URGENCA, U2) iz tabele
--     departments — obstoječi schedule_entries (že objavljeni razporedi
--     vodij/dežurstev, NOT NULL FK na departments) jih zgodovinsko
--     referencira; izbris bi ali padel na FK omejitvi ali (če bi ga na
--     silo izvedli) uničil zgodovino že objavljenih razporedov, česar
--     nimam možnosti preveriti brez neposrednega dostopa do žive baze.
--     Namesto tega jih aplikacija preprosto preneha PONUJATI za novo
--     dodeljevanje (glej RAZPORED_ODDELKI konstante v admin.html/
--     imenik.html/zelje.html) — obstoječi profili s staro kodo ostanejo
--     nedotaknjeni, dokler jih admin ročno ne popravi v Imeniku (na
--     izrecno željo uporabnika — "naknadno bom popravil").
-- ---------------------------------------------------------------------
insert into public.departments (code, name) values
  ('NZV', 'NZV — vodje in administratorji (vključno z dežurstvi)')
on conflict (code) do update set name = excluded.name;

-- employee_wishes: "VODJE" preimenovan v "NZV" (ista skupina, novo ime,
-- usklajeno z zgornjim modelom) — najprej podatki, nato CHECK.
update public.employee_wishes set department_code = 'NZV' where department_code = 'VODJE';

alter table public.employee_wishes drop constraint if exists employee_wishes_department_code_check;
alter table public.employee_wishes add constraint employee_wishes_department_code_check
  check (department_code in ('B', 'C', 'C1', 'D', 'E1', 'E2', 'FLEXI', 'NZV'));

-- ---------------------------------------------------------------------
-- 24) profiles.parafa — kratka 2-4 črkovna parafa (npr. "BOJ", "DŽA"),
--     kot jo uporablja uradna predloga "Letni dopusti in omejitve za NZV"
--     namesto polnega imena v celicah. NAMENOMA na profiles (ne
--     profile_hr_details), ker mora biti vidna VSEM prijavljenim, ne
--     samo lastniku/adminu - profile_hr_details ima ožjo RLS vidljivost
--     (glej opombo pri tej tabeli), profiles pa že ima "vsi vidijo"
--     (profiles_select), isto kot is_koordinator zgoraj. Admin ureja v
--     Imeniku; če prazna, index.html izpelje grobo privzeto parafo iz
--     priimka (glej autoParafa()) - to polje jo lahko ročno popravi.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists parafa text;

-- ---------------------------------------------------------------------
-- 25) Realni podpisi pod razporedom ("Pripravil/-a" + "Pregledal in
--     odobril", po vzoru uradnih predlog) in dva ločena datuma - "Datum
--     objave" (prvič objavljen) in "Zadnja sprememba" (kasneje urejano).
--
--     a) profiles.job_title - naziv delovnega mesta za podpis (npr.
--        "dipl. zn., Strokovni vodja V"), NAMENOMA na profiles (ne
--        profile_hr_details.position_name, ki ima ožjo RLS vidljivost -
--        samo lastnik/admin) - vsi prijavljeni morajo videti podpis pod
--        katerimkoli razporedom, ne samo svojim. Admin ureja v Imeniku.
--     b) schedule_entries.created_by/updated_by - kdo je zapis prvič
--        objavil / nazadnje uredil, samodejno prek sprožilca spodaj (ne
--        prek aplikacijske kode - velja za VSE poti pisanja, tudi
--        obstoječi generator v admin.html, ne samo za nov uvoz).
--     c) schedule_entries_touch() sprožilec TUDI popravi pravi hrošč:
--        "updated_at" ima privzeto "now()", kar velja SAMO ob INSERT (ne
--        ob UPDATE/upsert-conflict) - brez sprožilca bi "Zadnja
--        sprememba" v index.html vedno kazala prvi vnos, nikoli poznejši
--        popravek.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists job_title text;

-- "created_at" (datum PRVE objave) je manjkal, čeprav ga sprožilec spodaj
-- ohranja in ga index.html bere ("Objavljeno"). V produkciji obstaja, v tej
-- datoteki ga ni bilo — shema torej ni znala na novo postaviti delujoče
-- baze: prvi UPDATE bi padel z "record new has no field created_at".
alter table public.schedule_entries add column if not exists created_at timestamptz not null default now();
alter table public.schedule_entries add column if not exists created_by uuid references public.profiles (id);
alter table public.schedule_entries add column if not exists updated_by uuid references public.profiles (id);


create or replace function public.schedule_entries_touch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at; -- datum objave se ob poznejšem urejanju ne spreminja
    -- Avtorja prve objave ohrani (upsert iz aplikacije pošlje prazno polje
    -- in bi ga sicer izbrisal) — RAZEN kadar ga prav zdaj prazni baza sama,
    -- ker je bil avtorjev račun izbrisan ("on delete set null", odsek 30).
    -- Takrat old.created_by kaže na profil, ki ne obstaja več; če ga vrnemo,
    -- v vrstici ostane viseča povezava na neobstoječo osebo.
    if not (new.created_by is null and old.created_by is not null
            and not exists (select 1 from public.profiles p where p.id = old.created_by)) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists schedule_entries_touch on public.schedule_entries;
create trigger schedule_entries_touch
  before insert or update on public.schedule_entries
  for each row execute function public.schedule_entries_touch();

-- ---------------------------------------------------------------------
-- 26) schedule_entries_log — revizijska sled (audit log): kdo, kdaj in
--     kaj je spremenil v razporedu. Ločena append-only tabela (ne
--     "zgodovina v isti vrstici" kot created_by/updated_by zgoraj, ki
--     hrani samo TRENUTNO stanje) - vsak dejanski vpis/sprememba/izbris
--     shift_code ali department_code doda svojo vrstico, prejšnji vpisi
--     se nikoli ne prepišejo. Piše izključno sprožilec (security definer),
--     nobenih insert/update/delete politik za navadne uporabnike - vidi
--     (in torej lahko piše prek trigger-ja) samo admin prek obstoječe
--     schedule_write_admin politike na schedule_entries sami.
-- ---------------------------------------------------------------------
create table if not exists public.schedule_entries_log (
  id bigint generated always as identity primary key,
  entry_id bigint,
  employee_id uuid,
  department_code text,
  work_date date,
  old_shift_code text,
  new_shift_code text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index if not exists schedule_entries_log_date_idx on public.schedule_entries_log (work_date);
create index if not exists schedule_entries_log_emp_idx on public.schedule_entries_log (employee_id, work_date);

alter table public.schedule_entries_log enable row level security;
drop policy if exists schedule_entries_log_select_admin on public.schedule_entries_log;
create policy schedule_entries_log_select_admin on public.schedule_entries_log
  for select to authenticated using (public.current_role_is('admin'));

create or replace function public.schedule_entries_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'DELETE' then
    insert into public.schedule_entries_log (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
    values (old.id, old.employee_id, old.department_code, old.work_date, old.shift_code, null, 'delete', auth.uid());
    return old;
  elsif TG_OP = 'UPDATE' then
    -- samo, če se je dejansko kaj vidnega spremenilo (ne vsak "ping" upsert
    -- z istimi vrednostmi - schedule_entries_touch zgoraj tako ali tako
    -- vedno posodobi updated_at/updated_by, kar bi sicer napolnilo dnevnik
    -- z nič-spremembami).
    if old.shift_code is distinct from new.shift_code or old.department_code is distinct from new.department_code then
      insert into public.schedule_entries_log (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
      values (new.id, new.employee_id, new.department_code, new.work_date, old.shift_code, new.shift_code, 'update', auth.uid());
    end if;
    return new;
  else
    insert into public.schedule_entries_log (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
    values (new.id, new.employee_id, new.department_code, new.work_date, null, new.shift_code, 'insert', auth.uid());
    return new;
  end if;
end;
$$;

drop trigger if exists schedule_entries_audit on public.schedule_entries;
create trigger schedule_entries_audit
  after insert or update or delete on public.schedule_entries
  for each row execute function public.schedule_entries_audit();

-- ---------------------------------------------------------------------
-- 27) Potisna obvestila (Web Push) — nadgradnja obstoječega
--     "obveščanja samo znotraj aplikacije" (sekcija 5) v pravo potisno
--     obvestilo na telefon, brez SMS-stroškov in brez trgovin z
--     aplikacijami (PWA + Web Push, deluje na Androidu in iOS 16.4+, na
--     iPhonu SAMO, če je aplikacija nameščena na domači zaslon).
--
--     Zasnova namenoma NE pošilja push-a neposredno iz sprožilca:
--     notifications tabela je EDINI vir resnice ("kaj je treba povedati"),
--     Edge Function posiljaj-push pa jo občasno prebere in odpošlje
--     (push_sent_at označi poslano). Prednost: obvestilo v aplikaciji in
--     push nikoli ne razideta, izpad pošiljanja pa ne izgubi sporočila —
--     ob naslednjem zagonu se enostavno pošlje.
--
--     "kljuc" je neobvezen idempotenčni ključ: opomniki (pg_cron spodaj)
--     se lahko poganjajo večkrat na dan, pa bo vsak opomnik vstavljen
--     natanko enkrat. Ker je unikatni indeks DELEN (samo kjer kljuc ni
--     null), mora "on conflict" ponoviti isti pogoj - brez tega ga
--     Postgres ne prepozna in stavek pade z napako.
-- ---------------------------------------------------------------------
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists url text;
alter table public.notifications add column if not exists push_sent_at timestamptz;
alter table public.notifications add column if not exists kljuc text;

create unique index if not exists notifications_kljuc_idx on public.notifications (kljuc) where kljuc is not null;
create index if not exists notifications_push_pending_idx on public.notifications (created_at) where push_sent_at is null;

-- Naročnine brskalnikov (en zapis = ena naprava/brskalnik ene osebe).
-- Uporabnik jih ureja sam (vklop/izklop v Nastavitvah); Edge Function
-- bere prek service_role ključa in zato zaobide RLS.
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 27a) Obvestila ob spremembi statusa MENJAVE (obrazci)
--
--      Obstoječi notify_swap_status_change (sekcija 5) visi na ukinjeni
--      swap_requests tabeli in se torej nikoli več ne sproži — obrazci
--      sistem doslej NI pisal obvestil. To je popravek te vrzeli, ne
--      samo dodatek za push.
-- ---------------------------------------------------------------------
create or replace function public.obvesti_ob_spremembi_obrazca()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vlagatelj text;
  naslov text;
  sporocilo text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select full_name into vlagatelj from public.profiles where id = new.vlagatelj_id;

  if new.status = 'caka_sodelavca' then
    naslov := 'Predlog menjave čaka tvojo potrditev';
    sporocilo := coalesce(vlagatelj, 'Sodelavec') || ' ti je poslal predlog menjave. Odpri stran Menjava.';
    if new.sodelavec_id is not null then
      insert into public.notifications (user_id, message, title, url)
      values (new.sodelavec_id, sporocilo, naslov, 'obrazec.html');
    end if;

  elsif new.status = 'caka_vodjo' then
    naslov := 'Menjava čaka tvojo odobritev';
    sporocilo := 'Predlog menjave (' || coalesce(vlagatelj, 'zaposleni') || ') čaka odobritev neposrednega vodje.';
    if new.vodja_id is not null then
      insert into public.notifications (user_id, message, title, url)
      values (new.vodja_id, sporocilo, naslov, 'obrazec.html');
    end if;

  elsif new.status = 'caka_koordinatorja' then
    naslov := 'Menjava čaka koordinatorja';
    sporocilo := 'Predlog menjave (' || coalesce(vlagatelj, 'zaposleni') || ') čaka končno potrditev koordinatorja.';
    insert into public.notifications (user_id, message, title, url)
    select p.id, sporocilo, naslov, 'obrazec.html'
    from public.profiles p where p.is_koordinator;

  elsif new.status in ('zakljucen', 'zavrnjen', 'preklican') then
    naslov := case new.status
      when 'zakljucen' then 'Menjava je odobrena'
      when 'zavrnjen' then 'Menjava je zavrnjena'
      else 'Menjava je preklicana'
    end;
    sporocilo := case new.status
      when 'zakljucen' then 'Predlog menjave je bil dokončno odobren — razpored je posodobljen.'
      when 'zavrnjen' then 'Predlog menjave je bil zavrnjen.' || coalesce(' Razlog: ' || new.razlog_zavrnitve, '')
      else 'Predlog menjave je bil preklican.'
    end;
    insert into public.notifications (user_id, message, title, url)
    select x.uid, sporocilo, naslov, 'obrazec.html'
    from (select new.vlagatelj_id as uid union select new.sodelavec_id) x
    where x.uid is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists on_obrazec_status_change on public.obrazci;
create trigger on_obrazec_status_change
  after update of status on public.obrazci
  for each row execute function public.obvesti_ob_spremembi_obrazca();

-- ---------------------------------------------------------------------
-- 27b) Obvestilo ob OBJAVI mesečnega razporeda — kliče ga admin.html po
--      uspešni objavi (ne sprožilec na schedule_entries: objava je na
--      tisoče vrstic naenkrat, kar bi pomenilo tisoče obvestil namesto
--      enega na osebo).
-- ---------------------------------------------------------------------
create or replace function public.obvesti_o_objavi_razporeda(p_start date, p_end date, p_oddelek text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  st integer;
begin
  if not public.current_role_is('admin') then
    raise exception 'Samo administrator lahko pošlje obvestilo o objavi razporeda.';
  end if;

  insert into public.notifications (user_id, message, title, url, kljuc)
  select distinct se.employee_id,
         'Objavljen je razpored za obdobje ' || to_char(p_start, 'DD.MM.YYYY') || ' – ' || to_char(p_end, 'DD.MM.YYYY') || '.',
         'Nov razpored je objavljen',
         'index.html',
         'razpored:' || se.employee_id || ':' || p_start || ':' || p_end
  from public.schedule_entries se
  where se.work_date between p_start and p_end
    and (p_oddelek is null or se.department_code = p_oddelek)
  on conflict (kljuc) where kljuc is not null do nothing;

  get diagnostics st = row_count;
  return st;
end;
$$;
grant execute on function public.obvesti_o_objavi_razporeda(date, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 27c) Opomnik 24 ur pred nočno izmeno ali dežurstvom. Poganja ga
--      pg_cron (glej PUSH-SETUP.md) — idempotentno prek "kljuc", zato
--      večkratni zagon istega dne ne podvoji opomnika.
-- ---------------------------------------------------------------------
create or replace function public.ustvari_opomnike_za_jutri()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jutri date := (current_date + 1);
  st integer;
begin
  insert into public.notifications (user_id, message, title, url, kljuc)
  select se.employee_id,
         case when lower(se.shift_code) like 'dežurstvo%' or lower(se.shift_code) like 'dezurstvo%'
              then 'Jutri (' || to_char(jutri, 'DD.MM.YYYY') || ') imaš dežurstvo.'
              else 'Jutri (' || to_char(jutri, 'DD.MM.YYYY') || ') imaš nočno izmeno: ' || se.shift_code || '.'
         end,
         'Opomnik za jutrišnjo izmeno',
         'index.html',
         'opomnik:' || se.employee_id || ':' || jutri
  from public.schedule_entries se
  where se.work_date = jutri
    and (lower(se.shift_code) like 'nočna%' or lower(se.shift_code) like 'dežurstvo%' or lower(se.shift_code) like 'dezurstvo%')
  on conflict (kljuc) where kljuc is not null do nothing;

  get diagnostics st = row_count;
  return st;
end;
$$;

-- ---------------------------------------------------------------------
-- 28) profiles_log — revizijska sled SPREMEMB PRAVIC (RBAC audit).
--
--     Sekcija 26 zgoraj revidira razpored (kdo je komu spremenil izmeno).
--     Kdo je komu podelil ali odvzel PRAVICE, pa doslej ni bilo nikjer
--     zabeleženo — administrator lahko v Generator → Uporabniki komurkoli
--     nastavi vlogo "admin", in po tem dejanju ni ostalo nobene sledi.
--     Za "pravno skladnost in varnost podatkov" je to večja vrzel od
--     revizije razporeda: brez nje ni mogoče odgovoriti na vprašanje
--     "kdo je tej osebi omogočil dostop do kadrovskih podatkov in kdaj".
--
--     Beležijo se samo štiri polja, ki dejansko določajo pravice:
--       role            — admin / vodja / user
--       department_code — kateri oddelek vodja vidi in ureja
--       vodja_id        — komu je oseba podrejena (veriga odobritev)
--       is_koordinator  — enostopenjska odobritev menjav
--     Ostala polja (ime, e-pošta, parafa, naziv) niso varnostno
--     relevantna in bi dnevnik samo napolnila.
--
--     Enak vzorec kot schedule_entries_log: append-only, piše izključno
--     sprožilec (security definer), bere samo admin.
-- ---------------------------------------------------------------------
create table if not exists public.profiles_log (
  id bigint generated always as identity primary key,
  profile_id uuid,
  profile_name text,
  polje text not null check (polje in ('role', 'department_code', 'vodja_id', 'is_koordinator')),
  stara_vrednost text,
  nova_vrednost text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid references public.profiles (id),
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index if not exists profiles_log_profile_idx on public.profiles_log (profile_id, changed_at desc);
create index if not exists profiles_log_cas_idx on public.profiles_log (changed_at desc);

alter table public.profiles_log enable row level security;
drop policy if exists profiles_log_select_admin on public.profiles_log;
create policy profiles_log_select_admin on public.profiles_log
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
  select p.full_name into akter_ime from public.profiles p where p.id = akter;

  if TG_OP = 'DELETE' then
    insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (old.id, old.full_name, 'role', old.role, null, 'delete', akter, akter_ime);
    return old;
  end if;

  if TG_OP = 'INSERT' then
    -- Ob registraciji je vloga vedno privzeta ('user'); vpiše se samo, če
    -- je račun nastal že z višjo vlogo (npr. prek uvoza).
    if new.role is distinct from 'user' then
      insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
      values (new.id, new.full_name, 'role', null, new.role, 'insert', akter, akter_ime);
    end if;
    return new;
  end if;

  -- UPDATE: po eno vrstico na vsako dejansko spremenjeno polje, da je
  -- dnevnik berljiv brez razbiranja, kaj se je v vrstici spremenilo.
  if old.role is distinct from new.role then
    insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'role', old.role, new.role, 'update', akter, akter_ime);
  end if;
  if old.department_code is distinct from new.department_code then
    insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'department_code', old.department_code, new.department_code, 'update', akter, akter_ime);
  end if;
  if old.vodja_id is distinct from new.vodja_id then
    -- Zapiše se IME vodje, ne uuid — dnevnik mora biti berljiv brez
    -- poizvedovanja. Kadar imena ni več mogoče razrešiti (vodja je bil
    -- pravkar izbrisan in je ta sprememba kaskada "on delete set null"),
    -- pade nazaj na uuid: brez tega bi vrstica izgledala kot prazno →
    -- prazno, torej kot sprememba, ki se ni zgodila.
    insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'vodja_id',
            coalesce((select p.full_name from public.profiles p where p.id = old.vodja_id), old.vodja_id::text),
            coalesce((select p.full_name from public.profiles p where p.id = new.vodja_id), new.vodja_id::text),
            'update', akter, akter_ime);
  end if;
  if old.is_koordinator is distinct from new.is_koordinator then
    insert into public.profiles_log (profile_id, profile_name, polje, stara_vrednost, nova_vrednost, action, changed_by, changed_by_name)
    values (new.id, new.full_name, 'is_koordinator', old.is_koordinator::text, new.is_koordinator::text, 'update', akter, akter_ime);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.profiles_audit();

-- ---------------------------------------------------------------------
-- 29) Živa koledarska naročnina (iCal subscription).
--
--     Doslej je bil izvoz .ics ENKRATEN prenos: kar si prenesel, je v
--     telefonu obtičalo takšno, kot je bilo — sprememba razporeda se v
--     koledarju ni poznala. Tu se doda naslov, na katerega se koledar
--     naroči in ga sam občasno osveži.
--
--     ZAKAJ LOČENA TABELA IN NE STOLPEC V profiles:
--     politika profiles_select je "for select to authenticated using
--     (true)" — vsak prijavljen vidi VSE vrstice tabele profiles. Če bi
--     žeton živel tam, bi vsak zaposleni videl žetone vseh sodelavcev in
--     se lahko naročil na njihov razpored. Zato svoja tabela, kjer
--     politika omeji branje na lastnika vrstice.
--
--     Žeton je nosilni podatek (kdor ga ima, vidi razpored te osebe brez
--     prijave — koledarski odjemalci se ne znajo prijaviti), zato:
--       * 32 naključnih bajtov iz pgcrypto (ne uuid, ki je deloma
--         predvidljiv in se ponekod izpisuje v naslovih),
--       * bere ga IZKLJUČNO lastnik; niti admin ne, ker ga ne potrebuje —
--         admin razpored že vidi v aplikaciji,
--       * zamenljiv z eno potezo (koledar_token_ponastavi), s čimer
--         prejšnja povezava takoj neha delovati.
-- ---------------------------------------------------------------------
create table if not exists public.calendar_tokens (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
-- Stikalo za vklop/izklop sinhronizacije. Ločeno od brisanja žetona:
-- izklop naj povezavo USTAVI, ne pa pozabi — kdor jo pozneje spet vklopi,
-- naj mu ni treba znova urejati koledarja na telefonu. Ob izklopu vir
-- vrne 404, enako kot pri neveljavnem žetonu.
alter table public.calendar_tokens add column if not exists enabled boolean not null default true;

alter table public.calendar_tokens enable row level security;
-- Samo lastnik. Brez insert/update/delete politik — vse gre prek
-- security definer funkcij spodaj.
drop policy if exists calendar_tokens_own on public.calendar_tokens;
create policy calendar_tokens_own on public.calendar_tokens
  for select to authenticated using (profile_id = auth.uid());

-- OPOMBA o generiranju žetona: uporabljamo dva gen_random_uuid() brez
-- pomišljajev (2 x 32 = 64 šestnajstiških znakov), NE encode(gen_random_bytes...).
-- gen_random_bytes prihaja iz razširitve pgcrypto, ta pa v Supabase ni v shemi
-- "public" ampak v "extensions" — ob "set search_path = public, pg_temp" je
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
  select token into v_token from public.calendar_tokens where profile_id = auth.uid();
  if v_token is not null then
    return v_token;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.calendar_tokens (profile_id, token) values (auth.uid(), v_token)
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
  insert into public.calendar_tokens (profile_id, token, enabled)
  values (auth.uid(), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_vklop)
  on conflict (profile_id) do update set enabled = excluded.enabled
  returning enabled into v_stanje;
  return v_stanje;
end;
$$;

-- Zamenja žeton — prejšnja povezava takoj preneha delovati (za primer,
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
  insert into public.calendar_tokens (profile_id, token, created_at, last_used_at)
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
  -- popolnoma enako kot neveljaven žeton — brez namiga, ali oseba obstaja.
  select ct.profile_id into v_profile
  from public.calendar_tokens ct
  where ct.token = p_token and ct.enabled;
  if v_profile is null then
    return; -- neveljaven žeton ali izklopljena sinhronizacija
  end if;
  update public.calendar_tokens set last_used_at = now() where profile_id = v_profile;
  return query
    select p.full_name, se.work_date, se.shift_code
    from public.schedule_entries se
    join public.profiles p on p.id = se.employee_id
    where se.employee_id = v_profile
      and se.work_date between p_od and p_do
      and coalesce(se.shift_code, '') <> ''
    order by se.work_date;
end;
$$;

revoke all on function public.koledar_razpored(text, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 30) notification_settings — kanali obveščanja po osebi.
--
--     Doslej je bilo obveščanje vse-ali-nič in vezano na NAPRAVO: potisna
--     obvestila si vklopil na telefonu (push_subscriptions), drugih poti
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
create table if not exists public.notification_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  -- Vrste dogodkov; obe privzeto vklopljeni.
  opomnik_izmene boolean not null default true,
  sprememba_razporeda boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists notif_settings_select on public.notification_settings;
create policy notif_settings_select on public.notification_settings
  for select to authenticated
  using (profile_id = auth.uid() or public.current_role_is('admin'));

drop policy if exists notif_settings_upsert on public.notification_settings;
create policy notif_settings_upsert on public.notification_settings
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists notif_settings_update on public.notification_settings;
create policy notif_settings_update on public.notification_settings
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Sled o dostavi po e-pošti; push_sent_at (sekcija 27) že obstaja.
alter table public.notifications add column if not exists email_sent_at timestamptz;
create index if not exists notifications_email_pending_idx
  on public.notifications (created_at) where email_sent_at is null;

-- Robna funkcija potrebuje e-pošto in nastavitve prejemnikov v enem
-- klicu. profiles.email je berljiv vsem prijavljenim, a funkcija teče s
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
  from public.profiles p
  left join public.notification_settings ns on ns.profile_id = p.id
  where p.id = any(p_ids);
$$;

revoke all on function public.prejemniki_obvestil(uuid[]) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 30) Sled avtorstva preživi izbris osebe
-- ---------------------------------------------------------------------
-- Kdo je vnesel/odobril, ni lastništvo, ampak sled. Ko oseba zapusti
-- bolnišnico in se njen račun izbriše, mora zapis ostati — samo brez
-- avtorja. Brez "on delete set null" te povezave izbris ustavijo, sprožilec
-- schedule_entries_touch pa poleg tega ob UPDATE avtorja vrne na staro
-- vrednost, tako da polja ni mogoče niti ročno izprazniti.
do $$
declare v record;
begin
  for v in
    select conname, conrelid::regclass as tabela, a.attname as stolpec
    from pg_constraint c
    join unnest(c.conkey) k on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype = 'a'   -- 'a' = no action (privzeto, blokira izbris)
      and (c.conrelid, a.attname) in (
        ('public.schedule_entries'::regclass, 'created_by'),
        ('public.schedule_entries'::regclass, 'updated_by'),
        ('public.schedule_entries_log'::regclass, 'changed_by'),
        ('public.profiles_log'::regclass, 'changed_by'),
        ('public.swap_requests'::regclass, 'lead_id'),
        ('public.swap_requests'::regclass, 'admin_id')
      )
  loop
    execute format('alter table %s drop constraint %I', v.tabela, v.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete set null',
                   v.tabela, v.conname, v.stolpec);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 31) profiles.parafa_pred_oktobrom_2026 — parafa je bila za del kadra
--     PRENOVLJENA z veljavnostjo od 1.10.2026 (uradna sprememba, ne napaka
--     v aplikaciji) - profiles.parafa (sekcija 24) odslej hrani NOVO
--     parafo, ta stolpec pa STARO, ki je veljala do 30.9.2026. Potreben je
--     samo za osebe, ki jim je parafa RESNIČNO spremenjena - za vse ostale
--     ostane prazen in profiles.parafa velja ne glede na datum (glej
--     parafaOd(profil, datum) v index.html, ki izbira med njima glede na
--     work_date razporeda/dopusta - meseci v tej aplikaciji nikoli ne
--     segajo čez 1. v mesecu, zato en klic vedno pade bodisi v celoti
--     pred bodisi v celoti po prestopu). Seed konkretnih vrednosti: glej
--     supabase/posodobi-parafe-oktober-2026.sql.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists parafa_pred_oktobrom_2026 text;

-- ---------------------------------------------------------------------
-- 32) duty_doctors — kateri ZDRAVNIK je dežuren na posamezen dan (dva
--     ločena kroga: "Urgenca ZDR" in "Dežurstvo ZDR" - iz uradnega
--     dokumenta "Razporeditev zaposlenih v UA in DEŽ"). Zdravniki NISO
--     zaposleni v tej aplikaciji (nimajo profila/računa) - to je namerno
--     samo za PRIKAZ imena poleg dežurstva v "Moj razpored", ne pravi
--     profil/uporabnik. Ločeno od schedule_entries (ta tabela je za
--     negovalno osebje, ki JE zaposleno v aplikaciji).
-- ---------------------------------------------------------------------
create table if not exists public.duty_doctors (
  work_date date not null,
  kind text not null check (kind in ('urgenca', 'dezurstvo')),
  full_name text not null,
  updated_at timestamptz not null default now(),
  primary key (work_date, kind)
);
alter table public.duty_doctors enable row level security;
drop policy if exists duty_doctors_select on public.duty_doctors;
create policy duty_doctors_select on public.duty_doctors for select to authenticated using (true);
drop policy if exists duty_doctors_write on public.duty_doctors;
create policy duty_doctors_write on public.duty_doctors for all to authenticated
  using (public.current_role_is('admin')) with check (public.current_role_is('admin'));

-- ---------------------------------------------------------------------
-- 33) menjave_javno — kdaj je bila izmena zamenjana s POTRJENO menjavo,
--     vidno vsem zaposlenim in za VSE mesece.
--
--     Zakaj pogled in ne širša politika na obrazci: obrazci_select
--     (sekcija 28) navadnemu uporabniku pokaže tuje menjave samo za
--     tekoči mesec, zato je oznaka "zamenjano" v razpredelnici za
--     pretekle in prihodnje mesece manjkala. Politiko bi lahko razširili,
--     a bi s tem vsem razkrili tudi polje "polja" (opomba/razlog
--     menjave) in razlog zavrnitve - to so občutljivi podatki, ki jih za
--     oznako sploh ne potrebujemo.
--
--     Pogled zato izpostavi SAMO štiri stvari, ki so nujne: kdo, s kom,
--     in katera dva dneva. Sama izmena tistega dne je itak že javna -
--     razpored vidijo vsi (schedule_entries_select) - in menjava je vanj
--     že vpisana (obrazec_potrdi_koordinator), zato oznaka ne razkriva
--     ničesar, česar zaposleni ne bi mogel prebrati iz razporeda.
--
--     Pogled NAMENOMA nima security_invoker: teče s pravicami lastnika,
--     zato zaobide RLS na obrazci in pokaže vse mesece - to je celoten
--     namen. Ker izbira samo status='zakljucen', osnutki in zavrnjene
--     menjave ostanejo skriti.
-- ---------------------------------------------------------------------
drop view if exists public.menjave_javno;
create view public.menjave_javno as
  select
    o.vlagatelj_id,
    o.sodelavec_id,
    (o.polja ->> 'datum_a')::date as datum_a,
    (o.polja ->> 'datum_b')::date as datum_b
  from public.obrazci o
  where o.vrsta = 'menjava_sluzbe'
    and o.status = 'zakljucen'
    and o.polja ? 'datum_a'
    and o.polja ? 'datum_b';

revoke all on public.menjave_javno from anon;
grant select on public.menjave_javno to authenticated;
