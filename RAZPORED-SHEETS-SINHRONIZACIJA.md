# Dvosmerna sinhronizacija Razpored ↔ Google Sheets — NAČRT

> **Status: NAČRT ZA POTRDITEV. Koda še ni napisana.**
> Ta dokument je namenoma napisan PRED kodo, ker gre za bolnišnični
> razpored in za ročno vodene, podpisane uradne dokumente. Prehitro
> vklopljena samodejna sinhronizacija naredi več škode kot koristi.
>
> Preberi predvsem razdelek **0** (kaj sem našel v pravem dokumentu — ena
> stvar spremeni obseg dela) in razdelek **9** (kaj boš moral narediti
> ročno ti). Ko potrdiš, začnem s kodo.

---

## 0. Kaj sem preveril v pravem dokumentu

Dokument **»2026 SMS RAZPORED«**
(`1yf6k6XtGx4Ds20aJjJr7GpkWFznKhwfU1Y-Z8XvA_f4`) sem odprl in prebral
njegove PRAVE zavihke (prek Drive povezave, izvoz v `.xlsx`, razčlenjen z
isto knjižnico `xlsx.core.min.js`, ki jo uporablja aplikacija). Nisem
ugibal po `gid`-ih.

### 0.1 Dokument ima 10 zavihkov, ne 7

| # | Ime zavihka | Kaj je | Sinhronizacija |
|---|---|---|---|
| 1 | `C1` | oddelek C1 | da |
| 2 | `C` | oddelek C | da |
| 3 | `B` | oddelek B | da |
| 4 | `FLEXI` | FLEXI kader | da (posebna oblika) |
| 5 | `D` | oddelek D | da |
| 6 | `E2` | oddelek E2 | da |
| 7 | `E1` | oddelek E1 | da |
| 8 | `KALUP` | legenda/delovni list, brez datumov | **ne** |
| 9 | `kopije` | drobna tabela (`C1 3`, `B 3`, …) | **ne** |
| 10 | `jesen` | osnutek FLEXI za oktober, ime ni koda oddelka | **ne** |

Sedem zavihkov, ki si jih naštel z `gid`-i, se torej ujema s sedmimi
oddelčnimi zavihki. Zadnji trije so ravno tisti, ki jih obstoječi
»pametni uvoz« (`razvrstiListe` v `index.html`) že danes pravilno
preskoči: ime se ne ujema z `PO_ODDELKIH_KODE`, NZV oblike pa v njih ni.
Sinhronizacija bo enako pustila pri miru vse, česar ni v `sheet_connections`.

**Trije popravki tvoje predpostavke:**

1. **NZV v tem dokumentu ni.** Mreža NZV (dan × enota, `PDZN`, `SOBO`,
   `ŽO`, …, `LD`/`IZOB`/`BS`) živi v ločenem dokumentu »Letni dopusti in
   omejitve za NZV«. Ta načrt jo obravnava kot **drugi dokument**, ki se
   doda po istem postopku — ne kot osmi zavihek tega.
2. **Zavihka `A` ni.** Oddelek A ni svoj zavihek; pokrivanje A je zapisano
   kot par stolpcev znotraj `E1`, `E2` in `C` (stolpec z oznako `A` +
   stolpec z izmeno). To je isto, kar `pokriva_oddelek` že pozna.
3. Zavihka `jesen` (FLEXI, oktober) **ne** povežem, dokler ne rečeš —
   po vsebini je osnutek, ne uradna različica.

### 0.2 gid ↔ ime zavihka: namenoma se nanj ne zanašam

`gid`-ov, ki si jih naštel, **nisem mogel preveriti** — omrežna politika
tega okolja ne pusti do `docs.google.com`, Drive izvoz pa `gid`-ov ne
nosi (nosi `sheetId` iz `.xlsx`, kar NI isto). Namesto da bi ugibal,
je načrt zasnovan tako, da **`gid` sploh ni potreben**:

- **Sheets → Aplikacija:** Apps Script pove ime zavihka naravnost
  (`e.source.getActiveSheet().getName()`) — `gid` ne pride nikamor.
- **Aplikacija → Sheets:** Google Sheets API `values.update` naslavlja
  zavihek po **imenu** (`'B'!D12`), ne po `gid`-u. Obstoječa koda `gid`
  potrebuje samo zato, ker ga podtakneš prek povezave iz naslovne vrstice
  (`najdiNaslovLista` v `gsheets-client.js` ga šele prevede v ime).

V tabeli `sheet_connections` je zato **ime zavihka obvezno, `gid` pa
neobvezen** (samo za tvojo orientacijo). S tem izgine tudi past
»povezava kaže na napačen zavihek«, ki je po `GSHEETS-SETUP.md` vzrok
večine dosedanjih napak pri uvozu.

