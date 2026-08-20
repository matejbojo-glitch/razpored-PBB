#!/usr/bin/env node
/* Preizkus: po dežurstvu sledi normalen delovnik in to NI kršitev.
 *
 * Odločitev vodstva ZN (avgust 2026): tako se zagotavlja neprekinjeno
 * zdravstveno varstvo, zato je to PRIČAKOVANO stanje.
 *
 * Zakaj je preizkus potreben: dežurstvo se konča ob 07:00, dopoldanska
 * izmena se ob 07:00 začne - to je 0 h vmesnega počitka. Brez izjeme bi
 * torej VSAKO dežurstvo med tednom javilo kršitev. Opozorilo bi bilo
 * stalno in bi prav zato izgubilo pomen: med množico pričakovanih se
 * prave kršitve ne bi več videlo.
 *
 * Enako pomembno je, da izjema NE velja preširoko - zato spodaj
 * preverjamo tudi, da se vsi ostali prehodi (tudi prehod V dežurstvo)
 * še naprej preverjajo.
 *
 * Zagon: node skripte/preveri-pocitek-dezurstvo.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sandbox);
const DC = sandbox.window.DelovniCas;

const pocitki = (vnosi) =>
  DC.preveriPravila(vnosi).filter(k => k.vrsta === "pocitek");

console.log("1) dežurstvo -> naslednji dan dopoldan: NI kršitve");
{
  // Torek dežurstvo (15:30-07:00), sreda dopoldan (05:50-14:00).
  const k = pocitki([
    { oseba: "Bojić Matej", datum: "2026-09-01", sifra: "DEŽURSTVO" },
    { oseba: "Bojić Matej", datum: "2026-09-02", sifra: "dopoldan" },
  ]);
  trdi(k.length === 0, "po dežurstvu ni javljene kršitve počitka"
    + (k.length ? " – dobil: " + k.map(x => x.sporocilo).join(" | ") : ""));
}

console.log("2) isto velja za PRISOTEN (vodje 07:00-15:00)");
{
  const k = pocitki([
    { oseba: "Trpin Saša", datum: "2026-09-01", sifra: "DEŽURSTVO" },
    { oseba: "Trpin Saša", datum: "2026-09-02", sifra: "PRISOTEN" },
  ]);
  trdi(k.length === 0, "po dežurstvu tudi pred PRISOTEN ni kršitve");
}

console.log("3) izjema NE velja preširoko");
{
  // a) Prehod V dežurstvo se preverja naprej: nočna (do 06:00) in nato
  //    dežurstvo istega dne ob 15:30 je 9,5 h - premalo.
  const vDezurstvo = pocitki([
    { oseba: "X", datum: "2026-09-01", sifra: "NOČNA" },
    { oseba: "X", datum: "2026-09-02", sifra: "DEŽURSTVO" },
  ]);
  trdi(vDezurstvo.length === 1, "prehod V dežurstvo se še vedno preverja"
    + (vDezurstvo.length !== 1 ? " – dobil " + vDezurstvo.length : ""));

  // b) Navadna kršitev brez dežurstva mora ostati kršitev.
  const brezDez = pocitki([
    { oseba: "Y", datum: "2026-09-01", sifra: "popoldan" },
    { oseba: "Y", datum: "2026-09-02", sifra: "dopoldan" },
  ]);
  trdi(brezDez.length === 1, "popoldan -> dopoldan ostane kršitev"
    + (brezDez.length !== 1 ? " – dobil " + brezDez.length : ""));
  trdi(brezDez.length === 1 && brezDez[0].resnost === "kriticno",
    "in to kritična");
}

console.log("4) druga pravila ostanejo nedotaknjena");
{
  // Zaporedne nočne se še vedno štejejo - izjema velja SAMO za počitek.
  const vse = DC.preveriPravila([
    { oseba: "Z", datum: "2026-09-01", sifra: "NOČNA" },
    { oseba: "Z", datum: "2026-09-02", sifra: "NOČNA" },
    { oseba: "Z", datum: "2026-09-03", sifra: "NOČNA" },
  ]);
  trdi(vse.some(k => k.vrsta === "nocne"), "tri zaporedne nočne se še vedno javijo");
}

console.log("5) pravilo je zapisano na enem mestu in kopiji sta enaki");
{
  const a = readFileSync(join(koren, "delovni-cas.js"), "utf8");
  const b = readFileSync(join(koren, "supabase", "functions", "_shared", "delovni-cas.js"), "utf8");
  trdi(a === b, "delovni-cas.js in kopija v _shared/ sta identična");
  trdi(/if \(jeDezurstvo\(delovni\[i - 1\]\.sifra\)\) continue;/.test(a),
    "izjema je v preverjanju počitka, ne drugje");
  trdi(typeof DC.jeDezurstvo === "function" && DC.jeDezurstvo("DEŽURSTVO") === true
    && DC.jeDezurstvo("dopoldan") === false,
    "jeDezurstvo prepozna samo dežurstvo");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
