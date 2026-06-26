#!/usr/bin/env python3
"""Deterministic v4 narrative enrich (hybrid AI slot): Provider data + gold-style formatting."""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, os.path.join(ROOT, "simpleperf"))

from simpleperf_analyzer.top_n_engine import compute_top_n
from simpleperf_analyzer.v4_report_renderer import render_v4_report


def _load_meta(out_dir: str, diff: dict) -> dict:
    summary_path = os.path.join(out_dir, "simpleperf-diff-summary.json")
    meta = {
        "device": "MateXs2 (PAL-AL00, aarch64)",
        "sceneBase": "野外空场景",
        "sceneCur": "stressmove 行军线压测（约 300 队）",
        "durationSec": diff.get("cur", {}).get("durationSec", 20),
        "subjectiveFps": "~45 fps",
    }
    if os.path.isfile(summary_path):
        try:
            summary = json.load(open(summary_path, encoding="utf-8"))
            m = summary.get("meta") or {}
            if m.get("device"):
                meta["device"] = m["device"]
        except OSError:
            pass
    return meta


def main():
    out_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/aoeyz_diff")
    diff = json.load(open(os.path.join(out_dir, "diff", "simpleperf-diff.json"), encoding="utf-8"))
    base_sp = json.load(open(os.path.join(out_dir, "base", "simpleperf-profile.json"), encoding="utf-8"))[
        "detail"]["simpleperf"]
    cur_sp = json.load(open(os.path.join(out_dir, "cur", "simpleperf-profile.json"), encoding="utf-8"))[
        "detail"]["simpleperf"]
    meta = _load_meta(out_dir, diff)
    top_n = compute_top_n(diff["businessModules"], diff["probes"])
    md = render_v4_report(diff, top_n, base_sp, cur_sp, meta=meta, enriched=True)
    report_dir = os.path.join(out_dir, "report")
    os.makedirs(report_dir, exist_ok=True)
    ai_path = os.path.join(report_dir, "performance-report_simpleperf_AI_v4.md")
    with open(ai_path, "w", encoding="utf-8") as f:
        f.write(md)
    web = os.path.join(out_dir, "performance-report.md")
    with open(web, "w", encoding="utf-8") as f:
        f.write(md)
    print(json.dumps({
        "enrichedPath": ai_path,
        "bytes": len(md),
        "lines": md.count("\n") + 1,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
