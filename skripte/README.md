# Skripte — lokalne administratorske skripte

Vse tu teče **samo na tvojem računalniku**, nikoli v brskalniku ali na
strežniku aplikacije, ker uporablja Supabase **service_role** ključ (poln
dostop mimo RLS pravil) — ta ključ ne sme nikoli priti v kodo, ki teče v
brskalniku (`admin.html`, `imenik.html` ipd. uporabljajo samo javni `anon`
ključ).

## `uvoz-racunov.mjs` — ustvari Auth račune za znane zaposlene

Prebere `roster/zaposleni-emaili.csv` + `roster/zaposleni-vloge-gesla.csv`
(72 unikatnih e-poštnih naslovov) in za vsako osebo ustvari pravi Supabase
Auth račun (`auth.users`), kar samodejno sproži obstoječi `handle_new_user()`
sprožilec v `supabase/schema.sql` in ustvari `profiles` vrstico z imenom
osebe — to velja v obeh spodnjih načinih, ker ista Auth-sprožilna logika
teče ne glede na to, kateri Admin API klic je ustvaril uporabnika.

Šele PO tem koraku se oseba pojavi v Kalupu/generatorju razporedov (ki bere
`profiles`, ne `roster/*.csv`) — glej tudi novo (18) sekcijo v
`supabase/schema.sql`, ki takoj po tem samodejno izpolni oddelek/vlogo za
nedvoumne primere.

### Dva načina

- **Produkcija (privzeto)** — pokliče `auth.admin.inviteUserByEmail`: pošlje
  osebi e-pošto s povezavo za **nastavitev lastnega gesla** (ista stran
  `reset-geslo.html`, ki jo aplikacija uporablja za "Pozabljeno geslo").
  Oseba nikoli ne vidi/prejme gesla od tebe — sama si ga izbere. Uporabi to,
  ko je aplikacija v produkciji in je čas, da ljudje dejansko dobijo mail.
- **Test (`--test`)** — pokliče `auth.admin.createUser`, **brez pošiljanja
  kakršnekoli e-pošte**. Za testno fazo: računi morajo obstajati zdaj (da jih
  generator razporeda vidi in da jih lahko uporabljaš pri sestavljanju
  razporedov), a pravega vabila še ni čas poslati. Začetno geslo je:
  - **fiksno**, iz `roster/zaposleni-vloge-gesla.csv` stolpca `geslo_predlog`
    (npr. `dino823` = ime + matična številka) — za 69 od 72 oseb, kjer ta
    podatek obstaja. To lahko osebno sporočiš zaposlenemu.
  - **naključno** za preostale ~3 osebe brez vira v CSV-ju.

  V obeh primerih velja: ker je začetno geslo znano (ali celo predvidljivo iz
  vzorca ime+matična), skripta vsak `--test` račun označi z
  `must_change_password: true` — aplikacija ob prvi prijavi **prisili**
  spremembo gesla (`supabase-client.js` → `requireAuth()` preusmeri na
  `reset-geslo.html`, ki nato zastavico počisti). Uporabljena gesla se
  izpišejo v terminal in v lokalno datoteko `porocilo-gesla-<čas>.csv` (v
  `.gitignore`, nikoli se ne commita/deli) — ko boš pripravljen na
  produkcijo, poženi skripto brez `--test`, da se pošljejo prava vabila
  (obstoječi računi se samo preskočijo, ne podvojijo).

### Zagon

```bash
cd skripte
cp .env.primer .env      # vpiši SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard -> Settings -> API)
npm install

# Produkcija (pravo vabilo po e-pošti):
node uvoz-racunov.mjs --suho     # 1) najprej samo izpis, brez pravih klicev
node uvoz-racunov.mjs            # 2) dejansko ustvari račune + pošlje vabila

# Test (brez e-pošte, samo lokalna začasna gesla):
node uvoz-racunov.mjs --test --suho   # 1) najprej samo izpis
node uvoz-racunov.mjs --test          # 2) dejansko ustvari račune, brez maila

# Samo peščica ljudi (npr. samo administratorji, ne čakaš na celoten seznam):
node uvoz-racunov.mjs --test --suho --samo=matej.bojic@pb-begunje.si,denis.dzamastagic@pb-begunje.si,dino.alukic@pb-begunje.si
node uvoz-racunov.mjs --test --samo=matej.bojic@pb-begunje.si,denis.dzamastagic@pb-begunje.si,dino.alukic@pb-begunje.si
```

