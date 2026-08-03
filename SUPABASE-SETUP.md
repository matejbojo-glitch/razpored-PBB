# Supabase — prva postavitev (faza 4)

Ta veja doda pravo prijavo, tri vloge (administrator / vodja / zaposleni) in
dvostopenjsko odobritev menjav izmen. Pred objavo na Netlify je treba v
Supabase projektu enkrat ročno pripraviti bazo — tega iz te seje nisem mogel
narediti sam, ker imam samo **publishable (anon) ključ**, ne `service_role`
ključa ali dostopa do SQL urejevalnika.

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
