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

**UVELJAVLJENO v kodi** (potrjeno z realnim razporedom, na tvojo izrecno
zahtevo — glej `analiza-razporedov.md` §2 za dokaze):
- **Svetina S.** ostaja v oddelku **B** (potrjeno pravilno, Strm koda je bila
  zavajajoča).
- **Pogačnik M.** premaknjen **D → C1**, **Mravlje U.** premaknjen **C1 → D**
  (dvojno potrjeno: dejanski razpored IN `ZAPOSLENI_1.8.xlsx`).
- **Močnik S.** premaknjena **D → C** (dejanski razpored jo prikazuje med
  osnovnimi 5 v oddelku C, ne D).
- **Balek M.** dodana v oddelek **D** (prej je manjkala povsem).
- **Vozel D.** (D) in **Gazibara A.** (C1) — na izrecno željo znova dodana,
  potem ko sta bila v prejšnjem krogu odstranjena. Opozorilo velja naprej:
  dejanski razpored ju v juniju 2026 ni prikazoval kot del fiksne rotacije
  teh oddelkov, in oba imena se pojavita tudi na seznamu "Nedežurni kader" v
  `zelje.html` ("VOZEL DEJAN", "GAZIBARA ALDIN") — če gre za isto osebo, je
  zdaj vpisana dvakrat; preveri pri koordinatorju.
- "Bečirović N." in "Valjavec A." (obstoječe črkovanje) so ostali nespremenjeni
  — dejanski razpored potrjuje, da je to pravilno črkovanje.

**Kalup-črke pri premaknjenih/dodanih osebah so ocenjene**, ne 100 % zanesljive
(ujemanje 59–88 % z dejanskimi junijskimi izmenami — glej komentarje v
`admin.html` pri `WARDS_META` in `roster/kalup-ujemanje-raw.txt`). Priporočamo
hitro ročno preverbo teh štirih oseb (Pogačnik M., Mravlje U., Močnik S.,
Balek M.), preden generiran razpored zanje zaupno uporabiš.

**Še vedno niso v `WARDS_META`** (obstajajo v uradnem seznamu, a jih fiksni
5-osebni kalup model ne podpira dobro): Huseinbašić A., Vozel N. (Neja), Gashi
G., Kogoj E., Kvržić M., Jereb S., Vrevc M., Zaplotnik A. — po dejanskem
razporedu del **FLEXI kadra** (delajo v več oddelkih, ne v enem fiksnem) — glej
`analiza-razporedov.md` §4. Te osebe lahko po registraciji dodeliš oddelku
prek `admin.html` → Uporabniki (deluje za Supabase vloge/odobritve menjav), a
jih generator kalupa (WARDS_META) še ne vključuje v samodejno razporejanje.
