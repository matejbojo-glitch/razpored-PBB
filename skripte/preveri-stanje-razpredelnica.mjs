#!/usr/bin/env node
/* Preizkus stanjeIzKode()/KIND_STANJE (imenik.html) — razvrščanja v pet
 * stanj, ki jih zahteva razpredelnica v Imeniku:
 *   1. na delu, 2. dežurstvo, 3. dopust, 4. bolniška, 5. prosto.
 *
 * Ključno je, da se koda izmene (schedule_entries.shift_code) razvrsti
 * PRAVILNO: to je prosto besedilo brez omejitve v bazi, zapisano tako, kot
 * ga uporabljajo uradne predloge ("dopoldan", "NOČNA od 19h", "DNEVNA12",
 * "KPU" …). Napačna razvrstitev bi v pregledu pokazala, da je nekdo prost,
 * čeprav dela - ali obratno.
 *
 * Posebej pomembno: KPU (koriščenje prostih ur) je PROSTO, ne delo, in
 * dežurstvo mora ostati svoje stanje, ne "delo".
 *
 * Zagon: node skripte/preveri-stanje-razpredelnica.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "imenik.html"), "utf8");

function izvleci(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v imenik.html.");
  let globina = 0, zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v imenik.html.");
  const konec = html.indexOf(";\n", zac);
  return html.slice(zac, konec + 1).replace(/^const\s+/, "var ");
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
vm.runInContext([izvleci("stanjeIzKode"), izvleciConst("KIND_STANJE"), izvleciConst("STANJE_BARVA")].join("\n\n"), sandbox);
const { stanjeIzKode, KIND_STANJE, STANJE_BARVA } = sandbox;

console.log("1) vseh pet stanj je opredeljenih in ima svojo barvo");
{
  const pricakovana = ["delo", "dezurstvo", "dopust", "bolniska", "prosto"];
  pricakovana.forEach(k => trdi(!!STANJE_BARVA[k] && !!STANJE_BARVA[k].barva && !!STANJE_BARVA[k].naziv,
    `stanje "${k}" ima naziv in barvo`));
  eq(Object.keys(STANJE_BARVA).length, 5, "natanko pet stanj, brez odvečnih");
}

console.log("2) prave kode izmen iz uradnih predlog -> 'na delu'");
{
  ["dopoldan", "popoldan", "popoldan do 19h", "NOČNA", "NOČNA od 19h", "NOČNA12", "DNEVNA12", "DNEVNA12F", "PRISOTEN"]
    .forEach(k => eq(stanjeIzKode(k), "delo", `"${k}" -> na delu`));
}

console.log("3) dežurstvo ostane SVOJE stanje (ne 'delo')");
{
  eq(stanjeIzKode("DEŽURSTVO"), "dezurstvo", '"DEŽURSTVO" -> dežurstvo');
  eq(stanjeIzKode("dezurstvo"), "dezurstvo", "brez šumnikov (kot pride iz nekaterih izvozov)");
  // Prikaz "PRISOTEN + DEŽURSTVO" nastane šele v index.html; v razpredelnici
  // se bere surova koda iz baze, ki je "DEŽURSTVO".
}

console.log("4) odsotnosti");
{
  eq(stanjeIzKode("LD"), "dopust", '"LD" -> dopust');
  eq(stanjeIzKode("BS"), "bolniska", '"BS" -> bolniška');
  eq(KIND_STANJE.ld, "dopust", "leave_entries kind 'ld' -> dopust");
  eq(KIND_STANJE.bs, "bolniska", "leave_entries kind 'bs' -> bolniška");
  eq(KIND_STANJE.sti, "dopust", "študijski dopust šteje kot dopust");
  trdi(KIND_STANJE.omejitev === null, "'omejitev' (rumena želja) NI odsotnost - oseba je na delu, le z omejitvijo");
}

console.log("5) KPU in prazno -> prosto (ne 'na delu')");
{
  eq(stanjeIzKode("KPU"), "prosto", '"KPU" (koriščenje prostih ur) -> prosto, ne delo');
  eq(stanjeIzKode(""), "prosto", "prazna koda -> prosto");
  eq(stanjeIzKode(null), "prosto", "manjkajoč zapis -> prosto (ni v razporedu)");
  eq(stanjeIzKode(undefined), "prosto", "undefined -> prosto");
}

console.log("6) presledki in velikost črk ne motijo");
{
  eq(stanjeIzKode("  NOČNA 12  "), "delo", "presledki okoli in znotraj kode");
  eq(stanjeIzKode("Dežurstvo"), "dezurstvo", "mešana velikost črk");
  eq(stanjeIzKode("ld"), "dopust", "male črke");
}

console.log("7) neznana koda šteje kot DELO (varneje kot 'prosto')");
{
  // Če se v predlogi pojavi nova, še nepoznana koda izmene, je bolje
  // pokazati "na delu" kot lažno "prosto" - lažno prost dan bi lahko
  // pomenil, da koordinator nekoga po nesreči razporedi še enkrat.
  eq(stanjeIzKode("POMOČ DRUGJE"), "delo", '"POMOČ DRUGJE" -> na delu');
  eq(stanjeIzKode("nekaj novega"), "delo", "neznana koda -> na delu, ne prosto");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
