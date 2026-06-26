#!/usr/bin/env python3
"""Build AI-readable digest from simpleperf diff pipeline output.

Reads:
  <out>/diff/simpleperf-diff.json
  <out>/cur/simpleperf-profile.json
  <out>/base/simpleperf-profile.json (optional meta)

Writes:
  <out>/simpleperf-diff-summary.json  (~30-80KB, for CodeBuddy skill Step 2)
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, os.path.join(ROOT, "simpleperf"))

from simpleperf_analyzer.top_n_engine import compute_top_n


def _prune_tree(node, max_depth=8, depth=0):
    if not node or depth > max_depth:
        return None
    out = {
        "name": node.get("name"),
        "absSamples": node.get("absSamples"),
        "mainThreadPct": node.get("mainThreadPct"),
        "selfPctGlobal": node.get("selfPctGlobal"),
        "markers": node.get("markers", []),
        "isWrapper": node.get("isWrapper", False),
        "phaseLabel": node.get("phaseLabel"),
        "absDelta": node.get("absDelta"),
    }
    kids = []
    for c in node.get("children", [])[:12]:
        ch = _prune_tree(c, max_depth, depth + 1)
        if ch:
            kids.append(ch)
    if kids:
        out["children"] = kids
    return out


def build_summary(out_dir):
    diff_path = os.path.join(out_dir, "diff", "simpleperf-diff.json")
    cur_path = os.path.join(out_dir, "cur", "simpleperf-profile.json")
    base_path = os.path.join(out_dir, "base", "simpleperf-profile.json")

    diff = json.load(open(diff_path, encoding="utf-8"))
    cur_prof = json.load(open(cur_path, encoding="utf-8"))
    base_prof = json.load(open(base_path, encoding="utf-8")) if os.path.isfile(base_path) else {}

    cur_sp = cur_prof.get("detail", {}).get("simpleperf", {})
    base_sp = base_prof.get("detail", {}).get("simpleperf", {})

    top_n = compute_top_n(diff.get("businessModules", []), diff.get("probes", []))

    # prune heavy fields
    libs = sorted(diff.get("libs", []), key=lambda x: -abs(x.get("absDelta", 0)))[:15]
    threads = sorted(diff.get("threads", []), key=lambda x: -abs(x.get("absDelta", 0)))[:20]
    pl_stages = diff.get("playerLoopStages", [])
    modules = []
    for m in diff.get("businessModules", []):
        modules.append({
            "id": m.get("id"),
            "display": m.get("display"),
            "baseAbs": m.get("baseAbs"),
            "curAbs": m.get("curAbs"),
            "absDelta": m.get("absDelta"),
            "absDeltaPct": m.get("absDeltaPct"),
            "children": (m.get("children") or [])[:10],
        })
    modules.sort(key=lambda x: -abs(x.get("absDelta", 0)))

    tracing = []
    for cu in diff.get("callUpTracing", []):
        if cu.get("curTotalGlobalPct", 0) < 0.05 and cu.get("baseTotalGlobalPct", 0) < 0.05:
            continue
        tracing.append({
            "runtime": cu.get("runtime"),
            "curTotalGlobalPct": cu.get("curTotalGlobalPct"),
            "absDelta": cu.get("absDelta"),
            "topCallers": (cu.get("topCallers") or [])[:8],
        })

    main_tree = cur_sp.get("mainThreadTree")
    pruned_tree = None
    if main_tree and main_tree.get("root"):
        pruned_tree = {
            "thread": main_tree.get("thread"),
            "absSamples": main_tree.get("absSamples"),
            "globalPct": main_tree.get("globalPct"),
            "root": _prune_tree(main_tree["root"], max_depth=8),
        }

    provider_report = os.path.join(out_dir, "report", "performance-report_simpleperf_v4.md")
    red_probes = [p for p in diff.get("probes", []) if p.get("verdict") == "red"]
    yellow_probes = [p for p in diff.get("probes", []) if p.get("verdict") == "yellow"]
    summary = {
        "source": "simpleperf_diff",
        "schemaVersion": 2,
        "providerReportPath": provider_report if os.path.isfile(provider_report) else None,
        "meta": {
            **(cur_prof.get("meta") or {}),
            "baseTotalSamples": diff.get("base", {}).get("totalSamples"),
            "curTotalSamples": diff.get("cur", {}).get("totalSamples"),
            "durationSec": diff.get("cur", {}).get("durationSec", 20),
            "systemPressureDeltaPct": diff.get("systemPressure", {}).get("totalSamplesDeltaPct"),
        },
        "symbolCheck": {
            "base": base_sp.get("symbolCheck"),
            "cur": cur_sp.get("symbolCheck"),
        },
        "layerBreakdown": {
            "base": base_sp.get("layerBreakdown"),
            "cur": cur_sp.get("layerBreakdown"),
        },
        "diff": {
            "libs": libs,
            "threads": threads,
            "playerLoopStages": pl_stages,
            "businessModules": modules,
            "callUpTracing": tracing,
            "probes": diff.get("probes", []),
            "redProbes": red_probes,
            "yellowProbes": yellow_probes,
        },
        "topN": top_n,
        "mainThreadTree": pruned_tree,
        "threadsIdentified": cur_sp.get("threads", [])[:25],
        "_meta": {
            "note": "混合模式：先读 providerReportPath 骨架；AI 仅润色 §0 / §4.3-4.6 业务含义，禁止改表格数字。",
            "goldReference": "docs/report/performance-report_simpleperf_ULTIMATE_v4.md",
            "knowledge": "docs/aoe-cpu-analysis-knowledge.md",
        },
    }

    out_path = os.path.join(out_dir, "simpleperf-diff-summary.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    return out_path, len(json.dumps(summary, ensure_ascii=False))


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/aoeyz_diff"
    out_dir = os.path.abspath(out_dir)
    path, nbytes = build_summary(out_dir)
    print(json.dumps({"summaryPath": path, "bytes": nbytes}, ensure_ascii=False))


if __name__ == "__main__":
    main()
