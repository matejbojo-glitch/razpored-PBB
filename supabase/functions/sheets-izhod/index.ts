// ---------------------------------------------------------------------
// Razpored PBB – Edge Function "sheets-izhod"  (aplikacija → Google Sheets)
//
// Prazni izhodno vrsto public.sheet_sync_izhod, ki jo polni sprožilec v
// bazi (supabase/sheets-sinhronizacija.sql). Kliče jo pg_cron enkrat na
// minuto - glej supabase/sheets-urnik.sql.
//
// ZAKAJ VRSTA IN NE KLIC IZ SPROŽILCA
// Objava meseca za oddelek je ~300 vrstic; toliko klicev bi takoj zadelo
// Googlovo kvoto (~60/min). En zagon te funkcije naredi en sam
// values.batchUpdate na zavihek, ne glede na to, ali je v vrsti 1 ali 300
// celic.
//
// VRSTA POVE, KATERE CELICE OSVEŽITI - NE, KAJ VANJE ZAPISATI
// Vrednost se ob pošiljanju prebere iz razporeda znova. Če je nekdo isto
// celico spremenil še dvakrat, medtem ko je vrstica čakala, se v list
// zapiše zadnje stanje, ne tisto izpred nekaj minut.
//
// KAJ SE NIKOLI NE ZGODI
// Piše se SAMO v celice, ki jih vrne koordinateOddelka - torej v iste, ki
// jih uvoz tudi bere. Imena, vloge, naslovi mesecev, podpisni blok in
// oblikovanje niso med njimi. Vrstice, stolpca ali zavihka koda ne zna
// dodati (glej _shared/google-sheets.ts).
//
// Skrivnosti (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON, SHEETS_CRON_SECRET
// ---------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  koordinateOddelka, kratkiKljuc, istaIzmena, obsegCelice,
  barvaZaZapis, zahtevaBarve,
} from "../_shared/sheets-koordinate.js";
import {
  preberiServisniRacun, pridobiZeton, preberiZavihek, zapisiCelice,
  preberiSheetId, pobarvajCelice, ZavihekNiNajden,
} from "../_shared/google-sheets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHEETS_CRON_SECRET = Deno.env.get("SHEETS_CRON_SECRET") ?? "";
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";

// Koliko celic največ v enem zagonu. Preostanek gre v naslednji minuti -
// vrsta živi v bazi, zato se nič ne izgubi.
const NAJVEC_NA_KLIC = 500;