### 0.3 ⚠ Najdba, ki spremeni obseg dela: zavihki se ne začnejo v stolpcu A

To je najpomembnejša stvar v tem dokumentu.

Prava oblika zavihkov (`!ref` iz `.xlsx` izvoza, torej prva zares
uporabljena celica):

| Zavihek | Prva celica | Stolpec z datumom | Stolpec z dnevom | Prvi stolpec osebe | Posebnost |
|---|---|---|---|---|---|
| `C1` | `B1` | **B** | C | D | en blok |
| `C` | `B1` | **B** | C | D | **dva bloka drug ob drugem** (drugi datumski stolpec sredi vrstice) |
| `B` | `C2` | **C** | D | E | en blok, podatki se začnejo v **vrstici 2** |
| `FLEXI` | `B2` | **B** | C | D | pari stolpcev (oddelek + izmena) na osebo |
| `D` | `B1` | **B** | C | D | en blok |
| `E2` | `A1` | **B** | C | D | dva bloka |
| `E1` | `C1` | **C** | D | E | dva bloka |

**Nobeden se ne začne v stolpcu A.**

Zakaj je to pomembno: obstoječi `obdelajOddelekVrstice`/
`pripraviPosodobitveOddelka` iščeta datum v `vrstica[0]` in imena od
`vrstica[2]` naprej. To drži samo, če je stolpec z datumom res prvi v
polju. To pa je odvisno od tega, **kdo je bral list**:

- **Nalaganje `.xlsx` datoteke** (današnja pot »Naloži datoteko
  (samodejno)«): SheetJS reže na `!ref`, zato `C1` pride ven z datumom na
  indeksu 0. Deluje — zato je uvoz iz datoteke doslej deloval.
- **Google Sheets API `values.get` z obsegom `A1:ZZ3000`** (pot, ki jo
  uporablja »Zapiši nazaj v Sheets« in ki jo bo uporabljala tudi
  sinhronizacija): Google vrne vrstice **od stolpca A**, s praznimi
  vodilnimi celicami. Datum zavihka `C1` je tako na indeksu **1**, pri
  `B` in `E1` pa na indeksu **2**.

**Posledica: »Zapiši nazaj v Sheets« na tem dokumentu danes ne more
delovati** — `pripraviPosodobitveOddelka` v nobenem od sedmih zavihkov
ne najde nobenega datuma in konča z napako »V zavihku … ni najdenih
vrstic za …«. To je najbrž razlog, če si to kdaj poskusil in ni šlo.
(Ista past velja za ročni uvoz prek povezave, ker javni CSV izvoz prav
tako začne v stolpcu A.)

**Kaj to pomeni za načrt:** preden se karkoli sinhronizira, je treba v
skupno logiko dodati **eno samo funkcijo za zaznavo zamika**
(`najdiZamikStolpcev`): v prebranih vrsticah poišče stolpec, v katerem
je največ celic videti kot datum, in vrne ta odmik. Vse ostalo
(`obdelajBlok`, `najdiVrsticoImen`, iskanje glave) ostane nedotaknjeno —
dobi samo pravi začetni stolpec namesto trdo zapisane 0.

To je hkrati popravek obstoječega »Zapiši nazaj v Sheets«, ne samo
priprava na novo. Predlagam, da gre v isti korak.

### 0.4 Šifrant izmen: dokument piše besedilo, aplikacija tudi

V listu piše `dopoldan`, `popoldan do 19`, `NOČNA od 19`, `DNEVNA12`,
`KPU`, `LD`. Aplikacija to shrani **dobesedno** v `razpored.shift_code`
in šele ob prikazu prevede prek `window.Izmene.vnos()` v uradno kratico
(`DOP`, `PO5`, `N11`, `DF12`, `KPU`, `LD` — šifrant iz `CLAUDE.md`).

Iz tega sledita dve stvari, ki sta obe vgrajeni v načrt spodaj:

- Primerjava »ali je vrednost že enaka« (zaščita pred zanko, razdelek 3)
  se **ne sme** delati na golem besedilu — `"popoldan "` in `"popoldan"`
  bi se večno lovila. Primerja se **normalizirana kratica**
  (`Izmene.vnos(x)?.[1]`).
- »Neveljavna koda izmene« = `Izmene.vnos()` vrne `null` in celica ni
  prazna in ni `prosto`. Točno to gre v `sync_errors` (razdelek 2).

---

## 1. Smer Aplikacija → Sheets (samodejno)

### 1.1 Zakaj ne neposredno iz webhooka

Supabase Database Webhook se sproži **za vsako vrstico posebej**.
Objava enega meseca za oddelek D je ~300 vrstic → 300 klicev funkcije →
300 zahtev proti Google Sheets API, katerega kvota je ~60 zahtev/min.
Takoj bi zadeli `429`. Zato gre vmes **izhodna vrsta (outbox)**:

