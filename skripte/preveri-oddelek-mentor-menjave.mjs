#!/usr/bin/env node
/* Preizkus treh zahtev za oddelčni razpored (september 2026):
 *
 *  1) ŠIRINA – "cel oddelčni razpored na 1 strani". Mreža je na namizju
 *     table-layout:fixed čez vso širino zaslona; prej jo je .wrap.wide
 *     (1240 px) stiskal celo bolj kot .wrap.polna (1400 px), ker sta oba
 *     razreda na istem elementu in je pri >=1400 px obveljalo zadnje
 *     pravilo. Celica je merila 56 px, "Popoldne" se je prelilo čez
 *     sosednji stolpec in stran je dobila vodoravno drsenje.
 *
 *  2) OZNAKA (M) – mentor pripravniku tisto izmeno ("Dopoldne (M)").
 *     Ni svoja izmena: kratica, barva, čas IN URE ostanejo od osnovne
 *     izmene, doda se le oznaka. Past, ki jo tu lovimo: delovni-cas.js
 *     kode "dopoldan (M)" prej ni poznal -> 0 ur v obračunu plač in
 *     izmena, ki je pravilo počitka po nočni sploh ni videlo.
 *
 *  3) MENJAVE PO ODDELKIH – pod razporedom oddelka stojijo samo menjave
 *     tega oddelka (B, C … NZV), ne bolnišnični seznam vseh.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-oddelek-mentor-menjave.mjs
 */
import http from "node:http";
import vm from "node:vm";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4213;
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

console.log("1) izmene.js: (M) je oznaka mentorja, ne nova izmena");
{
  const s = { console }; s.window = s; vm.createContext(s);
  vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), s);
  const I = s.window.Izmene;
  eq(I.kratica("dopoldan (M)"), "DOP", "kratica ostane DOP");
  eq(I.barva("dopoldan (M)"), I.barva("dopoldan"), "barva je ista kot pri osnovni izmeni");
  eq(I.cas("dopoldan (M)"), I.cas("dopoldan"), "delovni čas je isti");
  eq(I.stanje("dopoldan (M)"), "delo", "šteje kot delo");
  trdi(I.jeMentor("dopoldan (M)"), "jeMentor prepozna pripono");
  trdi(I.jeMentor("DNEVNA12 (m)"), "tudi z malo črko");
  trdi(!I.jeMentor("dopoldan"), "izmena brez pripone ni mentorska");
  trdi(!I.jeMentor("dopoldan (7-15h)"), "in tudi (7-15h) ni – ta oklepaj pomeni urnik DMS");
  eq(I.brezMentorja("Popoldne (M)"), "Popoldne", "brezMentorja odreže pripono");
  console.log("   izpis, ki ga uporabnik prebere:");
  eq(I.naziv("dopoldan (M)"), "Dopoldne (M)", "Moj razpored / opis ob kazalcu");
  eq(I.nazivZaMrezo("dopoldan (M)"), "Dopoldne (M)", "oddelčna mreža: Dopoldne (M)");
  eq(I.nazivZaMrezo("popoldan (M)"), "Popoldne (M)", "Popoldne (M)");
  eq(I.nazivZaMrezo("DNEVNA12 (M)"), "Dnevna 12 (M)", "Dnevna 12 (M) – vse tri iz uporabnikove zahteve");
  eq(I.nazivZaMrezo("dopoldan"), "Dopoldne", "izmena brez mentorstva ostane nespremenjena");
  // Odsotnost se v mreži izpiše s kratico; oznaka se ne sme pripeti dvakrat.
  eq(I.naziv("POM (M)"), "POM (M)", "neznana koda se izpiše taka, kot je (brez podvojene oznake)");
}

