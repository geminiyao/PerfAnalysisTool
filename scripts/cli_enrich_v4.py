#!/usr/bin/env python3
"""Trigger codebuddy CLI to enrich the report (matches web service prompt).

Usage: python scripts/cli_enrich_v4.py [workDir]

Mirrors web/server/services/simpleperf-diff-service.ts::buildDiffEnrichPrompt
+ runCliDiffEnrich. Used for headless verification without spinning up web.
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_prompt(work_dir: str) -> str:
    skill_dir = os.path.join(ROOT, ".claude", "skills", "simpleperf-diff-analysis").replace("\\", "/")
    ai_report = os.path.join(work_dir, "report", "performance-report_simpleperf_AI_v4.md").replace("\\", "/")
    summary = os.path.join(work_dir, "simpleperf-diff-summary.json").replace("\\", "/")
    diff_json = os.path.join(work_dir, "diff", "simpleperf-diff.json").replace("\\", "/")
    knowledge = os.path.join(ROOT, "docs", "aoe-cpu-analysis-knowledge.md").replace("\\", "/")
    golden = os.path.join(ROOT, "docs", "report", "performance-report_simpleperf_ULTIMATE_v4.md").replace("\\", "/")
    final_path = os.path.join(work_dir, "performance-report.md").replace("\\", "/")
    final_in_report = os.path.join(work_dir, "report", "performance-report.md").replace("\\", "/")
    return "\n".join([
        "TASK (non-interactive, execute immediately, do NOT ask back):",
        "Read the file at the absolute path below and replace every <!-- LLM_FILL... --> placeholder",
        "with project-aware Chinese narrative grounded in the structured diff JSON + knowledge base.",
        "All numbers, tables, mermaid charts, code blocks must be preserved verbatim.",
        "",
        f"FILE TO EDIT: {ai_report}",
        f"ALSO MIRROR FINAL CONTENT TO: {final_path}",
        f"ALSO MIRROR TO: {final_in_report}",
        "",
        "REFERENCE FILES (read-only, for facts/style):",
        f"- Numbers source: {diff_json}",
        f"- Summary metadata: {summary}",
        f"- Knowledge base (for business semantics & optimization recipes): {knowledge}",
        f"- Gold style reference (DO NOT copy verbatim — emulate tone/depth only): {golden}",
        f"- Skill spec: {skill_dir}/SKILL.md",
        "",
        "## How placeholders work",
        "Every <!-- LLM_FILL: <instruction> --> in the file marks a slot you must replace.",
        "The instruction tells you what kind of paragraph/list to write.",
        "After replacement, the comment marker should be GONE (HTML comments must not appear in final output).",
        "If a placeholder asks for a list, write proper Markdown bullets (- ...).",
        "If it asks for a paragraph, write 1-3 sentences in Chinese.",
        "",
        "## Hard rules",
        "- 禁改：所有 Markdown 表格、Mermaid 块、调用树代码块（```...```）、章节标题、§0.2 红线告警卡片、§3.x 表、§4.1/§4.2 Top-N 表、§5.1/§5.3 表、§7.1/§7.3 表、§10.x 反查表",
        "- 禁造数字：所有数值必须来自 diff JSON / Provider 报告中已存在的数字。如果你想加新数字，先查 diff JSON 确认。",
        "- 禁动 .provider/ 目录",
        "- 禁用项目特化死字符（aoeyz 项目独有词）：不要写 \"野外几乎无音效\"、\"300 队部队\"、\"行军压测\"、\"野外远景树木\"、\"两路汇流\"、\"群体音效\" 等只对当前数据有意义的词；用 meta.sceneCur 实际场景描述代替",
        "- 不要保留 <!-- LLM_FILL: ... --> 占位符在最终输出中（必须替换为真正叙事）",
        "- 不要在已经是 LLM 填好的段落（**业务含义**：等）旁边再追加同名段落（避免出现 2 份业务含义）",
        "",
        "## Where placeholders live (high-level guide)",
        "- §0 结论先行：FPS 注解 + 普通话总览 + 4 项 ROI 优化方向（每条 80-150 字带知识库引用）",
        "- §4.3 / §4.4 / §4.5 / §4.6：每节 3-4 段（业务含义 / 调用入口 / 关联开销 / 优化方向）",
        "- §5.3 注脚：解释 wrapper 与真热点的下钻关系",
        "- §6.2 RHI 树之后：关键变化解读",
        "- §9 Lua GC：变化解读 + 建议",
        "- §10.1-§10.4：每节结论（基于反查表内的真实业务模块）",
        "",
        "## Output",
        f"1. Overwrite: {ai_report}",
        f"2. Mirror to: {final_path}",
        f"3. Mirror to: {final_in_report}",
        "4. Final line: <<ENRICH_DONE lines=N bytes=M placeholders_filled=K>>",
        "",
        "## Self-check",
        f"- After all edits, run: `grep -c LLM_FILL {ai_report}` — must return 0",
        f"- File should be >= 645 lines (gold reference is 663 lines)",
        "- Each of §4.3-§4.6 should be >= 18 lines",
        "- 不允许出现两个连续的 **业务含义**: 段落（这是重复 bug 的征兆，必须 De-dup）",
    ])


def _resolve_codebuddy() -> str:
    """codebuddy is an npm-installed .cmd on Windows; subprocess won't auto-resolve."""
    if os.name == "nt":
        for p in os.environ.get("PATH", "").split(os.pathsep):
            for ext in (".cmd", ".bat", ".exe", ""):
                full = os.path.join(p, "codebuddy" + ext)
                if os.path.isfile(full):
                    return full
    # POSIX
    import shutil
    return shutil.which("codebuddy") or "codebuddy"


def main():
    work_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/auto_discovery_diff")
    prompt = build_prompt(work_dir)
    prompt_path = os.path.join(work_dir, "diff-cli-prompt.txt")
    with open(prompt_path, "w", encoding="utf-8") as f:
        f.write(prompt)

    cb = _resolve_codebuddy()
    # Pipe prompt via stdin to avoid Windows .cmd argument-parsing eating
    # newlines/quotes in long multi-line prompts.
    cmd = [
        cb,
        "-p",  # print (non-interactive)
        "--output-format", "stream-json",
        "--include-partial-messages",
        "-y",
        "--dangerously-skip-permissions",
        "--allowedTools", "Bash,Read,Write,Glob,Grep,Edit",
    ]
    print(f"[cli-enrich] spawning {cb} ({len(prompt)} chars prompt via stdin)...", flush=True)
    t0 = time.time()
    log_path = os.path.join(work_dir, "diff-cli.log")
    with open(log_path, "w", encoding="utf-8") as logf:
        proc = subprocess.Popen(
            cmd, cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            shell=False,
        )
        try:
            proc.stdin.write(prompt)
            proc.stdin.close()
        except Exception as exc:
            print(f"[cli-enrich] stdin write failed: {exc}", flush=True)
        for line in proc.stdout:
            line = line.rstrip()
            logf.write(line + "\n")
            logf.flush()
            if "ENRICH_DONE" in line or '"error"' in line.lower() or '"name":"Edit"' in line or '"name":"Write"' in line:
                print(f"[cli] {line[:200]}", flush=True)
        rc = proc.wait()
    dt = time.time() - t0
    print(f"[cli-enrich] exit={rc} in {dt:.1f}s log={log_path}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
