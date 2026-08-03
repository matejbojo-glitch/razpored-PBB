# Analiza: 2026_SMS_RAZPORED.xlsx, Letni_dopusti_in_omejitve_za_NZV.xlsx, obvestilo_spremembe_slu_baZN.docx

## 1. Kalup črke (rotacijska rotacija A–E) — diagnostika, NE uporabljeno

Iz `2026_SMS_RAZPORED.xlsx` (dejanski, podpisan razpored za junij 2026, po
oddelkih B/C/C1/D/E1/E2) sem izluščil realno zaporedje izmen za vsakega
trenutno v `WARDS_META` navedenega zaposlenega in ga primerjal z vsemi petimi
možnimi kalup-črkami (A–E) iz `generator-core.js`, z anchor tednom 28. 9. 2026.

**Rezultat: ujemanje je od 52 % do 96 %, redko 100 %.** Nekaj primerov z
visokim ujemanjem (SVETINA S. 92 %, DOLAR T. 92 %, VOVK U. 96 %) nakazuje, da
je osnovni model (5-tedenski PAT vzorec) pravilen, a večina drugih ima
50–85 % ujemanje — kar pomeni, da bodisi (a) trenutne črke v `WARDS_META`
niso povsem pravilne, bodisi (b) je prišlo do dejanskih sprememb kalupa med
junijem in septembrom 2026, bodisi (c) je moja metoda premalo natančna (ne loči
zanesljivo dopusta/KPU od pravih neujemanj).

**Nisem spremenil nobene kalup-črke v `WARDS_META`** — ujemanje pod ~90 % ni
dovolj zanesljivo, da bi lahko z gotovostjo prepisal realen razpored živih
ljudi. Polni rezultat (vseh 44 oseb, z odstotki in konkretnimi neujemanji) je
na voljo v `roster/kalup-ujemanje-raw.txt`, če ga želiš pregledati sam ali mi
poveš, katera oseba ima zagotovo znano pravo črko, da preverim natančneje.

## 2. Potrjeni/dvojno potrjeni popravki oddelkov (SMS/ZZT)

Primerjava `2026_SMS_RAZPORED.xlsx` (dejanski razpored) IN `ZAPOSLENI_1.8.xlsx`
(HR STATUS/ODDELEK) **soglasno** kaže:

- **Pogačnik Matej** je dejansko v oddelku **C1**, ne D (`WARDS_META` ga ima v D).
- **Mravlje Uroš** je dejansko v oddelku **D**, ne C1 (`WARDS_META` ga ima v C1).

To sta edina primera, kjer se DVA neodvisna vira strinjata — ostale razlike,
ki sem jih našel prej (glej `roster/README.md`), imajo nasprotujoče si vire in
jih nisem spreminjal.

**Verjetno samo tipkarski napaki v `WARDS_META`** (dejanski razpored uporablja
isto pisavo kot obstoječa koda, ZAPOSLENI_1.8.xlsx pa drugačno):
- "Bečirović N." (obstoječe, Č) — dejanski razpored prav tako uporablja Č,
  ZAPOSLENI_1.8.xlsx pa "Bećirović" (Ć). Verjetno je obstoječa črka pravilna.
- "Valjavec A." (obstoječe) — dejanski razpored prav tako uporablja "A.",
  ZAPOSLENI_1.8.xlsx pa "Valjavec Enej". Verjetno je obstoječa črka pravilna.

Glede na to, da se aktivno uporabljan razpored ujema z obstoječo kodo pri teh
dveh imenih, **tega nisem spreminjal** — le opozarjam, da HR izvoz
(ZAPOSLENI_1.8.xlsx) morda ni najbolj ažuren za ta dva primera.

## 3. Popravek imena: HROVAT (ne HORVAT)

**Popravljeno nazaj na "HROVAT NINA"** (v `admin.html`, `zelje.html`,
`dashboard-baseline.json`, `roster/*.csv`). Prejšnja sprememba na "Horvat" je
temeljila izključno na analizi "Dežurstva 2026" (docx), ki sama pravi, da gre
za njeno lastno "poenotenje" negotovih virov. Zdaj imam **dva neodvisna,
resnična delovna dokumenta** (`ZAPOSLENI_1.8.xlsx` in
`Letni_dopusti_in_omejitve_za_NZV.xlsx`), oba dosledno uporabljata "Hrovat".
Razmerje 2:1 v prid "Hrovat", pri nizkotveganem popravku (samo črkovanje, ne
razporejanje) — zato sem to popravil brez dodatnega vprašanja.

## 4. FLEXI kader — arhitekturna omejitev

