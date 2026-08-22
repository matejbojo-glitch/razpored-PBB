-- =====================================================================
-- KONTROLA: ali je dopolnitev sheme (28, 29, 30) uspela?
-- Poženi v Supabase → SQL Editor PO tem, ko si pognal dopolnitev.
-- Vsaka vrstica mora imeti "OK".
-- =====================================================================
select 'Tabela profiles_log (revizija pravic)' as kaj,
       case when to_regclass('public.profiles_log') is not null then 'OK' else 'MANJKA' end as stanje
union all
select 'Tabela calendar_tokens (koledar)',
       case when to_regclass('public.calendar_tokens') is not null then 'OK' else 'MANJKA' end
union all
select 'Tabela notification_settings (kanali)',
       case when to_regclass('public.notification_settings') is not null then 'OK' else 'MANJKA' end
union all
select 'Stolpec calendar_tokens.enabled',
       case when exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='calendar_tokens' and column_name='enabled')
            then 'OK' else 'MANJKA' end
union all
select 'Stolpec notifications.email_sent_at',
       case when exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='notifications' and column_name='email_sent_at')
            then 'OK' else 'MANJKA' end
union all
select 'Sprozilec profiles_audit',
       case when exists (select 1 from pg_trigger where tgname='profiles_audit' and not tgisinternal)
            then 'OK' else 'MANJKA' end
union all
select 'Funkcije koledarja (3)',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname in
                  ('koledar_token','koledar_token_ponastavi','koledar_sinhronizacija')) = 3
            then 'OK' else 'MANJKA' end
union all
select 'Funkcija koledar_razpored',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='koledar_razpored') then 'OK' else 'MANJKA' end
union all
select 'Funkcija prejemniki_obvestil',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='prejemniki_obvestil') then 'OK' else 'MANJKA' end
union all
select 'RLS vklopljen na novih tabelah (3)',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relrowsecurity
                  and c.relname in ('profiles_log','calendar_tokens','notification_settings')) = 3
            then 'OK' else 'MANJKA' end;
