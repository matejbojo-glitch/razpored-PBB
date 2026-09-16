// ---------------------------------------------------------------------
// Razpored PBB – Edge Function "sheets-vhod"  (Google Sheets → aplikacija)
//
// Kliče jo Apps Script, nameščen na posameznem dokumentu
// (supabase/apps-script/sinhronizacija.gs), ob vsaki spremembi v listu.
//
// EN DOGODEK, LAHKO VEČ CELIC
// Lepljenje bloka celic je pri razporedu običajen način urejanja, zato
// sporočilo lahko nosi seznam celic ("celice"). Zavihek se prebere ENKRAT
// za vse - trideset prilepljenih celic torej ne pomeni trideset branj.
//
// ZAKAJ SE BERE CEL ZAVIHEK IN NE SAMO SPOROČENA CELICA
// Iz "vrstica 12, stolpec E" se ne da vedeti, koga in kateri dan ta
// celica pomeni: to je odvisno od tega, v katerem mesečnem bloku je in
// katera imena stojijo v glavi nad njo. Zato se prebere zavihek in
// koordinate se izračunajo z isto logiko kot pri uvozu
// (_shared/sheets-koordinate.js). En values.get na dogodek je znotraj
// Googlove kvote.
//
// ZAKAJ VEDNO 200
// Če Apps Script dobi napako, ga Google začne dušiti in sčasoma sprožilec
// ugasne. Napake zato ne gredo nazaj v Apps Script, ampak v tabelo
// sync_errors, kjer so vidne v aplikaciji. Edina izjema je napačna
// skrivnost - to je 401.
//
// ZAKAJ razlog = 'sheets'
// Zapis dobi razlog "sheets", ki gre naprej v revizijski dnevnik (vidi se
// torej, da spremembe ni naredil človek v aplikaciji) in hkrati pove
// sprožilcu izhodne vrste, naj te spremembe ne pošilja nazaj v Sheets -
// druga polovica zaščite pred neskončno zanko.
//
// Skrivnosti (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON, SHEETS_WEBHOOK_SECRET
// ---------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  koordinateOddelka, koordinateFlexi, koordinateNzv, kratkiKljuc, kratica,
  jePrazenZapis, istaIzmena, mesecIzImenaZavihka,
  parafaLastniki, nzvZapisZaStolpec, zdruziNzvZapise, NZV_ODSOTNOST_KIND,
  ocistiNazivOsebe, imenaSeUjemata,
} from "../_shared/sheets-koordinate.js";
import {
  preberiServisniRacun, pridobiZeton, preberiZavihek, ZavihekNiNajden,
} from "../_shared/google-sheets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHEETS_WEBHOOK_SECRET = Deno.env.get("SHEETS_WEBHOOK_SECRET") ?? "";
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";

const VSI_DNEVI_OD = "0000-01-01";
const VSI_DNEVI_DO = "9999-12-31";

