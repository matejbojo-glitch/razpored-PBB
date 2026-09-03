#!/usr/bin/env node
/* Preizkus preureditve vlog in poimenovanj (september 2026):
 *
 *  1) POIMENOVANJA: "NZV – vodje in administratorji (vključno z
 *     dežurstvi)" -> "NZV vodje"; "FLEXI – plavajoče osebje (več
 *     oddelkov)" -> "FLEXI".
 *
 *  2) IZPIS IMEN v uradni obliki "Priimek Ime". Viri pišejo isto osebo
 *     različno (profili "Alukić Dino", nosilci_oddelkov "ALUKIĆ DINO"),
 *     zato je izpis poenoten prek skupnega imena.js. Vrstni red besed se
 *     NE spreminja - ugibanje, katera beseda je priimek, bi pri
 *     dvobesednih priimkih naredilo več škode kot koristi.
 *
 *  3) POGLED NAVADNEGA ZAPOSLENEGA: brez Imenika in brez Razpredelnice,
 *     v Razporedu trije zavihki (Moj razpored, Oddelki, Dežurstvo), v
 *     spustnem seznamu oddelkov brez "NZV vodje". Administrator in vodja
 *     vidita vse kot doslej.
 *
 *  4) MENJAVA: pri dežurstvu je nabor natanko KROG DEŽURNIH (14 oseb iz
 *     pokriva_oddelek 'DEZ'), ne vsi NZV vodje. Obrazec "Drugo" nima več
 *     polja Opomba.
 *
 *  5) ŽELJE: brez skupine NZV, brez sekcije "Zapisane želje"; ročno se
 *     vpisuje samo še letni dopust (omejitev/bolniška/STI ne več), stari
 *     vnosi teh vrst pa se še vedno izrišejo.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-vloge-in-poimenovanja.mjs
 */
import http from "node:http";
import vm from "node:vm";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4221;
const TIP = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const index = readFileSync(join(koren, "index.html"), "utf8");
const obrazec = readFileSync(join(koren, "obrazec.html"), "utf8");
const zelje = readFileSync(join(koren, "zelje.html"), "utf8");
const nav = readFileSync(join(koren, "nav.js"), "utf8");
const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");

console.log("1) poimenovanji");
{
  trdi(/\('NZV', 'NZV vodje'\)/.test(shema), "shema: NZV vodje");
  trdi(/\('FLEXI', 'FLEXI'\)/.test(shema), "shema: FLEXI");
  trdi(!/vodje in administratorji \(vključno/.test(shema), "starega naziva NZV ni več");
  trdi(!/plavajoče osebje \(več oddelkov\)/.test(shema), "starega naziva FLEXI ni več");
  trdi(/name: "NZV vodje"/.test(index), "Razpored: NZV vodje");
  trdi(!/NZV – vodje in administratorji/.test(zelje), "Želje: starega naziva ni več");
}

console.log("2) izpis imen v obliki \"Priimek Ime\"");
{
  const s = { console }; s.window = s; vm.createContext(s);
  vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), s);
  const P = s.window.Imena.priimekIme;
  eq(P("ALUKIĆ DINO"), "Alukić Dino", "velike črke iz nosilci_oddelkov");
  eq(P("ŠUBIC PETRA"), "Šubic Petra", "šumniki se pravilno pomanjšajo");
  eq(P("MAVRI TRATNIK MAGDALENA"), "Mavri Tratnik Magdalena", "dvobesedni priimek ostane cel");
  eq(P("  DŽAMASTAGIĆ   DENIS "), "Džamastagić Denis", "odvečni presledki se počistijo");
  eq(P("MARIJA-ANA NOVAK"), "Marija-Ana Novak", "vezaj se ohrani, obe polovici veliki");
  eq(P("Alukić Dino"), "Alukić Dino", "že pravilen zapis ostane nedotaknjen");
  eq(P("dr. Novak"), "dr. Novak", "zapis, ki ni ves z velikimi črkami, se ne spreminja");
  eq(P(""), "", "prazno ostane prazno");
  eq(P(null), "", "in manjkajoče prav tako");

  console.log("   in kratka oblika \"Priimek Z.\" za ozke stolpce razporeda:");
  const Z = s.window.Imena.priimekZacetnica;
  eq(Z("Svetina Sara"), "Svetina S.", "priimek in prva črka imena");
  eq(Z("Rejc Jan"), "Rejc J.", "isto za drugo osebo");
  eq(Z("SVETINA SARA"), "Svetina S.", "tudi kadar vir piše z velikimi črkami");
  eq(Z("Mavri Tratnik Magdalena"), "Mavri Tratnik M.", "dvobesedni priimek ostane cel");
  eq(Z("Novak"), "Novak", "enobesedni zapis ostane, kakršen je");
  eq(Z(""), "", "prazno ostane prazno");
  // Vrstni red se NE ugiba - to bi pri dvobesednih priimkih razbilo ime.
  eq(P("NOVAK ANA MARIJA"), "Novak Ana Marija", "vrstni red besed ostane nespremenjen");
  trdi(/priimekIme/.test(index), "Razpored ga uporabi pri izpisu nosilcev/nadomeščanj");
}

