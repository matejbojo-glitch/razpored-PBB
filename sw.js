// Razpored PBB — service worker
// Faza 4: dodana prijava/vloge — HTML strani zdaj network-first (da nova
// objava vedno pride skozi), knjižnice ostajajo cache-first (nespremenljive
// med objavami). Prazna delovanje brez signala ostaja kot rezerva iz cacha.
// v3: nov logo/barve bolnišnice — dvignjena verzija, da se slikovne datoteke
// (ikone, logo-pbb.png), ki so cache-first, ponovno prenesejo.
// v4: dodana stran imenik.html (kontakti/imenik zaposlenih).
// v5: dodana stran nastavitve.html (ikona ⚙️ poleg odjave).
// v6: dodan uvoz Excel/Google Sheets/PDF (xlsx.core.min.js, import-utils.js) —
// pdf.min.mjs/pdf.worker.min.mjs se NISTA dodala v precache, ker se naložita
// šele ob prvi uporabi uvoza PDF (dynamic import), splošni fetch-handler spodaj
// pa ju po prvem nalaganju vseeno predpomni (cache-first veja za ne-HTML/JSON).
// v7: import-utils.js razširjen (glava-po-imenu mapiranje stolpcev, datumi iz
// Excela) — dvignjena verzija, da se cache-first predpomnjena stara različica
// datoteke povsod zamenja s to novo.
// v8: popravek pravega hrošča — "Datum rojstva" kot besedilo DD.MM.LLLL (ne
// prava Excel datumska celica) se je pošiljalo v Postgres "date" stolpec
// nepretvorjeno, kar je za dneve >12 vrglo napako, za ostale pa tiho
// zamenjalo dan/mesec (import-utils.js normalizirajDatum()).
// v9: dodana stran reset-geslo.html (pozabljeno geslo) + korak "nastavi
// geslo" takoj po registraciji v login.html.
// v10: nov skupni theme.css (vizualna prenova) — dodan v precache, da je
// oblikovanje na voljo tudi brez signala; dvignjena verzija, da se povsod
// takoj prenese.
// v11: nova stran obrazec.html (evidentiranje prisotnosti/menjava službe) +
// posodobljen nav.js (dodana ikona "Obrazec"). nav.js se je do zdaj serviral
// cache-first (ni HTML/JSON), zato brez dviga verzije nova ikona v navigaciji
// ne bi nikoli prišla do uporabnikov z že nameščenim service workerjem.
// v12: spletna/namizna različica — nav.js dobi zgornjo (namizno) navigacijsko
// vrstico namesto spodnje na širokih zaslonih, theme.css dobi širše "wrap.wide"
// prelome. Oba se servirata cache-first (nista .html/.json), zato spet
// potreben dvig verzije, da sprememba doseže brskalnike z že nameščenim SW.
// v13: Excel/Google Sheets izvoz na vseh straneh z razpredelnicami — 3 nove
// skupne datoteke (export-utils.js, gsheets-client.js, export-buttons.js),
// vse cache-first, zato v precache in nova verzija.
// v14: menjave.html (swap_requests, dvostopenjski vodja→admin) ukinjena —
// združena v obrazec.html ("Menjava", nav.js dobi en sam vnos namesto dveh).
// menjave.html odstranjena iz precache (dvig verzije, da cache.addAll ne
// poskuša naložiti ukinjene datoteke in podre namestitve service workerja).
// v15: nav.js gumb "Pravičnost" preimenovan v "Statistika" — cache-first,
// zato dvig verzije.
// v16: export-buttons.js dobi "compact" ikonski način izvoza (mobilna
// prilagoditev index.html) — cache-first, zato dvig verzije. manifest.json
// se ob tem tudi na novo prenese (orientation: "any" namesto zaklenjeno na
// pokončno, da telefon lahko obrne zaslon).
// v17: import-utils.js popravek normalizirajDatum (datumi s presledki po
// pikah, "1. 9. 2026") — cache-first, zato dvig verzije.
// v18: theme.css dobi barvno kodirane značke za izmene (swatch-*, nov --ld
// zelena za letni dopust) + zložljiva pomoč (.infoToggle/.infoPanel) —
// cache-first, zato dvig verzije.
// v19: export-buttons.js dobi nov neobvezen "ical" prop (izvoz osebnega
// razporeda v .ics za "Moj razpored") — cache-first, zato dvig verzije.
// v20: potisna obvestila (Web Push) — nov push-client.js v precache, sam
// sw.js dobi 'push'/'notificationclick' poslušalca. Dvig verzije je tu
// nujen tudi zato, da se nov service worker sploh namesti (brez tega stari
// SW brez push poslušalca ostane aktiven in obvestila ne bi delovala).
// v21: prenova UI/UX — theme.css dobi skupne kartične gradnike (KPI
// kartice, stolpčni graf, toplotna karta, časovna premica, napredkovne
// vrstice, avatar s statusom, modalno okno, koledar na dotik) —
// cache-first, zato dvig verzije.
// v22: prenova Generatorja (nadzorna plošča "Generiraj takoj", zložljivi
// razdelki, značke vlog, vrstice napredka) — theme.css spet spremenjen
// (prikaz pravil kot bloka), zato dvig verzije.
// v23: nov skupni delovni-cas.js (edini vir resnice o urah izmen +
// preverjanje delovnopravnih pravil) — cache-first, zato dvig verzije in
// vpis v precache.
// v24: Generator (Kalup) — delovnopravne kršitve zdaj obarvajo tudi
// posamezne celice v mreži (rdeč/oranžen rob + opomba na hover), ne samo
// povzetek zgoraj — cache-first, zato dvig verzije.
// v25: zavihek "Uporabniki" (admin.html) prenovljen na kartični prikaz
// (isti vzorec kot Imenik) namesto vodoravno-drseče tabele — bolj
// uporabno na mobilnem — cache-first, zato dvig verzije.
// v26: Faza 1 (skladnost) — revizija sprememb pravic (Revizija → Pravice
// in dostopi), delovnopravno opozorilo pri menjavi (obrazec.html zdaj
// nalaga delovni-cas.js) in "Po oddelkih" odprt vsem zaposlenim za vse
// oddelke — cache-first, zato dvig verzije.

