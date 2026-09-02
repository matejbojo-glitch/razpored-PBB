#!/usr/bin/env node
/* Preizkus treh zahtev iz septembra 2026:
 *
 *  1) ODDELEK A je polnopraven oddelek povsod, kjer se oddelki
 *     razporejajo. Ima svoj DOPOLDANSKI kader, popoldne in ponoči pa ga
 *     izmenično pokrivata B in E1 – cel mesec vsak (september 2026 B,
 *     oktober 2026 E1). Tistemu, ki je v pokrivajočem oddelku tisti dan
 *     na popoldanski ali nočni izmeni, se zraven izpiše "(A)".
 *
 *  2) DEŽURSTVO iz zavihka Dežurstvo (uradni dokument dezurni_zdravniki)
 *     je vidno tudi v mreži NZV in v Razpredelnici stanja – prej je bil
 *     stolpec DEŽURSTVO prazen, dokler razpored dežurstev ni bil
 *     objavljen, zavihek Dežurstvo pa je imena že imel.
 *
 *  3) V SPUSTNEM SEZNAMU oddelkov je koda zapisana samo enkrat:
 *     "B – oddelek", ne "B – B – oddelek".
 *
 * Ob tem se varuje popravek v izmene.js: razvrstitev v grobe skupine je
 * odslej izpeljana iz uradne legende. Prej je bila svoja veriga primerjav
 * besedila in ta je URADNE zapise "Dopoldne"/"Popoldne" – tiste, ki jih
 * generator sam ustvarja – razvrstila med "off", torej kot da oseba
 * tisti dan sploh ni na izmeni.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-oddelek-a.mjs
 */
import http from "node:http";
import vm from "node:vm";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4215;
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

const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "oddelek-a.js"), "utf8"), sandbox);
const I = sandbox.window.Izmene, A = sandbox.window.OddelekA;

console.log("1) izmene.js: groba skupina je izpeljana iz uradne legende");
{
  // Past, zaradi katere je popravek nastal: uradni zapisi, ki jih
  // generator sam ustvarja, so padli v "off" (= ni na izmeni).
  eq(I.skupina("Dopoldne"), "dop", '"Dopoldne" je dopoldanska izmena, ne "off"');
  eq(I.skupina("Popoldne"), "pop", '"Popoldne" je popoldanska');
  eq(I.skupina("Popoldne do 19"), "pop", '"Popoldne do 19" prav tako');
  eq(I.skupinaGeneratorja("Popoldne"), "pop", "in generator jo tako tudi šteje v zasedbo");
  // Stari zapisi se ne smejo spremeniti.
  eq(I.skupina("dopoldan"), "dop", "stari zapis ostane enak");
  eq(I.skupina("popoldan"), "pop", "stari zapis ostane enak");
  eq(I.skupina("NOČNA"), "noc", "nočna");
  eq(I.skupina("NOČNA12"), "h12", "nočna 12 je 12-urna");
  eq(I.skupina("DNEVNA12"), "h12", "dnevna 12 prav tako");
  eq(I.skupina("DEŽURSTVO"), "dez", "dežurstvo");
  eq(I.skupina("LD"), "ld", "letni dopust");
  eq(I.skupina("KPU"), "off", "KPU je prosto");
  eq(I.skupina("prisoten"), "dop", '"PRISOTEN" (vodja na svoji enoti) je dopoldne');
  eq(I.skupinaGeneratorja("prisoten"), "off", "a v zasedbo oddelka ne šteje");
  eq(I.skupinaGeneratorja("LD"), "off", "dopust prav tako ne");
  eq(I.skupina("POMOČ DRUGJE"), "off", "koda, ki je ni v legendi, ostane 'off'");
  eq(I.skupina(""), "off", "prazna celica prav tako");
}

