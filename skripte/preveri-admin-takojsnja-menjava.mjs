#!/usr/bin/env node
/* Administrator lahko v SKRAJNEM primeru (zaposleni sam ne utegne/ne more
 * iti skozi navadni postopek menjave) izvede menjavo TAKOJ, mimo čakanja na
 * potrditev sodelavca in vodje - uporabnikova izrecna zahteva (avgust 2026):
 * "naredi tako da lahko administrator naredi menjavo razporeda kakor koli v
 * skrajnem primeru, če zaposleni ne utegne". Uporabnikova odločitev: trde
 * varovalke (počitek, spolno pravilo C1/D, razmik dežurstev) OSTANEJO - te
 * preveri obrazec_admin_izvedi_menjavo prek deljene izvedi_menjavo_izmen,
 * enako kot obrazec_potrdi_koordinator (glej preveri-menjava-integracija.mjs
 * scenarij 16 za preverbo na pravi bazi).
 *
 * Tu se preveri UI stran (obrazec.html): da navaden zaposleni te poti sploh
 * NE VIDI, da admin vidi izbirnik "za koga", da klik na "Izvedi takoj" kliče
 * PRAVO funkcijo (obrazec_admin_izvedi_menjavo, ne obrazec_oddaj) s pravimi
 * argumenti - in da prekinjen native confirm() ničesar ne pošlje.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-admin-takojsnja-menjava.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4249;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

console.log("1) shema: obrazec_admin_izvedi_menjavo obstaja, je admin-only, in deli VAROVALKE z navadno potrditvijo");
{
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");

  const admFn = shema.slice(shema.indexOf("function public.obrazec_admin_izvedi_menjavo"));
  const admTelo = admFn.slice(0, admFn.indexOf("\n$$;"));
  trdi(admTelo.length > 0 && admTelo.length < 5000, "funkcija je najdena");
  trdi(/if not public\.current_role_is\('admin'\) then/.test(admTelo),
    "zahteva vlogo admin, brez izjeme");
  trdi(/if p_vlagatelj_id = p_sodelavec_id then/.test(admTelo),
    "zavrne, če je vlagatelj enak sodelavcu");
  trdi(/perform public\.izvedi_menjavo_izmen\(/.test(admTelo),
    "izvedbo (in varovalke) prepusti DELJENI izvedi_menjavo_izmen, ne podvoji logike");
  trdi(/'zakljucen', auth\.uid\(\), now\(\)/.test(admTelo), "obrazec se zapiše že kot 'zakljucen' (sled/zgodovina)");

  // past: če bi kdo v obrazec_potrdi_koordinator spet podvojil menjava_sluzbe
  // logiko namesto klica izvedi_menjavo_izmen, bi ta dve poti (admin-takoj in
  // navadna potrditev) lahko tiho razšli varovalke - enak razred hrošča kot
  // izmena_cas/izmene.js prej to sejo.
  const stevKlicev = (shema.match(/public\.izvedi_menjavo_izmen\(/g) || []).length;
  trdi(stevKlicev >= 3,
    `izvedi_menjavo_izmen se kliče iz OBEH poti (definicija + 2 klicatelja) - najdenih ${stevKlicev} pojavitev`);
}

// Od prehoda na Vite babel.min.js ni več v *.html - inline JSX mora ta
// strežnik prevesti sam (isti pristop kot vite.config.mjs).
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
  const dat = join(koren, pot === "/" ? "obrazec.html" : pot);
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

const ZAPOSLENI = [
  { id: "u-x", full_name: "Bolan Boris" },
  { id: "u-y", full_name: "Prost Peter" },
];
const KANDIDAT = { profile_id: "u-y", full_name: "Prost Peter", njihova_izmena: "Nočna", njihov_datum: "2026-10-06", jaz_pridem_prej: false };

async function odpri(profil, { potrdiDialog } = { potrdiDialog: true }) {
  const stran = await brskalnik.newPage({ viewport: { width: 1200, height: 900 } });
  await stran.route("**://fonts.googleapis.com/**", r => r.abort());
  await stran.route("**://fonts.gstatic.com/**", r => r.abort());
  const konzola = [];
  const klici = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  stran.on("dialog", async (d) => { if (potrdiDialog) await d.accept(); else await d.dismiss(); });
  await stran.exposeFunction("zabeleziKlic", (ime, arg) => klici.push({ ime, arg }));
  await stran.addInitScript(({ profil, zaposleni, kandidat }) => {
    const poizvedba = (v) => {
      const b = new Proxy({}, { get(_, n) {
        if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
        if (n === "insert" || n === "upsert") return () => Promise.resolve({ data: [], error: null });
        if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data: Array.isArray(v) ? (v[0] || null) : v, error: null });
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
          const seja = { session: { user: { id: profil.id } }, profile: profil, ogled: false };
          v.client = {
            from: (t) => poizvedba(t === "profili" ? zaposleni : (t === "razpored" ? null : [])),
            rpc: (ime, arg) => {
              window.zabeleziKlic(ime, arg);
              if (ime === "mozni_sodelavci") return Promise.resolve({ data: [kandidat], error: null });
              if (ime === "mozni_prejemniki_dezurstva") return Promise.resolve({ data: [], error: null });
              if (ime === "obrazec_admin_izvedi_menjavo") return Promise.resolve({ data: "novi-obrazec-id", error: null });
              return Promise.resolve({ data: null, error: null });
            },
            auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
          };
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
          v.getSessionAndProfile = () => Promise.resolve(seja);
        }
      },
    });
  }, { profil, zaposleni: ZAPOSLENI, kandidat: KANDIDAT });
  await stran.goto(`http://127.0.0.1:${VRATA}/obrazec.html`, { waitUntil: "load" });
  await stran.waitForTimeout(1000);
  return { stran, konzola, klici };
}

try {
  console.log("2) navaden zaposleni admin-takojšnje poti sploh ne vidi");
  {
    const { stran, konzola } = await odpri({ id: "u", role: "user", full_name: "Novak Ana" });
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(!/Izvedi menjavo namesto drugega zaposlenega/i.test(besedilo),
      "navaden uporabnik ne vidi stikala za admin-takojšnjo menjavo");
    const konzolaPrave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(konzolaPrave.length === 0, "brez (pravih) napak v konzoli: " + konzolaPrave.join(" | "));
    await stran.close();
  }

  console.log("3) vodja (ni admin) prav tako ne vidi te poti");
  {
    const { stran } = await odpri({ id: "v", role: "vodja", full_name: "Vodja Vera" });
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(!/Izvedi menjavo namesto drugega zaposlenega/i.test(besedilo),
      "vodja brez admin vloge ne vidi stikala");
    await stran.close();
  }

  console.log("4) administrator vidi stikalo, izbere osebo, poišče sodelavca in IZVEDE TAKOJ - kliče pravo RPC s pravimi argumenti");
  {
    const { stran, klici, konzola } = await odpri({ id: "a", role: "admin", full_name: "Admin Ana" });
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(/Izvedi menjavo namesto drugega zaposlenega/i.test(besedilo), "admin vidi stikalo");

    await stran.click("#zaDrugega");
    await stran.waitForTimeout(300);
    const gumbOb = await stran.$("button.submitBtn");
    trdi(!!gumbOb && await gumbOb.isDisabled(), "gumb je onemogočen, dokler oseba ni izbrana");

    await stran.selectOption("select", "u-x");
    await stran.waitForTimeout(200);
    trdi((await stran.locator("label:has-text('Datum (Bolan Boris)')").count()) === 1,
      "polje se preimenuje po izbrani osebi, ne po adminu samem");

    await stran.fill("#da", "2026-10-05");
    await stran.waitForTimeout(200);
    await stran.click("button:has-text('Poišči sodelavce za menjavo')");
    await stran.waitForTimeout(300);
    trdi(klici.some(k => k.ime === "mozni_sodelavci" && k.arg.p_profile_id === "u-x"),
      "iskanje sodelavcev gre za IZBRANO osebo (u-x), ne za admina (a): " + JSON.stringify(klici.map(k => [k.ime, k.arg && k.arg.p_profile_id])));

    await stran.click("button.candBtn");
    await stran.waitForTimeout(200);
    trdi((await stran.locator("button:has-text('Izvedi takoj')").count()) === 1,
      "gumb se preimenuje v 'Izvedi takoj', ko je oseba za menjavo izbrana");

    await stran.click("button:has-text('Izvedi takoj')");
    await stran.waitForTimeout(400);
    const klicIzvedbe = klici.find(k => k.ime === "obrazec_admin_izvedi_menjavo");
    trdi(!!klicIzvedbe, "klicana je obrazec_admin_izvedi_menjavo (ne obrazec_oddaj): " + JSON.stringify(klici.map(k => k.ime)));
    if (klicIzvedbe) {
      trdi(klicIzvedbe.arg.p_vlagatelj_id === "u-x", "vlagatelj je IZBRANI zaposleni, ne admin: " + klicIzvedbe.arg.p_vlagatelj_id);
      trdi(klicIzvedbe.arg.p_sodelavec_id === "u-y", "sodelavec je izbrani kandidat: " + klicIzvedbe.arg.p_sodelavec_id);
      trdi(klicIzvedbe.arg.p_dan_a === "2026-10-05" && klicIzvedbe.arg.p_dan_b === "2026-10-06",
        "oba datuma sta pravilna: " + klicIzvedbe.arg.p_dan_a + " / " + klicIzvedbe.arg.p_dan_b);
    }
    trdi(!klici.some(k => k.ime === "obrazec_oddaj"), "navaden obrazec_oddaj se NI poklical - šlo je mimo verige");
    const konzolaPrave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(konzolaPrave.length === 0, "brez (pravih) napak v konzoli: " + konzolaPrave.join(" | "));
    await stran.close();
  }

  console.log("5) preklican native confirm() ne pošlje ničesar");
  {
    const { stran, klici } = await odpri({ id: "a", role: "admin", full_name: "Admin Ana" }, { potrdiDialog: false });
    await stran.click("#zaDrugega");
    await stran.waitForTimeout(200);
    await stran.selectOption("select", "u-x");
    await stran.fill("#da", "2026-10-05");
    await stran.click("button:has-text('Poišči sodelavce za menjavo')");
    await stran.waitForTimeout(300);
    await stran.click("button.candBtn");
    await stran.waitForTimeout(200);
    await stran.click("button:has-text('Izvedi takoj')");
    await stran.waitForTimeout(300);
    trdi(!klici.some(k => k.ime === "obrazec_admin_izvedi_menjavo"),
      "preklic potrditvenega okna NE izvede menjave");
    await stran.close();
  }

  console.log("");
  if (napake.length) { console.error(`NEUSPEŠNO – ${napake.length} napak`); napake.forEach(n => console.error("  - " + n)); process.exit(1); }
  console.log("VSE V REDU");
} finally {
  await brskalnik.close();
  streznik.close();
}
