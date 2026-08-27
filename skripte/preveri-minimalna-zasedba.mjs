#!/usr/bin/env node
/* Minimalna zasedba po oddelku in izmeni.
 *
 * Vrednosti so iz uradnega dokumenta "MINIMUM po oddelkih" (uporabnik,
 * avgust 2026) - do zdaj je bil v bazi OSNUTEK iz analize, ki je bil
 * ponekod napačen.
 *
 * Kar se tu varuje:
 *  - med tednom se dela v treh izmenah, ob sobotah, nedeljah in praznikih
 *    pa v dveh dvanajsturnih. Z enim samim naborom treh košev je vsaka
 *    sobota javila "manjka popoldanska izmena", ki je tisti dan sploh ni -
 *    torej rdeče opozorilo za nekaj, kar ni narobe;
 *  - praznik med tednom šteje kot vikend;
 *  - primerja se z min_sms, ne z vsoto: kalup razporeja samo izmenski
 *    kader oddelka, vodja (DMS) ima razpored v NZV, dodatna oseba pa
 *    prihaja iz FLEXI - nobeden ni del tega predloga.
 *
 * Zagon: node skripte/preveri-minimalna-zasedba.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// --- 1) vrednosti v shemi se ujemajo z dokumentom -----------------------
console.log("1) seed v schema.sql se ujema z dokumentom »MINIMUM po oddelkih«");
{
  const sql = readFileSync(join(koren, "supabase/schema.sql"), "utf8");
  const blok = sql.slice(sql.indexOf("insert into public.minimalna_zasedba"));
  const vrstice = [...blok.matchAll(/\('([A-Z0-9]+)',\s*'([A-Z_]+)',\s*(null|\d+),\s*(null|\d+),\s*(null|\d+)/g)]
    .map(m => ({ odd: m[1], kos: m[2], dms: m[3], sms: m[4], flexi: m[5] }));
  const najdi = (odd, kos) => vrstice.find(v => v.odd === odd && v.kos === kos);

  // Dobesedno iz dokumenta: [dopoldne, popoldne, nočna, dnevna-vikend, nočna-vikend]
  const DOKUMENT = {
    B:  [1, 1, 1, 1, 1],
    C:  [1, 1, 1, 1, 1],
    C1: [2, 2, 2, 2, 2],
    D:  [2, 2, 2, 2, 2],
    E1: [1, 1, 1, 1, 1],
    E2: [1, 1, 1, 1, 1],
  };
  const KOSI = ["DOPOLDNE", "POPOLDNE", "PONOCI", "DNEVNA_VIKEND", "PONOCI_VIKEND"];
  Object.keys(DOKUMENT).forEach(odd => {
    const dobljeni = KOSI.map(k => { const v = najdi(odd, k); return v ? Number(v.sms) : null; });
    eq(dobljeni, DOKUMENT[odd], `${odd}: SMS po izmenah`);
  });
  // "+1" iz dokumenta velja samo na C in E2 in samo v dnevnih izmenah -
  // ponoči ga ni. To je ENA oseba iz FLEXI, ki pokriva oba oddelka.
  ["C", "E2"].forEach(odd => {
    ["DOPOLDNE", "POPOLDNE", "DNEVNA_VIKEND"].forEach(k => {
      trdi(Number((najdi(odd, k) || {}).flexi) === 1, `${odd} ${k}: +1 iz FLEXI`);
    });
    trdi((najdi(odd, "PONOCI") || {}).flexi === "null", `${odd} ponoči: brez dodatne osebe`);
  });
  ["B", "C1", "D", "E1"].forEach(odd => {
    trdi(KOSI.every(k => (najdi(odd, k) || {}).flexi === "null"), `${odd}: nikjer dodatne osebe iz FLEXI`);
  });
  // Vodja: 1 na oddelek, PON-PET, torej samo v dopoldanskem košu.
  ["B", "C", "C1", "D", "E1", "E2"].forEach(odd => {
    trdi(Number((najdi(odd, "DOPOLDNE") || {}).dms) === 1, `${odd}: 1 vodja dopoldne med tednom`);
    trdi((najdi(odd, "DNEVNA_VIKEND") || {}).dms === "null", `${odd}: ob vikendu vodje ni`);
  });
}

// --- 2) razvrščanje v koše ---------------------------------------------
console.log("2) izmena se razvrsti v pravi koš glede na dan");
{
  const html = readFileSync(join(koren, "admin.html"), "utf8");
  const zac = html.indexOf("function jeVikendAliPraznik");
  const kon = html.indexOf("function minZaKos");
  trdi(zac > 0 && kon > zac, "logika razvrščanja je najdena v admin.html");
  global.window = { Prazniki: { jePraznik: (iso) => iso === "2026-08-15" } };
  const kontekst = {};
  new Function("window", html.slice(zac, kon) +
    ";Object.assign(this,{jeVikendAliPraznik,shiftBucket,kosiZaDan,IZMENA_LABEL});")
    .call(kontekst, global.window);
  const { shiftBucket, kosiZaDan, jeVikendAliPraznik } = kontekst;

  // 3.8.2026 je ponedeljek, 8.8. sobota, 9.8. nedelja, 15.8. sobota.
  eq(shiftBucket("Dopoldne", "2026-08-03"), "DOPOLDNE", "dopoldne med tednom");
  eq(shiftBucket("Popoldne", "2026-08-03"), "POPOLDNE", "popoldne med tednom");
  eq(shiftBucket("Nočna", "2026-08-03"), "PONOCI", "nočna med tednom");
  eq(shiftBucket("Nočna od 19", "2026-08-03"), "PONOCI", "nočna od 19 med tednom");
  eq(shiftBucket("Dnevna 12", "2026-08-08"), "DNEVNA_VIKEND", "dnevna 12 v soboto");
  eq(shiftBucket("Nočna 12", "2026-08-08"), "PONOCI_VIKEND", "nočna 12 v soboto");
  eq(shiftBucket("LD", "2026-08-03"), null, "dopust ni izmena");
  eq(shiftBucket("KPU", "2026-08-03"), null, "koriščenje ni izmena");
  eq(shiftBucket("", "2026-08-03"), null, "prazna celica ni izmena");

  eq(kosiZaDan("2026-08-03"), ["DOPOLDNE", "POPOLDNE", "PONOCI"], "med tednom trije koši");
  eq(kosiZaDan("2026-08-08"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "v soboto dva");
  eq(kosiZaDan("2026-08-09"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "v nedeljo dva");

  // Praznik med tednom se šteje kot vikend - sicer bi aplikacija na
  // državni praznik zahtevala tri izmene, ki jih tisti dan ni.
  global.window.Prazniki = { jePraznik: (iso) => iso === "2026-08-17" };
  trdi(jeVikendAliPraznik("2026-08-17"), "praznik na ponedeljek se šteje kot vikend");
  eq(kosiZaDan("2026-08-17"), ["DNEVNA_VIKEND", "PONOCI_VIKEND"], "in takrat veljata dva koša");
  trdi(!jeVikendAliPraznik("2026-08-18"), "navaden torek ostane delovni dan");
}

// --- 3) FLEXI ponoči nadomesti, ne dodaja -------------------------------
console.log("3) vrzel, ki jo pokrije FLEXI, ne sme svetiti rdeče");
{
  // FLEXI dela dnevne izmene. Ponoči ga po predhodnem dogovoru ali ob
  // izpadu (bolniška) lahko vključijo, a takrat NADOMESTI oddelčno osebo -
  // minimum ostane isti. Brez možnosti označbe bi tak dan trajno kazal
  // rdeče, čeprav je razporejeno tako, kot mora biti.
  const html = readFileSync(join(koren, "admin.html"), "utf8");
  const zac = html.indexOf("function izracunajVrzeli");
  // Do NASLEDNJE funkcije, ne do PokritostPoDnevih - vmes so komponente z
  // JSX, ki ga new Function ne zna prebrati.
  const kon = html.indexOf("function tedniBesedilo");
  trdi(zac > 0 && kon > zac, "izračun vrzeli je najden");

  global.window = { Prazniki: { jePraznik: () => false } };
  const pomozne = html.slice(html.indexOf("function jeVikendAliPraznik"), html.indexOf("function minZaKos"))
    + "\nfunction minZaKos(v){ return v ? (Number(v.min_sms) || 0) : 0; }\n";
  const kontekst = {};
  new Function("window", pomozne + html.slice(zac, kon) + ";Object.assign(this,{izracunajVrzeli});")
    .call(kontekst, global.window);
  const { izracunajVrzeli } = kontekst;

  // 5.10.2026 je ponedeljek. Oddelek ima ponoči minimum 1, a nihče ne dela.
  const rezultat = {
    dnevi: [{ datum: "2026-10-05", dan: "PO" }],
    staff: [{ ime: "A" }],
    pricakovanoPoDnevih: {},
  };
  const celica = () => "";              // nihče ne dela
  const minimumi = { PONOCI: { min_sms: 1 } };

  const brez = izracunajVrzeli({ rezultat, celica, pragPopravki: {}, minimumi, flexiPokrito: {} });
  eq(brez.vrzeli.map(v => v.datum + "|" + v.bucket), ["2026-10-05|PONOCI"],
     "brez označbe je vrzel prijavljena");

  const z = izracunajVrzeli({ rezultat, celica, pragPopravki: {}, minimumi,
                              flexiPokrito: { "2026-10-05|PONOCI": true } });
  eq(z.vrzeli, [], "z označbo »Pokrije FLEXI« vrzeli ni več");

  // Označba velja za TOČNO tisti dan in izmeno, ne za cel mesec.
  const drug = izracunajVrzeli({ rezultat, celica, pragPopravki: {}, minimumi,
                                 flexiPokrito: { "2026-10-06|PONOCI": true } });
  eq(drug.vrzeli.map(v => v.datum), ["2026-10-05"], "označba drugega dne te vrzeli ne skrije");
  const drugaIzmena = izracunajVrzeli({ rezultat, celica, pragPopravki: {}, minimumi,
                                        flexiPokrito: { "2026-10-05|DOPOLDNE": true } });
  eq(drugaIzmena.vrzeli.map(v => v.bucket), ["PONOCI"], "označba druge izmene je prav tako ne skrije");
}

// --- 4) označba se ne prenese na nov predlog ---------------------------
console.log("4) oznake se ob novem generiranju počistijo");
{
  const html = readFileSync(join(koren, "admin.html"), "utf8");
  const i = html.indexOf("const generiraj = async");
  const gen = html.slice(i, i + 4000);
  trdi(/setFlexiPokrito\(\{\}\)/.test(gen),
    "generiranje počisti oznake – sicer bi odločitev za en mesec tiho veljala za drugega");
}

// --- 5) selitev omejitve preživi preimenovanje tabele -------------------
console.log("5) razširitev omejitve ne sme sloneti na imenu omejitve");
{
  // Tabela se je pri prehodu na slovenska imena preimenovala iz
  // "department_shift_minimums", omejitev pa je v obstoječih bazah OBDRŽALA
  // staro ime. Ciljanje na novo ime jo je zgrešilo, stara je ostala v
  // veljavi in zavrnila vsak zapis za vikend:
  //   ERROR: new row ... violates check constraint
  //          "department_shift_minimums_shift_bucket_check"
  // Ista past je bila prej ujeta pri zelje_zaposlenih. Zato se tu zahteva
  // odstranjevanje po VSEBINI (pregled pg_constraint), ne po imenu -
  // naštevanje znanih imen zataji ob naslednjem preimenovanju.
  const sql = readFileSync(join(koren, "supabase/schema.sql"), "utf8");
  const zac = sql.indexOf("if to_regclass('public.minimalna_zasedba') is null then return; end if;");
  trdi(zac > 0, "selitev omejitve je najdena");
  const blok = sql.slice(Math.max(0, zac - 1500), zac + 1200);
  trdi(/from pg_constraint/.test(blok), "omejitve se poiščejo v pg_constraint");
  trdi(/pg_get_constraintdef\(oid\)\s+ilike\s+'%shift_bucket%'/.test(blok),
    "in izberejo po stolpcu, na katerega se nanašajo");
  trdi(/drop constraint %I/.test(blok), "vsaka najdena se odstrani, ne le ena po imenu");
  trdi(/add constraint minimalna_zasedba_shift_bucket_check/.test(blok),
    "nato se doda ena sama, razširjena");
  // Če bi kdo to spet napisal "po imenu", bi past spet zdrsnila skozi.
  trdi(!/drop constraint if exists minimalna_zasedba_shift_bucket_check/.test(sql),
    "nikjer se ne odstranjuje samo po novem imenu");
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
