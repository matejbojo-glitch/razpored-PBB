#!/usr/bin/env node
/* Preizkus obdelajFlexiVrstice() (index.html) - nova podpora za zavihek
 * FLEXI v realni predlogi "2026_SMS_RAZPORED.xlsx", ki ga uvoz doslej
 * sploh ni znal prebrati (znana, dokumentirana vrzel).
 *
 * FLEXI ima DRUGAČNO obliko kot ostalih 6 oddelkov: vsaka oseba zaseda
 * PAR stolpcev (oddelek te izmene + izmena), ker flexi kader vsak dan
 * pokriva DRUG oddelek - ta oznaka se torej prebere iz podatkov in gre v
 * pokriva_oddelek, ne v department_code. Fixture spodaj je zvest posnetek REALNE strukture
 * (dry-run uporabnikove prave datoteke, avgust/september 2026, ne v
 * repozitoriju), vključno z dvema posebnostma, ki ju ima SAMO ta zavihek:
 *   1. ime osebe je v glavi NAD stolpcem IZMENE (drugi od dveh), stolpec
 *      pred njim (oddelek) nima lastne glave;
 *   2. cel blok stolpcev se v isti vrstici enkrat PONOVI, z delno
 *      drugačnimi vrednostmi za isti dan - uporabi se samo prva (leva)
 *      pojavitev vsakega imena.
 *
 * FLEXI kader gre VEDNO v department_code "FLEXI", pokriti oddelek pa v
 * pokriva_oddelek (shema, razdelek 34). Prej je šel v department_code
 * pokriti oddelek, kar je imelo dve slabi posledici:
 *   1. kombinirane oznake ("C/E2" - oseba tisti dan pokriva dva oddelka)
 *      tuji ključ na departments zavrne, zato jih je uvoz PRESKOČIL: na
 *      avgustu 2026 je tako odpadlo 87 vpisov;
 *   2. tisti, ki so se shranili, so pristali pod TUJIM oddelkom, zato je
 *      zavihek FLEXI ostal PRAZEN, čeprav je uvoz javil "FLEXI (87)".
 * Oba primera sta preverjena spodaj (sklopa 1 in 3).
 *
 * Zagon: node skripte/preveri-flexi-uvoz.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "index.html"), "utf8");

function izvleci(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0, zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciVrstico(oznaka) {
  const re = new RegExp("^" + oznaka.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*$", "m");
  const m = html.match(re);
  if (!m) throw new Error("Vrstice " + oznaka + " ni v index.html.");
  return m[0];
}
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  izvleci("monthRange"),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  constVKotVar(izvleciVrstico("const IME_S_PIKO_RX")),
  izvleci("najdiVrsticoImenFlexi"),
  izvleci("obdelajFlexiVrstice"),
].join("\n\n");

const sandbox = { window: { ImportUtils: { normalizirajDatum } }, console };
vm.createContext(sandbox);
// Kratka imena iz predlog gredo skozi skupno parafa.js (window.Parafa.
// kratkoKljuc) - tam so uporabnikom potrjeni popravki zapisov, npr.
// "VALJAVEC A." -> "VALJAVEC E." Peskovnik jo mora imeti naloženo, sicer
// izvlečena koda kliče nedefiniran window.Parafa.
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
vm.runInContext(koda, sandbox);
const { obdelajFlexiVrstice } = sandbox;

// Zvest posnetek REALNE strukture (glava v vrstici 0, vloga v vrstici 1,
// prvi dan v vrstici 2 - "za zrak" vrstice med njimi so v pravem branju
// (blankrows:false) že odstranjene, glej preveri-nzv-dezurstvo-ime.mjs).
// Stolpec 21/22 "DODATNO C/E2 7-19" NI oseba (ne ustreza "Priimek I."
// vzorcu) - v pravi datoteki gre za opombo/povzetek, ne ime.
// Vsak stolpec je poravnan po INDEKSU med vsemi štirimi vrsticami spodaj
// (0=FLEXI/datum, 1=blank/dan, 2=oddelek Zaplotnik, 3=Zaplotnik ime/izmena,
// 4=oddelek Djedović, 5=Djedović ime/izmena, 6=oddelek Misotič (neveljaven,
// "C/E2"), 7=Misotič ime/izmena, 8=oddelek Burnar, 9=Burnar ime/izmena,
// 10-11=stolpec "DODATNO" (ni oseba), 12-17=PONOVLJEN blok - glej opombo).
const GLAVA = ["FLEXI", "", "", "ZAPLOTNIK A.", "", "DJEDOVIĆ M.", "", "MISOTIČ R.", "", "BURNAR S.", "", "DODATNO C/E2 7-19",
  // PONOVLJEN blok (opažen na pravi datoteki) - iste osebe, DELNO drugačne vrednosti za isti dan.
  "FLEXI", "", "", "ZAPLOTNIK A.", "", "DJEDOVIĆ M."];
const VLOGA = ["JUNIJ", "", "", "SMS / TZN", "", "SMS / TZN", "", "DMS / DZN", "", "SMS / TZN", "", "",
  "JUNIJ", "", "", "SMS / TZN", "", "SMS / TZN"];
const DAN1 = ["2026-06-01", "PO", "C", "popoldan", "C", "dopoldan", "C/E2", "dopoldan", "E2", "popoldan", "", "",
  "2026-06-01", "PO", "C", "NOČNA", "", ""]; // ponovljen blok: ZAPLOTNIK A. ima tu DRUGAČNO vrednost - mora se prezreti
const DAN2 = ["2026-06-02", "TO", "", "", "C", "popoldan", "C", "dopoldan", "E2", "dopoldan", "", "",
  "2026-06-02", "TO", "", "", "", ""];
for (const v of [GLAVA, VLOGA, DAN1, DAN2]) {
  if (v.length !== 18) throw new Error("Fixture napaka: pričakovana dolžina 18, dobil " + v.length + " (" + JSON.stringify(v) + ")");
}

const VRSTICE = [GLAVA, VLOGA, DAN1, DAN2];
const poKratkem = {
  "ZAPLOTNIK A.": "zaplotnik-id", // ne obstaja v resnici (izbrisana oseba) - tu namenoma OBSTAJA, da preverimo prezrtje ponovljenega bloka
  "DJEDOVIĆ M.": "djedovic-id",
  "MISOTIČ R.": "misotic-id",
  // "BURNAR S." namenoma NI v poKratkem - preveri "ni najden profil"
};

console.log("1) osnovno branje: oddelek gre v pokriva_oddelek, skupina ostane FLEXI");
{
  const { zapisi, najdenDatum, najdenaGlava } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem);
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo");
  const zaplotnik1 = zapisi.find(z => z.employee_id === "zaplotnik-id" && z.work_date === "2026-06-01");
  trdi(!!zaplotnik1 && zaplotnik1.department_code === "FLEXI" && zaplotnik1.pokriva_oddelek === "C"
    && zaplotnik1.shift_code === "popoldan",
    `ZAPLOTNIK A. / 1.6. -> FLEXI, pokriva "C", izmena "popoldan" (dobil ${JSON.stringify(zaplotnik1)})`);
  const djedovic2 = zapisi.find(z => z.employee_id === "djedovic-id" && z.work_date === "2026-06-02");
  trdi(!!djedovic2 && djedovic2.department_code === "FLEXI" && djedovic2.pokriva_oddelek === "C"
    && djedovic2.shift_code === "popoldan",
    "DJEDOVIĆ M. / 2.6. -> FLEXI, pokriva 'C', izmena 'popoldan'");
  // Bistvo popravka: prav zato, ker gre VSE v FLEXI, zavihek FLEXI ni več prazen.
  trdi(zapisi.every(z => z.department_code === "FLEXI"),
    "prav VSI zapisi iz tega zavihka gredo v skupino FLEXI (sicer bi bil zavihek FLEXI prazen)");
}

console.log("2) ponovljen blok stolpcev v isti vrstici - uporabi SAMO prvo (levo) pojavitev");
{
  const { zapisi } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem);
  const zaplotnikVsi = zapisi.filter(z => z.employee_id === "zaplotnik-id" && z.work_date === "2026-06-01");
  trdi(zaplotnikVsi.length === 1, `ZAPLOTNIK A. / 1.6. -> natanko EN zapis, ne dva (dobil ${zaplotnikVsi.length})`);
  trdi(zaplotnikVsi[0] && zaplotnikVsi[0].shift_code === "popoldan",
    "uporabljena je vrednost iz PRVEGA (levega) bloka ('popoldan'), ne ponovljenega drugega ('NOČNA')");
}

console.log("3) kombinirana oznaka ('C/E2' = dvojna pokritost) se OHRANI, ne preskoči");
{
  // To je bil glavni vzrok praznega zavihka FLEXI: taka oznaka ni koda
  // oddelka, zato jo je tuji ključ zavrnil in uvoz je vrstico izpustil.
  // Zdaj gre v pokriva_oddelek, ki tujega ključa NIMA prav zaradi tega.
  const { zapisi, neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem);
  const misotic1 = zapisi.find(z => z.employee_id === "misotic-id" && z.work_date === "2026-06-01");
  trdi(!!misotic1, "MISOTIČ R. / 1.6. (oddelek 'C/E2') JE v zapisih - ni več preskočen");
  trdi(!!misotic1 && misotic1.pokriva_oddelek === "C/E2",
    "kombinirana oznaka se ohrani nespremenjena v pokriva_oddelek");
  trdi(!!misotic1 && misotic1.department_code === "FLEXI",
    "v department_code gre FLEXI (koda, ki v departments obstaja - tuji ključ je zadovoljen)");
  const jePrijavljeno = [...neujemanja].some(n => n.includes("MISOTIČ R.") && n.includes("C/E2"));
  trdi(!jePrijavljeno, "ni več prijavljeno kot neujemanje (ker ni več napaka)");
}

console.log("4) oseba brez profila konča v poročilu (ne izgine tiho)");
{
  const { neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem);
  trdi(neujemanja.has("BURNAR S."), "'BURNAR S.' (ni v poKratkem) je v neujemanjih");
}

console.log("5) stolpec brez oblike 'Priimek I.' (npr. 'DODATNO C/E2 7-19') se prezre, ne poskuša ujeti kot oseba");
{
  const { neujemanja } = obdelajFlexiVrstice(VRSTICE, "2026-06", poKratkem);
  trdi(![...neujemanja].some(n => n.includes("DODATNO")), "'DODATNO C/E2 7-19' se NE pojavi v neujemanjih");
}

console.log("6) varovalka: če stolpca pokriva_oddelek v bazi še ni, uvoz ne sme odpovedati");
{
  // Baza brez razdelka 34 sheme zavrne CEL upsert z neznanim stolpcem.
  // To ne sme pomeniti, da uvoz razporeda nenadoma sploh ne dela.
  const html2 = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/function jeManjkajocPokrivaOddelek/.test(html2), "manjkajoč stolpec se prepozna");
  trdi(/42703/.test(html2), "po kodi 42703 (undefined_column)");
  trdi(/PGRST204/.test(html2), "in po PostgREST kodi za stolpec izven predpomnilnika sheme");
  trdi(/const brez = kos\.map\(\(\{ pokriva_oddelek, \.\.\.ostalo \}\) => ostalo\);/.test(html2),
    "v tem primeru se zapiše brez tega polja (razpored se vseeno shrani)");
  trdi(/opozoriloPokrivaOddelek \? " " \+ opozoriloPokrivaOddelek/.test(html2),
    "in uporabniku se to POVE v poročilu uvoza, ne tiho");
  trdi(/dodaj-pokriva-oddelek\.sql/.test(html2), "sporočilo pove, katero datoteko pognati");
}

console.log("7) NZV razpored vsebuje samo vodje in administratorje");
{
  // Kode B/C/C1/D/E1/E2 so HKRATI oddelki SMS/TZN kadra IN imena stolpcev
  // v NZV predlogi, zato je NZV mreža brez filtra prikazala oddelčne
  // sestre namesto vodij, ki enoto tisti dan pokrivajo.
  const html2 = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/const JE_NZV_VLOGA = new Set\(window\.NzvZasedba\.VLOGE\);/.test(html2),
    "vloge, ki sodijo v NZV, so opredeljene na enem mestu");
  trdi(/if \(!JE_NZV_VLOGA\.has\(r\.profiles\.role\)\) return;/.test(html2),
    "enote (schedule_entries) so filtrirane po vlogi");
  trdi(/if \(!ujem \|\| !JE_NZV_VLOGA\.has\(ujem\.role\)\) return;/.test(html2),
    "tudi stolpci LD/IZOB/BS (leave_entries) so filtrirani po isti vlogi");
  trdi(/profiles!employee_id\(full_name, role,/.test(html2),
    "poizvedba res prebere vlogo (sicer bi bil filter vedno prazen)");
}

console.log("8) stolpec 'DODATNO C/E2 7-19' se ne uvozi, a se PRIJAVI");
{
  // Preverjeno na pravi datoteki (2026_SMS_RAZPORED_2.xlsx): od 114 takih
  // celic jih ima 95 isto izmeno že zapisano pri osebi sami v tem zavihku,
  // preostalih 19 pa na njenem matičnem oddelčnem zavihku (Jereb S. 13. 6.
  // -> zavihek C "DNEVNA12"; Šabić 25. 7. -> C "DNEVNA12 C/E2"). Vpisati ga
  // posebej bi pomenilo PREPISATI oddelčno izmeno iste osebe, ker
  // schedule_entries dovoli en zapis na oseba/dan.
  const html2 = readFileSync(join(koren, "index.html"), "utf8");
  trdi(/\/\^DODATNO\\b\/i\.test\(ime\)/.test(html2), "stolpec se prepozna po naslovu");
  trdi(/steviloDodatnih\+\+/.test(html2), "šteje se, kolikokrat je bil preskočen");
  trdi(/if \(\(vrstica\[c\] \|\| ""\)\.trim\(\)\) steviloDodatnih\+\+/.test(html2),
    "šteje SAMO izpolnjene celice (sicer bi poročilo štelo prazne dni)");
  trdi(/ni uvožen \(\$\{steviloDodatnih\} celic\)/.test(html2),
    "število konča v poročilu uvoza, ne tiho");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
