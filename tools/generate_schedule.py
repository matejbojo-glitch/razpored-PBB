# -*- coding: utf-8 -*-
"""
Generator mesečnega urnika za oddelke A, B, C, C1, D, E1, E2
na podlagi schedule_data.json, z OR-Tools CP-SAT.

POMEMBNO — predpostavke, ki jih je treba potrditi (glej NAVODILA_IN_VPRASANJA.md):
  1. DMS (vodje) delajo FIKSNO dopoldne ob delavnikih (pon-pet), ob vikendih/praznikih
     NE delajo (to sledi obstoječi logiki dežurstva, ki je bila dogovorjena že prej).
  2. Vikend/praznik: namesto DOPOLDNE/POPOLDNE/PONOČI velja DNEVNA12 + NOČNA12.
     Ker schedule_data.json ne navaja izrecnih vikend zasedb, sem privzel:
       DNEVNA12 potreba = POPOLDNE potreba tega oddelka (delovnik SMS del)
       NOČNA12  potreba = PONOČI potreba tega oddelka
     PROSIM POTRDI ali popravi te številke (glej vprašanja na koncu poročila).
  3. Oddelek A / PONOČI ("shared_from": ["B","E1"]) ni modeliran kot dodatna
     zadolžitev (ker si sam označil "odvisno od meseca, določi se naknadno") —
     v izpisu je samo opomba, da nočno stražo za A tisto noč "pokriva" B/E1.
  4. C1 "special_rule": "1 SMS + Gazibara Aldin" — ker so VSI C1 SMS že moški,
     omejitev "mora biti moški" je avtomatično izpolnjena; pravilo o Gazibari
     Aldinu NI posebej vsiljeno (nejasno, ali mora biti VEDNO na izmeni, ali je
     samo ena od možnih kombinacij) — glej vprašanja.
  5. Zaposleni z "role": "Admin" ali oddelki izven {A,B,C,C1,D,E1,E2} (DB,
     B1/SOB/NOB, UA/SA, UA/SA/B2, SOBO, ADMIN) NISO del tega urnika — to so
     vodje, ki jih pokriva ločen sistem dežurstva (dogovorjeno v prejšnjih
     korakih), ne ta oddelčni SMS/DMS urnik.
"""
import json
import sys
import datetime
import calendar
import collections
from ortools.sat.python import cp_model
import pandas as pd

# ------------------------------------------------------------------
# 0. NASTAVITVE
# ------------------------------------------------------------------
MESEC = 10
LETO = 2026
DATA_FILE = "schedule_data.json"
OUTPUT_FILE = "urnik_rezultat.xlsx"
SOLVER_TIME_LIMIT_SEC = 60

SCHEDULED_DEPTS = ["A", "B", "C", "C1", "D", "E1", "E2"]
WEEKDAY_SHIFTS = ["DOPOLDNE", "POPOLDNE", "PONOČI"]
WEEKEND_SHIFTS = ["DNEVNA12", "NOČNA12"]
NIGHT_SHIFTS = {"PONOČI", "NOČNA12"}

# Misotič Rebeka (MIS) in Sofrić Nikolina (SOF) sta bili poleti 2026 vkljuceni v
# FLEXI kot zacasna pokritost izostankov ("poletni flexi") - od oktobra 2026
# naprej postaneta redni del FLEXI bazena (dogovorjeno z uporabnikom).
FLEXI_FROM = {"MIS": (2026, 10), "SOF": (2026, 10)}

# Oddelek A nima lastne nocne/vikend ekipe: nocno (PONOČI) in cel vikend
# (DNEVNA12 + NOČNA12) zanj "mimogrede" pokriva karkoli je tisti mesec na
# vrsti med oddelkoma B in E1 (izmenicno po mesecih, zacetek: avgust 2026 = B).
A_COVERAGE_START = (2026, 8, "B")   # (leto, mesec, oddelek) prvega meseca rotacije
A_COVERAGE_ALTERNATE = {"B": "E1", "E1": "B"}

