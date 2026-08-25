/* Pravila generatorja: 5-tedenska rotacija kalupa in dežurstva.
 *
 * Vir resnice je generator-core.js - čista logika (brez UI), ki jo
 * uporabljata tako admin.html (generiranje in urejanje razporeda) kot
 * skripte/preveri-dezurstva-urejanje.mjs. Ta datoteka Vitest verzija istih
 * pravil - podrobnejši scenariji (zaklenjeni dnevi, ročno urejanje na
 * pravem izrisu admin.html) ostajajo v skripte/preveri-dezurstva-urejanje.mjs.
 */
import { describe, it, expect } from "vitest";
import Generator from "../generator-core.js";

describe("kalup: 5-tedenska rotacija (A–E)", () => {
  // Ponedeljek 2026-08-31 je "teden 0" za vse spodnje preizkuse.
  const PONEDELJEK = "2026-08-31";

  it("kalupska črka A v tednu 0 sledi uradnemu vzorcu PON–NED", () => {
    const { dnevi } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: "2026-08-31",
      endISO: "2026-09-06",
      staff: [{ ime: "Kovač Ana", startLetter: "A", hsuffix: false }],
    });
    const izmene = dnevi.map((d) => d.izmene["Kovač Ana"]);
    // PON,TOR: KPU · SRE,ČET: Popoldne · PET: Popoldne do 19 · SO,NE: Dnevna 12
    expect(izmene).toEqual([
      "KPU", "KPU", "Popoldne", "Popoldne", "Popoldne do 19", "Dnevna 12", "Dnevna 12",
    ]);
  });

  it("hsuffix doda 'h' k dvoumnim izmenam (samo E1)", () => {
    const { dnevi } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: "2026-08-31",
      endISO: "2026-08-31",
      staff: [
        { ime: "brez h", startLetter: "A", hsuffix: false },
        { ime: "z h", startLetter: "A", hsuffix: true },
      ],
    });
    // Prvi teden je oboje "KPU" (h vpliva le na "do 19"/"od 19" različice),
    // zato preverimo teden, kjer se razlika dejansko pokaže: petek.
    const { dnevi: petkovTeden } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: "2026-09-04",
      endISO: "2026-09-04", // petek istega tedna
      staff: [
        { ime: "brez h", startLetter: "A", hsuffix: false },
        { ime: "z h", startLetter: "A", hsuffix: true },
      ],
    });
    expect(petkovTeden[0].izmene["brez h"]).toBe("Popoldne do 19");
    expect(petkovTeden[0].izmene["z h"]).toBe("Popoldne do 19h");
  });

  it("rotacija se po 5 tednih ponovi", () => {
    const opts = {
      anchorMondayISO: PONEDELJEK,
      startISO: PONEDELJEK,
      endISO: PONEDELJEK,
      staff: [{ ime: "X", startLetter: "A", hsuffix: false }],
    };
    const teden0 = Generator.generirajKalup(opts).dnevi[0].izmene.X;
    const teden5 = Generator.generirajKalup({
      ...opts,
      startISO: "2026-12-07", // 14 tednov kasneje = 2 * 5 + 4... uporabimo točno 5 tednov spodaj
      endISO: "2026-12-07",
    }).dnevi[0].izmene.X;
    // 5 tednov = 35 dni od PONEDELJEK.
    const petTednovKasneje = Generator.generirajKalup({
      ...opts,
      startISO: "2026-10-05",
      endISO: "2026-10-05",
    }).dnevi[0].izmene.X;
    expect(petTednovKasneje).toBe(teden0);
    expect(typeof teden5).toBe("string"); // (drug teden - samo da klic ne pade)
  });

  it("dopust ta teden prisili kalupsko črko C (LD)", () => {
    // dopustTedni vsebuje PONEDELJEK tistega tedna - cel teden postane LD,
    // ne glede na to, kateri je bil dejanski razpored po vzorcu.
    const { dnevi } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: PONEDELJEK,
      endISO: "2026-09-02",
      staff: [{ ime: "X", startLetter: "A", hsuffix: false, dopustTedni: [PONEDELJEK] }],
    });
    expect(dnevi.every((d) => d.izmene.X === "LD")).toBe(true);
  });

  it("omejitev na dan, ko oseba dela, poišče nadomestilo na oddelku", () => {
    // Sobota istega tedna: A-kalup dela ("Dnevna 12"), B-kalup je po LASTNEM
    // vzorcu prost ("") - to je edina oblika "na voljo", ki jo koda šteje
    // (glej komentar ob generirajKalup: NE nekdo na LD/pomoči).
    const { dnevi, opozorila } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: "2026-09-05", // sobota
      endISO: "2026-09-05",
      staff: [
        { ime: "X", startLetter: "A", hsuffix: false, omejitve: ["2026-09-05"] },
        { ime: "Y", startLetter: "B", hsuffix: false },
      ],
    });
    expect(dnevi[0].izmene.X).toBe(""); // X je razbremenjen
    expect(dnevi[0].izmene.Y).toBe("Dnevna 12"); // Y prevzame njegovo izmeno
    expect(opozorila).toHaveLength(0);
  });

  it("brez nikogar na voljo za nadomestilo generator opozori, a ne izgubi dneva", () => {
    const { dnevi, opozorila } = Generator.generirajKalup({
      anchorMondayISO: PONEDELJEK,
      startISO: "2026-09-02",
      endISO: "2026-09-02",
      staff: [{ ime: "Sam Svoj", startLetter: "A", hsuffix: false, omejitve: ["2026-09-02"] }],
    });
    expect(dnevi[0].izmene["Sam Svoj"]).toBe("Popoldne"); // izmena ostane zasedena
    expect(opozorila).toHaveLength(1);
    expect(opozorila[0].sporocilo).toMatch(/nihče.*ni na voljo/);
  });
});

