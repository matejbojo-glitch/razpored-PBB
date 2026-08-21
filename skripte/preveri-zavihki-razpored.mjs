#!/usr/bin/env node
/* Preizkus prve strani Razporeda po preureditvi (avgust 2026):
 * štirje zavihki — Moj razpored | Oddelki | Razpredelnica | Dežurstvo.
 *
 * Kaj se tu varuje:
 *  - na telefonu so zavihki ikona + drobna beseda (štiri polne besede ne
 *    gredo v vrstico), na širokem zaslonu pa ostanejo besedni — uporabnik
 *    je izrecno rekel: "spletna verzija ostane tako kot je";
 *  - Razpredelnica je PRENESENA iz Imenika, torej je v Imeniku NI več
 *    (prenos, ne kopija — dve mesti bi se sčasoma razšli);
 *  - Dežurstvo je cel obrazec uradnega dokumenta s tremi krogi, negovalni
 *    kader pa se bere iz OBJAVLJENEGA razporeda, da so potrjene menjave
 *    upoštevane. Uradni PDF je samo rezerva za še neobjavljene dneve.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-zavihki-razpored.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4202;
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

console.log("1) Razpredelnica je iz Imenika res PRENESENA, ne podvojena");
{
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const index = readFileSync(join(koren, "index.html"), "utf8");
  trdi(!/function StanjeRazpredelnica/.test(imenik), "v imenik.html komponente ni več");
  trdi(!/pogled==="stanje"/.test(imenik), "in tudi zavihka ne");
  trdi(/function StanjeRazpredelnica/.test(index), "v index.html je");
  // Stara tabela zdravnikov pod mrežo NZV je nadomeščena z zavihkom
  // Dežurstvo; če bi ostala, bi isti podatek stal na dveh mestih, eno od
  // njiju pa brez upoštevanih menjav.
  trdi(!/DezurstvaZdravnikiTabela/.test(index), "stara tabela zdravnikov pod NZV je odstranjena");
  trdi(/function DezurstvoPregled/.test(index), "namesto nje je zavihek Dežurstvo");
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

const PROFILI = [
  { id: "s1", full_name: "Kovač Ana", role: "user", department_code: "C1" },
  { id: "v1", full_name: "Salkić Maruša", role: "vodja", department_code: "NZV" },
  { id: "v2", full_name: "Arnež Grega", role: "vodja", department_code: "NZV" },
];
// 5. 8.: razpored JE objavljen (dežurna Salkić) in uradni PDF trdi nekaj
// drugega -> obvelja objava. 6. 8.: objave NI -> obvelja PDF, označen z *.
const VPISI = [
  { employee_id: "v1", work_date: "2026-08-05", shift_code: "DEŽURSTVO" },
  { employee_id: "v2", work_date: "2026-08-05", shift_code: "Dopoldne" },   // ni dežurstvo
];
const ZDRAVNIKI = [
  { work_date: "2026-08-05", kind: "urgenca", full_name: "dr. Novak" },
  { work_date: "2026-08-05", kind: "dezurstvo", full_name: "dr. Kos" },
  { work_date: "2026-08-05", kind: "sestra", full_name: "Nekdo Drug" },
  { work_date: "2026-08-06", kind: "sestra", full_name: "Arnež Grega" },
];
const MENJAVE = [{ vlagatelj_id: "v1", sodelavec_id: "v2", datum_a: "2026-08-05", datum_b: "2026-08-12" }];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const odpri = async (sirina, visina) => {
    const stran = await brskalnik.newPage({ viewport: { width: sirina, height: visina } });
    const konzola = [];
    stran.on("pageerror", e => konzola.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
    await stran.addInitScript(({ profili, vpisi, zdravniki, menjave }) => {
      const tabele = { profiles: profili, schedule_entries: vpisi, duty_doctors: zdravniki,
        menjave_javno: menjave, departments: [{ code: "C1", name: "C1" }],
        lead_departments: [], nadomescanja: [], leave_entries: [], obrazci: [] };
      const poizvedba = (v) => {
        const filtri = [];
        const b = new Proxy({}, { get(_, n) {
          if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
          if (n === "then") return (nx) => Promise.resolve({
            data: v.filter(r => filtri.every(([k, x]) => r[k] === x))
              .map(r => (r.employee_id && !r.profiles
                ? Object.assign({}, r, { profiles: profili.find(p => p.id === r.employee_id) || null })
                : r)),
            error: null }).then(nx);
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
    }, { profili: PROFILI, vpisi: VPISI, zdravniki: ZDRAVNIKI, menjave: MENJAVE });
    await stran.goto(`http://127.0.0.1:${VRATA}/index.html`, { waitUntil: "load" });
    await stran.waitForSelector(".segIkone button", { timeout: 15000 });
    await stran.waitForTimeout(700);
    return { stran, konzola };
  };

  console.log("2) telefon: štirje zavihki, ikona + drobna beseda");
  const { stran: tel, konzola: konzolaTel } = await odpri(412, 915);
  eq((await tel.$$(".segIkone button")).length, 4, "štirje zavihki");
  eq(await tel.$$eval(".segIkone .segKratko", e => e.map(x => x.textContent)),
    ["Moj", "Oddelki", "Razpredelnica", "Dežurstvo"], "in v naročenem vrstnem redu");
  const vidno = (sel) => tel.$eval(sel, e => getComputedStyle(e).display !== "none");
  trdi(await vidno(".segIkone .segIkona"), "ikona je na telefonu vidna");
  trdi(await vidno(".segIkone .segKratko"), "drobna beseda pod njo tudi");
  trdi(!(await vidno(".segIkone .segNaziv")), "polno besedilo je na telefonu skrito");
  // Vrstica se ne sme prelomiti ali siliti v vodoravno drsenje.
  const sirinaTel = await tel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  trdi(sirinaTel, "nič ne sili v vodoravno drsenje");
  await tel.close();

  console.log("3) širok zaslon ostane besedni (izrecna zahteva)");
  const { stran: web } = await odpri(1400, 950);
  const vidnoW = (sel) => web.$eval(sel, e => getComputedStyle(e).display !== "none");
  trdi(await vidnoW(".segIkone .segNaziv"), "polna imena so vidna");
  trdi(!(await vidnoW(".segIkone .segIkona")), "ikone so skrite");
  trdi(!(await vidnoW(".segIkone .segKratko")), "in okrajšave tudi");
  eq(await web.$$eval(".segIkone .segNaziv", e => e.map(x => x.textContent)),
    ["Moj razpored", "Oddelki", "Razpredelnica", "Dežurstvo"], "besedilo je nespremenjeno");
  await web.close();

  console.log("4) zavihek Dežurstvo: trije krogi uradnega dokumenta");
  const { stran, konzola } = await odpri(1400, 950);
  await stran.click('.segIkone button:has-text("Dežurstvo")');
  await stran.waitForSelector(".dezTabela", { timeout: 15000 });
  eq(await stran.$$eval(".dezTabela thead th .dezDatumPoln, .dezTabela thead th.name",
    e => e.map(x => x.textContent.trim())),
    ["Dan", "Urgenca ZDR", "Dežurstvo ZDR", "Dežurstvo dipl. m.s./zn."], "glave po uradnem dokumentu");
  const vrstica = async (iso) => {
    const dan = Number(iso.slice(8, 10));
    return stran.$eval(`.dezTabela tbody tr:nth-child(${dan})`, e => e.innerText.replace(/\s+/g, " ").trim());
  };
  const peti = await vrstica("2026-08-05");
  trdi(/dr\. Novak/.test(peti), "zdravnik urgence: " + peti);
  trdi(/dr\. Kos/.test(peti), "dežurni zdravnik je izpisan");

  console.log("5) menjave dežurstev se upoštevajo (DMS/DZN)");
  // Objavljen razpored pravi Salkić, uradni PDF pa "Nekdo Drug". Ker je
  // menjava dežurstva v razporedu že izvedena, mora obveljati razpored -
  // sicer bi aplikacija kazala, kdo bi MORAL dežurati, ne kdo dežura.
  trdi(/Salkić/.test(peti), "dežurna sestra je iz OBJAVLJENEGA razporeda: " + peti);
  trdi(!/Nekdo Drug/.test(peti), "in ne iz uradnega PDF-ja, ki je zastarel");
  trdi(/↔/.test(peti), "zamenjani dan je označen z ↔");
  // Dan brez objave: PDF je rezerva, označena z *, da se ve, od kod je.
  const sesti = await vrstica("2026-08-06");
  trdi(/Arnež/.test(sesti), "dan brez objave vzame ime iz uradnega dokumenta: " + sesti);
  trdi(/\*/.test(sesti), "in ga označi z *");
  // Kdor tisti dan dela navadno izmeno, ni dežuren.
  trdi(!/Arnež/.test(peti), "oseba z navadno izmeno ni v stolpcu dežurstva");

  console.log("6) zavihek Razpredelnica se izriše");
  await stran.click('.segIkone button:has-text("Razpredelnica")');
  await stran.waitForTimeout(1200);
  trdi(/Razpredelnica stanja/.test(await stran.innerText("body")), "naslov je na strani");
  trdi((await stran.$$("#stanjeMesec")).length === 1, "s svojim izbirnikom meseca");
  trdi((await stran.$$("#mmSel")).length === 0, "zgornji izbirnik meseca je takrat skrit (ne bi si nasprotovala)");

  const prave = [...konzola, ...konzolaTel]
    .filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
