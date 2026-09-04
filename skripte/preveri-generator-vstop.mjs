#!/usr/bin/env node
/* Vstopna stran Generatorja in gumb "nazaj" v brskalniku.
 *
 * Uporabnikove zahteve (september 2026):
 *   a) ob kliku na GENERATOR je takoj vidno generiranje iz Želja - zgoraj
 *      izbira ODDELKA (tudi NZV in dežurstva) in MESECA, pod tem gumb
 *      "Generiraj takoj";
 *   b) generiranje upošteva vse vrste vnosov iz Želja (OM, BS, STI, KRO, LD);
 *   4b) "Pokritost po dnevih" je manjša in na DNU strani, ne takoj pod
 *      razporedom;
 *   splošno) gumb "nazaj" v brskalniku vrne na PREJŠNJI POGLED, ne s strani
 *      ven - to velja za celo aplikacijo.
 *
 * Zakaj v brskalniku: gre za to, kaj uporabnik VIDI takoj po kliku in kaj
 * se zgodi ob "nazaj". Iz izvorne kode se ne vidi ne vrstni red na zaslonu
 * ne vedenje zgodovine.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-generator-vstop.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4297;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

console.log("1) skupni modul za zgodovino je naložen povsod, kjer so zavihki");
{
  // Brez tega bi vsaka stran svoje vedenje ob "nazaj" pisala po svoje - in
  // prav tako se je doslej razšlo (imenik.html je edini imel svojo rešitev).
  const strani = ["index.html", "admin.html", "zelje.html", "dashboard.html", "imenik.html", "obrazec.html"];
  strani.forEach(d => {
    const src = readFileSync(join(koren, d), "utf8");
    trdi(/<script src="nazaj\.js"><\/script>/.test(src), d + " naloži nazaj.js");
  });
  const sw = readFileSync(join(koren, "sw.js"), "utf8");
  const vite = readFileSync(join(koren, "vite.config.mjs"), "utf8");
  trdi(/'\.\/nazaj\.js'/.test(sw), "nazaj.js je v predpomnilniku (sw.js)");
  trdi(/"nazaj\.js"/.test(vite), "in med skupnimi moduli v vite.config.mjs");
}

const streznik = http.createServer((z, o) => {
  const pot = decodeURIComponent(z.url.split("?")[0]);
  const f = join(koren, pot === "/" ? "/admin.html" : pot);
  if (!f.startsWith(koren) || !existsSync(f) || statSync(f).isDirectory()) { o.writeHead(404); return o.end("404"); }
  let v = readFileSync(f);
  if (extname(f) === ".html") v = prevediJsxVHtmlu(v.toString("utf8"));
  o.writeHead(200, { "Content-Type": TIP[extname(f)] || "application/octet-stream" });
  o.end(v);
});
await new Promise(r => streznik.listen(VRATA, r));

const zdaj = new Date();
const MESEC = zdaj.getFullYear() + "-" + String(zdaj.getMonth() + 1).padStart(2, "0");

const PROFILI = [
  { id: "a1", full_name: "Bojić Matej", role: "admin", department_code: "NZV" },
  ...["Novak Ana", "Kovač Eva", "Horvat Jan", "Krajnc Maja", "Zupan Tine"]
    .map((ime, i) => ({ id: "o" + i, full_name: ime, role: "user", department_code: "B" })),
];

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function odpri(pot) {
  const stran = await brskalnik.newPage({ viewport: { width: 1440, height: 950 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  await stran.addInitScript(({ profili }) => {
    const poizvedba = (vrstice) => {
      const filtri = [];
      const b = new Proxy({}, { get(_, ime) {
        if (ime === "eq") return (k, v) => { filtri.push([k, v]); return b; };
        if (ime === "then") return (naprej) => Promise.resolve({
          data: vrstice.filter(r => filtri.every(([k, v]) => r[k] === v)), error: null }).then(naprej);
        if (ime === "insert" || ime === "upsert" || ime === "update") return () => Promise.resolve({ data: [], error: null });
        if (typeof ime !== "string") return undefined;
        return () => b;
      }});
      return b;
    };
    const tabele = { profili, razpored: [], odsotnosti: [], nosilci_oddelkov: [], nadomescanja: [],
      oddelki: [], nzv_nastavitve: [], pokriva_oddelek: [], kadrovski_podatki: [],
      zgodovina_stanja_dopusta: [], dezurni_zdravniki: [], obrazci: [], barvne_oznake: [] };
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", { configurable: true,
      get() { return pravi; },
      set(v) {
        pravi = v;
        if (v && typeof v === "object") {
          const seja = { session: { user: { id: "a1" } },
            profile: { id: "a1", role: "admin", full_name: "Bojić Matej", department_code: "NZV" }, ogled: false };
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
  }, { profili: PROFILI });
  await stran.goto(`http://127.0.0.1:${VRATA}${pot}`, { waitUntil: "load" });
  await stran.waitForTimeout(900);
  return { stran, konzola };
}

try {
  console.log("2) Generator se odpre NARAVNOST na generiranju iz Želja");
  const { stran, konzola } = await odpri("/admin.html");
  await stran.waitForSelector("#odd", { timeout: 15000 });
  const izbran = await stran.$eval('.tabs [role="tab"][aria-selected="true"]', e => e.textContent.trim());
  eq(izbran, "Oddelki", "privzeti zavihek je Oddelki");
  trdi((await stran.$$("#odd")).length === 1, "zgoraj je izbirnik oddelka");
  trdi((await stran.$$("#mm")).length === 1, "in izbirnik meseca");
  trdi((await stran.$$('button:has-text("Generiraj takoj")')).length >= 1, "ter gumb »Generiraj takoj«");
  // Vse troje mora biti VIDNO brez drsenja - "takoj vidno" je bila zahteva.
  const vrhGumba = await stran.$eval('.orodjaVrh button', e => Math.round(e.getBoundingClientRect().bottom));
  trdi(vrhGumba < 700, `nadzorna vrstica je na prvem zaslonu (${vrhGumba} px < 700)`);

  console.log("3) izbirnik ponuja tudi NZV in dežurstva");
  const moznosti = await stran.$$eval("#odd option", e => e.map(x => x.value));
  trdi(moznosti.includes("NZV:vodje"), "NZV – vodstvena pokritost je med možnostmi");
  trdi(moznosti.includes("NZV:dez"), "NZV – dežurstva prav tako");
  trdi(moznosti.includes("B") && moznosti.includes("C1"), "oddelki ostanejo: " + moznosti.join(", "));
  // Izbira NZV mora RES preklopiti na NZV generator, ne le spremeniti napis.
  await stran.selectOption("#odd", "NZV:dez");
  await stran.waitForTimeout(1200);
  const poIzbiri = await stran.$eval('.tabs [role="tab"][aria-selected="true"]', e => e.textContent.trim());
  eq(poIzbiri, "NZV", "izbira NZV preklopi na zavihek NZV");
  const podzavihek = await stran.$eval('.tabs [role="tab"][aria-selected="true"] ~ *, div.tabs:nth-of-type(2) [role="tab"][aria-selected="true"]',
    e => e.textContent.trim()).catch(() => null);
  const podzavihki = await stran.$$eval('[role="tab"]', e => e.filter(x => x.getAttribute("aria-selected") === "true").map(x => x.textContent.trim()));
  trdi(podzavihki.includes("Dežurstva"), "in odpre podzavihek Dežurstva: " + podzavihki.join(" | "));

  console.log("4) gumb »nazaj« vrne na prejšnji zavihek, ne s strani ven");
  trdi(/[?&]tab=nzv/.test(stran.url()), "zavihek je zapisan v naslovu: " + stran.url());
  await stran.goBack();
  await stran.waitForTimeout(1000);
  const poNazaj = await stran.$eval('.tabs [role="tab"][aria-selected="true"]', e => e.textContent.trim());
  eq(poNazaj, "Oddelki", "»nazaj« vrne na zavihek Oddelki");
  trdi(!/[?&]tab=/.test(stran.url()), "in naslov je spet čist: " + stran.url());
  // Naprej mora prav tako delovati - zgodovina ni enosmerna.
  await stran.goForward();
  await stran.waitForTimeout(1000);
  eq(await stran.$eval('.tabs [role="tab"][aria-selected="true"]', e => e.textContent.trim()), "NZV",
    "»naprej« gre spet na NZV");

  console.log("5) 4b »Pokritost po dnevih« je zložena in na dnu");
  // Pred generiranjem je ni (rezultata še ni) - to je v redu; preverjamo,
  // da je v kodi zložljiva in ZA gumbom za objavo, ne pred njim.
  const src = readFileSync(join(koren, "admin.html"), "utf8");
  const iPokritost = src.indexOf('naslov="4b · Pokritost po dnevih"');
  const iObjava = src.indexOf("📤 Objavi neposredno v Supabase");
  trdi(iPokritost > 0, "razdelek 4b je zložljiv (Zlozljivo)");
  trdi(iPokritost > iObjava, "in stoji ZA gumbom za objavo, torej na dnu strani");
  trdi(!/<h2 className="section no-print">4b · Pokritost po dnevih<\/h2>/.test(src),
    "starega, vedno odprtega naslova ni več");

  const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();

  console.log("5b) urejanja v Razporedu NI – dosegljivo je samo iz Generatorja");
  {
    // Uporabnikova zahteva: "V gumbu RAZPORED so samo veljavne različice
    // razporedov, kjer ni možnosti urejanja." Mreža ostane v index.html
    // (podvojena bi bila dve kopiji istega zaslona), gumbi za urejanje pa
    // se prižgejo samo, kadar stran odpre Generator z "?uredi=1".
    const gen = readFileSync(join(koren, "admin.html"), "utf8");
    trdi(/uredi=1&pogled=ward&oddelek=/.test(gen),
      "Generator ima vstop »Uredi objavljen razpored«");

    const { stran: brez } = await odpri("/index.html?pogled=ward&oddelek=B");
    await brez.waitForSelector(".segIkone button", { timeout: 15000 });
    await brez.waitForTimeout(1200);
    trdi((await brez.$$('button:has-text("Uredi razpored")')).length === 0,
      "pri običajnem brskanju po Razporedu gumba za urejanje NI");
    trdi(!/Menjave v tem mesecu/.test(await brez.innerText("body")),
      "in seznama menjav prav tako ne (preselil se je pod Generator)");
    await brez.close();

    const { stran: z } = await odpri("/index.html?uredi=1&pogled=ward&oddelek=B");
    await z.waitForSelector(".segIkone button", { timeout: 15000 });
    await z.waitForTimeout(1400);
    trdi((await z.$$('button:has-text("Uredi razpored")')).length === 1,
      "odprto iz Generatorja (?uredi=1) pa gumb JE");
    await z.close();
  }

  console.log("6) isto velja za Razpored: »nazaj« vrne na prejšnji zavihek");
  {
    const { stran: r } = await odpri("/index.html");
    await r.waitForSelector(".segIkone button", { timeout: 15000 });
    await r.waitForTimeout(700);
    await r.click('.segIkone button:has-text("Dežurstvo")');
    await r.waitForTimeout(900);
    trdi(/[?&]pogled=dez/.test(r.url()), "zavihek je v naslovu: " + r.url());
    await r.goBack();
    await r.waitForTimeout(900);
    const izbranR = await r.$eval('.segIkone [role="tab"][aria-selected="true"]', e => e.textContent.replace(/\s+/g, " ").trim());
    trdi(/Moj/.test(izbranR), "»nazaj« vrne na »Moj razpored«: " + izbranR);
    await r.close();
  }
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