def a_coverage_department(mesec, leto):
    """Kateri oddelek (B ali E1) ta mesec 'mimogrede' pokriva nocno/vikend za A."""
    start_leto, start_mesec, start_dept = A_COVERAGE_START
    months_diff = (leto - start_leto) * 12 + (mesec - start_mesec)
    dept = start_dept
    for _ in range(abs(months_diff)):
        dept = A_COVERAGE_ALTERNATE[dept]
    return dept

# Slovenski dela prosti prazniki (enako kot v predlogah za Excel) —
# vikend/praznik uporablja DNEVNA12/NOČNA12 namesto obicajnih 3 izmen.
_EASTER_MONDAY = {2026: (4, 6), 2027: (3, 29), 2028: (4, 17), 2029: (4, 2), 2030: (4, 22)}
def prazniki_za_leto(leto):
    em = _EASTER_MONDAY.get(leto)
    days = [(1,1),(1,2),(2,8),(4,27),(5,1),(5,2),(6,25),(8,15),(10,31),(11,1),(12,25),(12,26)]
    out = {datetime.date(leto, m, d) for (m, d) in days}
    if em:
        out.add(datetime.date(leto, em[0], em[1]))
    return out

# ------------------------------------------------------------------
# 1. NALAGANJE PODATKOV
# ------------------------------------------------------------------
def load_data(path=DATA_FILE):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def build_calendar(mesec, leto):
    n_days = calendar.monthrange(leto, mesec)[1]
    prazniki = prazniki_za_leto(leto)
    days = []
    for d in range(1, n_days + 1):
        dt = datetime.date(leto, mesec, d)
        is_weekend = dt.weekday() >= 5  # 5=sobota,6=nedelja
        is_holiday = dt in prazniki
        days.append({"day": d, "date": dt, "is_off_type": is_weekend or is_holiday})
    return days

# ------------------------------------------------------------------
# 2. KATEGORIZACIJA ZAPOSLENIH
# ------------------------------------------------------------------
def categorize(data, mesec=None, leto=None):
    emps = {e["code"]: e for e in data["employees"]}
    rel = [e for e in data["employees"] if e["department"] in SCHEDULED_DEPTS]

    # izloci odsotne (npr. porodniska)
    active = [e for e in rel if e.get("status") != "maternity_leave"]

    dms_fixed = [e for e in active if e["role"] == "DMS" and e.get("schedule_type") == "fixed_morning"]
    vrevc = next(e for e in active if e["code"] == "Vrevc M.")  # posebna, fiksna SMS za A

    def flexi_eligible(e):
        if not e.get("is_flexi"):
            return False
        limit = FLEXI_FROM.get(e["code"])
        if limit is None or mesec is None or leto is None:
            return True
        return (leto, mesec) >= limit

    flexi_pool = [e for e in active if flexi_eligible(e)]
    turnus_sms = [e for e in active if e["role"] == "SMS" and not e.get("is_flexi")
                  and e["code"] != "Vrevc M."]

    return dict(all_active=active, dms_fixed=dms_fixed, vrevc=vrevc,
                flexi_pool=flexi_pool, turnus_sms=turnus_sms, by_code=emps)


def dept_of(e):
    return e["department"]

