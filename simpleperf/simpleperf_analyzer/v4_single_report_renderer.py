"""Render simpleperf single (N=1) descriptive report skeleton from profile summary."""

from __future__ import annotations

import re


def _layer_of_lib(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("libunity", "libgles", "libvulkan", "libegl")):
        return "engine"
    if any(x in n for x in ("libil2cpp", "libxlua", "lib_burst", "libaoe", "libgame", "libtbunative")):
        return "business"
    if any(x in n for x in ("libak", "libfmod", "libwwise", "libaaudio", "libgvoice", "libgcloud")):
        return "middleware"
    if n in ("[jit cache]", "linker64", "[vdso]") or any(x in n for x in ("libc.", "libart", "libm.", "libdl")):
        return "runtime"
    return "other"


def _fmt_pct(v) -> str:
    if v is None:
        return "—"
    return f"{float(v):.2f}%"


def _fmt_samples(n) -> str:
    if n is None:
        return "—"
    return f"{int(n):,}"


def _short_func(name: str, limit: int = 80) -> str:
    s = name or "?"
    if len(s) <= limit:
        return s
    return s[: limit - 3] + "..."


def _render_pruned_tree(node: dict, indent: int = 0, max_depth: int = 8, max_children: int = 6) -> list[str]:
    if not node or indent > max_depth:
        return []
    name = _short_func(node.get("name", "?"))
    self_ms = node.get("selfMs", 0) or 0
    total_pct = node.get("totalPct", 0) or 0
    prefix = "│  " * indent + ("├─ " if indent else "")
    lines = [f"{prefix}{name} (self {self_ms:.1f}ms / {total_pct:.2f}% thread)"]
    children = sorted(node.get("children") or [], key=lambda c: c.get("totalMs", 0), reverse=True)
    for ch in children[:max_children]:
        lines.extend(_render_pruned_tree(ch, indent + 1, max_depth, max_children))
    return lines


def _top_threads(threads: list[dict], n: int = 12) -> list[dict]:
    return sorted(threads or [], key=lambda t: t.get("pct", 0), reverse=True)[:n]


def _biz_layer_libs(libs: list[dict]) -> tuple[float, float, float]:
    il2 = xlua = burst = 0.0
    for lib in libs or []:
        nm = lib.get("name", "")
        pct = lib.get("pct", 0) or 0
        if "libil2cpp" in nm:
            il2 = pct
        elif "libxlua" in nm:
            xlua = pct
        elif "lib_burst" in nm:
            burst = pct
    return il2, xlua, burst


def render_single_header(meta: dict, scene: str = "") -> str:
    scene_label = scene or meta.get("label") or "单次采集"
    return "\n".join([
        f"# Simpleperf 单次 CPU 性能分析报告 · {scene_label}",
        "",
        f"> **数据文件**：{meta.get('perfFile', '—')}",
        f"> **事件**：{meta.get('event', 'cpu-cycles:u')}",
        f"> **总样本**：{_fmt_samples(meta.get('totalSamples'))} 次",
        f"> **采集时间**：{meta.get('recordTime', '—')}",
        f"> **设备**：{meta.get('device', '—')}",
        "> **注**：本报告为**描述性快照**（单次无基线，不做回归判定）。版本对比请用 simpleperf-diff。",
        "",
        "---",
        "",
    ])


def render_section0_placeholder() -> str:
    return "\n".join([
        "## §0 一句话总览（描述性）",
        "",
        "<!-- LLM_FILL:§0总览 -->",
        "",
        "---",
        "",
    ])


