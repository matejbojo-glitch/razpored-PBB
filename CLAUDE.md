# Navodila za projekt Razpored PBB

## Tehnološki sklad
- **Frontend:** HTML5, Vanilla JavaScript (ES moduli), CSS (`theme.css`), Service Worker (`sw.js`).
- **Backend & Baza:** Supabase (PostgreSQL), Edge Functions (TypeScript / Deno v `supabase/functions/`), Prisma ORM.
- **Skripte & Orodja:** Node.js ESM skripte (`skripte/*.mjs`), Python OR-Tools (`tools/generate_schedule.py`).
- Format zapisa oseb: "Priimek Ime".

## Uradni šifrant kratic in izmen
- Na delu (dnevne/nočne/krajše):
  * DF12: Dnevna 12 (7-19) · SO/NE in prazniki 07:00-19:00 (12h)
  * D12: Dnevna 12 · SO/NE in prazniki 05:50-18:00 (12h)
  * N12: Nočna 12 · SO/NE in prazniki 17:50-06:00 (12h)
  * N11: Nočna 11 (od 19) · PON-PET 18:50-06:00 (11h)
  * N10: Nočna · PON-PET 20:50-06:00 (10h)
  * PO5: Popoldne do 19 · PON-PET 13:50-19:00 (5h)
  * PO6: Popoldne do 20 · PON-PET 13:50-20:00 (6h)
  * DO6: Dopoldne 6 ur · omejitev 6 ur/dan (6h)
  * DO4: Dopoldne 4 ure · omejitev 4 ur/dan (4h)
  * PO4: Popoldne 4 ure · omejitev 4 ur/dan (4h)
  * PO7: Popoldne · PON-PET 13:50-21:00 (7h)
  * DO7: Dopoldne (pripravnik) · PON-PET 07:00-14:00 (7h)
  * DOP: Dopoldne · PON-PET 05:50-14:00 · DMS/vodje 07:00-15:00 (8h)
- Dežurstvo:
  * DEŽ: Dežurstvo (NZV) · PON-PET 15:30-07:00 · SO/NE in prazniki 07:00-07:00
- Odsotnosti in dopusti:
  * LD: Letni dopust (8h)
  * POR: Porodniški dopust (8h)
  * STI: Strokovno izobraževanje (8h)
  * BS: Bolniški stalež (8h)
  * KPU: Koriščenje prostih ur
- Prosto: Prazna celica (prost dan)

## Pravila počitka
- Po nočnih izmenah (N12, N11, N10) naslednji dan ni dovoljena dnevna/dopoldanska izmena (DF12, D12, DOP, DO7, DO6, DO4).

## Pravila za varčevanje s krediti (Output Rules)
- **Samo spremembe (Diffs):** Nikoli ne izpisuj celotnih HTML ali JS datotek. Prikaži le funkcijo, blok kode ali git diff z navedbo točne vrstice ali funkcije.
- **Kratki odgovori:** Izpusti vljudnostne uvode, povzetke in ponavljanja. Takoj preidi na kodo.
- **Modularnost:** Upoštevaj obstoječo strukturo modularnih JS datotek (`nav.js`, `delovni-cas.js`, `izmene.js`, `supabase-client.js`).

## Omejitve za Claude Code
- Strogo prepovedano branje arhivov (.zip) in testnih map (skripte/, roster/).
- Urejaj samo datoteke, navedene v promptu.
- Vračaj samo spremenjene funkcije ali ciljne bloke.
