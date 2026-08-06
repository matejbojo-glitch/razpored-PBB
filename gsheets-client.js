/* Razpored PBB — gsheets-client.js
 * Živa povezava do Google Sheets: prijava (Google Identity Services, OAuth
 * "token" model — brez lastnega strežnika, brez shranjevanja skrivnosti) +
 * ustvarjanje/pisanje v nov Google Sheets dokument prek Sheets API v4.
 *
 * NASTAVITEV (enkratno, naredi admin sam v Google Cloud Console — glej
 * GSHEETS-SETUP.md v korenu repozitorija za natančna navodila po korakih):
 *   1. console.cloud.google.com → nov ali obstoječ projekt.
 *   2. "APIs & Services" → "Library" → omogoči "Google Sheets API".
 *   3. "APIs & Services" → "OAuth consent screen" → nastavi (ime aplikacije,
 *      e-pošta) — če je bolnišnica na Google Workspace domeni, izberi
 *      "Internal" (izogne se Googlovemu opozorilu "unverified app").
 *   4. "APIs & Services" → "Credentials" → "Create Credentials" →
 *      "OAuth client ID" → vrsta "Web application".
 *   5. "Authorized JavaScript origins" dodaj natanko naslov aplikacije
 *      (npr. https://razpored.netlify.app) — brez tega prijava zavrne.
 *   6. Kopiran "Client ID" (konča se na .apps.googleusercontent.com) prilepi
 *      spodaj namesto prazne vrednosti CLIENT_ID.
 *
 * Dokler CLIENT_ID ni izpolnjen, gumbi "Izvozi v Google Sheets" po vsej
 * aplikaciji vrnejo jasno sporočilo o tem namesto neumljive napake.
 */
(function (root) {
  "use strict";

  var CLIENT_ID = "728346935664-gpkl2dh4av069cp5hlvjhj7culb72t1h.apps.googleusercontent.com";
  var SCOPE = "https://www.googleapis.com/auth/spreadsheets";

  var tokenClient = null;
  var trenutniZeton = null; // { access_token, expires_at }

  function nalozizGis() {
    return new Promise(function (resolve, reject) {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) { resolve(); return; }
      var obstojeci = document.getElementById("gsi-client-script");
      if (obstojeci) { obstojeci.addEventListener("load", resolve); obstojeci.addEventListener("error", function(){ reject(new Error("Google prijave ni bilo mogoče naložiti.")); }); return; }
      var s = document.createElement("script");
      s.id = "gsi-client-script";
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Google prijave ni bilo mogoče naložiti (brez omrežja ali blokiran skript).")); };
      document.head.appendChild(s);
    });
  }

  function pridobiZeton(zeliInteraktivno) {
    return new Promise(function (resolve, reject) {
      if (!CLIENT_ID) {
        reject(new Error("Izvoz v Google Sheets še ni nastavljen — manjka Google Client ID (glej GSHEETS-SETUP.md)."));
        return;
      }
      if (trenutniZeton && trenutniZeton.expires_at > Date.now() + 30000) { resolve(trenutniZeton.access_token); return; }
      nalozizGis().then(function () {
        if (!tokenClient) {
          tokenClient = root.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            callback: function () {}, // prepisano spodaj ob vsakem klicu
          });
        }
        tokenClient.callback = function (resp) {
          if (resp.error) { reject(new Error("Google prijava ni uspela: " + resp.error)); return; }
          trenutniZeton = { access_token: resp.access_token, expires_at: Date.now() + (Number(resp.expires_in || 3600) * 1000) };
          resolve(resp.access_token);
        };
        tokenClient.requestAccessToken({ prompt: zeliInteraktivno ? "consent" : "" });
      }).catch(reject);
    });
  }

  async function preveriOdgovor(res, sporocilo) {
    if (res.ok) return res.json();
    var telo = null;
    try { telo = await res.json(); } catch (e) {}
    var podrobnost = telo && telo.error && telo.error.message ? telo.error.message : ("HTTP " + res.status);
    throw new Error(sporocilo + " (" + podrobnost + ")");
  }

  // naslovDokumenta: ime novega Google Sheets dokumenta.
  // listi: [{ ime, glave: [...], vrstice: [[...], ...] }] — isti format kot
  // ExportUtils.izvoziXLSX, da lahko strani pripravijo podatke enkrat in jih
  // uporabijo za oba izvoza. Vrne URL novo ustvarjenega dokumenta.
  async function izvoziVSheets(naslovDokumenta, listi) {
    if (!listi || !listi.length) throw new Error("Ni podatkov za izvoz.");
    var zeton = await pridobiZeton(!trenutniZeton);

    var ustvarjen = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { "Authorization": "Bearer " + zeton, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title: naslovDokumenta },
        sheets: listi.map(function (l) { return { properties: { title: (l.ime || "List").slice(0, 99) } }; }),
      }),
    });
    var podatki = await preveriOdgovor(ustvarjen, "Ustvarjanje Google Sheets dokumenta ni uspelo");
    var id = podatki.spreadsheetId;

    for (var i = 0; i < listi.length; i++) {
      var l = listi[i];
      var obseg = encodeURIComponent((l.ime || "List").slice(0, 99)) + "!A1";
      var zapisano = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets/" + id + "/values/" + obseg + "?valueInputOption=USER_ENTERED",
        {
          method: "PUT",
          headers: { "Authorization": "Bearer " + zeton, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [l.glave || []].concat(l.vrstice || []) }),
        }
      );
      await preveriOdgovor(zapisano, "Pisanje podatkov v Google Sheets ni uspelo");
    }

    return "https://docs.google.com/spreadsheets/d/" + id + "/edit";
  }

  root.GSheetsExport = { izvoziVSheets: izvoziVSheets, jeNastavljeno: function () { return !!CLIENT_ID; } };
})(typeof window !== "undefined" ? window : this);