def render_section0_enriched(summary: dict) -> str:
    meta = summary.get("meta") or {}
    threads = _top_threads(summary.get("threads") or [], 5)
    libs = summary.get("libs") or []
    lb = summary.get("layerBreakdown") or {}
    il2, xlua, burst = _biz_layer_libs(libs)
    biz_sum = (lb.get("business") or 0)
    engine_sum = (lb.get("engine") or 0)
    top_thread = threads[0] if threads else {}
    wwise = next((t for t in threads if "native" in (t.get("name") or "").lower()), None)
    job_sum = sum(t.get("pct", 0) for t in threads if re.search(r"thread-\d+", t.get("name", ""), re.I))
    lines = [
        "## §0 一句话总览（描述性）",
        "",
        f"{top_thread.get('name', 'UnityMain')} 独占机器 CPU **{top_thread.get('pct', 0):.1f}%**；",
        f"engine 层 **{engine_sum:.1f}%** / business 层 **{biz_sum:.1f}%**（libil2cpp {il2:.1f}% + lib_burst {burst:.1f}% + libxlua {xlua:.1f}%）；",
    ]
    if wwise:
        lines.append(f"Wwise 线程（{wwise.get('name')}）**{wwise.get('pct', 0):.1f}%**；")
    if job_sum > 0:
        lines.append(f"Job Worker 线程合计约 **{job_sum:.1f}%**。")
    lines.extend(["", "---", ""])
    return "\n".join(lines)


