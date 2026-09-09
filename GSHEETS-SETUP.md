# Google Sheets izvoz – enkratna nastavitev

Gumb "📗 Izvozi v Google Sheets" (na vseh straneh z razpredelnicami) ustvari
**nov Google Sheets dokument** naravnost v tvojem Google Drive, vsakič ko ga
klikneš – brez ročnega nalaganja datotek. To zahteva, da Google pozna to
aplikacijo: potrebuje **OAuth Client ID**, ki ga lahko ustvari samo lastnik
Google računa/domene (jaz tega ne morem narediti namesto tebe – to ni tajen
podatek kot service_role ključ, je pa vseeno vezan na tvoj Google Cloud
račun).

Gumb "⬇ Izvozi v Excel" na isti vrstici **ne potrebuje ničesar od spodaj** –
deluje takoj, brez nastavitve (prava `.xlsx` datoteka, prenesena lokalno).

## Korak 1 – Google Cloud projekt

1. Pojdi na [console.cloud.google.com](https://console.cloud.google.com).
2. Zgoraj klikni izbirnik projekta → **"New Project"** (ali izberi
   obstoječega, če ga bolnišnica že ima za drug namen).
3. Poimenuj ga npr. "Razpored PBB" in počakaj, da se ustvari.

## Korak 2 – omogoči Google Sheets API

1. V levem meniju: **"APIs & Services" → "Library"**.
2. Poišči **"Google Sheets API"** in klikni **"Enable"**.

## Korak 3 – OAuth soglasni zaslon (consent screen)

1. **"APIs & Services" → "OAuth consent screen"**.
2. Če je bolnišnica na **Google Workspace** domeni (e-pošte `@pb-begunje.si`
   gostuje Google) – izberi **"Internal"**. To pomeni, da samo osebe znotraj
   vaše domene lahko uporabljajo izvoz, in Google NE prikaže opozorila
   "unverified app".
3. Če domena ni na Google Workspace (ali nisi prepričan) – izberi
   **"External"** in tip uporabnikov **"Testing"**, nato pod "Test users"
   dodaj e-poštne naslove vseh administratorjev/vodij, ki bodo uporabljali
   izvoz (samo dodani naslovi lahko potrdijo dostop). Google bo pri prijavi
   pokazal opozorilo "Google hasn't verified this app" – to je pričakovano
   za interno orodje in ni nevarno, klikneš "Advanced" → "Go to Razpored PBB
   (unsafe)" (Google tako poimenuje vsako neuradno preverjeno aplikacijo).
4. Izpolni obvezna polja (ime aplikacije: "Razpored PBB", e-pošta za podporo:
   tvoja).

## Korak 4 – ustvari OAuth Client ID

1. **"APIs & Services" → "Credentials" → "Create Credentials" → "OAuth
   client ID"**.
2. Vrsta aplikacije: **"Web application"**.
3. Pod **"Authorized JavaScript origins"** klikni "Add URI" in dodaj natanko:
   ```
   https://razpored.netlify.app
   ```
   (brez poševnice na koncu). Če aplikacijo testiraš tudi drugje (npr.
   deploy-preview naslov na Netlify), dodaj tudi tisti naslov – sicer Google
   prijavo tam zavrne.
4. Klikni **"Create"**. Prikaže se **Client ID** (dolg niz, konča se na
   `.apps.googleusercontent.com`) – to je edino, kar potrebujem, NI tajno
   (varno je v kodi brskalnika, enako kot že obstoječi Supabase `anon`
   ključ).

## Korak 5 – vpiši Client ID v kodo

Odpri `gsheets-client.js` v korenu repozitorija, najdi vrstico:
```js
var CLIENT_ID = ""; // <-- sem prilepi svoj Google OAuth Client ID
```
in med narekovaje prilepi svoj Client ID. Shrani, commitaj, pošlji mi (ali
mi samo prilepi Client ID v pogovor in ga vnesem jaz).

## Kaj se zgodi ob prvem kliku "Izvozi v Google Sheets"

Google prikaže standardno prijavno okno (izbira Google računa → soglasje za
"Google Sheets: See, edit, create, and delete your spreadsheets") – vsaka
oseba to potrdi enkrat na sejo. Po potrditvi se ustvari nov dokument v
Google Drive **te osebe** (ne skupnega admin računa) – vsak izvoz je torej
last tistega, ki je kliknil gumb; deliš ga naprej ročno (Google Sheets →
"Share"), kot vsak drug dokument.

## Preverjanje

Po vnosu Client ID-ja odpri poljubno stran z gumbom (npr. Imenik) in klikni
"Izvozi v Google Sheets" – pojavi se Google prijavno okno namesto
sporočila "Izvoz v Google Sheets še ni nastavljen".

## Uvoz razporeda – najlažje: naloži datoteko

Na strani **Razpored → Po oddelkih/NZV** (admin), gumb **"📥 Uvoz razporeda"**
zdaj najprej ponudi **"📁 Naloži datoteko (samodejno)"** – naložiš en Excel
izvoz (.xlsx), lahko kar CEL delovni zvezek z vsemi zavihki (npr. cel
dokument "2026 SMS RAZPORED"), in aplikacija sama prepozna vsebino vsakega
zavihka:
- zavihek, poimenovan po znani kodi oddelka (B, C, C1, D, E1, E2, FLEXI) →
  uvozi kot razpored TEGA oddelka;
- zavihek v obliki "Letni dopusti in omejitve za NZV" (enote v glavi, ne
  glede na ime zavihka) → uvozi kot NZV;
- zavihek, ki ni prepoznan kot nobeno od tega (npr. "KALUP", "kopije",
  "jesen" v pravi predlogi – to so legenda/delovni zavihki, ne razpored) →
  tiho preskočen, naveden v sporočilu po uvozu, da veš, da ni bil prezrt po
  pomoti.

To deluje ne glede na to, kateri oddelek/zavihek je trenutno izbran zgoraj v
aplikaciji – naložena datoteka se v celoti pregleda. Datoteko lahko naložiš
tudi večkrat zapored (novo/popravljeno različico, naslednji mesec …) – vsak
nov uvoz samo prepiše/dopolni obstoječe vpise za zadevni dan, nič se ne
podvoji.

**Kako narediš tako datoteko iz Google Sheets:** v dokumentu klikni meni
**Datoteka → Prenesi → Microsoft Excel (.xlsx)** (na telefonu: ikona "⋮" ali
"Deli" → "Pošlji kopijo" → izberi obliko **"Excel (.xlsx)"**) – to prenese
CEL dokument z vsemi zavihki v eni datoteki, ki jo nato naložiš v
aplikacijo. Ni ti treba paziti na noben zavihek/#gid= – to je ravno prednost
te poti pred ročnim lepljenjem povezave spodaj.

## Ročni uvoz prek povezave – pravi zavihek je nujen

Če datoteke raje ne nalagaš (npr. dokument se še ureja v Google Sheets in ga
ne želiš vsakič znova prenašati), je na voljo tudi prejšnja pot – razširi
"Ali ročno, po povezavi do Google Sheets" v istem oknu:
- **📥 Uvozi Oddelki** – prebere razpored iz Google Sheets dokumenta v
  aplikacijo (samo javno deljeni dokument, "Vsak s povezavo lahko ogleda" –
  brez prijave, drugačna pot kot izvoz zgoraj).
- **📤 Zapiši nazaj v Sheets** – obratna smer: trenutno stanje iz aplikacije
  zapiše nazaj v **obstoječ** dokument (potrebuje Google prijavo, ker piše,
  ne samo bere). Piše **samo v celice, ki jih tudi uvoz prebere** – ime osebe,
  oblika, podpisni blok in drugi meseci v istem zavihku ostanejo nedotaknjeni.
  Nikoli ne doda novega stolpca/vrstice – če oseba v listu (še) nima svojega
  stolpca, se tiho izpusti (javi se kot "brez ujemanja imena"). Deluje tudi za
  NZV (glej spodaj).

### NZV – dan × enota (ne dan × oseba)

Stran **Razpored → NZV** ima drugačno obliko kot navadni oddelki: stolpci so
organizacijske ENOTE (PDZN, SOBO, ŽO, E1, E2, D, MO, B, C, C1, PO, A, B1/B2,
DB, SA DOP, SA POP, URGENCA, U2), ne osebe – celica pove, KDO (parafa) to
enoto pokriva ta dan. Zadnji trije stolpci, **LD / IZOB / BS**, niso enote,
ampak povzetek odsotnosti tega dne (letni dopust / strokovno izobraževanje /
bolniška) – isti vir podatkov kot Želje → Razpredelnica. Uvoz teh treh
stolpcev zato piše v drugo tabelo (odsotnosti) kot ostale enote (razpored) –
to je notranja podrobnost, v Sheets dokumentu pa je vseeno, videti je kot en
sam sklop stolpcev v isti vrstici.

"Uvozi NZV" in "Zapiši nazaj v Sheets" pri NZV veljata za isti dokument/list
kot "Letni dopusti in omejitve za NZV" – velja ista past z zavihki/gid kot
zgoraj (klikni pravi zavihek/mesec, šele nato kopiraj povezavo).

**Za oboje velja ista past, ki je vzrok večine "ni najdenih vrstic"/"nobeno
ime se ni ujemalo" napak pri dokumentu z več zavihki (en na oddelek, kot
"2026 SMS RAZPORED"):** povezava v naslovnem polju MORA kazati na zavihek
TEGA oddelka, kar pomeni v naslovni vrstici brskalnika `#gid=…`. Če samo
odpreš dokument in kopiraš povezavo iz naslovne vrstice, ne da bi prej
kliknil zavihek na dnu (npr. "C1"), povezava kaže na PRVI zavihek v
dokumentu (običajno tisti, ki je bil ustvarjen prvi) – uvoz/zapis potem
tiho bere/piše napačen oddelek.

