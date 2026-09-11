// ---------------------------------------------------------------------
// Razpored PBB – dostop do Google Sheets iz Edge Functions
//
// NAMENOMA MAJHNA POVRŠINA: cel modul pozna natanko štiri klice Google
// Sheets API:
//   1. values.get            - branje vrednosti,
//   2. values:batchUpdate    - zapis vrednosti,
//   3. spreadsheets.get      - SAMO imena in številke zavihkov (fields=
//                              sheets.properties), da barvanje ve, kateri
//                              sheetId pripada imenu zavihka; ne bere celic,
//   4. spreadsheets:batchUpdate - IZKLJUČNO repeatCell nad ENO celico, z
//                              dvema lastnostma (ozadje in barva pisave).
//
// Nikjer ni values.append, insertDimension, deleteDimension, mergeCells,
// updateSheetProperties, addSheet ... Zato koda ne more dodati ali
// izbrisati vrstice, stolpca ali zavihka niti pomotoma - lahko samo
// prepiše vsebino obstoječih celic in jim nastavi barvo.
//
// ZAKAJ JE ŠTIRI IN NE DVA
// Barve so bile dodane na uporabnikovo zahtevo (september 2026). Barvanja
// prek values.* ni mogoče narediti - Googlov API ga ponuja samo prek
// spreadsheets:batchUpdate. Namesto da bi se ta klic odprl na stežaj, je
// zahteva sestavljena na ENEM mestu (sheets-koordinate.js, zahtevaBarve)
// in preizkus preveri, da ne vsebuje ničesar drugega kot repeatCell nad
// eno celico.
//
// To ni obljuba, ampak preverjeno: skripte/preveri-sheets-brez-postavitve.mjs
// prebere VSE datoteke sinhronizacije in pade, če se pojavi katerikoli
// drug naslov ali metoda.
//
// Prijava: storitveni račun (service account). Zasebni ključ pride iz
// skrivnosti GOOGLE_SERVICE_ACCOUNT_JSON in nikoli ne zapusti strežnika -
// isti vzorec kot VAPID_PRIVATE_KEY v "posiljaj-push".
// ---------------------------------------------------------------------

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const OBSEG = "https://www.googleapis.com/auth/spreadsheets";

export type ServisniRacun = { client_email: string; private_key: string };

export function preberiServisniRacun(json: string): ServisniRacun {
  const r = JSON.parse(json);
  if (!r.client_email || !r.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON nima client_email/private_key.");
  }
  // V Supabase Secrets je JSON pogosto prilepljen z ubežnim "\n" v ključu.
  return { client_email: r.client_email, private_key: String(r.private_key).replace(/\\n/g, "\n") };
}

