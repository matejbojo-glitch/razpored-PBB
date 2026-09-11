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
  koordinateOddelka, koordinateFlexi, kratkiKljuc, kratica, jePrazenZapis, istaIzmena,
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

function odgovor(telo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(telo), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!SHEETS_WEBHOOK_SECRET || req.headers.get("x-sheets-secret") !== SHEETS_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  async function napaka(vrsta: string, p: Record<string, unknown>) {
    await db.from("sync_errors").insert({ smer: "sheets_v_app", vrsta, ...p });
    return odgovor({ sprejeto: false, vrsta });
  }

  let telo: {
    spreadsheet_id?: string; zavihek?: string;
    vrstica?: number; stolpec?: number; nova_vrednost?: string;
    celice?: { vrstica: number; stolpec: number; nova_vrednost?: string }[];
    urejevalec?: string; cas?: string;
  };
  try { telo = await req.json(); } catch { return odgovor({ sprejeto: false, vrsta: "neberljiv_json" }); }

  const spreadsheetId = String(telo.spreadsheet_id || "");
  const zavihek = String(telo.zavihek || "");
  // Ena celica ali seznam celic - obe obliki sta veljavni.
  const sporocene = (telo.celice && telo.celice.length
    ? telo.celice
    : [{ vrstica: Number(telo.vrstica), stolpec: Number(telo.stolpec) }])
    // Apps Script šteje od 1, values.get vrne polje od 0.
    .map((c) => ({ vrstica: Number(c.vrstica) - 1, stolpec: Number(c.stolpec) - 1 }))
    .filter((c) => c.vrstica >= 0 && c.stolpec >= 0);
  if (!spreadsheetId || !zavihek || !sporocene.length) {
    return odgovor({ sprejeto: false, vrsta: "nepopolno_sporocilo" });
  }

  const { data: povezave } = await db.from("sheet_connections")
    .select("id, skupina, spreadsheet_id, zavihek, oblika, aktivno, sheets_v_app")
    .eq("spreadsheet_id", spreadsheetId).eq("zavihek", zavihek).limit(1);
  const povezava = (povezave || [])[0];
  if (!povezava || !povezava.aktivno || !povezava.sheets_v_app) {
    return await napaka("nepovezan_zavihek", {
      spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: !povezava
        ? "Zavihek ni v seznamu povezanih listov."
        : "Povezava je izklopljena ali smer »Sheets → aplikacija« ni vklopljena.",
      povezava_id: povezava ? povezava.id : null,
    });
  }
  if (povezava.oblika !== "oddelek" && povezava.oblika !== "flexi") {
    return await napaka("nepodprta_oblika", {
      povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek,
      podrobnosti: `Oblika "${povezava.oblika}" še ni podprta za samodejno branje.`,
    });
  }
  const jeFlexi = povezava.oblika === "flexi";
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

  // FLEXI ima na osebo PAR stolpcev (levo pokriti oddelek, desno izmena).
  const { celice } = jeFlexi
    ? koordinateFlexi(vrsteVrstic, VSI_DNEVI_OD, VSI_DNEVI_DO)
    : koordinateOddelka(vrsteVrstic, VSI_DNEVI_OD, VSI_DNEVI_DO);
  const { data: zaposleni } = await db.from("profili")
    .select("id, full_name").eq("department_code", povezava.skupina);

  const osnova = { povezava_id: povezava.id, spreadsheet_id: spreadsheetId, zavihek };
  let spremenjenih = 0, brezSpremembe = 0;
  const zavrnjene: { vrstica: number; stolpec: number; vrsta: string }[] = [];
  async function zavrni(c: { vrstica: number; stolpec: number }, vrsta: string, p: Record<string, unknown>) {
    await db.from("sync_errors").insert({ smer: "sheets_v_app", vrsta, ...osnova, ...p });
    zavrnjene.push({ vrstica: c.vrstica + 1, stolpec: c.stolpec + 1, vrsta });
  }

  for (const sporocena of sporocene) {
    // Pri FLEXI je urejena lahko katerakoli celica para - izmena ali
    // oddelek levo od nje; obe pomenita isti zapis (oseba, dan).
    const celica = celice.find((c) => c.vrstica === sporocena.vrstica
      && (c.stolpec === sporocena.stolpec
          || (jeFlexi && c.stolpecOddelka === sporocena.stolpec)));
    if (!celica) {
      // Urejena celica ni podatkovna celica razporeda: ali vrstica ni dan
      // (naslov meseca, glava, podpisni blok), ali stolpec nima imena v
      // glavi. Oboje je normalno - dokument ni samo razpored - zato se
      // zabeleži in ne popravlja.
      const vrsticaJeDan = celice.some((c) => c.vrstica === sporocena.vrstica);
      await zavrni(sporocena, vrsticaJeDan ? "neznano_ime" : "brez_datuma", {
        podrobnosti: vrsticaJeDan
          ? `Stolpec ${sporocena.stolpec + 1} v vrstici ${sporocena.vrstica + 1} nima imena osebe v glavi bloka.`
          : `Vrstica ${sporocena.vrstica + 1} ni znotraj mesečnega bloka (ni datuma).`,
      });
      continue;
    }

    // Oseba: glava stolpca proti zaposlenim tega oddelka. Kratko ime, ki se
    // ujame z dvema osebama, se NE ugiba.
    const najdeni = (zaposleni || []).filter(
      (z: { id: string; full_name: string }) => kratkiKljuc(z.full_name) === celica.kljuc);
    if (najdeni.length === 0) {
      await zavrni(sporocena, "neznano_ime", { work_date: celica.datum,
        podrobnosti: `»${celica.ime}« se ne ujema z nobenim zaposlenim na oddelku ${povezava.skupina}.` });
      continue;
    }
    if (najdeni.length > 1) {
      await zavrni(sporocena, "dvoumno_ime", { work_date: celica.datum,
        podrobnosti: `»${celica.ime}« se ujema z več osebami: `
          + najdeni.map((z: { full_name: string }) => z.full_name).join(", ") + "." });
      continue;
    }
    const oseba = najdeni[0];

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
    const noviOddelek = jeFlexi ? (celica.oddelek || "") : null;
    const { data: obstojece } = await db.from("razpored")
      .select("id, shift_code, pokriva_oddelek")
      .eq("employee_id", oseba.id).eq("work_date", celica.datum).limit(1);
    const stara = (obstojece || [])[0];
    // Druga polovica zaščite pred zanko: brez razlike ni zapisa, torej se
    // sprožilec izhodne vrste sploh ne sproži.
    const istaKoda = stara && istaIzmena(stara.shift_code || "", novaKoda);
    const istOddelek = !jeFlexi || (stara && (stara.pokriva_oddelek || "").toUpperCase() === noviOddelek);
    if (istaKoda && istOddelek) { brezSpremembe++; continue; }

    const zapis: Record<string, unknown> = {
      employee_id: oseba.id,
      department_code: povezava.skupina,
      work_date: celica.datum,
      shift_code: novaKoda,
      razlog: "sheets",
    };
    if (jeFlexi) zapis.pokriva_oddelek = noviOddelek;
    const { error: napakaZapisa } = await db.from("razpored").upsert(zapis,
      { onConflict: "employee_id,work_date" });
    if (napakaZapisa) {
      await zavrni(sporocena, "api", { work_date: celica.datum, podrobnosti: napakaZapisa.message });
      continue;
    }
    spremenjenih++;
  }

  return odgovor({ sprejeto: true, spremenjenih, brez_spremembe: brezSpremembe, zavrnjene });
});
