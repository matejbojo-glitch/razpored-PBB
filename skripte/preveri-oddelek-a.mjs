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
// oddelek-a.js vpraša prazniki.js, kateri dan je dela prost (dnevna
// 12-urna izmena pokriva A samo ob sobotah, nedeljah in praznikih).
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
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

  // 4. 9. 2026 je petek, 5. in 6. 9. sta sobota in nedelja, 31. 10. 2026
  // je dan reformacije (dela prost).
  const PETEK = "2026-09-04", SOBOTA = "2026-09-05", NEDELJA = "2026-09-06", PRAZNIK = "2026-10-31";
  console.log("   popoldanske in nočne izmene pokrivajo A vsak dan:");
  ["Popoldne", "Popoldne do 19", "popoldan do 20", "Nočna", "Nočna 11", "Nočna 12"]
    .forEach(s => trdi(A.jePokrivnaIzmena(s, PETEK), s + " pokriva A tudi med tednom"));
  ["Dopoldne", "DEŽURSTVO", "LD", "KPU", ""]
    .forEach(s => trdi(!A.jePokrivnaIzmena(s, SOBOTA), JSON.stringify(s) + " ne pokriva A"));

  console.log("   dnevna 12-urna pokriva A SAMO ob sobotah, nedeljah in praznikih:");
  ["Dnevna 12", "DNEVNA12 (7-19)"].forEach(s => {
    trdi(!A.jePokrivnaIzmena(s, PETEK), s + " med tednom NE pokriva A (A ima svoj dopoldanski kader)");
    trdi(A.jePokrivnaIzmena(s, SOBOTA), s + " v soboto pokriva A");
    trdi(A.jePokrivnaIzmena(s, NEDELJA), s + " v nedeljo prav tako");
    trdi(A.jePokrivnaIzmena(s, PRAZNIK), s + " in na dela prost praznik");
  });
  eq(A.vrstaPokrivanja("Popoldne", PETEK), "popoldne", "vrsta pokrivanja: popoldne");
  eq(A.vrstaPokrivanja("Nočna 12", PETEK), "nocna", "vrsta pokrivanja: nočna");
  eq(A.vrstaPokrivanja("Dnevna 12", SOBOTA), "dnevna", "vrsta pokrivanja: dnevna");
  eq(A.vrstaPokrivanja("Dnevna 12", PETEK), null, "med tednom dnevna ni pokrivanje");
  // Brez datuma se dnevna NE sme šteti - raje manjkajoča oznaka kot napačna.
  eq(A.vrstaPokrivanja("Dnevna 12"), null, "brez datuma se dnevna ne šteje");

  // Varovalka pred razhajanjem z legendo: če se v izmene.js doda nova
  // izmena, mora biti tudi tu - sicer bi tiho manjkala in oseba ne bi
  // dobila oznake. Uradne kratice so poimenovane po delu dneva:
  // PO* = popoldne, N* = nočna, D12/DF12 = dnevna 12-urna, DO*/DOP =
  // dopoldne (te A ne pokrivajo).
  const vseNastete = A.VRSTE.reduce((a, v) => a.concat(v[2]), []).sort();
  const izLegende = I.KRATICE.map(v => v[1])
    .filter(k => /^PO\d/.test(k) || /^N\d/.test(k) || k === "D12" || k === "DF12").sort();
  eq(vseNastete, izLegende,
    "seznami kratic zajamejo vse popoldanske, nočne in dnevne 12-urne izmene iz legende");
  eq(A.VRSTE.map(v => v[0]), ["dnevna", "popoldne", "nocna"], "tri vrste pokrivanja, v tem vrstnem redu");

  console.log("   oznaka se pripne samo pravemu oddelku, mesecu in izmeni:");
  eq(A.oznaka("2026-09", "B", "Popoldne", PETEK), " (A)", "september, B, popoldne");
  eq(A.oznaka("2026-09", "B", "Nočna 12", PETEK), " (A)", "september, B, nočna");
  eq(A.oznaka("2026-09", "B", "Dnevna 12", SOBOTA), " (A)", "september, B, sobotna dnevna");
  eq(A.oznaka("2026-09", "B", "Dnevna 12", PETEK), "", "med tednom pa dnevna ne");
  eq(A.oznaka("2026-09", "E1", "Popoldne", PETEK), "", "september, E1 – ta mesec ne pokriva");
  eq(A.oznaka("2026-10", "E1", "Popoldne", PETEK), " (A)", "oktober, E1 – zdaj pa da");
  eq(A.oznaka("2026-09", "B", "Dopoldne", PETEK), "", "dopoldanska izmena je nikoli ne dobi");
  eq(A.oznaka("2026-09", "C1", "Popoldne", PETEK), "", "drug oddelek je ne dobi");
  eq(A.oznaka("2026-09", "b", "Popoldne", PETEK), " (A)", "koda oddelka ni občutljiva na velikost črk");
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
// Deterministična delovni dan in sobota v TEM mesecu - dnevna 12-urna
// izmena pokriva A samo ob sobotah, nedeljah in praznikih, zato mora
// preizkus imeti oboje, ne glede na to, kdaj se poganja.
const prviTakDan = (dow) => {
  for (let d = 1; d <= 28; d++) {
    if (new Date(dan(d) + "T00:00:00").getDay() === dow) return dan(d);
  }
  return dan(1);
};
const SREDA = prviTakDan(3), SOBOTA_M = prviTakDan(6);