# ------------------------------------------------------------------
# 3. NORMALIZACIJA ZAHTEV PO ODDELKIH (iz department_requirements)
# ------------------------------------------------------------------
def normalize_requirements(data):
    """Vrne: req[dept][shift] = {'sms': n, 'sms_m': n, 'sms_f': n, 'flexi': n,
    'dms': bool, 'fixed_sms': code|None, 'mode': 'generic'|'gendered'}."""
    raw = data["department_requirements"]
    req = {}
    for dept, shifts in raw.items():
        req[dept] = {}
        for shift in WEEKDAY_SHIFTS:
            spec = shifts.get(shift, {})
            gendered = ("SMS_male" in spec) or ("SMS_female" in spec)
            req[dept][shift] = dict(
                sms=spec.get("SMS", 0),
                sms_m=spec.get("SMS_male", 0),
                sms_f=spec.get("SMS_female", 0),
                flexi=spec.get("FLEXI", 0),
                dms=bool(spec.get("DMS", 0)),
                fixed_sms=spec.get("fixed_sms"),
                shared_from=spec.get("shared_from"),
                mode="gendered" if gendered else "generic",
            )
        pop = req[dept]["POPOLDNE"]; noc = req[dept]["PONOČI"]; dop = req[dept]["DOPOLDNE"]
        if dept in ("C", "E2"):
            # Uporabnik: "DNEVNA je samo 1 oseba dodatna na C/E2 oddelku" -> vikend
            # dnevna izmena na C in E2 je pokrita z EN samo (flexi) osebo, brez
            # locenega rednega turnus-SMS mesta.
            req[dept]["DNEVNA12"] = dict(sms=0, sms_m=0, sms_f=0, flexi=1,
                                          dms=False, fixed_sms=None, shared_from=None, mode="generic")
        else:
            req[dept]["DNEVNA12"] = dict(
                sms=max(pop["sms"], dop["sms"]), sms_m=max(pop["sms_m"], dop["sms_m"]),
                sms_f=max(pop["sms_f"], dop["sms_f"]), flexi=max(pop["flexi"], dop["flexi"]),
                dms=False, fixed_sms=pop.get("fixed_sms") or dop.get("fixed_sms"), shared_from=None,
                mode=pop["mode"])
        req[dept]["NOČNA12"] = dict(
            sms=noc["sms"], sms_m=noc["sms_m"], sms_f=noc["sms_f"], flexi=noc.get("flexi", 0),
            dms=False, fixed_sms=None, shared_from=noc.get("shared_from"), mode=noc["mode"])
    return req


# ------------------------------------------------------------------
# 4. CP-SAT MODEL
# ------------------------------------------------------------------
def shifts_for_day(is_off_type):
    return WEEKEND_SHIFTS if is_off_type else WEEKDAY_SHIFTS

