import { defineConfig, transformWithEsbuild } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const koren = dirname(fileURLToPath(import.meta.url));
const stran = (ime) => resolve(koren, ime);

// Strani še vedno nosijo svojo React-kodo v inline <script type="text/babel"
// data-presets="react"> na dnu <body> (glej CLAUDE.md - "diffs, ne cele
// datoteke"; JSX ostane v HTML, da 49 preizkusov v skripte/*.mjs, ki
// funkcije berejo neposredno iz *.html, ne razpade). Prej ga je v brskalniku
// prevedel babel.min.js; zdaj ga ob strežbi/gradnji prevede ta plugin, z
// istim "classic" JSX pragmatom (React.createElement), kot je uporabljal
// Babel standalone.
function jsxVBlokihHtml() {
  const re = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
  return {
    name: "razpored-jsx-v-blokih-html",
    async transformIndexHtml(html) {
      const m = html.match(re);
      if (!m) return html;
      const { code } = await transformWithEsbuild(m[1], "inline-app.jsx", {
        loader: "jsx",
        jsx: "transform",
        jsxFactory: "React.createElement",
        jsxFragment: "React.Fragment",
      });
      // Replacer FUNKCIJA, ne niz: transformirana koda včasih vsebuje
      // dobesedne "$1"/"$&" (npr. iz .replace(/…/, "$1") v app kodi), kar bi
      // String.replace ob nizovnem drugem argumentu narobe razumel kot
      // referenco na ujemajočo skupino in nazaj vstavil surov JSX.
      return html.replace(re, () => `<script>\n${code}\n</script>`);
    },
  };
}

// Klasični <script src="…"> (brez type="module") in stvari, ki jih ne
// referencira noben modul (sw.js, manifest.json, ikone, JSON s podatki),
// Vite pri `vite build` namerno pusti pri miru (opozori "can't be bundled
// without type=module") - v dist/ jih zato ne prekopira sam. Brez tega bi
// bila zgrajena stran videti v redu (HTML gradi), a bi v pravem brskalniku
// manjkale skripte/PWA datoteke. Ta plugin jih ob gradnji dobesedno
// prekopira poleg zgrajenih *.html datotek.
// sw.js predpomni imena datotek na roko, Vite pa skupni slog zgradi z
// zgoščeno vrednostjo v imenu (assets/theme-<hash>.css) - to se ob vsaki
// spremembi sloga spremeni in ga ni mogoče vpisati vnaprej. Zato ga tu
// vstavimo v prekopirano dist/sw.js na mesto oznake. Brez tega je slog edina
// datoteka, ki ob izpadu signala manjka, service worker pa je pred v118
// zaradi nje (404 v atomarnem addAll) sploh odpovedal namestitev.
function vstaviZgrajeneVServiceWorker(izhodniImenik) {
  const swPot = resolve(koren, izhodniImenik, "sw.js");
  if (!existsSync(swPot)) return;
  const imenikSredstev = resolve(koren, izhodniImenik, "assets");
  const sredstva = existsSync(imenikSredstev)
    ? readdirSync(imenikSredstev)
        .filter((f) => f.endsWith(".css"))
        .map((f) => `  './assets/${f}',`)
    : [];
  const vsebina = readFileSync(swPot, "utf8");
  const oznaka = "  /*VSTAVI_ZGRAJENE_DATOTEKE*/";
  if (!vsebina.includes(oznaka)) {
    // Glasno, ne tiho: brez oznake bi popravek iz v118 neopazno izpadel.
    throw new Error("sw.js nima oznake /*VSTAVI_ZGRAJENE_DATOTEKE*/");
  }
  writeFileSync(swPot, vsebina.replace(oznaka, sredstva.join("\n")), "utf8");
}

function prekopirajStaticnoOb() {
  const datoteke = [
    "vendor-app.min.js",
    // Naloži se šele ob prvem izvozu/uvozu preglednice (glej
    // VendorIzvoz.nalozi v export-utils.entry.js), zato ga ne referencira
    // noben <script src> - Vite ga sam ne bi prekopiral.
    "vendor-izvoz.min.js",
    "supabase-client.js", "push-client.js", "nav.js", "imena.js", "izmene.js", "oddelek-a.js", "dopust.js",
    "parafa.js", "prazniki.js", "nzv-zasedba.js", "datum.js", "print-fit.js",
    "import-utils.js", "delovni-cas.js", "export-utils.js", "gsheets-client.js",
    "export-buttons.js", "dashboard-core.js", "generator-core.js",
    "sheets-mreza.js", "oseba-vrstica.js", "razpored-oblike.js",
    "sw.js", "manifest.json", "icon-192.png", "icon-512.png", "logo-pbb.png",
    "dashboard-baseline.json", "data-november-2026.json", "data-oktober-2026.json",
    "pdf.min.mjs", "pdf.worker.min.mjs",
  ];
  let izhodniImenik = "dist";
  return {
    name: "razpored-prekopiraj-staticno",
    apply: "build",
    configResolved(cfg) {
      izhodniImenik = cfg.build.outDir;
    },
    closeBundle() {
      for (const ime of datoteke) {
        const izvor = stran(ime);
        if (!existsSync(izvor)) continue;
        copyFileSync(izvor, resolve(koren, izhodniImenik, ime));
      }
      vstaviZgrajeneVServiceWorker(izhodniImenik);
    },
  };
}

export default defineConfig({
  plugins: [jsxVBlokihHtml(), prekopirajStaticnoOb()],
  build: {
    rollupOptions: {
      input: {
        index: stran("index.html"),
        dashboard: stran("dashboard.html"),
        admin: stran("admin.html"),
        zelje: stran("zelje.html"),
        imenik: stran("imenik.html"),
        login: stran("login.html"),
        nastavitve: stran("nastavitve.html"),
        obrazec: stran("obrazec.html"),
        "reset-geslo": stran("reset-geslo.html"),
        uvoz: stran("uvoz.html"),
      },
    },
  },
});
