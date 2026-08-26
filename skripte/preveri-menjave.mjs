#!/usr/bin/env node
/* Preizkus strani Menjava (obrazec.html) in verige odobritev.
 *
 * Kaj se tu varuje - to so pravila, ki jih uporabnik ne more preveriti sam,
 * ker se pokažejo šele, ko nekdo odda pravi zahtevek:
 *  - menjava DEŽURSTVA preskoči stopnjo vodje in gre naravnost h
 *    koordinatorju; navadna menjava službe gre skozi vodjo;
 *  - dežurstvo dokončno potrdi IZKLJUČNO koordinator, vse ostalo pa
 *    administrator - in obratno: v seznamu "Čaka name" administrator
 *    dežurstev sploh ne vidi;
 *  - zavrnitev brez razloga ni mogoča;
 *  - vsaka stopnja kliče svojo funkcijo v bazi (sodelavec / vodja /
 *    koordinator), ne katerekoli.
 *
 * Zagon: CHROMIUM_PATH=/pot/do/chrome node skripte/preveri-menjave.mjs
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

// Od prehoda na Vite babel.min.js ni več v *.html - inline JSX mora ta
// strežnik prevesti sam (isti pristop kot vite.config.mjs).
const reBabel = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
function prevediJsxVHtmlu(html) {
  const m = html.match(reBabel);
  if (!m) return html;
  const { code } = transformSync(m[1], { loader: "jsx", jsx: "transform",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
  return html.replace(reBabel, () => `<script>\n${code}\n</script>`);
}

// ------------------------------------------------------- 1) veriga v shemi
console.log("1) veriga odobritev je v shemi zapisana tako, kot pravi vmesnik");
{
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");

  const oddaj = shema.slice(shema.indexOf("function public.obrazec_oddaj"));
  const telo = oddaj.slice(0, oddaj.indexOf("$$;"));
  trdi(/v_je_dez\s*:=\s*\(lower\(coalesce\(v_izmena_a/.test(telo),
    "ob oddaji se ugotovi, ali gre za menjavo dežurstva");
  trdi(/if not \(\(o\.vrsta = 'menjava_sluzbe' or o\.vrsta = 'oddaja_dezurstva'\) and v_je_dez\) then[\s\S]*?vodja_id into v_vodja/.test(telo),
    "neposredni vodja se zahteva SAMO takrat, ko bo obrazec skozi njegovo stopnjo res šel");

  const pogled = shema.slice(shema.indexOf("view public.obrazci_moja_naloga"));
  const telesoPogleda = pogled.slice(0, pogled.indexOf(";\n"));
  trdi(/je_dezurstvo AND public\.current_is_koordinator\(\)/.test(telesoPogleda),
    "dežurstvo pride v \"Čaka name\" samo koordinatorju");
  trdi(/NOT je_dezurstvo\) AND public\.current_role_is\('admin'/.test(telesoPogleda),
    "vse ostalo pa samo administratorju");

  const koord = shema.slice(shema.indexOf("function public.obrazec_potrdi_koordinator"));
  const teloKoord = koord.slice(0, koord.indexOf("$$;"));
  trdi(/if o\.je_dezurstvo then[\s\S]*?not public\.current_is_koordinator\(\)[\s\S]*?raise exception/.test(teloKoord),
    "in tudi sama funkcija zavrne dežurstvo, če klicatelj ni koordinator");
  trdi(/else[\s\S]*?not public\.current_role_is\('admin'\)[\s\S]*?raise exception/.test(teloKoord),
    "pri ostalem pa zahteva administratorja");
}

// ---------------------------------------------------------- 2) strežnik
// Vsaka datoteka se prebere (in JSX prevede) SAMO PRVIČ. Preizkus odpre
// stran ~15-krat, vendor-app.min.js pa meri 1,6 MB in obrazec.html je treba
// vsakič znova prevesti - brez tega je skripta tekla čez 3 minute in padla
// na časovni omejitvi nabora, čeprav so bile vse trditve pravilne.
const predpomnilnik = new Map();
const streznik = http.createServer((zahteva, odgovor) => {
  const pot = decodeURIComponent(zahteva.url.split("?")[0]);
  const dat = join(koren, pot === "/" ? "obrazec.html" : pot);
  if (!existsSync(dat) || !statSync(dat).isFile()) { odgovor.writeHead(404); odgovor.end("ni"); return; }
  let vsebina = predpomnilnik.get(dat);
  if (!vsebina) {
    vsebina = readFileSync(dat);
    if (extname(dat) === ".html") vsebina = Buffer.from(prevediJsxVHtmlu(vsebina.toString("utf8")), "utf8");
    predpomnilnik.set(dat, vsebina);
  }
  odgovor.writeHead(200, { "Content-Type": TIP[extname(dat)] || "application/octet-stream" });
  odgovor.end(vsebina);
});
await new Promise(r => streznik.listen(VRATA, r));

const brskalnik = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

// Dva zahtevka, ki čakata odločitev: eden dežurstvo, eden navadna menjava.
// NAMENOMA brez že izračunanega "moje_dejanje": stran ga odslej izračuna
// sama iz PRIKAZANE osebe (glej mojeDejanje v obrazec.html). Prej ga je
// dobila iz pogleda obrazci_moja_naloga, ta pa vpraša bazo "kdo sem" - kar
// je med "Ogledom kot uporabnik" napačna oseba. Ker je ta preizkus tedaj
// vrednost samo podtaknil, te napake ni mogel nikoli ujeti (glej 8 spodaj).
const ZAHTEVKI = [
  { id: "z1", stevilka: "2026-001", vrsta: "menjava_sluzbe", status: "caka_koordinatorja",
    je_dezurstvo: true, vlagatelj_id: "u", sodelavec_id: "s", vodja_id: "k",
    polja: { datum_a: "2026-09-10", opomba: "dežurstvo" } },
  { id: "z2", stevilka: "2026-002", vrsta: "menjava_sluzbe", status: "caka_vodjo",
    je_dezurstvo: false, vlagatelj_id: "u", sodelavec_id: "s", vodja_id: "k",
    polja: { datum_a: "2026-09-12", opomba: "navadna" } },
];

async function odpri(profil, zahtevki, obvestila, ogled) {
  obvestila = obvestila || [];
  const stran = await brskalnik.newPage({ viewport: { width: 1200, height: 900 } });
  // Zunanja pisava (Google Fonts) v tem okolju ni dosegljiva, waitUntil:"load"
  // pa je na VSAKEM zagonu strani čakal njen omrežni potek: 12,7 s namesto
  // 0,4 s. Pri ~15 zagonih je skripta zato tekla 3,5 minute in padla na
  // časovni omejitvi, čeprav so bile vse trditve pravilne. Strani pisava ne
  // blokira (media="print" + onload, glej opombo v obrazec.html), zato jo
  // tukaj preprosto zavrnemo.
  await stran.route("**://fonts.googleapis.com/**", r => r.abort());
  await stran.route("**://fonts.gstatic.com/**", r => r.abort());
  const konzola = [];
  const klici = [];
  stran.on("pageerror", e => konzola.push(String(e)));
  stran.on("console", m => { if (m.type() === "error") konzola.push(m.text()); });
  await stran.exposeFunction("zabeleziKlic", (ime, arg) => klici.push({ ime, arg }));
  await stran.addInitScript(({ profil, zahtevki, obvestila, ogled }) => {
    // Zahtevki so v "obrazci" (prava tabela). Pogled obrazci_moja_naloga je
    // NAMENOMA prazen: če bi stran še brala iz njega, bi bil seznam prazen -
    // natanko tako, kot je bilo videti pri uporabniku med ogledom.
    const tabele = { obrazci: zahtevki, obrazci_moja_naloga: [], obrazci_dnevnik: [], razpored: [], profili: [], obvestila };
    const poizvedba = (v, ime) => {
      const b = new Proxy({}, { get(_, n) {
        if (n === "then") return (nx) => Promise.resolve({ data: v, error: null }).then(nx);
        if (n === "insert" || n === "upsert") return () => Promise.resolve({ data: [], error: null });
        if (n === "update") return (arg) => { window.zabeleziKlic(ime + ".update", arg); return b; };
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
          const seja = { session: { user: { id: profil.id } }, profile: profil, ogled: !!ogled };
          v.client = {
            from: (t) => poizvedba(tabele[t] || [], t),
            rpc: (ime, arg) => { window.zabeleziKlic(ime, arg); return Promise.resolve({ data: null, error: null }); },
            auth: {
              getSession: () => Promise.resolve({ data: { session: seja.session } }),
              getUser: () => Promise.resolve({ data: { user: seja.session.user } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            },
          };
          v.requireAuth = () => Promise.resolve(seja);
          v.requireRole = () => Promise.resolve(seja);
          // Značko na gumbu "Menjava" (nav.js) postavi ta pot, ne requireAuth
          // - brez tega bi značka dobila prazen profil in vloga (koordinator/
          // admin) se v preizkusu ne bi upoštevala.
          v.getSessionAndProfile = () => Promise.resolve(seja);
        }
      },
    });
  }, { profil, zahtevki, obvestila, ogled: !!ogled });
  await stran.goto(`http://127.0.0.1:${VRATA}/obrazec.html`, { waitUntil: "load" });
  await stran.waitForTimeout(900);
  // Privzeti zavihek je "Nov obrazec"; seznam za odločanje je za zavihkom
  // "Čaka name" in se izriše šele, ko ga odpremo.
  const naCaka = async () => {
    await stran.click('[role="tab"]:nth-of-type(2)');
    await stran.waitForTimeout(300);
  };
  return { stran, konzola, klici, naCaka };
}

try {
  console.log("2) opis verige je prilagojen vlogi - vsak vidi svoje");
  {
    const primeri = [
      { profil: { id: "u", role: "user", full_name: "Novak Ana" }, mora: /najprej potrdi sodelavec/, nesme: /Kot administrator/ },
      { profil: { id: "v", role: "vodja", full_name: "Vodja Vera" }, mora: /vmesni stopnji/, nesme: /Kot koordinator/ },
      { profil: { id: "a", role: "admin", full_name: "Admin Ana" }, mora: /Kot administrator/, nesme: /Kot koordinator/ },
      { profil: { id: "k", role: "vodja", is_koordinator: true, full_name: "Koord Ana" }, mora: /Kot koordinator/, nesme: /Kot administrator/ },
    ];
    for (const p of primeri) {
      const { stran } = await odpri(p.profil, []);
      const besedilo = await stran.evaluate(() => document.body.innerText);
      trdi(p.mora.test(besedilo), `${p.profil.role}${p.profil.is_koordinator ? "+koordinator" : ""}: vidi svoj opis verige`);
      trdi(!p.nesme.test(besedilo), `${p.profil.role}${p.profil.is_koordinator ? "+koordinator" : ""}: ne vidi tujega opisa`);
      await stran.close();
    }
  }

  console.log("3) \"Čaka name\" pokliče funkcijo, ki ustreza stopnji");
  {
    const { stran, klici, naCaka } = await odpri({ id: "k", role: "vodja", is_koordinator: true, full_name: "Koord Ana" }, ZAHTEVKI);
    const oznaka = await stran.$eval('[role="tab"]:nth-of-type(2)', e => e.textContent);
    trdi(/\(2\)/.test(oznaka), "zavihek šteje oba zahtevka: " + oznaka);
    await naCaka();
    const gumbi = await stran.$$("button.actBtn.yes");
    trdi(gumbi.length === 2, `oba zahtevka sta v seznamu (${gumbi.length})`);
    await gumbi[0].click();
    await stran.waitForTimeout(400);
    trdi(klici.length === 1 && klici[0].ime === "obrazec_potrdi_koordinator",
      "dežurstvo gre v obrazec_potrdi_koordinator: " + JSON.stringify(klici.map(k => k.ime)));
    trdi(klici[0] && klici[0].arg && klici[0].arg.p_sprejmi === true, "in to kot odobritev");
    await stran.close();
  }

  console.log("4) navadna menjava gre skozi stopnjo vodje, ne koordinatorja");
  {
    const { stran, klici, naCaka } = await odpri({ id: "v", role: "vodja", full_name: "Vodja Vera" }, [{ ...ZAHTEVKI[1], vodja_id: "v" }]);
    await naCaka();
    const gumbi = await stran.$$("button.actBtn.yes");
    trdi(gumbi.length === 1, "zahtevek čaka vodjo");
    await gumbi[0].click();
    await stran.waitForTimeout(400);
    trdi(klici.length === 1 && klici[0].ime === "obrazec_potrdi_vodja",
      "poklicana je obrazec_potrdi_vodja: " + JSON.stringify(klici.map(k => k.ime)));
    await stran.close();
  }

  console.log("5) zavrnitev brez razloga ni mogoča");
  {
    const { stran, klici, naCaka } = await odpri({ id: "v", role: "vodja", full_name: "Vodja Vera" }, [{ ...ZAHTEVKI[1], vodja_id: "v" }]);
    await naCaka();
    await stran.click("button.actBtn.no");
    await stran.waitForTimeout(300);
    trdi(klici.length === 0, "prvi klik na Zavrni še ne pošlje ničesar - odpre polje za razlog");
    trdi((await stran.$$("textarea")).length >= 1, "polje za razlog se je odprlo");
    const potrdi = await stran.$("button.ghostBtn");
    trdi(potrdi !== null && await potrdi.isDisabled(), "gumb za potrditev zavrnitve je onemogočen, dokler razloga ni");
    await stran.fill("textarea", "Tisti dan te potrebujem na oddelku.");
    await stran.waitForTimeout(200);
    trdi(!(await (await stran.$("button.ghostBtn")).isDisabled()), "z vpisanim razlogom se omogoči");
    await stran.click("button.ghostBtn");
    await stran.waitForTimeout(400);
    trdi(klici.length === 1 && klici[0].arg.p_sprejmi === false, "šele zdaj gre zavrnitev v bazo");
    trdi(/potrebujem/.test(klici[0].arg.p_opomba || ""), "in razlog gre zraven");
    await stran.close();
  }

  console.log("6) rdeč znak na Menjava: obvestila se prikažejo in označijo kot prebrana");
  {
    const OBVESTILA = [
      { id: 501, title: "Menjava čaka tvojo odobritev", message: "Novak Ana ti je poslal predlog menjave.", created_at: "2026-09-01T10:00:00Z" },
    ];
    const { stran, klici } = await odpri({ id: "u", role: "user", full_name: "Novak Ana" }, [], OBVESTILA);
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(besedilo.includes("Novak Ana ti je poslal predlog menjave."), "sporočilo obvestila je vidno na strani");
    trdi(klici.some(k => k.ime === "obvestila.update"), "ob prikazu se je obvestilo označilo kot prebrano: " + JSON.stringify(klici.map(k => k.ime)));
    await stran.close();
  }

  console.log("7) stran se izriše brez napak v konzoli");
  {
    const { stran, konzola } = await odpri({ id: "u", role: "user", full_name: "Novak Ana" }, ZAHTEVKI);
    const prave = konzola.filter(t => !/supabase|Failed to|net::|401|400|sw\.js|manifest|ServiceWorker/i.test(t));
    trdi(prave.length === 0, "brez napak" + (prave.length ? ": " + prave.join(" | ") : ""));
    await stran.close();
  }

  console.log("8) predlog, ki čaka SODELAVCA, se pri njem res vidi - tudi med \"Ogledom kot uporabnik\"");
  {
    // Prijavljena napaka: vlagatelj je oddal predloge, pri sodelavcu pa "ni
    // bilo vidno nič". Vzrok NI bil v bazi (tam je predlog pravilno čakal),
    // ampak v tem, da je "Čaka name" bral pogled obrazci_moja_naloga, ki
    // nalogo določi prek auth.uid() - med ogledom pa je to še vedno
    // ADMINISTRATOR, ne oseba, ki jo zaslon kaže. Zato je admin, ki je šel
    // preverit "ali je prišlo", videl prazen seznam.
    const cakaSodelavca = { id: "z3", stevilka: "2026-003", vrsta: "menjava_sluzbe",
      status: "caka_sodelavca", je_dezurstvo: false,
      vlagatelj_id: "matej", sodelavec_id: "s", vodja_id: "k",
      polja: { datum_a: "2026-09-10", opomba: "prosim za menjavo" } };

    // a) sodelavec se prijavi sam
    {
      const { stran, naCaka } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, [cakaSodelavca]);
      const oznaka = await stran.$eval('[role="tab"]:nth-of-type(2)', e => e.textContent);
      trdi(/\(1\)/.test(oznaka), "sodelavec vidi predlog v števcu zavihka: " + oznaka);
      await naCaka();
      trdi((await stran.$$("button.actBtn.yes")).length === 1, "in ga lahko odobri");
      await stran.close();
    }

    // b) ISTI predlog med ogledom te osebe - prej PRAZNO, to je bila napaka
    {
      const { stran, naCaka } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, [cakaSodelavca], [], true);
      const oznaka = await stran.$eval('[role="tab"]:nth-of-type(2)', e => e.textContent);
      trdi(/\(1\)/.test(oznaka), "med ogledom je viden ISTI predlog te osebe, ne administratorjev: " + oznaka);
      await naCaka();
      const besedilo = await stran.evaluate(() => document.body.innerText);
      trdi(/2026-003/.test(besedilo), "predlog je res naštet");
      const gumb = await stran.$("button.actBtn.yes");
      trdi(gumb !== null && await gumb.isDisabled(),
        "odobritev pa je med ogledom onemogočena - odločiti mora oseba sama (baza tujega imena ne dovoli)");
      await stran.close();
    }

    // c) obrazec, ki NE čaka te osebe, se pri njej ne sme pojaviti
    {
      const tujObrazec = { ...cakaSodelavca, id: "z4", stevilka: "2026-004", sodelavec_id: "nekdo-drug" };
      const { stran } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, [tujObrazec]);
      const oznaka = await stran.$eval('[role="tab"]:nth-of-type(2)', e => e.textContent);
      trdi(!/\(\d/.test(oznaka), "tuj predlog se ne prišteje: " + oznaka);
      await stran.close();
    }
  }

  console.log("10) delovnopravna opozorila (56 ur ...) vidi TUDI tisti, ki odloča");
  {
    // Prijavljena zahteva: počitek in 56 ur "ostaneta opomba - potrdi vodja /
    // administrator". Doslej sta se opozorili izračunali le v brskalniku
    // PREDLAGATELJA in nikamor shranili, zato ju vodja ob odločanju sploh ni
    // videl - odločal je na slepo o tem, kar naj bi ravno on presodil.
    const zOpozorilom = {
      id: "o1", stevilka: "2026-201", vrsta: "menjava_sluzbe", status: "caka_vodjo",
      je_dezurstvo: false, vlagatelj_id: "u", sodelavec_id: "s", vodja_id: "v",
      polja: {
        datum_a: "2026-09-10", izmena_a: "Dopoldne", datum_b: "2026-09-12", izmena_b: "Nočna",
        opozorila: [{ oseba: "Novak Ana", datum: "2026-09-12", vrsta: "tedenskeUre",
          resnost: "opozorilo", sporocilo: "Preseženih 56 ur v 7 dneh" }],
      },
    };
    const { stran, naCaka } = await odpri({ id: "v", role: "vodja", full_name: "Vodja Vera" }, [zOpozorilom]);
    await naCaka();
    const besedilo = await stran.evaluate(() => document.body.innerText);
    trdi(/Preseženih 56 ur/.test(besedilo),
      "vodja ob odločanju vidi opozorilo, shranjeno ob oddaji");
    trdi(/presodi pred odobritvijo/i.test(besedilo),
      "in je jasno povedano, da mora o njem presoditi");
    await stran.close();

    // Obrazec BREZ opozoril ne sme prikazati praznega rdečega okvirja.
    const brezOpozoril = { ...zOpozorilom, id: "o2", stevilka: "2026-202",
      polja: { datum_a: "2026-09-10", izmena_a: "Dopoldne", datum_b: "2026-09-12", izmena_b: "Nočna" } };
    const { stran: cista, naCaka: naCaka2 } = await odpri({ id: "v", role: "vodja", full_name: "Vodja Vera" }, [brezOpozoril]);
    await naCaka2();
    const cistoBesedilo = await cista.evaluate(() => document.body.innerText);
    trdi(!/presodi pred odobritvijo/i.test(cistoBesedilo),
      "brez opozoril se rdeči okvir sploh ne prikaže");
    await cista.close();
  }

  console.log("9) značka na gumbu \"Menjava\" pove ŠTEVILO čakajočih - vidno brez odpiranja strani");
  {
    const zaSodelavca = (n) => Array.from({ length: n }, (_, i) => ({
      id: "n" + i, stevilka: "2026-10" + i, vrsta: "menjava_sluzbe",
      status: "caka_sodelavca", je_dezurstvo: false,
      vlagatelj_id: "matej", sodelavec_id: "s", vodja_id: "k",
      polja: { datum_a: "2026-09-10" },
    }));
    const znacka = (stran) => stran.evaluate(() => {
      const a = Array.from(document.querySelectorAll(".rpNav a"))
        .find(x => /Menjava/.test(x.textContent));
      const b = a && a.querySelector(".badge");
      return b ? b.textContent : null;
    });

    // Vsak zagon strani stane nekaj sekund, zato oba primera pokrijemo z
    // najmanj možnimi zagoni (nabor ima na skripto 180 s).
    {
      // Dva zase + trije, ki čakajo nekoga drugega: značka mora prešteti
      // SAMO svoje ("2", ne "5").
      const tuji = zaSodelavca(3).map((r, i) => ({ ...r, id: "t" + i, sodelavec_id: "nekdo-drug" }));
      const { stran } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, [...zaSodelavca(2), ...tuji]);
      const n = await znacka(stran);
      trdi(n === "2", "šteje samo svoje čakajoče (dva), tujih treh ne: " + n);
      await stran.close();
    }
    {
      // Ista napaka kot pri seznamu: med ogledom mora značka šteti PRIKAZANO
      // osebo, ne administratorja, ki je v resnici prijavljen. Hkrati
      // preverimo, da brez čakajočih značke sploh ni.
      const { stran } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, zaSodelavca(1), [], true);
      trdi(await znacka(stran) === "1", "med ogledom značka šteje prikazano osebo");
      await stran.close();

      const { stran: prazna } = await odpri({ id: "s", role: "user", full_name: "Sodelavec Sara" }, []);
      trdi(await znacka(prazna) === null, "brez čakajočih značke ni");
      await prazna.close();
    }
  }
} finally {
  await brskalnik.close();
  streznik.close();
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
