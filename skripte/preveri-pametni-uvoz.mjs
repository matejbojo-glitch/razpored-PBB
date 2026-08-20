#!/usr/bin/env node
/* Preizkus "pametnega uvoza" (index.html: razvrstiListe, obdelajOddelekVrstice,
 * obdelajNzvVrstice) - uporabnik je prosil za možnost, da naloži ENO
 * datoteko (lahko z več zavihki, kot pravi delovni zvezek "2026 SMS
 * RAZPORED") namesto ročnega lepljenja Google Sheets povezave za vsak
 * oddelek/mesec posebej, in da aplikacija sama prepozna vsebino vsakega
 * lista.
 *
 * Preverja:
 *  1) razvrstiListe pravilno loči liste, poimenovane po znani kodi oddelka
 *     (PO_ODDELKIH_KODE, ne glede na velikost črk/presledke), od preostalih;
 *  2) obdelajOddelekVrstice (izvlečeno iz uvoziOddelek) na listu, oblikovanem
 *     kot pravi C1 zavihek, najde iste zapise kot prej (refaktoring ni nič
 *     spremenil v vedenju);
 *  3) obdelajNzvVrstice (izvlečeno iz uvoziNzv) na listu, oblikovanem kot
 *     pravi NZV zavihek, najde enote IN LD/IZOB/BS odsotnosti;
 *  4) list, ki ni ne prepoznan oddelek ne NZV oblika (npr. "KALUP" - legenda,
 *     ne razpored), ne vrne nobenega zapisa - v pravi funkciji
 *     uvoziDatotekoPametno to pomeni "preskočen list", ne napaka.
 *
 * Funkcije se izvlečejo iz PRAVEGA index.html, zato preizkus ne more
 * zaostati za kodo.
 *
 * Zagon: node skripte/preveri-pametni-uvoz.mjs
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
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  const konec = html.indexOf(";\n", zac);
  if (konec === -1) throw new Error("Konec konstante " + ime + " ni najden.");
  return html.slice(zac, konec + 1);
}
function constVKotVar(s) { return s.replace(/^const\s+/, "var "); }

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const koda = [
  izvleciVrstico("const ISO_DATUM_RX"),
  izvleciVrstico("const VLOGA_RX"),
  izvleci("priimekZacetnica"),
  izvleci("parafaOd"),
  // Koledarski izračuni živijo v datum.js (skupni modul za vse strani),
  // zato ga naložimo in monthRange samo preimenujemo - enako, kot to
  // naredi index.html.
  readFileSync(join(koren, "datum.js"), "utf8"),
  "var monthRange = window.Datum.obseg;",
  constVKotVar(izvleciConst("PO_ODDELKIH_KODE")),
  izvleci("najdiVrsticoImen"),
  // NZV_ENOTE/NZV_STOLPCI zdaj kažeta na skupni nzv-zasedba.js (prej sta
  // bila zapisana v index.html), zato mora biti modul naložen PRED njima.
  readFileSync(join(koren, "imena.js"), "utf8"),
  readFileSync(join(koren, "nzv-zasedba.js"), "utf8"),
  constVKotVar(izvleciConst("NZV_ENOTE")),
  izvleci("nzvNazivVKodo"),
  izvleci("nzvKljucGlave"),
  izvleci("nzvNazivVKodoNorm"),
  izvleciVrstico("const NZV_GLAVA_NAJVEC_NAZAJ"),
  izvleciVrstico("const NZV_GLAVA_NAJMANJ_ZADETKOV"),
  izvleci("poisciEnoteNzv"),
  constVKotVar(izvleciConst("NZV_ODSOTNOST_KIND")),
  izvleci("vrsticaJePrazna"),
  izvleci("obdelajBlok"),
  izvleci("obdelajOddelekVrstice"),
  // Ujemanje imen živi v imena.js (skupni modul), zato ga tu ne luščimo
  // iz index.html, ampak naložimo in samo preimenujemo v stara imena, ki
  // jih izluščene funkcije kličejo.
  readFileSync(join(koren, "imena.js"), "utf8"),
  "var normalizirajImeNzv = window.Imena.normaliziraj;",
  "var imenaSeUjemataNzv = window.Imena.seUjemata;",
  constVKotVar(izvleciVrstico("const NAZIV_OSEBE_RX")),
  izvleci("ocistiNazivOsebe"),
  izvleci("zdruziNzvZapise"),
  izvleci("obdelajNzvVrstice"),
  izvleci("razvrstiListe"),
  izvleci("zdruziPoKljucu"),
].join("\n\n");

// "window" mora kazati na sam sandbox, ker skupni moduli (imena.js,
// nzv-zasedba.js) nanj obesijo svoje objekte. Vsebina prejšnjega
// nadomestka (ImportUtils) se zato prestavi naravnost v sandbox.
const sandbox = { console };
sandbox.window = sandbox;
sandbox.ImportUtils = { normalizirajDatum: normalizirajDatum };
function normalizirajDatum(s) {
  const t = (s || "").toString().trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{4})$/);
  if (m) { const [, d, mo, y] = m; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return t;
}
vm.createContext(sandbox);
// Kratka imena iz predlog gredo skozi skupno parafa.js (window.Parafa.
// kratkoKljuc) - tam so uporabnikom potrjeni popravki zapisov, npr.
// "VALJAVEC A." -> "VALJAVEC E." Peskovnik jo mora imeti naloženo, sicer
// izvlečena koda kliče nedefiniran window.Parafa.
// parafa.js kratka imena zvede na skupni ključ prek imena.js.
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "parafa.js"), "utf8"), sandbox);
vm.runInContext(koda, sandbox);
const { razvrstiListe, obdelajOddelekVrstice, obdelajNzvVrstice, zdruziPoKljucu } = sandbox;

console.log("1) razvrstiListe loči oddelčne liste (po imenu) od preostalih");
{
  const listi = [
    { naziv: "C1", vrsteVrstic: [["c1 podatki"]] },
    { naziv: " flexi ", vrsteVrstic: [["flexi podatki"]] }, // presledki + male črke - mora se ujemati
    { naziv: "KALUP", vrsteVrstic: [["legenda"]] },
    { naziv: "September 2026", vrsteVrstic: [["nzv podatki"]] },
  ];
  const { oddelki, preostali } = razvrstiListe(listi);
  jseq(oddelki.map(o => o.koda).sort(), ["C1", "FLEXI"], "C1 in FLEXI (ne glede na presledke/velikost črk) prepoznana kot oddelka");
  jseq(preostali.map(l => l.naziv), ["KALUP", "September 2026"], "KALUP in September 2026 gresta v 'preostali' (niso znana koda oddelka)");
}

console.log("2) obdelajOddelekVrstice na C1-oblikovanem listu");
{
  const vrsteVrstic = [
    ["C1 odd", "", "DŽINIĆ A.", "STARC E."],
    ["", "", "SMS / TZN", "SMS / TZN"],
    ["JUNIJ", ""],
    ["1. 6. 2026", "PO", "LD", "NOČNA"],
    ["2. 6. 2026", "TO", "popoldan", "KPU"],
  ];
  const poKratkem = { "DZINIC|A": "dzinic-id", "STARC|E": "starc-id" };
  const { zapisi, najdenDatum, najdenaGlava, neujemanja } = obdelajOddelekVrstice(vrsteVrstic, "C1", "2026-06", poKratkem);
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo");
  jseq(zapisi.length, 4, "4 zapisi (2 osebi x 2 dneva)");
  const prvi = zapisi.find(z => z.employee_id === "dzinic-id" && z.work_date === "2026-06-01");
  jseq(prvi, { employee_id: "dzinic-id", department_code: "C1", work_date: "2026-06-01", shift_code: "LD" }, "DŽINIĆ A. / 1.6. -> pravilen zapis z wardCode='C1'");
  trdi(neujemanja.size === 0, "brez neujemanj");
}

console.log("3) obdelajNzvVrstice na NZV-oblikovanem listu (enote + LD/IZOB/BS)");
{
  const vrsteVrstic = [
    ["Razpored SEPTEMBER 2026"],
    ["", "PDZN", "SOBO", "ŽO", "E1", "E2", "D", "MO", "B", "C", "C1", "PO", "A", "B1,B2", "DB", "SA DOP", "SA POP", "URGENCA", "U2", "DEŽURSTVO", "LD", "IZOB", "BS"],
    ["1. 9. 2026", "KAR", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Matej Bojić", "NOV, PET", "", ""],
  ];
  // DEŽURSTVO vsebuje POLNO IME, ne parafo - potrjeno na pravi uporabnikovi
  // datoteki (glej preveri-nzv-dezurstvo-ime.mjs).
  const poParafi = { KAR: { id: "karnicar-id", full_name: "Karničar Jure" }, NOV: { id: "novak-id", full_name: "Novak Ana" }, PET: { id: "petek-id", full_name: "Petek Iza" } };
  const profili = [{ id: "bojic-id", full_name: "Bojić Matej" }];
  const { zapisi, dopusti, najdenDatum, najdenaGlava, neujemanja } = obdelajNzvVrstice(vrsteVrstic, "2026-09", poParafi, "admin-id", profili);
  trdi(najdenDatum && najdenaGlava, "najde datume in glavo enot");
  const pdzn = zapisi.find(z => z.employee_id === "karnicar-id" && z.department_code === "PDZN");
  trdi(!!pdzn, "PDZN / KAR -> zapis v schedule_entries");
  const dez = zapisi.find(z => z.employee_id === "bojic-id" && z.department_code === "DEZ");
  trdi(!!dez, "DEŽURSTVO / 'Matej Bojić' (polno ime) -> zapis v schedule_entries");
  jseq(dopusti.length, 2, "2 vpisa odsotnosti (NOV in PET v stolpcu LD)");
  trdi(dopusti.every(d => d.kind === "ld" && d.created_by === "admin-id"), "oba LD vpisa imata kind='ld' in pravi created_by");
  trdi(neujemanja.size === 0, "brez neujemanj");
}

console.log("4) list, ki ni ne oddelek ne NZV (npr. 'KALUP' legenda), ne vrne ničesar");
{
  const vrsteVrstic = [
    ["LEGENDA"],
    ["SMS / TZN", "07:00-15:00"],
    ["LD", "letni dopust"],
    ["KPU", "koriščenje prostih ur"],
  ];
  const { zapisi, dopusti, najdenDatum } = obdelajNzvVrstice(vrsteVrstic, "2026-09", {}, "admin-id");
  jseq(zapisi.length, 0, "0 zapisov razporeda");
  jseq(dopusti.length, 0, "0 zapisov odsotnosti");
  trdi(!najdenDatum, "sploh ne najde datumskih vrstic (legenda ni razpored) - v pravi funkciji to pomeni 'preskočen list'");
}

console.log("5) zdruziPoKljucu - osnovno vedenje (zadnja vrednost zmaga)");
{
  const { edinstveni, podvojeni } = zdruziPoKljucu(
    [{ k: "a", v: 1 }, { k: "b", v: 2 }, { k: "a", v: 3 }],
    (r) => r.k
  );
  jseq(edinstveni, [{ k: "a", v: 3 }, { k: "b", v: 2 }], "podvojen ključ 'a' obdrži ZADNJO vrednost (v:3, ne v:1)");
  jseq([...podvojeni], ["a"], "'a' je javljen kot podvojen ključ");
}

console.log("6) resnični scenarij, ki je javil Postgres napako: ista oseba, isti dan, DVA zavihka");
{
  // To je natančno situacija, ki je uporabniku vrnila "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" - oseba "DOLAR T." se pojavi
  // TAKO v zavihku "B" (matični oddelek) KOT v zavihku "FLEXI" (križna
  // pokritost) za isti dan. En sam skupen upsert bi to zavrnil - zato
  // uvoziDatotekoPametno zdaj piše vsak zavihek LOČENO, po predhodnem
  // zdruziPoKljucu znotraj samega zavihka (ta test preveri drugi del -
  // dedup ZNOTRAJ enega zavihka, prvi del preveri arhitektura ločenih
  // klicev, ki je vidna samo v pravi funkciji z I/O, ne v tem fixture-ju).
  const bVrstice = [
    ["B odd", "", "DOLAR T.", "DOLAR T."], // ista oseba POMOTOMA dvakrat v isti glavi (dva stolpca)
    ["", "", "SMS / TZN", "SMS / TZN"],
    ["1. 9. 2026", "TO", "dopoldan", "popoldan"], // različni vrednosti za isto osebo/dan v istem zavihku
  ];
  const poKratkem = { "DOLAR|T": "dolar-id" };
  const { zapisi } = obdelajOddelekVrstice(bVrstice, "B", "2026-09", poKratkem);
  jseq(zapisi.length, 2, "obdelajOddelekVrstice sam po sebi NE združuje - vrne oba (to bi šlo v en sam upsert in padlo)");
  const { edinstveni, podvojeni } = zdruziPoKljucu(zapisi, z => z.employee_id + "|" + z.work_date);
  jseq(edinstveni.length, 1, "zdruziPoKljucu pred zapisom zmanjša na 1 vrstico za (oseba, dan)");
  jseq(edinstveni[0].shift_code, "popoldan", "obdrži ZADNJO najdeno vrednost (popoldan, iz drugega stolpca)");
  trdi(podvojeni.size === 1, "podvojenost je zaznana in bi bila javljena uporabniku kot opomba");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
