# Razpored PBB — faza 1 (samo za branje)

Mobilna spletna aplikacija (PWA) za pregled mesečnega razporeda dela.
Zaposleni izbere oddelek in svoje ime, nato vidi svoj razpored in razpored
celotnega oddelka. Trenutno je naloženih podatkov samo za **oktober 2026**
(iz kalupa, ki smo ga generirali prej v pogovoru).

To je namenoma **prva, najpreprostejša faza**: brez urejanja, brez prijave,
brez strežnika — samo hiter, zanesljiv pregled na telefonu. Naslednje faze
(generator razporeda, sledenje pravičnosti, zamenjave) gradimo na to osnovo.

## Kaj je v mapi

```
razpored-app/
├── index.html              ← cela aplikacija (React, brez potrebe po gradnji/buildu)
├── manifest.json            ← PWA manifest (ime, ikona, barve)
├── sw.js                    ← service worker (deluje tudi brez signala)
├── data-oktober-2026.json   ← podatki o razporedu za oktober
├── icon-192.png, icon-512.png   ← ikoni za domači zaslon
└── react.production.min.js, react-dom.production.min.js, babel.min.js
                                  ← React/ReactDOM/Babel, prenešeni lokalno
                                    (vse datoteke so v eni mapi, brez podmap
                                     — poenostavljeno zaradi nalaganja s telefona)
```

## Kako namestiti (izberite eno možnost)

Najlažje: **Netlify Drop** — https://app.netlify.com/drop
Povlecite celo mapo `razpored-app` v brskalnik na tej strani. V nekaj sekundah
dobite javno povezavo (npr. `https://nekaj-ime.netlify.app`), ki jo lahko
pošljete zaposlenim (SMS, e-pošta, oglasna deska z QR kodo).

Alternativa: **Vercel**, **GitHub Pages** ali kateri koli drug spletni
gostitelj, ki servira statične datoteke — naložite vsebino mape `razpored-app`
kot celoto.

Pomembno: aplikacije **ne odpirajte kar z dvoklikom na `index.html`**
(brskalnik jo poskusi odpreti kot `file://`) — takrat podatki o razporedu
ne bodo naloženi zaradi varnostnih omejitev brskalnikov. Potrebuje pravi
spletni naslov (http/https), tudi če je to samo lokalni predogled:

```
cd razpored-app
python3 -m http.server 8080
```
nato v brskalniku odprite `http://localhost:8080`.

## Kako zaposleni namestijo na telefon

1. Odprejo povezavo v brskalniku telefona (Chrome na Androidu, Safari na iPhonu).
2. Chrome: meni (tri pike) → "Dodaj na začetni zaslon".
   Safari: gumb za deljenje → "Dodaj na začetni zaslon".
3. Odslej se aplikacija odpre kot ikona na zaslonu, brez naslovne vrstice
   brskalnika, in deluje tudi brez signala (enkrat naložena stran).

## Kako posodobiti podatke za nov mesec

Podatkovna datoteka `data-oktober-2026.json` je ločena od kode aplikacije.
Za nov mesec:
1. Se v pogovoru s Claudom pripravi enak izvoz (kot smo ga naredili za oktober).
2. Se datoteko preimenuje npr. `data-november-2026.json` in doda v kodo
   (v `index.html` se spremeni pot `fetch("data-oktober-2026.json")`).
3. Se ponovno naloži cela mapa na gostovanje.

To ročno posodabljanje je smiselno samo za to prvo fazo. V naslednji fazi
(generator + skupna baza) bo to teklo samodejno.

## Znane omejitve te faze

- Samo en mesec podatkov (oktober 2026), ročno vgrajen v datoteko.
- Ni prijave — kdorkoli z povezavo lahko izbere katerokoli ime. Za interno
  uporabo znotraj oddelka je to sprejemljivo, za širšo uporabo bomo v
  naslednji fazi dodali pravo prijavo (Supabase).
- Brez urejanja, zamenjav ali obvestil — to je izključno pregledovalnik.
- Ob prvem obisku potrebuje internet (za nalaganje same aplikacije);
  po prvem obisku deluje tudi brez signala zahvaljujoč service workerju.

## Naslednji koraki (dogovorjeno v pogovoru)