console.log("3) pogled navadnega zaposlenega (iz kode)");
{
  trdi(/{ key: "imenik",[^}]*roles: \["admin", "vodja"\] }/.test(nav), "nav.js: Imenik samo admin in vodja");
  trdi(/requireRole\(\["admin", "vodja"\]\)/.test(imenik), "imenik.html vlogo preveri tudi sam (skrit meni ni zapora)");
  trdi(/const jeVodstvo = /.test(index), "Razpored loči vodstvo od zaposlenega");
  trdi(/\.\.\.\(jeVodstvo \? \[\["stanje", "Razpredelnica"/.test(index), "zavihek Razpredelnica je pogojen");
  trdi(/view==="stanje" && jeVodstvo &&/.test(index), "in tudi njen izris (ne le gumb)");
  trdi(/if \(vloga === "admin" \|\| vloga === "vodja"\) \{\s*\n\s*seznam\.push\(\{ code: "NZV"/.test(index),
    "NZV se v spustni seznam doda samo vodstvu");
}

console.log("4) Menjava (iz kode)");
{
  trdi(/from\("pokriva_oddelek"\)\.select\("profile_id"\)\.eq\("department_code", "DEZ"\)/.test(obrazec),
    "pri dežurstvu se nabor bere iz kroga dežurnih (pokriva_oddelek 'DEZ')");
  trdi(/vrsta !== "drugo" && \(/.test(obrazec), "obrazec Drugo nima polja Opomba");
}

console.log("5) Želje (iz kode)");
{
  // NZV mora OSTATI v seznamu skupin: nalozizRoster vanjo uvrsti vsakega
  // vodjo in administratorja. Brez tega iz seznama osebja izpadejo vsi -
  // njihovega dopusta ni mogoče niti videti niti vpisati. Skrije se le
  // navadnemu zaposlenemu (skupineZaVlogo).
  trdi(/\["NZV", "NZV vodje"\]/.test(zelje), "skupina NZV obstaja (vanjo se uvrstijo vodje)");
  trdi(/const skupineZaVlogo = jeVodstvo/.test(zelje), "vidnost skupine je odvisna od vloge");
  trdi(!/Zapisane želje/.test(zelje), "sekcije \"Zapisane želje\" ni več");
  trdi(!/function SeznamZeljTab/.test(zelje), "in tudi njene komponente ne");
  trdi(/const PEN_ROCNO = \["ld"\]/.test(zelje), "ročno se vpisuje samo letni dopust");
  trdi(/omejitev: \{ label: "Omejitev"/.test(zelje) && /bs: \{ label: "BS/.test(zelje),
    "stare vrste ostanejo v legendi, da se obstoječi vnosi še izrišejo");
  trdi(/\["A", "A – oddelek \(SMS\/TZN\)"\]/.test(zelje), "oddelek A je dodan tudi v Želje");
}

const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}
const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "/index.html" : pot);
  if (!dat.startsWith(koren) || !existsSync(dat) || statSync(dat).isDirectory()) {
    odgovor.writeHead(404); return odgovor.end("404");
  }
  let vsebina = readFileSync(dat);
  if (extname(dat) === ".html") vsebina = prevediJsxVHtmlu(vsebina.toString("utf8"));
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

const zdaj = new Date();
const MESEC = zdaj.getFullYear() + "-" + String(zdaj.getMonth() + 1).padStart(2, "0");
const dan = (n) => MESEC + "-" + String(n).padStart(2, "0");

// Krog dežurnih: samo dve od štirih NZV oseb sta v njem - preizkus mora
// pokazati, da vloga ni dovolj.
const PROFILI = [
  { id: "u1", full_name: "Novak Ana",   role: "user",  department_code: "B" },
  { id: "u2", full_name: "Kovač Beti",  role: "user",  department_code: "B" },
  { id: "n1", full_name: "Alukić Dino", role: "vodja", department_code: "NZV" },
  { id: "n2", full_name: "Bojić Matej", role: "admin", department_code: "NZV" },
  { id: "n3", full_name: "Humar Saša",  role: "vodja", department_code: "NZV" },
  { id: "n4", full_name: "Mušič Ines",  role: "vodja", department_code: "NZV" },
];
const KROG_DEZURNIH = [{ profile_id: "n1", department_code: "DEZ" }, { profile_id: "n2", department_code: "DEZ" }];
const VPISI = [
  { employee_id: "u1", work_date: dan(1), shift_code: "Dopoldne",  department_code: "B" },
  { employee_id: "n1", work_date: dan(1), shift_code: "DEŽURSTVO", department_code: "DEZ" },
  { employee_id: "n2", work_date: dan(3), shift_code: "DEŽURSTVO", department_code: "DEZ" },
];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const odpri = async (stranIme, kdo) => {
    const stran = await brskalnik.newPage({ viewport: { width: 1400, height: 1000 } });
    stran.on("pageerror", e => konzolaVse.push(stranIme + "/" + kdo + ": " + e));
    stran.on("console", m => { if (m.type() === "error") konzolaVse.push(stranIme + "/" + kdo + ": " + m.text()); });
    await stran.addInitScript(({ profili, vpisi, krog, mojId }) => {
      const tabele = { profili, razpored: vpisi, pokriva_oddelek: krog,
        oddelki: [{ code: "A", name: "A – oddelek" }, { code: "B", name: "B – oddelek" },
                  { code: "FLEXI", name: "FLEXI" }],
        nosilci_oddelkov: [], nadomescanja: [], odsotnosti: [], obrazci: [], obrazci_dnevnik: [],
        menjave_javno: [], dezurni_zdravniki: [], obvestila: [], zelje_zaposlenih: [], nzv_nastavitve: [] };
      const poizvedba = (v) => {
        const filtri = [];
        const izbrani = () => v.filter(r => filtri.every(([k, x]) => r[k] === x))
          .map(r => (r.employee_id && !r.profili
            ? Object.assign({}, r, { profili: profili.find(p => p.id === r.employee_id) || null }) : r));
        const b = new Proxy({}, { get(_, n) {
          if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
          if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data: izbrani()[0] || null, error: null });
          if (n === "insert" || n === "upsert") return () => Promise.resolve({ data: [], error: null });
          if (n === "then") return (nx) => Promise.resolve({ data: izbrani(), error: null }).then(nx);
          if (typeof n !== "string") return undefined;
          return () => b;
        }});
        return b;
      };
      let pravi = null;
      Object.defineProperty(window, "RazporedAuth", { configurable: true,
        get() { return pravi; },
        set(v) {
          pravi = v;
          if (v && typeof v === "object") {
            const profil = profili.find(p => p.id === mojId);
            const seja = { session: { user: { id: mojId } }, profile: profil, ogled: false };
            v.client = { from: (t) => poizvedba(tabele[t] || []), rpc: () => Promise.resolve({ data: null, error: null }),
              auth: {
                getSession: () => Promise.resolve({ data: { session: seja.session } }),
                getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              }};
            v.requireAuth = () => Promise.resolve(seja);
            v.requireRole = (vloge) => Promise.resolve(!vloge || vloge.includes(profil.role) ? seja : null);
            v.getSessionAndProfile = () => Promise.resolve(seja);
            v.unreadNotificationCount = () => Promise.resolve(0);
            v.vseStrani = (fn) => Promise.resolve(fn(0, 999)).then(r => (r && r.data) || []);
          }
        },
      });
    }, { profili: PROFILI, vpisi: VPISI, krog: KROG_DEZURNIH, mojId: kdo });
    await stran.goto(`http://127.0.0.1:${VRATA}/` + stranIme, { waitUntil: "load" });
    return stran;
  };

  console.log("6) Razpored: navaden zaposleni proti vodstvu");
  {
    const zaposleni = await odpri("index.html", "u1");
    await zaposleni.waitForSelector(".segIkone button", { timeout: 15000 });
    await zaposleni.waitForTimeout(600);
    eq(await zaposleni.$$eval(".segIkone .segNaziv", e => e.map(x => x.textContent.trim())),
      ["Moj razpored", "Oddelki", "Dežurstvo"], "zaposleni ima tri zavihke, brez Razpredelnice");
    await zaposleni.click('.segIkone button:has-text("Oddelki")');
    await zaposleni.waitForSelector("#wd", { timeout: 15000 });
    const oddelkiZaposleni = await zaposleni.$$eval("#wd option", e => e.map(x => x.textContent.trim()));
    trdi(!oddelkiZaposleni.some(t => /NZV/.test(t)),
      "in v spustnem seznamu ni NZV: " + oddelkiZaposleni.join(" | "));
    trdi(!(await zaposleni.$$eval(".rpNav a", e => e.map(x => x.textContent))).some(t => /Imenik/.test(t)),
      "v meniju ni Imenika");
    await zaposleni.close();

    const vodja = await odpri("index.html", "n1");
    await vodja.waitForSelector(".segIkone button", { timeout: 15000 });
    await vodja.waitForTimeout(600);
    eq(await vodja.$$eval(".segIkone .segNaziv", e => e.map(x => x.textContent.trim())),
      ["Moj razpored", "Oddelki", "Razpredelnica", "Dežurstvo"], "vodja ima vse štiri zavihke");
    await vodja.click('.segIkone button:has-text("Oddelki")');
    await vodja.waitForSelector("#wd", { timeout: 15000 });
    const oddelkiVodja = await vodja.$$eval("#wd option", e => e.map(x => x.textContent.trim()));
    trdi(oddelkiVodja.includes("NZV vodje"), "in NZV v seznamu, z novim nazivom: " + oddelkiVodja.join(" | "));
    trdi(oddelkiVodja.includes("FLEXI"), "FLEXI je zapisan brez pripisa");
    // NZV vodja se mora odpreti NA SVOJEM razporedu. Prej je pristal na
    // prvem oddelku po abecedi (NZV ni v PO_ODDELKIH_KODE) in je izgledalo,
    // kot da njegovega razporeda ni.
    eq(await vodja.$eval("#wd", e => e.value), "NZV", "NZV vodji se privzeto odpre razpored NZV");
    trdi((await vodja.$$(".wardTableNzv")).length === 1, "in izriše se mreža NZV, ne oddelčna");
    await vodja.close();
  }

  console.log("7) Menjava: pri dežurstvu natanko krog dežurnih");
  {
    const stran = await odpri("obrazec.html", "n1");
    await stran.waitForSelector(".tabs button", { timeout: 15000 });
    await stran.waitForTimeout(600);
    await stran.click("button:has-text('Menjava službe')");
    await stran.fill("#da", dan(1));
    await stran.waitForTimeout(800);
    trdi(/Trenutno: Dežurstvo/i.test(await stran.innerText("body")), "izbrani dan je dežurstvo");
    const imena = await stran.$$eval(".candidate .who", e => e.map(x => x.textContent.trim()));
    eq(imena, ["Bojić Matej"], "na voljo je samo drugi član kroga dežurnih, ne vsi NZV vodje");
    trdi(/krog dežurnih/i.test(await stran.innerText("body")), "in besedilo to pove");

    console.log("8) obrazec \"Drugo\" nima polja Opomba");
    await stran.click("button:has-text('Drugo')");
    await stran.waitForTimeout(400);
    trdi((await stran.$$("#rz")).length === 1, "polje Razlog ostane");
    trdi((await stran.$$("#op")).length === 0, "polja Opomba ni več");
    await stran.click("button:has-text('Ročno evidentiranje')");
    await stran.waitForTimeout(400);
    trdi((await stran.$$("#op")).length === 1, "pri ročnem evidentiranju pa Opomba ostane");
    await stran.close();
  }

  console.log("9) Želje: samo letni dopust, brez NZV in brez zapisanih želja");
  {
    const stran = await odpri("zelje.html", "u1");
    await stran.waitForSelector(".skupinaBtn", { timeout: 15000 });
    await stran.waitForTimeout(900);
    const skupine = await stran.$$eval(".skupinaBtn", e => e.map(x => x.textContent.trim()));
    trdi(!skupine.some(t => /NZV/.test(t)), "zaposleni med skupinami nima NZV: " + skupine.join(" | "));
    trdi(skupine.some(t => /^A\b/.test(t)), "oddelek A pa je");
    const barve = await stran.$$eval(".penBtn:not(.eraser)", e => e.map(x => x.textContent.trim()));
    eq(barve, ["LD (dopust)"], "ročno se vpisuje samo letni dopust");
    trdi((await stran.$$(".penBtn.eraser")).length === 1, "gumb za brisanje ostane");
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(!/Zapisane želje/i.test(t), "sekcije \"Zapisane želje\" ni");
    // Navaden zaposleni tudi pod "Vse" ne sme videti NZV vodij.
    await stran.click('.skupinaBtn:has-text("Vse")');
    await stran.waitForTimeout(600);
    const vseZaposleni = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(!/Alukić|Bojić/.test(vseZaposleni), "in tudi pod \"Vse\" ne vidi NZV vodij");
    await stran.close();

    // Vodja: skupina NZV je na voljo in se privzeto odpre - vanjo se
    // uvrstijo vsi vodje in administratorji.
    const vodja = await odpri("zelje.html", "n1");
    await vodja.waitForSelector(".skupinaBtn", { timeout: 15000 });
    await vodja.waitForTimeout(900);
    const skupineVodja = await vodja.$$eval(".skupinaBtn", e => e.map(x => x.textContent.trim()));
    trdi(skupineVodja.includes("NZV"), "vodja skupino NZV ima: " + skupineVodja.join(" | "));
    eq(await vodja.$eval('.skupinaBtn[aria-selected="true"]', e => e.textContent.trim()), "NZV",
      "in se nanjo privzeto odpre");
    const vsebina = (await vodja.innerText("body")).replace(/\s+/g, " ");
    trdi(/Alukić/.test(vsebina) && /Bojić/.test(vsebina),
      "v skupini so vodje in administratorji: " + vsebina.slice(0, 160));
    await vodja.close();
  }

  const prave = konzolaVse.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
