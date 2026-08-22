#!/usr/bin/env node
/* Preizkus skupne vrstice seznama zaposlenih (oseba-vrstica.js).
 *
 * Preverja natanko tri obljube, ki jih vzorec daje uporabniku:
 *   1. strnjeno je vidno SAMO ime (ne vloga, ne oddelki, ne e-pošta),
 *   2. klik na preostanek vrstice razpre osnovne podatke,
 *   3. klik na ime NE razpre vrstice, ampak odpre celoten zapis.
 *
 * Komponenta se naloži iz prave datoteke v repozitoriju (ne iz kopije v
 * preizkusu), zato preizkus ne more zaostati za kodo.
 *
 * Zagon:  node skripte/preveri-oseba-vrstica.mjs
 * (potrebuje playwright; pot do njega lahko podaš z PLAYWRIGHT_PATH)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const tu = dirname(fileURLToPath(import.meta.url));
const koren = join(tu, "..");
const require = createRequire(process.env.PLAYWRIGHT_PATH || import.meta.url);
const { chromium } = require("playwright");

const napake = [];
function trdi(pogoj, opis) {
  if (pogoj) console.log("  ✓ " + opis);
  else { console.log("  ✗ " + opis); napake.push(opis); }
}

// Minimalna stran: prava react.production.min.js in prava oseba-vrstica.js
// iz repozitorija, brez Supabase in brez prijave.
const react = readFileSync(join(koren, "react.production.min.js"), "utf8");
const reactDom = readFileSync(join(koren, "react-dom.production.min.js"), "utf8");
const komponenta = readFileSync(join(koren, "oseba-vrstica.js"), "utf8");

const stran = `<!doctype html><html lang="sl"><head><meta charset="utf-8">
<style>:root{--line:#ddd;--ok:#4F9B6B;--ld:#E06666;--pop:#C9713F;--off:#8B8672;--danger:#b00;
--surface:#fff;--surface-2:#eee;--text:#222;--muted:#777;--accent-2:#a79448;}</style>
</head><body><div id="root"></div>
<script>${react}</script>
<script>${reactDom}</script>
<script>${komponenta}</script>
<script>
  window.profilKlici = 0;
  var e = React.createElement;
  var vsebina = e("div", null,
    e("span", { className: "pill user", id: "vloga" }, "Zaposleni"),
    e("span", { id: "oddelek" }, "C1 - ODDELEK"),
    e("a", { id: "posta", href: "mailto:kdo@pb-begunje.si" }, "kdo@pb-begunje.si")
  );
  var el = e(RazporedOsebaVrstica, {
    ime: "Bećirović Nelvedin",
    naProfil: function () { window.profilKlici++; },
    pikaRazred: "dezurstvo",
    pikaNaziv: "Dežurstvo",
    otroci: vsebina,
  });
  ReactDOM.createRoot(document.getElementById("root")).render(el);
</script></body></html>`;

const brskalnik = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const stranObj = await brskalnik.newPage({ viewport: { width: 390, height: 780 } });
const konzolneNapake = [];
stranObj.on("pageerror", err => konzolneNapake.push(String(err)));
await stranObj.setContent(stran, { waitUntil: "load" });
await stranObj.waitForSelector(".ovVrstica");

console.log("1) strnjeno stanje");
{
  const besedilo = (await stranObj.textContent(".ovVrstica")).replace(/\s+/g, " ").trim();
  trdi(besedilo.includes("Bećirović Nelvedin"), "ime je vidno");
  trdi(!besedilo.includes("Zaposleni"), "vloga NI vidna");
  trdi(!besedilo.includes("C1 - ODDELEK"), "oddelek NI viden");
  trdi(!besedilo.includes("@pb-begunje.si"), "e-pošta NI vidna");
  trdi(await stranObj.locator(".ovPodrobno").count() === 0, "podrobnosti niso v DOM");
  const barva = await stranObj.$eval(".ovDot", el => getComputedStyle(el).backgroundColor);
  trdi(barva === "rgb(187, 0, 0)", "pika ima barvo statusa (dežurstvo), dobil: " + barva);
  const v = await stranObj.$eval(".ovGlava", el => el.getBoundingClientRect().height);
  trdi(v >= 44, "vrstica je visoka vsaj 44 px (dotik), izmerjeno: " + Math.round(v));
}

console.log("2) klik na preostanek vrstice");
{
  await stranObj.click(".ovOstalo");
  await stranObj.waitForSelector(".ovPodrobno");
  const besedilo = (await stranObj.textContent(".ovVrstica")).replace(/\s+/g, " ").trim();
  trdi(besedilo.includes("Zaposleni"), "vloga je zdaj vidna");
  trdi(besedilo.includes("C1 - ODDELEK"), "oddelek je zdaj viden");
  trdi(await stranObj.evaluate(() => window.profilKlici) === 0, "profil se NI odprl");
  await stranObj.click(".ovOstalo");
  trdi(await stranObj.locator(".ovPodrobno").count() === 0, "ponoven klik spet skrije");
}

console.log("3) klik na ime");
{
  await stranObj.click(".ovIme");
  trdi(await stranObj.evaluate(() => window.profilKlici) === 1, "odpre celoten zapis");
  trdi(await stranObj.locator(".ovPodrobno").count() === 0, "in NE razpre vrstice");
}

console.log("4) namizna širina");
{
  await stranObj.setViewportSize({ width: 1280, height: 900 });
  const sirina = await stranObj.$eval(".ovGlava", el => el.getBoundingClientRect().width);
  const imeD = await stranObj.$eval(".ovIme", el => el.getBoundingClientRect());
  const ostalo = await stranObj.$eval(".ovOstalo", el => el.getBoundingClientRect());
  trdi(ostalo.width > sirina / 2, "gumb za razpiranje pokrije večino prazne širine");
  trdi(imeD.right <= ostalo.left + 1, "ime in gumb za razpiranje se ne prekrivata");
}

trdi(konzolneNapake.length === 0, "brez napak v konzoli" + (konzolneNapake[0] ? ": " + konzolneNapake[0] : ""));
await brskalnik.close();

console.log("");
if (napake.length) {
  console.log("NEUSPEŠNO – " + napake.length + " napak");
  process.exit(1);
}
console.log("VSE V REDU");
