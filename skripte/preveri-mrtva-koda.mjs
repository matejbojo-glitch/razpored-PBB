#!/usr/bin/env node
/* Balast: mrtve komponente, neprebrano stanje in neuporabljen CSS.
 *
 * ZAKAJ
 * Revizija septembra 2026 je pokazala, da so strani same po sebi čiste -
 * 86 komponent in 338 stanj, vse v rabi. Balast pa se nabira TAM, KJER SE
 * NE VIDI: ko se komponenta odstrani, njen CSS ostane. Ta preizkus je
 * nastal, ko sta po odstranitvi StatusPravil v theme.css obtičala razreda
 * .statusIkona in .pravilo, in z njima še 20 drugih iz starejših čistk
 * (skupaj 24 pravil, 3,5 kB).
 *
 * NAČELO: raje lažni "se uporablja" kot lažni "mrtev". Ime se šteje za
 * uporabljeno, če se kjerkoli v izvorni kodi pojavi kot cela beseda -
 * tudi v nizu, iz katerega se razred sestavi dinamično. Preizkus zato ne
 * more predlagati brisanja nečesa, kar je še v rabi.
 *
 * Zagon: node skripte/preveri-mrtva-koda.mjs
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

const STRANI = ["index.html", "admin.html", "imenik.html", "zelje.html",
  "obrazec.html", "dashboard.html", "nastavitve.html"];
const MODULI = ["nav.js", "export-buttons.js", "izmene.js", "nzv-zasedba.js",
  "oseba-vrstica.js", "parafa.js", "print-fit.js", "razpored-oblike.js",
  "import-utils.js", "export-utils.js", "statistika-core.js", "dashboard-core.js",
  "delovni-cas.js", "generator-core.js", "supabase-client.js", "push-client.js",
  "sheets-mreza.js", "oddelek-a.js", "dopust.js", "imena.js", "datum.js",
  "nazaj.js", "prazniki.js", "gsheets-client.js", "sw.js"];

let vsaKoda = "";
for (const f of [...STRANI, ...MODULI, "uvoz.html", "login.html", "reset-geslo.html"]) {
  try { vsaKoda += readFileSync(join(koren, f), "utf8") + "\n"; } catch (e) { /* ni obvezna */ }
}

console.log("1) Nobena komponenta ni definirana, a neizrisana");
{
  let skupaj = 0;
  const mrtve = [];
  for (const stran of STRANI) {
    const t = readFileSync(join(koren, stran), "utf8");
    const m = t.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
    const js = m ? m[1] : t;
    for (const k of [...js.matchAll(/^function ([A-Z][A-Za-z0-9_]*)\s*\(/gm)].map((x) => x[1])) {
      skupaj++;
      if (!new RegExp("<" + k + "[\\s/>]").test(js)) mrtve.push(stran + ":" + k);
    }
  }
  trdi(mrtve.length === 0,
    `${skupaj} komponent, vse izrisane` + (mrtve.length ? " – mrtve: " + mrtve.join(", ") : ""));
}

console.log("2) Nobeno stanje ni nastavljeno, a nikoli prebrano");
{
  let skupaj = 0;
  const mrtva = [];
  for (const stran of STRANI) {
    const t = readFileSync(join(koren, stran), "utf8");
    for (const m of t.matchAll(/const \[([A-Za-z0-9_]+), (set[A-Za-z0-9_]+)\] = useState/g)) {
      skupaj++;
      // Vrednost mora nastopiti vsaj še enkrat poleg same deklaracije.
      if ((t.match(new RegExp("\\b" + m[1] + "\\b", "g")) || []).length <= 1) {
        mrtva.push(stran + ":" + m[1]);
      }
    }
  }
  trdi(mrtva.length === 0,
    `${skupaj} stanj, vsa v rabi` + (mrtva.length ? " – mrtva: " + mrtva.join(", ") : ""));
}

console.log("3) V theme.css ni razreda, ki ga koda nikjer ne omenja");
{
  const css = readFileSync(join(koren, "theme.css"), "utf8");
  const brezKomentarjev = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const def = new Set();
  for (const m of brezKomentarjev.matchAll(/(^|[\s,>+~])\.([a-zA-Z][a-zA-Z0-9_-]*)/gm)) def.add(m[2]);

  const mrtvi = [...def].filter((r) => {
    const re = new RegExp("(^|[\\s\"'`.{(,+])" + r.replace(/-/g, "\\-") + "([\\s\"'`.})\\],:]|$)");
    return !re.test(vsaKoda);
  }).sort();

  // Znane izjeme: razred, ki v selektorju nastopa SAMO kot potomec živega
  // starša (".section > .eyebrow"). Odstranitev takih pravil je bila
  // namenoma izpuščena - dobiček je nekaj sto bajtov, tveganje napačnega
  // sklepanja pa večje. Če se seznam daljša, je čas za novo čistko.
  const POTOMCI = ["eyebrow", "glavaDan", "heatLegenda", "installBar", "todayCard"];
  const nova = mrtvi.filter((r) => !POTOMCI.includes(r));

  trdi(nova.length === 0,
    `${def.size} razredov v theme.css`
    + (nova.length ? ` – NOVI mrtvi: ${nova.join(", ")}` : ", brez novih mrtvih"));
  for (const r of POTOMCI) {
    trdi(mrtvi.includes(r), `znana izjema "${r}" je še vedno samo potomec živega selektorja`);
  }
}

console.log("4) Odstranjeni CSS se ni vrnil");
{
  const css = readFileSync(join(koren, "theme.css"), "utf8");
  const brezKomentarjev = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // .statusIkona in .pravilo sta padla skupaj s komponento StatusPravil.
  trdi(!/\.statusIkona\b/.test(brezKomentarjev), ".statusIkona je odstranjen s StatusPravil");
  trdi(!/(^|[\s,>+~])\.pravilo\b/m.test(brezKomentarjev), ".pravilo je odstranjen s StatusPravil");
  trdi(!/function StatusPravil\b/.test(readFileSync(join(koren, "admin.html"), "utf8")),
    "in komponente ni nazaj");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
