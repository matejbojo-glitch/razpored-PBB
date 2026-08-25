-- ---------------------------------------------------------------------
-- Tretji krog iz uradnega dokumenta: dežurna dipl. m.s./zn.
--
-- Dokument "Razporeditev zaposlenih v UA in DEŽ" ima TRI stolpce:
--   Urgenca ZDR | Dežurstvo ZDR | Dežurstvo dipl. m.s./zn.
-- dezurni_zdravniki je doslej dovoljeval samo prva dva (omejitev "kind"),
-- zato se tretji ni imel kam shraniti in je ob uvozu tiho odpadel.
--
-- Kako pognati: Supabase -> SQL Editor -> prilepi vse -> Run.
-- Varno je pognati večkrat.
-- ---------------------------------------------------------------------
alter table public.dezurni_zdravniki drop constraint if exists duty_doctors_kind_check;
alter table public.dezurni_zdravniki add constraint duty_doctors_kind_check
  check (kind in ('urgenca', 'dezurstvo', 'sestra'));

-- Kontrola: koliko zapisov je po vrsti in za katere mesece.
select kind,
       count(*) as zapisov,
       min(work_date) as od,
       max(work_date) as do
from public.dezurni_zdravniki
group by kind
order by kind;
