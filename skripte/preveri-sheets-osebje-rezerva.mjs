#!/usr/bin/env node
/* Izmene osebe, ki dela na TUJEM oddelku, se morajo prenesti.
 *
 * FLEXI kader ima svoj stolpec tudi v listu oddelka, na katerem tisti
 * mesec dela (Misotič R. v listu C, Kogoj E. in Gashi G. v E2 ...).
 * Iskanje osebe je bilo omejeno na zaposlene TISTEGA oddelka, zato se te
 * izmene niso prenesle nikoli: v Google listu so bile, v aplikaciji jih ni
 * bilo, v pregledu napak pa so se kopičile kot "neznano ime". Tiho, ker
 * manjkajoča izmena ni videti kot napaka - videti je kot prost dan.
 *
 * Preizkus zahteva troje:
 *  1) iskanje ni več omejeno na oddelek lista, ampak ima REZERVO med
 *     vsemi zaposlenimi;
 *  2) rezerva se uporabi SAMO, kadar v oddelku ni ujemanja, dvoumnost pa se
 *     še vedno zavrne - iz dveh Vozelov se ne ugiba;
 *  3) oseba iz rezerve ostane pod SVOJIM oddelkom (Misotič ostane FLEXI),
 *     delovišče tega dne pa gre v pokriva_oddelek.
 *
 * Zagon: node skripte/preveri-sheets-osebje-rezerva.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { kratkiKljuc } from "../src/shared/sheets-koordinate.js";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const izvorna = readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8");

console.log("\n1) Iskanje osebe ni zaprto v oddelek lista");

trdi(
  /from\("profili"\)\s*\n?\s*\.select\("id, full_name, department_code"\)/.test(izvorna),
  "osebje se bere z oddelkom vred (department_code je v select)",
);
trdi(
  !/\.select\("id, full_name"\)\.eq\("department_code", povezava\.skupina\)/.test(izvorna),
  "stara poizvedba, omejena na oddelek lista, je odstranjena",
);
trdi(
  /const zaposleni = \(vsiZaposleni \|\| \[\]\)\.filter\(/.test(izvorna)
    && /const zaposleniRezerva = \(vsiZaposleni \|\| \[\]\)\.filter\(/.test(izvorna),
  "seznama sta dva: oddelek lista in rezerva",
);
trdi(
  /zaposleniRezerva[\s\S]{0,140}!== povezava\.skupina/.test(izvorna),
  "rezerva so natanko zaposleni DRUGIH oddelkov",
);

console.log("\n2) Rezerva je zadnja izbira, ne prva");

trdi(
  /const izRezerve = najdeni\.length === 0;\s*\n\s*if \(izRezerve\) najdeni = ujemanje\(zaposleniRezerva/.test(izvorna),
  "rezerva se pregleda šele, ko v oddelku ni ujemanja",
);
trdi(
  /if \(najdeni\.length > 1\) \{[\s\S]{0,120}"dvoumno_ime"/.test(izvorna),
  "več ujemanj se še vedno zavrne kot dvoumno_ime",
);
trdi(
  izvorna.indexOf("oseba: najdeni[0]") > izvorna.indexOf('"dvoumno_ime"'),
  "oseba se vzame šele ZA preverjanjem dvoumnosti",
);

console.log("\n3) Oseba iz rezerve ostane pod svojim oddelkom");

trdi(
  /const oddelekZapisa = izRezerve\s*\n?\s*\? \(oseba\.department_code \|\| povezava\.skupina\)/.test(izvorna),
  "zapis dobi oddelek OSEBE, ne oddelka lista",
);
trdi(
  /department_code: oddelekZapisa,/.test(izvorna),
  "oddelekZapisa se res uporabi v zapisu",
);
trdi(
  /const zeljenoDelovisce = jeFlexi[\s\S]{0,220}izRezerve \? String\(povezava\.skupina\)\.toUpperCase\(\)/.test(izvorna),
  "delovi\u0161\u010de osebe iz rezerve je oddelek LISTA",
);
trdi(
  /pokriva_oddelek: zeljenoDelovisce \|\| null,/.test(izvorna),
  "delovišče tega dne gre v pokriva_oddelek",
);
trdi(
  /const istOddelek = stara\s*\n?\s*&& \(stara\.pokriva_oddelek \|\| ""\)\.toUpperCase\(\) === zeljenoDelovisce;/.test(izvorna),
  "primerjava 'brez spremembe' upošteva tudi pokriva_oddelek iz rezerve",
);

console.log("\n4) Širše iskanje ne sme zbližati različnih ljudi");

// Rezerva isce po VSEH zaposlenih, zato mora kljuc lociti soimenjake.
// Vozel Dejan (D) in Vozel Neja (FLEXI) sta v Imeniku oba.
trdi(
  kratkiKljuc("VOZEL N.") !== kratkiKljuc("Vozel Dejan"),
  "»VOZEL N.« se NE ujame z Vozel Dejan",
);
trdi(
  kratkiKljuc("VOZEL N.") === kratkiKljuc("Vozel Neja"),
  "»VOZEL N.« se ujame z Vozel Neja",
);
// Strehice v listu in v Imeniku se pisejo razlicno (Misotić / Misotič).
trdi(
  kratkiKljuc("MISOTIĆ R.") === kratkiKljuc("Misotič Rebeka"),
  "ć v listu in č v Imeniku se ujameta (Misotić R. / Misotič Rebeka)",
);
trdi(
  kratkiKljuc("KVRŽIĆ M.") === kratkiKljuc("Kvržić Marko")
    && kratkiKljuc("SOFRIĆ N.") === kratkiKljuc("Sofrić Nikolina")
    && kratkiKljuc("HUSEINBAŠIĆ A.") === kratkiKljuc("Huseinbašić Ajla"),
  "ostali prizadeti se ujamejo (Kvržić, Sofrić, Huseinbašić)",
);

console.log(napake.length ? `\n✗ ${napake.length} napak\n` : "\n✓ Vse v redu\n");
process.exit(napake.length ? 1 : 0);
