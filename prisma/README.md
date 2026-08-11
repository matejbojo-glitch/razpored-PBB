# Prisma — samo kot orodje za shemo (Možnost A)

Glej [`PRISMA-NACRT.md`](../PRISMA-NACRT.md) v korenu repozitorija za polno analizo in
utemeljitev. Na kratko: **aplikacija Prisme ne uporablja in je ne bo**. Brskalnik se še
naprej pogovarja naravnost s Supabase, avtorizacijo vsiljuje RLS (42 politik). Ta mapa
obstaja izključno zato, da ima shema en berljiv, verzioniran vir resnice in da je iz nje
mogoče generirati migracijski SQL, namesto ga pisati ročno na pamet.

## Kaj je tukaj

- `schema.prisma` — ročno napisan opis vseh 21 tabel iz `supabase/schema.sql`,
  preverjen proti resnični bazi (glej "Kako je bilo preverjeno" spodaj).
- `package.json` — samo `prisma`/`@prisma/client` kot razvojno orodje, ni del
  spletne aplikacije in se ne pošilja v brskalnik.
- `.env.example` — predloga za povezavo; `.env` je v `.gitignore`.

## Trdo pravilo

```
NIKOLI ne poženite `prisma migrate dev` ali `prisma db push` proti pravi bazi.
```

Oba ukaza primerjata `schema.prisma` z bazo in **odstranita**, česar v shemi ni —
vključno z RLS politikami, prožilci, funkcijami in tabelami z resničnimi podatki
bolnišnice. Prisma tega ne zna razlikovati od namerne spremembe.

Za karkoli, kar dejansko spremeni bazo, ostaja edina pot **ročni SQL v Supabase SQL
Editorju** (`supabase/schema.sql`), enako kot doslej. Prisma se uporablja samo za:

1. branje trenutnega stanja (`npm run db:pull`),
2. generiranje SQL predloga za PREGLED, ne za samodejni zagon (`npm run db:diff`).

## Uporaba

```bash
cd prisma
npm install
cp .env.example .env   # izpolnite DATABASE_URL in DIRECT_URL iz Supabase
npm run validate       # samo preveri, da je shema.prisma sintaktično veljavna
```

### Preveriti, da `schema.prisma` še ustreza pravi bazi

```bash
npm run db:diff
```

Izpiše SQL, ki bi bil potreben, da bi bazo spremenili v to, kar piše v
`schema.prisma`. Prazen izpis (ali samo neškodljive razlike, glej spodaj) pomeni,
da je datoteka točna. Karkoli drugega je znak, da je nekdo spremenil bazo mimo
`supabase/schema.sql`, in `schema.prisma` je treba ročno posodobiti.

### Osvežiti `schema.prisma` iz prave baze

```bash
npm run db:pull
```

To PREPIŠE `schema.prisma` s tem, kar `prisma db pull` prebere iz baze — brez lepih
imen (`@map`), samo surova introspekcija. Po tem je treba ročno prenesti spremembe
nazaj v urejeno različico (preimenovanja, komentarje) — glejte git diff kot vodilo,
kaj se je dejansko spremenilo, in ne commitajte surove introspekcije čez urejeno
shemo.

## Kako je bilo preverjeno

Ta `schema.prisma` ni bil napisan na pamet. Postopek:

1. Lokalno postavljen PostgreSQL 16 + minimalen `auth` shema-stub (samo `auth.users`
   in `auth.uid()/role()/jwt()`, dovolj za tuje ključe in RLS izraze).
2. Vanj pognan cel `supabase/schema.sql` (2600+ vrstic) — enak SQL, ki teče v
   produkciji.
3. `prisma db pull` proti tej bazi je vrnil surovo introspekcijo vseh 21 tabel.
4. `schema.prisma` je bil ročno napisan s človeku berljivimi imeni (`@map`/`@@map`,
   `camelCase`), nato **preverjen s `prisma migrate diff`** proti isti bazi.
5. Rezultat: **prazna razlika** za vseh 20 tabel sheme `public`, razen namerno
   poenostavljenega `AuthUser` (modelira samo `id`, ker je edino, na kar kažejo tuji
   ključi — glej komentar v datoteki). Vsak tuji ključ, vsak privzeti `onDelete`, vsak
   delni/sestavljeni indeks je bil na ta način preverjen proti pravemu vedenju baze,
   ne le proti moji predstavi o njem.

Se pravi: ta datoteka ni "izgleda prav" — je bila poganjana proti resnični kopiji
sheme in razlika je bila enaka nič.

## Česa Prisma tukaj namenoma NE zajema

Glej komentar na vrhu `schema.prisma`. Skratka: RLS politike (42), `security definer`
funkcije (31), prožilci in delni indeksi (`notifications_kljuc_idx`,
`notifications_push_pending_idx`) živijo izključno v `supabase/schema.sql`. Prisma
opisuje obliko podatkov, ne pravil nad njimi.
