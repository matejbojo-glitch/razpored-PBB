#!/usr/bin/env node
/* Preizkus zdravnikiOpozoriloBesedilo() in poti do njega v index.html.
 *
 * Ozadje: uporabnik je večkrat javil, da mu aplikacija ob dežurstvu ne
 * pokaže, s katerim ZDRAVNIKOM je dežuren. Prikaz sam je bil ves čas
 * pravilen - tiho pa je odpovedalo pridobivanje podatkov: če tabele
 * duty_doctors v bazi ni (shema še ni pognana) ali za prikazani mesec ni
 * naloženega uradnega PDF-ja, poizvedba ni vrnila nič, koda pa je rezultat
 * zavrgla brez sledi. Uporabnik ni imel NAČINA izvedeti, zakaj imena ni.
 *
 * Ta preizkus varuje troje:
 *   1. besedilo opozorila loči "tabele ni" od "za ta mesec ni podatkov",
 *   2. opozorilo se NE prikaže tistim, ki ta mesec dežurstva sploh nimajo,
 *   3. koda napako iz Supabase res prebere (42P01) in stanje shrani -
 *      ne pa je spet tiho požre.
 *
 * Zagon: node skripte/preveri-zdravniki-opozorilo.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "index.html"), "utf8");

function izvleci(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v index.html.");
  let globina = 0;
  const zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([izvleci("zdravnikiOpozoriloBesedilo"), izvleci("zdravnikiZaDan")].join("\n\n"), sandbox);
const { zdravnikiOpozoriloBesedilo: opozorilo, zdravnikiZaDan } = sandbox;

console.log("1) brez dežurstva v mesecu ni opozorila (ne zadeva vseh)");
{
  ["nalagam", "ok", "ni-tabele", "prazno"].forEach(st =>
    trdi(opozorilo(false, st) === null, `stanje "${st}" brez dežurstva -> brez opozorila`));
}

console.log("2) med nalaganjem in ob uspehu ni opozorila");
{
  trdi(opozorilo(true, "nalagam") === null, "med nalaganjem molči (ne utripa ob vsakem odprtju)");
  trdi(opozorilo(true, "ok") === null, "ko so imena naložena, opozorila ni");
}

console.log("3) manjkajoča tabela -> navodilo za shemo");
{
  const t = opozorilo(true, "ni-tabele");
  trdi(typeof t === "string" && t.length > 0, "vrne besedilo");
  trdi(/schema\.sql/.test(t), "pove, katero datoteko je treba pognati (schema.sql)");
  trdi(/32/.test(t), "pove razdelek sheme (32), da ni treba brskati");
  trdi(!/PDF/.test(t), "NE pošilja po PDF - to ni vzrok, ko manjka tabela");
}

console.log("4) tabela obstaja, a za mesec ni podatkov -> navodilo za uvoz PDF");
{
  const t = opozorilo(true, "prazno");
  trdi(typeof t === "string" && t.length > 0, "vrne besedilo");
  trdi(/PDF/.test(t), "napoti na uvoz PDF");
  trdi(/UA in DEŽ/.test(t), "poimenuje uradni dokument »Razporeditev zaposlenih v UA in DEŽ«");
  trdi(!/schema\.sql/.test(t), "NE pošilja v SQL Editor - shema je v redu, manjka le mesec");
  trdi(t !== opozorilo(true, "ni-tabele"), "obe besedili se razlikujeta (drug vzrok, drug ukrep)");
}

console.log("5) neznano stanje se obravnava kot 'ni podatkov', ne kot molk");
{
  trdi(typeof opozorilo(true, "nekaj-cisto-drugega") === "string",
    "nepričakovano stanje raje pojasni, kot da spet tiho molči");
}

console.log("6) index.html napako iz Supabase res prebere in shrani");
{
  trdi(/setZdravnikiStanje/.test(html), "stanje poizvedbe se sploh hrani");
  trdi(/42P01/.test(html), "manjkajoča tabela se prepozna po kodi 42P01");
  trdi(/schema cache/.test(html), "prepozna tudi PostgREST sporočilo o predpomnilniku sheme");
  const ucinek = html.slice(html.indexOf('client.from("duty_doctors")'));
  trdi(/\{ data, error \}/.test(ucinek.slice(0, 400)),
    "poizvedba duty_doctors prebere tudi 'error', ne samo 'data'");
  trdi(/zdravnikiOpozorilo && \(/.test(html), "opozorilo se v Moj razpored tudi izriše");
  trdi(/const zdravnikiOpozorilo = zdravnikiOpozoriloBesedilo\(imamDezurstvo, zdravnikiStanje\)/.test(html),
    "prikaz uporablja preizkušeno funkcijo (ne podvojene logike)");
}

console.log("7) 'imam dežurstvo' se ugotavlja iz razvrstitve kode, ne iz besedila");
{
  // classify("DEŽURSTVO") === "dez"; če bi kdo primerjal z dobesednim
  // nizom, bi NZV prikaz "PRISOTEN + DEŽURSTVO" ali male črke iz uvoza
  // pravilo obšli.
  trdi(/classify\(byDate\[dn\.datum\]\) === "dez"/.test(html),
    "uporablja classify(...) === 'dez'");
}

console.log("8) izpišeta se OBA zdravnika dneva (Dežurstvo ZDR in Urgenca ZDR)");
{
  // Uradni dokument ima dva ločena stolpca, v "Moj razpored" pa gre SAMO
  // dežurni zdravnik: urgentnega dežurna medicinska sestra ne potrebuje,
  // dve vrstici pod izmeno pa sta na telefonu odveč (uporabnikova
  // zahteva, avgust 2026). Urgentni ostane viden v Razporedu, v tabeli
  // "Dežurstva - urgenca in NZV", in se še naprej uvaža iz PDF-ja.
  const oba = zdravnikiZaDan({ dezurstvo: "Ana Novak", urgenca: "Bojan Kos" });
  trdi(oba.length === 1, "izpiše se ena sama vrstica");
  trdi(oba[0].ime === "Ana Novak", "in to dežurni zdravnik");
  trdi(oba[0].oznaka === "DEŽ", "s kratico DEŽ");

  trdi(zdravnikiZaDan({ dezurstvo: "Ana Novak" }).length === 1, "samo dežurstvo -> ena vrstica");
  trdi(zdravnikiZaDan({ urgenca: "Bojan Kos" }).length === 0,
    "samo urgenca -> v Mojem razporedu se NE izpiše");
  trdi(zdravnikiZaDan(undefined).length === 0, "za dan brez podatka nič (brez sesutja)");
  trdi(zdravnikiZaDan({}).length === 0, "prazen zapis -> nič");
}

console.log("9) uvoz res piše obe vrsti, ki ju prikaz pričakuje");
{
  trdi(/kind: "urgenca"/.test(html), 'uvoz zapisuje kind "urgenca"');
  trdi(/kind: "dezurstvo"/.test(html), 'uvoz zapisuje kind "dezurstvo"');
  trdi(/m\[r\.work_date\]\[r\.kind\] = r\.full_name/.test(html),
    "prikaz shrani ime pod ključ kind (torej se ujema z uvozom)");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