def build_and_solve(data, mesec, leto, time_limit=SOLVER_TIME_LIMIT_SEC, verbose=True):
    cal = build_calendar(mesec, leto)
    cats = categorize(data, mesec, leto)
    req = normalize_requirements(data)
    turnus_sms = cats["turnus_sms"]
    flexi_pool = cats["flexi_pool"]
    vrevc = cats["vrevc"]

    model = cp_model.CpModel()
    work = {}  # (code, day, shift) -> BoolVar

    def add_var(e, day, shift):
        key = (e["code"], day, shift)
        if key not in work:
            work[key] = model.NewBoolVar(f"w_{e['code']}_{day}_{shift}")
        return work[key]

    # -- spremenljivke: turnus SMS (lahko delajo vse izmene svojega oddelka,
    #    vkljucno z nocno) --
    for e in turnus_sms:
        for dinfo in cal:
            for shift in shifts_for_day(dinfo["is_off_type"]):
                add_var(e, dinfo["day"], shift)

    # -- spremenljivke: FLEXI bazen (samo dopoldne/popoldne oz. DNEVNA12 na
    #    vikendu/prazniku - nocnih izmen v osnovnem urniku NE dobijo, ker so
    #    po opisu namenjene izpadom, ne rednemu nocnemu turnusu) --
    DAY_SHIFTS_ONLY = {"DOPOLDNE": True, "POPOLDNE": True, "PONOČI": False,
                       "DNEVNA12": True, "NOČNA12": False}
    for e in flexi_pool:
        for dinfo in cal:
            for shift in shifts_for_day(dinfo["is_off_type"]):
                if DAY_SHIFTS_ONLY[shift]:
                    add_var(e, dinfo["day"], shift)

    # -- spremenljivka: Vrevc Maja (oddelek A, max 6h/dan => kvecjemu 1 izmena/dan,
    #    samo dopoldne/popoldne oz. DNEVNA12) --
    for dinfo in cal:
        for shift in shifts_for_day(dinfo["is_off_type"]):
            if DAY_SHIFTS_ONLY[shift]:
                add_var(vrevc, dinfo["day"], shift)

    # ---------------- TRDO PRAVILO 1: max 1 izmena / dan / oseba ----------------
    by_emp_day = collections.defaultdict(list)
    for (code, day, shift), var in work.items():
        by_emp_day[(code, day)].append(var)
    worked_any = {}
    for (code, day), vars_ in by_emp_day.items():
        model.Add(sum(vars_) <= 1)
        wv = model.NewBoolVar(f"any_{code}_{day}")
        model.AddMaxEquality(wv, vars_)
        worked_any[(code, day)] = wv

    # ---------------- TRDO PRAVILO 2: 24h počitek po nočni izmeni ----------------
    night_shift_by_day_type = {}  # day -> ime nocne izmene tisti dan
    for dinfo in cal:
        night_shift_by_day_type[dinfo["day"]] = "NOČNA12" if dinfo["is_off_type"] else "PONOČI"
    max_day = cal[-1]["day"]
    for (code, day, shift), var in list(work.items()):
        if shift in NIGHT_SHIFTS and day < max_day:
            nxt = worked_any.get((code, day + 1))
            if nxt is not None:
                model.Add(var + nxt <= 1)

    # ---------------- TRDO PRAVILO 3: pokritost po oddelkih ----------------
    dept_pool = collections.defaultdict(list)   # dept -> [employee dict]
    for e in turnus_sms:
        dept_pool[e["department"]].append(e)
    flexi_by_dept = collections.defaultdict(list)
    for e in flexi_pool:
        flexi_by_dept[e["department"]].append(e)

    coverage_notes = []
    for dinfo in cal:
        day = dinfo["day"]
        shifts_today = shifts_for_day(dinfo["is_off_type"])
        for dept in SCHEDULED_DEPTS:
            for shift in shifts_today:
                r = req[dept][shift]
                pool = dept_pool.get(dept, [])
                # posebna obravnava oddelka A: samo Vrevc (fixed_sms), ni "obicajnega" bazena
                if dept == "A":
                    if shift in ("DOPOLDNE", "POPOLDNE", "DNEVNA12"):
                        v = work.get((vrevc["code"], day, shift))
                        # potreba je vedno <=1 (r['sms'] najvec 1) - ni dodatne enakosti,
                        # ker Vrevc lahko manjka (ni nadomestne SMS za A privzeto)
                    continue  # PONOČI/NOČNA12 za A: shared_from B/E1, glej opombo spodaj
                vars_generic = [work[(e["code"], day, shift)] for e in pool
                                 if (e["code"], day, shift) in work]
                if r["mode"] == "gendered":
                    vars_m = [v for e, v in zip(pool, vars_generic) if e.get("gender") == "M"]
                    vars_f = [v for e, v in zip(pool, vars_generic) if e.get("gender") == "F"]
                    if r["sms_m"] > 0:
                        model.Add(sum(vars_m) == r["sms_m"])
                    if r["sms_f"] > 0:
                        model.Add(sum(vars_f) == r["sms_f"])
                else:
                    if r["sms"] > 0:
                        model.Add(sum(vars_generic) == r["sms"])
                if r["flexi"] > 0:
                    fpool = flexi_by_dept.get(dept, [])
                    fvars = [work[(e["code"], day, shift)] for e in fpool
                              if (e["code"], day, shift) in work]
                    model.Add(sum(fvars) == r["flexi"])

    return model, work, cal, cats, req, dept_pool, flexi_by_dept, vrevc