`--samo=email1,email2,...` deluje z obema načinoma (produkcija/`--test`) in z `--suho` — omeji zagon na točno navedene e-pošte namesto celotnega seznama iz `roster/*.csv`. Uporabno za hitro ustvarjanje ključnih računov (npr. administratorjev), ne da bi čakal na vseh 72.

Preden poženeš dejanski (ne-suh) zagon PRODUKCIJSKEGA načina, v **Supabase
Dashboard → Authentication → URL Configuration → Redirect URLs** dodaj
naslov iz `SITE_URL` v `.env` + `/reset-geslo.html` — sicer Supabase
povezavo v vabilu zavrne kot neznano preusmeritev. `--test` način tega ne
potrebuje (ne pošilja maila, torej ni preusmeritve).

Varno je pognati večkrat, v obeh načinih — e-pošte, za katere račun že
obstaja, se samo preskočijo (izpiše "že obstaja"), nič se ne podvoji ali
prepiše. Prehod iz `--test` v produkcijo je torej varen: ista skripta brez
`--test` samo doda manjkajoče vabila, obstoječih testnih računov se ne
dotakne.

### Kaj ni vključeno (namenoma)

- **Produkcijski način ne uporablja `geslo_predlog`** — tam osebo nikoli ne
  seznanjaš z geslom niti začasno, pošlje se pravo vabilo in oseba si sama
  izbere geslo prek povezave v e-pošti. `geslo_predlog` (ime + matična
  številka, predvidljiv vzorec) se uporabi izključno v `--test` načinu, kjer
  je namen ravno to, da admin osebno pozna in lahko sporoči začetno geslo —
  in ravno zato aplikacija ob prvi prijavi prisili njegovo spremembo (glej
  zgoraj).
- **Zaplotnik Alenka, Balek Mija, Sejdinović Mustafa in Stare Luka** —
  13. 8. 2026 niso več zaposleni; iz seznamov (`roster/*.csv`,
  `dashboard-baseline.json`, seed v `schema.sql`) so odstranjeni, da jih
  ta skripta ne ustvari znova. Za izbris iz obstoječe baze glej
  `supabase/odstrani-zaposlene.sql`.


## Preizkusi

