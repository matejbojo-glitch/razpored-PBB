#!/usr/bin/env node
/* Preostanek letnega dopusta: izpeljan, ne prepisan.
 *
 * Uporabnikova zahteva (september 2026): ko STI prekrije dan letnega
 * dopusta, se ta dan "vrne v kvoto" - tudi v stanju dopusta, ne le v
 * števcu "LD dni" v Željah.
 *
 * Kadrisovega polja (kadrovski_podatki.leave_balance_days) aplikacija NE
 * sme prepisovati: uvoz ga vsak mesec povozi (sync_leave_balance_to_hr_details
 * v schema.sql), zato bi se dva vira prepirala za isto polje in popravek bi
 * ob naslednjem uvozu izginil. Preostanek se zato IZPELJE:
 *
 *     preostanek = stanje iz Kadrisa (na dan leave_balance_asof)
 *                − dnevi LD, vpisani PO tem dnevu (samo delovni dnevi)
 *
 * Tu se preverja prav to: pravilo računa (dopust.js), da ga OBA zaslona
 * uporabljata enako, in da se ob izbrisu vrstice LD preostanek res poveča.
 *
 * Zagon: node skripte/preveri-stanje-dopusta.mjs
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

const sb = { console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(koren, "prazniki.js"), "utf8"), sb);
vm.runInContext(readFileSync(join(koren, "dopust.js"), "utf8"), sb);
const D = sb.window.Dopust;

// Oktober 2026: 1. je četrtek. 3./4. sta sobota in nedelja, 31. je sobota.
// 31. oktober je tudi dan reformacije (dela prost praznik).
console.log("1) štejejo samo DELOVNI dnevi");
{
  eq(D.porabljeniDnevi(["2026-10-01", "2026-10-02"], "2026-10-01"), 2, "četrtek in petek štejeta");
  eq(D.porabljeniDnevi(["2026-10-03", "2026-10-04"], "2026-10-01"), 0, "sobota in nedelja ne");
  eq(D.porabljeniDnevi(["2026-11-01"], "2026-10-01"), 0,
    "dan spomina na mrtve (praznik) ne porabi kvote");
  eq(D.porabljeniDnevi(["2026-10-01", "2026-10-01"], "2026-10-01"), 1, "isti dan šteje enkrat");
  eq(D.porabljeniDnevi([], "2026-10-01"), 0, "brez vnosov nič");
  eq(D.porabljeniDnevi(null, "2026-10-01"), 0, "tudi brez seznama ne pade");
}

console.log("2) dnevi PRED Kadrisovim stanjem se ne odštevajo (Kadris jih že upošteva)");
{
  eq(D.porabljeniDnevi(["2026-09-30", "2026-10-01"], "2026-10-01"), 1,
    "30. 9. je pred izhodiščem in ne šteje, 1. 10. šteje");
  eq(D.porabljeniDnevi(["2026-09-30"], null), 1,
    "brez izhodišča se štejejo vsi (ne vemo, kje odrezati)");
}

console.log("3) preostanek = Kadris − vpisano po tem");
{
  const s = D.stanje({ kvota: 30, kadris: 12, naDan: "2026-10-01",
    ldDatumi: ["2026-10-01", "2026-10-02", "2026-10-05"] });
  eq(s.porabljeno, 3, "trije delovni dnevi po izhodišču");
  eq(s.preostanek, 9, "preostanek je 12 − 3");
  eq(s.kadris, 12, "Kadrisovo stanje ostane nespremenjeno");
  eq(s.kvota, 30, "letni dopust skupaj ostane");
  trdi(s.jeIzpeljano, "označeno je, da je preostanek izpeljan");
}

console.log("4) ko STI prekrije dan dopusta, se dan VRNE v kvoto");
{
  // Pred: tri vrstice LD. Po vpisu STI čez 2. 10. ostaneta dve - vrstica
  // je za osebo in dan ENA sama, zato LD za tisti dan izgine.
  const pred = D.stanje({ kvota: 30, kadris: 12, naDan: "2026-10-01",
    ldDatumi: ["2026-10-01", "2026-10-02", "2026-10-05"] });
  const po = D.stanje({ kvota: 30, kadris: 12, naDan: "2026-10-01",
    ldDatumi: ["2026-10-01", "2026-10-05"] });
  eq(pred.preostanek, 9, "pred vpisom STI: 9 dni");
  eq(po.preostanek, 10, "po vpisu STI: 10 dni – dan se je vrnil");
  eq(po.kadris, pred.kadris, "Kadrisovo polje se pri tem NI spremenilo");
}

console.log("5) brez Kadrisovega stanja preostanka ni mogoče izpeljati");
{
  const s = D.stanje({ kvota: 30, kadris: null, naDan: null, ldDatumi: ["2026-10-01"] });
  eq(s.preostanek, null, "preostanek je 'ni podatka' (ne vemo, od kod odštevati)");
  eq(s.porabljeno, 1, "porabljeni dnevi so kljub temu znani");
}

console.log("6) oba zaslona računata po ISTEM pravilu (dopust.js), brez svoje kopije");
{
  const imenik = readFileSync(join(koren, "imenik.html"), "utf8");
  const dashboard = readFileSync(join(koren, "dashboard.html"), "utf8");
  trdi(/window\.Dopust\.stanje\(/.test(imenik), "Imenik kliče window.Dopust.stanje");
  trdi(/window\.Dopust\.stanje\(/.test(dashboard), "Nadzorna plošča prav tako");
  [["imenik.html", imenik], ["dashboard.html", dashboard]].forEach(([ime, src]) => {
    trdi(/<script src="dopust\.js"><\/script>/.test(src), ime + " naloži dopust.js");
    trdi(/<script src="prazniki\.js"><\/script>/.test(src),
      ime + " naloži tudi prazniki.js (brez njega bi prazniki šteli kot dopust)");
  });
  // Kadrisovo polje se sme pisati SAMO iz HR obrazca v Imeniku (ročni
  // popravek admina) in iz uvoza - nikoli iz izračuna dopusta.
  trdi(!/leave_balance_days:\s*(s|stanje)\./.test(imenik + dashboard),
    "nikjer se izpeljani preostanek ne zapisuje nazaj v Kadrisovo polje");
}

console.log("7) skupni modul je v predpomnilniku in med vhodi za gradnjo");
{
  const sw = readFileSync(join(koren, "sw.js"), "utf8");
  const vite = readFileSync(join(koren, "vite.config.mjs"), "utf8");
  trdi(/'\.\/dopust\.js'/.test(sw), "dopust.js je v seznamu sw.js (sicer ga brez omrežja ni)");
  trdi(/"dopust\.js"/.test(vite), "in med skupnimi moduli v vite.config.mjs");
}

console.log("");
if (napake.length) { console.log("NEUSPEŠNO – " + napake.length + " napak"); process.exit(1); }
console.log("VSE V REDU");
