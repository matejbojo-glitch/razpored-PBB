#!/usr/bin/env node
/* Postavitev strani Razpored na ŠIROKEM zaslonu (uporabnikove zahteve,
 * september 2026, podprte s posnetkom zaslona):
 *
 *   1. vsi izbirniki so v ENI vrstici - oddelek, nato mesec; pri "Moj
 *      razpored" je v isti vrstici tudi današnja izmena;
 *   2. izbirnik meseca je KOLEDARSKI (input type="month") na vseh straneh -
 *      prej sta bila v index.html dva spustna seznama (mesec + leto), edina
 *      taka na vsej aplikaciji;
 *   3. Razpredelnica je brez naslova in uvodnega odstavka, legenda kratic
 *      pa stoji v isti vrstici kot izbirnika;
 *   4. cel mesec gre v ŠIRINO ENE STRANI - ne razpredelnica ne NZV mreža ne
 *      smeta vodoravno drseti;
 *   5. NZV mreža drsi znotraj SVOJEGA okvirja, da glava (enote) med
 *      popravljanjem celic ostane vidna in ne prekrije izbirnika meseca.
 *
 * Zakaj v brskalniku: vse to so MERE (višina glave, širina tabele, ali sta
 * dva elementa v isti vrstici). Iz izvorne kode se ne vidijo - prav zato je
 * uporabnik napake javljal s posnetki zaslona.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-krmilna-vrstica.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4287;
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
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

console.log("1) izbirnik meseca je koledarski na VSEH straneh (nikjer spustni seznam mesecev)");
{
  // Uporabnikova zahteva: "ta koledarski pogled dodaj povsod v aplikaciji".
  // Preverjamo IZVORNO kodo vseh strani, ne le tiste, ki jo odpremo -
  // drugače bi nova stran spet dobila svoj drugačen izbirnik.
  const strani = readdirSync(koren).filter(d => d.endsWith(".html"));
  const zMesecem = strani.filter(d => /mesec|month/i.test(readFileSync(join(koren, d), "utf8")));
  const brezKoledarja = zMesecem.filter(d => {
    const src = readFileSync(join(koren, d), "utf8");
    // Stran ima izbirnik meseca, če ponuja izbiro meseca uporabniku.
    const ponujaIzbiro = /MESECI(_SL)?\.map|type="month"/.test(src);
    if (!ponujaIzbiro) return false;
    return !/type="month"/.test(src);
  });
  eq(brezKoledarja.join(", "), "", "nobena stran nima samo spustnega seznama mesecev");
  // In konkretno tam, kjer sta bila prej dva spustna seznama.
  const index = readFileSync(join(koren, "index.html"), "utf8");
  trdi(!/id="ySel"/.test(index), "ločenega spustnega seznama za LETO v index.html ni več");
  trdi(/id="mmSel" type="month"/.test(index), "mesec v index.html je koledarsko polje");
  const zelje = readFileSync(join(koren, "zelje.html"), "utf8");
  trdi(/id="zeljeMesec" className="mesecIzbirnik" type="month"/.test(zelje),
    "Želje so dobile isti koledarski izbirnik (prej samo puščici ‹ ›)");
}

const streznik = http.createServer((z, o) => {
  const pot = decodeURIComponent(z.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "/index.html" : pot);
  if (!dat.startsWith(koren) || !existsSync(dat) || statSync(dat).isDirectory()) { o.writeHead(404); return o.end("404"); }
  let v = readFileSync(dat);
  if (extname(dat) === ".html") v = prevediJsxVHtmlu(v.toString("utf8"));
  o.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  o.end(v);
});
await new Promise(r => streznik.listen(VRATA, r));

// Mesec izpeljemo iz današnjega dne - stran se odpre na tekočem mesecu.
const zdaj = new Date();
const MESEC = zdaj.getFullYear() + "-" + String(zdaj.getMonth() + 1).padStart(2, "0");
const dan = (n) => MESEC + "-" + String(n).padStart(2, "0");

// 15 NZV vodij, vsak s svojo enoto - mreža ima tako vseh 18 enot + DEŽ +
// LD/IZOB/BS, se pravi najširši primer, kakršen je v resnici.
const ENOTE = ["PDZN","SOBO","ŽO","E1","E2","D","MO","B","C","C1","PO","A","B1,B2","DB","URGENCA"];
const IMENA = ["Džamastagić Denis","Bojić Matej","Alukić Dino","Trpin Saša","Lunar Mateja",
  "Šubic Petra","Torkar Tanja","Velušček Metka","Salkić Maruša","Hrovat Nina","Tomaževič Simona",
  "Mavri Tratnik Magdalena","Perviz Amal","Arnež Grega","Maglić Aleksander"];
const PROFILI = [
  ...ENOTE.map((e, i) => ({ id: "n" + i, full_name: IMENA[i], role: i < 3 ? "admin" : "vodja",
    department_code: "NZV", parafa: null })),
  ...["Svetina Sabina","Rejc Jana","Bizjak Tea","Bratuša Marija","Burnar Sara",
      "Dolar Tomaž","Džinić Amin","Maler Antonina","Meglič Jaka","Miljkovič Maja"]
    .map((ime, i) => ({ id: "o" + i, full_name: ime, role: "user", department_code: "C1", parafa: null })),
];
const NOSILCI = ENOTE.map((e, i) => ({ full_name: IMENA[i], department_code: "NZV", enote: e,
  role: i < 3 ? "admin" : "vodja" }));
// Oddelčni kader dobi izmene za CEL mesec. Brez tega so celice dni skoraj
// prazne in razpredelnica gre v širino tudi brez popravka - preizkus bi
// varoval nekaj, česar ne bi znal ujeti (preverjeno s pastjo).
const VPISI = [{ employee_id: "n0", work_date: dan(1), shift_code: "Dopoldne", department_code: "NZV" }];
const IZMENE_C1 = ["Dopoldne", "Popoldne", "Nočna 12", "Dnevna 12", "Popoldne do 19"];
for (let d = 1; d <= 28; d++) {
  PROFILI.filter(p => p.department_code === "C1").forEach((p, i) => {
    VPISI.push({ employee_id: p.id, work_date: dan(d),
      shift_code: IZMENE_C1[(d + i) % IZMENE_C1.length], department_code: "C1" });
  });
}

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1536, height: 864 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  await stran.addInitScript(({ profili, nosilci, vpisi }) => {
    const tabele = { profili, razpored: vpisi, nosilci_oddelkov: nosilci, nadomescanja: [],
      dezurni_zdravniki: [], menjave_javno: [], odsotnosti: [], obrazci: [], nzv_nastavitve: [],
      pokriva_oddelek: [], barvne_oznake: [],
      oddelki: [{ code:"C1", name:"C1 – oddelek" }, { code:"NZV", name:"NZV vodje" }] };
    const poizvedba = (v) => {
      const filtri = [];
      const b = new Proxy({}, { get(_, n) {
        if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
        if (n === "then") return (nx) => Promise.resolve({
          data: v.filter(r => filtri.every(([k, x]) => r[k] === x))
            .map(r => (r.employee_id && !r.profili
              ? Object.assign({}, r, { profili: profili.find(p => p.id === r.employee_id) || null }) : r)),
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
          const seja = { session: { user: { id: "n0" } },
            profile: { id: "n0", role: "admin", full_name: "Džamastagić Denis", department_code: "NZV" },
            ogled: false };
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
  }, { profili: PROFILI, nosilci: NOSILCI, vpisi: VPISI });

  await stran.goto(`http://127.0.0.1:${VRATA}/index.html`, { waitUntil: "load" });
  await stran.waitForSelector(".segIkone button", { timeout: 20000 });
  await stran.waitForTimeout(900);

  // "V isti vrstici" pomeni: elementa se navpično PREKRIVATA. Primerjava
  // samih vrhov bi padla ob najmanjši razliki v poravnavi.
  const istaVrstica = (a, b) => stran.evaluate(([x, y]) => {
    const p = document.querySelector(x), q = document.querySelector(y);
    if (!p || !q) return null;
    const r = p.getBoundingClientRect(), t = q.getBoundingClientRect();
    return r.bottom > t.top + 4 && t.bottom > r.top + 4;
  }, [a, b]);

  console.log("2) Moj razpored: današnja izmena je v ISTI vrstici kot mesec");
  trdi((await stran.$$(".ctrlRow")).length === 1, "pas krmil je natanko eden");
  trdi(!!(await stran.$(".ctrlRow .danesCip")), "današnja izmena je v pasu krmil");
  trdi(await istaVrstica(".ctrlRow #mmSel", ".ctrlRow .danesCip"),
    "izbirnik meseca in današnja izmena sta v isti vrstici");
  trdi((await stran.$$(".todayCard")).length === 0,
    "stare velike kartice 'Danes' pod krmili ni več (podatek je zgoraj)");
  const danes = (await stran.innerText(".ctrlRow .danesCip")).replace(/\s+/g, " ");
  trdi(/DANES/i.test(danes), "v njej piše, za kateri dan gre: " + danes);

  console.log("3) Oddelki: oddelek in mesec v isti vrstici");
  await stran.click('.segIkone button:has-text("Oddelki")');
  await stran.waitForTimeout(900);
  trdi(await istaVrstica(".ctrlRow #wd", ".ctrlRow #mmSel"),
    "izbirnika oddelka in meseca sta v isti vrstici");
  trdi((await stran.$$(".ctrlRow .danesCip")).length === 0,
    "današnje izmene tu ni – ni pogled 'Moj razpored'");

  console.log("4) NZV: mreža gre v širino ene strani in drsi v svojem okvirju");
  await stran.selectOption("#wd", "NZV");
  await stran.waitForSelector(".wardTableNzv", { timeout: 15000 });
  await stran.waitForTimeout(900);
  trdi(await istaVrstica(".ctrlRow #wd", ".ctrlRow #mmSel"),
    "tudi pri NZV sta izbirnika v isti vrstici");
  const mera = async () => stran.evaluate(() => {
    const t = document.querySelector(".wardTableNzv");
    const okvir = t.closest(".wardScroller");
    const glava = document.querySelector("header.top");
    return {
      drsi: okvir.scrollWidth > okvir.clientWidth + 1,
      stranDrsi: document.documentElement.scrollWidth > window.innerWidth + 1,
      vOkvirju: okvir.classList.contains("vOkvirju")
        && getComputedStyle(okvir).overflowY !== "visible",
      visinaGlave: Math.round(glava.getBoundingClientRect().height),
      vrhTabele: Math.round(t.closest(".wardScroller").getBoundingClientRect().top),
      odrezanDatum: (() => {
        const c = t.querySelector("tbody td.name");
        return c.scrollWidth > c.clientWidth + 1;
      })(),
    };
  });
  const m1 = await mera();
  trdi(!m1.drsi, "mreža se vidi cela, brez vodoravnega vlečenja");
  trdi(!m1.stranDrsi, "in stran ne sili v vodoravno drsenje");
  trdi(m1.vOkvirju, "mreža drsi znotraj svojega okvirja (glava ostane vidna)");
  trdi(!m1.odrezanDatum, "stolpec z datumom ni odrezan (prej '1.9.2026 …')");
  // Glava strani se je prej pri NZV raztegnila na ~320 px (trije bloki
  // krmil pod sabo) in mreža je začela šele pod prvim zaslonom.
  trdi(m1.visinaGlave < 270, `glava strani je nizka (${m1.visinaGlave} px < 270)`);

  console.log("5) NZV urejanje: mreža ostane na eni strani tudi z vnosnimi polji");
  await stran.click('button:has-text("Uredi razpored")');
  await stran.waitForTimeout(900);
  trdi((await stran.$$(".wardTableNzv input")).length > 0, "celice so postale vnosna polja");
  const m2 = await mera();
  trdi(!m2.drsi, "tudi med urejanjem se mreža vidi cela");
  trdi(!m2.stranDrsi, "in stran ne sili v vodoravno drsenje");
  // Nastavitve SA so uporabne SAMO med urejanjem - zato so prej po nepotrebnem
  // jemale vrstico tudi navadnemu pregledu.
  trdi((await stran.$$(".saNastavitve")).length === 1, "nastavitve SA so vidne med urejanjem");
  await stran.click('button:has-text("Končaj urejanje")');
  await stran.waitForTimeout(700);
  trdi((await stran.$$(".saNastavitve")).length === 0, "in skrite, ko urejanja ni");

  console.log("6) Razpredelnica: brez naslova in odstavka, legenda v isti vrstici, cel mesec v širino");
  await stran.click('.segIkone button:has-text("Razpredelnica")');
  await stran.waitForSelector(".razpPolna", { timeout: 15000 });
  await stran.waitForTimeout(900);
  const telo = (await stran.innerText("body")).replace(/\s+/g, " ");
  trdi(!/Razpredelnica stanja/.test(telo), "naslova 'Razpredelnica stanja' ni več");
  trdi(!/Kdo je na dani dan na delu, na dežurstvu/.test(telo),
    "uvodnega odstavka nad tabelo ni več");
  trdi(await istaVrstica(".ctrlRow #stanjeMesec", ".ctrlRow .legendaGumb"),
    "legenda kratic je v isti vrstici kot izbirnik meseca");
  trdi(await istaVrstica(".ctrlRow #stanjeOddelek", ".ctrlRow .legendaGumb"),
    "in kot izbirnik oddelka");
  const r = await stran.evaluate(() => {
    const t = document.querySelector(".razpPolna");
    const okvir = t.closest(".tableScroller");
    const dniVMesecu = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    return {
      drsi: okvir.scrollWidth > okvir.clientWidth + 1,
      stolpcev: t.querySelectorAll("thead th").length,
      dniVMesecu,
      zadnji: (t.querySelector("thead th:last-child") || {}).textContent.trim(),
    };
  });
  trdi(!r.drsi, "cela razpredelnica gre v širino ene strani, brez vodoravnega vlečenja");
  eq(r.stolpcev, r.dniVMesecu + 1, `ime + vsi ${r.dniVMesecu} dnevi meseca`);
  eq(r.zadnji, String(r.dniVMesecu), "zadnji stolpec je zadnji dan meseca");
  // Vsebina odstavka ni izgubljena - preselila se je v legendo.
  await stran.click(".legendaGumb");
  await stran.waitForTimeout(500);
  trdi(/Združuje objavljen razpored in vpise iz Želja/.test(
    (await stran.innerText("body")).replace(/\s+/g, " ")),
    "pojasnilo iz odstavka je zdaj v legendi, ne izgubljeno");

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