```
razpored (INSERT/UPDATE/DELETE)
      │  sprožilec v bazi (ne webhook — glej spodaj)
      ▼
sheet_sync_izhod        ← ena vrstica na spremenjeno celico, status='caka'
      │  pg_cron, vsako minuto
      ▼
Edge Function "sheets-izhod"
      │  združi po (spreadsheet_id, zavihek), en values:batchUpdate na zavihek
      ▼
Google Sheets API  (service account)
```

**Sprožilec v bazi namesto Database Webhooka**, ker sprožilec teče v isti
transakciji kot zapis: če se objava razporeda povrne (rollback), se
povrne tudi vrsta. Webhook prek `pg_net` bi v takem primeru poslal
spremembo, ki se ni zgodila. Sprožilec je tudi lažje omejiti samo na
oddelke, ki so v `sheet_connections` in imajo vklopljeno smer
`app_v_sheets` — vrsta se za nepovezane oddelke sploh ne polni.

Debounce (5–10 s) je s tem rešen sam po sebi: `pg_cron` teče na minuto,
kar je hkrati najmanjši interval, ki ga `pg_cron` podpira. En zagon
naredi **eno** zahtevo `values:batchUpdate` na zavihek, ne glede na to,
ali je v vrsti 1 ali 300 celic. Pri sedmih zavihkih je to 7 zahtev/min
proti kvoti 60.

### 1.2 Kaj funkcija naredi

1. Vzame do `N` (predlog: 500) vrstic iz `sheet_sync_izhod` s
   `status='caka'`, jih označi `status='v_teku'` (`for update skip
   locked`, da se dva zagona ne prekrivata).
2. Združi jih po `(spreadsheet_id, zavihek)`.
3. Za vsak zavihek **prebere trenutno stanje** (`values.get`,
   `A1:ZZ3000`) — ista pot kot `GSheetsExport.preberiVrednosti`, samo z
   žetonom service accounta namesto OAuth žetona uporabnika.
4. Zamik stolpcev zazna z `najdiZamikStolpcev` (razdelek 0.3).
5. Koordinate `(vrstica, stolpec)` izračuna z **obstoječo**
   `pripraviPosodobitveOddelka` / `pripraviPosodobitveNzv` (za FLEXI
   ustrezno različico) — ne s podvojeno logiko. Deljena kopija gre v
   `supabase/functions/_shared/sheets-koordinate.js`, po istem vzorcu kot
   `_shared/delovni-cas.js`, s preizkusom, ki javi razhajanje.
6. **Odvrže vse posodobitve, kjer je normalizirana vrednost v celici že
   enaka** (razdelek 3).
7. Zapiše preostanek z enim `values:batchUpdate`
   (`valueInputOption: USER_ENTERED`), enako kot `zapisiVObstojeciList`.
8. Uspeh → `status='koncano'`. Napaka → `status='napaka'`,
   `poskusi = poskusi + 1`, sporočilo v `sync_errors`. Po 5 neuspehih se
   vrstica neha poskušati in ostane vidna v pregledu (razdelek 5).

### 1.3 Kaj se NIKOLI ne zgodi (obramba postavitve)

- Uporabijo se **samo** koordinate, ki jih vrne
  `pripraviPosodobitveOddelka` — torej samo celice, ki jih uvoz tudi bere.
- Oseba brez svojega stolpca v listu → **ni** zapisana nikamor; gre v
  `sync_errors` kot `brez_stolpca` (danes je tiho izpuščena).
- Datum zunaj bloka → **ni** zapisan; gre v `sync_errors` kot `brez_vrstice`.
- Uporabljata se **izključno** `spreadsheets.values.get` in
  `spreadsheets.values.batchUpdate`. Nikjer `values.append`,
  `batchUpdate` na ravni preglednice (`insertDimension`,
  `updateSheetProperties`, `repeatCell`, `mergeCells`, …), nikjer
  ustvarjanje/preimenovanje zavihkov. To bo **preverjeno s preizkusom**,
  ne samo z obljubo (razdelek 7).
- Service account bo imel dostop **Editor** (pisanje celic to zahteva),
  a ker koda kliče samo `values.*`, oblikovanja, stolpcev in vrstic ne
  more spremeniti niti pomotoma.

---

## 2. Smer Sheets → Aplikacija (samodejno)

### 2.1 Apps Script na vsakem dokumentu

Predloga v repozitoriju: **`supabase/apps-script/sinhronizacija.gs`**
(ena datoteka, brez nastavitev v kodi razen dveh vrstic, ki ju vpišeš ti).

Uporabljen bo **`onChange` z nameščenim sprožilcem**, ne `onEdit`:

