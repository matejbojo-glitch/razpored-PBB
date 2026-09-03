#!/usr/bin/env node
/* Preizkus supabase/pocisti-dezurne-zdravnike.sql na PRAVI bazi PostgreSQL.
 *
 * Zakaj obstaja: uvoz uradnega dokumenta iz PDF-ja je celice ponekod
 * razlomil sredi oklepaja, zato je v dezurni_zdravniki pristal ostanek
 * ") Saša Trpin" namesto "Trpin Saša". Tako ime se ni ujelo z nobenim
 * profilom in je bilo dežurstvo v aplikaciji videti PRAZNO, čeprav je bil
 * podatek zapisan - uporabnik je to javil ("določene ikone so prazne").
 *
 * Tu se varujeta OBE strani istega pravila:
 *   1. zdrIme() v index.html (uvoz) - da ostanek sploh ne pride v bazo;
 *   2. pocisti-dezurne-zdravnike.sql (popravek za nazaj) - da se že
 *      zapisani ostanki počistijo in prepišejo v obliko iz Imenika.
 * Vhodni primeri so PRAVI, iz produkcijske baze (september 2026), ne
 * izmišljeni - sicer bi preizkus varoval nekaj, česar ni.
 *
 * Zagon: node skripte/preveri-pocisti-dezurne.mjs
 * Če PostgreSQL ni na voljo, se preizkus preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-pocisti-dezurne";
const BAZA = "preveri_pocisti_dezurne";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- zdrIme() iz index.html (uvozna stran istega pravila) -----------
const html = readFileSync(join(koren, "index.html"), "utf8");
const zac = html.indexOf("function zdrIme(celica){");
if (zac === -1) { console.error("zdrIme() ni v index.html"); process.exit(1); }
const kon = html.indexOf("\n}", zac) + 2;
const sandbox = { console }; vm.createContext(sandbox);
vm.runInContext(html.slice(zac, kon) + "\nglobalThis.zdrIme = zdrIme;", sandbox);
const zdrIme = sandbox.zdrIme;

// PRAVI ostanki iz produkcije -> kaj mora ostati od njih.
const PRIMERI = [
  [") Saša Trpin", "Saša Trpin"],
  [") dr. Tanja Torkar", "Tanja Torkar"],
  [") Mateja Lunar", "Mateja Lunar"],
  [") Petra Šubic", "Petra Šubic"],
  ["dr. Tanja Torkar", "Tanja Torkar"],
  ["Dr. Lea Žmuc Veranič", "Lea Žmuc Veranič"],
  // Kar je bilo doslej že pravilno, mora ostati nedotaknjeno.
  ["Amal Perviz", "Amal Perviz"],
  ["Magdalena Mavri Tratnik", "Magdalena Mavri Tratnik"],
  ["Špela Žagar Gabron", "Špela Žagar Gabron"],
  // Oblike, ki jih uradni dokument res uporablja.
  ["Ana Novak (dipl. m. s.)", "Ana Novak"],
  ["Ana Novak (dipl.", "Ana Novak"],
];

console.log("1) zdrIme() v index.html odreže ostanke uvoza");
PRIMERI.forEach(([vhod, pricakovano]) => eq(zdrIme(vhod), pricakovano, `zdrIme(${JSON.stringify(vhod)})`));

function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  return pg(`psql -q -v ON_ERROR_STOP=1 -At -F"|" -d ${BAZA} -f ${DELO}/_u.sql`);
}
try { pg("psql -At -c 'select 1'"); }
catch { console.log("PostgreSQL ni na voljo – preizkus SQL dela preskočen."); process.exit(napake.length ? 1 : 0); }

mkdirSync(DELO, { recursive: true });
writeFileSync(join(DELO, "prep.sql"), `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
`);

console.log("2) postavi bazo iz supabase/schema.sql");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
psql(readFileSync(join(DELO, "prep.sql"), "utf8"));
psql(readFileSync(join(koren, "supabase/schema.sql"), "utf8"));
trdi(true, "shema postavljena brez napak");

console.log("3) zaseji profile in PRAVE umazane vrstice iz produkcije");
// Profili nastanejo prek sprožilca handle_new_user (profili.id ima tuji
// ključ na auth.users.id). Sprožilec trg_standardiziraj_polno_ime imena
// V CELOTI Z VELIKIMI ČRKAMI pretvori v initcap, zato jih tu pišemo tako,
// kot so v Imeniku.
const PROFILI = [
  "Trpin Saša", "Torkar Tanja", "Lunar Mateja", "Šubic Petra",
  "Hrovat Nina", "Perviz Amal", "Magdalena Mavri Tratnik",
];
psql(PROFILI.map((ime, i) =>
  `insert into auth.users (id, email) values (gen_random_uuid(), 'oseba${i}@test.local');\n` +
  `update public.profili set full_name = '${ime.replace(/'/g, "''")}' where email = 'oseba${i}@test.local';`
).join("\n"));

// (datum, kind, zapisano ime, kaj mora biti po čiščenju, opis)
const VRSTICE = [
  ["2026-09-09", "sestra", ") Saša Trpin", "Trpin Saša", "ostanek ') ' + obratni vrstni red"],
  ["2026-09-11", "sestra", ") dr. Tanja Torkar", "Torkar Tanja", "ostanek ') ' + naziv 'dr.'"],
  ["2026-08-09", "sestra", ") Mateja Lunar", "Lunar Mateja", "ostanek ') '"],
  ["2026-09-18", "sestra", ") Petra Šubic", "Šubic Petra", "ostanek ') '"],
  ["2026-09-27", "sestra", "dr. Tanja Torkar", "Torkar Tanja", "naziv 'dr.' pred imenom"],
  ["2026-09-07", "sestra", "Nina Horvat", "Hrovat Nina", "potrjena tipkarska napaka priimka"],
  ["2026-09-02", "sestra", "Amal Perviz", "Perviz Amal", "obratni vrstni red -> oblika iz Imenika"],
  ["2026-08-12", "sestra", "Magdalena Mavri Tratnik", "Magdalena Mavri Tratnik", "že enak zapisu v Imeniku"],
  ["2026-08-05", "dezurstvo", "Dr. Lea Žmuc Veranič", "Lea Žmuc Veranič", "zdravnik: samo naziv proč, profila nima"],
  // Zlepek dveh stolpcev iz PDF-ja; objavljeni razpored pove, da je bila
  // dežurna Šubic Petra - popravek je zato v skripti imenovan izrecno.
  ["2026-08-19", "sestra", "Petra Tina Šubic Peternel", "Šubic Petra", "znan zlepek iz PDF-ja"],
  // Neznano ime mora ostati NEDOTAKNJENO in končati v poročilu.
  ["2026-08-20", "sestra", "Kdorkoli Neznan", "Kdorkoli Neznan", "neznano ime: ostane nedotaknjeno"],
];
psql(VRSTICE.map(([d, k, ime]) =>
  `insert into public.dezurni_zdravniki (work_date, kind, full_name) values ('${d}', '${k}', '${ime.replace(/'/g, "''")}');`
).join("\n"));
trdi(true, `zasejanih ${VRSTICE.length} vrstic`);

console.log("4) poženi supabase/pocisti-dezurne-zdravnike.sql");
const izhod = psql(readFileSync(join(koren, "supabase/pocisti-dezurne-zdravnike.sql"), "utf8"));
console.log(izhod.trim().split("\n").map(l => "    " + l).join("\n"));

console.log("5) preveri rezultat");
VRSTICE.forEach(([d, k, , pricakovano, opis]) => {
  const dobljeno = psql(`select full_name from public.dezurni_zdravniki where work_date='${d}' and kind='${k}';`).trim();
  eq(dobljeno, pricakovano, `${d} ${k}: ${opis}`);
});

console.log("6) dvoumnega/neujetega imena skripta NE ugiba, ampak ga javi");
trdi(izhod.includes("Kdorkoli Neznan"),
  "neujeto ime je v poročilu 'NI NAJDEN PROFIL', ne izgine tiho");
trdi(!izhod.includes("Petra Tina Šubic Peternel"),
  "znan zlepek pa je razvozlan in ga v poročilu ni več");
trdi(!izhod.toUpperCase().includes("POZOR"),
  "brez 'POZOR' vrstice (nobeno ime se ne ujame z dvema profiloma)");

console.log("7) varno za ponovni zagon");
{
  const prej = psql(`select work_date||'|'||kind||'|'||full_name from public.dezurni_zdravniki order by 1;`);
  psql(readFileSync(join(koren, "supabase/pocisti-dezurne-zdravnike.sql"), "utf8"));
  const potem = psql(`select work_date||'|'||kind||'|'||full_name from public.dezurni_zdravniki order by 1;`);
  trdi(prej === potem, "drugi zagon ne spremeni nobene vrstice");
}

console.log("8) SQL in JS odrežeta ostanek ENAKO (eno pravilo, dve mesti)");
// Dovolj je prvi korak skripte (oklepaji/nazivi/ločila) - drugi korak
// (prepis v obliko iz Imenika) je namenoma SAMO v bazi, ker uvoz profilov
// ne pozna.
PRIMERI.forEach(([vhod, pricakovano]) => {
  const vSql = psql(`select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      '${vhod.replace(/'/g, "''")}', '\\([^)]*\\)', ' ', 'g'), '\\(.*$', ' '),
      '(^|\\s)(dr|mag|prof|spec|univ|dipl)\\.\\s*', ' ', 'gi'),
      '^[^A-Za-zČŠŽĆĐčšžćđ]+', ''), '\\s+', ' ', 'g'));`).trim();
  eq(vSql, pricakovano, `SQL za ${JSON.stringify(vhod)} (JS da ${JSON.stringify(zdrIme(vhod))})`);
});

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
