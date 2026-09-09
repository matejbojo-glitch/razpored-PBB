-- =====================================================================
-- Razpored PBB – URNIK ZA SINHRONIZACIJO V SHEETS (pg_cron)
--
-- Brez tega je robna funkcija "sheets-izhod" samo nalozena, a je nihce
-- ne klice: spremembe razporeda se odlozijo v vrsto sheet_sync_izhod in
-- tam OSTANEJO - v Google list ne pride nikoli nic.
--
-- Smer SHEETS -> APLIKACIJA urnika NE potrebuje: tam klice Apps Script na
-- dokumentu (supabase/apps-script/sinhronizacija.gs) takoj ob spremembi.
--
-- PRED ZAGONOM morajo biti v Supabase -> Project Settings -> Edge
-- Functions -> Secrets nastavljeni:
--     GOOGLE_SERVICE_ACCOUNT_JSON, SHEETS_CRON_SECRET, SHEETS_WEBHOOK_SECRET
-- SHEETS_CRON_SECRET mora biti ENAK skrivnosti, ki jo vpises spodaj.
--
-- PRED ZAGONOM je treba pognati tudi supabase/sheets-povezave.sql in
-- supabase/sheets-sinhronizacija.sql (tabele, sprozilec, vrsta).
--
-- KAKO POGNATI: Supabase -> SQL Editor -> New query -> prilepi vse ->
-- zamenjaj TU_VPISI_SHEETS_CRON_SECRET -> Run.
-- Varno je pognati veckrat (staro opravilo se najprej odstrani).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('sheets-izhod');
exception when others then null;
end $$;

-- Enkrat na minuto - to je hkrati najmanjsi interval, ki ga pg_cron
-- podpira, in dovolj pogosto, da je razpored v listu svez. En zagon
-- naredi EN values.batchUpdate na zavihek, ne glede na to, ali v vrsti
-- caka 1 ali 300 celic; ce je vrsta prazna, se ne zgodi nic.
select cron.schedule(
  'sheets-izhod',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://jlvorlzvbaugjfjaodwz.supabase.co/functions/v1/sheets-izhod',
    headers := '{"Content-Type":"application/json","x-cron-secret":"TU_VPISI_SHEETS_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Kontrola: opravilo mora biti na seznamu in "active".
select jobname, schedule, active from cron.job where jobname = 'sheets-izhod';

-- Kaj se dogaja z vrsto:
-- select status, count(*) from public.sheet_sync_izhod group by status;
-- select vrsta, count(*), max(ustvarjeno) from public.sync_errors
--  where not resen group by vrsta order by 3 desc;
