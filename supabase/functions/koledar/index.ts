// ---------------------------------------------------------------------
// Razpored PBB — Edge Function "koledar"
//
// Živa koledarska naročnina (iCal subscription). Odjemalec (Google
// Koledar, Apple Koledar, Outlook) periodično pokliče ta naslov in dobi
// vedno SVEŽ razpored — za razliko od enkratnega prenosa .ics, kjer je
// vsebina zamrznjena v trenutku prenosa.
//
//   GET /functions/v1/koledar?t=<žeton>
//
// Žeton je nosilni podatek: koledarski odjemalci se ne znajo prijaviti,
// zato je naslov sam po sebi dokazilo o dostopu. Zato:
//   * ne vrača ničesar razen razporeda TE osebe,
//   * ob neveljavnem žetonu vrne 404 brez pojasnila (nobenega namiga,
//     ali žeton obstaja),
//   * oseba ga lahko kadar koli zamenja (Nastavitve → Koledar), s čimer
//     prejšnja povezava takoj neha delovati.
//
// Ure izmen NISO zapisane tu — bere jih delovni-cas.js, isti modul kot
// aplikacija. Datoteka nima uvozov/izvozov, zato jo Deno naloži kot
// stranski učinek, ki napolni globalThis.DelovniCas (enako kot v
// brskalniku napolni window.DelovniCas). Tako ostaja en sam vir resnice
// o urah in se koledar ne more razíti z razporedom v aplikaciji.
//
// Zahtevane okoljske spremenljivke nastavi Supabase sam:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Ta funkcija mora biti nameščena BREZ preverjanja JWT, sicer koledarski
// odjemalci ne morejo do nje:
//   supabase functions deploy koledar --no-verify-jwt
// ---------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";
import "../../../delovni-cas.js";

