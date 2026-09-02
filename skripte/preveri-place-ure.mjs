#!/usr/bin/env node
/* Preizkus branja UR po šifri izmene - da izmena, zapisana v drugačni
 * obliki ("Nočna 12" namesto "NOČNA12"), ne izpade tiho kot "neznana koda".
 *
 * Kot piše komentar ob public.izmena_cas v schema.sql: ista izmena se v
 * pravi bazi pojavlja v več oblikah ("NOČNA12", "Nočna 12", "nočna12").
 * Zavihek Plače je te ure prej bral s TRAJANJE_UR[r.shift_code] - natančno
 * ujemanje niza - kar bi vsaki drugače zapisani izmeni odvzelo ure.
 *
 * Zavihek Plače je septembra 2026 v celoti odstranjen (uporabnikova
 * zahteva), pravilo pa ostaja: ure se berejo prek podatkiIzmene() iz
 * skupnega delovni-cas.js, ki niz pred primerjavo poenoti. Preizkus zato
 * odslej preverja TA skupni vir, ne več kode enega zaslona - vsak
 * naslednji obračun ur bo z njim pravilen že od začetka.
 *
 * Zagon: node skripte/preveri-place-ure.mjs
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

// Nobena stran ne sme brati ur z natančnim ujemanjem niza - past za
// regresijo, tudi ko obračuna ni.
console.log("1) nikjer se ure ne berejo z natančnim ujemanjem niza (TRAJANJE_UR[...])");
{
  ["admin.html", "index.html", "dashboard.html"].forEach(stran => {
    trdi(!/TRAJANJE_UR\[/.test(readFileSync(join(koren, stran), "utf8")),
      stran + ": TRAJANJE_UR se ne indeksira s šifro izmene");
  });
}

console.log("2) ure in odsotnosti se berejo prek skupnega delovni-cas.js");
{
  // Natanko ovoja, ki ju je uporabljal obračun - zdaj brana neposredno iz
  // skupnega vira, da pravilo ne visi na eni sami strani.
  const ureIzmene = (sifra) => {
    const i = sandbox.window.DelovniCas.podatkiIzmene(sifra);
    return i ? i.ure : null;
  };
  const jeOdsotnostBrezDela = (sifra) => {
    const k = sandbox.window.DelovniCas.kljuc(sifra);
    return sandbox.window.DelovniCas.NI_DELO.some(n => sandbox.window.DelovniCas.kljuc(n) === k);
  };
  {

    console.log("3) izmena v drugi obliki (drugačna velikost črk/presledki) šteje enako kot kanonična");
    [
      ["NOČNA12", "Nočna 12"], ["NOČNA12", "nočna12"],
      ["DNEVNA12", "Dnevna 12"], ["dopoldan", "Dopoldan"],
      ["popoldan", "POPOLDAN"],
    ].forEach(([kanon, varianta]) => {
      const a = ureIzmene(kanon), b = ureIzmene(varianta);
      trdi(a != null && a === b, `"${varianta}" šteje ${b} ur, enako kot "${kanon}" (${a})`);
    });

    console.log("4) odsotnosti (LD/KPU/BS/STI/POR) prepoznane ne glede na velikost črk");
    ["LD", "ld", "Ld", "bs", "STI", "por", "KPU"].forEach((s) => {
      trdi(jeOdsotnostBrezDela(s), `"${s}" prepoznana kot odsotnost brez dela`);
      trdi(ureIzmene(s) == null, `"${s}" ne prispeva ur v obračun`);
    });

    console.log("5) resnično neznana koda ostane neznana (opozorilo, ne tiha izguba)");
    ["XYZ", "nekaj-cudnega"].forEach((s) => {
      trdi(ureIzmene(s) == null, `"${s}" nima ur`);
      trdi(!jeOdsotnostBrezDela(s), `"${s}" ni prepoznana kot odsotnost - ostane v seznamu "neznane"`);
    });
  }
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach((n) => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
