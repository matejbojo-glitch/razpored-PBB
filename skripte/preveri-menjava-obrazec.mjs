#!/usr/bin/env node
/* Preizkus strani "Menjava" (obrazec.html) po zahtevah iz septembra 2026:
 *
 *  1) KDO S KOM. V seznamih "Čaka name" in "Moji obrazci" sta bili doslej
 *     samo številka obrazca in datum – iz seznama torej ni bilo videti,
 *     čigavo menjavo sploh odobravaš ("ni vidno kdo in s kom želi
 *     menjavo"). Odslej sta izpisana oba udeleženca in obe izmeni.
 *
 *  2) ROČNO ISKANJE SODELAVCA. Vpišeš datum -> izpiše se tvoja izmena tega
 *     dne -> poiščeš osebo -> izpiše se NJEN razpored -> izbereš dan.
 *     Samodejnega predlaganja parov (mozni_sodelavci) ni več; trde
 *     varovalke ostanejo v bazi, opozorila pa se izpišejo pred oddajo.
 *
 *  3) DEŽURSTVO -> vsi iz NZV. Kadar je izbrani dan dežurstvo, se ponudijo
 *     vsi iz NZV (vodje in administratorji), ne oddelčni kader. Enosmerne
 *     "oddaje dežurstva" ni več (uporabnikova odločitev).
 *
 *  4) BREZ GUMBOV "+" (hitri razlogi) pri menjavi službe in pri "drugo".
 *
 *  5) "V TEM MESECU" pokaže samo menjave, v katere je uporabnik vključen.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-menjava-obrazec.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4217;
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

console.log("1) iz kode: samodejnega predlaganja parov in hitrih razlogov ni več");
{
  const src = readFileSync(join(koren, "obrazec.html"), "utf8");
  // Imeni funkcij v KOMENTARJIH sta v redu (pravilo okna ±45/±7 je od tam);
  // preverjamo, da se ne KLIČETA več.
  trdi(!/rpc\("mozni_sodelavci"/.test(src), "obrazec ne kliče več mozni_sodelavci (iskanje je ročno)");
  trdi(!/rpc\("mozni_prejemniki_dezurstva"/.test(src), "in ne mozni_prejemniki_dezurstva (oddaje dežurstva ni več)");
  trdi(!/HitriRazlog|HITRI_RAZLOGI/.test(src), "gumbov '+' za hitri razlog ni več");
  trdi(!/vrstaZaOddajo = "oddaja_dezurstva"/.test(src), "nova oddaja te vrste se ne ustvarja");
  // Stari obrazci te vrste morajo ostati berljivi - vrsta v shemi ostaja.
  trdi(/obrazec\.vrsta === "oddaja_dezurstva"/.test(src), "stari obrazci vrste 'oddaja_dezurstva' se še vedno izpišejo");
  trdi(/function UdelezencaMenjave/.test(src), "kdo-s-kom je v eni skupni komponenti");
  trdi(/<script src="nzv-zasedba\.js"><\/script>/.test(src), "stran nalaga nzv-zasedba.js (nabor NZV)");
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
  const dat = join(koren, pot === "/" ? "obrazec.html" : pot);
  if (!dat.startsWith(koren) || !existsSync(dat) || statSync(dat).isDirectory()) {
    odgovor.writeHead(404); return odgovor.end("404");
  }
  let vsebina = readFileSync(dat);
  if (extname(dat) === ".html") vsebina = prevediJsxVHtmlu(vsebina.toString("utf8"));
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

// Datumi so vezani na DANAŠNJI dan: razpored izbrane osebe se izpiše od
// danes naprej (preteklih izmen se ne da odslužiti), zato bi trdi datum
// čez čas nehal delovati.
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const JUTRI = iso(1), POJUTRI = iso(2), CEZ_TEDEN = iso(6), CEZ_MESEC = iso(30);

const JAZ = { id: "me", full_name: "Kovač Ana", role: "user", department_code: "B" };
const PROFILI = [
  JAZ,
  { id: "b2", full_name: "Novak Beti",   role: "user",  department_code: "B" },
  { id: "b3", full_name: "Bevc Cilka",   role: "user",  department_code: "B" },
  { id: "c1", full_name: "Turk Dora",    role: "user",  department_code: "C1" },   // tuj oddelek
  { id: "fx", full_name: "Flek Eva",     role: "user",  department_code: "FLEXI" },// FLEXI je izjema
  { id: "n1", full_name: "Vodja Franci", role: "vodja", department_code: "NZV" },
  { id: "n2", full_name: "Vodja Greta",  role: "admin", department_code: "NZV" },
];
const RAZPORED = [
  { employee_id: "me", work_date: JUTRI,     shift_code: "Dopoldne",  department_code: "B" },
  { employee_id: "me", work_date: POJUTRI,   shift_code: "DEŽURSTVO", department_code: "DEZ" },
  { employee_id: "b2", work_date: CEZ_TEDEN, shift_code: "Popoldne",  department_code: "B" },
  { employee_id: "b2", work_date: JUTRI,     shift_code: "LD",        department_code: "B" },
  { employee_id: "n1", work_date: CEZ_MESEC, shift_code: "DEŽURSTVO", department_code: "DEZ" },
];
const OBRAZCI = [
  { id: "o1", stevilka: "2026-001", vrsta: "menjava_sluzbe", status: "caka_vodjo",
    vlagatelj_id: "b2", sodelavec_id: "me", je_dezurstvo: false, ustvarjen: JUTRI + "T08:00:00Z",
    polja: { datum_a: CEZ_TEDEN, izmena_a: "Popoldne", datum_b: JUTRI, izmena_b: "Dopoldne" } },
  // Tuja menjava - v "V tem mesecu" se ne sme pojaviti.
  { id: "o2", stevilka: "2026-002", vrsta: "menjava_sluzbe", status: "zakljucen",
    vlagatelj_id: "b3", sodelavec_id: "c1", je_dezurstvo: false, ustvarjen: JUTRI + "T09:00:00Z",
    polja: { datum_a: CEZ_TEDEN, izmena_a: "Nočna", datum_b: JUTRI, izmena_b: "Dopoldne" } },
];

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const konzolaVse = [];
try {
  const stran = await brskalnik.newPage({ viewport: { width: 1200, height: 1000 } });
  stran.on("pageerror", e => konzolaVse.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzolaVse.push(m.text()); });
  await stran.addInitScript(({ profili, razpored, obrazci, mojId }) => {
    const tabele = { profili, razpored, obrazci, obrazci_dnevnik: [], obvestila: [] };
    // Peskovnik upošteva eq() in or() toliko, kolikor stran potrebuje:
    // razpored po osebi in obrazci po udeležbi.
    const poizvedba = (v) => {
      const filtri = [];
      const ali = [];
      const izbrani = () => v.filter(r => filtri.every(([k, x]) => r[k] === x))
        .filter(r => ali.every(izraz => {
          const deli = izraz.split(",").filter(d => /^(vlagatelj_id|sodelavec_id)\.eq\./.test(d));
          if (!deli.length) return true;   // mesečni pogoj posnemovalnik spusti
          return deli.some(d => r[d.split(".eq.")[0]] === d.split(".eq.")[1]);
        }))
        .map(r => Object.assign({}, r, {
          vlagatelj: profili.find(p => p.id === r.vlagatelj_id) || null,
          sodelavec: profili.find(p => p.id === r.sodelavec_id) || null,
        }));
      const b = new Proxy({}, { get(_, n) {
        if (n === "eq") return (k, x) => { filtri.push([k, x]); return b; };
        if (n === "or") return (izraz) => { ali.push(izraz); return b; };
        if (n === "insert" || n === "upsert") return () => Promise.resolve({ data: [], error: null });
        if (n === "maybeSingle" || n === "single") return () => Promise.resolve({ data: izbrani()[0] || null, error: null });
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
          v.client = {
            from: (t) => poizvedba(tabele[t] || []),
            rpc: () => Promise.resolve({ data: null, error: null }),
            auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
          };
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
          v.getSessionAndProfile = () => Promise.resolve(seja);
          v.unreadNotificationCount = () => Promise.resolve(0);
        }
      },
    });
  }, { profili: PROFILI, razpored: RAZPORED, obrazci: OBRAZCI, mojId: JAZ.id });
  await stran.goto(`http://127.0.0.1:${VRATA}/obrazec.html`, { waitUntil: "load" });
  await stran.waitForSelector(".tabs button", { timeout: 15000 });
  await stran.waitForTimeout(600);

  console.log("2) navaden dan: iskalnik ponudi sodelavce SVOJEGA oddelka (in FLEXI)");
  {
    await stran.click("button:has-text('Menjava službe')");
    await stran.fill("#da", JUTRI);
    await stran.waitForTimeout(600);
    trdi(/Trenutno: Dopoldne/.test(await stran.innerText("body")), "izpiše se moja izmena tega dne");
    const imena = await stran.$$eval(".candidate .who", e => e.map(x => x.textContent.trim()));
    trdi(imena.includes("Novak Beti") && imena.includes("Bevc Cilka"), "sodelavca oddelka B sta na seznamu: " + imena.join(", "));
    trdi(imena.includes("Flek Eva"), "FLEXI je izjema in je prav tako na seznamu");
    trdi(!imena.includes("Turk Dora"), "oseba s tujega oddelka (C1) ni na seznamu");
    trdi(!imena.includes("Kovač Ana"), "sam sebe ne moreš izbrati");

    await stran.fill("#isc", "novak");
    await stran.waitForTimeout(300);
    eq(await stran.$$eval(".candidate .who", e => e.map(x => x.textContent.trim())), ["Novak Beti"],
      "iskalnik zoži seznam po imenu");
  }

  console.log("3) po izbiri osebe se izpiše NJEN razpored, iz katerega se izbere dan");
  {
    await stran.click(".candidate button.candBtn");
    await stran.waitForTimeout(600);
    const t = await stran.innerText("body");
    trdi(/Razpored – Novak Beti/i.test(t), "naslov pove, čigav razpored je");
    const dnevi = await stran.$$eval(".candidate .who", e => e.map(x => x.textContent.trim()));
    trdi(dnevi.length === 1, "ponujen je natanko en dan (drugi je letni dopust): " + dnevi.join(", "));
    trdi(!/Letni dopust/.test(t), "dneva z dopustom ni mogoče prevzeti");

    await stran.click(".candidate button.candBtn");
    await stran.waitForTimeout(400);
    const povzetek = await stran.innerText(".povzetekMenjave");
    trdi(/Kovač Ana/.test(povzetek) && /Novak Beti/.test(povzetek),
      "pred oddajo je vidno KDO S KOM: " + povzetek.replace(/\s+/g, " "));
    trdi(/Dopoldne/.test(povzetek) && /Popoldne/.test(povzetek), "in katera izmena za katero");
  }

  console.log("4) dežurstvo: ponudijo se vsi iz NZV, ne oddelčni kader");
  {
    await stran.fill("#da", POJUTRI);
    await stran.waitForTimeout(700);
    const t = await stran.innerText("body");
    trdi(/Trenutno: Dežurstvo/i.test(t), "izbrani dan je dežurstvo");
    const imena = await stran.$$eval(".candidate .who", e => e.map(x => x.textContent.trim()));
    trdi(imena.includes("Vodja Franci") && imena.includes("Vodja Greta"), "na seznamu so vsi iz NZV: " + imena.join(", "));
    trdi(!imena.includes("Novak Beti"), "oddelčnega kadra pri dežurstvu ni");
    trdi(!/oddaš/i.test(t), "enosmerne oddaje dežurstva ni več");
  }

  console.log("5) brez gumbov '+' (hitri razlogi)");
  {
    const plusiMenjava = await stran.$$eval("button.pill", e => e.map(x => x.textContent.trim()));
    eq(plusiMenjava, [], "pri menjavi službe ni gumbov '+'");
    await stran.click("button:has-text('Drugo')");
    await stran.waitForTimeout(300);
    const plusiDrugo = await stran.$$eval("button.pill", e => e.map(x => x.textContent.trim()));
    eq(plusiDrugo, [], "in tudi pri 'Drugo' ne");
    trdi((await stran.$$("#rz")).length === 1, "polje Razlog ostane");
    trdi((await stran.$$("#op")).length === 1, "polje Opomba ostane");
  }

  console.log("6) 'Čaka name' in 'Moji obrazci' povesta, kdo s kom");
  {
    await stran.click("button[role=tab]:has-text('Moji obrazci')");
    await stran.waitForTimeout(500);
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/Novak Beti ↔ Kovač Ana/.test(t), "izpisana sta oba udeleženca: " + (t.match(/2026-001[^]{0,120}/) || [""])[0]);
    trdi(/Dopoldne/.test(t) && /Popoldne/.test(t), "in obe izmeni");
  }

  console.log("7) 'V tem mesecu': samo menjave, v katere sem vključen(a)");
  {
    await stran.click("button[role=tab]:has-text('V tem mesecu')");
    await stran.waitForTimeout(500);
    const t = (await stran.innerText("body")).replace(/\s+/g, " ");
    trdi(/Novak Beti ↔ Kovač Ana/.test(t), "svoja menjava je izpisana");
    trdi(!/Bevc Cilka/.test(t) && !/Turk Dora/.test(t), "tuja menjava (Bevc ↔ Turk) se ne pokaže: " + t.slice(0, 200));
  }

  const prave = konzolaVse.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
  await stran.close();
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
