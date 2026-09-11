/**
 * Razpored PBB – sinhronizacija Google preglednice z aplikacijo
 * ============================================================
 *
 * PRILEPI CELO VSEBINO te datoteke v Razširitve → Apps Script (prepiši
 * Code.gs), spodaj zamenjaj DVE vrstici in enkrat zaženi namestiSprozilce().
 *
 * Skript pošlje aplikaciji SAMO to, KJE se je kaj spremenilo (zavihek,
 * vrstica, stolpec). Kaj tista celica pomeni - katero osebo in kateri dan -
 * ugotovi aplikacija, ker je to odvisno od bloka in glave nad stolpcem.
 * Skript sam ne spreminja ničesar v preglednici.
 *
 * Sprožilec je NAMEŠČENI onChange, ne preprosti onEdit: preprosti onEdit se
 * ne sproži ob lepljenju več celic naenkrat in nima pravice klicati
 * zunanjega naslova.
 */

// ---- ZAMENJAJ TI ----------------------------------------------------
// 1) Naslov funkcije "sheets-vhod" (Supabase → Edge Functions → sheets-vhod).
var EDGE_URL = "https://PROJEKT.supabase.co/functions/v1/sheets-vhod";
// 2) Ista vrednost kot skrivnost SHEETS_WEBHOOK_SECRET v Supabase.
var SKRIVNOST = "TU_VPISI_SHEETS_WEBHOOK_SECRET";
// ---------------------------------------------------------------------

// Največ celic iz ENE spremembe (lepljenje večjega bloka). Kar je čez, se
// pri naslednji objavi tako ali tako poravna iz aplikacije.
var NAJVEC_CELIC = 400;
var KLJUC_VRSTE = "razpored_neposlano";

/**
 * Nameščeni sprožilec ob spremembi. Poimenovanje ni pomembno za Google,
 * pomembno je, kaj izbereš v namestiSprozilce().
 */
function obSpremembi(e) {
  try {
    if (!e || !e.source) return;
    // Vstavljanje/brisanje vrstic in stolpcev ter oblikovanje niso
    // spremembe razporeda; te dogodke preskočimo.
    if (e.changeType && e.changeType !== "EDIT" && e.changeType !== "OTHER") return;

    var list = e.source.getActiveSheet();
    var obseg = list.getActiveRange();
    if (!list || !obseg) return;
    if (obseg.getNumRows() * obseg.getNumColumns() > NAJVEC_CELIC) return;

    var celice = [];
    for (var v = 0; v < obseg.getNumRows(); v++) {
      for (var s = 0; s < obseg.getNumColumns(); s++) {
        celice.push({ vrstica: obseg.getRow() + v, stolpec: obseg.getColumn() + s });
      }
    }
    if (!celice.length) return;

    posljiAliOdlozi_({
      spreadsheet_id: e.source.getId(),
      zavihek: list.getName(),
      celice: celice,
      urejevalec: uporabnik_(),
      cas: new Date().toISOString()
    });
  } catch (napaka) {
    // Nikoli ne vržemo naprej: napaka v sprožilcu bi Googlu pomenila
    // razlog za dušenje in sčasoma izklop sprožilca.
    odlozi_({ napaka: String(napaka) });
  }
}

/**
 * Časovni sprožilec (na 10 minut): pošlje, kar prejšnjič ni šlo skozi -
 * izpad omrežja, Googlova kvota, funkcija v teku posodobitve.
 */
function poskusiZnovaNeposlano() {
  var vrsta = preberiVrsto_();
  if (!vrsta.length) return;
  zapisiVrsto_([]);
  for (var i = 0; i < vrsta.length; i++) {
    if (vrsta[i] && vrsta[i].spreadsheet_id) posljiAliOdlozi_(vrsta[i]);
  }
}

/**
 * Enkraten zagon iz urejevalnika: nastavi oba sprožilca. Ponovni zagon
 * ne podvoji ničesar - obstoječa sprožilca prej odstrani.
 */
function namestiSprozilce() {
  var preglednica = SpreadsheetApp.getActive();
  var obstojeci = ScriptApp.getProjectTriggers();
  for (var i = 0; i < obstojeci.length; i++) {
    var ime = obstojeci[i].getHandlerFunction();
    if (ime === "obSpremembi" || ime === "poskusiZnovaNeposlano") ScriptApp.deleteTrigger(obstojeci[i]);
  }
  ScriptApp.newTrigger("obSpremembi").forSpreadsheet(preglednica).onChange().create();
  ScriptApp.newTrigger("poskusiZnovaNeposlano").timeBased().everyMinutes(10).create();
  SpreadsheetApp.getActive().toast("Sprožilca sta nameščena.", "Razpored PBB", 5);
}

/**
 * Preizkus povezave, brez spreminjanja česarkoli: pošlje celico A1
 * trenutnega zavihka. Pričakovan odgovor je zavrnitev "brez_datuma" -
 * to pomeni, da naslov in skrivnost delujeta.
 */
function preizkusiPovezavo() {
  var list = SpreadsheetApp.getActiveSheet();
  var odgovor = posljiZdaj_({
    spreadsheet_id: SpreadsheetApp.getActive().getId(),
    zavihek: list.getName(),
    celice: [{ vrstica: 1, stolpec: 1 }],
    urejevalec: uporabnik_(),
    cas: new Date().toISOString()
  });
  SpreadsheetApp.getActive().toast("Odgovor: " + odgovor, "Razpored PBB", 10);
}

// --- notranje --------------------------------------------------------

function uporabnik_() {
  try { return Session.getActiveUser().getEmail() || ""; } catch (e) { return ""; }
}

function posljiAliOdlozi_(sporocilo) {
  try {
    posljiZdaj_(sporocilo);
  } catch (napaka) {
    odlozi_(sporocilo);
  }
}

function posljiZdaj_(sporocilo) {
  var odgovor = UrlFetchApp.fetch(EDGE_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "x-sheets-secret": SKRIVNOST },
    payload: JSON.stringify(sporocilo),
    muteHttpExceptions: true
  });
  var koda = odgovor.getResponseCode();
  if (koda < 200 || koda >= 300) throw new Error("HTTP " + koda + ": " + odgovor.getContentText().slice(0, 200));
  return odgovor.getContentText().slice(0, 300);
}

// Neposlano se hrani v lastnostih skripta, da preživi konec zagona.
// Vrsta je omejena, da ob daljšem izpadu ne preraste omejitve lastnosti.
function odlozi_(sporocilo) {
  var vrsta = preberiVrsto_();
  vrsta.push(sporocilo);
  while (vrsta.length > 50) vrsta.shift();
  zapisiVrsto_(vrsta);
}

function preberiVrsto_() {
  try {
    var s = PropertiesService.getScriptProperties().getProperty(KLJUC_VRSTE);
    return s ? JSON.parse(s) : [];
  } catch (e) { return []; }
}

function zapisiVrsto_(vrsta) {
  try {
    PropertiesService.getScriptProperties().setProperty(KLJUC_VRSTE, JSON.stringify(vrsta));
  } catch (e) { /* lastnosti niso na voljo - naslednjič */ }
}
