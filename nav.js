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
      "@media print{ .rpNav{ display:none !important; } body{ padding-bottom:0 !important; } }" +
      ".rpTopIcons{ position:fixed; top:calc(env(safe-area-inset-top) + 10px); right:14px; z-index:41;" +
      " display:flex; align-items:center; gap:8px; }" +
      ".rpIconBtn{ width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;" +
      " background:rgba(255,255,255,0.96); border:1px solid #E1D9C2; color:#6E5F2A; font-size:17px; line-height:1;" +
      " text-decoration:none; cursor:pointer; padding:0; box-shadow:0 2px 8px rgba(43,39,18,0.10);" +
      " transition:transform .15s ease, box-shadow .15s ease, background-color .15s ease, color .15s ease; }" +
      ".rpIconBtn:hover{ background:#F2EEDF; box-shadow:0 4px 12px rgba(43,39,18,0.16); transform:translateY(-1px); }" +
      ".rpIconBtn:active{ transform:translateY(0) scale(.94); box-shadow:0 1px 4px rgba(43,39,18,0.12); }" +
      ".rpIconBtn.logout:hover{ background:#FBEAE6; color:#B3402A; border-color:#F0C9BE; }" +
      ".rpIconBtn.settings.active{ background:#F2EEDF; color:#2B2712; border-color:#A79448; }" +
      "@media print{ .rpTopIcons{ display:none !important; } }";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  var ITEMS = [
    { key: "index", href: "index.html", ic: "🏠", lbl: "Razpored", roles: ["admin", "vodja", "user"] },
    { key: "menjave", href: "menjave.html", ic: "🔁", lbl: "Menjave", roles: ["admin", "vodja", "user"], badge: true },
    { key: "imenik", href: "imenik.html", ic: "📇", lbl: "Imenik", roles: ["admin", "vodja", "user"] },
    { key: "admin", href: "admin.html", ic: "🗓️", lbl: "Generator", roles: ["admin", "vodja"] },
    { key: "dashboard", href: "dashboard.html", ic: "📊", lbl: "Pravičnost", roles: ["admin", "vodja"] },
    { key: "zelje", href: "zelje.html", ic: "💬", lbl: "Želje", roles: ["admin", "vodja", "user"] },
  ];

  // props: active (ključ trenutne strani), role ("admin"|"vodja"|"user"), unread (število za značko na Menjave)
  function RazporedNav(props) {
    ensureStyle();
    var active = props.active;
    var role = props.role || "user";
    var unread = props.unread || 0;

    // Rumen klicaj na "Menjave": admin/vodja ima predlog menjave, ki čaka
    // NJIHOVO odločitev (pending_admin / pending_lead) — bolj nujno kot
    // navadno obvestilo, zato prevlada nad rdečo številko.
    var pendingState = useState(0);
    var pending = pendingState[0], setPending = pendingState[1];
    useEffect(function () {
      if (role !== "admin" && role !== "vodja") return;
      var auth = root.RazporedAuth;
      if (!auth || !auth.client) return;
      var status = role === "admin" ? "pending_admin" : "pending_lead";
      auth.client.from("swap_requests").select("id", { count: "exact", head: true }).eq("status", status)
        .then(function (res) { setPending(res.count || 0); })
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
          if (it.badge) {
            if (pending > 0) {
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
  function RazporedLogout() {
    ensureStyle();
    var trenutna = (location.pathname.split("/").pop() || "").toLowerCase();
    var naNastavitvah = trenutna === "nastavitve.html";
    return e(
      "div",
      { className: "rpTopIcons" },
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

  root.RazporedNav = RazporedNav;
  root.RazporedLogout = RazporedLogout;
})(typeof window !== "undefined" ? window : this);
