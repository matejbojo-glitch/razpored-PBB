#!/usr/bin/env node
/* Čistka Generatorja in Statistike (september 2026).
 *
 * Kaj varuje ta preizkus:
 *
 *  1) ENA POT DO PODROBNOSTI. Statusni trak nad mrežo je samo povzetek -
 *     tri značke s števci. Klik na značko odpre predal "Statistika mreže"
 *     na pripadajočem razdelku. Trak NE sme več razgrinjati svoje plošče
 *     (kartica StatusPravil + kopija seznamov nepokritih izmen in kršitev),
 *     ker je bila to druga kopija istih številk.
 *
 *  2) PREDAL NOSI VSE TRI SEZNAME. Nepokrite izmene, delovnopravne kršitve
 *     (kritične IN opozorila) ter omejitve brez nadomestila. Prva dva sta
 *     bila prej v predalu, opozorila v zložljivem razdelku pod mrežo,
 *     omejitve pa samo v razširjeni znački - torej na treh mestih.
 *
 *  3) IMENA SE NE PODVAJAJO. V spodnji navigaciji stoji "📊 Statistika"
 *     (dashboard.html). Lebdeči gumb v Generatorju zato piše "Statistika
 *     mreže" - dva enaka gumba z isto ikono na istem zaslonu, ki vodita
 *     vsak drugam, sta bila past.
 *
 *  4) AKCIJSKA VRSTICA POD MREŽO bere kot delovni tok: Predlagaj mesec ->
 *     Objavi -> Zapiši v Sheets. "Predlagaj mesec" je bil prej zložljiv
 *     razdelek, čigar edina vsebina je bil gumb z istim imenom.
 *
 *  5) UVOZ KVOT SE PRIJAVI. RazporedUvozVir mora stati ZUNAJ zložljivih
 *     razdelkov: Zlozljivo zaprtih otrok ne izriše, zato se vir ni
 *     prijavil in povezava admin.html?tab=kalup&uvoz=kvote-dopusta ni
 *     odprla ničesar.
 *
 *  6) KATALOG UVOZOV NE LAŽE. Vnos na zavihku Uporabniki je bil označen
 *     kot "Omejitve za NZV (ime, dopust, omejitve)", odpiral pa je uvoz
 *     vlog in oddelkov (full_name, role, department_code).
 *
 *  7) IZRAČUNI SO NEDOTAKNJENI. Kršitev "8+ zaporednih delovnih dni" in
 *     LD kot 8 h na dan morata ostati - čistka je bila vmesniška.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-generator-cistka.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4231;
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

const admin = readFileSync(join(koren, "admin.html"), "utf8");
const uvoz  = readFileSync(join(koren, "uvoz.html"), "utf8");
// Komentarji smejo govoriti o odstranjenem (pojasnjujejo, ZAKAJ ga ni);
// koda ne.
const adminKoda = admin
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

console.log("1) Statusni trak je samo povzetek – podrobnosti so v predalu");
{
  trdi(!/function StatusPravil\b/.test(admin),
    "komponente StatusPravil ni več (pet vrstic je ponovilo tri značke)");
  trdi(!/<StatusPravil\b/.test(adminKoda), "in se nikjer ne izrisuje");
  trdi(!/statusTrak .podrobnosti|className="podrobnosti"/.test(adminKoda),
    "trak nima več razgrnjene plošče");
  trdi(!/\.statusTrak \.podrobnosti/.test(admin), "z njo je odšel tudi njen slog");
  trdi(/odpriStatistiko\(z\.razdelek\)/.test(admin), "klik na značko odpre predal na razdelku");
  trdi(!/aria-expanded=\{odprto === z\.kljuc\}/.test(admin), "značka ne trdi več, da se razgrne");
  trdi(/aria-haspopup="dialog"/.test(admin), "ampak da odpre pogovorno okno");
}

console.log("2) Predal nosi vse tri sezname");
{
  trdi(/data-razdelek="napake"/.test(admin), "razdelek 'napake' je označen za pomik");
  trdi(/data-razdelek="omejitve"/.test(admin), "razdelek 'omejitve' je označen za pomik");
  trdi(/data-razdelek="obseg"/.test(admin), "razdelek 'obseg' je označen za pomik");
  trdi(/const opozorilneKrsitve = /.test(admin), "predal loči opozorila od kritičnih kršitev");
  trdi(/kriticne\.concat\(opozorilneKrsitve\)/.test(admin), "in izriše oba seznama, kritične najprej");
  trdi(/const omejitve = \(rezultat && rezultat\.opozorila\)/.test(admin),
    "omejitve brez nadomestila so se preselile v predal");
  // Zložljivi razdelek pod mrežo je bil DRUGA kopija seznama kršitev.
  trdi(!/function KrsitveSeznam\b/.test(admin), "komponente KrsitveSeznam ni več");
  trdi(!/Podroben seznam delovnopravnih kršitev/.test(adminKoda),
    "zložljivega razdelka s kršitvami pod mrežo ni več");
}

console.log("3) Imena se ne podvajajo s spodnjo navigacijo");
{
  trdi(/<span>Statistika mreže<\/span>/.test(admin), "lebdeči gumb piše 'Statistika mreže'");
  trdi(/<h3>📊 Statistika mreže<\/h3>/.test(admin), "in predal nosi isti naslov");
  const nav = readFileSync(join(koren, "nav.js"), "utf8");
  trdi(/lbl: "Statistika"/.test(nav), "v navigaciji ostane 'Statistika' (dashboard.html) – zato razlika v imenu");
}

console.log("4) Akcijska vrstica pod mrežo");
{
  trdi(!/Zlozljivo naslov="🧩 Predlagaj mesec/.test(admin),
    "'Predlagaj mesec' ni več zložljiv razdelek s podvojenim imenom");
  trdi(/🧩 Predlagaj mesec\s*\n?\s*<\/button>/.test(admin), "ampak gumb");
  // Gumb mora biti V akcijski vrstici, pred objavo.
  const vrstica = admin.slice(admin.indexOf('className="orodjaDno no-print"'));
  const doKonca = vrstica.slice(0, vrstica.indexOf("</div>"));
  trdi(/🧩 Predlagaj mesec/.test(doKonca), "in stoji v vrstici .orodjaDno");
  trdi(doKonca.indexOf("🧩 Predlagaj mesec") < doKonca.indexOf("Objavi neposredno v Supabase"),
    "pred gumbom za objavo (delovni tok: zapolni → objavi)");
  // Samo v KODI: komentar ob razdelku sme navesti staro ime in povedati,
  // zakaj ga ni več.
  trdi(!/4b · Pokritost po dnevih/.test(adminKoda), "viseče oštevilčenje '4b ·' je odstranjeno");
  trdi(/Pokritost po dnevih in minimumi po izmeni/.test(admin), "razdelek se imenuje po tem, kar vsebuje");
  trdi(!/<footer className="foot no-print">/.test(adminKoda), "statična noga z zgodovino razvoja je odstranjena");
}

console.log("5) Uvoz kvot se prijavi (vir zunaj zložljivega razdelka)");
{
  const zacetek = admin.indexOf("const sekundarnaOrodja = (");
  const virAt = admin.indexOf('kljuc="kvote-dopusta"', zacetek);
  const prviZlozljiv = admin.indexOf("<Zlozljivo", zacetek);
  trdi(virAt > -1 && virAt < prviZlozljiv,
    "RazporedUvozVir stoji pred prvim <Zlozljivo> in se zato vedno prijavi");
  trdi(admin.indexOf("ref={kvoteFileRef}", zacetek) < prviZlozljiv,
    "skrito polje za datoteko je ob njem");
  trdi(/📤 Uvozi letne kvote dopusta \(CSV\/Excel\)/.test(admin),
    "gumb v razdelku ostane (ikone 📥 na straneh ni – RazporedUvozIkona ni nikjer nameščena)");
}

console.log("6) Katalog uvozov ne laže");
{
  trdi(!/omejitve-nzv/.test(admin) && !/omejitve-nzv/.test(uvoz), "napačnega ključa ni več nikjer");
  trdi(/kljuc="vloge-oddelki"/.test(admin), "vir na zavihku Uporabniki se imenuje 'vloge-oddelki'");
  trdi(/uvoz=vloge-oddelki/.test(uvoz), "in katalog kaže nanj");
  trdi(/full_name, role, department_code/.test(uvoz), "opis v katalogu navaja prave stolpce");
}

console.log("7) Izračuni so nedotaknjeni");
{
  const dc = readFileSync(join(koren, "delovni-cas.js"), "utf8");
  trdi(/zaporedn/i.test(dc), "pravilo o zaporednih delovnih dneh je še v delovni-cas.js");
  const stat = readFileSync(join(koren, "statistika-core.js"), "utf8");
  trdi(/ldUr/.test(stat), "LD ure se še vedno seštevajo v statistiki");
  trdi(/Letni dopust \(LD\) šteje 8 h na dan/.test(admin), "in pojasnilo o 8 h ostane v predalu");
  trdi(/StatKartica lbl="Letni dopust \(LD\)"/.test(admin), "kartica z LD urami ostane");
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

// Šest oseb na oddelku B: dovolj za pravo mrežo in za to, da generator
// vrne tudi nekaj delovnopravnih opozoril (tedenske ure).
const PROFILI = [
  { id:"a", full_name:"Admin Ana", role:"admin", department_code:"B", rotacijska_crka:"A" },
  { id:"b2", full_name:"Kovac Bine", role:"zaposleni", department_code:"B", rotacijska_crka:"B" },
  { id:"b3", full_name:"Zupan Cilka", role:"zaposleni", department_code:"B", rotacijska_crka:"C" },
  { id:"b4", full_name:"Horvat Dani", role:"zaposleni", department_code:"B", rotacijska_crka:"D" },
  { id:"b5", full_name:"Krajnc Eva", role:"zaposleni", department_code:"B", rotacijska_crka:"E" },
];
const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1400, height: 1000 } });
  stran.on("pageerror", e => konzolaVse.push("" + e));
  stran.on("console", m => { if (m.type() === "error") konzolaVse.push(m.text()); });
  await stran.addInitScript(({ profili }) => {
    const tabele = { profili, oddelki:[{ code:"B", name:"B – oddelek" }],
      razpored:[], zelje_zaposlenih:[], odsotnosti:[], minimalna_zasedba:[],
      nosilci_oddelkov:[], nadomescanja:[], obrazci:[], nzv_nastavitve:[],
      sheet_connections:[], sync_errors:[], dnevnik_profilov:[], kadrovski_podatki:[],
      stanje_dopusta_obdobja:[], stanje_dopusta_pregled:[] };
    const poizvedba = (v) => new Proxy({}, { get(_, n) {
      if (n === "then") return (nx) => Promise.resolve({ data:v, error:null }).then(nx);
      if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data:v[0]||null, error:null });
      if (n === "insert" || n === "upsert" || n === "delete") return () => Promise.resolve({ data:[], error:null });
      if (typeof n !== "string") return undefined;
      return () => poizvedba(v);
    }});
    let pravi = null;
    Object.defineProperty(window, "RazporedAuth", { configurable:true,
      get() { return pravi; },
      set(v) { pravi = v;
        if (v && typeof v === "object") {
          const seja = { session:{ user:{ id:"a" } }, profile:profili[0], ogled:false };
          v.client = { from:(t) => poizvedba(tabele[t] || []), rpc:() => Promise.resolve({ data:null, error:null }),
            auth:{ getSession:() => Promise.resolve({ data:{ session: seja.session } }),
                   getUser:() => Promise.resolve({ data:{ user: seja.session.user } }),
                   onAuthStateChange:() => ({ data:{ subscription:{ unsubscribe(){} } } }) } };
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
          v.getSessionAndProfile = () => Promise.resolve(seja);
          v.unreadNotificationCount = () => Promise.resolve(0);
          v.vseStrani = (fn) => Promise.resolve(fn(0, 999)).then(r => (r && r.data) || []);
        } } });
  }, { profili: PROFILI });
  await stran.goto(`http://127.0.0.1:${VRATA}/admin.html`, { waitUntil:"load" });
  await stran.waitForSelector(".tabs button", { timeout:15000 });
  await stran.waitForTimeout(1000);
  await stran.selectOption("#odd", "B");
  await stran.waitForTimeout(700);
  await stran.click("button:has-text('Generiraj takoj')");
  await stran.waitForSelector("table.wardTable", { timeout:15000 });
  await stran.waitForTimeout(1200);

  console.log("8) V brskalniku: trak, predal in akcijska vrstica");
  {
    const znacke = await stran.$$(".statusTrak .znacka");
    trdi(znacke.length === 3, "trak ima tri značke – dobil " + znacke.length);
    trdi((await stran.$$(".statusTrak .podrobnosti")).length === 0,
      "trak nima razgrnjene plošče niti pred klikom");

    // Klik na prvo značko mora odpreti predal, NE razgrniti plošče.
    await znacke[0].click();
    await stran.waitForTimeout(600);
    trdi((await stran.$$(".statPredal.odprto")).length === 1, "klik na značko odpre predal");
    trdi((await stran.$$(".statusTrak .podrobnosti")).length === 0,
      "in pod trakom se ne pojavi druga kopija seznamov");

    const naslovi = await stran.$$eval(".statPredal .statNaslov", e => e.map(x => x.textContent.replace(/\s*\(.*\)\s*/, "").trim()));
    eq(naslovi, ["Razporeditev dela po delu dneva", "Nepokrite izmene",
      "Delovnopravne kršitve", "Omejitve brez nadomestila", "Obremenjenost po zaposlenih"],
      "predal nosi vseh pet razdelkov v enem stolpcu");

    // Opozorila (ne le kritične kršitve) morajo biti vidna v predalu.
    // Pozor: .statNaslov ima text-transform:uppercase, innerText pa
    // preobrazbo upošteva - primerjava mora biti neobčutljiva na velikost.
    const besediloPredala = (await stran.innerText(".statPredal")).replace(/\s+/g, " ");
    trdi(/delovnopravne kršitve/i.test(besediloPredala), "naslov združenega seznama kršitev je tu");
    trdi(/opozoril/i.test(besediloPredala), "in v njem so tudi opozorila, ne le kritične kršitve");
    trdi(/letni dopust \(LD\)/i.test(besediloPredala), "kartica LD ur ostane (obračun nedotaknjen)");

    // Pomik na razdelek: klik na značko "omejitve" mora predal pomakniti
    // nanj, ne pustiti na vrhu.
    await stran.click(".statPredal .modalZapri");
    await stran.waitForTimeout(400);
    await (await stran.$$(".statusTrak .znacka"))[1].click();
    await stran.waitForTimeout(700);
    const pomik = await stran.$eval(".statPredal .telo", el => el.scrollTop);
    trdi(pomik > 0, "predal se pomakne na razdelek 'Omejitve brez nadomestila' – scrollTop " + pomik);
    await stran.click(".statPredal .modalZapri");
    await stran.waitForTimeout(300);
  }

  console.log("9) V brskalniku: en sam gumb 'Statistika' na zaslonu");
  {
    // offsetParent je pri position:fixed VEDNO null, zato bi lebdeči gumb
    // po tem merilu "ne obstajal" - vidnost se meri po pravokotniku.
    const vsi = await stran.$$eval("button, a", e => e
      .filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(x => (x.textContent || "").replace(/\s+/g, " ").trim())
      .filter(t => /statistik/i.test(t)));
    // Sme biti natanko dvoje in NE smeta se enako imenovati: postavka v
    // navigaciji (dashboard.html) in lebdeči gumb za mrežo.
    trdi(vsi.length <= 2, "na zaslonu največ dva sprožilca statistike – " + JSON.stringify(vsi));
    trdi(new Set(vsi).size === vsi.length, "in nobena dva se ne imenujeta enako – " + JSON.stringify(vsi));
    trdi(vsi.some(t => /Statistika mreže/.test(t)), "lebdeči gumb je 'Statistika mreže'");
  }

  console.log("10) V brskalniku: zložljivi razdelki pod mrežo");
  {
    const zlozljivi = await stran.$$eval(".zlozljiv > .glava > span:first-child > *:not(.hint), .zlozljiv > .glava",
      e => e.map(x => (x.childNodes[0] && x.childNodes[0].textContent || "").trim()).filter(Boolean));
    const imena = await stran.$$eval(".zlozljiv > .glava",
      e => e.map(x => (x.querySelector("span") && x.querySelector("span").childNodes[0]
        ? x.querySelector("span").childNodes[0].textContent.trim() : "")));
    eq(imena, ["📥 Uvozi že sestavljen razpored", "Predlog prednosti za prost teden",
      "Kalup in dopust po zaposlenih", "Pokritost po dnevih in minimumi po izmeni"],
      "pod mrežo ostanejo štirje razdelki (bilo jih je šest)");
    void zlozljivi;
  }

  console.log("11) V brskalniku: mreža majhnega oddelka nima praznega okvirja");
  {
    const razlika = await stran.$eval(".wardScroller.vOkvirju.kompakt", el => {
      const t = el.querySelector("table");
      return Math.round(el.getBoundingClientRect().height - t.getBoundingClientRect().height);
    });
    trdi(razlika < 40, "okvir se prilega mreži – ostaja " + razlika + " px praznega (prej ~180)");
  }

  console.log("12) V brskalniku: gumb 'Predlagaj mesec' res deluje");
  {
    trdi((await stran.$$("button:has-text('🧩 Predlagaj mesec')")).length === 1,
      "gumb je natanko eden");
    await stran.click("button:has-text('🧩 Predlagaj mesec')");
    await stran.waitForTimeout(900);
    // Ta oddelek nima nastavljenih minimumov po izmenah, zato je pričakovan
    // izid ravno to sporočilo – bistveno je, da se kartica z izidom sploh
    // izriše (prej je stala pod vsako mrežo, tudi prazna).
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/minimumi po izmenah niso nastavljeni|Ni vrzeli|Vnesenih v razpored|Potrdi vse/.test(t),
      "klik vrne izid (kartica se izriše šele takrat)");
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
