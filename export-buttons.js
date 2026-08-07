/* Razpored PBB — export-buttons.js
 * Skupen par gumbov "Izvozi v Excel" / "Izvozi v Google Sheets", uporabljen
 * na vseh straneh z razpredelnicami — namesto podvajanja iste gumb+stanje
 * logike na vsaki strani posebej. Bere export-utils.js in gsheets-client.js
 * (naloži oba pred tem skriptom).
 * Brez JSX (navaden React.createElement), da se naloži kot <script> pred
 * babel skriptami vsake strani.
 *
 * "compact" način (nova ikona + spustni meni namesto dveh gumbov v vrsti) je
 * namenjen ozkim mobilnim zaslonom, kjer poln gumb zavzame preveč prostora —
 * glej index.html. Neobvezen "pdf" prop doda tretjo postavko v meni (stran
 * sama poskrbi za PDF izvoz prek PrintFit, ki ni del tega skripta).
 */
(function (root) {
  "use strict";
  var e = root.React.createElement;
  var useState = root.React.useState;
  var useEffect = root.React.useEffect;
  var useRef = root.React.useRef;

  var STYLE_ID = "razpored-export-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".dlCompact{ position:relative; display:inline-block; }" +
      ".dlIconBtn{ width:40px; height:40px; border-radius:50%; border:1px solid var(--line); background:var(--surface);" +
      " color:var(--text); font-size:17px; cursor:pointer; display:flex; align-items:center; justify-content:center;" +
      " padding:0; flex:0 0 auto; }" +
      ".dlIconBtn:hover{ background:var(--surface-2); }" +
      ".dlMenu{ position:absolute; right:0; top:calc(100% + 6px); z-index:30; background:var(--surface);" +
      " border:1px solid var(--line); border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,.14); padding:6px;" +
      " display:flex; flex-direction:column; gap:2px; min-width:210px; }" +
      ".dlMenuItem{ background:none; border:0; text-align:left; padding:11px 12px; border-radius:8px; font-size:13.5px;" +
      " font-weight:700; color:var(--text); cursor:pointer; font-family:inherit; min-height:40px; }" +
      ".dlMenuItem:hover{ background:var(--surface-2); }" +
      ".dlMenuItem:disabled{ opacity:.5; cursor:default; }" +
      ".dlMenuMsg{ padding:2px 10px 4px; font-size:12px; }";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // props:
  //   naslov  — ime izvožene datoteke/dokumenta (brez pripone)
  //   listi   — [{ ime, glave: [...], vrstice: [[...], ...] }], en vnos na zavihek/list
  //   pripravi — (neobvezno) funkcija () => listi, klicana tik pred izvozom
  //              namesto branja `listi` neposredno (za strani, kjer je
  //              sestavljanje podatkov cenejše storiti šele ob kliku)
  //   compact — (neobvezno) true = ikona + spustni meni namesto dveh gumbov
  //   pdf     — (neobvezno, samo v compact načinu) { label, onClick } — dodatna
  //             prva postavka v meniju za PDF izvoz (stran sama pokliče PrintFit)
  function RazporedIzvoz(props) {
    var busyState = useState(null); // "xlsx" | "sheets" | null
    var busy = busyState[0], setBusy = busyState[1];
    var msgState = useState(null);
    var msg = msgState[0], setMsg = msgState[1];
    var odprtoState = useState(false); // samo compact način
    var odprto = odprtoState[0], setOdprto = odprtoState[1];
    var wrapRef = useRef(null);

    // Hooki morajo teči brezpogojno na vsakem izrisu (Rules of Hooks) - zato
    // je poslušalec tu na vrhu, znotraj pa se sam izklopi, če ni compact/odprto.
    useEffect(function () {
      if (!props.compact || !odprto) return;
      function naZunanjiKlik(ev) {
        if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOdprto(false);
      }
      document.addEventListener("pointerdown", naZunanjiKlik);
      return function () { document.removeEventListener("pointerdown", naZunanjiKlik); };
    }, [props.compact, odprto]);

    function podatki() {
      return props.pripravi ? props.pripravi() : props.listi;
    }

    function izvoziExcel() {
      setMsg(null);
      try {
        root.ExportUtils.izvoziXLSX(props.naslov, podatki());
        setOdprto(false);
      } catch (err) {
        setMsg({ ok: false, text: err.message || String(err) });
      }
    }

    async function izvoziSheets() {
      setBusy("sheets"); setMsg(null);
      try {
        var url = await root.GSheetsExport.izvoziVSheets(props.naslov, podatki());
        setMsg({ ok: true, text: "Ustvarjeno — odpiram v novem zavihku …" });
        setOdprto(false);
        root.open(url, "_blank", "noopener");
      } catch (err) {
        setMsg({ ok: false, text: err.message || String(err) });
      } finally {
        setBusy(null);
      }
    }

    if (props.compact) {
      ensureStyle();

      var postavke = [];
      if (props.pdf) {
        postavke.push(
          e(
            "button",
            { key: "pdf", className: "dlMenuItem", type: "button", onClick: function () { setOdprto(false); props.pdf.onClick(); } },
            "📄 " + (props.pdf.label || "Izvozi v PDF")
          )
        );
      }
      postavke.push(
        e("button", { key: "xlsx", className: "dlMenuItem", type: "button", onClick: izvoziExcel, disabled: !!busy }, "⬇ Izvozi v Excel")
      );
      postavke.push(
        e(
          "button",
          { key: "sheets", className: "dlMenuItem", type: "button", onClick: izvoziSheets, disabled: !!busy },
          busy === "sheets" ? "Izvažam …" : "📗 Izvozi v Google Sheets"
        )
      );

      return e(
        "div",
        { className: "no-print dlCompact", ref: wrapRef },
        e(
          "button",
          { className: "dlIconBtn", type: "button", "aria-label": "Izvozi razpored", "aria-expanded": odprto, onClick: function () { setOdprto(function (o) { return !o; }); } },
          "⬇"
        ),
        odprto && e("div", { className: "dlMenu", role: "menu" }, postavke, msg && e("p", { className: "dlMenuMsg " + (msg.ok ? "okMsg" : "err") }, msg.text))
      );
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
