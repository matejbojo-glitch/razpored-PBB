#!/usr/bin/env node
/* Preizkus: ENA oblika datuma v CELOTNI aplikaciji — dan.mesec.leto.
 *
 * Zakaj obstaja: uporabnik je to zahteval večkrat, pa se je vsakič
 * našlo mesto, ki je bilo spregledano — nazadnje "Stanje dopusta (na dan
 * 2026-08-11)" v Imeniku, kjer je bil izpisan surov zapis iz baze.
 * Ročno pregledovanje očitno ne zadošča, zato je pravilo tu zaklenjeno:
 *
 *   1. NOBENA stran ne sme uporabljati toLocale* za datum ali uro —
 *      to je bil vir vseh različnih oblik ("11. 8. 2026", "11. avg.",
 *      "11.08.2026"). Vse gre prek datum.js.
 *   2. Znana datumska polja (rojstvo, stanje na dan, delovni datum,
 *      časovni žigi …) se v izpisu ne smejo pojaviti surova.
 *   3. Oblika sama je preverjena z vrednostmi, ne le z obstojem funkcij.
 *
 * Zagon: node skripte/preveri-oblika-datuma.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
  trdi(a === b, opis + (a === b ? "" : ` — dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "datum.js"), "utf8"), sandbox);
const D = sandbox.window.Datum;

// Vse strani aplikacije (ne vendorirane knjižnice).
const STRANI = readdirSync(koren).filter(f => f.endsWith(".html"));
const LASTNE_SKRIPTE = readdirSync(koren)
  .filter(f => f.endsWith(".js") && !f.endsWith(".min.js") && f !== "datum.js");

console.log("1) oblika je dan.mesec.leto — preverjeno z vrednostmi");
{
  eq(D.slo("2026-10-27"), "27.10.2026", "navaden datum");
  eq(D.slo("1991-03-04"), "4.3.1991", "enomestni dan in mesec brez vodilnih ničel");
  eq(D.slo("2026-08-11T13:51:22"), "11.8.2026", "iz časovnega žiga se vzame samo datum");
  eq(D.sloBrezLeta("2026-10-27"), "27.10.", "brez leta, s končno piko");
  eq(D.mesecLeto("2026-08"), "avgust 2026", "naslov meseca");
  eq(D.slo(""), "", "prazna vrednost ostane prazna");
  eq(D.slo(null), "", "null ostane prazen");
  // Nikjer ne sme biti presledkov: prav ti so v ozkih stolpcih rezali
  // besedilo ("1. 9. 20…").
  trdi(!/\s/.test(D.slo("2026-10-27")), "v datumu ni presledkov");
}

console.log("2) NOBENA stran ne oblikuje datuma sama (brez toLocale*)");
{
  // Preverjamo KODO, ne komentarjev: opombe (npr. v sw.js in datum.js)
  // to past navajajo prav po imenu in bi se sicer ujele same.
  const brezKomentarjev = src => src.split("\n")
    .filter(v => !/^\s*(\/\/|\*|\/\*)/.test(v)).join("\n");

  [...STRANI, ...LASTNE_SKRIPTE].forEach(f => {
    const src = brezKomentarjev(readFileSync(join(koren, f), "utf8"));
    const zadetki = (src.match(/toLocale\w*/g) || []);
    trdi(zadetki.length === 0, `${f} ne uporablja toLocale*`
      + (zadetki.length ? ` — najdeno: ${[...new Set(zadetki)].join(", ")}` : ""));
  });
}

