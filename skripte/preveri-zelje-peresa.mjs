#!/usr/bin/env node
/* Kdo sme v Željah vpisati KAJ, in kaj se zgodi, ko STI prekrije dopust.
 *
 * Uporabnikova zahteva (september 2026):
 *   - administrator in vodja vidita vsa peresa: OM (omejitev), BS, STI,
 *     KRO, LD in Izbriši;
 *   - navaden zaposleni vidi SAMO LD in Izbriši - bolniška pride iz
 *     Kadrisa, izobraževanje odobri vodja, kroženje se dogovori med
 *     oddelki, omejitve pa niso njegova odločitev;
 *   - kadar se STI vpiše čez dan, ki je bil LETNI DOPUST, mora aplikacija
 *     to POVEDATI in dan dopusta vrniti med neizkoriščene.
 *
 * Zakaj v brskalniku: gre za to, kaj uporabnik VIDI in kaj se zgodi ob
 * kliku. Iz izvorne kode se ne vidi, ali je pero res izrisano in ali se
 * potrditveno vprašanje res pojavi.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-zelje-peresa.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4291;
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
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const streznik = http.createServer((z, o) => {
  const pot = decodeURIComponent(z.url.split("?")[0]);
  const f = join(koren, pot === "/" ? "/zelje.html" : pot);
  if (!f.startsWith(koren) || !existsSync(f) || statSync(f).isDirectory()) { o.writeHead(404); return o.end("404"); }
  let v = readFileSync(f);
  if (extname(f) === ".html") v = prevediJsxVHtmlu(v.toString("utf8"));
  o.writeHead(200, { "Content-Type": TIP[extname(f)] || "application/octet-stream" });
  o.end(v);
});
await new Promise(r => streznik.listen(VRATA, r));

const zdaj = new Date();
const MESEC = zdaj.getMonth(), LETO = zdaj.getFullYear();
const iso = (d) => LETO + "-" + String(MESEC + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");

const PROFILI = [
  { full_name: "Bojić Matej", role: "admin", department_code: "NZV" },
  { full_name: "Zupan Meta", role: "vodja", department_code: "B" },
  { full_name: "Novak Ana", role: "user", department_code: "B" },
];
// Novak Ana ima 3. v mesecu LETNI DOPUST - čez tega bomo vpisali STI.
const ODSOTNOSTI = [{ full_name: "Novak Ana", work_date: iso(3), kind: "ld" }];

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function odpri(vloga, imeSeje) {
  const stran = await brskalnik.newPage({ viewport: { width: 1400, height: 950 } });
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  const zapisi = [];
  await stran.exposeFunction("zabeleziZapis", (o) => { zapisi.push(o); });
  await stran.addInitScript(({ profili, odsotnosti, vloga, imeSeje }) => {
    const poizvedba = (vrstice, tabela) => {
      const filtri = [];
      const b = new Proxy({}, { get(_, ime) {
        if (ime === "eq") return (k, v) => { filtri.push([k, v]); return b; };
        if (ime === "then") return (naprej) => Promise.resolve({
          data: vrstice.filter(r => filtri.every(([k, v]) => r[k] === v)), error: null }).then(naprej);
        if (ime === "upsert" || ime === "insert") return (v) => {
          if (tabela === "odsotnosti") window.zabeleziZapis({ op: "upsert", v });
          return Promise.resolve({ data: [], error: null });
        };
        if (ime === "update") return () => Promise.resolve({ data: [], error: null });
        if (ime === "delete") return () => { if (tabela === "odsotnosti") window.zabeleziZapis({ op: "delete" }); return poizvedba([], tabela); };
        if (typeof ime !== "string") return undefined;
        return () => b;
      }});
      return b;
    };
    const tabele = { profili, odsotnosti, zelje_zaposlenih: [], dnevnik_odsotnosti: [], barvne_oznake: [] };
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", { configurable: true,
      get() { return pravi; },
      set(v) {
        pravi = v;
        if (v && typeof v === "object") {
          const seja = { session: { user: { id: "p", email: "p@test" } },
            profile: { id: "p", role: vloga, full_name: imeSeje, department_code: "B" }, ogled: false };
          v.client = { from: (t) => poizvedba(tabele[t] || [], t), auth: {
            getSession: () => Promise.resolve({ data: { session: seja.session } }),
            getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          }};
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
        }
      },
    });
  }, { profili: PROFILI, odsotnosti: ODSOTNOSTI, vloga, imeSeje });
  await stran.goto(`http://127.0.0.1:${VRATA}/zelje.html`, { waitUntil: "load" });
  await stran.waitForSelector(".penRow", { timeout: 15000 });
  await stran.waitForTimeout(700);
  // Mreža se odpre na SVOJI skupini prijavljenega; Novak Ana je na
  // oddelku B, zato tja preklopimo, sicer njene vrstice sploh ni.
  const gumbB = await stran.$('.skupinaBtn:text-is("B")');
  if (gumbB) { await gumbB.click(); await stran.waitForTimeout(600); }
  return { stran, konzola, zapisi };
}

const peresa = (stran) => stran.$$eval(".penRow .penBtn", els => els.map(e => e.textContent.trim()));

try {
  console.log("1) administrator vidi vsa peresa");
  {
    const { stran } = await odpri("admin", "Bojić Matej");
    eq(await peresa(stran),
      ["OM (omejitev)", "BS (bolniška)", "STI (strokovno izobraževanje)", "KRO (kroženje)", "LD (letni dopust)", "Izbriši"],
      "OM, BS, STI, KRO, LD in Izbriši, v naročenem vrstnem redu");
    await stran.close();
  }

  console.log("2) vodja vidi enako kot administrator");
  {
    const { stran } = await odpri("vodja", "Zupan Meta");
    eq(await peresa(stran),
      ["OM (omejitev)", "BS (bolniška)", "STI (strokovno izobraževanje)", "KRO (kroženje)", "LD (letni dopust)", "Izbriši"],
      "vodja ni omejen – prav on vodi te dogovore");
    await stran.close();
  }

  console.log("3) navaden zaposleni vidi SAMO letni dopust in brisanje");
  {
    const { stran } = await odpri("user", "Novak Ana");
    eq(await peresa(stran), ["LD (letni dopust)", "Izbriši"],
      "bolniška, izobraževanje, kroženje in omejitev niso njegova odločitev");
    // Ni dovolj, da gumba ni: privzeto izbrano pero mora biti veljavno,
    // sicer bi prvi klik v mrežo vpisal vrsto, ki je ta vloga ne sme.
    const izbrano = await stran.$eval(".penRow .penBtn.active", e => e.textContent.trim());
    trdi(izbrano === "LD (letni dopust)", "privzeto izbrano pero je LD: " + izbrano);
    await stran.close();
  }

  console.log("4) STI čez LD: aplikacija vpraša in pove, da se dan dopusta vrne");
  {
    const { stran, zapisi } = await odpri("admin", "Bojić Matej");
    let vprasanje = null;
    stran.on("dialog", async d => { vprasanje = d.message(); await d.accept(); });

    // Izberi pero STI in klikni na celico, ki ima LD (Novak Ana, 3. v mesecu).
    await stran.click('.penBtn:has-text("STI")');
    await stran.waitForTimeout(200);
    const celica = `td[data-ime="Novak Ana"][data-iso="${iso(3)}"]`;
    trdi((await stran.$$(celica)).length === 1, "celica z letnim dopustom obstaja v mreži");
    const barvaPrej = await stran.$eval(celica, e => e.style.backgroundColor);
    await stran.click(celica);
    await stran.waitForTimeout(800);

    trdi(!!vprasanje && /LETNI DOPUST/i.test(vprasanje),
      "aplikacija vpraša za potrditev: " + (vprasanje || "NI VPRAŠALA").split("\n")[0]);
    trdi(!!vprasanje && /vrne med neizkoriščene/i.test(vprasanje),
      "in pove, da se dan dopusta vrne med neizkoriščene");
    const barvaPotem = await stran.$eval(celica, e => e.style.backgroundColor);
    trdi(barvaPrej !== barvaPotem, `celica je dobila barvo STI (${barvaPrej} → ${barvaPotem})`);
    trdi(zapisi.some(z => z.op === "upsert" && z.v && z.v.kind === "sti"),
      "v bazo gre ena sama vrstica, vrste 'sti' (ključ ime+dan, zato LD odpade)");
    const status = (await stran.innerText(".monthRow")).replace(/\s+/g, " ");
    trdi(/vrnjen med neizkoriščene/i.test(status),
      "po shranjevanju to piše tudi v vrstici stanja: " + status);
    await stran.close();
  }

  console.log("5) preklic vprašanja pusti dopust pri miru");
  {
    const { stran, zapisi } = await odpri("admin", "Bojić Matej");
    stran.on("dialog", async d => { await d.dismiss(); });
    await stran.click('.penBtn:has-text("STI")');
    await stran.waitForTimeout(200);
    const celica = `td[data-ime="Novak Ana"][data-iso="${iso(3)}"]`;
    const barvaPrej = await stran.$eval(celica, e => e.style.backgroundColor);
    await stran.click(celica);
    await stran.waitForTimeout(700);
    const barvaPotem = await stran.$eval(celica, e => e.style.backgroundColor);
    trdi(barvaPrej === barvaPotem, "barva celice se ni spremenila");
    trdi(!zapisi.some(z => z.op === "upsert"), "in v bazo ni šlo nič");
    await stran.close();
  }

  console.log("6) STI na PRAZNO celico ne sprašuje ničesar");
  {
    const { stran, zapisi } = await odpri("admin", "Bojić Matej");
    let vprasanje = null;
    stran.on("dialog", async d => { vprasanje = d.message(); await d.accept(); });
    await stran.click('.penBtn:has-text("STI")');
    await stran.waitForTimeout(200);
    await stran.click(`td[data-ime="Novak Ana"][data-iso="${iso(4)}"]`);
    await stran.waitForTimeout(700);
    trdi(vprasanje === null, "brez vprašanja – ni kaj nadomestiti");
    trdi(zapisi.some(z => z.op === "upsert" && z.v && z.v.kind === "sti"), "vnos je vseeno shranjen");
    await stran.close();
  }
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
