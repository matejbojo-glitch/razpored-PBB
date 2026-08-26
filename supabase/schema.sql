-- =====================================================================
-- Razpored PBB - supabase/schema.sql
-- =====================================================================
-- ENA SAMA datoteka s celotno shemo. Varno jo je pognati VEČKRAT: vsak
-- ukaz je idempotenten (if not exists / or replace / stražen DO blok).
--
-- Vrstni red razdelkov je STROG in ni naključen - vsak se opira na
-- prejšnjega:
--   1 Razširitve  ->  2 Enumi   ->  3 Tabele  ->  4 Tuji ključi
--   5 Indeksi     ->  6 Funkcije in sprožilci ->  7 Pogledi
--   8 RLS         ->  9 Seed
--
-- Tuji ključi so NAMENOMA ločeni od CREATE TABLE (razdelek 4): tabele se
-- med seboj sklicujejo v obe smeri (profili <-> oddelki), zato jih z
-- vgrajenimi references ne bi bilo mogoče ustvariti brez krožne odvisnosti.
--
-- Funkcije so NAMENOMA pred pogledi (6 pred 7), čeprav se navadno navaja
-- obratno: pogled uvozi_kontaktov_javno v svoji definiciji kliče
-- current_role_is() in imena_se_ujemata(). Če funkcije še ne obstajajo,
-- se pogled sploh ne ustvari ("function ... does not exist").
--
-- ČESA TU NI: enkratne podatkovne skripte (2-IZBRISI-IN-POPRAVI.sql,
-- odstrani-zaposlene.sql, pocisti-*.sql ...) ostajajo LOČENE datoteke in
-- niso zlite sem. Brišejo zaposlene in njihove razporede ("izbris je
-- dokončen in podatkov ni mogoče povrniti"); ker se ta datoteka poganja
-- večkrat, bi vsak zagon sheme znova pobrisal podatke.
--
-- Datoteka je SESTAVLJENA iz prave baze (pg_dump), zato so vsi nekdaj
-- razpršeni ALTER-ji že zloženi v CREATE TABLE.
-- =====================================================================


-- =====================================================================
-- 1. RAZŠIRITVE (Extensions)
-- ---------------------------------------------------------------------
-- gen_random_uuid() za privzete vrednosti primarnih ključev.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Funkcije se med seboj kličejo (npr. dovoljeni_uporabniki -> imena_se_ujemata).
-- PostgreSQL telo funkcije v jeziku SQL preveri že ob CREATE, zato bi klic
-- funkcije, ki je zapisana nižje v datoteki, spodletel z "function ... does
-- not exist". Preverjanje teles zato izklopimo za to sejo - natanko tako
-- ravna tudi pg_dump. Na pravilnost delovanja to ne vpliva: telesa se
-- preverijo ob prvem klicu.
set check_function_bodies = false;


-- =====================================================================
-- 2. TIPI / ENUMI (Custom Types)
-- ---------------------------------------------------------------------
-- Shema namenoma NE uporablja enumov. Šifre izmen (DF12, N12, DOP ...),
-- vloge in statusi so navadno besedilo s CHECK omejitvijo - nabor kod se
-- spreminja (nazadnje avgusta 2026), ALTER TYPE ... ADD VALUE pa v
-- PostgreSQL ni preklicljiv in ga ni mogoče pognati v transakciji.
-- Uradni šifrant kratic je v CLAUDE.md in v delovni-cas.js.
-- =====================================================================


-- =====================================================================
-- 2b. POMOŽNI FUNKCIJI ZA VAROVALKE OMEJITEV
-- ---------------------------------------------------------------------
-- Varovalke pred tem preverjale IME omejitve. To je bilo napačno za bazo,
-- ki je nastala pred preimenovanjem tabel v slovenska imena: ALTER TABLE
-- ... RENAME TO preimenuje tabelo, imena omejitev pa pusti pri miru. Zato
-- je npr. telefoni_kontaktov obdržala contact_phones_profile_id_fkey,
-- varovalka za telefoni_kontaktov_profile_id_fkey pa tega ni videla in je
-- dodala DRUGI, vsebinsko enak tuji ključ.
--
-- Posledica je bila napaka v aplikaciji: PostgREST ob dveh enakih tujih
-- ključih ne ve, katerega naj uporabi -
--   "Could not embed because more than one relationship was found
--    for 'profili' and 'telefoni_kontaktov'"
-- - in Imenik se ni naložil. Enako je bilo podvojenih 35 tujih ključev v
-- 22 tabelah, torej bi enaka napaka prej ali slej zadela še Razpored,
-- Menjave in Kadrovske podatke.
--
-- Zato varovalke poslej ne gledajo imena, ampak OBLIKO omejitve: tabela,
-- stolpci in (pri tujem ključu) ciljna tabela. Ime tako ni več pomembno.
-- Že nastale podvojitve pospravi razdelek 4b na koncu tujih ključev.
-- =====================================================================

create or replace function public.tuji_kljuc_ze_obstaja(
  p_tabela regclass, p_stolpci text[], p_tarca regclass
) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_constraint c
     where c.conrelid = p_tabela
       and c.contype = 'f'
       and c.confrelid = p_tarca
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
           = (select array_agg(x order by x) from unnest(p_stolpci) x)
  );
$$;

create or replace function public.enolicna_omejitev_ze_obstaja(
  p_tabela regclass, p_stolpci text[]
) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_constraint c
     where c.conrelid = p_tabela
       and c.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
           = (select array_agg(x order by x) from unnest(p_stolpci) x)
  );
$$;


-- =====================================================================
-- 3. TABELE (+ dopolnitev stolpcev za obstoječe baze)
-- ---------------------------------------------------------------------
-- CREATE TABLE nosi KONČNE stolpce (za nove baze).
-- Za obstoječo bazo to ni dovolj: 'create table if not exists' je na
-- obstoječi tabeli prazen ukaz in novega stolpca NE doda. Zato za vsakim
-- blokom tabel sledi še seznam 'add column if not exists' - na novi bazi
-- so to prazni ukazi, na stari pa dodajo natanko tisto, kar manjka.
-- =====================================================================

create table if not exists public.barvne_oznake (
    barva text NOT NULL,
    kind text,
    prezri boolean DEFAULT false NOT NULL,
    posodobil uuid,
    posodobljeno timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT barvne_oznake_check CHECK (((prezri AND (kind IS NULL)) OR ((NOT prezri) AND (kind IS NOT NULL)))),
    CONSTRAINT barvne_oznake_kind_check CHECK ((kind = ANY (ARRAY['omejitev'::text, 'ld'::text, 'bs'::text, 'sti'::text])))
);

create table if not exists public.dezurni_zdravniki (
    work_date date NOT NULL,
    kind text NOT NULL,
    full_name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dezurni_zdravniki_kind_check CHECK ((kind = ANY (ARRAY['urgenca'::text, 'dezurstvo'::text, 'sestra'::text])))
);

create table if not exists public.dnevnik_odsotnosti (
    id bigint NOT NULL,
    full_name text NOT NULL,
    work_date date NOT NULL,
    from_kind text,
    to_kind text,
    editor_id uuid,
    editor_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.dnevnik_ogledov (
    id bigint NOT NULL,
    admin_id uuid NOT NULL,
    admin_email text,
    target_profile_id uuid NOT NULL,
    target_full_name text,
    target_email text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
);

create table if not exists public.dnevnik_profilov (
    id bigint NOT NULL,
    profile_id uuid,
    profile_name text,
    polje text NOT NULL,
    stara_vrednost text,
    nova_vrednost text,
    action text NOT NULL,
    changed_by uuid,
    changed_by_name text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dnevnik_profilov_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text]))),
    CONSTRAINT dnevnik_profilov_polje_check CHECK ((polje = ANY (ARRAY['role'::text, 'department_code'::text, 'vodja_id'::text, 'is_koordinator'::text])))
);

create table if not exists public.dnevnik_razporeda (
    id bigint NOT NULL,
    entry_id bigint,
    employee_id uuid,
    department_code text,
    work_date date,
    old_shift_code text,
    new_shift_code text,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dnevnik_razporeda_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])))
);

create table if not exists public.kadrovski_podatki (
    profile_id uuid NOT NULL,
    employee_code text,
    birth_date date,
    position_name text,
    manager_name text,
    parental_leave text,
    annual_leave_total integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    leave_balance_days integer,
    leave_balance_asof date,
    duty_min_monthly integer,
    duty_max_monthly integer,
    duty_day_off text,
    duty_weekdays_only boolean,
    -- Spol (M/Z) - potreben SAMO za varnostno pravilo pri menjavah na
    -- oddelkih C1/D (glej public.spol_dovoljeno_po_menjavi): C1 mora imeti
    -- ob vsaki izmeni vedno vsaj 2 moška, D vsaj 1. NULL (ni vnesen) se pri
    -- tem pravilu obravnava kot "ni moški" - varno privzeto, dokler admin
    -- podatka ne vnese v Imeniku (HR kartica).
    spol text,
    CONSTRAINT kadrovski_podatki_spol_check CHECK (spol IS NULL OR spol = ANY (ARRAY['M'::text, 'Z'::text])),
    CONSTRAINT kadrovski_podatki_duty_day_off_check CHECK ((duty_day_off = ANY (ARRAY['PO'::text, 'TO'::text, 'SR'::text, 'ČE'::text, 'PE'::text, 'SO'::text, 'NE'::text])))
);

create table if not exists public.koledarski_zetoni (
    profile_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    enabled boolean DEFAULT true NOT NULL
);

create table if not exists public.obrazci (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stevilka text,
    vrsta text NOT NULL,
    status text DEFAULT 'osnutek'::text NOT NULL,
    vlagatelj_id uuid NOT NULL,
    sodelavec_id uuid,
    vodja_id uuid,
    koordinator_id uuid,
    polja jsonb DEFAULT '{}'::jsonb NOT NULL,
    ustvarjen timestamp with time zone DEFAULT now() NOT NULL,
    zakljucen_dne timestamp with time zone,
    razlog_zavrnitve text,
    je_dezurstvo boolean DEFAULT false NOT NULL,
    CONSTRAINT obrazci_sodelavec_le_pri_menjavi CHECK (((vrsta = 'menjava_sluzbe'::text) OR (sodelavec_id IS NULL))),
    CONSTRAINT obrazci_sodelavec_ni_vlagatelj CHECK (((sodelavec_id IS NULL) OR (sodelavec_id <> vlagatelj_id))),
    CONSTRAINT obrazci_status_check CHECK ((status = ANY (ARRAY['osnutek'::text, 'caka_sodelavca'::text, 'caka_vodjo'::text, 'caka_koordinatorja'::text, 'zakljucen'::text, 'zavrnjen'::text, 'preklican'::text]))),
    CONSTRAINT obrazci_vrsta_check CHECK ((vrsta = ANY (ARRAY['rocno_evidentiranje'::text, 'menjava_sluzbe'::text, 'drugo'::text])))
);

create table if not exists public.minimalna_zasedba (
    department_code text NOT NULL,
    shift_bucket text NOT NULL,
    min_dms integer,
    min_sms integer,
    min_flexi integer,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT minimalna_zasedba_shift_bucket_check CHECK ((shift_bucket = ANY (ARRAY['DOPOLDNE'::text, 'POPOLDNE'::text, 'PONOCI'::text])))
);

create table if not exists public.nastavitve_obvestil (
    profile_id uuid NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    sms_enabled boolean DEFAULT false NOT NULL,
    opomnik_izmene boolean DEFAULT true NOT NULL,
    sprememba_razporeda boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.nosilci_oddelkov (
    full_name text NOT NULL,
    department_code text,
    dezurstvo_dovoljeno boolean DEFAULT false NOT NULL,
    max_mesecno integer,
    samo_med_tednom boolean DEFAULT false NOT NULL,
    delovnik text,
    ur_na_dan numeric,
    odsotnost_tip text,
    odsotnost_do date,
    nadomesca text,
    opomba text,
    enote text,
    inicialke text,
    mat_st text,
    letni_dopust_dni integer
);

create table if not exists public.obrazci_dnevnik (
    id bigint NOT NULL,
    obrazec_id uuid NOT NULL,
    stopnja smallint NOT NULL,
    dejanje text NOT NULL,
    uporabnik_id uuid,
    ime_ob_dejanju text,
    vloga_ob_dejanju text,
    opomba text,
    cas timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.obvestila (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    swap_request_id bigint,
    message text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    url text,
    push_sent_at timestamp with time zone,
    kljuc text,
    email_sent_at timestamp with time zone
);

create table if not exists public.oddelki (
    code text NOT NULL,
    name text NOT NULL
);

create table if not exists public.odsotnosti (
    id bigint NOT NULL,
    full_name text NOT NULL,
    work_date date NOT NULL,
    kind text NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT odsotnosti_kind_check CHECK ((kind = ANY (ARRAY['omejitev'::text, 'ld'::text, 'bs'::text, 'sti'::text])))
);

create table if not exists public.pokriva_oddelek (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    department_code text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

create table if not exists public.potisne_narocnine (
    id bigint NOT NULL,
    profile_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_ok_at timestamp with time zone
);

create table if not exists public.profili (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    department_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    rotation_slot text,
    vodja_id uuid,
    is_koordinator boolean DEFAULT false NOT NULL,
    parafa text,
    job_title text,
    parafa_pred_oktobrom_2026 text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'vodja'::text, 'user'::text]))),
    CONSTRAINT profili_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'vodja'::text, 'user'::text]))),
    CONSTRAINT profili_rotation_slot_check CHECK ((rotation_slot = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text])))
);

create table if not exists public.razpored (
    id bigint NOT NULL,
    employee_id uuid NOT NULL,
    department_code text NOT NULL,
    work_date date NOT NULL,
    shift_code text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    pokriva_oddelek text
);

create table if not exists public.zgodovina_stanja_dopusta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_code text NOT NULL,
    full_name text NOT NULL,
    leto smallint NOT NULL,
    mesec smallint NOT NULL,
    dnevi numeric(5,1) NOT NULL,
    profile_id uuid,
    uvozeno timestamp with time zone DEFAULT now() NOT NULL,
    uvozil uuid,
    CONSTRAINT zgodovina_stanja_dopusta_dnevi_check CHECK ((dnevi >= (0)::numeric)),
    CONSTRAINT zgodovina_stanja_dopusta_leto_check CHECK (((leto >= 2020) AND (leto <= 2100))),
    CONSTRAINT zgodovina_stanja_dopusta_mesec_check CHECK (((mesec >= 1) AND (mesec <= 12)))
);

create table if not exists public.telefoni_kontaktov (
    profile_id uuid NOT NULL,
    phone text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table if not exists public.uvozi_kontaktov (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    role text,
    department_code text,
    linked_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_code text,
    birth_date date,
    position_name text,
    manager_name text,
    parental_leave text,
    annual_leave_total integer,
    leave_balance_days integer,
    leave_balance_asof date,
    CONSTRAINT uvozi_kontaktov_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'vodja'::text, 'user'::text])))
);

create table if not exists public.zahtevki_za_menjavo (
    id bigint NOT NULL,
    requester_id uuid NOT NULL,
    requester_date date NOT NULL,
    target_id uuid NOT NULL,
    target_date date NOT NULL,
    note text,
    status text DEFAULT 'pending_lead'::text NOT NULL,
    lead_id uuid,
    lead_decided_at timestamp with time zone,
    lead_note text,
    admin_id uuid,
    admin_decided_at timestamp with time zone,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT swap_requests_status_check CHECK ((status = ANY (ARRAY['pending_lead'::text, 'pending_admin'::text, 'pending_koordinator'::text, 'approved'::text, 'rejected_by_lead'::text, 'rejected_by_admin'::text, 'rejected_by_koordinator'::text]))),
    CONSTRAINT zahtevki_za_menjavo_check CHECK ((requester_id <> target_id)),
    CONSTRAINT zahtevki_za_menjavo_status_check CHECK ((status = ANY (ARRAY['pending_lead'::text, 'pending_admin'::text, 'approved'::text, 'rejected_by_lead'::text, 'rejected_by_admin'::text])))
);

create table if not exists public.zelje_zaposlenih (
    id bigint NOT NULL,
    profile_id uuid,
    full_name text NOT NULL,
    department_code text NOT NULL,
    obdobje text,
    opis text,
    slika text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    -- En sam CHECK: pg_dump je ob preimenovanju employee_wishes ->
    -- zelje_zaposlenih prinesel oba, stari (VODJE, brez FLEXI/NZV) in novega.
    -- Ker se CHECK omejitve sestevajo z AND, je stari zavracal prav vrstice
    -- oddelkov FLEXI in NZV. Nabor sledi seedu tabele oddelki.
    CONSTRAINT zelje_zaposlenih_department_code_check CHECK ((department_code = ANY (ARRAY['B'::text, 'C'::text, 'C1'::text, 'D'::text, 'E1'::text, 'E2'::text, 'FLEXI'::text, 'NZV'::text])))
);


