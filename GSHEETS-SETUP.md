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
