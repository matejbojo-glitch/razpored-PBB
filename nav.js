/* Razpored PBB — nav.js
 * Skupna spodnja navigacijska vrstica (mobilna + spletna različica).
 * Brez JSX (navaden React.createElement), da se naloži kot <script>
 * pred babel skriptami vsake strani — ni potrebe po podvajanju v vsaki.
 */
(function (root) {
  "use strict";
  var e = root.React.createElement;

  var STYLE_ID = "razpored-nav-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "body{ padding-bottom: calc(66px + env(safe-area-inset-bottom)) !important; }" +
      ".rpNav{ position:fixed; left:0; right:0; bottom:0; z-index:40;" +
      " background: rgba(19,25,43,0.92); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" +
      " border-top:1px solid #2B375C; padding-bottom: env(safe-area-inset-bottom); }" +
      ".rpNav .inner{ max-width:640px; margin:0 auto; display:flex; }" +
      ".rpNav a{ flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;" +
      " padding:9px 4px 8px; background:none; border:0; color:#8B93A8; text-decoration:none; font-family:inherit;" +
      " cursor:pointer; font-size:10.5px; font-weight:700; position:relative; min-width:0; min-height:44px;" +
      " justify-content:center; }" +
      ".rpNav a.active{ color:#E8A33D; }" +
      ".rpNav .ic{ font-size:19px; line-height:1; }" +
      ".rpNav .lbl{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }" +
      ".rpNav .badge{ position:absolute; top:2px; right:calc(50% - 20px); min-width:15px; height:15px; padding:0 3px;" +
      " border-radius:999px; background:#D97757; color:#fff; font-size:9.5px; font-weight:800; line-height:15px; text-align:center; }" +
      "@media (min-width:700px){ .rpNav .inner{ max-width:760px; } }";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  var ITEMS = [
    { key: "index", href: "index.html", ic: "🏠", lbl: "Razpored", roles: ["admin", "vodja", "user"] },
    { key: "menjave", href: "menjave.html", ic: "🔁", lbl: "Menjave", roles: ["admin", "vodja", "user"], badge: true },
    { key: "admin", href: "admin.html", ic: "🗓️", lbl: "Generator", roles: ["admin", "vodja"] },
    { key: "dashboard", href: "dashboard.html", ic: "📊", lbl: "Pravičnost", roles: ["admin", "vodja"] },
    { key: "zelje", href: "zelje.html", ic: "💬", lbl: "Želje", roles: ["admin", "vodja"] },
  ];

  // props: active (ključ trenutne strani), role ("admin"|"vodja"|"user"), unread (število za značko na Menjave)
  function RazporedNav(props) {
    ensureStyle();
    var active = props.active;
    var role = props.role || "user";
    var unread = props.unread || 0;
    var items = ITEMS.filter(function (it) { return it.roles.indexOf(role) !== -1; });

    return e(
      "nav",
      { className: "rpNav" },
      e(
        "div",
        { className: "inner" },
        items.map(function (it) {
          var badge = it.badge && unread > 0
            ? e("span", { className: "badge", key: "b" }, unread > 9 ? "9+" : String(unread))
            : null;
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

  root.RazporedNav = RazporedNav;
})(typeof window !== "undefined" ? window : this);
