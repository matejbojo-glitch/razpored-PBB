# generate_schedule.py — samostojen CP-SAT generator razporeda (A/B/C/C1/D/E1/E2)

To je **samostojen Python skript, ločen od spletne aplikacije** (ne bere/piše
v Supabase, ne teče v brskalniku) — rešuje mesečno razporejanje SMS/FLEXI
kadra po oddelkih kot problem omejitev (constraint programming, OR-Tools
CP-SAT), z DMS/Admin koordinatorji razporejenimi deterministično
(fixed_morning). Vikendi/prazniki uporabljajo 12-urne izmene (Dnevna
12/Nočna 12) namesto običajnih treh (Dopoldan/Popoldan/Nočna).

## Namestitev in zagon

```bash
pip install -r requirements.txt
python3 generate_schedule.py
```

Mesec/leto se nastavita s konstantama `MESEC`/`LETO` na vrhu datoteke
(privzeto oktober 2026) — ne z ukazno vrstico. Rezultat: `urnik_rezultat.xlsx`
z enim zavihkom na oddelek (vrstice = dnevi v mesecu, stolpci = osebe).

## Kako se to razlikuje od spletne aplikacije (admin.html)

Spletna aplikacija ima dva ločena, preprostejša generatorja:
- **Kalup** (SMS/TZN) — 5-tedenska rotacija po fiksnem vzorcu (A–E črke).
- **Dežurstva** (DMS/DZN) — pravičnostni "kdo ima najmanj dežurstev" algoritem.

Ta skript namesto tega rešuje **eno samo, veliko** omejitveno nalogo za vse
oddelke A–E2 hkrati (šteto po spolu, vlogi DMS/SMS/FLEXI, urnih omejitvah,
počitku po nočni, vikend/praznik 12-urne izmene …) — natančnejše, a tudi
počasnejše in bolj kompleksno. **Ni (še) povezan** z admin.html/Supabase; če
ga želiš tja vgraditi (npr. kot nov zavihek, ki kliče ta model prek
zalednega API-ja), povej — to bi zahtevalo pravi strežniški del (Python ne
teče v statični brskalniški aplikaciji), kar je večja arhitekturna sprememba.

## Kako so razrešena vprašanja iz prejšnje različice

- **Vikend/praznik**: DNEVNA12/NOČNA12 namesto DOPOLDNE/POPOLDNE/PONOČI.
  DNEVNA12 potreba = max(dopoldanska, popoldanska) potreba tega oddelka,
  razen C/E2, kjer je DNEVNA12 pokrita z natanko 1 FLEXI osebo (brez
  ločenega rednega SMS mesta). NOČNA12 potreba = PONOČI potreba.
- **Oddelek A / PONOČI in vikend "shared_from" B/E1**: modelirano kot
  mesečna rotacija — nočno/vikend stražo za A izmenično "mimogrede" pokriva
  B ali E1 (začetek: avgust 2026 = B), označeno z "(+A)" ob izmeni v
  urniku pokrivajočega oddelka.
- **FLEXI Misotič Rebeka (MIS) in Sofrić Nikolina (SOF)**: od oktobra 2026
  naprej sta redni del FLEXI bazena (prej "poletni FLEXI").
- **Substitucija**: `SUBSTITUTE_MAP` + `handle_absence()` — ob odsotnosti
  DMS vodje samodejno zamenja njeno celico z nadomestno osebo; za SMS/turnus
  osebje (brez definiranega nadomestila v JSON) označi "ODSOTEN - ROČNO
  NADOMESTI".

## Še odprto (glej tudi komentarje na vrhu `generate_schedule.py`)

- **Oddelek A dopoldne/popoldne**: v podatkih je samo Maja Vrevc kot SMS
  (max 6h/dan → kvečjemu ena izmena na dan) — model jo razporedi na eno od
  dveh, druga ostane brez posebne SMS osebe (v podatkih ni druge osebe za
  oddelek A).
- **C1 "1 SMS + Gazibara Aldin"**: uveljavljeno kot "2 moška SMS" (kar C1
  kader v podatkih tako ali tako izpolnjuje), BREZ prisile, da je Gazibara
  vedno eden od njiju — nejasno, ali je to mišljeno kot trdo pravilo.

Če katero od teh natančneje opišeš, lahko dopolnim model.
