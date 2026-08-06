// Bulk ustvarjanje Supabase Auth računov za zaposlene, ki jih poznamo
// (ime + e-pošta iz roster/*.csv), z vabilom po e-pošti za nastavitev
// lastnega gesla (ista povezava/stran kot "Pozabljeno geslo" v aplikaciji
// — reset-geslo.html).
//
// Zakaj lokalna skripta, ne nekaj v aplikaciji: ustvarjanje Auth računov
// zahteva service_role ključ, ki NIKOLI ne sme priti v brskalnik (obšel bi
// vsa RLS pravila). Zato to teče samo tukaj, ročno, na tvojem računalniku.
//
// Uporaba:
//   cd skripte
//   cp .env.primer .env        # vpiši SUPABASE_SERVICE_ROLE_KEY
//   npm install
//   node uvoz-racunov.mjs --suho     # samo izpiše, kaj bi naredil
//   node uvoz-racunov.mjs            # dejansko ustvari račune + pošlje vabila
//
// Varno je pognati večkrat: e-pošte, za katere račun že obstaja, se samo
// preskočijo (ne podvoji, ne prepiše).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROSTER_DIR = path.join(__dirname, "..", "roster");

const SUHO = process.argv.includes("--suho");

function preveriOkolje() {
  if (SUHO) return; // suh zagon ne kliče Supabase, ne potrebuje pravih vrednosti
  const manjka = [];
  if (!process.env.SUPABASE_URL) manjka.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) manjka.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SITE_URL) manjka.push("SITE_URL");
  if (manjka.length) {
    console.error("Manjkajo spremenljivke v .env: " + manjka.join(", "));
    console.error("Skopiraj .env.primer v .env in ga izpolni (glej README.md).");
    process.exit(1);
  }
}

// Minimalen CSV parser, ki razume narekovaje z vejicami znotraj polja
// (roster/zaposleni-vloge-gesla.csv ima tak primer v stolpcu "opombe").
function parsirajCSV(besedilo) {
  const vrstice = [];
  let polje = "", vrstica = [], vNarekovajih = false;
  for (let i = 0; i < besedilo.length; i++) {
    const c = besedilo[i], next = besedilo[i + 1];
    if (vNarekovajih) {
      if (c === '"' && next === '"') { polje += '"'; i++; }
      else if (c === '"') { vNarekovajih = false; }
      else polje += c;
    } else if (c === '"') {
      vNarekovajih = true;
    } else if (c === ",") {
      vrstica.push(polje); polje = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      vrstica.push(polje); polje = "";
      if (vrstica.some(v => v !== "")) vrstice.push(vrstica);
      vrstica = [];
    } else {
      polje += c;
    }
  }
  if (polje !== "" || vrstica.length) { vrstica.push(polje); vrstice.push(vrstica); }
  const glava = vrstice[0];
  return vrstice.slice(1).map(v => Object.fromEntries(glava.map((h, i) => [h, v[i] ?? ""])));
}

function nalozizOsebe() {
  const osebe = new Map(); // email -> full_name

  const emaili = parsirajCSV(fs.readFileSync(path.join(ROSTER_DIR, "zaposleni-emaili.csv"), "utf8"));
  emaili.forEach(r => {
    const email = (r.email || "").trim().toLowerCase();
    if (!email) return;
    osebe.set(email, `${r.ime} ${r.priimek}`.trim());
  });

  const vlogeGesla = parsirajCSV(fs.readFileSync(path.join(ROSTER_DIR, "zaposleni-vloge-gesla.csv"), "utf8"));
  vlogeGesla.forEach(r => {
    const email = (r.email || "").trim().toLowerCase();
    if (!email) return;
    if (!osebe.has(email)) osebe.set(email, `${r.ime} ${r.priimek}`.trim());
  });

  return osebe;
}

async function main() {
  preveriOkolje();
  const osebe = nalozizOsebe();
  console.log(`Najdenih ${osebe.size} unikatnih e-poštnih naslovov v roster/*.csv.`);
  if (SUHO) console.log("--suho: samo izpis, brez dejanskih klicev v Supabase.\n");

  const client = SUHO ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redirectTo = SUHO ? null : process.env.SITE_URL.replace(/\/$/, "") + "/reset-geslo.html";

  const rezultati = { ustvarjeni: [], obstojeci: [], napake: [] };

  for (const [email, fullName] of osebe) {
    if (SUHO) {
      console.log(`  (bi ustvaril) ${fullName} <${email}>`);
      continue;
    }
    const { error } = await client.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
    if (!error) {
      rezultati.ustvarjeni.push({ email, fullName });
      console.log(`  ✓ vabilo poslano: ${fullName} <${email}>`);
    } else if (/already|obstaja|registered/i.test(error.message || "")) {
      rezultati.obstojeci.push({ email, fullName });
      console.log(`  – že obstaja, preskočeno: ${fullName} <${email}>`);
    } else {
      rezultati.napake.push({ email, fullName, napaka: error.message });
      console.log(`  ✗ napaka za ${fullName} <${email}>: ${error.message}`);
    }
    // Rahla zakasnitev, da ne udarimo v Supabase Auth Admin rate limit.
    await new Promise(r => setTimeout(r, 300));
  }

  if (!SUHO) {
    console.log("\nPovzetek:");
    console.log(`  Novo ustvarjenih + vabilo poslano: ${rezultati.ustvarjeni.length}`);
    console.log(`  Že obstajali (preskočeno):         ${rezultati.obstojeci.length}`);
    console.log(`  Napake:                            ${rezultati.napake.length}`);
    if (rezultati.napake.length) {
      const csv = ["email,ime,napaka", ...rezultati.napake.map(n => `"${n.email}","${n.fullName}","${(n.napaka || "").replace(/"/g, '""')}"`)].join("\n");
      const izhod = path.join(__dirname, `porocilo-napake-${Date.now()}.csv`);
      fs.writeFileSync(izhod, csv, "utf8");
      console.log(`  Podrobnosti napak: ${izhod}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
