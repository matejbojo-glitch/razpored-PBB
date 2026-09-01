#!/usr/bin/env node
/* Preizkus obračuna ur v Plače (PlaceTab, admin.html) - da izmena, zapisana
 * v drugačni obliki ("Nočna 12" namesto "NOČNA12"), ne izpade tiho iz
 * obračuna kot "neznana koda".
 *
 * Kot piše komentar ob public.izmena_cas v schema.sql: ista izmena se v
 * pravi bazi pojavlja v več oblikah ("NOČNA12", "Nočna 12", "nočna12").
 * Obračun ur je prej bral TRAJANJE_UR[r.shift_code] - natančno ujemanje
 * niza - kar bi vsako izmeno, zapisano drugače kot dobesedno "NOČNA12",
 * potisnilo med "neznane kode" in ji odvzelo ure v izplačilu.
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

const admin = readFileSync(join(koren, "admin.html"), "utf8");

console.log("1) admin.html ne bere ur z natančnim ujemanjem niza (TRAJANJE_UR[r.shift_code])");
{
  trdi(!/TRAJANJE_UR\[r\.shift_code\]/.test(admin),
    "TRAJANJE_UR se ne indeksira neposredno s šifro izmene - past za regresijo");
}

console.log("2) ureIzmene/jeOdsotnostBrezDela obstajata in gresta skozi podatkiIzmene (poenoten zapis)");
{
  const mUre = admin.match(/function ureIzmene\(sifra\)\{[^}]*\}/);
  const mOds = admin.match(/function jeOdsotnostBrezDela\(sifra\)\{[\s\S]*?\n\}/);
  trdi(!!mUre, "ureIzmene(sifra) je najdena v admin.html");
  trdi(!!mOds, "jeOdsotnostBrezDela(sifra) je najdena v admin.html");
  if (mUre && mOds) {
    vm.runInContext(mUre[0] + "\n" + mOds[0], sandbox);
    const ureIzmene = sandbox.ureIzmene;
    const jeOdsotnostBrezDela = sandbox.jeOdsotnostBrezDela;

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
