#!/usr/bin/env node
/* Preizkus stanjeIzKode()/KIND_STANJE (imenik.html) — razvrščanja v pet
 * stanj, ki jih zahteva razpredelnica v Imeniku:
 *   1. na delu, 2. dežurstvo, 3. dopust, 4. bolniška, 5. prosto.
 *
 * Ključno je, da se koda izmene (schedule_entries.shift_code) razvrsti
 * PRAVILNO: to je prosto besedilo brez omejitve v bazi, zapisano tako, kot
 * ga uporabljajo uradne predloge ("dopoldan", "NOČNA od 19h", "DNEVNA12",
 * "KPU" …). Napačna razvrstitev bi v pregledu pokazala, da je nekdo prost,
 * čeprav dela - ali obratno.
 *
 * Posebej pomembno: KPU (koriščenje prostih ur) je PROSTO, ne delo, in
 * dežurstvo mora ostati svoje stanje, ne "delo".
 *
 * Zagon: node skripte/preveri-stanje-razpredelnica.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(koren, "imenik.html"), "utf8");

function izvleci(ime) {
  const zac = html.indexOf("function " + ime + "(");
  if (zac === -1) throw new Error("Funkcije " + ime + " ni v imenik.html.");
  let globina = 0, zacTelo = html.indexOf("{", zac);
  for (let i = zacTelo; i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v imenik.html.");
  const konec = html.indexOf(";\n", zac);
  return html.slice(zac, konec + 1).replace(/^const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` — dobil "${a}", pričakoval "${b}"`));
}

const sandbox = { console };
sandbox.window = sandbox; // imena.js se predstavi prek window, kot v brskalniku
vm.createContext(sandbox);
vm.runInContext([
  izvleciConst("KIND_KRATICA"),
  // Uradna legenda izmen, ujemanje imen in kratko ime živijo v skupnih
  // modulih (izmene.js, imena.js) - tu jih naložimo in preimenujemo v
  // imena, ki jih uporablja izluščena koda iz imenik.html.
  readFileSync(join(koren, "izmene.js"), "utf8"),
  "var STANJE_BARVA = window.Izmene.STANJE_BARVA;",
  "var IZMENA_KRATICE = window.Izmene.KRATICE;",
  "var izmenaVnos = window.Izmene.vnos;",
  "var vnosPoKratici = window.Izmene.poKratici;",
  "var jeProst = window.Izmene.jeProst;",
  "var izmenaKratica = window.Izmene.kratica;",
  "var izmenaBarva = window.Izmene.barva;",
  "var stanjeIzKode = window.Izmene.stanje;",
  "var barvaBesedila = window.Izmene.barvaBesedila;",
  readFileSync(join(koren, "imena.js"), "utf8"),
  "var imenaSeUjemataBrezStresic = window.Imena.seUjemata;",
  "var kratkoIme = window.Imena.kratkoIme;",
].join("\n\n"), sandbox);
const { stanjeIzKode, izmenaKratica, izmenaBarva, vnosPoKratici, barvaBesedila,
        KIND_KRATICA, STANJE_BARVA, IZMENA_KRATICE,
        imenaSeUjemataBrezStresic, kratkoIme } = sandbox;

console.log("1) vseh pet stanj je opredeljenih in ima svojo barvo");
{
  const pricakovana = ["delo", "dezurstvo", "dopust", "bolniska", "prosto"];
  pricakovana.forEach(k => trdi(!!STANJE_BARVA[k] && !!STANJE_BARVA[k].barva && !!STANJE_BARVA[k].naziv,
    `stanje "${k}" ima naziv in barvo`));
  eq(Object.keys(STANJE_BARVA).length, 5, "natanko pet stanj, brez odvečnih");
}

console.log("2) prave kode izmen iz uradnih predlog -> 'na delu'");
{
  ["dopoldan", "popoldan", "popoldan do 19h", "NOČNA", "NOČNA od 19h", "NOČNA12", "DNEVNA12", "DNEVNA12F",
   "PRISOTEN", "POMOČ DRUGJE"].forEach(k => eq(stanjeIzKode(k), "delo", `"${k}" -> na delu`));
}

console.log("3) dežurstvo ostane SVOJE stanje (ne 'delo')");
{
  eq(stanjeIzKode("DEŽURSTVO"), "dezurstvo", '"DEŽURSTVO" -> dežurstvo');
  eq(stanjeIzKode("dezurstvo"), "dezurstvo", "brez šumnikov (kot pride iz nekaterih izvozov)");
  // Prikaz "PRISOTEN + DEŽURSTVO" nastane šele v index.html; v razpredelnici
  // se bere surova koda iz baze, ki je "DEŽURSTVO".
}

console.log("4) odsotnosti");
{
  eq(stanjeIzKode("LD"), "dopust", '"LD" -> dopust');
  eq(stanjeIzKode("POR"), "dopust", '"POR" (porodniški) -> dopust');
  eq(stanjeIzKode("STI"), "dopust", '"STI" -> dopust');
  eq(stanjeIzKode("BS"), "bolniska", '"BS" -> bolniška');
  eq(KIND_KRATICA.ld, "LD", "leave_entries kind 'ld' -> kratica LD");
  eq(KIND_KRATICA.bs, "BS", "leave_entries kind 'bs' -> kratica BS");
  eq(KIND_KRATICA.sti, "STI", "leave_entries kind 'sti' -> kratica STI");
  trdi(KIND_KRATICA.omejitev === null, "'omejitev' (rumena želja) NI odsotnost - oseba je na delu, le z omejitvijo");
  ["LD", "BS", "STI"].forEach(k => trdi(!!vnosPoKratici(k),
    `kratica "${k}" iz Želja obstaja tudi v uradni legendi (sicer bi celica ostala brez barve)`));
}

console.log("5) KPU in prazno -> prosto (ne 'na delu')");
{
  eq(stanjeIzKode("KPU"), "prosto", '"KPU" (koriščenje prostih ur) -> prosto, ne delo');
  eq(stanjeIzKode(""), "prosto", "prazna koda -> prosto");
  eq(stanjeIzKode(null), "prosto", "manjkajoč zapis -> prosto (ni v razporedu)");
  eq(stanjeIzKode(undefined), "prosto", "undefined -> prosto");
}

console.log("6) presledki in velikost črk ne motijo");
{
  eq(stanjeIzKode("  NOČNA 12  "), "delo", "presledki okoli in znotraj kode");
  eq(stanjeIzKode("Dežurstvo"), "dezurstvo", "mešana velikost črk");
  eq(stanjeIzKode("ld"), "dopust", "male črke");
}

console.log("7) neznana koda šteje kot DELO (varneje kot 'prosto')");
{
  // Če se v predlogi pojavi nova, še nepoznana koda izmene, je bolje
  // pokazati "na delu" kot lažno "prosto" - lažno prost dan bi lahko
  // pomenil, da koordinator nekoga po nesreči razporedi še enkrat.
  eq(stanjeIzKode("nekaj novega"), "delo", "neznana koda -> na delu, ne prosto");
}

console.log("8) uradne kratice iz delovnik.xlsx — največ 3 znaki, izjema DF12");
{
  // Uporabnikovo pravilo: "EDINO DNEVNA12 7-19 IMA 4 ČRKE".
  IZMENA_KRATICE.forEach(([, kratica, naziv, , barva, skupina]) => {
    const meja = kratica === "DF12" ? 4 : 3;
    trdi(kratica.length > 0 && kratica.length <= meja,
      `kratica "${kratica}" ima največ ${meja} znake`);
    trdi(!!naziv, `kratica "${kratica}" ima razlago za legendo`);
    trdi(/^#[0-9A-Fa-f]{6}$/.test(barva), `kratica "${kratica}" ima svojo barvo`);
    trdi(!!STANJE_BARVA[skupina], `kratica "${kratica}" je uvrščena v znano stanje ("${skupina}")`);
  });
  const dolge = IZMENA_KRATICE.filter(v => v[1].length > 3).map(v => v[1]);
  trdi(dolge.length === 1 && dolge[0] === "DF12", "DF12 je EDINA štiričrkovna kratica");
}

console.log("9) vsaka kratica ima SVOJO barvo (zahteva: 'vse razlikuj po barvah')");
{
  const kratice = IZMENA_KRATICE.map(v => v[1]);
  trdi(new Set(kratice).size === kratice.length, "nobena kratica se ne ponovi");
  const barve = IZMENA_KRATICE.map(v => v[4].toUpperCase());
  trdi(new Set(barve).size === barve.length, "nobena barva se ne ponovi (drugače se dve izmeni ne bi ločili)");
}

console.log("10) preslikava kod aplikacije v uradne kratice");
{
  eq(izmenaKratica("dopoldan"), "DOP", "dopoldan (05:50-14:00)");
  eq(izmenaKratica("popoldan"), "PO7", "popoldan (13:50-21:00)");
  eq(izmenaKratica("popoldan do 19h"), "PO5", "popoldan do 19 ni 'PO7'");
  eq(izmenaKratica("NOČNA"), "N10", "nočna (20:50-06:00)");
  eq(izmenaKratica("NOČNA od 19h"), "N11", "nočna od 19 = Nočna 11");
  eq(izmenaKratica("Nočna 11"), "N11", "isto izmeno uradna datoteka imenuje 'Nočna 11'");
  eq(izmenaKratica("NOČNA12"), "N12", "nočna 12 ni 'N10'");
  eq(izmenaKratica("DNEVNA12"), "D12", "dnevna 12");
  eq(izmenaKratica("DNEVNA12F"), "DF12", "dnevna 12 (7-19) je DF12, ne 'D12'");
  eq(izmenaKratica("DEŽURSTVO"), "DEŽ", "dežurstvo");
  eq(izmenaKratica("KPU"), "KPU", "koriščenje prostih ur");
  eq(izmenaKratica("POMOČ DRUGJE"), "POM", "pomoč na drugem oddelku");
}

console.log("10b) odstranjene kode (DF7 / DP7 / POM) so odslej neznane");
{
  // Uporabnikova odločitev (avgust 2026): navzkrižno pokrivanje se ne
  // vodi več kot svoja izmena. Kode ni več v legendi, a se ne sme
  // izgubiti tiho - celica mora ostati vidna, le nevtralno siva.
  eq(izmenaBarva("dop. 7.h-13.h"), "#8B8672", "flexi dopoldne je zdaj neznana koda");
  eq(izmenaBarva("pop. 14.h-20.h"), "#8B8672", "flexi popoldne prav tako");
  eq(izmenaBarva("POMOČ DRUGJE"), "#8B8672", "pomoč na drugem oddelku prav tako");
  eq(stanjeIzKode("POMOČ DRUGJE"), "delo", "a še vedno šteje kot delo, ne kot prosto");
}

console.log("10c) kode, potrjene na PRAVI datoteki 2026_SMS_RAZPORED_2.xlsx");
{
  // Vse kode izmen, ki se v tej datoteki dejansko pojavijo (zavihek FLEXI,
  // junij-september 2026), s številom pojavitev iz suhega zagona.
  eq(izmenaKratica("DNEVNA12 (7-19)"), "DF12",
    '"DNEVNA12 (7-19)" (49x) je DF12, NE D12 - to sta dve različni izmeni');
  eq(izmenaKratica("DNEVNA12"), "D12", '"DNEVNA12" (48x) ostane D12');
  trdi(izmenaKratica("DNEVNA12 (7-19)") !== izmenaKratica("DNEVNA12"),
    "zapisa se ne smeta zliti (07:00-19:00 proti 05:50-18:00)");
  eq(izmenaKratica("dopoldan (7-15h)"), "DOP", '"dopoldan (7-15h)" (48x) - DMS urnik, isti DOP');
  eq(izmenaKratica("dopoldan (M)"), "DOP", '"(M)" = mentor pripravniku, izmena ostane ista');
  eq(izmenaKratica("popoldan (M)"), "PO7", "isto za popoldan");
  eq(izmenaKratica("NOČNA od 19 (M)"), "N11", "isto za nočno od 19");
  eq(izmenaKratica("popoldan do 19"), "PO5", '"popoldan do 19" brez "h"');
  // "popoldan do 20" ni v uradni legendi; uporabnik je potrdil PO6 po
  // vzorcu PO5 = 5 ur, PO7 = 7 ur.
  eq(izmenaKratica("popoldan do 20"), "PO6", '"popoldan do 20" (10x) -> PO6');
  eq(izmenaKratica("popoldan do 20h"), "PO6", 'in različica z "h"');
  trdi(new Set([izmenaKratica("popoldan do 19"), izmenaKratica("popoldan do 20"),
    izmenaKratica("popoldan")]).size === 3, "vse tri popoldanske izmene ostanejo ločene");
  eq(izmenaKratica("POR"), "POR", '"POR" (70x) porodniški');
  eq(izmenaKratica("STI"), "STI", '"STI" strokovno izobraževanje');
}

console.log("10e) omejen delovni čas: DO6 / DO4 / PO4");
{
  // Za zaposlene z omejitvijo delovnega časa na 4 oz. 6 ur na dan.
  eq(izmenaKratica("dopoldan (6h)"), "DO6", '"dopoldan (6h)"');
  eq(izmenaKratica("dopoldan 6 ur"), "DO6", '"dopoldan 6 ur"');
  eq(izmenaKratica("dop. 6h"), "DO6", '"dop. 6h"');
  eq(izmenaKratica("dopoldan (4h)"), "DO4", '"dopoldan (4h)"');
  eq(izmenaKratica("dopoldan 4 ure"), "DO4", '"dopoldan 4 ure"');
  eq(izmenaKratica("popoldan (4h)"), "PO4", '"popoldan (4h)"');
  eq(izmenaKratica("pop. 4 ure"), "PO4", '"pop. 4 ure"');
  eq(stanjeIzKode("dopoldan (4h)"), "delo", "omejen delovnik je še vedno delo");

  // Ključno: te vzorce se NE sme sprožiti pri obstoječih kodah, kjer se
  // števka 4 ali 6 pojavi v urah. Preverjeno na vseh kodah iz prave
  // datoteke, ki se začnejo z "dop"/"pop".
  eq(izmenaKratica("dopoldan (7-15h)"), "DOP", "DMS dopoldan ostane DOP");
  eq(izmenaKratica("dopoldan"), "DOP", "navaden dopoldan ostane DOP");
  eq(izmenaKratica("popoldan"), "PO7", "navaden popoldan ostane PO7");
  eq(izmenaKratica("popoldan do 19"), "PO5", "popoldan do 19 ostane PO5");
  eq(izmenaKratica("popoldan do 20"), "PO6", "popoldan do 20 ostane PO6");
  eq(izmenaKratica("popoldan (M)"), "PO7", "popoldan z mentorstvom ostane PO7");
  eq(izmenaKratica("dopoldan (M)"), "DOP", "dopoldan z mentorstvom ostane DOP");
}

console.log("10d) 'prost' pomeni prost dan, ne neznano kodo");
{
  // V predlogi se enkrat pojavi izrecna beseda "prost". Brez tega pravila
  // bi dobila kratico "PRO" in sivo barvo, kot da je neprepoznana izmena.
  eq(izmenaKratica("prost"), "", '"prost" -> prazna celica');
  eq(izmenaKratica("Prosto"), "", '"Prosto" prav tako');
  eq(stanjeIzKode("prost"), "prosto", "in šteje kot prosto, ne kot delo");
  eq(izmenaBarva("prost"), izmenaBarva(""), "ista barva kot prazen dan");
}

console.log("11) 'PRISOTEN' je DOP, ne svoja kratica (uporabnik: PRI odstrani)");
{
  // Uradna datoteka ima DMS/vodje PON-PET 07:00-15:00 pod kratico DOP,
  // aplikacija pa za NZV/vodje zapisuje kodo "PRISOTEN".
  eq(izmenaKratica("PRISOTEN"), "DOP", '"PRISOTEN" -> DOP');
  trdi(!IZMENA_KRATICE.some(v => v[1] === "PRI"), "kratice 'PRI' v legendi NI");
}

console.log("12) daljše/bolj določne kode se ne 'požrejo' krajšim");
{
  // Najlažja napaka v takem seznamu: če bi /^nočna/ stalo pred /^nočna12/,
  // bi vse nočne izgledale enako in razpored bi bil napačen.
  trdi(izmenaKratica("NOČNA12") !== izmenaKratica("NOČNA"), "NOČNA12 != NOČNA");
  trdi(izmenaKratica("NOČNA od 19") !== izmenaKratica("NOČNA"), "NOČNA od 19 != NOČNA");
  trdi(izmenaKratica("DNEVNA12F") !== izmenaKratica("DNEVNA12"), "DNEVNA12F != DNEVNA12");
  trdi(izmenaKratica("popoldan do 19") !== izmenaKratica("popoldan"), "popoldan do 19 != popoldan");
}

console.log("13) presledki, pike in velikost črk ne motijo");
{
  eq(izmenaKratica("  NOČNA 12  "), "N12", "presledki okoli in znotraj");
  eq(izmenaKratica("nočna od 19 h"), "N11", "presledki znotraj 'od 19 h'");
  eq(izmenaKratica("Dežurstvo"), "DEŽ", "mešana velikost črk");
  eq(izmenaKratica("popoldan.do.19"), "PO5", "pike med besedami");

  // NE pa delnih izmen iz preglednic ("dop. 7.h-13.h", "pop. 14.h-20.h" -
  // flexi navzkrižno pokrivanje v zavihku KALUP). To NISO uradne izmene:
  // 14:00-20:00 ni isto kot popoldan 13:50-21:00. Če bi jih preslikali v
  // PO7, bi razpredelnica trdila, da nekdo dela izmeno, ki je ne dela.
  // Skrajšava neznane kode lahko po naključju izpade enako kot uradna
  // kratica. Loči ju BARVA: neprepoznane kode dobijo nevtralno sivo,
  // uradne pa svojo barvo iz legende.
  trdi(izmenaBarva("dopust brez placila") !== izmenaBarva("dopoldan"),
    "neprepoznana koda ima drugo barvo kot uradni dopoldan");
}

console.log("14) prazna in neznana koda");
{
  eq(izmenaKratica(""), "", "prazna koda -> prazna celica (prost dan)");
  eq(izmenaKratica(null), "", "manjkajoč zapis -> prazna celica");
  // Neznana koda se NE sme tiho izgubiti - prazna celica bi izgledala kot
  // prost dan, kar je pri razporedu nevarno.
  eq(izmenaKratica("nekaj novega"), "NEK", "neznana koda -> prvi trije znaki, ne prazno");
  trdi(izmenaBarva("nekaj novega") !== izmenaBarva(""), "neznana koda ima drugo barvo kot prost dan");
}

console.log("15) barva pisave je berljiva na vsaki podlagi");
{
  IZMENA_KRATICE.forEach(([, kratica, , , barva]) => {
    const b = barvaBesedila(barva);
    trdi(b === "#2B2717" || b === "#FFFFFF", `kratica "${kratica}" dobi belo ali temno pisavo`);
  });
  eq(barvaBesedila("#2F4785"), "#FFFFFF", "na temni modri (N12) bela pisava");
  eq(barvaBesedila("#B49BD0"), "#2B2717", "na svetli vijolični (DF12) temna pisava");
}

console.log("16) legenda in menjave so v imenik.html res prikazane");
{
  const html2 = readFileSync(join(koren, "imenik.html"), "utf8");
  trdi(/IZMENA_KRATICE\.filter\(v => v\[5\] === skupina\)/.test(html2),
    "legenda je razvrščena po petih stanjih");
  // Legenda mora biti zložena (na telefonu je odprta zavzela cel zaslon)
  // in enakomerno poravnana: kratica vedno prva, vedno enako široka.
  trdi(/legendaOdprta/.test(html2), "legenda se da zložiti/odpreti");
  trdi(/useState\(false\);\n\n?\s*const dnevi|legendaOdprta, setLegendaOdprta\] = useState\(false\)/.test(html2),
    "privzeto je zložena");
  trdi(/gridTemplateColumns:"48px 1fr"/.test(html2),
    "razlage so poravnane v mrežo s fiksnim stolpcem za kratico");
  trdi(/className="infoToggle"/.test(html2), "odpira jo gumb 'i'");
  trdi(/barvaBesedila\(barva\)/.test(html2), "legenda in celice uporabljajo berljivo pisavo");
  trdi(/kratica: izmenaKratica\(v\.shift_code\)/.test(html2), "kratica se računa iz kode izmene v razporedu");
  trdi(/barva: izmenaBarva\(v\.shift_code\)/.test(html2), "barva celice pride iz kratice");
  // Menjava: izmene v schedule_entries zamenja baza (obrazec_potrdi_koordinator),
  // razpredelnica jih zato vidi samodejno - tu preverjamo samo vidno oznako.
  // Menjave se berejo iz pogleda menjave_javno (shema, sekcija 33), ne iz
  // obrazci: RLS na obrazci pokaže tuje menjave le za tekoči mesec, zato
  // je oznaka za druge mesece manjkala.
  trdi(/from\("menjave_javno"\)/.test(html2), "menjave se berejo iz pogleda menjave_javno");
  trdi(!/from\("obrazci"\)/.test(html2), "ne bere se več neposredno iz obrazci (ozek RLS)");
  const shema = readFileSync(join(koren, "supabase", "schema.sql"), "utf8");
  const pogled = shema.slice(shema.indexOf("create view public.menjave_javno"));
  trdi(/status = 'zakljucen'/.test(pogled.slice(0, 600)), "pogled vsebuje SAMO potrjene menjave");
  trdi(!/opomba|razlog_zavrnitve/.test(pogled.slice(0, 600)),
    "pogled ne izpostavi opomb ne razlogov zavrnitve (samo kdo/kdaj)");
  trdi(!/security_invoker/.test(pogled.slice(0, 600)),
    "pogled teče s pravicami lastnika - to je edini način, da pokaže vse mesece");
  trdi(/grant select on public\.menjave_javno to authenticated/.test(shema),
    "pogled je berljiv vsem prijavljenim");
  trdi(/revoke all on public\.menjave_javno from anon/.test(shema),
    "neprijavljeni (anon) do pogleda NIMAJO dostopa");
  trdi(/setMenjani\(mm\)/.test(html2), "dnevi s potrjeno menjavo se označijo");
  trdi(/↔/.test(html2), "oznaka menjave (↔) je v celici in razložena v legendi");
}

console.log("17) seznam pokrivanj (lead_departments) se poveže s pravo osebo");
{
  // lead_departments hrani ime kot prosto besedilo, brez povezave na
  // profil. Uradne opombe ga pišejo po svoje - drug vrstni red besed in
  // druge strešice - zato primerjamo vrečo besed brez strešic.
  trdi(imenaSeUjemataBrezStresic("Lelič Dijana", "Dijana Lelić"),
    '"Lelič Dijana" = "Dijana Lelić" (obrnjeno IN druga strešica)');
  trdi(imenaSeUjemataBrezStresic("MAVRI TRATNIK MAGDALENA", "Magdalena Mavri Tratnik"),
    "tričlensko ime v obratnem vrstnem redu");
  trdi(imenaSeUjemataBrezStresic("Bećirović Nelvedin", "BECIROVIC NELVEDIN"),
    "velike/male črke in strešice");
  trdi(!imenaSeUjemataBrezStresic("Pogačnik Teja", "Pogačnik Matej"),
    "dva Pogačnika NISTA ista oseba");
  trdi(!imenaSeUjemataBrezStresic("Lelič Dijana", ""), "prazno ime se ne ujema z nikomer");
  trdi(!imenaSeUjemataBrezStresic("", ""), "dve prazni imeni se prav tako ne ujemata");

  eq(kratkoIme("MAVRI TRATNIK MAGDALENA"), "Mavri", "v ozkem stolpcu se izpiše priimek");
  eq(kratkoIme("BOJIĆ MATEJ"), "Bojić", "s pravilnimi šumniki");
  eq(kratkoIme(""), "", "prazno ostane prazno");

  const html3 = readFileSync(join(koren, "imenik.html"), "utf8");
  trdi(/from\("lead_departments"\)\.select\("full_name, inicialke, enote/.test(html3),
    "razpredelnica bere nosilce oddelkov");
  // Pokrivanje je VZAJEMNO in VEČKRATNO (Alukića nadomeščata Bojić IN
  // Džamastagić), zato tabela parov in ne en sam stolpec.
  trdi(/from\("nadomescanja"\)\.select\("nosilec, nadomesca, enota, prednost"\)/.test(html3),
    "pokrivanja se berejo iz tabele parov");
  trdi(/nadomescajoMene/.test(html3) && /pokrivam/.test(html3),
    "izračunata se OBE smeri: kdo nadomešča mene in koga pokrivam jaz");
  trdi(/\(a\.prednost \|\| 1\) - \(b\.prednost \|\| 1\)/.test(html3),
    "nadomeščevalci so razvrščeni po prednosti (kdo je prvi na vrsti)");
  trdi(/nadomešča: " \+ nosilec\.nadomescajoMene\.join/.test(html3),
    "ob dopustu/bolniški opis pove, kdo pokriva");

  trdi(/function NadomescanjaPregled\(\)/.test(html3),
    "pregled nadomeščanj (Oseba | Enote | Nadomeščajo mene | Pokrivam) obstaja");
  // Primerjava imen ne sme biti dobesedna (viri pišejo strešice različno),
  // zato gre prek skupnega modula - a OBE smeri morata še vedno brati iz
  // istega seznama parov, sicer se lahko razideta.
  trdi(/ujem\(v\.nadomesca, n\.full_name\)/.test(html3) && /ujem\(v\.nosilec, n\.full_name\)/.test(html3),
    "obe smeri se izpeljeta iz ISTE tabele parov - ne moreta se razhajati");
  trdi(/const ujem = \(a, b\) => imenaSeUjemataBrezStresic\(a, b\)/.test(html3),
    "in imena se primerjajo prek skupnega modula, ne dobesedno");
  trdi(/filter\(n => jeResnicna\(n\.full_name\)\)/.test(html3),
    "prikažejo se samo vrstice, ki se povežejo z resnično osebo (pokvarjeni zapisi odpadejo)");

  const sql = readFileSync(join(koren, "supabase", "nzv-nadomescanja.sql"), "utf8");
  trdi(/primary key \(nosilec, nadomesca\)/.test(sql),
    "ključ je PAR - ista oseba ima lahko več nadomeščevalcev");
  ["('ALUKIĆ DINO',             'BOJIĆ MATEJ'",
   "('ALUKIĆ DINO',             'DŽAMASTAGIĆ DENIS'",
   "('BOJIĆ MATEJ',             'ALUKIĆ DINO'",
   "('BOJIĆ MATEJ',             'DŽAMASTAGIĆ DENIS'",
   "('DŽAMASTAGIĆ DENIS',       'ALUKIĆ DINO'",
   "('DŽAMASTAGIĆ DENIS',       'BOJIĆ MATEJ'",
   "('VELUŠČEK METKA',          'DŽAMASTAGIĆ DENIS'"].forEach(v => {
    trdi(sql.includes(v), "navzkrižno pokrivanje: " + v.replace(/\s+/g, " "));
  });

  // Popravki iz uporabnikove razpredelnice (Razpored_nadomescanj.xlsx):
  trdi(/'VELUŠČEK METKA',\s+'ALUKIĆ DINO'/.test(sql) && /'VELUŠČEK METKA',\s+'BOJIĆ MATEJ'/.test(sql),
    "Velušček nadomeščajo VSI TRIJE administratorji, ne samo Džamastagić");
  trdi(/'SALKIĆ MARUŠA',\s+'ARNEŽ GREGA',\s+'C1'/.test(sql),
    "Salkić Marušo pokriva Arnež (C1) - prej ni imela nikogar");
  // Enota je tisto, kar nadomeščevalec DEJANSKO prevzame, ne ves nabor
  // enot odsotnega: Lelič ob Maglićevi odsotnosti pokrije samo E1.
  trdi(/'MAGLIĆ ALEKSANDER',\s+'LELIČ DIJANA',\s+'E1',/.test(sql),
    "Lelič ob Maglićevi odsotnosti pokrije samo E1 (ne E1/D)");
  trdi(/'ARNEŽ GREGA',\s+'LUNAR MATEJA',\s+'C',/.test(sql),
    "Lunar ob Arneževi odsotnosti pokrije samo C (ne C/C1)");

  // Trojka UA/SA se kombinira med seboj - nobena od treh ne sme ostati
  // brez kritja (uporabnikova izrecna navedba).
  trdi(/'BIZJAK TEA',\s+'TRPIN SAŠA'/.test(sql) && /'BIZJAK TEA',\s+'MUŠIČ INES'/.test(sql),
    "Bizjak nadomeščata Trpin in Mušič");
  trdi(/'MUŠIČ INES',\s+'BIZJAK TEA'/.test(sql) && /'MUŠIČ INES',\s+'TRPIN SAŠA'/.test(sql),
    "Mušič nadomeščata Bizjak in Trpin");
  trdi(/'TRPIN SAŠA',\s+'BIZJAK TEA'/.test(sql) && /'TRPIN SAŠA',\s+'MUŠIČ INES'/.test(sql),
    "Trpin nadomeščata Bizjak in Mušič");

  // Pogačnik NAMENOMA ostaja brez - uporabnikova odločitev, ne pozabljen
  // vnos. Če bi kdo pozneje "popravil" to kot manjkajoče, naj tu pade.
  trdi(!/^\s*\('POGAČNIK TEJA',/m.test(sql),
    "Pogačnik Teja namenoma ostaja brez nadomeščevalca");
  trdi(/Pogačnik Teja NAMENOMA ostaja brez/.test(sql),
    "in to je v skripti tudi zapisano, da se ne bere kot pomota");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO — " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
