# Supabase — prva postavitev (faza 4)

Ta veja doda pravo prijavo, tri vloge (administrator / vodja / zaposleni) in
dvostopenjsko odobritev menjav izmen. Pred objavo na Netlify je treba v
Supabase projektu enkrat ročno pripraviti bazo — tega iz te seje nisem mogel
narediti sam, ker imam samo **publishable (anon) ključ**, ne `service_role`
ključa ali dostopa do SQL urejevalnika.

## Popravek: "Database error saving new user" pri Auth → Invite user

Če pri povabilu novega uporabnika (ali pri navadni registraciji) dobiš to
napako, je vzrok skoraj zagotovo sprožilec `handle_new_user()`, ki ob
vsakem novem `auth.users` vnosu doda vrstico v `public.profiles`. Ta
sprožilec teče v transakciji vloge `supabase_auth_admin` (Supabase Auth
storitev), ne `postgres` iz SQL Editorja — če ji manjkajo pravice na
`public.profiles`, GoTrue vrne točno to generično sporočilo.

**Popravek je že v `supabase/schema.sql`** (doda eksplicitne grante za
`supabase_auth_admin` in naredi sprožilec odporen na napake, da nikoli ne
prepreči ustvarjanja Auth računa). Samo **znova poženi celo datoteko**
`supabase/schema.sql` v SQL Editorju — varno je pognati večkrat.

Če napaka po tem vztraja, v Dashboard → Logs → Postgres Logs poišči
natančno sporočilo za `handle_new_user` (zdaj se zaradi `raise warning`
izpiše, namesto da požre napako) in ga pošlji naprej za natančnejšo
diagnozo.

## 0. Preveri URL projekta

V `supabase-client.js` je nastavljeno:

```
https://jlvorlzvbaugjfjaodwz.supabase.co
```

**Preveri, da se to ujema** s "Project URL" v Supabase Dashboard → tvoj
projekt → Settings → API. Standardna domena Supabase projektov je
`*.supabase.co` (ne `.com`) — v pogovoru je bil naveden `.com`, kar je
verjetno tipkarska napaka, zato sem uporabil pravilno obliko `.co`. Če se
URL v nastavitvah razlikuje, ga popravi v `supabase-client.js` (vrstica z
`SUPABASE_URL`), preden objaviš spremembe.

## 1. Zaženi shemo

