# Objava na spletu — z GitHub + Netlify, s telefona

Vidim, da delaš v uradni GitHub aplikaciji. Ta je odlična za pregledovanje
in odobravanje sprememb, ni pa dobra za nalaganje datotek — tega tam
praktično ni mogoče narediti priročno. Nalaganje naredimo v **brskalniku**
(Chrome/Safari na telefonu), na isti strani github.com.

Struktura aplikacije je zdaj **poenostavljena** — vseh 18 datotek je v eni
sami mapi, brez podmap (`icons/` in `vendor/` sem odstranil). To pomeni, da
lahko na telefonu vse datoteke izbereš naenkrat, v enem koraku.

---

## 1. korak — razpakiraj datoteke na telefonu

1. Prenesi `razpored-app.zip`, ki sem ti ga poslal.
2. Odpri aplikacijo **Datoteke** (Android: "Moje datoteke" ali "Files by
   Google"; iPhone: "Files").
3. Poišči `razpored-app.zip` v mapi Prenosi/Downloads.
4. Tapni nanj → **Razpakiraj** / **Extract** (na iPhonu: tapni in izberi
   "Uncompress"). Nastane mapa `razpored-app` z 18 datotekami.

## 2. korak — v brskalniku (ne v aplikaciji!) odpri repozitorij

1. Odpri **Chrome** ali **Safari** (ne GitHub aplikacije).
2. Pojdi na `github.com/matejbojo-glitch/razpored-PBB` (repozitorij, ki si
   ga že ustvaril).
3. Če te preusmeri na mobilno različico strani, poišči možnost **"Zahtevaj
   namizno stran"** / **"Desktop site"** v meniju brskalnika (tri pike
   zgoraj desno) — z namizno različico strani je nalaganje zanesljivejše.

## 3. korak — naloži vseh 18 datotek naenkrat

1. Na strani repozitorija poišči gumb **"Add file"** → **"Upload files"**.
   (Če ga ne vidiš, pomeni, da je repozitorij že inicializiran z README —
   v tem primeru je gumb "Add file" zgoraj desno nad seznamom datotek.)
2. Tapni na polje za nalaganje ("choose your files" ali podobno).
3. V oknu za izbiro datotek pojdi v razpakirano mapo `razpored-app` in
   **izberi vseh 18 datotek naenkrat** (na Androidu: pridrži prvo, nato
   tapni ostale; na iPhonu: "Select" zgoraj desno, nato tapni vse).
4. Potrdi izbiro — datoteke se začnejo nalagati (pri `babel.min.js`, ki je
   največja, ~2,7 MB, lahko traja malo dlje na mobilnem podatkovnem
   omrežju — priporočam Wi-Fi).
5. Na dnu strani spodaj klikni **"Commit changes"** (zeleni gumb).

Repozitorij zdaj vsebuje vso aplikacijo, brez podmap.

## 4. korak — poveži z Netlify

1. V brskalniku pojdi na **netlify.com** → **Sign up** → "Sign up with
   GitHub" (samodejno se poveže z računom matejbojo-glitch).
2. **"Add new site"** → **"Import an existing project"** → **"Deploy with
   GitHub"**.
3. Potrdi dostop, izberi repozitorij **razpored-PBB**.
4. Polji "Build command" in "Publish directory" pusti **prazna**.
5. **"Deploy site"**.

Po ~30 sekundah dobiš povezavo, npr. `https://nekaj-ime-123.netlify.app`.

## 5. korak — preimenuj povezavo (neobvezno)

**Site configuration** → **Change site name** → npr. `razpored-begunje`
→ nova povezava: `https://razpored-begunje.netlify.app`.

To pošlješ zaposlenim.

---

## Če se nalaganje 18 datotek naenkrat na telefonu izkaže za nerodno

Alternativa: naloži jih v manjših skupinah (npr. najprej vseh 13 datotek
s končnico `.html`, `.json`, `.js`, `.md`, nato posebej še dve sliki
`icon-192.png`/`icon-512.png`) — ponovi 3. korak večkrat, GitHub vsakič
doda k obstoječim, ne prepiše cele mape.

## Posodabljanje odslej naprej

Enako kot prej: v brskalniku (ne v aplikaciji) odpreš datoteko v
repozitoriju, urediš ali naložiš novo različico, Commit changes — Netlify
v ~30 sekundah samodejno objavi.
