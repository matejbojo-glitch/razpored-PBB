/* Prazniki in oblika datuma - ena skupna resnica za VSO aplikacijo.
 *
 * datum.js: "27.10.2026", ne slovenska privzeta "27. 10. 2026" (izrecna
 * zahteva uporabnika - s presledki se je besedilo v ozkih stolpcih
 * obrezovalo). prazniki.js: kateri dnevi so dela prosti (za "NZV dela
 * pon-pet" pravilo v Moj razpored / Po oddelkih / Imenik -> Razpredelnica -
 * doslej živelo na dveh mestih, zato je Alukić Dino v nedeljo kazal enkrat
 * "LD", drugič "DOP").
 */
import { describe, it, expect } from "vitest";
import { nalozi } from "./pomozno/nalozi-brskalnik.js";

const Datum = nalozi("datum.js", "Datum");
const Prazniki = nalozi("prazniki.js", "Prazniki");

describe("Datum.slo: dan.mesec.leto brez presledkov", () => {
  it("osnovna oblika, brez vodilnih ničel", () => {
    expect(Datum.slo("2026-10-27")).toBe("27.10.2026");
    expect(Datum.slo("2026-09-01")).toBe("1.9.2026");
    expect(Datum.slo("2026-12-31")).toBe("31.12.2026");
  });

  it("se ne premakne zaradi časovnega pasu (delovni datum je besedilo, ne UTC)", () => {
    // Ista past kot pri uvozu iz Excela: "YYYY-MM-DD" mora ostati isti dan
    // ne glede na pas, v katerem brskalnik teče - naivni "new Date(iso)" bi
    // ga v pasu ZA UTC premaknil na prejšnji dan.
    const staraTZ = process.env.TZ;
    try {
      process.env.TZ = "America/New_York"; // UTC-5/-4
      const DatumNY = nalozi("datum.js", "Datum");
      expect(DatumNY.slo("2026-10-27")).toBe("27.10.2026");
    } finally {
      if (staraTZ === undefined) delete process.env.TZ;
      else process.env.TZ = staraTZ;
    }
  });

  it("prazne/neveljavne vrednosti ne zrušijo prikaza", () => {
    expect(Datum.slo(null)).toBe("");
    expect(Datum.slo(undefined)).toBe("");
    expect(Datum.slo("")).toBe("");
    expect(Datum.slo("ni-datum")).toBe("");
  });

  it("sloBrezLeta izpusti leto (mesečna tabela, kjer je leto že v glavi)", () => {
    expect(Datum.sloBrezLeta("2026-10-27")).toBe("27.10.");
  });

  it("sloSCasom doda uro:minuto ob koncu", () => {
    expect(Datum.sloSCasom("2026-08-11T13:51:22Z")).toMatch(/^11\.8\.2026 \d{2}:\d{2}$/);
  });
});

describe("Datum: koledarski izračuni", () => {
  it("zadnjiDan pozna prestopno leto", () => {
    expect(Datum.zadnjiDan(2026, 2)).toBe(28); // 2026 ni prestopno
    expect(Datum.zadnjiDan(2028, 2)).toBe(29); // 2028 je
    expect(Datum.zadnjiDan(2026, 4)).toBe(30);
    expect(Datum.zadnjiDan(2026, 12)).toBe(31);
  });

  it("obseg vrne prvi in zadnji dan meseca", () => {
    expect(Datum.obseg("2026-11")).toEqual({ startISO: "2026-11-01", endISO: "2026-11-30" });
    expect(Datum.obseg("2026-02")).toEqual({ startISO: "2026-02-01", endISO: "2026-02-28" });
  });

  it("dnevi() prehodi cel obseg, oba konca vključno, s pravo kratico dneva", () => {
    const d = Datum.dnevi("2026-09-01", "2026-09-03");
    expect(d).toEqual([
      { datum: "2026-09-01", dan: "TO" }, // torek
      { datum: "2026-09-02", dan: "SR" },
      { datum: "2026-09-03", dan: "ČE" },
    ]);
  });

  it("dan2 (ozek stolpec) in dan3 (širši) se ujemata za isti datum", () => {
    // 2026-09-05 je sobota.
    expect(Datum.dan2("2026-09-05")).toBe("SO");
    expect(Datum.dan3("2026-09-05")).toBe("SOB");
  });

  it("mesecLeto sestavi slovensko ime meseca", () => {
    expect(Datum.mesecLeto("2026-08")).toBe("avgust 2026");
    expect(Datum.MESECI).toHaveLength(12);
  });
});

