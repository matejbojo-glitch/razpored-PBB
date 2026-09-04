#!/usr/bin/env node
/* STI (strokovno izobraževanje) – pravili, ki ju je postavil uporabnik
 * (september 2026):
 *
 *   1. na dan STI oseba NE more imeti delovne izmene;
 *   2. dan PRED STI ne more imeti nočne izmene (nočna se konča ob 06:00,
 *      izobraževanje pa se začne dopoldne);
 *   3. če se STI vpiše čez dan, ki je bil LETNI DOPUST, LD odpade in se
 *      vrne med neizkoriščene dneve.
 *
 * Zakaj se preverja na PRAVI bazi in ne samo v brskalniku: razpored piše
 * več poti (generator, ročno urejanje, uvoz iz Google Sheets, izvedba
 * potrjene menjave). Pravilo, zapisano v eni od njih, ostale tiho obidejo –
 * prav tako se je doslej zgodilo, da je oseba na bolniški vseeno pristala
 * na izmeni. Zato je pravilo v bazi in tu se preveri, da RES drži, ne le
 * da je zapisano.
 *
 * Zagon: node skripte/preveri-sti-pravila.mjs
 * Če PostgreSQL ni na voljo, se ta del preskoči (izhod 0).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const DELO = "/var/tmp/preveri-sti-pravila";
const BAZA = "preveri_sti_pravila";

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- 1) JS stran: STI je na seznamu prepovedanih po nočni ------------
console.log("1) STI velja za dnevno obveznost – po nočni izmeni ga ni mogoče opraviti");
{
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sb);
  vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sb);
  const D = sb.window.DelovniCas;
  trdi(D.PREPOVEDANE_PO_NOCNI.includes("STI"),
    "STI je na seznamu kod, ki ne smejo slediti nočni izmeni");
  trdi(D.preveriPocitek("N12", "STI") === false, "po N12 STI ni dovoljen");
  trdi(D.preveriPocitek("N11", "STI") === false, "po N11 tudi ne");
  trdi(D.preveriPocitek("N10", "STI") === false, "po N10 tudi ne");
  trdi(D.preveriPocitek("DOP", "STI") === true, "po dopoldanski izmeni je STI seveda v redu");
  trdi(D.preveriPocitek("N12", "PO7") === true, "popoldanska po nočni ostane dovoljena (pravilo se ni razširilo)");

  // Isti seznam je v generatorju - dve mesti, isto dejstvo. Generator se
  // naloži v ISTO peskovnico kot izmene.js, ker šifrant potrebuje. V
  // peskovnici NI "module", zato se (UMD ovoj) postavi na window.
  vm.runInContext(readFileSync(join(koren, "generator-core.js"), "utf8"), sb);
  const gen = sb.window.Generator;
  trdi(gen.krsiPocitek("Nočna 12", "STI") === true, "generator sodi enako: nočna 12 → STI je kršitev");
  trdi(gen.krsiPocitek("Dopoldne", "STI") === false, "in dopoldan → STI ni");
}

// --- 2) Generator javi nočno na dan pred STI --------------------------
console.log("2) generator javi nočno izmeno na dan pred STI (sam je ne popravlja)");
{
  const sb = { console };
  sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(koren, "izmene.js"), "utf8"), sb);
  vm.runInContext(readFileSync(join(koren, "generator-core.js"), "utf8"), sb);
  const G = sb.window.Generator;

  // Kalup postavimo tako, da ima oseba v tednu tudi nočne, nato ji na en
  // dan vpišemo STI in pogledamo, ali se dan PREJ javi.
  const izid = G.generirajKalup({
    anchorMondayISO: "2026-09-07",
    startISO: "2026-09-07",
    endISO: "2026-09-20",
    staff: [
      { ime: "Novak Ana", startLetter: "A" },
      { ime: "Kovač Eva", startLetter: "B" },
      { ime: "Horvat Jan", startLetter: "C" },
      { ime: "Krajnc Maja", startLetter: "D" },
      { ime: "Zupan Tine", startLetter: "E" },
    ],
  });
  // Poišči dan, ko ima kdo nočno, in mu NASLEDNJI dan vpiši STI.
  let osebaZNocno = null, datumNocne = null;
  for (const d of izid.dnevi) {
    for (const ime of Object.keys(d.izmene)) {
      if (/^nočna/i.test(String(d.izmene[ime] || ""))) { osebaZNocno = ime; datumNocne = d.datum; break; }
    }
    if (osebaZNocno && datumNocne !== izid.dnevi[izid.dnevi.length - 1].datum) break;
  }
  trdi(!!osebaZNocno, `kalup sploh razporedi nočne izmene (${osebaZNocno} ${datumNocne})`);
  const naslednji = izid.dnevi[izid.dnevi.findIndex(d => d.datum === datumNocne) + 1];
  trdi(!!naslednji, "za nočnim dnem obstaja naslednji dan v obdobju");

  const zSti = G.generirajKalup({
    anchorMondayISO: "2026-09-07",
    startISO: "2026-09-07",
    endISO: "2026-09-20",
    staff: [
      { ime: "Novak Ana", startLetter: "A" },
      { ime: "Kovač Eva", startLetter: "B" },
      { ime: "Horvat Jan", startLetter: "C" },
      { ime: "Krajnc Maja", startLetter: "D" },
      { ime: "Zupan Tine", startLetter: "E" },
    ].map(z => (z.ime === osebaZNocno
      ? Object.assign({}, z, { odsotnosti: { [naslednji.datum]: "STI" } })
      : z)),
  });
  const opozorilo = zSti.opozorila.find(o =>
    String(o.sporocilo).includes(osebaZNocno) && /počitka/i.test(String(o.sporocilo)));
  trdi(!!opozorilo, "javi se opozorilo o manjkajočem počitku: "
    + (opozorilo ? opozorilo.sporocilo : "NI GA"));
  // Razpored ostane, kot je - odločitev je koordinatorjeva.
  const danNocne = zSti.dnevi.find(d => d.datum === datumNocne);
  trdi(/^nočna/i.test(String(danNocne.izmene[osebaZNocno] || "")),
    "nočna ostane v razporedu (generator je ne popravi sam)");
}

// --- 3) Baza: sprožilec res prepreči vpis -----------------------------
function pg(ukaz) {
  return execFileSync("su", ["postgres", "-c", ukaz], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function psql(sql, { tiho = false } = {}) {
  writeFileSync(join(DELO, "_u.sql"), sql + "\n");
  try {
    return { out: pg(`psql -q -v ON_ERROR_STOP=1 -At -F"|" -d ${BAZA} -f ${DELO}/_u.sql`), napaka: null };
  } catch (e) {
    if (!tiho) throw e;
    return { out: "", napaka: String(e.stderr || e.message || e) };
  }
}
try { pg("psql -At -c 'select 1'"); }
catch {
  console.log("PostgreSQL ni na voljo – preverba v bazi preskočena.");
  console.log("");
  if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
  console.log("VSE V REDU");
  process.exit(0);
}

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

console.log("3) baza: shema iz supabase/schema.sql postavi tudi pravila STI");
pg(`dropdb --if-exists ${BAZA}; createdb ${BAZA}`);
psql(readFileSync(join(DELO, "prep.sql"), "utf8"));
psql(readFileSync(join(koren, "supabase/schema.sql"), "utf8"));
{
  const t = psql(`select count(*) from pg_trigger where tgname = 'trg_preveri_sti';`).out.trim();
  eq(t, "1", "sprožilec trg_preveri_sti obstaja");
}

psql(`
insert into auth.users (id, email) values (gen_random_uuid(), 'a@test.local');
update public.profili set full_name = 'Novak Ana' where email = 'a@test.local';
insert into public.odsotnosti (full_name, work_date, kind) values ('Novak Ana', '2026-10-15', 'sti');
`);

console.log("4) na dan STI ni mogoče vpisati delovne izmene");
{
  const vpisi = (datum, sifra) => psql(
    `insert into public.razpored (employee_id, work_date, shift_code, department_code)
     select id, '${datum}', '${sifra}', 'C1' from public.profili where email='a@test.local';`,
    { tiho: true });
  for (const sifra of ["Dopoldne", "Popoldne", "Nočna 12", "Dnevna 12", "DEŽURSTVO"]) {
    const r = vpisi("2026-10-15", sifra);
    trdi(!!r.napaka && /strokovno izobraževanje/i.test(r.napaka),
      `izmena "${sifra}" na dan STI je zavrnjena`);
  }
  // Kar NI delovna izmena, sme ostati - sicer ne bi bilo mogoče vpisati
  // niti koriščenja prostih ur.
  const kpu = vpisi("2026-10-15", "KPU");
  trdi(!kpu.napaka, "KPU (ni delovna izmena) na isti dan ostane dovoljen"
    + (kpu.napaka ? ": " + kpu.napaka.split("\n")[0] : ""));
  const drugDan = vpisi("2026-10-20", "Dopoldne");
  trdi(!drugDan.napaka, "izmena na DRUG dan ni ovirana"
    + (drugDan.napaka ? ": " + drugDan.napaka.split("\n")[0] : ""));
}

console.log("5) dan PRED STI ni mogoče vpisati nočne izmene");
{
  const vpisi = (datum, sifra) => psql(
    `insert into public.razpored (employee_id, work_date, shift_code, department_code)
     select id, '${datum}', '${sifra}', 'C1' from public.profili where email='a@test.local';`,
    { tiho: true });
  for (const sifra of ["Nočna 12", "Nočna od 19", "Nočna"]) {
    const r = vpisi("2026-10-14", sifra);
    trdi(!!r.napaka && /nočne izmene/i.test(r.napaka), `nočna "${sifra}" dan pred STI je zavrnjena`);
  }
  const dop = vpisi("2026-10-14", "Dopoldne");
  trdi(!dop.napaka, "dopoldanska izmena dan pred STI je dovoljena"
    + (dop.napaka ? ": " + dop.napaka.split("\n")[0] : ""));
  // Dežurstvo gre prav tako čez polnoč, a se konča ob 07:00 in NI nočna
  // izmena po šifrantu - pravilo se nanj namenoma ne razširi.
  psql(`delete from public.razpored where work_date = '2026-10-14';`);
  const dez = vpisi("2026-10-14", "DEŽURSTVO");
  trdi(!dez.napaka, "dežurstvo dan pred STI ni zajeto (ni nočna izmena po šifrantu)"
    + (dez.napaka ? ": " + dez.napaka.split("\n")[0] : ""));
}

console.log("6) pravilo velja tudi za POPRAVEK obstoječega vpisa, ne le za nov");
{
  psql(`delete from public.razpored;`);
  psql(`insert into public.razpored (employee_id, work_date, shift_code, department_code)
        select id, '2026-10-15', 'KPU', 'C1' from public.profili where email='a@test.local';`);
  const r = psql(`update public.razpored set shift_code = 'Dopoldne' where work_date = '2026-10-15';`, { tiho: true });
  trdi(!!r.napaka && /strokovno izobraževanje/i.test(r.napaka),
    "sprememba KPU → Dopoldne na dan STI je zavrnjena");
}

console.log("7) brez STI ista izmena mine brez ovire (pravilo ni presplošno)");
{
  psql(`delete from public.razpored; delete from public.odsotnosti;`);
  const r = psql(
    `insert into public.razpored (employee_id, work_date, shift_code, department_code)
     select id, '2026-10-15', 'Dopoldne', 'C1' from public.profili where email='a@test.local';`,
    { tiho: true });
  trdi(!r.napaka, "brez vpisanega STI je izmena sprejeta"
    + (r.napaka ? ": " + r.napaka.split("\n")[0] : ""));
}

console.log("8) supabase/sti-pravila.sql postavi isto na OBSTOJEČO bazo");
{
  // Skripta za obstoječe baze mora dati enak izid kot schema.sql - sicer se
  // produkcija in nova baza razideta.
  psql(`drop trigger if exists trg_preveri_sti on public.razpored;`);
  eq(psql(`select count(*) from pg_trigger where tgname='trg_preveri_sti';`).out.trim(), "0",
    "sprožilec je odstranjen (izhodišče: baza brez pravila)");
  psql(readFileSync(join(koren, "supabase/sti-pravila.sql"), "utf8"));
  eq(psql(`select count(*) from pg_trigger where tgname='trg_preveri_sti';`).out.trim(), "1",
    "skripta ga postavi nazaj");
  const drugic = psql(readFileSync(join(koren, "supabase/sti-pravila.sql"), "utf8"), { tiho: true });
  trdi(!drugic.napaka, "in je varna za ponovni zagon"
    + (drugic.napaka ? ": " + drugic.napaka.split("\n")[0] : ""));
}

pg(`dropdb --if-exists ${BAZA}`);
console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