console.log("2) delovni-cas.js: (M) ne sme pojesti ur");
{
  const s = { console }; s.window = s; vm.createContext(s);
  vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), s);
  const D = s.window.DelovniCas;
  for (const [z, osn] of [["dopoldan (M)", "dopoldan"], ["popoldan (M)", "popoldan"],
                          ["DNEVNA12 (M)", "DNEVNA12"], ["NOČNA od 19 (M)", "NOČNA od 19"]]) {
    const a = D.podatkiIzmene(z), b = D.podatkiIzmene(osn);
    trdi(!!a && !!b && a.ure === b.ure && a.nocna === b.nocna,
      `${z} ima iste ure in isto nočnost kot ${osn} (${a ? a.ure : "NI"} : ${b ? b.ure : "NI"})`);
  }
  trdi(D.jeDelo("dopoldan (M)"), "mentorska izmena je delo");
  // Past: nočna z (M) mora še vedno sprožiti pravilo počitka.
  const p = D.podatkiIzmene("NOČNA12 (M)");
  trdi(!!p && p.nocna === true, "NOČNA12 (M) je še vedno nočna izmena");
}

console.log("3) vse tri kopije delovni-cas.js pripono odrežejo enako");
{
  const vrstica = (pot) => (readFileSync(join(koren, pot), "utf8")
    .split("\n").find(v => /function kljuc\(/.test(v)) || "").trim();
  const kop = ["delovni-cas.js", "src/shared/delovni-cas.js", "supabase/functions/_shared/delovni-cas.js"];
  kop.forEach(p => trdi(/\\\(\\s\*m\\s\*\\\)/.test(vrstica(p)), p + " odreže \"(M)\""));
  const telo = kop.map(p => vrstica(p).replace(/^export /, ""));
  trdi(new Set(telo).size === 1, "in vse tri kopije so enake");
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

// Mesec se izriše za TEKOČI mesec, zato so testni podatki vezani nanj -
// s trdim datumom bi test čez mesec dni tiho meril prazno mreža.
const danes = new Date();
const MESEC = danes.getFullYear() + "-" + String(danes.getMonth() + 1).padStart(2, "0");
const dan = (n) => MESEC + "-" + String(n).padStart(2, "0");

const PRIIMKI = ["Kovač","Novak","Horvat","Krajnc","Zupančič","Potočnik","Kovačič","Mlakar","Vidmar","Kos",
  "Golob","Turk","Božič","Korošec","Bizjak","Hribar","Kolar","Zupan","Oblak","Rozman"];
// 20 oseb na oddelku C1 (realen oddelek) + ena z oddelka B, ki je druga
// stran menjave, in ena s tujega oddelka D, ki se tu ne sme pojaviti.
const PROFILI = PRIIMKI.map((pr, i) => ({ id: "e" + i, full_name: pr + " Ana",
  role: i % 3 ? "user" : "vodja", department_code: "C1" }));
PROFILI.push({ id: "b1", full_name: "Bevc Tine", role: "user", department_code: "B" });
PROFILI.push({ id: "d1", full_name: "Dolinar Eva", role: "user", department_code: "D" });
PROFILI.push({ id: "d2", full_name: "Debevec Rok", role: "user", department_code: "D" });

const SIFRE = ["Dopoldne", "Popoldne", "Nočna 12", "Dnevna 12", "LD", "KPU", "Nočna 11", "Popoldne do 19", ""];
const VPISI = [];
for (let d = 1; d <= 28; d++) PRIIMKI.forEach((_, i) => {
  const s = SIFRE[(d + i) % SIFRE.length];
  if (s) VPISI.push({ employee_id: "e" + i, work_date: dan(d), shift_code: s, department_code: "C1" });
});
// Mentor pripravniku: prvi dan v mesecu, prva oseba.
VPISI.push({ employee_id: "e0", work_date: dan(1), shift_code: "dopoldan (M)", department_code: "C1" });

const OBRAZCI = [
  // dve osebi z oddelka C1
  { id: "m1", vrsta: "menjava_sluzbe", status: "potrjen", je_dezurstvo: false,
    vlagatelj_id: "e0", sodelavec_id: "e1", polja: { datum_a: dan(3), datum_b: dan(10) } },
  // C1 <-> B: mora biti vidna OBEMA oddelkoma
  { id: "m2", vrsta: "menjava_sluzbe", status: "potrjen", je_dezurstvo: false,
    vlagatelj_id: "e2", sodelavec_id: "b1", polja: { datum_a: dan(4), datum_b: dan(11) } },
  // tuja menjava D <-> D: pod C1 je ne sme biti
  { id: "m3", vrsta: "menjava_sluzbe", status: "potrjen", je_dezurstvo: false,
    vlagatelj_id: "d1", sodelavec_id: "d2", polja: { datum_a: dan(5), datum_b: dan(12) } },
];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const odpri = async (sirina, visina) => {
    const stran = await brskalnik.newPage({ viewport: { width: sirina, height: visina } });
    stran.on("pageerror", e => konzolaVse.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzolaVse.push(m.text()); });
    await stran.addInitScript(({ profili, vpisi, obrazci }) => {
      const tabele = { profili, razpored: vpisi, obrazci,
        oddelki: [{ code: "C1", name: "C1" }, { code: "B", name: "B" }, { code: "D", name: "D" }],
        nosilci_oddelkov: [], nadomescanja: [], odsotnosti: [], menjave_javno: [], dezurni_zdravniki: [] };
      // Vgnezdeni "vlagatelj:profili!…(full_name, department_code)" - v
      // odgovoru mora priti cel profil, sicer bi test filtriranja meril
      // pomanjkljivost posnemovalnika in ne kode.
      const razsiri = (r) => {
        const o = Object.assign({}, r);
        if (r.employee_id && !r.profili) o.profili = profili.find(p => p.id === r.employee_id) || null;
        if (r.vlagatelj_id) o.vlagatelj = profili.find(p => p.id === r.vlagatelj_id) || null;
        if (r.sodelavec_id) o.sodelavec = profili.find(p => p.id === r.sodelavec_id) || null;
        return o;
      };
      const poizvedba = (v) => {
        const filtri = [];
        const b = new Proxy({}, { get(_, n) {
          if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
          if (n === "then") return (nx) => Promise.resolve({
            data: v.filter(r => filtri.every(([k, x]) => r[k] === x)).map(razsiri), error: null }).then(nx);
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
            const seja = { session: { user: { id: "e0" } },
              profile: { id: "e0", role: "admin", full_name: "Kovač Ana", department_code: "C1" }, ogled: false };
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
    }, { profili: PROFILI, vpisi: VPISI, obrazci: OBRAZCI });
    // "?uredi=1": seznam menjav pod razporedom se je septembra 2026 preselil
    // pod GENERATOR (v Razporedu samem ga ni več), zato ga preizkus odpre
    // po isti poti, kot ga odpre Generator - glej preveri-generator-vstop.mjs.
    await stran.goto(`http://127.0.0.1:${VRATA}/index.html?uredi=1`, { waitUntil: "load" });
    await stran.waitForSelector(".segIkone button", { timeout: 15000 });
    await stran.click('.segIkone button:has-text("Oddelki")');
    await stran.waitForSelector(".wardTable", { timeout: 15000 });
    await stran.waitForTimeout(600);
    return stran;
  };

  console.log("4) širina: cel oddelčni razpored na en zaslon");
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
    const stran = await odpri(w, h);
    const m = await stran.evaluate(() => {
      const t = document.querySelector(".wardTable");
      const okvir = t.closest(".wardScroller");
      const cel = t.querySelector("tbody td.cell");
      return {
        stolpcev: t.querySelectorAll("thead tr:first-child th").length,
        tabela: Math.round(t.getBoundingClientRect().width),
        wrap: Math.round(document.querySelector(".wrap").getBoundingClientRect().width),
        celica: Math.round(cel.getBoundingClientRect().width),
        drsiOkvir: okvir.scrollWidth > okvir.clientWidth + 1,
        stranDrsi: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    eq(m.stolpcev, 21, `${w} px: ime + 20 zaposlenih oddelka`);
    trdi(!m.drsiOkvir, `${w} px: mreža je cela vidna, brez vodoravnega vlečenja`);
    trdi(!m.stranDrsi, `${w} px: in stran ne sili v vodoravno drsenje`);
    trdi(m.wrap >= w - 40, `${w} px: pogled uporabi ves zaslon (${m.wrap} px)`);
    // Kontrolna točka za odstranjen "cezZaslon": brez njega bi bil .wrap
    // pri 1920 px stisnjen na 1240 px in celica spet 56 px.
    if (w === 1920) trdi(m.celica >= 80, `1920 px: celica je ${m.celica} px (prej 56 px pri 1240 px omejitvi)`);
    if (w === 1920) trdi(m.tabela > 1400, `1920 px: tabela je širša od stare omejitve 1400 px (${m.tabela} px)`);
    // Enobesedni naziv se ne sme lomiti sredi besede ("Dopoldn / e") -
    // to se je zgodilo, ko je značka smela prelomiti kjer koli, prostora
    // v celici pa je bilo ~15 px premalo. Rob celice in značke je zato
    // ožji; večbesedni nazivi se še vedno prelomijo na presledku.
    const vrstic = await stran.evaluate(() => {
      const z = [...document.querySelectorAll(".wardTable tbody td.cell .swatch")]
        .find(e => e.textContent.trim() === "Dopoldne");
      return z ? z.getClientRects().length : null;
    });
    eq(vrstic, 1, `${w} px: "Dopoldne" se izpiše v eni vrstici, brez preloma sredi besede`);
    await stran.close();
  }

  const stran = await odpri(1600, 1000);

  console.log("5) (M) je viden v oddelčni mreži");
  {
    const prvaVrstica = await stran.$eval(".wardTable tbody tr:nth-child(1)",
      e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/Dopoldne \(M\)/.test(prvaVrstica), "prvi dan piše \"Dopoldne (M)\": " + prvaVrstica.slice(0, 90));
    // Legenda pod mrežo je po KRATICAH – tam oznake ne sme biti, sicer bi
    // "DOP" razlagala kot mentorsko izmeno.
    const legenda = await stran.$eval(".legend", e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(!/\(M\)/.test(legenda), "barvna legenda pod mrežo ostane brez oznake: " + legenda.slice(0, 80));
  }

  console.log("6) menjave pod razporedom so samo od tega oddelka");
  {
    await stran.waitForSelector("text=Menjave v tem mesecu", { timeout: 15000 });
    const blok = await stran.evaluate(() => {
      const h = [...document.querySelectorAll("h2.section")].find(x => /Menjave v tem mesecu/.test(x.textContent));
      return { naslov: h.textContent.trim(), besedilo: h.parentElement.innerText.replace(/\s+/g, " ").trim() };
    });
    trdi(/C1/.test(blok.naslov), "naslov pove, čigav oddelek je: " + blok.naslov);
    trdi(/Kovač Ana ↔ Novak Ana/.test(blok.besedilo), "menjava znotraj oddelka je izpisana");
    trdi(/Bevc Tine/.test(blok.besedilo), "menjava z drugim oddelkom je vidna tudi tu (ena stran je z oddelka)");
    trdi(!/Dolinar Eva|Debevec Rok/.test(blok.besedilo),
      "tuja menjava (D ↔ D) se pod C1 NE pokaže: " + blok.besedilo.slice(0, 140));
  }

  console.log("7) legenda kratic razloži (M)");
  {
    await stran.click('.segIkone button:has-text("Razpredelnica")');
    await stran.waitForSelector("#stanjeMesec", { timeout: 15000 });
    await stran.click('button:has-text("Legenda kratic")');
    await stran.waitForTimeout(300);
    const t = (await stran.innerText(".infoPanel")).replace(/\s+/g, " ");
    trdi(/\(M\)/.test(t), "oznaka (M) je v legendi");
    trdi(/mentor/i.test(t), "z razlago, da gre za mentorja pripravniku");
    trdi(/Dopoldne \(M\)/.test(t) && /Popoldne \(M\)/.test(t) && /Dnevna 12 \(M\)/.test(t),
      "s primeri iz uporabnikove zahteve");
  }

  console.log("8) (M) se izpiše tudi v Razpredelnici stanja");
  {
    await stran.fill("#stanjeMesec", MESEC);
    await stran.waitForTimeout(900);
    const vrstica = await stran.$eval(".razpPolna tbody tr:nth-child(1)",
      e => e.innerText.replace(/\s+/g, " ").trim());
    trdi(/\(M\)/.test(vrstica), "kratica dobi oznako: " + vrstica.slice(0, 80));
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
