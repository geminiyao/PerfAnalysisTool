#!/usr/bin/env python3
"""Compare generated v4 report structure/content against gold standard."""

import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = [
    "## §0 结论先行",
    "## §1 采集元信息与质量门",
    "## §2 库（so）维度对比",
    "## §3 线程维度对比",
    "### 3.1 线程占比",
    "#### 线程绝对增量柱状图",
    "### 3.2 同名 UnityMain",
    "### 3.3 关键判定",
    "### 3.4 对照差分火焰图",
    "## §4 全局性能热点 Top-N",
    "### 4.1 Top-N 总表",
    "### 4.2 Top-N 解读",
    "### 4.3",
    "### 4.4",
    "### 4.5",
    "### 4.6",
    "## §5 主线程深度分析",
    "### 5.1 主线程 PlayerLoop 阶段表",
    "### 5.2 主线程完整调用树",
    "**标记图例**",
    "## §6 渲染相关线程",
    "### 6.1 主线程上的 URP 渲染管线下钻",
    "### 6.2 RHI 线程下钻",
    "### 6.3 GPU bound 判定",
    "Unity Profiler marker 对照",
    "### 7.2 主线程 Job Wait",
    "### 7.3 Top Burst Job",
    "## §7 ECS / Worker 线程",
    "## §8 中间件 — Wwise 专章",
    "## §9 Lua GC 工作线程专章",
    "## §10 反查清单",
    "## §11 本源能力边界",
]

KEY_NUMBERS = [
    ("+30.7%", "systemPressure"),
    ("+4506", "ecs_burst delta"),
    ("4,753", "wwise cur"),
    ("未观察到 CPU 侧 GPU bound", "gpu bound wording"),
    ("tid 19816", "lua mtgc tid"),
    ("MUIControlManager", "meshui detail"),
    ("OutsideLineCtrl", "army line detail"),
    ("Wwise 音频中间件", "wwise section"),
]

FORBIDDEN = [
    "### 4.1 探针红绿灯",
    "### 4.2 Top 热点表",
]

DEFAULT_MIN_LENGTH_RATIO = 0.82


def score_report(text: str) -> dict:
    results = []
    for needle in REQUIRED_SECTIONS:
        ok = needle in text
        results.append((needle, ok))
    for needle, label in KEY_NUMBERS:
        ok = needle in text
        results.append((label, ok))
    for bad in FORBIDDEN:
        if bad in text:
            results.append((f"FORBIDDEN:{bad}", False))
    tree_markers = sum(1 for m in ("📈", "🔴", "🟡", "🟢") if m in text)
    mermaid = text.count("```mermaid")
    lines = text.count("\n") + 1
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    return {
        "lines": lines,
        "mermaid_blocks": mermaid,
        "tree_marker_count": tree_markers,
        "checks": results,
        "passed": passed,
        "total": total,
        "score_pct": round(passed / total * 100, 1) if total else 0,
    }


def evaluate_report(gen_path: Path, gold_path: Path, min_length_ratio: float) -> dict:
    gen = gen_path.read_text(encoding="utf-8")
    gold = gold_path.read_text(encoding="utf-8")
    g = score_report(gen)
    r = score_report(gold)
    ratio = g["lines"] / r["lines"] if r["lines"] else 0
    structure_ok = g["score_pct"] >= 95
    content_ok = (
        g["mermaid_blocks"] >= 2
        and g["tree_marker_count"] >= 4
        and ratio >= min_length_ratio
    )
    return {
        "gen_path": str(gen_path),
        "gold_path": str(gold_path),
        "gen": g,
        "gold": r,
        "length_ratio": ratio,
        "structure_ok": structure_ok,
        "content_ok": content_ok,
        "overall_ok": structure_ok and content_ok,
    }


def main():
    args = sys.argv[1:]
    min_ratio = DEFAULT_MIN_LENGTH_RATIO
    paths = []
    for a in args:
        if a.startswith("--min-length-ratio="):
            min_ratio = float(a.split("=", 1)[1])
        else:
            paths.append(a)
    gen_path = Path(paths[0] if paths else "docs/report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_v4.md")
    gold_path = Path(paths[1] if len(paths) > 1 else "docs/report/performance-report_simpleperf_ULTIMATE_v4.md")
    ev = evaluate_report(gen_path, gold_path, min_ratio)
    g, r = ev["gen"], ev["gold"]
    print(f"Generated: {gen_path} ({g['lines']} lines, mermaid={g['mermaid_blocks']}, markers={g['tree_marker_count']})")
    print(f"Gold:      {gold_path} ({r['lines']} lines, mermaid={r['mermaid_blocks']}, markers={r['tree_marker_count']})")
    print()
    print(f"Structure score: {g['passed']}/{g['total']} ({g['score_pct']}%)")
    for name, ok in g["checks"]:
        if not ok:
            print(f"  [MISS] {name}")
    print()
    print(f"Length ratio vs gold: {ev['length_ratio']:.2f}x ({g['lines']}/{r['lines']} lines, min={min_ratio})")
    print("OVERALL:", "PASS" if ev["overall_ok"] else "NEEDS_WORK")
    sys.exit(0 if ev["overall_ok"] else 1)


if __name__ == "__main__":
    main()
