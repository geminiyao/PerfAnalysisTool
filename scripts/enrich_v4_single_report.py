#!/usr/bin/env python3
"""Deterministic enrich for simpleperf single (N=1) hybrid reports."""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, os.path.join(ROOT, "simpleperf"))

from simpleperf_analyzer.project_pack import detect_project_from_libs, load_project_pack
from simpleperf_analyzer.v4_single_report_renderer import render_v4_single_report


def _fill_tag(md: str, tag: str, content: str) -> str:
    marker = f"<!-- LLM_FILL:{tag} -->"
    return md.replace(marker, content) if marker in md else md


def _section1_note(summary: dict) -> str:
    sc = summary.get("symbolCheck") or {}
    app = sc.get("appSymbolizedPct", 0)
    unk = sc.get("unknownPct", 0)
    if app >= 85:
        return f"- 符号化质量 **良好**（app {app:.1f}%）；热点函数名可信度高。"
    return (
        f"- 符号化 **WARN**（app {app:.1f}% / unknown {unk:.1f}%）；部分 libil2cpp/Burst 热点可能仅以 offset 出现，§5 需结合 binary_cache 复核。"
    )


def _section2_note(summary: dict) -> str:
    il2, xlua, burst = 0.0, 0.0, 0.0
    for lib in summary.get("libs") or []:
        nm = lib.get("name", "")
        pct = lib.get("pct", 0) or 0
        if "libil2cpp" in nm:
            il2 = pct
        elif "libxlua" in nm:
            xlua = pct
        elif "lib_burst" in nm:
            burst = pct
    dominant = "C#（libil2cpp）" if il2 >= max(xlua, burst) else ("ECS/Burst" if burst >= xlua else "Lua VM")
    return f"- 业务层主力为 **{dominant}**（il2cpp {il2:.1f}% / burst {burst:.1f}% / xlua {xlua:.1f}%）。"


def _section3_note(summary: dict) -> str:
    threads = summary.get("threads") or []
    wwise = next((t for t in threads if "native" in (t.get("name") or "").lower()), None)
    main = next((t for t in threads if t.get("name") == "UnityMain"), None)
    job_pct = sum(t.get("pct", 0) for t in threads if "thread-" in (t.get("name") or "").lower())
    lines = []
    if main:
        lines.append(f"- 主线程 UnityMain **{main.get('pct', 0):.1f}%**：游戏逻辑 + 渲染提交主力。")
    if wwise and wwise.get("pct", 0) >= 5:
        lines.append(f"- Wwise（{wwise.get('name')}）**{wwise.get('pct', 0):.1f}%**：音效中间件独占线程，功耗敏感时需审视同时发声上限。")
    if job_pct >= 5:
        lines.append(f"- Job Worker 合计 **{job_pct:.1f}%**：DOTS/Burst 并行正常，通常不阻塞主线程。")
    return "\n".join(lines) if lines else "- 线程负载分布见上表；结合 §4/§5 下钻 native 热点。"


def _section5_note(summary: dict) -> str:
    hotspots = summary.get("hotspots") or []
    top3 = hotspots[:3]
    if not top3:
        return "- 无热点数据。"
    parts = []
    for h in top3:
        fn = (h.get("func") or "?")[:48]
        parts.append(f"`{fn}` ({h.get('pct', 0):.1f}%)")
    return "- Top 热点：" + "；".join(parts) + "。建议对 memcpy/powf 类运行时函数追溯上游业务调用链。"


def main():
    out_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    summary_path = os.path.join(out_dir, "simpleperf-profile-summary.json")
    provider_path = os.path.join(out_dir, "report", "performance-report_simpleperf_single_v4.md")
    enriched_path = os.path.join(out_dir, "report", "performance-report_simpleperf_AI_single_v4.md")

    summary = json.load(open(summary_path, encoding="utf-8"))
    libs = [l.get("name", "") for l in (summary.get("libs") or [])]
    if not os.environ.get("PERFTOOL_PROJECT"):
        detected = detect_project_from_libs([{"lib": n} for n in libs])
        if detected:
            os.environ["PERFTOOL_PROJECT"] = detected
    print("[enrich-single] pack:", load_project_pack().name, flush=True)

    meta = {
        **(summary.get("meta") or {}),
        "perfFile": os.path.basename(summary.get("_meta", {}).get("perfFile", "")) or "perf.data",
    }
    if os.path.isfile(provider_path):
        md = open(provider_path, encoding="utf-8").read()
    else:
        md = render_v4_single_report(summary, meta=meta, enriched=False)

    # Replace §0 with deterministic enriched block
    from simpleperf_analyzer.v4_single_report_renderer import render_section0_enriched
    if "<!-- LLM_FILL:§0总览 -->" in md:
        md = md.replace(
            "## §0 一句话总览（描述性）\n\n<!-- LLM_FILL:§0总览 -->",
            render_section0_enriched(summary).rstrip(),
        )

    md = _fill_tag(md, "§1符号化解读", _section1_note(summary))
    md = _fill_tag(md, "§2业务层解读", _section2_note(summary))
    md = _fill_tag(md, "§3线程功耗观感", _section3_note(summary))
    md = _fill_tag(md, "§5热点解读", _section5_note(summary))

    md = _fill_tag(md, "§4主线程解读", "- 主线程树展示 PlayerLoop 下游 native 热点；具体业务模块需结合 unity Profiler marker 对位。")

    os.makedirs(os.path.dirname(enriched_path), exist_ok=True)
    with open(enriched_path, "w", encoding="utf-8") as f:
        f.write(md)

    left = md.count("LLM_FILL")
    print(f"[enrich-single] OK {enriched_path} ({len(md.splitlines())} lines, LLM_FILL left={left})", flush=True)


if __name__ == "__main__":
    main()