| Skripta | Kaj preveri | Kaj potrebuje |
|---|---|---|
| `preveri-delovni-cas.mjs` | `delovni-cas.js` in kopija v `supabase/functions/_shared/` sta identična | nič |
| `preveri-foto-uvoz.mjs` | branje barv razpredelnice s fotografije (Želje) | nič |
| `preveri-oseba-vrstica.mjs` | strnjena vrstica seznama zaposlenih: strnjeno je vidno samo ime, klik na vrstico razpre podatke, klik na ime odpre zapis | `playwright` |
| `preveri-izbris-osebe.mjs` | `schema.sql` postavi delujočo bazo iz nič; `odstrani-zaposlene.sql` se izvede po ukazih (vsak v svoji seji, kot v Supabase SQL Editorju) in za sabo ne pusti ne imena ne viseče povezave | lokalni PostgreSQL + `su postgres` |
| `preveri-zapis-v-sheets.mjs` | `pripraviPosodobitveOddelka` (index.html) na fixture-ju v obliki resničnega dokumenta ("2026 SMS RAZPORED") — najde prave koordinate (vrstica, stolpec) za pisanje nazaj v Google Sheets, ločeno po mesecih z različnim naborom ljudi, prek prazne vmesne vrstice, brez pisanja v celico osebe, ki v listu nima stolpca | nič |
| `preveri-sheets-mreza.mjs` | `pripraviPosodobitveOddelkaIzMreze` (sheets-mreza.js) — ista logika kot `preveri-zapis-v-sheets.mjs`, a za PREDOGLED iz Admin → Kalup (še ne objavljen v Supabase): uporabi vrednost, ki jo trenutno prikazuje predogled (torej VKLJUČNO z ročnim popravkom celice), ne surov izračun generatorja | nič |
| `preveri-nzv-sheets.mjs` | `pripraviPosodobitveNzv`/`nzvNazivVKodo`/`NZV_STOLPCI` (index.html) na fixture-ju v obliki resničnega dokumenta ("Letni dopusti in omejitve za NZV") — pravi vrstni red stolpcev (SA DOP/SA POP med DB in URGENCA), prave koordinate za enote IN za nova LD/IZOB/BS polja, ločeno po mesecih, prek prazne vmesne vrstice | nič |
| `preveri-pametni-uvoz.mjs` | `razvrstiListe`/`obdelajOddelekVrstice`/`obdelajNzvVrstice` (index.html) — "Naloži datoteko (samodejno)" pravilno loči zavihke po znani kodi oddelka od preostalih, prepozna oddelčno IN NZV obliko po vsebini, in list, ki ni nobeno od tega (npr. "KALUP" legenda), tiho ne vrne ničesar (preskočen, ne napaka) | nič |
| `preveri-xlsx-datum.mjs` | `xlsxCelicaVBesedilo` (import-utils.js) na PRAVEM branju/pisanju `xlsx.core.min.js` — datumska celica z drobno plavajočo napako (npr. `46173.999999988` namesto `46174`, kot pri resničnem izvozu iz Google Sheets) se prebere kot PRAVI dan, ne kot prejšnji dan tik pred polnočjo | nič |
| `preveri-pdf-stolpci.mjs` | `pdfKoscjiVTabelo` (import-utils.js) — rekonstrukcija PRAVIH stolpcev iz PDF-ja po navpičnem belem prostoru med koščki besedila (x-lega/širina, ki jih pdf.js že vrne): več besed v isti celici ostane skupaj, prazna celica ne zamakne ostalih stolpcev, golo besedilo brez tabele (dopis) da en sam stolpec, naslovna/podpisna vrstica čez skoraj celo širino strani NE sesuje delitve na stolpce, posamezna "pokvarjena" vrstica ne pokvari ostalih — obe zadnji dve odkriti na dry-run-u PRAVE uradne datoteke uporabnika, glej spodaj | nič |
| `preveri-nzv-dezurstvo-datum.mjs` | "od konca do konca": prava `.xlsx` datumska celica (z isto plavajočo napako kot zgoraj) → `xlsxCelicaVBesedilo` → `obdelajNzvVrstice` — dežurstvo/LD, uvožena prek NZV, pristaneta na PRAVEM dnevu in v obliki (`employee_id`+`work_date`, brez omejitve na `department_code`), ki jo "Moj razpored" (MyScheduleView) samodejno prikaže | nič |
| `preveri-vnesi-parafe.mjs` | `supabase/vnesi-parafe.sql` na pravi bazi: vseh 65 vrstic iz uradnega izvoza paraf se ujema s pravim profilom (`imena_se_ujemata`), oseba brez profila konča v poročilu "NI NAJDEN PROFIL" namesto da tiho izpade, "Maglić Aleksander" (prvotno dve nasprotujoči si vrstici v izvozu, glej spodaj) dobi uporabnikom potrjeno parafo "MAG", drugi zagon je varen (idempotenten) | lokalni PostgreSQL + `su postgres` |
| `preveri-posodobi-parafe-oktober-2026.mjs` | `supabase/posodobi-parafe-oktober-2026.sql` na pravi bazi: vseh 21 vrstic se ujema s pravim profilom, `profiles.parafa` dobi NOVO parafo (velja od 1.10.2026), `profiles.parafa_pred_oktobrom_2026` STARO (veljala do 30.9.2026), 2 osebi brez dejanske spremembe imata obe polji enaki, drugi zagon je varen | lokalni PostgreSQL + `su postgres` |
| `preveri-parafa-datumski-prestop.mjs` | `parafaOd`/`parafaMapa` (index.html) - oseba s spremenjeno parafo dobi STARO parafo za dneve/mesece pred 1.10.2026 in NOVO od tega datuma dalje (natančno na meji: 30.9. stara, 1.10. nova), oseba BREZ spremembe (velika večina kadra) je od datuma popolnoma neodvisna (regresija), `parafaMapa` (obratna preslikava za uvoz) uporabi pravo stran prestopa za cel ciljni mesec | nič |
| `preveri-nzv-dezurstvo-ime.mjs` | `obdelajNzvVrstice` (index.html) - stolpec DEŽURSTVO uradne predloge se ujema po POLNEM IMENU (vreča besed), ne po parafi kot vsi ostali stolpci - potrjeno na pravi uporabnikovi datoteki, glej spodaj. Naziv pred imenom ("dr. ") se odstrani pred primerjavo, oseba brez profila konča v poročilu (ne izgine tiho), vsi ostali stolpci se ŠE VEDNO ujemajo po parafi (regresija) | nič |
| `preveri-zdravniki-dezurstvo.mjs` | `obdelajZdravnikiVrstice` (index.html) - uvoz uradnega dokumenta "Razporeditev zaposlenih v UA in DEŽ" (dežurni zdravniki, `duty_doctors`) - datum+dan+ime "Urgenca ZDR" pogosto v ENI celici (glej `pdfKoscjiVTabelo`), zapis "Ime (Drugo Ime)" v "Dežurstvo ZDR" pomeni zamenjavo (uporabi samo prvo ime), vikend brez "Urgenca ZDR" ne ustvari napačnega zapisa, "Dežurstvo dipl. m.s./zn." (že pokrito prek NZV uvoza) se ne podvoji, podpisni blok na dnu z navidezno datumsko vsebino ne prepiše zadnjega pravega dne | nič |
| `preveri-uvoz-napotilo.mjs` | `preberiUvozIzNaslova` (index.html) — razčlenjevanje naslova `index.html?uvoz=1&oddelek=…&mesec=…`, prek katerega zavihek "Oddelki" (admin.html) napoti na uvoz razporeda: veljavne skupine (6 oddelkov + FLEXI + NZV), neveljaven oddelek/mesec pomeni "privzeto" in ne napake (naslov je zunanji vhod, ki ga uporabnik lahko spremeni ali deli naprej) | nič |
| `preveri-vgnezdeni-join.mjs` | statično lovi DVOUMNE vgnezdene ("embed") zapise v poizvedbah: če ima tabela več tujih ključev na isto ciljno tabelo (npr. `schedule_entries` → `profiles` prek `employee_id`/`created_by`/`updated_by`), mora zapis nositi namig (`profiles!employee_id(...)`), sicer PostgREST vrne napako namesto vrstic — napaka se ne pokaže kot sporočilo, ampak kot tiho prazen prikaz | nič |
| `preveri-datum-oblika.mjs` | `datum.js` — ena sama oblika datuma za vso aplikacijo (`27.10.2026`, brez presledkov): brez vodilnih ničel, brez premika zaradi časovnega pasu (delovni datum `YYYY-MM-DD` se razčleni kot besedilo, ne prek `Date`), različici brez leta in s časom, prazne/neveljavne vrednosti dajo prazen niz; preveri tudi, da nobena stran ne uporablja več golega `toLocaleDateString("sl-SI")` | nič |
| `preveri-flexi-uvoz.mjs` | `obdelajFlexiVrstice`/`najdiVrsticoImenFlexi` (index.html) - nov zavihek FLEXI ("2026 SMS RAZPORED") ima drugačno obliko kot ostalih 6 oddelkov: vsaka oseba zaseda PAR stolpcev (oddelek te izmene + koda izmene), department_code se bere iz podatkov (ne fiksen za ves list), ime osebe je v glavi nad DRUGIM stolpcem para. Ponovljen blok stolpcev v isti vrstici (opažen na pravi datoteki) se prezre - uporabi se samo prva (leva) pojavitev. Neznana/kombinirana oznaka oddelka (npr. "C/E2") se NE zapiše (tuji ključ na `departments` bi zavrnil cel upsert), ampak konča v poročilu neujemanj | nič |

