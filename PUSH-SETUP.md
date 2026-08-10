# Potisna obvestila (Web Push) — namestitev

Aplikacija pošilja potisna obvestila na telefon **brez SMS-stroškov in brez trgovin z aplikacijami**
(Web Push + PWA). Koda je že v repozitoriju; to so koraki, ki jih je treba enkrat opraviti v Supabase.

Obvestilo prejme zaposleni, ko:

- je **objavljen nov razpored**, ki ga zadeva,
- se premakne njegova **menjava** (čaka njegovo potrditev / odobreno / zavrnjeno / preklicano),
- **dan pred nočno izmeno ali dežurstvom** (opomnik).

---

## 0) Kaj kje teče

| Del | Kje |
|---|---|
| Zapis "kaj je treba povedati" | tabela `notifications` (že obstaja, razširjena) |
| Naročnine naprav | tabela `push_subscriptions` |
| Dostava | Edge Function `posiljaj-push` |
| Prikaz na telefonu | `sw.js` (`push` / `notificationclick`) |
| Vklop/izklop za uporabnika | Nastavitve → Obvestila |

Obvestila se **ne pošiljajo neposredno iz baze**. Tabela `notifications` je edini vir resnice, Edge
Function jo občasno prebere in odpošlje. Če dostava izpade, se sporočilo ne izgubi — pošlje se ob
naslednjem zagonu.

---

## 1) Poženi SQL

V Supabase → SQL Editor poženi zadnjo različico `supabase/schema.sql` (sekcija 27 doda tabele,
sprožilce in funkciji `obvesti_o_objavi_razporeda` / `ustvari_opomnike_za_jutri`).

---

## 2) VAPID ključa

Javni ključ je **že v kodi** (`push-client.js`) — ni skrivnost, brskalnik ga potrebuje ob naročanju.

Zasebni ključ **namenoma ni v repozitoriju** (tudi v tej datoteki ne) — zasebnih ključev se ne
shranjuje v git. Vpiše se samo v Supabase skrivnosti (korak 3).

Trenutni javni ključ v `push-client.js`:

```
VAPID_PUBLIC_KEY = BByIPXuD5ybU4phq4GNzeM0wglL1uUAaMr6ZY-SqXeDvYtCFXm9IbrAmm1yCHl44uHPB_rKdTycCx5KnAdICNic
```

Ustrezen zasebni ključ je bil predan ločeno (ob namestitvi). Če ga nimaš pri roki ali želiš nov par,
generiraj oba na novo:

```bash
node -e 'const c=require("crypto");const{publicKey,privateKey}=c.generateKeyPairSync("ec",{namedCurve:"prime256v1"});const d=publicKey.export({type:"spki",format:"der"});console.log("PUBLIC =",Buffer.from(d.subarray(d.length-65)).toString("base64url"));console.log("PRIVATE =",privateKey.export({format:"jwk"}).d)'
```

> Ob novem paru je treba **javni** ključ vpisati v `push-client.js` (`VAPID_JAVNI_KLJUC`), zasebnega pa
> v Supabase skrivnosti. Vsi uporabniki morajo nato obvestila znova vklopiti — stare naročnine,
> izdane s prejšnjim ključem, ne delujejo več.

---

## 3) Skrivnosti Edge Function

Supabase → Project Settings → Edge Functions → Secrets:

| Ime | Vrednost |
|---|---|
| `VAPID_PUBLIC_KEY` | javni ključ zgoraj |
| `VAPID_PRIVATE_KEY` | zasebni ključ zgoraj |
| `VAPID_SUBJECT` | `mailto:razpored@pb-begunje.si` (ali druga veljavna e-pošta) |
| `PUSH_CRON_SECRET` | poljubno dolgo naključno geslo, npr. iz `openssl rand -hex 32` |

`SUPABASE_URL` in `SUPABASE_SERVICE_ROLE_KEY` nastavi Supabase sam — teh ni treba dodajati.

---

## 4) Objavi Edge Function

```bash
supabase functions deploy posiljaj-push --project-ref <TVOJ_PROJECT_REF>
```

Preizkus (zamenjaj `<...>`):

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/posiljaj-push" \
  -H "x-cron-secret: <PUSH_CRON_SECRET>"
```

Odgovor je npr. `{"obdelanih":0,"poslanih":0}` — to pomeni, da funkcija teče in ni čakajočih obvestil.

---

## 5) Urnik (pg_cron)

V Supabase → SQL Editor. Najprej enkrat omogoči razširitvi:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Nato dva opravila — **zamenjaj `<PROJECT_REF>` in `<PUSH_CRON_SECRET>`**:

```sql
-- a) Dostava čakajočih obvestil, vsakih 5 minut.
select cron.schedule(
  'posiljaj-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/posiljaj-push',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<PUSH_CRON_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- b) Opomniki za jutrišnje nočne izmene in dežurstva, vsak dan ob 17.00
--    (pg_cron teče v UTC — 15:00 UTC je 17:00 po srednjeevropskem poletnem času).
select cron.schedule(
  'opomniki-izmene',
  '0 15 * * *',
  $$ select public.ustvari_opomnike_za_jutri(); $$
);
```

Pregled/odstranitev opravil:

```sql
select * from cron.job;
select cron.unschedule('posiljaj-push');
```

---

## 6) Vklop na telefonu

Vsak zaposleni vklopi obvestila **sam in na vsaki napravi posebej**:
Nastavitve → Obvestila → "🔔 Vklopi obvestila na tej napravi".

- **Android** — deluje v Chromu in v nameščeni aplikaciji.
- **iPhone (iOS 16.4+)** — deluje **samo**, če je aplikacija dodana na domači zaslon
  (Deli → "Dodaj na začetni zaslon") in odprta od tam. V Safariju kot navadna spletna stran ne deluje —
  to je omejitev Appla, ne aplikacije.

---

## Odpravljanje težav

| Težava | Vzrok / rešitev |
|---|---|
| Gumb za vklop javi "brskalnik ne podpira" | iPhone brez namestitve na domači zaslon, ali zelo star brskalnik. |
| Gumb javi "blokirano v nastavitvah brskalnika" | Uporabnik je obvestila kdaj zavrnil — odblokira jih prek ikone ključavnice ob naslovu strani, nato osveži stran. |
| `curl` vrne `401 Unauthorized` | `x-cron-secret` se ne ujema s skrivnostjo `PUSH_CRON_SECRET`. |
| `curl` vrne `500` z "Manjkata VAPID…" | Skrivnosti niso nastavljene ali funkcija po nastavitvi ni bila znova objavljena. |
| Obvestila se ne pojavijo, `obdelanih` pa raste | Uporabnik na tej napravi ni vklopil obvestil (ni vrstice v `push_subscriptions`). |
| Vse deluje, a obvestil ni po menjavi | Preveri, da je bila pognana sekcija 27 SQL-a (sprožilec `on_obrazec_status_change`). |