-- Nadomescanja med nosilci enot (NZV) in nastavitve NZV pogleda. Do zdaj
-- sta ziveli locено v supabase/nzv-nadomescanja.sql in nzv-nastavitve.sql
-- in ju konsolidacija ni zajela - aplikacija (index.html, admin.html) ju
-- bere, v novi bazi pa ju ni bilo. Tu sta z ZE zdruzenimi poznejsimi
-- dopolnitvami (poleg_svoje iz nzv-nadomescanja-poleg-svoje.sql).
create table if not exists public.nadomescanja (
    nosilec text NOT NULL,          -- kdo je odsoten (cigav oddelek je treba pokriti)
    nadomesca text NOT NULL,        -- kdo ga pokrije
    enota text,                     -- katero enoto s tem pokrije (glej nosilci_oddelkov.enote)
    prednost smallint DEFAULT 1 NOT NULL,
    -- true = nadomescevalec obdrzi svojo enoto in pokrije se enoto odsotnega
    -- (Bojic: MO + ZO). false = preseli se na enoto odsotnega, svojo odda
    -- naslednjemu v verigi (Arnez: s C na C1, C prevzame Lunar).
    poleg_svoje boolean DEFAULT false NOT NULL
);

create table if not exists public.nzv_nastavitve (
    kljuc text NOT NULL,
    vrednost text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Maticna stevilka za nosilce enot: nosilci_oddelkov ima za kljuc IME, kar
-- se med tabelami razhaja (poroka, popravek zapisa, dvobesedni priimek).
-- Prineseno iz supabase/nzv-maticne-stevilke-vodij.sql, ki je konsolidacija
-- ni zajela - admin.html pa stolpec bere s
-- .from("nosilci_oddelkov").select("full_name, employee_code").
alter table public.nosilci_oddelkov add column if not exists employee_code text;

alter table public.nadomescanja add column if not exists enota text;
alter table public.nadomescanja add column if not exists prednost smallint default 1 not null;
alter table public.nadomescanja add column if not exists poleg_svoje boolean default false not null;
alter table public.nzv_nastavitve add column if not exists vrednost text;
alter table public.nzv_nastavitve add column if not exists updated_at timestamp with time zone default now() not null;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.nadomescanja'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.nadomescanja
    ADD CONSTRAINT nadomescanja_pkey PRIMARY KEY (nosilec, nadomesca)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.nzv_nastavitve'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.nzv_nastavitve
    ADD CONSTRAINT nzv_nastavitve_pkey PRIMARY KEY (kljuc)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;


-- Zaporedja / identitetni stolpci (zahtevajo obstoječe tabele):

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'dnevnik_odsotnosti'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.dnevnik_odsotnosti ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dnevnik_odsotnosti_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'dnevnik_ogledov'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.dnevnik_ogledov ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dnevnik_ogledov_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'dnevnik_profilov'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.dnevnik_profilov ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dnevnik_profilov_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'dnevnik_razporeda'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.dnevnik_razporeda ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dnevnik_razporeda_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'obrazci_dnevnik'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.obrazci_dnevnik ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.obrazci_dnevnik_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

create sequence if not exists public.obrazci_zap
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'obvestila'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.obvestila ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.obvestila_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'odsotnosti'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.odsotnosti ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.odsotnosti_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'potisne_narocnine'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.potisne_narocnine ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.potisne_narocnine_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'razpored'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.razpored ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.razpored_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'zahtevki_za_menjavo'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.zahtevki_za_menjavo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.zahtevki_za_menjavo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'zelje_zaposlenih'
      and a.attname = 'id' and a.attidentity <> ''
  ) then
    execute 'ALTER TABLE public.zelje_zaposlenih ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.zelje_zaposlenih_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
)';
  end if;
end $$;


-- Dopolnitev stolpcev za baze, ki so nastale pred temi stolpci:

alter table public.barvne_oznake add column if not exists barva text;
alter table public.barvne_oznake add column if not exists kind text;
alter table public.barvne_oznake add column if not exists prezri boolean default false;
alter table public.barvne_oznake add column if not exists posodobil uuid;
alter table public.barvne_oznake add column if not exists posodobljeno timestamp with time zone default now();
alter table public.dezurni_zdravniki add column if not exists work_date date;
alter table public.dezurni_zdravniki add column if not exists kind text;
alter table public.dezurni_zdravniki add column if not exists full_name text;
alter table public.dezurni_zdravniki add column if not exists updated_at timestamp with time zone default now();
alter table public.dnevnik_odsotnosti add column if not exists id bigint;
alter table public.dnevnik_odsotnosti add column if not exists full_name text;
alter table public.dnevnik_odsotnosti add column if not exists work_date date;
alter table public.dnevnik_odsotnosti add column if not exists from_kind text;
alter table public.dnevnik_odsotnosti add column if not exists to_kind text;
alter table public.dnevnik_odsotnosti add column if not exists editor_id uuid;
alter table public.dnevnik_odsotnosti add column if not exists editor_name text;
alter table public.dnevnik_odsotnosti add column if not exists created_at timestamp with time zone default now();
alter table public.dnevnik_ogledov add column if not exists id bigint;
alter table public.dnevnik_ogledov add column if not exists admin_id uuid;
alter table public.dnevnik_ogledov add column if not exists admin_email text;
alter table public.dnevnik_ogledov add column if not exists target_profile_id uuid;
alter table public.dnevnik_ogledov add column if not exists target_full_name text;
alter table public.dnevnik_ogledov add column if not exists target_email text;
alter table public.dnevnik_ogledov add column if not exists started_at timestamp with time zone default now();
alter table public.dnevnik_ogledov add column if not exists ended_at timestamp with time zone;
alter table public.dnevnik_profilov add column if not exists id bigint;
alter table public.dnevnik_profilov add column if not exists profile_id uuid;
alter table public.dnevnik_profilov add column if not exists profile_name text;
alter table public.dnevnik_profilov add column if not exists polje text;
alter table public.dnevnik_profilov add column if not exists stara_vrednost text;
alter table public.dnevnik_profilov add column if not exists nova_vrednost text;
alter table public.dnevnik_profilov add column if not exists action text;
alter table public.dnevnik_profilov add column if not exists changed_by uuid;
alter table public.dnevnik_profilov add column if not exists changed_by_name text;
alter table public.dnevnik_profilov add column if not exists changed_at timestamp with time zone default now();
alter table public.dnevnik_razporeda add column if not exists id bigint;
alter table public.dnevnik_razporeda add column if not exists entry_id bigint;
alter table public.dnevnik_razporeda add column if not exists employee_id uuid;
alter table public.dnevnik_razporeda add column if not exists department_code text;
alter table public.dnevnik_razporeda add column if not exists work_date date;
alter table public.dnevnik_razporeda add column if not exists old_shift_code text;
alter table public.dnevnik_razporeda add column if not exists new_shift_code text;
alter table public.dnevnik_razporeda add column if not exists action text;
alter table public.dnevnik_razporeda add column if not exists changed_by uuid;
alter table public.dnevnik_razporeda add column if not exists changed_at timestamp with time zone default now();
alter table public.kadrovski_podatki add column if not exists profile_id uuid;
alter table public.kadrovski_podatki add column if not exists employee_code text;
alter table public.kadrovski_podatki add column if not exists birth_date date;
alter table public.kadrovski_podatki add column if not exists position_name text;
alter table public.kadrovski_podatki add column if not exists manager_name text;
alter table public.kadrovski_podatki add column if not exists parental_leave text;
alter table public.kadrovski_podatki add column if not exists annual_leave_total integer;
alter table public.kadrovski_podatki add column if not exists updated_at timestamp with time zone default now();
alter table public.kadrovski_podatki add column if not exists leave_balance_days integer;
alter table public.kadrovski_podatki add column if not exists leave_balance_asof date;
alter table public.kadrovski_podatki add column if not exists duty_min_monthly integer;
alter table public.kadrovski_podatki add column if not exists duty_max_monthly integer;
alter table public.kadrovski_podatki add column if not exists duty_day_off text;
alter table public.kadrovski_podatki add column if not exists duty_weekdays_only boolean;
alter table public.kadrovski_podatki add column if not exists spol text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kadrovski_podatki_spol_check') then
    alter table public.kadrovski_podatki
      add constraint kadrovski_podatki_spol_check check (spol is null or spol = any (array['M','Z']));
  end if;
exception
  when duplicate_object then null;
end $$;
alter table public.koledarski_zetoni add column if not exists profile_id uuid;
alter table public.koledarski_zetoni add column if not exists token text;
alter table public.koledarski_zetoni add column if not exists created_at timestamp with time zone default now();
alter table public.koledarski_zetoni add column if not exists last_used_at timestamp with time zone;
alter table public.koledarski_zetoni add column if not exists enabled boolean default true;
alter table public.minimalna_zasedba add column if not exists department_code text;
alter table public.minimalna_zasedba add column if not exists shift_bucket text;
alter table public.minimalna_zasedba add column if not exists min_dms integer;
alter table public.minimalna_zasedba add column if not exists min_sms integer;
alter table public.minimalna_zasedba add column if not exists min_flexi integer;
alter table public.minimalna_zasedba add column if not exists note text;
alter table public.minimalna_zasedba add column if not exists updated_at timestamp with time zone default now();
alter table public.nastavitve_obvestil add column if not exists profile_id uuid;
alter table public.nastavitve_obvestil add column if not exists email_enabled boolean default true;
alter table public.nastavitve_obvestil add column if not exists push_enabled boolean default true;
alter table public.nastavitve_obvestil add column if not exists sms_enabled boolean default false;
alter table public.nastavitve_obvestil add column if not exists opomnik_izmene boolean default true;
alter table public.nastavitve_obvestil add column if not exists sprememba_razporeda boolean default true;
alter table public.nastavitve_obvestil add column if not exists updated_at timestamp with time zone default now();
alter table public.nosilci_oddelkov add column if not exists full_name text;
alter table public.nosilci_oddelkov add column if not exists department_code text;
alter table public.nosilci_oddelkov add column if not exists dezurstvo_dovoljeno boolean default false;
alter table public.nosilci_oddelkov add column if not exists max_mesecno integer;
alter table public.nosilci_oddelkov add column if not exists samo_med_tednom boolean default false;
alter table public.nosilci_oddelkov add column if not exists delovnik text;
alter table public.nosilci_oddelkov add column if not exists ur_na_dan numeric;
alter table public.nosilci_oddelkov add column if not exists odsotnost_tip text;
alter table public.nosilci_oddelkov add column if not exists odsotnost_do date;
alter table public.nosilci_oddelkov add column if not exists nadomesca text;
alter table public.nosilci_oddelkov add column if not exists opomba text;
alter table public.nosilci_oddelkov add column if not exists enote text;
alter table public.nosilci_oddelkov add column if not exists inicialke text;
alter table public.nosilci_oddelkov add column if not exists mat_st text;
alter table public.nosilci_oddelkov add column if not exists letni_dopust_dni integer;
alter table public.obrazci add column if not exists id uuid default gen_random_uuid();
alter table public.obrazci add column if not exists stevilka text;
alter table public.obrazci add column if not exists vrsta text;
alter table public.obrazci add column if not exists status text default 'osnutek'::text;
alter table public.obrazci add column if not exists vlagatelj_id uuid;
alter table public.obrazci add column if not exists sodelavec_id uuid;
alter table public.obrazci add column if not exists vodja_id uuid;
alter table public.obrazci add column if not exists koordinator_id uuid;
alter table public.obrazci add column if not exists polja jsonb default '{}'::jsonb;
alter table public.obrazci add column if not exists ustvarjen timestamp with time zone default now();
alter table public.obrazci add column if not exists zakljucen_dne timestamp with time zone;
alter table public.obrazci add column if not exists razlog_zavrnitve text;
alter table public.obrazci add column if not exists je_dezurstvo boolean default false;
alter table public.obrazci_dnevnik add column if not exists id bigint;
alter table public.obrazci_dnevnik add column if not exists obrazec_id uuid;
alter table public.obrazci_dnevnik add column if not exists stopnja smallint;
alter table public.obrazci_dnevnik add column if not exists dejanje text;
alter table public.obrazci_dnevnik add column if not exists uporabnik_id uuid;
alter table public.obrazci_dnevnik add column if not exists ime_ob_dejanju text;
alter table public.obrazci_dnevnik add column if not exists vloga_ob_dejanju text;
alter table public.obrazci_dnevnik add column if not exists opomba text;
alter table public.obrazci_dnevnik add column if not exists cas timestamp with time zone default now();
alter table public.obvestila add column if not exists id bigint;
alter table public.obvestila add column if not exists user_id uuid;
alter table public.obvestila add column if not exists swap_request_id bigint;
alter table public.obvestila add column if not exists message text;
alter table public.obvestila add column if not exists read_at timestamp with time zone;
alter table public.obvestila add column if not exists created_at timestamp with time zone default now();
alter table public.obvestila add column if not exists title text;
alter table public.obvestila add column if not exists url text;
alter table public.obvestila add column if not exists push_sent_at timestamp with time zone;
alter table public.obvestila add column if not exists kljuc text;
alter table public.obvestila add column if not exists email_sent_at timestamp with time zone;
alter table public.oddelki add column if not exists code text;
alter table public.oddelki add column if not exists name text;
alter table public.odsotnosti add column if not exists id bigint;
alter table public.odsotnosti add column if not exists full_name text;
alter table public.odsotnosti add column if not exists work_date date;
alter table public.odsotnosti add column if not exists kind text;
alter table public.odsotnosti add column if not exists note text;
alter table public.odsotnosti add column if not exists created_by uuid;
alter table public.odsotnosti add column if not exists created_at timestamp with time zone default now();
alter table public.pokriva_oddelek add column if not exists id uuid default gen_random_uuid();
alter table public.pokriva_oddelek add column if not exists profile_id uuid;
alter table public.pokriva_oddelek add column if not exists department_code text;
alter table public.pokriva_oddelek add column if not exists sort_order integer default 0;
alter table public.potisne_narocnine add column if not exists id bigint;
alter table public.potisne_narocnine add column if not exists profile_id uuid;
alter table public.potisne_narocnine add column if not exists endpoint text;
alter table public.potisne_narocnine add column if not exists p256dh text;
alter table public.potisne_narocnine add column if not exists auth text;
alter table public.potisne_narocnine add column if not exists user_agent text;
alter table public.potisne_narocnine add column if not exists created_at timestamp with time zone default now();
alter table public.potisne_narocnine add column if not exists last_ok_at timestamp with time zone;
alter table public.profili add column if not exists id uuid;
alter table public.profili add column if not exists full_name text;
alter table public.profili add column if not exists role text default 'user'::text;
alter table public.profili add column if not exists department_code text;
alter table public.profili add column if not exists created_at timestamp with time zone default now();
alter table public.profili add column if not exists email text;
alter table public.profili add column if not exists rotation_slot text;
alter table public.profili add column if not exists vodja_id uuid;
alter table public.profili add column if not exists is_koordinator boolean default false;
alter table public.profili add column if not exists parafa text;
alter table public.profili add column if not exists job_title text;
alter table public.profili add column if not exists parafa_pred_oktobrom_2026 text;
alter table public.razpored add column if not exists id bigint;
alter table public.razpored add column if not exists employee_id uuid;
alter table public.razpored add column if not exists department_code text;
alter table public.razpored add column if not exists work_date date;
alter table public.razpored add column if not exists shift_code text default ''::text;
alter table public.razpored add column if not exists updated_at timestamp with time zone default now();
alter table public.razpored add column if not exists created_at timestamp with time zone default now();
alter table public.razpored add column if not exists created_by uuid;
alter table public.razpored add column if not exists updated_by uuid;
alter table public.razpored add column if not exists pokriva_oddelek text;
alter table public.telefoni_kontaktov add column if not exists profile_id uuid;
alter table public.telefoni_kontaktov add column if not exists phone text;
alter table public.telefoni_kontaktov add column if not exists updated_at timestamp with time zone default now();
alter table public.uvozi_kontaktov add column if not exists id uuid default gen_random_uuid();
alter table public.uvozi_kontaktov add column if not exists full_name text;
alter table public.uvozi_kontaktov add column if not exists email text;
alter table public.uvozi_kontaktov add column if not exists phone text;
alter table public.uvozi_kontaktov add column if not exists role text;
alter table public.uvozi_kontaktov add column if not exists department_code text;
alter table public.uvozi_kontaktov add column if not exists linked_profile_id uuid;
alter table public.uvozi_kontaktov add column if not exists created_at timestamp with time zone default now();
alter table public.uvozi_kontaktov add column if not exists employee_code text;
alter table public.uvozi_kontaktov add column if not exists birth_date date;
alter table public.uvozi_kontaktov add column if not exists position_name text;
alter table public.uvozi_kontaktov add column if not exists manager_name text;
alter table public.uvozi_kontaktov add column if not exists parental_leave text;
alter table public.uvozi_kontaktov add column if not exists annual_leave_total integer;
alter table public.uvozi_kontaktov add column if not exists leave_balance_days integer;
alter table public.uvozi_kontaktov add column if not exists leave_balance_asof date;
alter table public.zahtevki_za_menjavo add column if not exists id bigint;
alter table public.zahtevki_za_menjavo add column if not exists requester_id uuid;
alter table public.zahtevki_za_menjavo add column if not exists requester_date date;
alter table public.zahtevki_za_menjavo add column if not exists target_id uuid;
alter table public.zahtevki_za_menjavo add column if not exists target_date date;
alter table public.zahtevki_za_menjavo add column if not exists note text;
alter table public.zahtevki_za_menjavo add column if not exists status text default 'pending_lead'::text;
alter table public.zahtevki_za_menjavo add column if not exists lead_id uuid;
alter table public.zahtevki_za_menjavo add column if not exists lead_decided_at timestamp with time zone;
alter table public.zahtevki_za_menjavo add column if not exists lead_note text;
alter table public.zahtevki_za_menjavo add column if not exists admin_id uuid;
alter table public.zahtevki_za_menjavo add column if not exists admin_decided_at timestamp with time zone;
alter table public.zahtevki_za_menjavo add column if not exists admin_note text;
alter table public.zahtevki_za_menjavo add column if not exists created_at timestamp with time zone default now();
alter table public.zahtevki_za_menjavo add column if not exists updated_at timestamp with time zone default now();
alter table public.zelje_zaposlenih add column if not exists id bigint;
alter table public.zelje_zaposlenih add column if not exists profile_id uuid;
alter table public.zelje_zaposlenih add column if not exists full_name text;
alter table public.zelje_zaposlenih add column if not exists department_code text;
alter table public.zelje_zaposlenih add column if not exists obdobje text;
alter table public.zelje_zaposlenih add column if not exists opis text;
alter table public.zelje_zaposlenih add column if not exists slika text;
alter table public.zelje_zaposlenih add column if not exists created_by uuid;
alter table public.zelje_zaposlenih add column if not exists created_at timestamp with time zone default now();
alter table public.zgodovina_stanja_dopusta add column if not exists id uuid default gen_random_uuid();
alter table public.zgodovina_stanja_dopusta add column if not exists employee_code text;
alter table public.zgodovina_stanja_dopusta add column if not exists full_name text;
alter table public.zgodovina_stanja_dopusta add column if not exists leto smallint;
alter table public.zgodovina_stanja_dopusta add column if not exists mesec smallint;
alter table public.zgodovina_stanja_dopusta add column if not exists dnevi numeric(5,1);
alter table public.zgodovina_stanja_dopusta add column if not exists profile_id uuid;
alter table public.zgodovina_stanja_dopusta add column if not exists uvozeno timestamp with time zone default now();
alter table public.zgodovina_stanja_dopusta add column if not exists uvozil uuid;


