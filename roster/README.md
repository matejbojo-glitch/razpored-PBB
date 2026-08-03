# Seznam zaposlenih in predlagani e-poštni naslovi

Glej tudi [`analiza-razporedov.md`](analiza-razporedov.md) za novejšo analizo
(dejanski razpored 2026, preglednica dopustov/omejitev, papirni obrazec za
menjave) in [`zaposleni-vloge-gesla.csv`](zaposleni-vloge-gesla.csv) +
[`nastavi-vloge.sql`](nastavi-vloge.sql) za avtoritativne vloge/oddelke/gesla
iz `ZAPOSLENI_1.8.xlsx`.

`zaposleni-emaili.csv` vsebuje vseh **72 zaposlenih**, zbranih iz treh virov:

- **47 × SMS/ZZT** — iz `Seznam_zaposlenih.xlsx` (uradni HR izvoz), združenih po
  stolpcu "Strm" (glej opozorilo spodaj — to **ni nujno isto** kot obstoječa
  razporeditev po oddelkih v `admin.html`/`zelje.html`).
- **14 × Dežurni (DMS/DZN)** — iz analize "Dežurstva 2026" (januar–september),
  z imenom "Hrovat Nina" (glej `analiza-razporedov.md` §3 za razlago, zakaj je
  to zdaj ponovno "Hrovat", ne "Horvat").
- **11 × Nedežurni (DMS/DZN)** — obstoječi seznam iz `zelje.html`.

E-poštni naslov je oblike `ime.priimek@pb-begunje.si` (brez šumnikov,
malo tiskane črke, presledki znotraj imena/priimka odstranjeni — npr.
"Magdalena Mavri Tratnik" → `magdalena.mavritratnik@pb-begunje.si`). Preveri,
da se ujema z resnično konvencijo IT oddelka bolnišnice, preden jih uporabiš
za prava e-poštna nabiralnika ali Supabase Auth povabila — to je **predlog**,
ne preverjen obstoječ naslov.

**Kako uporabiti ta seznam:** ker nimam `service_role` ključa, ne morem sam
ustvariti Supabase Auth računov. Administrator lahko te naslove uporabi za
Supabase Dashboard → Authentication → **Invite user**, enega po enega, ali pa
jih posreduje IT oddelku za dejansko ustvarjanje poštnih nabiralnikov.

## Odprto vprašanje: razporeditev SMS/ZZT po oddelkih (B/C/C1/D/E1/E2)

Primerjava stolpca "Strm" iz uradnega `Seznam_zaposlenih.xlsx` z obstoječo
razporeditvijo v `WARDS_META` (`admin.html`) pokaže **precej neskladij** —
tega nisem popravil, ker gre za resnično razporejanje realnih zaposlenih po
oddelkih (vpliva na kalup, dopuste in na to, kdo je čigav "vodja" pri
odobritvi menjav). Če je `WARDS_META` sestavljen po fizičnem oddelku, ne po
formalni HR kodi "Strm", so spodnje razlike lahko pričakovane in nepomembne —
to lahko presodiš samo ti.

**Posodobljeno po analizi dejanskega razporeda 2026 (`analiza-razporedov.md`):**
- **Svetina S.** je **potrjena v oddelku B** (ne C, kot je nakazovala Strm
  koda) — dejanski razpored za junij 2026 jo prikazuje neposredno v ward-B
  tabeli skupaj z Rozman A., Rejc J., Dolar T., Vovk U. Prvotni opomin spodaj
  je bil torej napačen; `WARDS_META` je pravilen.
- **Pogačnik M. in Mravlje U. sta zamenjana** — dva neodvisna vira (dejanski
  razpored IN `ZAPOSLENI_1.8.xlsx`) se strinjata: Pogačnik M. je v resnici v
  C1, Mravlje U. v D (`WARDS_META` ju ima obratno). To NISEM popravil v kodi
  (še vedno gre za realno razporejanje ljudi), a gre za precej zanesljivo
  najdbo — glej `analiza-razporedov.md` §2.
- "Bečirović N." in "Valjavec A." (obstoječe črkovanje) sta se izkazala za
  verjetno PRAVILNI (dejanski razpored ju uporablja enako kot obstoječa koda);
  `ZAPOSLENI_1.8.xlsx` ima drugačno črkovanje, a je verjetno manj ažuren.

**Še vedno manjkajo v `WARDS_META`** (obstajajo v uradnem seznamu, a niso v
NOBENEM oddelku v aplikaciji): Huseinbašić A., Vozel N. (Neja — ni ista oseba
kot "Vozel D." v oddelku D), Gashi G., Kogoj E., Kvržić M., Balek M., Jereb
S., Vrevc M., Zaplotnik A. — večina od njih je po dejanskem razporedu del
**FLEXI kadra** (dela v več oddelkih, ne v enem fiksnem) — glej
`analiza-razporedov.md` §4 za arhitekturno omejitev, zakaj jih ne morem
preprosto dodati.

Dokler mi ne poveš, katera razporeditev drži, `WARDS_META` in `zelje.html`
seznam SMS/ZZT oddelkov (razen zgoraj navedenih potrjenih popravkov, ki še
niso uveljavljeni v kodi) **nisem spremenil** — to bi sicer lahko napačno
razporedilo prave zaposlene v napačen oddelek/pod napačnega vodjo.