function base64url(bajti: Uint8Array | string): string {
  const b = typeof bajti === "string" ? new TextEncoder().encode(bajti) : bajti;
  let s = "";
  b.forEach((z) => { s += String.fromCharCode(z); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemVBajte(pem: string): Uint8Array {
  const telo = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const surovo = atob(telo);
  const out = new Uint8Array(surovo.length);
  for (let i = 0; i < surovo.length; i++) out[i] = surovo.charCodeAt(i);
  return out;
}

// Žeton velja eno uro; en zagon funkcije ga potrebuje enkrat, zato ga
// hranimo v pomnilniku procesa (ne v bazi - ključ ne sme nikamor).
let zetonPomnilnik: { zeton: string; velja_do: number } | null = null;

export async function pridobiZeton(racun: ServisniRacun): Promise<string> {
  const zdaj = Math.floor(Date.now() / 1000);
  if (zetonPomnilnik && zetonPomnilnik.velja_do > zdaj + 60) return zetonPomnilnik.zeton;

  const glava = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const telo = base64url(JSON.stringify({
    iss: racun.client_email, scope: OBSEG, aud: TOKEN_URL, iat: zdaj, exp: zdaj + 3600,
  }));
  const kljuc = await crypto.subtle.importKey(
    "pkcs8", pemVBajte(racun.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const podpis = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", kljuc, new TextEncoder().encode(glava + "." + telo)));
  const jwt = glava + "." + telo + "." + base64url(podpis);

  const odgovor = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const podatki = await odgovor.json();
  if (!odgovor.ok || !podatki.access_token) {
    throw new Error("Prijava storitvenega računa ni uspela: " + (podatki.error_description || odgovor.status));
  }
  zetonPomnilnik = { zeton: podatki.access_token, velja_do: zdaj + 3300 };
  return podatki.access_token;
}

function obsegZavihka(zavihek: string): string {
  return `'${String(zavihek).replace(/'/g, "''")}'!A1:ZZ3000`;
}

// Napaka, ki jo klicatelj loči od ostalih: zavihka ni (preimenovan,
// izbrisan) - takrat se povezava pavzira, da ne trka v prazno vsako minuto.
export class ZavihekNiNajden extends Error {}

// spreadsheets.values.get - EDINI način branja.
export async function preberiZavihek(zeton: string, spreadsheetId: string, zavihek: string): Promise<string[][]> {
  const naslov = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/`
    + encodeURIComponent(obsegZavihka(zavihek))
    + "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE";
  const odgovor = await fetch(naslov, { headers: { authorization: "Bearer " + zeton } });
  if (odgovor.status === 400 || odgovor.status === 404) {
    const t = await odgovor.text();
    if (/Unable to parse range|not found/i.test(t)) {
      throw new ZavihekNiNajden(`Zavihek "${zavihek}" ni najden (preimenovan ali izbrisan).`);
    }
    throw new Error(`Branje zavihka "${zavihek}" ni uspelo (${odgovor.status}): ${t.slice(0, 300)}`);
  }
  if (!odgovor.ok) {
    throw new Error(`Branje zavihka "${zavihek}" ni uspelo (${odgovor.status}).`);
  }
  const podatki = await odgovor.json();
  return (podatki.values || []) as string[][];
}

// spreadsheets.values.batchUpdate - EDINI način pisanja. Vsak vnos je en
// obseg z eno samo celico; obsegi so izračunani iz koordinat, ki jih vrne
// koordinateOddelka - torej samo celice, ki jih uvoz tudi bere.
export async function zapisiCelice(
  zeton: string, spreadsheetId: string,
  celice: { obseg: string; vrednost: string }[],
): Promise<number> {
  if (!celice.length) return 0;
  const naslov = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const odgovor = await fetch(naslov, {
    method: "POST",
    headers: { authorization: "Bearer " + zeton, "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: celice.map((c) => ({ range: c.obseg, values: [[c.vrednost]] })),
    }),
  });
  if (!odgovor.ok) {
    throw new Error(`Pisanje ni uspelo (${odgovor.status}): ${(await odgovor.text()).slice(0, 300)}`);
  }
  const podatki = await odgovor.json();
  return Number(podatki.totalUpdatedCells || 0);
}

// spreadsheets.get z ozkim "fields" - vrne SAMO imena in številke zavihkov,
// nobene celice. Potrebno, ker barvanje naslavlja zavihek s številko
// (sheetId), vrednosti pa z imenom. Številke se namenoma ne hrani v bazi:
// zavihek, ki ga nekdo izbriše in znova ustvari, dobi novo, in shranjena bi
// takrat kazala v prazno (ali, slabše, na drug zavihek).
export async function preberiSheetId(zeton: string, spreadsheetId: string, zavihek: string): Promise<number> {
  const naslov = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`;
  const odgovor = await fetch(naslov, { headers: { authorization: "Bearer " + zeton } });
  if (!odgovor.ok) {
    throw new Error(`Branje seznama zavihkov ni uspelo (${odgovor.status}).`);
  }
  const podatki = await odgovor.json();
  const najden = (podatki.sheets || []).find(
    (l: { properties?: { title?: string } }) => l.properties && l.properties.title === zavihek);
  if (!najden) throw new ZavihekNiNajden(`Zavihek "${zavihek}" ni najden (preimenovan ali izbrisan).`);
  return Number(najden.properties.sheetId);
}

// spreadsheets:batchUpdate - EDINI način barvanja. Zahteve pridejo že
// sestavljene iz sheets-koordinate.js (zahtevaBarve); ta funkcija jih samo
// odpošlje in NE sestavlja nobene svoje, da je vsa vsebina zahtev na enem
// mestu, ki ga pokriva preizkus.
export async function pobarvajCelice(
  zeton: string, spreadsheetId: string, zahteve: unknown[],
): Promise<number> {
  if (!zahteve.length) return 0;
  const naslov = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const odgovor = await fetch(naslov, {
    method: "POST",
    headers: { authorization: "Bearer " + zeton, "content-type": "application/json" },
    body: JSON.stringify({ requests: zahteve }),
  });
  if (!odgovor.ok) {
    throw new Error(`Barvanje ni uspelo (${odgovor.status}): ${(await odgovor.text()).slice(0, 300)}`);
  }
  return zahteve.length;
}
