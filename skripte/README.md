# Skripte — lokalne administratorske skripte

Vse tu teče **samo na tvojem računalniku**, nikoli v brskalniku ali na
strežniku aplikacije, ker uporablja Supabase **service_role** ključ (poln
dostop mimo RLS pravil) — ta ključ ne sme nikoli priti v kodo, ki teče v
brskalniku (`admin.html`, `imenik.html` ipd. uporabljajo samo javni `anon`
ključ).

## `uvoz-racunov.mjs` — ustvari Auth račune za znane zaposlene

Prebere `roster/zaposleni-emaili.csv` + `roster/zaposleni-vloge-gesla.csv`
(72 unikatnih e-poštnih naslovov), za vsako osebo pokliče Supabase
"povabi uporabnika" (`auth.admin.inviteUserByEmail`) — to:

1. Ustvari pravi Auth račun (`auth.users`), kar samodejno sproži obstoječi
   `handle_new_user()` sprožilec v `supabase/schema.sql` in ustvari
   `profiles` vrstico z imenom osebe.
2. Pošlje osebi e-pošto s povezavo za **nastavitev lastnega gesla** — ista
   stran (`reset-geslo.html`), ki jo aplikacija že uporablja za "Pozabljeno
   geslo". Oseba nikoli ne vidi/prejme gesla od tebe — sama si ga izbere.

Šele PO tem koraku se oseba pojavi v Kalupu/generatorju razporedov (ki bere
`profiles`, ne `roster/*.csv`) — glej tudi novo (18) sekcijo v
`supabase/schema.sql`, ki takoj po tem samodejno izpolni oddelek/vlogo za
nedvoumne primere.

### Zagon

```bash
cd skripte
cp .env.primer .env      # vpiši SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard -> Settings -> API)
npm install
node uvoz-racunov.mjs --suho     # 1) najprej samo izpis, brez pravih klicev
node uvoz-racunov.mjs            # 2) dejansko ustvari račune + pošlje vabila
```

Preden poženeš dejanski (ne-suh) zagon, v **Supabase Dashboard →
Authentication → URL Configuration → Redirect URLs** dodaj naslov iz
`SITE_URL` v `.env` + `/reset-geslo.html` — sicer Supabase povezavo v
vabilu zavrne kot neznano preusmeritev.

Varno je pognati večkrat — e-pošte, za katere račun že obstaja, se samo
preskočijo (izpiše "že obstaja"), nič se ne podvoji ali prepiše.

### Kaj ni vključeno (namenoma)

- **Gesla** — nihče, niti admin, ne izbira/vidi začetnega gesla. To je
  varnejše od pošiljanja/tiskanja začasnih gesel (kar je bil pristop v
  prejšnjem, neuporabljenem osnutku `roster/zaposleni-vloge-gesla.csv`
  stolpec `geslo_predlog` — ta stolpec skripta namerno ignorira).
- **Oddelek/vloga za dvoumne primere** (npr. "C/C1", "UA/SA/B2", "STROKOVNI
  VODJA") — teh ~10 ljudi admin po registraciji ročno dokonča v Imeniku
  (dropdown že podpira vse potrebno), glej komentar v `schema.sql` (18).
