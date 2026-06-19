#!/usr/bin/env python3
"""build_perfetto_profile.py - perfetto 纵向切片"出数据"CLI。

读 .pftrace (+ 同目录 meta.json 若有), 经 PerfettoProvider 产出统一 PerfProfile, 写:
  - <out>/perfetto-profile.json          全量 PerfProfile (raw/core/detail, 入库用)
  - <out>/perfetto-profile-summary.json  AI 消费的精简摘要 (剪枝 slice 树)

与 unity/simpleperf build 对称: Provider 只解析出数据落盘, 不碰 DB;
web 侧 ingest-run.ts 读 perfetto-profile.json 入库 (两侧仅通过磁盘 JSON 契约耦合)。

用法:
  python build_perfetto_profile.py --trace <x.pftrace> --out <out_dir> [--meta <meta.json>] \\
    [--profile-name CombinedProfile] [--slice-min-pct 0.5] [--slice-max-depth 12] \\
    [--summary-min-pct 1.0] [--summary-max-depth 8]
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import perfetto_provider


def main():
    ap = argparse.ArgumentParser(description="Build a perfetto PerfProfile from .pftrace")
    ap.add_argument("--trace", required=True, help=".pftrace path")
    ap.add_argument("--out", required=True, help="输出目录")
    ap.add_argument("--meta", default=None, help="meta.json (默认取 trace 同目录的 meta.json)")
    ap.add_argument("--profile-name", default="CombinedProfile", help="atrace 色块名前缀")
    ap.add_argument("--slice-min-pct", type=float, default=0.5,
                    help="callTrees 剪枝: 节点 totalPct 低于此值(相对全 trace)则丢弃 (默认 0.5)")
    ap.add_argument("--slice-max-depth", type=int, default=12, help="callTrees 最大深度 (默认 12)")
    ap.add_argument("--summary-min-pct", type=float, default=1.0,
                    help="summary 剪枝: totalPct 阈值 (默认 1.0)")
    ap.add_argument("--summary-max-depth", type=int, default=8, help="summary 最大深度 (默认 8)")
    args = ap.parse_args()

    trace = os.path.abspath(args.trace)
    if not os.path.isfile(trace):
        print("[ERROR] trace not found: %s" % trace, file=sys.stderr)
        sys.exit(1)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    meta = {}
    meta_path = args.meta or os.path.join(os.path.dirname(trace), "meta.json")
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            print("[INFO] loaded meta.json: scene=%s device=%s" % (meta.get("scene"), meta.get("device")), file=sys.stderr)
        except Exception as e:
            print("[WARN] meta.json read failed: %s" % e, file=sys.stderr)

    print("[INFO] parsing %s ..." % trace, file=sys.stderr)
    result = perfetto_provider.build_profile_dict(
        trace, meta=meta, profile_name=args.profile_name,
        slice_tree_min_pct=args.slice_min_pct,
        slice_tree_max_depth=args.slice_max_depth,
        summary_min_pct=args.summary_min_pct,
        summary_max_depth=args.summary_max_depth,
    )

    profile_path = os.path.join(out_dir, "perfetto-profile.json")
    summary_path = os.path.join(out_dir, "perfetto-profile-summary.json")
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(result["profile"], f, ensure_ascii=False, indent=2)
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(result["summary"], f, ensure_ascii=False, indent=2)

    p = result["profile"]
    d = p["detail"]["perfetto"]
    print("[OK] wrote %s (%d metrics, parseStatus=%s)" % (profile_path, len(p["core"]["metrics"]), d["parseStatus"]), file=sys.stderr)
    print("[OK] wrote %s (%.0f KB)" % (summary_path, os.path.getsize(summary_path) / 1024), file=sys.stderr)
    mr = next((m["value"] for m in p["core"]["metrics"] if m["key"] == "thread.UnityMain.runningPct"), None)
    print("[OK] UnityMain runningPct=%s  throttling=%s  frame[choreographer]=%s"
          % (mr, d["throttling"]["level"], p["core"]["frame"]), file=sys.stderr)
    print(json.dumps({
        "profilePath": profile_path, "summaryPath": summary_path,
        "metricCount": len(p["core"]["metrics"]), "parseStatus": d["parseStatus"],
        "throttling": d["throttling"]["level"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
