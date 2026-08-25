import { defineConfig } from "vitest/config";

// Vitest teče POLEG obstoječih skripte/preveri-*.mjs, ne namesto njih.
// Delitev dela:
//   - tests/           čista logika (delovni čas, generator, datumi/prazniki),
//                      hitro, brez brskalnika - to poganja "npm test";
//   - skripte/preveri- vse, kar potrebuje pravi izris (Playwright), pravo
//                      bazo (PostgreSQL) ali primerja *.html datoteke med
//                      sabo. Tega Vitest namenoma ne prevzema.
export default defineConfig({
  test: {
    // Moduli aplikacije so pisani za brskalnik, a testirana logika je čista
    // (brez DOM). "node" je zato dovolj in je bistveno hitrejši od jsdom;
    // window, ki ga potrebujeta datum.js/prazniki.js, priskrbi
    // tests/pomozno/nalozi-brskalnik.js prek node:vm.
    environment: "node",
    include: ["tests/**/*.test.{js,ts}"],
    // Brez tega bi Vitest pobral tudi preizkuse v node_modules in dist/.
    exclude: ["node_modules/**", "dist/**", "skripte/node_modules/**"],
    // Datumi v testih so zapisani kot "YYYY-MM-DD" in se ne smejo premakniti
    // zaradi časovnega pasu, v katerem teče CI (ista past kot pri uvozu iz
    // Excela - glej tests/datum.test.js).
    env: { TZ: "Europe/Ljubljana" },
  },
});
