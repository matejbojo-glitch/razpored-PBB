-- ---------------------------------------------------------------------
-- Čiščenje imen v dezurni_zdravniki (uradni dokument "Razporeditev
-- zaposlenih v UA in DEŽ").
--
-- Zakaj: uvoz iz PDF-ja je celice ponekod razlomil sredi oklepaja
-- ("(dipl. m.s.\n) Saša Trpin"), zato je v bazo prišel ostanek ") Saša
-- Trpin". Tako ime se ni ujelo z nobenim profilom in je bilo dežurstvo v
-- aplikaciji videti PRAZNO, čeprav je bil podatek zapisan. Isto velja za
-- naziv pred imenom ("dr. Tanja Torkar", "Dr. Lea Žmuc Veranič").
--
-- Uvoz sam je popravljen v zdrIme() (index.html), da tak ostanek ne more
-- več priti v tabelo; ta skripta počisti, kar je že zapisano.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat (drugi zagon ne spremeni ničesar).
--
-- POGOJ: v bazi mora biti novejša imena_kljuc() iz schema.sql (razdelek
-- pri handle_new_user) - ta pozna psevdonime (Horvat/Hrovat) in nazive.
-- ---------------------------------------------------------------------

-- 1. Odstrani oklepaje, nazive in vodilna ločila. Enak vrstni red kot
--    zdrIme() v index.html - obe mesti morata delati isto.
update public.dezurni_zdravniki d
set full_name = o.ime
from (
  select work_date, kind,
         btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(full_name, '\([^)]*\)', ' ', 'g'),    -- cel oklepaj
                 '\(.*$', ' '),                                       -- odprt, nezaprt oklepaj
               '(^|\s)(dr|mag|prof|spec|univ|dipl)\.\s*', ' ', 'gi'),  -- nazivi
             '^[^A-Za-zČŠŽĆĐčšžćđ]+', ''),                            -- vodilna ločila
           '\s+', ' ', 'g')) as ime                                    -- strnjeni presledki
  from public.dezurni_zdravniki
) o
where d.work_date = o.work_date and d.kind = o.kind
  and o.ime <> '' and d.full_name <> o.ime;

-- 2. Negovalni kader (kind 'sestra') ima profil v aplikaciji - ime
--    prepišemo v OBLIKO IZ IMENIKA ("Priimek Ime"), da je en sam zapis
--    osebe. Samo kadar se ujame natanko en profil; dvoumnih se ne dotikamo.
update public.dezurni_zdravniki d
set full_name = p.full_name
from public.profili p
where d.kind = 'sestra'
  and public.imena_se_ujemata(p.full_name, d.full_name)
  and d.full_name <> p.full_name
  and (select count(*) from public.profili q
       where public.imena_se_ujemata(q.full_name, d.full_name)) = 1;

-- 3. Poročilo: kaj je ostalo neujeto (te vrstice popravi ROČNO v uradnem
--    dokumentu ali v Imeniku - skripta jih namenoma ne ugiba).
select 'ostalo neujetih (kind sestra)' as kaj, count(*)::text as podrobnost
from public.dezurni_zdravniki d
where d.kind = 'sestra'
  and not exists (select 1 from public.profili p
                  where public.imena_se_ujemata(p.full_name, d.full_name))
union all
select 'NI NAJDEN PROFIL (preveri ročno)', d.work_date::text || '  ' || d.full_name
from public.dezurni_zdravniki d
where d.kind = 'sestra'
  and not exists (select 1 from public.profili p
                  where public.imena_se_ujemata(p.full_name, d.full_name))
union all
select 'POZOR: ime se ujema z več profili', d.work_date::text || '  ' || d.full_name
from public.dezurni_zdravniki d
where d.kind = 'sestra'
  and (select count(*) from public.profili p
       where public.imena_se_ujemata(p.full_name, d.full_name)) > 1
order by 1, 2;