`preveri-izbris-osebe.mjs` se sam preskoči (izhod 0), če PostgreSQL ni na
voljo — ni pa nadomestila zanj: vse tri napake, ki jih lovi, so bile vidne
šele ob zagonu proti pravi bazi, ne z branjem kode.

`preveri-zapis-v-sheets.mjs` je odkril resnično napako (ne le preveril
pravilnost): prazna vrstica SREDI mesečnega bloka (npr. presledek med
tedni) je doslej nepovratno prekinila `obdelajBlok` — vsi dnevi ZA njo so
tiho izpadli iz uvoza/zapisa. Ista funkcija se uporablja tako za uvoz
(`uvoziOddelek`/`uvoziNzv`) kot za pisanje nazaj, zato popravek velja za
oboje.

`preveri-xlsx-datum.mjs` je prav tako odkril resnično napako, prijavljeno
takoj po uvedbi "Naloži datoteko (samodejno)": uvoženi vpisi so pristali na
za en dan zamaknjenem datumu, na VSEH oddelkih. Vzrok je bil v tem, kako
Excel/Google Sheets shranjujeta datum (serijsko število dni od izhodišča) —
pri izvozu iz Google Sheets to število pogosto NI točno cel dan, ampak ima
drobno plavajočo napako (npr. `46173.999999988` namesto `46174`), kar se je
brez zaokroževanja prebralo kot prejšnji dan tik pred polnočjo. Ker
`xlsxCelicaVBesedilo` uporablja tudi obstoječi (starejši) `preberiDatoteko`
pri drugih Excel uvozih po aplikaciji (npr. HR uvoz v Imeniku), bi ista
napaka lahko doslej prizadela tudi te — popravek (zaokrožitev na najbližji
dan) velja za vse.

