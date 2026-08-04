#!/usr/bin/env python3
"""Mesečni generator razporeda za oddelke A/B/C/C1/D/E1/E2 (OR-Tools CP-SAT).

Samostojen skript (ni (še) povezan s spletno aplikacijo/Supabase) — bere
schedule_data.json, reši razporejanje kot problem omejitev (constraint
programming) in izvozi rezultat v Excel.

Uporaba:
    python3 generate_schedule.py --start 2026-10-01 --end 2026-10-31

Zahteva: pip install ortools pandas openpyxl

OPOZORILA O POENOSTAVITVAH (glej tudi izpis ob koncu teka):
  - Oddelek A ima v podatkih SAMO Maja Vrevc kot SMS, a zahteva po 1 SMS
    tako za DOPOLDNE kot POPOLDNE vsak dan — ona lahko pokrije le enega od
    dveh (max 6h/dan, ena izmena). Model zato izbere, katerega od dveh
    pokrije, drugi ostane nezaseden in se izpiše kot opozorilo — v
    podatkih ni druge osebe, dodeljene oddelku A, ki bi lahko pokrila
    drugega. Preveri, ali manjka oseba v schedule_data.json.
  - "PONOČI" za oddelek A je "shared_from": ["B","E1"] — v tem izvozu ni
    modelirano kot ločena obveznost (izpustimo), ker ni jasno po katerem
    pravilu naj CP izbere, KATERA oseba iz B/E1 to noč "tudi" krije A (ali
    gre za fizično isto osebo, ki krije oba oddelka, ali za dodaten
    obisk) — če imaš natančnejše pravilo, povej in dopolnim.
  - C1 "special_rule": "1 SMS + Gazibara Aldin" — implementirano kot trda
    zahteva po 2 moških SMS (vsi C1 SMS v podatkih so tako ali tako moški),
    BREZ posebne prisile, da mora biti Gazibara Aldin vedno eden od njiju
    (nejasno, ali je to mišljeno kot trdo ali mehko pravilo) — Gazibara
    ostane le označen (is_gazibara), pripravljen za dodatno pravilo, če ga
    natančno opišeš.
  - FLEXI kader je privzeto na voljo za DOPOLDNE/POPOLDNE na domačem
    oddelku (C ali E2); "can_cover_night_on_absence" ni uveljavljeno kot
    ločeno pravilo, ker v podatkih ni konkretnih datumov odsotnosti, ki bi
    sprožili izjemo — če posreduješ dejanski koledar odsotnosti, ga lahko
    vključim, da FLEXI dobi nočne izmene samo takrat.
  - Fiksni DMS/Admin koordinatorji (fixed_morning: Alukić, Bojić,
    Džamastagić, Hrovat, Torkar, Mavri Tratnik, Šubic, Velušček, Mušič,
    Trpin, Humar, Bizjak, ter DMS del A/B/C/C1/D/E1/E2) niso del CP
    modela — razporejeni so deterministično (delovni dan = na svojem
    mestu), ker njihov urnik ni kombinatoričen problem. handle_absence()
    spodaj omogoča ročno zamenjavo z nadomestno osebo (substitute) za
    posamezen dan, po pravilu iz JSON-a.
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from ortools.sat.python import cp_model

SHIFTS = ["DOPOLDNE", "POPOLDNE", "PONOČI"]
WARD_DEPARTMENTS = ["A", "B", "C", "C1", "D", "E1", "E2"]
# Kazni v ciljni funkciji (utežene, ne trde meje) — nezasedeno mesto je
# veliko dražje od neenakomerne razporeditve nočnih/vikend izmen.
PENALTY_UNMET_SLOT = 1000
PENALTY_FAIRNESS = 1


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--json", default=str(Path(__file__).parent / "schedule_data.json"))
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD")
    p.add_argument("--output", default="urnik_rezultat.xlsx")
    p.add_argument("--time-limit", type=float, default=30.0, help="Sekunde za CP-SAT solver (privzeto 30)")
    return p.parse_args()


def load_data(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def is_weekend(d):
    return d.weekday() >= 5  # 5=SO, 6=NE


class Scheduler:
    def __init__(self, data, days):
        self.data = data
        self.days = days
        self.employees = {e["code"]: e for e in data["employees"]}
        self.dept_req = data["department_requirements"]
        self.model = cp_model.CpModel()
        self.work = {}  # (code, day, shift) -> BoolVar
        self.slack = {}  # (dept, day, shift, label) -> IntVar (nezasedena mesta)
        self.warnings = []
        self._build_pools()

    # -------------------------------------------------------------
    def _build_pools(self):
        """Razdeli osebje na tiste, ki so del CP modela (izmenski SMS/FLEXI),
        in tiste, ki so razporejeni deterministično (fixed_morning DMS/Admin)."""
        self.shift_pool = defaultdict(list)  # dept -> [code, ...] (SMS "shift")
        self.flexi_pool = defaultdict(list)  # dept -> [code, ...] (FLEXI "morning_afternoon")
        self.fixed_morning = []  # code list, izven CP modela

        for code, e in self.employees.items():
            if e.get("status") == "maternity_leave":
                continue  # ne razporeja se
            stype = e.get("schedule_type")
            dept = e.get("department")
            if stype == "shift" and dept in WARD_DEPARTMENTS:
                self.shift_pool[dept].append(code)
            elif e.get("is_flexi") and stype == "morning_afternoon" and e.get("role") != "DMS":
                # FLEXI SMS kader (Jereb, Kvržić, Vozel N., Gashi, Huseinbašić, Kogoj)
                self.flexi_pool[dept].append(code)
            elif e.get("department") == "A" and stype == "morning_afternoon":
                self.shift_pool["A"].append(code)  # Vrevc M. — posebej obravnavana spodaj
            elif stype == "fixed_morning" or (e.get("is_flexi") and e.get("role") == "DMS"):
                self.fixed_morning.append(code)
            # ostali (npr. Humar S. — "User", morning_afternoon, brez is_flexi) niso del
            # oddelčnega CP modela za A-E2 — zunaj obsega te preglednice.

    # -------------------------------------------------------------
    def _var(self, code, d, shift):
        key = (code, d, shift)
        if key not in self.work:
            self.work[key] = self.model.NewBoolVar(f"w_{code}_{d.isoformat()}_{shift}")
        return self.work[key]

    def _eligible_shifts(self, code):
        e = self.employees[code]
        if e.get("schedule_type") == "morning_afternoon":
            return ["DOPOLDNE", "POPOLDNE"]  # brez nočnih (urne omejitve)
        return SHIFTS

    def build(self):
        all_codes = set()
        for pool in list(self.shift_pool.values()) + list(self.flexi_pool.values()):
            all_codes.update(pool)

        # --- 1) vsak človek kvečjemu ena izmena na dan ------------------
        for code in all_codes:
            for d in self.days:
                vars_today = [self._var(code, d, s) for s in self._eligible_shifts(code)]
                if vars_today:
                    self.model.Add(sum(vars_today) <= 1)

        # --- 2) počitek po nočni: naslednji dan popolnoma prost ---------
        for code in all_codes:
            if "PONOČI" not in self._eligible_shifts(code):
                continue
            for i, d in enumerate(self.days[:-1]):
                nxt = self.days[i + 1]
                next_vars = [self._var(code, nxt, s) for s in self._eligible_shifts(code)]
                if next_vars:
                    self.model.Add(sum(next_vars) <= 1 - self._var(code, d, "PONOČI"))

        # --- 3) oddelčne zahteve (s "slack" za nezasedena mesta) --------
        objective_terms = []
        for dept in WARD_DEPARTMENTS:
            req = self.dept_req.get(dept, {})
            for shift in SHIFTS:
                rule = req.get(shift, {})
                if "shared_from" in rule:
                    continue  # posebno pravilo za A/PONOČI — glej opombe na vrhu datoteke
                for d in self.days:
                    objective_terms += self._apply_requirement(dept, shift, d, rule)

        # --- 4) posebna pravila za oddelek A (Vrevc: D ALI P, ne oboje) -
        # (self-consistentno z 1) — vsak dan kvečjemu ena od dveh, kar je
        # avtomatsko zagotovljeno, ker ima Vrevc samo eno "ime" v poolu A.

        # --- 5) Smolej: največ 1 vikend nočna izmena na mesec -----------
        if "Smolej N." in self.employees:
            vikend_noci = [
                self._var("Smolej N.", d, "PONOČI") for d in self.days if is_weekend(d)
            ]
            if vikend_noci:
                self.model.Add(sum(vikend_noci) <= 1)

        # --- 6) Salkić: 1x dežurstvo/mesec med tednom --------------------
        # (Salkić je fixed_morning DMS, dežurstvo je ločen modul v spletni
        # aplikaciji — glej generator-core.js — tu ni relevantno.)

        # --- 7) pravičnost: minimiziraj razpon nočnih/vikend izmen -------
        for dept in WARD_DEPARTMENTS:
            pool = self.shift_pool.get(dept, [])
            night_pool = [c for c in pool if "PONOČI" in self._eligible_shifts(c)]
            if len(night_pool) < 2:
                continue
            counts = []
            for code in night_pool:
                cnt = sum(self._var(code, d, "PONOČI") for d in self.days)
                cvar = self.model.NewIntVar(0, len(self.days), f"nights_{code}")
                self.model.Add(cvar == cnt)
                counts.append(cvar)
            mx = self.model.NewIntVar(0, len(self.days), f"max_nights_{dept}")
            mn = self.model.NewIntVar(0, len(self.days), f"min_nights_{dept}")
            self.model.AddMaxEquality(mx, counts)
            self.model.AddMinEquality(mn, counts)
            spread = self.model.NewIntVar(0, len(self.days), f"spread_{dept}")
            self.model.Add(spread == mx - mn)
            objective_terms.append(spread * PENALTY_FAIRNESS)

        self.model.Minimize(sum(objective_terms))

    def _apply_requirement(self, dept, shift, d, rule):
        terms = []
        eligible_shift = [c for c in self.shift_pool.get(dept, []) if shift in self._eligible_shifts(c)]
        eligible_flexi = [c for c in self.flexi_pool.get(dept, []) if shift in self._eligible_shifts(c)]

        if dept == "A":
            # Vrevc: natanko 1 od {DOPOLDNE, POPOLDNE} — obravnavano prek
            # slacka, ker realno pogosto ne bo pokrila obeh na isti dan.
            fixed_sms = [c for c in eligible_shift if self.employees[c]["code"] == "Vrevc M."]
            need = 1
            terms += self._require(dept, shift, d, "SMS(A)", fixed_sms, need)
            return terms

        if "SMS_male" in rule or "SMS_female" in rule:
            males = [c for c in eligible_shift if self.employees[c].get("gender") == "M"]
            females = [c for c in eligible_shift if self.employees[c].get("gender") == "F"]
            if "SMS_male" in rule:
                terms += self._require(dept, shift, d, "SMS_M", males, rule["SMS_male"])
            if "SMS_female" in rule:
                terms += self._require(dept, shift, d, "SMS_F", females, rule["SMS_female"])
            return terms

        if "SMS" in rule:
            terms += self._require(dept, shift, d, "SMS", eligible_shift, rule["SMS"])
        if "FLEXI" in rule:
            terms += self._require(dept, shift, d, "FLEXI", eligible_flexi, rule["FLEXI"])
        # "DMS" je fixed_morning — zunaj CP modela (deterministično).
        return terms

    def _require(self, dept, shift, d, label, candidates, need):
        varlist = [self._var(c, d, shift) for c in candidates]
        slack = self.model.NewIntVar(0, need, f"slack_{dept}_{shift}_{label}_{d.isoformat()}")
        if varlist:
            self.model.Add(sum(varlist) + slack == need)
        else:
            self.model.Add(slack == need)
        self.slack[(dept, shift, label, d)] = slack
        return [slack * PENALTY_UNMET_SLOT]

    # -------------------------------------------------------------
    def solve(self, time_limit):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_search_workers = 8
        status = solver.Solve(self.model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise RuntimeError("CP-SAT ni našel nobene rešitve (status=%s)" % solver.StatusName(status))
        self.solver = solver
        self.status = status
        return solver

    # -------------------------------------------------------------
    def extract(self):
        solver = self.solver
        rows = []
        for (code, d, shift), var in self.work.items():
            if solver.Value(var):
                e = self.employees[code]
                rows.append({
                    "datum": d.isoformat(),
                    "dan": d.strftime("%a").upper(),
                    "oddelek": e.get("department"),
                    "izmena": shift,
                    "oseba": e["name"],
                    "koda": code,
                    "vloga": e.get("role"),
                })
        for d in self.days:
            for code in self.fixed_morning:
                e = self.employees[code]
                if d.weekday() >= 5:
                    continue  # fixed_morning so delovniki, glej opombo o vikendih spodaj
                rows.append({
                    "datum": d.isoformat(),
                    "dan": d.strftime("%a").upper(),
                    "oddelek": e.get("department"),
                    "izmena": "DOPOLDNE",
                    "oseba": e["name"],
                    "koda": code,
                    "vloga": e.get("role"),
                })
        df = pd.DataFrame(rows).sort_values(["datum", "oddelek", "izmena"])

        for (dept, shift, label, d), var in self.slack.items():
            val = solver.Value(var)
            if val > 0:
                self.warnings.append(
                    f"{d.isoformat()} {dept} {shift} [{label}]: manjka {val} mesto(a) — ni dovolj razpoložljivega kadra v podatkih."
                )
        return df


def handle_absence(schedule_df, employees, absent_code, absent_date, shift="DOPOLDNE"):
    """Ročna zamenjava fixed_morning osebe z njeno nadomestno osebo (substitute
    iz schedule_data.json) za en dan. Vrne KOPIJO DataFrame-a s spremembo.
    Primer: handle_absence(df, employees, "TOM", date(2026,10,5))
    """
    sub_code = employees.get(absent_code, {}).get("substitute")
    if not sub_code or sub_code not in employees:
        raise ValueError(f"{absent_code} nima veljavnega nadomestnega (substitute) v schedule_data.json")
    mask = (
        (schedule_df["koda"] == absent_code)
        & (schedule_df["datum"] == absent_date.isoformat())
        & (schedule_df["izmena"] == shift)
    )
    out = schedule_df.copy()
    out.loc[mask, ["oseba", "koda"]] = [employees[sub_code]["name"], sub_code]
    return out


INVALID_SHEET_CHARS = str.maketrans({c: "-" for c in r'\/?*[]:'})


def safe_sheet_name(name, used):
    clean = name.translate(INVALID_SHEET_CHARS)[:31] or "list"
    base, i = clean, 1
    while clean in used:
        suffix = f"~{i}"
        clean = base[: 31 - len(suffix)] + suffix
        i += 1
    used.add(clean)
    return clean


def export_excel(df, path, warnings):
    used_names = set()
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=safe_sheet_name("Vsi vnosi", used_names), index=False)
        for dept, sub in df.groupby("oddelek"):
            piv = sub.pivot_table(index=["datum", "dan"], columns="izmena", values="oseba", aggfunc=lambda x: ", ".join(x))
            piv.to_excel(writer, sheet_name=safe_sheet_name(f"Oddelek {dept}", used_names))
        for oseba, sub in df.groupby("oseba"):
            sub[["datum", "dan", "oddelek", "izmena"]].to_excel(writer, sheet_name=safe_sheet_name(oseba, used_names), index=False)
        if warnings:
            pd.DataFrame({"opozorilo": warnings}).to_excel(writer, sheet_name=safe_sheet_name("Opozorila", used_names), index=False)


def main():
    args = parse_args()
    data = load_data(args.json)
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    days = list(daterange(start, end))

    sched = Scheduler(data, days)
    sched.build()
    sched.solve(args.time_limit)
    df = sched.extract()
    export_excel(df, args.output, sched.warnings)

    print(f"Zapisano {len(df)} vnosov v {args.output}")
    if sched.warnings:
        print(f"\n{len(sched.warnings)} opozoril (nezasedena mesta) — glej tudi zavihek 'Opozorila' v Excelu:")
        for w in sched.warnings[:30]:
            print("  -", w)
        if len(sched.warnings) > 30:
            print(f"  … in še {len(sched.warnings) - 30}")
    else:
        print("Brez opozoril — vse zahtevane pozicije so zasedene.")


if __name__ == "__main__":
    sys.exit(main())
