-- =====================================================================
-- POPRAVEK: "function gen_random_bytes(integer) does not exist"
--
-- Vzrok: gen_random_bytes prihaja iz razsiritve pgcrypto, ki je v Supabase
-- namescena v shemi "extensions", ne v "public". Funkcije imajo
-- "set search_path = public, pg_temp", zato je bila nedosegljiva.
--
-- Popravek: zeton se zdaj sestavi iz dveh gen_random_uuid() (od PostgreSQL 13
-- del jedra, brez razsiritev). Oblika ostaja enaka: 64 sestnajstiskih znakov.
--
-- KAKO POGNATI: Supabase -> SQL Editor -> New query -> prilepi vse -> Run.
-- Varno je pognati veckrat. Nicesar ne brise; ze izdani zetoni ostanejo
-- veljavni (spremeni se samo nacin generiranja novih).
-- =====================================================================

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