`preveri-vnesi-parafe.mjs` je pri pripravi `vnesi-parafe.sql` ujel resnično
past PRED zagonom na pravi bazi, ne šele po njem: uradni izvoz paraf je
vseboval LOČENI, nasprotujoči si vrstici "Magkić Aleksander" (parafa
"AMG") in "Maglić Aleksander" (parafa "MA") za isto osebo - prvi poskus ju
je pomotoma združil v eno vrstico, preizkus na pravi bazi je to takoj
pokazal kot podvojen ključ. Uporabnik je nato potrdil, da gre res za eno
osebo (Aleksander Maglić) IN da je prava parafa "MAG" (drugačna od obeh
prvotnih, nasprotujočih si vrednosti) - `vnesi-parafe.sql` zdaj vsebuje
samo eno, pravilno vrstico.

`preveri-posodobi-parafe-oktober-2026.mjs`/`preveri-parafa-datumski-prestop.mjs`
pokrivata resnično poslovno spremembo (ne popravek napake): parafa se je za
21 oseb spremenila z veljavnostjo od 1.10.2026, uporabnik pa je poslal
OBE vrednosti (staro in novo) z jasno mejo. `profiles.parafa` odslej hrani
novo, nov stolpec `profiles.parafa_pred_oktobrom_2026` pa staro - `parafaOd`
med njima izbira glede na `work_date` razporeda/dopusta, ne glede na
današnji datum, zato NZV za pretekle mesece (pred oktobrom 2026) še naprej
pravilno prikaže staro parafo, tudi če je skripta pognana šele pozneje.

`preveri-nzv-dezurstvo-ime.mjs` je odkril resnično napako, ki je razložila,
zakaj se dežurstvo, uvoženo iz uradne predloge "Letni dopusti in omejitve za
NZV", ni NIKOLI pojavilo v "Moj razpored" - najden z dry-run-om PRAVIH
uporabnikovih datotek skozi produkcijsko kodo (ne z branjem kode). Stolpec
DEŽURSTVO te predloge vsebuje POLNO IME osebe (npr. "Grega Arnež", včasih z
nazivom "dr. Tanja Torkar"), medtem ko VSI OSTALI stolpci (enote, LD/IZOB/BS)
vsebujejo parafo (npr. "GA"). `obdelajNzvVrstice` je stolpec DEŽURSTVO doslej
obravnaval enako kot vse ostale - iskal je parafo, ki je seveda nikoli ni
našel, zato je vsak dežurstveni vpis tiho odpadel (skrit med pričakovanimi
"neujemanji" v poročilu, ne opazen kot ločen hrošč). Popravljeno: ta stolpec
se zdaj ujema po polnem imenu (ista "vreča besed" primerjava kot LD/IZOB/BS),
naziv pred imenom pa se pred primerjavo odstrani.

`preveri-flexi-uvoz.mjs` je pri prvem zagonu, s fixture-jem zvestim pravi
strukturi FLEXI zavihka, ujel resnično napako v `obdelajFlexiVrstice`, ne le
napako v fixture-ju (kot je bilo prvotno posumljeno): funkcija je za VSE
vrstice v mesečnem bloku pisala isti `work_date` - datum PRVE vrstice bloka -
namesto pravega datuma vsake posamezne vrstice. Vzrok: `obdelajBlok` (skupna
pomožna funkcija za vse uvoze) pravi datum vsake vrstice preda kot 3. argument
callbacku, `obdelajFlexiVrstice`-jev callback pa ga ni sprejel v svoj seznam
parametrov, zato je namesto njega uporabil zunanjo spremenljivko `datum`
(zajeto ob ZAČETKU bloka, torej datum prve vrstice). Posledica: pri več
zaporednih dneh v istem bloku bi bili VSI vpisi zapisani na datum prvega dne
- popravljeno tako, da callback datum vsake vrstice sprejme kot svoj
parameter (ista imena, a zdaj pravi, po-vrstici vir), namesto zunanjega.

