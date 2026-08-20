# Načrt prehoda na Prisma – analiza in predlog

Dokument odgovarja na vprašanje "ali in kako preiti na Prisma shemo". Ni izvedba;
je podlaga za odločitev. Vse številke spodaj so prešteti iz repozitorija, ne ocenjene.

> **Posodobitev:** Možnost A (§5) je izvedena – glej [`prisma/`](prisma/) v korenu
> repozitorija. `prisma/schema.prisma` je preverjen proti resnični kopiji baze
> (`prisma migrate diff` vrne prazno razliko), aplikacija pa ga ne uporablja –
> brskalnik še naprej dela naravnost s Supabase, RLS ostaja edina avtorizacija.
> Podrobnosti in navodila v [`prisma/README.md`](prisma/README.md).

---

## 1. Kje smo danes

| Kaj | Koliko |
|---|---|
| Tabele v Supabase | **21** |
| RLS politike (avtorizacija v bazi) | **42** |
| `security definer` funkcije | **31** |
| RPC klici, dostopni odjemalcu | **17** |
| HTML strani | **9** |
| Neposredni klici v bazo iz brskalnika (`client.from` / `.rpc`) | **114** |
| Skupaj vrstic kode | ~13 400 |

Arhitektura: statični HTML + React prek Babla **v brskalniku**, brez build koraka.
Brskalnik se pogovarja naravnost s Supabase; avtorizacijo vsiljuje **baza** (RLS).
Gostovanje je statično (Netlify), strežnika ni.

---

## 2. Kaj Prisma dejansko spremeni

Prisma je ORM, ki **teče na strežniku**. V brskalniku ne more teči – potrebuje
Node proces z neposredno povezavo na bazo.

To pomeni, da prehod na Prisma ni "zamenjava knjižnice", ampak troje hkrati:

1. **Nov strežnik** (Next.js / Express / Netlify Functions) – nova komponenta, ki jo je
   treba postaviti, nadzorovati in plačevati.
2. **Prepis vseh 114 klicev v bazo** iz brskalnika v API klice.
3. **Prepis avtorizacije.** To je najresnejša točka – glej spodaj.

### 2.1 Varnostna past (najpomembnejše)

Danes 42 RLS politik in 31 `security definer` funkcij skrbi, da:

- zaposleni vidi **samo svoje** HR podatke (rojstni datum, telefon, stanje dopusta),
- vodja vidi samo svoj oddelek,
- menjave lahko potrdi samo pravi vodja oz. koordinator,
- revizijsko sled bere samo admin.

Ta pravila vsiljuje **baza**. Tudi če se v aplikacijski kodi kaj zalomi, baza podatkov
ne izda.

Prisma se povezuje s **service_role** pravicami, ki RLS **zaobidejo**. Po prehodu bi
morala vseh 42 pravil znova obstajati kot aplikacijska koda na 114 mestih. Ena
pozabljena `where` klavzula pomeni razkritje osebnih podatkov zdravstvenih delavcev
(rojstni datumi, bolniške, dopusti) – brez druge obrambne črte.

To je izvedljivo, a je *resnično* delo in ga je treba načrtovati, ne pa opraviti mimogrede.

---

## 3. Poslana shema proti dejanski bazi

Poslana shema opisuje **drugačen model**, ne trenutnega. Preslikava:

| Prisma model | Obstoječa tabela | Ujemanje |
|---|---|---|
| `Department` | `departments` | dobro |
| `User` | `profiles` + `profile_hr_details` + `contact_phones` | **razbito na 3 tabele** |
| `PushSubscription` | `push_subscriptions` | dobro |
| `Shift` | `schedule_entries` | `shiftTypeId` (FK) proti `shift_code` (prosto besedilo) |
| `Absence` | `leave_entries` | **ključ je `full_name` (besedilo), ne `userId`** |
| `AuditLog` | `schedule_entries_log` | ožji obseg (samo razpored) |
| `ShiftType` | – (zdaj v `delovni-cas.js`) | nova tabela |
| `NotificationSettings` | – | nova tabela |