console.log("3) znana datumska polja se ne izpisujejo surova");
{
  // Polja, ki v bazi nosijo ISO datum ali časovni žig. Če pridejo do
  // IZPISA, morajo iti skozi datum.js (neposredno ali prek ovoja
  // fmtDatum/fmtCas/datumSlo/oblikujDatum, ki so samo preimenovanja).
  const POLJA = [
    "birth_date", "leave_balance_asof", "work_date", "created_at",
    "changed_at", "updated_at", "odsotnost_do", "njihov_datum",
  ];
  const SKOZI_MODUL = /window\.Datum\.|fmtDatum|fmtCas|datumSlo|oblikujDatum/;

  // Iščemo SAMO izraze na mestu besedila v JSX - torej take, ki stojijo
  // takoj za ">" ali takoj pred "<". Objektni literali, ključi za
  // poizvedbe in prenos lastnosti navzdol (naDan={...}, kjer oblikuje
  // otrok) niso izpis in se ne štejejo.
  // "[^=]>" in ne samo ">": sicer se ujame tudi telo puščične funkcije
  // ("r => { … }"), ki ni izpis, ampak koda.
  const IZPIS = [/[^=]>\s*\{([^{}\n]*)\}/g, /\{([^{}\n]*)\}\s*</g];
  // Izpis je IZRAZ. Karkoli vsebuje podpičje ali prireditev, je koda.
  const JE_KODA = /;|=>|[^=!<>]=[^=]/;

  STRANI.forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    const sporni = new Set();
    IZPIS.forEach(re => {
      let m;
      while ((m = re.exec(src)) !== null) {
        const izraz = m[1];
        if (!POLJA.some(p => izraz.includes(p))) continue;
        if (SKOZI_MODUL.test(izraz)) continue;
        if (JE_KODA.test(izraz)) continue;
        sporni.add(izraz.trim().slice(0, 70));
      }
    });
    trdi(sporni.size === 0, `${f}: nobeno datumsko polje ni izpisano surovo`
      + (sporni.size ? ` — ${[...sporni].slice(0, 3).join(" | ")}` : ""));
  });
}

console.log("4) strani, ki izpisujejo datume, nalagajo datum.js");
{
  STRANI.forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    if (!/window\.Datum\./.test(src)) return; // stran datumov ne izpisuje
    trdi(/<script src="datum\.js"><\/script>/.test(src), `${f} nalaga datum.js`);
  });
}

console.log("5) mesta, ki so bila že popravljena, ostanejo popravljena");
{
  // Vsako od teh je uporabnik nekoč videl napačno zapisano; navedena so
  // poimensko, da se ob naslednji predelavi ne izgubijo tiho.
  const mesta = [
    ["imenik.html", /\(na dan " \+ window\.Datum\.slo\(hr\.leave_balance_asof\)/, "Stanje dopusta — na dan"],
    ["imenik.html", /\(na dan " \+ window\.Datum\.slo\(naDan\)/, "Napredek dopusta — na dan"],
    ["imenik.html", /Rojstvo<\/div><div className="val">\{window\.Datum\.slo\(hr\.birth_date\)/, "Datum rojstva"],
    ["imenik.html", /<td>\{window\.Datum\.slo\(v\.leave_balance_asof\) \|\| "—"\}<\/td>/, "Seznam stanja dopusta"],
    ["admin.html", /<td>\{window\.Datum\.slo\(v\.work_date\)\}<\/td>/, "Dnevnik sprememb — delovni datum"],
    ["admin.html", /\{window\.Datum\.sloSCasom\(v\.changed_at\)\}/, "Dnevnik sprememb — čas"],
    ["admin.html", /glave: \["Zaposleni", \.\.\.rezultat\.dnevi\.map\(dn => window\.Datum\.slo\(dn\.datum\)\)\]/, "Izvoz kalupa — glave dni"],
    ["index.html", /window\.Datum\.sloSCasom\(objava\.created_at\)/, "Podpisi — datum objave"],
    ["index.html", /\{window\.Datum\.mesecLeto\(month\)\}/, "Naslov meseca"],
    ["zelje.html", /\{window\.Datum\.sloSCasom\(e\.created_at\)\}/, "Zgodovina želja"],
    ["zelje.html", /window\.Datum\.slo\(isoZa\(view\.year, view\.month, d\)\)/, "Izvoz mreže želja — glave dni"],
    ["obrazec.html", /return window\.Datum\.slo\(iso\);/, "Menjava — datum"],
  ];
  mesta.forEach(([f, vzorec, opis]) => {
    const src = readFileSync(join(koren, f), "utf8");
    trdi(vzorec.test(src), `${f}: ${opis}`);
  });
}

console.log('6) <input type="date"> ostane v ISO zapisu');
{
  // To NI izjema od pravila, ampak zahteva standarda: vnosno polje tipa
  // "date" po HTML specifikaciji hrani vrednost kot "YYYY-MM-DD", prikaz
  // pa določa brskalnik/operacijski sistem in ga stran ne more spremeniti.
  // Če bi tu vsilili slovensko obliko, polje sploh ne bi delovalo.
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  trdi(/type="date" value=\{hrEdit\.birth_date\}/.test(imenik),
    "vnos datuma rojstva ohrani ISO vrednost");
  trdi(/type="date" value=\{hrEdit\.leave_balance_asof\}/.test(imenik),
    "vnos 'Stanje na dan' ohrani ISO vrednost");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
