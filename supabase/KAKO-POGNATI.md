# Kako pognati SQL v Supabase (tudi s telefona)

Vse datoteke s končnico `.sql` v tej mapi se poganjajo enako: **kopiraš
celotno vsebino datoteke, prilepiš v Supabase SQL Editor in klikneš Run.**

## Na telefonu — najlažja pot

1. Odpri datoteko na GitHubu **v brskalniku** (ne v aplikaciji GitHub).
2. Nad besedilom datoteke je vrstica ikon. Tapni ikono **kvadratkov
   (»Copy raw file«)** — z enim dotikom se kopira celotna datoteka. Ni
   treba označevati besedila s prstom.
3. Odpri [supabase.com](https://supabase.com) → prijava → projekt
   **razpored** → v levem meniju **SQL Editor** → **New query**.
4. Dolgo pritisni v prazno polje → **Prilepi**.
5. Klikni **Run** (ali Ctrl/Cmd + Enter).
6. Rezultat se izpiše spodaj. Če piše `Success. No rows returned`, je ukaz
   opravljen in ni imel česa vrniti — to ni napaka.

Če »Copy raw file« ne najdeš, tapni **Raw**, nato dolgo pritisni besedilo →
**Izberi vse** → **Kopiraj**.

## Vrstni red — kar še ni pognano

| Datoteka | Kaj naredi |
|---|---|
| `1-PREGLED-KDO-BO-IZBRISAN.sql` | **Samo pokaže**, koga bo izbris odnesel. Ničesar ne spremeni. |
| `2-IZBRISI-IN-POPRAVI.sql` | Popravi bazo in **trajno izbriše** štiri nekdanje zaposlene. |
| `ZAZENI-VSE.sql` | Imena v obliki »Priimek Ime«, matične številke, dežurni kader. |
| `dezurna-pravila.sql` | Samo če se v Imeniku ne pokaže pravilo »1 dežurstvo med tednom«. |

Datoteko 2 poženi šele, ko si v izpisu datoteke 1 preveril seznam — izbris
je dokončen in podatkov ni mogoče povrniti.

## Kaj naj piše na koncu

`2-IZBRISI-IN-POPRAVI.sql` se konča s **preverbo**. Zadnja tabela v izpisu
mora biti **prazna (0 vrstic)**. Če vrne kakšno vrstico, v stolpcu `kje`
piše, v kateri tabeli je ime še ostalo — pošlji ta izpis naprej.

## Pogosta vprašanja

**Ali lahko datoteko poženem dvakrat?** Da. Vse datoteke v tej mapi so
napisane tako, da drugi zagon ne pokvari ničesar — samo ne naredi nič
novega. Pri datoteki 2 bo drugi zagon izpisal same ničle.

**Ali moram označiti del besedila?** Ne. Če v urejevalniku nič ni
označeno, Supabase požene vse, kar je v polju, po vrsti od vrha navzdol.
Če pa je kaj označeno, požene **samo označeno** — zato pazi, da po
lepljenju ni ostalo nič označeno.

**Zakaj je vsak ukaz tako dolg in se seznam imen ponavlja?** Ker v Supabase
SQL Editorju vsak ukaz lahko dobi svojo sejo, začasne tabele pa med ukazi
ne preživijo. Vsak ukaz mora zato stati sam zase.

**Kaj pa `schema.sql`?** Tega ni treba poganjati — je popis celotne baze,
ne navodilo. Kar je iz njega novega, je vključeno v datoteko 2.
