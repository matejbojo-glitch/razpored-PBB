# Seznam zaposlenih in predlagani e-poštni naslovi

`zaposleni-emaili.csv` vsebuje vseh **72 zaposlenih**, zbranih iz treh virov:

- **47 × SMS/ZZT** — iz `Seznam_zaposlenih.xlsx` (uradni HR izvoz), združenih po
  stolpcu "Strm" (glej opozorilo spodaj — to **ni nujno isto** kot obstoječa
  razporeditev po oddelkih v `admin.html`/`zelje.html`).
- **14 × Dežurni (DMS/DZN)** — iz analize "Dežurstva 2026" (januar–september),
  z že popravljenim imenom "Horvat Nina" (prej pomotoma "Hrovat").
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

**Manjkajo v `WARDS_META` (obstajajo v uradnem seznamu, a niso v NOBENEM
oddelku v aplikaciji):** Huseinbašić A., Vozel N. (Neja — ni ista oseba kot
"Vozel D." v oddelku D), Gashi G., Kogoj E., Kvržić M., Balek M., Jereb S.,
Vrevc M., Zaplotnik A. — 9 oseb.

**V `WARDS_META`, a ne v uradnem seznamu za to skupino (Strm kodo):**
- Oddelek B ima "Svetina S.", a njena Strm koda (0000112) se ujema z
  oddelkom C, ne B.
- Oddelek D ima "Vozel D.", "Močnik S.", "Pogačnik M." — njihove Strm kode
  kažejo drugam (Močnik S. in Pogačnik M. → 0000113, isto kot C1; "Vozel D."
  ni najden v uradnem seznamu pod tem imenom sploh, obstaja pa ločeno
  "VOZEL DEJAN" v nedežurnem DMS/DZN seznamu — možna zamenjava).
- Oddelek C1 ima "Gazibara A." — te osebe sploh ni v uradnem seznamu
  SMS/ZZT zaposlenih.
- Verjetni tipkarski napaki: "Bečirović N." → uradno "Bećirović N."
  (Ć, ne Č); "Valjavec A." → uradno "Valjavec E." (Enej, ne "A").

Dokler mi ne poveš, katera razporeditev drži, `WARDS_META` in `zelje.html`
seznam SMS/ZZT oddelkov **nisem spremenil** — to bi sicer lahko napačno
razporedilo prave zaposlene v napačen oddelek/pod napačnega vodjo.
