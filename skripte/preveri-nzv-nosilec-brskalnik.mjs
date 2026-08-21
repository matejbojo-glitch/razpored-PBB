#!/usr/bin/env node
/* Preizkus prikaza "NZV – nosilec oddelka" na OBEH straneh, v pravem
 * brskalniku: Razpored → Po oddelkih (index.html) in Imenik →
 * Razpredelnica (imenik.html).
 *
 * Pravilo preverja preveri-nzv-nosilec-oddelka.mjs. Tu gre za to, ali
 * uporabnik to res VIDI: da je Salkić pod C1 na navadne dni, na dan njenega
 * dopusta pa je tam Arnež — in da se Lunar tisti dan pojavi tako pod B kot
 * pod C.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-nzv-nosilec-brskalnik.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4197;
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
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(readFileSync(dat));
});
await new Promise(r => streznik.listen(VRATA, r));

// 5. 10. 2026 je ponedeljek; Salkić je tisti dan na dopustu.
const DAN_DOPUSTA = "2026-10-05";
const PROFILI = [
  { id: "s1", full_name: "Kovač Ana", role: "user", department_code: "C1" },
  { id: "s2", full_name: "Novak Bine", role: "user", department_code: "C" },
  { id: "s3", full_name: "Mlakar Eva", role: "user", department_code: "B" },
  { id: "v1", full_name: "Salkić Maruša", role: "vodja", department_code: "NZV" },
  { id: "v2", full_name: "Arnež Grega", role: "vodja", department_code: "NZV" },
  { id: "v3", full_name: "Lunar Petra", role: "vodja", department_code: "NZV" },
];
const VODJE = [
  { full_name: "Salkić Maruša", inicialke: "SAL", enote: "C1" },
  { full_name: "Arnež Grega", inicialke: "ARN", enote: "C" },
  { full_name: "Lunar Petra", inicialke: "LUN", enote: "B" },
];
const PARI = [
  { nosilec: "Salkić Maruša", nadomesca: "Arnež Grega", enota: "C1", prednost: 1 },
  { nosilec: "Arnež Grega", nadomesca: "Lunar Petra", enota: "C", prednost: 1 },
];
const DOPUST = [{ full_name: "Salkić Maruša", work_date: DAN_DOPUSTA, kind: "ld" }];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const odpri = async (naslov) => {
    const stran = await brskalnik.newPage({ viewport: { width: 1500, height: 1000 } });
    const konzola = [];
    stran.on("pageerror", e => konzola.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
    await stran.addInitScript(({ profili, vodje, pari, dopust }) => {
      const tabele = { profiles: profili, lead_departments: vodje, nadomescanja: pari,
        leave_entries: dopust, schedule_entries: [], menjave_javno: [],
        departments: [{ code: "C1", name: "C1" }, { code: "C", name: "C" }, { code: "B", name: "B" }] };
      const poizvedba = (v) => {
        const filtri = [];
        const b = new Proxy({}, { get(_, n) {
          if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
          if (n === "then") return (nx) => Promise.resolve({
            data: v.filter(r => filtri.every(([k, x]) => r[k] === x)), error: null }).then(nx);
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
            const seja = { session: { user: { id: "s1" } },
              profile: { id: "s1", role: "admin", full_name: "Kovač Ana", department_code: "C1" }, ogled: false };
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
    }, { profili: PROFILI, vodje: VODJE, pari: PARI, dopust: DOPUST });
    await stran.goto(`http://127.0.0.1:${VRATA}${naslov}`, { waitUntil: "load" });
    return { stran, konzola };
  };

  console.log("1) Razpored → Po oddelkih: stolpec NZV");
  const { stran, konzola } = await odpri("/index.html");
  await stran.waitForTimeout(1200);
  await stran.click("text=Po oddelkih");
  await stran.waitForSelector(".wardTable", { timeout: 15000 });
  // Mesec prestavi na oktober 2026. Izbirnik sta DVA spustna seznama
  // (mesec + leto), ne polje type="month" - brez tega je preizkus gledal
  // tekoči mesec in bi "uspel" tudi, če bi bil nosilec vedno isti.
  await stran.selectOption("#ySel", "2026");
  await stran.selectOption("#mmSel", "10");
  await stran.waitForTimeout(1500);
  const prikazanDatum = await stran.$eval(".wardTable tbody tr td.name", e => e.textContent.trim());
  trdi(/10\.2026/.test(prikazanDatum), "prikazan je oktober 2026: " + prikazanDatum);

  const nzvGlava = await stran.$$("th.nzvStolpec");
  trdi(nzvGlava.length > 0, "stolpec NZV je v glavi");
  const vrsticaZaDan = async (iso) => {
    const dan = Number(iso.slice(8, 10));
    return stran.$(`.wardTable tbody tr:nth-child(${dan})`);
  };
  const nosilecNa = async (iso) => {
    const vrstica = await vrsticaZaDan(iso);
    if (!vrstica) return null;
    const celica = await vrstica.$("td.nzvStolpec");
    return celica ? (await celica.innerText()).trim() : null;
  };
  trdi(/Salkić/.test(await nosilecNa("2026-10-06") || ""),
    "6. 10. je za C1 zadolžena Salkić: " + await nosilecNa("2026-10-06"));
  trdi(/Arnež/.test(await nosilecNa(DAN_DOPUSTA) || ""),
    "5. 10. (dopust) je za C1 zadolžen Arnež: " + await nosilecNa(DAN_DOPUSTA));
  trdi(!/Salkić/.test(await nosilecNa(DAN_DOPUSTA) || ""),
    "in odsotne Salkić tisti dan tam ni");
  if (process.env.POSNETEK) await stran.screenshot({ path: process.env.POSNETEK });
  await stran.close();

  console.log("2) Imenik → Razpredelnica: nosilci pod oddelčnim kadrom");
  const preveriOddelek = async (koda, pricakovanNaDopust) => {
    const { stran: i, konzola: k } = await odpri("/imenik.html");
    // Razpredelnica je zavihek - najprej ga je treba odpreti.
    await i.waitForSelector('button:has-text("Razpredelnica")', { timeout: 15000 });
    await i.click('button:has-text("Razpredelnica")');
    await i.waitForSelector("#stanjeOddelek", { timeout: 15000 });
    await i.selectOption("#stanjeOddelek", koda);
    await i.fill("#stanjeMesec", "2026-10");
    await i.waitForTimeout(1500);
    const locnica = await i.$(".nzvLocnica");
    trdi(!!locnica, `${koda}: ločnica »NZV – nosilec oddelka« je v tabeli`);
    const imena = await i.$$eval("tr.nzvLocnica ~ tr td.name a", e => e.map(x => x.textContent.trim()));
    trdi(imena.includes(pricakovanNaDopust),
      `${koda}: med nosilci je ${pricakovanNaDopust} (dobil: ${JSON.stringify(imena)})`);
    const napakeK = k.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(napakeK.length === 0, `${koda}: brez napak v konzoli` + (napakeK.length ? ": " + napakeK.join(" | ") : ""));
    await i.close();
    return imena;
  };
  // C1: na dan dopusta ga pokriva Arnež, zato mora biti na seznamu.
  const c1 = await preveriOddelek("C1", "Arnež Grega");
  trdi(c1.includes("Salkić Maruša"), "C1: Salkić je na seznamu za ostale dni");
  // C: tisti dan ga prevzame Lunar - ista oseba je hkrati pod B in pod C.
  const c = await preveriOddelek("C", "Lunar Petra");
  trdi(c.includes("Arnež Grega"), "C: Arnež je na seznamu za ostale dni");
  const b = await preveriOddelek("B", "Lunar Petra");
  trdi(b.length === 1, "B: nosilec je samo Lunar (" + JSON.stringify(b) + ")");

  const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli na razporedu" + (prave.length ? ": " + prave.join(" | ") : ""));
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