// v27: Faza 2 — živa koledarska naročnina (Nastavitve → Koledar), nova
// robna funkcija "koledar" in RazporedAuth.SUPABASE_URL v supabase-client.js
// — cache-first, zato dvig verzije.

// v28: Faza 3 — matična številka v zbirnem izvozu ur za plače (računovodstvo
// in Kadris osebo prepoznata po njej, ne po imenu) + opozorilo na osebe, ki
// je še nimajo — cache-first, zato dvig verzije.

// v29: Faza 2 — izbira kanalov obveščanja po osebi (Nastavitve → Kam naj
// pridejo obvestila) in dostava po e-pošti — cache-first, zato dvig verzije.

// v30: koledarska naročnina — vklop/izklop sinhronizacije po osebi
// (Nastavitve → Koledar) — cache-first, zato dvig verzije.
// v31: uvodna kartica na Razporedu (namestitev na domači zaslon + vklop
// obvestil) — spremenjena index.html in theme.css, zato dvig verzije.
// v32: ločeni dnevni 12-urni izmeni (DNEVNA12 05:50-18:00 in DNEVNA12F
// 07:00-19:00) — spremenjeni delovni-cas.js, dashboard-core.js,
// index.html in admin.html. Brez dviga bi zaposleni še naprej videli
// stare ure.

// v33: "DEZ" je spet dodeljiv v Imeniku (kot članstvo, ne domači oddelek)
// in Dežurstva javijo, koga od 14 manjka — spremenjena imenik.html in
// admin.html.

// v34: neprosojna lepljiva glava (prekrivanje besedila) in enako široke
// vrstice Imenika — spremenjene imenik/zelje/obrazec/nastavitve/admin.

// v35: enoten zapis imen "Priimek Ime" — spremenjeni login/imenik/admin/
// index (naslovi stolpcev, polje ob registraciji, komentar pri parafi).

// v36: uvoz (📥) in izvoz (⬇) na Razporedu sta se preselila v vrstico
// ikon zgoraj desno (poleg ⚙ in 🚪) — prej sta zasedala vrstico pod
// izbirnikom meseca. Spremenjeni index.html in nav.js (nav.js je
// cache-first, zato je dvig verzije nujen).