Supabase Dashboard → **SQL Editor** → **New query** → prilepi celotno
vsebino datoteke [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

To ustvari:
- `departments` (6 oddelkov SMS/TZN + "Dežurni"/"Nedežurni")
- `profiles` (1:1 z `auth.users`, vloga + oddelek/ekipa)
- `schedule_entries` (razpored, en zapis = en zaposleni/en dan)
- `swap_requests` + `notifications` (dvostopenjska odobritev menjav)
- RLS politike in RPC funkcije (`submit_swap_request`, `decide_swap_lead`,
  `decide_swap_admin`) — vsa pisanja v `swap_requests` gredo izključno
  prek teh funkcij, neposreden insert/update od klienta je zavrnjen.

Skripto je varno pognati večkrat (uporablja `if not exists` / `or replace`,
razen politik, ki se najprej pobrišejo in ustvarijo znova).

## 2. Nastavitve Auth

Dashboard → **Authentication → Providers → Email**:
- Če želiš, da se zaposleni takoj prijavijo brez potrjevanja e-pošte
  (enostavneje za manj tehnične uporabnike, a manj varno), izklopi
  "Confirm email".
- Če e-pošte niso resnične/dostopne vsem zaposlenim, razmisli o tem, da
  administrator namesto tega vsakemu zaposlenemu sporoči začasno geslo
  in e-poštni naslov, ki ga zaposleni uporabi samo za prijavo.
- **Za "Pozabljeno geslo" (glej §5g):** Supabase ima vgrajeno pošiljanje
  e-pošte, a je na privzetih (brezplačnih) načrtih strogo omejeno po številu
  na uro in se sme uporabljati samo za testiranje — za zanesljivo pošiljanje
  vsem zaposlenim v produkciji je treba nastaviti **lasten SMTP** (Dashboard
  → Authentication → Settings → SMTP Settings; npr. poslovni e-poštni
  strežnik bolnišnice ali storitev kot Resend/SendGrid). Brez tega bodo
  e-pošte za ponastavitev gesla morda prihajale nezanesljivo ali sploh ne.

## 3. Ustvari prvega administratorja

Ker vsak nov račun ob registraciji (login.html → "Nova registracija")
samodejno dobi vlogo `user` (glej `handle_new_user()` trigger), mora nekdo
ročno postati prvi administrator, preden lahko v `admin.html` upravlja
ostale. En sam ukaz v SQL Editorju, potem ko se ta oseba enkrat registrira:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'ime.priimek@example.com');
```

Od takrat naprej administrator vse ostale vloge/oddelke ureja v
`admin.html` → zavihek **Uporabniki**, brez SQL-ja.

## 4. Kako zdaj deluje razpored

- `index.html` bere razpored iz `schedule_entries`, ne več iz
  `data-oktober-2026.json` / `data-november-2026.json` — ti dve datoteki
  ostajata v repozitoriju kot zgodovinski zapis, a ju aplikacija ne bere več.
- `admin.html` (generator) po generiranju ponuja **oba** načina: ročni
  prenos JSON (kot prej) IN nov gumb **"📤 Objavi neposredno v Supabase"**,
  ki vrstice zapiše naravnost v `schedule_entries`. Objava poveže
  zaposlene po polnem imenu (`profiles.full_name`) — kdor se še ni
  registriral, je v sporočilu po objavi izpisan kot "brez računa".
- **Uvoz obstoječih oktobrskih/novembrskih podatkov** (iz
  `data-oktober-2026.json`, `data-november-2026.json`) v to shemo ni
  avtomatiziran v tej spremembi — ista logika kot pri objavi iz generatorja
  bi delovala (ujemanje po `full_name`), a jo je smiselno dodati šele, ko
  bo večina od ~63 zaposlenih dejansko imela Supabase račun. Če to
  potrebuješ zdaj, povej in dodam majhno stran/skripto za enkratni uvoz.

## 5. Vloge in kaj kdo vidi/ureja (dogovorjeno)

| Vloga | Vidi | Ureja | Odobrava |
|---|---|---|---|
| **admin** | vse oddelke, vse podatke | kalup, dežurstva, uporabnike (vloge/oddelke) | 2. (dokončna) stopnja menjav |
| **vodja** | vse oddelke (razpored je viden vsem) | nič — samo predlaga | 1. stopnja menjav znotraj svoje ekipe (`department_code`) |
| **user** | vse oddelke (dogovorjeno v tem pogovoru — glej opombo spodaj) | nič | nič — lahko le predlaga menjavo |

**Opomba:** prvotni zapiski iz ločenega pogovora so si nasprotovali med
"vsak vidi samo svoj oddelek" in "vsi vidijo vse oddelke". Pri implementaciji
sem izbral **"vsi vidijo vse oddelke"**, ker si to izrecno potrdil, ko sem
vprašal. `index.html` zato prikaže izbirnik oddelka vsem, ne le lastnemu.

## 5b. Imenik (kontakti) — nova funkcija, zahteva ponoven zagon `schema.sql`

Nova stran `imenik.html` (gumb "📇 Imenik" v spodnji navigaciji) doda e-pošto
in telefonsko številko na vsak profil, z vidljivostjo po vlogah:

| Vloga | Vidi telefon | Vidi e-pošto |
|---|---|---|
| **admin** | vseh | vseh |
| **vodja** | vseh | vseh |
| **user** | samo svojega | vseh |

To zahteva **ponoven zagon celotne `supabase/schema.sql`** v SQL Editorju
(varno je pognati večkrat) — doda stolpec `profiles.email`, novi tabeli
`contact_phones` (telefon, ločen od `profiles` zaradi prave vrstične RLS —
glej komentar v shemi) in `contact_imports` (uvoz zaposlenih, ki se še niso
sami registrirali).

## 5c. Razpredelnica dopusti/omejitve + generator za vodje — spet zahteva ponoven zagon

Iz priloženega barvnega HTML-orodja in Excel predloge "Predloga razporeda
vodje NZV" sta nastali dve novi funkciji:

- **`zelje.html` → zavihek "Razpredelnica dopusti/omejitve"**: barvni koledar
  (Omejitev/LD/BS/STI) namesto ročnega vnosa datumov. Piše v novo tabelo
  `leave_entries` (+ `leave_entries_log` za zgodovino). `admin.html` →
  Dežurstva to samodejno prebere ob izbiri meseca.
- **`admin.html` → zavihek "Vodje"**: mesečna zasedenost 22 vodij/nosilcev
  oddelkov iz nove tabele `lead_departments` (seed podatki že v shemi, iz
  Excel predloge) — vsak je ob delavnikih privzeto na svojem domačem
  oddelku, LD/BS/STI vnosi iz zgornje razpredelnice ga premaknejo v ustrezen
  stolpec. Poenostavitev glede na izvirno predlogo: stolpca "SA DOP"/"SA
  POP" sta združena v en "SA", "Omejitev" (rumena) nima lastnega stolpca
  (koordinator te dni presodi ročno) — če je to pomembno, povej in dopolnim.

Spet zahteva **ponoven zagon `supabase/schema.sql`** — doda `leave_entries`,
`leave_entries_log`, `lead_departments` (s seed podatki) in nove kode enot v
`departments` (PDZN/SOBO/ŽO/MO/PO/A/B1B2/DB/SA/URGENCA/U2).

### Pravice v Razpredelnici — vezane na pravo prijavo (ne na PIN/geslo)

Stran je zdaj dostopna vsem trem vlogam (prej samo admin/vodja), z realnimi
pravicami vezanimi na Supabase prijavo (`profiles.role`/`full_name`), ne na
izbiro imena v obrazcu ali PIN, kot je bilo predlagano v ločenem, ne-
avtenticiranem HTML orodju — naša aplikacija ima že pravo prijavo, zato ta
korak ni bil potreben:

| Vloga | Vidi razpredelnico | Ureja | Vidi zgodovino sprememb |
|---|---|---|---|
| **admin** | vseh | vseh, kadar koli | da |
| **vodja** | vseh | samo svojo vrstico, do 10. v mesecu pred prikazanim mesecem | ne |
| **user** | vseh | samo svojo vrstico, do 10. v mesecu pred prikazanim mesecem | ne |

Uveljavljeno na obeh koncih: v vmesniku (`zelje.html`) IN v RLS politiki
`leave_entries_write`/`leave_entries_log_select` v shemi — tako da omejitve
veljajo tudi, če bi kdo klical Supabase API neposredno, mimo vmesnika.
Ujemanje imena med `leave_entries.full_name` (roster, npr. "BOJIĆ MATEJ") in
`profiles.full_name` (kar je oseba vpisala ob registraciji) je narejeno kot
primerjava "vreče besed" (ne glede na vrstni red besed), da manjše razlike v
zapisu ne blokirajo dostopa.

**Delovni tok za uvoz seznama zaposlenih:**
1. Admin v Imeniku naloži CSV (`full_name,email,phone,role,department_code`)
   ali doda osebo ročno — pripravljen primer z vsemi 69 znanimi zaposlenimi
   (e-pošta + predlagana vloga, brez telefona in oddelka — ju je treba
   dopolniti) je v [`roster/imenik-uvoz.csv`](roster/imenik-uvoz.csv).
2. Te osebe se pojavijo v Imeniku kot "še ni registriran".
3. Ko se oseba dejansko registrira v `login.html` s to e-pošto, admin v
   Imeniku pri njej klikne "Poveži" (samodejno predlagano, če se e-pošti
   ujemata) — s tem se telefon/vloga/oddelek prekopirajo v njen pravi profil.

## 5d. Uvoz Excel/Google Sheets/PDF + dodatni HR podatki — spet zahteva ponoven zagon

- Uvoz v Imeniku (in na več drugih mestih: Dežurstva, Kalup, Uporabniki,
  Razpredelnica) zdaj poleg CSV sprejme tudi **Excel** (.xlsx/.xls), **Google
  Sheets** (javno objavljena povezava) in **PDF** (izvleček golega besedila,
  ker brskalnik ne vidi barve celic — glej opombo v `import-utils.js`).
- V Imeniku uvoz prepozna tudi **uraden HR izvoz** (stolpci v poljubnem
  vrstnem redu: "Priimek in ime", "Elektronska pošta", "Datum rojstva",
  "Naziv delovnega mesta", "Vodja (naziv)", "Starševsko varstvo", "Letni
  dopust 2026 (skupaj)", "vloga" …).
- Ti dodatni HR podatki gredo v novo tabelo `profile_hr_details` — vidljivost
  je ožja kot pri telefonu: **samo lastnik in admin**, vodja NIMA dostopa
  (rojstni datum je občutljivejši od telefonske številke, za razliko od
  telefona ni bilo izrecno naročeno, da ga vidi tudi vodja).

Zahteva **ponoven zagon `supabase/schema.sql`** — doda stolpce na
`contact_imports` (employee_code, birth_date, position_name, manager_name,
parental_leave, annual_leave_total) in novo tabelo `profile_hr_details`.

## 5e. Stanje dopusta (preostanek dni) + neposreden uvoz na že registrirane osebe

Na izrecno željo, ker admin redno uvaža posodobljeno Excel tabelo za vse
zaposlene:

- Novo polje **"Stanje dopusta"** (preostanek dni + "na dan", privzeto 1. v
  tekočem mesecu, če datoteka nima lastnega stolpca z datumom) — ločeno od
  letne kvote (`annual_leave_total`, fiksna za celo leto), ker se to
  spreminja med letom.
- **Sprememba vedenja uvoza**: če se e-pošta v uvoženi vrstici ujema z že
  registriranim profilom, se vsi podatki (vloga, oddelek, telefon, vsa HR
  polja vključno s stanjem dopusta) posodobijo NANJ **takoj**, ne le ob
  prvem "Poveži". Prej je vsak uvoz vedno šel v `contact_imports` in čakal
  na ročno povezavo — zdaj to velja samo še za osebe, ki se še niso
  registrirale. To pomeni: admin lahko vsak mesec znova naloži isto Excel
  tabelo z novim stanjem dopusta in vsi že prijavljeni zaposleni bodo takoj
  na tekočem, brez ponavljanja ročnega koraka.
- Popravljen tudi pravi hrošč: "Datum rojstva" v Excelu je pogosto navadno
  besedilo v obliki DD.MM.LLLL, ne prava datumska celica — če bi šlo
  nepretvorjeno v Postgres `date` stolpec (privzeto MM.DD.LLLL), bi za dneve
  nad 12 vrglo napako, za ostale pa tiho zamenjalo dan/mesec
  (`import-utils.js` → `normalizirajDatum()`).

Zahteva **ponoven zagon `supabase/schema.sql`** — doda `leave_balance_days`
in `leave_balance_asof` na `contact_imports` in `profile_hr_details`.

## 5f. Več oddelkov na zaposlenega + brez podvajanja pri ponovnem uvozu

Na izrecno željo:

- V Imeniku ima lahko en zaposleni **več oddelkov** (npr. pokriva C in C1) —
  nova tabela `profile_departments` (profile_id, department_code,
  sort_order). **Prvi** (najnižji `sort_order`) je "primarni" in ostaja
  edini, ki šteje za obstoječi generator urnika (`profiles.department_code`
  — WARDS_META/lead_departments v `admin.html` sta **namenoma
  nespremenjena**, da se ne tvega regresij). Sprožilec
  `sync_primary_department` v shemi drži `profiles.department_code` in
  `profile_departments` usklajena, ne glede na to, kateri del aplikacije
  (Imenik, Uporabniki, uvoz, gumb za ponastavitev) oddelek spremeni.
  V Imeniku → profil osebe (admin) je nov urejevalnik: dodajanje/odstranitev
  oddelka in gumb "Naredi primaren" za spremembo vrstnega reda.
- **Uvoz ne podvaja več** "še ne povezanih" oseb: če ista (še neregistrirana)
  oseba po e-pošti že obstaja v seznamu za uvoz, ponoven uvoz njeno vrstico
  **posodobi**, namesto da ustvari podvojen zapis (velja tudi za
  "posodobljeno stanje dopusta" iz §5e, ko oseba še ni registrirana).

Zahteva **ponoven zagon `supabase/schema.sql`** — doda tabelo
`profile_departments` + sprožilec (z enkratnim, idempotentnim backfillom za
obstoječe profile).

## 5g. Pozabljeno geslo + potrditev gesla po registraciji

Na izrecno željo, brez sprememb sheme (samo `login.html` + nova
`reset-geslo.html`):

- **"Pozabljeno geslo?"** na prijavni strani — vnese e-pošto,
  `client.auth.resetPasswordForEmail()` pošlje povezavo (Supabase, glej
  opozorilo o SMTP v §2 zgoraj). Sporočilo je namerno enako, ne glede na to,
  ali račun s to e-pošto obstaja (ne razkriva, kdo je registriran).
- Povezava iz e-pošte pripelje na novo `reset-geslo.html`, ki prek
  `detectSessionInUrl` (privzeto vklopljeno v supabase-js) samodejno
  vzpostavi sejo iz povezave in prikaže obrazec za novo geslo
  (`client.auth.updateUser({ password })`).
- **Takoj po uspešni "Nova registracija"** (če je "Confirm email" izklopljen,
  glej §2, torej je oseba takoj prijavljena) se pred vstopom v aplikacijo
  prikaže še en korak "Nastavi geslo" — dvojna potrditev/priprava gesla.

Ne zahteva ponovnega zagona `schema.sql`.

## 5h. Še ne povezane osebe zdaj vidne VSEM v Imeniku

Na izrecno željo ("vsi vneseni podatki naj bodo takoj vidni pri vseh, tudi
nepovezanih uporabnikih"): uvožene, a še ne registrirane osebe (prej vidne
samo adminu v "Uvoz zaposlenih") se zdaj pojavijo tudi v glavnem, iskalnem
seznamu Imenika za VSE vloge — z oznako "še ni registriran" namesto
vloge/vrstice.

Nov pogled `public.contact_imports_public` (osnovna tabela `contact_imports`
ostaja admin-only) uveljavlja ISTA pravila vidljivosti kot za registrirane
profile: e-pošta in oddelek vsem, telefon admin+vodja, HR polja (rojstni
datum, šifra zaposlenega, stanje dopusta ipd.) samo adminu — ker
neregistrirana oseba nima "lastnika", ki bi jih smel videti namesto admina.
Pogled teče s pravicami lastnika (ne "security invoker"), da prebere vse
vrstice ne glede na RLS na `contact_imports`, nato pa vsak stolpec, ki ga
klicatelj po vlogi ne sme videti, vrne kot `null` (CASE izraz, ovrednoten
za vsak klic posebej glede na `current_role_is()`).

Zahteva **ponoven zagon `supabase/schema.sql`** — doda pogled
`contact_imports_public` + `grant select ... to authenticated`.

## 5i. Mesečna zgodovina stanja dopusta (Kadris) + trend — zavihek Dopust

Nov zavihek **Dopust** v Uvozi/admin.html: admin vsak mesec naloži izvoz iz
Kadrisa (stolpci: Priimek in ime, Mat.št/šifra zaposlenega, Leto, Mesec,
DOPUST). Glava se sama poišče med prvimi 15 vrsticami (`najdiGlavo` v
`import-utils.js`), tako da morebitni naslovi nad tabelo ne motijo.

Šifra zaposlenega (`employee_code`) je edini stabilen ključ med meseci —
ista, kot jo že uporablja `profile_hr_details.employee_code` — zato se
uvožena oseba samodejno poveže s pravim profilom, če je znana; sicer se
poskusi ujemanje po imenu (vreča besed, diakritike neobčutljivo, ista
logika kot `imenaSeUjemataAdmin`). Predogled pred potrditvijo loči
nove/spremenjene/nespremenjene vrstice in opozori, katere osebe iz
prejšnjih uvozov v novem izvozu ni bilo (njihovi podatki ostanejo,
samo se v tem mesecu ne posodobijo). Ponoven uvoz istega meseca obstoječo
vrstico posodobi (upsert po `employee_code, leto, mesec`), ne podvoji.

Nova tabela `public.leave_balance_history` hrani en zapis na osebo na
mesec (RLS: admin vidi vse, uporabnik samo vrstico s svojim `profile_id`).
Pogled `public.leave_balance_pregled` doda trend — razliko glede na
prejšnji mesec te osebe (`lag` po `employee_code`, urejeno po
leto/mesec). Sprožilec `trg_sync_leave_balance` po vsakem uvozu preveri,
ali je pravkar zapisan mesec NAJNOVEJŠI za to osebo, in če je, samodejno
uskladi `profile_hr_details.leave_balance_days/leave_balance_asof` — tako
Imenik (trenutno stanje pri osebi) in zavihek Dopust (zgodovina/trend)
nikoli ne razideta, ne glede na vrstni red uvoza mesecev.

Zahteva **ponoven zagon `supabase/schema.sql`** — doda razdelek 8)
(`leave_balance_history`, pogleda `leave_balance_pregled`/
`leave_balance_obdobja`, sprožilec).

## 6. Znane omejitve te faze

- Ni administratorske API funkcije za vnaprejšnje ustvarjanje računov
  (zahtevala bi `service_role` ključ na strežniški strani, česar v tem
  statičnem, brez-strežniškem postavljanju ni varno hraniti v odjemalcu) —
  namesto tega se zaposleni sami registrirajo, administrator jim nato
  dodeli pravo vlogo/oddelek.
- Obveščanje o statusu menjave je samo znotraj aplikacije (oznaka ob
  "Menjave"), brez e-pošte — tako je bilo dogovorjeno za to fazo.
- `dashboard.html` in `zelje.html` delujeta še vedno na starem, ročnem
  JSON-prenosnem principu (nespremenjeno v tej veji, le dodan je bil
  prijavni "gate" za admin/vodja) — nista bila del tega dogovora.
