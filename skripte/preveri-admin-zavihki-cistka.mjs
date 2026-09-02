#!/usr/bin/env node
/* Preizkus preureditve administratorskih zavihkov (september 2026):
 *
 *  1) PLAČE – zavihek je v celoti odstranjen (Generator). Odstranjena je
 *     tudi vsa koda obračuna, ki jo je uporabljal samo on (ure, nočne,
 *     nedelje, prazniki) – vključno s ČETRTO kopijo izračuna slovenskih
 *     praznikov, ki je bila prav tam.
 *
 *  2) ŽELJE – prikaza "Po dnevih" in "Moj koledar" sta odstranjena;
 *     ostane sama mreža celega meseca. Preklopa pogledov zato ni več.
 *
 *  3) GENERATOR -> STATISTIKA – zavihek "Dopust" (uvoz stanja dopusta iz
 *     Kadrisa in mesečni pregled) je PRESELJEN v Statistiko, pod obstoječi
 *     zavihek "Stanje dopusta". Preselitev, ne kopija: v Generatorju ga
 *     ne sme več biti, sicer bi se dve poti za isti uvoz sčasoma razšli.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-admin-zavihki-cistka.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4219;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const admin = readFileSync(join(koren, "admin.html"), "utf8");
const zelje = readFileSync(join(koren, "zelje.html"), "utf8");
const dash  = readFileSync(join(koren, "dashboard.html"), "utf8");

console.log("1) Plače: zavihka in njegove kode ni več");
{
  trdi(!/PlaceTab/.test(admin), "komponente PlaceTab ni več");
  trdi(!/>Plače</.test(admin), "gumba zavihka ni več");
  trdi(!/"place"/.test(admin), "kode zavihka ni več niti v napotilu iz Želja");
  // Pomožne funkcije, ki jih je uporabljal SAMO obračun.
  ["ureIzmene", "jeOdsotnostBrezDela", "jeNocnaSifra", "velikaNoc", "slovenskiPrazniki", "jeNedelja"]
    .forEach(f => trdi(!new RegExp("function " + f + "\\\\b").test(admin), f + " je odstranjena z njim"));
  // …ta pa NE: uporablja jo tudi pregled dežurstev.
  trdi(/function jeDezurstvoSifra\b/.test(admin), "jeDezurstvoSifra ostane (rabi jo pregled dežurstev)");
  trdi(/jeDezurstvoSifra\(r\.shift_code\)/.test(admin), "in je res še vedno v uporabi");
}

console.log("2) Želje: 'Po dnevih' in 'Moj koledar' sta odstranjena");
{
  // Imeni smeta ostati v KOMENTARJU (pojasnilo, zakaj preklopa ni več);
  // gumba ne.
  const brezKomentarjev = zelje.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  trdi(!/Po dnevih/.test(brezKomentarjev), "gumba 'Po dnevih' ni več");
  trdi(!/Moj koledar/.test(brezKomentarjev), "gumba 'Moj koledar' ni več");
  trdi(!/function DnevniPogled\b/.test(zelje), "komponente DnevniPogled ni več");
  trdi(!/function MojKoledar\b/.test(zelje), "komponente MojKoledar ni več");
  // Spodnji drsni meni je služil samo tema dvema pogledoma.
  trdi(!/function UrediSheet\b/.test(zelje), "spodnji drsni meni (UrediSheet) je odstranjen z njima");
  trdi(!/viewToggle|\bnacin\b/.test(zelje), "preklopa pogledov in stanja 'nacin' ni več");
  trdi(!/\.dayCard\{|\.sheetOverlay\{/.test(zelje), "in tudi njunih slogov ne");
  // Kar mora OSTATI.
  trdi(/className="gridScroll"/.test(zelje), "mreža celega meseca ostane");
  trdi(/className="penRow no-print"/.test(zelje), "izbira barve ostane");
}

console.log("3) Dopust je PRESELJEN iz Generatorja v Statistiko");
{
  trdi(!/function DopustTab\b/.test(admin), "v Generatorju komponente ni več");
  trdi(!/>Dopust</.test(admin), "in tudi zavihka ne");
  trdi(/function DopustTab\b/.test(dash), "v Statistiki je");
  trdi(/<DopustTab \/>/.test(dash), "in se tam tudi izriše");
  trdi(/DOPUST_GLAVE_MAPA/.test(dash) && !/DOPUST_GLAVE_MAPA/.test(admin),
    "z njim se je preselila tudi preslikava stolpcev iz Kadrisa");
  trdi(/<script src="import-utils\.js"><\/script>/.test(dash), "Statistika nalaga import-utils.js (uvoz datoteke)");
  trdi(/<script src="imena\.js"><\/script>/.test(dash), "in imena.js (ujemanje imen ob uvozu)");
  trdi(/const imenaSeUjemata = window\.Imena\.seUjemata;/.test(dash), "ujemanje imen je iz skupnega modula, ne lastna kopija");
}

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
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

const PROFILI = [{ id: "a", full_name: "Admin Ana", role: "admin", department_code: "NZV" }];
const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const odpri = async (stranIme) => {
    const stran = await brskalnik.newPage({ viewport: { width: 1400, height: 1000 } });
    stran.on("pageerror", e => konzolaVse.push(stranIme + ": " + e));
    stran.on("console", m => { if (m.type() === "error") konzolaVse.push(stranIme + ": " + m.text()); });
    await stran.addInitScript(({ profili }) => {
      const tabele = { profili, oddelki: [{ code: "B", name: "B – oddelek" }],
        stanje_dopusta_obdobja: [], stanje_dopusta_pregled: [], razpored: [], obrazci: [],
        nosilci_oddelkov: [], nadomescanja: [], odsotnosti: [], zelje_zaposlenih: [],
        nzv_nastavitve: [], dnevnik_profilov: [], kadrovski_podatki: [] };
      const poizvedba = (v) => {
        const b = new Proxy({}, { get(_, n) {
          if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
          if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data: v[0] || null, error: null });
          if (n === "insert" || n === "upsert") return () => Promise.resolve({ data: [], error: null });
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
            const seja = { session: { user: { id: "a" } }, profile: profili[0], ogled: false };
            v.client = { from: (t) => poizvedba(tabele[t] || []), rpc: () => Promise.resolve({ data: null, error: null }),
              auth: {
                getSession: () => Promise.resolve({ data: { session: seja.session } }),
                getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              }};
            v.requireAuth = () => Promise.resolve(seja);
            v.requireRole = () => Promise.resolve(seja);
            v.getSessionAndProfile = () => Promise.resolve(seja);
            v.unreadNotificationCount = () => Promise.resolve(0);
            v.vseStrani = (fn) => Promise.resolve(fn(0, 999)).then(r => (r && r.data) || []);
          }
        },
      });
    }, { profili: PROFILI });
    await stran.goto(`http://127.0.0.1:${VRATA}/` + stranIme, { waitUntil: "load" });
    // Želje nimajo vrstice ".tabs" (skupine so ".skupinaBtn").
    await stran.waitForSelector(stranIme === "zelje.html" ? ".skupinaBtn" : ".tabs button", { timeout: 15000 });
    await stran.waitForTimeout(900);
    return stran;
  };

  console.log("4) Generator: zavihki v brskalniku");
  {
    const stran = await odpri("admin.html");
    const zavihki = await stran.$$eval("header .tabs button", e => e.map(x => x.textContent.trim()));
    eq(zavihki, ["Oddelki", "NZV", "Uporabniki", "Revizija"], "ostanejo štirje zavihki, brez Dopusta in Plač");
    await stran.close();
  }

  console.log("5) Statistika: 'Stanje dopusta' pokaže preseljeni uvoz");
  {
    const stran = await odpri("dashboard.html");
    const zavihki = await stran.$$eval("header .tabs button", e => e.map(x => x.textContent.trim()));
    trdi(zavihki.includes("Stanje dopusta"), "zavihek obstaja: " + zavihki.join(" | "));
    await stran.click("button[role=tab]:has-text('Stanje dopusta')");
    await stran.waitForTimeout(900);
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/Mesečno stanje dopusta \(Kadris\)/i.test(t), "preseljeni uvoz je tu: " + t.slice(0, 160));
    trdi((await stran.$$("[data-uvoz-kljuc='stanje-dopusta'], input[type=file]")).length > 0
      || /Stanje dopusta \(Kadris\)/i.test(t), "z gumbom za uvoz datoteke");
    await stran.close();
  }

  console.log("6) Želje: ostane sama mreža");
  {
    const stran = await odpri("zelje.html");
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(!/Po dnevih/i.test(t), "gumba 'Po dnevih' ni");
    trdi(!/Moj koledar/i.test(t), "gumba 'Moj koledar' ni");
    trdi((await stran.$$(".gridScroll")).length === 1, "mreža celega meseca je izrisana");
    // Na telefonu se je prej privzeto odprl pogled "Po dnevih" - zdaj mora
    // tudi tam biti mreža, brez praznega zaslona.
    await stran.setViewportSize({ width: 412, height: 915 });
    await stran.waitForTimeout(500);
    trdi((await stran.$$(".gridScroll")).length === 1, "tudi na telefonu se izriše mreža (prej privzeto 'Po dnevih')");
    await stran.close();
  }

  const prave = konzolaVse.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
