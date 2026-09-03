# Šifrant izmen

Ure izmen so na **enem samem mestu** – `delovni-cas.js`. Od tam jih berejo
razpored, obračun ur v zavihku Plače, preverjanje delovnopravnih pravil in
koledarska naročnina, zato se prikaz in obračun ne moreta razíti.

| Šifra | Od–do | Ur | Nočna |
|---|---|---|---|
| `dopoldan` | 05:50–14:00 | 8:10 | ne |
| `popoldan` | 13:50–21:00 | 7:10 | ne |
| `popoldan do 19` / `popoldan do 19h` | 13:50–19:00 | 5:10 | ne |
| `NOČNA` | 20:50–06:00 | 9:10 | da |
| `NOČNA od 19` / `NOČNA od 19h` | 18:50–06:00 | 11:10 | da |
| `NOČNA12` | 17:50–06:00 | 12:10 | da |
| `DNEVNA12` | 05:50–18:00 | 12:10 | ne |
| `DNEVNA12F` | 07:00–19:00 | 12:00 | ne |
| `DEŽURSTVO` | 15:30–07:00 | – | da |

Odsotnosti in prosto (`LD`, `KPU`, `BS`, `STI`, `POR`, `KRO`, `POMOČ DRUGJE`,
prazno) niso delo – ne štejejo v ure niti v počitek med izmenama.

`KRO` (**kroženje**) je posebnost: oseba tisti dan **dela**, a po razporedu
**drugega oddelka**. V obračunu ur zato šteje kot poln delovni dan (8 h),
med pravila počitka pa ne gre – časa tiste izmene matični razpored ne
pozna, zato bi vsaka predpostavka o njem lažno sprožila ali potlačila
pravilo o 11-urnem počitku. V zasedbo izmen matičnega oddelka `KRO` ne
šteje. Vpisuje se v **Želje → Razpredelnica** (kot `LD`/`BS`/`STI`),
generator pa zanj poišče nadomestilo.

---

## Zakaj sta dnevni 12-urni izmeni dve

To je bil najdlje odprt razhod v podatkih, zato je zapisan tu:

- **`DNEVNA12` (05:50–18:00)** je oddelčna. Začne se ob 05:50 in konča ob
  18:00, ker ob 17:50 nastopi `NOČNA12` – enak vzorec 10-minutne predaje
  kot pri vseh ostalih oddelčnih izmenah. Dejansko traja **12 h 10 min**.
- **`DNEVNA12F` (07:00–19:00)** je flexi (od tod „F"). Traja **točno 12 h**,
  brez predaje.

Uradna legenda „Razpored delovnega časa – Služba za ZN in oskrbo" ju je
navajala pod enim samim imenom „Dnevna 12" z urami **07:00–19:00**,
aplikacija pa je uporabljala **05:50–18:00** in obračunavala 12,00 h.
Od tod dolgotrajno neujemanje **12,00 : 12,17** v izvozu za plače.

Ker je `DNEVNA12` v resnici 12 h 10 min, je bil obračun **prenizek za
10 minut na izmeno**.

## Zapis v Google Sheets

Šifra se poišče **brez presledkov in ne glede na velikost črk**, zato so
`DNEVNA12F`, `DNEVNA 12F`, `dnevna 12 f` ista izmena. To je namerno:
razpored se uvaža iz Sheets, kjer isto izmeno vsak zapiše nekoliko
drugače, neujemajoč zapis pa bi tiho izpadel iz obračuna ur in iz
preverjanja počitka.

## Ob spremembi ur

1. Popravi **samo** `delovni-cas.js`.
2. `cp delovni-cas.js supabase/functions/_shared/`
3. `node skripte/preveri-delovni-cas.mjs` – mora izpisati OK.
4. `supabase functions deploy koledar --no-verify-jwt`
5. Dvigni verzijo predpomnilnika v `sw.js`, sicer zaposleni še naprej
   vidijo stare ure.

Korak 2 ni podvajanje iz malomarnosti: `supabase functions deploy` naloži
samo drevo `supabase/functions/`, zato robna funkcija ne more uvoziti
datoteke iz korena repozitorija. Skripta iz koraka 3 javi razhajanje z
izhodno kodo 1 – razhajanje bi pomenilo, da koledar kaže druge ure kot
aplikacija.
