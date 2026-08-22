#!/usr/bin/env node
// ---------------------------------------------------------------------
// Preveri branje razpredelnice želja s FOTOGRAFIJE (zelje.html).
//
// Test funkcij NE podvaja – izlušči jih iz zelje.html in požene tiste, ki
// so v aplikaciji. Tako se preizkus ne more tiho razíti s kodo.
//
// Preizkusna slika se nariše v brskalniku: mreža znanih barv + fotografski
// šum + senca čez stran + rahel nagib, kot pri slikanju z roko.
//
// Uporaba:  node skripte/preveri-foto-uvoz.mjs
// Izhodna koda 0 = vse OK, 1 = odstopanje.
// ---------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import pkg from "/opt/node22/lib/node_modules/playwright/index.js";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const vir = readFileSync(join(koren, "zelje.html"), "utf8");

function izlusci(ime) {
  const i = vir.indexOf("function " + ime + "(");
  if (i === -1) throw new Error("V zelje.html ni funkcije " + ime);
  let d = 0, k = vir.indexOf("(", i);
  for (;; k++) { if (vir[k] === "(") d++; else if (vir[k] === ")") { d--; if (!d) break; } }
  let j = vir.indexOf("{", k); d = 0;
  for (let k2 = j; k2 < vir.length; k2++) {
    if (vir[k2] === "{") d++;
    else if (vir[k2] === "}") { d--; if (!d) return vir.slice(i, k2 + 1); }
  }
  throw new Error("Nezaključena funkcija " + ime);
}
const FUNKCIJE = ["tockaVMrezi","vzorciBarvo","jePrazna","vRazdaljo","razdaljaTock",
                  "hexIzRgb","rgbIzKljuca","zdruziBarve","kljucBarve"].map(izlusci).join("\n");
const PRAG = vir.match(/const PRAG_UJEMANJA = \d+;/)[0];

const BARVE = { ld:[224,102,102], omejitev:[255,217,102], bs:[147,196,125], sti:[180,167,214] };
const MAPA = { FFE06666:"ld", FFFFD966:"omejitev", FF93C47D:"bs", FFB4A7D6:"sti" };
const VRSTIC = 6, DNI = 31, CW = 26, CH = 30, M = 60, KOT = 1.2;

const nacrt = Array.from({ length: VRSTIC }, (_, i) => Array.from({ length: DNI }, (_, j) =>
  (i + j) % 7 === 0 ? "ld" : (i * 3 + j) % 11 === 0 ? "omejitev"
  : (i + 2 * j) % 13 === 0 ? "bs" : (i * 5 + j) % 17 === 0 ? "sti" : null));

const stran = `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script>
${PRAG}
${FUNKCIJE}
// Determinističen "šum" (brez Math.random), da je test ponovljiv.
let seme = 12345;
function nakljucno(){ seme = (seme * 1103515245 + 12345) & 0x7fffffff; return seme / 0x7fffffff - 0.5; }
const BARVE = ${JSON.stringify(BARVE)}, nacrt = ${JSON.stringify(nacrt)};
const VRSTIC=${VRSTIC}, DNI=${DNI}, CW=${CW}, CH=${CH}, M=${M}, KOT=${KOT};
const w = M*2 + DNI*CW, h = M*2 + VRSTIC*CH;
const t = KOT * Math.PI / 180;
const W = Math.abs(w*Math.cos(t)) + Math.abs(h*Math.sin(t));
const H = Math.abs(w*Math.sin(t)) + Math.abs(h*Math.cos(t));
const c = document.getElementById("c"); c.width = Math.round(W); c.height = Math.round(H);
const ctx = c.getContext("2d", { willReadFrequently: true });
ctx.fillStyle = "#FAF8F1"; ctx.fillRect(0,0,c.width,c.height);
ctx.translate(c.width/2, c.height/2); ctx.rotate(-t); ctx.translate(-w/2, -h/2);
for (let i=0;i<VRSTIC;i++) for (let j=0;j<DNI;j++) {
  const k = nacrt[i][j], b = k ? BARVE[k] : [255,255,255];
  const senca = 12 * (j / DNI);
  const p = b.map(v => Math.max(0, Math.min(255, Math.round(v + nakljucno()*10 - senca))));
  ctx.fillStyle = "rgb("+p[0]+","+p[1]+","+p[2]+")";
  ctx.fillRect(M+j*CW, M+i*CH, CW, CH);
  ctx.strokeStyle = "#969696"; ctx.lineWidth = 1;
  ctx.strokeRect(M+j*CW+0.5, M+i*CH+0.5, CW-1, CH-1);
}
ctx.setTransform(1,0,0,1,0,0);
function pret(x,y){
  return { x:(x-w/2)*Math.cos(t)+(y-h/2)*Math.sin(t)+c.width/2,
           y:-(x-w/2)*Math.sin(t)+(y-h/2)*Math.cos(t)+c.height/2 };
}
window.__vogali = [pret(M,M), pret(M+DNI*CW,M), pret(M+DNI*CW,M+VRSTIC*CH), pret(M,M+VRSTIC*CH)];
window.__preberi = function (mapa, vogali) {
  const polmer = Math.max(2, Math.min(razdaljaTock(vogali[0],vogali[1])/DNI,
                                      razdaljaTock(vogali[0],vogali[3])/VRSTIC) * 0.2);
  const vzorci = [], mesta = [];
  for (let i=0;i<VRSTIC;i++) for (let j=0;j<DNI;j++) {
    const p = tockaVMrezi(vogali,(j+0.5)/DNI,(i+0.5)/VRSTIC);
    const rgb = vzorciBarvo(ctx,p.x,p.y,polmer);
    if (!jePrazna(rgb)) { vzorci.push(rgb); mesta.push([i,j]); }
  }
  const { skupine, pripadnost } = zdruziBarve(vzorci, PRAG_UJEMANJA);
  const kljuci = skupine.map(sk => kljucBarve(sk.sredisce, mapa));
  const m = Array.from({length:VRSTIC},()=>new Array(DNI).fill(null));
  mesta.forEach(([i,j],k)=>{ m[i][j] = kljuci[pripadnost[k]]; });
  return m;
};
</script>`;