// v37: izvoz je na VSEH straneh v vrstici ikon zgoraj desno (register
// izvoznih virov v export-buttons.js), uvoz zna prebrati še .json/.jsonl/
// .gsheet in pri slikah/Wordu pove, zakaj ne gre. Spremenjeni
// export-buttons.js, import-utils.js, nav.js in vse strani —
// prvi trije so cache-first, zato je dvig verzije nujen.

// v38: uvoz dobi svojo ikono 📥 z menijem (isti register kot izvoz) —
// na vsaki strani našteje, kaj je tam mogoče uvoziti. Želje dobijo uvoz
// iz Google Sheets. Spremenjeni export-buttons.js in strani.

// v39: Želje je mogoče uvoziti s fotografije razpredelnice — bere se
// BARVA celice (ne besedilo), mrežo določi uporabnik z dotikom štirih
// vogalov. Spremenjena zelje.html.

// v40: še zadnji izvozi (CSV, JSON osnova, PDF) na Generatorju in
// Statistiki so v meniju ikone ⬇ — v vsebini ni več izvoznih gumbov.
// Spremenjeni export-buttons.js, admin.html, dashboard.html.

// v41: dežurna pravila (najmanj/največ na mesec, prost dan, samo med
// tednom) je mogoče trajno urejati v Imeniku — doslej jih je bilo mogoče
// spremeniti le za eno generiranje. Spremenjena imenik.html.

// v42: enotna postavitev — širine vsebine so ena lestvica v theme.css
// (.wrap / .wrap.wide / .wrap.polna), strani pa ne nosijo več svojih
// kopij skupnih razredov (.card, .sub, .field, h2.section, p.hint,
// .submitBtn). Spremenjeni theme.css in vse strani.

// v43: seznami zaposlenih so strnjeni — vidno je samo ime, klik na vrstico
// razpre osnovne podatke, klik na ime odpre celoten zapis. Vzorec je zdaj
// ena skupna komponenta (oseba-vrstica.js), ne kopija na vsaki strani.
// Spremenjeni imenik.html, admin.html, theme.css; nov oseba-vrstica.js.

// v44: "Po oddelkih" (SMS razpored) po vzoru uradne predloge "2026 SMS
// RAZPORED" — celica zdaj kaže CELO kodo izmene (prej kvečjemu 3 znake, kar
// je KPU brez razločevanja od prazne celice prikazovalo enako kot "–").
// Admin lahko razpored zdaj tudi zapiše NAZAJ v obstoječ Google Sheets
// dokument (samo v ujemajoče se celice - imena/oblika/podpisi ostanejo
// nedotaknjeni). Ob tem popravljena resnična napaka pri uvozu IN pisanju:
// prazna vrstica sredi mesečnega bloka je doslej nepovratno prekinila
// branje vseh dni za njo. Spremenjeni index.html, gsheets-client.js.

// v45: NZV pogled usklajen z uradno predlogo "Letni dopusti in omejitve za
// NZV" — vrstni red stolpcev popravljen (SA DOP/SA POP med DB in URGENCA,
// ne na koncu) in dodani trije novi povzetni stolpci LD/IZOB/BS (kdo je ta
// dan na letnem dopustu/strokovnem izobraževanju/bolniški - iz leave_entries,
// isti vir kot Želje → Razpredelnica). Uvoz teh treh stolpcev piše v
// leave_entries (ne schedule_entries kot ostale enote). "Zapiši nazaj v
// Sheets" zdaj deluje tudi za NZV (prej samo za navadne oddelke). Spremenjen
// index.html.

// v46: "Uvoz razporeda" (Po oddelkih/NZV) dobi enostavnejšo pot - namesto da
// mora admin za VSAK oddelek posebej kopirati pravo #gid= povezavo iz
// Google Sheets, lahko zdaj naloži EN Excel izvoz (lahko cel delovni
// zvezek z več zavihki, npr. "2026 SMS RAZPORED") in aplikacija sama
// prepozna, kateri zavihek je kateri oddelek/mesec, ter uvozi vse naenkrat
// (uvoziDatotekoPametno). Prejšnja pot (lepljenje povezave, en oddelek/
// zavihek naenkrat) ostane na voljo kot "Ali ročno …". Spremenjeni
// index.html, import-utils.js.

