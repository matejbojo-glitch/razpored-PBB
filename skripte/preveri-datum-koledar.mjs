#!/usr/bin/env node
/* Preizkus koledarskih izračunov v datum.js.
 *
 * Zakaj obstaja: isti štirje računi (zadnji dan v mesecu, sestava ISO
 * datuma, obseg meseca, seznam dni) so bili napisani posebej v
 * index.html, admin.html, zelje.html in imenik.html – ponekod v lokalnem
 * času, drugod v UTC, z dvema različnima naboroma kratic za dneve.
 *
 * Izidi so BILI enaki, a nič ni jamčilo, da tako ostane. Ker gre za
 * poenotenje in ne za popravek, je 1. sklop dokaz, da se ni nič
 * spremenilo: vse stare različice so tu prepisane dobesedno in
 * primerjane z novo čez 12 let dan za dnem.
 *
 * Zagon: node skripte/preveri-datum-koledar.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "datum.js"), "utf8"), sandbox);
const D = sandbox.window.Datum;

// ---------------------------------------------------------------------
// Stare, PODVOJENE različice – prepisane dobesedno, kakršne so bile pred
// poenotenjem. Služijo samo kot merilo.
// ---------------------------------------------------------------------
// index.html
const DNI_index = ["PO", "TO", "SR", "ČE", "PE", "SO", "NE"];
function monthRange_index(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startISO: start, endISO: end };
}
function daysInRange_index(startISO, endISO) {
  const out = [];
  let d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d.getTime() <= end.getTime()) {
    const wd = (d.getDay() + 6) % 7;
    const p = n => String(n).padStart(2, "0");
    out.push({ datum: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, dan: DNI_index[wd] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
// admin.html – pozor: ta je delal v UTC, index.html pa v lokalnem času
function monthRange_admin(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startISO: start, endISO: end };
}
function danovVMesecu2_admin(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function isoZaMesec_admin(monthStr, d) {
  const [y, m] = monthStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const DNI_KRATKO_admin = ["NED", "PON", "TOR", "SRE", "ČET", "PET", "SOB"];
// zelje.html – pozor: mesec je tu indeks 0-11, ne 1-12
const DOW_SL_zelje = ["NED", "PON", "TOR", "SRE", "ČET", "PET", "SOB"];
function danovVMesecu_zelje(y, m) { return new Date(y, m + 1, 0).getDate(); }
function dowZa_zelje(y, m, d) { return DOW_SL_zelje[new Date(y, m, d).getDay()]; }
function jeVikend_zelje(y, m, d) { const l = dowZa_zelje(y, m, d); return l === "SOB" || l === "NED"; }
function isoZa_zelje(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }

const LETA = [];
for (let y = 2024; y <= 2035; y++) LETA.push(y);

console.log("1) poenotenje NI spremenilo nobenega izida");
{
  const razlike = { zadnjiDan: [], obseg: [], iso: [], dan2: [], dan3: [], vikend: [] };
  LETA.forEach(y => {
    for (let m = 1; m <= 12; m++) {
      const mesecStr = `${y}-${String(m).padStart(2, "0")}`;
      if (D.zadnjiDan(y, m) !== danovVMesecu2_admin(mesecStr)) razlike.zadnjiDan.push(mesecStr + " (admin)");
      if (D.zadnjiDan(y, m) !== danovVMesecu_zelje(y, m - 1)) razlike.zadnjiDan.push(mesecStr + " (zelje)");
      const noviO = JSON.stringify(D.obseg(mesecStr));
      if (noviO !== JSON.stringify(monthRange_index(mesecStr))) razlike.obseg.push(mesecStr + " (index)");
      if (noviO !== JSON.stringify(monthRange_admin(mesecStr))) razlike.obseg.push(mesecStr + " (admin)");
      for (let d = 1; d <= D.zadnjiDan(y, m); d++) {
        const isoD = D.iso(y, m, d);
        if (isoD !== isoZaMesec_admin(mesecStr, d)) razlike.iso.push(isoD + " (admin)");
        if (isoD !== isoZa_zelje(y, m - 1, d)) razlike.iso.push(isoD + " (zelje)");
        if (D.dan3(isoD) !== dowZa_zelje(y, m - 1, d)) razlike.dan3.push(isoD);
        if (D.dan3(isoD) !== DNI_KRATKO_admin[new Date(isoD + "T00:00:00").getDay()]) razlike.dan3.push(isoD + " (admin)");
        const jeVik = D.dan2(isoD) === "SO" || D.dan2(isoD) === "NE";
        if (jeVik !== jeVikend_zelje(y, m - 1, d)) razlike.vikend.push(isoD);
      }
      const noviD = JSON.stringify(D.dnevi(D.obseg(mesecStr).startISO, D.obseg(mesecStr).endISO));
      const stariD = JSON.stringify(daysInRange_index(monthRange_index(mesecStr).startISO, monthRange_index(mesecStr).endISO));
      if (noviD !== stariD) razlike.dan2.push(mesecStr);
    }
  });
  Object.keys(razlike).forEach(k => {
    trdi(razlike[k].length === 0, `${k}: enako kot prej v vseh ${LETA.length} letih`
      + (razlike[k].length ? ` – razlike: ${razlike[k].slice(0, 4).join(", ")}` : ""));
  });
}

console.log("2) prestopna leta in konci mesecev");
{
  eq(D.zadnjiDan(2024, 2), 29, "februar 2024 (prestopno)");
  eq(D.zadnjiDan(2026, 2), 28, "februar 2026");
  eq(D.zadnjiDan(2000, 2), 29, "februar 2000 (deljivo s 400)");
  eq(D.zadnjiDan(2100, 2), 28, "februar 2100 (deljivo s 100, ne s 400)");
  eq(D.zadnjiDan(2026, 12), 31, "december");
  eq(D.zadnjiDan(2026, 4), 30, "april");
  eq(JSON.stringify(D.obseg("2026-02")), '{"startISO":"2026-02-01","endISO":"2026-02-28"}', "obseg februarja");
}

console.log("3) prehod čez mesec in čez leto");
{
  const cezMesec = D.dnevi("2026-09-29", "2026-10-02").map(x => x.datum);
  eq(cezMesec.join(" "), "2026-09-29 2026-09-30 2026-10-01 2026-10-02", "iz septembra v oktober");
  const cezLeto = D.dnevi("2026-12-30", "2027-01-02").map(x => x.datum);
  eq(cezLeto.join(" "), "2026-12-30 2026-12-31 2027-01-01 2027-01-02", "iz 2026 v 2027");
  eq(D.dnevi("2026-09-01", "2026-09-01").length, 1, "en sam dan");
  eq(D.dnevi("2026-09-02", "2026-09-01").length, 0, "obrnjen obseg da prazen seznam");
}

console.log("4) datum se razčleni kot BESEDILO (časovni pas ne premakne dneva)");
{
  // "new Date('2026-10-27')" je polnoč UTC in v pasu za UTC vrne 26.10.
  // Zato se sestavlja ob 12:00 lokalno - isto kot v prazniki.js.
  eq(D.dan2("2026-10-27"), "TO", "27.10.2026 je torek");
  eq(D.dan3("2026-10-27"), "TOR", "isti dan v triglasni obliki");
  eq(D.dnevi("2026-10-27", "2026-10-27")[0].datum, "2026-10-27", "dan se v seznamu ne premakne");
  // Preverimo KODO, ne komentarjev - opozorilo o tej pasti je v datum.js
  // zapisano prav z besedami "new Date(iso)" in bi se sicer ujelo samo.
  const kodaBrezKomentarjev = readFileSync(join(koren, "datum.js"), "utf8")
    .split("\n").filter(v => !/^\s*(\/\/|\*|\/\*)/.test(v)).join("\n");
  trdi(!/new Date\((iso|isoDatum)\)/.test(kodaBrezKomentarjev),
    "datum.js nikjer ne kliče new Date(iso) neposredno");
}

console.log("5) neveljaven vhod ne podre izračuna");
{
  eq(D.dan2(""), "", "prazen niz");
  eq(D.dan3(null), "", "null");
  eq(D.dan2("27.10.2026"), "", "napačna oblika");
  eq(D.dnevi("", "2026-09-30").length, 0, "prazen začetek");
  eq(D.dnevi("2026-09-01", "").length, 0, "prazen konec");
}

console.log("6) vse strani uporabljajo skupni modul");
{
  const strani = ["index.html", "imenik.html", "admin.html", "zelje.html"];
  strani.forEach(s => {
    const src = readFileSync(join(koren, s), "utf8");
    trdi(/<script src="datum\.js"><\/script>/.test(src), `${s} nalaga datum.js`);
    trdi(/window\.Datum\./.test(src), `${s} ga tudi res uporabi`);
  });

  // Nobene lastne kopije izračuna več. Funkcije z istimi imeni SMEJO
  // ostati - a samo kot enovrstični pretvorniki, ki račun predajo modulu
  // (zelje.html npr. dela z indeksom meseca 0-11, modul z 1-12). Zato ne
  // preverjamo, da imena ni, ampak da v njem NI RAČUNA: nobenega
  // "new Date(...)" in nobenega ročnega sestavljanja datuma.
  const pretvorniki = [
    ["index.html", "monthRange"], ["index.html", "daysInRange"],
    ["admin.html", "danovVMesecu2"], ["admin.html", "isoZaMesec"],
    ["zelje.html", "danovVMesecu"], ["zelje.html", "isoZa"], ["zelje.html", "dowZa"],
  ];
  pretvorniki.forEach(([datoteka, ime]) => {
    const src = readFileSync(join(koren, datoteka), "utf8");
    const m = new RegExp("(?:function\\s+" + ime + "\\s*\\([^)]*\\)\\s*\\{([^}]*)\\}"
      + "|const\\s+" + ime + "\\s*=\\s*([^;\\n]*))").exec(src);
    trdi(!!m, `${datoteka}: ${ime} je najden`);
    if (!m) return;
    const telo = (m[1] || m[2] || "");
    trdi(/window\.Datum\./.test(telo), `${datoteka}: ${ime}() račun preda modulu datum.js`);
    trdi(!/new Date\(/.test(telo), `${datoteka}: ${ime}() sam ne računa z Date`);
  });

  // Vikend se bere iz prazniki.js, ne iz lastne primerjave kratic.
  const zelje = readFileSync(join(koren, "zelje.html"), "utf8");
  trdi(!/l==="SOB"\|\|l==="NED"/.test(zelje), "zelje.html vikenda ne ugotavlja več iz kratice dneva");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