- preprosti `onEdit(e)` se ne sproži ob lepljenju več celic naenkrat, ob
  spremembi prek drugega skripta in nima pravice do `UrlFetchApp`;
- nameščeni (installable) `onChange` teče pod tvojim računom, sme klicati
  zunanji naslov in ujame tudi lepljenje bloka celic — kar je pri
  razporedu običajen način urejanja.

Skript pošlje na Edge Function:

```json
{
  "spreadsheet_id": "1yf6…",
  "zavihek": "B",
  "vrstica": 12,          // 1-based, kot v Sheetsu
  "stolpec": 5,           // 1-based (E = 5)
  "nova_vrednost": "dopoldan",
  "urejevalec": "matej.bojic@pb-begunje.si",
  "cas": "2026-09-09T13:55:10.234Z"
}
```

v glavi `x-sheets-secret: <SHEETS_WEBHOOK_SECRET>`. Brez pravilne
skrivnosti funkcija vrne `401` — enako kot `posiljaj-push` s
`x-cron-secret`.

### 2.2 Kaj funkcija naredi

1. Preveri skrivnost.
2. Poišče vrstico v `sheet_connections` po `(spreadsheet_id, zavihek)`.
   Ni je, je `aktivno=false` ali smer `sheets_v_app` ni vklopljena →
   zabeleži v `sync_errors` kot `nepovezan_zavihek` in odgovori `200`
   (Apps Script ne sme dobiti napake, sicer ga Google začne dušiti).
3. Prebere zavihek (`values.get`) in **iz konteksta razbere, kaj celica
   pomeni** — z isto logiko kot uvoz: datum iz stolpca z datumom te
   vrstice, osebo iz glave nad tem stolpcem (`najdiVrsticoImen` +
   `Parafa.kratkoKljuc`/`Imena.kratkiKljuc`).
   Bere se cel zavihek, ne le ena celica, ker je pomen celice odvisen od
   bloka in glave; en `values.get` na dogodek je znotraj kvote.
4. Preveri kodo izmene z `Izmene.vnos()`.
5. `upsert` v `razpored` (oz. `odsotnosti` za NZV stolpce `LD`/`IZOB`/`BS`)
   z `razlog = 'sheets'` — obstoječi stolpec iz `supabase/razlog-spremembe.sql`,
   ki gre naprej v revizijski dnevnik. V dnevniku se bo torej videlo, da
   je spremembo prinesel Sheets, ne človek v aplikaciji.

### 2.3 Kaj gre v `sync_errors` namesto v razpored

| Vrsta | Kdaj |
|---|---|
| `neznano_ime` | glava stolpca se ne ujema z nobeno osebo |
| `dvoumno_ime` | kratko ime se ujema z več osebami (danes že obstaja kot »ujema se z več osebami«) |
| `neznana_koda` | `Izmene.vnos()` vrne `null`, celica pa ni prazna in ni `prosto` |
| `brez_datuma` | urejena vrstica ni znotraj nobenega mesečnega bloka (glava, podpis, opomba) |
| `nepovezan_zavihek` | dokument/zavihek ni v `sheet_connections` |
| `brez_stolpca` / `brez_vrstice` | pri smeri app → sheets (razdelek 1.3) |

Nič od tega se **ne popravi samodejno** in nič se **ne zavrže tiho** —
isto načelo kot današnje poročilo »Brez ujemanja imena« po uvozu.
Pregled bo v `admin.html` (razdelek 6).

---

## 3. Zaščita pred neskončno zanko

**Izbrano: primerjava vrednosti pred zapisom, na OBEH straneh.**
Pred vsakim zapisom se nova vrednost primerja s trenutno; če sta enaki,
se ne zapiše nič.

- App → Sheets: točka 6 v razdelku 1.2 — celica, ki že vsebuje to
  vrednost, izpade iz `batchUpdate`, torej v Sheetsu ni spremembe, torej
  se `onChange` ne sproži.
- Sheets → App: `upsert` se izvede samo, če se `shift_code` v bazi
  razlikuje; sicer ni `UPDATE`, torej se sprožilec ne sproži in vrsta se
  ne napolni.

Primerja se **normalizirana kratica** (`Izmene.vnos(x)?.[1] ?? ""`), ne
golo besedilo — sicer bi se `"popoldan "` in `"popoldan"` lovila v
neskončnost (razdelek 0.4).

**Zakaj to in ne seznam »pravkar zapisano«:**

| | primerjava vrednosti | seznam »pravkar zapisano« (N sekund) |
|---|---|---|
| Stanje med klici | ni ga | potrebuje tabelo ali pomnilnik funkcije |
| Hladen zagon funkcije | ne škodi | pomnilniška različica pozabi seznam → zanka |
| Ura na dveh sistemih | ni pomembna | Google in Supabase morata biti usklajena |
| Sprememba tik po zapisu aplikacije | pravilno se prenese | **tiho se izgubi** (»saj smo to pravkar pisali«) |
| Več povezanih dokumentov | enako deluje | seznam mora ločevati po dokumentu |

