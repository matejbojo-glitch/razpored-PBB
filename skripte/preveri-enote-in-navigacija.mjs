#!/usr/bin/env node
/* Preizkus štirih uporabnikovih zahtev (avgust 2026):
 *
 *  1) zapis enot: NAJPREJ lastna enota, nato prevzeta, in vedno uradni
 *     naziv - "ŽO" (ženski oddelek), ne interna koda "ZO". Bojić, ki je
 *     doma na MO in tisti dan pokriva še ŽO, mora brati "MO/ŽO", ne
 *     "ZO/MO", kot je pisalo prej (vrstni red stolpcev uradne predloge).
 *  2) Imenik: samo Seznam in Parafe; "Stanje dopusta" je preneseno v
 *     Statistiko, skupaj s celotno funkcijo.
 *  3) navigacija: Razpored, Imenik, Menjava, Želje, Generator, Statistika, Uvoz
 *     (Uvoz je zadnji in samo za administratorja - vse uvoze zbira na enem mestu).
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-enote-in-navigacija.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import vm from "node:vm";
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
const VRATA = 4206;
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

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
// Zapis enot je na voljo kot globalna normalizirajNazivOddelka(vrednost,
// lastneEnote) - tako jo kličejo strani. Ločilo je vejica (tako je izbral
// uporabnik v svoji različici), sestavljene enote pa obdržijo poševnico.
const zapis = sandbox.window.normalizirajNazivOddelka;

console.log("1) zapis enot: lastna prva, uradni naziv");
eq(zapis("ZO/MO", "MO"), "MO, ŽO", "Bojić (doma MO) pokriva še ŽO");
eq(zapis("MO/ZO", "MO"), "MO, ŽO", "vrstni red v zapisu ne spremeni izida");
eq(zapis("ZO/MO", "ZO"), "ŽO, MO", "za tistega, ki je doma na ŽO, je ŽO prva");
eq(zapis(["PDZN", "SOBO", "U2"], "PDZN"), "PDZN, SOBO, U2", "tri enote, lastna prva");
eq(zapis(["SOBO", "U2", "PDZN"], "PDZN"), "PDZN, SOBO, U2", "lastna se potegne naprej");
eq(zapis("ZO, MO", "MO"), "MO, ŽO", "ločilo je lahko vejica");
eq(zapis("MO/MO", "MO"), "MO", "podvojena enota se izpiše enkrat");

console.log("2) »ZO« se uporabniku nikoli ne pokaže");
// To je bila uporabnikova izrecna zahteva: "povsod v aplikaciji spremeni
// ŽO - to so ženski oddelki". Koda v bazi ostane "ZO" (stolpec uradne
// predloge), prikaz pa mora biti vedno s strešico.
eq(zapis("ZO"), "ŽO", "koda ZO se izpiše kot ŽO");
eq(zapis("ZO", ""), "ŽO", "tudi kadar je sama");
eq(zapis("B1B2", ""), "B1,B2", "B1B2 se izpiše kot B1,B2");
eq(zapis("UA", ""), "URGENCA", "psevdonim UA se razreši v URGENCA");
trdi(!/ZO/.test(zapis("ZO/MO", "MO").replace("ŽO", "")),
  "v izpisu ne ostane surova koda");
eq(zapis("", "MO"), "", "prazen vhod da prazen izpis");
eq(zapis(null, null), "", "manjkajoč vhod ne vrže napake");

console.log("2b) sestavljene enote se ne razbijejo");
// V uradni predlogi "UA/SA" pomeni "ENA OD OBEH", ne "URGENCA in SA DOP".
// Razstavljanje na kode in sestavljanje nazaj ta pomen izgubi, zato se
// lastne enote izpišejo tako, kot so zapisane pri osebi.
eq(zapis("UA/SA", "UA/SA"), "UA/SA", "Mušič na svojih enotah");
eq(zapis("UA/SA/DB", "UA/SA"), "UA/SA, DB", "in kadar prevzame še DB");
eq(zapis("B1,B2", "B1,B2"), "B1,B2", "B1,B2 ostane celota");
// Izjema je "ZO": v bazi je brez strešice, na zaslonu mora biti z njo.
eq(zapis("ZO", "ZO"), "ŽO", "tudi dobesedni zapis popravi ZO v ŽO");
// Zamenjava mora biti po CELI BESEDI. "IZOB" (študijski dopust) je stolpec
// v mreži NZV in vsebuje "ZO" - ob zamenjavi po podnizu se je izpisal kot
// "IŽOB". Enako bi se zgodilo vsaki drugi oznaki s temi črkami.
eq(zapis("IZOB"), "IZOB", "»IZOB« se ne pokvari v »IŽOB«");
eq(zapis("IZOB", "MO"), "IZOB", "tudi kadar je znana lastna enota");
// Ista funkcija se uporablja tudi za nazive iz šifranta oddelkov - ti
// morajo ostati nedotaknjeni, ne pretvorjeni v kode ali velike črke.
eq(zapis("B – oddelek"), "B – oddelek", "naziv oddelka ostane, kot je");
eq(zapis("ŽO – ženski oddelek"), "ŽO – ženski oddelek", "tudi z besedo ženski");
eq(zapis("ZO/MO", "ZO"), "ŽO, MO", "in to velja tudi ob prevzeti enoti");

console.log("3) navigacija v naročenem vrstnem redu");
{
  const nav = readFileSync(join(koren, "nav.js"), "utf8");
  const vrstniRed = [...nav.matchAll(/lbl:\s*"([^"]+)"/g)].map(m => m[1]);
  eq(vrstniRed, ["Razpored", "Imenik", "Menjava", "Želje", "Generator", "Statistika", "Uvoz"],
    "Razpored, Imenik, Menjava, Želje, Generator, Statistika, Uvoz");
}

console.log("4) Stanje dopusta je PRENESENO iz Imenika v Statistiko");
{
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const dashboard = readFileSync(join(koren, "dashboard.html"), "utf8");
  trdi(!/function DopustPregled/.test(imenik), "v Imeniku komponente ni več");
  // Preverja se ZAVIHEK, ne vsaka pojavitev besedila: v Imeniku ostane
  // vrstica "Stanje dopusta" na HR kartici POSAMEZNE osebe, kar je prav -
  // preselil se je skupni pregled čez vse zaposlene, ne podatek o osebi.
  trdi(!/setPogled\("dopust"\)/.test(imenik), "in tudi zavihka ne");
  trdi(/<div className="lbl">Stanje dopusta<\/div>/.test(imenik),
    "na kartici posamezne osebe pa podatek ostane");
  trdi(/function DopustPregled/.test(dashboard), "v Statistiki je");
  trdi(/Stanje dopusta/.test(dashboard), "z zavihkom");
  // Kadrovski podatki ostanejo omejeni na administratorja - prenos ne sme
  // biti tudi razširitev dostopa.
  // Odkar je pod istim zavihkom še preseljeni uvoz iz Kadrisa (september
  // 2026), je pogoj pred skupino in ne neposredno pred <DopustPregled>.
  trdi(/role === "admin" && tab==="dopust" && \(/.test(dashboard),
    "in še vedno samo za administratorja");
  trdi(/<DopustPregled oddelki=\{oddelki\} \/>/.test(dashboard),
    "pregled po osebah je pod tem pogojem");
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

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const odpri = async (pot, tabele, profil) => {
    const stran = await brskalnik.newPage({ viewport: { width: 1280, height: 950 } });
    const konzola = [];
    stran.on("pageerror", e => konzola.push(String(e)));
    stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
    await stran.addInitScript(({ t, p }) => {
      // Lažni odjemalec mora posnemati tudi maybeSingle()/single(): prava
      // knjižnica takrat vrne EN objekt, ne seznama. Brez tega je "Moj
      // razpored" dobil polje namesto profila in ni našel lastne enote -
      // preizkus bi padel zaradi pomanjkljivosti dvojnika, ne zaradi kode.
      const poizvedba = (v) => {
        const b = new Proxy({}, { get(_, n) {
          if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
          if (n === "maybeSingle" || n === "single") {
            return () => Promise.resolve({ data: v[0] || null, error: null });
          }
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
            const seja = { session: { user: { id: p.id } }, profile: p, ogled: false };
            v.client = { from: (n) => poizvedba(t[n] || []), auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            }};
            v.requireAuth = () => Promise.resolve(seja);
            v.requireRole = () => Promise.resolve(seja);
            v.unreadNotificationCount = () => Promise.resolve(0);
          }
        },
      });
    }, { t: tabele, p: profil });
    await stran.goto(`http://127.0.0.1:${VRATA}${pot}`, { waitUntil: "load" });
    return { stran, konzola };
  };

  console.log("5) »Moj razpored«: v oklepaju najprej lastna enota");
  // Resnični primer s posnetka zaslona: Bojić je doma na MO, Alukić (ŽO) je
  // na dopustu, zato Bojić tisti dan pokriva ŽO POLEG svoje MO. Izpeljava
  // sestavi enote po vrstnem redu stolpcev uradne predloge (ŽO pred MO),
  // prikaz pa mora to obrniti - najprej svoja enota, nato prevzeta.
  const PROFIL = { id: "v1", role: "admin", full_name: "Bojić Matej", department_code: "NZV" };
  const { stran, konzola } = await odpri("/index.html", {
    profili: [PROFIL],
    nosilci_oddelkov: [
      { full_name: "Bojić Matej", enote: "MO" },
      { full_name: "Alukić Dino", enote: "ŽO" },
    ],
    nadomescanja: [{ nosilec: "Alukić Dino", nadomesca: "Bojić Matej", enota: "ZO", prednost: 1, poleg_svoje: true }],
    odsotnosti: [{ full_name: "Alukić Dino", work_date: "2026-08-05", kind: "ld" }],
    menjave_javno: [], dezurni_zdravniki: [], obrazci: [], nzv_nastavitve: [],
    oddelki: [{ code: "C1", name: "C1" }],
    razpored: [{ employee_id: "v1", work_date: "2026-08-05", shift_code: "Dopoldne",
      department_code: "MO", pokriva_oddelek: "" }],
  }, PROFIL);
  await stran.waitForSelector(".segIkone button", { timeout: 15000 });
  await stran.selectOption("#ySel", "2026");
  await stran.selectOption("#mmSel", "8");
  await stran.waitForTimeout(1500);
  const besedilo = (await stran.innerText("body")).replace(/\s+/g, " ");
  trdi(/\(MO, ŽO\)/.test(besedilo), "izpiše se »Dopoldne (MO, ŽO)«");
  trdi(!/\(ZO\/MO\)/.test(besedilo) && !/\(ZO\)/.test(besedilo),
    "in nikjer ne piše surova koda »ZO«");

  console.log("6) Imenik: samo Seznam in Parafe");
  const { stran: im, konzola: konzolaIm } = await odpri("/imenik.html",
    { profili: [PROFIL], oddelki: [{ code: "C1", name: "C1" }], uvozi_kontaktov: [], telefoni_kontaktov: [] }, PROFIL);
  await im.waitForSelector('button[role="tab"]', { timeout: 15000 });
  eq(await im.$$eval('button[role="tab"]', e => e.map(x => x.textContent.trim())),
    ["Seznam", "Parafe"], "dva zavihka, brez Stanja dopusta");

  console.log("7) Statistika ima Stanje dopusta in podatke izriše");
  const { stran: st, konzola: konzolaSt } = await odpri("/dashboard.html", {
    oddelki: [{ code: "C1", name: "C1 – oddelek" }],
    profili: [{ id: "a", full_name: "Kovač Ana", department_code: "C1",
      kadrovski_podatki: { annual_leave_total: 30, leave_balance_days: 12, leave_balance_asof: "2026-08-01" } }],
  }, PROFIL);
  await st.waitForSelector('button[role="tab"]', { timeout: 15000 });
  const zavihkiSt = await st.$$eval('button[role="tab"]', e => e.map(x => x.textContent.trim()));
  trdi(zavihkiSt.includes("Stanje dopusta"), "zavihek je tam: " + JSON.stringify(zavihkiSt));
  await st.click('button:has-text("Stanje dopusta")');
  await st.waitForTimeout(1200);
  const bes = (await st.innerText("body")).replace(/\s+/g, " ");
  trdi(/Kovač Ana/.test(bes), "oseba je v tabeli");
  trdi(/C1 – oddelek/.test(bes), "in izpiše se naziv oddelka, ne le koda");
  trdi(/12/.test(bes), "preostanek dni je izpisan");

  console.log("8) navigacija na strani");
  // innerText, ne textContent: postavki "Generator"/"Statistika" imata od
  // septembra 2026 v DOM tudi krajši napis za ozke zaslone ("Kalup",
  // "Pregled", glej lblOzko v nav.js), skritega s "display:none". textContent
  // bi vrnil oba naenkrat ("GeneratorKalup"), innerText pa - tako kot bralnik
  // zaslona in oko uporabnika - samo VIDNEGA.
  eq(await st.$$eval(".rnav a, nav a", e => e.map(x => x.innerText.replace(/[^\p{L}\s]/gu, "").trim())),
    ["Razpored", "Imenik", "Menjava", "Želje", "Generator", "Statistika", "Uvoz"],
    "vrstni red na dejanski strani (široki zaslon: polni napisi)");

  const prave = [...konzola, ...konzolaIm, ...konzolaSt]
    .filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker|baseline/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close(); await im.close(); await st.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
