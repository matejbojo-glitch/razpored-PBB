# Živa koledarska naročnina – namestitev

Doda zaposlenim možnost, da razpored **naročijo** v telefonski koledar in se
ta sam osvežuje, namesto da ga enkratno prenesejo kot `.ics`.

Postopek je enkraten in traja nekaj minut.

---

## 1. Posodobi shemo

V Supabase → **SQL Editor** poženi zadnjo različico `supabase/schema.sql`
(sekcija 29 doda tabelo `calendar_tokens` in tri funkcije).

Preveri, da je uspelo:

```sql
select count(*) from public.calendar_tokens;   -- mora vrniti 0, ne napake
```

## 2. Namesti robno funkcijo

```bash
supabase functions deploy koledar --no-verify-jwt
```

> **`--no-verify-jwt` je obvezen.** Koledarski odjemalci (Google, Apple,
> Outlook) se ne znajo prijaviti s Supabase žetonom – pošljejo samo naslov.
> Brez te zastavice bi Supabase vsako zahtevo zavrnil s 401 in naročnina ne bi
> nikoli delovala. Dostop je namesto tega zaščiten z osebnim žetonom v
> naslovu (glej "Kako je zavarovano" spodaj).

Funkcija ne potrebuje nobenih dodatnih skrivnosti – `SUPABASE_URL` in
`SUPABASE_SERVICE_ROLE_KEY` nastavi Supabase sam.

## 3. Preizkus

V aplikaciji: **Nastavitve → Koledar → "Pokaži mojo koledarsko povezavo"**,
nato kopiraj naslov in ga odpri v brskalniku. Prikazati se mora besedilo, ki
se začne z `BEGIN:VCALENDAR`.

Iz ukazne vrstice:

```bash
curl -i "https://<projekt>.supabase.co/functions/v1/koledar?t=<žeton>"
# 200 + Content-Type: text/calendar
curl -i "https://<projekt>.supabase.co/functions/v1/koledar?t=napacen"
# 404
```

---

## Kako je zavarovano

Naslov je **nosilni podatek** – kdor ga ima, vidi razpored te osebe brez
prijave. To je pri koledarskih naročninah neizogibno (odjemalci ne znajo
druge avtentikacije), zato je zasnovano tako:

| Ukrep | Zakaj |
|---|---|
| Žeton je 32 naključnih bajtov (64 šestnajstiških znakov) | Ugibanje ni izvedljivo |
| Žetoni so v **ločeni** tabeli, ne v `profiles` | `profiles` bere vsak prijavljen uporabnik – če bi žeton živel tam, bi vsak zaposleni videl žetone vseh sodelavcev |
| Bere ga **samo lastnik** (RLS `profile_id = auth.uid()`) | Niti admin ga ne potrebuje – razpored že vidi v aplikaciji |
| `koledar_razpored` je odvzeta vlogam `anon`/`authenticated` | Kliče jo lahko samo robna funkcija s `service_role`; sicer bi lahko kdo z ugibanjem bral tuje razporede prek RPC |
| Neveljaven žeton vrne **404 brez pojasnila** | Naslov ne izdaja, kateri žetoni obstajajo |
| Gumb "Nova povezava" | Ob pomotoma deljeni povezavi stara takoj neha delovati |
| Žeton se ne izpiše sam od sebe | Prikaže se šele na klik, da ne obvisi na zaslonu |

Vrne se **izključno razpored te ene osebe** – brez imen sodelavcev, kontaktov
ali kadrovskih podatkov.

---

## Kaj je v koledarju

- **Izmene z znanimi urami** (dopoldan, popoldan, nočne, 12-urne) so časovni
  dogodki v pravem časovnem pasu; nočne pravilno tečejo čez polnoč.
- **Dopust, bolniška, izobraževanje in dežurstvo** so celodnevni dogodki.
  Dežurstvo namenoma nima ur: med tednom traja 15:30–07:00, ob vikendih in
  praznikih pa 24 h, česar aplikacija (še) ne loči – celodnevni dogodek je
  zato edini zapis, ki ni nikoli napačen.
- Ure izmen bere `delovni-cas.js`, **isti modul kot aplikacija**, zato se
  koledar ne more razíti s prikazom v razporedu.

Odjemalcu je predlagano osveževanje na **4 ure** (`REFRESH-INTERVAL`), a je to
le namig – vsak odjemalec se odloči sam. Google Koledar osvežuje redkeje
(pogosto 8–24 h) in tega ni mogoče vsiliti s strani strežnika.

Ponujeno je okno **60 dni nazaj in 400 dni naprej**.

---

## Znane omejitve

- **Google Koledar** naročnine po URL-ju ne zna dodati v telefonski
  aplikaciji – dodati jo je treba enkrat na računalniku
  (Drugi koledarji → Dodaj po naslovu URL), nato se pokaže tudi na telefonu.
- Prva osvežitev pri Googlu lahko traja tudi nekaj ur; to ni napaka namestitve.
- Sprememba razporeda se v koledarju pokaže ob naslednji osvežitvi odjemalca,
  ne takoj. Za takojšnje obveščanje so potisna obvestila (`PUSH-SETUP.md`).

---

## Opomba o `delovni-cas.js`

`supabase functions deploy` naloži **samo drevo `supabase/functions/`**. Robna
funkcija zato ne more uvoziti datoteke iz korena repozitorija – namestitev bi
odpovedala z "Module not found".

Zato je v `supabase/functions/_shared/delovni-cas.js` **bajt-za-bajt kopija**
korenske datoteke. Ob vsaki spremembi ur izmen je treba osvežiti obe:

```bash
cp delovni-cas.js supabase/functions/_shared/
node skripte/preveri-delovni-cas.mjs      # mora izpisati OK
supabase functions deploy koledar --no-verify-jwt
```

Skripta `preveri-delovni-cas.mjs` javi razhajanje in vrne izhodno kodo 1 –
razhajanje bi pomenilo, da koledar zaposlenim kaže druge ure kot aplikacija.

Funkcija ima tudi varovalko: če se modul ne naloži, se ustavi z jasno napako,
namesto da bi vrnila koledar z napačnimi urami.
