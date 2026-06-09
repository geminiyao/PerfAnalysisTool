#!/usr/bin/env python
"""compare.py - Run Level 1 + 2 + 3 comparison between two perf.data files.

Usage:
    python scripts/compare.py BASELINE.data CURRENT.data \
        --binary-cache /path/to/binary_cache \
        --out result/compare \
        [--anchors ExecutePlayerLoop GfxDeviceWorker::RunCommand] \
        [--aggregate-by-thread-name]

Outputs <out>.json and <out>.txt.
"""

import argparse
import os
import sys

# Make the package importable whether run from repo root or scripts/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simpleperf_analyzer import (load_profile, so_compare, anchor_compare,
                                 func_compare, reporter, config)


def _summary(l1, l2):
    summary = {}
    # il2cpp improvement: find UnityMain libil2cpp delta
    for t in l1.get("threads", []):
        if "UnityMain" not in t["name"]:
            continue
        for lib in t["libs"]:
            if "libil2cpp" in lib["name"]:
                summary["il2cpp_delta_pct_unitymain"] = lib["delta_pct"]
    for a in l2.get("anchors", []):
        if "ExecutePlayerLoop" in a["name"] and a["delta_pct"] is not None:
            summary["main_thread_delta_pct"] = a["delta_pct"]
        if "GfxDeviceWorker" in a["name"] and a["delta_pct"] is not None:
            summary["render_thread_delta_pct"] = a["delta_pct"]
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("baseline", help="baseline perf.data")
    ap.add_argument("current", help="current perf.data")
    ap.add_argument("--binary-cache", default=None, help="binary_cache dir for symbols")
    ap.add_argument("--out", default="result/compare", help="output path prefix")
    ap.add_argument("--anchors", nargs="+", default=None, help="override anchor funcs")
    ap.add_argument("--min-so-pct", type=float, default=0.5,
                    help="min so proportion to report in Level 1")
    ap.add_argument("--aggregate-by-thread-name", action="store_true",
                    help="merge threads by name (multi-run averaging)")
    ap.add_argument("--levels", default="123", help="which levels to run, e.g. '12'")
    args = ap.parse_args()

    print("Loading baseline:", args.baseline)
    pa = load_profile(args.baseline, binary_cache=args.binary_cache,
                      label=os.path.basename(args.baseline),
                      aggregate_by_thread_name=args.aggregate_by_thread_name)
    print("Loading current :", args.current)
    pb = load_profile(args.current, binary_cache=args.binary_cache,
                      label=os.path.basename(args.current),
                      aggregate_by_thread_name=args.aggregate_by_thread_name)

    event = next((s["eventName"] for s in pa.record_info["sampleInfo"]
                  if s["eventName"] in config.CPU_EVENT_NAMES), "?")
    result = {"meta": {"baseline": args.baseline, "current": args.current,
                       "event": event}}

    l1 = l2 = None
    if "1" in args.levels:
        print("Level 1 - so comparison ...")
        l1 = so_compare.compare(pa, pb, min_pct=args.min_so_pct)
        result["level1_so_compare"] = l1
    if "2" in args.levels:
        print("Level 2 - anchor comparison ...")
        l2 = anchor_compare.compare(pa, pb, anchors=args.anchors)
        result["level2_anchor_compare"] = l2
    if "3" in args.levels:
        print("Level 3 - function diff ...")
        result["level3_func_diff"] = func_compare.compare(pa, pb)

    result["summary"] = _summary(l1 or {}, l2 or {})

    json_path = reporter.write_json(result, args.out + ".json")
    txt_path = reporter.write_text(reporter.format_compare_text(result), args.out + ".txt")
    print("Wrote:", json_path)
    print("Wrote:", txt_path)


if __name__ == "__main__":
    main()
