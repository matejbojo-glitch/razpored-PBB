#!/usr/bin/env node
/* Preizkus: oblikovni sistem je na ENEM mestu (theme.css).
 *
 * Zakaj obstaja: vsaka stran je imela svojo kopijo barvnih spremenljivk.
 * Kopije so se razšle — --ok je bil po straneh #4C8C63, v theme.css pa
 * #4F9B6B. Ker se --ok-rgb NI podvajal, so znački .pill.ok ozadje risale
 * iz ene zelene, besedilo pa iz druge. Take razlike se v pregledu kode
 * ne opazi, ker vsaka stran zase izgleda dosledno.
 *
 * Zato tu velja pravilo: barvo/žeton definira samo theme.css. Stran ga
 * sme povoziti le v @media print (tisk je namenoma črno-bel).
 *
 * Zagon: node skripte/preveri-oblikovni-sistem.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

/* Odstrani vsebino @media blokov (ujemanje zavitih oklepajev), da
 * tiskalnih pravil ne štejemo med kršitve. */
function brezMedia(css) {
  let out = "", i = 0;
  for (;;) {
    const m = /@media[^{]*\{/g;
    m.lastIndex = i;
    const z = m.exec(css);
    if (!z) { out += css.slice(i); break; }
    out += css.slice(i, z.index);
    let d = 1, j = m.lastIndex;
    while (j < css.length && d) {
      if (css[j] === "{") d++;
      else if (css[j] === "}") d--;
      j++;
    }
    i = j;
  }
  return out;
}

function zetoni(css) {
  const m = {};
  const blok = brezMedia(css);
  let z;
  const re = /:root\{([^}]*)\}/g;
  while ((z = re.exec(blok))) {
    const re2 = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let y;
    while ((y = re2.exec(z[1]))) m[y[1]] = y[2].trim();
  }
  return m;
}

const tema = zetoni(readFileSync(join(koren, "theme.css"), "utf8"));
const strani = readdirSync(koren).filter(f => f.endsWith(".html"));

console.log("1) theme.css je edini vir barvnih žetonov");
{
  trdi(Object.keys(tema).length > 30, `theme.css določa ${Object.keys(tema).length} žetonov`);
  const krsitelji = [];
  strani.forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    const css = (src.match(/<style>([\s\S]*?)<\/style>/g) || []).join("\n");
    const lok = zetoni(css);
    const imena = Object.keys(lok);
    if (imena.length) krsitelji.push(`${f} (${imena.slice(0, 4).join(", ")}${imena.length > 4 ? " …" : ""})`);
  });
  trdi(krsitelji.length === 0,
    `nobena od ${strani.length} strani ne določa svojih žetonov zunaj @media print`
    + (krsitelji.length ? " – kršijo: " + krsitelji.join("; ") : ""));
}

console.log("2) žetoni, ki nastopajo v paru, se ujemajo");
{
  // --ok in --ok-rgb morata opisovati ISTO barvo, sicer ima značka
  // ozadje ene in besedilo druge zelene. Prav to je bila napaka.
  const pari = [["--ok", "--ok-rgb"], ["--danger", "--danger-rgb"],
                ["--text", "--text-rgb"], ["--accent", "--accent-rgb"]];
  pari.forEach(([hexKljuc, rgbKljuc]) => {
    const hex = (tema[hexKljuc] || "").replace("#", "");
    const rgb = (tema[rgbKljuc] || "").split(",").map(s => Number(s.trim()));
    const izHex = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const ujema = hex.length === 6 && rgb.length === 3
      && izHex.every((v, i) => v === rgb[i]);
    trdi(ujema, `${hexKljuc} (#${hex}) in ${rgbKljuc} (${rgb.join(",")}) sta ista barva`);
  });
}

console.log("3) v slogih ni trdo zapisanih barv, ki podvajajo žeton");
{
  // Izjema je risanje na platno (canvas) v zelje.html: tam var() ne
  // deluje, ker barvo prejme JavaScript, ne CSS.
  const poHex = {};
  Object.entries(tema).forEach(([k, v]) => {
    const m = /^#([0-9A-Fa-f]{6})$/.exec(v.trim());
    if (m) poHex[m[1].toUpperCase()] = k;
  });
  const najdbe = [];
  strani.forEach(f => {
    const src = readFileSync(join(koren, f), "utf8");
    (src.match(/<style>([\s\S]*?)<\/style>/g) || []).join("\n")
      .split("\n").forEach(v => {
        const m = /#([0-9A-Fa-f]{6})\b/.exec(v);
        if (m && poHex[m[1].toUpperCase()]) {
          najdbe.push(`${f}: #${m[1]} = ${poHex[m[1].toUpperCase()]}`);
        }
      });
  });
  trdi(najdbe.length === 0, "noben slog ne ponavlja barve, ki že ima žeton"
    + (najdbe.length ? " – " + najdbe.slice(0, 4).join("; ") : ""));
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
