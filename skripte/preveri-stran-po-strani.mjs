#!/usr/bin/env node
/* Supabase (PostgREST) privzeto vrne največ 1000 vrstic na klic, ne glede
 * na to, koliko jih poizvedba dejansko najde - presežek se molče odreže,
 * brez napake. V PRAVI bazi ima razpored cele bolnišnice za en mesec 1822
 * vrstic (7 oddelkov + NZV) - vsak klic brez omejitve oddelka/osebe je
 * torej nad mejo.
 *
 * Uporabnik: "zakaj nimajo vsi celotne razporeda v razpredelnici?" - ker
 * je Razpredelnica (in še trije zasloni) brala cel razpored bolnišnice za
 * mesec v ENEM klicu. Del ljudi/dni je bil zato tiho odrezan - kdo točno,
 * je bilo odvisno od vrstnega reda, v katerem Postgres vrne vrstice, torej
 * nepredvidljivo in različno od osvežitve do osvežitve.
 *
 * Kar se tu preveri:
 *   1) RazporedAuth.vseStrani dejansko pobere VSE vrstice, ne le prve
 *      strani - tudi kadar je skupno število natanko na meji strani ali
 *      tik nad njo (past za napako "za ena" pri robu).
 *   2) vsa štiri mesta, ki so brala CEL razpored bolnišnice za mesec brez
 *      omejitve na oddelek/osebo, zdaj uporabljajo vseStrani - statični
 *      pregled kode, da regresija (nekdo doda peto tako mesto in pozabi
 *      na stran) ne uide neopaženo.
 *
 * Zagon: node skripte/preveri-stran-po-strani.mjs
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

// Naložimo pravo vseStrani iz supabase-client.js - ne kopije logike.
global.window = { supabase: { createClient: () => ({ from: () => ({}) }) } };
new Function(readFileSync(join(koren, "supabase-client.js"), "utf8"))();
const { vseStrani } = global.window.RazporedAuth;
trdi(typeof vseStrani === "function", "RazporedAuth.vseStrani je izvožen");

console.log("1) pobere vse vrstice čez več strani, ne le prve");
{
  const VSEH = 1822; // isto število kot v pravi bazi za en mesec
  const klici = [];
  const podatki = Array.from({ length: VSEH }, (_, i) => ({ id: i }));
  const izdelajStran = (od, doV) => {
    klici.push([od, doV]);
    return Promise.resolve({ data: podatki.slice(od, doV + 1), error: null });
  };
  const rezultat = await vseStrani(izdelajStran, 1000);
  eq(rezultat.length, VSEH, `dobljenih ${rezultat.length} od ${VSEH} vrstic`);
  eq(rezultat[0], { id: 0 }, "prva vrstica je prava");
  eq(rezultat[VSEH - 1], { id: VSEH - 1 }, "zadnja vrstica je prava (ne odrezana)");
  eq(klici, [[0, 999], [1000, 1999]], "poklicani sta natanko dve strani – druga vpraša za poln obseg (1000-1999), tudi če manj vrstic obstaja");
}

console.log("2) robna števila: natanko na meji strani in tik pod njo");
{
  const preveriSteje = async (skupaj) => {
    const podatki = Array.from({ length: skupaj }, (_, i) => ({ id: i }));
    const rezultat = await vseStrani(
      (od, doV) => Promise.resolve({ data: podatki.slice(od, doV + 1), error: null }), 1000);
    return rezultat.length;
  };
  eq(await preveriSteje(1000), 1000, "natanko 1000 vrstic - brez odvečnega praznega klica");
  eq(await preveriSteje(999), 999, "999 vrstic - ne doda druge strani po nepotrebnem");
  eq(await preveriSteje(1001), 1001, "1001 vrstic - druga stran z eno samo vrstico se prišteje");
}

console.log("3) napaka na kateri koli strani se ne pogoltne");
{
  let napaka = null;
  try {
    await vseStrani((od) => Promise.resolve(
      od === 0 ? { data: Array.from({ length: 1000 }, () => ({})), error: null }
               : { data: null, error: new Error("mreža je odpovedala") }));
  } catch (e) { napaka = e; }
  trdi(napaka && napaka.message === "mreža je odpovedala",
    "napaka druge strani pride ven, namesto da bi tiho vrnil delen izid");
}

console.log("4) štiri mesta, ki so brala CEL razpored bolnišnice za mesec, zdaj uporabljajo vseStrani");
{
  const index = readFileSync(join(koren, "index.html"), "utf8");
  const admin = readFileSync(join(koren, "admin.html"), "utf8");

  // Vsak vzorec je dovolj natančen, da pove TOČNO ta klic (izbor stolpcev),
  // ne katerikoli klic na "razpored" - preverja se, da je PRED njim
  // "vseStrani(" in ne golo "client.from(\"razpored\")".
  const mesta = [
    { datoteka: "index.html", vsebina: index, opis: "Razpredelnica (StanjeRazpredelnica)",
      vzorec: /vseStrani\(\(od, doV\) =>\s*\n\s*client\.from\("razpored"\)\.select\("employee_id, work_date, shift_code, department_code, pokriva_oddelek"\)/ },
    { datoteka: "index.html", vsebina: index, opis: "Dežurstvo (DezurstvoPregled)",
      vzorec: /vseStrani\(\(od, doV\) =>\s*\n\s*client\.from\("razpored"\)\s*\n\s*\.select\("employee_id, work_date, shift_code, profili!employee_id\(full_name\)"\)/ },
    { datoteka: "index.html", vsebina: index, opis: "Oddelki - nosilci NZV pokrivalci (WardView)",
      vzorec: /vseStrani\(\(od, doV\) =>\s*\n\s*client\.from\("razpored"\)\s*\n\s*\.select\("work_date, department_code, pokriva_oddelek, profili!employee_id\(full_name, role\)"\)/ },
    { datoteka: "admin.html", vsebina: admin, opis: "Plače (PlaceTab)",
      vzorec: /RazporedAuth\.vseStrani\(\(od, doV\) =>\s*\n\s*client\.from\("razpored"\)\.select\("employee_id, work_date, shift_code"\)/ },
  ];
  mesta.forEach(m => trdi(m.vzorec.test(m.vsebina), `${m.datoteka}: ${m.opis} uporablja vseStrani`));

  // In obratno: noben od teh štirih izborov stolpcev se ne sme več pojaviti
  // BREZ vseStrani pred njim - to bi pomenilo, da je popravek na tem mestu
  // odstranjen (npr. ob ročnem urejanju), past #6 to preveri.
  trdi(!/[^i]\.range\(od, doV\)\.gte\("work_date", startISO\)/.test(index),
    "range() ni pomotoma na napačnem koncu verige");
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