// v47: popravek resnične napake v46 - "Naloži datoteko (samodejno)" je pri
// večzavihkovni datoteki (npr. cel "2026 SMS RAZPORED") pisalo VSE zavihke
// v EN SAM Postgres upsert stavek; če je ista oseba za isti dan nastopila v
// dveh zavihkih (npr. FLEXI pokritost + matični oddelek), je Postgres to
// zavrnil z "ON CONFLICT DO UPDATE command cannot affect row a second
// time" in CEL uvoz je spodletel. Zdaj se vsak zavihek zapiše LOČENO
// (zaporedoma), z dodatnim čiščenjem morebitnih podvojenih vrstic ZNOTRAJ
// istega zavihka (zdruziPoKljucu) - poznejši zavihek/vrednost prepiše
// prejšnjo za ta dan, namesto da bi celoten uvoz padel. Spremenjen
// index.html.

// v48: popravljena RESNIČNA napaka "vpisi pristanejo na napačnem dnevu" pri
// uvozu iz naložene .xlsx datoteke (na VSEH oddelkih) - Excel/Google Sheets
// shranita datum kot serijsko število, ki pri izvozu iz Google Sheets
// pogosto NI točno cel dan (drobna plavajoča napaka, npr. 46173.999999988
// namesto 46174 za isti dan); brez zaokroževanja se je to prebralo kot
// prejšnji dan tik pred polnočjo. xlsxCelicaVBesedilo (import-utils.js)
// zdaj zaokroži na najbližji dan - potrjeno s pravim branjem/pisanjem
// xlsx.core.min.js (preveri-xlsx-datum.mjs). Ista napaka bi lahko doslej
// prizadela tudi druge, starejše uvoze iz .xlsx (npr. HR uvoz v Imeniku).
// Dodatno: "Moj razpored" zdaj prikaže tudi LD, vpisan samo v Želje →
// Razpredelnica (leave_entries) - prej se je za osebe, ki nimajo objavljene
// izmene po osebi (NZV/vodje), letni dopust kazal kot navaden prost dan.
// Spremenjena index.html, import-utils.js.

// v49: "Po oddelkih"/NZV dobi ročen gumb "↔️ Širši prikaz (kot ležeče)" -
// dosedanja široka postavitev tabele je bila vezana IZKLJUČNO na
// @media (orientation: landscape), kar se na telefonu s samodejnim
// obračanjem zaslona IZKLOPLJENIM (pogosto v nastavitvah Androida) nikoli
// ne sproži, ne glede na to, kako uporabnik drži telefon. Gumb doseže isto
// postavitev (html.sirsiPogled v <style>) ne glede na dejansko orientacijo
// naprave, izbira se zapomni (localStorage). Spremenjen index.html.

// v50: popravek pravega hrošča v gumbu iz v49 - uporabnikov posnetek
// zaslona (pravi telefon, samodejno obračanje IZKLOPLJENO) je pokazal, da
// prejšnja rešitev (samo table-layout:fixed na nespremenjeni ozki širini)
// tabelo samo STISNE, je ne razširi. "Širši prikaz" zdaj namesto tega
// resnično ZAVRTI celo stran za 90° (CSS transform na <body>, klasičen
// "prisilno ležeče" trik) - telefon dejansko dobi širino svoje višine.
// Gumb preimenovan v "🔄 Obrni na ležeči prikaz"/"📱 Nazaj na pokončni
// prikaz", da opiše dejansko (novo) vedenje. Spremenjen index.html.

// v51: popravek pravega hrošča v51 iz v50 - nov uporabnikov posnetek
// zaslona (tokrat s telefonom, ki JE fizično zavrten v ležečo lego, medtem
// ko je ročni "Širši prikaz" iz v50 ostal vklopljen) je pokazal, da stran
// takrat ostane stisnjena v majhen pas na sredini zaslona, obdana s črnim
// - ročni CSS zasuk (rotate(90deg) na body) in prava ležeča orientacija
// ustvarita konflikt (100vh/100vw se ob fizičnem obratu ne prerešita
// zanesljivo). Popravek: nov JS poslušalec (matchMedia "orientation:
// landscape") ročni zasuk SAM izklopi, takoj ko telefon postane resnično
// ležeč - takrat že obstoječ @media (orientation: landscape) sam poskrbi
// za širok prikaz, ročni trik pa se umakne, še preden pride do konflikta.
// Spremenjen index.html.

