#!/usr/bin/env node
/* Preizkus "Predlagaj mesec" za razpored oddelka
 * (Generator → Oddelki → gumb pod "Pokritost po dnevih").
 *
 * Aplikacija je vrzel v pokritosti doslej samo POKAZALA, zapolniti pa jo je
 * moral koordinator sam, dan za dnem. Tu se za vsako vrzel predlaga oseba —
 * predlog in nič več, v razpored se vpiše šele po potrditvi (enako kot pri
 * mreži NZV).
 *
 * Najbolj pomembno je, česa predlog NE sme narediti: razporediti človeka na
 * dopustu, povoziti izmeno, ki jo nekdo že ima, ali tiho ustvariti
 * delovnopravno kršitev (prekratek počitek po nočni). Zato je večina trditev
 * spodaj negativnih.
 *
 * Zagon: node skripte/preveri-vrzeli-oddelek.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const Generator = require_(join(koren, "generator-core.js"));

// DelovniCas je brskalniški modul (obesi se na window).
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sandbox);
const DelovniCas = sandbox.window.DelovniCas;

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

// Ista razvrstitev v izmene kot v admin.html (shiftBucket).
function vBucket(sifra) {
  const t = (sifra || "").toLowerCase().replace(/\s+/g, "");
  if (t.startsWith("ld") || t.startsWith("kpu") || t === "pomočdrugje" || !t) return null;
  if (t.includes("nočna12")) return "PONOCI";
  if (t.includes("dnevna12")) return "DOPOLDNE";
  if (t.startsWith("nočna")) return "PONOCI";
  if (t.startsWith("dopoldan") || t.startsWith("dopoldne")) return "DOPOLDNE";
  if (t.startsWith("popoldan") || t.startsWith("popoldne")) return "POPOLDNE";
  return null;
}
const OSNOVNA = { DOPOLDNE: "dopoldan", POPOLDNE: "popoldan", PONOCI: "NOČNA" };

// Mreža za preizkus: 3 dnevi, 4 zaposleni.
const DNEVI = ["2026-10-05", "2026-10-06", "2026-10-07"];   // PON, TOR, SRE
function mreza(zacetna) {
  const m = JSON.parse(JSON.stringify(zacetna));
  return {
    sifraZa: (ime, datum) => (m[ime] && m[ime][datum]) || "",
    surova: m,
  };
}
const OSNOVNA_MREZA = {
  "Kovač Ana":   { "2026-10-05": "dopoldan", "2026-10-06": "dopoldan", "2026-10-07": "dopoldan" },
  "Novak Bine":  { "2026-10-05": "",         "2026-10-06": "",         "2026-10-07": "" },
  "Zupan Cilka": { "2026-10-05": "KPU",      "2026-10-06": "KPU",      "2026-10-07": "KPU" },
  "Horvat Dani": { "2026-10-05": "LD",       "2026-10-06": "LD",       "2026-10-07": "LD" },
};
const predlagaj = (vrzeli, mrezaObj, dodatno) => {
  const m = mrezaObj || mreza(OSNOVNA_MREZA);
  return Generator.predlagajZapolnitevOddelka(Object.assign({
    vrzeli, staff: Object.keys(m.surova), dnevi: DNEVI,
    sifraZa: m.sifraZa, vBucket,
    sifraZaBucket: (datum, bucket) => OSNOVNA[bucket],
    preveriPravila: (vnosi) => DelovniCas.preveriPravila(vnosi),
  }, dodatno || {}));
};

console.log("1) vrzel dobi predlog");
const p1 = predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 }]);
eq(p1.length, 1, "ena vrzel, en predlog");
eq(p1[0].oseba, "Novak Bine", "predlagan je tisti, ki ima ta dan prost dan po vzorcu");
eq(p1[0].sifra, "popoldan", "z oznako izmene, ki je manjkala");
eq(p1[0].bucket, "POPOLDNE", "predlog ve, katero izmeno polni");

console.log("2) koga predlog NE sme vzeti");
// Človeka na dopustu ni dovoljeno razporediti - to je bila najbolj boleča
// napaka generatorjev doslej.
trdi(!p1.some(pr => pr.oseba === "Horvat Dani"), "osebe na dopustu (LD) ne predlaga");
// Kdor tisti dan že dela, ne more biti hkrati še v drugi izmeni.
trdi(!p1.some(pr => pr.oseba === "Kovač Ana"), "osebe, ki ta dan že dela, ne predlaga");
// Prost dan ima prednost pred KPU (KPU je že dogovorjeno koriščenje ur).
trdi(p1[0].oseba !== "Zupan Cilka", "KPU je zadnja izbira, ne prva");

console.log("3) KPU pride na vrsto šele, ko prostega ni");
const brezProstega = mreza(Object.assign({}, OSNOVNA_MREZA, {
  "Novak Bine": { "2026-10-05": "NOČNA", "2026-10-06": "", "2026-10-07": "" },
}));
const p3 = predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 }], brezProstega);
eq(p3.length, 1, "predlog vseeno je");
eq(p3[0].oseba, "Zupan Cilka", "vzame osebo na KPU");
trdi(/KPU/.test(p3[0].opozorilo || ""), "in to pove: " + p3[0].opozorilo);

console.log("4) delovnopravna pravila");
// Po nočni izmeni ne sme takoj dopoldne - počitek je prekratek. Bine ima
// nočno 5. 10., zato mora 6. 10. dopoldne dobiti kdo drug.
const poNocni = mreza(Object.assign({}, OSNOVNA_MREZA, {
  "Novak Bine": { "2026-10-05": "NOČNA", "2026-10-06": "", "2026-10-07": "" },
  "Zupan Cilka": { "2026-10-05": "KPU", "2026-10-06": "", "2026-10-07": "KPU" },
}));
const p4 = predlagaj([{ datum: "2026-10-06", bucket: "DOPOLDNE", primanjkljaj: 1 }], poNocni);
eq(p4[0].oseba, "Zupan Cilka", "po nočni izmeni ne predlaga iste osebe za naslednje jutro");
trdi(!p4[0].opozorilo, "in tak predlog nima opozorila");
// Kadar druge možnosti NI, se vrzel ne zamolči: predlaga se najmanj slab,
// a z izrecnim opozorilom - odločitev je človekova.
const samoBine = mreza({
  "Novak Bine": { "2026-10-05": "NOČNA", "2026-10-06": "", "2026-10-07": "" },
  "Horvat Dani": { "2026-10-05": "LD", "2026-10-06": "LD", "2026-10-07": "LD" },
});
const p4b = predlagaj([{ datum: "2026-10-06", bucket: "DOPOLDNE", primanjkljaj: 1 }], samoBine);
eq(p4b.length, 1, "vrzel se ne zamolči");
eq(p4b[0].oseba, "Novak Bine", "predlaga edinega, ki je na voljo");
trdi(/krši/i.test(p4b[0].opozorilo || ""), "a z opozorilom o kršitvi: " + p4b[0].opozorilo);

console.log("5) več manjkajočih ljudi v isti izmeni");
const p5 = predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 2 }]);
eq(p5.length, 2, "primanjkljaj 2 da dva predloga");
eq(new Set(p5.map(pr => pr.oseba)).size, 2, "in dve različni osebi, ne dvakrat iste");

console.log("6) ista oseba ne dobi dveh vrzeli istega dne");
const p6 = predlagaj([
  { datum: "2026-10-05", bucket: "DOPOLDNE", primanjkljaj: 1 },
  { datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 },
]);
eq(p6.length, 2, "dve vrzeli istega dne");
eq(new Set(p6.map(pr => pr.oseba)).size, 2, "vsaka pri drugi osebi");

console.log("7) obremenitev se porazdeli med enako razpoložljivimi");
// Pomembno razlikovanje: prost dan po vzorcu ima VEDNO prednost pred KPU
// (koriščenje ur je že dogovorjeno, poseg vanj je večji), zato se
// obremenitev ne razdeli med prostim in KPU. Porazdeli pa se med tistimi,
// ki so enako na voljo - sicer bi vse dodatno delo v mesecu pristalo na
// enem človeku.
const dvaProsta = mreza({
  "Novak Bine":  { "2026-10-05": "", "2026-10-06": "", "2026-10-07": "" },
  "Zupan Cilka": { "2026-10-05": "", "2026-10-06": "", "2026-10-07": "" },
});
const p7 = predlagaj(DNEVI.map(d => ({ datum: d, bucket: "POPOLDNE", primanjkljaj: 1 })), dvaProsta);
eq(p7.length, 3, "tri vrzeli, trije predlogi");
const naOsebo = {};
p7.forEach(pr => { naOsebo[pr.oseba] = (naOsebo[pr.oseba] || 0) + 1; });
eq(Object.keys(naOsebo).length, 2, "obremenitev se razdeli na oba, ne na enega");
trdi(Math.max(...Object.values(naOsebo)) <= 2,
  "in noben ne dobi vseh treh: " + JSON.stringify(naOsebo));
// Kontrolna točka: kadar je prost samo eden, drugi (na KPU) pa ne, se
// obremenitev NE deli - prost dan je prava izbira, tudi trikrat zapored.
const p7b = predlagaj(DNEVI.map(d => ({ datum: d, bucket: "POPOLDNE", primanjkljaj: 1 })));
eq(new Set(p7b.map(pr => pr.oseba)).size, 1,
  "kadar je prost samo eden, dobi vse tri – KPU se ne načne po nepotrebnem");

console.log("8) brez vrzeli in brez kandidatov");
eq(predlagaj([]), [], "brez vrzeli ni predlogov");
const vsiZasedeni = mreza({
  "Kovač Ana": { "2026-10-05": "dopoldan", "2026-10-06": "dopoldan", "2026-10-07": "dopoldan" },
  "Horvat Dani": { "2026-10-05": "LD", "2026-10-06": "LD", "2026-10-07": "LD" },
});
eq(predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 }], vsiZasedeni), [],
  "kadar ni nikogar prostega, ne izmisli nikogar");

console.log("9) izid je ponovljiv");
eq(JSON.stringify(predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 }])),
   JSON.stringify(predlagaj([{ datum: "2026-10-05", bucket: "POPOLDNE", primanjkljaj: 1 }])),
   "dvakratni klic da isti predlog");

console.log("10) admin.html: vrzel ve, katere izmene zmanjka");
const admin = readFileSync(join(koren, "admin.html"), "utf8");
const brezKomentarjev = admin.split("\n").filter(v => !/^\s*\/\//.test(v)).join("\n");
trdi(/vrzeli\.push\(\{ datum: dn\.datum, bucket: b,/.test(brezKomentarjev),
  "izracunajVrzeli doda izmeno (bucket) – brez tega predloga ni mogoče sestaviti");
trdi(/window\.Generator\.predlagajZapolnitevOddelka\(/.test(brezKomentarjev),
  "zavihek Oddelki kliče skupno logiko, ne svoje kopije");
// Predlogi se ne smejo tiho vpisati v razpored: v popravke gredo šele iz
// gumba "Vnesi potrjene".
trdi(/const izbrani = seznam\.filter\(pr => potrjeneVrzeli\[kljucPredloga\(pr\)\]\)/.test(brezKomentarjev),
  "v razpored se vpišejo samo POTRJENI predlogi");

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
