#!/usr/bin/env python3
"""Check v4 report markdown structure against gold-standard expectations."""

import re
import sys
from pathlib import Path

REQUIRED = [
    (r"^## §0 结论先行", "§0"),
    (r"^## §1 采集元信息与质量门", "§1"),
    (r"^## §2 库", "§2"),
    (r"^## §3 线程维度对比", "§3"),
    (r"#### 线程绝对增量柱状图", "§3 thread chart"),
    (r"^### 3\.3 关键判定", "§3.3"),
    (r"^### 3\.4 对照差分火焰图", "§3.4"),
    (r"^## §4 全局性能热点", "§4"),
    (r"^### 4\.1 Top-N 总表", "§4.1 Top-N table"),
    (r"^### 4\.2 Top-N 解读", "§4.2 interpretation"),
    (r"^### 4\.3 Wwise", "§4.3 Wwise"),
    (r"^### 4\.4 MeshUI", "§4.4 MeshUI"),
    (r"^### 4\.5 行军线", "§4.5 army line"),
    (r"^### 4\.6 ECS Burst", "§4.6 ECS"),
    (r"^## §5 主线程深度分析", "§5"),
    (r"标记图例", "§5.2 tree legend"),
    (r"^### 5\.3 主线程红线扫描", "§5.3 probes"),
    (r"^## §6 渲染相关线程", "§6"),
    (r"^## §7 ECS", "§7"),
    (r"^## §8 中间件 — Wwise", "§8"),
    (r"^## §9 Lua GC", "§9"),
    (r"^## §10 反查清单", "§10"),
    (r"^## §11 本源能力边界", "§11"),
]

FORBIDDEN = [
    (r"^### 4\.1 探针红绿灯", "old §4.1 probe table (should not exist)"),
]


def main():
    if len(sys.argv) < 2:
        report = Path("docs/report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_v4.md")
    else:
        p = Path(sys.argv[1])
        report = p / "report/performance-report_simpleperf_v4.md" if p.is_dir() else p

    text = report.read_text(encoding="utf-8")
    lines = text.splitlines()
    ok_all = True

    print(f"Report: {report} ({len(lines)} lines, {len(text)} bytes)")
    print()

    for pat, name in REQUIRED:
        found = any(re.search(pat, ln) for ln in lines)
        status = "PASS" if found else "FAIL"
        print(f"  [{status}] {name}")
        ok_all &= found

    for pat, name in FORBIDDEN:
        found = any(re.search(pat, ln) for ln in lines)
        if found:
            print(f"  [FAIL] forbidden: {name}")
            ok_all = False

    # depth heuristics
    tree_lines = [ln for ln in lines if ln.startswith("│") or ln.startswith("├") or ln.startswith("└")]
    meshui_sub = len(re.findall(r"MUIControlManager|MUILayout\.Set3DPosition", text))
    print()
    print(f"  [{'PASS' if len(tree_lines) >= 15 else 'FAIL'}] call tree depth lines >= 15: {len(tree_lines)}")
    print(f"  [{'PASS' if meshui_sub >= 2 else 'FAIL'}] MeshUI sub-function mentions >= 2: {meshui_sub}")
    print(f"  [{'PASS' if len(lines) >= 400 else 'FAIL'}] report lines >= 400: {len(lines)}")
    ok_all &= len(tree_lines) >= 15 and meshui_sub >= 2 and len(lines) >= 400

    print()
    print("STRUCTURE:", "PASS" if ok_all else "FAIL")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
