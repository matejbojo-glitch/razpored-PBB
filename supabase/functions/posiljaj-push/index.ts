// ---------------------------------------------------------------------
// Razpored PBB — Edge Function "posiljaj-push"
//
// Prebere še neposlana obvestila iz tabele notifications (push_sent_at is
// null) in jih odpošlje kot Web Push na vse naprave, ki jih je posamezni
// uporabnik registriral (push_subscriptions). Uspešno poslana obvestila
// označi s push_sent_at, mrtve naročnine (404/410 = uporabnik je odstranil
// aplikacijo ali počistil brskalnik) pa pobriše.
//
// NE pošilja neposredno iz sprožilca v bazi — glej razlago v
// supabase/schema.sql sekcija 27. Tabela notifications je edini vir
// resnice; ta funkcija je samo dostavljalec.
//
// Namestitev in ključi: glej PUSH-SETUP.md v korenu repozitorija.
// Zahtevane okoljske spremenljivke (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET
// SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY nastavi Supabase sam.
// ---------------------------------------------------------------------
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:razpored@pb-begunje.si";
const PUSH_CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Koliko obvestil največ obdelamo v enem klicu. Namenoma skromno: pg_cron
// kliče funkcijo pogosto, preostanek gre v naslednjem krogu (push_sent_at
// poskrbi, da se nič ne podvoji in nič ne izgubi).
const NAJVEC_NA_KLIC = 200;
// Starejših obvestil ne pošiljamo (npr. po daljšem izpadu) — potisno
// obvestilo o dogodku izpred tedna je bolj moteče kot koristno; v
// aplikaciji ga uporabnik še vedno vidi.
const NAJSTAREJSE_URE = 48;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  // Dovoljen je samo klic z znano skrivnostjo (pg_cron/ročni zagon) —
  // funkcija namreč teče s service_role pravicami.
  if (!PUSH_CRON_SECRET || req.headers.get("x-cron-secret") !== PUSH_CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ napaka: "Manjkata VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY." }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const mejaCasa = new Date(Date.now() - NAJSTAREJSE_URE * 3600 * 1000).toISOString();

  const { data: obvestila, error: napakaBranja } = await db
    .from("notifications")
    .select("id, user_id, message, title, url")
    .is("push_sent_at", null)
    .gte("created_at", mejaCasa)
    .order("created_at", { ascending: true })
    .limit(NAJVEC_NA_KLIC);

  if (napakaBranja) {
    return new Response(JSON.stringify({ napaka: napakaBranja.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
  if (!obvestila || obvestila.length === 0) {
    return new Response(JSON.stringify({ obdelanih: 0, poslanih: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Naročnine naenkrat za vse prejemnike v tem svežnju (ena poizvedba
  // namesto ene na obvestilo).
  const idjiPrejemnikov = [...new Set(obvestila.map((o) => o.user_id))];
  const { data: narocnine } = await db
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth")
    .in("profile_id", idjiPrejemnikov);

  const poOsebi = new Map<string, typeof narocnine>();
  for (const n of narocnine ?? []) {
    const seznam = poOsebi.get(n.profile_id) ?? [];
    seznam.push(n);
    poOsebi.set(n.profile_id, seznam);
  }

  let poslanih = 0;
  const mrtveNarocnine: number[] = [];
  const zivaNarocnine: number[] = [];

  for (const o of obvestila) {
    const seznam = poOsebi.get(o.user_id) ?? [];
    const vsebina = JSON.stringify({
      naslov: o.title ?? "Razpored PBB",
      telo: o.message,
      url: o.url ?? "index.html",
    });

    for (const n of seznam) {
      try {
        await webpush.sendNotification(
          { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
          vsebina,
        );
        poslanih++;
        zivaNarocnine.push(n.id);
      } catch (e) {
        const koda = (e as { statusCode?: number }).statusCode;
        // 404/410 = naročnina ne obstaja več (odstranjena aplikacija,
        // počiščen brskalnik). Vse drugo (omrežje, 429 …) pustimo pri
        // miru — naslednjič gre lahko skozi.
        if (koda === 404 || koda === 410) mrtveNarocnine.push(n.id);
        else console.error("Napaka pri pošiljanju:", koda, (e as Error).message);
      }
    }
  }

  // Obvestila označimo kot obdelana tudi, če oseba nima nobene naprave —
  // sicer bi jih vsak zagon znova poskušal poslati v prazno.
  await db.from("notifications").update({ push_sent_at: new Date().toISOString() })
    .in("id", obvestila.map((o) => o.id));

  if (mrtveNarocnine.length) {
    await db.from("push_subscriptions").delete().in("id", mrtveNarocnine);
  }
  if (zivaNarocnine.length) {
    await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() })
      .in("id", [...new Set(zivaNarocnine)]);
  }

  return new Response(
    JSON.stringify({
      obdelanih: obvestila.length,
      poslanih,
      odstranjenihNarocnin: mrtveNarocnine.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
