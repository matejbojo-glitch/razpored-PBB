# Dodajanje/izbris uporabnikov iz Imenika – namestitev

Doda adminu v **Imeniku** dva gumba:

- **"Dodaj uporabnika (nova prijava)"** – takoj ustvari pravo prijavo (e-pošta +
  začasno geslo), oseba se lahko prijavi nemudoma.
- **"Trajno izbriši uporabnika"** (v profilu osebe, razdelek "Uredi (admin)") –
  popolnoma izbriše prijavo in ves razpored/dopuste/želje te osebe.

Oboje potrebuje `service_role` ključ, ki ga brskalnik ne sme imeti neposredno,
zato gre prek nove robne funkcije (Edge Function) `admin-uporabnik`. Postopek
je enkraten in traja nekaj minut.

---

## 1. Namesti robno funkcijo

```bash
supabase functions deploy admin-uporabnik
```

Brez `--no-verify-jwt` – namenoma: klic mora priti od PRIJAVLJENEGA admina
(supabase-js sam doda njegov žeton), funkcija znotraj še dodatno preveri
`profiles.role = 'admin'` sveže iz baze.

Funkcija ne potrebuje nobenih dodatnih skrivnosti – `SUPABASE_URL`,
`SUPABASE_ANON_KEY` in `SUPABASE_SERVICE_ROLE_KEY` nastavi Supabase sam.

## 2. Preizkus

V aplikaciji: **Imenik → Dodaj uporabnika (nova prijava)** → izpolni ime in
testni e-poštni naslov → "Ustvari prijavo". Prikazati se mora začasno geslo;
z njim in vpisanim e-poštnim naslovom se je mogoče prijaviti v `login.html`
(prijava takoj zahteva spremembo gesla).

Za izbris: odpri to isto (testno) osebo v Imeniku → "Uredi (admin)" →
"Trajno izbriši uporabnika" → prepiši ime za potrditev → izbriši. Oseba mora
izginiti iz seznama in ne sme se več moči prijaviti.

---

## Kako je zavarovano

| Ukrep | Zakaj |
|---|---|
| Funkcija preveri `profiles.role = 'admin'` klicatelja sveže iz baze (ne zaupa telesu zahteve) | Brez tega bi lahko kdorkoli s Supabase žetonom (vsak prijavljen) ustvarjal/brisal račune. |
| Izbris gre prek `auth.admin.deleteUser()` – ena Postgres transakcija | Osebe z zgodovino v menjavah/obrazcih (`swap_requests`/`obrazci`, namerno brez kaskade) izbris zavrne s tujim-ključnim napako namesto delnega izbrisa. Za take osebe je treba pognati `supabase/odstrani-zaposlene.sql` (SQL Editor), ki povezave najprej pravilno počisti/prenese. |
| Admin ne more izbrisati samega sebe | Prepreči nehoteno zaklepanje iz lastnega računa. |
| Geslo je prikazano samo enkrat, takoj po ustvarjanju | Enak vzorec kot `skripte/uvoz-racunov.mjs --test`; `must_change_password` prisili spremembo ob prvi prijavi. |