describe("preveriDezurstva: ista kršitev na zaslonu in v generatorju", () => {
  it("prepozna vse vrste kršitev na enem razporedu", () => {
    const staff = [
      { ime: "A", dopust: ["2026-09-10"], prostDanVTednu: "PO", maxMesecno: 2, zadnjeDezurstvo: "2026-08-31" },
      { ime: "B", samoMedTednom: true },
    ];
    const razpored = [
      { datum: "2026-09-01", zaposleni: "A" }, // 1 dan po zgodovinskem dežurstvu
      { datum: "2026-09-05", zaposleni: "B" }, // sobota, B dežura samo med tednom
      { datum: "2026-09-07", zaposleni: "A" }, // ponedeljek = A ima prost dan
      { datum: "2026-09-10", zaposleni: "A" }, // A na dopustu + 4. dežurstvo v mesecu (maks 2)
    ];
    const izid = Object.fromEntries(
      Generator.preveriDezurstva({ razpored, staff, minRazmikDni: 3 }).map((r) => [r.datum, r.krsitve])
    );
    expect(izid["2026-09-01"]).toEqual(["razmik"]);
    expect(izid["2026-09-05"]).toEqual(["vikend"]);
    expect(izid["2026-09-07"]).toContain("prostDan");
    expect(izid["2026-09-10"]).toContain("odsoten");
    expect(izid["2026-09-10"]).toContain("maxMesecno");
  });

  it("vsaka kršitev ima slovensko razlago (KRSITVE_OPIS)", () => {
    for (const koda of Object.keys(Generator.KRSITVE_OPIS)) {
      expect(Generator.KRSITVE_OPIS[koda]).toBeTruthy();
    }
  });

  it("drugi vikend v istem mesecu je vikendna kršitev, prvi ni", () => {
    const izid = Object.fromEntries(
      Generator.preveriDezurstva({
        staff: [{ ime: "A" }],
        razpored: [
          { datum: "2026-09-05", zaposleni: "A" }, // sobota
          { datum: "2026-09-12", zaposleni: "A" }, // naslednja sobota
        ],
        minRazmikDni: 0,
        maxVikendMesecno: true,
      }).map((r) => [r.datum, r.krsitve])
    );
    expect(izid["2026-09-05"]).toEqual([]);
    expect(izid["2026-09-12"]).toEqual(["vikendKvota"]);
  });
});

