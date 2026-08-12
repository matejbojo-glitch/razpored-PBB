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
      ".dlMenuNaslov{ margin:6px 10px 2px; font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }" +
      ".dlMenuNaslov:first-child{ margin-top:2px; }" +
      ".dlMenu{ max-height:min(70vh, 460px); overflow-y:auto; }" +
      ".dlMenuMsg{ padding:2px 10px 4px; font-size:12px; }";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------
  // Register izvoznih virov
  //
  // Izvozna ikona stoji v fiksni vrstici zgoraj desno, izvozljive
  // razpredelnice pa nastajajo globoko v strani (v zavihkih, v podkomponentah
  // z lastnim stanjem). Dvigovanje njihovih podatkov do vrha strani bi
  // pomenilo predelavo vsake od njih, zato gre obratno: vsaka razpredelnica
  // se ob priklopu PRIJAVI sem, ob odklopu pa se odjavi. Ikona zato vedno
  // ponuja natanko tisto, kar je ta hip na zaslonu — ob menjavi zavihka se
  // seznam sam posodobi.
  // ---------------------------------------------------------------------
  var registracije = [];
  var poslusalci = [];
  function objavi() {
    var kopija = registracije.slice();
    poslusalci.forEach(function (f) { f(kopija); });
  }

  // Nevidna komponenta: samo prijavi svoj vir. Props se berejo prek ref, da
  // se ob vsakem izrisu (kjer "pripravi" nastane na novo) ne bi ponovno
  // prijavljala in s tem sprožala neskončne posodobitve.
  function RazporedIzvozVir(props) {
    var ref = useRef(props);
    ref.current = props;
    useEffect(function () {
      var vnos = { ref: ref };
      registracije.push(vnos);
      objavi();
      return function () {
        var i = registracije.indexOf(vnos);
        if (i !== -1) registracije.splice(i, 1);
        objavi();
      };
    }, []);
    return null;
  }

  // Izvozna ikona za vrstico zgoraj desno — ponudi vse trenutno prijavljene
  // vire. Če ni prijavljen noben (stran nima česa izvoziti), se ne izriše.
  function RazporedOrodja() {
    var stanjeState = useState(registracije.slice());
    var vnosi = stanjeState[0], setVnosi = stanjeState[1];
    useEffect(function () {
      poslusalci.push(setVnosi);
      setVnosi(registracije.slice());
      return function () {
        var i = poslusalci.indexOf(setVnosi);
        if (i !== -1) poslusalci.splice(i, 1);
      };
    }, []);
    var viri = vnosi.map(function (v) { return v.ref.current; }).filter(Boolean);
    if (!viri.length) return null;
    return e(RazporedIzvoz, { compact: true, viri: viri });
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

    // "viri" (neobvezno, samo compact): več izvoznih virov pod eno ikono.
    // Nujno za strani, kjer je na zaslonu HKRATI več različnih razpredelnic
    // (Statistika ima tri, Generator štiri) — ena sama ikona brez izbire
    // vira bi tri od njih preprosto izgubila. Brez "viri" se komponenta
    // obnaša kot doslej, zato ostale strani ostanejo nespremenjene.
    var viri = props.viri && props.viri.length
      ? props.viri
      : [{ naziv: null, naslov: props.naslov, listi: props.listi, pripravi: props.pripravi,
           pdf: props.pdf, ical: props.ical }];

    function podatki(vir) {
      return vir.pripravi ? vir.pripravi() : vir.listi;
    }

    function izvoziExcel(vir) {
      setMsg(null);
      try {
        root.ExportUtils.izvoziXLSX(vir.naslov, podatki(vir));
        setOdprto(false);
      } catch (err) {
        setMsg({ ok: false, text: err.message || String(err) });
      }
    }

    async function izvoziSheets(vir) {
      setBusy("sheets"); setMsg(null);
      try {
        var url = await root.GSheetsExport.izvoziVSheets(vir.naslov, podatki(vir));
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
      viri.forEach(function (vir, i) {
        // Naslov skupine se izpiše samo, kadar je virov več — pri enem bi
        // bil odvečen šum.
        if (viri.length > 1) {
          postavke.push(e("p", { key: "n" + i, className: "dlMenuNaslov" }, vir.naziv || "Izvoz"));
        }
        if (vir.pdf) {
          postavke.push(e("button", {
            key: "pdf" + i, className: "dlMenuItem", type: "button",
            onClick: function () { setOdprto(false); vir.pdf.onClick(); },
          }, "📄 " + (vir.pdf.label || "Izvozi v PDF")));
        }
        postavke.push(e("button", {
          key: "xlsx" + i, className: "dlMenuItem", type: "button", disabled: !!busy,
          onClick: function () { izvoziExcel(vir); },
        }, "⬇ Izvozi v Excel"));
        postavke.push(e("button", {
          key: "sheets" + i, className: "dlMenuItem", type: "button", disabled: !!busy,
          onClick: function () { izvoziSheets(vir); },
        }, busy === "sheets" ? "Izvažam …" : "📗 Izvozi v Google Sheets"));
        if (vir.ical) {
          postavke.push(e("button", {
            key: "ical" + i, className: "dlMenuItem", type: "button",
            onClick: function () { setOdprto(false); vir.ical.onClick(); },
          }, "📅 " + (vir.ical.label || "Izvozi v koledar (.ics)")));
        }
      });

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
        e("button", { className: "dlBtn", type: "button", onClick: function () { izvoziExcel(viri[0]); }, disabled: !!busy }, "⬇ Izvozi v Excel"),
        e(
          "button",
          { className: "dlBtn", type: "button", onClick: function () { izvoziSheets(viri[0]); }, disabled: !!busy },
          busy === "sheets" ? "Izvažam …" : "📗 Izvozi v Google Sheets"
        )
      ),
      msg && e("p", { className: msg.ok ? "okMsg" : "err", style: { marginTop: 6 } }, msg.text)
    );
  }

  root.RazporedIzvoz = RazporedIzvoz;
  root.RazporedIzvozVir = RazporedIzvozVir;
  root.RazporedOrodja = RazporedOrodja;
})(typeof window !== "undefined" ? window : this);