1. ✅ Mobilni pregledovalnik razporeda (`index.html`)
2. ✅ Generator razporeda z omejitvami (`admin.html`)
3. ✅ Nadzorna plošča pravičnosti (`dashboard.html`)
4. ✅ Želje zaposlenih (`zelje.html`) — glej spodaj
5. Zamenjave, obvestila, uvoz iz Kadrisa, prava skupna baza (Supabase) — glej razdelek "Naslednji korak: Claude Code + server" spodaj

---

## Modul 3 — nadzorna plošča pravičnosti (`dashboard.html`)

Tri kartice, vsaka s svojo osnovo iz že opravljenih analiz Kadrisa:

- **SMS/TZN** — 56 oseb, obdobje 1. 1.–30. 9. 2026.
- **Dežurni DMS/DZN** — 12 oseb, obdobje 1. 1.–31. 7. 2026.
- **Nedežurni DMS/DZN** — 11 oseb, isto obdobje, samo za pregled (za to
  skupino generator še ne obstaja, zato tu ni nalaganja novih mesecev).

Tabele so razvrstljive (klik na naslov stolpca) in obarvane: zgoraj
(oranžno) so trije z največjo obremenitvijo po izbranem kazalniku, spodaj
(zeleno) trije z najmanjšo — to je neposreden namig, komu dati prednost pri
naslednjem razporedu.

**Kako se povezuje z modulom 2:** ko v `admin.html` generirate nov mesec,
tam prenesete JSON. Ta JSON naložite tukaj ("Dodaj mesec") in nadzorna
plošča ga prišteje k dosedanjemu stanju — testirano na oktobrskem izvozu,
ujemanje do zadnje enote (npr. ROZMAN A.: 138→155 delovnih dni, natanko
+17, kolikor jih je v naloženem oktobru). Ko stanje posodobite, ga
prenesete nazaj in ročno vnesete v `admin.html` kot izhodišče za naslednji
mesec — s tem generator dežurstev v modulu 2 dejansko uporablja sveže,
ne le julijske podatke.

### Omejitve tega modula

- Za dežurstva se ob nalaganju posodobi samo *število* dežurstev, ne ur,
  REDI-ja ali NZV — to zahteva pravi uvoz iz Kadrisa (šele faza 4).
- Posodobitev velja samo znotraj odprtega zavihka brskalnika, dokler je ne
  prenesete kot datoteko. Brez trajne shrambe (glej spodaj).
- Nedežurna skupina DMS/DZN nima generatorja, zato tudi ne more sprejemati
  novih mesecev tukaj.

---

## Modul: želje zaposlenih (`zelje.html`)

Za vsakega od 63 zaposlenih (vse skupine — SMS/TZN po oddelkih, dežurni in
nedežurni DMS/DZN) lahko vnesete:

- **obdobje** (prosto besedilo, npr. "9.–15. november" ali "cel december")
- **opis želje** (prosto besedilo)
- **fotografijo** (npr. slikan papirnat listek zaposlenega) — samodejno se
  pomanjša na največ 1600 px in stisne, da baza ne naraste prehitro
  (testna fotografija 2400×1800 je po stiskanju znašala ~16 KB)

Vnosi so razvrščeni po zaposlenem, iskalnik filtrira po imenu, obdobju ali
besedilu, klik na fotografijo jo odpre v polni velikosti.

**Shranjevanje:** IndexedDB v tem brskalniku (ne localStorage — ta ima
majhno omejitev, ki bi jo slike hitro presegle). To pomeni:

- Podatki **ostanejo samo na tej napravi/brskalniku**, dokler jih ne
  prenesete.
- Za prenos na drug računalnik ali objavo za drugega koordinatorja
  uporabite "Izvozi vse" (JSON, vključno s slikami) in na drugi napravi
  "Uvozi".

**Kako se povezuje z generatorjem:** želje se **ne** prenesejo samodejno v
`admin.html` — to je namenoma ročen korak. Coordinator prebere seznam želja
tukaj in jih ročno upošteva pri klikanju tednov dopusta (kartica Kalup) ali
pri urejanju odsotnosti (kartica Dežurstva). Samodejna povezava bi
zahtevala pravila za primere nasprotujočih si želja (dva zaposlena želita
isti prosti teden) — to raje prepustimo človeški presoji.