// v52: uporabnikov naslednji posnetek zaslona (tokrat s telefonom, ki JE
// pravilno v ležeči legi) je pokazal, da header.top (logo, podnaslov,
// "Prijavljen", zavihki, izbirniki Oddelek/Mesec) v nizki ležeči višini
// zapolni CELOTEN vidni zaslon, še preden se prikaže ena sama vrstica
// razporeda - "širši prikaz" je bil zato brez učinka (širina se je
// povečala, a nič dodatnega ni bilo videti brez drsenja). theme.css dobi
// nov @media (orientation: landscape) and (max-height: 500px) blok, ki
// glavo strči (manjši logo/pisava, skrit podnaslov, tanjši razmiki) SAMO
// na dejansko nizkih telefonskih zaslonih - širši/višji ležeči zasloni
// (tablice, namizje) ostanejo nespremenjeni. Gumb "Obrni na ležeči
// prikaz" (index.html) se zdaj tudi skrije v pravi ležeči legi, kjer bi
// bil - kot je uporabnik opazil - brez učinka (prejšnji v51 popravek ga
// takoj sam izklopi). Spremenjena index.html, theme.css.

// v53: Admin → Kalup dobi nov gumb "📤 Zapiši predogled v Sheets" - piše
// PREDOGLED generatorja (z upoštevanimi ročnimi popravki celic), ŠE PRED
// objavo v Supabase, nazaj v obstoječi Google Sheets dokument (npr. "2026
// SMS RAZPORED"), na iste koordinate kot že objavljen razpored (index.html
// "Zapiši nazaj v Sheets") - piše samo v obstoječe celice, nikoli ne doda
// vrstice/stolpca. Nova skupna datoteka sheets-mreza.js (namerno LOČENA
// kopija iskalne logike iz index.html - admin.html je samostojna stran in
// do Babel/React funkcij v index.html ne more priti), preverjena s
// preveri-sheets-mreza.mjs. Spremenjena admin.html, nova sheets-mreza.js.

// v54: Uvoz iz PDF-ja zdaj prepozna PRAVE stolpce (ne samo golo besedilo
// po vrsticah kot doslej) - pdfKoscjiVTabelo (import-utils.js) uporabi
// vodoravno lego/širino vsakega koščka besedila (že na voljo v pdf.js), da
// najde meje med stolpci po navpičnem belem prostoru. Uveljavljeno povsod,
// kjer je uvoz doslej PDF izrecno zavračal z "PDF ni podprt" (admin.html,
// zelje.html) - zdaj namesto tega poskusi prepoznati tabelo, in samo če je
// PDF res golo besedilo (dopis, ne preglednica), pokaže isto sporočilo kot
// prej. "Naloži datoteko (samodejno)" v index.html zdaj sprejme tudi .pdf.
// Dodatno: barva LD (letni dopust) v "Moj razpored" je bila temno zelena
// ("#2F6B4A"), skoraj neločljiva od "PRISOTEN"/dopoldan (obe uporabljata
// isto zeleno "#4F9B6B" pri 15% podlagi) - LD je zdaj rdeča ("#E06666"),
// enaka kot že drugod v aplikaciji (Želje → Razpredelnica). Dežurstvo se
// zdaj izriše polno zapolnjeno (bela pisava na opekasti podlagi), da
// vizualno izstopa tudi od LD, ne le po odtenku. Spremenjena index.html,
// import-utils.js, admin.html, zelje.html. Nov preveri-pdf-stolpci.mjs.

// v55: popravek resnične napake v pdfKoscjiVTabelo (import-utils.js, v54),
// najdene na dry-run-u PRAVE uradne datoteke uporabnika ("Razporeditev
// zaposlenih v UA in DEŽ"): naslovna vrstica, ki je EN sam košček širok
// skoraj celo stran, je s svojo širino premostila prav vse meje med
// stolpci in ves dokument sesula v en sam stolpec. Pasovi se zdaj računajo
// SAMO iz vrstic s tipičnim (najpogostejšim) številom koščkov na vrstico -
// naslovna/podpisna vrstica se s tem samodejno izloči. Spremenjena
// import-utils.js, dopolnjen preveri-pdf-stolpci.mjs.

