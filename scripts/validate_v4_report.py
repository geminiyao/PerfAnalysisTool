#!/usr/bin/env python3
"""Validate auto-generated v4 report metrics against gold standard tolerances."""

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


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/aoeyz_diff"
    diff = json.load(open(f"{base}/diff/simpleperf-diff.json", encoding="utf-8"))
    cur = json.load(open(f"{base}/cur/simpleperf-profile.json", encoding="utf-8"))
    sp = cur["detail"]["simpleperf"]

    ok_all = True
    ok_all &= check("systemPressure", diff["systemPressure"]["totalSamplesDeltaPct"], GOLD["systemPressurePct"], 0.5)

    bm = {m["id"]: m for m in diff["businessModules"]}
    ok_all &= check("ecs_burst delta", bm["ecs_burst"]["absDelta"], GOLD["ecsBurstDelta"], 2)
    ok_all &= check("wwise curAbs", bm["wwise"]["curAbs"], GOLD["wwiseCurAbs"], 2)
    ok_all &= check("meshui delta", bm["meshui"]["absDelta"], GOLD["meshuiDelta"], 15)
    ok_all &= check("army_line delta", bm["army_line"]["absDelta"], GOLD["armyLineDelta"], 15)

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
