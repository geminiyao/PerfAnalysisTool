#!/usr/bin/env python3
"""Extract v4 markdown report from CodeBuddy stdout log when Write tool was blocked."""

import re
import sys
from pathlib import Path


def extract(text: str) -> str | None:
    # Prefer gold-style title
    patterns = [
        r"(# simpleperf 单源\s+性能分析报告[^\n]*\n[\s\S]+)",
        r"(# simpleperf[^\n]*\n[\s\S]+)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        body = m.group(1).strip()
        # Trim trailing CLI chatter
        stop_markers = [
            "\n报告完整，覆盖",
            "\n*数据来源：`docs/report",
            "\n---\n\n报告完整",
            "\n写入文件需要权限",
        ]
        for sm in stop_markers:
            idx = body.find(sm)
            if idx > 0:
                body = body[:idx].rstrip()
        if "## §0" in body or "## §11" in body:
            return body + "\n"
    return None


def main():
    if len(sys.argv) < 3:
        print("usage: extract_codebuddy_report.py <log> <out.md>", file=sys.stderr)
        sys.exit(2)
    log_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    text = log_path.read_text(encoding="utf-8", errors="replace")
    report = extract(text)
    if not report:
        print("no report block found", file=sys.stderr)
        sys.exit(1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"wrote {out_path} ({len(report)} bytes)")


if __name__ == "__main__":
    main()
