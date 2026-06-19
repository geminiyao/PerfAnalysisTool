"""build_simpleperf_profile.py - simpleperf 纵向切片"出数据"CLI。

读 perf.data (+ binary_cache 符号), 经 SimpleperfProvider 产出统一 PerfProfile, 写:
  - <out>/simpleperf-profile.json          全量 PerfProfile (raw/core/detail, 入库用)
  - <out>/simpleperf-profile-summary.json  AI 消费的精简摘要 (剪枝树)
  - <out>/simpleperf-folded.txt            folded stacks (flamegraph 工具输入)

与 unity build-profile.ts 对称: Provider 只解析出数据落盘, 不碰 DB;
web 侧 ingest-run.ts 读 simpleperf-profile.json 入库 (两侧仅通过磁盘 JSON 契约耦合)。

用法:
  python build_simpleperf_profile.py --perf <perf.data> --binary-cache <dir> \
       --out <out_dir> [--label <l>] [--top-func 30]
"""

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from simpleperf_analyzer import load_profile
from simpleperf_analyzer import perf_provider


def main():
    ap = argparse.ArgumentParser(description="Build a simpleperf PerfProfile from perf.data")
    ap.add_argument("--perf", required=True, help="perf.data path")
    ap.add_argument("--binary-cache", default=None, help="binary_cache dir (符号还原)")
    ap.add_argument("--out", required=True, help="输出目录")
    ap.add_argument("--label", default=None, help="Run 标签 (默认取文件名)")
    ap.add_argument("--top-func", type=int, default=30, help="入 core 的 self 热点函数 top-N")
    args = ap.parse_args()

    perf = os.path.abspath(args.perf)
    if not os.path.isfile(perf):
        print("[ERROR] perf.data not found: %s" % perf, file=sys.stderr)
        sys.exit(1)
    bcache = os.path.abspath(args.binary_cache) if args.binary_cache else None
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    label = args.label or os.path.splitext(os.path.basename(perf))[0]

    t0 = time.time()
    print("[INFO] loading %s ..." % perf, file=sys.stderr)
    profile = load_profile(perf, binary_cache=bcache, label=label)
    print("[INFO] loaded in %.1fs (samples=%d)" % (time.time() - t0, profile.total_samples), file=sys.stderr)

    result = perf_provider.build_profile_dict(
        profile, raw_path=perf, binary_cache=bcache, out_dir=out_dir, top_func=args.top_func,
    )

    profile_path = os.path.join(out_dir, "simpleperf-profile.json")
    summary_path = os.path.join(out_dir, "simpleperf-profile-summary.json")
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(result["profile"], f, ensure_ascii=False, indent=2)
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(result["summary"], f, ensure_ascii=False, indent=2)

    metrics = result["profile"]["core"]["metrics"]
    sc = result["profile"]["detail"]["simpleperf"]["symbolCheck"]
    lb = result["profile"]["detail"]["simpleperf"]["layerBreakdown"]
    print("[OK] wrote %s (%d metrics)" % (profile_path, len(metrics)), file=sys.stderr)
    print("[OK] wrote %s (%.0f KB)" % (summary_path, os.path.getsize(summary_path) / 1024), file=sys.stderr)
    print("[OK] symbolCheck=%s appSym=%.1f%% kernel=%.1f%% unknown=%.1f%% anchors=%d/%d"
          % (sc["status"], sc["appSymbolizedPct"], sc["kernelPct"], sc["unknownPct"],
             sc["anchorsResolved"], sc["anchorsTotal"]), file=sys.stderr)
    print("[OK] layers business=%(business).1f%% engine=%(engine).1f%% runtime=%(runtime).1f%% noise=%(noise).1f%%" % lb,
          file=sys.stderr)
    # stdout: 给上层 (skill/pipeline) 消费的摘要
    print(json.dumps({
        "profilePath": profile_path,
        "summaryPath": summary_path,
        "foldedPath": result["foldedPath"],
        "metricCount": len(metrics),
        "symbolCheck": sc["status"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
