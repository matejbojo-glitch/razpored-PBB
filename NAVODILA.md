# Razpored PBB — vizualna prenova

## Kaj se je spremenilo

**Barve so ostale popolnoma enake** (bolnišnična identiteta) — spremenjeni so
tipografija, sence, presledki, gumbi, zavihki in tabele, da je videz na vseh
9 straneh dosleden in bolj profesionalen. Nobena funkcionalnost, podatki ali
povezava s Supabase se niso spremenili.

- **Nov `theme.css`** — en sam, skupen oblikovni sistem za vso aplikacijo
  (prej je vsaka stran podvajala svoje barve/sloge, zdaj so na enem mestu).
- **Tipografija** — naslovi ("Razpored", "Generator razporeda" ipd.) zdaj
  uporabljajo topel serifni pisave (Fraunces) za bolj urejen, "oblikovan"
  vtis; besedilo/tabele ostanejo v istem, hitro berljivem sistemskem fontu.
- **Kartice, gumbi, zavihki, značke (pill)** — mehkejše sence, jasnejša
  stanja ob kliku/dotiku (hover/active), dosledna velikost dotika (44px).
- **Tabele** (razpored, dežurstva, pravičnost) — jasnejša glava, boljši
  kontrast, vrstica se osvetli ob dotiku.
- **`sw.js`** — dvignjena verzija predpomnilnika (v10), da se sprememba takoj
  pozna vsem, tudi brez signala (offline).

## Katere datoteke so spremenjene

Vseh **11 datotek** v tej mapi gre v koren repozitorija (zamenjajo obstoječe
z istim imenom): `theme.css` (nova), `sw.js`, `index.html`, `admin.html`,
`imenik.html`, `zelje.html`, `menjave.html`, `dashboard.html`,
`nastavitve.html`, `login.html`, `reset-geslo.html`.

Ostalih datotek (podatki, knjižnice, ikone, `manifest.json`,
`supabase-client.js`, `generator-core.js` …) se sploh ni dotaknilo.

## Kako objaviti (enako kot doslej, glej DEPLOY.md)

1. V brskalniku (ne v GitHub aplikaciji) pojdi na
   `github.com/matejbojo-glitch/razpored-PBB`.
2. **Add file → Upload files**, povleci teh 11 datotek — GitHub jih bo
   samodejno prepoznal kot spremembe obstoječih datotek.
3. Spodaj **Commit changes**.
4. Netlify v ~30 sekundah samodejno objavi novo različico na
   `razpored.netlify.app`.

## Kaj nisem spreminjal (namenoma)

Nekatere strani imajo zelo specifične, "ročno" izdelane elemente (npr. orodje
za "risanje" želja s peresom v `zelje.html`, admin tabele za kalup/dežurstva).
Te sem pustil pri miru, da ne tvegam pokvariti delujoče funkcionalnosti —
zdaj samodejno podedujejo nove barve sence/tipografije/gumbov, ostala
postavitev pa je nespremenjena. Če želiš, grem lahko v naslednjem koraku še
posebej poglobljeno skozi katero od teh strani.