const DelovniCas = (globalThis as any).DelovniCas;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Koliko razporeda ponudimo. Nazaj malo (da je v koledarju še vidno, kaj
// je bilo), naprej toliko, kolikor je sploh objavljeno.
const DNI_NAZAJ = 60;
const DNI_NAPREJ = 400;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dodajDni(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function danesISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Pobegi po RFC 5545: vejica, podpičje in obrnjena poševnica se ubežijo,
// nova vrstica postane \n.
function pobegni(besedilo: string): string {
  return String(besedilo ?? "")
    .replace(/([,;\\])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 zahteva, da vrstica ne presega 75 oktetov; daljše se prelomijo
// s presledkom na začetku nadaljevanja. Prelamljamo po BAJTIH, ne po
// znakih — sicer bi se šumnik (2 bajta v UTF-8) lahko prerezal na pol.
function zlomiVrstico(vrstica: string): string {
  const bajti = new TextEncoder().encode(vrstica);
  if (bajti.length <= 75) return vrstica;
  const deli: string[] = [];
  const dekoder = new TextDecoder();
  let zacetek = 0;
  let prvi = true;
  while (zacetek < bajti.length) {
    // Prva vrstica sme 75 bajtov, nadaljevanja 74 (+1 za vodilni presledek).
    let dolzina = Math.min(prvi ? 75 : 74, bajti.length - zacetek);
    // Ne prereži večbajtnega znaka: 0b10xxxxxx je nadaljevalni bajt.
    while (dolzina > 1 && (bajti[zacetek + dolzina] & 0xc0) === 0x80) dolzina--;
    deli.push((prvi ? "" : " ") + dekoder.decode(bajti.slice(zacetek, zacetek + dolzina)));
    zacetek += dolzina;
    prvi = false;
  }
  return deli.join("\r\n");
}

// Europe/Ljubljana: CET (UTC+1) / CEST (UTC+2), preklop zadnjo nedeljo v
// marcu oz. oktobru. Zapisano kot VTIMEZONE s pravili, da odjemalcu ni
// treba ugibati in da so nočne izmene ob preklopu ure pravilne.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Ljubljana",
  "X-LIC-LOCATION:Europe/Ljubljana",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

type Vrstica = { work_date: string; shift_code: string };

function sestaviICS(ime: string, vrstice: Vrstica[]): string {
  const zdaj = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dogodki: string[] = [];

  for (const r of vrstice) {
    const sifra = (r.shift_code || "").trim();
    if (!sifra) continue;

    // UID mora biti STABILEN med osveževanji. Če bi se ob vsakem klicu
    // spremenil (npr. z naključjem), bi odjemalec vsakič pobrisal in znova
    // ustvaril vse dogodke — kar pomeni podvojene vnose in odveč opozorila.
    // Oseba+dan je naravni ključ (schedule_entries ima unique na
    // (employee_id, work_date)), zato je dovolj za enoličnost.
    const uid = "pbb-" + r.work_date + "-" + encodeURIComponent(ime) + "@razpored.netlify.app";
    const podatki = DelovniCas.podatkiIzmene(sifra);

    // Pogoj je "ure != null", ne le obstoj zacetek/konec. DEŽURSTVO ima
    // zapisano 15:30–07:00, a to velja SAMO med tednom — ob vikendih in
    // praznikih traja 24 h (07:00–07:00) in aplikacija te razlike (še) ne
    // modelira, zato so mu ure namenoma null. Če bi ga izpisali kot
    // časovni dogodek, bi koledar v soboto trdil napačno uro prihoda.
    // "ure != null" je isti pogoj, po katerem index.html gradi DELOVNI_ČAS,
    // zato je naročnina skladna s prikazom v aplikaciji.
    if (podatki && podatki.ure != null && podatki.zacetek && podatki.konec) {
      const konecDatum = podatki.nocna ? dodajDni(r.work_date, 1) : r.work_date;
      dogodki.push(
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + zdaj,
        "DTSTART;TZID=Europe/Ljubljana:" + r.work_date.replace(/-/g, "") + "T" +
          podatki.zacetek.replace(":", "") + "00",
        "DTEND;TZID=Europe/Ljubljana:" + konecDatum.replace(/-/g, "") + "T" +
          podatki.konec.replace(":", "") + "00",
        zlomiVrstico("SUMMARY:" + pobegni(sifra)),
        "END:VEVENT",
      );
    } else {
      // LD / KPU / BS / STI / DEŽURSTVO in neznane kode: nimajo (znanih)
      // ur, zato celodnevni dogodek. DTEND je pri VALUE=DATE izključujoč,
      // zato naslednji dan.
      dogodki.push(
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + zdaj,
        "DTSTART;VALUE=DATE:" + r.work_date.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + dodajDni(r.work_date, 1).replace(/-/g, ""),
        zlomiVrstico("SUMMARY:" + pobegni(sifra)),
        "END:VEVENT",
      );
    }
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Razpored PBB//Koledar//SL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    zlomiVrstico("X-WR-CALNAME:" + pobegni("Razpored — " + ime)),
    "X-WR-TIMEZONE:Europe/Ljubljana",
    // Namig odjemalcu, kako pogosto naj osveži (Apple bere X-PUBLISHED-TTL,
    // novejši odjemalci REFRESH-INTERVAL). Razpored se ne spreminja po
    // minutah, štiri ure so razumen kompromis.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
    ...VTIMEZONE,
    ...dogodki,
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const token = new URL(req.url).searchParams.get("t") ?? "";
  // Žeton je 32 bajtov v šestnajstiškem zapisu = 64 znakov. Očitno
  // napačno dolge zavrnemo takoj, brez klica v bazo.
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const od = dodajDni(danesISO(), -DNI_NAZAJ);
  const doo = dodajDni(danesISO(), DNI_NAPREJ);

  const { data, error } = await client.rpc("koledar_razpored", {
    p_token: token,
    p_od: od,
    p_do: doo,
  });

  if (error) {
    console.error("koledar_razpored:", error.message);
    return new Response("Server error", { status: 500 });
  }
  // Prazen rezultat pomeni neveljaven žeton ALI osebo brez razporeda; oboje
  // vrne 404, da naslov ne izdaja, kateri žetoni obstajajo.
  if (!data || data.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const ime = data[0].full_name || "Razpored";
  const ics = sestaviICS(ime, data as Vrstica[]);

  return new Response(req.method === "HEAD" ? null : ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="razpored.ics"',
      // Naročnina naj se ne servira iz predpomnilnika posrednika — sicer
      // bi bila poanta žive povezave izgubljena.
      "Cache-Control": "no-cache, max-age=0",
    },
  });
});
