/* Delovni čas: trajanje izmen, nočne ure, počitek med izmenama.
 *
 * Vir resnice je src/shared/delovni-cas.js (pravi ES modul, uvožen tudi v
 * robno funkcijo "koledar"). Ure so iz uradne legende "Razpored delovnega
 * časa - Služba za ZN in oskrbo" (velja od 1. 7. 2022).
 *
 * Kaj te številke pomenijo v praksi: po njih se obračuna dodatek za nočno
 * delo, zato tiho odstopanje ni kozmetično - pomeni napačno izplačilo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

import {
  IZMENE,
  PRIVZETA_PRAVILA,
  jeDelo,
  jeDezurstvo,
  podatkiIzmene,
  trajanjeUr,
  nocneUreIzmene,
  pocitekMedIzmenama,
  preveriPravila,
} from "../src/shared/delovni-cas.js";

const koren = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("trajanje izmen po uradni legendi", () => {
  // 10-minutna predaja službe je del izmene - zato 8 h 10 min in ne 8 h.
  it.each([
    ["Dopoldne", "05:50", "14:00", 8 + 10 / 60],
    ["Popoldne", "13:50", "21:00", 7 + 10 / 60],
    ["Popoldne do 19", "13:50", "19:00", 5 + 10 / 60],
    ["Nočna", "20:50", "06:00", 9 + 10 / 60],
    ["Nočna od 19", "18:50", "06:00", 11 + 10 / 60],
    ["Nočna 12", "17:50", "06:00", 12 + 10 / 60],
  ])("%s traja %s–%s", (sifra, zacetek, konec, ure) => {
    const iz = podatkiIzmene(sifra);
    expect(iz).toBeTruthy();
    expect(iz.zacetek).toBe(zacetek);
    expect(iz.konec).toBe(konec);
    expect(iz.ure).toBeCloseTo(ure, 10);
  });

  it("loči obe dnevni 12-urni izmeni – nista izmenljivi", () => {
    // DNEVNA12 je oddelčna (s predajo, 12 h 10 min), DNEVNA12F je flexi
    // (točno 12 h, brez predaje). Dolgo sta bili ena sama koda, od koder
    // je izviralo neujemanje 12,00 : 12,17.
    expect(podatkiIzmene("DNEVNA12").ure).toBeCloseTo(12 + 10 / 60, 10);
    expect(podatkiIzmene("DNEVNA12F").ure).toBe(12);
  });

  it("zapis šifre ne vpliva na izid (velike črke, presledki)", () => {
    // Razpored se uvaža iz Google Sheets, kjer isto izmeno kdo zapiše
    // "Nočna 12", kdo "NOČNA12". Neujemanje bi tiho izpadlo iz obračuna.
    expect(podatkiIzmene("Nočna 12")).toEqual(podatkiIzmene("NOČNA12"));
    expect(podatkiIzmene("dopoldan")).toEqual(podatkiIzmene("Dopoldne"));
  });

  it("trajanjeUr pravilno šteje čez polnoč", () => {
    expect(trajanjeUr("20:50", "06:00")).toBeCloseTo(9 + 10 / 60, 10);
    expect(trajanjeUr("05:50", "14:00")).toBeCloseTo(8 + 10 / 60, 10);
  });

  it("dežurstvo nima ur – v obračun ur ne šteje", () => {
    // Vikend varianta traja 24 h, delavniška 15:30–07:00; ker aplikacija
    // logike po dnevu v tednu (še) nima, se dežurstvo prikaže kot število,
    // ne kot ure. null je torej namerna vrednost, ne pozabljen podatek.
    expect(podatkiIzmene("DEŽURSTVO").ure).toBeNull();
    expect(jeDezurstvo("DEŽURSTVO")).toBe(true);
    expect(jeDezurstvo("Dopoldne")).toBe(false);
  });

  it("odsotnosti niso delo", () => {
    for (const koda of ["LD", "KPU", "BS", "STI", "POR", ""]) {
      expect(jeDelo(koda)).toBe(false);
    }
    expect(jeDelo("Dopoldne")).toBe(true);
    // PRISOTEN (vodje 07:00–15:00) na izrecno odločitev uporabnika ŠTEJE.
    expect(jeDelo("PRISOTEN")).toBe(true);
    expect(podatkiIzmene("PRISOTEN").ure).toBe(8);
  });
});

describe("nočne ure (dodatek za nočno delo, 22:00–06:00)", () => {
  it("popoldanska izmena nima nočnih ur", () => {
    // 13:50–21:00 se nočnega okna sploh ne dotakne.
    expect(nocneUreIzmene("2026-09-02", "Popoldne")).toBe(0);
    expect(nocneUreIzmene("2026-09-02", "Popoldne do 19")).toBe(0);
  });

  it("dopoldanska izmena ima 10 minut nočnih ur (začne ob 05:50)", () => {
    // Nepričakovano, a pravilno in plačno pomembno: dopoldanska se začne
    // deset minut pred koncem nočnega okna, zato teh 10 min šteje z
    // dodatkom. Če bi kdo izmeno "zaokrožil" na 06:00, bi to tu padlo.
    expect(nocneUreIzmene("2026-09-02", "Dopoldne")).toBeCloseTo(10 / 60, 10);
  });

  it("Nočna (20:50–06:00) šteje samo del znotraj 22:00–06:00", () => {
    // Od 20:50 do 22:00 NI nočni dodatek; šteje 22:00–06:00 = 8 h.
    expect(nocneUreIzmene("2026-09-02", "Nočna")).toBeCloseTo(8, 10);
  });

  it("Nočna od 19 in Nočna 12 se začneta pred 22:00, a štejeta enako", () => {
    // Obe se končata ob 06:00 in obe začneta pred 22:00, zato je nočni
    // del pri obeh natanko 22:00–06:00.
    expect(nocneUreIzmene("2026-09-02", "Nočna od 19")).toBeCloseTo(8, 10);
    expect(nocneUreIzmene("2026-09-02", "Nočna 12")).toBeCloseTo(8, 10);
  });

  it("odsotnost nima nočnih ur", () => {
    expect(nocneUreIzmene("2026-09-02", "LD")).toBe(0);
    expect(nocneUreIzmene("2026-09-02", "")).toBe(0);
  });
});

describe("počitek med izmenama", () => {
  const meja = PRIVZETA_PRAVILA.minPocitekUr;
  const krsitvePocitka = (a, b) =>
    preveriPravila([
      { oseba: "X", datum: "2026-09-07", sifra: a },
      { oseba: "X", datum: "2026-09-08", sifra: b },
    ]).filter((k) => k.vrsta === "pocitek");

  it("meja je 10,7 h", () => {
    expect(meja).toBe(10.7);
  });

  it("»Popoldne do 19« → »Dopoldne« (10 h 50 min) je tik nad mejo", () => {
    // Vsakodnevni prehod v razporedu. Pri stari meji 11 h ga je baza
    // zavračala, obrazec pa dovolil - glej skripte/preveri-meja-pocitka.mjs.
    expect(pocitekMedIzmenama("2026-09-07", "Popoldne do 19", "2026-09-08", "Dopoldne"))
      .toBeCloseTo(10 + 50 / 60, 10);
    expect(krsitvePocitka("Popoldne do 19", "Dopoldne")).toHaveLength(0);
  });

  it("»Popoldne« → »Dopoldne« (8 h 50 min) je kršitev", () => {
    expect(krsitvePocitka("Popoldne", "Dopoldne")).toHaveLength(1);
    expect(krsitvePocitka("Popoldne", "Dopoldne")[0].resnost).toBe("kriticno");
  });

  it("»Nočna« → »Popoldne« (7 h 50 min) je kršitev", () => {
    expect(krsitvePocitka("Nočna", "Popoldne")).toHaveLength(1);
  });

  it("po dežurstvu normalen delovnik NI kršitev", () => {
    // Dežurstvo se konča ob 07:00, dopoldanska se ob 07:00 začne - 0 h
    // vmes. Brez te izjeme bi VSAKO dežurstvo med tednom javilo kršitev in
    // opozorilo bi zaradi množice pričakovanih primerov izgubilo pomen.
    // Odločitev vodstva ZN, avgust 2026.
    expect(krsitvePocitka("DEŽURSTVO", "Dopoldne")).toHaveLength(0);
    expect(krsitvePocitka("DEŽURSTVO", "PRISOTEN")).toHaveLength(0);
  });

  it("izjema ne velja preširoko – prehod V dežurstvo se preverja naprej", () => {
    expect(krsitvePocitka("Nočna", "DEŽURSTVO")).toHaveLength(1);
  });
});

describe("zaporedne nočne izmene", () => {
  it("dve zaporedni sta v redu, tri so kršitev", () => {
    const noci = (n) =>
      preveriPravila(
        Array.from({ length: n }, (_, i) => ({
          oseba: "Z",
          datum: `2026-09-0${i + 1}`,
          sifra: "Nočna",
        }))
      ).filter((k) => k.vrsta === "nocne");

    expect(PRIVZETA_PRAVILA.maxZaporednihNocnih).toBe(2);
    expect(noci(2)).toHaveLength(0);
    expect(noci(3).length).toBeGreaterThan(0);
  });
});

describe("kanonični modul in njegovi kopiji ostajajo usklajeni", () => {
  // Robna funkcija "koledar" ne more uvoziti datoteke iz korena (deploy
  // naloži samo supabase/functions/), zato kopija mora obstajati. Če se
  // razideta, koledar zaposlenim kaže druge ure kot aplikacija.
  it("supabase/functions/_shared/ je bajt-za-bajt enak", () => {
    const a = readFileSync(join(koren, "src", "shared", "delovni-cas.js"));
    const b = readFileSync(join(koren, "supabase", "functions", "_shared", "delovni-cas.js"));
    expect(b.equals(a)).toBe(true);
  });

  it("brskalniški delovni-cas.js pozna iste izmene z istimi urami", () => {
    // Korenska različica je namenoma brez import/export (naloži se kot
    // navaden sinhron <script>), zato se primerja funkcijsko, ne bajtovno.
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(koren, "delovni-cas.js"), "utf8"), sandbox);
    const DC = sandbox.window.DelovniCas;

    for (const sifra of Object.keys(IZMENE)) {
      expect(DC.podatkiIzmene(sifra), `izmena ${sifra}`).toEqual(podatkiIzmene(sifra));
    }
    expect(DC.PRIVZETA_PRAVILA.minPocitekUr).toBe(PRIVZETA_PRAVILA.minPocitekUr);
  });
});
