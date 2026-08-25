#!/usr/bin/env node
/* Preizkus združene strani Želje (zelje.html) na PRAVEM izrisu.
 *
 * Zakaj v brskalniku in ne z branjem kode: uporabnik je javil, da je bilo
 * "vse skupaj nepregledno" – razpredelnica dopustov/omejitev in seznam
 * zapisanih želja sta bila DVA ločena zavihka, vsak s svojim izbirnikom
 * oddelka. Isti oddelek je bilo treba izbrati dvakrat, mreža pa je risala
 * vseh osem skupin pod sabo. Da je zdaj res eno samo mesto z eno samo
 * izbiro, se vidi le na izrisani strani, ne v izvorni kodi.
 *
 * Stran se naloži DOBESEDNO taka, kot gre v produkcijo (prek majhnega
 * krajevnega strežnika), zato preizkus ne more zaostati za njo. Podtaknjena
 * sta le prijava (RazporedAuth.requireAuth) in Supabase odjemalec, ker to
 * okolje nima dostopa do žive baze.
 *
 * Zagon:  node skripte/preveri-zelje-postavitev.mjs
 * Če brskalnik ni na privzeti poti:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node skripte/preveri-zelje-postavitev.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4187;

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

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// --- krajevni strežnik: postreže datoteke repozitorija takšne, kot so ---
const TIP = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mjs": "text/javascript",
};
const streznik = http.createServer((req, res) => {
  const pot = decodeURIComponent(req.url.split("?")[0]);
  const f = join(koren, pot === "/" ? "/index.html" : pot);
  if (!f.startsWith(koren) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404); return res.end("404");
  }
  let vsebina = readFileSync(f);
  if (extname(f) === ".html") vsebina = prevediJsxVHtmlu(vsebina.toString("utf8"));
  res.writeHead(200, { "Content-Type": TIP[extname(f)] || "application/octet-stream" });
  res.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

// --- podtaknjeni podatki -------------------------------------------------
// Zupan Meta je kontrolna točka: v NZV mora pasti po VLOGI ("vodja"),
// čeprav ima department_code "PDZN" (stara koda enote). Flek Jure enako
// preverja, da FLEXI ni pozabljen.
const PROFILI = [
  { full_name: "Novak Ana", role: "user", department_code: "B" },
  { full_name: "Kovač Iztok", role: "user", department_code: "C" },
  { full_name: "Flek Jure", role: "user", department_code: "FLEXI" },
  { full_name: "Bojić Matej", role: "admin", department_code: "NZV" },
  { full_name: "Zupan Meta", role: "vodja", department_code: "PDZN" },
];
const ZELJE = [
  { id: 1, department_code: "B", full_name: "Novak Ana", obdobje: "1.–5. 9. 2026", opis: "ZELJA-ODDELKA-B", created_at: "2026-08-01T08:00:00Z", profile_id: "n1", slika: null },
  { id: 2, department_code: "NZV", full_name: "Zupan Meta", obdobje: "10. 9. 2026", opis: "ZELJA-SKUPINE-NZV", created_at: "2026-08-02T08:00:00Z", profile_id: "n2", slika: null },
];

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function odpri(sirina, visina, vloga, pot) {
  const stran = await brskalnik.newPage({ viewport: { width: sirina, height: visina } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  await stran.addInitScript(({ profili, zelje, vloga }) => {
    // Prijavni ovoj bi nas odnesel na login.html, Supabase pa v tem okolju
    // ni dosegljiv. Prestrežemo RazporedAuth, takoj ko ga postavi
    // supabase-client.js, in podtaknemo sejo + odjemalca.
    // Nadomestek PostgREST gradnika poizvedbe: vsaka veriga (.select().eq()
    // .order() ...) vrne sebe, na koncu pa se razrese kot obljuba. Samo .eq
    // res filtrira - to potrebujemo, da seznam zelja dobi zapise SVOJE
    // skupine. Neznane clene (.not, .is, .or ...) prestreze Proxy, da
    // preizkus ne razpade, ko stran doda nov clen.
    const poizvedba = (vrstice) => {
      const filtri = [];
      const cilj = {};
      const b = new Proxy(cilj, {
        get(_, ime) {
          if (ime === "eq") return (k, v) => { filtri.push([k, v]); return b; };
          if (ime === "then") return (naprej) => Promise.resolve({
            data: vrstice.filter(r => filtri.every(([k, v]) => r[k] === v)),
            error: null,
          }).then(naprej);
          if (ime === "insert" || ime === "upsert" || ime === "update") {
            return () => Promise.resolve({ data: [], error: null });
          }
          if (ime === "delete") return () => poizvedba([]);
          if (typeof ime !== "string") return undefined;
          return () => b;
        },
      });
      return b;
    };
    const tabele = {
      profili: profili, zelje_zaposlenih: zelje,
      odsotnosti: [], dnevnik_odsotnosti: [], barvne_oznake: [],
    };
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", {
      configurable: true,
      get() { return pravi; },
      set(v) {
        pravi = v;
        if (v && typeof v === "object") {
          const seja = {
            session: { user: { id: "preizkus", email: "preizkus@example.org" } },
            profile: { id: "preizkus", role: vloga, full_name: "Bojić Matej", department_code: "NZV" },
            ogled: false,
          };
          v.client = {
            from: (t) => poizvedba(tabele[t] || []),
            auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
          };
          v.requireAuth = () => Promise.resolve(seja);
          // Generator (admin.html) uporablja requireRole, ne requireAuth.
          v.requireRole = () => Promise.resolve(seja);
        }
      },
    });
  }, { profili: PROFILI, zelje: ZELJE, vloga: vloga || "admin" });
  await stran.goto(`http://127.0.0.1:${VRATA}${pot || "/zelje.html"}`, { waitUntil: "load" });
  if (!pot) await stran.waitForSelector(".skupinaBtn", { timeout: 10000 });
  await stran.waitForTimeout(600);
  return { stran, konzola };
}

const izberi = async (stran, oznaka) => {
  await stran.click(`.skupinaBtn:text-is("${oznaka}")`);
  await stran.waitForTimeout(400);
};
const imenaVMrezi = (stran) => stran.$$eval("th.nm", els => els.map(e => e.textContent.trim()));

try {
  console.log("1) en sam izbirnik skupine namesto dveh zavihkov");
  const { stran, konzola } = await odpri(1100, 900);
  const oznake = await stran.$$eval(".skupinaBtn", els => els.map(e => e.textContent.trim()));
  trdi(
    JSON.stringify(oznake) === JSON.stringify(["Vse", "B", "C", "C1", "D", "E1", "E2", "FLEXI", "NZV"]),
    "izbirnik ima 'Vse' + vseh 8 skupin: " + oznake.join(", ")
  );
  trdi((await stran.$$('.tabs [role="tab"]')).length === 0,
    "starega dvojnega zavihka (Razpredelnica / Seznam želja) ni več");
  trdi((await stran.$$(".skupinaRow")).length === 1, "izbirnik skupine je natanko eden");

  console.log("2) privzeto je izbrana SVOJA skupina, ne vse");
  const naslov = () => stran.$eval(".skupinaNaslov", e => e.textContent.trim());
  trdi((await naslov()).startsWith("NZV"), "prijavljeni admin (NZV) takoj vidi NZV: " + await naslov());

  console.log("3) izbira skupine RES filtrira mrežo");
  trdi((await imenaVMrezi(stran)).sort().join("|") === ["Bojić Matej", "Zupan Meta"].sort().join("|"),
    "NZV pokaže samo vodje/administratorje (Zupan Meta pade sem po VLOGI, ne po kodi PDZN): " + (await imenaVMrezi(stran)).join(", "));
  await izberi(stran, "B");
  trdi((await imenaVMrezi(stran)).join("|") === "Novak Ana", "B pokaže samo Novak Ana: " + (await imenaVMrezi(stran)).join(", "));
  await izberi(stran, "FLEXI");
  trdi((await imenaVMrezi(stran)).join("|") === "Flek Jure", "FLEXI pokaže samo Flek Jure: " + (await imenaVMrezi(stran)).join(", "));
  await izberi(stran, "Vse");
  trdi((await imenaVMrezi(stran)).length === PROFILI.length, "'Vse' pokaže vseh " + PROFILI.length + " oseb");

  console.log("4) ista izbira žene TUDI zapisane želje (bistvo združitve)");
  trdi((await stran.$$(".zeljeToggle")).length === 0, "pri 'Vse' seznama želja ni – želje so vezane na eno skupino");
  await izberi(stran, "B");
  const gumbZelj = await stran.$(".zeljeToggle");
  trdi(!!gumbZelj, "pri izbrani skupini je gumb za želje na voljo");
  trdi((await gumbZelj.getAttribute("aria-expanded")) === "false", "želje so privzeto zložene (mreža ostane v ospredju)");
  await gumbZelj.click();
  await stran.waitForTimeout(600);
  let besedilo = await stran.innerText("body");
  trdi(besedilo.includes("ZELJA-ODDELKA-B"), "odprte želje pokažejo zapis oddelka B");
  trdi(!besedilo.includes("ZELJA-SKUPINE-NZV"), "in NE zapisa druge skupine (NZV)");
  trdi((await stran.$$('.zeljeSekcija .tabs, .zeljeSekcija [role="tablist"]')).length === 0,
    "seznam želja nima več svojega, drugega izbirnika oddelka");

  console.log("5) preklop skupine prestavi OBOJE hkrati");
  await izberi(stran, "NZV");
  await stran.waitForTimeout(600);
  besedilo = await stran.innerText("body");
  trdi((await imenaVMrezi(stran)).includes("Zupan Meta"), "mreža je skočila na NZV");
  trdi(besedilo.includes("ZELJA-SKUPINE-NZV") && !besedilo.includes("ZELJA-ODDELKA-B"),
    "in seznam želja z njo – brez druge izbire");

  console.log("6) brez praznih belih škatel in brez napak");
  const prazneKartice = await stran.$$eval(".card", els => els.filter(e => !e.innerText.trim()).length);
  trdi(prazneKartice === 0, "nobena kartica ni prazna (prej sta dve viseli sredi zaslona): " + prazneKartice);
  const prave = konzola.filter(t => !/supabase|Failed to fetch|Failed to load resource|net::|401|400|NetworkError|sw\.js|ServiceWorker|manifest/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();

  console.log("7) na telefonu so podatki na prvem zaslonu");
  const { stran: tel, konzola: konzolaTel } = await odpri(412, 915);
  const navodilo = await tel.$("details.navodilo");
  trdi(!!navodilo && !(await navodilo.evaluate(e => e.open)), "navodilo 'Kako to deluje' je zloženo");
  const zgodovina = await tel.$$eval("details.navodilo summary", els => els.map(e => e.textContent.trim()));
  trdi(zgodovina.some(t => t.startsWith("Zgodovina sprememb")), "zgodovina sprememb je zložena v isto obliko");
  const dan = await tel.$(".monthRow");
  const y = dan ? await dan.evaluate(e => Math.round(e.getBoundingClientRect().top + window.scrollY)) : 99999;
  trdi(y < 915, `izbirnik meseca je na prvem zaslonu (${y} px < 915)`);
  const preseg = await tel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  trdi(!preseg, "nič ne sili v vodoravno drsenje");
  await tel.close();

  console.log("8) most v Generator: en klik iz Želja na pravi oddelek in mesec");
  const { stran: g } = await odpri(1100, 900);
  const naslovGumba = async (kaj) => {
    const el = await g.$(`.vGeneratorBtn:has-text("${kaj}")`);
    return el ? el.getAttribute("href") : null;
  };
  await izberi(g, "C1");
  // Mesec vzame iz razpredelnice, ki je odprta - ne iz današnjega dne.
  const mesecVPrikazu = await g.$eval(".monthLbl", e => e.textContent.trim());
  trdi(await naslovGumba("Generiraj razpored") === "admin.html?tab=kalup&oddelek=C1&mesec=2026-08",
    `gumb pri C1 vodi v Generator → Oddelki z že izbranim C1 in mesecem (${mesecVPrikazu}): ` + await naslovGumba("Generiraj razpored"));
  await g.click(".monthRow .navBtn >> nth=1");   // en mesec naprej
  await g.waitForTimeout(400);
  trdi((await naslovGumba("Generiraj razpored") || "").endsWith("mesec=2026-09"),
    "gumb sledi izbranemu mesecu razpredelnice: " + await naslovGumba("Generiraj razpored"));
  await izberi(g, "NZV");
  trdi((await naslovGumba("vodstveno pokritost") || "").includes("tab=nzv&pod=vodje"),
    "NZV ima svoj gumb za vodstveno pokritost");
  trdi((await naslovGumba("Generiraj dežurstva") || "").includes("tab=nzv&pod=dez"),
    "in svoj gumb za dežurstva (dežurstva niso vezana na oddelek)");
  await izberi(g, "FLEXI");
  trdi(await naslovGumba("Generiraj") === null, "FLEXI nima gumba 'Generiraj' – ni kalupa, ne sme obljubljati generiranja");
  trdi((await naslovGumba("FLEXI") || "").startsWith("index.html?uvoz=1&oddelek=FLEXI"),
    "namesto tega vodi na vnos razporeda FLEXI");
  await izberi(g, "Vse");
  trdi((await g.$$(".vGeneratorBtn")).length === 0, "pri 'Vse' gumba ni – generira se po eni skupini");
  await g.close();

  console.log("9) drugi konec mostu: Generator se RES odpre na tem oddelku in mesecu");
  // Brez tega bi preizkus dokazal le, da je povezava lepa - ne pa, da
  // koordinatorju res prihrani izbiranje. Zato odpremo admin.html z istim
  // naslovom, kot ga sestavi gumb, in preberemo, kaj je izbrano.
  const { stran: a, konzola: konzolaA } = await odpri(1280, 900, "admin", "/admin.html?tab=kalup&oddelek=C1&mesec=2026-10");
  await a.waitForSelector("#odd", { timeout: 10000 });
  trdi(await a.$eval("#odd", e => e.value) === "C1", "zavihek Oddelki je odprt in oddelek je C1: " + await a.$eval("#odd", e => e.value));
  trdi(await a.$eval("#mm", e => e.value) === "2026-10", "mesec je oktober 2026: " + await a.$eval("#mm", e => e.value));
  await a.close();

  const { stran: d } = await odpri(1280, 900, "admin", "/admin.html?tab=nzv&pod=dez&mesec=2026-10");
  await d.waitForSelector("#dmonth", { timeout: 10000 });
  trdi(await d.$eval("#dmonth", e => e.value) === "2026-10", "NZV → Dežurstva se odpre na oktobru 2026: " + await d.$eval("#dmonth", e => e.value));
  await d.close();

  // Nespremenjen naslov mora pustiti Generator pri miru (brez regresije).
  const { stran: b } = await odpri(1280, 900, "admin", "/admin.html");
  await b.waitForSelector("#odd", { timeout: 10000 });
  trdi(await b.$eval("#odd", e => e.value) === "B", "brez napotila ostane privzeti oddelek B");
  await b.close();
  trdi(konzolaA.filter(t => !/supabase|Failed to fetch|Failed to load resource|net::|401|400|NetworkError|sw\.js|ServiceWorker|manifest/i.test(t)).length === 0,
    "Generator se odpre brez napak v konzoli");

  console.log("10) navaden zaposleni gumba za generiranje NE vidi");
  const { stran: u } = await odpri(1100, 900, "user");
  await izberi(u, "B");
  trdi((await u.$$(".vGeneratorBtn")).length === 0,
    "vlogi 'user' se gumb ne prikaže (stran Želje odprejo vsi zaposleni)");
  await u.close();

  const praveTel = konzolaTel.filter(t => !/supabase|Failed to fetch|Failed to load resource|net::|401|400|NetworkError|sw\.js|ServiceWorker|manifest/i.test(t));
  trdi(praveTel.length === 0, "brez napak v konzoli na telefonu" + (praveTel.length ? ": " + praveTel.join(" | ") : ""));
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
