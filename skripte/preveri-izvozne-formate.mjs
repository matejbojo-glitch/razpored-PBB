#!/usr/bin/env node
/* Vsi izvozni formati na enem viru: Excel, Google Sheets, PDF, JSON, PNG, JPEG.
 *
 * Kaj se tu varuje: uporabnik je zahteval, da je VSAK izvoz na voljo v vseh
 * teh oblikah. Meni je skupen (export-buttons.js), zato en sam manjkajoč
 * vnos pomeni manjkajoč format na vseh 14 izvoznih virih hkrati.
 *
 * Preverja se tudi, da datoteka RES nastane in da je prava - ne le, da se
 * gumb izriše. JSON se prebere in primerja s podatki, sliki se preveri
 * glava datoteke (PNG/JPEG podpis), Excel pa ZIP podpis.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-izvozne-formate.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4238;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

// ----------------------------------------------------- 1) meni ponudi vse
console.log("1) izvozni meni ponudi vse zahtevane oblike");
{
  const eb = readFileSync(join(koren, "export-buttons.js"), "utf8");
  for (const [opis, vzorec] of [
    ["Excel (.xlsx)", /Izvozi Excel \(\.xlsx\)/],
    ["Google Sheets", /Sinhroniziraj z Google Sheets/],
    ["PDF", /Izvozi PDF/],
    ["JSON", /Izvozi JSON \(\.json\)/],
    ["PNG", /Izvozi sliko \(\.png\)/],
    ["JPEG", /Izvozi sliko \(\.jpg\)/],
  ]) trdi(vzorec.test(eb), `meni ima ${opis}`);

  const eu = readFileSync(join(koren, "export-utils.js"), "utf8");
  for (const f of ["izvoziXLSX", "izvoziJSON", "izvoziPNG", "izvoziJPEG", "izvoziPDF"])
    trdi(new RegExp(f + "\\b").test(eu), `ExportUtils.${f} obstaja`);
  trdi(/showSaveFilePicker/.test(eu), "»shrani kot« (showSaveFilePicker) je uporabljen");
  trdi(/AbortError/.test(eu), "in preklic v oknu »shrani kot« se ne šteje za napako");
  trdi(/pripraviCilj/.test(eu), "izbira datoteke je ločena od izdelave (pripraviCilj)");
}

// --------------------------------------------------------- 2) strežnik
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

// Preizkusna stran z enim izvoznim virom - meni je skupen, zato zadošča en
// vir, da se preverijo vse oblike.
const PREIZKUSNA = `<!doctype html><html lang="sl"><head><meta charset="utf-8"><title>t</title></head>
<body><div id="root"></div>
<script src="vendor-app.min.js"></script>
<script src="export-utils.js"></script>
<script src="print-fit.js"></script>
<script src="export-buttons.js"></script>
<script type="text/babel" data-presets="react">
const LISTI = [{ ime: "Šumniki čžš", glave: ["Ime", "Dan", "Izmena"], vrstice: [
  ["Bojić Matej", "1.9.2026", "DOP"],
  ["Salkić Maruša", "2.9.2026", "N12"],
]}];
function App(){
  return (<div>
    <RazporedIzvozVir naziv="Preizkus" naslov="preizkus-izvoz"
      pripravi={() => { if (window.__pripraviKlican) window.__pripraviKlican(); return LISTI; }} />
    <RazporedOrodja/>
  </div>);
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
</script></body></html>`;

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const stran = await brskalnik.newPage({ acceptDownloads: true });
  await stran.route("**://fonts.googleapis.com/**", r => r.abort());
  await stran.route("**://fonts.gstatic.com/**", r => r.abort());
  await stran.route("**/preizkus.html*", r =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: prevediJsxVHtmlu(PREIZKUSNA) }));
  const konzola = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  await stran.goto(`http://127.0.0.1:${VRATA}/preizkus.html`, { waitUntil: "load" });
  await stran.waitForTimeout(400);

  console.log("2) datoteke res nastanejo in so prave");

  // Brskalnik brez zaslona nima okna "Shrani kot", zato ga podtaknemo:
  // zapisane bajte prestrežemo in preverimo vsebino. S tem se preizkusi
  // PRVA pot (prava "shrani kot"), ki je v Chromu in Edgeu tudi običajna.
  await stran.evaluate(() => {
    window.__zapisano = null;
    window.showSaveFilePicker = async (moznosti) => {
      const kosi = [];
      return {
        __ime: moznosti.suggestedName,
        createWritable: async () => ({
          write: async (b) => { kosi.push(b); },
          close: async () => {
            const blob = new Blob(kosi);
            const buf = await blob.arrayBuffer();
            window.__zapisano = { ime: moznosti.suggestedName, bajti: Array.from(new Uint8Array(buf)) };
          },
        }),
      };
    };
  });

  async function shraniKot(besedilo) {
    await stran.evaluate(() => { window.__zapisano = null; });
    await stran.click(".dlIconBtn");
    await stran.click(`.dlMenuItem:has-text("${besedilo}")`);
    await stran.waitForFunction(() => window.__zapisano !== null, null, { timeout: 15000 });
    const z = await stran.evaluate(() => window.__zapisano);
    return { ime: z.ime, vsebina: Buffer.from(z.bajti) };
  }
  const prenesi = shraniKot;

  // JSON – edini format, ki ga je mogoče prebrati nazaj in primerjati
  // vsebino, zato je tu preverjen najbolj natančno (šumniki vključno).
  {
    const d = await prenesi("Izvozi JSON");
    trdi(/\.json$/.test(d.ime), `ime je ${d.ime}`);
    let o = null;
    try { o = JSON.parse(d.vsebina.toString("utf8")); } catch (e) { /* ostane null */ }
    trdi(!!o, "je veljaven JSON");
    trdi(o && o.listi && o.listi.length === 1, "ima en list");
    trdi(o && o.listi[0].ime === "Šumniki čžš", "šumniki v imenu lista so ohranjeni");
    trdi(o && JSON.stringify(o.listi[0].glave) === JSON.stringify(["Ime", "Dan", "Izmena"]), "glave so iste");
    trdi(o && o.listi[0].vrstice.length === 2, "obe vrstici sta zapisani");
    trdi(o && o.listi[0].vrstice[0][0] === "Bojić Matej", "vrednost s šumnikom je ohranjena");
  }

  {
    const d = await prenesi("Izvozi sliko (.png)");
    trdi(/\.png$/.test(d.ime), `ime je ${d.ime}`);
    trdi(d.vsebina.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
      "vsebina ima podpis PNG");
    trdi(d.vsebina.length > 1000, `slika ni prazna (${d.vsebina.length} B)`);
  }

  {
    const d = await prenesi("Izvozi sliko (.jpg)");
    trdi(/\.jpg$/.test(d.ime), `ime je ${d.ime}`);
    trdi(d.vsebina[0] === 0xff && d.vsebina[1] === 0xd8, "vsebina ima podpis JPEG");
    trdi(d.vsebina.length > 1000, `slika ni prazna (${d.vsebina.length} B)`);
  }

  {
    const d = await prenesi("Izvozi Excel");
    trdi(/\.xlsx$/.test(d.ime), `ime je ${d.ime}`);
    trdi(d.vsebina[0] === 0x50 && d.vsebina[1] === 0x4b, "vsebina ima podpis ZIP (xlsx)");
  }

  console.log("2b) okno »shrani kot« se odpre PRED izdelavo datoteke");
  {
    // To ni podrobnost sloga, ampak pogoj, da okno sploh deluje: brskalnik
    // ga dovoli le, dokler traja obdelava klika. Če bi ga odprli za
    // asinhrono izdelavo datoteke, ga Chrome zavrne z varnostno napako.
    // Zato se vrstni red preverja ob IZVAJANJU, ne z iskanjem po besedilu -
    // besedilo "pripraviCilj" se pojavi tudi v pojasnilu nad kodo.
    await stran.evaluate(() => {
      window.__zaporedje = [];
      window.__zapisano = null;
      const pravi = window.ExportUtils.pripraviCilj;
      window.ExportUtils.pripraviCilj = function (ime, vrsta) {
        window.__zaporedje.push("okno");
        return pravi.call(this, ime, vrsta);
      };
      window.__pripraviKlican = () => window.__zaporedje.push("podatki");
    });
    await stran.click(".dlIconBtn");
    await stran.click('.dlMenuItem:has-text("Izvozi JSON")');
    await stran.waitForFunction(() => window.__zapisano !== null, null, { timeout: 15000 });
    const zap = await stran.evaluate(() => window.__zaporedje);
    trdi(zap[0] === "okno" && zap.indexOf("podatki") > 0,
      "najprej okno, nato podatki – dobil: " + JSON.stringify(zap));
  }

  console.log("3) brez okna »shrani kot« (Firefox, Safari) datoteka pade na običajen prenos");
  {
    await stran.evaluate(() => { delete window.showSaveFilePicker; });
    await stran.click(".dlIconBtn");
    const [prenos] = await Promise.all([
      stran.waitForEvent("download", { timeout: 15000 }),
      stran.click('.dlMenuItem:has-text("Izvozi JSON")'),
    ]);
    trdi(/\.json$/.test(prenos.suggestedFilename()),
      `prenos se je vseeno zgodil: ${prenos.suggestedFilename()}`);
  }

  console.log("3b) preklic v oknu »shrani kot« ne shrani ničesar in ne javi napake");
  {
    await stran.evaluate(() => {
      window.__zapisano = null;
      window.showSaveFilePicker = async () => {
        const e = new Error("preklic"); e.name = "AbortError"; throw e;
      };
    });
    await stran.click(".dlIconBtn");
    let prenosov = 0;
    const stej = () => { prenosov++; };
    stran.on("download", stej);
    await stran.click('.dlMenuItem:has-text("Izvozi JSON")');
    await stran.waitForTimeout(800);
    stran.off("download", stej);
    trdi(prenosov === 0, "nič se ni preneslo");
    trdi(await stran.evaluate(() => window.__zapisano) === null, "nič se ni zapisalo");
    trdi((await stran.$$eval(".dlMenuMsg.err", e => e.length)) === 0, "in ni sporočila o napaki");
  }

  console.log("3c) izvožen JSON se prebere NAZAJ v iste podatke (sklenjen krog)");
  {
    // Brez tega bi splošno branje JSON-a naš izvoz razumelo kot seznam
    // zapisov in iz njega naredilo tabelo s stolpci "ime", "glave" in
    // "vrstice" - izvoz in uvoz se ne bi ujela. Tu se preveri prav to.
    await stran.addScriptTag({ url: "/import-utils.js" });
    const nazaj = await stran.evaluate(async () => {
      const izvoz = {
        aplikacija: "Razpored PBB", razlicica: 1, nastalo: new Date().toISOString(),
        naslov: "preizkus-izvoz",
        listi: [
          { ime: "Šumniki čžš", glave: ["Ime", "Dan", "Izmena"],
            vrstice: [["Bojić Matej", "1.9.2026", "DOP"], ["Salkić Maruša", "2.9.2026", "N12"]] },
          { ime: "Drugi list", glave: ["A"], vrstice: [["1"]] },
        ],
      };
      const dat = new File([JSON.stringify(izvoz)], "izvoz.json", { type: "application/json" });
      const eno = await window.ImportUtils.preberiDatoteko(dat);
      const vsi = await window.ImportUtils.preberiVseListe(dat);
      return { eno: eno.vrsteVrstic, listi: vsi.listi };
    });
    trdi(JSON.stringify(nazaj.eno[0]) === JSON.stringify(["Ime", "Dan", "Izmena"]),
      "glave se preberejo kot glave – dobil: " + JSON.stringify(nazaj.eno[0]));
    trdi(JSON.stringify(nazaj.eno[1]) === JSON.stringify(["Bojić Matej", "1.9.2026", "DOP"]),
      "prva vrstica je ista – dobil: " + JSON.stringify(nazaj.eno[1]));
    trdi(nazaj.eno.length === 3, `skupaj glava + 2 vrstici (dobil ${nazaj.eno.length})`);
    trdi(nazaj.listi.length === 2, `oba zavihka sta ohranjena (dobil ${nazaj.listi.length})`);
    trdi(nazaj.listi[0].naziv === "Šumniki čžš", "ime zavihka s šumniki je ohranjeno");
  }

  console.log("4) PDF odpre tiskalniško okno, ne prenosa");
  {
    // window.print bi v Playwrightu blokiral, zato ga prestrežemo - preveri
    // se, da ga PDF izvoz sploh doseže in da za sabo pospravi tabelo.
    await stran.evaluate(() => {
      window.__natisnjeno = 0;
      window.print = () => { window.__natisnjeno++; };
      if (window.PrintFit) window.PrintFit.natisni = () => { window.__natisnjeno++; };
    });
    await stran.click(".dlIconBtn");
    await stran.click('.dlMenuItem:has-text("Izvozi PDF")');
    await stran.waitForTimeout(200);
    trdi(await stran.evaluate(() => window.__natisnjeno) === 1, "tiskanje se je sprožilo natanko enkrat");
    await stran.waitForTimeout(1200);
    trdi(await stran.evaluate(() => document.querySelectorAll(".izvozPdfOvoj").length) === 0,
      "začasna tabela je po tiskanju odstranjena");
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
