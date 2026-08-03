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
  ('NEDEZ', 'Nedežurni kader (DMS/DZN)')
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

-- Ob registraciji (auth.users insert) samodejno ustvari profil z vlogo 'user'.
-- Ime se vzame iz signUp({ options: { data: { full_name } } }); brez njega
-- pade nazaj na e-poštni naslov, admin ga lahko kasneje popravi.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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