describe("generirajDezurstva: noben dan ne sme ostati brez dežurnega", () => {
  it("ko pravila ne dopuščajo čiste rešitve, generator vseeno nekoga predlaga", () => {
    const res = Generator.generirajDezurstva({
      startISO: "2026-09-01",
      endISO: "2026-09-08",
      minRazmikDni: 3,
      staff: [{ ime: "A", obstojeceStevilo: 0 }, { ime: "B", obstojeceStevilo: 0 }],
    });
    const prazni = res.razpored.filter((r) => !r.zaposleni);
    expect(prazni).toEqual([]);
    // Nekateri dnevi so nujno "sila" (kršijo razmik) - to je pričakovano
    // pri samo dveh ljudeh na 3-dnevni razmik, in vsak tak dan pove, katero
    // pravilo krši.
    const sila = res.razpored.filter((r) => r.sila);
    expect(sila.length).toBeGreaterThan(0);
    expect(sila.every((r) => (r.krsitve || []).length > 0)).toBe(true);
  });

  it("dopust ima prednost pred razmikom - generator raje krši razmik", () => {
    const res = Generator.generirajDezurstva({
      startISO: "2026-09-01",
      endISO: "2026-09-03",
      minRazmikDni: 5,
      staff: [
        { ime: "A", obstojeceStevilo: 0, dopust: ["2026-09-01", "2026-09-02", "2026-09-03"] },
        { ime: "B", obstojeceStevilo: 0 },
      ],
    });
    expect(res.razpored.every((r) => r.zaposleni === "B")).toBe(true);
    expect(res.razpored.some((r) => (r.krsitve || []).includes("odsoten"))).toBe(false);
  });

  it("zaklenjeni (že objavljeni) dnevi ostanejo nedotaknjeni", () => {
    const staff = [
      { ime: "A", obstojeceStevilo: 0 },
      { ime: "B", obstojeceStevilo: 0 },
      { ime: "C", obstojeceStevilo: 0 },
      { ime: "D", obstojeceStevilo: 0 },
      { ime: "E", obstojeceStevilo: 0 },
    ];
    const zaklenjeni = { "2026-09-01": "E", "2026-09-02": "E" };
    const res = Generator.generirajDezurstva({
      startISO: "2026-09-01", endISO: "2026-09-10", minRazmikDni: 3, staff, zaklenjeni,
    });
    const prvi = res.razpored.find((r) => r.datum === "2026-09-01");
    const drugi = res.razpored.find((r) => r.datum === "2026-09-02");
    expect(prvi).toMatchObject({ zaposleni: "E", zaklenjeno: true });
    expect(drugi).toMatchObject({ zaposleni: "E", zaklenjeno: true });

    // Brez zaklepa bi generator - pravičnost porazdelitve - izbral koga
    // drugega prvi dan; to dokaže, da zaklep dejansko nekaj spremeni.
    const brez = Generator.generirajDezurstva({
      startISO: "2026-09-01", endISO: "2026-09-10", minRazmikDni: 3, staff,
    });
    expect(brez.razpored.find((r) => r.datum === "2026-09-01").zaposleni).not.toBe("E");
  });

  it("minRazmikDni prepreči dvoje dežurstev prehitro zapored", () => {
    const res = Generator.generirajDezurstva({
      startISO: "2026-09-01",
      endISO: "2026-09-10",
      minRazmikDni: 3,
      staff: [
        { ime: "A", obstojeceStevilo: 0 },
        { ime: "B", obstojeceStevilo: 0 },
        { ime: "C", obstojeceStevilo: 0 },
        { ime: "D", obstojeceStevilo: 0 },
      ],
    });
    const dneviA = res.razpored.filter((r) => r.zaposleni === "A").map((r) => r.datum).sort();
    for (let i = 1; i < dneviA.length; i++) {
      const razlika =
        (new Date(dneviA[i]) - new Date(dneviA[i - 1])) / (1000 * 60 * 60 * 24);
      // Lahko krši (sila:true), a samo če je resnično noben drug ni bil na
      // voljo - pri 4 ljudeh na 10 dni to ne bi smelo biti potrebno.
      if (razlika < 3) {
        const dan = res.razpored.find((r) => r.datum === dneviA[i]);
        expect(dan.sila).toBe(true);
      }
    }
  });
});