### 3.1 Česa v poslani shemi NI

Teh 11 tabel nosi delujočo funkcionalnost in v poslani shemi nimajo ustreznice:

`obrazci`, `obrazci_dnevnik` (**celoten postopek Menjave z odobritvami**),
`employee_wishes`, `profile_departments` (več-oddelčno članstvo),
`lead_departments`, `department_shift_minimums`, `leave_balance_history`,
`leave_entries_log`, `contact_imports`, `admin_view_as_log`, `absence_color_map`.

Dobesedna uveljavitev poslane sheme bi te odstranila – z njimi vred menjave, želje,
minimume in zgodovino dopustov.

### 3.2 Tri neujemanja, ki zahtevajo migracijo podatkov, ne le preimenovanja

1. **`Absence.userId` proti `leave_entries.full_name`.** Dopusti so danes vezani na
   *ime kot besedilo*. Za prehod na tuji ključ je treba imena razrešiti v ID-je –
   in del jih se ne bo ujemal (znano razhajanje "Hrovat/Horvat" ipd.). Vsak
   neujemajoč zapis je izgubljen dopust, dokler ga nekdo ročno ne poveže.
2. **`Shift.shiftTypeId` proti `schedule_entries.shift_code`.** Kode so danes prosto
   besedilo. Potreben je `ShiftType` s polnim naborom kod + prevod obstoječih
   vrednosti; neznana koda ustavi migracijo.
3. **`User.employeeId` je `@unique` in obvezen.** Matična številka danes ni izpolnjena
   za vse – obvezen unikaten stolpec bi migracijo ustavil.

---

## 4. Trdo pravilo: nikoli `prisma migrate` proti produkciji

`prisma migrate dev` primerja shemo z bazo in **odstrani, česar v shemi ni**. Proti tej
bazi bi to pomenilo izgubo zgoraj naštetih tabel z resničnimi podatki bolnišnice.

Pravilni vrstni red je obraten:

```bash
prisma db pull        # introspekcija OBSTOJEČE baze v schema.prisma
```

Nato v shemo dodamo `@map` / `@@map`, da so imena modelov taka, kot jih želite,
tabele v bazi pa ostanejo nedotaknjene:

```prisma
model User {
  id         String @id @default(uuid())
  fullName   String @map("full_name")
  employeeId String? @map("employee_code")
  @@map("profiles")
}
```

Za spremembe sheme naprej: `prisma migrate diff` → pregled SQL → ročna izvedba v
Supabase SQL Editorju (enako kot doslej).

---

## 5. Tri možnosti

### Možnost A – Prisma samo kot orodje za shemo *(priporočeno kot prvi korak)*

Prisma se uporabi **izključno** za introspekcijo, tipe in generiranje migracijskega SQL.
Aplikacija ostane taka, kot je: brskalnik → Supabase, RLS ostane v veljavi.

- **Pridobimo:** shema v enem berljivem dokumentu, verzionirane migracije,
  TypeScript tipi za prihodnjo kodo.
- **Izgubimo:** nič.
- **Tveganje:** zelo nizko. Ni spremembe delovanja.
- **Obseg:** ~1–2 dni.

> Če je cilj "urejena shema in migracije", ta možnost ga doseže brez ostalih stroškov.
> Če pa je cilj strežniška aplikacija, je to vseeno pravi prvi korak k B/C.

### Možnost B – Prisma + tanka API plast, stran po stran

Postavimo strežnik in prenesemo **eno stran naenkrat** (najprej najmanjša –
`nastavitve.html`, 2 klica; nazadnje `imenik.html`, 35). Med prehodom obe poti
delujeta vzporedno.