describe("Prazniki: slovenski DELA PROSTI dnevi (2026)", () => {
  it.each([
    ["2026-01-01", "novo leto"],
    ["2026-01-02", "novo leto"],
    ["2026-02-08", "Prešernov dan"],
    ["2026-04-27", "dan upora proti okupatorju"],
    ["2026-05-01", "praznik dela"],
    ["2026-05-02", "praznik dela"],
    ["2026-06-25", "dan državnosti"],
    ["2026-08-15", "Marijino vnebovzetje"],
    ["2026-10-31", "dan reformacije"],
    ["2026-11-01", "dan spomina na mrtve"],
    ["2026-12-25", "božič"],
    ["2026-12-26", "dan samostojnosti in enotnosti"],
  ])("%s je praznik (%s)", (iso, ime) => {
    expect(Prazniki.jePraznik(iso)).toBe(true);
    expect(Prazniki.naziv(iso)).toBe(ime);
  });

  it("premakljivi prazniki 2026 se izračunajo iz velike noči", () => {
    // Velika noč 2026 je 5. 4. - to ni vnaprej zapisano, ampak izračunano.
    expect(Prazniki.jePraznik("2026-04-05")).toBe(true);
    expect(Prazniki.naziv("2026-04-05")).toBe("velikonočna nedelja");
    expect(Prazniki.jePraznik("2026-04-06")).toBe(true);
    expect(Prazniki.naziv("2026-04-06")).toBe("velikonočni ponedeljek");
    expect(Prazniki.jePraznik("2026-05-24")).toBe(true);
    expect(Prazniki.naziv("2026-05-24")).toBe("binkoštna nedelja");
  });

  it("dela NISO prosti prazniki (17. avgust, 15. sep., 23. nov.) namenoma niso vključeni", () => {
    expect(Prazniki.jePraznik("2026-08-17")).toBe(false);
    expect(Prazniki.jePraznik("2026-09-15")).toBe(false);
    expect(Prazniki.jePraznik("2026-11-23")).toBe(false);
  });

  it("navaden delavnik ni praznik", () => {
    expect(Prazniki.jePraznik("2026-09-02")).toBe(false);
    expect(Prazniki.naziv("2026-09-02")).toBe("");
  });

  it("jeVikend loči soboto/nedeljo od delavnika", () => {
    expect(Prazniki.jeVikend("2026-09-05")).toBe(true); // sobota
    expect(Prazniki.jeVikend("2026-09-06")).toBe(true); // nedelja
    expect(Prazniki.jeVikend("2026-09-07")).toBe(false); // ponedeljek
  });

  it("jeDelaProstDan = vikend ALI praznik (pravilo za NZV prost dan)", () => {
    expect(Prazniki.jeDelaProstDan("2026-09-05")).toBe(true); // vikend
    expect(Prazniki.jeDelaProstDan("2026-01-01")).toBe(true); // praznik na delavnik
    expect(Prazniki.jeDelaProstDan("2026-09-07")).toBe(false); // navaden ponedeljek
  });

  it("se predpomni po letu, a rezultat ostane pravilen za vsako leto posebej", () => {
    // Velika noč 2026 (5. 4.) in 2027 (28. 3.) se razlikujeta - past bi bila
    // deljen predpomnilnik, ki bi drugo leto vrnil isti datum kot prvo.
    expect(Prazniki.jePraznik("2026-04-05")).toBe(true);
    expect(Prazniki.jePraznik("2027-04-05")).toBe(false);
    expect(Prazniki.naziv("2027-04-05")).toBe("");
  });
});