type Vrstica = {
  id: number; povezava_id: string; employee_id: string; work_date: string;
  shift_code: string | null; poskusi: number;
};
type Povezava = {
  id: string; skupina: string; spreadsheet_id: string; zavihek: string; oblika: string;
  barve: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!SHEETS_CRON_SECRET || req.headers.get("x-cron-secret") !== SHEETS_CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    return new Response(JSON.stringify({ napaka: "Manjka GOOGLE_SERVICE_ACCOUNT_JSON." }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: prevzete, error: napakaPrevzema } = await db
    .rpc("sheet_sync_prevzemi", { p_najvec: NAJVEC_NA_KLIC });
  if (napakaPrevzema) {
    return new Response(JSON.stringify({ napaka: napakaPrevzema.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
  const vrstice = (prevzete || []) as Vrstica[];
  if (!vrstice.length) {
    return new Response(JSON.stringify({ prevzetih: 0, zapisanih: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  async function zabeleziNapako(vrsta: string, p: Partial<{
    povezava_id: string; spreadsheet_id: string; zavihek: string; work_date: string; podrobnosti: string;
  }>) {
    await db.from("sync_errors").insert({ smer: "app_v_sheets", vrsta, ...p });
  }
  async function koncaj(ids: number[]) {
    if (ids.length) {
      await db.from("sheet_sync_izhod")
        .update({ status: "koncano", obdelano: new Date().toISOString(), napaka: null })
        .in("id", ids);
    }
  }
  // Padle vrstice se vrnejo v igro z naraščajočim zamikom (sheet_sync_prevzemi);
  // po petem poskusu obstanejo vidne v pregledu in se ne poskušajo več.
  async function odlozi(vrs: Vrstica[], sporocilo: string) {
    for (const v of vrs) {
      await db.from("sheet_sync_izhod")
        .update({ status: "napaka", poskusi: (v.poskusi || 0) + 1, napaka: sporocilo.slice(0, 500),
                  obdelano: new Date().toISOString() })
        .eq("id", v.id);
    }
  }

  const racun = preberiServisniRacun(GOOGLE_SERVICE_ACCOUNT_JSON);
  const zeton = await pridobiZeton(racun);

  // Povezave in imena oseb, ki nastopajo v tem svežnju.
  const povezaveIds = [...new Set(vrstice.map((v) => v.povezava_id))];
  const osebeIds = [...new Set(vrstice.map((v) => v.employee_id))];
  const [{ data: povezaveVrstic }, { data: osebe }] = await Promise.all([
    db.from("sheet_connections").select("id, skupina, spreadsheet_id, zavihek, oblika, barve").in("id", povezaveIds),
    db.from("profili").select("id, full_name").in("id", osebeIds),
  ]);
  const povezavaPoId = new Map<string, Povezava>();
  (povezaveVrstic || []).forEach((p) => povezavaPoId.set(p.id, p as Povezava));
  const kljucOsebe = new Map<string, string>();
  (osebe || []).forEach((o: { id: string; full_name: string }) => kljucOsebe.set(o.id, kratkiKljuc(o.full_name)));

  let zapisanihSkupaj = 0, preskocenih = 0, pobarvanihSkupaj = 0;

  for (const povezavaId of povezaveIds) {
    const svezenj = vrstice.filter((v) => v.povezava_id === povezavaId);
    const povezava = povezavaPoId.get(povezavaId);
    if (!povezava) {
      await zabeleziNapako("nepovezan_zavihek", { povezava_id: povezavaId, podrobnosti: "Povezava je bila medtem izbrisana." });
      await koncaj(svezenj.map((v) => v.id));
      continue;
    }
    if (povezava.oblika !== "oddelek") {
      // FLEXI in NZV imata drugačno obliko lista (pari stolpcev oz. enote
      // namesto oseb). Dokler nista podprta, se ne ugiba - vrstice se
      // ustavijo in ostanejo vidne.
      await zabeleziNapako("nepodprta_oblika", {
        povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
        podrobnosti: `Oblika "${povezava.oblika}" še ni podprta za samodejno pisanje.`,
      });
      for (const v of svezenj) {
        await db.from("sheet_sync_izhod")
          .update({ status: "napaka", poskusi: 5, napaka: "nepodprta oblika lista", obdelano: new Date().toISOString() })
          .eq("id", v.id);
      }
      continue;
    }

    let vrsteVrstic: string[][];
    try {
      vrsteVrstic = await preberiZavihek(zeton, povezava.spreadsheet_id, povezava.zavihek);
    } catch (e) {
      if (e instanceof ZavihekNiNajden) {
        // Povezava se pavzira, da ne trka v prazno vsako minuto. Vklopi jo
        // človek, ko uredi ime zavihka.
        await db.from("sheet_connections").update({ aktivno: false }).eq("id", povezava.id);
        await zabeleziNapako("zavihek_ni_najden", {
          povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
          podrobnosti: String(e.message) + " Povezava je začasno izklopljena.",
        });
        await koncaj(svezenj.map((v) => v.id));
      } else {
        await odlozi(svezenj, String((e as Error).message || e));
      }
      continue;
    }

    // Trenutno stanje razporeda za natanko te osebe in dneve - vrsta pove
    // KATERE celice osvežiti, vrednost pa je vedno zadnja iz baze.
    const dnevi = svezenj.map((v) => v.work_date).sort();
    const { data: zapisi } = await db.from("razpored")
      .select("employee_id, work_date, shift_code")
      .eq("department_code", povezava.skupina)
      .gte("work_date", dnevi[0]).lte("work_date", dnevi[dnevi.length - 1])
      .in("employee_id", [...new Set(svezenj.map((v) => v.employee_id))]);
    const vBazi = new Map<string, string>();
    (zapisi || []).forEach((z: { employee_id: string; work_date: string; shift_code: string }) => {
      vBazi.set(z.employee_id + "|" + z.work_date, z.shift_code || "");
    });

    const { celice } = koordinateOddelka(vrsteVrstic, dnevi[0], dnevi[dnevi.length - 1]);
    const poKljucuInDnevu = new Map<string, { vrstica: number; stolpec: number; vrednost: string }>();
    celice.forEach((c) => { poKljucuInDnevu.set(c.kljuc + "|" + c.datum, c); });

    const zaZapis: { obseg: string; vrednost: string; vrstica: number; stolpec: number }[] = [];
    const uspesne: number[] = [];
    const preskocene: number[] = [];
    for (const v of svezenj) {
      const kljuc = kljucOsebe.get(v.employee_id);
      if (!kljuc) {
        await zabeleziNapako("neznano_ime", {
          povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
          work_date: v.work_date, podrobnosti: `Osebe ${v.employee_id} ni v profilih.`,
        });
        preskocene.push(v.id); continue;
      }
      const cilj = poKljucuInDnevu.get(kljuc + "|" + v.work_date);
      if (!cilj) {
        // Ali oseba nima svojega stolpca, ali dan ni znotraj nobenega
        // bloka. Oboje je vidno v pregledu; nič se ne ugiba in nič ne
        // zapiše na slepo.
        const dnevaNiNikjer = !celice.some((c) => c.datum === v.work_date);
        await zabeleziNapako(dnevaNiNikjer ? "brez_vrstice" : "brez_stolpca", {
          povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
          work_date: v.work_date,
          podrobnosti: dnevaNiNikjer
            ? `Dneva ${v.work_date} ni v nobenem mesečnem bloku zavihka.`
            : `Oseba (${kljuc}) nima svojega stolpca v zavihku.`,
        });
        preskocene.push(v.id); continue;
      }
      const zeljena = vBazi.get(v.employee_id + "|" + v.work_date) || "";
      // Zaščita pred neskončno zanko: celica, ki že vsebuje to izmeno
      // (tudi če je zapisana drugače - "popoldan do 19" proti "Popoldne do
      // 19"), se ne prepiše, torej se onChange v listu ne sproži.
      if (istaIzmena(cilj.vrednost, zeljena)) { preskocene.push(v.id); preskocenih++; continue; }
      zaZapis.push({
        obseg: obsegCelice(povezava.zavihek, cilj.vrstica, cilj.stolpec), vrednost: zeljena,
        vrstica: cilj.vrstica, stolpec: cilj.stolpec,
      });
      uspesne.push(v.id);
    }

    try {
      zapisanihSkupaj += await zapisiCelice(zeton, povezava.spreadsheet_id, zaZapis);
      await koncaj(uspesne.concat(preskocene));

      // Barve so LOČEN, neobvezen korak PO zapisu vrednosti:
      //  - barva se nastavi samo celicam, ki jih je ta zagon res zapisal;
      //    ročno oblikovanje drugod v listu ostane nedotaknjeno,
      //  - če barvanje spodleti, vrednosti so vseeno zapisane in vrstice
      //    ostanejo "koncano" - napaka je vidna, a se ne poskuša v nedogled
      //    (drugače bi ena zavrnjena barva vrtela ponovni zapis vrednosti).
      if (povezava.barve && zaZapis.length) {
        try {
          const sheetId = await preberiSheetId(zeton, povezava.spreadsheet_id, povezava.zavihek);
          const zahteve = zaZapis.map((c) =>
            zahtevaBarve(sheetId, c.vrstica, c.stolpec, barvaZaZapis(c.vrednost)));
          pobarvanihSkupaj += await pobarvajCelice(zeton, povezava.spreadsheet_id, zahteve);
        } catch (e) {
          await zabeleziNapako("barve", {
            povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
            podrobnosti: "Vrednosti so zapisane, barve pa ne: " + String((e as Error).message || e),
          });
        }
      }
    } catch (e) {
      await koncaj(preskocene);
      await odlozi(svezenj.filter((v) => uspesne.includes(v.id)), String((e as Error).message || e));
      await zabeleziNapako("api", {
        povezava_id: povezava.id, spreadsheet_id: povezava.spreadsheet_id, zavihek: povezava.zavihek,
        podrobnosti: String((e as Error).message || e),
      });
    }
  }

  return new Response(JSON.stringify({
    prevzetih: vrstice.length, zapisanih: zapisanihSkupaj,
    pobarvanih: pobarvanihSkupaj, brez_spremembe: preskocenih,
  }), { headers: { "content-type": "application/json" } });
});
