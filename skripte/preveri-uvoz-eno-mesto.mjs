#!/usr/bin/env node
/* Vsi uvozi na enem mestu (uvoz.html) in sprožilec "?uvoz=<kljuc>".
 *
 * Kaj se tu varuje – to je zdaj EDINA pot do uvoza, zato mora držati:
 *  - vsak vnos na strani "Uvoz" kaže na ključ, ki v aplikaciji RES obstaja
 *    (mrtva povezava bi pomenila uvoz, ki ga ni več mogoče doseči, ker so
 *    stare ikone 📥 odstranjene);
 *  - vsak uvozni vir z "kljuc" je na strani "Uvoz" tudi naveden (drugače ga
 *    nihče ne najde);
 *  - vir se ob "?uvoz=<kljuc>" res sam odpre in se ob osvežitvi NE odpre
 *    znova (naslov se počisti);
 *  - tuj/neznan ključ ne sproži ničesar.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-uvoz-eno-mesto.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4237;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

const STRANI = ["index.html", "admin.html", "imenik.html", "zelje.html"];

// ------------------------------------------------- 1) povezave se ujemajo
console.log("1) seznam na strani \"Uvoz\" in ključi v aplikaciji se ujemajo");
{
  const uvoz = readFileSync(join(koren, "uvoz.html"), "utf8");

  // Ključi, na katere kaže stran "Uvoz".
  const naSeznamu = [...uvoz.matchAll(/\?(?:[^"']*&)?uvoz=([a-z-]+)/g)].map(m => m[1]);
  trdi(naSeznamu.length >= 10, `stran našteje ${naSeznamu.length} uvozov`);

  // Ključi, ki v aplikaciji dejansko obstajajo.
  const obstojeci = new Set();
  STRANI.forEach(s => {
    const v = readFileSync(join(koren, s), "utf8");
    [...v.matchAll(/<RazporedUvozVir\s+kljuc="([a-z-]+)"/g)].forEach(m => obstojeci.add(m[1]));
    [...v.matchAll(/<RazporedUvozVir\s*\n\s*kljuc="([a-z-]+)"/g)].forEach(m => obstojeci.add(m[1]));
  });

  const mrtve = [...new Set(naSeznamu)].filter(k => !obstojeci.has(k));
  trdi(mrtve.length === 0, "noben vnos ne kaže na neobstoječ uvoz" + (mrtve.length ? ": " + mrtve.join(", ") : ""));

  const nenavedeni = [...obstojeci].filter(k => !naSeznamu.includes(k));
  trdi(nenavedeni.length === 0,
    "vsak uvoz v aplikaciji je na seznamu" + (nenavedeni.length ? " – MANJKA: " + nenavedeni.join(", ") : ""));

  // Stare ikone 📥 so odstranjene, zato uvoz.html ne sme biti edina stran
  // brez poti nazaj: preverimo, da je v navigaciji.
  const nav = readFileSync(join(koren, "nav.js"), "utf8");
  trdi(/key:\s*"uvoz"[\s\S]*?href:\s*"uvoz\.html"/.test(nav), "\"Uvoz\" je v navigaciji");
  trdi(/key:\s*"uvoz"[\s\S]*?roles:\s*\["admin"\]/.test(nav), "in je viden samo administratorju");
  STRANI.forEach(s => {
    const v = readFileSync(join(koren, s), "utf8");
    trdi(!/RazporedUvozIkona/.test(v), `stara ikona 📥 je odstranjena iz ${s}`);
  });
}

// --------------------------------------------------------- 2) strežnik
const predpomnilnik = new Map();
const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "uvoz.html" : pot);
  if (!existsSync(dat) || !statSync(dat).isFile()) { odgovor.writeHead(404); odgovor.end("ni"); return; }
  let vsebina = predpomnilnik.get(dat);
  if (!vsebina) {
    vsebina = readFileSync(dat);
    if (extname(dat) === ".html") vsebina = Buffer.from(prevediJsxVHtmlu(vsebina.toString("utf8")), "utf8");
    predpomnilnik.set(dat, vsebina);
  }
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

// Preizkusna stran z enim uvoznim virom - sprožilec je v export-buttons.js,
// zato ga je mogoče preveriti brez cele aplikacije.
const PREIZKUSNA = `<!doctype html><html lang="sl"><head><meta charset="utf-8"><title>t</title></head>
<body><div id="root"></div>
<script src="vendor-app.min.js"></script>
<script src="export-buttons.js"></script>
<script type="text/babel" data-presets="react">
const { useState } = React;
function App(){
  const [klici, setKlici] = useState(0);
  return (<div>
    <RazporedUvozVir kljuc="preizkus" ikona="📄" naziv="Preizkus"
      onClick={() => { setKlici(k => k + 1); window.zabelezen = (window.zabelezen || 0) + 1; }} />
    <p id="stevec">{klici}</p>
  </div>);
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
</script></body></html>`;

async function odpriPreizkusno(iskanje) {
  const stran = await brskalnik.newPage();
  await stran.route("**://fonts.googleapis.com/**", r => r.abort());
  await stran.route("**://fonts.gstatic.com/**", r => r.abort());
  await stran.route(`**/preizkus.html*`, r =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: prevediJsxVHtmlu(PREIZKUSNA) }));
  await stran.goto(`http://127.0.0.1:${VRATA}/preizkus.html${iskanje}`, { waitUntil: "load" });
  await stran.waitForTimeout(400);
  return stran;
}

