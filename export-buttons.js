/* Razpored PBB — export-buttons.js
 * Skupen par gumbov "Izvozi v Excel" / "Izvozi v Google Sheets", uporabljen
 * na vseh straneh z razpredelnicami — namesto podvajanja iste gumb+stanje
 * logike na vsaki strani posebej. Bere export-utils.js in gsheets-client.js
 * (naloži oba pred tem skriptom).
 * Brez JSX (navaden React.createElement), da se naloži kot <script> pred
 * babel skriptami vsake strani.
 */
(function (root) {
  "use strict";
  var e = root.React.createElement;
  var useState = root.React.useState;

  // props:
  //   naslov  — ime izvožene datoteke/dokumenta (brez pripone)
  //   listi   — [{ ime, glave: [...], vrstice: [[...], ...] }], en vnos na zavihek/list
  //   pripravi — (neobvezno) funkcija () => listi, klicana tik pred izvozom
  //              namesto branja `listi` neposredno (za strani, kjer je
  //              sestavljanje podatkov cenejše storiti šele ob kliku)
  function RazporedIzvoz(props) {
    var busyState = useState(null); // "xlsx" | "sheets" | null
    var busy = busyState[0], setBusy = busyState[1];
    var msgState = useState(null);
    var msg = msgState[0], setMsg = msgState[1];

    function podatki() {
      return props.pripravi ? props.pripravi() : props.listi;
    }

    function izvoziExcel() {
      setMsg(null);
      try {
        root.ExportUtils.izvoziXLSX(props.naslov, podatki());
      } catch (err) {
        setMsg({ ok: false, text: err.message || String(err) });
      }
    }

    async function izvoziSheets() {
      setBusy("sheets"); setMsg(null);
      try {
        var url = await root.GSheetsExport.izvoziVSheets(props.naslov, podatki());
        setMsg({ ok: true, text: "Ustvarjeno — odpiram v novem zavihku …" });
        root.open(url, "_blank", "noopener");
      } catch (err) {
        setMsg({ ok: false, text: err.message || String(err) });
      } finally {
        setBusy(null);
      }
    }

    return e(
      "div",
      { className: "no-print", style: { marginTop: 10 } },
      e(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        e("button", { className: "dlBtn", type: "button", onClick: izvoziExcel, disabled: !!busy }, "⬇ Izvozi v Excel"),
        e(
          "button",
          { className: "dlBtn", type: "button", onClick: izvoziSheets, disabled: !!busy },
          busy === "sheets" ? "Izvažam …" : "📗 Izvozi v Google Sheets"
        )
      ),
      msg && e("p", { className: msg.ok ? "okMsg" : "err", style: { marginTop: 6 } }, msg.text)
    );
  }

  root.RazporedIzvoz = RazporedIzvoz;
})(typeof window !== "undefined" ? window : this);
