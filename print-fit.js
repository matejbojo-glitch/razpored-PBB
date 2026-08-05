// ---------------------------------------------------------------------
// Skupna pomožna datoteka za tisk/PDF izvoz (window.print) mesečnih
// razporedov na TOČNO 1 A4 stran, ne glede na število zaposlenih ali
// dni v mesecu. Ker aplikacija tiska samo prek brskalnikovega "Natisni"
// (brez jsPDF/html2pdf, brez dodatnih odvisnosti/CDN), moramo velikost
// vsebine sami preračunati in jo pred tiskanjem "skrčiti" — z "zoom", ne
// "transform: scale", ker samo zoom dejansko zmanjša zaseden prostor v
// postavitvi (kar brskalnik potrebuje za pravilno preračunavanje
// prelomov strani; transform vsebino samo vizualno pomanjša, zasedeni
// prostor za tiskanje pa ostane enak, zato bi se še vedno prelilo na
// naslednjo stran).
// ---------------------------------------------------------------------
window.PrintFit = (function () {
  const MM_NA_PX = 96 / 25.4;

  function izracunajLestvico(el, { sirinaMm, visinaMm, robMm }) {
    if (!el) return 1;
    const razpolozljivaSirina = (sirinaMm - 2 * robMm) * MM_NA_PX;
    const razpolozljivaVisina = (visinaMm - 2 * robMm) * MM_NA_PX;
    const sirina = el.scrollWidth, visina = el.scrollHeight;
    if (!sirina || !visina) return 1;
    return Math.min(1, razpolozljivaSirina / sirina, razpolozljivaVisina / visina);
  }

  // el: element, ki ga je treba skrčiti natanko na 1 stran (navadno tisti z
  // razredom "wardScroller"/"gridScroll" — ista stran, ki v @media print
  // dobi "overflow:visible" in "zoom:var(--print-scale)", glej CSS v vsaki
  // strani). orientacija: "landscape" (mesečni razporedi) ali "portrait"
  // (posamezni obrazci/seznami, kjer več strani ni težava).
  function natisni(el, { orientacija = "landscape", robMm } = {}) {
    const rob = robMm != null ? robMm : (orientacija === "landscape" ? 5 : 10);
    let stil = document.getElementById("printFitPage");
    if (!stil) { stil = document.createElement("style"); stil.id = "printFitPage"; document.head.appendChild(stil); }
    stil.textContent = `@page { size: A4 ${orientacija}; margin: ${rob}mm; }`;
    if (el) {
      const sirinaMm = orientacija === "landscape" ? 297 : 210;
      const visinaMm = orientacija === "landscape" ? 210 : 297;
      const lestvica = izracunajLestvico(el, { sirinaMm, visinaMm, robMm: rob });
      el.style.setProperty("--print-scale", lestvica);
    } else {
      document.documentElement.style.setProperty("--print-scale", 1);
    }
    window.print();
  }

  return { natisni };
})();
