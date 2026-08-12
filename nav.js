/* Razpored PBB — nav.js
 * Skupna spodnja navigacijska vrstica (mobilna + spletna različica).
 * Brez JSX (navaden React.createElement), da se naloži kot <script>
 * pred babel skriptami vsake strani — ni potrebe po podvajanju v vsaki.
 */
(function (root) {
  "use strict";
  var e = root.React.createElement;
  var useState = root.React.useState;
  var useEffect = root.React.useEffect;
  var useRef = root.React.useRef;

  // Širina zaslona, od katere naprej štejemo za "spletno/namizno različico"
  // (nav na vrhu namesto na dnu) — tablica/telefon ostaneta na spodnji
  // vrstici, ker je ta tam lažje dosegljiva s palcem.
  var DESKTOP_BP = 900;
  // Fiksna višina zgornje navigacijske vrstice na namizju (mora se ujemati
  // s "height" spodaj v CSS-ju) — RazporedOgledTrak jo uporabi za izračun
  // skupnega odmika telesa strani, ko je hkrati prikazan tudi opozorilni
  // trak "ogled kot uporabnik".
  var NAV_DESKTOP_H = 64;

  var STYLE_ID = "razpored-nav-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "body{ padding-bottom: calc(66px + env(safe-area-inset-bottom)) !important; }" +
      ".rpNav{ position:fixed; left:0; right:0; bottom:0; z-index:40;" +
      " background: rgba(255,255,255,0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" +
      " border-top:1px solid #E1D9C2; padding-bottom: env(safe-area-inset-bottom); }" +
      ".rpNav .inner{ max-width:640px; margin:0 auto; display:flex; }" +
      ".rpNav a{ flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;" +
      " padding:9px 4px 8px; background:none; border:0; color:#8A7F5E; text-decoration:none; font-family:inherit;" +
      " cursor:pointer; font-size:10.5px; font-weight:700; position:relative; min-width:0; min-height:44px;" +
      " justify-content:center; }" +
      ".rpNav a.active{ color:#6E5F2A; }" +
      ".rpNav .ic{ font-size:19px; line-height:1; }" +
      ".rpNav .lbl{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }" +
      ".rpNav .badge{ position:absolute; top:2px; right:calc(50% - 20px); min-width:15px; height:15px; padding:0 3px;" +
      " border-radius:999px; background:#B3402A; color:#fff; font-size:9.5px; font-weight:800; line-height:15px; text-align:center; }" +
      ".rpNav .badge.warn{ background:#A79448; color:#2B2712; }" +
      "@media (min-width:700px){ .rpNav .inner{ max-width:760px; } }" +
      // Spletna/namizna različica (≥900px): vrstica se preseli na vrh
      // zaslona (nad vsebino, pod morebitnim opozorilnim trakom "ogled kot
      // uporabnik" — glej --ogled-h spremenljivko, ki jo nastavi
      // RazporedOgledTrak), postavke so v vrsti (ikona+napis vodoravno),
      // ne druga pod drugo kot na mobilnem zaslonu.
      "@media (min-width:" + DESKTOP_BP + "px){" +
      "  body{ padding-bottom:0 !important; padding-top:" + NAV_DESKTOP_H + "px; }" +
      "  .rpNav{ top:var(--ogled-h,0px); bottom:auto; height:" + NAV_DESKTOP_H + "px;" +
      "    border-top:0; border-bottom:1px solid #E1D9C2; padding-bottom:0; display:flex; align-items:center; }" +
      "  .rpNav .inner{ max-width:1040px; padding:0 24px; height:100%; align-items:center; justify-content:center; gap:6px; }" +
      "  .rpNav a{ flex:0 0 auto; flex-direction:row; gap:7px; padding:9px 16px; font-size:13.5px;" +
      "    min-height:auto; border-radius:999px; }" +
      "  .rpNav a:hover{ background:#F2EEDF; }" +
      "  .rpNav a.active{ background:#F2EEDF; }" +
      "  .rpNav .ic{ font-size:16px; }" +
      "  .rpNav .lbl{ max-width:none; }" +
      "  .rpNav .badge{ position:static; margin-left:1px; }" +
      "}" +
      "@media print{ .rpNav{ display:none !important; } body{ padding-bottom:0 !important; padding-top:0 !important; } }" +
      ".rpTopIcons{ position:fixed; top:calc(env(safe-area-inset-top) + 10px); right:14px; z-index:41;" +
      " display:flex; align-items:center; gap:8px; }" +
      "@media (min-width:" + DESKTOP_BP + "px){ .rpTopIcons{ top:calc(var(--ogled-h,0px) + 12px); } }" +
      ".rpIconBtn{ width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;" +
      " background:rgba(255,255,255,0.96); border:1px solid #E1D9C2; color:#6E5F2A; font-size:17px; line-height:1;" +
      " text-decoration:none; cursor:pointer; padding:0; box-shadow:0 2px 8px rgba(43,39,18,0.10);" +
      " transition:transform .15s ease, box-shadow .15s ease, background-color .15s ease, color .15s ease; }" +
      ".rpIconBtn:hover{ background:#F2EEDF; box-shadow:0 4px 12px rgba(43,39,18,0.16); transform:translateY(-1px); }" +
      ".rpIconBtn:active{ transform:translateY(0) scale(.94); box-shadow:0 1px 4px rgba(43,39,18,0.12); }" +
      ".rpIconBtn.logout:hover{ background:#FBEAE6; color:#B3402A; border-color:#F0C9BE; }" +
      ".rpIconBtn.settings.active{ background:#F2EEDF; color:#2B2712; border-color:#A79448; }" +
      // Izvozni gumb (export-buttons.js, "compact") je lahko postavljen v to
      // vrstico prek "pred" — ima svojo obliko, zato tu dobi enak videz kot
      // sosedi, sicer bi izstopal z drugim ozadjem in brez sence.
      ".rpTopIcons .dlIconBtn{ background:rgba(255,255,255,0.96); border-color:#E1D9C2; color:#6E5F2A;" +
      " box-shadow:0 2px 8px rgba(43,39,18,0.10); }" +
      ".rpTopIcons .dlIconBtn:hover{ background:#F2EEDF; }" +
      "@media print{ .rpTopIcons{ display:none !important; } }" +
      ".rpOgledTrak{ position:fixed; top:0; left:0; right:0; z-index:100; background:#B3402A; color:#fff;" +
      " display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap;" +
      " padding: calc(env(safe-area-inset-top) + 8px) 14px 8px; font-size:12.5px; font-weight:700; text-align:center; }" +
      ".rpOgledExit{ background:#fff; color:#B3402A; border:0; border-radius:999px; padding:6px 14px;" +
      " font-weight:800; font-size:12px; cursor:pointer; white-space:nowrap; }" +
      "@media print{ .rpOgledTrak{ display:none !important; } }";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  var ITEMS = [
    { key: "index", href: "index.html", ic: "🏠", lbl: "Razpored", roles: ["admin", "vodja", "user"] },
    { key: "menjava", href: "obrazec.html", ic: "🔁", lbl: "Menjava", roles: ["admin", "vodja", "user"], badge: "menjava" },
    { key: "imenik", href: "imenik.html", ic: "📇", lbl: "Imenik", roles: ["admin", "vodja", "user"] },
    { key: "admin", href: "admin.html", ic: "🗓️", lbl: "Generator", roles: ["admin", "vodja"] },
    { key: "dashboard", href: "dashboard.html", ic: "📊", lbl: "Statistika", roles: ["admin", "vodja"] },
    { key: "zelje", href: "zelje.html", ic: "💬", lbl: "Želje", roles: ["admin", "vodja", "user"] },
  ];

  // props: active (ključ trenutne strani), role ("admin"|"vodja"|"user"), unread (število za značko na Menjava)
  function RazporedNav(props) {
    ensureStyle();
    var active = props.active;
    var role = props.role || "user";
    var unread = props.unread || 0;

    // Rumen klicaj na "Menjava": obrazci_moja_naloga je že RLS-filtriran na
    // trenutnega uporabnika (glej supabase/schema.sql, security_invoker) in
    // pokrije vse vrste odločitev (sodelavec/vodja/koordinator, tudi
    // dežurstvo-koordinator), zato ni treba ločevati po vlogi.
    var menjavaPendingState = useState(0);
    var menjavaPending = menjavaPendingState[0], setMenjavaPending = menjavaPendingState[1];
    useEffect(function () {
      var auth = root.RazporedAuth;
      if (!auth || !auth.client) return;
      auth.client.from("obrazci_moja_naloga").select("id", { count: "exact", head: true }).not("moje_dejanje", "is", null)
        .then(function (res) { setMenjavaPending(res.count || 0); })
        .catch(function () {});
    }, [role]);

    var items = ITEMS.filter(function (it) { return it.roles.indexOf(role) !== -1; });

    return e(
      "nav",
      { className: "rpNav" },
      e(
        "div",
        { className: "inner" },
        items.map(function (it) {
          var badge = null;
          if (it.badge === "menjava") {
            if (menjavaPending > 0) {
              badge = e("span", { className: "badge warn", key: "b", title: "Čaka tvojo odločitev" }, "!");
            } else if (unread > 0) {
              badge = e("span", { className: "badge", key: "b" }, unread > 9 ? "9+" : String(unread));
            }
          }
          return e(
            "a",
            { key: it.key, href: it.href, className: it.key === active ? "active" : "" },
            e("span", { className: "ic" }, it.ic),
            badge,
            e("span", { className: "lbl" }, it.lbl)
          );
        })
      )
    );
  }

  // Par okroglih ikon, fiksiranih v zgornjem desnem kotu na vseh straneh:
  // nastavitve (⚙️, link na nastavitve.html) in odjava (🚪). Ohranjeno ime
  // "RazporedLogout" (klicano na vseh straneh) — zdaj izriše oba gumba
  // skupaj, da ni treba spreminjati vsake strani posebej.
  //
  // props.pred (neobvezno): dodatna ikona, ki jo posamezna stran postavi
  // PRED nastavitve — npr. uvoz na Razporedu. Namenoma prek propa in ne
  // trdo zapisano sem: ikona je smiselna samo na eni strani in samo za
  // administratorja, ta funkcija pa teče na vseh straneh za vse vloge.
  function RazporedLogout(props) {
    ensureStyle();
    var trenutna = (location.pathname.split("/").pop() || "").toLowerCase();
    var naNastavitvah = trenutna === "nastavitve.html";
    return e(
      "div",
      { className: "rpTopIcons" },
      (props && props.pred) || null,
      e(
        "a",
        {
          className: "rpIconBtn settings" + (naNastavitvah ? " active" : ""),
          href: "nastavitve.html",
          title: "Nastavitve",
          "aria-label": "Nastavitve",
        },
        "⚙️"
      ),
      e(
        "button",
        {
          className: "rpIconBtn logout",
          title: "Odjava",
          "aria-label": "Odjava",
          onClick: function () { if (root.RazporedAuth) root.RazporedAuth.signOut(); },
        },
        "🚪"
      )
    );
  }

  // Opozorilni trak, ko administrator gleda aplikacijo "kot" izbran
  // uporabnik (glej RazporedAuth.zacniOgled/koncajOgled v supabase-client.js).
  // Fiksiran na vrhu, zato JS sam izmeri svojo višino in ustrezno prestavi
  // ostalo vsebino navzdol (besedilo se lahko prelomi v 2 vrstici pri
  // dolgih imenih/majhnih zaslonih, zato višina ni fiksna vrednost).
  // props: aktivno (bool), profil (ciljni profil: full_name, department_code)
  function RazporedOgledTrak(props) {
    var ref = useRef(null);
    var aktivno = !!props.aktivno;
    useEffect(function () {
      if (!aktivno) {
        document.body.style.paddingTop = "";
        document.documentElement.style.removeProperty("--ogled-h");
        return;
      }
      ensureStyle();
      // Na namizju (≥900px) je nav vrstica ZDAJ TUDI na vrhu (glej
      // DESKTOP_BP zgoraj), zato mora skupni odmik telesa strani vsebovati
      // višino traku IN nav vrstice, ne samo traku kot na mobilnem zaslonu
      // (kjer je nav na dnu). --ogled-h sporoči nav vrstici, za koliko naj
      // se sama premakne navzdol, da ne prekrije traku.
      function posodobi() {
        if (!ref.current) return;
        var h = ref.current.offsetHeight;
        document.documentElement.style.setProperty("--ogled-h", h + "px");
        var namizje = window.matchMedia("(min-width:" + DESKTOP_BP + "px)").matches;
        document.body.style.paddingTop = (namizje ? h + NAV_DESKTOP_H : h) + "px";
      }
      posodobi();
      window.addEventListener("resize", posodobi);
      return function () {
        window.removeEventListener("resize", posodobi);
        document.body.style.paddingTop = "";
        document.documentElement.style.removeProperty("--ogled-h");
      };
    }, [aktivno, props.profil && props.profil.full_name]);

    if (!aktivno) return null;
    var profil = props.profil || {};
    return e(
      "div",
      { className: "rpOgledTrak no-print", ref: ref },
      e(
        "span",
        null,
        "⚠️ Pogled aplikacije kot uporabnik: " + (profil.full_name || "?") +
          (profil.department_code ? " (" + profil.department_code + ")" : "")
      ),
      e(
        "button",
        {
          className: "rpOgledExit",
          onClick: function () { if (root.RazporedAuth) root.RazporedAuth.koncajOgled(); },
        },
        "Prekini ogled / Nazaj v Admin"
      )
    );
  }

  root.RazporedNav = RazporedNav;
  root.RazporedLogout = RazporedLogout;
  root.RazporedOgledTrak = RazporedOgledTrak;
})(typeof window !== "undefined" ? window : this);
