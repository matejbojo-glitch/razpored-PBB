// ---------------------------------------------------------------------
// Razpored PBB — Edge Function "admin-uporabnik"
//
// Admin v Imeniku (imenik.html) tu ustvari nov Auth račun (prijavo) za
// novo osebo, ali TRAJNO izbriše obstoječega. Obojemu je skupno, da
// potrebuje service_role ključ — brskalnik ga nikoli ne sme imeti
// neposredno, zato gre prek te funkcije (isti razlog kot posiljaj-push).
//
//   POST /functions/v1/admin-uporabnik
//   { action: "ustvari", full_name, email, role, department_code?, phone? }
//   { action: "izbrisi", profile_id }
//
// Klic iz aplikacije: client.functions.invoke("admin-uporabnik", { body }).
// supabase-js sam doda Authorization (žeton prijavljenega admina) in
// apikey glavo — ta funkcija samo preveri, da je klicatelj RES admin
// (sveže iz baze prek service_role odjemalca, ne zaupa ničemur, kar pride
// v telesu zahteve).
//
// "izbrisi" kliče auth.admin.deleteUser(), kar se prek "on delete cascade"
// (supabase/schema.sql) razširi na profiles in od tam naprej na
// schedule_entries, employee_wishes, contact_phones itd. Osebe, ki imajo
// menjave/obrazce (swap_requests.requester_id/target_id, obrazci.
// vlagatelj_id/sodelavec_id — NAMENOMA brez kaskade) izbris zavrne s
// tujim-ključnim napako. To je namerno varovalo, ne hrošč: Postgres izvede
// izbris v eni transakciji, zato ob taki napaki NIČ ni delno izbrisano.
// Za take osebe (prava zgodovina, ne novo dodan pomotoma) admin uporabi
// supabase/odstrani-zaposlene.sql, ki povezave najprej pravilno počisti/
// prenese v pravem vrstnem redu.
//
// Namestitev in preizkus: glej UPORABNIKI-SETUP.md v korenu repozitorija.
// Zahtevane okoljske spremenljivke nastavi Supabase sam:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Klic pride iz brskalnika, z drugega izvora (Netlify) kot ta funkcija
// (Supabase) — brez teh glav bi brskalnik zahtevo zavrnil, še preden bi
// prišla do kode spodaj (CORS predhodna OPTIONS zahteva).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function odgovor(telo: unknown, status = 200): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Isti vzorec kot skripte/uvoz-racunov.mjs (generirajZacasnoGeslo), samo z
// Web Crypto API namesto Node "crypto" — Deno nima Node modula "crypto"
// brez node: predpone, globalni "crypto" pa je na voljo povsod.
function nakljucnoGeslo(): string {
  const bajti = new Uint8Array(12);
  crypto.getRandomValues(bajti);
  return btoa(String.fromCharCode(...bajti)).replace(/[+/=]/g, "x");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return odgovor({ napaka: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return odgovor({ napaka: "Nisi prijavljen." }, 401);

  // anon-ključni odjemalec SAMO za preverjanje žetona — ne teče s
  // service_role pravicami, zato sam po sebi ne more ničesar spremeniti.
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: userErr } = await anon.auth.getUser(jwt);
  if (userErr || !user) return odgovor({ napaka: "Neveljavna seja — prijavi se znova." }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: klicatelj } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!klicatelj || klicatelj.role !== "admin") {
    return odgovor({ napaka: "Samo administrator lahko ureja uporabnike." }, 403);
  }

  let telo: Record<string, unknown>;
  try {
    telo = await req.json();
  } catch {
    return odgovor({ napaka: "Neveljaven JSON." }, 400);
  }

  if (telo.action === "ustvari") {
    const email = String(telo.email || "").trim().toLowerCase();
    const polnoIme = String(telo.full_name || "").trim();
    const vloga = ["user", "vodja", "admin"].includes(String(telo.role)) ? String(telo.role) : "user";
    const oddelek = telo.department_code ? String(telo.department_code) : null;
    const telefon = telo.phone ? String(telo.phone).trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return odgovor({ napaka: "Vnesi veljaven e-poštni naslov." }, 400);
    }
    if (!polnoIme) return odgovor({ napaka: "Vnesi ime in priimek." }, 400);

    const geslo = nakljucnoGeslo();
    const { data: ustvarjen, error: ustvariErr } = await svc.auth.admin.createUser({
      email,
      password: geslo,
      email_confirm: true,
      // must_change_password prisili spremembo gesla ob prvi prijavi
      // (requireAuth() v supabase-client.js) — enak vzorec kot
      // skripte/uvoz-racunov.mjs --test.
      user_metadata: { full_name: polnoIme, must_change_password: true },
    });
    if (ustvariErr) {
      const sporocilo = /already|obstaja|registered/i.test(ustvariErr.message || "")
        ? "Ta e-poštni naslov je že v uporabi."
        : (ustvariErr.message || "Ustvarjanje računa ni uspelo.");
      return odgovor({ napaka: sporocilo }, 400);
    }

    const noviId = ustvarjen.user.id;
    // handle_new_user() (schema.sql) je ob zgornjem vstavljanju v auth.users
    // že ustvaril vrstico v profiles (role='user', full_name/email iz
    // metapodatkov) — tu jo samo dopolnimo z vlogo/oddelkom, ki ju je admin
    // izbral v obrazcu.
    const { error: posodobiErr } = await svc.from("profiles")
      .update({ role: vloga, department_code: oddelek })
      .eq("id", noviId);
    if (posodobiErr) return odgovor({ napaka: posodobiErr.message }, 500);

    if (telefon) {
      await svc.from("contact_phones")
        .upsert({ profile_id: noviId, phone: telefon, updated_at: new Date().toISOString() });
    }

    return odgovor({ profile_id: noviId, email, geslo });
  }

  if (telo.action === "izbrisi") {
    const profileId = String(telo.profile_id || "");
    if (!profileId) return odgovor({ napaka: "Manjka profile_id." }, 400);
    if (profileId === user.id) return odgovor({ napaka: "Ne moreš izbrisati samega sebe." }, 400);

    const { error: izbrisErr } = await svc.auth.admin.deleteUser(profileId);
    if (izbrisErr) {
      const tujiKljuc = /foreign key|violates|constraint/i.test(izbrisErr.message || "");
      const sporocilo = tujiKljuc
        ? "Te osebe ni mogoče izbrisati tu, ker ima zgodovino (menjave/obrazci/vnose razporeda drugih), ki ni samodejno povezana. Uporabi supabase/odstrani-zaposlene.sql v Supabase SQL Editorju za trajen izbris v pravem vrstnem redu."
        : (izbrisErr.message || "Izbris ni uspel.");
      return odgovor({ napaka: sporocilo }, 400);
    }
    return odgovor({ ok: true });
  }

  return odgovor({ napaka: "Neznano dejanje." }, 400);
});