Dodatno, ker `normalizirajImeNzv` (skupna za NZV DEŽURSTVO stolpec in za
kratka-imena ujemanje pri uvozu oddelkov) zdaj uporablja nov, uporabnikom
potrjen alias seznam `IME_PSEVDONIM_NZV` (npr. "HORVAT"→"HROVAT" - pravi
priimek je Hrovat, ne Horvat; "TOMAŽEVIĆ"→"TOMAŽEVIČ" - pravi priimek je s
"č", ne "ć") za dve konkretni, uporabnikom izrecno potrjeni imenski razliki
(ne splošno ć→č pravilo - oboje sta legitimni črki v drugih resničnih
priimkih, npr. Bojić, Alukić, Sofrić), so bili trije obstoječi preizkusi
(`preveri-nzv-dezurstvo-datum.mjs`, `preveri-nzv-dezurstvo-ime.mjs`,
`preveri-pametni-uvoz.mjs`), ki `normalizirajImeNzv` uporabljajo posredno,
dopolnjeni z izvlečkom te nove konstante.

`sheets-mreza.js` (nova skupna datoteka, `preveri-sheets-mreza.mjs`) rešuje
poseben primer: Admin → Kalup zdaj lahko piše PREDOGLED generatorja (še ne
objavljen v Supabase, z upoštevanimi ročnimi popravki celic) nazaj v
obstoječi Google Sheets dokument, po isti logiki iskanja koordinat kot
`pripraviPosodobitveOddelka` (index.html) za že objavljen razpored. Ker je
admin.html samostojna Babel/React stran (do funkcij v index.html ne more
priti prek `<script src>`), je logika iskanja bloka/glave NAMERNO podvojena
v `sheets-mreza.js`, ne le sklicana - da podvojitev sčasoma ne zaide iz
sinhronizacije z index.html, `preveri-sheets-mreza.mjs` preverja isto
obnašanje (prazna vmesna vrstica, podpisni blok, drug nabor ljudi po
mesecih, oseba brez stolpca) na isti fixture obliki kot
`preveri-zapis-v-sheets.mjs`.

`preveri-pdf-stolpci.mjs`/`pdfKoscjiVTabelo` odpravita dolgo znano
omejitev, dokumentirano v vsakem "PDF ni podprt" sporočilu po aplikaciji:
uvoz iz PDF-ja je doslej vrnil samo golo besedilo po vrsticah (Y-sortirano,
nato X znotraj vrstice), ker se je zdelo, da PDF ne nosi zanesljivega
podatka o stolpcih. V resnici pdf.js za vsak košček besedila že vrne
njegovo vodoravno lego IN širino - dovolj, da se stolpci najdejo po
"navpičnem belem prostoru" med njimi (združevanje prekrivajočih se
vodoravnih odsekov v pasove, nato širok presledek med pasovi = meja
stolpca). Rezultat je zdaj prava `vrsteVrstic` oblika (vrstice × stolpci),
ki gre naravnost skozi ISTO kodo kot .xlsx/.csv - `tip` je `"pdf-besedilo"`
samo še takrat, ko v PDF-ju resnično ni najti nobenega stolpca (golo
besedilo, npr. dopis), ne za vsak PDF kot doslej.