def add_soft_objective(model, work, cal, cats, dept_pool):
    """MEHKA PRAVILA: (a) Smolej Nataša max. 1 vikend nočna/mesec (mocno penalizirano,
    ne trdo, kot je uporabnik oznacil pod 'soft constraints'); (b) pravicna porazdelitev
    nocnih in vikend izmen znotraj vsakega oddelka (minimiziramo najvecje odstopanje)."""
    penalty_terms = []

    # (a) Smolej
    smolej_code = "Smolej N."
    weekend_nights_smolej = [work[(smolej_code, d["day"], "NOČNA12")]
                              for d in cal if d["is_off_type"]
                              and (smolej_code, d["day"], "NOČNA12") in work]
    if weekend_nights_smolej:
        total_wn = model.NewIntVar(0, len(weekend_nights_smolej), "smolej_wn_total")
        model.Add(total_wn == sum(weekend_nights_smolej))
        excess = model.NewIntVar(0, len(weekend_nights_smolej), "smolej_wn_excess")
        model.Add(excess >= total_wn - 1)
        penalty_terms.append(excess * 1000)  # mocna utez - skoraj trdo pravilo

    # (b) pravicna porazdelitev po oddelkih (nocne + vikend izmene)
    max_day = cal[-1]["day"]
    for dept, pool in dept_pool.items():
        night_counts, weekend_counts = [], []
        for e in pool:
            code = e["code"]
            n_vars = [work[(code, d, s)] for d in range(1, max_day + 1)
                      for s in ("PONOČI", "NOČNA12") if (code, d, s) in work]
            w_vars = [work[(code, d["day"], s)] for d in cal if d["is_off_type"]
                      for s in shifts_for_day(True) if (code, d["day"], s) in work]
            if n_vars:
                nc = model.NewIntVar(0, len(n_vars), f"night_cnt_{code}")
                model.Add(nc == sum(n_vars))
                night_counts.append(nc)
            if w_vars:
                wc = model.NewIntVar(0, len(w_vars), f"wknd_cnt_{code}")
                model.Add(wc == sum(w_vars))
                weekend_counts.append(wc)
        if night_counts:
            mx = model.NewIntVar(0, max_day, f"max_night_{dept}")
            model.AddMaxEquality(mx, night_counts)
            penalty_terms.append(mx * 5)
        if weekend_counts:
            mxw = model.NewIntVar(0, max_day, f"max_wknd_{dept}")
            model.AddMaxEquality(mxw, weekend_counts)
            penalty_terms.append(mxw * 5)

    model.Minimize(sum(penalty_terms))


if __name__ == "__main__":
    data = load_data()
    model, work, cal, cats, req, dept_pool, flexi_by_dept, vrevc = build_and_solve(data, MESEC, LETO)
    print("St. spremenljivk:", len(work))
    add_soft_objective(model, work, cal, cats, dept_pool)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = SOLVER_TIME_LIMIT_SEC
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    print("Status:", solver.StatusName(status))
    print("Cas resevanja:", solver.WallTime(), "s")
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("Vrednost cilja (penalty):", solver.ObjectiveValue())


# ------------------------------------------------------------------
# 5. IZGRADNJA REZULTATA (DataFrame na oddelek) + izvoz v Excel
# ------------------------------------------------------------------
SHIFT_LABEL = {  # oznake, konsistentne z obstojecimi razporedi (glej prejsnje datoteke)
    "DOPOLDNE": "Dopoldan", "POPOLDNE": "Popoldan", "PONOČI": "Nočna",
    "DNEVNA12": "Dnevna 12", "NOČNA12": "Nočna 12",
}

def extract_schedule(solver, work, cal, cats, dept_pool, flexi_by_dept, vrevc, data, mesec, leto):
    """Vrne dict: dept -> pandas.DataFrame (vrstice=dnevi, stolpci=osebe)."""
    by_code = cats["by_code"]
    dms_fixed = {e["department"]: e for e in cats["dms_fixed"]}
    a_cover_dept = a_coverage_department(mesec, leto)

    result = {}
    for dept in SCHEDULED_DEPTS:
        cols = []
        col_codes = []
        if dept == "A":
            pool = [by_code["TOM"], vrevc]
        else:
            dms = dms_fixed.get(dept)
            pool = ([dms] if dms else []) + dept_pool.get(dept, []) + flexi_by_dept.get(dept, [])
        for e in pool:
            col_codes.append(e["code"])
            cols.append(e.get("name", e["code"]))

        rows = []
        idx = []
        for dinfo in cal:
            day, is_off = dinfo["day"], dinfo["is_off_type"]
            idx.append(dinfo["date"].strftime("%d.%m.%Y"))
            row = {}
            for e, col in zip(pool, cols):
                code = e["code"]
                if e.get("schedule_type") == "fixed_morning":
                    row[col] = "Dopoldan" if not is_off else ""  # DMS ne dela vikendov (predpostavka)
                    continue
                val = ""
                for shift in shifts_for_day(is_off):
                    key = (code, day, shift)
                    if key in work and solver.Value(work[key]) == 1:
                        val = SHIFT_LABEL[shift]
                        if dept == a_cover_dept and shift in ("PONOČI", "DNEVNA12", "NOČNA12"):
                            val += " (+A)"
                        break
                row[col] = val
            rows.append(row)
        df = pd.DataFrame(rows, index=idx, columns=cols)
        df.index.name = "Datum"
        result[dept] = df
    return result