Zadnja vrstica je odločilna: pri razporedu je popolnoma običajno, da
koordinator v Sheetsu popravi celico nekaj sekund potem, ko je
aplikacija objavila mesec. Časovni seznam bi tak popravek pojedel.
Primerjava vrednosti pa ustavi zanko **zanesljivo in po definiciji** —
zanka se lahko vrti samo, dokler se vrednost spreminja, in v obeh smereh
piše isto vrednost, zato se ustavi po največ enem krogu.

Poleg tega se ohrani še varovalka: vsak zapis iz smeri Sheets → App nosi
`razlog='sheets'`, sprožilec pa vrstice z `razlog='sheets'` **ne** doda v
izhodno vrsto. To je drugi, neodvisen zapah — če bi primerjava vrednosti
zaradi kakšne oblike zapisa vseeno spodletela, zanka še vedno ne nastane.

---

## 4. Spori (ista celica spremenjena na obeh straneh)

**Pravilo: zmaga zadnji zapis, spor se zabeleži.**

- Smer Sheets → App ob `upsert` primerja `razpored.updated_at` z
  `cas` dogodka iz Apps Scripta. Če je bila vrstica v bazi spremenjena
  **po** trenutku, ko je nastala sprememba v Sheetsu, gre za spor:
  zapis se **vseeno izvede** (Sheets je novejši človeški poseg), v
  `sync_errors` pa gre vrstica `spor` s **staro in novo vrednostjo** ter
  obema časoma.
- Smer App → Sheets: ob branju zavihka (točka 3) se vidi trenutna
  vrednost celice. Če se ta razlikuje **in** od nove **in** od tiste, ki
  je bila v bazi ob polnjenju vrste, je nekdo vmes urejal v Sheetsu →
  zapis se izvede, spor se zabeleži enako.

**Zakaj ne »Sheets vedno zmaga« ali »aplikacija vedno zmaga«:** oba
konca sta legitimna vira (koordinator popravlja v Sheetsu, aplikacija
objavlja generirane mesece in potrjene menjave). Trdo pravilo bi enega
od njiju tiho izničilo. »Zadnji zmaga + zapis spora« ne izgubi nobene
informacije: obe vrednosti in oba časa ostaneta vidna in odločitev je
tvoja, ne moja.

Spor je pričakovano **redek** (ista celica, isti trenutek), zato ne
sme upočasnjevati običajne poti — zato zapis v dnevnik in ne blokada.

---

## 5. Zanesljivost

| Kaj odpove | Kaj se zgodi danes | Kaj se zgodi po tem načrtu |
|---|---|---|
| Apps Script ne pošlje (izpad omrežja, Google kvota) | — | Skript zapiše dogodek v `PropertiesService` in ga poskusi znova ob naslednjem sprožilcu; hkrati vsakodnevni `onOpen`/časovni sprožilec ponovi neposlano. Če tudi to odpove, ostane razlika, ki jo pokaže primerjava (spodaj). |
| Edge Function vrne napako Apps Scriptu | — | Skript vrstico obdrži v svoji čakalni vrsti (isto kot zgoraj). Funkcija vedno odgovori `200`, razen ob napačni skrivnosti — napaka gre v `sync_errors`, ne v Apps Script. |
| `pg_cron` ne teče / funkcija pade | — | Vrstice ostanejo `status='caka'` in gredo v naslednjem zagonu. Nič se ne izgubi, ker vrsta živi v bazi. |
| Google Sheets API vrne `429`/`5xx` | — | `status='napaka'`, `poskusi+1`, ponovni poskus z naraščajočim zamikom (1, 2, 4, 8, 16 min). Po 5 poskusih se ustavi in ostane viden. |
| Zavihek preimenovan / izbrisan | — | `values.get` vrne napako »ni takega zavihka« → `sync_errors` vrsta `zavihek_ni_najden`, povezava se **samodejno pavzira** (`aktivno=false`), da ne trka v prazno vsako minuto. |

**Primerjava (»ali sta strani res enaki«).** Poleg tega gre v načrt
gumb/skripta, ki za izbrani oddelek in mesec prebere obe strani in izpiše
razlike, brez pisanja. To je edini način, da se ugotovi izguba, ki se je
zgodila mimo obeh dnevnikov (npr. nekdo je urejal, ko sprožilec ni bil
nameščen). Poganjaš ga ročno, kadar želiš.

---

## 6. Nastavljiv nabor povezanih listov

### 6.1 Tabela `sheet_connections`

