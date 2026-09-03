#!/usr/bin/env node
/* Kaj administrator VIDI, ko klic robne funkcije (Edge Function) ne uspe.
 *
 * Zakaj obstaja: funkcija "admin-uporabnik" ni bila nameščena v Supabase,
 * zato je "Dodaj uporabnika" v Imeniku javil samo
 *   "Failed to send a request to the Edge Function"
 * (uporabnikov posnetek zaslona, september 2026). Iz tega ni bilo mogoče
 * ugotoviti, da gre za MANJKAJOČO NAMESTITEV in ne za okvaro aplikacije -
 * napaka je bila videti kot hrošč in obtičala brez rešitve.
 *
 * Ta primer se od pravih napak loči po tem, da odgovora sploh NI (mrežna
 * napaka, ne HTTP status). Tu se preverja, da ga aplikacija prevede v
 * napotek, kaj storiti, in da pri PRAVI napaki s strežnika še naprej
 * prikaže sporočilo strežnika (in ne napačnega napotka o namestitvi).
 *
 * Zagon: node skripte/preveri-robna-funkcija-napaka.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const imenik = readFileSync(join(koren, "imenik.html"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function vsebuje(besedilo, kos, opis) {
  trdi(String(besedilo).includes(kos), opis + (String(besedilo).includes(kos) ? "" : ` – dobil: ${JSON.stringify(besedilo)}`));
}

// Funkcijo vzamemo IZ imenik.html, ne iz kopije - sicer bi preizkus
// varoval svoje besedilo in ne tistega, ki ga vidi administrator.
const zac = imenik.indexOf("async function napakaRobneFunkcije(");
if (zac === -1) { console.error("napakaRobneFunkcije ni v imenik.html"); process.exit(1); }
let g = 0, kon = -1;
for (let i = imenik.indexOf("{", zac); i < imenik.length; i++) {
  if (imenik[i] === "{") g++;
  else if (imenik[i] === "}") { g--; if (!g) { kon = i + 1; break; } }
}
const sb = { console };
vm.createContext(sb);
vm.runInContext(imenik.slice(zac, kon) + "\nglobalThis.f = napakaRobneFunkcije;", sb);
const f = sb.f;

console.log("1) funkcija NI nameščena: napaka pove, kaj storiti");
{
  // Točno to sporočilo vrne supabase-js, kadar klica sploh ni mogel oddati.
  const e = await f(new Error("Failed to send a request to the Edge Function"), "admin-uporabnik");
  vsebuje(e.message, "admin-uporabnik", "v napaki je ime funkcije");
  vsebuje(e.message, "supabase functions deploy admin-uporabnik", "in točen ukaz za namestitev");
  vsebuje(e.message, "UPORABNIKI-SETUP.md", "in kam po navodila");
  vsebuje(e.message, "Podatki niso spremenjeni", "ter da se ni nič pokvarilo");
  trdi(!/Failed to send a request/i.test(e.message),
    "angleškega izvirnika ne pusti skozi (administrator ni razvijalec)");
}

console.log("2) druge mrežne napake istega razreda ravno tako");
{
  for (const besedilo of ["Failed to fetch", "NetworkError when attempting to fetch resource", "Load failed"]) {
    const e = await f(new Error(besedilo), "admin-uporabnik");
    vsebuje(e.message, "supabase functions deploy", `"${besedilo}" da isti napotek`);
  }
}

console.log("3) PRAVA napaka s strežnika obvelja (napotek o namestitvi bi bil zavajajoč)");
{
  // FunctionsHttpError: odgovor JE prišel, telo nosi pravo sporočilo.
  const e = await f({
    message: "Edge Function returned a non-2xx status code",
    context: { json: async () => ({ napaka: "Ta e-poštni naslov je že v uporabi." }) },
  }, "admin-uporabnik");
  trdi(e.message === "Ta e-poštni naslov je že v uporabi.", "prikaže se sporočilo strežnika: " + e.message);
  trdi(!/deploy/.test(e.message), "in NE napotek o namestitvi");
}

console.log("4) neznana napaka se ne izgubi");
{
  const e = await f(new Error("Nekaj čisto drugega"), "admin-uporabnik");
  trdi(e.message === "Nekaj čisto drugega", "besedilo ostane nespremenjeno: " + e.message);
}

console.log("5) funkcija, ki jo aplikacija kliče, JE v repozitoriju in v navodilih");
{
  // Če je koda funkcije v repozitoriju, se jo da namestiti; brez tega je
  // napotek iz 1. točke prazna obljuba.
  const klicane = [...imenik.matchAll(/functions\.invoke\("([^"]+)"/g)].map(m => m[1]);
  const enolicne = [...new Set(klicane)];
  trdi(enolicne.length > 0, "imenik.html kliče vsaj eno robno funkcijo: " + enolicne.join(", "));
  enolicne.forEach(ime => {
    trdi(existsSync(join(koren, "supabase", "functions", ime, "index.ts")),
      `supabase/functions/${ime}/index.ts obstaja`);
    const navodila = readFileSync(join(koren, "UPORABNIKI-SETUP.md"), "utf8");
    trdi(navodila.includes("supabase functions deploy " + ime),
      `UPORABNIKI-SETUP.md vsebuje ukaz za namestitev "${ime}"`);
  });
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
