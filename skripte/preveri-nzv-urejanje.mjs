#!/usr/bin/env node
/* Preizkus UREJANJA NZV mreže v aplikaciji (index.html).
 *
 * Zakaj obstaja: doslej NZV razporeda v aplikaciji ni bilo mogoče vnesti -
 * mreža je bila samo za gledanje, zato je razpored nastajal v Excelu in se
 * uvažal. Vse napake, ki smo jih lovili (izpadla oseba, dopust in razpored
 * hkrati, napačno zapisana glava, ista oseba na dveh enotah), izvirajo iz
 * tega. Odslej je mogoče urejati v aplikaciji, Excel pa nastane na koncu.
 *
 * Najpomembnejši del je 2. sklop: KROŽNA preverba. Mreža -> vpisi za bazo
 * -> nazaj v mrežo mora dati natanko isto. Če se ta krog ne izide, objava
 * tiho spremeni razpored - točno tisto, kar smo pravkar odpravljali pri
 * uvozu.
 *
 * Zagon: node skripte/preveri-nzv-urejanje.mjs
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
  for (let i = html.indexOf("{", zac); i < html.length; i++) {
    if (html[i] === "{") globina++;
    else if (html[i] === "}") { globina--; if (globina === 0) return html.slice(zac, i + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
function izvleciConst(ime) {
  const zac = html.indexOf("const " + ime + " ");
  if (zac === -1) throw new Error("const " + ime + " ni v index.html.");
  return html.slice(zac, html.indexOf(";\n", zac) + 1).replace(/^const\s+/, "var ");
}
function izvleciConstIife(ime) {
  const zac = html.indexOf("const " + ime + " = (() => {");
  let g = 0, i = html.indexOf("{", zac);
  for (; i < html.length; i++) {
    if (html[i] === "{") g++;
    else if (html[i] === "}") { g--; if (!g) break; }
  }
  return html.slice(zac, html.indexOf(";\n", i) + 1).replace(/^const\s+/, "var ");
}

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function jseq(a, b, opis) {
  const enako = JSON.stringify(a) === JSON.stringify(b);
  trdi(enako, opis + (enako ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
vm.runInContext([
  izvleciConst("NZV_ENOTE"),
  izvleci("razvrstiSA"),
  izvleciConst("NZV_STOLPCI"),
  izvleci("nzvZapisZaStolpec"),
  izvleci("zdruziNzvZapise"),
  izvleci("nzvVnosiIzMreze"),
  izvleci("opozoriloCelice"),
].join("\n\n"), sandbox);

const { nzvZapisZaStolpec, nzvVnosiIzMreze, opozoriloCelice, NZV_STOLPCI } = sandbox;
const KODE = NZV_STOLPCI.map(([k]) => k);

console.log("1) preslikava stolpca v zapis za bazo");
{
  jseq(nzvZapisZaStolpec("PDZN"), { department_code: "PDZN", shift_code: "PRISOTEN" },
    "navadna enota -> svoja koda, izmena PRISOTEN");
  jseq(nzvZapisZaStolpec("SADOP"), { department_code: "SA", shift_code: "Dopoldne" },
    "SA DOP -> oddelek SA, izmena Dopoldne");
  jseq(nzvZapisZaStolpec("SAPOP"), { department_code: "SA", shift_code: "Popoldne" },
    "SA POP -> oddelek SA, izmena Popoldne (razlika je SAMO v izmeni)");
  jseq(nzvZapisZaStolpec("DEZ"), { department_code: "DEZ", shift_code: "DEŽURSTVO" },
    "dežurstvo -> svoja izmena, ne enota");
}

console.log("2) KROŽNA preverba: mreža -> vpisi -> nazaj v mrežo");
{
  // Zahtevna mreža: več oseb na eni enoti, ena oseba na več enotah,
  // dežurstvo poleg enote, SA POP, prazne celice.
  const mreza = {
    "PDZN|2026-09-01": "DŽA",
    "SOBO|2026-09-01": "DŽA",
    "U2|2026-09-01": "DŽA",
    "E1|2026-09-01": "LEL",
    "E2|2026-09-01": "LEL, SOF",
    "ZO|2026-09-01": "ALU",
    "SAPOP|2026-09-01": "TRP",
    "DEZ|2026-09-01": "TRP",
    "B|2026-09-02": "LUN",
    "C|2026-09-02": "LUN",
    "DEZ|2026-09-02": "ARN",
  };
  const parafe = ["DŽA", "LEL", "SOF", "ALU", "TRP", "LUN", "ARN"];
  const poParafi = {};
  parafe.forEach(p => { poParafi[p] = { id: p, full_name: p }; });
  const datumi = ["2026-09-01", "2026-09-02", "2026-09-05", "2026-09-06"]; // zadnja dva sta vikend

  const { zapisi, neznane } = nzvVnosiIzMreze({
    vrednost: (koda, datum) => mreza[koda + "|" + datum] || "",
    datumi, poParafi, kode: KODE.concat(["DEZ"]),
  });
  jseq(neznane, [], "vse parafe so prepoznane");

  // Baza dovoli EN zapis na osebo in dan.
  const kljuci = zapisi.map(z => z.employee_id + "|" + z.work_date);
  jseq(kljuci.length, new Set(kljuci).size, "noben par oseba+dan se ne ponovi");

  // Nazaj v mrežo - natanko pravilo iz nalozizPodatkeNzv.
  const nazaj = {};
  zapisi.forEach(z => {
    const izPokrivanja = String(z.pokriva_oddelek || "").split("/").map(x => x.trim()).filter(Boolean);
    const prim = z.department_code === "SA"
      ? (z.shift_code === "Popoldne" ? "SAPOP" : "SADOP") : z.department_code;
    const kode = izPokrivanja.length ? izPokrivanja.slice() : [prim];
    if (/^DEŽURSTVO$/i.test(z.shift_code) && !kode.includes("DEZ")) kode.push("DEZ");
    kode.forEach(k => {
      const kljuc = k + "|" + z.work_date;
      const ze = (nazaj[kljuc] || "").split(", ").filter(Boolean);
      if (!ze.includes(z.employee_id)) nazaj[kljuc] = ze.concat([z.employee_id]).join(", ");
    });
  });

  const uredi = (v) => (v || "").split(",").map(x => x.trim()).filter(Boolean).sort().join(", ");
  const vsiKljuci = new Set([...Object.keys(mreza), ...Object.keys(nazaj)]);
  const razlike = [...vsiKljuci].filter(k => uredi(mreza[k]) !== uredi(nazaj[k]));
  jseq(razlike, [], `krog se izide za vseh ${vsiKljuci.size} celic`);

  // Posamezne točke, ki bi se lahko izgubile tiho.
  const dza = zapisi.find(z => z.employee_id === "DŽA");
  trdi(!!dza && (dza.pokriva_oddelek || "").split("/").length === 3,
    "Džamastagić na treh enotah je EN zapis s tremi enotami");
  const trp = zapisi.find(z => z.employee_id === "TRP");
  trdi(!!trp && trp.shift_code === "DEŽURSTVO", "dežurstvo obvelja kot izmena");
  trdi(!!trp && (trp.pokriva_oddelek || "").includes("SAPOP"),
    "in SA POP se pri tem NE izgubi (izmena je zasedena z dežurstvom)");
}

console.log("3) vikendi, prazniki in prazne celice");
{
  const poParafi = { "DŽA": { id: "DŽA", full_name: "DŽA" } };
  const { zapisi } = nzvVnosiIzMreze({
    vrednost: () => "DŽA",
    datumi: ["2026-09-05", "2026-09-06", "2026-12-25"],  // sobota, nedelja, božič
    poParafi, kode: ["PDZN"],
  });
  jseq(zapisi, [], "vikend in dela prost praznik se ne zapišeta (delovnik NZV je PON-PET)");

  const prazna = nzvVnosiIzMreze({
    vrednost: () => "", datumi: ["2026-09-01"], poParafi, kode: ["PDZN"],
  });
  jseq(prazna.zapisi, [], "prazna celica ne ustvari vpisa");
}

console.log("4) neznana parafa se NE izgubi tiho");
{
  const poParafi = { "DŽA": { id: "DŽA", full_name: "DŽA" } };
  const { zapisi, neznane } = nzvVnosiIzMreze({
    vrednost: () => "DŽA, XYZ", datumi: ["2026-09-01"], poParafi, kode: ["PDZN"],
  });
  jseq(neznane, ["XYZ"], "neznana parafa je sporočena");
  jseq(zapisi.length, 1, "znana se vseeno zapiše");
}

console.log("5) sprotna opozorila med tipkanjem (opozori, a dovoli)");
{
  const poParafi = { "DŽA": { id: "DŽA" }, "VEL": { id: "VEL" } };
  const odsotni = { "2026-09-01": new Set(["VEL"]) };
  trdi(!opozoriloCelice("DŽA", "2026-09-01", poParafi, odsotni), "pravilen vpis nima opozorila");
  trdi(/Ne poznam parafe: XYZ/.test(opozoriloCelice("XYZ", "2026-09-01", poParafi, odsotni)),
    "neznana parafa se pove takoj");
  trdi(/na dopustu/.test(opozoriloCelice("VEL", "2026-09-01", poParafi, odsotni)),
    "oseba na dopustu sproži opozorilo");
  trdi(!opozoriloCelice("VEL", "2026-09-02", poParafi, odsotni),
    "drug dan ista oseba ni sporna");
  trdi(!opozoriloCelice("", "2026-09-01", poParafi, odsotni), "prazna celica ni napaka");
  trdi(!opozoriloCelice("DŽA", "2026-09-01", null, odsotni),
    "dokler se parafe ne naložijo, se ne opozarja na prazno");
}

console.log("6) objava se ne sme dotakniti razporeda oddelkov");
{
  // Kode stolpcev NZV mreže (B, C, C1, D, E1, E2) so ISTE kot kode oddelkov
  // SMS/TZN kadra. Brisanje po samem department_code bi pobrisalo razpored
  // celih oddelkov za ta mesec.
  const prekrivanje = KODE.filter(k => ["B", "C", "C1", "D", "E1", "E2"].includes(k));
  trdi(prekrivanje.length > 0,
    "kode se res prekrivajo (" + prekrivanje.join(", ") + ") – zato je omejitev nujna");
  trdi(/\.in\("employee_id", nzvIdji\)/.test(html),
    "brisanje je omejeno na NZV kader (in(\"employee_id\", nzvIdji))");
  trdi(!/\.in\("department_code", KODE\.concat\(\["SA", "DEZ"\]\)\)[\s\S]{0,120}delete/.test(html),
    "brisanja po samem department_code ni več");
  trdi(/Ne najdem NZV kadra/.test(html),
    "če seznama NZV kadra ni, se objava prekine namesto da bi brisala na slepo");
}

console.log("7) mreža je res urejljiva in objava ohrani dežurstvo");
{
  trdi(/kode: KODE\.concat\(\["DEZ"\]\)/.test(html),
    "objava zajame tudi stolpec dežurstva – sicer bi ga izbrisala");
  trdi(/onChange=\{e => ur\.nastavi\(koda, dn\.datum, e\.target\.value\)\}/.test(html),
    "celice enot so v načinu urejanja vnosna polja");
  trdi(/list="nzvParafe"/.test(html) && /<datalist id="nzvParafe">/.test(html),
    "pri tipkanju pomaga seznam paraf");
  trdi(/✨ Predlagaj mesec/.test(html), "gumb za predlog meseca obstaja");
  trdi(/const jeAdmin = !!\(profile && profile\.role === "admin"\)/.test(html),
    "urejanje je na voljo samo administratorju");
}

console.log("");
if (napake.length) {
  console.error(`NAPAKE (${napake.length}):`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("Vse v redu.");
