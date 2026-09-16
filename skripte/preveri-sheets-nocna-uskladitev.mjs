#!/usr/bin/env node
/* Nocna polna uskladitev ne sme postati tiha nevarnost.
 *
 * Sprotna sinhronizacija sloni na dogodku iz Apps Scripta. Dogodek se
 * lahko izgubi, vstavljanja stolpca pa Apps Script sploh ne javi - zato
 * nova oseba v listu po tej poti ne pride NIKOLI. Nocna uskladitev prebere
 * cel zavihek in to popravi.
 *
 * Ker pa hkrati pomeni, da aplikacija sama od sebe piše čez stotine
 * vrstic, mora imeti tri lastnosti, ki jih ta preizkus zahteva:
 *  1) NZV je izvzet - polna uskladitev NZV bi pobrisala rocno uvozene
 *     mesece, ker je list merodajen za cel dan;
 *  2) isti par (oseba, dan) gre v upsert SAMO ENKRAT - sicer Postgres
 *     zavrne cel svezenj ("cannot affect row a second time") in nocni tek
 *     tiho ne naredi nicesar;
 *  3) obstojeci zapisi se berejo v ENI poizvedbi, ne eni na celico -
 *     sicer je ~450 celic na zavihek ~450 poizvedb.
 *
 * Zagon: node skripte/preveri-sheets-nocna-uskladitev.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const vhod = readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8");
const urnik = readFileSync(join(koren, "supabase/urnik-sheets-uskladitev.sql"), "utf8");

console.log("\n1) Zastavica za cel zavihek");

trdi(/const celZavihek = telo\.cel_zavihek === true;/.test(vhod),
  "cel_zavihek se bere strogo (=== true), ne kot resnicnost");
trdi(/if \(!spreadsheetId \|\| !zavihek \|\| \(!celZavihek && !sporocene\.length\)\)/.test(vhod),
  "brez seznama celic je zahtevek veljaven SAMO pri polni uskladitvi");
trdi(/if \(celZavihek\) \{\s*\n\s*for \(const c of celice\) naloge\.push\(/.test(vhod),
  "pri polni uskladitvi se obdela cela mreza");

console.log("\n2) NZV je izvzet");

trdi(/if \(celZavihek && jeNzv\) \{[\s\S]{0,260}nepodprta_oblika/.test(vhod),
  "polna uskladitev NZV se zavrne v funkciji");
trdi(/oblika in \('oddelek', 'flexi'\)/.test(urnik),
  "urnik NZV sploh ne uvrsti med zavihke za uskladitev");
trdi(!/'nzv'/.test(urnik), "v urniku ni omembe oblike nzv");

console.log("\n3) Isti par (oseba, dan) samo enkrat");

trdi(/const poKljucu = new Map<string, Record<string, unknown>>\(\);/.test(vhod),
  "zapisi se pred svežnjem zlozijo po kljucu (oseba|dan)");
trdi(/poKljucu\.set\(String\(z\.employee_id\) \+ "\|" \+ String\(z\.work_date\), z\)/.test(vhod),
  "kljuc je res employee_id + work_date");
trdi(/zaZapisEnkrat\.slice\(i, i \+ SVEZENJ\)/.test(vhod),
  "v upsert gre razlicicа brez podvojenih kljucev, ne surovi seznam".replace("а", "a"));

console.log("\n4) Dostop do baze je zbatchan");

trdi(!/\.eq\("employee_id", oseba\.id\)\.eq\("work_date", celica\.datum\)/.test(vhod),
  "poizvedbe na posamezno celico ni vec");
trdi(/\.in\("employee_id", idji\)\s*\n\s*\.gte\("work_date", datumi\[0\]\)/.test(vhod),
  "obstojeci zapisi se preberejo skupinsko, ne po eni na celico");
trdi(/const obstojeciPoKljucu = new Map</.test(vhod)
  && /obstojeciPoKljucu\.get\(oseba\.id \+ "\|" \+ celica\.datum\)/.test(vhod),
  "primerjava 'brez spremembe' bere iz predpomnilnika, ne iz baze");
// PostgREST vrne najvec 1000 vrstic. Brez stranicenja je vse cez prvo stran
// videti, kot da zapisa ni - in se prepise ob vsakem nocnem teku znova.
trdi(/\.range\(od, od \+ STRAN - 1\)/.test(vhod),
  "obstojeci zapisi se berejo po straneh (.range)");
trdi(/if \(!obstojeci \|\| obstojeci\.length < STRAN\) break;/.test(vhod),
  "branje se ustavi sele, ko je stran nepopolna");
trdi(/\.order\("id", \{ ascending: true \}\)/.test(vhod),
  "strani imajo stabilen vrstni red, sicer se vrstice podvojijo ali izpustijo");

console.log("\n5) Delovisce je v svezenj VEDNO zapisano");

// supabase-js poravna svezenj na unijo kljucev: vrstica, ki polja nima, ga
// dobi kot null in povozi delovisce, ki ga je nastavila druga vrstica
// istega svezenja. Opazeno: ista oseba je imela isti dan enkrat null in
// drugic "", uskladitev pa se ni umirila nikoli.
trdi(/pokriva_oddelek: zeljenoDelovisce \|\| null,/.test(vhod),
  "pokriva_oddelek je v zapisu vedno, tudi ko je prazen");
trdi(!/if \(jeFlexi \|\| izRezerve\) zapis\.pokriva_oddelek/.test(vhod),
  "pogojnega dodajanja polja ni vec");
trdi(/const zeljenoDelovisce = jeFlexi/.test(vhod)
  && /\.toUpperCase\(\) === zeljenoDelovisce;/.test(vhod),
  "primerja se ISTA normalizirana vrednost, kot se zapise");

console.log("\n6) Prazna celica ne ustvarja vrstic");

// Polna uskladitev enega zavihka je napisala 852 praznih vrstic od 1993.
// Prazna celica in neobstojec zapis pomenita isto - prost dan.
trdi(/if \(!stara && jePrazenZapis\(novaKoda\)\) \{ brezSpremembe\+\+; continue; \}/.test(vhod),
  "prazna celica brez obstojecega zapisa se preskoci");
trdi(
  vhod.indexOf("if (!stara && jePrazenZapis(novaKoda))") > vhod.indexOf("const istaKoda = stara &&"),
  "preskok je ZA primerjavo, da prazna celica \u0161e vedno pobri\u0161e obstoje\u010do izmeno",
);

console.log("\n7) Nasprotje med listi se ne prepisuje, ampak javi");

// Lista si lahko za isto osebo in dan nasprotujeta (list C je za Misotic R.
// pisal "popoldan", list FLEXI "dopoldan"). Brez pravila prednosti se
// vsako noc izmenjaje prepisujeta in uskladitev se ne umiri nikoli.
trdi(/if \(izRezerve && stara\) \{/.test(vhod),
  "gost (oseba iz rezerve) obstojecega zapisa NE povozi");
trdi(/const nasprotja = new Map<string, string>\(\);/.test(vhod)
  && /nasprotja\.set\(oseba\.id,/.test(vhod),
  "nasprotje se zabelezi po OSEBI, ne po dnevu");
trdi(/zabelezi\("nasprotje_listov"/.test(vhod),
  "nasprotje se javi kot svoja vrsta napake");
trdi(
  vhod.indexOf("if (izRezerve && stara)") > vhod.indexOf("if (!stara && jePrazenZapis(novaKoda))"),
  "gost sme zapis \u0161e vedno USTVARITI, kadar ga \u0161e ni",
);

const admin = readFileSync(join(koren, "admin.html"), "utf8");
trdi(/nasprotje_listov: "/.test(admin),
  "nova vrsta napake ima razlago v pregledu napak");

console.log("\n8) Trda meja podatkov: razpored je aktualen od septembra 2026");

// Uporabnikova zahteva (september 2026): podatki razporeda so v aplikaciji
// aktualni SAMO od 2026-09-01 naprej. Januar-avgust so oddelani - razpored
// izveden, ure obracunane - in ne smejo vec priti v bazo po nobeni poti.
trdi(/const MEJA_PODATKOV = "2026-09-01";/.test(vhod),
  "meja je ena sama imenovana konstanta");
trdi(!/VSI_DNEVI_OD/.test(vhod),
  "stare odprte spodnje meje (VSI_DNEVI_OD) ni vec nikjer");
trdi(/function zacetekUskladitve\(danes: Date\): string \{/.test(vhod),
  "polna uskladitev izhodisce se vedno izracuna iz danasnjega dne");
trdi(/const odDneva = celZavihek \? zacetekUskladitve\(new Date\(\)\) : MEJA_PODATKOV;/.test(vhod),
  "dogodkovna pot ima odslej ISTO trdo mejo (prej je bila brez nje)");
trdi(/koordinateFlexi\(vrsteVrstic, odDneva, VSI_DNEVI_DO\)/.test(vhod)
  && /koordinateOddelka\(vrsteVrstic, odDneva, VSI_DNEVI_DO\)/.test(vhod),
  "meja se res uporabi pri obeh oblikah");
trdi(/koordinateNzv\(vrsteVrstic, MEJA_PODATKOV, VSI_DNEVI_DO, mesecZavihka\)/.test(vhod),
  "tudi NZV pot ne sega pred mejo");

// Funkcijo POZENEMO - prehod cez leto in ucinek meje sta natanko tisto,
// kar se zgresi ob branju.
const ujem = vhod.match(/function zacetekUskladitve\(danes: Date\): string \{([\s\S]*?)\n\}/);
trdi(!!ujem, "telo funkcije je berljivo");
if (ujem) {
  const telo = ujem[1].replace(/: string/g, "");
  const zacetek = new Function("MEJA_PODATKOV", "danes", telo + "\n").bind(null, "2026-09-01");
  const primeri = [
    // Nad mejo se obnasa kot doslej: prvi dan prejsnjega meseca.
    ["2026-12-31", "2026-11-01", "december -> zacne z novembrom"],
    ["2026-11-02", "2026-10-01", "november -> zacne z oktobrom"],
    ["2026-10-16", "2026-09-01", "oktober -> zacne s septembrom (ravno meja)"],
    // Pod mejo se USTAVI na njej, namesto da bi segla v oddelane mesece.
    ["2026-09-16", "2026-09-01", "september -> se NE vrne v avgust"],
    ["2026-03-01", "2026-09-01", "marec -> meja prevlada nad prejsnjim mesecem"],
    ["2026-01-05", "2026-09-01", "januar -> meja prevlada tudi cez prehod leta"],
    // Prihodnje leto: meja ne sme zamrzniti okna.
    ["2027-02-10", "2027-01-01", "februar 2027 -> zacne z januarjem 2027"],
  ];
  for (const [dan, pricakovano, opis] of primeri) {
    const dobil = zacetek(new Date(dan + "T12:00:00Z"));
    trdi(dobil === pricakovano, `${opis} (${dan}) – dobil ${dobil}`);
  }
}

console.log("\n9) Urnik");

trdi(/cron\.unschedule\('sheets-nocna-uskladitev'\)/.test(urnik),
  "staro opravilo se odstrani - ponoven zagon ga ne podvoji");
trdi(/'15 1 \* \* \*'/.test(urnik), "tek je ponoci (01:15 UTC)");
trdi(/p\.aktivno[\s\S]{0,60}p\.sheets_v_app/.test(urnik),
  "usklajujejo se samo vklopljene povezave s smerjo Sheets -> aplikacija");
// Privzetih 5 sekund pg_net ne zadosca: list C ima 4166 celic mreze.
trdi(/timeout_milliseconds := \d{5,}/.test(urnik),
  "klic ima podaljsan casovni rok (privzetih 5 s je premalo)");

console.log(napake.length ? `\n✗ ${napake.length} napak\n` : "\n✓ Vse v redu\n");
process.exit(napake.length ? 1 : 0);
