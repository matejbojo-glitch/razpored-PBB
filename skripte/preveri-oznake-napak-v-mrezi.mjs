#!/usr/bin/env node
/* Preizkus: opozorila generatorja so vidna V MREŽI, ne samo v seznamu nad njo.
 *
 * ZAKAJ
 * Koordinator je doslej prebral "14. 10. 2026: Rozman Anka: omejitev na ta
 * dan …" in nato z očmi iskal, kateri od 31 stolpcev je 14. in katera od
 * vrstic je Rozman. Uporabnikova zahteva (september 2026): dan z napako
 * mora biti rdeč že v glavi tabele, prizadeta celica mora imeti rdečo
 * obrobo in značko, lebdenje mora pokazati natančno besedilo, klik na
 * opozorilo v seznamu pa mora celico osvetliti.
 *
 * KAKO
 * Vsem zaposlenim se v Željah (odsotnosti.kind="omejitev") vpiše omejitev
 * na ISTI dan. Nadomestila zato ni mogoče najti (kandidat z omejitvijo je
 * izločen), generator opozori - in samo TA dan sme biti v tabeli označen.
 * Preizkus zato ne more uspeti po naključju: če bi bili označeni vsi dnevi
 * ali noben, pade.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-oznake-napak-v-mrezi.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4199;
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

const MESEC = "2026-10";
const DAN = "2026-10-14";          // sreda - navaden delovni dan sredi meseca
const STEVILKA_DNEVA = 14;
const PROFILI = [
  { id: "p1", full_name: "Rozman Anka", rotation_slot: "A" },
  { id: "p2", full_name: "Novak Bine", rotation_slot: "B" },
  { id: "p3", full_name: "Zupan Cilka", rotation_slot: "C" },
  { id: "p4", full_name: "Horvat Dani", rotation_slot: "D" },
];
// Omejitev za VSE isti dan: kdor bi lahko nadomeščal, je tudi sam omejen.
const ODSOTNOSTI = PROFILI.map(p => ({ full_name: p.full_name, work_date: DAN, kind: "omejitev" }));

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1500, height: 1000 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });

  await stran.addInitScript(({ profili, odsotnosti }) => {
    const tabele = { profili: profili, minimalna_zasedba: [], odsotnosti: odsotnosti,
      razpored: [], oddelki: [], kadrovski_podatki: [] };
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
  }, { profili: PROFILI, odsotnosti: ODSOTNOSTI });

  console.log("1) mreža se izriše, generator javi omejitev brez nadomestila");
  await stran.goto(`http://127.0.0.1:${VRATA}/admin.html?tab=kalup&oddelek=B&mesec=${MESEC}`, { waitUntil: "load" });
  await stran.waitForSelector("#odd", { timeout: 15000 });
  await stran.click("text=Generiraj takoj");
  await stran.waitForSelector(".wardTable tbody tr", { timeout: 15000 });
  trdi((await stran.$$(".wardTable tbody tr")).length === PROFILI.length,
    "mreža ima vrstico za vsakega zaposlenega");

  console.log("2) glava stolpca z napako je rdeča – in samo ona");
  const glave = await stran.$$eval(".wardTable thead th:not(.name)", e => e.map(x => ({
    besedilo: x.textContent.trim(),
    napaka: x.classList.contains("napaka"),
    pika: !!x.querySelector(".pika"),
    naslov: x.getAttribute("title") || "",
  })));
  const oznaceneGlave = glave.filter(g => g.napaka);
  trdi(glave.length >= 28, "glava ima stolpec za vsak dan meseca (" + glave.length + ")");
  trdi(oznaceneGlave.length === 1,
    "označen je natanko en dan (" + oznaceneGlave.map(g => g.besedilo).join(", ") + ")");
  trdi(!!oznaceneGlave[0] && oznaceneGlave[0].besedilo.indexOf(String(STEVILKA_DNEVA)) === 0,
    "in to " + STEVILKA_DNEVA + ". (dobil: " + (oznaceneGlave[0] || {}).besedilo + ")");
  trdi(!!oznaceneGlave[0] && oznaceneGlave[0].pika, "ob številki dneva je rdeča pika");
  trdi(!!oznaceneGlave[0] && /omejitev na ta dan/.test(oznaceneGlave[0].naslov),
    "lebdenje pove natančno besedilo napake");

  console.log("3) celica prizadetega zaposlenega je označena");
  // Obroba je na ovoju celice, namig pa na sami celici (<td>) - v celici
  // je od septembra 2026 izbirnik iz uradne legende, ne prosto besedilo.
  const celice = await stran.$$eval(".wardTable td.opozorjena", e => e.map(x => {
    const ovoj = x.querySelector(".celicaOvoj") || x.firstElementChild;
    return {
      kljuc: x.getAttribute("data-celica") || "",
      obroba: ovoj && ovoj.style ? ovoj.style.border : "",
      naslov: x.getAttribute("title") || "",
    };
  }));
  trdi(celice.length > 0, "vsaj ena celica je označena (" + celice.length + ")");
  trdi(celice.every(c => c.kljuc.endsWith("|" + DAN)),
    "vse označene celice so na " + DAN + " (" + celice.map(c => c.kljuc).join(", ") + ")");
  trdi(celice.every(c => /^2px solid/.test(c.obroba)),
    "celica ima izstopajočo 2px obrobo (" + (celice[0] || {}).obroba + ")");
  trdi(celice.every(c => /omejitev na ta dan/.test(c.naslov)),
    "lebdenje nad celico pove besedilo napake");

  console.log("4) klik na opozorilo v seznamu osvetli celico v mreži");
  await stran.click('.statusTrak .znacka:has-text("omejitev brez nadomestila")');
  await stran.waitForSelector(".warnBox", { timeout: 5000 });
  // Namenoma brez waitForSelector na vrstico: če gumbov ni, mora preizkus
  // to POVEDATI kot napako, ne pasti z iztekom časa.
  const vrstice = await stran.$$eval(".warnBox .opozoriloVrstica", e => e.map(x => x.textContent.trim()));
  trdi(vrstice.length === celice.length,
    "seznam ima klikljivo vrstico za vsako označeno celico (" + vrstice.length + ")");
  trdi(!(await stran.$(".wardTable td.poudarjena")), "pred klikom ni nič osvetljeno");
  if (vrstice.length) {
    await stran.click(".warnBox .opozoriloVrstica");
    await stran.waitForTimeout(300);
  }
  const osvetljene = await stran.$$eval(".wardTable td.poudarjena", e => e.map(x => x.getAttribute("data-celica")));
  trdi(osvetljene.length === 1, "po kliku je osvetljena natanko ena celica");
  trdi(osvetljene[0] === (celice[0] || {}).kljuc,
    "in to prav tista iz opozorila (" + osvetljene[0] + ")");

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