// v56: nov gumb v "Uvoz razporeda" (index.html) - "🩺 Naloži dežurstvo
// zdravnikov (PDF)" prebere uradni mesečni dokument "Razporeditev
// zaposlenih v UA in DEŽ" (Urgenca ZDR/Dežurstvo ZDR - dva kroga
// zdravnikov, doslej neznana aplikaciji) in ime dežurnega zdravnika zdaj
// prikaže poleg DEŽURSTVA v "Moj razpored" (nova tabela duty_doctors,
// samo za prikaz - zdravniki nimajo profila/računa). Zapis "Ime (Drugo
// Ime)" pomeni zamenjavo - uporabi se samo prvo (dejansko delajoče) ime.
// Spremenjena index.html, supabase/schema.sql. Nov preveri-zdravniki-dezurstvo.mjs.

// v57: pod mesečnim razporedom ("Po oddelkih") se adminu zdaj izpiše
// seznam VSEH menjav tistega meseca (kdo z kom, katera dneva, status) -
// doslej so bile menjave vidne izključno na ločeni strani "Menjava", ne
// pa ob razporedu, ki ga koordinator dejansko pregleduje. Seznam je
// pregled/revizija: ob potrditvi koordinatorja se izmeni v razporedu
// zamenjata samodejno (obrazec_potrdi_koordinator, schema.sql sekcija
// 22), zato razpored zgoraj učinek menjave že vsebuje. Zavihek "Kalup
// (SMS/TZN)" v admin.html se odslej imenuje "Oddelki" (izrecna želja
// uporabnika; "kalup" ostaja ime rotacijskega vzorca A-E).
// Spremenjeni index.html, admin.html.

// v58: zavihek "Oddelki" (admin.html) dobi razdelek "📥 Uvozi že sestavljen
// razpored" z izbirnikom skupine - vseh 6 oddelkov + FLEXI + NZV. Uvoz sam
// ostaja na ENEM mestu (index.html, uvoziDatotekoPametno - ista, testirana
// pot za vse skupine), zavihek pa nanj napoti prek naslova
// "index.html?uvoz=1&oddelek=…&mesec=…" z že izbrano skupino in mesecem;
// index.html ta naslov prebere (preberiUvozIzNaslova), odpre uvozno okno in
// parametre pobriše iz naslova, da se okno ob osveževanju ne odpira znova.
// Namesto podvojitve uvozne logike (~300 vrstic, pokritih z več preizkusi)
// je izbrano napotilo, da kopiji ne moreta zaiti iz sinhronizacije.
// Spremenjeni index.html, admin.html. Nov preveri-uvoz-napotilo.mjs.

// v59: popravek RESNIČNE napake, zaradi katere je NZV mreža ostala prazna,
// čeprav je uvoz javil več sto vpisanih vrstic (uporabnik jo je prijavil s
// posnetkom): schedule_entries ima TRI tuje ključe na profiles
// (employee_id + pozneje dodana created_by/updated_by, sekcija 30 sheme),
// nalozizPodatkeNzv pa je bral vgnezdeno z nedoločenim "profiles(...)".
// PostgREST tak zapis zavrne kot dvoumen in vrne napako namesto vrstic -
// zato so bile enote IN stolpec DEŽURSTVO prazni, medtem ko je LD deloval
// (bere se iz leave_entries prek ločene poizvedbe). Ista napaka je tiho
// praznila dežurstva v razporedu vodij (admin.html). Obojemu dodan namig
// "profiles!employee_id(...)"; preveri-vgnezdeni-join.mjs odslej statično
// lovi vsak tak dvoumen zapis (napaka se drugače ne pokaže kot sporočilo,
// ampak samo kot prazen zaslon).
// Datum je odslej po VSEJ aplikaciji zapisan enako: dan.mesec.leto brez
// presledkov ("27.10.2026") prek nove skupne datum.js - privzeta slovenska
// oblika ("27. 10. 2026") se je v ozkem stolpcu DATUM obrezala v "1. 9. 20…",
// obenem pa je bil datum po straneh zapisan na tri različne načine.
// Spremenjeni index.html, admin.html, obrazec.html, zelje.html; nova datum.js.

