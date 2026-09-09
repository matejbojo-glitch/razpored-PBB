#!/usr/bin/env node
/* Razpredelnica Želje: gostota zapisa in barvanje s potegom.
 *
 * Uporabnikova zahteva (september 2026): razpredelnica mora biti tako
 * gosta kot v Google Preglednici in v celoti na enem zaslonu - brez
 * vodoravnega drsenja tudi pri 31 dneh - barvanje pa mora teči s potegom
 * miške, kot se v preglednici vleče čez celice.
 *
 * Zakaj v brskalniku: gostota je stvar IZMERJENIH pikslov po tem, ko se
 * uveljavijo slog, pisave in pomanjšava. Iz izvorne kode se ne vidi, ali
 * razpredelnica res gre na zaslon - vidi se samo, da smo si to želeli.
 *
 * Zagon: CHROMIUM_PATH=... node skripte/preveri-zelje-gostota.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4297;
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

async function odpri(vloga, imeSeje, sirina) {
  const stran = await brskalnik.newPage({ viewport: { width: sirina || 1400, height: 950 } });
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
        // Peskovnik mora zapise RES hraniti: stran po vsakem vpisu prebere
        // razpredelnico znova, in če bi ponaredek vsakič vrnil prazno, bi
        // barva izginila takoj po tem, ko jo uporabnik nariše. Preizkus bi
        // bil odvisen od tega, ali ga izmerimo pred osvežitvijo ali po njej.
        if (ime === "upsert" || ime === "insert") return (v) => {
          [].concat(v).forEach(r => {
            const i = vrstice.findIndex(x => x.full_name === r.full_name && x.work_date === r.work_date);
            if (i === -1) vrstice.push(Object.assign({}, r)); else vrstice[i] = Object.assign({}, r);
          });
          return Promise.resolve({ data: [], error: null });
        };
        if (ime === "update") return () => Promise.resolve({ data: [], error: null });
        if (ime === "delete") return () => {
          const b2 = new Proxy({}, { get(_, n2) {
            if (n2 === "eq") return (k, v2) => { filtri.push([k, v2]); return b2; };
            if (n2 === "then") return (naprej) => {
              for (let i = vrstice.length - 1; i >= 0; i--) {
                if (filtri.every(([k, v2]) => vrstice[i][k] === v2)) vrstice.splice(i, 1);
              }
              return Promise.resolve({ data: [], error: null }).then(naprej);
            };
            return () => b2;
          }});
          return b2;
        };
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
  await stran.waitForSelector("table.grid", { timeout: 15000 });
  await stran.waitForTimeout(800);
  return { stran, konzola };
}

async function odpriStran(sirina) {
  const { stran, konzola } = await odpri("admin", "Bojić Matej", sirina);
  return { stran, konzola };
}

const brskalnikZapri = async () => { await brskalnik.close(); streznik.close(); };

try {
  console.log("1) razpredelnica gre na en zaslon (1400 px, brez vodoravnega drsenja)");
  {
    const { stran, konzola } = await odpriStran(1400);
    const m = await stran.evaluate(() => {
      const okvir = document.querySelector(".gridScroll");
      const tabela = okvir && okvir.querySelector("table.grid");
      const prvaCelica = okvir && okvir.querySelector("td.cell");
      const ime = okvir && okvir.querySelector("tbody th.nm");
      const glava = okvir && okvir.querySelector("thead tr.dnr th:not(.corner):not(.tot)");
      const st = tabela && getComputedStyle(tabela);
      const r = (el) => el ? el.getBoundingClientRect() : null;
      return {
        drsi: okvir ? okvir.scrollWidth > okvir.clientWidth + 1 : null,
        postavitev: st ? st.tableLayout : null,
        merilo: okvir ? (getComputedStyle(okvir).getPropertyValue("--zeljeMerilo") || "1").trim() : null,
        celica: r(prvaCelica) ? { w: Math.round(r(prvaCelica).width), h: Math.round(r(prvaCelica).height) } : null,
        celicaOblazinjenje: prvaCelica ? getComputedStyle(prvaCelica).padding : null,
        celicaVogal: prvaCelica ? getComputedStyle(prvaCelica).borderRadius : null,
        imeSirina: r(ime) ? Math.round(r(ime).width) : null,
        imeRez: ime ? getComputedStyle(ime).textOverflow : null,
        glavaPisava: glava ? parseFloat(getComputedStyle(glava).fontSize) : null,
        izbiranje: tabela ? (getComputedStyle(tabela).userSelect || getComputedStyle(tabela).webkitUserSelect) : null,
        stDni: okvir ? okvir.querySelectorAll("tbody tr:not(.oddGroup) td.cell").length : 0,
      };
    });
    trdi(m.drsi === false, "okvir ne drsi vodoravno");
    trdi(m.postavitev === "fixed", "tabela ima table-layout: fixed (dobil: " + m.postavitev + ")");
    trdi(!!m.celica && m.celica.h <= 22 && m.celica.w <= 40,
      `celica je nizka in ozka (${m.celica && m.celica.w}x${m.celica && m.celica.h})`);
    trdi(m.celicaOblazinjenje === "0px", "celica je brez oblazinjenja (" + m.celicaOblazinjenje + ")");
    trdi(m.celicaVogal === "0px", "barva zapolni celico do roba, brez zaobljenih vogalov (" + m.celicaVogal + ")");
    trdi(m.imeSirina !== null && m.imeSirina >= 120 && m.imeSirina <= 245,
      `stolpec z imeni je omejen (${m.imeSirina} px) – preostanek širine gre njemu, ne v redke kvadratke`);
    trdi(m.imeRez === "ellipsis", "dolgo ime se odreže s tremi pikami");
    trdi(m.glavaPisava !== null && m.glavaPisava <= 10, `glava je drobna (${m.glavaPisava} px)`);
    trdi(m.izbiranje === "none", "barvanje ne izbira besedila (user-select: " + m.izbiranje + ")");
    const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
    await stran.close();
  }

  console.log("2) na ozkem prenosniku se razpredelnica pomanjša, namesto da bi drsela");
  {
    const { stran } = await odpriStran(1000);
    await stran.waitForTimeout(600);
    const m = await stran.evaluate(() => {
      const okvir = document.querySelector(".gridScroll");
      return {
        drsi: okvir ? okvir.scrollWidth > okvir.clientWidth + 1 : null,
        merilo: okvir ? parseFloat(getComputedStyle(okvir).getPropertyValue("--zeljeMerilo") || "1") : null,
      };
    });
    trdi(m.drsi === false, "tudi pri 1000 px ne drsi vodoravno");
    trdi(m.merilo !== null && m.merilo > 0 && m.merilo <= 1,
      `merilo je smiselno (${m.merilo}) – 1 pomeni, da je stiskanje v slogu zadoščalo`);
    await stran.close();
  }

  console.log("3) na telefonu ostane drsenje – 31 stolpcev tam ne more biti berljivih");
  {
    const { stran } = await odpriStran(390);
    await stran.waitForTimeout(400);
    const m = await stran.evaluate(() => {
      const okvir = document.querySelector(".gridScroll");
      const tabela = okvir && okvir.querySelector("table.grid");
      return {
        postavitev: tabela ? getComputedStyle(tabela).tableLayout : null,
        merilo: okvir ? (getComputedStyle(okvir).getPropertyValue("--zeljeMerilo") || "1").trim() : null,
      };
    });
    trdi(m.postavitev === "auto", "kompaktni način pod 900 px ne velja (" + m.postavitev + ")");
    trdi(m.merilo === "" || parseFloat(m.merilo) === 1, "in razpredelnica se ne pomanjšuje (" + m.merilo + ")");
    await stran.close();
  }

  console.log("4) barvanje s potegom pobarva cel niz celic, ne le prve");
  {
    const { stran } = await odpriStran(1400);
    // Pero LD je za admina med peresi; izberemo ga izrecno.
    await stran.click('.penBtn:has-text("Letni dopust")');
    await stran.waitForTimeout(200);

    const vrstica = await stran.$("tbody tr:not(.oddGroup)");
    const celice = await vrstica.$$("td.cell");
    trdi(celice.length >= 5, "vrstica ima dovolj dni za poteg (" + celice.length + ")");

    // Naslov skupine je LEPLJIV in se ustavi pod glavo. Če se ustavi
    // prenizko, obleži čez prvo vrstico podatkov in ta preneha odzivati se
    // na klik in poteg - napaka je videti kot okvara barvanja, v resnici pa
    // je napačen odmik. Zato se izrecno preveri, kaj je nad prvo celico.
    const prekritje = await stran.evaluate(() => {
      const okvir = document.querySelector(".gridScroll");
      okvir.scrollTop = 0;
      const c = document.querySelector("tbody tr:not(.oddGroup) td.cell");
      const r = c.getBoundingClientRect();
      const naVrhu = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
      return { pod: naVrhu ? (naVrhu.tagName + "." + naVrhu.className) : null,
               jeCelica: !!(naVrhu && naVrhu.classList && naVrhu.classList.contains("cell")) };
    });
    trdi(prekritje.jeCelica, "naslov skupine ne prekriva prve vrstice (nad njo je " + prekritje.pod + ")");

    const skatla = async (el) => { const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const a = await skatla(celice[1]);
    const b = await skatla(celice[4]);
    await stran.mouse.move(a.x, a.y);
    await stran.mouse.down();
    // Vmesni koraki so nujni: brez njih brskalnik pošlje en sam skok in
    // celice med njima ne dobijo dogodka.
    for (let i = 1; i <= 6; i++) {
      await stran.mouse.move(a.x + (b.x - a.x) * i / 6, a.y);
      await stran.waitForTimeout(30);
    }
    await stran.mouse.up();
    await stran.waitForTimeout(400);

    const pobarvane = await vrstica.$$eval("td.cell",
      e => e.map(x => !!(x.style.backgroundColor && x.style.backgroundColor !== "transparent")));
    const kolikoVNizu = pobarvane.slice(1, 5).filter(Boolean).length;
    trdi(kolikoVNizu >= 4, `poteg je pobarval ves niz (${kolikoVNizu} od 4)`);
    trdi(!pobarvane[0], "in ni pobarval celice pred začetkom poteza");
    trdi(!pobarvane[5], "ne celice za koncem poteza");
    await stran.close();
  }

  console.log("5) poteg ne označi besedila (sicer je videti kot okvara)");
  {
    const { stran } = await odpriStran(1400);
    await stran.click('.penBtn:has-text("Letni dopust")');
    const vrstica = await stran.$("tbody tr:not(.oddGroup)");
    const celice = await vrstica.$$("td.cell");
    const b1 = await celice[1].boundingBox(), b2 = await celice[6].boundingBox();
    await stran.mouse.move(b1.x + 4, b1.y + 4);
    await stran.mouse.down();
    for (let i = 1; i <= 6; i++) { await stran.mouse.move(b1.x + (b2.x - b1.x) * i / 6, b1.y + 4); }
    const izbrano = await stran.evaluate(() => String(window.getSelection()));
    await stran.mouse.up();
    trdi(izbrano.trim() === "", "med potegom ni označenega besedila (»" + izbrano.slice(0, 30) + "«)");
    await stran.close();
  }
} finally {
  await brskalnikZapri();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