**Postopek, ki deluje zanesljivo:**
1. V Google Sheets klikni zavihek za ta oddelek (dno zaslona).
2. Šele PO TEM kopiraj naslov iz naslovne vrstice brskalnika.
3. To povezavo prilepi v aplikacijo – vsak oddelek/gumb si svojo povezavo
   zapomni posebej, zato to storiš enkrat na oddelek.

### Preden prvič uporabiš "Zapiši nazaj v Sheets" na PRAVEM dokumentu

Funkcija piše v ročno voden, podpisan uradni dokument brez možnosti
razveljavitve v aplikaciji (Google Sheets ima svojo "Zgodovina različic" -
File → Version history - ki lahko povrne prejšnje stanje, če bi kaj šlo
narobe, a to je ročno dejanje, ne gumb v tej aplikaciji). Priporočam:
naredi kopijo dokumenta (File → Make a copy), preizkusi "Zapiši nazaj" na
kopiji in preveri, da so se spremenile TOČNO prave celice, šele nato uporabi
na pravem dokumentu.

---

# Samodejna sinhronizacija v obe smeri

Vse zgoraj ostane, kot je: nalaganje datoteke in gumba »Uvozi« / »Zapiši
nazaj v Sheets« so še naprej na voljo in so rezerva, kadar sinhronizacija
ne teče ali kadar dokument ni povezan.

