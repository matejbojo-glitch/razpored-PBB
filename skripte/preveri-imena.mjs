#!/usr/bin/env node
/* Preizkus imena.js – ujemanje imen med viri.
 *
 * Zakaj obstaja: isto osebo pišejo trije viri vsak po svoje (drug vrstni
 * red besed, velike/male črke, izgubljene strešice), povrhu pa sta v
 * uradnih predlogah dve POTRJENI tipkarski napaki. Doslej je imel vsak
 * zaslon svojo različico primerjave in vsaka je bila drugače stroga –
 * ista oseba se je na enem zaslonu našla, na drugem pa ne.
 *
 * Najpomembnejši del tega preizkusa je 4. sklop: nova primerjava je
 * OHLAPNEJŠA od nekaterih prejšnjih, zato na RESNIČNEM seznamu zaposlenih
 * preverimo, da vseeno ne zlije dveh RAZLIČNIH oseb v eno. Brez tega bi
 * bila poenotenje tvegano ugibanje.
 *
 * Zagon: node skripte/preveri-imena.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  trdi(a === b, opis + (a === b ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
const I = sandbox.window.Imena;

console.log("1) vrstni red besed ni pomemben (vsak vir piše po svoje)");
{
  trdi(I.seUjemata("Mavri Tratnik Magdalena", "MAGDALENA MAVRI TRATNIK"), "tri besede, obrnjeno");
  trdi(I.seUjemata("Alukić Dino", "Dino Alukić"), "dve besedi, obrnjeno");
  trdi(I.seUjemata("  bojić   matej ", "MATEJ BOJIĆ"), "odvečni presledki in male črke");
}

console.log("2) strešice se pri primerjavi ne upoštevajo (izvozi jih izgubljajo)");
{
  trdi(I.seUjemata("Alukić Dino", "ALUKIC DINO"), "Alukić = Alukic");
  trdi(I.seUjemata("Džamastagić Denis", "DZAMASTAGIC DENIS"), "Džamastagić = Dzamastagic");
  trdi(I.seUjemata("Šubic Petra", "SUBIC PETRA"), "Šubic = Subic");
  trdi(I.seUjemata("Arnež Grega", "ARNEZ GREGA"), "Arnež = Arnez");
}

console.log("3) potrjeni tipkarski napaki iz uradnih predlog");
{
  trdi(I.seUjemata("HORVAT NINA", "Hrovat Nina"), "Horvat = Hrovat (zamenjan vrstni red črk)");
  trdi(I.seUjemata("TOMAŽEVIĆ SIMONA", "Tomaževič Simona"), "Tomažević = Tomaževič");
  // In da to NISO splošna pravila, ki bi zlila kar koli:
  trdi(!I.seUjemata("Horvat Nina", "Horvat Ana"), "različno ime se ne zlije");
  trdi(!I.seUjemata("Novak Ana", "Novak Ane"), "podobno, a različno ime se ne zlije");
}

console.log("4) na RESNIČNEM seznamu zaposlenih ne zlije dveh različnih oseb");
{
  // Vir: roster/imenik-uvoz.csv (uvozni seznam, ki je bil dejansko
  // uporabljen) – prvi stolpec je polno ime.
  const csv = readFileSync(join(koren, "roster", "imenik-uvoz.csv"), "utf8");
  const imena = csv.split("\n").slice(1)
    .map(v => (v.split(",")[0] || "").trim())
    .filter(Boolean);
  trdi(imena.length > 40, `seznam prebran (${imena.length} oseb)`);

  const poKljucu = {};
  const trki = [];
  imena.forEach(ime => {
    const k = I.kljuc(ime);
    if (poKljucu[k] && poKljucu[k] !== ime) trki.push(`${poKljucu[k]} ⟷ ${ime}`);
    else poKljucu[k] = ime;
  });
  trdi(trki.length === 0, "nobeni dve različni osebi nimata istega ključa"
    + (trki.length ? " – trki: " + trki.join("; ") : ""));

  // In obratno: vsaka oseba se najde sama pri sebi, tudi če vir zapiše
  // ime v drugem vrstnem redu ali brez strešic (kar se v praksi dogaja).
  const nenajdene = imena.filter(ime => {
    const obrnjeno = ime.trim().split(/\s+/).reverse().join(" ");
    return !I.seUjemata(ime, obrnjeno) || !I.seUjemata(ime, I.brezStresic(ime));
  });
  trdi(nenajdene.length === 0, "vsaka oseba se najde tudi v obrnjenem zapisu in brez strešic"
    + (nenajdene.length ? " – ne najde: " + nenajdene.slice(0, 5).join(", ") : ""));
}

console.log("4b) kratko ime iz preglednice se ujame s polnim imenom iz Imenika");
{
  // Preglednica "2026 SMS RAZPORED" ima v glavi stolpca "PRIIMEK X.",
  // Imenik pa polno ime. Doslej sta se primerjala DOBESEDNO, zato je vsak
  // drugačen zapis strešice pomenil neujemanje - in stolpec te osebe je
  // pri uvozu tiho ostal prazen. Natanko to se je zgodilo Bećiroviću:
  // preglednica ga piše "BEČIROVIĆ N." (Č), Imenik "Bećirović" (Ć).
  const ujema = (polno, izPredloge) => I.kratkiKljuc(polno) === I.kratkiKljuc(izPredloge);
  trdi(ujema("Bećirović Nelvedin", "BEČIROVIĆ N."), "Bećirović = BEČIROVIĆ N. (druga strešica)");
  trdi(ujema("Gazibara Aldin", "GAZIBARA A."), "Gazibara Aldin = GAZIBARA A.");
  trdi(ujema("Rozman Klara", "ROZMAN K."), "Rozman Klara = ROZMAN K.");
  trdi(ujema("Mavri Tratnik Magdalena", "MAVRI TRATNIK M."), "priimek iz dveh besed");
  trdi(ujema("Džinić Ana", "DZINIC A."), "brez strešic v preglednici");
  trdi(ujema("  džinić   ana  ", "DŽINIĆ A."), "male črke in odvečni presledki");

  // In kar se NE sme zliti: dva soimenjaka z različno začetnico imena.
  trdi(!ujema("Rozman Klara", "ROZMAN A."), "Rozman Klara ni Rozman Anka");
  trdi(!ujema("Novak Ana", "NOVAK B."), "različna začetnica imena");
  trdi(!ujema("Novak Ana", "NOVAKOVIĆ A."), "podoben, a drug priimek");
  eq(I.kratkiKljuc(""), "", "prazno ime nima ključa");
}

console.log("5) prazno in neveljavno se NE ujema z ničimer");
{
  trdi(!I.seUjemata("", "Alukić Dino"), "prazno ime");
  trdi(!I.seUjemata("   ", "Alukić Dino"), "sami presledki");
  trdi(!I.seUjemata(null, null), "dvakrat null se ne ujema (sicer bi vse padlo skupaj)");
  trdi(!I.seUjemata(undefined, "Bojić Matej"), "undefined");
}

console.log("6) kratko ime za ozke stolpce");
{
  eq(I.kratkoIme("MAVRI TRATNIK MAGDALENA"), "Mavri", "prva beseda, prva črka velika");
  eq(I.kratkoIme("alukić dino"), "Alukić", "male črke se popravijo");
  eq(I.kratkoIme(""), "", "prazno ostane prazno");
}

console.log("7) pravilo uporabljajo VSI zasloni, ne le eden");
{
  const strani = ["index.html", "imenik.html", "zelje.html", "admin.html"];
  strani.forEach(s => {
    const src = readFileSync(join(koren, s), "utf8");
    trdi(/<script src="imena\.js"><\/script>/.test(src), `${s} nalaga imena.js`);
    trdi(/window\.Imena\./.test(src), `${s} ga tudi res uporabi`);
  });

  // Nobene lastne kopije primerjave več.
  const kopije = [
    ["zelje.html", /function imenaSeUjemata\s*\(/],
    ["admin.html", /function imenaSeUjemataAdmin\s*\(/],
    ["imenik.html", /function brezStresic\s*\(/],
    ["index.html", /const IME_PSEVDONIM_NZV\s*=/],
  ];
  kopije.forEach(([datoteka, vzorec]) => {
    const src = readFileSync(join(koren, datoteka), "utf8");
    trdi(!vzorec.test(src), `${datoteka} nima več svoje kopije`);
  });
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
