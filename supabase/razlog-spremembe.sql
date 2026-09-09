-- Razpored PBB – RAZLOG SPREMEMBE V OBJAVLJENEM RAZPOREDU
--
-- ZAKAJ
-- Revizijska sled (dnevnik_razporeda) doslej pove, KAJ se je spremenilo:
-- "Novak Bine, 14. 11.: DOP -> prosto". Ne pove pa, ZAKAJ in KDO je prosil.
-- Čez tri mesece se iz nje ne da ugotoviti, ali je šlo za bolniško, za
-- dogovorjeno menjavo med zaposlenima ali za tipkarsko napako - in prav to
-- je vprašanje, ki se ob pritožbi zastavi.
--
-- KAKO
-- Razlog potuje z vrstico razporeda (public.razpored.razlog), sprožilec za
-- revizijo pa ga prepiše v dnevnik. Ta pot je izbrana zato, ker aplikacija
-- v bazo piše prek PostgREST (upsert) in nima svoje seje, v katero bi se
-- dalo razlog odložiti s set_config.
--
-- Skripta je varno ponovljiva: stolpca se dodata samo, če ju še ni.

-- 1) Stolpca ------------------------------------------------------------
alter table public.razpored
  add column if not exists razlog text;

comment on column public.razpored.razlog is
  'Zakaj je bila celica nazadnje spremenjena (npr. "bolniška", "menjava z Kovač Ano"). Sprožilec ga prepiše v dnevnik_razporeda.';

alter table public.dnevnik_razporeda
  add column if not exists razlog text;

comment on column public.dnevnik_razporeda.razlog is
  'Razlog spremembe, prepisan iz public.razpored.razlog ob zapisu v dnevnik.';

-- 2) Sprožilec za revizijo prepiše razlog --------------------------------
-- Vsebina je enaka kot v schema.sql, dodan je samo "razlog". Ob DELETE se
-- vzame stari razlog (novega ni), sicer novi.
create or replace function public.schedule_entries_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if TG_OP = 'DELETE' then
    insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by, razlog)
    values (old.id, old.employee_id, old.department_code, old.work_date, old.shift_code, null, 'delete', auth.uid(), old.razlog);
    return old;
  elsif TG_OP = 'UPDATE' then
    -- samo, če se je dejansko kaj vidnega spremenilo (ne vsak "ping" upsert
    -- z istimi vrednostmi - schedule_entries_touch tako ali tako vedno
    -- posodobi updated_at/updated_by, kar bi sicer napolnilo dnevnik z
    -- nič-spremembami).
    if old.shift_code is distinct from new.shift_code or old.department_code is distinct from new.department_code then
      insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by, razlog)
      values (new.id, new.employee_id, new.department_code, new.work_date, old.shift_code, new.shift_code, 'update', auth.uid(), new.razlog);
    end if;
    return new;
  else
    insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by, razlog)
    values (new.id, new.employee_id, new.department_code, new.work_date, null, new.shift_code, 'insert', auth.uid(), new.razlog);
    return new;
  end if;
end;
$$;

-- 3) Preverjanje ---------------------------------------------------------
-- select work_date, old_shift_code, new_shift_code, razlog, changed_at
--   from public.dnevnik_razporeda
--  where razlog is not null
--  order by changed_at desc limit 20;
