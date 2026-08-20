#!/usr/bin/env node
/* Preizkus: seznam stolpcev NZV je en sam in se ni spremenil ob preselitvi
 * v skupni modul.
 *
 * Zakaj obstaja: seznam enot je bil zapisan samo v index.html. Generator
 * (admin.html) je zato delal po svojih stolpcih in po svojih pravilih -
 * ena od stvari, zaradi katerih sta se PRIKAZ in KREIRANJE razporeda
 * razšla. Ob preselitvi v nzv-zasedba.js je treba dokazati, da se vrstni
 * red in vsebina nista spremenila niti za znak: ta vrstni red je vrstni
 * red stolpcev v uradni predlogi, ki jo bolnišnica podpisuje.
 *
 * Zato spodaj stoji DOBESEDEN prepis prejšnje različice iz index.html in
 * se primerja s tem, kar zdaj vrne skupni modul.
 *
 * Zagon: node skripte/preveri-nzv-stolpci.mjs
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
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- DOBESEDEN prepis prejšnje različice iz index.html (pred preselitvijo) ---
const STARE_ENOTE = [
  ["PDZN", "PDZN"], ["SOBO", "SOBO"], ["ZO", "ŽO"], ["E1", "E1"], ["E2", "E2"], ["D", "D"], ["MO", "MO"],
  ["B", "B"], ["C", "C"], ["C1", "C1"], ["PO", "PO"], ["A", "A"], ["B1B2", "B1,B2"], ["DB", "DB"],
  ["URGENCA", "URGENCA"], ["U2", "U2"],
];
const STARI_STOLPCI = (() => {
  const brezUrgence = STARE_ENOTE.filter(([k]) => k !== "URGENCA" && k !== "U2");
  const urgencaU2 = STARE_ENOTE.filter(([k]) => k === "URGENCA" || k === "U2");
  return [...brezUrgence, ["SADOP", "SA DOP"], ["SAPOP", "SA POP"], ...urgencaU2];
})();
const STARA_KIND_KODA = { ld: "LD", sti: "IZOB", bs: "BS" };

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
const NZ = sandbox.window.NzvZasedba;

console.log("1) skupni modul vrne NATANKO prejšnji seznam");
{
  eq(NZ.ENOTE, STARE_ENOTE, "enote so iste in v istem vrstnem redu");
  eq(NZ.STOLPCI, STARI_STOLPCI, "stolpci so isti in v istem vrstnem redu");
  eq(NZ.KIND_KODA, STARA_KIND_KODA, "preslikava odsotnosti je ista");
  eq(NZ.KODE_STOLPCEV, STARI_STOLPCI.map(([k]) => k), "kode stolpcev se ujemajo");
}

console.log("2) vrstni red iz uradne predloge: SA DOP/SA POP sta MED DB in URGENCA");
{
  const k = NZ.KODE_STOLPCEV;
  trdi(k.indexOf("DB") < k.indexOf("SADOP"), "DB je pred SA DOP");
  trdi(k.indexOf("SADOP") < k.indexOf("SAPOP"), "SA DOP je pred SA POP");
  trdi(k.indexOf("SAPOP") < k.indexOf("URGENCA"), "SA POP je pred URGENCA");
  trdi(k.indexOf("URGENCA") < k.indexOf("U2"), "URGENCA je pred U2");
}

console.log("3) seznam ni več zapisan nikjer drugje");
{
  // Če bi kdo kopijo vrnil v stran, bi se kopiji spet lahko razšli.
  ["index.html", "admin.html"].forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    trdi(!/\["PDZN", "PDZN"\], \["SOBO", "SOBO"\]/.test(src),
      `${f} nima svoje kopije seznama enot`);
    trdi(!/\["SADOP", "SA DOP"\], \["SAPOP", "SA POP"\]/.test(src),
      `${f} nima svoje kopije vrstnega reda stolpcev`);
  });
}

console.log("4) obe strani ga tudi res naložita");
{
  ["index.html", "admin.html"].forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    trdi(/<script src="nzv-zasedba\.js"><\/script>/.test(src), `${f} nalaga nzv-zasedba.js`);
  });
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
