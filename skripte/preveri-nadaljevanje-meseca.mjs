#!/usr/bin/env node
/* Generiranje razporeda se nadaljuje iz prejšnjega meseca.
 *
 * Dvoje, ki ju je treba ločiti:
 *
 *  1) KALUP se nadaljuje sam. Rotacija je vezana na stalno sidro
 *     (ANCHOR_MONDAY), zato je ločeno generiran naslednji mesec ISTI, kot
 *     če bi oba meseca generirali v enem kosu. To tu merimo, da ostane
 *     tako - sidro, vezano na začetek meseca, bi vsak mesec začelo znova.
 *
 *  2) OBJAVLJENI prejšnji mesec pa je lahko drugačen od kalupa: ročni
 *     popravki, menjave, nadomeščanja. Kdor je zadnji dan prejšnjega
 *     meseca DEJANSKO delal nočno, prvega dne novega meseca ne sme na
 *     dnevno/dopoldansko izmeno (pravilo počitka iz navodil projekta) -
 *     tudi če kalup pravi drugače.
 *
 * Zagon: node skripte/preveri-nadaljevanje-meseca.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
// izmene.js je šifrant kratic, ki ga generator potrebuje za pravilo počitka.
global.window = global;
new Function(readFileSync(join(koren, "izmene.js"), "utf8"))();
const G = createRequire(import.meta.url)(join(koren, "generator-core.js"));

const napake = [];
function trdi(pogoj, opis) {
  console.log((pogoj ? "  ✓ " : "  ✗ ") + opis);
  if (!pogoj) napake.push(opis);
}
function eq(a, b, opis) {
  const enaka = JSON.stringify(a) === JSON.stringify(b);
  trdi(enaka, opis + (enaka ? "" : ` – dobil ${JSON.stringify(a)}, pričakoval ${JSON.stringify(b)}`));
}

const SIDRO = "2026-09-28";
const kalup = (staff, startISO, endISO, prejsnjiDan) =>
  G.generirajKalup({ anchorMondayISO: SIDRO, startISO, endISO, staff, prejsnjiDan });

console.log("1) pravilo počitka po nočni (navodila projekta)");
trdi(G.krsiPocitek("Nočna", "Dopoldne"), "po nočni ni dopoldanske");
trdi(G.krsiPocitek("Nočna 12", "Dnevna 12"), "po nočni 12 ni dnevne 12");
trdi(G.krsiPocitek("Nočna od 19", "Dopoldne"), "po nočni od 19 ni dopoldanske");
trdi(G.krsiPocitek("NOČNA", "DOPOLDAN"), "zapis z velikimi črkami šteje enako");
trdi(!G.krsiPocitek("Nočna", "Popoldne"), "popoldanska po nočni ni prepovedana (ni v pravilu)");
trdi(!G.krsiPocitek("Dopoldne", "Dopoldne"), "dopoldanska za dopoldansko ni kršitev");
trdi(!G.krsiPocitek("", "Dopoldne"), "brez prejšnje izmene ni kršitve");
trdi(!G.krsiPocitek("Nočna", ""), "prost dan po nočni ni kršitev");

console.log("2) kalup se sam nadaljuje čez mejo meseca");
{
  const staff = [{ ime: "A", startLetter: "A" }, { ime: "B", startLetter: "B" },
                 { ime: "D", startLetter: "D" }];
  const okt = kalup(staff, "2026-10-01", "2026-10-31").dnevi.slice(0, 3);
  const skupaj = kalup(staff, "2026-09-01", "2026-10-31").dnevi
    .filter(d => d.datum >= "2026-10-01" && d.datum <= "2026-10-03");
  eq(okt, skupaj, "ločeno generiran oktober je isti kot del neprekinjenega niza");
}

console.log("3) objavljena nočna zadnji dan prejšnjega meseca prepreči dnevno izmeno");
{
  // Sobota 10.10.2026 po kalupu: črka E dela "Dnevna 12", črke A/B/C so
  // proste. Vrednosti niso izbrane na pamet - preverjene so v izhodu
  // generatorja, ker je izbira dneva bistvena (med tednom po vzorcu ni
  // nikogar, ki bi bil RES prost, in nadomestila ni od kod vzeti).
  const staff = [{ ime: "Nočni", startLetter: "E" }, { ime: "Prosti", startLetter: "A" }];
  const brez = kalup(staff, "2026-10-10", "2026-10-31").dnevi[0];
  eq(brez.izmene, { "Nočni": "Dnevna 12", "Prosti": "" }, "izhodišče po kalupu");

  const z = kalup(staff, "2026-10-10", "2026-10-31", { "Nočni": "Nočna" });
  const prvi = z.dnevi[0];
  trdi(prvi.izmene["Nočni"] === "", "po objavljeni nočni ta dan ne dela");
  trdi(prvi.izmene["Prosti"] === "Dnevna 12",
    "izmena se prenese na sodelavca, ki je ta dan naravno prost – dobil: " + prvi.izmene["Prosti"]);
  trdi(z.opozorila.length === 0, "in ker je nadomestilo najdeno, opozorila ni");

  // Pravilo velja SAMO za prehod med mesecema - naslednji dnevi ostanejo
  // po kalupu, sicer bi en sam podatek prekrojil cel mesec.
  eq(z.dnevi[2].izmene, kalup(staff, "2026-10-10", "2026-10-31").dnevi[2].izmene,
     "tretji dan je spet po kalupu");
}

console.log("4) brez nadomestila izmena ostane in generator opozori");
{
  const staff = [{ ime: "Nočni", startLetter: "E" }];
  const z = kalup(staff, "2026-10-10", "2026-10-31", { "Nočni": "Nočna 12" });
  trdi(z.dnevi[0].izmene["Nočni"] === "Dnevna 12",
    "izmena ostane zasedena (nihče je ne more prevzeti)");
  trdi(z.opozorila.length === 1, `generator doda natanko eno opozorilo (${z.opozorila.length})`);
  const o = z.opozorila[0] || {};
  trdi(o.datum === "2026-10-10", "opozorilo je vezano na pravi dan");
  trdi(/Nočna 12/.test(o.sporocilo || "") && /počitek po nočni/.test(o.sporocilo || ""),
    "in pove razlog: " + o.sporocilo);
}

console.log("5) nadomestilo ne sme samo kršiti počitka");
{
  // Oba sta zadnji dan prejšnjega meseca delala nočno, zato izmene ne more
  // prevzeti nobeden.
  //
  // Brez te zaščite se zgodi nekaj, kar je slabše od nerešene težave: prvi
  // izmeno preda drugemu, drugi je zdaj v kršitvi in jo preda nazaj prvemu
  // - končno stanje je ISTO kot na začetku, a generator ne izpiše NOBENEGA
  // opozorila. Kršitev tako tiho izgine z zaslona, čeprav v razporedu
  // ostane. Zato tu ne merimo končnega stanja (to je enako v obeh
  // primerih), ampak to, da je težava PRIJAVLJENA.
  const staff = [{ ime: "Nočni", startLetter: "E" }, { ime: "TudiNočni", startLetter: "A" }];
  const z = kalup(staff, "2026-10-10", "2026-10-31",
                  { "Nočni": "Nočna", "TudiNočni": "Nočna" });
  trdi(z.opozorila.length === 1,
    `kršitev je prijavljena, ne tiho prestavljena (opozoril: ${z.opozorila.length})`);
  trdi(/počitek po nočni/.test((z.opozorila[0] || {}).sporocilo || ""),
    "in navaja pravi razlog");
  // Kdorkoli od obeh na koncu drži izmeno, ne sme biti nihče DRUG kot tisti,
  // ki je bil v kršitvi - izmena se ne sme preseliti na osebo, ki bi z njo
  // ravno tako kršila počitek.
  const nosilec = Object.keys(z.dnevi[0].izmene).filter(i => z.dnevi[0].izmene[i] === "Dnevna 12");
  eq(nosilec, ["Nočni"], "izmena se ni preselila na drugega kršitelja");
}

console.log("6) brez podatka o prejšnjem mesecu se generator obnaša kot doslej");
{
  const staff = [{ ime: "A", startLetter: "A" }, { ime: "D", startLetter: "D" }];
  eq(kalup(staff, "2026-10-05", "2026-10-10").dnevi,
     kalup(staff, "2026-10-05", "2026-10-10", null).dnevi,
     "izid je enak z null in brez parametra");
  eq(kalup(staff, "2026-10-05", "2026-10-10", {}).dnevi,
     kalup(staff, "2026-10-05", "2026-10-10").dnevi,
     "in enak s praznim zapisom");
}

console.log("7) želje (omejitve) še vedno delujejo skupaj s prenosom");
{
  // 11.10. je nedelja - črka E spet dela "Dnevna 12", A je prost.
  const staff = [{ ime: "Nočni", startLetter: "E", omejitve: ["2026-10-11"] },
                 { ime: "Prosti", startLetter: "A" }];
  const z = kalup(staff, "2026-10-10", "2026-10-31", { "Nočni": "Nočna" });
  trdi(z.dnevi[0].izmene["Nočni"] === "", "10.10. razbremenjen zaradi počitka po nočni");
  trdi(z.dnevi[1].izmene["Nočni"] === "", "11.10. razbremenjen zaradi svoje želje");
  trdi(z.dnevi[1].izmene["Prosti"] === "Dnevna 12", "in izmeno tisti dan prevzame sodelavec");
  trdi(z.opozorila.length === 0, "brez opozoril – oba razloga sta bila razrešena");
}

console.log("");
if (napake.length) {
  console.error(`NEUSPEŠNO – ${napake.length} napak`);
  napake.forEach(n => console.error("  - " + n));
  process.exit(1);
}
console.log("VSE V REDU");
