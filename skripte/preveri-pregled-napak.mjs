#!/usr/bin/env node
/* Pregled napak sinhronizacije: obvestila brez ukrepa ne smejo zaliti
 * napak, ki ukrep zahtevajo.
 *
 * ZAKAJ
 * Vrsta "zunaj_mreze" pove le, da je nekdo pisal zunaj mreže razporeda
 * (glava, opomba, podpisni blok). Sinhronizacija to preskoči in nič se ne
 * izgubi - a te vrstice se KOPIČIJO, ker sporočilo nosi število in primere
 * koordinat, ki se med tekoma razlikujeta, in odpravljanje podvojitev
 * (zabelezi v sheets-vhod primerja natanko "podrobnosti") zato odpove.
 *
 * Izmerjeno 17. 9. 2026: od 136 nerešenih napak jih je bilo 63 takih
 * (46 %). Po ročnem čiščenju jih je v nekaj minutah prišlo 39 novih, samo
 * na listu D. Prava nasprotja med listi - edino, kar koordinator res mora
 * rešiti - so se izgubljala med njimi.
 *
 * Popravek je dvojen: v izvorni kodi funkcije je sporočilo odslej ENAKO ob
 * vsakem teku (odpravljanje podvojitev spet deluje), v aplikaciji pa so
 * obvestila v svojem, zloženem razdelku s skupinskim zapiranjem.
 *
 * Zagon: CHROMIUM_PATH=/opt/pw-browsers/chromium node skripte/preveri-pregled-napak.mjs
 */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";