Prva različica `pdfKoscjiVTabelo` je na sintetični fixture-ju delovala
brezhibno, na PRAVI uradni datoteki uporabnika ("Razporeditev zaposlenih v
UA in DEŽ", dry-run izven repozitorija) pa je ves dokument sesula v EN sam
stolpec. Vzrok: pasovi so se prvotno računali iz VSEH koščkov na strani, ne
glede na vrstico - naslovna vrstica ("Zadeva: Razporeditev zaposlenih v
urgentno ambulanto ...") je bila EN sam košček, širok skoraj celo stran, in
je s svojo širino premostila prav vse prave meje med stolpci. Popravljeno:
pasovi se zdaj računajo SAMO iz vrstic s "tipičnim" (najpogostejšim)
številom koščkov na vrstico (naslovna/podpisna vrstica z enim samim
kosčkom se s tem samodejno izloči). Ista prava datoteka je razkrila še
drugo, manjšo posebnost: pri nekaj datumih je PDF datum+dan+ime prvega
stolpca združil v EN sam košček (namesto treh ločenih), kar tako vrstico
izloči iz računanja pasov, a jo pusti pravilno izpisano (le morda nepopolno
razdeljeno - vidno in popravljivo v predogledu, ne izgubljeno). Oba primera
sta zdaj pokrita s testoma 6 in 7 v `preveri-pdf-stolpci.mjs`.

Dry-run istega dokumenta ("Razporeditev zaposlenih v UA in DEŽ") je
razkril, da vsebuje 3 stolpce dežurstev, ne enega: "Urgenca ZDR" in
"Dežurstvo ZDR" sta dva ločena kroga ZDRAVNIKOV (npr. "Dr. Lea Žmuc
Veranič"), ki jih aplikacija doslej ni poznala, "Dežurstvo dipl. m.s./zn."
pa je isti 14-osebni krog, ki ga NZV uvoz že pozna. Uporabnik je potrdil:
(1) zdravniki naj NIMAJO pravega profila/računa - samo prikaz imena poleg
dežurstva v "Moj razpored" (nova tabela `duty_doctors`, brez FK na
profiles); (2) zapis "Ime Priimek (Drugo Ime Priimek)" v stolpcu
"Dežurstvo ZDR" pomeni ZAMENJAVO - prva oseba dejansko dela, druga (v
oklepaju) je bila prvotno razporejena, zato se uporabi samo prva.
`obdelajZdravnikiVrstice` (index.html) to prebere in shrani ločeno od
`obdelajNzvVrstice` (ki še vedno pokriva "Dežurstvo dipl. m.s./zn." prek
obstoječega NZV uvoza - ni podvojeno).

Zavihek "Oddelki" (prej "Kalup (SMS/TZN)") v admin.html uvoza razporeda ne
podvaja: uvozna logika (~300 vrstic, razpršenih čez index.html in pokritih
s `preveri-pametni-uvoz.mjs`, `preveri-flexi-uvoz.mjs` in `preveri-nzv-*`)
ostaja na ENEM mestu, zavihek pa nanjo napoti prek naslova
`index.html?uvoz=1&oddelek=…&mesec=…` z že izbrano skupino in mesecem.
Druga kopija bi se sčasoma razšla s prvo - isti razlog, zaradi katerega
`sheets-mreza.js` (edina namerna podvojitev v repozitoriju, ker admin.html
do funkcij v index.html ne more priti prek `<script src>`) potrebuje lasten
preizkus usklajenosti. Ker naslov nosi vrednosti, ki gredo naravnost v
izbiro oddelka in meseca za pisanje v razpored, jih `preberiUvozIzNaslova`
preveri proti znanim kodam oz. obliki `YYYY-MM` namesto da bi jim zaupala.

`preveri-vgnezdeni-join.mjs` je nastal ob resnični napaki, ki jo je prijavil
uporabnik s posnetkom zaslona: uvoz NZV je javil "Uvoženih skupaj 342
vpisov", mreža v aplikaciji pa je ostala prazna — razen stolpca LD. Vzrok ni
bil v uvozu (vrstice SO bile zapisane), ampak v BRANJU: `schedule_entries`
ima tri tuje ključe na `profiles` (`employee_id` od začetka, `created_by` in
`updated_by` dodana pozneje v sekciji 30 sheme), `nalozizPodatkeNzv` pa je
bral z nedoločenim `profiles(...)`. PostgREST tak zapis zavrne kot dvoumen
in vrne napako namesto vrstic; koda je rezultat brala kot `(entries || [])`,
zato ni bilo ne sporočila ne opozorila — samo prazne celice. Stolpec LD je
deloval le zato, ker se bere iz `leave_entries` prek ločene poizvedbe brez
vgnezdenja. Ista napaka je tiho praznila dežurstva v razporedu vodij
(admin.html). Ker se taka napaka NE pokaže kot sporočilo, jo je edino
zanesljivo loviti statično — od tod ta preizkus.