const dir = mkdtempSync(join(tmpdir(), "foto-"));
writeFileSync(join(dir, "t.html"), stran);
const streznik = createServer((req, res) => { res.end(stran); }).listen(0);
const vrata = streznik.address().port;

const brskalnik = await pkg.chromium.launch();
const page = await brskalnik.newPage();
const napakeStrani = [];
page.on("pageerror", e => napakeStrani.push(e.message));
await page.goto("http://localhost:" + vrata + "/t.html", { waitUntil: "load" });

const obratno = { ld:"FFE06666", omejitev:"FFFFD966", bs:"FF93C47D", sti:"FFB4A7D6" };
let skupajNapak = 0;

async function oceni(odmik, label) {
  const rez = await page.evaluate(({ mapa, odmik }) => {
    const v = window.__vogali.map((p, i) => ({ x: p.x + (i % 2 ? odmik : -odmik), y: p.y + (i < 2 ? odmik : -odmik) }));
    return window.__preberi(mapa, v);
  }, { mapa: MAPA, odmik });
  let napak = 0;
  for (let i = 0; i < VRSTIC; i++) for (let j = 0; j < DNI; j++) {
    const p = nacrt[i][j], d = rez[i][j];
    if (p === null ? d !== null : d !== obratno[p]) napak++;
  }
  const skupaj = VRSTIC * DNI;
  console.log(`${napak === 0 ? "OK  " : "NAP "}${label.padEnd(34)} ${skupaj - napak}/${skupaj}`);
  return napak;
}

skupajNapak += await oceni(0, "natančni vogali");
skupajNapak += await oceni(3, "vogal zgrešen za 3 px");
skupajNapak += await oceni(6, "vogal zgrešen za 6 px");
skupajNapak += await oceni(10, "vogal zgrešen za 10 px");

// Brez barvne mape mora dati toliko novih barv, kolikor jih je res na sliki.
const brezMape = await page.evaluate(() => window.__preberi({}, window.__vogali));
const novih = new Set(brezMape.flat().filter(Boolean)).size;
const pricakovanih = new Set(nacrt.flat().filter(Boolean)).size;
console.log(`${novih === pricakovanih ? "OK  " : "NAP "}brez barvne mape: ${novih} novih barv (pričakovano ${pricakovanih})`);
if (novih !== pricakovanih) skupajNapak++;

if (napakeStrani.length) { console.error("Napake strani: " + napakeStrani.join(" | ")); skupajNapak++; }
await brskalnik.close();
streznik.close();
console.log(skupajNapak === 0 ? "--- vse OK ---" : `--- ${skupajNapak} ODSTOPANJ ---`);
process.exit(skupajNapak === 0 ? 0 : 1);
