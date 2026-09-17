#!/usr/bin/env node
/* Zaporedje pri večstopenjskih dejanjih (uporabnikova zahteva, sept. 2026).
 *
 * PRAVILO
 * Vsak gumb, ki opravi več korakov (generiraj, objavi, uvozi, potrdi
 * menjavo, shrani), mora teči po tem zaporedju:
 *   1. preveri vhod in poslovna pravila PRED vsem drugim;
 *   2. zakleni sprožilec (disabled + vidno stanje), da dvojni klik ne
 *      pošlje dveh zahtevkov;
 *   3. delo opravi v try (asinhrono, po svežnjih, kjer je podatkov veliko);
 *   4. stanje posodobi ŠELE po uspehu;
 *   5. odkleni v finally in javi izid.
 *
 * ZAKAJ PREIZKUS
 * Ročni pregled je našel enajst odstopanj v petih datotekah. Brez varovala
 * se bo naslednji rokovalnik spet napisal po spominu. Najdene napake:
 *   - admin.html, generiranje dežurstev: gumb brez "disabled" in funkcija
 *     brez zaklepa - dvojni klik je pognal dva izračuna hkrati;
 *   - admin.html, generiranje razporeda vodij: setNalagam(false) na koncu,
 *     zunaj try - napaka v katerikoli od štirih poizvedb je pustila gumb
 *     trajno izklopljen;
 *   - imenik.html, "Poveži" in "Odstrani": pisala v bazo brez zaklepa;
 *   - nastavitve.html, trije klici RPC: odklep takoj za await, ne v finally.
 *
 * Zagon: node skripte/preveri-zaporedje-dejanj.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRANI = ["index.html", "admin.html", "imenik.html", "zelje.html",
  "obrazec.html", "dashboard.html", "nastavitve.html"];

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// Znane in PREVERJENE izjeme. Vsaka mora imeti razlog - seznam ni prostor
// za tiho odpisovanje novih odstopanj.
const IZJEME = {
  "imenik.html:zacniOgledOsebe":
    "zaklep namenoma drži do preusmeritve (location.href), da med njo ni mogoče klikniti znova",
  "zelje.html:uvoziIzSheets":
    "ima try/finally; sprožilec je postavka v meniju 📥 (RazporedUvozVir ne izriše gumba, zato ni disabled)",
  "obrazec.html:oddaj":
    "povratna informacija je navigacijska - onOddano() osveži seznam in preklopi na zavihek »moji«",
  "obrazec.html:izvediTakoj":
    "isto kot oddaj - onOddano() pokaže izid",
  "nastavitve.html:pokazi":
    "zaklep prevzame naloziToken, ki ga kliče; sam ima še if (busy) return",
};

function telo(t, od) {
  let i = t.indexOf("{", od);
  if (i < 0) return "";
  let g = 0;
  const zac = i;
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === "{") g++;
    else if (c === "}") { g--; if (!g) return t.slice(zac, i + 1); }
  }
  return "";
}
const vrstica = (t, i) => t.slice(0, i).split("\n").length;

console.log("1) Večstopenjski rokovalniki tečejo po zaporedju");
const najdeni = [];
const odstopanja = [];
for (const stran of STRANI) {
  const t = readFileSync(join(koren, stran), "utf8");
  const re = /(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*async\s*\(([^)]*)\)\s*=>/g;
  let m;
  while ((m = re.exec(t))) {
    const ime = m[1];
    const b = telo(t, m.index + m[0].length - 1);
    if (!b || !/\bawait\b/.test(b)) continue;
    // Samo to, kar uporabnik res sproži. Pomožne nalagalne funkcije
    // (nalozizZelje ...) teče iz učinkov ali znotraj že zaklenjenega
    // rokovalnika in svojega zaklepa ne potrebujejo.
    const sprozen = new RegExp("(onClick|onSubmit)=\\{\\s*(\\(\\)\\s*=>\\s*)?" + ime + "\\b").test(t)
      || new RegExp("onClick=\\{\\s*\\([^)]*\\)\\s*=>\\s*" + ime + "\\(").test(t);
    if (!sprozen) continue;
    najdeni.push(stran + ":" + ime);

    // 2 · zaklep: set*( pred prvim await, katerega stanje nastopa v disabled=
    //
    // OMEJITEV, ki jo je treba poznati: "disabled=" se išče po CELI
    // datoteki, ne po komponenti. Če dve komponenti uporabljata isto ime
    // stanja (admin.html ima "genBusy" v KalupTab in v DezurstvaTab), ta
    // preverba misli, da je zaklenjena tudi tista, ki ni. Prav zato ima
    // razdelek 3 spodaj še pripete trditve za posamezne gumbe - past med
    // razvojem tega preizkusa je ušla splošni preverbi in jo je ujela šele
    // pripeta. Splošna preverba lovi manjkajoč finally in manjkajoč try,
    // pripete pa lovijo manjkajoč "disabled".
    const predAwait = b.slice(0, b.indexOf("await"));
    const setri = [...predAwait.matchAll(/\b(set[A-Za-z0-9_$]+)\s*\(/g)].map((x) => x[1]);
    const zaklep = setri.some((s) => {
      const stanje = s.replace(/^set/, "");
      const mala = stanje.charAt(0).toLowerCase() + stanje.slice(1);
      return new RegExp("disabled=\\{[^}]*\\b(" + stanje + "|" + mala + ")\\b").test(t);
    });
    const finaly = /\}\s*finally\s*\{/.test(b);
    const tryC = /\btry\s*\{/.test(b);
    const katch = /\}\s*catch\b/.test(b);
    const pise = /\.(insert|upsert|update|delete|rpc)\(/.test(b);
    const povr = /set[A-Za-z]*Msg\(|setSporocilo\(|alert\(|setNapaka\(|setStatus\(/.test(b);

    const manjka = [];
    if (!zaklep) manjka.push("brez zaklepa (dvojni klik)");
    else if (!finaly) manjka.push("odklep ni v finally");
    if (tryC && !katch && !finaly) manjka.push("try brez catch/finally");
    if (pise && !tryC) manjka.push("piše v bazo brez try");
    if (pise && !povr) manjka.push("piše v bazo brez povratne informacije");
    if (manjka.length) {
      odstopanja.push({ kljuc: stran + ":" + ime, vrstica: vrstica(t, m.index), manjka });
    }
  }
}

trdi(najdeni.length >= 25, `pregledanih sproženih rokovalnikov: ${najdeni.length}`);

const nova = odstopanja.filter((o) => !IZJEME[o.kljuc]);
for (const o of nova) {
  console.log(`  ✗ ${o.kljuc} (vrstica ${o.vrstica}): ${o.manjka.join(" | ")}`);
}
trdi(nova.length === 0,
  nova.length === 0
    ? "noben rokovalnik ne odstopa od zaporedja"
    : `${nova.length} rokovalnikov odstopa od zaporedja (glej zgoraj)`);

console.log("2) Seznam izjem ostaja kratek in resničen");
{
  // Izjema, ki ni več potrebna, mora s seznama - sicer seznam scasoma
  // pokrije prave napake.
  const uporabljene = new Set(odstopanja.map((o) => o.kljuc));
  for (const kljuc of Object.keys(IZJEME)) {
    trdi(uporabljene.has(kljuc), `izjema "${kljuc}" je še potrebna`);
  }
  trdi(Object.keys(IZJEME).length <= 6,
    `izjem je ${Object.keys(IZJEME).length} (meja 6 - nad tem seznam skriva napake)`);
}

console.log("3) Popravljeni rokovalniki so res popravljeni");
{
  const admin = readFileSync(join(koren, "admin.html"), "utf8");
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const nast = readFileSync(join(koren, "nastavitve.html"), "utf8");

  trdi(/onClick=\{generiraj\} disabled=\{genBusy \|\| !roster\}/.test(admin),
    "gumb za generiranje dežurstev je med delom izklopljen");
  trdi(/const generirajNotranje = async/.test(admin),
    "generiranje razporeda vodij ima zaklep v ovojnici, delo pa v notranji funkciji");
  trdi(/const \[vrsticaBusy, setVrsticaBusy\]/.test(imenik),
    "imenik ima zaklep po vrstici (ne en sam za cel seznam)");
  trdi((nast.match(/\}\s*finally\s*\{\s*\n\s*setBusy\(false\);/g) || []).length >= 3,
    "nastavitve: vsi trije klici RPC odklepajo v finally");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
