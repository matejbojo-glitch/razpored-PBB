#!/usr/bin/env node
/* Uvoz razporeda: ko je v enem zavihku VEČ različic istega meseca, mora
 * aplikacija VPRAŠATI, ne pa tiho vzeti zadnje.
 *
 * Zakaj to sploh obstaja: v pravi preglednici "Letni dopusti in omejitve za
 * NZV" je december 2026 notri TRIKRAT, v "2026 SMS RAZPORED" pa se meseci
 * prav tako ponavljajo. Doslej je uvoz vse bloke prebral drugega čez
 * drugega in obveljala je zadnja vrednost - v razpored se je torej lahko
 * tiho zapisala opuščena različica, ne da bi kdo izvedel.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-izbira-bloka.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4240;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".mjs":"text/javascript" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

const predpomnilnik = new Map();
const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "index.html" : pot);
  if (!existsSync(dat) || !statSync(dat).isFile()) { odgovor.writeHead(404); odgovor.end("ni"); return; }
  let vsebina = predpomnilnik.get(dat);
  if (!vsebina) {
    vsebina = readFileSync(dat);
    if (extname(dat) === ".html") vsebina = Buffer.from(prevediJsxVHtmlu(vsebina.toString("utf8")), "utf8");
    predpomnilnik.set(dat, vsebina);
  }
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage();
  await stran.route("**://fonts.googleapis.com/**", r => r.abort());
  await stran.route("**://fonts.gstatic.com/**", r => r.abort());
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  // supabase-client.js si window.RazporedAuth nastavi sam in bi brez prijave
  // stran preusmeril na login.html - takrat v dokumentu ni več ne modula ne
  // logike, ki jo merimo. Zato ga prestrežemo ob DODELITVI in podtaknemo
  // prijavljenega administratorja ter prazno bazo.
  await stran.addInitScript(() => {
    const prazno = { data: [], error: null };
    const veriga = () => new Proxy({}, { get(_, n) {
      if (n === "then") return (nx) => Promise.resolve(prazno).then(nx);
      return () => veriga();
    }});
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", {
      configurable: true,
      get() { return pravi; },
      set(v) {
        pravi = v;
        if (v && typeof v === "object") {
          const seja = { session: { user: { id: "a" } },
                         profile: { id: "a", role: "admin", full_name: "Admin Ana", department_code: "C1" },
                         ogled: false };
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
          v.getSessionAndProfile = () => Promise.resolve(seja);
          v.client = { from: () => veriga(), rpc: () => Promise.resolve(prazno),
                       channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }) };
        }
      },
    });
  });
  await stran.goto(`http://127.0.0.1:${VRATA}/index.html`, { waitUntil: "load" });
  await stran.waitForTimeout(500);

  console.log("1) logika izbire je dosegljiva in modul naložen");
  trdi(await stran.evaluate(() => typeof window.RazporedOblike === "object"),
    "razpored-oblike.js je vključen v index.html");
  trdi(await stran.evaluate(() => typeof izlusciIzbraneBloke === "function"),
    "izlusciIzbraneBloke obstaja");

  // Dva bloka za ISTI mesec v ISTEM zavihku - natanko primer iz prave
  // datoteke. Prvi ima manj izpolnjenih celic (opuščen osnutek).
  const pripravi = () => stran.evaluate(() => {
    const blok = (kdo, koliko) => {
      const v = [["", "C1 odd", "", "DŽINIĆ A.", "STARC E."],
                 ["", "SEPTEMBER", "", "SMS / TZN", "SMS / TZN"]];
      for (let d = 1; d <= 30; d++) {
        v.push(["", d + ". 9. 2026", "TO", d <= koliko ? kdo : "", ""]);
      }
      v.push(["", "Datum: " + (kdo === "STARI" ? "1.8.2026" : "20.8.2026")]);
      return v;
    };
    window.__vzorec = [{ koda: "C1", vrsteVrstic: blok("STARI", 5).concat([[]], blok("NOVI", 30)) }];
  });

  console.log("2) več različic istega meseca: vpraša in uvozi SAMO izbrano");
  await pripravi();
  {
    const izid = await stran.evaluate(async () => {
      let vprasano = null;
      const out = await izlusciIzbraneBloke(window.__vzorec, "2026-09", (p) => {
        vprasano = { koda: p.koda, stevilo: p.bloki.length,
                     opisi: p.bloki.map(b => b.opis + " | " + b.verzija + " | " + b.izpolnjenih) };
        return p.bloki[1]; // uporabnik izbere drugega (novejšega)
      });
      return { vprasano, vrstic: out[0].vrsteVrstic.length,
               vsebina: out[0].vrsteVrstic.slice(2).map(v => v[3]).filter(Boolean) };
    });
    trdi(!!izid.vprasano, "uporabnik je bil vprašan");
    eq(izid.vprasano.stevilo, 2, "ponujeni sta obe različici");
    trdi(/Datum: 1\.8\.2026 \| 5$/.test(izid.vprasano.opisi[0]),
      "prva različica pokaže svoj datum in koliko celic je izpolnjenih: " + izid.vprasano.opisi[0]);
    trdi(/Datum: 20\.8\.2026 \| 30$/.test(izid.vprasano.opisi[1]),
      "druga prav tako: " + izid.vprasano.opisi[1]);
    trdi(izid.vsebina.every(c => c === "NOVI"), "uvozi se SAMO izbrana različica");
    trdi(izid.vsebina.length === 30, `in cel njen mesec (${izid.vsebina.length} dni)`);
  }

  console.log("3) preklic ustavi uvoz – tiho ne vzame nobene");
  await pripravi();
  {
    const napaka = await stran.evaluate(async () => {
      try { await izlusciIzbraneBloke(window.__vzorec, "2026-09", () => null); return null; }
      catch (e) { return e.message; }
    });
    trdi(!!napaka && /preklican/i.test(napaka), "uvoz se ustavi z razlago: " + napaka);
    trdi(/2 različic/.test(napaka || ""), "in pove, koliko različic je našel");
  }

  console.log("4) ena sama različica: vprašanja ni");
  {
    const izid = await stran.evaluate(async () => {
      const v = [["", "C1 odd", "", "DŽINIĆ A."], ["", "SEPTEMBER", "", "SMS / TZN"]];
      for (let d = 1; d <= 30; d++) v.push(["", d + ". 9. 2026", "TO", "dopoldan"]);
      let vprasano = false;
      const out = await izlusciIzbraneBloke([{ koda: "C1", vrsteVrstic: v }], "2026-09",
        () => { vprasano = true; return null; });
      return { vprasano, enako: out[0].vrsteVrstic === v };
    });
    trdi(!izid.vprasano, "uporabnika ne moti po nepotrebnem");
    trdi(izid.enako, "in podatki gredo naprej nespremenjeni");
  }

  console.log("5) drug mesec ne šteje za podvojitev");
  {
    const izid = await stran.evaluate(async () => {
      const blok = (mesec, stMeseca) => {
        const v = [["", "C1 odd", "", "DŽINIĆ A."], ["", mesec, "", "SMS / TZN"]];
        for (let d = 1; d <= 28; d++) v.push(["", d + ". " + stMeseca + ". 2026", "TO", "dopoldan"]);
        return v;
      };
      let vprasano = false;
      await izlusciIzbraneBloke(
        [{ koda: "C1", vrsteVrstic: blok("SEPTEMBER", 9).concat([[]], blok("OKTOBER", 10)) }],
        "2026-09", () => { vprasano = true; return null; });
      return vprasano;
    });
    trdi(!izid, "september in oktober nista dve različici istega meseca");
  }

  const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
