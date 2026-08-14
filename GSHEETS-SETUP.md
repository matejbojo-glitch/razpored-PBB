# Google Sheets izvoz — enkratna nastavitev

Gumb "📗 Izvozi v Google Sheets" (na vseh straneh z razpredelnicami) ustvari
**nov Google Sheets dokument** naravnost v tvojem Google Drive, vsakič ko ga
klikneš — brez ročnega nalaganja datotek. To zahteva, da Google pozna to
aplikacijo: potrebuje **OAuth Client ID**, ki ga lahko ustvari samo lastnik
Google računa/domene (jaz tega ne morem narediti namesto tebe — to ni tajen
podatek kot service_role ključ, je pa vseeno vezan na tvoj Google Cloud
račun).

Gumb "⬇ Izvozi v Excel" na isti vrstici **ne potrebuje ničesar od spodaj** —
deluje takoj, brez nastavitve (prava `.xlsx` datoteka, prenesena lokalno).

## Korak 1 — Google Cloud projekt

1. Pojdi na [console.cloud.google.com](https://console.cloud.google.com).
2. Zgoraj klikni izbirnik projekta → **"New Project"** (ali izberi
   obstoječega, če ga bolnišnica že ima za drug namen).
3. Poimenuj ga npr. "Razpored PBB" in počakaj, da se ustvari.

## Korak 2 — omogoči Google Sheets API

1. V levem meniju: **"APIs & Services" → "Library"**.
2. Poišči **"Google Sheets API"** in klikni **"Enable"**.

## Korak 3 — OAuth soglasni zaslon (consent screen)

1. **"APIs & Services" → "OAuth consent screen"**.
2. Če je bolnišnica na **Google Workspace** domeni (e-pošte `@pb-begunje.si`
   gostuje Google) — izberi **"Internal"**. To pomeni, da samo osebe znotraj
   vaše domene lahko uporabljajo izvoz, in Google NE prikaže opozorila
   "unverified app".
3. Če domena ni na Google Workspace (ali nisi prepričan) — izberi
   **"External"** in tip uporabnikov **"Testing"**, nato pod "Test users"
   dodaj e-poštne naslove vseh administratorjev/vodij, ki bodo uporabljali
   izvoz (samo dodani naslovi lahko potrdijo dostop). Google bo pri prijavi
   pokazal opozorilo "Google hasn't verified this app" — to je pričakovano
   za interno orodje in ni nevarno, klikneš "Advanced" → "Go to Razpored PBB
   (unsafe)" (Google tako poimenuje vsako neuradno preverjeno aplikacijo).
4. Izpolni obvezna polja (ime aplikacije: "Razpored PBB", e-pošta za podporo:
   tvoja).

## Korak 4 — ustvari OAuth Client ID

1. **"APIs & Services" → "Credentials" → "Create Credentials" → "OAuth
   client ID"**.
2. Vrsta aplikacije: **"Web application"**.
3. Pod **"Authorized JavaScript origins"** klikni "Add URI" in dodaj natanko:
   ```
   https://razpored.netlify.app
   ```
   (brez poševnice na koncu). Če aplikacijo testiraš tudi drugje (npr.
   deploy-preview naslov na Netlify), dodaj tudi tisti naslov — sicer Google
   prijavo tam zavrne.
4. Klikni **"Create"**. Prikaže se **Client ID** (dolg niz, konča se na
   `.apps.googleusercontent.com`) — to je edino, kar potrebujem, NI tajno
   (varno je v kodi brskalnika, enako kot že obstoječi Supabase `anon`
   ključ).

## Korak 5 — vpiši Client ID v kodo

Odpri `gsheets-client.js` v korenu repozitorija, najdi vrstico:
```js
var CLIENT_ID = ""; // <-- sem prilepi svoj Google OAuth Client ID
```
in med narekovaje prilepi svoj Client ID. Shrani, commitaj, pošlji mi (ali
mi samo prilepi Client ID v pogovor in ga vnesem jaz).

## Kaj se zgodi ob prvem kliku "Izvozi v Google Sheets"

Google prikaže standardno prijavno okno (izbira Google računa → soglasje za
"Google Sheets: See, edit, create, and delete your spreadsheets") — vsaka
oseba to potrdi enkrat na sejo. Po potrditvi se ustvari nov dokument v
Google Drive **te osebe** (ne skupnega admin računa) — vsak izvoz je torej
last tistega, ki je kliknil gumb; deliš ga naprej ročno (Google Sheets →
"Share"), kot vsak drug dokument.

## Preverjanje

Po vnosu Client ID-ja odpri poljubno stran z gumbom (npr. Imenik) in klikni
"Izvozi v Google Sheets" — pojavi se Google prijavno okno namesto
sporočila "Izvoz v Google Sheets še ni nastavljen".

## Uvoz iz Google Sheets IN pisanje nazaj — pravi zavihek je nujen

Na strani **Razpored → Po oddelkih** (admin) je poleg izvoza tudi:
- **📥 Uvozi Oddelki** — prebere razpored iz Google Sheets dokumenta v
  aplikacijo (samo javno deljeni dokument, "Vsak s povezavo lahko ogleda" —
  brez prijave, drugačna pot kot izvoz zgoraj).
- **📤 Zapiši nazaj v Sheets** — obratna smer: trenutno stanje iz aplikacije
  zapiše nazaj v **obstoječ** dokument (potrebuje Google prijavo, ker piše,
  ne samo bere). Piše **samo v celice, ki jih tudi uvoz prebere** — ime osebe,
  oblika, podpisni blok in drugi meseci v istem zavihku ostanejo nedotaknjeni.
  Nikoli ne doda novega stolpca/vrstice — če oseba v listu (še) nima svojega
  stolpca, se tiho izpusti (javi se kot "brez ujemanja imena"). Deluje tudi za
  NZV (glej spodaj).

### NZV — dan × enota (ne dan × oseba)

Stran **Razpored → NZV** ima drugačno obliko kot navadni oddelki: stolpci so
organizacijske ENOTE (PDZN, SOBO, ŽO, E1, E2, D, MO, B, C, C1, PO, A, B1/B2,
DB, SA DOP, SA POP, URGENCA, U2), ne osebe — celica pove, KDO (parafa) to
enoto pokriva ta dan. Zadnji trije stolpci, **LD / IZOB / BS**, niso enote,
ampak povzetek odsotnosti tega dne (letni dopust / strokovno izobraževanje /
bolniška) — isti vir podatkov kot Želje → Razpredelnica. Uvoz teh treh
stolpcev zato piše v drugo tabelo (odsotnosti) kot ostale enote (razpored) —
to je notranja podrobnost, v Sheets dokumentu pa je vseeno, videti je kot en
sam sklop stolpcev v isti vrstici.

"Uvozi NZV" in "Zapiši nazaj v Sheets" pri NZV veljata za isti dokument/list
kot "Letni dopusti in omejitve za NZV" — velja ista past z zavihki/gid kot
zgoraj (klikni pravi zavihek/mesec, šele nato kopiraj povezavo).

**Za oboje velja ista past, ki je vzrok večine "ni najdenih vrstic"/"nobeno
ime se ni ujemalo" napak pri dokumentu z več zavihki (en na oddelek, kot
"2026 SMS RAZPORED"):** povezava v naslovnem polju MORA kazati na zavihek
TEGA oddelka, kar pomeni v naslovni vrstici brskalnika `#gid=…`. Če samo
odpreš dokument in kopiraš povezavo iz naslovne vrstice, ne da bi prej
kliknil zavihek na dnu (npr. "C1"), povezava kaže na PRVI zavihek v
dokumentu (običajno tisti, ki je bil ustvarjen prvi) — uvoz/zapis potem
tiho bere/piše napačen oddelek.

**Postopek, ki deluje zanesljivo:**
1. V Google Sheets klikni zavihek za ta oddelek (dno zaslona).
2. Šele PO TEM kopiraj naslov iz naslovne vrstice brskalnika.
3. To povezavo prilepi v aplikacijo — vsak oddelek/gumb si svojo povezavo
   zapomni posebej, zato to storiš enkrat na oddelek.

### Preden prvič uporabiš "Zapiši nazaj v Sheets" na PRAVEM dokumentu

Funkcija piše v ročno voden, podpisan uradni dokument brez možnosti
razveljavitve v aplikaciji (Google Sheets ima svojo "Zgodovina različic" -
File → Version history - ki lahko povrne prejšnje stanje, če bi kaj šlo
narobe, a to je ročno dejanje, ne gumb v tej aplikaciji). Priporočam:
naredi kopijo dokumenta (File → Make a copy), preizkusi "Zapiši nazaj" na
kopiji in preveri, da so se spremenile TOČNO prave celice, šele nato uporabi
na pravem dokumentu.
