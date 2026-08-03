/* Razpored PBB — supabase-client.js
 * Init Supabase odjemalca + skupni auth/vloge helperji za vse strani.
 * Nima builda: nalaga se kot navaden <script>, po supabase-js.min.js.
 */
(function (root) {
  "use strict";

  // POZOR: standardna domena Supabase projektov je "*.supabase.co" (ne .com).
  // Preveri v Supabase Dashboard → Settings → API → "Project URL", da se ujema.
  var SUPABASE_URL = "https://jlvorlzvbaugjfjaodwz.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_GU8rw9mBLWFFPkjLZzbyhA_KT2lq39O";

  var client = root.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var ROLE_LABEL = { admin: "Administrator", vodja: "Vodja ekipe", user: "Zaposleni" };

  async function getSessionAndProfile() {
    var { data: { session } } = await client.auth.getSession();
    if (!session) return { session: null, profile: null };
    var { data: profile, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (error) return { session: session, profile: null };
    return { session: session, profile: profile };
  }

  // Preusmeri na login.html, če uporabnik ni prijavljen. Vrne { session, profile }.
  async function requireAuth() {
    var { session, profile } = await getSessionAndProfile();
    if (!session) {
      var next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
      location.replace("login.html?next=" + next);
      return null;
    }
    return { session: session, profile: profile };
  }

  // Kot requireAuth, a dodatno zahteva eno od dovoljenih vlog; sicer prikaže napako.
  async function requireRole(allowedRoles) {
    var res = await requireAuth();
    if (!res) return null;
    if (!res.profile || allowedRoles.indexOf(res.profile.role) === -1) {
      document.body.innerHTML =
        '<div style="max-width:480px;margin:80px auto;padding:20px;font-family:sans-serif;color:#F1F0EA;background:#12192B;border-radius:16px;text-align:center;">' +
        "<p><b>Nimaš dostopa do te strani.</b></p>" +
        "<p style=\"color:#8B93A8;font-size:13px;\">Ta stran zahteva vlogo: " +
        allowedRoles.map(function (r) { return ROLE_LABEL[r] || r; }).join(" ali ") +
        ".</p><p><a href=\"index.html\" style=\"color:#E8A33D;\">‹ Nazaj na pregled razporeda</a></p></div>";
      return null;
    }
    return res;
  }

  async function signOut() {
    await client.auth.signOut();
    location.replace("login.html");
  }

  async function unreadNotificationCount(userId) {
    var { count } = await client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    return count || 0;
  }

  root.RazporedAuth = {
    client: client,
    ROLE_LABEL: ROLE_LABEL,
    getSessionAndProfile: getSessionAndProfile,
    requireAuth: requireAuth,
    requireRole: requireRole,
    signOut: signOut,
    unreadNotificationCount: unreadNotificationCount,
  };
})(typeof window !== "undefined" ? window : this);
