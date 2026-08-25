// ---------------------------------------------------------------------
// Razpored PBB – Edge Function "posiljaj-push"
//
// Prebere še neposlana obvestila iz tabele obvestila (push_sent_at is
// null) in jih odpošlje kot Web Push na vse naprave, ki jih je posamezni
// uporabnik registriral (potisne_narocnine). Uspešno poslana obvestila
// označi s push_sent_at, mrtve naročnine (404/410 = uporabnik je odstranil
// aplikacijo ali počistil brskalnik) pa pobriše.
//
// NE pošilja neposredno iz sprožilca v bazi – glej razlago v
// supabase/schema.sql sekcija 27. Tabela obvestila je edini vir
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

// E-pošta je NEOBVEZNA: dokler RESEND_API_KEY ni nastavljen, se e-pošta
// preprosto ne pošilja, potisna obvestila pa delujejo naprej. Tako je
// mogoče ponudnika dodati pozneje brez spreminjanja kode.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Razpored PBB <razpored@pb-begunje.si>";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://razpored.netlify.app").replace(/\/$/, "");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Koliko obvestil največ obdelamo v enem klicu. Namenoma skromno: pg_cron
// kliče funkcijo pogosto, preostanek gre v naslednjem krogu (push_sent_at
// poskrbi, da se nič ne podvoji in nič ne izgubi).
const NAJVEC_NA_KLIC = 200;
// Starejših obvestil ne pošiljamo (npr. po daljšem izpadu) – potisno
// obvestilo o dogodku izpred tedna je bolj moteče kot koristno; v
// aplikaciji ga uporabnik še vedno vidi.
const NAJSTAREJSE_URE = 48;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  // Dovoljen je samo klic z znano skrivnostjo (pg_cron/ročni zagon) –
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

  // Vzamemo obvestila, ki jim manjka VSAJ EDEN od kanalov. Push in e-pošta
  // se označujeta ločeno (push_sent_at / email_sent_at), zato lahko eno
  // uspe in drugo ostane za naslednji krog, ne da bi se karkoli podvojilo.
  const { data: obvestila, error: napakaBranja } = await db
    .from("obvestila")
    .select("id, user_id, message, title, url, push_sent_at, email_sent_at")
    .or("push_sent_at.is.null,email_sent_at.is.null")
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
    .from("potisne_narocnine")
    .select("id, profile_id, endpoint, p256dh, auth")
    .in("profile_id", idjiPrejemnikov);

  const poOsebi = new Map<string, typeof narocnine>();
  for (const n of narocnine ?? []) {
    const seznam = poOsebi.get(n.profile_id) ?? [];
    seznam.push(n);
    poOsebi.set(n.profile_id, seznam);
  }

  // Kanali po osebi (sekcija 30). Kdor nastavitve ni odprl, ima oboje
  // vklopljeno – brez tega bi molk pomenil, da ne izve ničesar.
  const { data: prejemniki } = await db.rpc("prejemniki_obvestil", { p_ids: idjiPrejemnikov });
  const nastavitve = new Map<string, { email: string | null; email_enabled: boolean; push_enabled: boolean }>();
  for (const p of prejemniki ?? []) {
    nastavitve.set(p.profile_id, {
      email: p.email,
      email_enabled: p.email_enabled,
      push_enabled: p.push_enabled,
    });
  }

  let poslanih = 0;
  let poslanihEpost = 0;
  const mrtveNarocnine: number[] = [];
  const zivaNarocnine: number[] = [];
  const epostaOpravljeno: number[] = [];
  const pushOpravljeno: number[] = [];

  for (const o of obvestila) {
    const kanali = nastavitve.get(o.user_id) ?? { email: null, email_enabled: true, push_enabled: true };

    // --- e-pošta ---
    if (o.email_sent_at === null) {
      if (!kanali.email_enabled || !kanali.email || !RESEND_API_KEY) {
        // Izklopljen kanal, manjkajoč naslov ali nenastavljen ponudnik:
        // označimo kot opravljeno, sicer bi obvestilo v vsakem krogu znova
        // poskušalo in vrsta se ne bi nikoli spraznila.
        epostaOpravljeno.push(o.id);
      } else {
        try {
          const odgovor = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [kanali.email],
              subject: o.title ?? "Razpored PBB",
              text: `${o.message}\n\n${APP_URL}/${o.url ?? "index.html"}\n\n` +
                `– Razpored PBB, Psihiatrična bolnišnica Begunje\n` +
                `Obveščanje po e-pošti lahko izklopiš v Nastavitvah.`,
            }),
          });
          if (odgovor.ok) {
            poslanihEpost++;
            epostaOpravljeno.push(o.id);
          } else {
            // 4xx pomeni trajno napako (napačen naslov, zavrnjena domena) –
            // označimo, da ne blokira vrste. 5xx/omrežje pustimo za naslednjič.
            const status = odgovor.status;
            console.error("Resend:", status, await odgovor.text());
            if (status >= 400 && status < 500) epostaOpravljeno.push(o.id);
          }
        } catch (e) {
          console.error("Napaka pri e-pošti:", (e as Error).message);
        }
      }
    }

    // --- potisno obvestilo ---
    if (o.push_sent_at !== null) continue; // v tem svežnju je bilo samo zaradi e-pošte
    // Označimo tudi, kadar oseba potisnih noče ali nima naprave – sicer bi
    // obvestilo ostalo v vrsti za vedno.
    pushOpravljeno.push(o.id);
    if (!kanali.push_enabled) continue;

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
        // miru – naslednjič gre lahko skozi.
        if (koda === 404 || koda === 410) mrtveNarocnine.push(n.id);
        else console.error("Napaka pri pošiljanju:", koda, (e as Error).message);
      }
    }
  }

  // Vsak kanal se označi LOČENO in samo za tiste vrstice, ki jih je ta
  // zagon dejansko obdelal. Prej se je push_sent_at postavil čez cel
  // sveženj – zdaj bi to pomenilo, da obvestilo, ki je v svežnju le zaradi
  // manjkajoče e-pošte, po nesreči obvelja za "push poslan".
  const zdaj = new Date().toISOString();
  if (pushOpravljeno.length) {
    await db.from("obvestila").update({ push_sent_at: zdaj }).in("id", pushOpravljeno);
  }
  if (epostaOpravljeno.length) {
    await db.from("obvestila").update({ email_sent_at: zdaj }).in("id", epostaOpravljeno);
  }

  if (mrtveNarocnine.length) {
    await db.from("potisne_narocnine").delete().in("id", mrtveNarocnine);
  }
  if (zivaNarocnine.length) {
    await db.from("potisne_narocnine").update({ last_ok_at: new Date().toISOString() })
      .in("id", [...new Set(zivaNarocnine)]);
  }

  return new Response(
    JSON.stringify({
      obdelanih: obvestila.length,
      poslanih,
      poslanihEpost,
      epostaNastavljena: !!RESEND_API_KEY,
      odstranjenihNarocnin: mrtveNarocnine.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
