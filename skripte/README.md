# Skripte — lokalne administratorske skripte

Vse tu teče **samo na tvojem računalniku**, nikoli v brskalniku ali na
strežniku aplikacije, ker uporablja Supabase **service_role** ključ (poln
dostop mimo RLS pravil) — ta ključ ne sme nikoli priti v kodo, ki teče v
brskalniku (`admin.html`, `imenik.html` ipd. uporabljajo samo javni `anon`
ključ).

## `uvoz-racunov.mjs` — ustvari Auth račune za znane zaposlene

Prebere `roster/zaposleni-emaili.csv` + `roster/zaposleni-vloge-gesla.csv`
(72 unikatnih e-poštnih naslovov) in za vsako osebo ustvari pravi Supabase
Auth račun (`auth.users`), kar samodejno sproži obstoječi `handle_new_user()`
sprožilec v `supabase/schema.sql` in ustvari `profiles` vrstico z imenom
osebe — to velja v obeh spodnjih načinih, ker ista Auth-sprožilna logika
teče ne glede na to, kateri Admin API klic je ustvaril uporabnika.

Šele PO tem koraku se oseba pojavi v Kalupu/generatorju razporedov (ki bere
`profiles`, ne `roster/*.csv`) — glej tudi novo (18) sekcijo v
`supabase/schema.sql`, ki takoj po tem samodejno izpolni oddelek/vlogo za
nedvoumne primere.

### Dva načina

- **Produkcija (privzeto)** — pokliče `auth.admin.inviteUserByEmail`: pošlje
  osebi e-pošto s povezavo za **nastavitev lastnega gesla** (ista stran
  `reset-geslo.html`, ki jo aplikacija uporablja za "Pozabljeno geslo").
  Oseba nikoli ne vidi/prejme gesla od tebe — sama si ga izbere. Uporabi to,
  ko je aplikacija v produkciji in je čas, da ljudje dejansko dobijo mail.
- **Test (`--test`)** — pokliče `auth.admin.createUser` z naključnim začasnim
  geslom, **brez pošiljanja kakršnekoli e-pošte**. Za testno fazo: računi
  morajo obstajati zdaj (da jih generator razporeda vidi in da jih lahko
  uporabljaš pri sestavljanju razporedov), a pravega vabila še ni čas
  poslati. Začasna gesla se izpišejo samo v terminal in v lokalno datoteko
  `porocilo-gesla-<čas>.csv` (v `.gitignore`, nikoli se ne commita/deli) —
  ko boš pripravljen na produkcijo, poženi skripto brez `--test`, da se
  pošljejo prava vabila (obstoječi računi se samo preskočijo, ne podvojijo).

### Zagon

```bash
cd skripte
cp .env.primer .env      # vpiši SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard -> Settings -> API)
npm install

# Produkcija (pravo vabilo po e-pošti):
node uvoz-racunov.mjs --suho     # 1) najprej samo izpis, brez pravih klicev
node uvoz-racunov.mjs            # 2) dejansko ustvari račune + pošlje vabila

# Test (brez e-pošte, samo lokalna začasna gesla):
node uvoz-racunov.mjs --test --suho   # 1) najprej samo izpis
node uvoz-racunov.mjs --test          # 2) dejansko ustvari račune, brez maila
```

Preden poženeš dejanski (ne-suh) zagon PRODUKCIJSKEGA načina, v **Supabase
Dashboard → Authentication → URL Configuration → Redirect URLs** dodaj
naslov iz `SITE_URL` v `.env` + `/reset-geslo.html` — sicer Supabase
povezavo v vabilu zavrne kot neznano preusmeritev. `--test` način tega ne
potrebuje (ne pošilja maila, torej ni preusmeritve).

Varno je pognati večkrat, v obeh načinih — e-pošte, za katere račun že
obstaja, se samo preskočijo (izpiše "že obstaja"), nič se ne podvoji ali
prepiše. Prehod iz `--test` v produkcijo je torej varen: ista skripta brez
`--test` samo doda manjkajoče vabila, obstoječih testnih računov se ne
dotakne.

### Kaj ni vključeno (namenoma)

- **Gesla** — nihče, niti admin, ne izbira/vidi začetnega gesla. To je
  varnejše od pošiljanja/tiskanja začasnih gesel (kar je bil pristop v
  prejšnjem, neuporabljenem osnutku `roster/zaposleni-vloge-gesla.csv`
  stolpec `geslo_predlog` — ta stolpec skripta namerno ignorira).
- **Oddelek/vloga za dvoumne primere** (npr. "C/C1", "UA/SA/B2", "STROKOVNI
  VODJA") — teh ~10 ljudi admin po registraciji ročno dokonča v Imeniku
  (dropdown že podpira vse potrebno), glej komentar v `schema.sql` (18).