```sql
create table if not exists public.sheet_connections (
  id              uuid primary key default gen_random_uuid(),
  oznaka          text not null,            -- "2026 SMS RAZPORED – B"
  skupina         text not null,            -- 'B','C','C1','D','E1','E2','FLEXI','NZV'
  spreadsheet_id  text not null,
  zavihek         text not null,            -- IME zavihka (ne gid) – glej 0.2
  gid             text,                     -- neobvezno, samo za orientacijo
  oblika          text not null default 'oddelek',   -- 'oddelek' | 'flexi' | 'nzv'
  app_v_sheets    boolean not null default false,
  sheets_v_app    boolean not null default false,
  aktivno         boolean not null default false,    -- privzeto UGASNJENO
  opomba          text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profili(id),
  unique (spreadsheet_id, zavihek)
);
```

Privzetki so namenoma **vse ugasnjeno**: novo vstavljena vrstica ne
začne pisati v uradni dokument, dokler je izrecno ne vklopiš.

RLS po istem vzorcu kot `oddelki`/`minimalna_zasedba` — samo admin:

```sql
alter table public.sheet_connections enable row level security;
create policy sheet_connections_admin on public.sheet_connections
  to authenticated
  using (public.current_role_is('admin'))
  with check (public.current_role_is('admin'));
```

Enak vzorec dobita `sheet_sync_izhod` in `sync_errors` (branje admin,
pisanje samo `service_role` prek Edge Functions).

Obe Edge Functions **vedno bereta to tabelo**. Nikjer v kodi ni
`spreadsheet_id` ali imena zavihka. Nov dokument = nova vrstica.

### 6.2 Kako dodaš vrstico

Oboje, kar si predlagal — ker sta poceni:

1. **`supabase/sheets-povezave.sql`** — po vzorcu ostalih datotek v
   `supabase/` (kopiraj, prilepi v SQL Editor, Run). Vsebuje že
   pripravljene, **zakomentirane** vrstice za vseh 7 zavihkov dokumenta
   »2026 SMS RAZPORED«, od katerih je odkomentiran samo `B` (razdelek 8).
   Za nov dokument odkomentiraš/skopiraš eno vrstico in zamenjaš tri
   vrednosti.
2. **`admin.html` → Nastavitve → »Povezani Google listi«** — preprosta
   tabela z vklopi/izklopi (`aktivno`, obe smeri) in gumbom »Dodaj«.
   Doda malo dela, prihrani pa ti odpiranje SQL Editorja za vsak vklop
   in izklop — kar boš pri uvajanju delal pogosto.

---

## 7. Preizkusi (`skripte/preveri-*.mjs`)

Po obstoječi konvenciji: slovenska imena, `trdi()`/`napake`, izhodna
koda ≠ 0 ob napaki, funkcije **izvlečene iz prave kode**, ne prepisane.

| Skripta | Kaj preveri |
|---|---|
| `preveri-sheets-zamik.mjs` | `najdiZamikStolpcev` na fixture-jih v obliki vseh sedmih pravih zavihkov (datum v stolpcu B oz. C, začetek v vrstici 2, dvojni blok pri `C`/`E1`/`E2`) — in **regresija**: zavihek, ki se res začne v A, da zamik 0 |
| `preveri-sheets-brez-postavitve.mjs` | **statično nad celotno kodo sinhronizacije**: nikjer se ne pojavi `values:append`, `insertDimension`, `deleteDimension`, `appendCells`, `mergeCells`, `updateSheetProperties`, `addSheet`, `repeatCell`, `updateDimensionProperties`; edina Sheets naslova sta `values.get` in `values:batchUpdate`. Namen: da regresija, ki bi dodala vrstico/stolpec, pade v preizkusu, ne na pravem dokumentu |
| `preveri-sheets-zanka.mjs` | zaščita pred zanko: enaka vrednost ne ustvari zapisa (v obeh smereh), `"popoldan "` = `"popoldan"` po normalizaciji, različna vrednost pa se **prenese** (da zaščita ni pretrda); vrstica z `razlog='sheets'` ne pride v izhodno vrsto |
| `preveri-sheets-usmerjanje.mjs` | usmerjanje po `sheet_connections`: pravi `(spreadsheet_id, zavihek)` najde pravo skupino in obliko; neznan dokument/zavihek konča v `sync_errors`, ne v razporedu; `aktivno=false` in izklopljena smer ne naredita ničesar; drugi dokument z **istim imenom zavihka** (`B`) se ne zamenja s prvim |
| `preveri-sheets-ujemanje.mjs` | ujemanje imen in kod: `Imena.kratkiKljuc`/`Parafa.kratkoKljuc` (strešice, `Bećirović`/`Bečirović`), dvoumno kratko ime → `dvoumno_ime`, `Izmene.vnos()` na pravih zapisih iz dokumenta (`dopoldan`, `NOČNA od 19`, `DNEVNA12`, `KPU`, `LD`), neznana koda → `neznana_koda`, `prosto`/prazno pa **ni** napaka |
| `preveri-sheets-deljena-koda.mjs` | `supabase/functions/_shared/sheets-koordinate.js` se ni razšel s kodo v `index.html` (isti vzorec kot `preveri-delovni-cas.mjs`) |

