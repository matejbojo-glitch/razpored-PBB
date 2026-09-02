#!/usr/bin/env node
/* Preizkus izvoza v Excel (export-utils.js/export-buttons.js) v pravem
 * brskalniku, po prehodu na ExcelJS (avgust 2026):
 *
 *  1. export-utils.js je zdaj ZGRAJEN iz export-utils.entry.js (glej
 *     build-export.mjs) - `node build-export.mjs` mora biti pognan PRED
 *     tem preizkusom (enako kot build-vendor.mjs pred ostalimi).
 *  2. Pisanje je asinhrono (workbook.xlsx.writeBuffer()) - gumb "Izvozi
 *     Excel (.xlsx)" se med izvozom onemogoči in prikaže "Izvažam …", enako kot
 *     je od nekdaj veljalo za Google Sheets.
 *  3. Pri velikem mesečnem razporedu (stotine vrstic) se vrstice dodajajo
 *     po kosih z vmesnim vrniNadzoruBrskalniku() - zaslon zato med izvozom
 *     NE zamrzne: preizkušamo, da requestAnimationFrame šteje naprej ves
 *     čas izvoza (če bi glavna nit zamrznila, bi štetje obstalo).
 *
 * Ta preizkus namenoma NE nalaga cele strani (dashboard.html ipd. zahtevajo
 * pravo prijavo/podatke) - export-buttons.js je samostojna komponenta z
 * dokumentirano pogodbo (naslov/listi/pripravi/compact/viri), zato jo
 * preizkušamo prek majhne, izolirane strani, ki jo naloži enako kot prava
 * stran (isti export-utils.js/export-buttons.js/exceljs.min.js).
 *
 * Zagon: node build-export.mjs && CHROMIUM_PATH=... node skripte/preveri-izvoz-excel.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import ExcelJS from "exceljs";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

if (!existsSync(join(koren, "export-utils.js")) || !/window\.ExportUtils/.test(readFileSync(join(koren, "export-utils.js"), "utf8"))) {
  console.error("export-utils.js manjka ali ni zgrajen - najprej poženi: node build-export.mjs");
  process.exit(1);
}
// export-utils.js mora imeti PRAVI import ExcelJS-a (ne globalnega
// sklicevanja, kot je pisalo pred avgustom 2026) - to preverja izvorna
// datoteka, ne zgrajeni sveženj (ta po esbuild alias-u seveda ne vsebuje
// dobesednega "import").
trdi(/import vrniExcelJS from "exceljs"/.test(readFileSync(join(koren, "export-utils.entry.js"), "utf8")),
  "export-utils.entry.js uvaža ExcelJS prek pravega `import`");
// Od ločitve svežnjev (september 2026) ExcelJS ni več naložen ob odprtju
// strani, ampak ga pripelje VendorIzvoz.nalozi ob prvem izvozu - zato se
// globalna spremenljivka bere ŠELE OB KLICU (vrniExcelJS()), ne ob
// nalaganju. Če bi kdo to vrnil na "import ExcelJS from" + branje ob
// nalaganju, bi bil ExcelJS vedno undefined in izvoz v Excel bi odpovedal.
trdi(/await naloziIzvoznKnjiznice\(\)/.test(readFileSync(join(koren, "export-utils.entry.js"), "utf8")),
  "izvoziXLSX pred uporabo počaka na odloženo naložen sveženj");
trdi(/await\s+wb\.xlsx\.writeBuffer\(\)/.test(readFileSync(join(koren, "export-utils.entry.js"), "utf8")),
  "pisanje je asinhrono (await workbook.xlsx.writeBuffer())");

// Majhna izolirana stran, enako sestavljena kot prave strani (isti vrstni
// red skript: vendor* -> export-utils.js -> export-buttons.js -> JSX), a
// namesto vendor-app.min.js nalaga posamične *.min.js (že v korenu, glej
// preveri-legenda-kratic.mjs za isti vzorec) - preprosteje za izolirano
// stran, obnašanje ExcelJS/React je popolnoma enako.
const stran = `<!doctype html><html><head><meta charset="utf-8">
<script src="react.production.min.js"></script>
<script src="react-dom.production.min.js"></script>
<script src="babel.min.js"></script>
<script src="exceljs.min.js"></script>
<script src="export-utils.js"></script>
<script src="export-buttons.js"></script>
</head><body><div id="r"></div>
<script type="text/babel">
const { useState, useEffect } = React;
function Test() {
  // Šteje naprej prek requestAnimationFrame ves čas, ko je stran odprta -
  // če glavna nit med izvozom zamrzne, štetje za ta čas obstane.
  const [okvirjev, setOkvirjev] = useState(0);
  useEffect(() => {
    let t = true;
    function tick() { if (!t) return; setOkvirjev(n => n + 1); requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
    return () => { t = false; };
  }, []);
  const glave = ["Ime", "1.9.", "2.9.", "3.9.", "4.9.", "5.9."];
  const majhnaVrstica = (ime) => [ime, "Dopoldne", "Popoldne", "Nočna", "KPU", "LD"];
  // "Velik mesečni razpored": dovolj vrstic, da preseže VRSTIC_NA_KOS (200)
  // v export-utils.js in izvoz traja dovolj dolgo (deset+ vmesnih
  // vrniNadzoruBrskalniku() klicev), da je "Izvažam …" stanje zanesljivo
  // zajeto - pri manj vrsticah (preizkušeno na 650) je izvoz v headless
  // Chromiumu včasih končan HITREJE, kot Playwrightov waitForSelector sploh
  // utegne ujeti vmesno stanje, kar bi bilo lažno rdeče (past preizkusa, ne
  // prave kode).
  const velikeVrstice = Array.from({ length: 6000 }, (_, i) => ["Oseba " + (i + 1), "Dopoldne", "Popoldne", "Nočna", "KPU", "LD"]);
  return (
    <div>
      <p id="okvirji">{okvirjev}</p>
      <RazporedIzvozVir naslov="majhen-test" listi={[{ ime: "List", glave, vrstice: [majhnaVrstica("Kovač Ana")] }]} />
      <RazporedIzvozVir naslov="velik-test" listi={[{ ime: "September", glave, vrstice: velikeVrstice }]} />
      <RazporedOrodja/>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("r")).render(<Test/>);
</script></body></html>`;

const pot = join(koren, "_preizkus-izvoz-excel.html");
writeFileSync(pot, stran);

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  const context = await brskalnik.newContext({ acceptDownloads: true });
  const stran2 = await context.newPage();
  const konzola = [];
  stran2.on("pageerror", e => konzola.push(String(e)));
  stran2.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  // Izvoz zdaj najprej ponudi okno "Shrani kot" (showSaveFilePicker), šele
  // nato izdela datoteko. Brskalnik brez zaslona tega okna ne more prikazati
  // in klic obvisi, zato ga tu odstranimo - s tem gre izvoz po rezervni poti
  // (običajen prenos), ki je natanko tisto, kar ta preizkus meri. Samo okno
  // "Shrani kot" pokriva skripte/preveri-izvozne-formate.mjs.
  await stran2.addInitScript(() => { delete window.showSaveFilePicker; });
  await stran2.goto("file://" + pot, { waitUntil: "networkidle" });
  await stran2.waitForTimeout(500);

  console.log("1) gumb za izvoz ponudi oba vira (majhen in velik)");
  await stran2.click(".dlIconBtn");
  await stran2.waitForTimeout(200);
  const postavkeXlsx = await stran2.$$("button.dlMenuItem:has-text('Izvozi Excel')");
  trdi(postavkeXlsx.length === 2, "dve postavki 'Izvozi Excel' (majhen-test, velik-test)");

  console.log("2) izvoz MAJHNEGA vira: prava, veljavna .xlsx datoteka");
  const [prenos1] = await Promise.all([
    stran2.waitForEvent("download"),
    postavkeXlsx[0].click(),
  ]);
  trdi(/^majhen-test\.xlsx$/.test(prenos1.suggestedFilename()), "ime datoteke: " + prenos1.suggestedFilename());
  const pot1 = join(koren, "_preizkus-majhen.xlsx");
  await prenos1.saveAs(pot1);
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(pot1);
    const ws = wb.worksheets[0];
    trdi(ws.name === "List", "ime lista je 'List'");
    trdi(ws.getRow(1).getCell(1).value === "Ime", "glava je na mestu");
    trdi(ws.getRow(2).getCell(1).value === "Kovač Ana", "podatkovna vrstica je na mestu: " + ws.getRow(2).getCell(1).value);
    trdi(ws.getRow(2).getCell(3).value === "Popoldne", "in prava vsebina po stolpcih");
  }
  unlinkSync(pot1);

  console.log("3) uspešen izvoz zapre meni (setOdprto(false)) - odpremo ga znova");
  // izvoziExcel ob uspehu zapre spustni meni, enako kot že od nekdaj velja
  // za izvoziSheets - gumbi iz 1. kroga zato niso več v DOM-u.
  await stran2.waitForTimeout(200);
  await stran2.click(".dlIconBtn");
  await stran2.waitForTimeout(200);
  const postavkeXlsx2 = await stran2.$$("button.dlMenuItem:has-text('Izvozi Excel')");
  trdi(postavkeXlsx2.length === 2, "meni se je znova odprl z obema postavkama");

  console.log("4) izvoz VELIKEGA vira (6000 vrstic): ne zamrzne zaslona, gumb se pravilno zaklene/odklene");
  const okvirjiPred = Number(await stran2.textContent("#okvirji"));
  const napovedPrenosa = stran2.waitForEvent("download");
  await postavkeXlsx2[1].click();
  // waitForSelector namesto fiksnega spanja: čaka in ponovno preverja,
  // dokler se "Izvažam …" ne pojavi (ali dokler ne poteče čas) - fiksen
  // "počakaj 50 ms, nato preveri" bi bil nezanesljiv, če se kosovni izvoz
  // v hitrem headless brskalniku konča prej.
  const gumbMedIzvozom = await stran2.waitForSelector(
    "button.dlMenuItem:has-text('Izvažam')", { timeout: 3000 }
  ).catch(() => null);
  trdi(!!gumbMedIzvozom, "gumb med izvozom prikaže 'Izvažam …'");
  trdi(!!gumbMedIzvozom && await gumbMedIzvozom.isDisabled(), "in je med izvozom onemogočen");
  const prenos2 = await napovedPrenosa;
  const okvirjiPo = Number(await stran2.textContent("#okvirji"));
  trdi(okvirjiPo > okvirjiPred + 3,
    `requestAnimationFrame je med izvozom tekel naprej (${okvirjiPred} -> ${okvirjiPo} okvirjev) - zaslon ni zamrznil`);

  const pot2 = join(koren, "_preizkus-velik.xlsx");
  await prenos2.saveAs(pot2);
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(pot2);
    const ws = wb.worksheets[0];
    trdi(ws.rowCount === 6001, "vseh 6000 vrstic + glava je v datoteki (dobil " + ws.rowCount + ")");
    trdi(ws.getRow(6001).getCell(1).value === "Oseba 6000", "zadnja vrstica ni bila izgubljena med kosovnim dodajanjem");
  }
  unlinkSync(pot2);

  console.log("5) po izvozu se meni sam zapre, gumb pa ni ostal trajno onemogočen");
  // Uspešen izvoz zapre meni (glej 3. korak zgoraj) - stara referenca na
  // gumb je zato odklopljena od DOM-a; preverjamo na SVEŽE odprtem meniju.
  await stran2.waitForTimeout(200);
  await stran2.click(".dlIconBtn");
  await stran2.waitForTimeout(200);
  const gumbPoIzvozu = (await stran2.$$("button.dlMenuItem:has-text('Izvozi Excel')"))[1];
  trdi(!!gumbPoIzvozu, "gumb je po ponovnem odprtju spet na voljo");
  trdi(!!gumbPoIzvozu && !(await gumbPoIzvozu.isDisabled()), "in ni več onemogočen");

  console.log("6) brez napak v konzoli");
  trdi(konzola.length === 0, "brez napak" + (konzola.length ? ": " + konzola.join(" | ") : ""));

  await stran2.close();
} finally {
  await brskalnik.close();
  unlinkSync(pot);
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
