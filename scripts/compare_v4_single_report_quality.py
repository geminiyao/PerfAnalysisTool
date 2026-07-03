#!/usr/bin/env python3
"""Quality gate for simpleperf single v4 hybrid reports."""

import sys
from pathlib import Path

REQUIRED = [
    "## §0 一句话总览",
    "## §1 采集元信息",
    "## §2 So 分层负载分布",
    "## §3 线程占机 CPU 分布",
    "## §4 主线程 Native 调用树",
    "## §5 Top-N 热点函数",
    "## §6 本源能力边界",
    "libil2cpp",
    "UnityMain",
]


def main():
    report = Path(sys.argv[1] if len(sys.argv) > 1 else "")
    min_ratio = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75
    baseline = Path(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None
    if not report.is_file():
        print(f"FAIL: missing report {report}")
        sys.exit(1)
    text = report.read_text(encoding="utf-8")
    lines = text.count("\n") + 1
    errors = []
    for needle in REQUIRED:
        if needle not in text:
            errors.append(f"missing: {needle}")
    llm_left = text.count("LLM_FILL")
    if llm_left:
        errors.append(f"LLM_FILL left={llm_left}")
    ref = baseline if baseline and baseline.is_file() else (
        Path(__file__).resolve().parents[1] / "output" / "samples" / "simpleperf-single" / "performance-report.web-stressmove.md"
    )
    if ref.is_file():
        ref_lines = ref.read_text(encoding="utf-8").count("\n") + 1
        ratio = lines / ref_lines
        if ratio < min_ratio:
            label = "baseline" if baseline and baseline.is_file() else "gold"
            errors.append(f"thickness {ratio:.2f}x < {min_ratio} (vs {label})")
    if errors:
        print("FAIL:", "; ".join(errors), f"({lines} lines)")
        sys.exit(1)
    print(f"PASS ({lines} lines)")
    sys.exit(0)


if __name__ == "__main__":
    main()
