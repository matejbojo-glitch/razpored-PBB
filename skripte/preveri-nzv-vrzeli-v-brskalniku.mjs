#!/usr/bin/env node
/* Preizkus poti "Predlagaj mesec" v PRAVEM brskalniku (Chromium/Playwright).
 *
 * Logiko predlaganja pokriva preveri-nzv-rocno-in-vrzeli.mjs. Tu se preverja
 * tisto, česar preizkus brez brskalnika ne vidi: da je gumb res na strani, da
 * najdena vrzel res pride v mrežo in v seznam za potrditev, in predvsem da
 * predlog ostane NEPOTRJEN - se pravi neobjavljen - dokler ga človek ne
 * potrdi. Uporabnik je to pravilo postavil sam: "načeloma je tako, da se na
 * koncu Denis Džamastagić odloči in izpolni manjkajoče vrzeli."
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-nzv-vrzeli-v-brskalniku.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

// Od prehoda na Vite babel.min.js ni več v *.html - inline <script
// type="text/babel"> mora ta strežnik prevesti sam (isti pristop kot
// vite.config.mjs jsxVBlokihHtml), sicer se stran ne izriše.
const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4193;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "/index.html" : pot);
  if (!dat.startsWith(koren) || !existsSync(dat) || statSync(dat).isDirectory()) {
    odgovor.writeHead(404); return odgovor.end("404");
  }
  let vsebina = readFileSync(dat);
  if (extname(dat) === ".html") vsebina = prevediJsxVHtmlu(vsebina.toString("utf8"));
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

// Nosilci so izbrani tako, da je vrzel PREDVIDLJIVA: Trpin je edina na
// URGENCI, zato njen dopust pusti enoto praznega, druge enote pa ostanejo
// pokrite. Brez tega bi preizkus lahko "uspel" tudi, če predlaganja sploh ne
// bi bilo (nič vrzeli -> nič predlogov).
const VODJE = [
  { full_name: "Džamastagić Denis", department_code: "NZV", enote: "PDZN, SOBO", role: "admin" },
  { full_name: "Bojić Matej", department_code: "NZV", enote: "MO", role: "admin" },
  { full_name: "Alukić Dino", department_code: "NZV", enote: "ŽO", role: "admin" },
  { full_name: "Trpin Saša", department_code: "NZV", enote: "URGENCA", role: "vodja" },
];
const DOPUST = [{ full_name: "Trpin Saša", work_date: "2026-10-01", kind: "ld" }];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1400, height: 1000 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });

  await stran.addInitScript(({ vodje, dopust }) => {
    const tabele = { lead_departments: vodje, leave_entries: dopust,
      departments: [{ code: "PDZN", name: "PDZN" }, { code: "MO", name: "MO" }],
      schedule_entries: [], nadomescanja: [], nzv_nastavitve: [], profiles: [] };
    const poizvedba = (v) => {
      const b = new Proxy({}, { get(_, n) {
        if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
        if (n === "insert" || n === "upsert" || n === "update") return () => Promise.resolve({ data: [], error: null });
        if (typeof n !== "string") return undefined;
        return () => b;
      }});
      return b;
    };
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", { configurable: true,
      get() { return pravi; },
      set(v) {
        pravi = v;
        if (v && typeof v === "object") {
          const seja = { session: { user: { id: "p" } },
            profile: { id: "p", role: "admin", full_name: "Bojić Matej", department_code: "NZV" }, ogled: false };
          v.client = { from: (t) => poizvedba(tabele[t] || []), auth: {
            getSession: () => Promise.resolve({ data: { session: seja.session } }),
            getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          }};
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
        }
      },
    });
  }, { vodje: VODJE, dopust: DOPUST });

  console.log("1) zavihek NZV se odpre in izračuna mesec");
  await stran.goto(`http://127.0.0.1:${VRATA}/admin.html?tab=nzv&pod=vodje&mesec=2026-10`, { waitUntil: "load" });
  await stran.waitForSelector("#vmonth", { timeout: 15000 });
  trdi(await stran.$eval("#vmonth", e => e.value) === "2026-10", "mesec je oktober 2026");
  await stran.click("text=Izračunaj zasedenost");
  await stran.waitForSelector(".wardTable tbody tr", { timeout: 15000 });
  trdi((await stran.$$(".wardTable tbody tr")).length === 31, "mreža ima vseh 31 dni oktobra");

  console.log("2) »Predlagaj mesec« najde vrzel in jo ponudi v potrditev");
  trdi((await stran.$$("text=Predlagaj mesec")).length === 1, "gumb je na strani");
  const predPotrditvijo = (await stran.$$(".card input[type=checkbox]")).length;
  await stran.click("text=Predlagaj mesec");
  await stran.waitForTimeout(600);
  const potrditve = await stran.$$eval(".card label", e => e.map(x => x.textContent.replace(/\s+/g, " ").trim()));
  const vrzel = potrditve.find(t => t.includes("(vrzel)"));
  trdi(!!vrzel, "vrzel je v seznamu za potrditev: " + vrzel);
  trdi(/URGENCA/.test(vrzel || ""), "in je na enoti, ki je tisti dan ostala prazna (URGENCA)");
  trdi(!/Trpin/.test(vrzel || ""), "predlagana ni oseba, ki je tisti dan na dopustu");
  trdi((await stran.$$(".card input[type=checkbox]")).length === predPotrditvijo + 1,
    "seznam za potrditev je dobil natanko eno novo postavko");

  console.log("3) predlog ostane nepotrjen, dokler ga človek ne potrdi");
  const oznaceni = await stran.$$eval(".card input[type=checkbox]", e => e.filter(x => x.checked).length);
  trdi(oznaceni === 0, "nobeno polje ni vnaprej označeno – zadnja beseda ostane koordinatorju");
  const naslov = await stran.$eval(".card h3", e => e.textContent);
  trdi(/0\//.test(naslov), "števec potrjenih stoji na 0: " + naslov.trim());

  const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
