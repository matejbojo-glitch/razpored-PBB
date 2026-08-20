/* Razpored PBB – oseba-vrstica.js
 * Skupna vrstica seznama zaposlenih, uporabljena povsod, kjer se našteva
 * ljudi (Imenik, Admin → Uporabniki). Namesto da bi vsaka stran po svoje
 * risala ime + značko + oddelke, je vzorec en sam:
 *
 *   strnjeno   →  ● Priimek Ime                            ›
 *   klik na ostalo vrstico  →  razpre osnovne podatke (vloga, oddelki, …)
 *   klik na ime in priimek  →  odpre celoten zapis zaposlenega
 *
 * Zakaj sta to dva LOČENA gumba in ne en sam z ustavljenim dogodkom:
 * gnezden <button> v <button> ni veljaven HTML (brskalnik ga razdre, s tem
 * pa se izgubi tudi tipkovnična dostopnost). Zato je glava vrstice tri
 * gumbe v vrsti – pika, ime, preostanek s puščico – pri čemer ime pokriva
 * natanko svoje besedilo, preostali (raztegljivi) gumb pa vse ostalo.
 *
 * Brez JSX (navaden React.createElement), da se datoteka naloži kot <script>
 * pred babel skriptami posamezne strani – enako kot export-buttons.js.
 */
(function (root) {
  "use strict";
  var e = root.React.createElement;
  var useState = root.React.useState;

  var STYLE_ID = "razpored-oseba-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".ovVrstica{ border-bottom:1px solid var(--line); }" +
      ".ovVrstica:last-child{ border-bottom:0; }" +
      ".ovGlava{ display:flex; align-items:center; gap:10px; width:100%; }" +
      // Vsi trije deli glave so gumbi: enak videz, brez privzetega okvirja.
      ".ovGlava > button{ background:none; border:0; padding:0; margin:0; font-family:inherit; color:inherit;" +
      " cursor:pointer; min-height:46px; display:flex; align-items:center; }" +
      ".ovPika{ flex:0 0 auto; }" +
      ".ovDot{ width:10px; height:10px; border-radius:50%; background:var(--off); display:block; }" +
      // Barve statusa prisotnosti – iste kode, kot jih vrne
      // statusPrisotnosti() v imenik.html, in ista legenda na vrhu strani.
      ".ovDot.delo{ background: var(--ok); }" +
      ".ovDot.dopust{ background: var(--ld); }" +
      ".ovDot.bolniska{ background: var(--pop); }" +
      ".ovDot.prosto{ background: var(--off); }" +
      ".ovDot.dezurstvo{ background: var(--danger); }" +
      ".ovIme{ flex:0 1 auto; min-width:0; font-weight:700; font-size:14.5px; text-align:left;" +
      " overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }" +
      ".ovIme:hover{ color:var(--accent-2); }" +
      // Raztegljiv "preostanek" vrstice – to je tisto "okolje", ki razpre
      // osnovne podatke. flex:1 poskrbi, da pokrije vso prazno širino tudi
      // pri kratkih imenih.
      ".ovOstalo{ flex:1 1 auto; justify-content:flex-end; color:var(--muted); font-size:14px; }" +
      ".ovChev{ display:inline-block; transition:transform .15s ease; }" +
      ".ovVrstica.odprto .ovChev{ transform:rotate(90deg); }" +
      ".ovPodrobno{ padding:0 0 12px 22px; font-size:12.5px; color:var(--muted);" +
      " display:flex; flex-direction:column; gap:6px; }" +
      ".ovPodrobno .ovMeta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; }" +
      "@media (min-width: 900px){ .ovIme{ font-size:15px; } }";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* props:
   *   ime          – prikazano ime (klik nanj odpre celoten zapis)
   *   naProfil     – funkcija za klik na ime; če je ni, ime ni klikljivo
   *   pikaRazred    – dodaten razred barvne pike (status prisotnosti)
   *   pikaNaziv     – title pike
   *   znacka        – neobvezen React element desno od imena tudi strnjeno
   *                   (npr. "še ni registriran"); privzeto nič
   *   otroci        – vsebina, ki se pokaže ob razprtju (osnovni podatki)
   */
  function OsebaVrstica(props) {
    ensureStyle();
    var odprtoState = useState(false);
    var odprto = props.odprto === undefined ? odprtoState[0] : props.odprto;
    var setOdprto = odprtoState[1];
    function preklopi() {
      if (props.naPreklop) props.naPreklop(!odprto);
      else setOdprto(!odprto);
    }
    var pika = e("span", {
      className: "ovDot" + (props.pikaRazred ? " " + props.pikaRazred : ""),
      title: props.pikaNaziv || undefined,
    });
    return e(
      "div",
      { className: "ovVrstica" + (odprto ? " odprto" : "") },
      e(
        "div",
        { className: "ovGlava" },
        e("button", {
          className: "ovPika",
          onClick: preklopi,
          "aria-expanded": odprto,
          "aria-label": (odprto ? "Skrij" : "Pokaži") + " osnovne podatke",
        }, pika),
        e("button", {
          className: "ovIme",
          onClick: props.naProfil || preklopi,
          title: props.naProfil ? "Odpri celoten zapis" : undefined,
        }, props.ime),
        props.znacka || null,
        e("button", {
          className: "ovOstalo",
          onClick: preklopi,
          "aria-expanded": odprto,
          "aria-label": (odprto ? "Skrij" : "Pokaži") + " osnovne podatke",
          tabIndex: -1,
        }, e("span", { className: "ovChev" }, "›"))
      ),
      odprto ? e("div", { className: "ovPodrobno" }, props.otroci) : null
    );
  }

  root.RazporedOsebaVrstica = OsebaVrstica;
})(window);
