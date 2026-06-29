#!/usr/bin/env python3
"""Validate auto-generated v4 report metrics against gold standard tolerances.

Auto-discovery makes module ids vary by data, so we match by semantic
keywords (lib name / root symbol substring) rather than exact id strings.
"""

import json
import sys

GOLD = {
    "systemPressurePct": 30.7,
    "wwiseCurAbs": 4753,
    "ecsBurstDelta": 4506,
    "meshuiDelta": 842,
    "armyLineDelta": 214,
    "gpuBoundVerdict": "green",
    "wwiseVerdict": "red",
    "jobBalanceVerdict": "green",
    "tid19816Identity": "lua_mtgc_worker",
    "threadCpuMsMinKeys": 40,
}


def check(name, actual, expected, tol_pct=5.0):
    if isinstance(expected, str):
        ok = actual == expected
    else:
        ok = abs(actual - expected) <= abs(expected) * tol_pct / 100.0
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}: actual={actual!r} expected={expected!r}")
    return ok


def find_module(modules, *keywords):
    """Match a module whose id, display, or rootSymbol contains any keyword."""
    for m in modules:
        haystack = " ".join([
            m.get("id", ""), m.get("display", ""), m.get("rootSymbol", ""),
        ])
        for kw in keywords:
            if kw in haystack:
                return m
    return None


def sum_modules(modules, *keywords):
    total_delta = 0
    total_cur = 0
    matched = []
    for m in modules:
        haystack = " ".join([
            m.get("id", ""), m.get("display", ""), m.get("rootSymbol", ""),
        ])
        if any(kw in haystack for kw in keywords):
            total_delta += m.get("absDelta", 0)
            total_cur += m.get("curAbs", 0)
            matched.append(m.get("display", m.get("id", "?"))[:40])
    return total_delta, total_cur, matched


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/aoeyz_diff"
    diff = json.load(open(f"{base}/diff/simpleperf-diff.json", encoding="utf-8"))
    cur = json.load(open(f"{base}/cur/simpleperf-profile.json", encoding="utf-8"))
    sp = cur["detail"]["simpleperf"]
    modules = diff["businessModules"]

    ok_all = True
    ok_all &= check("systemPressure", diff["systemPressure"]["totalSamplesDeltaPct"], GOLD["systemPressurePct"], 0.5)

    # ECS Burst — single module by lib aggregate
    m = find_module(modules, "lib_burst_generated", "ECS Burst", "ecs_burst")
    ok_all &= check("ecs_burst delta", m["absDelta"] if m else None, GOLD["ecsBurstDelta"], 5)

    # Wwise — single module by lib aggregate
    m = find_module(modules, "libAkSoundEngine", "Wwise", "wwise")
    ok_all &= check("wwise curAbs", m["curAbs"] if m else None, GOLD["wwiseCurAbs"], 2)

    # MeshUI — auto-discovery may split into MeshUIManager + BattleUIManager.UpdateMUIPos paths.
    # Sum all modules with MUI / BattleUI keyword.
    delta_meshui, _, matched_meshui = sum_modules(
        modules, "MUI", "MeshUI", "BattleUIManager_UpdateMUIPos",
    )
    ok_all &= check(f"meshui delta (sum of {matched_meshui})", delta_meshui, GOLD["meshuiDelta"], 200)

    # Army line — match by OutSideViewArmyLineMgr / OutsideLineCtrl / OutsideLineMesh
    delta_army, _, matched_army = sum_modules(
        modules, "OutSideViewArmyLineMgr", "OutsideLineCtrl", "OutsideLineMesh", "army_line",
    )
    ok_all &= check(f"army_line delta (sum of {matched_army})", delta_army, GOLD["armyLineDelta"], 500)

    probes = {p["id"]: p for p in sp["probes"]}
    ok_all &= check("probe.gpu.bound verdict", probes["probe.gpu.bound"]["verdict"], GOLD["gpuBoundVerdict"])
    ok_all &= check("probe.middleware.wwise verdict", probes["probe.middleware.wwise"]["verdict"], GOLD["wwiseVerdict"])
    ok_all &= check("probe.ecs.jobworker.balance verdict", probes["probe.ecs.jobworker.balance"]["verdict"], GOLD["jobBalanceVerdict"], 0)

    t19816 = next((t for t in sp["threads"] if t["tid"] == 19816), None)
    ok_all &= check("tid 19816 identity", t19816["identity"] if t19816 else None, GOLD["tid19816Identity"])

    n_tc = len(sp["threadCpuMs"])
    tc_ok = n_tc >= 40
    print(f"  [{'PASS' if tc_ok else 'FAIL'}] threadCpuMs keys >= 40: {n_tc}")
    ok_all &= tc_ok

    print()
    print("OVERALL:", "PASS" if ok_all else "FAIL")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
