/* Razpored PBB — push-client.js
 * Vklop/izklop potisnih obvestil (Web Push) na tej napravi.
 *
 * VAPID_JAVNI_KLJUC je JAVNI del para ključev in je namenoma v kodi —
 * brskalnik ga potrebuje ob naročanju in ni skrivnost. ZASEBNI ključ je
 * izključno v Supabase Edge Function skrivnostih (glej PUSH-SETUP.md) in
 * ga v repozitoriju NI in ne sme biti.
 *
 * Brez JSX (navaden JS), da se naloži kot <script> pred babel skriptami.
 */
(function (root) {
  "use strict";

  var VAPID_JAVNI_KLJUC = "BByIPXuD5ybU4phq4GNzeM0wglL1uUAaMr6ZY-SqXeDvYtCFXm9IbrAmm1yCHl44uHPB_rKdTycCx5KnAdICNic";

  // base64url -> Uint8Array (PushManager zahteva surove bajte)
  function kljucVBajte(base64url) {
    var polnilo = "=".repeat((4 - (base64url.length % 4)) % 4);
    var base64 = (base64url + polnilo).replace(/-/g, "+").replace(/_/g, "/");
    var surovo = atob(base64);
    var izhod = new Uint8Array(surovo.length);
    for (var i = 0; i < surovo.length; i++) izhod[i] = surovo.charCodeAt(i);
    return izhod;
  }

  function podprto() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  // Vrne: "nepodprto" | "zavrnjeno" | "vklopljeno" | "izklopljeno"
  async function stanje() {
    if (!podprto()) return "nepodprto";
    if (Notification.permission === "denied") return "zavrnjeno";
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return "izklopljeno";
      var narocnina = await reg.pushManager.getSubscription();
      return narocnina ? "vklopljeno" : "izklopljeno";
    } catch (e) {
      return "izklopljeno";
    }
  }

  async function vklopi(profileId) {
    if (!podprto()) throw new Error("Ta brskalnik ne podpira potisnih obvestil.");
    if (Notification.permission === "denied") {
      throw new Error("Obvestila so blokirana v nastavitvah brskalnika — najprej jih dovoli tam.");
    }

    var dovoljenje = await Notification.requestPermission();
    if (dovoljenje !== "granted") throw new Error("Obvestila niso bila dovoljena.");

    // sw.js je registriran v index.html; tu počakamo, da je pripravljen
    // (na drugih straneh ga morda še ni, zato ga po potrebi registriramo).
    var reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;

    var narocnina = await reg.pushManager.getSubscription();
    if (!narocnina) {
      narocnina = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: kljucVBajte(VAPID_JAVNI_KLJUC),
      });
    }

    var json = narocnina.toJSON();
    var zapis = {
      profile_id: profileId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    };
    var odgovor = await root.RazporedAuth.client
      .from("push_subscriptions")
      .upsert(zapis, { onConflict: "endpoint" });
    if (odgovor.error) throw odgovor.error;
    return true;
  }

  async function izklopi() {
    if (!podprto()) return false;
    var reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    var narocnina = await reg.pushManager.getSubscription();
    if (!narocnina) return false;

    var endpoint = narocnina.endpoint;
    await narocnina.unsubscribe();
    // Vrstico v bazi pobrišemo tudi, če odjava v brskalniku ne uspe —
    // sicer bi strežnik še naprej pošiljal na mrtvo naročnino.
    await root.RazporedAuth.client.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return true;
  }

  root.RazporedPush = { podprto: podprto, stanje: stanje, vklopi: vklopi, izklopi: izklopi };
})(typeof window !== "undefined" ? window : this);
