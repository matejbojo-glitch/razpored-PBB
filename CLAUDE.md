# Navodila za projekt Razpored PBB

## Tehnološki sklad
- **Frontend:** HTML5, Vanilla JavaScript (ES moduli), CSS (`theme.css`), Service Worker (`sw.js`).
- **Backend & Baza:** Supabase (PostgreSQL), Edge Functions (TypeScript / Deno v `supabase/functions/`), Prisma ORM.
- **Skripte & Orodja:** Node.js ESM skripte (`skripte/*.mjs`), Python OR-Tools (`tools/generate_schedule.py`).

## Pravila za varčevanje s krediti (Output Rules)
- **Samo spremembe (Diffs):** Nikoli ne izpisuj celotnih HTML ali JS datotek. Prikaži le funkcijo, blok kode ali git diff z navedbo točne vrstice ali funkcije.
- **Kratki odgovori:** Izpusti vljudnostne uvode, povzetke in ponavljanja. Takoj preidi na kodo.
- **Modularnost:** Upoštevaj obstoječo strukturo modularnih JS datotek (`nav.js`, `delovni-cas.js`, `izmene.js`, `supabase-client.js`).
