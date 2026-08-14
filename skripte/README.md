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

`preveri-izbris-osebe.mjs` se sam preskoči (izhod 0), če PostgreSQL ni na
voljo — ni pa nadomestila zanj: vse tri napake, ki jih lovi, so bile vidne
šele ob zagonu proti pravi bazi, ne z branjem kode.

`preveri-zapis-v-sheets.mjs` je odkril resnično napako (ne le preveril
pravilnost): prazna vrstica SREDI mesečnega bloka (npr. presledek med
tedni) je doslej nepovratno prekinila `obdelajBlok` — vsi dnevi ZA njo so
tiho izpadli iz uvoza/zapisa. Ista funkcija se uporablja tako za uvoz
(`uvoziOddelek`/`uvoziNzv`) kot za pisanje nazaj, zato popravek velja za
oboje.
