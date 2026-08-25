/* Nalagalnik za module, pisane za brskalnik.
 *
 * datum.js in prazniki.js sta navadni <script> datoteki, ki se ob izvedbi
 * pripneta na window (window.Datum, window.Prazniki). Nimata ne `export`
 * ne `module.exports`, zato ju ni mogoče uvoziti z `import`.
 *
 * Namesto dodajanja jsdom (velika odvisnost samo zato, da obstaja spremen-
 * ljivka window) jih izvedemo v node:vm z minimalnim ovojem - isti pristop,
 * kot ga uporabljajo obstoječe skripte skripte/preveri-*.mjs, zato se
 * preizkusa obnašata enako.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Izvede datoteko iz korena repozitorija in vrne, kar je pripela na window.
 *
 * @param {string} datoteka  npr. "datum.js"
 * @param {string} ime       lastnost na window, npr. "Datum"
 * @param {object} [dodatno] dodatne globalne spremenljivke za peskovnik
 */
export function nalozi(datoteka, ime, dodatno = {}) {
  const sandbox = {
    console, Date, isNaN, Number, String, RegExp, Math, JSON, Object, Array,
    ...dodatno,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(koren, datoteka), "utf8"), sandbox, {
    filename: datoteka,
  });
  const izvoz = sandbox.window[ime];
  if (!izvoz) {
    throw new Error(`${datoteka} ni pripel window.${ime}`);
  }
  return izvoz;
}