console.log("2) oddelek-a.js: kdo pokriva A in kdaj");
{
  eq(A.pokriva("2026-09"), "B", "september 2026 = B (izhodišče iz zahteve)");
  eq(A.pokriva("2026-10"), "E1", "oktober 2026 = E1");
  eq(A.pokriva("2026-11"), "B", "november spet B");
  eq(A.pokriva("2026-12"), "E1", "december E1");
  eq(A.pokriva("2027-01"), "B", "januar 2027 B – izmenjava teče čez prelom leta");
  eq(A.pokriva("2026-08"), "E1", "pravilo velja tudi za nazaj (avgust 2026 = E1)");
  eq(A.pokriva(""), null, "brez meseca ni odgovora");

  console.log("   katere izmene pokrivajo A (popoldanske in nočne):");
  ["Popoldne", "Popoldne do 19", "popoldan do 20", "Nočna", "Nočna 11", "Nočna 12"]
    .forEach(s => trdi(A.jePokrivnaIzmena(s), s + " pokriva A"));
  ["Dopoldne", "Dnevna 12", "DNEVNA12 (7-19)", "DEŽURSTVO", "LD", "KPU", ""]
    .forEach(s => trdi(!A.jePokrivnaIzmena(s), JSON.stringify(s) + " ne pokriva A"));

  // Varovalka pred razhajanjem z legendo: če se v izmene.js doda nova
  // popoldanska ali nočna izmena, mora biti tudi tu - sicer bi tiho
  // manjkala in oseba ne bi dobila oznake.
  // Uradne kratice so poimenovane po delu dneva: PO* = popoldne (PO4-PO7),
  // N* = nočna (N10-N12), DO*/DOP = dopoldne, D12/DF12 = dnevna 12-urna.
  // Vse PO* in N* morajo biti tu - in nič drugega.
  const izLegende = I.KRATICE.map(v => v[1])
    .filter(k => /^PO\d/.test(k) || /^N\d/.test(k)).sort();
  eq(A.POKRIVNE_KRATICE.slice().sort(), izLegende,
    "seznam pokrivnih kratic zajame vse popoldanske in nočne izmene iz legende");

  console.log("   oznaka se pripne samo pravemu oddelku, mesecu in izmeni:");
  eq(A.oznaka("2026-09", "B", "Popoldne"), " (A)", "september, B, popoldne");
  eq(A.oznaka("2026-09", "B", "Nočna 12"), " (A)", "september, B, nočna");
  eq(A.oznaka("2026-09", "E1", "Popoldne"), "", "september, E1 – ta mesec ne pokriva");
  eq(A.oznaka("2026-10", "E1", "Popoldne"), " (A)", "oktober, E1 – zdaj pa da");
  eq(A.oznaka("2026-09", "B", "Dopoldne"), "", "dopoldanska izmena je nikoli ne dobi");
  eq(A.oznaka("2026-09", "C1", "Popoldne"), "", "drug oddelek je ne dobi");
  eq(A.oznaka("2026-09", "b", "Popoldne"), " (A)", "koda oddelka ni občutljiva na velikost črk");
}