// v60: Imenik dobi zavihek "Parafe", viden VSEM prijavljenim (doslej je
// bila parafa vidna samo adminu, in še to posamično na profilu ene osebe).
// Pregled poudari dvoje, kar tiho lomi uvoz razporeda: TRKE (dve osebi z
// isto parafo - uvoz take oznake ne more enolično pripisati, zato vpis
// odpade in v poročilu piše "parafa se ujema z več osebami") in IZPELJANE
// parafe (kdor je nima izrecno nastavljene, dobi prve tri črke priimka -
// najpogostejši vir trkov, npr. dva Pogačnika -> oba "POG"). Parafa je
// vezana na DATUM razporeda (prenova od 1.10.2026), zato ima pregled
// izbirnik meseca. Logika paraf se je preselila v skupno parafa.js (edini
// vir resnice; podvojena bi bila nevarna, ker gre za preslikavo oznaka →
// OSEBA v razporedu). Spremenjena index.html, imenik.html; nova parafa.js.

// v61: "Moj razpored" upošteva DELOVNIK NZV (vodje/administratorji) -
// pravilo, ki ga je uporabnik večkrat izrecno ponovil, prikaz pa ga ni
// upošteval: redni delovnik je PON-PET; sobota in nedelja sta PROSTI,
// razen ob dežurstvu; letni dopust velja samo za delovne dni (vikend
// sredi dopusta je navaden prost dan, doslej je kazalo "LD"); dežurstvo
// MED TEDNOM se opravlja PO redni prisotnosti (15:30-07:00), zato tak dan
// pomeni oboje - "PRISOTEN + DEŽURSTVO" - vikend dežurstvo (07:00-07:00)
// pa ostane samo "DEŽURSTVO". Gre za PRIKAZNO pravilo: schedule_entries
// ima na (employee_id, work_date) en sam zapis, zato prisotnost in
// dežurstvo istega dne ne moreta obstajati kot dve vrstici, je pa oboje
// pravilno izpeljati iz enega. Oddelčnega kadra (B/C/C1/D/E1/E2/FLEXI),
// ki vikende dela normalno, se pravilo NE dotakne.
// Dodan tudi uporabnikom potrjen popravek kratkega zapisa iz predloge:
// "VALJAVEC A." -> "VALJAVEC E." (oseba je Valjavec Enej; brez tega so
// njegove izmene tiho ostale neuvožene). Popravki so v skupni parafa.js,
// zato jo odslej nalaga tudi admin.html (sheets-mreza.js).
// Spremenjeni index.html, admin.html, parafa.js, sheets-mreza.js.

// v62: Imenik dobi zavihek "Razpredelnica" - mesečni pregled po osebah s
// petimi stanji, kot jih je zahteval uporabnik: na delu, dežurstvo,
// dopust, bolniška, prosto/ni v razporedu. Združuje DVA vira, ki se
// dopolnjujeta: objavljen razpored (schedule_entries) in vpise iz Želja
// (leave_entries) - slednji pokrijejo tudi ljudi brez objavljenega
// razporeda po osebi (NZV/vodje). Filter po mesecu in oddelku, legenda z
// barvami. Neznana koda izmene šteje kot "na delu" in ne "prosto":
// lažno prost dan bi lahko pomenil, da koordinator nekoga po nesreči
// razporedi še enkrat. Spremenjena imenik.html.

