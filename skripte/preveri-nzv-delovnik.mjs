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
 *     zato tak dan pomeni oboje: "PRISOTEN + DEŽURSTVO". Vikend dežurstvo
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

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([izvleci("classify"), izvleci("nzvPrikaz"), izvleci("jeVikendISO")].join("\n\n"), sandbox);
const { nzvPrikaz, classify, jeVikendISO } = sandbox;

const NZV = true, ODDELEK = false;

console.log("1) NZV med tednom: dežurstvo pomeni PRISOTEN + DEŽURSTVO (dežurstvo je po redni prisotnosti)");
{
  eq(nzvPrikaz("DEŽURSTVO", "TO", NZV), "PRISOTEN + DEŽURSTVO", "torek z dežurstvom");
  eq(nzvPrikaz("DEŽURSTVO", "PO", NZV), "PRISOTEN + DEŽURSTVO", "ponedeljek z dežurstvom");
  eq(nzvPrikaz("DEŽURSTVO", "PE", NZV), "PRISOTEN + DEŽURSTVO", "petek z dežurstvom");
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
  // classify("PRISOTEN + DEŽURSTVO") bi se ujel na "prisoten" (zeleno).
  eq(classify("DEŽURSTVO"), "dez", "izvirna koda 'DEŽURSTVO' -> razred dez (rdeče)");
  eq(classify("PRISOTEN + DEŽURSTVO"), "dop", "sestavljeno besedilo bi se obarvalo zeleno - zato se barva NE računa iz njega");
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

  // Datum se mora razčleniti kot BESEDILO: z "new Date(iso)" bi ga
  // brskalnik v časovnem pasu za UTC premaknil na prejšnji dan.
  trdi(/new Date\(Number\(m\[1\]\), Number\(m\[2\]\) - 1, Number\(m\[3\]\), 12\)/.test(html),
    "datum se sestavi po delih ob 12:00, ne prek new Date(iso)");

  // In da je pravilo res vgrajeno v nalaganje NZV podatkov:
  trdi(/if \(jeVikendISO\(r\.work_date\) && classify\(r\.shift_code\) !== "dez"/.test(html),
    "enote: vikend brez dežurstva se izpusti");
  trdi(/r\.department_code !== "DEZ"/.test(html),
    "dežurni stolpec (DEZ) ob vikendu OSTANE");
  trdi(/if \(jeVikendISO\(d\.work_date\)\) return;/.test(html),
    "stolpci LD/IZOB/BS: vikend se izpusti (dopust velja za delovne dni)");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