console.log("3) A je dodan povsod, kjer se naštevajo oddelki");
{
  const vsebuje = (pot, vzorec, opis) => trdi(vzorec.test(readFileSync(join(koren, pot), "utf8")), opis);
  vsebuje("index.html", /PO_ODDELKIH_KODE = \["A", "B", "C", "C1", "D", "E1", "E2", "FLEXI"\]/,
    "index.html – zavihek Oddelki");
  vsebuje("admin.html", /RAZPORED_ODDELKI = \["A", "B"/, "admin.html – razpored");
  vsebuje("admin.html", /UVOZ_SKUPINE = \["A", "B"/, "admin.html – uvoz");
  vsebuje("admin.html", /A:  \{ naziv:"A – oddelek"/, "admin.html – generator (WARDS_META)");
  vsebuje("imenik.html", /RAZPORED_ODDELKI = \["A", "B"/, "imenik.html");
  vsebuje("supabase/schema.sql", /array\['A'::text, 'B'::text, 'C'::text, 'C1'::text/,
    "schema.sql – Želje dovolijo oddelek A");
  vsebuje("supabase/schema.sql", /\('A',    'A – oddelek'\)/, "schema.sql – oddelek A je v tabeli oddelki");
  // Skupni modul mora biti na strani in v predpomnilniku, sicer se
  // aplikacija ob prvi uporabi brez omrežja sesuje.
  vsebuje("index.html", /<script src="oddelek-a\.js"><\/script>/, "index.html nalaga oddelek-a.js");
  vsebuje("sw.js", /'\.\/oddelek-a\.js'/, "service worker ga predpomni");
  vsebuje("vite.config.mjs", /"oddelek-a\.js"/, "in gradnja ga prekopira v dist/");
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

// Mesec, ki ga stran privzeto odpre. Podatki so vezani nanj, sicer bi
// test čez mesec dni meril prazno mrežo. Za oddelek A pa potrebujemo
// mesec z ZNANIM pokrivalcem, zato ga izračunamo iz istega pravila.
const zdaj = new Date();
const MESEC = zdaj.getFullYear() + "-" + String(zdaj.getMonth() + 1).padStart(2, "0");
const POKRIVA = A.pokriva(MESEC);            // "B" ali "E1"
const NE_POKRIVA = A.POKRIVAJO.find(k => k !== POKRIVA);
const dan = (n) => MESEC + "-" + String(n).padStart(2, "0");

const PROFILI = [
  // Pokrivajoči oddelek: ena oseba popoldne, ena ponoči, ena dopoldne.
  { id: "p1", full_name: "Novak Ana",   role: "user",  department_code: POKRIVA },
  { id: "p2", full_name: "Kovač Beti",  role: "user",  department_code: POKRIVA },
  { id: "p3", full_name: "Horvat Cilka",role: "user",  department_code: POKRIVA },
  // Drugi oddelek iz para - ta mesec NE pokriva A.
  { id: "d1", full_name: "Turk Dora",   role: "user",  department_code: NE_POKRIVA },
  // Oddelek A ima svoj dopoldanski kader.
  { id: "a1", full_name: "Vrevc Maja",  role: "user",  department_code: "A" },
  // NZV: dežurna po uradnem dokumentu, brez objavljenega dežurstva.
  { id: "v1", full_name: "Tomaževič Simona", role: "vodja", department_code: "NZV" },
];
const VPISI = [
  { employee_id: "p1", work_date: dan(1), shift_code: "Popoldne",  department_code: POKRIVA },
  { employee_id: "p2", work_date: dan(1), shift_code: "Nočna 12",  department_code: POKRIVA },
  { employee_id: "p3", work_date: dan(1), shift_code: "Dopoldne",  department_code: POKRIVA },
  { employee_id: "d1", work_date: dan(1), shift_code: "Popoldne",  department_code: NE_POKRIVA },
  { employee_id: "a1", work_date: dan(1), shift_code: "Dopoldne",  department_code: "A" },
];
// Dežurstvo SAMO v uradnem dokumentu, ne v razporedu - to je bistvo zahteve.
const ZDRAVNIKI = [{ work_date: dan(2), kind: "sestra", full_name: "Tomaževič Simona" }];
const NOSILCI = [{ full_name: "TOMAŽEVIČ SIMONA", enote: "A", odsotnost_tip: null, odsotnost_do: null }];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const odpri = async () => {
    const stran = await brskalnik.newPage({ viewport: { width: 1600, height: 1000 } });
    stran.on("pageerror", e => konzolaVse.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzolaVse.push(m.text()); });
    await stran.addInitScript(({ profili, vpisi, zdravniki, nosilci, oddelki }) => {
      const tabele = { profili, razpored: vpisi, dezurni_zdravniki: zdravniki, nosilci_oddelkov: nosilci,
        oddelki, nadomescanja: [], odsotnosti: [], obrazci: [], menjave_javno: [], nzv_nastavitve: [] };
      const poizvedba = (v) => {
        const filtri = [];
        const b = new Proxy({}, { get(_, n) {
          if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
          if (n === "then") return (nx) => Promise.resolve({
            data: v.filter(r => filtri.every(([k, x]) => r[k] === x))
              .map(r => (r.employee_id && !r.profili
                ? Object.assign({}, r, { profili: profili.find(p => p.id === r.employee_id) || null })
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
            const seja = { session: { user: { id: "p1" } },
              profile: { id: "p1", role: "admin", full_name: "Novak Ana", department_code: "B" }, ogled: false };
            v.client = { from: (t) => poizvedba(tabele[t] || []), auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            }};
            v.requireAuth = () => Promise.resolve(seja);
            v.requireRole = () => Promise.resolve(seja);
            v.vseStrani = (fn) => Promise.resolve(fn(0, 999)).then(r => (r && r.data) || []);
          }
        },
      });
    }, { profili: PROFILI, vpisi: VPISI, zdravniki: ZDRAVNIKI, nosilci: NOSILCI,
         oddelki: [{ code: "A", name: "A – oddelek" }, { code: "B", name: "B – oddelek" },
                   { code: "E1", name: "E1 – oddelek" }] });
    await stran.goto(`http://127.0.0.1:${VRATA}/index.html`, { waitUntil: "load" });
    await stran.waitForSelector(".segIkone button", { timeout: 15000 });
    return stran;
  };

  const stran = await odpri();

  console.log("4) A je v spustnem seznamu oddelkov, koda samo enkrat");
  {
    await stran.click('.segIkone button:has-text("Oddelki")');
    await stran.waitForSelector("#wd", { timeout: 15000 });
    const moznosti = await stran.$$eval("#wd option", e => e.map(x => x.textContent.trim()));
    trdi(moznosti.includes("A – oddelek"), "oddelek A je na voljo: " + moznosti.join(" | "));
    trdi(!moznosti.some(t => /^(\w+) – \1\b/.test(t)),
      "nobena vrstica ne ponovi kode dvakrat (\"B – B – oddelek\"): " + moznosti.join(" | "));

    // Isti seznam je tudi v Razpredelnici stanja - tam je bila koda
    // izpisana pred nazivom, naziv pa se z njo že začne, zato je nastalo
    // "B – B – oddelek" (uporabnikova pripomba).
    await stran.click('.segIkone button:has-text("Razpredelnica")');
    await stran.waitForSelector("#stanjeOddelek", { timeout: 15000 });
    const vRazpredelnici = await stran.$$eval("#stanjeOddelek option", e => e.map(x => x.textContent.trim()));
    trdi(vRazpredelnici.includes("A – oddelek"), "oddelek A je tudi tu: " + vRazpredelnici.join(" | "));
    trdi(!vRazpredelnici.some(t => /^(\w+) – \1\b/.test(t)),
      "in koda ni podvojena: " + vRazpredelnici.join(" | "));
    await stran.click('.segIkone button:has-text("Oddelki")');
    await stran.waitForSelector("#wd", { timeout: 15000 });
  }

  console.log("5) oznaka (A) na popoldanskih in nočnih izmenah pokrivajočega oddelka");
  {
    await stran.selectOption("#wd", POKRIVA);
    await stran.waitForSelector(".wardTable", { timeout: 15000 });
    await stran.waitForTimeout(700);
    const prva = await stran.$eval(".wardTable tbody tr:nth-child(1)", e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/Popoldne \(A\)/.test(prva), `${POKRIVA}: popoldanska izmena je označena – ${prva}`);
    trdi(/Nočna 12 \(A\)/.test(prva), "nočna izmena prav tako");
    trdi(/Dopoldne(?! \(A\))/.test(prva), "dopoldanska izmena oznake NE dobi");
    const legenda = await stran.$eval(".legend", e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/\(A\)/.test(legenda) && /oddelek A/i.test(legenda), "legenda pod mrežo pojasni oznako: " + legenda.slice(-70));

    await stran.selectOption("#wd", NE_POKRIVA);
    await stran.waitForTimeout(700);
    const drugi = await stran.$eval(".wardTable tbody tr:nth-child(1)", e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/Popoldne/.test(drugi) && !/\(A\)/.test(drugi),
      `${NE_POKRIVA} ta mesec ne pokriva A, zato brez oznake – ${drugi}`);

    await stran.selectOption("#wd", "A");
    await stran.waitForTimeout(700);
    const besedilo = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/Vrevc Maja|VREVC/i.test(besedilo), "oddelek A ima svoj dopoldanski kader");
    trdi(new RegExp("pokriva oddelek " + POKRIVA).test(besedilo),
      "in opombo, kateri oddelek ga ta mesec pokriva popoldne in ponoči");
  }

  console.log("6) dežurstvo iz zavihka Dežurstvo je vidno v Razpredelnici");
  {
    // Razpored dežurstva NI objavljen - ime je samo v uradnem dokumentu.
    await stran.click('.segIkone button:has-text("Dežurstvo")');
    await stran.waitForSelector(".dezTabela", { timeout: 15000 });
    await stran.waitForTimeout(500);
    const vDez = await stran.$eval(".dezTabela tbody tr:nth-child(2)", e => e.innerText.replace(/\s+/g, " "));
    trdi(/Tomaževič/.test(vDez), "zavihek Dežurstvo ime ima: " + vDez.trim());

    await stran.click('.segIkone button:has-text("Razpredelnica")');
    await stran.waitForSelector("#stanjeMesec", { timeout: 15000 });
    await stran.fill("#stanjeMesec", MESEC);
    await stran.waitForTimeout(1200);
    const vrstica = await stran.$eval(
      ".razpPolna tbody tr:has(td.name:has-text('Tomaževič'))",
      e => [...e.querySelectorAll("td")].map(t => t.innerText.replace(/\s+/g, " ").trim()));
    // Prvi td je ime; drugi dan v mesecu je torej indeks 2. Nad kratico
    // stoji še enota ("A"), zato preverjamo vsebovanost, ne enakosti.
    const izpis = vrstica.slice(0, 5).join(" | ");
    trdi(/DEŽ/.test(vrstica[2]), "drugi dan je v Razpredelnici DEŽ (iz uradnega dokumenta): " + izpis);
    trdi(!/DEŽ/.test(vrstica[1] || ""), "prvi dan, ko dežurstva ni, pa ostane brez: " + izpis);
  }

  console.log("7) dežurstvo iz uradnega dokumenta je vidno tudi v mreži NZV");
  {
    // Stolpec DEŽURSTVO v mreži NZV se je doslej polnil izključno iz
    // objavljenega razporeda in je za neobjavljene mesece ostal prazen.
    await stran.click('.segIkone button:has-text("Oddelki")');
    await stran.waitForSelector("#wd", { timeout: 15000 });
    await stran.selectOption("#wd", "NZV");
    await stran.waitForSelector(".wardTableNzv", { timeout: 15000 });
    await stran.waitForTimeout(900);
    const stolpec = await stran.$$eval(".wardTableNzv thead th",
      e => e.map(x => x.textContent.trim()).indexOf("Dežurstvo"));
    trdi(stolpec > 0, "stolpec Dežurstvo obstaja");
    const celica = await stran.$eval(
      `.wardTableNzv tbody tr:nth-child(2) td:nth-child(${stolpec + 1})`,
      e => e.textContent.trim());
    trdi(celica.length > 0, "drugi dan ima dežurno osebo iz uradnega dokumenta: " + JSON.stringify(celica));
    const prvi = await stran.$eval(
      `.wardTableNzv tbody tr:nth-child(1) td:nth-child(${stolpec + 1})`,
      e => e.textContent.trim());
    eq(prvi, "", "prvi dan, ko dežurstva nikjer ni, ostane prazen");
  }

  const prave = konzolaVse.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
