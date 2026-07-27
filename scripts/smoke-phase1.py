#!/usr/bin/env python3
"""smoke-phase1.py — 校验 p1-refresh 样例关键字段 (避免 PowerShell 解析大 JSON 失败)"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else "output/p1-refresh")


def load(rel):
    p = os.path.join(BASE, rel)
    if not os.path.isfile(p):
        print(f"[FAIL] missing {p}")
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main():
    ok = True

    u = load("unity/unity-profile.json")
    if u:
        cnt = (u.get("detail", {}).get("unity_profiler", {}).get("frameAnalysis", {}).get("summary", {}).get("count") or 0)
        print(f"[{'OK' if cnt > 0 else 'FAIL'}] unity frameAnalysis.count={cnt}")
        ok &= cnt > 0

    pf = load("perfetto/perfetto-profile.json")
    if pf:
        d = pf.get("detail", {}).get("perfetto", {})
        fa = d.get("frameAnalysis", {})
        tl = len(fa.get("timings") or [])
        aoe = len(d.get("aoeHotSlices") or [])
        sched = d.get("threadSchedView") is not None
        plain = (d.get("offCpuReasons") or {}).get("plainLanguage")
        print(f"[{'OK' if sched else 'FAIL'}] perfetto threadSchedView")
        print(f"[{'OK' if aoe > 0 else 'FAIL'}] perfetto aoeHotSlices count={aoe}")
        print(f"[{'OK' if plain else 'FAIL'}] perfetto offCpu plainLanguage")
        print(f"[{'OK' if tl > 0 else 'FAIL'}] perfetto frameAnalysis timings={tl}")
        ok &= sched and aoe > 0 and plain and tl > 0

    sp = load("simpleperf/simpleperf-profile.json")
    if sp:
        d = sp.get("detail", {}).get("simpleperf", {})
        sc = d.get("symbolCheck", {})
        sw = sc.get("stackUnwind", {})
        trees = len(d.get("callTrees") or [])
        print(f"[{'OK' if sc.get('status') else 'FAIL'}] simpleperf symbolCheck={sc.get('status')}")
        print(f"[{'OK' if sw.get('status') == 'PASS' else 'WARN' if sw else 'FAIL'}] simpleperf stackUnwind status={sw.get('status')}")
        print(f"[{'OK' if trees > 0 else 'FAIL'}] simpleperf callTrees={trees}")
        ok &= trees > 0 and sw.get("status") in ("PASS", "WARN", "SKIP", "FAIL")

    cross = load("cross-profile.json")
    if cross:
        keys = set(cross.get("detail", {}).keys())
        three = {"unity_profiler", "perfetto", "simpleperf"}.issubset(keys)
        print(f"[{'OK' if three else 'FAIL'}] cross three sources keys={sorted(keys)}")
        ok &= three

    if not ok:
        sys.exit(1)
    print("[smoke] all checks passed")


if __name__ == "__main__":
    main()