Nova vrstica gre tudi v tabelo v `skripte/README.md`.

Poleg tega poženem obstoječe `preveri-zapis-v-sheets.mjs`,
`preveri-nzv-sheets.mjs`, `preveri-sheets-mreza.mjs`,
`preveri-pametni-uvoz.mjs`, `preveri-flexi-uvoz.mjs` in `npm test`
(vitest v korenu; `skripte/` svojega `npm test` nima), da popravek
zamika ni pokvaril obstoječih poti.

---

## 8. Začetni obseg: samo oddelek `B`

Predlagam **`B`**, ne vseh sedem:

- **najpreprostejša oblika** — en sam blok, brez drugega datumskega
  stolpca sredi vrstice (za razliko od `C`, `E1`, `E2`) in brez parov
  stolpcev (za razliko od `FLEXI`);
- **najmanj celic pod tveganjem** — 6 oseb (`ROZMAN A.`, `SVETINA S.`,
  `REJC J.`, `DOLAR T.`, `VOVK U.`, `ROZMAN K.`) × ~30 dni ≈ 180 celic
  na mesec;
- **najmanj pogosto spreminjan** — kot edini zavihek je razpisan daleč
  naprej (september 2026 → februar 2027), kar kaže na ustaljeno rotacijo;
- **hkrati pa ni pretirano prijazen primer**: zavihek `B` se začne v
  `C2`, torej takoj preizkusi zaznavo zamika iz razdelka 0.3. Če deluje
  na `B`, bo delovala povsod.

**Postopek uvajanja:**

1. V Google Sheets: **Datoteka → Naredi kopijo** dokumenta »2026 SMS
   RAZPORED«. Ista previdnost, kot jo `GSHEETS-SETUP.md` že priporoča za
   »Zapiši nazaj v Sheets«.
2. `sheet_connections` dobi **eno** vrstico: kopija, zavihek `B`, obe
   smeri, `aktivno=true`.
3. Preizkusiva skupaj: sprememba v aplikaciji → se pojavi v kopiji;
   sprememba v kopiji → se pojavi v aplikaciji; obakrat preveriva, da se
   **nič drugega** v listu ni premaknilo (razdelek 10).
4. Šele po tvoji potrditvi: `spreadsheet_id` prestavim na **pravi**
   dokument, še vedno samo zavihek `B`.
5. Nato po enem zavihku naprej — predlagam vrstni red
   `B` → `D` → `C1` → `E1` → `E2` → `C` → `FLEXI`
   (od najpreprostejše oblike proti najzapletenejši).
6. NZV dokument (»Letni dopusti in omejitve za NZV«) kot **drugi
   dokument**, po istem kontrolnem seznamu.

---

## 9. Kaj boš moral narediti ročno ti

Tega ne morem narediti namesto tebe — gre za tvoj Google račun in tvoje
dokumente. Natančen, po korakih razpisan seznam gre v `GSHEETS-SETUP.md`;
tu je pregled, da veš, na kaj pristajaš.

### 9.1 Enkrat (Google Cloud Console)

1. Isti projekt kot za obstoječi OAuth Client ID (»Razpored PBB«).
2. **Enable** `Google Sheets API` (verjetno že je).
3. **IAM & Admin → Service Accounts → Create** — npr.
   `razpored-sheets-sync`. Vloge v projektu **ne potrebuje** nobene.
4. Na njem **Keys → Add key → Create new key → JSON** → prenese se
   datoteka. Zapiši si e-poštni naslov računa
   (`…@….iam.gserviceaccount.com`).
5. Supabase → Edge Functions → Secrets:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = **celotna vsebina** JSON datoteke,
   - `SHEETS_WEBHOOK_SECRET` = poljubno dolgo naključno geslo,
   - `SHEETS_CRON_SECRET` = drugo naključno geslo.
   Ključ nikoli ne gre v repozitorij in nikoli v kodo brskalnika — isti
   vzorec kot `VAPID_PRIVATE_KEY` v `posiljaj-push`.

### 9.2 Enkrat (Supabase)

Poženeš dve SQL datoteki iz `supabase/` (kopiraj → SQL Editor → Run,
kot doslej): `sheets-sinhronizacija.sql` (tabele, RLS, sprožilec) in
`sheets-urnik.sql` (`pg_cron` opravilo, po vzorcu `urnik-obvestil.sql`).

