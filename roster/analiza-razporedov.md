# Analiza: 2026_SMS_RAZPORED.xlsx, Letni_dopusti_in_omejitve_za_NZV.xlsx, obvestilo_spremembe_slu_baZN.docx

## 1. Kalup črke (rotacijska rotacija A–E) — diagnostika

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

**Pomembna dodatna razlaga (na tvoje opozorilo):** v času dopustov koordinator
nujno odstopa od strogega 5-tedenskega kalupa, ker razporeda ni mogoče
sestaviti drugače glede na oddane želje/dopuste (`zelje.html`) — to je
pričakovano in pravilno ravnanje, ne napaka. Del neujemanja v zgornjih
odstotkih zato ni znak napačno določene kalup-črke, temveč posledica takih
legitimnih ročnih odstopanj okoli dopustov, ki jih moja primerjava (ki
tolerira samo LD/KPU kot nedoločena mesta) ne zazna vedno v celoti. Zato nizko
ujemanje NI sam po sebi dokaz, da je treba osnovno kalup-črko spremeniti —
gre ga jemati kot grob namig, ne kot trdno diagnozo. `admin.html` → Kalup že
podpira ročni preklop "LD" po tednu za posameznika (gumb ob vsakem tednu),
kar je pravi mehanizem za obravnavo dopusta pri generiranju — kalup-črka v
`WARDS_META` ostaja samo privzeto (osnovno) stanje za tedne BREZ dopusta.

Za štiri osebe, ki so bile premaknjene/dodane v `WARDS_META` (glej §2), sem
uporabil najboljše ujemanje kot izhodiščno črko (Pogačnik M. 88 %, Mravlje U.
59 %, Močnik S. 65 %, Balek M. 63 %) — to je zdaj v kodi, a jasno komentirano
kot ocena. Polni rezultat (vseh 44 oseb, z odstotki in konkretnimi neujemanji)
je na voljo v `roster/kalup-ujemanje-raw.txt`, če ga želiš natančneje
pregledati ali popraviti prek `admin.html` → Kalup (spustni seznam s črko
ob vsakem zaposlenem).

## 2. Popravki oddelkov (SMS/ZZT) — UVELJAVLJENO v `WARDS_META`/`zelje.html`

Primerjava `2026_SMS_RAZPORED.xlsx` (dejanski razpored) IN `ZAPOSLENI_1.8.xlsx`
(HR STATUS/ODDELEK) je pokazala vrsto neskladij z obstoječim `WARDS_META`. Na
tvojo izrecno zahtevo so zdaj uveljavljeni v kodi:

- **Pogačnik Matej**: D → **C1** (dvojno potrjeno).
- **Mravlje Uroš**: C1 → **D** (dvojno potrjeno).
- **Močnik Simona**: D → **C** (dejanski razpored jo prikazuje med osnovnimi 5
  v oddelku C).
- **Balek Mija**: dodana v **D** (prej v `WARDS_META` sploh ni bilo).
- **Vozel D.** (D, kalup E) in **Gazibara A.** (C1, kalup C): na izrecno željo
  **znova dodana** v `WARDS_META`/`SKUPINE`, potem ko sta bila v prejšnjem
  krogu odstranjena. Opozorilo ostaja v veljavi: dejanski razpored
  `2026_SMS_RAZPORED.xlsx` ju v juniju 2026 ni prikazoval kot del fiksne
  5-osebne rotacije teh oddelkov, kalup-črka je zato zgolj ocena brez
  potrditve. Poleg tega se v `zelje.html` "Nedežurni kader" pojavljata tudi
  "VOZEL DEJAN" in "GAZIBARA ALDIN" — če gre za isto osebo kot "VOZEL D."/
  "GAZIBARA A." v SMS/ZZT skupini, je oseba zdaj vpisana dvakrat na dveh
  seznamih; to je smiselno preveriti pri koordinatorju.

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
  rdečega bloka (če se blok začne v ponedeljek, tudi petek pred njim; sobota
  vmes ostane prosta).
- **Rumena (tema-barva #7) = omejitev** — blokira samo ta dan, brez pravila
  "dan prej".
- Svetlo rožnata (`FFF8D4D3`) na sobote/nedelje je samo splošno oblikovanje
  koledarja (vikend), ne osebna oznaka — ignorirano.

**UVELJAVLJENO v `generator-core.js`**: `generirajDezurstva()` zdaj sprejme
ločeni polji `dopust` (rdeče) in `omejitve` (rumeno) na osebo in samodejno
izračuna pravilo "dan pred dopustom" (glej testni primer v komentarjih
funkcije). `admin.html` → Dežurstva ima zdaj ločena vnosna polja "Dopust
(rdeče)" in "Omejitve (rumeno)" namesto, da bi vse šlo v splošne "Odsotnosti".

### Konkretni podatki za oktober 2026 (naslednji mesec za generiranje)

Za razliko od septembra je oktober **veliko lažji mesec** — omejitve imajo
samo tri osebe. Pripravljeno za neposredno kopiranje v `admin.html` →
Dežurstva, v ustrezno polje (Dopust ali Omejitve):

| Oseba | Dopust (rdeče) | Omejitve (rumeno) |
|---|---|---|
| Grega Arnež | `2026-10-01, 2026-10-02` | `2026-10-22, 2026-10-23, 2026-10-24, 2026-10-25` |
| Metka Velušček | — | `2026-10-01, 2026-10-02, 2026-10-03, 2026-10-04, 2026-10-13, 2026-10-14` |
| Tanja Torkar | — | `2026-10-23, 2026-10-24, 2026-10-25` |

Pravilo "dan pred dopustom" tu ne doda dodatnih dni znotraj oktobra (Arnežev
rdeči blok se začne 1. 10., dan prej je že september — izven obsega
generiranja). Ostalih 11 dežurnih oseb v oktobru nima nobene barvne omejitve
v tej preglednici.

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