Ta razdelek opisuje **samodejno** pot: kar se spremeni v aplikaciji, se
samo od sebe zapiše v Google list, in obratno. Koda je pripravljena; spodaj
so koraki, ki jih **lahko narediš samo ti**, ker gre za tvoj Google račun in
tvoje dokumente.

Kaj je že narejeno in kaj ostane tebi:

| | Kdo |
|---|---|
| tabele, vrsta, sprožilec, obe robni funkciji, skripta za dokument | narejeno |
| storitveni račun v Google Cloud in ključ | **ti (A)** |
| skrivnosti v Supabase | **ti (B)** |
| zagon dveh SQL datotek | **ti (C)** |
| deljenje dokumenta in skripta na njem | **ti (D), za vsak dokument posebej** |

## A – enkrat: storitveni račun (Google Cloud Console)

Storitveni račun je »robotski uporabnik«, s katerim aplikacija piše v
dokument. Uporabnikov Google račun za to ni primeren, ker robna funkcija
teče na strežniku, kjer se nihče ne more prijaviti.

1. Odpri [console.cloud.google.com](https://console.cloud.google.com/) in
   izberi **isti projekt** kot za OAuth Client ID iz koraka 1 zgoraj.
2. **APIs & Services → Library → Google Sheets API → Enable**
   (najbrž je že vklopljen – iz koraka 2 zgoraj).
3. **IAM & Admin → Service Accounts → Create service account**
   - ime: `razpored-sheets-sync`
   - **vlog v projektu NE potrebuje** – korak »Grant this service account
     access« preskoči s **Continue → Done**.
4. Klikni novo ustvarjeni račun → zavihek **Keys → Add key → Create new key
   → JSON → Create**. Prenese se datoteka `*.json`. **Hrani jo kot geslo** –
   kdor jo ima, lahko piše v deljene dokumente.
5. Zapiši si e-poštni naslov računa, oblike
   `razpored-sheets-sync@<projekt>.iam.gserviceaccount.com` – potrebuješ ga
   v koraku D.

## B – enkrat: skrivnosti v Supabase

Supabase → **Project Settings → Edge Functions → Secrets → Add new secret**:

| Ime | Vrednost |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **cela vsebina** JSON datoteke iz A.4 (odpri jo z Beležnico, označi vse, kopiraj) |
| `SHEETS_WEBHOOK_SECRET` | poljubno dolgo naključno geslo (npr. 40 znakov) |
| `SHEETS_CRON_SECRET` | **drugo** naključno geslo |

Ključ nikoli ne gre v repozitorij in nikoli v brskalnik – isti vzorec kot
`VAPID_PRIVATE_KEY` pri potisnih obvestilih.

Nato naloži obe funkciji (v terminalu, iz korena projekta):

```
supabase functions deploy sheets-izhod --no-verify-jwt
supabase functions deploy sheets-vhod  --no-verify-jwt
```

`--no-verify-jwt` je obvezen: klicalca sta `pg_cron` in Google Apps Script,
ki nimata prijavljenega uporabnika. Namesto tega vsak nosi svojo skrivnost
(`x-cron-secret` oz. `x-sheets-secret`), brez katere funkcija vrne 401.

## C – enkrat: SQL v Supabase

Supabase → **SQL Editor → New query**, prilepi in poženi, po vrsti:

1. `supabase/sheets-povezave.sql` – seznam povezanih listov (če si ga
   pognal že prej, ga ni treba znova).
2. `supabase/sheets-sinhronizacija.sql` – vrsta, napake, sprožilec.
3. `supabase/sheets-urnik.sql` – **pred zagonom** v njem zamenjaj
   `TU_VPISI_SHEETS_CRON_SECRET` z vrednostjo iz B.

Vse tri so varne za večkraten zagon.

## D – za VSAK dokument posebej (tudi vsak prihodnji)

Googlov sprožilec je vezan na **en dokument**. Sprožilca, ki bi pokrival več
dokumentov, ni mogoče sprogramirati – to je omejitev Googlove platforme, ne
te aplikacije. Zato je ta korak treba ponoviti pri vsakem novem dokumentu.

1. Odpri dokument → **Deli (Share)** → prilepi e-poštni naslov storitvenega
   računa iz A.5 → izberi **Urejevalec (Editor)** → **odkljukaj
   »Obvesti uporabnike«** → **Pošlji**.
2. **Razširitve → Apps Script.**
3. Vsebino `supabase/apps-script/sinhronizacija.gs` prilepi čez ves
   `Code.gs` (staro vsebino izbriši).
4. Na vrhu zamenjaj **dve vrstici**:
   - `EDGE_URL` → `https://jlvorlzvbaugjfjaodwz.supabase.co/functions/v1/sheets-vhod`
   - `SKRIVNOST` → vrednost `SHEETS_WEBHOOK_SECRET` iz B.
5. Shrani (ikona diskete), nato v spustnem seznamu funkcij izberi
   **`namestiSprozilce`** in klikni **Zaženi**.
   - Ob prvem zagonu Google zahteva potrditev dovoljenj: **Advanced → Go to
     … (unsafe) → Allow**. To je pričakovano, ker skript kliče zunanji
     naslov. »Unsafe« pomeni samo, da skript ni prišel iz Googlove trgovine.
6. Za preizkus izberi funkcijo **`preizkusiPovezavo`** in jo zaženi. Spodaj
   se izpiše odgovor; `"vrsta":"brez_datuma"` ali `"nepovezan_zavihek"`
   pomeni, da naslov in skrivnost delujeta (celica A1 pač ni celica
   razporeda). `HTTP 401` pomeni napačno skrivnost.
7. V aplikaciji: **Generator → Povezani Google listi** → dodaj zavihke tega
   dokumenta in vklopi, kar želiš – ločeno za vsako smer.

## Kaj vklopiti najprej

Privzeto je **vse ugasnjeno**. Priporočen vrstni red:

1. Naredi kopijo dokumenta (**Datoteka → Naredi kopijo**) in vse skupaj
   preizkusi na kopiji.
2. Na pravem dokumentu najprej **Datoteka → Zgodovina različic → Poimenuj
   trenutno različico** (npr. »pred sinhronizacijo«) – to je povrnitvena
   točka, neodvisna od aplikacije.
3. Vklopi **en sam zavihek** (predlagano: `B`) in **eno smer**
   (aplikacija → Sheets). Teden dni opazuj.
4. Šele nato vklopi drugo smer in ostale zavihke.

## Kje vidiš, da deluje

- **Generator → Povezani Google listi** – kaj je vklopljeno.
- **Nerešene napake sinhronizacije** – kar ni bilo mogoče enolično razbrati
  (neznano ime, neznana koda izmene, celica zunaj bloka). Nič se ne popravi
  samodejno in nič se ne zavrže tiho.
- **Revizija** – spremembe, ki jih je prinesel Google list, imajo razlog
  `sheets`; vidi se torej, da jih ni vpisal človek v aplikaciji.

## Česa koda ne more narediti

Piše se **samo v celice, ki jih uvoz tudi bere**. Vrstice, stolpca ali
zavihka ne more dodati, preimenovati ali izbrisati, oblikovanja ne more
spremeniti – uporabljata se izključno klica »preberi vrednosti« in »zapiši
vrednosti«. To preverja preizkus `skripte/preveri-sheets-brez-postavitve.mjs`,
ki pade, če bi kdo tak klic kasneje dodal.

Oseba, ki v listu (še) nima svojega stolpca, in dan, ki ni v nobenem
mesečnem bloku, se **ne zapišeta nikamor** – pojavita se med nerešenimi
napakami.
