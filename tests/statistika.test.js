/* Statistika razporeda (statistika-core.js) – seštevanje ur nad mrežo.
 *
 * Preverja se pravilo, ki ga na zaslonu ni mogoče preveriti na pogled:
 * kaj se sešteje v "Delovne ure". Letni dopust (LD) po uporabnikovi
 * zahtevi (september 2026) šteje 8 ur na dan in je v vsoti vštet, ostale
 * odsotnosti (BS, STI, KRO) pa ne. Če bi se to tiho spremenilo, bi
 * primerjava obremenjenosti med zaposlenimi kazala napačno sliko.
 */
import { describe, it, expect } from "vitest";
import { nalozi } from "./pomozno/nalozi-brskalnik.js";

const Prazniki = nalozi("prazniki.js", "Prazniki");
const Izmene = nalozi("izmene.js", "Izmene");
const DelovniCas = nalozi("delovni-cas.js", "DelovniCas");
const Statistika = nalozi("statistika-core.js", "Statistika", {
  Izmene, DelovniCas, Prazniki,
});

// Ponedeljek 2026-11-02 naprej – delovni dnevi, brez praznika, da vikendi
// ne premešajo štetja.
const dnevi = (n, od = 2) =>
  Array.from({ length: n }, (_, i) => ({
    datum: `2026-11-${String(od + i).padStart(2, "0")}`,
  }));

const izracun = (vrstice, dolzina = 5) =>
  Statistika.izracunaj({
    dnevi: dnevi(dolzina),
    staff: Object.keys(vrstice).map((ime) => ({ ime })),
    vrednost: (ime, datum) => vrstice[ime][datum] || "",
  });

describe("letni dopust (LD) v seštevku ur", () => {
  it("en dan LD je natanko 8 h", () => {
    const s = izracun({ "Novak Ana": { "2026-11-02": "LD" } }, 1);
    expect(s.skupno.ur).toBe(8);
    expect(s.skupno.ldUr).toBe(8);
    expect(s.skupno.ldDni).toBe(1);
    expect(s.poOsebi[0].ur).toBe(8);
    expect(s.poOsebi[0].ldUr).toBe(8);
    // LD ni izmena: pokritost oddelka se z dopustom ne izboljša.
    expect(s.skupno.izmen).toBe(0);
    expect(s.skupno.odsotnosti).toBe(1);
  });

  it("teden dopusta je 40 h – v vsoti oseb in v skupnem seštevku", () => {
    const teden = {};
    dnevi(5).forEach((d) => { teden[d.datum] = "LD"; });
    const s = izracun({ "Novak Ana": teden });
    expect(s.poOsebi[0].ur).toBe(40);
    expect(s.poOsebi[0].ldDni).toBe(5);
    expect(s.skupno.ur).toBe(40);
    expect(s.povprecneUr).toBe(40);
  });

  it("druge odsotnosti (BS, STI, KRO) ur ne prinesejo", () => {
    const s = izracun({
      "Novak Ana": { "2026-11-02": "BS", "2026-11-03": "STI", "2026-11-04": "KRO" },
    }, 3);
    expect(s.skupno.ur).toBe(0);
    expect(s.skupno.ldUr).toBe(0);
    expect(s.skupno.odsotnosti).toBe(3);
  });

  it("dopust in delo se seštejeta v isti vsoti", () => {
    // Dopoldne traja 8 h 10 min (s predajo službe), LD je 8 h.
    const s = izracun({
      "Novak Ana": { "2026-11-02": "Dopoldne", "2026-11-03": "LD" },
    }, 2);
    expect(s.poOsebi[0].izmen).toBe(1);
    expect(s.poOsebi[0].ldUr).toBe(8);
    expect(s.poOsebi[0].ur).toBeGreaterThan(8);
    expect(s.skupno.ur).toBe(s.poOsebi[0].ur);
  });

  it("oseba na dopustu ni več videti kot najmanj obremenjena", () => {
    // Prav to je bil razlog za spremembo: brez ur dopusta je bil razpon
    // ur (najmanj–največ) posledica dopusta in ne razporeda.
    const teden = {};
    dnevi(5).forEach((d) => { teden[d.datum] = "LD"; });
    const dela = {};
    dnevi(5).forEach((d) => { dela[d.datum] = "Dopoldne"; });
    const s = izracun({ "Novak Ana": teden, "Kovač Bine": dela });
    expect(s.najmanjUr).toBe(40);
    expect(s.najvecUr - s.najmanjUr).toBeLessThan(2);
  });
});
