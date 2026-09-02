#!/usr/bin/env node
/* Mobilne/spletne izboljšave iz pregleda aplikacije (september 2026).
 * Vsaka trditev tu ustreza EDNI izmerjeni težavi iz tistega pregleda -
 * brez preizkusa bi se prav vse tiho vrnile ob naslednji spremembi sloga
 * ali svežnja.
 *
 *   1) Zavihki, ki se ne prilegajo, DRSIJO in to tudi POKAŽEJO (maska).
 *      Prej: na Statistiki je bil 4. zavihek ("Stanje dopusta") povsem
 *      izven zaslona, brez vsakršnega namiga, da obstaja.
 *   2) Povečava (pinch-zoom) ni onemogočena - "maximum-scale=1" je bil na
 *      vseh 10 straneh in je uporabniku s slabšim vidom preprečeval
 *      povečavo razporeda.
 *   3) Napisi v spodnji navigaciji se ne režejo ("Razpor…", "Genera…").
 *   4) Tarče za prst so vsaj 44px (prej 20-38px: zavihki, hitri razlogi,
 *      križec, potrditvena polja).
 *   5) Najmanjše pisave so vsaj 11px (prej 9-10,5px).
 *   6) XLSX/ExcelJS (1,3 MB) se NE naložita ob odprtju strani, ampak šele
 *      ob prvem izvozu - in izvoz mora še vedno delovati.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-mobilne-izboljsave.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4281;
const TIP = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".mjs":"text/javascript" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

console.log("1) povečava na telefonu ni onemogočena (viewport brez maximum-scale)");
{
  const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
  const zMax = strani.filter(f => /maximum-scale/.test(readFileSync(join(koren, f), "utf8")));
  trdi(strani.length >= 9, `pregledanih strani: ${strani.length}`);
  trdi(zMax.length === 0, "nobena stran ne omejuje povečave" + (zMax.length ? " – še vedno: " + zMax.join(", ") : ""));
}

console.log("2) sveženj: XLSX in ExcelJS nista v osnovnem (vsakokrat naloženem) svežnju");
{
  const app = readFileSync(join(koren, "vendor-app.entry.js"), "utf8");
  const izvoz = readFileSync(join(koren, "vendor-izvoz.entry.js"), "utf8");
  trdi(!/from "xlsx"|from "exceljs/.test(app),
    "vendor-app.entry.js NE uvaža xlsx/exceljs (sicer se 1,3 MB spet naloži na vsaki strani)");
  trdi(/from "xlsx"/.test(izvoz) && /exceljs/.test(izvoz),
    "vendor-izvoz.entry.js ju uvaža");
  const app_min = join(koren, "vendor-app.min.js"), izvoz_min = join(koren, "vendor-izvoz.min.js");
  if (existsSync(app_min) && existsSync(izvoz_min)) {
    const mb = (p) => statSync(p).size / 1024 / 1024;
    trdi(mb(app_min) < 0.6, `vendor-app.min.js je ${mb(app_min).toFixed(2)} MB (pred ločitvijo 1,66 MB)`);
    trdi(mb(izvoz_min) > 0.5, `vendor-izvoz.min.js nosi knjižnici (${mb(izvoz_min).toFixed(2)} MB)`);
  }
  const sw = readFileSync(join(koren, "sw.js"), "utf8");
  trdi(!/'\.\/vendor-izvoz\.min\.js'/.test(sw),
    "vendor-izvoz.min.js NI na seznamu za predpomnjenje (sicer bi ga ob namestitvi prenesel vsak uporabnik)");
  trdi(/vendor-izvoz\.min\.js/.test(readFileSync(join(koren, "vite.config.mjs"), "utf8")),
    "vite.config.mjs ga vseeno prekopira v dist/ (nanj ne kaže noben <script src>)");
}

// ---- brskalnik ---------------------------------------------------------
const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const predpomnilnik = new Map();
const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "index.html" : pot);
  if (!existsSync(dat) || !statSync(dat).isFile()) { odgovor.writeHead(404); odgovor.end("ni"); return; }
  let v = predpomnilnik.get(dat);
  if (!v) {
    v = readFileSync(dat);
    if (extname(dat) === ".html") {
      const s = v.toString("utf8"); const m = s.match(reBabel);
      v = Buffer.from(m ? s.replace(reBabel, () => `<script>\n${transformSync(m[1], { loader: "jsx", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" }).code}\n</script>`) : s, "utf8");
    }
    predpomnilnik.set(dat, v);
  }
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(v);
});
await new Promise(r => streznik.listen(VRATA, r));
const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

function mock(vloga) {
  return (vloga) => {
    const q = (v) => new Proxy({}, { get(_, n) {
      if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
      if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data: null, error: null });
      if (typeof n !== "string") return undefined; return () => q(v); } });
    let p = null;
    Object.defineProperty(window, "RazporedAuth", { configurable: true, get() { return p; }, set(v) { p = v;
      if (v && typeof v === "object") {
        const s = { session: { user: { id: "p0" } }, profile: { id: "p0", full_name: "Novak Ana", role: vloga, department_code: "B", is_koordinator: true }, ogled: false };
        v.client = { from: () => q([]), rpc: () => Promise.resolve({ data: [], error: null }),
          auth: { getSession: () => Promise.resolve({ data: { session: s.session } }), getUser: () => Promise.resolve({ data: { user: s.session.user } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
        v.requireAuth = () => Promise.resolve(s); v.requireRole = () => Promise.resolve(s);
        v.getSessionAndProfile = () => Promise.resolve(s); if (!v.vseStrani) v.vseStrani = async () => [];
      } } });
  };
}
async function odpri(stran, sirina, vloga) {
  const ctx = await brskalnik.newContext({ viewport: { width: sirina, height: 844 }, isMobile: sirina < 900, hasTouch: sirina < 900 });
  const pg = await ctx.newPage();
  const zahteve = [];
  pg.on("response", r => zahteve.push(r.url().split("/").pop()));
  await pg.route("**://fonts.googleapis.com/**", r => r.abort());
  await pg.route("**://fonts.gstatic.com/**", r => r.abort());
  await pg.addInitScript(mock(vloga), vloga);
  await pg.goto(`http://127.0.0.1:${VRATA}/${stran}`, { waitUntil: "load" });
  await pg.waitForTimeout(1200);
  return { ctx, pg, zahteve };
}

try {
  console.log("3) napisi v spodnji navigaciji se ne režejo (admin vidi 7 postavk)");
  {
    for (const sirina of [360, 390]) {
      const { ctx, pg } = await odpri("index.html", sirina, "admin");
      const odrezani = await pg.evaluate(() => [...document.querySelectorAll(".rpNav a")].map(a => {
        const l = [...a.querySelectorAll(".lbl, .lblOzko")].find(x => getComputedStyle(x).display !== "none");
        return l && l.scrollWidth > l.clientWidth + 1 ? l.textContent : null;
      }).filter(Boolean));
      trdi(odrezani.length === 0, `${sirina}px: noben napis ni odrezan` + (odrezani.length ? " – " + odrezani.join(", ") : ""));
      await ctx.close();
    }
  }

  console.log("4) zavihki, ki se ne prilegajo, drsijo IN to pokažejo (maska na robu)");
  {
    const { ctx, pg } = await odpri("dashboard.html", 390, "admin");
    const t = await pg.evaluate(() => [...document.querySelectorAll(".tabs")].map(x => ({
      drsi: x.scrollWidth > x.clientWidth + 1, maska: getComputedStyle(x).maskImage !== "none",
      visina: Math.round(x.querySelector("button").getBoundingClientRect().height),
    })));
    trdi(t.length > 0 && t[0].drsi, "vrstica zavihkov se na 390px res ne prilega (zato mora drseti)");
    trdi(t.length > 0 && t[0].maska, "in ima namig (masko), da se nadaljuje");
    trdi(t.length > 0 && t[0].visina >= 44, `zavihek je visok ${t[0] && t[0].visina}px (najmanj 44)`);
    await ctx.close();

    const { ctx: c2, pg: p2 } = await odpri("dashboard.html", 1440, "admin");
    const t2 = await p2.evaluate(() => [...document.querySelectorAll(".tabs")].map(x => ({
      drsi: x.scrollWidth > x.clientWidth + 1, maska: getComputedStyle(x).maskImage !== "none" })));
    trdi(t2.length > 0 && !t2[0].drsi && !t2[0].maska, "na namizju se prilega in maske ni");
    await c2.close();
  }

  console.log("5) tarče za prst na telefonu");
  {
    for (const stran of ["dashboard.html", "admin.html", "index.html", "imenik.html"]) {
      const { ctx, pg } = await odpri(stran, 390, "admin");
      const male = await pg.evaluate(() => [...document.querySelectorAll("button, a, select, textarea, input:not([type=checkbox]):not([type=radio])")]
        .filter(el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== "none" && r.height < 40; })
        .map(el => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 18)} ${Math.round(el.getBoundingClientRect().height)}px`));
      trdi(male.length === 0, `${stran}: brez tarč, nižjih od 40px` + (male.length ? " – " + male.slice(0, 4).join(", ") : ""));
      await ctx.close();
    }
  }

  console.log("6) najmanjša pisava na telefonu je vsaj 11px");
  {
    for (const stran of ["index.html", "dashboard.html"]) {
      const { ctx, pg } = await odpri(stran, 390, "admin");
      const drobne = await pg.evaluate(() => {
        const najdene = {};
        document.querySelectorAll("*").forEach(el => {
          if (!el.textContent || !el.textContent.trim() || el.children.length) return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 11) najdene[fs + "px " + (el.className || el.tagName).toString().slice(0, 20)] = true;
        });
        return Object.keys(najdene);
      });
      trdi(drobne.length === 0, `${stran}: brez besedila pod 11px` + (drobne.length ? " – " + drobne.slice(0, 4).join(", ") : ""));
      await ctx.close();
    }
  }

  console.log("7) knjižnici za preglednice se naložita ŠELE ob izvozu (in izvoz deluje)");
  {
    const { ctx, pg, zahteve } = await odpri("index.html", 390, "admin");
    trdi(!zahteve.includes("vendor-izvoz.min.js"),
      "ob odprtju strani vendor-izvoz.min.js NI prenesen");
    const prazno = await pg.evaluate(() => [typeof window.XLSX, typeof window.ExcelJS]);
    trdi(prazno[0] === "undefined" && prazno[1] === "undefined",
      `window.XLSX/ExcelJS ob odprtju nista definirana (dobil: ${prazno.join(", ")})`);

    const izid = await pg.evaluate(async () => {
      const ujeto = [];
      const stariClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (!this.download) stariClick.call(this); };
      const stariCreate = URL.createObjectURL;
      URL.createObjectURL = (b) => { ujeto.push({ velikost: b.size, tip: b.type }); return stariCreate(b); };
      try {
        await window.ExportUtils.izvoziXLSX("preizkus.xlsx", [{ ime: "List", glave: ["A", "B"], vrstice: [["1", "2"]] }]);
        const b = ujeto.find(x => x && x.velikost);
        return { ok: true, velikost: b ? b.velikost : 0, tip: b ? b.tip : "" };
      } catch (e) { return { ok: false, napaka: String(e).slice(0, 160) }; }
      finally { HTMLAnchorElement.prototype.click = stariClick; URL.createObjectURL = stariCreate; }
    });
    trdi(izid.ok, "izvoz v Excel deluje po odloženem nalaganju" + (izid.ok ? "" : " – " + izid.napaka));
    trdi(izid.ok && izid.velikost > 1000, `nastane prava datoteka (${izid.velikost} bajtov)`);
    trdi(izid.ok && /spreadsheetml/.test(izid.tip), `pravega tipa (${izid.tip})`);
    trdi(zahteve.includes("vendor-izvoz.min.js"), "in sveženj je bil prenesen šele zdaj");
    await ctx.close();
  }

  console.log("8) namizje: cel mesec kot koledar PON-NED na eni strani (točka 7 pregleda)");
  {
    const { ctx, pg } = await odpri("index.html", 1440, "admin");
    const r = await pg.evaluate(() => {
      const k = document.querySelector(".mesecKoledar");
      const glave = k ? [...k.querySelectorAll(".kglava")].map(x => x.textContent) : [];
      return { koledar: !!k, glave,
        stolpcev: k ? getComputedStyle(k).gridTemplateColumns.split(" ").length : 0,
        dni: k ? k.querySelectorAll(".kcelica:not(.prazna)").length : 0,
        visina: k ? Math.round(k.getBoundingClientRect().height) : 0, okno: window.innerHeight,
        seznam: !!document.querySelector(".weeksGrid"),
        sirina: Math.round(document.querySelector(".wrap").getBoundingClientRect().width) };
    });
    trdi(r.koledar, "na širokem zaslonu se izriše koledar");
    trdi(r.stolpcev === 7, `sedem stolpcev, po en na dan v tednu (dobil: ${r.stolpcev})`);
    trdi(r.glave.join(",") === "PO,TO,SR,ČE,PE,SO,NE", `glave gredo od ponedeljka do nedelje (dobil: ${r.glave.join(",")})`);
    trdi(r.dni >= 28 && r.dni <= 31, `izrisani so vsi dnevi meseca (${r.dni})`);
    trdi(!r.seznam, "seznam po tednih se ob koledarju NE izriše hkrati (sicer bi bila vsebina podvojena)");
    trdi(r.visina < r.okno, `cel mesec gre na en zaslon (koledar ${r.visina}px, okno ${r.okno}px)`);
    trdi(r.sirina > 1000, `vsebina uporabi širino zaslona (${r.sirina}px, prej 608px)`);
    await ctx.close();

    const { ctx: c2, pg: p2 } = await odpri("index.html", 390, "admin");
    const m = await p2.evaluate(() => ({
      koledar: !!document.querySelector(".mesecKoledar"),
      seznam: !!document.querySelector(".weeksGrid"),
    }));
    trdi(!m.koledar && m.seznam,
      "na telefonu ostane seznam po dnevih (sedem stolpcev pri 390px ni berljivih)");
    await c2.close();
  }

  console.log("9) namizje: polja niso raztegnjena čez vso širino (točka 8 pregleda)");
  {
    for (const stran of ["index.html", "imenik.html", "admin.html"]) {
      const { ctx, pg } = await odpri(stran, 1440, "admin");
      const najsirse = await pg.evaluate(() => Math.max(0, ...[...document.querySelectorAll(
        "input:not([type=checkbox]):not([type=radio]), select")].map(el => el.getBoundingClientRect().width)));
      trdi(najsirse <= 560, `${stran}: najširše polje ${Math.round(najsirse)}px (meja 560, prej do 1208)`);
      await ctx.close();
    }
  }

  console.log("10) obroč ob premikanju s tipkovnico je viden tudi na zlati podlagi (točka 9 pregleda)");
  {
    const { ctx, pg } = await odpri("index.html", 1440, "admin");
    const brez = [];
    for (let i = 0; i < 12; i++) {
      await pg.keyboard.press("Tab");
      const r = await pg.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const st = getComputedStyle(el);
        return { kdo: el.tagName.toLowerCase() + "." + (el.className || "").toString().slice(0, 18),
          obroc: st.outlineStyle, sirina: st.outlineWidth, barva: st.outlineColor };
      });
      if (r && (r.obroc === "none" || parseFloat(r.sirina) === 0)) brez.push(r.kdo);
    }
    trdi(brez.length === 0, "vsak element pod tabulatorjem ima viden obroč" + (brez.length ? " – brez: " + [...new Set(brez)].join(", ") : ""));
    await ctx.close();
  }

  console.log("11) temni način (točka 10 pregleda)");
  {
    for (const stran of ["index.html", "dashboard.html", "imenik.html"]) {
      const ctx = await brskalnik.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
      const pg = await ctx.newPage();
      await pg.route("**://fonts.googleapis.com/**", r => r.abort());
      await pg.route("**://fonts.gstatic.com/**", r => r.abort());
      await pg.addInitScript(mock("admin"), "admin");
      await pg.goto(`http://127.0.0.1:${VRATA}/${stran}`, { waitUntil: "load" });
      await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => {
        const svetlo = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
          if (!m) return false; const a = m[4] === undefined ? 1 : parseFloat(m[4]); if (a < 0.5) return false;
          return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) > 200; };
        const ostanki = [];
        document.querySelectorAll("*").forEach(el => { const st = getComputedStyle(el); const b = el.getBoundingClientRect();
          if (b.width < 40 || b.height < 12) return;
          if (svetlo(st.backgroundColor)) ostanki.push((el.className || el.tagName).toString().slice(0, 24)); });
        return { telo: getComputedStyle(document.body).backgroundColor, ostanki: [...new Set(ostanki)].slice(0, 4) };
      });
      trdi(!/rgb\(2[45]\d/.test(r.telo), `${stran}: podlaga strani je temna (${r.telo})`);
      trdi(r.ostanki.length === 0, `${stran}: brez svetlih ostankov` + (r.ostanki.length ? " – " + r.ostanki.join(", ") : ""));
      await ctx.close();
    }
    const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
    const brezTemne = strani.filter(f => !/prefers-color-scheme: dark/.test(readFileSync(join(koren, f), "utf8")));
    trdi(brezTemne.length === 0, "vse strani povedo barvo vrstice brskalnika za temni način"
      + (brezTemne.length ? " – manjka: " + brezTemne.join(", ") : ""));
  }

  console.log("12) dolga pojasnila ne zasedajo prvega zaslona (točka 11 pregleda)");
  {
    const dash = readFileSync(join(koren, "dashboard.html"), "utf8");
    const admin = readFileSync(join(koren, "admin.html"), "utf8");
    trdi((dash.match(/<summary>Dodaj mesec \(uvoz JSON\)<\/summary>/g) || []).length === 2,
      "obe orodji za uvoz JSON na Statistiki sta zloženi");
    trdi(/<summary>Kaj to naredi<\/summary>/.test(admin),
      "pojasnilo uvoza razporeda v Generatorju je zloženo");
  }

  console.log("");
  if (napake.length) { console.error(`NEUSPEŠNO – ${napake.length} napak`); napake.forEach(n => console.error("  - " + n)); process.exit(1); }
  console.log("VSE V REDU");
} finally {
  await brskalnik.close();
  streznik.close();
}
