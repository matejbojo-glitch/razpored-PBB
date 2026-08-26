#!/usr/bin/env node
/* Vsaka *.html stran se mora začeti z <!doctype html>.
 *
 * Zakaj svoj preizkus: 25. 8. 2026 je bil v index.html PRED <!doctype html>
 * vrinjen blok JavaScripta (definicija normalizirajNazivOddelka). Ker ni bil
 * v <script> znački, ga je brskalnik izpisal kot BESEDILO - objavljena stran
 * je namesto aplikacije kazala vrstico kode. Aplikacija je bila v tem stanju
 * za zaposlene neuporabna.
 *
 * Noben obstoječi preizkus tega ni ujel: vsi berejo posamezne funkcije ali
 * izrisano vsebino, nihče pa ni gledal, ali je datoteka sploh veljaven HTML
 * od prvega znaka naprej.
 *
 * Zagon: node skripte/preveri-doctype.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const strani = readdirSync(koren).filter(f => f.endsWith(".html")).sort();
console.log(`1) vseh ${strani.length} strani se začne z <!doctype html>`);
for (const ime of strani) {
  const vsebina = readFileSync(join(koren, ime), "utf8");
  // BOM je dovoljen (nekateri urejevalniki ga dodajo), karkoli drugega ne.
  const brezBom = vsebina.replace(/^﻿/, "");
  const zacetek = brezBom.slice(0, 15).toLowerCase();
  const vRedu = zacetek.startsWith("<!doctype html");
  trdi(vRedu, vRedu
    ? `${ime}`
    : `${ime} se NE začne z <!doctype html> – prvih 60 znakov: ${JSON.stringify(brezBom.slice(0, 60))}`);
}

console.log("2) pred <html> ni ničesar, kar bi brskalnik izpisal kot besedilo");
for (const ime of strani) {
  const vsebina = readFileSync(join(koren, ime), "utf8").replace(/^﻿/, "");
  const doHtml = vsebina.slice(0, vsebina.toLowerCase().indexOf("<html"));
  // Med doctype in <html> sme stati le presledek/komentar - nič izvedljivega
  // in nič, kar bi se izrisalo.
  const ostanek = doHtml
    .replace(/<!doctype html[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  trdi(ostanek === "", ostanek === ""
    ? `${ime}`
    : `${ime} ima med doctype in <html> tuje besedilo: ${JSON.stringify(ostanek.slice(0, 60))}`);
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  process.exit(1);
}
console.log("VSE V REDU");