def export_to_excel(schedules, path=OUTPUT_FILE):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for dept, df in schedules.items():
            df.to_excel(writer, sheet_name=dept)
    print("Zapisano:", path)


# ------------------------------------------------------------------
# 6. MODUL NADOMESCANJA OB ODSOTNOSTI
# ------------------------------------------------------------------
SUBSTITUTE_MAP = {
    "TOM": "VEL", "LUN": "ARN", "ARN": "LUN", "PER": "MAG", "MAG": "LEL",
    "LEL": "MAG", "ALU": "BOJ", "BOJ": "ALU", "DŽA": "ALU", "HRO": "TOR",
    "TOR": "HRO", "TRA": "ŠUB", "ŠUB": "TRA", "VEL": "DŽA",
}

def handle_absence(schedules, data, absent_employee_code, date_str, shift):
    """Ob odsotnosti VODJE (DMS s fiksnim substitute v JSON) v schedules[dept]
    zamenja njeno/njegovo celico za dani datum z nadomestnim vodjo. Za SMS/turnus
    osebje (brez fiksnega 'substitute' polja) samo označi celico kot 'ODSOTEN -
    ROČNO NADOMESTI', ker JSON za njih nima definiranega samodejnega nadomestila.

    Vrne seznam (dept, sporocilo) sprememb, ki jih je funkcija naredila."""
    by_code = {e["code"]: e for e in data["employees"]}
    absent = by_code.get(absent_employee_code)
    if absent is None:
        return [("-", f"Koda '{absent_employee_code}' ni najdena med zaposlenimi.")]

    changes = []
    sub_code = SUBSTITUTE_MAP.get(absent_employee_code) or absent.get("substitute")
    dept = absent["department"] if absent["department"] in schedules else None

    if sub_code and sub_code in by_code and dept:
        sub = by_code[sub_code]
        df = schedules[dept]
        col_absent = absent.get("name", absent_employee_code)
        col_sub = sub.get("name", sub_code)
        if date_str in df.index and col_absent in df.columns:
            df.loc[date_str, col_absent] = "LD/BS - nadomešča:"
            if col_sub in df.columns:
                df.loc[date_str, col_sub] = SHIFT_LABEL.get(shift, shift)
            changes.append((dept, f"{col_absent} odsoten {date_str} ({shift}) -> nadomešča {col_sub}"))
        else:
            changes.append((dept, f"Datum {date_str} ali oseba {col_absent} ni v urniku oddelka {dept}."))
    else:
        for d, df in schedules.items():
            col = absent.get("name", absent_employee_code)
            if col in df.columns and date_str in df.index:
                df.loc[date_str, col] = "ODSOTEN - ROČNO NADOMESTI"
                changes.append((d, f"{col} označen odsoten {date_str} — brez definiranega "
                                    f"samodejnega nadomestila v JSON, prosim ročno izberi zamenjavo "
                                    f"(npr. iz FLEXI bazena, ce je oddelek C ali E2)."))
    return changes


if __name__ == "__main__":
    print(f"Oddelek A - ta mesec ({MESEC}.{LETO}) nočno/vikend pokriva:",
          a_coverage_department(MESEC, LETO))
    print("FLEXI bazen ta mesec:", [e["code"] for e in cats["flexi_pool"]])
    schedules = extract_schedule(solver, work, cal, cats, dept_pool, flexi_by_dept, vrevc, data, MESEC, LETO)
    for dept, df in schedules.items():
        print(dept, df.shape)
    export_to_excel(schedules)

    demo = handle_absence(schedules, data, "ARN", cal[4]["date"].strftime("%d.%m.%Y"), "DOPOLDNE")
    for d, msg in demo:
        print("[handle_absence]", d, "-", msg)
