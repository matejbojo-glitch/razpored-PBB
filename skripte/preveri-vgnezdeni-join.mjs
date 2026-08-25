#!/usr/bin/env node
/* Preveri, da noben vgnezden ("embed") zapis v poizvedbah ni DVOUMEN.
 *
 * Ozadje resnične napake: `razpored` ima TRI tuje ključe na
 * `profili` - `employee_id` (od začetka) ter `created_by` in `updated_by`
 * (dodana pozneje, sekcija 30 sheme). PostgREST ob zapisu
 *     .select("…, profili(full_name)")
 * ne more vedeti, po katerem od treh naj pripne, zato vrne NAPAKO namesto
 * vrstic. V aplikaciji se to ni pokazalo kot napaka, ampak kot TIHO PRAZEN
 * prikaz: NZV mreža (enote + DEŽURSTVO) je ostala prazna, čeprav je uvoz
 * javil, da je vpisal več sto vrstic - stolpec LD je deloval le zato, ker
 * se bere iz `odsotnosti` prek ločene poizvedbe brez vgnezdenja. Enaka
 * napaka je tiho praznila dežurstva v razporedu vodij (admin.html).
 *
 * Ker gre za napako, ki se NE pokaže kot sporočilo o napaki (samo prazen
 * zaslon), jo je edino zanesljivo loviti staticno: vsak vgnezden zapis nad
 * tabelo z več tujimi ključi na isto ciljno tabelo MORA imeti namig
 * ("profili!employee_id(...)" ali "profili!ime_kljuca(...)").
 *
 * Zagon: node skripte/preveri-vgnezdeni-join.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const shema = readFileSync(join(koren, "supabase/schema.sql"), "utf8");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

// 1) Iz sheme ugotovi, katere tabele imajo VEČ tujih ključev na isto ciljno
//    tabelo - samo pri teh je vgnezden zapis brez namiga dvoumen.
//    Pokrivamo TRI zapise: stolpec v "create table", poznejši
//    "alter table … add column … references …" IN samostojni
//    "alter table only … add constraint … foreign key (…) references …".
//    Tretjega je prinesla konsolidacija sheme (avgust 2026): tuji ključi so
//    zdaj svoj razdelek, da ni krožnih odvisnosti med profili in oddelki.
//    Ta zapis se razteza čez DVE vrstici (ime tabele je na prvi, stolpec in
//    cilj na drugi), zato ga poiščemo v celotnem besedilu, ne po vrsticah.
function preberiVeckratneKljuce(sql) {
  const povezave = {}; // "izvor->cilj" -> [stolpci]
  let trenutnaTabela = null;

  const reOmejitev = /alter table\s+(?:only\s+)?public\.(\w+)\s+add constraint\s+\w+\s+foreign key\s*\(\s*(\w+)\s*\)\s*references\s+public\.(\w+)/gi;
  for (const m of sql.matchAll(reOmejitev)) {
    const k = m[1] + "->" + m[3];
    (povezave[k] = povezave[k] || []).push(m[2]);
  }

  sql.split("\n").forEach(vrstica => {
    const ct = vrstica.match(/create table if not exists\s+public\.(\w+)/i) || vrstica.match(/create table\s+public\.(\w+)/i);
    if (ct) { trenutnaTabela = ct[1]; return; }
    const alter = vrstica.match(/alter table\s+public\.(\w+)\s+add column if not exists\s+(\w+)[^;]*references\s+public\.(\w+)/i);
    if (alter) {
      const k = alter[1] + "->" + alter[3];
      (povezave[k] = povezave[k] || []).push(alter[2]);
      return;
    }
    if (!trenutnaTabela) return;
    if (/^\s*\)\s*;/.test(vrstica)) { trenutnaTabela = null; return; }
    const stolpec = vrstica.match(/^\s*(\w+)\s+[\w ]*references\s+public\.(\w+)/i);
    if (stolpec) {
      const k = trenutnaTabela + "->" + stolpec[2];
      (povezave[k] = povezave[k] || []).push(stolpec[1]);
    }
  });
  return Object.entries(povezave).filter(([, s]) => s.length > 1);
}

const veckratni = preberiVeckratneKljuce(shema);
const veckratniMapa = new Map(veckratni.map(([k, s]) => [k, s]));

console.log("1) shema: prepoznaj tabele z več tujimi ključi na isto ciljno tabelo");
{
  const se = veckratniMapa.get("razpored->profili");
  trdi(!!se && se.length >= 3,
    `razpored -> profili ima več ključev (${se ? se.join(", ") : "NI NAJDENO"}) - vgnezden zapis brez namiga je tu dvoumen`);
}

console.log("2) nobena stran ne uporablja dvoumnega vgnezdenega zapisa");
{
  const strani = readdirSync(koren).filter(f => f.endsWith(".html"));
  let preverjenih = 0;
  strani.forEach(ime => {
    const vsebina = readFileSync(join(koren, ime), "utf8");
    // Poišči vse ".from("X")…select("…")" pare (select je lahko v isti ali
    // naslednji vrstici, zato beremo z omejenim oknom za "from").
    const rx = /\.from\(\s*["'](\w+)["']\s*\)[\s\S]{0,400}?\.select\(\s*(["'])([\s\S]*?)\2/g;
    let m;
    while ((m = rx.exec(vsebina))) {
      const [, tabela, , izbor] = m;
      const vrstica = vsebina.slice(0, m.index).split("\n").length;
      // Vsak vgnezden zapis v izboru: "cilj(...)" ali "cilj!namig(...)",
      // lahko z vzdevkom ("vzdevek:cilj(...)").
      const embedRx = /(?:^|[,\s(])(?:\w+\s*:\s*)?(\w+)(!\w+)?\s*\(/g;
      let e;
      while ((e = embedRx.exec(izbor))) {
        const cilj = e[1], namig = e[2];
        const kljuc = tabela + "->" + cilj;
        if (!veckratniMapa.has(kljuc)) continue; // ena sama povezava - namig ni potreben
        preverjenih++;
        trdi(!!namig,
          `${ime}:~${vrstica} – "${cilj}(...)" nad "${tabela}" (${veckratniMapa.get(kljuc).join(", ")}) ${namig ? "ima" : "NIMA"} namig`);
      }
    }
  });
  trdi(preverjenih > 0, `preverjenih vgnezdenih zapisov nad tabelami z več ključi: ${preverjenih} (če je 0, se je vzorec iskanja razšel s kodo)`);
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
