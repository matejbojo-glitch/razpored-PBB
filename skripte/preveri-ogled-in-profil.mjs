#!/usr/bin/env node
/* Preizkus treh stvari, ki jih je uporabnik prijavil večkrat.
 *
 * 1) IZHOD IZ OGLEDA ("Prekini ogled") se ne sme ustaviti na omrežju.
 *    Prej se je preusmeritev zgodila šele PO zapisu v revizijo. Če ta ni
 *    odgovoril (počasna povezava, prekinjen WiFi), se ni zgodila NIKOLI -
 *    admin je pritisnil gumb, stran pa je ostala pri tuji osebi in videti
 *    je bilo, kot da je ostal prijavljen kot ona.
 *
 * 2) ODJAVA mora ogled tudi končati. Prej se ključ ni počistil, zato je
 *    admin po odjavi in ponovni prijavi v ISTEM zavihku spet pristal v
 *    pogledu tuje osebe.
 *
 * 3) KLIK NA IME odpre profil. Povezave "imenik.html?id=<uuid>" so v
 *    aplikaciji obstajale že prej, a jih Imenik ni prebral - parameter se
 *    je samo zapisoval. Klik je zato pripeljal na navaden seznam.
 *
 * Zagon: node skripte/preveri-ogled-in-profil.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

/* Peskovnik s ponarejenim Supabase odjemalcem. "odziv" določa, kako se
 * obnaša omrežje: takoj, ali sploh nikoli. */
function pesek(odziv) {
  const shramba = {};
  const stanje = { url: null, odjavljen: false };
  const veriga = () => {
    const o = {};
    ["from", "select", "eq", "single", "insert", "order", "maybeSingle"].forEach(m => { o[m] = () => o; });
    o.update = () => ({ eq: () => odziv() });
    o.auth = { signOut: () => { stanje.odjavljen = true; return odziv(); } };
    return o;
  };
  const sb = {
    console,
    // POZOR: brez setTimeout bi zRokom() v supabase-client.js vrgel
    // napako, to bi ujel njegov catch in preusmeritev bi se zgodila iz
    // NAPAČNEGA razloga - preizkus bi "uspel", ne da bi rok sploh
    // preizkusil. (Prav to se je zgodilo pri prvem zagonu.)
    setTimeout, clearTimeout,
    sessionStorage: {
      getItem: k => (k in shramba ? shramba[k] : null),
      setItem: (k, v) => { shramba[k] = String(v); },
      removeItem: k => { delete shramba[k]; },
    },
    location: {
      get href() { return stanje.url; },
      set href(v) { stanje.url = v; },
      replace(v) { stanje.url = v; },
    },
    document: { addEventListener() {}, readyState: "complete" },
  };
  sb.window = sb;
  sb.supabase = { createClient: () => veriga() };
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(koren, "supabase-client.js"), "utf8"), sb);
  return { A: sb.window.RazporedAuth, shramba, stanje };
}
const takoj = () => Promise.resolve({ error: null });
const nikoli = () => new Promise(() => {});
const pocakaj = (ms) => new Promise(r => setTimeout(r, ms));

console.log("1) Izhod iz ogleda deluje tudi, kadar omrežje NE odgovori");
{
  const { A, shramba, stanje } = pesek(nikoli);
  shramba["razpored-view-as"] = JSON.stringify({ targetId: "x", logId: 7 });
  A.koncajOgled();
  await pocakaj(2200); // dlje od roka v supabase-client.js
  trdi(!("razpored-view-as" in shramba), "ogled je počiščen");
  trdi(stanje.url === "index.html", "in preusmeritev se JE zgodila (prej je obtičala)");
}

console.log("2) Ob normalnem omrežju je izhod takojšen");
{
  const { A, shramba, stanje } = pesek(takoj);
  shramba["razpored-view-as"] = JSON.stringify({ targetId: "x", logId: 7 });
  A.koncajOgled();
  await pocakaj(120);
  trdi(stanje.url === "index.html", "preusmeritev brez čakanja na rok");
  trdi(!("razpored-view-as" in shramba), "ogled je počiščen");
}

console.log("3) Odjava konča ogled - po ponovni prijavi nisi več tuja oseba");
{
  const { A, shramba, stanje } = pesek(takoj);
  shramba["razpored-view-as"] = JSON.stringify({ targetId: "x", logId: 7 });
  A.signOut();
  await pocakaj(120);
  trdi(!("razpored-view-as" in shramba), "ogled je ob odjavi počiščen");
  trdi(stanje.url === "login.html", "in preusmeritev na prijavo");
}

console.log("4) Tudi odjava se ne ustavi na omrežju");
{
  const { A, stanje } = pesek(nikoli);
  A.signOut();
  await pocakaj(2200);
  trdi(stanje.url === "login.html", "odjava se konča tudi brez odziva strežnika");
}

console.log("5) Klik na ime odpre profil");
{
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  trdi(/useState\(\(\) => \{[\s\S]{0,200}searchParams\.get\("id"\)/.test(imenik),
    "Imenik prebere ?id= iz naslova (prej ga je samo zapisoval)");
  trdi(/popstate/.test(imenik), "gumb 'nazaj' v brskalniku profil zapre");

  // Povezave po aplikaciji morajo kazati na ta naslov.
  const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
  const zPovezavo = strani.filter(f => /imenik\.html\?id=/.test(readFileSync(join(koren, f), "utf8")));
  trdi(zPovezavo.length >= 4, `povezave na profil so na ${zPovezavo.length} straneh (${zPovezavo.join(", ")})`);
  // Razpredelnica je od avgusta 2026 v Razporedu, ne v Imeniku - povezava
  // na profil se zato preverja tam.
  trdi(/href=\{"imenik\.html\?id=" \+ o\.id\}/.test(readFileSync(join(koren, "index.html"), "utf8")),
    "tudi ime v Razpredelnici je povezava na profil");

  // Kalup in Menjava: tam v podatkih ni bilo identifikatorja, zato sta
  // bili imeni doslej navadno besedilo.
  const admin = readFileSync(join(koren, "admin.html"), "utf8");
  trdi(/function ImeOsebe\(/.test(admin), "Generator ima skupno oznako imena kot povezave");
  trdi(/select\("id, full_name, rotation_slot"\)/.test(admin),
    "oddelčni seznam prinese tudi id (prej ga ni)");
  trdi(/<ImeOsebe id=\{idPoImenu\[z\.ime\]\}/.test(admin), "mreža Kalupa: ime je povezava");
  trdi((admin.match(/<ImeOsebe id=\{z\.id\}/g) || []).length >= 2,
    "dežurstva (pravičnost in seznam): ime je povezava");
  // Kjer ID-ja ni, povezave ne sme biti - sicer bi peljala nikamor.
  trdi(/if \(!id\) return <React\.Fragment>/.test(admin),
    "brez id-ja ostane navadno besedilo");

  const obrazec = readFileSync(join(koren, "obrazec.html"), "utf8");
  trdi(/href=\{"imenik\.html\?id=" \+ k\.profile_id\}/.test(obrazec),
    "Menjava: ime sodelavca je povezava");
}

console.log("6) Moj razpored: delovišče je v isti vrstici, v oklepaju");
{
  const index = readFileSync(join(koren, "index.html"), "utf8");
  // Enota gre pred izpisom skozi formatirajEnotoZaPrikaz (lastna enota
  // prva, "ŽO" namesto kode) - oblika izpisa pa ostaja ista.
  trdi(/besedilo \+ " \(" \+ (enota|prikazEnote) \+ "\)"/.test(index),
    'izpis je oblike "Dopoldne (MO)"');
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