try {
  console.log("2) vir se ob \"?uvoz=<kljuc>\" sam odpre");
  {
    const stran = await odpriPreizkusno("?uvoz=preizkus");
    trdi(await stran.$eval("#stevec", e => e.textContent) === "1",
      "uvoz se je sprožil natanko enkrat");
    trdi(!/uvoz=/.test(await stran.evaluate(() => location.search)),
      "in naslov je počiščen, da se ob osvežitvi ne odpre znova: " + await stran.evaluate(() => location.search));
    await stran.close();
  }

  console.log("3) tuj ali manjkajoč ključ ne sproži ničesar");
  {
    const tuj = await odpriPreizkusno("?uvoz=nekaj-drugega");
    trdi(await tuj.$eval("#stevec", e => e.textContent) === "0", "tuj ključ ne sproži tega vira");
    await tuj.close();

    const brez = await odpriPreizkusno("");
    trdi(await brez.$eval("#stevec", e => e.textContent) === "0", "brez parametra se ne sproži nič");
    await brez.close();
  }

  console.log("4) stran \"Uvoz\" se izriše brez napak in našteje vse skupine");
  {
    const stran = await brskalnik.newPage();
    await stran.route("**://fonts.googleapis.com/**", r => r.abort());
    await stran.route("**://fonts.gstatic.com/**", r => r.abort());
    const konzola = [];
    stran.on("pageerror", e => konzola.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
    await stran.addInitScript(() => {
      let pravi = null;
      Object.defineProperty(window, "RazporedAuth", { configurable: true,
        get() { return pravi; },
        set(v) {
          pravi = v;
          if (v && typeof v === "object") {
            const seja = { session: { user: { id: "a" } }, profile: { id: "a", role: "admin", full_name: "Admin Ana" }, ogled: false };
            v.requireRole = () => Promise.resolve(seja);
            v.requireAuth = () => Promise.resolve(seja);
            v.getSessionAndProfile = () => Promise.resolve(seja);
            v.client = { from: () => new Proxy({}, { get(_, n) {
              if (n === "then") return (nx) => Promise.resolve({ data: [], error: null }).then(nx);
              return () => new Proxy({}, { get(__, m) {
                return m === "then" ? (nx) => Promise.resolve({ data: [], error: null }).then(nx) : () => {};
              }});
            }}) };
          }
        },
      });
    });
    await stran.goto(`http://127.0.0.1:${VRATA}/uvoz.html`, { waitUntil: "load" });
    await stran.waitForTimeout(600);
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(/Mesečni razpored izmen/.test(besedilo), "našteje uvoz razporeda");
    trdi(/Imenik zaposlenih/.test(besedilo), "našteje uvoz imenika");
    trdi(/Želje s fotografije/.test(besedilo), "našteje uvoz želja s fotografije");
    trdi(/Stanje dopusta/.test(besedilo), "našteje uvoz stanja dopusta");
    const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
    await stran.close();
  }
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
