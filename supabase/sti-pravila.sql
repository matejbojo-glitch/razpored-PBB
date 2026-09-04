-- ---------------------------------------------------------------------
-- STI (strokovno izobraževanje) - pravili, ki ju mora spoštovati VSAKA
-- pot do razporeda (generator, ročno urejanje, uvoz iz Google Sheets,
-- izvedba potrjene menjave).
--
-- Zakaj v bazi in ne samo v brskalniku: razpored piše več različnih poti.
-- Pravilo, zapisano v eni od njih, ostale tiho obidejo - prav tako se je
-- doslej zgodilo, da je oseba na bolniški vseeno pristala na izmeni.
--
-- 1) Na dan STI oseba NE more imeti delovne izmene. STI traja 8 ur;
--    kdor je na izobraževanju, tisti dan ne dela.
-- 2) Dan PRED STI oseba ne more imeti nočne izmene. Nočna se konča ob
--    06:00, izobraževanje se začne dopoldne - isti razlog kot pri
--    11-urnem počitku pred dnevno izmeno (glej PREPOVEDANE_PO_NOCNI v
--    delovni-cas.js, kjer je STI na istem seznamu).
--
-- Kaj je izmena in kaj ne, pove public.izmena_cas(): za LD/KPU/POR/STI/BS
-- ne vrne nobene vrstice. Nočno izmeno ločimo od dežurstva po tem, da se
-- konča ob 06:00 (dežurstvo ob 07:00).
--
-- Ujemanje imen gre prek public.imena_se_ujemata(), ker so odsotnosti
-- zapisane po IMENU, razpored pa po profilu (isto kot blokirani_dnevi).
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
--
-- Uporabnikova zahteva, september 2026.
-- ---------------------------------------------------------------------

-- 0) Kontrola PRED namestitvijo: če kateri od teh dveh seznamov ni prazen,
--    obstoječi razpored pravilu še ne ustreza. Sprožilec preverja samo
--    NOVE vpise, zato take vrstice ostanejo, a jih ne bo mogoče popraviti,
--    dokler se nasprotje ne razreši - zato jih je bolje videti vnaprej.
with sti as (
  select o.work_date, p.id as profile_id, p.full_name
  from public.odsotnosti o
  join public.profili p on public.imena_se_ujemata(p.full_name, o.full_name)
  where o.kind = 'sti'
)
select 'delo na dan STI' as kaj,
       coalesce(string_agg(distinct s.full_name || ' · ' || s.work_date::text || ' · ' || r.shift_code, ' | '), 'ni jih') as podrobnost
from sti s
join public.razpored r on r.employee_id = s.profile_id and r.work_date = s.work_date
where exists (select 1 from public.izmena_cas(r.shift_code))
union all
select 'nočna izmena dan PRED STI',
       coalesce(string_agg(distinct s.full_name || ' · ' || (s.work_date - 1)::text || ' · ' || r.shift_code, ' | '), 'ni jih')
from sti s
join public.razpored r on r.employee_id = s.profile_id and r.work_date = s.work_date - 1
where exists (select 1 from public.izmena_cas(r.shift_code) c where c.cez_polnoc and c.konec = time '06:00');


-- 1) Ali ima oseba tisti dan vpisano strokovno izobraževanje.
create or replace function public.ima_sti(p_profile_id uuid, p_datum date) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.odsotnosti o
    join public.profili p on p.id = p_profile_id
    where o.kind = 'sti'
      and o.work_date = p_datum
      and public.imena_se_ujemata(p.full_name, o.full_name)
  );
$$;

-- 2) Ali je šifra NOČNA izmena (N10/N11/N12) - gre čez polnoč in se konča
--    ob 06:00. Dežurstvo gre prav tako čez polnoč, a se konča ob 07:00,
--    zato ga to pravilo ne zajame.
create or replace function public.je_nocna_izmena(p_sifra text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select exists (
    select 1 from public.izmena_cas(p_sifra) c
    where c.cez_polnoc and c.konec = time '06:00'
  );
$$;

-- 3) Sprožilec: obe pravili preveri, preden vpis sploh pride v tabelo.
create or replace function public.preveri_sti_pred_vnosom() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  ime text;
begin
  -- Ni delovna izmena (prazno, LD, KPU, STI, BS ...) - ni česa preverjati.
  if not exists (select 1 from public.izmena_cas(new.shift_code)) then
    return new;
  end if;

  if public.ima_sti(new.employee_id, new.work_date) then
    select p.full_name into ime from public.profili p where p.id = new.employee_id;
    raise exception
      'Na dan % ima % vpisano strokovno izobraževanje (STI), zato ta dan ne more imeti izmene "%". Če je vnos napačen, najprej odstrani STI v Željah.',
      to_char(new.work_date, 'DD.MM.YYYY'), coalesce(ime, 'ta oseba'), new.shift_code
      using errcode = 'check_violation';
  end if;

  if public.je_nocna_izmena(new.shift_code)
     and public.ima_sti(new.employee_id, new.work_date + 1) then
    select p.full_name into ime from public.profili p where p.id = new.employee_id;
    raise exception
      '% ima % strokovno izobraževanje (STI), zato dan prej (%) ne more delati nočne izmene "%" - nočna se konča ob 06:00, izobraževanje pa se začne dopoldne.',
      coalesce(ime, 'Ta oseba'), to_char(new.work_date + 1, 'DD.MM.YYYY'),
      to_char(new.work_date, 'DD.MM.YYYY'), new.shift_code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preveri_sti on public.razpored;
CREATE TRIGGER trg_preveri_sti BEFORE INSERT OR UPDATE ON public.razpored
  FOR EACH ROW EXECUTE FUNCTION public.preveri_sti_pred_vnosom();

-- 4) Kontrola PO namestitvi: sprožilec mora obstajati.
select tgname as sprozilec, tgenabled as vklopljen
from pg_trigger where tgname = 'trg_preveri_sti';