// v63: parafa.js — izrecno nastavljena parafa premaga izpeljano, zato
//      uvoz ne preskoči več obeh oseb ob "trku" tipa POG/TOM.
// v70: prazniki.js - delovnik NZV (PON-PET, vikendi IN prazniki prosti
//      razen dežurstva) je odslej EN vir za vse tri zaslone.
// v69: pregled nadomeščanj v Imeniku + popravki iz Razpored_nadomescanj.xlsx.
// v68: popravljen uvoz dežurnih zdravnikov (prej je zapisal kratico dneva
//      namesto imena) + tabela vseh treh krogov pod NZV razporedom.
// v67: pokrivanja iz tabele parov (vzajemna, večkratna) v obeh smereh.
// v66: Razpredelnica pokaže enote in nadomeščanje nosilcev oddelkov.
// v65: mreža NZV upošteva delovnik PON-PET (vikend prost razen dežurstva).
// v64: KLJUČEN POPRAVEK. cache.addAll je datoteke jemal iz brskalnikovega
//      HTTP predpomnilnika, zato je ob dvigu različice v NOV predpomnilnik
//      shranil STARO vsebino. Posledica: index.html (network-first, torej
//      svež) je klical funkcijo iz parafa.js (cache-first, torej star) in
//      padel z "window.Parafa.lastniki is not a function". Odslej se ob
//      namestitvi vsaka datoteka zahteva s {cache:"reload"}, kar HTTP
//      predpomnilnik obide. Brez tega bi se to ponovilo ob VSAKI spremembi
//      skupne .js datoteke.
const CACHE = 'razpored-pbb-v70';
const ASSETS = [
  './',
  './index.html',
  './theme.css',
  './login.html',
  './reset-geslo.html',
  './obrazec.html',
  './admin.html',
  './dashboard.html',
  './zelje.html',
  './imenik.html',
  './nastavitve.html',
  './manifest.json',
  './generator-core.js',
  './dashboard-core.js',
  './dashboard-baseline.json',
  './icon-192.png',
  './icon-512.png',
  './logo-pbb.png',
  './react.production.min.js',
  './react-dom.production.min.js',
  './babel.min.js',
  './supabase-js.min.js',
  './supabase-client.js',
  './nav.js',
  './datum.js',
  './parafa.js',
  './prazniki.js',
  './push-client.js',
  './delovni-cas.js',
  './xlsx.core.min.js',
  './import-utils.js',
  './export-utils.js',
  './gsheets-client.js',
  './export-buttons.js',
  './sheets-mreza.js',
  './oseba-vrstica.js',
  // Manjkali sta na seznamu, zato brez omrežja nista bili na voljo:
  // print-fit.js (tiskanje/PDF na vseh straneh) in exceljs.min.js (izvoz
  // v Excel v Željah). Odkrila ju je skripte/preveri-sw-osvezitev.mjs.
  './print-fit.js',
  './exceljs.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // {cache:"reload"} je nujen: brez njega addAll vzame datoteko iz
      // HTTP predpomnilnika brskalnika in v nov predpomnilnik shrani staro
      // vsebino - dvig različice takrat ne pomeni nič.
      cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first za HTML/JSON (da uporabnik vedno dobi svežo objavo in svež
// razpored, brez čakanja na novo različico service workerja), cache-first
// samo za nespremenljive knjižnice — rezerva iz cacha ostane, če ni signala.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isHtmlOrData = event.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.json')
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isHtmlOrData) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ---------------------------------------------------------------------
// Potisna obvestila (Web Push). Vsebino pošlje Edge Function
// posiljaj-push kot JSON { naslov, telo, url } — glej
// supabase/functions/posiljaj-push/index.ts in PUSH-SETUP.md.
// ---------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let podatki = {};
  try {
    podatki = event.data ? event.data.json() : {};
  } catch (e) {
    // Če vsebina ni JSON (npr. testni push iz DevTools), jo pokažemo kot golo besedilo.
    podatki = { telo: event.data ? event.data.text() : '' };
  }
  const naslov = podatki.naslov || 'Razpored PBB';
  const moznosti = {
    body: podatki.telo || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    lang: 'sl',
    data: { url: podatki.url || 'index.html' },
    // Brez tega bi bilo na Androidu obvestilo tiho zavrnjeno, ker smo se
    // naročili z userVisibleOnly:true.
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(naslov, moznosti));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cilj = (event.notification.data && event.notification.data.url) || 'index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((seznam) => {
      // Če je aplikacija že odprta, jo samo osvežimo na pravo stran
      // (namesto da odpremo še eno okno/zavihek).
      for (const odjemalec of seznam) {
        if ('focus' in odjemalec) {
          if ('navigate' in odjemalec) odjemalec.navigate(cilj).catch(() => {});
          return odjemalec.focus();
        }
      }
      return self.clients.openWindow(cilj);
    })
  );
});
