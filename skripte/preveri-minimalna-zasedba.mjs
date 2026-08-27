#!/usr/bin/env node
/* Minimalna zasedba po oddelku in izmeni.
 *
 * Vrednosti so iz uradnega dokumenta "MINIMUM po oddelkih" (uporabnik,
 * avgust 2026) - do zdaj je bil v bazi OSNUTEK iz analize, ki je bil
 * ponekod napačen.
 *
 * Kar se tu varuje:
 *  - med tednom se dela v treh izmenah, ob sobotah, nedeljah in praznikih
 *    pa v dveh dvanajsturnih. Z enim samim naborom treh košev je vsaka
 *    sobota javila "manjka popoldanska izmena", ki je tisti dan sploh ni -
 *    torej rdeče opozorilo za nekaj, kar ni narobe;
 *  - praznik med tednom šteje kot vikend;
 *  - primerja se z min_sms, ne z vsoto: kalup razporeja samo izmenski
 *    kader oddelka, vodja (DMS) ima razpored v NZV, dodatna oseba pa
 *    prihaja iz FLEXI - nobeden ni del tega predloga.
 *
 * Zagon: node skripte/preveri-minimalna-zasedba.mjs
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
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- 1) vrednosti v shemi se ujemajo z dokumentom -----------------------
console.log("1) seed v schema.sql se ujema z dokumentom »MINIMUM po oddelkih«");
{
  const sql = readFileSync(join(koren, "supabase/schema.sql"), "utf8");
  const blok = sql.slice(sql.indexOf("insert into public.minimalna_zasedba"));
  const vrstice = [...blok.matchAll(/\('([A-Z0-9]+)',\s*'([A-Z_]+)',\s*(null|\d+),\s*(null|\d+),\s*(null|\d+)/g)]
    .map(m => ({ odd: m[1], kos: m[2], dms: m[3], sms: m[4], flexi: m[5] }));
  const najdi = (odd, kos) => vrstice.find(v => v.odd === odd && v.kos === kos);

  // Dobesedno iz dokumenta: [dopoldne, popoldne, nočna, dnevna-vikend, nočna-vikend]
  const DOKUMENT = {
    B:  [1, 1, 1, 1, 1],
    C:  [1, 1, 1, 1, 1],
    C1: [2, 2, 2, 2, 2],
    D:  [2, 2, 2, 2, 2],
    E1: [1, 1, 1, 1, 1],
    E2: [1, 1, 1, 1, 1],
  };
  const KOSI = ["DOPOLDNE", "POPOLDNE", "PONOCI", "DNEVNA_VIKEND", "PONOCI_VIKEND"];
  Object.keys(DOKUMENT).forEach(odd => {
    const dobljeni = KOSI.map(k => { const v = najdi(odd, k); return v ? Number(v.sms) : null; });
    eq(dobljeni, DOKUMENT[odd], `${odd}: SMS po izmenah`);
  });
  // "+1" iz dokumenta velja samo na C in E2 in samo v dnevnih izmenah -
  // ponoči ga ni. To je ENA oseba iz FLEXI, ki pokriva oba oddelka.
  ["C", "E2"].forEach(odd => {
    ["DOPOLDNE", "POPOLDNE", "DNEVNA_VIKEND"].forEach(k => {
      trdi(Number((najdi(odd, k) || {}).flexi) === 1, `${odd} ${k}: +1 iz FLEXI`);
    });
    trdi((najdi(odd, "PONOCI") || {}).flexi === "null", `${odd} ponoči: brez dodatne osebe`);
  });
  ["B", "C1", "D", "E1"].forEach(odd => {
    trdi(KOSI.every(k => (najdi(odd, k) || {}).flexi === "null"), `${odd}: nikjer dodatne osebe iz FLEXI`);
  });
  // Vodja: 1 na oddelek, PON-PET, torej samo v dopoldanskem košu.
  ["B", "C", "C1", "D", "E1", "E2"].forEach(odd => {
    trdi(Number((najdi(odd, "DOPOLDNE") || {}).dms) === 1, `${odd}: 1 vodja dopoldne med tednom`);
    trdi((najdi(odd, "DNEVNA_VIKEND") || {}).dms === "null", `${odd}: ob vikendu vodje ni`);
  });
}

// --- 2) razvrščanje v koše ---------------------------------------------
console.log("2) izmena se razvrsti v pravi koš glede na dan");
{
  const html = readFileSync(join(koren, "admin.html"), "utf8");
  const zac = html.indexOf("function jeVikendAliPraznik");
  const kon = html.indexOf("function minZaKos");
  trdi(zac > 0 && kon > zac, "logika razvrščanja je najdena v admin.html");
  global.window = { Prazniki: { jePraznik: (iso) => iso === "2026-08-15" } };
  const kontekst = {};
  new Function("window", html.slice(zac, kon) +
    ";Object.assign(this,{jeVikendAliPraznik,shiftBucket,kosiZaDan,IZMENA_LABEL});")
    .call(kontekst, global.window);
  const { shiftBucket, kosiZaDan, jeVikendAliPraznik } = kontekst;

  // 3.8.2026 je ponedeljek, 8.8. sobota, 9.8. nedelja, 15.8. sobota.
  eq(shiftBucket("Dopoldne", "2026-08-03"), "DOPOLDNE", "dopoldne med tednom");
  eq(shiftBucket("Popoldne", "2026-08-03"), "POPOLDNE", "popoldne med tednom");
  eq(shiftBucket("Nočna", "2026-08-03"), "PONOCI", "nočna med tednom");
  eq(shiftBucket("Nočna od 19", "2026-08-03"), "PONOCI", "nočna od 19 med tednom");
  eq(shiftBucket("Dnevna 12", "2026-08-08"), "DNEVNA_VIKEND", "dnevna 12 v soboto");
  eq(shiftBucket("Nočna 12", "2026-08-08"), "PONOCI_VIKEND", "nočna 12 v soboto");
  eq(shiftBucket("LD", "2026-08-03"), null, "dopust ni izmena");
  eq(shiftBucket("KPU", "2026-08-03"), null, "koriščenje ni izmena");
  eq(shiftBucket("", "2026-08-03"), null, "prazna celica ni izmena");

  eq(kosiZaDan("2026-08-03"), ["DOPOLDNE", "POPOLDNE", "PONOCI"], "med tednom trije koši");
  eq(kosiZaDan("2026-08-08"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "v soboto dva");
  eq(kosiZaDan("2026-08-09"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "v nedeljo dva");

  // Praznik med tednom se šteje kot vikend - sicer bi aplikacija na
  // državni praznik zahtevala tri izmene, ki jih tisti dan ni.
  global.window.Prazniki = { jePraznik: (iso) => iso === "2026-08-17" };
  trdi(jeVikendAliPraznik("2026-08-17"), "praznik na ponedeljek se šteje kot vikend");
  eq(kosiZaDan("2026-08-17"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "in takrat veljata dva koša");
  trdi(!jeVikendAliPraznik("2026-08-18"), "navaden torek ostane delovni dan");
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