import { transformSync } from "esbuild";
const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const VRATA = 4378;
const TIP={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png"};
const reB=/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const prevedi=h=>{const m=h.match(reB); if(!m) return h;
  const {code}=transformSync(m[1],{loader:"jsx",jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment"});
  return h.replace(reB,()=>`<script>\n${code}\n</script>`);};
const srv=http.createServer((q,o)=>{const pot=decodeURIComponent(q.url.split("?")[0]);
  const d=join(koren,pot==="/"?"/index.html":pot);
  if(!d.startsWith(koren)||!existsSync(d)||statSync(d).isDirectory()){o.writeHead(404);return o.end("404");}
  let v=readFileSync(d); if(extname(d)===".html") v=prevedi(v.toString("utf8"));
  o.writeHead(200,{"Content-Type":TIP[extname(d)]||"application/octet-stream"}); o.end(v);});
await new Promise(r=>srv.listen(VRATA,r));

// 3 napake, ki zahtevajo ukrep + 5 obvestil
const NAPAKE=[
 {id:1,smer:"sheets_v_app",vrsta:"nasprotje_listov",zavihek:"C",work_date:"2026-10-01",podrobnosti:"Nasprotje A",resen:false,ustvarjeno:"2026-09-17T08:00:00Z"},
 {id:2,smer:"sheets_v_app",vrsta:"neznano_ime",zavihek:"C",work_date:null,podrobnosti:"Neznano ime B",resen:false,ustvarjeno:"2026-09-17T08:00:00Z"},
 {id:3,smer:"app_v_sheets",vrsta:"brez_stolpca",zavihek:"D",work_date:null,podrobnosti:"Brez stolpca C",resen:false,ustvarjeno:"2026-09-17T08:00:00Z"},
 ...[4,5,6,7,8].map(i=>({id:i,smer:"sheets_v_app",vrsta:"zunaj_mreze",zavihek:"D",work_date:null,podrobnosti:"Zunaj mreze "+i,resen:false,ustvarjeno:"2026-09-17T08:00:00Z"})),
];
const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
const brskalnik=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try{
  const stran=await brskalnik.newPage({viewport:{width:1400,height:1000}});
  const nap=[]; stran.on("pageerror",e=>nap.push(""+e));
  await stran.addInitScript(({napake})=>{
    const tabele={profili:[{id:"a",full_name:"Admin Ana",role:"admin",department_code:"NZV"}],
      oddelki:[],razpored:[],sync_errors:napake,sheet_connections:[],zelje_zaposlenih:[],
      odsotnosti:[],minimalna_zasedba:[],nosilci_oddelkov:[],nadomescanja:[],obrazci:[],
      nzv_nastavitve:[],dnevnik_profilov:[],kadrovski_podatki:[],dnevnik_razporeda:[],
      stanje_dopusta_obdobja:[],stanje_dopusta_pregled:[]};
    const q=v=>new Proxy({},{get(_,n){
      if(n==="then")return nx=>Promise.resolve({data:v,error:null}).then(nx);
      if(n==="maybeSingle"||n==="single")return()=>Promise.resolve({data:v[0]||null,error:null});
      if(n==="insert"||n==="upsert"||n==="delete"||n==="update")return()=>Promise.resolve({data:[],error:null});
      if(typeof n!=="string")return undefined; return()=>q(v);}});
    let pr=null;
    Object.defineProperty(window,"RazporedAuth",{configurable:true,get(){return pr;},set(v){pr=v;
      if(v&&typeof v==="object"){const seja={session:{user:{id:"a"}},profile:tabele.profili[0],ogled:false};
        v.client={from:t=>q(tabele[t]||[]),rpc:()=>Promise.resolve({data:null,error:null}),
          auth:{getSession:()=>Promise.resolve({data:{session:seja.session}}),
                getUser:()=>Promise.resolve({data:{user:seja.session.user}}),
                onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
        v.requireAuth=()=>Promise.resolve(seja); v.requireRole=()=>Promise.resolve(seja);
        v.getSessionAndProfile=()=>Promise.resolve(seja); v.unreadNotificationCount=()=>Promise.resolve(0);
        v.vseStrani=fn=>Promise.resolve(fn(0,999)).then(r=>(r&&r.data)||[]);}}});
  },{napake:NAPAKE});
  await stran.goto(`http://127.0.0.1:${VRATA}/admin.html?tab=uporabniki`,{waitUntil:"load"});
  await stran.waitForSelector(".tabs button",{timeout:15000});
  await stran.waitForTimeout(1500);
  const t=(await stran.innerText("body")).replace(/\s+/g," ");
  trdi(/5 obvestil brez ukrepa/.test(t), "pet obvestil je združenih v eno vrstico s števcem");
  trdi((await stran.$$("button:has-text('Počisti vsa')")).length === 1,
    "skupinsko zapiranje je na voljo (brez njega bi bilo 63 klikov)");
  const vrstic = await stran.$$eval("table.fairTable tbody tr", e => e.length).catch(() => 0);
  trdi(vrstic === 3, "v tabeli so SAMO napake, ki zahtevajo ukrep – dobil " + vrstic + ", pričakoval 3");
  const tabela = await stran.innerText("table.fairTable").catch(() => "");
  trdi(!/Zunaj mreze/.test(tabela), "obvestil v tabeli ni");
  trdi(/Nasprotje A/.test(tabela) && /Neznano ime B/.test(tabela) && /Brez stolpca C/.test(tabela),
    "vse tri prave napake so vidne");
  await stran.click("button:has-text('Pokaži')"); await stran.waitForTimeout(400);
  trdi(/Zunaj mreze 4/.test(await stran.innerText("body")),
    "obvestila se na zahtevo vseeno pokažejo (nič ni skrito pred uporabnikom)");
  const prave = nap.filter(x => !/supabase|Failed|net::|401|400|sw\.js|manifest/i.test(x));
  trdi(prave.length === 0, "brez napak v konzoli" + (prave.length ? ": " + prave.join(" | ") : ""));
} finally { await brskalnik.close(); srv.close(); }

console.log("");
console.log("Izvorna koda funkcije: kopicenje prepreci KLJUC, ne osiromaseno besedilo");
{
  const vhod = readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8");
  // Prva razlicica tega popravka je iz sporocila odstranila stevilo in
  // primere, da bi primerjava po besedilu spet delovala - s tem pa je
  // koordinatorju vzela edino informacijo o tem, KJE je bilo pisano zunaj
  // mreze. Obstojeci preizkus (preveri-sheets-brez-postavitve, razdelek 4c)
  // je to ujel. Pravilna resitev je ozji kljuc: besedilo ostane bogato,
  // podvojitve pa se odpravljajo po (vrsta, zavihek).
  trdi(/const KLJUC_PO_ZAVIHKU = \["zunaj_mreze"\];/.test(vhod),
    "kljuc za vrste s spremenljivim besedilom je imenovana konstanta");
  trdi(/KLJUC_PO_ZAVIHKU\.includes\(vrsta\)[\s\S]{0,120}?\.eq\("zavihek"/.test(vhod),
    "in se res uporabi namesto primerjave po besedilu");
  trdi(/zunajPrimeri\.length < 5/.test(vhod),
    "primeri koordinat OSTANEJO - brez njih koordinator ne ve, kje pogledati");
  trdi(/\$\{zunajMreze\} urejenih celic/.test(vhod),
    "in stevilo celic tudi");
}
const admin = readFileSync(join(koren, "admin.html"), "utf8");
trdi(/const NAPAKE_BREZ_UKREPA = \["zunaj_mreze"\];/.test(admin),
  "seznam vrst brez ukrepa je ena sama imenovana konstanta");

console.log("");
console.log("Obe smeri odpravljata podvojitve enako");
{
  const vhod  = readFileSync(join(koren, "supabase/functions/sheets-vhod/index.ts"), "utf8");
  const izhod = readFileSync(join(koren, "supabase/functions/sheets-izhod/index.ts"), "utf8");
  // Vhodna stran je dedup imela od zacetka, izhodna ne: zabeleziNapako je
  // bil navaden insert, zato je vsak poskus zapisa dodal novo vrstico.
  const kljuc = /\.eq\("resen", false\)[\s\S]{0,200}\.eq\("podrobnosti", podrobnosti\)/;
  trdi(kljuc.test(vhod),  "sheets-vhod preveri, ali nerešena napaka že obstaja");
  trdi(kljuc.test(izhod), "sheets-izhod prav tako (prej navaden insert)");
  trdi(!/await db\.from\("sync_errors"\)\.insert\(\{ smer: "app_v_sheets", vrsta, \.\.\.p \}\);/.test(izhod),
    "starega zapisa brez preverjanja ni več");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
