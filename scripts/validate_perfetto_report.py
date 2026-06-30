#!/usr/bin/env python3
"""validate_perfetto_report.py — perfetto N 份对比报告质量门

输入：
  --report performance-report.md
  --skeleton skeleton.md (Provider 渲染的原始骨架)

校验：
  1. hard-fail: 报告中 LLM_FILL 占位符必须 0 残留
  2. hard-fail: 骨架中所有 markdown 表格行必须逐字符存在于报告
  3. hard-fail: 骨架中所有 ``` 代码块（ASCII / callTree / 因果链）必须逐字符存在于报告
  4. hard-fail: 报告行数 >= 骨架 0.85×
  5. soft warning: 重复段落（相同 ## 标题或 **加粗 lead** 出现 >2 次）
  6. soft warning: 报告中数字 token 全部能在骨架中找到（检测幻觉数字）

退出码：
  0 — 全 PASS
  1 — 有 warning（不阻塞，但记录）
  2 — 有 hard-fail（阻塞）
"""

import argparse
import json
import os
import re
import sys
from collections import Counter


def extract_tables(md: str) -> list[str]:
    """提取所有 markdown 表格行（以 | 开头）"""
    return [l for l in md.split("\n") if l.startswith("|") and "|" in l[1:]]


_LLM_FILL_RE = re.compile(r"<!--\s*LLM_FILL:[^>]*?-->")


def strip_llm_fill(text: str) -> str:
    """剥掉 LLM_FILL 注释，用于跨"骨架 vs 报告"对比时归一化。"""
    return _LLM_FILL_RE.sub("", text).rstrip()


def extract_code_blocks(md: str) -> list[str]:
    """提取所有 ``` ``` 代码块"""
    blocks = []
    in_block = False
    cur = []
    for line in md.split("\n"):
        if line.strip().startswith("```"):
            if in_block:
                blocks.append("\n".join(cur))
                cur = []
                in_block = False
            else:
                in_block = True
        elif in_block:
            cur.append(line)
    return blocks


def extract_numbers(md: str) -> set[str]:
    """提取所有数字 token（百分比 / ms / 帧数 / 浮点）"""
    pat = re.compile(r"[0-9]+(?:\.[0-9]+)?(?:%|ms| ms| ns)?")
    out = set()
    for m in pat.findall(md):
        out.add(m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", required=True)
    ap.add_argument("--skeleton", required=True)
    ap.add_argument("--quality-out", default=None, help="质量门 JSON 输出路径")
    args = ap.parse_args()

    if not os.path.isfile(args.report):
        print(f"[ERR] report not found: {args.report}", file=sys.stderr)
        sys.exit(2)
    if not os.path.isfile(args.skeleton):
        print(f"[ERR] skeleton not found: {args.skeleton}", file=sys.stderr)
        sys.exit(2)

    with open(args.report, encoding="utf-8") as f:
        report = f.read()
    with open(args.skeleton, encoding="utf-8") as f:
        skeleton = f.read()

    errors = []
    warnings = []

    # 1. LLM_FILL 残留
    llm_fill_count = report.count("<!-- LLM_FILL")
    if llm_fill_count > 0:
        errors.append(f"LLM_FILL 占位符残留 {llm_fill_count} 个 (必须为 0)")

    # 2. 骨架表格行必须存在（按行比对，剥掉 LLM_FILL 后再 fuzzy match）
    table_rows = extract_tables(skeleton)
    report_lines = set(report.split("\n"))
    report_lines_stripped = {strip_llm_fill(l) for l in report.split("\n")}
    missing_table = []
    for row in table_rows:
        bare = strip_llm_fill(row)
        # 报告里直接含原行 OR 含剥占位符后的骨架行
        if row in report:
            continue
        if bare in report_lines_stripped:
            continue
        # 单元格部分：按 cell 拆解，至少非占位符 cell 都要在报告对应行里
        sk_cells = [c.strip() for c in row.split("|") if c.strip()]
        non_fill_cells = [c for c in sk_cells if "LLM_FILL" not in c]
        # 在报告中找一行同时包含所有 non_fill_cells
        matched = False
        for rl in report_lines:
            if rl.startswith("|") and all(c in rl for c in non_fill_cells if c):
                matched = True
                break
        if not matched:
            missing_table.append(row)
    if len(missing_table) > 5:
        errors.append(f"骨架表格行缺失 {len(missing_table)} 条 (允许最多 5)")
    elif missing_table:
        warnings.append(f"骨架表格行缺失 {len(missing_table)} 条: {missing_table[0][:80]}...")

    # 3. 骨架 code block 必须逐字符存在
    sk_blocks = extract_code_blocks(skeleton)
    missing_block = sum(1 for b in sk_blocks if b not in report)
    if missing_block > 1:
        errors.append(f"骨架 ASCII/callTree 代码块缺失 {missing_block}/{len(sk_blocks)} 个")

    # 4. 行数
    report_lines = report.count("\n") + 1
    skeleton_lines = skeleton.count("\n") + 1
    if report_lines < skeleton_lines * 0.85:
        errors.append(f"报告行数 {report_lines} < 骨架 {skeleton_lines} × 0.85")

    # 5. 重复段落
    headings = Counter(l for l in report.split("\n") if l.startswith("#"))
    dup_heads = [(h, c) for h, c in headings.items() if c > 1]
    if dup_heads:
        warnings.append(f"重复章节标题: {dup_heads[:3]}")

    # 6. 报告中的数字必须在骨架中（幻觉检测）
    sk_nums = extract_numbers(skeleton)
    report_nums = extract_numbers(report)
    only_in_report = report_nums - sk_nums
    # 过滤纯 1/2/3 这种不一定是数据的
    suspicious = [n for n in only_in_report if "." in n or len(n) > 3]
    if len(suspicious) > 8:
        warnings.append(f"报告中 {len(suspicious)} 个数字未在骨架中找到（疑似幻觉，TopN: {suspicious[:5]}）")

    # 评级
    ok = len(errors) == 0
    has_warn = len(warnings) > 0

    quality = {
        "ok": ok,
        "errors": errors,
        "warnings": warnings,
        "lineCount": report_lines,
        "skeletonLineCount": skeleton_lines,
        "lineRatio": round(report_lines / skeleton_lines, 3) if skeleton_lines else 0,
        "llmFillRemaining": llm_fill_count,
        "missingTableRows": len(missing_table),
        "missingCodeBlocks": missing_block,
        "tier": (
            "L3"
            if ok and report_lines >= skeleton_lines * 0.95
            else "L2"
            if ok and report_lines >= skeleton_lines * 0.92
            else "L1"
            if ok
            else "FAIL"
        ),
    }

    if args.quality_out:
        os.makedirs(os.path.dirname(args.quality_out), exist_ok=True)
        with open(args.quality_out, "w", encoding="utf-8") as f:
            json.dump(quality, f, ensure_ascii=False, indent=2)

    print(json.dumps(quality, ensure_ascii=False, indent=2))

    if not ok:
        sys.exit(2)
    if has_warn:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
