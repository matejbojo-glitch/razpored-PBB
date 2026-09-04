#!/usr/bin/env node
/* Preizkus poti "Predlagaj mesec" za razpored ODDELKA v pravem brskalniku.
 *
 * Logiko predlaganja pokriva preveri-vrzeli-oddelek.mjs. Tu se preverja
 * tisto, česar preizkus brez brskalnika ne vidi: da je gumb na strani, da
 * najde vrzeli iz nastavljenih minimumov, da predlogi NE gredo v razpored,
 * dokler jih človek ne potrdi, in da potrjeni res pristanejo v mreži.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-vrzeli-oddelek-brskalnik.mjs
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
const VRATA = 4195;
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

// Visok minimum za nočno izmeno je izbran namenoma: kalup ponoči nikoli ne
// postavi treh ljudi hkrati, zato so vrzeli zagotovljene in preizkus ne more
// "uspeti" zato, ker vrzeli sploh ni bilo.
const MINIMUMI = [
  { department_code: "B", shift_bucket: "DOPOLDNE", min_dms: 1, min_sms: 0, min_flexi: 0 },
  { department_code: "B", shift_bucket: "POPOLDNE", min_dms: 0, min_sms: 1, min_flexi: 0 },
  { department_code: "B", shift_bucket: "PONOCI", min_dms: 0, min_sms: 3, min_flexi: 0 },
];
const PROFILI = [
  { id: "p1", full_name: "Kovač Ana", rotation_slot: "A" },
  { id: "p2", full_name: "Novak Bine", rotation_slot: "B" },
  { id: "p3", full_name: "Zupan Cilka", rotation_slot: "C" },
  { id: "p4", full_name: "Horvat Dani", rotation_slot: "D" },
  { id: "p5", full_name: "Mlakar Eva", rotation_slot: "E" },
];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1500, height: 1000 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });

  await stran.addInitScript(({ profili, minimumi }) => {
    const tabele = { profili: profili, minimalna_zasedba: minimumi,
      odsotnosti: [], razpored: [], oddelki: [], kadrovski_podatki: [] };
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
  }, { profili: PROFILI, minimumi: MINIMUMI });

  console.log("1) zavihek Oddelki izračuna mesec");
  await stran.goto(`http://127.0.0.1:${VRATA}/admin.html?tab=kalup&oddelek=B&mesec=2026-10`, { waitUntil: "load" });
  await stran.waitForSelector("#odd", { timeout: 15000 });
  await stran.click("text=Generiraj takoj");
  await stran.waitForSelector(".wardTable tbody tr", { timeout: 15000 });
  trdi((await stran.$$(".wardTable tbody tr")).length === PROFILI.length,
    "mreža ima vrstico za vsakega zaposlenega");

  console.log("2) »Predlagaj mesec« najde vrzeli in jih ponudi v potrditev");
  // Od preureditve Generatorja (september 2026) je "Predlagaj mesec" v
  // ZLOŽLJIVEM razdelku pod mrežo: naslov razdelka nosi isto besedilo kot
  // gumb v njem, zato je treba razdelek najprej odpreti - klik na naslov
  // sicer samo razgrne vsebino in gumb ostane nepritisnjen.
  const glava = await stran.$('.zlozljiv .glava:has-text("Predlagaj mesec")');
  trdi(!!glava, "razdelek »Predlagaj mesec« je na strani");
  if (glava && (await glava.getAttribute("aria-expanded")) !== "true") {
    await glava.click();
    await stran.waitForTimeout(400);
  }
  const gumbPredlagaj = await stran.$('.zlozljiv .vsebina button:has-text("Predlagaj mesec")');
  trdi(!!gumbPredlagaj, "in v njem gumb za predlaganje");
  await gumbPredlagaj.click();
  await stran.waitForTimeout(800);
  // Iz vsake postavke se preberejo trije podatki ločeno (datum, oseba,
  // šifra) - opozorilo pod njo je svoj element in ne sme zaiti v šifro.
  const postavke = await stran.$$eval(".card label", e => e
    .filter(x => /→/.test(x.textContent))
    .map(x => {
      const krepko = [...x.querySelectorAll("b")].map(b => b.textContent.trim());
      const brezOpozorila = [...x.querySelectorAll("span")]
        .map(s => s.firstChild && s.firstChild.nodeType === 3 ? s.textContent : "")[0] || x.textContent;
      const oseba = (brezOpozorila.split("·")[2] || "").split("→")[0].trim();
      return { datum: krepko[0], oseba, sifra: krepko[krepko.length - 1] };
    }));
  trdi(postavke.length > 0, "predlogi so se izpisali (" + postavke.length + ")");
  trdi(!!(postavke[0] && postavke[0].oseba && postavke[0].sifra),
    "prvi predlog: " + JSON.stringify(postavke[0]));

  console.log("3) nič ne gre v razpored brez potrditve");
  const oznaceni = await stran.$$eval(".card input[type=checkbox]", e => e.filter(x => x.checked).length);
  trdi(oznaceni === 0, "noben predlog ni vnaprej označen");
  const gumbVnesi = await stran.$('button:has-text("Vnesi potrjene")');
  trdi(await gumbVnesi.isDisabled(), "gumb »Vnesi potrjene« je onemogočen, dokler nič ni potrjeno");

  console.log("4) potrjeni predlog pristane v mreži");
  const { oseba, sifra, datum } = postavke[0];
  // Stanje PRED vnosom - da se vidi, da je vnos res spremenil celico, ne da
  // je bila ta šifra tam že prej (sicer bi preizkus uspel po naključju).
  const vrsticaPred = await stran.$(`.wardTable tbody tr:has-text("${oseba}")`);
  const dan = Number(datum.split(".")[0]) - 1;
  const predVnosom = (await vrsticaPred.$$eval("input", e => e.map(x => x.value)))[dan];
  trdi(predVnosom !== sifra, `celica je bila prej prazna oz. druga ("${predVnosom}")`);

  await stran.click(".card input[type=checkbox]");     // potrdi prvega
  await stran.click('button:has-text("Vnesi potrjene")');
  await stran.waitForTimeout(600);
  const vrstica = await stran.$(`.wardTable tbody tr:has-text("${oseba}")`);
  const vrednosti = await vrstica.$$eval("input", e => e.map(x => x.value));
  trdi(vrednosti[dan] === sifra,
    `${oseba} ima zdaj ${datum} v mreži izmeno "${sifra}" (dobil: "${vrednosti[dan]}")`);
  const poVnosu = await stran.$$eval(".card label",
    e => e.map(x => x.textContent).filter(t => /→/.test(t)));
  trdi(poVnosu.length === postavke.length - 1,
    "vnesen predlog izgine iz seznama (ostalo: " + poVnosu.length + ")");

  if (process.env.POSNETEK) await stran.screenshot({ path: process.env.POSNETEK });
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
