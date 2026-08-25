#!/usr/bin/env node
// ---------------------------------------------------------------------
// Preveri (1), da sta kanonični ES modul src/shared/delovni-cas.js in
// njegova kopija v supabase/functions/_shared/ IDENTIČNA, in (2), da
// korenski delovni-cas.js (ročno usklajena različica za brskalnik, glej
// opombo na vrhu te datoteke) pozna iste izmene z istimi urami.
//
// Zakaj kopija v _shared/ sploh obstaja: "supabase functions deploy"
// naloži samo drevo supabase/functions/, zato robna funkcija "koledar" ne
// more uvoziti datoteke iz korena repozitorija – namestitev bi odpovedala
// z "Module not found". Kopija je torej nujna, razhajanje med njima pa
// nevarno: koledar bi zaposlenim kazal druge ure kot aplikacija.
//
// Zakaj korenski delovni-cas.js ni tudi bajt-za-bajt kopija: mora ostati
// brez `import`/`export`, da ga brskalnik naloži kot navaden, sinhron
// <script> (glej opombo na vrhu delovni-cas.js) – zato je logika tam
// prepisana ročno in se preverja funkcijsko, ne bajtovno.
//
// Uporaba:  node skripte/preveri-delovni-cas.mjs
// Izhodna koda 0 = vse usklajeno, 1 = razhaja se.
// ---------------------------------------------------------------------
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const a = join(koren, "src", "shared", "delovni-cas.js");
const b = join(koren, "supabase", "functions", "_shared", "delovni-cas.js");

let napaka = false;

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
  console.error("Popravi z:  cp src/shared/delovni-cas.js supabase/functions/_shared/");
  process.exit(1);
}

if (vsebinaA.equals(vsebinaB)) {
  console.log("OK – src/shared/delovni-cas.js in kopija v _shared/ sta identična.");
} else {
  console.error("RAZHAJANJE: src/shared/delovni-cas.js in supabase/functions/_shared/delovni-cas.js NISTA enaka.");
  console.error("Koledarska naročnina bi kazala druge ure kot aplikacija.");
  console.error("Popravi z:  cp src/shared/delovni-cas.js supabase/functions/_shared/");
  console.error("Nato znova namesti funkcijo:  supabase functions deploy koledar --no-verify-jwt");
  napaka = true;
}

// Funkcijska primerjava korenskega brskalniškega delovni-cas.js proti
// kanoničnemu modulu: iste šifre morajo dati iste ure.
const modul = await import(join(koren, "src", "shared", "delovni-cas.js"));
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sandbox);
const DC = sandbox.window.DelovniCas;

for (const sifra of Object.keys(modul.IZMENE)) {
  const iz = JSON.stringify(modul.IZMENE[sifra]);
  const ir = JSON.stringify(DC.podatkiIzmene(sifra));
  if (iz !== ir) {
    console.error(`RAZHAJANJE pri "${sifra}": src/shared ${iz}, koren ${ir}`);
    console.error("Popravi korenski delovni-cas.js, da se ujema z src/shared/delovni-cas.js.");
    napaka = true;
  }
}

if (napaka) process.exit(1);
console.log("OK – delovni-cas.js (koren) je usklajen s src/shared/delovni-cas.js.");
