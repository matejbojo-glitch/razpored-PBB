#!/usr/bin/env node
/* Vizualni preizkus legende kratic v Imeniku -> Razpredelnica.
 *
 * Zakaj v brskalniku in ne z branjem kode: uporabnik je javil dvoje, kar
 * je vidno SAMO na izrisu -
 *   1. vrstice legende so bile neenakomerne (vsaka kratica druge širine,
 *      razlage niso bile poravnane pod isto navpičnico),
 *   2. legenda je bila vedno odprta in je na telefonu zavzela skoraj cel
 *      prvi zaslon, tako da je tabela padla pod rob.
 * Oboje bi ob branju kode zlahka spregledal - meri se le z izmerjenimi
 * koordinatami elementov.
 *
 * Kartica legende se izreže DOBESEDNO iz index.html (skupaj z gumbom),
 * zato preizkus ne more zaostati za resnično stranjo.
 *
 * Zagon:  node skripte/preveri-legenda-kratic.mjs
 * Če brskalnik ni na privzeti poti:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node skripte/preveri-legenda-kratic.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
// Razpredelnica (in z njo legenda kratic) je bila avgusta 2026 prenesena
// iz Imenika v Razpored - kartica se zato izreže iz index.html.
const html = readFileSync(join(koren, "index.html"), "utf8");
const theme = readFileSync(join(koren, "theme.css"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

function izvleciConst(ime) {
  const z = html.indexOf("const " + ime + " ");
  if (z === -1) throw new Error("const " + ime + " ni v index.html.");
  return html.slice(z, html.indexOf(";\n", z) + 1);
}
function izvleci(ime) {
  const z = html.indexOf("function " + ime + "(");
  if (z === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let g = 0;
  const t = html.indexOf("{", z);
  for (let k = t; k < html.length; k++) {
    if (html[k] === "{") g++;
    else if (html[k] === "}") { g--; if (!g) return html.slice(z, k + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}

const zac = html.indexOf('      <div className="card" style={{marginBottom:10, padding:"10px 12px"}}>');
const kon = html.indexOf("      {osebe === null");
if (zac === -1 || kon === -1 || zac > kon) throw new Error("Kartice legende v index.html ni bilo mogoče najti.");
const kartica = html.slice(zac, kon).trimEnd();

const stran = `<!doctype html><html><head><meta charset="utf-8">
<style>${theme}</style>
<style>body{padding:12px;max-width:420px;font-family:system-ui,sans-serif}</style>
<script src="react.production.min.js"></script>
<script src="react-dom.production.min.js"></script>
<script src="babel.min.js"></script>
<script src="izmene.js"></script></head><body><div id="r"></div>
<script type="text/babel">
const { useState } = React;
// Uradna legenda in barve so v izmene.js (skupni modul za vse zaslone) -
// preizkus jo naloži enako kot prava stran, ne kot svojo kopijo.
const STANJE_BARVA = window.Izmene.STANJE_BARVA;
const IZMENA_KRATICE = window.Izmene.KRATICE;
const barvaBesedila = window.Izmene.barvaBesedila;
function L(){ const [legendaOdprta, setLegendaOdprta] = useState(false); return (<React.Fragment>
${kartica}
</React.Fragment>); }
ReactDOM.createRoot(document.getElementById("r")).render(<L/>);
</script></body></html>`;

const pot = join(koren, "_preizkus-legenda.html");
writeFileSync(pot, stran);

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  const stran2 = await brskalnik.newPage({ viewport: { width: 420, height: 720 } });
  const konzola = [];
  stran2.on("pageerror", e => konzola.push(String(e)));
  await stran2.goto("file://" + pot, { waitUntil: "networkidle" });
  await stran2.waitForTimeout(1500);

  console.log("1) legenda je privzeto ZLOŽENA (tabela mora ostati na prvem zaslonu)");
  const gumb = await stran2.$("button[aria-expanded]");
  trdi(!!gumb, "gumb za odpiranje obstaja");
  trdi((await gumb.getAttribute("aria-expanded")) === "false", "privzeto zaprta (aria-expanded=false)");
  const visinaZaprta = await stran2.$eval(".card", e => e.getBoundingClientRect().height);
  trdi(visinaZaprta < 80, `zaprta kartica je nizka (${Math.round(visinaZaprta)} px < 80)`);
  trdi((await stran2.$$("b")).length === 0, "zaprta ne izriše nobene kratice");

  console.log("2) klik na 'i' jo odpre in znova zapre");
  await gumb.click(); await stran2.waitForTimeout(200);
  trdi((await gumb.getAttribute("aria-expanded")) === "true", "po kliku odprta");
  const stKratic = (await stran2.$$("div[style*='grid'] > b")).length;
  trdi(stKratic >= 15, `odprta izriše vse kratice (${stKratic})`);

  console.log("3) vse vrstice so ENAKE: kratica prva, vedno enako široka in poravnana");
  const meritve = await stran2.$$eval("div[style*='grid'] > b", els => els.map(e => {
    const r = e.getBoundingClientRect();
    return { t: e.textContent, x: Math.round(r.x), w: Math.round(r.width) };
  }));
  const sirine = [...new Set(meritve.map(m => m.w))];
  const robovi = [...new Set(meritve.map(m => m.x))];
  trdi(sirine.length === 1, `vse kratice so enako široke (${sirine.join(", ")} px)`);
  trdi(robovi.length === 1, `vse kratice imajo isti levi rob (${robovi.join(", ")} px)`);
  // Tudi najdaljša kratica (DF12, edina štiričrkovna) mora ostati v okvirju.
  const df12 = meritve.find(m => m.t === "DF12");
  trdi(!!df12, "DF12 je med izrisanimi");

  console.log("4) razlage se začnejo pod isto navpičnico");
  const razlage = await stran2.$$eval("div[style*='grid'] > span", els => els.map(e => Math.round(e.getBoundingClientRect().x)));
  trdi([...new Set(razlage)].length === 1, `vse razlage imajo isti levi rob (${[...new Set(razlage)].join(", ")} px)`);
  trdi(razlage[0] > robovi[0], "razlaga stoji DESNO od kratice (kratica je prva)");

  console.log("5) nič ne uhaja čez rob zaslona in ni napak v konzoli");
  const preseg = await stran2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  trdi(!preseg, "vsebina ne sili v vodoravno drsenje");
  trdi(konzola.length === 0, "brez napak v konzoli" + (konzola.length ? ": " + konzola.join(" | ") : ""));

  await gumb.click(); await stran2.waitForTimeout(200);
  trdi((await gumb.getAttribute("aria-expanded")) === "false", "drugi klik jo spet zapre");
} finally {
  await brskalnik.close();
  try { unlinkSync(pot); } catch {}
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
