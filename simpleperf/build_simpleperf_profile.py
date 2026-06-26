"""build_simpleperf_profile.py - simpleperf 纵向切片"出数据"CLI。

读 perf.data (+ binary_cache 符号), 经 SimpleperfProvider 产出统一 PerfProfile, 写:
  - <out>/simpleperf-profile.json          全量 PerfProfile (raw/core/detail, 入库用)
  - <out>/simpleperf-profile-summary.json  AI 消费的精简摘要 (剪枝树)
  - <out>/simpleperf-folded.txt            folded stacks (flamegraph 工具输入)

双采集模式 (--base + --perf):
  - <out>/base/simpleperf-profile.json
  - <out>/cur/simpleperf-profile.json
  - <out>/diff/simpleperf-diff.json
  - <out>/report/performance-report_simpleperf_v4.md

用法:
  python build_simpleperf_profile.py --perf <perf.data> --binary-cache <dir> --out <out_dir>
  python build_simpleperf_profile.py --base <base.data> --perf <cur.data> --binary-cache <dir> --out <out_dir>
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
from simpleperf_analyzer.diff_engine import compute_diff
from simpleperf_analyzer.top_n_engine import compute_top_n
from simpleperf_analyzer.thread_tagger import tag_all_threads
from simpleperf_analyzer.v4_report_renderer import render_v4_report


def _grand_total(profile):
    ec = 0
    for _p, th in profile.iter_threads():
        ec += th["event_count"]
    return ec or 1


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _build_one(profile, raw_path, bcache, out_dir, label, top_func, base_ctx=None):
    result = perf_provider.build_profile_dict(
        profile, raw_path=raw_path, binary_cache=bcache, out_dir=out_dir,
        top_func=top_func, base_ctx=base_ctx,
    )
    profile_path = os.path.join(out_dir, "simpleperf-profile.json")
    summary_path = os.path.join(out_dir, "simpleperf-profile-summary.json")
    _write_json(profile_path, result["profile"])
    _write_json(summary_path, result["summary"])
    return result


def main():
    ap = argparse.ArgumentParser(description="Build a simpleperf PerfProfile from perf.data")
    ap.add_argument("--perf", required=True, help="cur perf.data path")
    ap.add_argument("--base", default=None, help="base perf.data path (optional, enables diff)")
    ap.add_argument("--binary-cache", default=None, help="binary_cache dir (符号还原)")
    ap.add_argument("--out", required=True, help="输出目录")
    ap.add_argument("--label", default=None, help="Run 标签 (默认取文件名)")
    ap.add_argument("--top-func", type=int, default=30, help="入 core 的 self 热点函数 top-N")
    ap.add_argument("--scene-base", default="野外空场景")
    ap.add_argument("--scene-cur", default="stressmove")
    ap.add_argument("--device", default="MateXs2")
    ap.add_argument("--subjective-fps", default=None, help="主观帧率描述，如 ~45 fps")
    args = ap.parse_args()

    perf = os.path.abspath(args.perf)
    if not os.path.isfile(perf):
        print("[ERROR] perf.data not found: %s" % perf, file=sys.stderr)
        sys.exit(1)
    bcache = os.path.abspath(args.binary_cache) if args.binary_cache else None
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    if args.base:
        base_path = os.path.abspath(args.base)
        if not os.path.isfile(base_path):
            print("[ERROR] base perf.data not found: %s" % base_path, file=sys.stderr)
            sys.exit(1)

        t0 = time.time()
        print("[INFO] loading base %s ..." % base_path, file=sys.stderr)
        base_profile = load_profile(base_path, binary_cache=bcache, label="base")
        print("[INFO] base loaded in %.1fs (samples=%d)" % (time.time() - t0, base_profile.total_samples), file=sys.stderr)

        base_out = os.path.join(out_dir, "base")
        base_result = _build_one(base_profile, base_path, bcache, base_out, "base", args.top_func)
        base_ext = base_result["profile"]["detail"]["simpleperf"]
        base_tagged = tag_all_threads(base_profile, _grand_total(base_profile))
        base_ctx = (base_profile, base_tagged, _grand_total(base_profile), base_profile.total_samples)

        t0 = time.time()
        print("[INFO] loading cur %s ..." % perf, file=sys.stderr)
        cur_profile = load_profile(perf, binary_cache=bcache, label=args.label or "cur")
        print("[INFO] cur loaded in %.1fs (samples=%d)" % (time.time() - t0, cur_profile.total_samples), file=sys.stderr)

        cur_out = os.path.join(out_dir, "cur")
        cur_result = _build_one(cur_profile, perf, bcache, cur_out, "cur", args.top_func, base_ctx=base_ctx)
        cur_ext = cur_result["profile"]["detail"]["simpleperf"]

        diff = compute_diff(base_ext, cur_ext, base_label="base", cur_label="cur")
        diff_path = os.path.join(out_dir, "diff", "simpleperf-diff.json")
        _write_json(diff_path, diff)

        top_n = compute_top_n(diff["businessModules"], diff["probes"])
        report_md = render_v4_report(
            diff, top_n, base_ext, cur_ext,
            meta={
                "device": args.device,
                "sceneBase": args.scene_base,
                "sceneCur": args.scene_cur,
                "durationSec": 20,
                "subjectiveFps": args.subjective_fps,
            },
        )
        report_path = os.path.join(out_dir, "report", "performance-report_simpleperf_v4.md")
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_md)
        web_report = os.path.join(out_dir, "performance-report.md")
        with open(web_report, "w", encoding="utf-8") as f:
            f.write(report_md)

        sc = cur_ext["symbolCheck"]
        print("[OK] diff → %s" % diff_path, file=sys.stderr)
        print("[OK] report → %s" % report_path, file=sys.stderr)
        print("[OK] systemPressure=%.1f%% topN=%d probes=%d" % (
            diff["systemPressure"]["totalSamplesDeltaPct"], len(top_n), len(diff["probes"])), file=sys.stderr)
        print(json.dumps({
            "profilePath": os.path.join(cur_out, "simpleperf-profile.json"),
            "diffPath": diff_path,
            "reportPath": report_path,
            "symbolCheck": sc["status"],
            "systemPressureDeltaPct": diff["systemPressure"]["totalSamplesDeltaPct"],
        }, ensure_ascii=False))
        return

    # single capture (legacy)
    label = args.label or os.path.splitext(os.path.basename(perf))[0]
    t0 = time.time()
    print("[INFO] loading %s ..." % perf, file=sys.stderr)
    profile = load_profile(perf, binary_cache=bcache, label=label)
    print("[INFO] loaded in %.1fs (samples=%d)" % (time.time() - t0, profile.total_samples), file=sys.stderr)

    result = _build_one(profile, perf, bcache, out_dir, label, args.top_func)
    profile_path = os.path.join(out_dir, "simpleperf-profile.json")
    sc = result["profile"]["detail"]["simpleperf"]["symbolCheck"]
    lb = result["profile"]["detail"]["simpleperf"]["layerBreakdown"]
    print("[OK] wrote %s" % profile_path, file=sys.stderr)
    print("[OK] symbolCheck=%s" % sc["status"], file=sys.stderr)
    print("[OK] layers business=%(business).1f%% engine=%(engine).1f%%" % lb, file=sys.stderr)
    print(json.dumps({
        "profilePath": profile_path,
        "summaryPath": os.path.join(out_dir, "simpleperf-profile-summary.json"),
        "foldedPath": result["foldedPath"],
        "symbolCheck": sc["status"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
