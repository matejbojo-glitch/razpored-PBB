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

  // ---------------------------------------------------------------------
  // Branje/pisanje POSAMEZNIH CELIC v obstoječ dokument (za "Zapiši nazaj v
  // Sheets" na Razporedu — piše popravke naravnost v admin-ov že obstoječ,
  // ročno voden dokument, namesto da bi ob vsakem izvozu naredila nov).
  //
  // preberiVrednosti/zapisiVObstojeciList NAMENOMA ne uporabljata javnega
  // CSV izvoza (glej ImportUtils.preberiGoogleSheet v import-utils.js) - ta
  // izpusti prazne vrstice, kar bi za BRANJE bilo v redu, za PISANJE pa bi
  // premaknilo indekse vrstic glede na resnične številke vrstic v listu.
  // Namesto tega gresta prek Sheets API (values.get / values:batchUpdate) z
  // OAuth žetonom, ki že obstaja za izvoz zgoraj (isti obseg pravic).
  // ---------------------------------------------------------------------

  function razberiPovezavo(url) {
    var m = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) throw new Error("Ni videti kot povezava Google Sheets (pričakovano: docs.google.com/spreadsheets/d/...).");
    var gidM = String(url).match(/[?#&]gid=([0-9]+)/);
    return { id: m[1], gid: gidM ? gidM[1] : null };
  }

  // 0-based indeks stolpca -> črke ("A", "B", ..., "Z", "AA", ...).
  function stolpecVCrke(n) {
    var s = "", m = n + 1;
    while (m > 0) {
      var ostanek = (m - 1) % 26;
      s = String.fromCharCode(65 + ostanek) + s;
      m = Math.floor((m - 1) / 26);
    }
    return s;
  }

  // gid v URL-ju je INTERNI ID zavihka (ne njegov naslov), Sheets API values.*
  // pa zahteva naslov ("List1!A1"). To poišče naslov, ki ustreza gid-u iz
  // povezave - če gid v povezavi manjka, vzame prvi zavihek v dokumentu
  // (enako kot javni CSV izvoz privzeto vzame gid=0).
  async function najdiNaslovLista(id, zeton, gid) {
    var res = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + "?fields=sheets.properties", {
      headers: { "Authorization": "Bearer " + zeton },
    });
    var podatki = await preveriOdgovor(res, "Branje seznama zavihkov ni uspelo");
    var listi = (podatki.sheets || []).map(function (s) { return s.properties; });
    if (!listi.length) throw new Error("Dokument nima nobenega zavihka.");
    var moj = gid != null ? listi.filter(function (s) { return String(s.sheetId) === String(gid); })[0] : listi[0];
    if (!moj) {
      throw new Error(
        "V dokumentu ni zavihka z gid=" + gid + " — preveri, da je povezava kopirana IZ PRAVEGA zavihka " +
        "(klikni zavihek na dnu preglednice, šele nato kopiraj naslov iz naslovne vrstice)."
      );
    }
    return moj.title;
  }

  // Vrne { id, naslovLista, vrsteVrstic } - vrsteVrstic je string[][], kjer
  // INDEKS v polju ustreza PRAVI številki vrstice v listu (vrstica 1 v
  // Sheetsu = vrsteVrstic[0]); Google API prazne vmesne vrstice vrne kot [],
  // ne jih izpusti, dokler jih izrecno zahtevamo v obsegu (glej spodaj).
  async function preberiVrednosti(url) {
    var razbrano = razberiPovezavo(url);
    var zeton = await pridobiZeton(!trenutniZeton);
    var naslovLista = await najdiNaslovLista(razbrano.id, zeton, razbrano.gid);
    var obseg = encodeURIComponent(naslovLista) + "!A1:ZZ3000";
    var res = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + razbrano.id + "/values/" + obseg,
      { headers: { "Authorization": "Bearer " + zeton } }
    );
    var podatki = await preveriOdgovor(res, "Branje podatkov iz Google Sheets ni uspelo");
    return { id: razbrano.id, naslovLista: naslovLista, vrsteVrstic: podatki.values || [] };
  }

  // posodobitve: [{ vrstica, stolpec, vrednost }], 0-based indeksi TOČNO
  // takšni, kot jih vrne preberiVrednosti (ista poravnava). Piše SAMO te
  // posamezne celice prek values:batchUpdate - noben drug del lista (imena,
  // podpisni blok, drugi meseci, oblikovanje) se ne spremeni. Vrne število
  // dejansko zapisanih celic in naslov zavihka.
  async function zapisiVObstojeciList(url, posodobitve) {
    if (!posodobitve || !posodobitve.length) return { list: null, stevilo: 0, url: url };
    var razbrano = razberiPovezavo(url);
    var zeton = await pridobiZeton(!trenutniZeton);
    var naslovLista = await najdiNaslovLista(razbrano.id, zeton, razbrano.gid);
    var podatkiObsegov = posodobitve.map(function (p) {
      return {
        range: "'" + naslovLista.replace(/'/g, "''") + "'!" + stolpecVCrke(p.stolpec) + (p.vrstica + 1),
        values: [[p.vrednost]],
      };
    });
    var res = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + razbrano.id + "/values:batchUpdate",
      {
        method: "POST",
        headers: { "Authorization": "Bearer " + zeton, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: podatkiObsegov }),
      }
    );
    await preveriOdgovor(res, "Pisanje v Google Sheets ni uspelo");
    return { list: naslovLista, stevilo: posodobitve.length, url: "https://docs.google.com/spreadsheets/d/" + razbrano.id + "/edit" };
  }

  root.GSheetsExport = {
    izvoziVSheets: izvoziVSheets,
    jeNastavljeno: function () { return !!CLIENT_ID; },
    preberiVrednosti: preberiVrednosti,
    zapisiVObstojeciList: zapisiVObstojeciList,
  };
})(typeof window !== "undefined" ? window : this);
