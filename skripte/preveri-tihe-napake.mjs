#!/usr/bin/env node
/* Tiho požrte napake pri branju iz baze.
 *
 * ZAKAJ
 * Supabase napake NE vrže - vrne jo v odgovoru kot { data: null, error }.
 * Zapis ".then(({ data }) => setX(data || []))" torej napako spremeni v
 * PRAZEN SEZNAM, ".catch()" pa se ob tem sploh ne sproži. Uporabnik vidi
 * prazno tabelo in sklepa, da podatkov ni.
 *
 * Ponekod je to sprejemljivo (izbirnik oddelkov ostane prazen in to se
 * takoj vidi). Na ODLOČILNIH mestih ni: prazen seznam "Čaka name" pomeni
 * "nič te ne čaka", čeprav menjava morda čaka na tvojo odobritev in bo
 * obtičala. Prav tako prazen pregled stanja dopusta pomeni "nihče nima
 * vpisanega dopusta".
 *
 * KAJ VAROVALO ZAHTEVA
 * Na spodaj naštetih odločilnih mestih mora branje brati tudi "error" in
 * napako pokazati. Seznam je namenoma kratek in poimenovan - ni namen
 * prepisati vseh 30+ branj v aplikaciji, ampak zadržati tista, kjer prazen
 * izid uporabnika zavede v napačno odločitev.
 *
 * Zagon: node skripte/preveri-tihe-napake.mjs
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

console.log("1) Obrazci, ki čakajo na odobritev");
{
  const t = readFileSync(join(koren, "obrazec.html"), "utf8");
  trdi(/const \[napakaBranja, setNapakaBranja\]/.test(t),
    "seznam »Čaka name« ima svoje stanje napake");
  trdi(/\.then\(\(\{ data, error \}\) => \{\s*\n\s*if \(error\) \{ setNapakaBranja/.test(t),
    "branje obrazcev prebere tudi error (Supabase ga ne vrže)");
  trdi(/Prazen seznam <b>ne<\/b> pomeni, da te nič ne čaka/.test(t),
    "in uporabniku pove, da prazen seznam ni isto kot »nič ne čaka«");
  trdi(!/\.then\(\(\{ data \}\) => setCaka\(/.test(t),
    "starega zapisa, ki je napako spremenil v prazen seznam, ni več");
}

console.log("2) Pregled stanja dopusta");
{
  const t = readFileSync(join(koren, "dashboard.html"), "utf8");
  trdi(/function DopustPregled/.test(t), "komponenta obstaja");
  const blok = t.slice(t.indexOf("function DopustPregled"), t.indexOf("function DopustPregled") + 3000);
  trdi(/const \[napaka, setNapaka\]/.test(blok), "ima svoje stanje napake");
  trdi(/if \(error\) \{ setNapaka/.test(blok), "prebere tudi error iz odgovora");
  trdi(/\.catch\(e => \{ setNapaka/.test(blok), "in izjemo (omrežje) tudi");
  trdi(/Prazna tabela spodaj <b>ne<\/b> pomeni, da podatkov ni/.test(t),
    "prazna tabela je izrecno ločena od napake");
}

console.log("3) Praznih catch blokov ni v kodi aplikacije");
{
  // sw.js je izjema: tam je "ne uspe - ni hudega" pravilna strategija
  // (predpomnjenje, prednalaganje pisav).
  const datoteke = ["index.html", "admin.html", "imenik.html", "zelje.html",
    "obrazec.html", "dashboard.html", "nastavitve.html"];
  for (const f of datoteke) {
    const t = readFileSync(join(koren, f), "utf8");
    const prazni = [...t.matchAll(/catch\s*\([a-z]*\)\s*\{\s*\}/g)].length;
    // zelje.html:1030 je znan in utemeljen: neuspeli zapis v localStorage
    // (zasebni način) ne sme prekiniti uvoza.
    const dovoljeno = f === "zelje.html" ? 1 : 0;
    trdi(prazni <= dovoljeno,
      `${f}: praznih catch blokov ${prazni} (dovoljeno ${dovoljeno})`);
  }
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
