-- =====================================================================
-- Razpored PBB – URNIK ZA OBVESCANJE (pg_cron)
--
-- Brez tega je robna funkcija "posiljaj-push" samo nalozena, a je nihce
-- ne klice: obvestila se zapisejo v bazo in so vidna v aplikaciji, na
-- telefon pa ne pridejo NIKOLI.
--
-- PRED ZAGONOM morajo biti v Supabase -> Project Settings -> Edge
-- Functions -> Secrets nastavljeni:
--     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET
-- PUSH_CRON_SECRET mora biti ENAK skrivnosti, ki je zapisana spodaj.
--
-- KAKO POGNATI: Supabase -> SQL Editor -> New query -> prilepi vse -> Run.
-- Varno je pognati veckrat (stara opravila se najprej odstranijo).
-- =====================================================================

-- 1) Razsiritvi. V Supabase ju je mogoce vklopiti tudi prek
--    Database -> Extensions; to je isto.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Ce opravili ze obstajata, ju najprej odstranimo – sicer bi se ob
--    ponovnem zagonu podvojili in obvestila bi se posiljala dvakrat.
do $$
begin
  perform cron.unschedule('posiljaj-push');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('opomniki-izmene');
exception when others then null;
end $$;

-- 3a) Dostava cakajocih obvestil – vsakih 5 minut.
--     Funkcija sama poskrbi, da se nic ne podvoji (push_sent_at /
--     email_sent_at), zato je pogost klic varen.
select cron.schedule(
  'posiljaj-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://jlvorlzvbaugjfjaodwz.supabase.co/functions/v1/posiljaj-push',
    headers := '{"Content-Type":"application/json","x-cron-secret":"84062a2c7fb2d93ae5af43044ffdc17ae493b7125ee4e8ae082b24314d0e353e"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- 3b) Opomniki za jutrisnje nocne izmene in dezurstva – vsak dan ob 17.00.
--     POZOR: pg_cron tece v UTC. 15:00 UTC = 17:00 poleti (CEST),
--     16:00 pozimi (CET). Ce zelite tocno 17.00 vse leto, je treba urnik
--     dvakrat letno rocno prestaviti – ali pa sprejeti eno uro razlike
--     pozimi, kar za opomnik dan prej ni pomembno.
select cron.schedule(
  'opomniki-izmene',
  '0 15 * * *',
  $$ select public.ustvari_opomnike_za_jutri(); $$
);

-- 4) Kontrola: obe opravili morata biti na seznamu in "active".
select jobname, schedule, active from cron.job order by jobname;
