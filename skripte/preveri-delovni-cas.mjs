#!/usr/bin/env node
// ---------------------------------------------------------------------
// Preveri, da sta korenski delovni-cas.js in njegova kopija v
// supabase/functions/_shared/ IDENTIČNA.
//
// Zakaj kopija sploh obstaja: "supabase functions deploy" naloži samo
// drevo supabase/functions/, zato robna funkcija "koledar" ne more
// uvoziti datoteke iz korena repozitorija – namestitev bi odpovedala z
// "Module not found". Kopija je torej nujna, razhajanje med njima pa
// nevarno: koledar bi zaposlenim kazal druge ure kot aplikacija.
//
// Uporaba:  node skripte/preveri-delovni-cas.mjs
// Izhodna koda 0 = enaka, 1 = razhajata se.
// ---------------------------------------------------------------------
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const a = join(koren, "delovni-cas.js");
const b = join(koren, "supabase", "functions", "_shared", "delovni-cas.js");

let vsebinaA, vsebinaB;
try {
  vsebinaA = readFileSync(a);
} catch (e) {
  console.error("NAPAKA: ni mogoče prebrati " + a);
  process.exit(1);
}
try {
  vsebinaB = readFileSync(b);
} catch (e) {
  console.error("NAPAKA: manjka kopija " + b);
  console.error("Popravi z:  cp delovni-cas.js supabase/functions/_shared/");
  process.exit(1);
}

if (vsebinaA.equals(vsebinaB)) {
  console.log("OK – delovni-cas.js in kopija v _shared/ sta identična.");
  process.exit(0);
}

console.error("RAZHAJANJE: delovni-cas.js in supabase/functions/_shared/delovni-cas.js NISTA enaka.");
console.error("Koledarska naročnina bi kazala druge ure kot aplikacija.");
console.error("Popravi z:  cp delovni-cas.js supabase/functions/_shared/");
console.error("Nato znova namesti funkcijo:  supabase functions deploy koledar --no-verify-jwt");
process.exit(1);
