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

console.log("3) Zapis v bazo ne javi uspeha, če ni uspel");
{
  const t = readFileSync(join(koren, "imenik.html"), "utf8");
  const blok = t.slice(t.indexOf("const prenesiPodatkeNaProfil"),
    t.indexOf("const prenesiPodatkeNaProfil") + 4500);
  trdi(blok.length > 500, "prenesiPodatkeNaProfil je berljiv");
  // Funkcija piše v tri tabele. Prva je izid vedno preverjala, drugi dve
  // sta napako ZAVRGLI in funkcija je vrnila null (= uspeh) - klicatelj je
  // javil uspeh, čeprav telefon ali kadrovski podatki niso bili shranjeni.
  // Ravno kadrovski podatki poganjajo izračun stanja dopusta.
  trdi(/const \{ error: e1 \}[\s\S]{0,400}if \(e1\) return e1;/.test(blok),
    "zapis v profili vrne napako");
  trdi(/const \{ error: e2 \}[\s\S]{0,300}if \(e2\) return e2;/.test(blok),
    "zapis v telefoni_kontaktov vrne napako");
  // Objekt upserta je dolg (deset polj), zato se preverjata oba dela
  // posebej in njun vrstni red - ne razdalja med njima.
  trdi(/const \{ error: e3 \} = await client\.from\("kadrovski_podatki"\)/.test(blok)
    && /if \(e3\) return e3;/.test(blok)
    && blok.indexOf("error: e3") < blok.indexOf("if (e3) return e3;"),
    "zapis v kadrovski_podatki vrne napako");
}

console.log("4) Znane, utemeljene izjeme pri pisanju");
{
  // Označevanje obvestil kot prebranih: ob neuspehu značka preprosto
  // ostane in se popravi ob naslednjem nalaganju. Ni odločitve, ki bi jo
  // uporabnik sprejel narobe, zato tu preverjanje izida ni potrebno.
  const t = readFileSync(join(koren, "obrazec.html"), "utf8");
  trdi(/from\("obvestila"\)\.update\(\{ read_at/.test(t),
    "obvestila se še vedno označijo kot prebrana (samopopravljiva pot)");
}

console.log("5) Praznih catch blokov ni v kodi aplikacije");
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
