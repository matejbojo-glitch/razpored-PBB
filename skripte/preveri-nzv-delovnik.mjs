#!/usr/bin/env node
/* Preizkus nzvPrikaz() (index.html) — pravila delovnika NZV
 * (vodje/administratorji) v pogledu "Moj razpored".
 *
 * Uporabnik je pravilo večkrat izrecno ponovil, prikaz pa ga ni upošteval:
 *   - redni delovnik je od PONEDELJKA DO PETKA;
 *   - SOBOTA in NEDELJA sta PROSTI, razen če je tisti dan dežurstvo;
 *   - letni dopust velja samo za delovne dni - vikend sredi dopusta ni
 *     "dopust", ampak navaden prost dan (na posnetku zaslona je 1.8. v
 *     soboto kazalo "LD", 2.8. v nedeljo pa "PRISOTEN");
 *   - dežurstvo MED TEDNOM se opravlja PO redni prisotnosti (15:30-07:00),
 *     zato tak dan pomeni oboje: "dopoldan + DEŽURSTVO". Vikend dežurstvo
 *     traja 07:00-07:00 in redne prisotnosti ob njem ni.
 *
 * Ključno je tudi, česa pravilo NE sme spremeniti: oddelčni kader
 * (B/C/C1/D/E1/E2/FLEXI) vikende dela normalno in ima prave kode izmen.
 *
 * Zagon: node skripte/preveri-nzv-delovnik.mjs
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

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil "${a}", pričakoval "${b}"`));
}

const sandbox = { console, window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
// classify živi v izmene.js (skupni modul za vse zaslone).
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
vm.runInContext("var classify = window.Izmene.skupina;", sandbox);
vm.runInContext(izvleci("nzvPrikaz"), sandbox);
const { nzvPrikaz, classify } = sandbox;
const jeVikendISO = sandbox.window.Prazniki.jeVikend;

const NZV = true, ODDELEK = false;

console.log("1) NZV med tednom: dežurstvo pomeni PRISOTEN + DEŽURSTVO (dežurstvo je po redni prisotnosti)");
{
  eq(nzvPrikaz("DEŽURSTVO", "TO", NZV), "dopoldan + DEŽURSTVO", "torek z dežurstvom");
  eq(nzvPrikaz("DEŽURSTVO", "PO", NZV), "dopoldan + DEŽURSTVO", "ponedeljek z dežurstvom");
  eq(nzvPrikaz("DEŽURSTVO", "PE", NZV), "dopoldan + DEŽURSTVO", "petek z dežurstvom");
}

console.log("2) NZV vikend: dežurstvo je SAMO dežurstvo (07:00-07:00, brez ločene prisotnosti)");
{
  eq(nzvPrikaz("DEŽURSTVO", "SO", NZV), "DEŽURSTVO", "sobota z dežurstvom");
  eq(nzvPrikaz("DEŽURSTVO", "NE", NZV), "DEŽURSTVO", "nedelja z dežurstvom");
}

console.log("3) NZV vikend brez dežurstva je PROST — tudi če je v podatkih PRISOTEN ali LD");
{
  // Natanko primera s posnetka zaslona uporabnika (avgust 2026).
  eq(nzvPrikaz("LD", "SO", NZV), "", "1.8. sobota je kazala 'LD' -> mora biti prosto");
  eq(nzvPrikaz("PRISOTEN", "NE", NZV), "", "2.8. nedelja je kazala 'PRISOTEN' -> mora biti prosto");
  eq(nzvPrikaz("LD", "NE", NZV), "", "nedelja sredi letnega dopusta -> prosto, ne dopust");
  eq(nzvPrikaz("", "SO", NZV), "", "prazen dan v soboto ostane prazen");
}

console.log("4) NZV med tednom ostane nespremenjen");
{
  eq(nzvPrikaz("PRISOTEN", "SR", NZV), "PRISOTEN", "sreda: prisoten");
  eq(nzvPrikaz("LD", "ČE", NZV), "LD", "četrtek: letni dopust velja");
  eq(nzvPrikaz("", "PO", NZV), "", "prazen delovni dan ostane prazen");
}

console.log("5) ODDELČNI kader se pravila NE dotakne — vikende dela normalno");
{
  eq(nzvPrikaz("dopoldan", "SO", ODDELEK), "dopoldan", "sobota dopoldan ostane");
  eq(nzvPrikaz("DNEVNA12", "NE", ODDELEK), "DNEVNA12", "nedeljska 12-urna ostane");
  eq(nzvPrikaz("NOČNA", "SO", ODDELEK), "NOČNA", "sobotna nočna ostane");
  eq(nzvPrikaz("LD", "SO", ODDELEK), "LD", "oddelčni kader: sobotni dopust OSTANE dopust (vikend je zanje delovni)");
}

console.log("6) barva: 'PRISOTEN + DEŽURSTVO' se mora obarvati kot DEŽURSTVO, ne kot prisotnost");
{
  // V izrisu se barva računa iz IZVIRNE kode, prav zaradi tega primera -
  // classify("dopoldan + DEŽURSTVO") bi se ujel na "prisoten" (zeleno).
  eq(classify("DEŽURSTVO"), "dez", "izvirna koda 'DEŽURSTVO' -> razred dez (rdeče)");
  eq(classify("dopoldan + DEŽURSTVO"), "dop", "sestavljeno besedilo bi se obarvalo zeleno - zato se barva NE računa iz njega");
}

console.log("7) isto pravilo velja tudi v mreži 'Po oddelkih -> NZV', ne le v 'Moj razpored'");
{
  // Uporabnikova pripomba: mreža NZV je ob vikendih še vedno kazala vodje
  // na enotah. Tam ni kratice dneva (kot v nzvPrikaz), ampak samo delovni
  // datum, zato se vikend ugotovi iz njega.
  trdi(jeVikendISO("2026-08-01"), "1.8.2026 je sobota");
  trdi(jeVikendISO("2026-08-02"), "2.8.2026 je nedelja");
  trdi(!jeVikendISO("2026-07-31"), "31.7.2026 je petek - ni vikend");
  trdi(!jeVikendISO("2026-08-03"), "3.8.2026 je ponedeljek - ni vikend");
  trdi(!jeVikendISO(""), "prazen datum ne sme veljati za vikend");
  trdi(!jeVikendISO(null), "manjkajoč datum prav tako ne");
  trdi(!jeVikendISO("nekaj"), "neveljaven zapis prav tako ne");

  // Izračun prostega dne živi v prazniki.js (en sam vir za vse zaslone) -
  // podrobnosti pokriva skripte/preveri-prazniki.mjs.
  trdi(/window\.Prazniki\.jeDelaProstDan\(r\.work_date\) && classify\(r\.shift_code\) !== "dez"/.test(html),
    "enote: prost dan brez dežurstva se izpusti");
  trdi(/r\.department_code !== "DEZ"/.test(html),
    "dežurni stolpec (DEZ) ob prostem dnevu OSTANE");
  trdi(/window\.Prazniki\.jeDelaProstDan\(d\.work_date\)/.test(html),
    "stolpci LD/IZOB/BS: prost dan se izpusti (dopust velja za delovne dni)");
}

console.log("8) PRAZNIK šteje enako kot vikend (uporabnikova dopolnitev pravila)");
{
  // 15. 8. 2026 je sobota, zato za pravilo ni dokaz. Vzemimo praznik, ki
  // pade na DELOVNI dan: velikonočni ponedeljek 6. 4. 2026.
  eq(nzvPrikaz("dopoldan", "PO", NZV, "2026-04-06"), "",
    "velikonočni ponedeljek: NZV je prost, čeprav je ponedeljek");
  eq(nzvPrikaz("LD", "PO", NZV, "2026-04-06"), "",
    "in dopust se tisti dan ne vodi");
  eq(nzvPrikaz("DEŽURSTVO", "PO", NZV, "2026-04-06"), "DEŽURSTVO",
    "dežurstvo na praznik OSTANE - in samo dežurstvo, brez prisotnosti");
  eq(nzvPrikaz("dopoldan", "PO", NZV, "2026-04-07"), "dopoldan",
    "naslednji dan (torek) je spet navaden delovnik");
  eq(nzvPrikaz("dopoldan", "PO", ODDELEK, "2026-04-06"),  "dopoldan",
    "oddelčnega kadra se praznik ne dotakne");
  // Brez datuma mora ostati staro vedenje (klic iz starejše kode).
  eq(nzvPrikaz("dopoldan", "PO", NZV), "dopoldan", "brez datuma se praznik ne more upoštevati");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
