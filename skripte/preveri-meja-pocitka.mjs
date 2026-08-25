#!/usr/bin/env node
/* Preizkus: meja najmanjšega počitka je ENA SAMA številka.
 *
 * Zakaj to sploh potrebuje preizkus: pravilo je zapisano na DVEH straneh,
 * ki druga druge ne vidita –
 *   - v brskalniku PRIVZETA_PRAVILA.minPocitekUr (delovni-cas.js), po
 *     katerem obrazec.html opozori vlagatelja pred oddajo menjave;
 *   - v bazi public.min_pocitek() (supabase/schema.sql), po katerem
 *     pocitek_ustreza() sploh določi, katere sodelavce ti aplikacija
 *     ponudi za menjavo.
 * Do avgusta 2026 sta se razhajali (10,7 h proti 11 h, slednja prevzeta iz
 * zunanjega referenčnega gradiva). Posledica ni bila samo kozmetična:
 * menjava, ki jo je obrazec pokazal kot v redu, je bila v bazi zavrnjena
 * oz. sodelavec sploh ni bil na seznamu – uporabnik pa ni videl razloga.
 *
 * Zagon: node skripte/preveri-meja-pocitka.mjs
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
const mejaJs = DC.PRIVZETA_PRAVILA.minPocitekUr;

console.log("1) baza in brskalnik navajata isto mejo");
{
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");
  // min_pocitek() je edino mesto v shemi, kjer sme stati ta številka.
  const m = shema.match(
    /create or replace function public\.min_pocitek\(\)[\s\S]*?interval '(\d+) hours?(?: (\d+) minutes?)?'/
  );
  trdi(!!m, "public.min_pocitek() je v shemi in vrača interval");
  if (m) {
    const mejaSql = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
    trdi(Math.abs(mejaSql - mejaJs) < 1e-9,
      `meja je ista na obeh straneh (delovni-cas.js ${mejaJs} h, schema.sql ${mejaSql} h)`);
  }

  // Meja se ne sme več pojaviti neposredno v pogoju - sicer bi se ob
  // spremembi min_pocitek() tiho razšla znotraj same sheme.
  trdi(!/interval '11 hours'/.test(shema),
    "v shemi ni več trdo zapisanih 11 ur");
  const pogoj = shema.match(/if nova_od < do_ \+ ([^\n]+) and od < nova_do \+ ([^\n]+) then/);
  trdi(!!pogoj && /min_pocitek\(\)/.test(pogoj[1]) && /min_pocitek\(\)/.test(pogoj[2]),
    "pocitek_ustreza() bere mejo iz min_pocitek(), ne iz svoje številke");
}

console.log("2) obe kopiji delovni-cas.js imata isto mejo");
{
  const beri = (...p) => readFileSync(join(koren, ...p), "utf8");
  const skupna = beri("src", "shared", "delovni-cas.js");
  const kopija = beri("supabase", "functions", "_shared", "delovni-cas.js");
  trdi(skupna === kopija, "src/shared/ in _shared/ kopija sta identična");
  const izlusci = (t) => {
    const m = t.match(/minPocitekUr:\s*([\d.]+)/);
    return m ? Number(m[1]) : null;
  };
  trdi(izlusci(skupna) === mejaJs,
    `src/shared/delovni-cas.js ima isto mejo (${izlusci(skupna)} h)`);
}

console.log("3) meja se na mejnih prehodih obnaša, kot je zapisana");
{
  const prehod = (a, b) => DC.preveriPravila([
    { oseba: "X", datum: "2026-09-07", sifra: a },
    { oseba: "X", datum: "2026-09-08", sifra: b },
  ]).filter(k => k.vrsta === "pocitek").length === 0;

  // 19:00 -> 05:50 = 10 h 50 min, tik NAD mejo 10,7 h. To je vsakodnevni
  // prehod v razporedu; pri meji 11 h ga je baza zavračala.
  trdi(prehod("popoldan do 19", "dopoldan"),
    "popoldan do 19 → dopoldan (10 h 50 min) je dovoljen");
  // 21:00 -> 05:50 = 8 h 50 min, pod mejo - mora ostati kršitev.
  trdi(!prehod("popoldan", "dopoldan"),
    "popoldan → dopoldan (8 h 50 min) ostane kršitev");
  // 06:00 -> 13:50 = 7 h 50 min, pod mejo.
  trdi(!prehod("NOČNA", "popoldan"),
    "NOČNA → popoldan (7 h 50 min) ostane kršitev");
}

console.log("4) besedilo v aplikaciji ne navaja druge številke");
{
  const obrazec = readFileSync(join(koren, "obrazec.html"), "utf8");
  // Slovenski zapis z vejico (10,7), kot ga bere človek.
  const zVejico = String(mejaJs).replace(".", ",");
  trdi(obrazec.includes(zVejico + " h počitka"),
    `obrazec.html omenja ${zVejico} h, ne druge številke`);
  trdi(!/11[.,]?\d*\s*h(?:ur)? počitka/i.test(obrazec),
    "in nikjer ne omenja stare meje 11 h");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