`2026_SMS_RAZPORED.xlsx` razkriva samostojen list "FLEXI" — skupino
zaposlenih (Zaplotnik A., Djedović M., Misotič R., Burnar S., Sofrić N.,
Kvržić M., Vrevc M., Mušić I., Gashi G., Huseinbašić A. …), ki **niso vezani
na en fiksen oddelek**, ampak pokrivajo različne oddelke po potrebi (npr.
Vrevc M. dela izmene v oddelkih A, C, E1 v istem tednu).

Trenutni generator (`generirajKalup` v `generator-core.js`) in `WARDS_META`
predpostavljata, da ima vsak zaposleni **en fiksen oddelek in eno fiksno
kalup-črko** — to ne ustreza FLEXI kadru. To je razlog, da teh ljudi (in
podobnih iz prejšnjih odprtih vprašanj) nisem dodal v `WARDS_META`: potrebovali
bi drugačen podatkovni model (več-oddelčna dodelitev), kar je večja
arhitekturna sprememba, ne enostaven dodatek vrstice.

## 5. Preglednica "Letni dopusti in omejitve za NZV" — potrjena barvna shema

Ta datoteka je natanko tista, ki jo analiza "Dežurstva 2026" omenja kot
negotovo ("odčitano iz zaslonske slike"). Zdaj imam **pravo datoteko** in sem
potrdil barvno shemo s primerjavo proti že znanim vrednostim iz analize
(Grega Arnež, Aleksander Maglić — ujemanje do dneva natančno):

- **Rdeča (`FFE06666`) = dopust** (LD) — blokira ta dan IN dan pred začetkom
  rdečega bloka (če ni ponedeljek → petek prej).
- **Rumena (tema-barva #7) = omejitev** — blokira samo ta dan, brez pravila
  "dan prej".
- Svetlo rožnata (`FFF8D4D3`) na sobote/nedelje je samo splošno oblikovanje
  koledarja (vikend), ne osebna oznaka — ignorirano.

### Konkretni podatki za oktober 2026 (naslednji mesec za generiranje)

Za razliko od septembra je oktober **veliko lažji mesec** — omejitve imajo
samo tri osebe:

| Oseba | Blokirani dnevi (rdeče/rumeno) |
|---|---|
| Grega Arnež | 1., 2. (rdeče/dopust), 22., 23., 24., 25. (rumeno/omejitev) |
| Metka Velušček | 1., 2., 3., 4., 13., 14. (rumeno/omejitev) |
| Tanja Torkar | 23., 24., 25. (rumeno/omejitev) |

Pravilo "dan pred dopustom" tu ne doda dodatnih dni znotraj oktobra (Arnežev
rdeči blok se začne 1. 10., dan prej je še september). Pripravljeno za
neposredno kopiranje v `admin.html` → Dežurstva → polje "Odsotnosti":

- Grega Arnež: `2026-10-01, 2026-10-02, 2026-10-22, 2026-10-23, 2026-10-24, 2026-10-25`
- Metka Velušček: `2026-10-01, 2026-10-02, 2026-10-03, 2026-10-04, 2026-10-13, 2026-10-14`
- Tanja Torkar: `2026-10-23, 2026-10-24, 2026-10-25`

Ostalih 11 dežurnih oseb v oktobru nima nobene barvne omejitve v tej
preglednici.

## 6. Obrazec "Obvestilo koordinatorici za razporejanje kadra v ZN"

To je papirni obrazec, ki ga zaposleni izpolnijo ročno za štiri vrste zahtev:

1. Ročno evidentiranje prisotnosti (izven obsega te aplikacije).
2. **Menjava izmene** — natanko ujema z `menjave.html`: "menjam svojo izmeno
   X, dne Y, s sodelavcem Z in njegovo izmeno W, dne V" — to je isti podatkovni
   model, ki ga že implementira `submit_swap_request`. Obrazec ima samo EN
   podpis vodje (ne dveh), a to ne spreminja dogovorjene dvostopenjske
   odobritve (vodja → administrator), ki si jo izrecno želel.
3. **Predlog za koriščenje prostih ur/LD izven razporeda** (rok: do 10. v
   mesecu za naslednjega) — to je NOV tip zahteve, ki ga trenutna aplikacija
   še ne podpira (samo menjave izmen, ne prošnje za dopust/proste ure izven
   razporeda).
4. **Drugo** (kasnejši/predčasni prihod, nadomeščanje) — splošna kategorija,
   prav tako še ne podprta.

**Nisem razširil `menjave.html`** s temi dodatnimi tipi zahtev — to bi bila
smiselna naslednja faza (nov "status" tip v `swap_requests` ali nova tabela
`ostale_zahteve`), a je izven obsega izvirnega dogovora "dvostopenjska
odobritev **menjav**". Povej, če želiš, da to dodam.
