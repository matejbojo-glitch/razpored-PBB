#!/usr/bin/env node
/* Potisna obvestila ne smejo pasti zaradi nastavitve, ki ni koda.
 *
 * web-push zahteva, da je VAPID_SUBJECT URL ali "mailto:...". Skrivnost v
 * Supabase je vsebovala gol e-naslov ("razpored@pb-begunje.si"), zato je
 * setVapidDetails vrgel izjemo na VRHU MODULA - zunaj zahtevka. Delavec je
 * umrl ob zagonu, cron je dobival 500 WORKER_ERROR, obvestila pa niso odsla
 * nikoli. V dnevniku se to vidi, v aplikaciji pa ne.
 *
 * Ta preizkus zahteva dvoje:
 *  1) naslov se pred uporabo popravi (vapidNaslov),
 *  2) setVapidDetails je v try/catch, napaka pa se vrne kot berljiv 500 -
 *     napacna ali manjkajoca skrivnost sme pokvariti en zahtevek, ne
 *     celotnega delavca.
 *
 * Zagon: node skripte/preveri-push-vapid.mjs
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

const POT = "supabase/functions/posiljaj-push/index.ts";
const izvorna = readFileSync(join(koren, POT), "utf8");

console.log("\n1) Naslov VAPID se popravi, preden gre v web-push");

const ujem = izvorna.match(/function vapidNaslov\(vrednost: string\): string \{([\s\S]*?)\n\}/);
trdi(!!ujem, "funkcija vapidNaslov obstaja");
trdi(
  /const VAPID_SUBJECT = vapidNaslov\(/.test(izvorna),
  "VAPID_SUBJECT gre skozi vapidNaslov, ne naravnost iz okolja",
);
trdi(
  !/const VAPID_SUBJECT = Deno\.env\.get\("VAPID_SUBJECT"\) \?\? "/.test(izvorna),
  "surova vrednost iz okolja se ne uporablja več neposredno",
);

// Funkcijo res pozenemo: staticni pregled bi spregledal obrnjen pogoj.
if (ujem) {
  const vapidNaslov = new Function(
    "vrednost",
    ujem[1].replace(/: string/g, "") + "\n",
  );
  const primeri = [
    ["razpored@pb-begunje.si", "mailto:razpored@pb-begunje.si", "gol e-naslov dobi mailto:"],
    ["  razpored@pb-begunje.si  ", "mailto:razpored@pb-begunje.si", "presledki se odrezejo"],
    ["mailto:kdo@primer.si", "mailto:kdo@primer.si", "mailto: se ne podvoji"],
    ["MAILTO:kdo@primer.si", "MAILTO:kdo@primer.si", "mailto: se prepozna ne glede na velikost črk"],
    ["https://razpored.netlify.app", "https://razpored.netlify.app", "URL ostane URL"],
    ["", "mailto:razpored@pb-begunje.si", "prazna skrivnost pade na privzeti naslov"],
  ];
  for (const [vhod, pricakovano, opis] of primeri) {
    trdi(vapidNaslov(vhod) === pricakovano, `${opis} (${JSON.stringify(vhod)})`);
  }
}

console.log("\n2) Napaka VAPID ne sme ubiti delavca");

trdi(
  /try \{\s*\n\s*webpush\.setVapidDetails\(/.test(izvorna),
  "setVapidDetails je v try/catch",
);
trdi(
  /catch \(e\) \{\s*\n\s*vapidNapaka = \(e as Error\)\.message;/.test(izvorna),
  "napaka se shrani v vapidNapaka, ne vrze naprej",
);
trdi(
  /if \(vapidNapaka\) \{[\s\S]{0,200}status: 500/.test(izvorna),
  "zahtevek vrne berljiv 500 z razlogom, ne WORKER_ERROR",
);
trdi(
  izvorna.indexOf("if (vapidNapaka)") > izvorna.indexOf("Deno.serve("),
  "preverjanje je ZNOTRAJ zahtevka, ne na vrhu modula",
);

console.log(
  napake.length
    ? `\n✗ ${napake.length} napak\n`
    : "\n✓ Vse v redu\n",
);
process.exit(napake.length ? 1 : 0);
