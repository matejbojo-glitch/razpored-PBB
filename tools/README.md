# generate_schedule.py — samostojen CP-SAT generator razporeda (A/B/C/C1/D/E1/E2)

To je **samostojen Python skript, ločen od spletne aplikacije** (ne bere/piše
v Supabase, ne teče v brskalniku) — ustvarjen na izrecno zahtevo, po
priloženem `schedule_data.json` in natančnem naboru pravil. Rešuje mesečno
razporejanje SMS/FLEXI kadra po oddelkih kot problem omejitev (constraint
programming, OR-Tools CP-SAT), z DMS/Admin koordinatorji razporejenimi
deterministično (fixed_morning).

## Namestitev in zagon

```bash
pip install -r requirements.txt
python3 generate_schedule.py --start 2026-10-01 --end 2026-10-31
```

Rezultat: `urnik_rezultat.xlsx` z zavihki "Vsi vnosi", enim na oddelek, enim
na osebo in "Opozorila" (nezasedena mesta, če jih model ne more zapolniti z
razpoložljivim kadrom v podatkih).

## Kako se to razlikuje od spletne aplikacije (admin.html)

Spletna aplikacija ima dva ločena, preprostejša generatorja:
- **Kalup** (SMS/TZN) — 5-tedenska rotacija po fiksnem vzorcu (A–E črke).
- **Dežurstva** (DMS/DZN) — pravičnostni "kdo ima najmanj dežurstev" algoritem.

Ta skript namesto tega rešuje **eno samo, veliko** omejitveno nalogo za vse
oddelke A–E2 hkrati (šteto po spolu, vlogi DMS/SMS/FLEXI, urnih omejitvah,
počitku po nočni …) — natančnejše, a tudi počasnejše in bolj kompleksno.
**Ni (še) povezan** z admin.html/Supabase; če ga želiš tja vgraditi (npr. kot
nov zavihek, ki kliče ta model prek zalednega API-ja), povej — to bi
zahtevalo pravi strežniški del (Python ne teče v statični brskalniški
aplikaciji), kar je večja arhitekturna sprememba.

## Znane poenostavitve (glej tudi komentarje na vrhu `generate_schedule.py`)

- **Oddelek A**: v podatkih je samo Maja Vrevc kot SMS, a zahteva je 1 SMS
  za DOPOLDNE IN 1 SMS za POPOLDNE vsak dan — enega od dveh vedno manjka
  (izpisano kot opozorilo). V podatkih ni druge osebe za oddelek A.
- **A/PONOČI "shared_from" B/E1**: ni modelirano kot ločena obveznost —
  nejasno je natančno pravilo, po katerem naj CP izbere osebo iz B/E1.
- **C1 "1 SMS + Gazibara Aldin"**: uveljavljeno kot "2 moška SMS" (kar C1
  kader v podatkih tako ali tako izpolnjuje), BREZ prisile, da je Gazibara
  vedno eden od njiju — nejasno, ali je to mišljeno kot trdo pravilo.
- **FLEXI "can_cover_night_on_absence"**: ni uveljavljeno — v podatkih ni
  konkretnega koledarja odsotnosti, ki bi sprožil izjemo.

Če katero od teh natančneje opišeš (ali priložiš dejanski koledar
odsotnosti), lahko dopolnim model.