// Nočna polna uskladitev se ne ubada s celim letom. Zavihek pokriva vseh
// dvanajst mesecev, a januar do avgust so ODDELANI - razpored je bil
// izveden, ure obračunane, in noben list se tam ne bo več spremenil.
// Prepisovati jih vsako noč pomeni le tvegati, da kakšna pozna sprememba
// v listu podre zgodovino, in zaliti pregled napak z nasprotji, ki jih
// nima smisla popravljati.
//
// Meja je prvi dan PREJŠNJEGA meseca: tekoči mesec se še ureja, prejšnji
// pa se pogosto popravlja za nazaj (zamude pri dopustih, menjave).
// Dogodkovna pot (urejena celica) te meje NIMA - kdor namenoma popravi
// star mesec, hoče, da se prenese.
function zacetekUskladitve(danes: Date): string {
  // getUTCMonth() je 0-11, torej je sam po sebi že "prejšnji mesec" v
  // štetju 1-12. Date.UTC pa negativen mesec normalizira v prejšnje leto
  // (Date.UTC(2026, -1, 1) je december 2025), zato prehoda čez leto ni
  // treba obravnavati posebej - preizkus to tudi prežene.
  const d = new Date(Date.UTC(danes.getUTCFullYear(), danes.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
}

function odgovor(telo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(telo), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!SHEETS_WEBHOOK_SECRET || req.headers.get("x-sheets-secret") !== SHEETS_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Ista nerešena napaka se ne podvaja. Brez tega je ena oseba, ki je v
  // listu na napačnem zavihku, ustvarila po en vnos NA DAN (opaženo: 326
  // enakih vrstic), prave napake pa so se izgubile med njimi.
  async function zabelezi(vrsta: string, p: Record<string, unknown>) {
    const podrobnosti = String(p.podrobnosti ?? "");
    const { data: ze } = await db.from("sync_errors")
      .select("id").eq("resen", false).eq("smer", "sheets_v_app").eq("vrsta", vrsta)
      .eq("podrobnosti", podrobnosti).limit(1);
    if (ze && ze.length) return;
    await db.from("sync_errors").insert({ smer: "sheets_v_app", vrsta, ...p, podrobnosti });
  }

  async function napaka(vrsta: string, p: Record<string, unknown>) {
    await zabelezi(vrsta, p);
    return odgovor({ sprejeto: false, vrsta });
  }

  let telo: {
    spreadsheet_id?: string; zavihek?: string;
    vrstica?: number; stolpec?: number; nova_vrednost?: string;
    celice?: { vrstica: number; stolpec: number; nova_vrednost?: string }[];
    cel_zavihek?: boolean;
    urejevalec?: string; cas?: string;
  };
  try { telo = await req.json(); } catch { return odgovor({ sprejeto: false, vrsta: "neberljiv_json" }); }

  const spreadsheetId = String(telo.spreadsheet_id || "");
  const zavihek = String(telo.zavihek || "");
  // Polna uskladitev: obdela se CELA mreža zavihka, ne le sporočene celice.
  // Uporablja jo nočni pg_cron. Brez nje sprememba, katere dogodek se je
  // izgubil (izpad omrežja, Googlova kvota, ugasnjen sprožilec), ne pride v
  // aplikacijo NIKOLI - in nov stolpec se ne pojavi, ker vstavljanja stolpca
  // Apps Script sploh ne javi.
  const celZavihek = telo.cel_zavihek === true;
  // Ena celica ali seznam celic - obe obliki sta veljavni.
  const sporocene = (telo.celice && telo.celice.length
    ? telo.celice
    : [{ vrstica: Number(telo.vrstica), stolpec: Number(telo.stolpec) }])
    // Apps Script šteje od 1, values.get vrne polje od 0.
    .map((c) => ({ vrstica: Number(c.vrstica) - 1, stolpec: Number(c.stolpec) - 1 }))
    .filter((c) => c.vrstica >= 0 && c.stolpec >= 0);
  if (!spreadsheetId || !zavihek || (!celZavihek && !sporocene.length)) {
    return odgovor({ sprejeto: false, vrsta: "nepopolno_sporocilo" });
  }

  // Povezava se najde po TOČNEM imenu zavihka (oddelki, FLEXI) ali po
  // VZORCU (NZV: "Razpored {MESEC} {LETO}", en zavihek na mesec).
  const { data: vsePovezave } = await db.from("sheet_connections")
    .select("id, skupina, spreadsheet_id, zavihek, oblika, aktivno, sheets_v_app")
    .eq("spreadsheet_id", spreadsheetId);
  let povezava = (vsePovezave || []).find((p) => p.zavihek === zavihek);
  // Mesec iz IMENA zavihka - NZV dokument datuma ne piše z letom ("1. sep."),
  // zato manjkajoči mesec in leto prideta od tod.
  let mesecZavihka: string | null = null;
  if (!povezava) {
    for (const p of vsePovezave || []) {
      const m = mesecIzImenaZavihka(p.zavihek, zavihek);
      if (m) { povezava = p; mesecZavihka = m; break; }
    }
  }
  if (!povezava || !povezava.aktivno || !povezava.sheets_v_app) {
    return await napaka("nepovezan_zavihek", {
      spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: !povezava
        ? "Zavihek ni v seznamu povezanih listov."
        : "Povezava je izklopljena ali smer »Sheets → aplikacija« ni vklopljena.",
      povezava_id: povezava ? povezava.id : null,
    });
  }
  if (povezava.oblika !== "oddelek" && povezava.oblika !== "flexi" && povezava.oblika !== "nzv") {
    return await napaka("nepodprta_oblika", {
      povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: `Oblika "${povezava.oblika}" še ni podprta za samodejno branje.`,
    });
  }
  const jeFlexi = povezava.oblika === "flexi";
  const jeNzv = povezava.oblika === "nzv";
  // Polna uskladitev NZV bi pomenila uskladiti VSAK dan zavihka - torej tudi
  // pobrisati vse, česar v listu ni. Dokler NZV dokument v aplikacijo ni
  // prenesel niti ene vrstice, bi to izbrisalo ročno uvožene mesece. Zato je
  // nočna uskladitev zaenkrat samo za oddelke in FLEXI.
  if (celZavihek && jeNzv) {
    return await napaka("nepodprta_oblika", {
      povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: "Polna uskladitev za obliko NZV še ni vklopljena.",
    });
  }
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    return await napaka("api", { povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: "Manjka GOOGLE_SERVICE_ACCOUNT_JSON." });
  }

  let vrsteVrstic: string[][];
  try {
    const zeton = await pridobiZeton(preberiServisniRacun(GOOGLE_SERVICE_ACCOUNT_JSON));
    vrsteVrstic = await preberiZavihek(zeton, spreadsheetId, zavihek);
  } catch (e) {
    if (e instanceof ZavihekNiNajden) {
      await db.from("sheet_connections").update({ aktivno: false }).eq("id", povezava.id);
      return await napaka("zavihek_ni_najden", { povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
        podrobnosti: String(e.message) + " Povezava je začasno izklopljena." });
    }
    return await napaka("api", { povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: String((e as Error).message || e) });
  }

  // ------------------------------------------------------------------
  // NZV: uskladitev CELEGA DNE, ne posamezne celice
  //
  // Pri oddelkih je ena celica ena oseba. Pri NZV je stolpec ENOTA, celica
  // pa našteje VSE, ki jo tisti dan pokrivajo - sprememba ene celice torej
  // spremeni nabor ljudi, ne enega zapisa. Zato se za vsak prizadeti DAN
  // znova prebere cela vrstica in dan se uskladi v celoti.
  //
  // Uskladi se samo DAN, ki se ga je sprememba dotaknila, in samo osebje
  // NZV - razpored oddelkov ostane nedotaknjen.
  if (jeNzv) {
    const { celice: nzvCelice, najdenaGlava, najdenDatum } =
      koordinateNzv(vrsteVrstic, VSI_DNEVI_OD, VSI_DNEVI_DO, mesecZavihka);

    // Varovalka: če zavihka ni bilo mogoče razbrati (ni glave enot ali ni
    // datumskih vrstic), se NE briše nič. Brez tega bi vsaka motnja pri
    // branju izpraznila dan.
    if (!najdenDatum || !najdenaGlava || !nzvCelice.length) {
      return await napaka("brez_datuma", {
        povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
        podrobnosti: "V zavihku ni bilo mogoče najti glave enot ali datumskih vrstic"
          + (mesecZavihka ? ` (mesec zavihka: ${mesecZavihka})` : "") + " - dan ni bil spremenjen.",
      });
    }

    const dnevi = new Set<string>();
    const zavrnjeneNzv: { vrstica: number; stolpec: number; vrsta: string }[] = [];
    for (const sporocena of sporocene) {
      const c = nzvCelice.find((x) => x.vrstica === sporocena.vrstica && x.stolpec === sporocena.stolpec);
      if (c) dnevi.add(c.datum);
      else zavrnjeneNzv.push({ vrstica: sporocena.vrstica + 1, stolpec: sporocena.stolpec + 1, vrsta: "brez_datuma" });
    }
    if (!dnevi.size) {
      await zabelezi("zunaj_mreze", {
        povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
        podrobnosti: "Urejene celice niso znotraj mreže NZV (glava, naslov meseca ali podpisni blok).",
      });
      return odgovor({ sprejeto: true, spremenjenih: 0, zavrnjene: zavrnjeneNzv });
    }

    // Samo osebje NZV - parafe se iščejo med njimi, in samo njihovi zapisi
    // se smejo pobrisati.
    const { data: osebje } = await db.from("profili")
      .select("id, full_name, parafa, parafa_pred_oktobrom_2026")
      .eq("department_code", povezava.skupina);
    const nzvOsebje = osebje || [];
    const idjiNzv = nzvOsebje.map((o: { id: string }) => o.id);
    const imenaNzv = nzvOsebje.map((o: { full_name: string }) => o.full_name);

    let vpisanih = 0, odstranjenih = 0, odsotnostiVpisanih = 0, odsotnostiOdstranjenih = 0;
    const neznane = new Set<string>();

    for (const datum of dnevi) {
      // Parafa je odvisna od DATUMA razporeda (prestop 1. 10. 2026).
      const { poParafi, podvojene } = parafaLastniki(nzvOsebje, datum);
      const zaDan = nzvCelice.filter((c) => c.datum === datum);

      const surovi: Record<string, unknown>[] = [];
      const zeleneOdsotnosti = new Map<string, { full_name: string; work_date: string; kind: string }>();

      for (const c of zaDan) {
        const deli = String(c.vrednost || "").split(",").map((t) => t.trim()).filter(Boolean);
        if (!deli.length) continue;

        if (c.jeOdsotnost) {
          for (const parafa of deli) {
            const oseba = poParafi[parafa.toUpperCase()];
            if (!oseba) { neznane.add(parafa + (podvojene.indexOf(parafa.toUpperCase()) >= 0 ? " (dvoumna parafa)" : "")); continue; }
            const kind = NZV_ODSOTNOST_KIND[c.koda];
            zeleneOdsotnosti.set(oseba.full_name + "|" + kind,
              { full_name: oseba.full_name, work_date: datum, kind });
          }
          continue;
        }

        if (c.koda === "DEZ") {
          // Stolpec DEŽURSTVO piše POLNO IME, ne parafe.
          for (const surovoIme of deli) {
            const ime = ocistiNazivOsebe(surovoIme);
            const oseba = nzvOsebje.find((o: { full_name: string }) => imenaSeUjemata(o.full_name, ime));
            if (!oseba) { neznane.add(ime); continue; }
            const z = nzvZapisZaStolpec("DEZ");
            surovi.push({ employee_id: oseba.id, work_date: datum, ...z });
          }
          continue;
        }

        const z = nzvZapisZaStolpec(c.koda);
        for (const parafa of deli) {
          const oseba = poParafi[parafa.toUpperCase()];
          if (!oseba) { neznane.add(parafa + (podvojene.indexOf(parafa.toUpperCase()) >= 0 ? " (dvoumna parafa)" : "")); continue; }
          surovi.push({ employee_id: oseba.id, work_date: datum, ...z, stolpec: c.koda });
        }
      }

      // Ista oseba na več enotah istega dne -> EN zapis (dodatne enote v
      // pokriva_oddelek), enako kot pri ročnem uvozu.
      const zeleni = zdruziNzvZapise(surovi);

      if (zeleni.length) {
        const { error: e1 } = await db.from("razpored")
          .upsert(zeleni.map((z) => ({ ...z, razlog: "sheets" })), { onConflict: "employee_id,work_date" });
        if (e1) {
          await zabelezi("api", {
            povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
            work_date: datum, podrobnosti: e1.message,
          });
        } else { vpisanih += zeleni.length; }
      }

      // List je merodajen: kdor je v aplikaciji vpisan na ta dan, v listu
      // pa ga ni, se odstrani. Pred izbrisom se vrstici nastavi
      // razlog='sheets', da sprožilec izhodne vrste tega izbrisa ne pošlje
      // nazaj v Sheets (zaščita pred zanko velja tudi za brisanje).
      if (idjiNzv.length) {
        const obdrzi = new Set(zeleni.map((z) => String(z.employee_id)));
        const { data: obstojeci } = await db.from("razpored")
          .select("employee_id").eq("work_date", datum).in("employee_id", idjiNzv);
        const odvec = (obstojeci || [])
          .map((r: { employee_id: string }) => r.employee_id)
          .filter((id: string) => !obdrzi.has(String(id)));
        if (odvec.length) {
          await db.from("razpored").update({ razlog: "sheets" })
            .eq("work_date", datum).in("employee_id", odvec);
          const { error: e2 } = await db.from("razpored").delete()
            .eq("work_date", datum).in("employee_id", odvec);
          if (!e2) odstranjenih += odvec.length;
        }
      }

      // Odsotnosti (LD/IZOB/BS) so svoja tabela in se vodijo po IMENU.
      const zeleneList = [...zeleneOdsotnosti.values()];
      if (zeleneList.length) {
        const { error: e3 } = await db.from("odsotnosti")
          .upsert(zeleneList, { onConflict: "full_name,work_date" });
        if (!e3) odsotnostiVpisanih += zeleneList.length;
      }
      if (imenaNzv.length) {
        const obdrziIme = new Set(zeleneList.map((o) => o.full_name));
        const { data: obstojeceOds } = await db.from("odsotnosti")
          .select("full_name").eq("work_date", datum).in("full_name", imenaNzv);
        const odvecIme = (obstojeceOds || [])
          .map((r: { full_name: string }) => r.full_name)
          .filter((n: string) => !obdrziIme.has(n));
        if (odvecIme.length) {
          const { error: e4 } = await db.from("odsotnosti").delete()
            .eq("work_date", datum).in("full_name", odvecIme);
          if (!e4) odsotnostiOdstranjenih += odvecIme.length;
        }
      }
    }

    if (neznane.size) {
      await zabelezi("neznano_ime", {
        povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
        podrobnosti: "Brez ujemanja med osebjem NZV: " + [...neznane].join(", ") + ".",
      });
    }

    return odgovor({
      sprejeto: true, dnevi: [...dnevi],
      vpisanih, odstranjenih, odsotnostiVpisanih, odsotnostiOdstranjenih,
      zavrnjene: zavrnjeneNzv,
    });
  }

  // Pri POLNI uskladitvi se obdela samo tekoči in prejšnji mesec naprej;
  // pri urejeni celici pa vse, ker je človek tisto spremembo hotel.
  const odDneva = celZavihek ? zacetekUskladitve(new Date()) : VSI_DNEVI_OD;

  // FLEXI ima na osebo PAR stolpcev (levo pokriti oddelek, desno izmena).
  const { celice } = jeFlexi
    ? koordinateFlexi(vrsteVrstic, odDneva, VSI_DNEVI_DO)
    : koordinateOddelka(vrsteVrstic, odDneva, VSI_DNEVI_DO);
  // Osebje: NAJPREJ tega oddelka. Sledi rezerva med vsemi ostalimi, ker
  // ima FLEXI kader (in kdor je v Imeniku se pri starem oddelku) svoj
  // stolpec tudi v listu oddelka, na katerem dela. Brez rezerve se take
  // izmene niso prenesle NIKOLI - v aplikaciji jih ni bilo, v listu pa so.
  // Rezerva se uporabi samo, kadar v oddelku ni ujemanja; dvoumnost se
  // se vedno zavrne, ne ugiba.
  const { data: vsiZaposleni } = await db.from("profili")
    .select("id, full_name, department_code");
  const zaposleni = (vsiZaposleni || []).filter(
    (z: { department_code: string | null }) => (z.department_code || "") === povezava.skupina);
  const zaposleniRezerva = (vsiZaposleni || []).filter(
    (z: { department_code: string | null }) => (z.department_code || "") !== povezava.skupina);

  const osnova = { povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek };
  let spremenjenih = 0, brezSpremembe = 0;
  const zavrnjene: { vrstica: number; stolpec: number; vrsta: string }[] = [];
  // Celice ZUNAJ mreže (glava, opomba, podpisni blok, prazen prostor) niso
  // napaka razporeda - ob eni večji izbiri jih je na stotine. Štejejo se in
  // zapišejo kot EN povzetek; prave napake ostanejo posamič.
  let zunajMreze = 0;
  const zunajPrimeri: string[] = [];
  async function zavrni(c: { vrstica: number; stolpec: number }, vrsta: string, p: Record<string, unknown>) {
    zavrnjene.push({ vrstica: c.vrstica + 1, stolpec: c.stolpec + 1, vrsta });
    if (vrsta === "zunaj_mreze") {
      zunajMreze++;
      if (zunajPrimeri.length < 5) zunajPrimeri.push(`vrstica ${c.vrstica + 1}, stolpec ${c.stolpec + 1}`);
      return;
    }
    await zabelezi(vrsta, { ...osnova, ...p });
  }

  // Kaj je treba obdelati: pri polni uskladitvi CELA mreža, sicer pa samo
  // celice, ki jih je javil Apps Script. Vsaka naloga nosi tudi koordinato,
  // ki se sporoči nazaj ob zavrnitvi.
  type Naloga = { sporocena: { vrstica: number; stolpec: number }; celica: typeof celice[number] };
  const naloge: Naloga[] = [];
  if (celZavihek) {
    for (const c of celice) naloge.push({ sporocena: { vrstica: c.vrstica, stolpec: c.stolpec }, celica: c });
  } else {
    for (const sporocena of sporocene) {
      // Pri FLEXI je urejena lahko katerakoli celica para - izmena ali
      // oddelek levo od nje; obe pomenita isti zapis (oseba, dan).
      const celica = celice.find((c) => c.vrstica === sporocena.vrstica
        && (c.stolpec === sporocena.stolpec
            || (jeFlexi && c.stolpecOddelka === sporocena.stolpec)));
      if (!celica) {
        // Ni celica razporeda: ali vrstica ni dan, ali stolpec nima imena v
        // glavi. Oboje je normalno - dokument ni samo razpored.
        await zavrni(sporocena, "zunaj_mreze", {});
        continue;
      }
      naloge.push({ sporocena, celica });
    }
  }

  // Obstoječi zapisi za VSE prizadete osebe in dni naenkrat. Prej je bila
  // ena poizvedba na celico - pri eni urejeni celici je to nepomembno, pri
  // polni uskladitvi (~450 celic na zavihek) pa nevzdržno.
  const obstojeciPoKljucu = new Map<string, { shift_code: string | null; pokriva_oddelek: string | null }>();

  // --- prvi prehod: kdo je oseba v glavi stolpca ----------------------
  // Loči se od pisanja zato, da se obstoječi zapisi lahko preberejo v ENI
  // poizvedbi. Zavrnitve (neznano/dvoumno ime) se zabeležijo že tu.
  type Zaposlen = { id: string; full_name: string; department_code: string | null };
  const ujemanje = (seznam: Zaposlen[], kljuc: string) =>
    seznam.filter((z) => kratkiKljuc(z.full_name) === kljuc);
  const pripravljene: { sporocena: { vrstica: number; stolpec: number };
    celica: typeof celice[number]; oseba: Zaposlen; izRezerve: boolean }[] = [];

  for (const { sporocena, celica } of naloge) {
    // Glava stolpca najprej proti zaposlenim TEGA oddelka, sele nato proti
    // vsem ostalim. Kratko ime, ki se ujame z dvema osebama, se NE ugiba -
    // v obeh krogih.
    let najdeni = ujemanje(zaposleni as Zaposlen[], celica.kljuc);
    // Oseba iz drugega oddelka se prizna SAMO, kadar je v tem oddelku ni.
    const izRezerve = najdeni.length === 0;
    if (izRezerve) najdeni = ujemanje(zaposleniRezerva as Zaposlen[], celica.kljuc);
    if (najdeni.length === 0) {
      await zavrni(sporocena, "neznano_ime", { work_date: celica.datum,
        podrobnosti: `»${celica.ime}« se ne ujema z nobenim zaposlenim (niti na oddelku ${povezava.skupina} niti drugje).` });
      continue;
    }
    if (najdeni.length > 1) {
      await zavrni(sporocena, "dvoumno_ime", { work_date: celica.datum,
        podrobnosti: `»${celica.ime}« se ujema z več osebami: `
          + najdeni.map((z) => `${z.full_name} (${z.department_code || "brez oddelka"})`).join(", ") + "." });
      continue;
    }
    pripravljene.push({ sporocena, celica, oseba: najdeni[0], izRezerve });
  }

  // --- obstoječi zapisi, po straneh -----------------------------------
  // PostgREST vrne NAJVEČ 1000 vrstic na poizvedbo. Cel zavihek pokriva
  // leto dni in ~30 ljudi, torej krepko čez 1000 zapisov - brez straničenja
  // je vse čez prvo stran videti, kot da zapisa ni, in se prepiše ob VSAKEM
  // nočnem teku znova. Opaženo: 1153 nepotrebnih zapisov na zagon, vsakič
  // enako, in nikoli se ni umirilo.
  const STRAN = 1000;
  if (pripravljene.length) {
    const idji = [...new Set(pripravljene.map((n) => n.oseba.id))];
    const datumi = pripravljene.map((n) => n.celica.datum).sort();
    for (let od = 0; ; od += STRAN) {
      const { data: obstojeci, error: napakaBranja } = await db.from("razpored")
        .select("employee_id, work_date, shift_code, pokriva_oddelek")
        .in("employee_id", idji)
        .gte("work_date", datumi[0])
        .lte("work_date", datumi[datumi.length - 1])
        .order("id", { ascending: true })
        .range(od, od + STRAN - 1);
      if (napakaBranja) {
        await zabelezi("api", { ...osnova, podrobnosti: napakaBranja.message });
        break;
      }
      for (const r of obstojeci || []) {
        obstojeciPoKljucu.set(r.employee_id + "|" + r.work_date,
          { shift_code: r.shift_code, pokriva_oddelek: r.pokriva_oddelek });
      }
      if (!obstojeci || obstojeci.length < STRAN) break;
    }
  }

  // --- drugi prehod: kaj se dejansko spremeni -------------------------
  // Nasprotja med listi: en primer na osebo, ne na dan. Misotič R. jih ima
  // sama 117 - z enim vnosom na dan bi pregled napak spet zalilo.
  const nasprotja = new Map<string, string>();
  const zaZapis: Record<string, unknown>[] = [];
  for (const { sporocena, celica, oseba, izRezerve } of pripravljene) {

    // Vrednost se vzame iz PREBRANEGA lista, ne iz sporočila: med dogodkom
    // in klicem je lahko minila sekunda in nekdo je pisal naprej.
    const vListu = celica.vrednost;
    if (!jePrazenZapis(vListu) && kratica(vListu) === null) {
      await zavrni(sporocena, "neznana_koda", { work_date: celica.datum,
        podrobnosti: `»${vListu}« ni znana koda izmene (oseba ${oseba.full_name}).` });
      continue;
    }
    const novaKoda = jePrazenZapis(vListu) ? "" : vListu;

    // FLEXI kader gre VEDNO v department_code "FLEXI", pokriti oddelek pa
    // v pokriva_oddelek - tako kombinirana oznaka ("C/E2") ne zaleti v
    // tuji ključ na oddelke. Enako kot pri uvozu (obdelajFlexiVrstice).
    //
    // Enako velja za osebo iz rezerve: ostane pod SVOJIM oddelkom, delovišče
    // tega dne pa gre v pokriva_oddelek. Tako je v aplikaciji še naprej tam,
    // kjer je v Imeniku, in hkrati piše, kje je tisti dan delala.
    const oddelekZapisa = izRezerve
      ? (oseba.department_code || povezava.skupina)
      : povezava.skupina;
    // Eno samo, NORMALIZIRANO merilo za delovišče: prazen niz pomeni "dela
    // na svojem oddelku". Brez normalizacije sta se null in "" izmenjevala
    // in zapis se ni nikoli umiril.
    const zeljenoDelovisce = jeFlexi
      ? String(celica.oddelek || "").toUpperCase()
      : (izRezerve ? String(povezava.skupina).toUpperCase() : "");
    const stara = obstojeciPoKljucu.get(oseba.id + "|" + celica.datum);
    // Druga polovica zaščite pred zanko: brez razlike ni zapisa, torej se
    // sprožilec izhodne vrste sploh ne sproži.
    const istaKoda = stara && istaIzmena(stara.shift_code || "", novaKoda);
    const istOddelek = stara
      && (stara.pokriva_oddelek || "").toUpperCase() === zeljenoDelovisce;
    if (istaKoda && istOddelek) { brezSpremembe++; continue; }

    // Prazna celica ob zapisu, ki ga SPLOH NI, ne pomeni ničesar: oboje
    // pove "prost dan". Vrstice zato ne ustvarimo - sicer bi polna
    // uskladitev enega zavihka napisala na stotine praznih vrstic (na
    // listu C jih je bilo 852 od 1993). Prazna celica ob OBSTOJEČEM
    // zapisu je nekaj drugega: tam izmeno pobriše, in to se mora zgoditi.
    if (!stara && jePrazenZapis(novaKoda)) { brezSpremembe++; continue; }

    // PREDNOST MATIČNEGA LISTA. Oseba iz rezerve je v tem listu GOST: njen
    // razpored vodi list njenega oddelka (Misotič R. je FLEXI kader in jo
    // vodi list FLEXI). Gost sme zato zapis samo USTVARITI, ne povoziti -
    // sicer se lista, ki si nasprotujeta, vsako noč izmenjaje prepisujeta
    // in uskladitev se ne umiri NIKOLI. Opaženo: list C je za Misotič R.
    // pisal "popoldan", list FLEXI "dopoldan", za iste dneve.
    if (izRezerve && stara) {
      brezSpremembe++;
      if (!istaKoda && !nasprotja.has(oseba.id)) {
        nasprotja.set(oseba.id, `»${celica.ime}« (${oseba.full_name}, oddelek `
          + `${oseba.department_code || "brez oddelka"}): list "${zavihek}" pravi `
          + `»${vListu || "prosto"}«, v aplikaciji pa je »${stara.shift_code || "prosto"}« `
          + `iz njenega matičnega razporeda. Primer: ${celica.datum}. `
          + `Obvelja matični razpored - popravi enega od listov.`);
      }
      continue;
    }

    // pokriva_oddelek je v zapisu VEDNO, tudi kadar je prazen. supabase-js
    // namreč sveženj poravna na unijo ključev: vrstica, ki polja nima, ga
    // dobi kot null - in s tem povozi delovišče, ki ga je pravkar nastavila
    // druga vrstica istega svežnja. Opaženo: ista oseba je imela isti dan
    // enkrat null in drugič "", zapis pa se ni umiril NIKOLI.
    zaZapis.push({
      employee_id: oseba.id,
      department_code: oddelekZapisa,
      work_date: celica.datum,
      shift_code: novaKoda,
      razlog: "sheets",
      pokriva_oddelek: zeljenoDelovisce || null,
    });
  }

  // --- zapis v svežnjih ----------------------------------------------
  // Postgres ne dovoli, da bi en upsert dvakrat zadel isto vrstico
  // ("cannot affect row a second time") - cel sveženj bi padel. Isti par
  // (oseba, dan) se v mreži lahko pojavi dvakrat, kadar je ime v glavi
  // zapisano v dveh stolpcih (ponovljen blok). Obvelja ZADNJI, tako kot bi
  // obveljal, če bi šla zapisa drug za drugim.
  const poKljucu = new Map<string, Record<string, unknown>>();
  for (const z of zaZapis) poKljucu.set(String(z.employee_id) + "|" + String(z.work_date), z);
  const zaZapisEnkrat = [...poKljucu.values()];

  // Supabase upsert zna več vrstic naenkrat; sveženj je omejen, da telo
  // zahtevka ostane obvladljivo tudi pri polni uskladitvi.
  const SVEZENJ = 200;
  for (let i = 0; i < zaZapisEnkrat.length; i += SVEZENJ) {
    const kos = zaZapisEnkrat.slice(i, i + SVEZENJ);
    const { error: napakaZapisa } = await db.from("razpored").upsert(kos,
      { onConflict: "employee_id,work_date" });
    if (napakaZapisa) {
      await zabelezi("api", { ...osnova, podrobnosti: napakaZapisa.message });
      continue;
    }
    spremenjenih += kos.length;
  }

  for (const opis of nasprotja.values()) {
    await zabelezi("nasprotje_listov", { ...osnova, podrobnosti: opis });
  }

  if (zunajMreze) {
    await zabelezi("zunaj_mreze", {
      ...osnova,
      podrobnosti: `${zunajMreze} urejenih celic ni v mreži razporeda `
        + `(glava, opomba ali prazen prostor) - npr. ${zunajPrimeri.join("; ")}.`,
    });
  }

  return odgovor({
    sprejeto: true, cel_zavihek: celZavihek, od_dneva: odDneva,
    celic_v_mrezi: celice.length,
    spremenjenih, brez_spremembe: brezSpremembe,
    nasprotij: nasprotja.size, zunaj_mreze: zunajMreze, zavrnjene: celZavihek ? zavrnjene.length : zavrnjene,
  });
});
