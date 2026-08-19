#!/usr/bin/env node
/* Preizkus: skupni moduli se na VSEH straneh res naložijo in delujejo.
 *
 * Node preizkusi preverjajo pravila, ta pa preveri nekaj, česar noben od
 * njih ne more: da se strani v PRAVEM brskalniku naložijo brez napake in
 * da so moduli (imena.js, prazniki.js, nzv-zasedba.js) takrat res na
 * voljo. Prav to je bilo doslej dvakrat narobe - ne sama pravila, ampak
 * to, da do njih na nekem zaslonu sploh ni prišlo (napačen vrstni red
 * <script>, manjkajoča datoteka v predpomnilniku).
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *          node skripte/preveri-skupni-moduli.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const tipi = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };
const srv = createServer((req,res)=>{
  const p = join(koren, decodeURIComponent(req.url.split("?")[0]).replace(/^\//,"") || "index.html");
  if(!existsSync(p)||p.endsWith("/")){res.writeHead(404);res.end("");return;}
  res.writeHead(200,{"Content-Type":tipi[extname(p)]||"application/octet-stream"});
  res.end(readFileSync(p));
});
await new Promise(r=>srv.listen(0,r));
const port = srv.address().port;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let napake = 0;
for (const stran of ["index.html","imenik.html","admin.html","zelje.html"]) {
  const pg = await b.newPage();
  // index.html in zelje.html brez prijave preusmerita na login.html, kar
  // uniči kontekst, v katerem bi merili. Zato stanje modulov zapišemo v
  // sessionStorage takoj ob DOMContentLoaded (torej ko so vsi <script>
  // izvedeni, a preden se dokonča asinhrona preusmeritev) - sessionStorage
  // preusmeritev znotraj istega izvora preživi.
  await pg.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        sessionStorage.setItem("__smoke__", JSON.stringify({
          Imena: typeof window.Imena,
          Prazniki: typeof window.Prazniki,
          NzvZasedba: typeof window.NzvZasedba,
          ujem: window.Imena ? window.Imena.seUjemata("HORVAT NINA", "Hrovat Nina") : null,
          praznik: window.Prazniki ? window.Prazniki.jePraznik("2026-12-25") : null,
        }));
      } catch (e) {}
    });
  });
  const hude = [];
  pg.on("console", m => { if (m.type()==="error") hude.push(m.text()); });
  pg.on("pageerror", e => hude.push("pageerror: " + e.message));
  // "domcontentloaded" in ne "networkidle": index.html/zelje.html brez
  // prijave preusmerita na login.html, kjer teh modulov ni. Zanima nas,
  // ali se moduli naložijo in ovoji ob njih ne vržejo napake - to je
  // odločeno že ob razčlenitvi strani, pred preusmeritvijo.
  await pg.goto(`http://127.0.0.1:${port}/${stran}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  // Počakamo, da se morebitna preusmeritev na prijavo umiri, šele nato
  // preberemo, kar smo si zapisali v sessionStorage.
  await pg.waitForLoadState("load").catch(() => {});
  await pg.waitForTimeout(300);
  const url = pg.url();
  const moduli = JSON.parse(await pg.evaluate(() => sessionStorage.getItem("__smoke__")).catch(() => null) || "{}");
  // Napake omrežja/prijave niso predmet tega preizkusa - zanimajo nas samo
  // sintaktične/JS napake ob nalaganju modulov.
  const relevantne = hude.filter(t => !/supabase|Failed to fetch|net::|401|400|NetworkError|sw\.js|ServiceWorker/i.test(t));
  const ok = moduli.Imena === "object" && moduli.Prazniki === "object" && moduli.ujem === true
    && moduli.praznik === true && relevantne.length === 0;
  console.log((ok?"  ✓ ":"  ✗ ") + stran + " [" + url.split("/").pop() + "] — " + JSON.stringify(moduli) + (relevantne.length ? " NAPAKE: " + relevantne.join(" | ") : ""));
  if (!ok) napake++;
  await pg.close();
}
await b.close(); srv.close();
process.exit(napake ? 1 : 0);
