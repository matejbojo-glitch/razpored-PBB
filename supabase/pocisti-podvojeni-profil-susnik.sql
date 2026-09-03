-- ---------------------------------------------------------------------
-- Podvojen profil: Sušnik Jaka
--
-- V Imeniku sta se pojavila DVA profila z istim imenom:
--   OBDRŽI  jaka.susnik@pb-begunje.si  · oddelek C1 · ustvarjen 6. 8. 2026
--   ODSTRANI susnik.jaka@pb-begunje.si · brez oddelka · ustvarjen 26. 8. 2026
--
-- Zakaj tako in ne obratno - oboje izmerjeno na pravi bazi:
--   * jaka.susnik@ ima 122 vrstic v razporedu, kadrovske podatke, telefon
--     in zgodovino dopusta; susnik.jaka@ nima NOBENE vrstice nikjer;
--   * vseh ostalih 68 naslovov v aplikaciji je oblike ime.priimek@, torej
--     je jaka.susnik@ tudi po hišnem pravilu pravi zapis.
--
-- Podvojen profil ni le kozmetična napaka: ime se ujame z obema vrsticama,
-- zato uvozi in skripte, ki zahtevajo NATANKO EN profil (npr. vnesi-parafe
-- ali pocisti-dezurne-zdravnike), tako osebo tiho preskočijo.
--
-- Izbris gre prek auth.users - profili.id ima na auth.users.id "on delete
-- cascade" (schema.sql), zato profil odide z uporabnikom vred.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat (drugi zagon ne najde več česa brisati).
-- ---------------------------------------------------------------------

-- 1) Pregled pred brisanjem: kaj sploh visi na vsakem od obeh profilov.
select u.email,
       p.department_code,
       (select count(*) from public.razpored r where r.employee_id = p.id) as razpored,
       (select count(*) from public.zelje_zaposlenih z where z.profile_id = p.id) as zelje,
       (select count(*) from public.zahtevki_za_menjavo m
          where p.id in (m.requester_id, m.target_id, m.lead_id, m.admin_id)) as menjave,
       (select count(*) from public.obrazci o
          where p.id in (o.vlagatelj_id, o.sodelavec_id, o.vodja_id, o.koordinator_id)) as obrazci,
       (select count(*) from public.kadrovski_podatki k where k.profile_id = p.id) as kadrovski,
       (select count(*) from public.telefoni_kontaktov t where t.profile_id = p.id) as telefoni,
       (select count(*) from public.zgodovina_stanja_dopusta d where d.profile_id = p.id) as dopust
  from public.profili p
  join auth.users u on u.id = p.id
 where lower(u.email) in ('jaka.susnik@pb-begunje.si', 'susnik.jaka@pb-begunje.si')
 order by u.email;

-- 2) Brisanje odvečnega profila.
--    Varovalki, da skripta ob pomoti ne odnese pravega zapisa:
--      a) profil, ki ga OBDRŽIMO, mora obstajati;
--      b) odvečni profil ne sme imeti NOBENE vezane vrstice - če jo dobi,
--         brisanje ne stori nič in vrstice je treba najprej prevezati.
delete from auth.users u
 where lower(u.email) = 'susnik.jaka@pb-begunje.si'
   and exists (select 1 from auth.users k where lower(k.email) = 'jaka.susnik@pb-begunje.si')
   and not exists (select 1 from public.razpored r where r.employee_id = u.id or r.created_by = u.id or r.updated_by = u.id)
   and not exists (select 1 from public.zelje_zaposlenih z where z.profile_id = u.id)
   and not exists (select 1 from public.zahtevki_za_menjavo m
                    where u.id in (m.requester_id, m.target_id, m.lead_id, m.admin_id))
   and not exists (select 1 from public.obrazci o
                    where u.id in (o.vlagatelj_id, o.sodelavec_id, o.vodja_id, o.koordinator_id))
   and not exists (select 1 from public.kadrovski_podatki k where k.profile_id = u.id)
   and not exists (select 1 from public.telefoni_kontaktov t where t.profile_id = u.id)
   and not exists (select 1 from public.zgodovina_stanja_dopusta d where d.profile_id = u.id)
   and not exists (select 1 from public.pokriva_oddelek po where po.profile_id = u.id)
   and not exists (select 1 from public.koledarski_zetoni kz where kz.profile_id = u.id)
   and not exists (select 1 from public.profili v where v.vodja_id = u.id);

-- 3) Preveri: ostati mora ENA vrstica, jaka.susnik@ z oddelkom C1.
select u.email, p.full_name, p.department_code, p.role
  from public.profili p
  join auth.users u on u.id = p.id
 where public.imena_se_ujemata(p.full_name, 'Sušnik Jaka')
 order by u.email;