### 9.3 Za VSAK dokument posebej (tudi vsak prihodnji)

Google Apps Script sprožilec je vezan na **en dokument**. To je omejitev
Googlove platforme — sprožilca, ki bi pokrival več dokumentov, ni mogoče
sprogramirati, ne glede na to, kako je napisana koda. **Vsak nov
dokument torej zahteva tale ročni korak s tvoje strani:**

1. Odpri dokument → **Deli (Share)** → dodaj e-poštni naslov service
   accounta iz 9.1.4 kot **Urejevalec (Editor)** → **pošlji brez
   obvestila**.
2. **Razširitve → Apps Script**.
3. Prilepi vsebino `supabase/apps-script/sinhronizacija.gs` (celotno,
   prepiši `Code.gs`).
4. Na vrhu skripta zamenjaj dve vrstici: naslov Edge Function in
   `SHEETS_WEBHOOK_SECRET`.
5. **Sprožilci (ura levo) → Dodaj sprožilec:**
   funkcija `obObremembi`, vir **Iz preglednice**, vrsta **Ob spremembi**.
6. Prvi zagon zahteva tvojo potrditev dovoljenj (»Advanced → Go to …«) —
   pričakovano, ker skript kliče zunanji naslov.
7. V aplikaciji (`admin.html` → Povezani Google listi) ali s SQL vrstico
   dodaj zavihke tega dokumenta in jih vklopi.

Kontrolni seznam bo v `GSHEETS-SETUP.md` kot **kopirljiv seznam**, da ga
delaš sam, brez mene.

### 9.4 Kar ostane nespremenjeno

Obstoječi ročni poti — »📥 Uvoz razporeda« (nalaganje datoteke) in
»📤 Zapiši nazaj v Sheets« (na gumb) — **ostaneta**. Sta rezerva, kadar
sinhronizacija ne teče ali kadar dokument ni povezan. Iz
`GSHEETS-SETUP.md` se ne odstrani nič; nova pot se doda kot ločen
razdelek.

---

## 10. Kako se prepričaš, da deluje in da postavitev ni spremenjena

1. **Pred prvim vklopom** v kopiji dokumenta: **Datoteka → Zgodovina
   različic → Poimenuj trenutno različico** (npr. »pred sinhronizacijo«).
   To je tvoja povrnitvena točka, neodvisna od aplikacije.
2. **App → Sheets:** v aplikaciji spremeni eno celico oddelka `B`.
   V največ ~1 minuti (naslednji `pg_cron`) se mora spremeniti **točno
   ena** celica v listu.
3. **Sheets → App:** v listu spremeni eno celico. V nekaj sekundah se
   mora spremeniti v aplikaciji, v revizijskem dnevniku pa mora pisati
   `razlog: sheets`.
4. **Zanka:** po obeh preizkusih počakaj minuto in poglej
   `sheet_sync_izhod` — ne sme rasti. Rastoča vrsta ob mirujočem
   dokumentu je znak zanke.
5. **Postavitev:** **Zgodovina različic → Prikaži zgodovino različic** in
   odpri različico po sinhronizaciji. Google obarva **vsako** spremenjeno
   celico. Obarvane smejo biti **samo celice razporeda**. Če je obarvana
   glava, podpisni blok, legenda ali robna celica, gre za napako —
   povrni različico in mi povej.
6. **Število stolpcev in vrstic:** zapiši si zadnji uporabljeni stolpec
   in vrstico pred vklopom (npr. `B` = `K496`). Po enem tednu
   sinhronizacije morata biti enaka. `values.update` ju po definiciji ne
   more povečati, a je to poceni preverba.
7. **Napake:** `admin.html` → Povezani Google listi → »Neujemanja« mora
   ostati prazen ali vsebovati samo pričakovana neujemanja (npr. stolpec
   `DODATNO C/E2 7-19` v zavihku `C`, ki namenoma ni oseba).

---

## 11. Kaj potrebujem od tebe, preden začnem

1. **Potrditev načrta** kot celote.
2. **Potrditev, da popravek zamika stolpcev (0.3) gre v isti korak** —
   brez njega ne deluje ne nova sinhronizacija ne obstoječi »Zapiši nazaj
   v Sheets« na tem dokumentu.
3. **Potrditev pilotnega oddelka `B`** (ali izbira drugega — če veš, da
   se `B` v resnici spreminja pogosteje, kot kaže, je `D` enako dobra
   izbira: en blok, brez FLEXI parov).
4. **Ali želiš tudi razdelek v `admin.html`** (6.2, točka 2), ali za
   začetek zadošča SQL datoteka.
5. Nič od 9.1–9.3 **ni** treba narediti zdaj — to pride, ko bo koda
   napisana in preizkušena.
