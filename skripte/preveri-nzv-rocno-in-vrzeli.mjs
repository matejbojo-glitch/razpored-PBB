#!/usr/bin/env node
/* Preizkus dveh novosti v mreži NZV (Generator → NZV → Vodstvena pokritost):
 *
 *  1) razberiCelico — ročno prepisana celica se prebere NAZAJ v osebe, da
 *     se popravek lahko objavi. Doslej je ročni popravek spremenil samo
 *     prikaz in izvoz, objava pa je šla po izračunanem: koordinator je na
 *     zaslonu videl eno, zaposleni pa dobil drugo. Ker je vhod prosto
 *     besedilo, je ključno, da se NEPREPOZNANO ne ugane, ampak izrecno
 *     javi — v razporedu je tiho ugibanje, kdo je »BOJ«, nevarnejše od
 *     opozorila.
 *
 *  2) predlagajZapolnitev — »Predlagaj mesec«. Uporabnik: »načeloma je
 *     tako, da se na koncu Denis Džamastagić odloči in izpolni manjkajoče
 *     vrzeli.« Aplikacija vrzeli torej samo najde in predlaga; predlog gre
 *     skozi potrditev. Zato se preverja predvsem, ČESA ne sme predlagati:
 *     odsotne osebe, prostih dni, stolpcev odsotnosti, dežurstva in tiste
 *     od SA DOP/SA POP, ki ta dan ni na vrsti (prazna je pravilno).
 *
 * Zagon: node skripte/preveri-nzv-rocno-in-vrzeli.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(koren, "imena.js"), "utf8"), sandbox);
vm.runInContext(readFileSync(join(koren, "nzv-zasedba.js"), "utf8"), sandbox);
const NZ = sandbox.window.NzvZasedba;
const kljuc = sandbox.window.Imena.kljuc;

// Ista kratica kot v admin.html (prve tri črke priimka).
const kratica = (ime) => ((ime || "").trim().split(/\s+/)[0] || "").slice(0, 3).toUpperCase();

const NOSILCI = [
  { full_name: "Bojić Matej", department_code: "NZV", enote: "MO" },
  { full_name: "Alukić Dino", department_code: "NZV", enote: "ŽO" },
  { full_name: "Džamastagić Denis", department_code: "NZV", enote: "PDZN" },
  { full_name: "Trpin Saša", department_code: "NZV", enote: "URGENCA" },
  { full_name: "Bizjak Nina", department_code: "NZV", enote: "U2" },
];

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}
const beri = (besedilo, nosilci) =>
  NZ.razberiCelico({ besedilo, nosilci: nosilci || NOSILCI, kljuc, kratica });

console.log("1) ročni popravek se prebere nazaj v osebe");
eq(beri("BOJ").osebe, ["Bojić Matej"], "kratica");
eq(beri("Bojić Matej").osebe, ["Bojić Matej"], "celo ime");
eq(beri("BOJIC MATEJ").osebe, ["Bojić Matej"], "celo ime brez strešic");
eq(beri("Matej Bojić").osebe, ["Bojić Matej"], "obrnjen vrstni red imena in priimka");
eq(beri("BOJ ALU").osebe, ["Bojić Matej", "Alukić Dino"], "dve osebi v isti celici");
eq(beri("BOJ, ALU").osebe, ["Bojić Matej", "Alukić Dino"], "ločeni z vejico");
eq(beri("BOJ/ALU").osebe, ["Bojić Matej", "Alukić Dino"], "ločeni s poševnico");
eq(beri("BOJ + ALU").osebe, ["Bojić Matej", "Alukić Dino"], "ločeni s plusom");
// Vprašaj (predlog) in zvezdica (daljša odsotnost) sta oznaki PRIKAZA. Če
// se ne odstranita, se celica, ki jo je človek pustil pri miru, ne prebere.
eq(beri("BOJ?").osebe, ["Bojić Matej"], "vprašaj predloga ni del imena");
eq(beri("DŽA*").osebe, ["Džamastagić Denis"], "zvezdica daljše odsotnosti ni del imena");
eq(beri("   ").osebe, [], "prazna celica ne da nikogar");
eq(beri("BOJ BOJ").osebe, ["Bojić Matej"], "ista oseba dvakrat je en zapis");
eq(beri("Bojić Matej Alukić Dino").osebe, ["Bojić Matej", "Alukić Dino"], "dve celi imeni zapored");

console.log("2) česar ni mogoče enolično prepoznati, se NE ugane");
eq(beri("XYZ").osebe, [], "neznana kratica ne da nikogar");
eq(beri("XYZ").neznani, ["XYZ"], "in se javi kot neznana");
eq(beri("BOJ XYZ"), { osebe: ["Bojić Matej"], neznani: ["XYZ"], dvoumni: [] },
  "prepoznano se obdrži, neprepoznano se javi");
// Dve osebi z istimi tremi črkami priimka: ugibanje bi eno od njiju vpisalo
// na napačno enoto, zato se celica raje ne objavi.
const DVOJNIK = NOSILCI.concat([{ full_name: "Bojc Ana", department_code: "NZV", enote: "PO" }]);
eq(beri("BOJ", DVOJNIK).osebe, [], "dvoumna kratica ne da nikogar");
eq(beri("BOJ", DVOJNIK).dvoumni, ["BOJ"], "in se javi kot dvoumna");
eq(beri("Bojić Matej", DVOJNIK).osebe, ["Bojić Matej"],
  "celo ime pa je enolično tudi takrat, ko je kratica dvoumna");

console.log("3) »Predlagaj mesec«: kje so vrzeli");
const dnevi = [
  { datum: "2026-10-01", celice: { PDZN: "DŽA", MO: "" } },            // ČET
  { datum: "2026-10-02", celice: { PDZN: "", MO: "BOJ" } },            // PET
  { datum: "2026-10-03", celice: { PDZN: "", MO: "" } },               // SOB
];
const vrzeli = (opts) => NZ.predlagajZapolnitev(Object.assign({
  dnevi, stolpci: ["PDZN", "MO"], nosilci: NOSILCI, kljuc, kratica,
  jeOdsoten: () => false,
  jeProstDan: (iso) => iso === "2026-10-03",
}, opts || {}));
const v1 = vrzeli();
eq(v1.map(p => p.datum + "|" + p.stolpec), ["2026-10-01|MO", "2026-10-02|PDZN"],
  "predlaga samo za prazne celice na delovne dni");
trdi(v1.every(p => p.ime), "vsak predlog ima ime osebe");
// Kontrolna točka: brez izločanja prostih dni bi bila predloga dva več.
eq(vrzeli({ jeProstDan: () => false }).length, 4, "brez izločanja prostih dni bi bilo predlogov več (kontrola)");

console.log("4) česa »Predlagaj mesec« ne sme narediti");
// Odsoten človek ne sme biti predlagan - to je bila najbolj boleča napaka
// generatorja NZV (oseba na dopustu razporejena na enoto).
const brezBojica = vrzeli({ jeOdsoten: (ime) => kljuc(ime) === kljuc("Bojić Matej") });
trdi(brezBojica.every(p => kljuc(p.ime) !== kljuc("Bojić Matej")), "odsotne osebe ne predlaga");
trdi(brezBojica.length === 2, "ostale vrzeli vseeno zapolni (" + brezBojica.length + ")");
// Nihče prisoten -> nobenega predloga, ne izmišljene osebe.
eq(vrzeli({ jeOdsoten: () => true }), [], "kadar tisti dan ni nikogar, ne predlaga nikogar");
// Stolpci odsotnosti in dežurstvo niso enote.
const sPosebnimi = NZ.predlagajZapolnitev({
  dnevi: [{ datum: "2026-10-01", celice: { LD: "", IZOB: "", BS: "", DEZURSTVO: "", MO: "" } }],
  stolpci: ["LD", "IZOB", "BS", "DEZURSTVO", "MO"],
  nosilci: NOSILCI, kljuc, kratica, jeOdsoten: () => false, jeProstDan: () => false,
});
eq(sPosebnimi.map(p => p.stolpec), ["MO"], "LD/IZOB/BS in DEŽURSTVO niso vrzeli, ki bi jih polnil");

console.log("5) SA DOP / SA POP: prazna je pravilno, kadar ta dan ni na vrsti");
const sa = (saKoda) => NZ.predlagajZapolnitev({
  dnevi: [{ datum: "2026-10-01", celice: { SADOP: "", SAPOP: "" } }],
  stolpci: ["SADOP", "SAPOP"], nosilci: NOSILCI, kljuc, kratica,
  jeOdsoten: () => false, jeProstDan: () => false,
  saKodaZa: () => saKoda,
});
eq(sa("SADOP").map(p => p.stolpec), ["SADOP"], "ko je na vrsti SA DOP, se ponudi samo ta");
eq(sa("SAPOP").map(p => p.stolpec), ["SAPOP"], "ko je na vrsti SA POP, se ponudi samo ta");
eq(sa(null).map(p => p.stolpec), ["SADOP", "SAPOP"], "brez podatka o SA se ponudita oba (kontrola)");

console.log("6) obremenitev se ne nabere na eni osebi");
const veliko = NZ.predlagajZapolnitev({
  dnevi: [{ datum: "2026-10-01", celice: { PDZN: "", MO: "", ZO: "", E1: "", E2: "" } }],
  stolpci: ["PDZN", "MO", "ZO", "E1", "E2"],
  nosilci: NOSILCI, kljuc, kratica, jeOdsoten: () => false, jeProstDan: () => false,
});
eq(veliko.length, 5, "pet praznih enot, pet predlogov");
eq(new Set(veliko.map(p => p.ime)).size, 5, "vseh pet dobi drugo osebo, ne petkrat iste");
// Kdor tisti dan že dela, pride na vrsto šele za tistimi, ki še ne delajo.
const zeZaseden = NZ.predlagajZapolnitev({
  dnevi: [{ datum: "2026-10-01", celice: { PDZN: "BOJ", MO: "" } }],
  stolpci: ["PDZN", "MO"], nosilci: NOSILCI, kljuc, kratica,
  jeOdsoten: () => false, jeProstDan: () => false,
});
trdi(kljuc(zeZaseden[0].ime) !== kljuc("Bojić Matej"),
  "za prazno enoto predlaga koga, ki tisti dan še nima enote (predlagal: " + zeZaseden[0].ime + ")");

console.log("7) izid je ponovljiv");
eq(JSON.stringify(vrzeli()), JSON.stringify(vrzeli()),
  "dvakratni klic da isti predlog (sicer se razpored premetava med osvežitvami)");

console.log("8) mreža -> zapisi za objavo (rocniPopravkiVMrezi v admin.html)");
// Ta del je bil doslej edina pot, ki je razhajala prikaz in objavo: v mreži
// si videl svoj popravek, v Supabase pa je šla izračunana vrednost.
const admin = readFileSync(join(koren, "admin.html"), "utf8");
function izvleciFn(ime) {
  const z = admin.indexOf("function " + ime + "(");
  if (z === -1) throw new Error("Funkcije " + ime + " ni v admin.html.");
  let g = 0;
  for (let k = admin.indexOf("{", z); k < admin.length; k++) {
    if (admin[k] === "{") g++;
    else if (admin[k] === "}") { g--; if (!g) return admin.slice(z, k + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
// Cela vrstica, ne do prvega ";\n" - LEAVE_KOLONA ima za podpičjem še
// komentar, zato bi iskanje po ";\n" pobralo tudi naslednjo vrstico.
function izvleciConstVrstico(zacetek) {
  const z = admin.indexOf(zacetek);
  if (z === -1) throw new Error("Ni najden: " + zacetek);
  return admin.slice(z, admin.indexOf("\n", z)).replace(/^const\s+/, "var ");
}
sandbox.Datum = { slo: (iso) => iso };           // v preizkusu je dovolj sam datum
vm.runInContext([
  izvleciFn("kratica"),
  izvleciConstVrstico("const LEAVE_KOLONA"),
  izvleciConstVrstico("const ODSOTNOSTNI_STOLPCI"),
  izvleciFn("rocniPopravkiVMrezi"),
].join("\n"), sandbox);
const popravki = sandbox.rocniPopravkiVMrezi;

const mreza = [
  { datum: "2026-10-01", celice: { PDZN: "DŽA", MO: "BOJ", LD: "" } },
  { datum: "2026-10-02", celice: { PDZN: "DŽA", MO: "", LD: "" } },
];
const stolpci = ["PDZN", "MO", "LD", "DEZURSTVO"];
const izid = (p) => popravki({ dnevi: mreza, stolpci, popravki: p, nosilci: NOSILCI });

const nedotaknjeno = izid({});
eq([...nedotaknjeno.spremenjene], [], "brez popravkov ni sprememb");
eq(nedotaknjeno.vrstice, [], "in ni zapisov iz popravkov");

// Vpisan popravek se objavi kot ta oseba na tej enoti.
const dodan = izid({ "2026-10-02|MO": "ALU" });
eq([...dodan.spremenjene], ["2026-10-02|MO"], "prepisana celica je označena kot spremenjena");
eq(dodan.vrstice, [{ ime: "Alukić Dino", datum: "2026-10-02", sifra: "PRISOTEN",
  department_code: "MO", predlog: false, stolpec: "MO", jeEnota: true }], "in da zapis za objavo");

// Celica, ki je enaka izračunani, ni popravek - sicer bi vsak dotik polja
// (klik, premik kazalca) izračunani zapis zamenjal z besedilom.
eq([...izid({ "2026-10-01|MO": "BOJ" }).spremenjene], [], "enako besedilo ni popravek");
eq([...izid({ "2026-10-01|MO": "  BOJ  " }).spremenjene], [], "presledki okoli enakega besedila niso popravek");

// Izpraznjena celica pomeni "tu ni nikogar" in mora izračunani zapis UMAKNITI.
const izpraznjena = izid({ "2026-10-01|MO": "" });
eq([...izpraznjena.spremenjene], ["2026-10-01|MO"], "izpraznjena celica je popravek");
eq(izpraznjena.vrstice, [], "in ne doda nobenega zapisa (izračunani se umakne)");

// Stolpec odsotnosti ni enota: oseba gre na LD, ne "na oddelek LD".
const naLd = izid({ "2026-10-01|LD": "TRP" });
eq(naLd.vrstice, [{ ime: "Trpin Saša", datum: "2026-10-01", sifra: "LD",
  department_code: "NZV", predlog: false, stolpec: "LD" }], "vpis v LD da odsotnost, ne enote");

// Neprepoznano se ne objavi in se pove.
const slabo = izid({ "2026-10-02|MO": "XYZ" });
eq(slabo.vrstice, [], "neprepoznanega besedila ne objavi");
trdi(slabo.tezave.length === 1 && slabo.tezave[0].includes("XYZ"), "in pove, katera celica: " + slabo.tezave[0]);

// Dežurstvo ima svoj zavihek in svoj generator - tu se ne objavlja.
const dez = izid({ "2026-10-01|DEZURSTVO": "BOJ" });
eq(dez.vrstice, [], "popravka v stolpcu DEŽURSTVO ne objavi");
trdi(dez.tezave.length === 1 && /DEŽURSTVO/.test(dez.tezave[0]), "in to pove: " + dez.tezave[0]);

console.log("9) objava ne izgubi druge enote iste osebe");
// schedule_entries ima unique (employee_id, work_date), oseba pa je isti dan
// pogosto na več enotah (Džamastagić na PDZN, SOBO in U2). Doslej je vsaka
// nadaljnja enota tiho prepisala prejšnjo - v razporedu je ostala ena sama.
// "Predlagaj mesec" tak primer namenoma ustvarja (človek dobi drugo enoto),
// zato mora objava to prenesti.
let poslano = null;
sandbox.client = {
  from: (tabela) => ({
    select: () => ({
      in: () => Promise.resolve({ data: [
        { id: "id-dza", full_name: "Džamastagić Denis" },
        { id: "id-boj", full_name: "Bojić Matej" },
      ], error: null }),
    }),
    upsert: (vrstice) => { poslano = vrstice; return Promise.resolve({ error: null }); },
  }),
};
sandbox.obvestiOObjavi = () => Promise.resolve(null);
// Funkcija je "async function", zato je izvleciFn (ki išče "function ime(")
// tu ne najde - poišče se s predpono.
function izvleciAsync(ime) {
  const z = admin.indexOf("async function " + ime + "(");
  if (z === -1) throw new Error("Funkcije " + ime + " ni v admin.html.");
  let g = 0;
  for (let k = admin.indexOf("{", z); k < admin.length; k++) {
    if (admin[k] === "{") g++;
    else if (admin[k] === "}") { g--; if (!g) return admin.slice(z, k + 1); }
  }
  throw new Error("Konec funkcije " + ime + " ni najden.");
}
vm.runInContext(izvleciAsync("publishLeadScheduleRows"), sandbox);

const izidObjave = await sandbox.publishLeadScheduleRows([
  { ime: "Džamastagić Denis", datum: "2026-10-01", sifra: "PRISOTEN", department_code: "PDZN", stolpec: "PDZN", jeEnota: true },
  { ime: "Džamastagić Denis", datum: "2026-10-01", sifra: "PRISOTEN", department_code: "SOBO", stolpec: "SOBO", jeEnota: true },
  { ime: "Bojić Matej", datum: "2026-10-01", sifra: "LD", department_code: "NZV", stolpec: "LD" },
]);
eq(poslano.length, 2, "tri vrstice, dve osebi -> dva zapisa (en na osebo/dan)");
const dza = poslano.find(v => v.employee_id === "id-dza");
eq(dza.department_code, "PDZN", "prva enota gre v department_code");
eq(dza.pokriva_oddelek, "PDZN/SOBO", "druga se OHRANI v pokriva_oddelek, ne izgine");
const boj = poslano.find(v => v.employee_id === "id-boj");
eq(boj.shift_code, "LD", "odsotnost ostane v šifri izmene");
trdi(boj.pokriva_oddelek === undefined, "odsotnost ne zasede mesta enote");
eq(izidObjave.objavljeno, 2, "objavljeno se šteje po zapisih, ki gredo v bazo");

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