const PROFILI = [
  // Pokrivajoči oddelek: popoldne, ponoči, dopoldne.
  { id: "p1", full_name: "Novak Ana",   role: "user",  department_code: POKRIVA },
  { id: "p2", full_name: "Kovač Beti",  role: "user",  department_code: POKRIVA },
  { id: "p3", full_name: "Horvat Cilka",role: "user",  department_code: POKRIVA },
  // Oseba, ki je po Imeniku v pokrivajočem oddelku, a je tisti dan zaradi
  // MENJAVE razporejena drugam - v stolpcih A je ne sme biti.
  { id: "p4", full_name: "Zupan Ema",   role: "user",  department_code: POKRIVA },
  // FLEXI: domači oddelek FLEXI, pravi oddelek tistega dne v
  // pokriva_oddelek - mora se pojaviti.
  { id: "fx", full_name: "Flek Eva",    role: "user",  department_code: "FLEXI" },
  // Drugi oddelek iz para - ta mesec NE pokriva A.
  { id: "d1", full_name: "Turk Dora",   role: "user",  department_code: NE_POKRIVA },
  // Oddelek A ima svoj dopoldanski kader.
  { id: "a1", full_name: "Vrevc Maja",  role: "user",  department_code: "A" },
  // NZV: dežurna po uradnem dokumentu, brez objavljenega dežurstva.
  { id: "v1", full_name: "Tomaževič Simona", role: "vodja", department_code: "NZV" },
];
const VPISI = [
  // --- delovni dan: popoldne in ponoči pokriva A, dopoldne ne ---
  { employee_id: "p1", work_date: SREDA, shift_code: "Popoldne",  department_code: POKRIVA },
  { employee_id: "p2", work_date: SREDA, shift_code: "Nočna 12",  department_code: POKRIVA },
  { employee_id: "p3", work_date: SREDA, shift_code: "Dopoldne",  department_code: POKRIVA },
  // Dnevna 12-urna MED TEDNOM ni pokrivanje - A ima takrat svoj kader.
  { employee_id: "p4", work_date: SREDA, shift_code: "Dnevna 12", department_code: POKRIVA },
  { employee_id: "d1", work_date: SREDA, shift_code: "Popoldne",  department_code: NE_POKRIVA },
  { employee_id: "a1", work_date: SREDA, shift_code: "Dopoldne",  department_code: "A" },
  // --- sobota: dnevno službo prav tako pokrije pokrivajoči oddelek ---
  { employee_id: "p3", work_date: SOBOTA_M, shift_code: "Dnevna 12", department_code: POKRIVA },
  { employee_id: "p2", work_date: SOBOTA_M, shift_code: "Nočna 12",  department_code: POKRIVA },
  // FLEXI, ki tisti dan pokriva prav ta oddelek.
  { employee_id: "fx", work_date: SOBOTA_M, shift_code: "Popoldne", department_code: "FLEXI",
    pokriva_oddelek: POKRIVA },
  // MENJAVA: Zupan je po Imeniku v pokrivajočem oddelku, a jo je potrjena
  // menjava tisti dan prestavila na tuj oddelek - stolpci A je ne smejo
  // več šteti (menjava zamenja tudi oddelek vpisa).
  { employee_id: "p4", work_date: SOBOTA_M, shift_code: "Popoldne", department_code: "C1" },
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
    // Vrstica se poišče po datumu, ne po zaporedni številki.
    const vrstica = (iso) => stran.evaluate((d) => {
      const t = [...document.querySelectorAll(".wardTable tbody tr")]
        .find(v => v.querySelector("td.name") && v.querySelector("td.name").textContent.includes(d));
      return t ? t.innerText.replace(/\s+/g, " ").trim() : "";
    }, Number(iso.slice(8, 10)) + ".");

    const vSredo = await vrstica(SREDA);
    trdi(/Popoldne \(A\)/.test(vSredo), `${POKRIVA}: popoldanska izmena je označena – ${vSredo}`);
    trdi(/Nočna 12 \(A\)/.test(vSredo), "nočna izmena prav tako");
    trdi(/Dopoldne(?! \(A\))/.test(vSredo), "dopoldanska izmena oznake NE dobi");
    trdi(/Dnevna 12(?! \(A\))/.test(vSredo), "in med tednom tudi dnevna 12-urna ne");
    const vSoboto = await vrstica(SOBOTA_M);
    trdi(/Dnevna 12 \(A\)/.test(vSoboto), "v soboto pa dnevna 12-urna oznako DOBI – " + vSoboto);
    const legenda = await stran.$eval(".legend", e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/\(A\)/.test(legenda) && /oddelek A/i.test(legenda), "legenda pod mrežo pojasni oznako: " + legenda.slice(-70));

    await stran.selectOption("#wd", NE_POKRIVA);
    await stran.waitForTimeout(700);
    const drugi = await stran.evaluate((d) => {
      const t = [...document.querySelectorAll(".wardTable tbody tr")]
        .find(v => v.querySelector("td.name") && v.querySelector("td.name").textContent.includes(d));
      return t ? t.innerText.replace(/\s+/g, " ").trim() : "";
    }, Number(SREDA.slice(8, 10)) + ".");
    trdi(/Popoldne/.test(drugi) && !/\(A\)/.test(drugi),
      `${NE_POKRIVA} ta mesec ne pokriva A, zato brez oznake – ${drugi}`);

    await stran.selectOption("#wd", "A");
    await stran.waitForTimeout(700);
    const besedilo = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/Vrevc Maja|VREVC/i.test(besedilo), "oddelek A ima svoj dopoldanski kader");
    trdi(new RegExp("pokriva oddelek " + POKRIVA).test(besedilo),
      "in opombo, kateri oddelek ga ta mesec pokriva popoldne in ponoči");

    // Stolpci s TISTIMI, ki A pokrivajo (obratna smer od oznake "(A)" na
    // mreži pokrivajočega oddelka), ločeni po delu dneva.
    const glave = await stran.$$eval(".wardTable thead th", e => e.map(x => x.textContent.trim()));
    trdi(glave.includes("Pokriva oddelek " + POKRIVA),
      "mreža A ima skupino stolpcev pokrivanja: " + glave.join(" | "));
    ["Dnevna", "Popoldne", "Nočna"].forEach(n =>
      trdi(glave.includes(n), "s stolpcem " + n));

    // Vrstica se poišče po datumu, ne po zaporedni številki - prvi dan v
    // mesecu je lahko kateri koli dan v tednu.
    const celice = (iso) => stran.evaluate((d) => {
      const vrstica = [...document.querySelectorAll(".wardTable tbody tr")]
        .find(t => t.querySelector("td.name") && t.querySelector("td.name").textContent.includes(d));
      if (!vrstica) return null;
      return [...vrstica.querySelectorAll("td.pokrivaStolpec")]
        .map(t => t.innerText.replace(/\s+/g, " ").trim());
    }, Number(iso.slice(8, 10)) + ".");

    const stolpciSreda = await celice(SREDA);
    trdi(!!stolpciSreda && stolpciSreda.length === 3, "delovni dan ima tri stolpce: " + JSON.stringify(stolpciSreda));
    eq(stolpciSreda[0], "", "med tednom dnevna izmena ni pokrivanje in stolpec ostane prazen (A ima svoj kader)");
    eq(stolpciSreda[1], "Novak A.", "popoldne: priimek in prva črka imena");
    trdi(/Kovač/.test(stolpciSreda[2]), "ponoči: " + stolpciSreda[2]);
    trdi(!stolpciSreda.join(" ").includes("Horvat"), "dopoldanskega sodelavca pokrivajočega oddelka ni nikjer");
    trdi(!stolpciSreda.join(" ").includes("Turk"), "in tudi popoldanskega iz drugega oddelka ne");

    const stolpciSobota = await celice(SOBOTA_M);
    trdi(/Horvat/.test(stolpciSobota[0]), "sobota: dnevno službo pokrije pokrivajoči oddelek – " + stolpciSobota[0]);
    trdi(/Kovač/.test(stolpciSobota[2]), "in nočno prav tako");
    trdi(/Flek/.test(stolpciSobota[1]), "FLEXI, ki tisti dan pokriva ta oddelek, se šteje: " + stolpciSobota[1]);
    trdi(!stolpciSobota.join(" ").includes("Zupan"),
      "kdor je zaradi MENJAVE tisti dan na tujem oddelku, se ne šteje: " + JSON.stringify(stolpciSobota));

    // Vrzel mora biti vidna: popoldne in ponoči se pričakujeta vsak dan.
    const brezPokritja = await stran.evaluate(() => {
      const vrstice = [...document.querySelectorAll(".wardTable tbody tr")];
      const prazna = vrstice.find(t => [...t.querySelectorAll("td.pokrivaStolpec")]
        .every(c => c.innerText.trim() === "–"));
      return prazna ? [...prazna.querySelectorAll("td.pokrivaStolpec")].map(c => c.innerText.trim()) : null;
    });
    eq(brezPokritja, ["–", "–", "–"], "dan brez pokritja je označen s črticami, ne tiho prazen");
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
