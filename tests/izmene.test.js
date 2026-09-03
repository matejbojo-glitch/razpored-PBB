/* Uradna legenda izmen (izmene.js).
 *
 * Preverja se tisto, česar se ob urejanju tabele kratic najlažje spregleda:
 * da se ZAPIS, ki ga aplikacija vpiše v celico razporeda, prebere nazaj v
 * isto kratico. Urejevalnik razporeda (index.html -> "Uredi razpored")
 * ponuja natanko te zapise, zato bi napaka tu pomenila celico, ki je
 * legenda po shranjevanju ne prepozna več: siva barva, nič ur, nobenega
 * delovnopravnega pravila.
 */
import { describe, it, expect } from "vitest";
import { nalozi } from "./pomozno/nalozi-brskalnik.js";

const Izmene = nalozi("izmene.js", "Izmene");

describe("Izmene.moznosti: zapisi za urejevalnik razporeda", () => {
  it("vsak zapis se prebere nazaj v svojo kratico", () => {
    const napacni = Izmene.moznosti()
      .filter((m) => Izmene.kratica(m.zapis) !== m.kratica)
      .map((m) => `${m.kratica} -> "${m.zapis}" -> ${Izmene.kratica(m.zapis)}`);
    expect(napacni).toEqual([]);
  });

  it("pokrije celotno legendo, brez podvojenih kratic", () => {
    const moznosti = Izmene.moznosti();
    expect(moznosti).toHaveLength(Izmene.KRATICE.length);
    expect(new Set(moznosti.map((m) => m.kratica)).size).toBe(moznosti.length);
  });
});

describe("KRO (kroženje)", () => {
  it("je odsotnost z lastno kodo, ne delo in ne prost dan", () => {
    expect(Izmene.kratica("KRO")).toBe("KRO");
    expect(Izmene.stanje("KRO")).toBe("krozenje");
    // V ozki celici mreže se izpiše kratica (kot LD/BS), ne cel naziv.
    expect(Izmene.nazivZaMrezo("KRO")).toBe("KRO");
  });

  it("ne šteje v zasedbo izmene na matičnem oddelku", () => {
    // Oseba tisti dan dela na DRUGEM oddelku - generator je pri štetju
    // pokritosti ne sme prišteti nobeni izmeni.
    expect(Izmene.skupinaGeneratorja("KRO")).toBe("off");
  });
});