-- Popravek podvojene CHECK omejitve na zelje_zaposlenih za OBSTOJEČE baze:
-- ob preimenovanju employee_wishes -> zelje_zaposlenih sta ostali obe
-- omejitvi. Ker se seštevata z AND, je starejša (VODJE, brez FLEXI in NZV)
-- zavračala vnos želja za oddelka FLEXI in NZV. 'create table if not
-- exists' na obstoječi tabeli tega ne popravi, zato izrecno.
do $$ begin
  if to_regclass('public.zelje_zaposlenih') is not null then
    alter table public.zelje_zaposlenih
      drop constraint if exists employee_wishes_department_code_check;
    alter table public.zelje_zaposlenih
      drop constraint if exists zelje_zaposlenih_department_code_check;
    alter table public.zelje_zaposlenih
      add constraint zelje_zaposlenih_department_code_check
      check (department_code = any (array['B'::text, 'C'::text, 'C1'::text,
        'D'::text, 'E1'::text, 'E2'::text, 'FLEXI'::text, 'NZV'::text]));
  end if;
end $$;


-- Primarni ključi in enoličnost:

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.barvne_oznake'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.barvne_oznake
    ADD CONSTRAINT barvne_oznake_pkey PRIMARY KEY (barva)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dezurni_zdravniki'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.dezurni_zdravniki
    ADD CONSTRAINT dezurni_zdravniki_pkey PRIMARY KEY (work_date, kind)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dnevnik_odsotnosti'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.dnevnik_odsotnosti
    ADD CONSTRAINT dnevnik_odsotnosti_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dnevnik_ogledov'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.dnevnik_ogledov
    ADD CONSTRAINT dnevnik_ogledov_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dnevnik_profilov'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.dnevnik_profilov
    ADD CONSTRAINT dnevnik_profilov_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dnevnik_razporeda'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.dnevnik_razporeda
    ADD CONSTRAINT dnevnik_razporeda_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.kadrovski_podatki'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.kadrovski_podatki
    ADD CONSTRAINT kadrovski_podatki_pkey PRIMARY KEY (profile_id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.koledarski_zetoni'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.koledarski_zetoni
    ADD CONSTRAINT koledarski_zetoni_pkey PRIMARY KEY (profile_id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.koledarski_zetoni', array['token']) then
    execute 'ALTER TABLE ONLY public.koledarski_zetoni
    ADD CONSTRAINT koledarski_zetoni_token_key UNIQUE (token)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.minimalna_zasedba'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.minimalna_zasedba
    ADD CONSTRAINT minimalna_zasedba_pkey PRIMARY KEY (department_code, shift_bucket)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.nastavitve_obvestil'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.nastavitve_obvestil
    ADD CONSTRAINT nastavitve_obvestil_pkey PRIMARY KEY (profile_id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.nosilci_oddelkov'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.nosilci_oddelkov
    ADD CONSTRAINT nosilci_oddelkov_pkey PRIMARY KEY (full_name)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.obrazci_dnevnik'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.obrazci_dnevnik
    ADD CONSTRAINT obrazci_dnevnik_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.obrazci'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.obrazci', array['stevilka']) then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_stevilka_key UNIQUE (stevilka)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.obvestila'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.obvestila
    ADD CONSTRAINT obvestila_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.oddelki'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.oddelki
    ADD CONSTRAINT oddelki_pkey PRIMARY KEY (code)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.odsotnosti', array['full_name', 'work_date']) then
    execute 'ALTER TABLE ONLY public.odsotnosti
    ADD CONSTRAINT odsotnosti_full_name_work_date_key UNIQUE (full_name, work_date)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.odsotnosti'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.odsotnosti
    ADD CONSTRAINT odsotnosti_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.pokriva_oddelek'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.pokriva_oddelek
    ADD CONSTRAINT pokriva_oddelek_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.pokriva_oddelek', array['profile_id', 'department_code']) then
    execute 'ALTER TABLE ONLY public.pokriva_oddelek
    ADD CONSTRAINT pokriva_oddelek_profile_id_department_code_key UNIQUE (profile_id, department_code)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.potisne_narocnine', array['endpoint']) then
    execute 'ALTER TABLE ONLY public.potisne_narocnine
    ADD CONSTRAINT potisne_narocnine_endpoint_key UNIQUE (endpoint)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.potisne_narocnine'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.potisne_narocnine
    ADD CONSTRAINT potisne_narocnine_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profili'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.profili
    ADD CONSTRAINT profili_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.razpored', array['employee_id', 'work_date']) then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_employee_id_work_date_key UNIQUE (employee_id, work_date)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.razpored'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.telefoni_kontaktov'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.telefoni_kontaktov
    ADD CONSTRAINT telefoni_kontaktov_pkey PRIMARY KEY (profile_id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.uvozi_kontaktov'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.uvozi_kontaktov
    ADD CONSTRAINT uvozi_kontaktov_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.zahtevki_za_menjavo'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.zahtevki_za_menjavo
    ADD CONSTRAINT zahtevki_za_menjavo_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.zelje_zaposlenih'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.zelje_zaposlenih
    ADD CONSTRAINT zelje_zaposlenih_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.enolicna_omejitev_ze_obstaja('public.zgodovina_stanja_dopusta', array['employee_code', 'leto', 'mesec']) then
    execute 'ALTER TABLE ONLY public.zgodovina_stanja_dopusta
    ADD CONSTRAINT zgodovina_stanja_dopusta_employee_code_leto_mesec_key UNIQUE (employee_code, leto, mesec)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.zgodovina_stanja_dopusta'::regclass and contype = 'p') then
    execute 'ALTER TABLE ONLY public.zgodovina_stanja_dopusta
    ADD CONSTRAINT zgodovina_stanja_dopusta_pkey PRIMARY KEY (id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;


-- =====================================================================
-- 4. TUJI KLJUČI (Foreign Keys)
-- ---------------------------------------------------------------------
-- Ločeno od CREATE TABLE, da ni krožnih odvisnosti - ko se izvedejo,
-- vse tabele iz razdelka 3 že obstajajo.
-- =====================================================================

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.barvne_oznake', array['posodobil'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.barvne_oznake
    ADD CONSTRAINT barvne_oznake_posodobil_fkey FOREIGN KEY (posodobil) REFERENCES auth.users(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.dnevnik_odsotnosti', array['editor_id'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.dnevnik_odsotnosti
    ADD CONSTRAINT dnevnik_odsotnosti_editor_id_fkey FOREIGN KEY (editor_id) REFERENCES auth.users(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.dnevnik_ogledov', array['admin_id'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.dnevnik_ogledov
    ADD CONSTRAINT dnevnik_ogledov_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.dnevnik_ogledov', array['target_profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.dnevnik_ogledov
    ADD CONSTRAINT dnevnik_ogledov_target_profile_id_fkey FOREIGN KEY (target_profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.dnevnik_profilov', array['changed_by'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.dnevnik_profilov
    ADD CONSTRAINT dnevnik_profilov_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.dnevnik_razporeda', array['changed_by'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.dnevnik_razporeda
    ADD CONSTRAINT dnevnik_razporeda_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.kadrovski_podatki', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.kadrovski_podatki
    ADD CONSTRAINT kadrovski_podatki_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.koledarski_zetoni', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.koledarski_zetoni
    ADD CONSTRAINT koledarski_zetoni_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.minimalna_zasedba', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.minimalna_zasedba
    ADD CONSTRAINT minimalna_zasedba_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.nastavitve_obvestil', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.nastavitve_obvestil
    ADD CONSTRAINT nastavitve_obvestil_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.nosilci_oddelkov', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.nosilci_oddelkov
    ADD CONSTRAINT nosilci_oddelkov_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci_dnevnik', array['obrazec_id'], 'public.obrazci') then
    execute 'ALTER TABLE ONLY public.obrazci_dnevnik
    ADD CONSTRAINT obrazci_dnevnik_obrazec_id_fkey FOREIGN KEY (obrazec_id) REFERENCES public.obrazci(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci_dnevnik', array['uporabnik_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obrazci_dnevnik
    ADD CONSTRAINT obrazci_dnevnik_uporabnik_id_fkey FOREIGN KEY (uporabnik_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci', array['koordinator_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_koordinator_id_fkey FOREIGN KEY (koordinator_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci', array['sodelavec_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_sodelavec_id_fkey FOREIGN KEY (sodelavec_id) REFERENCES public.profili(id) ON DELETE RESTRICT';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci', array['vlagatelj_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_vlagatelj_id_fkey FOREIGN KEY (vlagatelj_id) REFERENCES public.profili(id) ON DELETE RESTRICT';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obrazci', array['vodja_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obrazci
    ADD CONSTRAINT obrazci_vodja_id_fkey FOREIGN KEY (vodja_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obvestila', array['swap_request_id'], 'public.zahtevki_za_menjavo') then
    execute 'ALTER TABLE ONLY public.obvestila
    ADD CONSTRAINT obvestila_swap_request_id_fkey FOREIGN KEY (swap_request_id) REFERENCES public.zahtevki_za_menjavo(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.obvestila', array['user_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.obvestila
    ADD CONSTRAINT obvestila_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.odsotnosti', array['created_by'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.odsotnosti
    ADD CONSTRAINT odsotnosti_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.pokriva_oddelek', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.pokriva_oddelek
    ADD CONSTRAINT pokriva_oddelek_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.pokriva_oddelek', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.pokriva_oddelek
    ADD CONSTRAINT pokriva_oddelek_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.potisne_narocnine', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.potisne_narocnine
    ADD CONSTRAINT potisne_narocnine_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.profili', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.profili
    ADD CONSTRAINT profiles_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.profili', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.profili
    ADD CONSTRAINT profili_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.profili', array['id'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.profili
    ADD CONSTRAINT profili_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.profili', array['vodja_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.profili
    ADD CONSTRAINT profili_vodja_id_fkey FOREIGN KEY (vodja_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.razpored', array['created_by'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.razpored', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.razpored', array['employee_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.razpored', array['updated_by'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.razpored
    ADD CONSTRAINT razpored_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.telefoni_kontaktov', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.telefoni_kontaktov
    ADD CONSTRAINT telefoni_kontaktov_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.uvozi_kontaktov', array['department_code'], 'public.oddelki') then
    execute 'ALTER TABLE ONLY public.uvozi_kontaktov
    ADD CONSTRAINT uvozi_kontaktov_department_code_fkey FOREIGN KEY (department_code) REFERENCES public.oddelki(code) ON UPDATE CASCADE';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.uvozi_kontaktov', array['linked_profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.uvozi_kontaktov
    ADD CONSTRAINT uvozi_kontaktov_linked_profile_id_fkey FOREIGN KEY (linked_profile_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zahtevki_za_menjavo', array['admin_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zahtevki_za_menjavo
    ADD CONSTRAINT zahtevki_za_menjavo_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zahtevki_za_menjavo', array['lead_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zahtevki_za_menjavo
    ADD CONSTRAINT zahtevki_za_menjavo_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zahtevki_za_menjavo', array['requester_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zahtevki_za_menjavo
    ADD CONSTRAINT zahtevki_za_menjavo_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profili(id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zahtevki_za_menjavo', array['target_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zahtevki_za_menjavo
    ADD CONSTRAINT zahtevki_za_menjavo_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.profili(id)';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zelje_zaposlenih', array['created_by'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.zelje_zaposlenih
    ADD CONSTRAINT zelje_zaposlenih_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zelje_zaposlenih', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zelje_zaposlenih
    ADD CONSTRAINT zelje_zaposlenih_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zgodovina_stanja_dopusta', array['profile_id'], 'public.profili') then
    execute 'ALTER TABLE ONLY public.zgodovina_stanja_dopusta
    ADD CONSTRAINT zgodovina_stanja_dopusta_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profili(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

do $$ begin
  if not public.tuji_kljuc_ze_obstaja('public.zgodovina_stanja_dopusta', array['uvozil'], 'auth.users') then
    execute 'ALTER TABLE ONLY public.zgodovina_stanja_dopusta
    ADD CONSTRAINT zgodovina_stanja_dopusta_uvozil_fkey FOREIGN KEY (uvozil) REFERENCES auth.users(id) ON DELETE SET NULL';
  end if;
exception
  when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;


-- =====================================================================
-- 4b. POSPRAVLJANJE ŽE NASTALIH PODVOJITEV
-- ---------------------------------------------------------------------
-- Varovalke zgoraj poslej ne podvajajo več (glej razdelek 2b), v bazi, ki
-- je preimenovanje že prestala, pa podvojitve LEŽIJO. Prav te so razbile
-- Imenik: PostgREST ob dveh enakih tujih ključih med profili in
-- telefoni_kontaktov ne ve, katerega naj uporabi, in vrne
--   "Could not embed because more than one relationship was found".
--
-- Odvrže se le omejitev, ki je res odveč: taka, pri kateri na isti tabeli
-- obstaja druga z ENAKIMI stolpci (in pri tujem ključu enako ciljno
-- tabelo). Obdrži se tista, katere ime se ujema z današnjim, slovenskim
-- imenom tabele - torej tista, ki jo opisuje ta datoteka; če se ne ujema
-- nobena, obdrži se najstarejša. Podatkov to ne spremeni: pravilo, ki ga
-- omejitev uveljavlja, ostane v veljavi prek dvojnice, ki ostane.
-- =====================================================================

do $$
declare
  o record;
  odvrzenih int := 0;
begin
  for o in
    with omejitve as (
      select c.oid, c.conname, c.conrelid, c.contype,
             c.conrelid::regclass::text as tabela,
             (select array_agg(a.attname::text order by a.attname)
                from unnest(c.conkey) k
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) as stolpci,
             c.confrelid
        from pg_constraint c
       where c.connamespace = 'public'::regnamespace
         and c.contype in ('f', 'u')
    ),
    razvrsceno as (
      select *,
             row_number() over (
               partition by conrelid, contype, stolpci, confrelid
               -- Prednost ima ime, ki se začne z današnjim imenom tabele;
               -- med enakovrednimi najstarejša (najmanjši oid).
               order by case when conname like replace(tabela, 'public.', '') || '\_%'
                             then 0 else 1 end, oid
             ) as mesto,
             count(*) over (partition by conrelid, contype, stolpci, confrelid) as koliko
        from omejitve
    )
    select conname, tabela, contype, stolpci from razvrsceno
     where koliko > 1 and mesto > 1
  loop
    execute format('alter table %s drop constraint %I', o.tabela, o.conname);
    raise notice 'odvržena podvojena omejitev %.% (%s)',
      o.tabela, o.conname, array_to_string(o.stolpci, ', ');
    odvrzenih := odvrzenih + 1;
  end loop;

  if odvrzenih = 0 then
    raise notice 'podvojenih omejitev ni bilo - nič za pospraviti';
  else
    raise notice 'skupaj odvrženih podvojenih omejitev: %', odvrzenih;
  end if;
end $$;


-- =====================================================================
-- 5. INDEKSI
-- ---------------------------------------------------------------------
-- Po datumih, oddelkih in zaposlenih - stolpci, po katerih aplikacija
-- najpogosteje filtrira razpored.
-- =====================================================================

create index if not exists idx_admin_view_as_log_admin ON public.dnevnik_ogledov USING btree (admin_id);

create index if not exists idx_employee_wishes_dept ON public.zelje_zaposlenih USING btree (department_code);

create index if not exists idx_leave_balance_history_obdobje ON public.zgodovina_stanja_dopusta USING btree (leto, mesec);

create index if not exists idx_leave_balance_history_profile ON public.zgodovina_stanja_dopusta USING btree (profile_id);

create index if not exists idx_obrazci_dnevnik_obrazec ON public.obrazci_dnevnik USING btree (obrazec_id, cas);

-- Menjave se povsod filtrirajo po polja->>'datum_a' (mesecni pregled v
-- obrazec.html in politika obrazci_select), zato izrazni indeks - le nad
-- vrsto menjava_sluzbe, ker drugi obrazci tega kljuca nimajo.
create index if not exists idx_obrazci_menjava_datum_a ON public.obrazci USING btree (((polja ->> 'datum_a'::text))) WHERE (vrsta = 'menjava_sluzbe'::text);

create index if not exists idx_obrazci_sodelavec ON public.obrazci USING btree (sodelavec_id);

create index if not exists idx_obrazci_status ON public.obrazci USING btree (status);

create index if not exists idx_obrazci_vlagatelj ON public.obrazci USING btree (vlagatelj_id);

create index if not exists notifications_email_pending_idx ON public.obvestila USING btree (created_at) WHERE (email_sent_at IS NULL);

create unique index if not exists notifications_kljuc_idx ON public.obvestila USING btree (kljuc) WHERE (kljuc IS NOT NULL);

create index if not exists notifications_push_pending_idx ON public.obvestila USING btree (created_at) WHERE (push_sent_at IS NULL);

create index if not exists notifications_user_idx ON public.obvestila USING btree (user_id, read_at);

create index if not exists profiles_log_cas_idx ON public.dnevnik_profilov USING btree (changed_at DESC);

create index if not exists profiles_log_profile_idx ON public.dnevnik_profilov USING btree (profile_id, changed_at DESC);

create index if not exists push_subscriptions_profile_idx ON public.potisne_narocnine USING btree (profile_id);

create index if not exists schedule_entries_date_idx ON public.razpored USING btree (work_date);

create index if not exists schedule_entries_dept_idx ON public.razpored USING btree (department_code, work_date);

create index if not exists schedule_entries_log_date_idx ON public.dnevnik_razporeda USING btree (work_date);

create index if not exists schedule_entries_log_emp_idx ON public.dnevnik_razporeda USING btree (employee_id, work_date);

create index if not exists swap_requests_requester_idx ON public.zahtevki_za_menjavo USING btree (requester_id);

create index if not exists swap_requests_status_idx ON public.zahtevki_za_menjavo USING btree (status);

create index if not exists swap_requests_target_idx ON public.zahtevki_za_menjavo USING btree (target_id);


-- =====================================================================
-- 6. FUNKCIJE IN SPROŽILCI
-- ---------------------------------------------------------------------
-- Izračuni ur, časovni žigi (updated_at), preverjanje počitka med
-- izmenama. Sprožilci pridejo za funkcijami, ki jih kličejo.
-- 
-- POZOR na vrstni red: funkcije morajo biti PRED pogledi (razdelek 7),
-- ne za njimi. Pogledi kot uvozi_kontaktov_javno v svoji definiciji
-- kličejo current_role_is() / imena_se_ujemata(); če funkcije še ne
-- obstajajo, se pogled sploh ne ustvari.
-- =====================================================================

create or replace function public.blokirani_dnevi(p_od date, p_do date) RETURNS TABLE(profile_id uuid, datum date)
    LANGUAGE sql STABLE
    AS $$
  with le as (
    select p.id as profile_id, l.work_date, l.kind
    from public.odsotnosti l
    join public.profili p on public.imena_se_ujemata(p.full_name, l.full_name)
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

create or replace function public.current_department() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select department_code from public.profili where id = auth.uid();
$$;

create or replace function public.current_full_name() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select full_name from public.profili where id = auth.uid();
$$;

create or replace function public.current_is_koordinator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_koordinator from public.profili where id = auth.uid()), false);
$$;

create or replace function public.current_role_is(p_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profili where id = auth.uid() and role = p_role
  );
$$;

create or replace function public.decide_swap_admin(p_swap_id bigint, p_approve boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_req record;
  v_requester_shift text;
  v_target_shift text;
begin
  if not public.current_role_is('admin') then
    raise exception 'Samo administrator lahko dokončno odloča.';
  end if;

  select * into v_req from public.zahtevki_za_menjavo
  where id = p_swap_id and status = 'pending_admin'
  for update;

  if v_req.id is null then
    raise exception 'Predlog ne obstaja ali ni več v čakanju na administratorja.';
  end if;

  if p_approve then
    select shift_code into v_requester_shift from public.razpored
      where employee_id = v_req.requester_id and work_date = v_req.requester_date;
    select shift_code into v_target_shift from public.razpored
      where employee_id = v_req.target_id and work_date = v_req.target_date;

    insert into public.razpored (employee_id, department_code, work_date, shift_code, updated_at)
    select v_req.requester_id, department_code, v_req.requester_date, coalesce(v_target_shift, ''), now()
    from public.profili where id = v_req.requester_id
    on conflict (employee_id, work_date)
      do update set shift_code = excluded.shift_code, updated_at = now();

    insert into public.razpored (employee_id, department_code, work_date, shift_code, updated_at)
    select v_req.target_id, department_code, v_req.target_date, coalesce(v_requester_shift, ''), now()
    from public.profili where id = v_req.target_id
    on conflict (employee_id, work_date)
      do update set shift_code = excluded.shift_code, updated_at = now();
  end if;

  update public.zahtevki_za_menjavo
  set status = case when p_approve then 'approved' else 'rejected_by_admin' end,
      admin_id = auth.uid(),
      admin_decided_at = now(),
      admin_note = p_note,
      updated_at = now()
  where id = p_swap_id;
end;
$$;

create or replace function public.decide_swap_lead(p_swap_id bigint, p_approve boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_req_dept text;
begin
  if not public.current_role_is('vodja') then
    raise exception 'Samo vodja lahko odloča na prvi stopnji.';
  end if;

  select p.department_code into v_req_dept
  from public.zahtevki_za_menjavo s join public.profili p on p.id = s.requester_id
  where s.id = p_swap_id and s.status = 'pending_lead'
  for update of s;

  if v_req_dept is null then
    raise exception 'Predlog ne obstaja ali ni več v čakanju na vodjo.';
  end if;
  if v_req_dept is distinct from public.current_department() then
    raise exception 'Ta predlog ni iz tvoje ekipe.';
  end if;

  update public.zahtevki_za_menjavo
  set status = case when p_approve then 'pending_admin' else 'rejected_by_lead' end,
      lead_id = auth.uid(),
      lead_decided_at = now(),
      lead_note = p_note,
      updated_at = now()
  where id = p_swap_id;
end;
$$;

create or replace function public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.profili (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Neznano ime'),
    'user',
    new.email
  )
  on conflict (id) do update set email = excluded.email where profili.email is null;
  return new;
exception
  when others then
    raise warning 'handle_new_user: ustvarjanje profila za % ni uspelo: %', new.id, sqlerrm;
    return new;
end;
$$;

create or replace function public.imena_se_ujemata(a text, b text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select a is not null and b is not null and (
    select array_agg(w order by w) from unnest(regexp_split_to_array(upper(trim(a)), '\s+')) w
  ) = (
    select array_agg(w order by w) from unnest(regexp_split_to_array(upper(trim(b)), '\s+')) w
  );
$$;

create or replace function public.izmena_cas(p_sifra text) RETURNS TABLE(zacetek time without time zone, konec time without time zone, cez_polnoc boolean)
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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

create or replace function public.koledar_razpored(p_token text, p_od date, p_do date) RETURNS TABLE(full_name text, work_date date, shift_code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

create or replace function public.koledar_sinhronizacija(p_vklop boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

create or replace function public.koledar_token() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

create or replace function public.koledar_token_ponastavi() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

create or replace function public.leave_entry_rok_odprt(p_work_date date) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select now() <= (
    date_trunc('month', p_work_date) - interval '1 month' + interval '9 days 23 hours 59 minutes 59 seconds'
  );
$$;

create or replace function public.log_leave_entry_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_editor_name text;
begin
  select full_name into v_editor_name from public.profili where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.dnevnik_odsotnosti (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (new.full_name, new.work_date, null, new.kind, auth.uid(), v_editor_name);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.dnevnik_odsotnosti (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (new.full_name, new.work_date, old.kind, new.kind, auth.uid(), v_editor_name);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.dnevnik_odsotnosti (full_name, work_date, from_kind, to_kind, editor_id, editor_name)
    values (old.full_name, old.work_date, old.kind, null, auth.uid(), v_editor_name);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.min_pocitek() RETURNS interval
    LANGUAGE sql IMMUTABLE
    AS $$ select interval '10 hours 42 minutes' $$;

-- Pravi oddelek za namene omejitve menjav: FLEXI kader ima v razpored
-- department_code vedno "FLEXI" (svoja skupina), pravi oddelek, ki ga tisti
-- dan pokriva, pa je v pokriva_oddelek (lahko sestavljen, npr. "C1/E2" -
-- glej index.html komentar ob department_code="FLEXI"). Za spolno pravilo
-- šteje dejanski oddelek, ne oznaka FLEXI.
create or replace function public.efektivni_oddelek(p_department_code text, p_pokriva_oddelek text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_department_code <> 'FLEXI' then p_department_code
    when p_pokriva_oddelek is null then null
    -- pokriva_oddelek je lahko "C1/E2" ali "C1,E2" - vzemi prvi kos, ker
    -- za C1/D presojo zadošča, da je oddelek SPLOH med pokritimi.
    when p_pokriva_oddelek ~ 'C1' then 'C1'
    when p_pokriva_oddelek ~ '(^|[/,])D([/,]|$)' then 'D'
    else split_part(regexp_replace(p_pokriva_oddelek, '[,]', '/', 'g'), '/', 1)
  end;
$$;

-- Ali je zaposleni moški. NULL (spol ni vnesen) šteje kot "ni moški" -
-- varno privzeto, dokler admin podatka ne vnese v Imeniku (HR kartica).
create or replace function public.je_moski(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select coalesce((select spol = 'M' from public.kadrovski_podatki where profile_id = p_profile_id), false);
$$;

-- Varnostno pravilo za oddelka C1 in D: C1 mora imeti na VSAKI izmeni
-- (department_code/pokriva_oddelek + work_date + shift_code, ločeno po
-- posamezni izmeni tega dne) vedno vsaj 2 moška, D vsaj 1. Klical se ta
-- funkcija DVAKRAT za vsako menjavo - enkrat za vsako od dveh zamenjanih
-- rež (glej mozni_sodelavci/obrazec_potrdi_koordinator) - ker menjava
-- prizadene DVE ločeni izmeni (moja gre njemu, njegova pride meni).
-- Trd blok, brez izjeme (uporabnikova izrecna odločitev).
create or replace function public.spol_dovoljeno_po_menjavi(
    p_department_code text, p_pokriva_oddelek text, p_datum date, p_sifra text,
    p_odhaja uuid, p_prihaja uuid
) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_oddelek text := public.efektivni_oddelek(p_department_code, p_pokriva_oddelek);
  v_potrebno int;
  v_moskih int;
begin
  v_potrebno := case v_oddelek when 'C1' then 2 when 'D' then 1 else 0 end;
  if v_potrebno = 0 then return true; end if;

  select count(*) into v_moskih
    from public.razpored se
    where se.work_date = p_datum and se.shift_code = p_sifra
      and public.efektivni_oddelek(se.department_code, se.pokriva_oddelek) = v_oddelek
      and se.employee_id <> p_odhaja
      and public.je_moski(se.employee_id);

  if p_prihaja is not null and public.je_moski(p_prihaja) then
    v_moskih := v_moskih + 1;
  end if;

  return v_moskih >= v_potrebno;
end;
$$;

create or replace function public.mozni_sodelavci(p_profile_id uuid, p_datum date) RETURNS TABLE(profile_id uuid, full_name text, njihova_izmena text, njihov_datum date, moj_zacetek time without time zone, njihov_zacetek time without time zone, jaz_pridem_prej boolean)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_moja_sifra text;
  v_moj_oddelek text;
  v_moj_pokriva text;
begin
  select shift_code, department_code, pokriva_oddelek
    into v_moja_sifra, v_moj_oddelek, v_moj_pokriva
    from public.razpored where employee_id = p_profile_id and work_date = p_datum;

  -- Če za ta dan ni vrstice (prost dan brez zapisa), pade nazaj na domači
  -- oddelek iz profila - drugače bi omejitev spodaj vsakogar blokirala.
  if v_moj_oddelek is null then
    select department_code into v_moj_oddelek from public.profili where id = p_profile_id;
  end if;

  return query
  select p.id, p.full_name, se.shift_code, se.work_date,
    (select zacetek from public.izmena_cas(v_moja_sifra)),
    (select zacetek from public.izmena_cas(se.shift_code)),
    (select zacetek from public.izmena_cas(v_moja_sifra)) < (select zacetek from public.izmena_cas(se.shift_code))
  from public.razpored se
  join public.profili p on p.id = se.employee_id
  where se.work_date between p_datum - 7 and p_datum + 7
    and se.employee_id <> p_profile_id
    and se.shift_code is not null and se.shift_code <> ''
    and (select zacetek from public.izmena_cas(se.shift_code)) is not null
    and not exists (select 1 from public.blokirani_dnevi(p_datum, p_datum) b where b.profile_id = p.id)
    and not exists (select 1 from public.blokirani_dnevi(se.work_date, se.work_date) b where b.profile_id = p_profile_id)
    and public.pocitek_ustreza(p.id, p_datum, se.shift_code)
    and public.pocitek_ustreza(se.employee_id, se.work_date, v_moja_sifra)
    -- Menjava samo znotraj istega oddelka tistega dne (FLEXI je izjema -
    -- floaterji menjajo s komerkoli, uporabnikova izrecna odločitev).
    and (v_moj_oddelek = se.department_code or v_moj_oddelek = 'FLEXI' or se.department_code = 'FLEXI')
    -- Spolno pravilo velja NE GLEDE na zgornjo izjemo - FLEXI na C1/D dan
    -- šteje enako kot kdorkoli drug na C1/D (glej efektivni_oddelek).
    and public.spol_dovoljeno_po_menjavi(v_moj_oddelek, v_moj_pokriva, p_datum, v_moja_sifra, p_profile_id, se.employee_id)
    and public.spol_dovoljeno_po_menjavi(se.department_code, se.pokriva_oddelek, se.work_date, se.shift_code, se.employee_id, p_profile_id)
  order by p.full_name;
end;
$$;

create or replace function public.notify_swap_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  msg text;
begin
  if new.status = old.status then
    return new;
  end if;
  msg := case new.status
    when 'pending_admin'           then 'Vodja je odobril predlog menjave – čaka na administratorja.'
    when 'pending_koordinator'     then 'Predlog menjave čaka na potrditev koordinatorja.'
    when 'approved'                then 'Menjava izmene je bila potrjena.'
    when 'rejected_by_lead'        then 'Vodja je zavrnil predlog menjave.'
    when 'rejected_by_admin'       then 'Administrator je zavrnil predlog menjave.'
    when 'rejected_by_koordinator' then 'Koordinator je zavrnil predlog menjave.'
    else 'Status predloga menjave se je spremenil: ' || new.status
  end;
  insert into public.obvestila (user_id, swap_request_id, message)
  values (new.requester_id, new.id, msg), (new.target_id, new.id, msg);
  return new;
end;
$$;

create or replace function public.obrazec_oddaj(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

    select shift_code into v_izmena_a from public.razpored
      where employee_id = o.vlagatelj_id and work_date = (o.polja ->> 'datum_a')::date;
    select shift_code into v_izmena_b from public.razpored
      where employee_id = o.sodelavec_id and work_date = (o.polja ->> 'datum_b')::date;
    v_je_dez := (lower(coalesce(v_izmena_a, '')) like 'dežurstvo%') or (lower(coalesce(v_izmena_b, '')) like 'dežurstvo%');

    v_status := 'caka_sodelavca';
  else
    v_status := 'caka_vodjo';
  end if;

  -- Neposrednega vodjo potrebujemo samo, če bo obrazec dejansko šel skozi
  -- njegovo stopnjo – menjava dežurstva jo preskoči (glej
  -- obrazec_potrdi_sodelavec spodaj), zato zanjo vodja ni pogoj za oddajo.
  if not (o.vrsta = 'menjava_sluzbe' and v_je_dez) then
    select vodja_id into v_vodja from public.profili where id = auth.uid();
    if v_vodja is null then raise exception 'Nimaš določenega neposrednega vodje – admin ga mora najprej nastaviti v Imeniku.'; end if;
  end if;

  update public.obrazci set status = v_status, vodja_id = v_vodja, je_dezurstvo = v_je_dez where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 1::smallint, 'ODDANO');
  return v_status;
end;
$$;

create or replace function public.obrazec_potrdi_koordinator(p_id uuid, p_sprejmi boolean, p_opomba text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  o public.obrazci;
  v_dan_a date; v_dan_b date;
  v_izmena_a text; v_izmena_b text;
  v_dept_a text; v_dept_b text;
  v_pokriva_a text; v_pokriva_b text;
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

    select shift_code, department_code, pokriva_oddelek into v_izmena_a, v_dept_a, v_pokriva_a
      from public.razpored where employee_id = o.vlagatelj_id and work_date = v_dan_a;
    select shift_code, department_code, pokriva_oddelek into v_izmena_b, v_dept_b, v_pokriva_b
      from public.razpored where employee_id = o.sodelavec_id and work_date = v_dan_b;
    -- Če za tisti dan ni vrstice, pade nazaj na domači oddelek iz profila -
    -- brez tega bi spodnji vnos zavrnil zapis (department_code NOT NULL).
    if v_dept_a is null then select department_code into v_dept_a from public.profili where id = o.vlagatelj_id; end if;
    if v_dept_b is null then select department_code into v_dept_b from public.profili where id = o.sodelavec_id; end if;

    -- Varnostni pas ob KONČNI potrditvi, na TRENUTNEM stanju baze - od
    -- oddaje predloga do zdaj se je razpored lahko spremenil (druga
    -- menjava, ročni popravek), spodnja preverba pa mora veljati za stanje
    -- tik pred izvedbo, ne za stanje ob oddaji. Trd blok, brez izjeme.
    if not public.spol_dovoljeno_po_menjavi(v_dept_a, v_pokriva_a, v_dan_a, v_izmena_a, o.vlagatelj_id, o.sodelavec_id) then
      raise exception 'Menjava ni mogoča: oddelek % na % (%) po menjavi ne bi imel dovolj moških v izmeni.', v_dept_a, v_dan_a, v_izmena_a;
    end if;
    if not public.spol_dovoljeno_po_menjavi(v_dept_b, v_pokriva_b, v_dan_b, v_izmena_b, o.sodelavec_id, o.vlagatelj_id) then
      raise exception 'Menjava ni mogoča: oddelek % na % (%) po menjavi ne bi imel dovolj moških v izmeni.', v_dept_b, v_dan_b, v_izmena_b;
    end if;

    -- Prava menjava: vsak prevzame DATUM/ODDELEK/IZMENO drugega - natanko
    -- to je prikazano v predogledu pred oddajo (obrazec.html, NovObrazec).
    -- Prej je vsak ostal na SVOJEM datumu in zamenjala se je samo koda
    -- izmene, kar je bilo v nasprotju s tem, kar je bilo obljubljeno pred
    -- oddajo, in pri različnih datumih dejansko napačno.
    insert into public.razpored (employee_id, department_code, work_date, shift_code, pokriva_oddelek, updated_at)
    values (o.vlagatelj_id, v_dept_b, v_dan_b, coalesce(v_izmena_b, ''), v_pokriva_b, now())
    on conflict (employee_id, work_date) do update set
      department_code = excluded.department_code, shift_code = excluded.shift_code,
      pokriva_oddelek = excluded.pokriva_oddelek, updated_at = now();

    insert into public.razpored (employee_id, department_code, work_date, shift_code, pokriva_oddelek, updated_at)
    values (o.sodelavec_id, v_dept_a, v_dan_a, coalesce(v_izmena_a, ''), v_pokriva_a, now())
    on conflict (employee_id, work_date) do update set
      department_code = excluded.department_code, shift_code = excluded.shift_code,
      pokriva_oddelek = excluded.pokriva_oddelek, updated_at = now();

    -- Če datuma nista enaka, mora vsak izprazniti SVOJ izvirni dan - drugače
    -- bi po menjavi kazalo, da oba delata oba dneva.
    if v_dan_a <> v_dan_b then
      update public.razpored set shift_code = '', pokriva_oddelek = null, updated_at = now()
        where employee_id = o.vlagatelj_id and work_date = v_dan_a;
      update public.razpored set shift_code = '', pokriva_oddelek = null, updated_at = now()
        where employee_id = o.sodelavec_id and work_date = v_dan_b;
    end if;
  end if;

  update public.obrazci set status = 'zakljucen', koordinator_id = auth.uid(), zakljucen_dne = now() where id = p_id;
  perform public.zapisi_v_dnevnik(p_id, 4::smallint, 'KOORDINATOR_POTRDIL', p_opomba);
  return 'zakljucen';
end;
$$;

create or replace function public.obrazec_potrdi_sodelavec(p_id uuid, p_sprejmi boolean, p_opomba text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

create or replace function public.obrazec_potrdi_vodja(p_id uuid, p_sprejmi boolean, p_opomba text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

create or replace function public.obrazec_preklici(p_id uuid, p_opomba text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

create or replace function public.obrazec_stevilka() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.stevilka is null then
    new.stevilka := 'OBV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.obrazci_zap')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.obvesti_o_objavi_razporeda(p_start date, p_end date, p_oddelek text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  st integer;
begin
  if not public.current_role_is('admin') then
    raise exception 'Samo administrator lahko pošlje obvestilo o objavi razporeda.';
  end if;

  insert into public.obvestila (user_id, message, title, url, kljuc)
  select distinct se.employee_id,
         'Objavljen je razpored za obdobje ' || to_char(p_start, 'DD.MM.YYYY') || ' – ' || to_char(p_end, 'DD.MM.YYYY') || '.',
         'Nov razpored je objavljen',
         'index.html',
         'razpored:' || se.employee_id || ':' || p_start || ':' || p_end
  from public.razpored se
  where se.work_date between p_start and p_end
    and (p_oddelek is null or se.department_code = p_oddelek)
  on conflict (kljuc) where kljuc is not null do nothing;

  get diagnostics st = row_count;
  return st;
end;
$$;

create or replace function public.obvesti_ob_spremembi_obrazca() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  vlagatelj text;
  naslov text;
  sporocilo text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select full_name into vlagatelj from public.profili where id = new.vlagatelj_id;

  if new.status = 'caka_sodelavca' then
    naslov := 'Predlog menjave čaka tvojo potrditev';
    sporocilo := coalesce(vlagatelj, 'Sodelavec') || ' ti je poslal predlog menjave. Odpri stran Menjava.';
    if new.sodelavec_id is not null then
      insert into public.obvestila (user_id, message, title, url)
      values (new.sodelavec_id, sporocilo, naslov, 'obrazec.html');
    end if;

  elsif new.status = 'caka_vodjo' then
    naslov := 'Menjava čaka tvojo odobritev';
    sporocilo := 'Predlog menjave (' || coalesce(vlagatelj, 'zaposleni') || ') čaka odobritev neposrednega vodje.';
    if new.vodja_id is not null then
      insert into public.obvestila (user_id, message, title, url)
      values (new.vodja_id, sporocilo, naslov, 'obrazec.html');
    end if;

  elsif new.status = 'caka_koordinatorja' then
    naslov := 'Menjava čaka koordinatorja';
    sporocilo := 'Predlog menjave (' || coalesce(vlagatelj, 'zaposleni') || ') čaka končno potrditev koordinatorja.';
    insert into public.obvestila (user_id, message, title, url)
    select p.id, sporocilo, naslov, 'obrazec.html'
    from public.profili p where p.is_koordinator;

  elsif new.status in ('zakljucen', 'zavrnjen', 'preklican') then
    naslov := case new.status
      when 'zakljucen' then 'Menjava je odobrena'
      when 'zavrnjen' then 'Menjava je zavrnjena'
      else 'Menjava je preklicana'
    end;
    sporocilo := case new.status
      when 'zakljucen' then 'Predlog menjave je bil dokončno odobren – razpored je posodobljen.'
      when 'zavrnjen' then 'Predlog menjave je bil zavrnjen.' || coalesce(' Razlog: ' || new.razlog_zavrnitve, '')
      else 'Predlog menjave je bil preklican.'
    end;
    insert into public.obvestila (user_id, message, title, url)
    select x.uid, sporocilo, naslov, 'obrazec.html'
    from (select new.vlagatelj_id as uid union select new.sodelavec_id) x
    where x.uid is not null;
  end if;

  return new;
end;
$$;

create or replace function public.pocitek_ustreza(p_profile_id uuid, p_datum date, p_sifra text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
  nova record; nova_od timestamp; nova_do timestamp;
  r record; sosed record; od timestamp; do_ timestamp;
begin
  select * into nova from public.izmena_cas(p_sifra);
  if nova is null then return true; end if; -- ne dela ta dan, počitek ni relevanten

  nova_od := p_datum + nova.zacetek;
  nova_do := p_datum + nova.konec + (case when nova.cez_polnoc then interval '1 day' else interval '0' end);

  for r in
    select se.work_date, se.shift_code from public.razpored se
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

    if nova_od < do_ + public.min_pocitek() and od < nova_do + public.min_pocitek() then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.prejemniki_obvestil(p_ids uuid[]) RETURNS TABLE(profile_id uuid, email text, full_name text, email_enabled boolean, push_enabled boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select p.id, p.email, p.full_name,
         coalesce(ns.email_enabled, true),
         coalesce(ns.push_enabled, true)
  from public.profili p
  left join public.nastavitve_obvestil ns on ns.profile_id = p.id
  where p.id = any(p_ids);
$$;

create or replace function public.profiles_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

create or replace function public.schedule_entries_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if TG_OP = 'DELETE' then
    insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
    values (old.id, old.employee_id, old.department_code, old.work_date, old.shift_code, null, 'delete', auth.uid());
    return old;
  elsif TG_OP = 'UPDATE' then
    -- samo, če se je dejansko kaj vidnega spremenilo (ne vsak "ping" upsert
    -- z istimi vrednostmi - schedule_entries_touch zgoraj tako ali tako
    -- vedno posodobi updated_at/updated_by, kar bi sicer napolnilo dnevnik
    -- z nič-spremembami).
    if old.shift_code is distinct from new.shift_code or old.department_code is distinct from new.department_code then
      insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
      values (new.id, new.employee_id, new.department_code, new.work_date, old.shift_code, new.shift_code, 'update', auth.uid());
    end if;
    return new;
  else
    insert into public.dnevnik_razporeda (entry_id, employee_id, department_code, work_date, old_shift_code, new_shift_code, action, changed_by)
    values (new.id, new.employee_id, new.department_code, new.work_date, null, new.shift_code, 'insert', auth.uid());
    return new;
  end if;
end;
$$;

create or replace function public.schedule_entries_touch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at; -- datum objave se ob poznejšem urejanju ne spreminja
    -- Avtorja prve objave ohrani (upsert iz aplikacije pošlje prazno polje
    -- in bi ga sicer izbrisal) – RAZEN kadar ga prav zdaj prazni baza sama,
    -- ker je bil avtorjev račun izbrisan ("on delete set null", odsek 30).
    -- Takrat old.created_by kaže na profil, ki ne obstaja več; če ga vrnemo,
    -- v vrstici ostane viseča povezava na neobstoječo osebo.
    if not (new.created_by is null and old.created_by is not null
            and not exists (select 1 from public.profili p where p.id = old.created_by)) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.standardiziraj_polno_ime() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.full_name is not null
     and new.full_name <> ''
     and new.full_name = upper(new.full_name)
     and new.full_name <> initcap(new.full_name)
  then
    new.full_name := initcap(new.full_name);
  end if;
  return new;
end;
$$;

create or replace function public.submit_swap_request(p_target_id uuid, p_requester_date date, p_target_date date, p_note text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id bigint;
begin
  if p_target_id = auth.uid() then
    raise exception 'Ne moreš predlagati menjave sam s seboj.';
  end if;
  insert into public.zahtevki_za_menjavo (requester_id, requester_date, target_id, target_date, note, status)
  values (auth.uid(), p_requester_date, p_target_id, p_target_date, p_note, 'pending_lead')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sync_leave_balance_to_hr_details() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  najnovejsi record;
begin
  if new.profile_id is null then
    return new;
  end if;

  select leto, mesec into najnovejsi
  from public.zgodovina_stanja_dopusta
  where employee_code = new.employee_code
  order by leto desc, mesec desc
  limit 1;

  if najnovejsi.leto = new.leto and najnovejsi.mesec = new.mesec then
    insert into public.kadrovski_podatki (profile_id, leave_balance_days, leave_balance_asof, updated_at)
    values (new.profile_id, new.dnevi, make_date(new.leto, new.mesec, 1), now())
    on conflict (profile_id) do update set
      leave_balance_days = excluded.leave_balance_days,
      leave_balance_asof = excluded.leave_balance_asof,
      updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.sync_primary_department() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.department_code is null then
    return new;
  end if;
  -- Vse ostale oddelke te osebe premakni za enega nazaj, nato nov primarni
  -- oddelek postavi na sort_order 0 (upsert, če ga na seznamu še ni bilo).
  update public.pokriva_oddelek
  set sort_order = sort_order + 1
  where profile_id = new.id and department_code <> new.department_code;

  insert into public.pokriva_oddelek (profile_id, department_code, sort_order)
  values (new.id, new.department_code, 0)
  on conflict (profile_id, department_code) do update set sort_order = 0;
  return new;
end;
$$;

create or replace function public.ustvari_opomnike_za_jutri() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  jutri date := (current_date + 1);
  st integer;
begin
  insert into public.obvestila (user_id, message, title, url, kljuc)
  select se.employee_id,
         case when lower(se.shift_code) like 'dežurstvo%' or lower(se.shift_code) like 'dezurstvo%'
              then 'Jutri (' || to_char(jutri, 'DD.MM.YYYY') || ') imaš dežurstvo.'
              else 'Jutri (' || to_char(jutri, 'DD.MM.YYYY') || ') imaš nočno izmeno: ' || se.shift_code || '.'
         end,
         'Opomnik za jutrišnjo izmeno',
         'index.html',
         'opomnik:' || se.employee_id || ':' || jutri
  from public.razpored se
  where se.work_date = jutri
    and (lower(se.shift_code) like 'nočna%' or lower(se.shift_code) like 'dežurstvo%' or lower(se.shift_code) like 'dezurstvo%')
  on conflict (kljuc) where kljuc is not null do nothing;

  get diagnostics st = row_count;
  return st;
end;
$$;

create or replace function public.zapisi_v_dnevnik(p_obrazec uuid, p_stopnja smallint, p_dejanje text, p_opomba text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_ime text; v_vloga text;
begin
  select full_name, role into v_ime, v_vloga from public.profili where id = auth.uid();
  insert into public.obrazci_dnevnik (obrazec_id, stopnja, dejanje, uporabnik_id, ime_ob_dejanju, vloga_ob_dejanju, opomba)
  values (p_obrazec, p_stopnja, p_dejanje, auth.uid(), v_ime, v_vloga, p_opomba);
end;
$$;

drop trigger if exists ob_vstavljanju_obrazca on public.obrazci;
CREATE TRIGGER ob_vstavljanju_obrazca BEFORE INSERT ON public.obrazci FOR EACH ROW EXECUTE FUNCTION public.obrazec_stevilka();

-- Edini sprožilec zunaj sheme public, zato ga pg_dump razdelka public NE
-- zajame in ga je treba tu navesti ročno. Brez njega handle_new_user()
-- obstaja, a se nikoli ne izvede: nova prijava v auth.users ne dobi vrstice
-- v profili ("Database error saving new user" oz. uporabnik brez profila).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_leave_entry_change on public.odsotnosti;
CREATE TRIGGER on_leave_entry_change AFTER INSERT OR DELETE OR UPDATE ON public.odsotnosti FOR EACH ROW EXECUTE FUNCTION public.log_leave_entry_change();

drop trigger if exists on_obrazec_status_change on public.obrazci;
CREATE TRIGGER on_obrazec_status_change AFTER UPDATE OF status ON public.obrazci FOR EACH ROW EXECUTE FUNCTION public.obvesti_ob_spremembi_obrazca();

drop trigger if exists on_swap_status_change on public.zahtevki_za_menjavo;
CREATE TRIGGER on_swap_status_change AFTER UPDATE ON public.zahtevki_za_menjavo FOR EACH ROW EXECUTE FUNCTION public.notify_swap_status_change();

drop trigger if exists profiles_audit on public.profili;
CREATE TRIGGER profiles_audit AFTER INSERT OR DELETE OR UPDATE ON public.profili FOR EACH ROW EXECUTE FUNCTION public.profiles_audit();

drop trigger if exists schedule_entries_audit on public.razpored;
CREATE TRIGGER schedule_entries_audit AFTER INSERT OR DELETE OR UPDATE ON public.razpored FOR EACH ROW EXECUTE FUNCTION public.schedule_entries_audit();

drop trigger if exists schedule_entries_touch on public.razpored;
CREATE TRIGGER schedule_entries_touch BEFORE INSERT OR UPDATE ON public.razpored FOR EACH ROW EXECUTE FUNCTION public.schedule_entries_touch();

drop trigger if exists trg_standardiziraj_polno_ime on public.profili;
CREATE TRIGGER trg_standardiziraj_polno_ime BEFORE INSERT OR UPDATE OF full_name ON public.profili FOR EACH ROW EXECUTE FUNCTION public.standardiziraj_polno_ime();

drop trigger if exists trg_sync_leave_balance on public.zgodovina_stanja_dopusta;
CREATE TRIGGER trg_sync_leave_balance AFTER INSERT OR UPDATE OF dnevi, profile_id ON public.zgodovina_stanja_dopusta FOR EACH ROW EXECUTE FUNCTION public.sync_leave_balance_to_hr_details();

drop trigger if exists trg_sync_primary_department on public.profili;
CREATE TRIGGER trg_sync_primary_department AFTER INSERT OR UPDATE OF department_code ON public.profili FOR EACH ROW EXECUTE FUNCTION public.sync_primary_department();


-- =====================================================================
-- 7. POGLEDI (Views)
-- ---------------------------------------------------------------------
-- Opirajo se na tabele in tuje ključe (3-4) IN na funkcije (6).
-- Pravice (grant) so tu, ker se del nanaša prav na te poglede.
-- =====================================================================

create or replace view public.menjave_javno AS
 SELECT vlagatelj_id,
    sodelavec_id,
    ((polja ->> 'datum_a'::text))::date AS datum_a,
    ((polja ->> 'datum_b'::text))::date AS datum_b
   FROM public.obrazci o
  WHERE ((vrsta = 'menjava_sluzbe'::text) AND (status = 'zakljucen'::text) AND (polja ? 'datum_a'::text) AND (polja ? 'datum_b'::text));

create or replace view public.obrazci_moja_naloga WITH (security_invoker='true') AS
 SELECT id,
    stevilka,
    vrsta,
    status,
    vlagatelj_id,
    sodelavec_id,
    vodja_id,
    koordinator_id,
    polja,
    ustvarjen,
    zakljucen_dne,
    razlog_zavrnitve,
    je_dezurstvo,
        CASE
            WHEN ((status = 'caka_sodelavca'::text) AND (sodelavec_id = auth.uid())) THEN 'potrdi_kot_sodelavec'::text
            WHEN ((status = 'caka_vodjo'::text) AND (vodja_id = auth.uid())) THEN 'odobri_kot_vodja'::text
            WHEN ((status = 'caka_koordinatorja'::text) AND je_dezurstvo AND public.current_is_koordinator()) THEN 'potrdi_kot_koordinator'::text
            WHEN ((status = 'caka_koordinatorja'::text) AND (NOT je_dezurstvo) AND public.current_role_is('admin'::text)) THEN 'potrdi_kot_koordinator'::text
            ELSE NULL::text
        END AS moje_dejanje
   FROM public.obrazci o;

create or replace view public.stanje_dopusta_obdobja WITH (security_invoker='true') AS
 SELECT leto,
    mesec,
    count(*) AS stevilo_oseb,
    max(uvozeno) AS zadnji_uvoz
   FROM public.zgodovina_stanja_dopusta
  GROUP BY leto, mesec
  ORDER BY leto DESC, mesec DESC;

create or replace view public.stanje_dopusta_pregled WITH (security_invoker='true') AS
 SELECT id,
    employee_code,
    full_name,
    leto,
    mesec,
    dnevi,
    profile_id,
    uvozeno,
    lag(dnevi) OVER (PARTITION BY employee_code ORDER BY leto, mesec) AS dnevi_prejsnji,
    (dnevi - lag(dnevi) OVER (PARTITION BY employee_code ORDER BY leto, mesec)) AS sprememba
   FROM public.zgodovina_stanja_dopusta h;

create or replace view public.uvozi_kontaktov_javno AS
 SELECT id,
    full_name,
    department_code,
    role,
    linked_profile_id,
    created_at,
    email,
        CASE
            WHEN (public.current_role_is('admin'::text) OR public.current_role_is('vodja'::text)) THEN phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN public.current_role_is('admin'::text) THEN employee_code
            ELSE NULL::text
        END AS employee_code,
        CASE
            WHEN public.current_role_is('admin'::text) THEN birth_date
            ELSE NULL::date
        END AS birth_date,
        CASE
            WHEN public.current_role_is('admin'::text) THEN position_name
            ELSE NULL::text
        END AS position_name,
        CASE
            WHEN public.current_role_is('admin'::text) THEN manager_name
            ELSE NULL::text
        END AS manager_name,
        CASE
            WHEN public.current_role_is('admin'::text) THEN parental_leave
            ELSE NULL::text
        END AS parental_leave,
        CASE
            WHEN public.current_role_is('admin'::text) THEN annual_leave_total
            ELSE NULL::integer
        END AS annual_leave_total,
        CASE
            WHEN public.current_role_is('admin'::text) THEN leave_balance_days
            ELSE NULL::integer
        END AS leave_balance_days,
        CASE
            WHEN public.current_role_is('admin'::text) THEN leave_balance_asof
            ELSE NULL::date
        END AS leave_balance_asof
   FROM public.uvozi_kontaktov;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT ALL ON FUNCTION public.decide_swap_admin(p_swap_id bigint, p_approve boolean, p_note text) TO authenticated;

GRANT ALL ON FUNCTION public.decide_swap_lead(p_swap_id bigint, p_approve boolean, p_note text) TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.koledar_razpored(p_token text, p_od date, p_do date) FROM PUBLIC;

GRANT ALL ON FUNCTION public.mozni_sodelavci(p_profile_id uuid, p_datum date) TO authenticated;

GRANT ALL ON FUNCTION public.obrazec_oddaj(p_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.obrazec_potrdi_koordinator(p_id uuid, p_sprejmi boolean, p_opomba text) TO authenticated;

GRANT ALL ON FUNCTION public.obrazec_potrdi_sodelavec(p_id uuid, p_sprejmi boolean, p_opomba text) TO authenticated;

GRANT ALL ON FUNCTION public.obrazec_potrdi_vodja(p_id uuid, p_sprejmi boolean, p_opomba text) TO authenticated;

GRANT ALL ON FUNCTION public.obrazec_preklici(p_id uuid, p_opomba text) TO authenticated;

GRANT ALL ON FUNCTION public.obvesti_o_objavi_razporeda(p_start date, p_end date, p_oddelek text) TO authenticated;

REVOKE ALL ON FUNCTION public.prejemniki_obvestil(p_ids uuid[]) FROM PUBLIC;

GRANT ALL ON FUNCTION public.submit_swap_request(p_target_id uuid, p_requester_date date, p_target_date date, p_note text) TO authenticated;

REVOKE ALL ON FUNCTION public.zapisi_v_dnevnik(p_obrazec uuid, p_stopnja smallint, p_dejanje text, p_opomba text) FROM PUBLIC;

GRANT SELECT ON TABLE public.menjave_javno TO authenticated;

GRANT ALL ON TABLE public.profili TO supabase_auth_admin;

GRANT SELECT ON TABLE public.uvozi_kontaktov_javno TO authenticated;


-- =====================================================================
-- 8. VARNOST NA VRSTICO (RLS) IN POLITIKE
-- ---------------------------------------------------------------------
-- Politike se sklicujejo na funkcije iz razdelka 7, zato so za njim.
-- =====================================================================

ALTER TABLE public.barvne_oznake ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dezurni_zdravniki ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dnevnik_odsotnosti ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dnevnik_ogledov ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dnevnik_profilov ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dnevnik_razporeda ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kadrovski_podatki ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.koledarski_zetoni ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.minimalna_zasedba ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nastavitve_obvestil ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nosilci_oddelkov ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.obrazci ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.obrazci_dnevnik ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.obvestila ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oddelki ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.odsotnosti ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pokriva_oddelek ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.potisne_narocnine ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.razpored ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.telefoni_kontaktov ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.uvozi_kontaktov ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zahtevki_za_menjavo ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zelje_zaposlenih ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zgodovina_stanja_dopusta ENABLE ROW LEVEL SECURITY;

drop policy if exists absence_color_map_admin on public.barvne_oznake;
CREATE POLICY absence_color_map_admin ON public.barvne_oznake TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists admin_view_as_log_insert on public.dnevnik_ogledov;
CREATE POLICY admin_view_as_log_insert ON public.dnevnik_ogledov FOR INSERT TO authenticated WITH CHECK ((public.current_role_is('admin'::text) AND (admin_id = auth.uid())));

drop policy if exists admin_view_as_log_select on public.dnevnik_ogledov;
CREATE POLICY admin_view_as_log_select ON public.dnevnik_ogledov FOR SELECT TO authenticated USING (public.current_role_is('admin'::text));

drop policy if exists admin_view_as_log_update on public.dnevnik_ogledov;
CREATE POLICY admin_view_as_log_update ON public.dnevnik_ogledov FOR UPDATE TO authenticated USING ((public.current_role_is('admin'::text) AND (admin_id = auth.uid()))) WITH CHECK ((public.current_role_is('admin'::text) AND (admin_id = auth.uid())));

drop policy if exists calendar_tokens_own on public.koledarski_zetoni;
CREATE POLICY calendar_tokens_own ON public.koledarski_zetoni FOR SELECT TO authenticated USING ((profile_id = auth.uid()));

drop policy if exists contact_imports_admin on public.uvozi_kontaktov;
CREATE POLICY contact_imports_admin ON public.uvozi_kontaktov TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists contact_phones_admin_all on public.telefoni_kontaktov;
CREATE POLICY contact_phones_admin_all ON public.telefoni_kontaktov TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists contact_phones_select on public.telefoni_kontaktov;
CREATE POLICY contact_phones_select ON public.telefoni_kontaktov FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR public.current_role_is('admin'::text) OR public.current_role_is('vodja'::text)));

drop policy if exists contact_phones_update_own on public.telefoni_kontaktov;
CREATE POLICY contact_phones_update_own ON public.telefoni_kontaktov FOR UPDATE TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));

drop policy if exists contact_phones_upsert_own on public.telefoni_kontaktov;
CREATE POLICY contact_phones_upsert_own ON public.telefoni_kontaktov FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

drop policy if exists departments_select on public.oddelki;
CREATE POLICY departments_select ON public.oddelki FOR SELECT TO authenticated USING (true);

drop policy if exists departments_write_admin on public.oddelki;
CREATE POLICY departments_write_admin ON public.oddelki TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists dept_min_select on public.minimalna_zasedba;
CREATE POLICY dept_min_select ON public.minimalna_zasedba FOR SELECT TO authenticated USING (true);

drop policy if exists dept_min_write on public.minimalna_zasedba;
CREATE POLICY dept_min_write ON public.minimalna_zasedba TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists duty_doctors_select on public.dezurni_zdravniki;
CREATE POLICY duty_doctors_select ON public.dezurni_zdravniki FOR SELECT TO authenticated USING (true);

drop policy if exists duty_doctors_write on public.dezurni_zdravniki;
CREATE POLICY duty_doctors_write ON public.dezurni_zdravniki TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists employee_wishes_delete on public.zelje_zaposlenih;
CREATE POLICY employee_wishes_delete ON public.zelje_zaposlenih FOR DELETE TO authenticated USING ((public.current_role_is('admin'::text) OR (created_by = auth.uid())));

drop policy if exists employee_wishes_insert on public.zelje_zaposlenih;
CREATE POLICY employee_wishes_insert ON public.zelje_zaposlenih FOR INSERT TO authenticated WITH CHECK ((public.current_role_is('admin'::text) OR public.current_role_is('vodja'::text) OR ((profile_id = auth.uid()) AND (department_code = public.current_department()))));

drop policy if exists employee_wishes_select on public.zelje_zaposlenih;
CREATE POLICY employee_wishes_select ON public.zelje_zaposlenih FOR SELECT TO authenticated USING ((public.current_role_is('admin'::text) OR public.current_role_is('vodja'::text) OR (department_code = public.current_department())));

drop policy if exists employee_wishes_update on public.zelje_zaposlenih;
CREATE POLICY employee_wishes_update ON public.zelje_zaposlenih FOR UPDATE TO authenticated USING ((public.current_role_is('admin'::text) OR (created_by = auth.uid()))) WITH CHECK ((public.current_role_is('admin'::text) OR ((created_by = auth.uid()) AND public.current_role_is('vodja'::text)) OR ((created_by = auth.uid()) AND (department_code = public.current_department()) AND (full_name = ( SELECT profili.full_name
   FROM public.profili
  WHERE (profili.id = auth.uid()))))));

drop policy if exists lead_departments_select on public.nosilci_oddelkov;
CREATE POLICY lead_departments_select ON public.nosilci_oddelkov FOR SELECT TO authenticated USING (true);

drop policy if exists lead_departments_write_admin on public.nosilci_oddelkov;
CREATE POLICY lead_departments_write_admin ON public.nosilci_oddelkov TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists leave_balance_history_admin_write on public.zgodovina_stanja_dopusta;
CREATE POLICY leave_balance_history_admin_write ON public.zgodovina_stanja_dopusta TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists leave_balance_history_select on public.zgodovina_stanja_dopusta;
CREATE POLICY leave_balance_history_select ON public.zgodovina_stanja_dopusta FOR SELECT TO authenticated USING ((public.current_role_is('admin'::text) OR (profile_id = auth.uid())));

drop policy if exists leave_entries_log_select on public.dnevnik_odsotnosti;
CREATE POLICY leave_entries_log_select ON public.dnevnik_odsotnosti FOR SELECT TO authenticated USING (public.current_role_is('admin'::text));

drop policy if exists leave_entries_select on public.odsotnosti;
CREATE POLICY leave_entries_select ON public.odsotnosti FOR SELECT TO authenticated USING (true);

drop policy if exists leave_entries_write on public.odsotnosti;
CREATE POLICY leave_entries_write ON public.odsotnosti TO authenticated USING ((public.current_role_is('admin'::text) OR (public.imena_se_ujemata(full_name, public.current_full_name()) AND public.leave_entry_rok_odprt(work_date)))) WITH CHECK ((public.current_role_is('admin'::text) OR (public.imena_se_ujemata(full_name, public.current_full_name()) AND public.leave_entry_rok_odprt(work_date))));

drop policy if exists notif_settings_select on public.nastavitve_obvestil;
CREATE POLICY notif_settings_select ON public.nastavitve_obvestil FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR public.current_role_is('admin'::text)));

drop policy if exists notif_settings_update on public.nastavitve_obvestil;
CREATE POLICY notif_settings_update ON public.nastavitve_obvestil FOR UPDATE TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));

drop policy if exists notif_settings_upsert on public.nastavitve_obvestil;
CREATE POLICY notif_settings_upsert ON public.nastavitve_obvestil FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

drop policy if exists notifications_select on public.obvestila;
CREATE POLICY notifications_select ON public.obvestila FOR SELECT TO authenticated USING ((user_id = auth.uid()));

drop policy if exists notifications_update_own on public.obvestila;
CREATE POLICY notifications_update_own ON public.obvestila FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

drop policy if exists obrazci_dnevnik_select on public.obrazci_dnevnik;
CREATE POLICY obrazci_dnevnik_select ON public.obrazci_dnevnik FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.obrazci o
  WHERE ((o.id = obrazci_dnevnik.obrazec_id) AND ((o.vlagatelj_id = auth.uid()) OR (o.sodelavec_id = auth.uid()) OR (o.vodja_id = auth.uid()) OR public.current_role_is('admin'::text))))));

drop policy if exists obrazci_insert on public.obrazci;
CREATE POLICY obrazci_insert ON public.obrazci FOR INSERT TO authenticated WITH CHECK (((vlagatelj_id = auth.uid()) AND (status = 'osnutek'::text)));

drop policy if exists obrazci_select on public.obrazci;
CREATE POLICY obrazci_select ON public.obrazci FOR SELECT TO authenticated USING (((vlagatelj_id = auth.uid()) OR (sodelavec_id = auth.uid()) OR (vodja_id = auth.uid()) OR public.current_role_is('admin'::text) OR public.current_is_koordinator() OR ((vrsta = 'menjava_sluzbe'::text) AND (status <> 'osnutek'::text) AND (date_trunc('month'::text, (((polja ->> 'datum_a'::text))::date)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))));

drop policy if exists profile_departments_admin_write on public.pokriva_oddelek;
CREATE POLICY profile_departments_admin_write ON public.pokriva_oddelek TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists profile_departments_select on public.pokriva_oddelek;
CREATE POLICY profile_departments_select ON public.pokriva_oddelek FOR SELECT TO authenticated USING (true);

drop policy if exists profile_hr_details_admin_write on public.kadrovski_podatki;
CREATE POLICY profile_hr_details_admin_write ON public.kadrovski_podatki TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists profile_hr_details_select on public.kadrovski_podatki;
CREATE POLICY profile_hr_details_select ON public.kadrovski_podatki FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR public.current_role_is('admin'::text)));

drop policy if exists profiles_log_select_admin on public.dnevnik_profilov;
CREATE POLICY profiles_log_select_admin ON public.dnevnik_profilov FOR SELECT TO authenticated USING (public.current_role_is('admin'::text));

drop policy if exists profiles_select on public.profili;
CREATE POLICY profiles_select ON public.profili FOR SELECT TO authenticated USING (true);

drop policy if exists profiles_update_admin on public.profili;
CREATE POLICY profiles_update_admin ON public.profili FOR UPDATE TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists push_subscriptions_own on public.potisne_narocnine;
CREATE POLICY push_subscriptions_own ON public.potisne_narocnine TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));

drop policy if exists schedule_entries_log_select_admin on public.dnevnik_razporeda;
CREATE POLICY schedule_entries_log_select_admin ON public.dnevnik_razporeda FOR SELECT TO authenticated USING (public.current_role_is('admin'::text));

drop policy if exists schedule_select on public.razpored;
CREATE POLICY schedule_select ON public.razpored FOR SELECT TO authenticated USING (true);

drop policy if exists schedule_write_admin on public.razpored;
CREATE POLICY schedule_write_admin ON public.razpored TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists swap_select on public.zahtevki_za_menjavo;
CREATE POLICY swap_select ON public.zahtevki_za_menjavo FOR SELECT TO authenticated USING (((requester_id = auth.uid()) OR (target_id = auth.uid()) OR public.current_role_is('admin'::text) OR public.current_is_koordinator() OR (public.current_role_is('vodja'::text) AND (public.current_department() = ( SELECT profili.department_code
   FROM public.profili
  WHERE (profili.id = zahtevki_za_menjavo.requester_id))))));


ALTER TABLE public.nadomescanja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nzv_nastavitve ENABLE ROW LEVEL SECURITY;

drop policy if exists nadomescanja_select on public.nadomescanja;
CREATE POLICY nadomescanja_select ON public.nadomescanja FOR SELECT TO authenticated USING (true);

drop policy if exists nadomescanja_write on public.nadomescanja;
CREATE POLICY nadomescanja_write ON public.nadomescanja TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));

drop policy if exists nzv_nastavitve_select on public.nzv_nastavitve;
CREATE POLICY nzv_nastavitve_select ON public.nzv_nastavitve FOR SELECT TO authenticated USING (true);

drop policy if exists nzv_nastavitve_write on public.nzv_nastavitve;
CREATE POLICY nzv_nastavitve_write ON public.nzv_nastavitve TO authenticated USING (public.current_role_is('admin'::text)) WITH CHECK (public.current_role_is('admin'::text));


-- =====================================================================
-- 9. ZAČETNI PODATKI (Seed)
-- ---------------------------------------------------------------------
-- Šele tu, ko tabele, ključi in funkcije obstajajo. Vsi vnosi so
-- idempotentni (on conflict), zato ponoven zagon ničesar ne podvoji.
-- =====================================================================

insert into public.oddelki (code, name) values
  ('B',  'B – oddelek'),
  ('C',  'C – oddelek'),
  ('C1', 'C1 – oddelek'),
  ('D',  'D – oddelek'),
  ('E1', 'E1 – oddelek'),
  ('E2', 'E2 – oddelek'),
  ('DEZ',   'Dežurni kader (DMS/DZN)'),
  ('NEDEZ', 'Nedežurni kader (DMS/DZN)'),
  -- Dodatne kode enot, ki jih vodijo nosilci oddelkov/vodje (iz
  -- "Predloga razporeda vodje NZV") – ločeno od kod zgoraj, ker gre za
  -- vodstveno pokritost enote, ne za SMS/ZZT izmenski kalup.
  ('PDZN', 'PDZN – pomočnik direktorja za ZN'),
  ('SOBO', 'SOBO'),
  ('ZO',   'ŽO'),
  ('MO',   'MO'),
  ('PO',   'PO'),
  ('A',    'A – oddelek'),
  ('B1B2', 'B1, B2'),
  ('DB',   'DB'),
  ('SA',   'SA'),
  ('URGENCA', 'Urgenca'),
  ('U2',   'U2')
on conflict (code) do update set name = excluded.name;


do $$
begin
  -- Po obliki, ne po imenu: baza izpred preimenovanja ima ta tuji ključ
  -- pod imenom profiles_department_code_fkey, novejša pod
  -- profili_department_code_fkey. Preverjanje po imenu je tu ustvarilo
  -- drugega, vsebinsko enakega - in s tem prav dvoumnost, ki je razbila
  -- Imenik.
  if not public.tuji_kljuc_ze_obstaja(
       'public.profili', array['department_code'], 'public.oddelki') then
    alter table public.profili
      add constraint profili_department_code_fkey
      foreign key (department_code) references public.oddelki (code) on update cascade;
  end if;
end $$;


-- Enkratna migracija: če v tej bazi zaradi ročnega urejanja v Table
-- Editorju obstaja ločen stolpec "Admin" (z veliko začetnico, namesto
-- prave vloge v "role"), prenesi njegovo vrednost v "role" in stolpec
-- odstrani. Koda (ta datoteka, login.html, admin.html, menjave.html,
-- supabase-client.js) povsod dosledno uporablja "role" – to ostaja
-- edino veljavno ime, "Admin" ni nikjer v kodi referenciran.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profili' and column_name = 'Admin'
  ) then
    execute 'update public.profili set role = "Admin" where "Admin" is not null';
    execute 'alter table public.profili drop column "Admin"';
  end if;
end $$;


-- Enkraten popravek za profile, ustvarjene PRED to spremembo (sprožilec
-- spodaj odslej sam vpiše e-pošto ob registraciji; za obstoječe jo je
-- treba prekopirati iz auth.users, ki ni neposredno vidna odjemalcem).
update public.profili p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;


-- Enkraten (idempotenten) zagon za profile, ki so department_code dobili
-- PREDEN je ta sprožilec obstajal - sprožilec sam se namreč ne požene za
-- pretekle vrstice, samo za bodoče insert/update.
insert into public.pokriva_oddelek (profile_id, department_code, sort_order)
select id, department_code, 0 from public.profili
where department_code is not null
on conflict (profile_id, department_code) do nothing;


-- Opomba k spodnjemu seznamu (22 vodij/nosilcev): department_code/enote/
-- inicialke/mat_st/letni_dopust_dni so uskladjeni na novejši vir "Zaposleni
-- - Oddelki" (glej opombo ob stolpcih zgoraj); Misotič Rebeka in Sofrić
-- Nikolina v tem viru nista bili navedeni, zato ostajata na prvotnih
-- vrednostih (mat_st zanju je iz kadrovskega izvoza "Seznam zaposlenih ZN").
-- Priimek "Lelič" (ne "Lelić") je uradni zapis, preverjen proti e-pošti
-- dijana.lelic@pb-begunje.si.
insert into public.nosilci_oddelkov
  (full_name, inicialke, mat_st, department_code, enote, letni_dopust_dni,
   dezurstvo_dovoljeno, max_mesecno, samo_med_tednom, delovnik, ur_na_dan,
   odsotnost_tip, odsotnost_do, nadomesca, opomba)
values
  ('ALUKIĆ DINO', 'ALU', '823', 'ZO', 'ŽO', 12, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'BOJIĆ MATEJ', 'ob odsotnosti (LD, BS) nadomeščanje Bojić Matej'),
  ('ARNEŽ GREGA', 'ARN', '1092', 'C', 'C', 27, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'LUNAR MATEJA', 'ob odsotnosti (LD, BS) nadomeščanje Lunar Mateja'),
  ('BIZJAK TEA', 'BIZ', '989', 'URGENCA', 'UA/SA/B2', 8, false, null, false, 'dopoldne/popoldne', 6, null, null, null, 'delo po 6 ur'),
  ('BOJIĆ MATEJ', 'BOJ', '855', 'MO', 'MO', 25, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ALUKIĆ DINO', 'ob odsotnosti (LD, BS) nadomeščanje Dino Alukić'),
  ('DŽAMASTAGIĆ DENIS', 'DŽA', '912', 'PDZN', 'PDZN', 19, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ALUKIĆ DINO', 'Pomočnik direktorja za zdravstveno nego; ob odsotnosti nadomeščanje Dino Alukić, nato Matej Bojić'),
  ('HROVAT NINA', 'HRO', '820', 'DB', 'DB', 23, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'TORKAR TANJA', 'ob odsotnosti (LD, BS) nadomeščanje Torkar Tanja'),
  ('HUMAR SAŠA', 'HUM', '705', 'SA', 'SA', 32, false, null, false, 'dopoldne/popoldne', null, null, null, 'BIZJAK TEA', 'ob odsotnosti (LD, BS) nadomeščanje Bizjak Tea, nato Trpin Saša'),
  ('LELIČ DIJANA', 'LEL', '1090', 'E2', 'E2', 20, false, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('LUNAR MATEJA', 'LUN', '844', 'B', 'B', 28, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ARNEŽ GREGA', 'ob odsotnosti (LD, BS) nadomeščanje Arnež Grega'),
  ('MAGLIĆ ALEKSANDER', 'MAG', '1001', 'E1', 'E1', 18, false, null, false, 'dopoldne 7.00-15.30', null, null, null, 'LELIČ DIJANA', 'ob odsotnosti (LD, BS) nadomeščanje Dijana Lelić'),
  ('MAVRI TRATNIK MAGDALENA', 'TRA', '833', 'B1B2', 'B1', 29, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'ŠUBIC PETRA', 'ob odsotnosti (LD, BS) nadomeščanje Šubic Petra'),
  ('MISOTIČ REBEKA', null, '1163', 'C', null, null, false, null, false, 'dopoldne/popoldne', null, null, null, null, null),
  ('MUŠIČ INES', 'MUŠ', '926', 'URGENCA', 'UA/SA', 27, false, null, false, 'dopoldne', 7, null, null, null, 'delo po 7 ur'),
  ('PERVIZ AMAL', 'PER', '887', 'D', 'D', 12, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAGLIĆ ALEKSANDER', 'ob odsotnosti (LD, BS) nadomeščanje Aleksander Maglić'),
  ('POGAČNIK TEJA', 'POG', '1058', 'E1', 'E1', 35, false, null, false, 'dopoldne 7.00-15.30', null, 'porodniška', '2027-07-31', null, 'trenutno porodniška - do julij 2027'),
  ('SALKIĆ MARUŠA', 'SAL', '925', 'C1', 'C1', 19, true, 1, true, 'dopoldne 7.00-15.30', null, null, null, null, '1x dežurstvo na mesec med tednom'),
  ('SOFRIĆ NIKOLINA', null, '1174', 'E2', null, null, false, null, false, 'dopoldne/popoldne', null, null, null, null, null),
  ('ŠUBIC PETRA', 'ŠUB', '905', 'B1B2', 'B1', 28, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'MAVRI TRATNIK MAGDALENA', 'ob odsotnosti (LD, BS) nadomeščanje Magdalena Mavri Tratnik'),
  -- Nosilka enote A IN enote PO (uporabnikova navedba, avgust 2026) - PO
  -- doslej ni imela nobenega nosilca, zato je stolpec v NZV mreži ostajal
  -- prazen.
  ('TOMAŽEVIČ SIMONA', 'TOM', '793', 'A', 'A/PO', 37, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'VELUŠČEK METKA', 'ob odsotnosti (LD, BS) nadomeščanje Velušček Metka'),
  ('TORKAR TANJA', 'TOR', '965', 'DB', 'DB', 23, true, null, false, 'dopoldne 7.00-15.30', null, null, null, 'HROVAT NINA', 'ob odsotnosti (LD, BS) nadomeščanje Hrovat Nina'),
  ('TRPIN SAŠA', 'TRP', '870', 'URGENCA', 'UA/SA', 17, true, 1, true, 'dopoldne 7.00-15.30', null, null, null, 'BIZJAK TEA', 'ob odsotnosti (LD, BS) Bizjak Tea, Musić Ines'),
  ('VELUŠČEK METKA', 'VEL', '834', 'SOBO', 'SOBO', 41, true, 2, false, 'dopoldne 7.00-15.30', null, null, null, 'DŽAMASTAGIĆ DENIS', 'ob odsotnosti (LD, BS) nadomeščanje Džamastagić Denis')
on conflict (full_name) do update set
  inicialke = coalesce(excluded.inicialke, public.nosilci_oddelkov.inicialke),
  mat_st = coalesce(excluded.mat_st, public.nosilci_oddelkov.mat_st),
  department_code = excluded.department_code,
  enote = coalesce(excluded.enote, public.nosilci_oddelkov.enote),
  letni_dopust_dni = coalesce(excluded.letni_dopust_dni, public.nosilci_oddelkov.letni_dopust_dni),
  dezurstvo_dovoljeno = excluded.dezurstvo_dovoljeno,
  max_mesecno = excluded.max_mesecno,
  samo_med_tednom = excluded.samo_med_tednom,
  delovnik = excluded.delovnik,
  ur_na_dan = excluded.ur_na_dan,
  odsotnost_tip = excluded.odsotnost_tip,
  odsotnost_do = excluded.odsotnost_do,
  nadomesca = excluded.nadomesca,
  opomba = excluded.opomba;


-- Enkraten popravek: starejši zagon te datoteke je morda ustvaril vrstico
-- "LELIĆ DIJANA" (Ć), preden je bil znan pravilen zapis "LELIČ DIJANA" (Č,
-- glej opombo zgoraj) - brez tega bi po tej spremembi obstajali DVE vrstici
-- za isto osebo (primary key je full_name, torej dobesedno besedilo).
delete from public.nosilci_oddelkov
where full_name = 'LELIĆ DIJANA'
  and exists (select 1 from public.nosilci_oddelkov where full_name = 'LELIČ DIJANA');


-- Enkratna zasnovna vrednost = isti podatek, ki je bil doslej trdo kodiran
-- v WARDS_META (izpeljan iz analize dejanskega razporeda, glej
-- roster/analiza-razporedov.md). "and rotation_slot is null" naredi to
-- varno za ponovni zagon: ne prepiše ročnega popravka, ki ga admin naredi
-- pozneje v Imeniku.
update public.profili p set rotation_slot = v.slot
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


-- Enkratna zasnovna vrednost = isti podatek, ki je bil doslej trdo kodiran
-- v DEZURNI_ZACETNO. "coalesce(obstoječe, novo)" v update delu naredi to
-- varno za ponovni zagon: ne prepiše poznejšega ročnega popravka.
insert into public.kadrovski_podatki (profile_id, duty_min_monthly, duty_max_monthly, duty_day_off, duty_weekdays_only)
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
join public.profili p on (
  select string_agg(d, ' ' order by d)
  from unnest(string_to_array(upper(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')), ' ')) d
) = (
  select string_agg(d, ' ' order by d)
  from unnest(string_to_array(upper(v.full_name), ' ')) d
)
on conflict (profile_id) do update set
  duty_min_monthly = coalesce(public.kadrovski_podatki.duty_min_monthly, excluded.duty_min_monthly),
  duty_max_monthly = coalesce(public.kadrovski_podatki.duty_max_monthly, excluded.duty_max_monthly),
  duty_day_off = coalesce(public.kadrovski_podatki.duty_day_off, excluded.duty_day_off),
  duty_weekdays_only = coalesce(public.kadrovski_podatki.duty_weekdays_only, excluded.duty_weekdays_only);


-- ---------------------------------------------------------------------
-- =====================================================================
-- 9b) NZV: nadomescanja med nosilci enot + nastavitve NZV pogleda
-- ---------------------------------------------------------------------
-- Vsebina prenesena iz supabase/nzv-nadomescanja.sql, nzv-nadomescanja-
-- poleg-svoje.sql in nzv-nastavitve.sql. Konsolidacija teh treh datotek
-- ni zajela, zato je v novi bazi tabel ni bilo - index.html in admin.html
-- pa ju bereta (NZV pogled, urejanje nadomescanj).
--
-- poleg_svoje: true = nadomescevalec obdrzi svojo enoto in pokrije se
-- enoto odsotnega (Bojic: MO + ZO); false = preseli se na enoto odsotnega,
-- svojo pa odda naslednjemu v verigi (Arnez: s C na C1, C prevzame Lunar).
-- =====================================================================

insert into public.nadomescanja (nosilec, nadomesca, enota, prednost, poleg_svoje) values
  ('ALUKIĆ DINO', 'BOJIĆ MATEJ', 'ŽO', 1, true),
  ('ALUKIĆ DINO', 'DŽAMASTAGIĆ DENIS', 'ŽO', 2, true),
  ('ARNEŽ GREGA', 'LUNAR MATEJA', 'C', 1, false),
  ('BIZJAK TEA', 'TRPIN SAŠA', 'UA/SA/B2', 1, false),
  ('BIZJAK TEA', 'MUŠIČ INES', 'UA/SA/B2', 2, false),
  ('BOJIĆ MATEJ', 'ALUKIĆ DINO', 'MO', 1, true),
  ('BOJIĆ MATEJ', 'DŽAMASTAGIĆ DENIS', 'MO', 2, true),
  ('DŽAMASTAGIĆ DENIS', 'ALUKIĆ DINO', 'PDZN', 1, true),
  ('DŽAMASTAGIĆ DENIS', 'BOJIĆ MATEJ', 'PDZN', 2, true),
  ('HROVAT NINA', 'TORKAR TANJA', 'DB', 1, false),
  ('HUMAR SAŠA', 'BIZJAK TEA', 'SA', 1, false),
  ('HUMAR SAŠA', 'TRPIN SAŠA', 'SA', 2, false),
  ('LELIČ DIJANA', 'MAGLIĆ ALEKSANDER', 'E2', 1, false),
  ('LUNAR MATEJA', 'ARNEŽ GREGA', 'B', 1, false),
  ('MAGLIĆ ALEKSANDER', 'LELIČ DIJANA', 'E1', 1, false),
  ('MAVRI TRATNIK MAGDALENA', 'ŠUBIC PETRA', 'B1', 1, false),
  ('MUŠIČ INES', 'BIZJAK TEA', 'UA/SA', 1, false),
  ('MUŠIČ INES', 'TRPIN SAŠA', 'UA/SA', 2, false),
  ('PERVIZ AMAL', 'MAGLIĆ ALEKSANDER', 'D', 1, false),
  ('SALKIĆ MARUŠA', 'ARNEŽ GREGA', 'C1', 1, false),
  ('TOMAŽEVIČ SIMONA', 'VELUŠČEK METKA', 'A', 1, true),
  ('TORKAR TANJA', 'HROVAT NINA', 'DB', 1, false),
  ('TRPIN SAŠA', 'BIZJAK TEA', 'UA/SA', 1, false),
  ('TRPIN SAŠA', 'MUŠIČ INES', 'UA/SA', 2, false),
  ('VELUŠČEK METKA', 'DŽAMASTAGIĆ DENIS', 'SOBO', 1, true),
  ('VELUŠČEK METKA', 'ALUKIĆ DINO', 'SOBO', 2, true),
  ('VELUŠČEK METKA', 'BOJIĆ MATEJ', 'SOBO', 3, true),
  ('ŠUBIC PETRA', 'MAVRI TRATNIK MAGDALENA', 'B1', 1, false)
on conflict (nosilec, nadomesca) do update set
  enota = excluded.enota,
  prednost = excluded.prednost,
  poleg_svoje = excluded.poleg_svoje;

insert into public.nzv_nastavitve (kljuc, vrednost) values
  ('sa_liho_teden', 'dop'),
  ('sa_poletni_meseci', '7,8')
on conflict (kljuc) do nothing;

-- Maticne stevilke nosilcev enot se prepisejo iz kadrovskih podatkov in NE
-- povozijo ze vpisanih. Ujemanje imena je namenoma ohlapno (velike/male
-- crke in stresice se izenacijo), ker se tabeli prav v tem razhajata;
-- unaccent ni povsod namescen, zato translate namesto njega.
update public.nosilci_oddelkov l
   set employee_code = h.employee_code
  from public.profili p
  join public.kadrovski_podatki h on h.profile_id = p.id
 where l.employee_code is null
   and h.employee_code is not null
   and translate(upper(l.full_name), 'ČŠŽĆĐ', 'CSZCD')
       = translate(upper(p.full_name), 'ČŠŽĆĐ', 'CSZCD');


-- 17) FLEXI oddelek + minimalna_zasedba + kadrovski_podatki.employee_code
--     Del kontrolnega seznama za jutri – tri stvari, ki so bile v Google
--     Sheets predlogah (Hospital/NZV/Dežurstva, 6.8.2026) uporabljene kot
--     "osnutek"/"referenca", zdaj postanejo pravi del aplikacije.
-- ---------------------------------------------------------------------

-- FLEXI kot pravi oddelek – plavajoče osebje, ki dela v več oddelkih hkrati
-- (glej roster/analiza-razporedov.md §4). Rotacijski generator
-- (generirajKalup/WARDS_META) namerno ostaja nedotaknjen – FLEXI kader se
-- še vedno ne razporeja samodejno, to je znana, dokumentirana omejitev.
-- Novi oddelek se avtomatsko pojavi v Imeniku (dropdown bere oddelki),
-- brez sprememb UI kode.
insert into public.oddelki (code, name) values
  ('FLEXI', 'FLEXI – plavajoče osebje (več oddelkov)')
on conflict (code) do update set name = excluded.name;


insert into public.minimalna_zasedba (department_code, shift_bucket, min_dms, min_sms, min_flexi, note) values
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


-- Matična številka – enkraten seed za 68 oseb (47 SMS/TZN izmenskih delavcev
-- + 22 vodij/nosilcev oddelkov, iz "Zaposleni - SMS-DMS" in "Zaposleni -
-- Oddelki", 6.8.2026 ter kadrovskega izvoza "Seznam zaposlenih ZN - vse").
-- `kadrovski_podatki.employee_code` stolpec je že obstajal (uvožen prek HR
-- podatkov), a doslej neizpolnjen za te osebe.
--
-- Ujemanje najprej po e-pošti iz auth.users (zanesljiv, enoličen ključ v
-- kadrovskem izvozu), šele če te ni najti, po `imena_se_ujemata()` (glej
-- komentar ob funkciji zgoraj) - ker profili.full_name lahko odstopa po
-- vrstnem redu/velikosti črk od "PRIIMEK IME" seznama. Vir je kadrovska
-- evidenca in torej merodajen, zato prepiše obstoječo vrednost (ne
-- coalesce, glej prejšnjo različico te migracije) - `is distinct from` v
-- "where" samo prepreči nepotreben zapis (updated_at), kadar je vrednost
-- že enaka.
insert into public.kadrovski_podatki (profile_id, employee_code)
select
  coalesce(
    (select u.id from auth.users u where lower(u.email) = v.email limit 1),
    (select p.id from public.profili p where public.imena_se_ujemata(p.full_name, v.full_name) limit 1)
  ) as profile_id,
  v.employee_code
from (values
  ('ALUKIĆ DINO', '823', 'dino.alukic@pb-begunje.si'),
  ('ARNEŽ GREGA', '1092', 'grega.arnez@pb-begunje.si'),
  ('BAJT ANJA', '830', 'anja.bajt@pb-begunje.si'),
  ('BEĆIROVIĆ NELVEDIN', '1069', 'nelvedin.becirovic@pb-begunje.si'),
  ('BIZJAK TEA', '989', 'tea.bizjak@pb-begunje.si'),
  ('BOJIĆ MATEJ', '855', 'matej.bojic@pb-begunje.si'),
  ('BRATUŠA MARIJA', '691', 'marija.bratusa@pb-begunje.si'),
  ('DJEDOVIĆ MARK', '1172', 'mark.djedovic@pb-begunje.si'),
  ('DOLAR TOMAŽ', '747', 'tomaz.dolar@pb-begunje.si'),
  ('DŽAMASTAGIĆ DENIS', '912', 'denis.dzamastagic@pb-begunje.si'),
  ('DŽINIĆ AMIN', '826', 'amin.dzinic@pb-begunje.si'),
  ('GASHI GENTIANA', '1167', 'gentiana.gashi@pb-begunje.si'),
  ('GAZIBARA ALDIN', '1141', 'aldin.gazibara@pb-begunje.si'),
  ('HROVAT NINA', '820', 'nina.hrovat@pb-begunje.si'),
  ('HUMAR SAŠA', '705', 'sasa.humar@pb-begunje.si'),
  ('HUSEINBAŠIĆ AJLA', '1086', 'ajla.huseinbasic@pb-begunje.si'),
  ('JEREB SARA', '994', 'sara.jereb@pb-begunje.si'),
  ('KARNIČAR JURE', '1145', 'jure.karnicar@pb-begunje.si'),
  ('KODRAS NADJA', '1089', 'nadja.kodras@pb-begunje.si'),
  ('KOGOJ EVA', '1180', 'eva.kogoj@pb-begunje.si'),
  ('KVRŽIĆ MARKO', '1051', 'marko.kvrzic@pb-begunje.si'),
  ('LELIČ DIJANA', '1090', 'dijana.lelic@pb-begunje.si'),
  ('LUNAR MATEJA', '844', 'mateja.lunar@pb-begunje.si'),
  ('MAGLIĆ ALEKSANDER', '1001', 'aleksander.maglic@pb-begunje.si'),
  ('MALER ANTONINA', '971', 'antonina.maler@pb-begunje.si'),
  ('MAVRI TRATNIK MAGDALENA', '833', 'magdalena.mavri@pb-begunje.si'),
  ('MEGLIČ JAKA', '987', 'jaka.meglic@pb-begunje.si'),
  ('MISOTIČ REBEKA', '1163', 'rebeka.misotic@pb-begunje.si'),
  ('MOČNIK SIMONA', '1084', 'simona.mocnik@pb-begunje.si'),
  ('MRAVLJE UROŠ', '997', 'uros.mravlje@pb-begunje.si'),
  ('MURIĆ ALMA', '964', 'alma.muric@pb-begunje.si'),
  ('MUŠIĆ ALEN', '1109', 'alen.music@pb-begunje.si'),
  ('MUŠIČ INES', '926', 'ines.music@pb-begunje.si'),
  ('NUHANOVIĆ MERIMA', '909', 'merima.nuhanovic@pb-begunje.si'),
  ('PERVIZ AMAL', '887', 'amal.perviz@pb-begunje.si'),
  ('PETERMAN RENATA', '818', 'renata.peterman@pb-begunje.si'),
  ('POGAČNIK MATEJ', '1075', 'matej.pogacnik@pb-begunje.si'),
  ('POGAČNIK TEJA', '1058', 'teja.pogacnik@pb-begunje.si'),
  ('RANT LUKA', '1072', 'luka.rant@pb-begunje.si'),
  ('REJC JANA', '973', 'jana.rejc@pb-begunje.si'),
  ('REKIĆ ELMA', '1106', 'elma.rekic@pb-begunje.si'),
  ('ROZMAN ANKA', '715', 'anka.rozman@pb-begunje.si'),
  ('ROZMAN KLARA', '1062', 'klara.rozman@pb-begunje.si'),
  ('SALKIĆ MARUŠA', '925', 'marusa.salkic@pb-begunje.si'),
  ('SMOLEJ NATAŠA', '1133', 'natasa.smolej@pb-begunje.si'),
  ('SODJA BARBARA', '1073', 'barbara.sodja@pb-begunje.si'),
  ('SOFRIĆ NIKOLINA', '1174', 'nikolina.sofric@pb-begunje.si'),
  ('STARC ERIK', '1164', 'erik.starc@pb-begunje.si'),
  ('SUŠNIK JAKA', '1022', 'jaka.susnik@pb-begunje.si'),
  ('SVETINA ROBERT', '633', 'robert.svetina@pb-begunje.si'),
  ('SVETINA SABINA', '676', 'sabina.svetina@pb-begunje.si'),
  ('TALIĆ AMIRA', '1159', 'amira.talic@pb-begunje.si'),
  ('TOMAŠIĆ NIKOLINA', '1035', 'nikolina.tomasic@pb-begunje.si'),
  ('TOMAŽEVIČ SIMONA', '793', 'simona.tomazevic@pb-begunje.si'),
  ('TORKAR TANJA', '965', 'tanja.torkar@pb-begunje.si'),
  ('TRPIN SAŠA', '870', 'sasa.trpin@pb-begunje.si'),
  ('URANKER MOJCA', '604', 'mojca.uranker@pb-begunje.si'),
  ('VALJAVEC ENEJ', '1102', 'enej.valjavec@pb-begunje.si'),
  ('VELUŠČEK METKA', '834', 'metka.veluscek@pb-begunje.si'),
  ('VOLARIČ NEJC', '865', 'nejc.volaric@pb-begunje.si'),
  ('VOVK URŠKA', '657', 'urska.vovk@pb-begunje.si'),
  ('VOZEL DEJAN', '991', 'dejan.vozel@pb-begunje.si'),
  ('VOZEL NEJA', '1179', 'neja.vozel@pb-begunje.si'),
  ('VREVC MAJA', '974', 'maja.miljkovic@pb-begunje.si'),
  ('ZEKAN ALMEDIN', '852', 'almedin.zekan@pb-begunje.si'),
  ('ŠABIĆ SEBINA', '1152', 'sebina.sabic@pb-begunje.si'),
  ('ŠKANTAR MARK', '963', 'mark.skantar@pb-begunje.si'),
  ('ŠUBIC PETRA', '905', 'petra.subic@pb-begunje.si')
) as v(full_name, employee_code, email)
where coalesce(
    (select u.id from auth.users u where lower(u.email) = v.email limit 1),
    (select p.id from public.profili p where public.imena_se_ujemata(p.full_name, v.full_name) limit 1)
  ) is not null
on conflict (profile_id) do update set
  employee_code = excluded.employee_code,
  updated_at = now()
where public.kadrovski_podatki.employee_code is distinct from excluded.employee_code;


-- ---------------------------------------------------------------------
-- 18) Oddelek/vloga po e-pošti – dopolnilo k skripte/uvoz-racunov.mjs
--     Ta skripta samo ustvari Auth račune (prazen department_code, role
--     privzeto 'user'); ta blok jih takoj po tem samodejno izpolni za
--     osebe, kjer je vir (roster/zaposleni-vloge-gesla.csv) nedvoumen.
--     Ujemanje po e-pošti (ne po imenu) – bolj zanesljivo, ker e-pošto
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
--     dopolnjen iz že obstoječe tabele (10) nosilci_oddelkov – ta natančno
--     pozna njihov "domači" oddelek (isti vir, ki že polni Statistiko/Vodje).
--
--     Tri osebe, ki jim noben vir ni dal konkretnega oddelka (Zaplotnik
--     Alenka, Balek Mija, Sejdinović Mustafa), so 13. 8. 2026 zapustile
--     bolnišnico in so iz tega seznama odstranjene – skupaj s Stare Luko.
--     Za njihov izbris iz obstoječe baze glej supabase/odstrani-zaposlene.sql.
--     Za "FLEXI/<oddelek>" zapise je department_code=
--     'FLEXI' (primarni), spodnji drugi insert pa doda njihov "domači"
--     oddelek kot SEKUNDARNO članstvo prek pokriva_oddelek (oseba je
--     hkrati FLEXI in npr. E2/C/A).
-- ---------------------------------------------------------------------
update public.profili p set
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
insert into public.pokriva_oddelek (profile_id, department_code, sort_order)
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
join public.profili p on lower(p.email) = v.email
on conflict (profile_id, department_code) do nothing;


-- ---------------------------------------------------------------------
-- 20) Enkraten popravek: full_name je bil za te 3 admin račune dobesedno
--     enak e-pošti namesto pravega imena (handle_new_user() je verjetno
--     padel nazaj na e-pošto, ker takrat ni dobil pravih metapodatkov o
--     imenu – glej tudi popravek uvoza v imenik.html, ki to od zdaj naprej
--     prepreči za bodoče uvoze). "coalesce" ni potreben - te tri vrednosti
--     so bile potrjeno napačne (enake e-pošti), zato je varno prepisati.
-- ---------------------------------------------------------------------
update public.profili p set full_name = v.full_name
from (values
  ('matej.bojic@pb-begunje.si', 'BOJIĆ MATEJ'),
  ('denis.dzamastagic@pb-begunje.si', 'DŽAMASTAGIĆ DENIS'),
  ('dino.alukic@pb-begunje.si', 'ALUKIĆ DINO')
) as v(email, full_name)
where lower(p.email) = v.email and p.full_name = p.email;


update public.profili set is_koordinator = true where lower(email) = 'denis.dzamastagic@pb-begunje.si';


-- ---------------------------------------------------------------------
-- 23) NZV kot oddelek za razporede (vodje + admin) – na izrecno željo so
--     oddelki za KREIRANJE/GENERIRANJE RAZPOREDA odslej izključno:
--     B, C, C1, D, E1, E2, FLEXI (vsi z vlogo 'user') in NZV (vsi z vlogo
--     'vodja' ali 'admin', vključno z dežurstvi – glej admin.html "NZV"
--     zavihek, ki združi obstoječa Vodje+Dežurstva na eno mesto, logika
--     generiranja ostane nespremenjena). FLEXI je bil dodan že v sekciji
--     17 in ostaja ročno voden bazen brez samodejnega kalupa (namerna,
--     na izrecno željo potrjena odločitev).
--
--     Namenoma NE brišemo/ne diramo starih department kod (DEZ, NEDEZ,
--     PDZN, SOBO, ZO, MO, PO, A, B1B2, DB, SA, URGENCA, U2) iz tabele
--     oddelki – obstoječi razpored (že objavljeni razporedi
--     vodij/dežurstev, NOT NULL FK na oddelki) jih zgodovinsko
--     referencira; izbris bi ali padel na FK omejitvi ali (če bi ga na
--     silo izvedli) uničil zgodovino že objavljenih razporedov, česar
--     nimam možnosti preveriti brez neposrednega dostopa do žive baze.
--     Namesto tega jih aplikacija preprosto preneha PONUJATI za novo
--     dodeljevanje (glej RAZPORED_ODDELKI konstante v admin.html/
--     imenik.html/zelje.html) – obstoječi profili s staro kodo ostanejo
--     nedotaknjeni, dokler jih admin ročno ne popravi v Imeniku (na
--     izrecno željo uporabnika – "naknadno bom popravil").
-- ---------------------------------------------------------------------
insert into public.oddelki (code, name) values
  ('NZV', 'NZV – vodje in administratorji (vključno z dežurstvi)')
on conflict (code) do update set name = excluded.name;


-- zelje_zaposlenih: "VODJE" preimenovan v "NZV" (ista skupina, novo ime,
-- usklajeno z zgornjim modelom) – najprej podatki, nato CHECK.
update public.zelje_zaposlenih set department_code = 'NZV' where department_code = 'VODJE';


-- ---------------------------------------------------------------------
-- 30) Sled avtorstva preživi izbris osebe
-- ---------------------------------------------------------------------
-- Kdo je vnesel/odobril, ni lastništvo, ampak sled. Ko oseba zapusti
-- bolnišnico in se njen račun izbriše, mora zapis ostati – samo brez
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
    where c.contype = 'f' and c.confrelid = 'public.profili'::regclass
      and c.confdeltype = 'a'   -- 'a' = no action (privzeto, blokira izbris)
      and (c.conrelid, a.attname) in (
        ('public.razpored'::regclass, 'created_by'),
        ('public.razpored'::regclass, 'updated_by'),
        ('public.dnevnik_razporeda'::regclass, 'changed_by'),
        ('public.dnevnik_profilov'::regclass, 'changed_by'),
        ('public.zahtevki_za_menjavo'::regclass, 'lead_id'),
        ('public.zahtevki_za_menjavo'::regclass, 'admin_id')
      )
  loop
    execute format('alter table %s drop constraint %I', v.tabela, v.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.profili (id) on delete set null',
                   v.tabela, v.conname, v.stolpec);
  end loop;
end $$;


-- Enkraten zagon za obstoječe vrstice (sprožilec zgoraj velja šele za
-- bodoče insert/update) - isto pravilo, ki ga uveljavlja sprožilec.
update public.profili
set full_name = initcap(full_name)
where full_name is not null
  and full_name <> ''
  and full_name = upper(full_name)
  and full_name <> initcap(full_name);

