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

  // ------------------------------------------------------------------
  // "Prijavi se kot" (ogled kot izbran uporabnik) — SAMO za administratorje.
  // To NI prava zamenjava Supabase seje (za to bi potreboval service_role
  // ključ na strežniku, ki ga to brez-strežniško postavljanje varno nima) —
  // prava avtentikacija ostane administratorjeva, samo profil/"jaz" se
  // med ogledom lokalno preslika na ciljno osebo, zato vsaka stran (ki
  // kliče requireAuth/requireRole) samodejno prikaže pogled/vloge/pravice
  // te osebe. Stanje živi v sessionStorage (izbriše se ob zaprtju zavihka),
  // vsak začetek/konec pa se zabeleži v admin_view_as_log.
  // ------------------------------------------------------------------
  var OGLED_KLJUC = "razpored-view-as";

  function trenutniOgled() {
    try {
      var raw = sessionStorage.getItem(OGLED_KLJUC);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function getSessionAndProfile() {
    var { data: { session } } = await client.auth.getSession();
    if (!session) return { session: null, profile: null };
    var { data: profile, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (error) return { session: session, profile: null };

    var ogled = trenutniOgled();
    if (ogled && profile && profile.role === "admin" && ogled.targetId !== profile.id) {
      var { data: ciljniProfil } = await client.from("profiles").select("*").eq("id", ogled.targetId).single();
      if (ciljniProfil) {
        return {
          session: { ...session, user: { ...session.user, id: ciljniProfil.id, email: ciljniProfil.email } },
          profile: ciljniProfil,
          pravaOseba: profile,
          ogled: true,
        };
      }
    }
    return { session: session, profile: profile, ogled: false };
  }

  // target: { id, full_name, email }. Klicatelj mora biti admin — preveri
  // se tu (sveži profil iz baze), ne samo v UI, ker gre za varnostno
  // občutljivo funkcijo.
  async function zacniOgled(target) {
    var { data: { user } } = await client.auth.getUser();
    if (!user) return { error: "Nisi prijavljen." };
    var { data: mojProfil } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (!mojProfil || mojProfil.role !== "admin") return { error: "Samo administrator lahko uporabi ogled kot uporabnik." };
    if (target.id === user.id) return { error: "Ne moreš gledati kot sam sebe." };
    // client.auth.getUser() zgoraj vedno vrne PRAVEGA prijavljenega admina
    // (ogled je samo client-side preslikava, ne spremeni prave seje), zato je
    // varno klicati to funkcijo tudi neposredno iz ogleda ene osebe na drugo,
    // brez vmesnega "Prekini ogled". Če je ogled že aktiven, najprej pravilno
    // zaključi PREJŠNJI zapis v reviziji (sicer bi ta ostal videti neskončen).
    var prejsnji = trenutniOgled();
    if (prejsnji && prejsnji.logId) {
      try {
        await client.from("admin_view_as_log").update({ ended_at: new Date().toISOString() }).eq("id", prejsnji.logId);
      } catch (e) { /* ni usodno — nov ogled se vseeno zabeleži spodaj */ }
    }
    var { data: vrstica, error } = await client
      .from("admin_view_as_log")
      .insert({
        admin_id: user.id, admin_email: user.email,
        target_profile_id: target.id, target_full_name: target.full_name, target_email: target.email,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    sessionStorage.setItem(OGLED_KLJUC, JSON.stringify({ targetId: target.id, logId: vrstica.id }));
    return { error: null };
  }

  async function koncajOgled() {
    var ogled = trenutniOgled();
    sessionStorage.removeItem(OGLED_KLJUC);
    if (ogled && ogled.logId) {
      try {
        await client.from("admin_view_as_log").update({ ended_at: new Date().toISOString() }).eq("id", ogled.logId);
      } catch (e) { /* ni usodno — sessionStorage je vseeno počiščen */ }
    }
    location.href = "index.html";
  }

  // Preusmeri na login.html, če uporabnik ni prijavljen. Vrne { session, profile }.
  async function requireAuth() {
    var { session, profile } = await getSessionAndProfile();
    if (!session) {
      var next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
      location.replace("login.html?next=" + next);
      return null;
    }
    // Računi, ustvarjeni prek skripte/uvoz-racunov.mjs --test, dobijo znano
    // (fiksno ali naključno, a adminu vidno) začetno geslo — must_change_password
    // v user_metadata prisili spremembo na reset-geslo.html, preden lahko
    // oseba uporablja karkoli drugega. Zastavica se počisti tam ob uspešni
    // spremembi gesla (client.auth.updateUser z data.must_change_password:false).
    var trenutna = (location.pathname.split("/").pop() || "").toLowerCase();
    if (session.user.user_metadata && session.user.user_metadata.must_change_password && trenutna !== "reset-geslo.html") {
      location.replace("reset-geslo.html");
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
        '<div style="max-width:480px;margin:80px auto;padding:20px;font-family:sans-serif;color:#2B2712;background:#FFFFFF;border:1px solid #E1D9C2;border-radius:16px;text-align:center;">' +
        "<p><b>Nimaš dostopa do te strani.</b></p>" +
        "<p style=\"color:#8A7F5E;font-size:13px;\">Ta stran zahteva vlogo: " +
        allowedRoles.map(function (r) { return ROLE_LABEL[r] || r; }).join(" ali ") +
        ".</p><p><a href=\"index.html\" style=\"color:#6E5F2A;\">‹ Nazaj na pregled razporeda</a></p></div>";
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
    // Potreben za sestavo naslova robnih funkcij (npr. koledarska naročnina
    // v nastavitve.html); anon ključ tam ni potreben, ker se ta funkcija
    // avtorizira z lastnim žetonom v naslovu.
    SUPABASE_URL: SUPABASE_URL,
    ROLE_LABEL: ROLE_LABEL,
    getSessionAndProfile: getSessionAndProfile,
    requireAuth: requireAuth,
    requireRole: requireRole,
    signOut: signOut,
    unreadNotificationCount: unreadNotificationCount,
    trenutniOgled: trenutniOgled,
    zacniOgled: zacniOgled,
    koncajOgled: koncajOgled,
  };
})(typeof window !== "undefined" ? window : this);
