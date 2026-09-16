-- =====================================================================
-- Razpored PBB – NOCNA POLNA USKLADITEV Z GOOGLE SHEETS
--
-- ZAKAJ
-- Sprotna sinhronizacija sloni na dogodku iz Apps Scripta. Dogodek se
-- lahko izgubi (izpad omrezja, Googlova kvota, ugasnjen sprozilec) - in
-- takrat sprememba ne pride v aplikacijo NIKOLI, ker je nihce ne poslje
-- znova. Se huje: vstavljanja stolpca Apps Script sploh ne javi
-- (changeType = INSERT_COLUMN se preskoci), zato NOV STOLPEC - nova
-- oseba v listu - po tej poti ne pride nikoli.
--
-- Ta urnik enkrat na noc prebere VSAK povezan zavihek v celoti in ga
-- uskladi. Kar je slo skozi cez dan, se ne zapise znova (izmena brez
-- razlike ne sprozi zapisa), zato je nocni tek poceni in varen.
--
-- OPOZORILO: nova oseba mora biti NAJPREJ v Imeniku. Uskladitev oseb ne
-- ustvarja - tipkarska napaka v glavi stolpca bi sicer ustvarila
-- fantomskega zaposlenega. Neznano ime se zabelezi v sync_errors.
--
-- NZV je namenoma IZVZET: polna uskladitev NZV bi uskladila vsak dan
-- zavihka, torej tudi pobrisala vse, cesar v listu ni. Dokler NZV
-- dokument v aplikacijo ni prenesel niti ene vrstice, bi to izbrisalo
-- rocno uvozene mesece. Funkcija tak klic zavrne.
--
-- KAKO POGNATI: Supabase -> SQL Editor -> New query -> prilepi vse -> Run.
-- Varno je pognati veckrat (staro opravilo se najprej odstrani).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('sheets-nocna-uskladitev');
exception when others then null;
end $$;

-- 01:15 UTC = 03:15 poleti (CEST), 02:15 pozimi (CET). Namenoma ponoci:
-- takrat v dokumentu nihce ne dela in uskladitev ne tekmuje s cloveskim
-- urejanjem.
select cron.schedule(
  'sheets-nocna-uskladitev',
  '15 1 * * *',
  $$
  select net.http_post(
    url     := 'https://jlvorlzvbaugjfjaodwz.supabase.co/functions/v1/sheets-vhod',
    headers := '{"Content-Type":"application/json","x-sheets-secret":"c77e07a113d51c8b3e2d2f065d3cfab6ab6607f72c394893"}'::jsonb,
    body    := jsonb_build_object(
      'spreadsheet_id', p.spreadsheet_id,
      'zavihek',        p.zavihek,
      'cel_zavihek',    true
    ),
    -- Privzeti rok pg_net je 5 sekund, polna uskladitev enega zavihka pa
    -- traja dlje (list C ima 4166 celic mreze - celo leto). Brez tega bi
    -- pg_net zabelezil "Timeout of 5000 ms reached", ceprav funkcija tece
    -- naprej, in v dnevniku ne bi bilo videti, ali je uskladitev uspela.
    timeout_milliseconds := 180000
  )
  from public.sheet_connections p
  where p.aktivno
    and p.sheets_v_app
    and p.oblika in ('oddelek', 'flexi');
  $$
);

-- Kontrola: opravilo mora biti na seznamu in "active".
select jobname, schedule, active from cron.job order by jobname;