def render_section1(summary: dict) -> str:
    meta = summary.get("meta") or {}
    sc = summary.get("symbolCheck") or {}
    lb = summary.get("layerBreakdown") or {}
    lb_sum = sum(lb.get(k, 0) for k in ("business", "engine", "runtime", "noise"))
    sw = sc.get("stackUnwind") or {}
    lines = [
        "## §1 采集元信息 + 符号化质量",
        "",
        "| 项目 | 值 |",
        "|---|---|",
        f"| 设备 | {meta.get('device', '—')} |",
        f"| 采集事件 | {meta.get('event', 'cpu-cycles:u')} |",
        f"| 总样本数 | {_fmt_samples(meta.get('totalSamples'))} |",
        f"| 采集日期 | {meta.get('recordTime', '—')} |",
        f"| 符号化状态 | **{sc.get('status', '—')}**（appSymbolizedPct = {sc.get('appSymbolizedPct', '—')}%） |",
        f"| unknownPct | {sc.get('unknownPct', '—')}% |",
        f"| kernelPct | {sc.get('kernelPct', 0)}% |",
        f"| anchors | {sc.get('anchorsResolved', 0)} / {sc.get('anchorsTotal', 0)} |",
        f"| stackUnwind | {sw.get('status', '—')} |",
        f"| layerBreakdown 合计 | business {lb.get('business', 0):.1f}% + engine {lb.get('engine', 0):.1f}% + runtime {lb.get('runtime', 0):.1f}% + noise {lb.get('noise', 0):.1f}% ≈ {lb_sum:.1f}% |",
        "",
        "<!-- LLM_FILL:§1符号化解读 -->",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def render_section2(summary: dict) -> str:
    lb = summary.get("layerBreakdown") or {}
    libs = summary.get("libs") or []
    il2, xlua, burst = _biz_layer_libs(libs)
    biz_total = lb.get("business") or (il2 + xlua + burst)
    lines = [
        "## §2 So 分层负载分布",
        "",
        "### 2.1 分层汇总",
        "",
        "| 层 | 占比 | 含义 |",
        "|---|---:|---|",
        f"| **engine** | **{lb.get('engine', 0):.1f}%** | 引擎渲染、图形驱动 |",
        f"| **business** | **{lb.get('business', 0):.1f}%** | C# / Lua / ECS Burst |",
        f"| **runtime** | **{lb.get('runtime', 0):.1f}%** | libc / libart 等系统库 |",
        f"| **noise** | {lb.get('noise', 0):.1f}% | atrace 等观测噪声 |",
        "",
        "### 2.2 Top-20 So 负载明细",
        "",
        "| 排名 | So 文件 | 自耗占比 | 所属层 |",
        "|---:|---|---:|---|",
    ]
    for i, lib in enumerate(libs[:20], 1):
        lines.append(
            f"| {i} | {lib.get('name', '?')} | {lib.get('pct', 0):.2f}% | {_layer_of_lib(lib.get('name', ''))} |"
        )
    lines.extend([
        "",
        "### 2.3 业务层 C# vs Lua vs Burst",
        "",
        "| 指标 | libil2cpp | libxlua | lib_burst_generated |",
        "|---|---:|---:|---:|",
        f"| 自耗占比 | {il2:.2f}% | {xlua:.2f}% | {burst:.2f}% |",
        "",
        "<!-- LLM_FILL:§2业务层解读 -->",
        "",
        "---",
        "",
    ])
    return "\n".join(lines)


def render_section3(summary: dict) -> str:
    threads = _top_threads(summary.get("threads") or [], 14)
    lines = [
        "## §3 线程占机 CPU 分布",
        "",
        "| 线程 | 占比 | 备注 |",
        "|---|---:|---|",
    ]
    for t in threads:
        nm = t.get("name", "?")
        note = ""
        if nm == "UnityMain":
            note = "主线程"
        elif re.search(r"thread-\d+", nm, re.I):
            note = "Job Worker"
        elif "native" in nm.lower():
            note = "中间件（常见 Wwise）"
        elif "gfx" in nm.lower() or "render" in nm.lower():
            note = "渲染"
        lines.append(f"| **{nm}** | **{t.get('pct', 0):.2f}%** | {note} |")
    lines.extend([
        "",
        "<!-- LLM_FILL:§3线程功耗观感 -->",
        "",
        "---",
        "",
    ])
    return "\n".join(lines)


def render_section4(summary: dict) -> str:
    trees = summary.get("callTrees") or []
    main = next((t for t in trees if t.get("thread") == "UnityMain"), trees[0] if trees else None)
    lines = [
        "## §4 主线程 Native 调用树（剪枝）",
        "",
    ]
    if main and main.get("root"):
        lines.append("```")
        lines.extend(_render_pruned_tree(main["root"], max_depth=7))
        lines.append("```")
    else:
        lines.append("_主线程调用树缺失_")
    lines.extend([
        "",
        "<!-- LLM_FILL:§4主线程解读 -->",
        "",
        "---",
        "",
    ])
    return "\n".join(lines)


def render_section5(summary: dict) -> str:
    hotspots = (summary.get("hotspots") or [])[:15]
    lines = [
        "## §5 Top-N 热点函数（self 占比）",
        "",
        "| # | 函数 | So | self% |",
        "|---:|---|---|---:|",
    ]
    for i, h in enumerate(hotspots, 1):
        lines.append(
            f"| {i} | `{_short_func(h.get('func', '?'), 72)}` | {h.get('lib', '?')} | {h.get('pct', 0):.2f}% |"
        )
    lines.extend([
        "",
        "<!-- LLM_FILL:§5热点解读 -->",
        "",
        "---",
        "",
    ])
    return "\n".join(lines)


def render_section6_boundary() -> str:
    return "\n".join([
        "## §6 本源能力边界",
        "",
        "- ✅ 本报告给出 **CPU 周期落在哪条线程 / 哪个 so / 哪个 native 函数**（描述性快照）。",
        "- ❌ **单次无基线**，不做「变快/变慢」判定；回归请用 simpleperf-diff。",
        "- ❌ 不覆盖 Unity Profiler marker 语义、GC.Alloc 次数、GPU 顶点负载 — 需 unity / perfetto 互补。",
        "- ⚠️ unknown 符号占比高时，business 层结论需打折。",
        "",
    ])


def render_v4_single_report(summary: dict, meta: dict | None = None, enriched: bool = False) -> str:
    meta = {**(summary.get("meta") or {}), **(meta or {})}
    parts = [
        render_single_header(meta, meta.get("scene") or meta.get("label") or ""),
        render_section0_enriched(summary) if enriched else render_section0_placeholder(),
        render_section1(summary),
        render_section2(summary),
        render_section3(summary),
        render_section4(summary),
        render_section5(summary),
        render_section6_boundary(),
    ]
    return "\n".join(parts)