Trije moduli zdaj delujejo kot samostojne statične strani z ročnim
prenašanjem JSON datotek med seboj. Naslednji smiseln korak — če in ko se
za to odločite — je vezava na pravo skupno bazo (priporočeno: Supabase),
kar odpravi ročno prenašanje/nalaganje datotek in doda prijavo ter
obvestila. To je smiselno narediti v Claude Code (ne v tem pogovoru), ker
gre za daljše, iterativno delo z resničnim repozitorijem:

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude
```

V mapi projekta nato npr.: *"Preglej to mapo. Predlagaj Supabase shemo za
zaposlene/razpored/dežurstva/pravičnost na podlagi generator-core.js in
dashboard-core.js, ampak še ne piši kode — najprej mi pokaži načrt."*


---

## Modul 2 — generator razporeda (`admin.html`)

Namenjen koordinatorju, ni za splošno objavo zaposlenim. Dve kartici:

**Kalup (SMS/TZN)** — za izbran oddelek in mesec izračuna razpored po istem
5-tedenskem kalupu, ki smo ga preverili za oktober (1.240 celic, 0 neujemanj
z ročno preverjenim rezultatom). Za vsakega zaposlenega lahko po potrebi
popravite izhodiščno črko kalupa (če se je rotacija spremenila) in s klikom
označite teden dopusta — takrat generator za tisti teden prisilno vpiše LD
ne glede na rotacijo. Rezultat lahko prenesete kot JSON, ki ga ročno
zamenjate v `index.html`/podatkovni datoteki za zaposlene.

Nad to tabelo je od zdaj tudi **panel s predlogom prednosti**: razvrsti
zaposlene istega oddelka po dejanski obremenjenosti (nočne ure, nedelje +
prazniki, iz modula 3), koordinator vnese letno kvoto dopusta po osebi
(ni je v Kadrisu, zato ročno), panel izračuna preostanek in z gumbom
"Predlagaj teden" samodejno označi naslednji prosti teden za izbrano
osebo v tabeli spodaj — potrditev in generiranje ostaneta ročna.
Opozorilo: stolpec "Doslej LD" prihaja iz dejansko razporejenih LD dni v
kalupu, ne iz uradne kadrovske evidence, zato je pred zaupanjem
izračunanemu "preostane" smiselna hitra primerjava s pravo evidenco.

**Dežurstva (DMS/DZN)** — pravičen generator 24-urnih dežurstev, ki
neposredno naslavlja dve ugotovitvi iz analize Kadrisa:

- *Neenakomernost* (prej razpon 4–19 dežurstev, CV 32 %): generator vedno
  izbere osebo z najmanj dosedanjimi dežurstvi med tistimi, ki izpolnjujejo
  pogoje. Kader je prednastavljen s pravim stanjem konec julija 2026.
- *65 % dežurstev brez počitka*: nastavljivo polje "dan takoj po dežurstvu
  naj se ne razporeja" privzeto prepreči, da bi generator isti osebi
  dodelil še redno izmeno takoj po 24-urnem dežurstvu (to polje trenutno
  samo označi datum kot "blokiran" — dejansko izvedbo mora koordinator
  ročno upoštevati pri kalupu, dokler modula nista povezana).
- Nastavljiv minimalni razmik med dvema dežurstvoma iste osebe (privzeto
  3 dni).
- Če za posamezen dan noben zaposleni ne izpolnjuje pogojev, se to jasno
  označi kot opozorilo namesto tihe napačne dodelitve.

Testirano: kalup se ujema z že objavljenim oktobrskim razporedom, generator
dežurstev v testnem zagonu za avgust 2026 ni naredil nobene kršitve
minimalnega razmika in je osebama z najmanj preteklimi dežurstvi (Trpin
Saša, Salkić Maruša) samodejno dodelil največ novih.

### Omejitve tega modula

- Kalup in dežurstva sta ločena generatorja, ki (še) ne "vidita" drug
  drugega — če dežurna oseba iz DMS/DZN dela tudi po kalupu SMS/TZN, je
  usklajevanje trenutno ročno.
- Prenos rezultata v aplikacijo za zaposlene je ročen korak (prenesi JSON →
  zamenjaj datoteko). V fazi 4 bo to samodejno prek skupne baze.
- Roster (imena, oddelki, začetne črke kalupa, stanje dežurstev) je vgrajen
  v `admin.html` kot statični podatek. Ob spremembi kadra ga je treba ročno
  urediti v datoteki (iskan niz `WARDS_META` oziroma `DEZURNI_ZACETNO`).