- **Pridobimo:** poslovna pravila na enem mestu, tipi od baze do vmesnika.
- **Cena:** strežnik, build korak, prepis avtorizacije za preneseno stran.
- **Tveganje:** srednje, a **obvladljivo** – vsaka stran je svoja, povratek je preprost.
- **Obseg:** ~3–4 tedne ob delu s tempom te seje.

### Možnost C – Popoln prepis v Next.js + Prisma

Vse naenkrat, nova koda, RLS opuščen.

- **Tveganje:** visoko. 42 varnostnih pravil se prepiše hkrati, brez mreže spodaj.
- **Obseg:** ~6–10 tednov, plus obdobje stabilizacije z resničnimi uporabniki.
- **Odsvetujem**, dokler aplikacija teče v produkciji z resničnimi razporedi.

---

## 6. Predlagan potek (če greste v B)

| Faza | Kaj | Rezultat |
|---|---|---|
| 0 | `prisma db pull` na **kopijo** baze, `@map` do želenih imen | shema, ki opisuje resnično stanje |
| 1 | Manjkajoče tabele iz poslane sheme (`ShiftType`, `NotificationSettings`) kot navaden SQL | brez rušenja obstoječega |
| 2 | Migracija podatkov za 3 neujemanja (3.2) **na kopiji**, s poročilom o neujemanjih | znano, koliko zapisov je problematičnih |
| 3 | Strežnik + avtentikacija (Supabase JWT preverjen na strežniku) | ena zaščitena pot |
| 4 | **Preslikava vseh 42 RLS politik v seznam aplikacijskih preverjanj** | pisni seznam, ki se ga da pregledati |
| 5 | Prenos strani po velikosti: nastavitve (2) → obrazec (9) → zelje (11) → index (17) → admin (33) → imenik (35) | vsaka faza samostojno preverljiva |
| 6 | Vzporedno delovanje, nato ugasnitev stare poti | povratek mogoč do konca |

**Kontrolna točka po fazi 2:** če je neujemajočih zapisov v dopustih veliko, je treba
najprej urediti podatke (matične številke, poenotenje imen) – šele nato migracija.

---

## 7. Odkrito mnenje

Za to aplikacijo – statična, brez strežnika, z avtorizacijo v bazi in resničnimi
osebnimi podatki – **glavna pridobitev Prisme (tipi in migracije) je dosegljiva z
možnostjo A, glavni strošek (izguba RLS) pa nastane šele pri B/C.**

Zato predlagam:

1. **Zdaj:** možnost A. Nizko tveganje, takojšnja korist, ne zapre nobenih vrat.
2. **Odločitev o B** šele, ko bo znan resničen razlog zanjo – na primer potreba po
   integraciji s Kadrisom, e-pošti ali poslovni logiki, ki v brskalniku ne sme teči.
3. **C ne**, dokler aplikacija nosi resnične razporede.

Če se odločite za B ali C, je edino, kar bi *res* moral videti pred začetkom, poročilo
iz faze 2 – koliko zapisov se ne da samodejno povezati. To število odloči, ali je
migracija enodnevno opravilo ali tedensko čiščenje podatkov.

---

## 8. Kaj iz poslane sheme je že prevzeto

Ne glede na odločitev je koristno iz nje že vgrajeno:

- `ShiftType` (ure, trajanje, nočna) → **`delovni-cas.js`**, edini vir resnice
- `ExceptionReason` (6 zakonskih razlogov) → **`RAZLOGI_IZJEME`** + omilitev kršitve v opozorilo
- `AuditLog` → **`schedule_entries_log`** (že v produkciji)
- `PushSubscription` → **`push_subscriptions`** (že v produkciji)
- `Absence` s HARD/SOFT ločnico → delno: `LD`/`BS` blokirata, `STI` je mehka omejitev

Ostane neprevzeto: `NotificationSettings` (nastavitve obveščanja po osebi – danes je
push vklop/izklop po napravi) in `User.calendarToken` (živa koledarska naročnina;
danes je izvoz `.ics` enkraten prenos).
