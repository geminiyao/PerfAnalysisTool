#!/usr/bin/env python3
"""maple_compare.py - Maple ILOpt 性能对比分析脚本（多维度增强版）

使用方式：
    python scripts/maple_compare.py \\
        --base  output/maple/base_PAL-AL00_20260612_154316 \\
        --opt   output/maple/opt_PAL-AL00_20260612_154649 \\
        --out   output/maple/report_20260612.txt

    # 多次采样取均值（通配符）
    python scripts/maple_compare.py \\
        --base  "output/maple/base_PAL-AL00_*/" \\
        --opt   "output/maple/opt_PAL-AL00_*/"  \\
        --out   output/maple/report_final.txt

分析维度：
    [A] simpleperf 主线程细颗粒度   — UnityMain 关键函数自耗时 Top-N 对比
    [B] simpleperf Worker/Job 线程  — 所有线程 so 负载对比（libil2cpp/libunity/…）
    [C] simpleperf Level 1/2/3     — So 级 / Anchor 子树 / 函数级 A-M-D Diff
    [D] perfetto 线程调度            — Running/Runnable/Sleeping 占比对比
    [E] perfetto Unity atrace slice — PlayerLoop/Scripting/Camera.Render 帧均时长
    [F] perfetto 帧时长              — P50/P95/P99 对比，Choreographer 间隔
    [G] Unity Profiler .pdata       — marker 帧均、线程负载、帧率
    [H] 三维交叉验证                 — 方向一致性判断 + 置信度结论
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import io
from datetime import datetime

# ---------------------------------------------------------------------------
# 路径设置
# ---------------------------------------------------------------------------
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SIMPLEPERF_PKG = os.path.join(PROJECT_ROOT, "simpleperf")
sys.path.insert(0, SIMPLEPERF_PKG)
sys.path.insert(0, SCRIPT_DIR)   # 引入 pdata_analyzer / perfetto_analyzer

try:
    from simpleperf_analyzer import so_compare, anchor_compare, func_compare, reporter
    from simpleperf_analyzer.loader import load_profile
except ImportError as e:
    print(f"[ERROR] 无法导入 simpleperf_analyzer: {e}")
    sys.exit(1)

try:
    from pdata_analyzer import parse_pdata, analyze_pdata, compare_pdata
    PDATA_AVAILABLE = True
except ImportError:
    PDATA_AVAILABLE = False

try:
    from perfetto.trace_processor import TraceProcessor  # type: ignore
    PERFETTO_AVAILABLE = True
except ImportError:
    PERFETTO_AVAILABLE = False

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
PRIORITY_LIBS = [
    "libil2cpp.so", "libxlua.so", "libunity.so",
    "libGLESv2_adreno.so", "libGLESv3.so",
]

ANCHOR_FUNCS = [
    "il2cpp::vm::Runtime::Invoke",
    "il2cpp::vm::Object::VirtualInvoke",
    "VirtualInvokeData::methodPtrForType",
    "luaV_execute",
    "ExecutePlayerLoop",
    "ScriptRunBehaviourUpdate",
    "GfxDeviceWorker::RunCommand",
]

TARGET_THREAD = "UnityMain"

# Worker/Job 线程关键词
WORKER_THREAD_TOKENS = ("UnityGfx", "GfxDevice", "Render", "Job", "Worker", "Loading", "Audio")

# Unity Profiler 关键 marker（用于 pdata 报告）
PDATA_REPORT_MARKERS = [
    "PlayerLoop",
    "BehaviourUpdate",
    "ScriptRunBehaviourUpdate",
    "ScriptRunBehaviourLateUpdate",
    "Camera.Render",
    "WaitForTargetFPS",
    "GC.Collect",
    "Physics.Processing",
    "Rendering",
    "Coroutines",
    "AnimatorControllerPlayback",
    "Idle",
]

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
def resolve_run_dirs(pattern):
    if os.path.isdir(pattern):
        return [pattern]
    matched = sorted(glob.glob(pattern))
    dirs = [d for d in matched if os.path.isdir(d)]
    if not dirs:
        raise ValueError(f"未找到匹配的目录: {pattern}")
    return dirs


def load_meta(run_dir):
    p = os.path.join(run_dir, "meta.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def find_perf_data(run_dir):
    p = os.path.join(run_dir, "perf.data")
    return p if os.path.exists(p) else None


def find_pdata(run_dir):
    """查找 run_dir 中第一个 .pdata 文件。"""
    for name in sorted(os.listdir(run_dir)):
        if name.endswith(".pdata"):
            return os.path.join(run_dir, name)
    return None


def find_pftrace(run_dir):
    """查找 run_dir 中第一个 .pftrace 文件。"""
    for name in sorted(os.listdir(run_dir)):
        if name.endswith(".pftrace"):
            return os.path.join(run_dir, name)
    return None


def avg(values):
    return sum(values) / len(values) if values else 0.0


def pct_arrow(delta, unit="pct"):
    if unit == "pp":
        if delta < -0.3:
            return f"↓{abs(delta):.2f}pp  ✓"
        elif delta > 0.3:
            return f"↑{delta:.2f}pp  !"
        else:
            return f"≈{delta:+.2f}pp 持平"
    else:
        if delta < -0.5:
            return f"↓{abs(delta):.1f}%  ✓"
        elif delta > 0.5:
            return f"↑{delta:.1f}%  !"
        else:
            return f"≈{delta:+.1f}% 持平"


def pp_arrow(delta_pp):
    return pct_arrow(delta_pp, "pp")


def ms_delta_str(b, o):
    if b is None or o is None:
        return "N/A"
    d = (o - b) / b * 100 if b else 0
    return pct_arrow(d)


def _get_time_window(meta):
    start = meta.get("mono_ns_start")
    end   = meta.get("mono_ns_end")
    if start and end:
        return int(start), int(end)
    return None, None


# ---------------------------------------------------------------------------
# simpleperf 主线程细颗粒度分析
# ---------------------------------------------------------------------------
def analyze_main_thread_hotspots(profile, thread_name=TARGET_THREAD, top_n=25):
    """从调用树提取主线程关键函数自耗时。
    返回 list[{func, lib, self_ms, pct}]，按 self_ms 降序。
    """
    info  = profile.record_info
    scale = 1_000_000.0
    thread_names = info["threadNames"]

    agg_self = {}   # func_name -> self_ms
    thread_total = 0

    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in ("cpu-clock", "cpu-cycles:u", "cpu-cycles", "task-clock"):
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                tname = thread_names.get(thread["tid"]) or str(thread["tid"])
                if thread_name not in tname:
                    continue
                thread_total += thread.get("eventCount", 0)
                for lib in thread.get("libs", []):
                    lname = profile.lib_name(lib["libId"])
                    basename = os.path.basename(lname) if lname else "[unknown]"
                    for func in lib.get("functions", []):
                        fname = profile.func_name(func["f"])
                        _sc, ec, _sec = func["c"]
                        key = (fname, basename)
                        agg_self[key] = agg_self.get(key, 0) + ec

    total = thread_total or 1
    hotspots = []
    for (fname, lname), ec in agg_self.items():
        if ec <= 0:
            continue
        hotspots.append({
            "func": fname,
            "lib":  lname,
            "self_ms":  round(ec / scale, 3),
            "pct":      round(ec / total * 100.0, 3),
        })
    hotspots.sort(key=lambda x: x["self_ms"], reverse=True)
    return hotspots[:top_n]


def compare_main_thread_hotspots(base_hotspots, opt_hotspots):
    """按函数名对齐 base/opt hotspots，计算 delta。"""
    base_map = {h["func"]: h for h in base_hotspots}
    opt_map  = {h["func"]: h for h in opt_hotspots}

    all_funcs = sorted(
        set(base_map) | set(opt_map),
        key=lambda f: max(
            base_map.get(f, {}).get("self_ms", 0),
            opt_map.get(f,  {}).get("self_ms", 0),
        ),
        reverse=True,
    )

    rows = []
    for func in all_funcs[:30]:
        b = base_map.get(func, {})
        o = opt_map.get(func, {})
        b_ms = b.get("self_ms", 0.0)
        o_ms = o.get("self_ms", 0.0)
        if b_ms < 0.5 and o_ms < 0.5:
            continue
        delta = (o_ms - b_ms) / b_ms * 100 if b_ms else None
        rows.append({
            "func":    func,
            "lib":     b.get("lib") or o.get("lib", ""),
            "base_ms": b_ms,
            "opt_ms":  o_ms,
            "delta_pct": delta,
        })
    return rows


# ---------------------------------------------------------------------------
# simpleperf 全线程 so 负载
# ---------------------------------------------------------------------------
def collect_all_thread_so(profile):
    """返回 {thread_name: (total_event, {lib_basename: event_count})}。"""
    info = profile.record_info
    thread_names = info["threadNames"]
    merged: dict = {}
    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in ("cpu-clock", "cpu-cycles:u", "cpu-cycles", "task-clock"):
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                tname = thread_names.get(thread["tid"]) or str(thread["tid"])
                total = thread.get("eventCount", 0)
                libs: dict = {}
                for lib in thread.get("libs", []):
                    lname = profile.lib_name(lib["libId"])
                    base  = os.path.basename(lname) if lname else "[unknown]"
                    ec    = lib.get("eventCount", 0)
                    libs[base] = libs.get(base, 0) + ec
                if tname not in merged:
                    merged[tname] = [0, {}]
                merged[tname][0] += total
                for k, v in libs.items():
                    merged[tname][1][k] = merged[tname][1].get(k, 0) + v
    return merged


def compare_worker_threads(base_threads: dict, opt_threads: dict):
    """对比 Worker/Job 线程负载，返回结构化列表。"""
    all_tnames = sorted(set(base_threads) | set(opt_threads))
    rows = []
    for tname in all_tnames:
        if not any(tok in tname for tok in WORKER_THREAD_TOKENS):
            continue
        b_total, b_libs = base_threads.get(tname, (0, {}))
        o_total, o_libs = opt_threads.get(tname,  (0, {}))
        if b_total == 0 and o_total == 0:
            continue

        # 整体 CPU 占用（相对全进程总量的比例在调用方计算，这里给出绝对 event 数用于对比）
        # 主要关注 so 分布
        lib_rows = []
        for lib in sorted(set(b_libs) | set(o_libs)):
            b_pct = b_libs.get(lib, 0) / b_total * 100 if b_total else 0.0
            o_pct = o_libs.get(lib, 0) / o_total * 100 if o_total else 0.0
            if b_pct < 1.0 and o_pct < 1.0:
                continue
            lib_rows.append({
                "lib":       lib,
                "base_pct":  round(b_pct, 2),
                "opt_pct":   round(o_pct, 2),
                "delta_pp":  round(o_pct - b_pct, 2),
            })
        lib_rows.sort(key=lambda x: abs(x["delta_pp"]), reverse=True)

        rows.append({
            "thread": tname,
            "base_total_event": b_total,
            "opt_total_event":  o_total,
            "libs": lib_rows[:10],
        })
    return rows


# ---------------------------------------------------------------------------
# perfetto 解析（调用 perfetto_analyzer）
# ---------------------------------------------------------------------------
def run_perfetto_analyzer(pftrace_path: str, profile_name: str) -> dict:
    """调用 perfetto_analyzer.py 解析 trace，返回 dict。"""
    if not PERFETTO_AVAILABLE:
        return {"parse_status": "skipped", "parse_notes": "perfetto library not installed"}
    if not pftrace_path or not os.path.exists(pftrace_path):
        return {"parse_status": "skipped", "parse_notes": "pftrace file not found"}

    # 动态 import 避免顶层 import 失败阻断整个脚本
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "perfetto_analyzer",
            os.path.join(SCRIPT_DIR, "perfetto_analyzer.py")
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.parse_trace(pftrace_path, profile_name)
    except Exception as e:
        return {"parse_status": "failed", "parse_notes": str(e)[:300]}


# ---------------------------------------------------------------------------
# pdata 解析
# ---------------------------------------------------------------------------
def run_pdata_analysis(pdata_path: str) -> dict:
    """解析 .pdata，返回 stats dict（供报告格式化使用）。"""
    if not PDATA_AVAILABLE:
        return None
    if not pdata_path or not os.path.exists(pdata_path):
        return None
    try:
        pdata_file = parse_pdata(pdata_path)
        stats = analyze_pdata(pdata_file, target_markers=PDATA_REPORT_MARKERS)
        return stats
    except Exception as e:
        print(f"[WARN] pdata 解析失败 ({pdata_path}): {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# 报告格式化
# ---------------------------------------------------------------------------
def _hr(width=72):
    return "-" * width + "\n"


def format_report(
    base_dirs, opt_dirs,
    base_metas, opt_metas,
    # simpleperf
    so_result, il2cpp_stats, anchor_result, func_result,
    base_hotspots, opt_hotspots, hotspot_compare,
    worker_thread_cmp,
    # perfetto
    base_perf: dict, opt_perf: dict,
    # pdata
    base_pdata_stats, opt_pdata_stats,
):
    out = io.StringIO()

    base_label = base_metas[0].get("label", os.path.basename(base_dirs[0])) if base_metas else base_dirs[0]
    opt_label  = opt_metas[0].get("label", os.path.basename(opt_dirs[0]))  if opt_metas else opt_dirs[0]
    device     = base_metas[0].get("device", "unknown") if base_metas else "unknown"
    scene      = base_metas[0].get("scene", "unknown")  if base_metas else "unknown"
    duration   = base_metas[0].get("duration_sec", "?") if base_metas else "?"

    base_fc = int(avg([m["frame_count"] for m in base_metas if m.get("frame_count")])) or None
    opt_fc  = int(avg([m["frame_count"] for m in opt_metas  if m.get("frame_count")])) or None
    runs_info = f" × {len(base_dirs)} 次均值" if len(base_dirs) > 1 else ""

    out.write("=" * 72 + "\n")
    out.write("Maple ILOpt 性能对比报告（多维度增强版）\n")
    out.write(f"  base 版本 : {base_label}\n")
    out.write(f"  opt  版本 : {opt_label}\n")
    out.write(f"  采样时长  : {duration}s{runs_info}\n")
    out.write(f"  测试场景  : {scene}\n")
    out.write(f"  设备      : {device}\n")
    out.write(f"  生成时间  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    out.write("=" * 72 + "\n\n")

    # ==========================================================================
    # [A] simpleperf 核心指标（il2cpp）
    # ==========================================================================
    out.write("【A】核心指标 — il2cpp CPU 消耗（Maple 优化直接目标）\n")
    out.write(_hr())
    out.write(f"  {'指标':<36} {'base':>12} {'opt':>12}  {'变化':>14}\n")
    out.write(f"  {'-'*36} {'-'*12} {'-'*12}  {'-'*14}\n")

    b_pct = il2cpp_stats.get("base_pct")
    o_pct = il2cpp_stats.get("opt_pct")
    d_pp  = il2cpp_stats.get("delta_pp")
    if b_pct is not None and o_pct is not None:
        out.write(f"  {'il2cpp 占 UnityMain CPU 比例':<36} {b_pct:>11.2f}% {o_pct:>11.2f}%  {pp_arrow(d_pp) if d_pp is not None else 'N/A':>14}\n")

    b_ms = il2cpp_stats.get("base_ms")
    o_ms = il2cpp_stats.get("opt_ms")
    if b_ms and o_ms:
        delta_pct = (o_ms - b_ms) / b_ms * 100
        out.write(f"  {'il2cpp 总 cpu-clock (ms)':<36} {b_ms:>11.1f}  {o_ms:>11.1f}  {pct_arrow(delta_pct):>14}\n")

    b_mf = il2cpp_stats.get("base_ms_per_frame")
    o_mf = il2cpp_stats.get("opt_ms_per_frame")
    if b_mf and o_mf:
        delta_pct = (o_mf - b_mf) / b_mf * 100
        out.write(f"  {'il2cpp 帧均 (ms/frame)':<36} {b_mf:>12.3f} {o_mf:>12.3f}  {pct_arrow(delta_pct):>14}\n")

    if base_fc and opt_fc:
        fc_delta_pct = (opt_fc - base_fc) / base_fc * 100
        ok = "✓" if abs(fc_delta_pct) < 5 else "! 场景可能不一致"
        out.write(f"  {'frameCount（场景一致性验证）':<36} {base_fc:>12d} {opt_fc:>12d}  {ok:>14}\n")
    out.write("\n")

    # ==========================================================================
    # [B] simpleperf 主线程细颗粒度热点函数
    # ==========================================================================
    out.write("【B】simpleperf — UnityMain 热点函数自耗时对比（Top 25）\n")
    out.write(_hr())
    if hotspot_compare:
        out.write(f"  {'函数名':<52} {'lib':<20} {'base(ms)':>9} {'opt(ms)':>9} {'变化':>12}\n")
        out.write(f"  {'-'*52} {'-'*20} {'-'*9} {'-'*9} {'-'*12}\n")
        for row in hotspot_compare[:25]:
            b_ms_h = row["base_ms"]
            o_ms_h = row["opt_ms"]
            d = row["delta_pct"]
            d_str = pct_arrow(d) if d is not None else "N/A"
            fname = row["func"][:52]
            lname = row["lib"][:20]
            out.write(f"  {fname:<52} {lname:<20} {b_ms_h:>9.2f} {o_ms_h:>9.2f} {d_str:>12}\n")
    else:
        out.write("  (无热点函数数据)\n")
    out.write("\n")

    # ==========================================================================
    # [C] simpleperf Level 1 — 全线程 So 分布
    # ==========================================================================
    out.write("【C】simpleperf — 全线程 So 分布（Level 1）\n")
    out.write(_hr())
    for thread in so_result.get("threads", []):
        is_main = TARGET_THREAD in thread["name"]
        is_worker = any(tok in thread["name"] for tok in WORKER_THREAD_TOKENS)
        # 主线程和 Worker 线程都显示
        if not (is_main or is_worker):
            continue
        b_total = thread["baseline_total_event"]
        c_total = thread["current_total_event"]
        # 计算线程自身负载变化
        total_delta_pct = (c_total - b_total) / b_total * 100 if b_total else 0
        out.write(f"  [{thread['name']}]  base={b_total} events  opt={c_total} events  总量{pct_arrow(total_delta_pct)}\n")
        out.write(f"  {'so':<36} {'base%':>8} {'opt%':>8} {'delta':>12}\n")
        libs_sorted = sorted(
            thread.get("libs", []),
            key=lambda x: (
                PRIORITY_LIBS.index(x["name"]) if x["name"] in PRIORITY_LIBS else len(PRIORITY_LIBS),
                -abs(x["delta_pct"])
            )
        )
        for lib in libs_sorted[:12]:
            out.write(f"  {lib['name']:<36} {lib['baseline_pct']:>7.2f}% {lib['current_pct']:>7.2f}% {pp_arrow(lib['delta_pct']):>12}\n")
        out.write("\n")

    # ==========================================================================
    # [C2] simpleperf Worker/Job 线程 il2cpp 专项
    # ==========================================================================
    out.write("【C2】simpleperf — Worker/Job 线程负载对比\n")
    out.write(_hr())
    if worker_thread_cmp:
        for wt in worker_thread_cmp:
            b_ev = wt["base_total_event"]
            o_ev = wt["opt_total_event"]
            d_ev = (o_ev - b_ev) / b_ev * 100 if b_ev else 0
            out.write(f"  [{wt['thread']}]  总 event: base={b_ev}  opt={o_ev}  {pct_arrow(d_ev)}\n")
            if wt["libs"]:
                out.write(f"    {'so':<34} {'base%':>8} {'opt%':>8} {'Δpp':>8}\n")
                for lib in wt["libs"]:
                    out.write(f"    {lib['lib']:<34} {lib['base_pct']:>7.2f}% {lib['opt_pct']:>7.2f}% {pp_arrow(lib['delta_pp']):>8}\n")
            out.write("\n")
    else:
        out.write("  (未找到 Worker/Job 线程或无显著变化)\n\n")

    # ==========================================================================
    # [C3] simpleperf Level 2 — Anchor 子树
    # ==========================================================================
    out.write("【C3】simpleperf — Anchor 子树时间（Level 2 — 虚函数路径）\n")
    out.write(_hr())
    anchors = anchor_result.get("anchors", [])
    if anchors:
        out.write(f"  {'anchor 函数':<48} {'base(ms)':>10} {'opt(ms)':>10} {'变化':>12}\n")
        out.write(f"  {'-'*48} {'-'*10} {'-'*10} {'-'*12}\n")
        for a in anchors:
            b_ms_a = a.get("baseline_ms", 0)
            c_ms_a = a.get("current_ms", 0)
            d_pct_a = a.get("delta_pct", 0)
            out.write(f"  {a['name']:<48} {b_ms_a:>10.2f} {c_ms_a:>10.2f} {pct_arrow(d_pct_a or 0):>12}\n")
    elif "error" in anchor_result:
        out.write(f"  [SKIP] anchor_compare 不可用: {anchor_result['error']}\n")
    else:
        out.write("  (无 anchor 数据)\n")
    out.write("\n")

    # ==========================================================================
    # [C4] simpleperf Level 3 — 函数级 A/M/D Diff
    # ==========================================================================
    out.write("【C4】simpleperf — 函数级变化 Top 20（Level 3）\n")
    out.write("  标记: A=新增  M=修改  D=删除(被内联/优化消除)\n")
    out.write(_hr())
    items = func_result.get("items", [])
    if items:
        all_funcs = []
        for thread_item in items:
            anchor_total = thread_item.get("abs_ms") or 1.0
            for f in thread_item.get("functions", []):
                f["_anchor_total"] = anchor_total
                all_funcs.append(f)
        all_funcs.sort(key=lambda x: abs(x["delta_ms"]), reverse=True)
        out.write(f"  {'标记':<4} {'函数名':<52} {'delta_ms':>10} {'delta_pct':>10} {'注记'}\n")
        out.write(f"  {'-'*4} {'-'*52} {'-'*10} {'-'*10} {'-'*12}\n")
        for f in all_funcs[:20]:
            inl = "[maybe_inlined]" if f.get("maybe_inlined") else ""
            d_pct_str = f"{f['delta_pct']:+.2f}%" if f.get("delta_pct") is not None else "N/A"
            out.write(f"  [{f['mask']:<2}] {f['func'][:52]:<52} {f['delta_ms']:>10.2f} {d_pct_str:>10} {inl}\n")
    else:
        out.write(func_result.get("text", "  (无函数级差异数据)\n"))
    out.write("\n")

    # ==========================================================================
    # [D] perfetto 线程调度
    # ==========================================================================
    out.write("【D】perfetto — 线程调度分布对比\n")
    out.write(_hr())

    def fmt_perf_sched(perf: dict, label: str):
        if not perf or perf.get("parse_status") in ("failed", "skipped"):
            return f"  {label}: {perf.get('parse_notes', '不可用') if perf else '不可用'}\n"
        lines = []
        run = perf.get("main_thread_running_pct")
        rbl = perf.get("main_thread_runnable_pct")
        slp = perf.get("main_thread_sleeping_pct")
        if run is not None:
            lines.append(f"  {label} UnityMain: Running={run}%  Runnable={rbl}%  Sleeping={slp}%")
        wt = perf.get("worker_threads_sched", {})
        for tname, s in list(wt.items())[:5]:
            lines.append(f"  {label} {tname}(x{s['count']}): Running={s['running_pct']}%  Runnable={s['runnable_pct']}%  Sleeping={s['sleeping_pct']}%")
        return "\n".join(lines) + "\n" if lines else f"  {label}: (无调度数据)\n"

    out.write(fmt_perf_sched(base_perf, "base"))
    out.write(fmt_perf_sched(opt_perf,  "opt "))

    # 对比 UnityMain Running 占比
    b_run = base_perf.get("main_thread_running_pct") if base_perf else None
    o_run = opt_perf.get("main_thread_running_pct")  if opt_perf  else None
    if b_run is not None and o_run is not None:
        delta_run = o_run - b_run
        out.write(f"  → UnityMain Running 占比变化: {delta_run:+.2f}pp  "
                  f"{'(↓ CPU 压力降低 ✓)' if delta_run < -1 else '(↑ CPU 压力升高 !)' if delta_run > 1 else '(持平)'}\n")
    out.write("\n")

    # ==========================================================================
    # [E] perfetto Unity atrace slice
    # ==========================================================================
    out.write("【E】perfetto — Unity atrace 关键 Slice 帧均时长\n")
    out.write(_hr())

    def get_slice_stats(perf: dict, name: str):
        slices = perf.get("unity_slices", {}) if perf else {}
        return slices.get(name, {})

    base_slices = base_perf.get("unity_slices", {}) if base_perf else {}
    opt_slices  = opt_perf.get("unity_slices",  {}) if opt_perf  else {}
    all_slice_names = sorted(set(base_slices) | set(opt_slices))

    if all_slice_names:
        out.write(f"  {'Slice 名':<40} {'base avg(ms)':>13} {'opt avg(ms)':>13} {'变化':>12}\n")
        out.write(f"  {'-'*40} {'-'*13} {'-'*13} {'-'*12}\n")
        for sname in all_slice_names:
            bs = base_slices.get(sname, {})
            os_ = opt_slices.get(sname, {})
            b_avg = bs.get("avg_ms", 0.0)
            o_avg = os_.get("avg_ms", 0.0)
            if b_avg < 0.1 and o_avg < 0.1:
                continue
            d = (o_avg - b_avg) / b_avg * 100 if b_avg else 0
            out.write(f"  {sname:<40} {b_avg:>13.3f} {o_avg:>13.3f} {pct_arrow(d):>12}\n")
    else:
        out.write("  (perfetto slice 数据不可用)\n")
    out.write("\n")

    # ==========================================================================
    # [F] perfetto 帧时长
    # ==========================================================================
    out.write("【F】perfetto — Choreographer 帧时长分布\n")
    out.write(_hr())

    def fmt_frame_row(label, field, b_val, o_val):
        if b_val is None and o_val is None:
            return ""
        b_s = f"{b_val:.2f}ms" if b_val is not None else "N/A"
        o_s = f"{o_val:.2f}ms" if o_val is not None else "N/A"
        d_s = pct_arrow((o_val - b_val) / b_val * 100) if b_val and o_val else "N/A"
        return f"  {label:<32} {b_s:>12} {o_s:>12} {d_s:>12}\n"

    b_cnt = base_perf.get("frame_count") if base_perf else None
    o_cnt = opt_perf.get("frame_count")  if opt_perf  else None
    if b_cnt or o_cnt:
        out.write(f"  {'帧数（Choreographer 计）':<32} {str(b_cnt) if b_cnt else 'N/A':>12} {str(o_cnt) if o_cnt else 'N/A':>12}\n")

    out.write(fmt_frame_row("帧时长 P50 (Choreographer)",  "frame_p50_ms",
                             base_perf.get("frame_p50_ms") if base_perf else None,
                             opt_perf.get("frame_p50_ms")  if opt_perf  else None))
    out.write(fmt_frame_row("帧时长 P95 (Choreographer)",  "frame_p95_ms",
                             base_perf.get("frame_p95_ms") if base_perf else None,
                             opt_perf.get("frame_p95_ms")  if opt_perf  else None))
    out.write(fmt_frame_row("帧时长 P99 (Choreographer)",  "frame_p99_ms",
                             base_perf.get("frame_p99_ms") if base_perf else None,
                             opt_perf.get("frame_p99_ms")  if opt_perf  else None))

    b_gpu = base_perf.get("gpu_busy_pct") if base_perf else None
    o_gpu = opt_perf.get("gpu_busy_pct")  if opt_perf  else None
    if b_gpu is not None or o_gpu is not None:
        out.write(fmt_frame_row("GPU 忙碌占比 (%)",  "gpu_busy_pct", b_gpu, o_gpu))
        if b_gpu and b_gpu > 85:
            out.write("  ⚠ GPU 利用率 >85%，可能存在 GPU 瓶颈，CPU 优化收益会被稀释\n")

    b_gfreq = base_perf.get("gpu_freq_avg_mhz") if base_perf else None
    o_gfreq = opt_perf.get("gpu_freq_avg_mhz")  if opt_perf  else None
    if b_gfreq is not None or o_gfreq is not None:
        out.write(fmt_frame_row("GPU 平均频率 (MHz)", "gpu_freq_avg_mhz", b_gfreq, o_gfreq))

    b_cfreq = base_perf.get("cpu_freq_avg_mhz") if base_perf else None
    o_cfreq = opt_perf.get("cpu_freq_avg_mhz")  if opt_perf  else None
    if b_cfreq is not None or o_cfreq is not None:
        out.write(fmt_frame_row("CPU 平均频率 (MHz)", "cpu_freq_avg_mhz", b_cfreq, o_cfreq))

    out.write("\n")

    # ==========================================================================
    # [G] Unity Profiler .pdata 对比
    # ==========================================================================
    out.write("【G】Unity Profiler .pdata — 帧均 Marker 对比\n")
    out.write(_hr())
    if base_pdata_stats is not None and opt_pdata_stats is not None:
        cmp = compare_pdata(base_pdata_stats, opt_pdata_stats)

        # 帧级
        fc = cmp["frame"]
        out.write(f"  {'指标':<36} {'base':>12} {'opt':>12}  {'变化':>14}\n")
        out.write(f"  {'-'*36} {'-'*12} {'-'*12}  {'-'*14}\n")
        out.write(f"  {'帧数':<36} {fc['base_frame_count']:>12d} {fc['opt_frame_count']:>12d}\n")
        out.write(f"  {'帧率均值 (fps)':<36} {fc['base_fps_mean']:>12.1f} {fc['opt_fps_mean']:>12.1f}  {pct_arrow(fc['fps_delta_pct'] or 0):>14}\n")
        out.write(f"  {'帧时长 P50 (ms)':<36} {fc['base_p50_ms']:>12.3f} {fc['opt_p50_ms']:>12.3f}  {pct_arrow(fc['frame_p50_delta_pct'] or 0):>14}\n")
        out.write(f"  {'帧时长 P95 (ms)':<36} {fc['base_p95_ms']:>12.3f} {fc['opt_p95_ms']:>12.3f}  {pct_arrow(fc['frame_p95_delta_pct'] or 0):>14}\n")
        out.write(f"  {'帧时长 P99 (ms)':<36} {fc['base_p99_ms']:>12.3f} {fc['opt_p99_ms']:>12.3f}  {pct_arrow(fc['frame_p99_delta_pct'] or 0):>14}\n")
        out.write("\n")

        # Marker 对比（主线程）
        out.write(f"  {'Marker 名':<40} {'base(ms)':>10} {'opt(ms)':>10} {'变化':>12}\n")
        out.write(f"  {'-'*40} {'-'*10} {'-'*10} {'-'*12}\n")
        for m in cmp["markers"]:
            d = m["delta_pct"]
            d_str = pct_arrow(d) if d is not None else "N/A"
            out.write(f"  {m['name']:<40} {m['base_mean_ms']:>10.3f} {m['opt_mean_ms']:>10.3f} {d_str:>12}\n")
            if m["base_p95_ms"] > 1.0:
                out.write(f"  {'  P95':>40} {m['base_p95_ms']:>10.3f} {m['opt_p95_ms']:>10.3f}\n")
        out.write("\n")

        # 线程对比
        if cmp["threads"]:
            out.write(f"  {'线程名':<36} {'base(ms)':>10} {'opt(ms)':>10} {'变化':>12}\n")
            out.write(f"  {'-'*36} {'-'*10} {'-'*10} {'-'*12}\n")
            for t in cmp["threads"]:
                d = t["delta_pct"]
                d_str = pct_arrow(d) if d is not None else "N/A"
                out.write(f"  {t['name']:<36} {t['base_mean_ms']:>10.3f} {t['opt_mean_ms']:>10.3f} {d_str:>12}\n")
        out.write("\n")

    elif base_pdata_stats is not None or opt_pdata_stats is not None:
        stats = base_pdata_stats or opt_pdata_stats
        label = "base" if base_pdata_stats else "opt"
        out.write(f"  仅有 {label} 的 pdata 数据，无法对比\n")
        out.write(f"  {label} 帧数={stats.frame_count}  P50={stats.frame_ms_median:.3f}ms  P95={stats.frame_ms_p95:.3f}ms\n\n")
    else:
        out.write("  pdata 文件未找到或解析失败。请确认 .pdata 文件位于采样目录下。\n\n")

    # ==========================================================================
    # [H] 三维交叉验证 + 结论
    # ==========================================================================
    out.write("【H】交叉验证 + 综合结论\n")
    out.write(_hr())

    # 收集各维度的方向信号
    signals = []

    # simpleperf il2cpp
    if d_pp is not None:
        if d_pp < -1.0:
            signals.append(("simpleperf il2cpp CPU 占比", "正向", f"↓{abs(d_pp):.2f}pp"))
        elif d_pp < 0:
            signals.append(("simpleperf il2cpp CPU 占比", "弱正向", f"↓{abs(d_pp):.2f}pp"))
        else:
            signals.append(("simpleperf il2cpp CPU 占比", "负向/无效", f"{d_pp:+.2f}pp"))

    # perfetto 帧时长
    b_p95 = base_perf.get("frame_p95_ms") if base_perf else None
    o_p95 = opt_perf.get("frame_p95_ms")  if opt_perf  else None
    if b_p95 and o_p95:
        d_f = (o_p95 - b_p95) / b_p95 * 100
        if d_f < -2:
            signals.append(("perfetto 帧时长 P95", "正向", f"↓{abs(d_f):.1f}%"))
        elif d_f > 2:
            signals.append(("perfetto 帧时长 P95", "负向", f"↑{d_f:.1f}%"))
        else:
            signals.append(("perfetto 帧时长 P95", "持平", f"{d_f:+.1f}%"))

    # pdata Scripting
    if base_pdata_stats and opt_pdata_stats:
        for mname in ["ScriptRunBehaviourUpdate", "BehaviourUpdate"]:
            b_s = base_pdata_stats.markers.get(mname)
            o_s = opt_pdata_stats.markers.get(mname)
            if b_s and o_s and b_s.ms_mean > 0.5:
                d_s = (o_s.ms_mean - b_s.ms_mean) / b_s.ms_mean * 100
                if d_s < -2:
                    signals.append((f"pdata {mname}", "正向", f"↓{abs(d_s):.1f}%"))
                elif d_s > 2:
                    signals.append((f"pdata {mname}", "负向", f"↑{d_s:.1f}%"))
                else:
                    signals.append((f"pdata {mname}", "持平", f"{d_s:+.1f}%"))
                break

    # 输出信号汇总
    out.write("  交叉信号汇总：\n")
    pos_count = 0
    neg_count = 0
    for source, direction, value in signals:
        icon = "✓" if "正向" in direction else ("!" if "负向" in direction else "≈")
        out.write(f"  {icon} {source:<40} {direction:<8} {value}\n")
        if "正向" in direction:
            pos_count += 1
        elif "负向" in direction:
            neg_count += 1

    out.write("\n")

    # 置信度判断
    total_signals = len(signals)
    if total_signals == 0:
        confidence = "不可评估（数据不足）"
    elif pos_count == total_signals:
        confidence = "高置信度（所有维度方向一致，优化有效）"
    elif pos_count >= total_signals * 0.6:
        confidence = "中置信度（多数维度正向，优化基本有效）"
    elif neg_count > pos_count:
        confidence = "低置信度（多维度负向，请检查优化是否生效）"
    else:
        confidence = "低置信度（方向不一致，场景可能不稳定）"

    out.write(f"  置信度评估：{confidence}\n\n")

    # il2cpp 结论
    if d_pp is not None:
        if d_pp < -1.0:
            out.write(f"  ✓ il2cpp CPU 消耗下降 {abs(d_pp):.2f}pp，Maple ILOpt 优化收益显著\n")
        elif d_pp < 0:
            out.write(f"  ✓ il2cpp CPU 消耗下降 {abs(d_pp):.2f}pp，有一定收益\n")
        else:
            out.write(f"  ! il2cpp CPU 消耗无明显下降（Δ={d_pp:+.2f}pp），请检查 opt 包是否正确\n")

    # 函数级
    del_count = sum(1 for it in items for f in it.get("functions", []) if f["mask"] == "D")
    inl_count = sum(1 for it in items for f in it.get("functions", []) if f.get("maybe_inlined"))
    if del_count > 0:
        out.write(f"  ✓ {del_count} 个虚函数调用路径被 Maple 消除（D 标记）\n")
    if inl_count > 0:
        out.write(f"  ✓ {inl_count} 个函数被内联（maybe_inlined，self_time ≈ 0）\n")

    # GPU 瓶颈提示
    if b_gpu and b_gpu > 85:
        out.write(f"  ⚠ base GPU 忙碌率 {b_gpu:.1f}%，存在 GPU 瓶颈，CPU 优化部分被掩盖\n")

    out.write("\n  建议优化方向：\n")
    # 从热点函数分析优化方向
    if hotspot_compare:
        # 找出增加幅度最大的热点（需要关注）
        regressions = [r for r in hotspot_compare if r["delta_pct"] is not None and r["delta_pct"] > 10 and r["base_ms"] > 1.0]
        if regressions:
            out.write(f"  - 以下函数在 opt 中耗时增加，需关注是否回归：\n")
            for r in regressions[:3]:
                out.write(f"    {r['func'][:60]} ({r['lib']}) base={r['base_ms']:.2f}ms opt={r['opt_ms']:.2f}ms (+{r['delta_pct']:.1f}%)\n")
        # 耗时最大的函数（性能优化方向）
        top3 = [r for r in hotspot_compare[:5] if r["base_ms"] > 2.0 and r["delta_pct"] is not None and r["delta_pct"] >= -5]
        if top3:
            out.write(f"  - UnityMain 耗时前列函数（进一步优化目标）：\n")
            for r in top3[:3]:
                out.write(f"    {r['func'][:60]} ({r['lib']}) {r['base_ms']:.2f}ms\n")

    out.write("\n")

    return out.getvalue()


# ---------------------------------------------------------------------------
# il2cpp 统计提取
# ---------------------------------------------------------------------------
def extract_il2cpp_stats(so_result, frame_count_base, frame_count_opt):
    stats = {
        "base_pct": None, "opt_pct": None,
        "base_total_event": None, "opt_total_event": None,
        "delta_pp": None,
    }
    for thread in so_result.get("threads", []):
        if TARGET_THREAD not in thread["name"]:
            continue
        b_total = thread["baseline_total_event"]
        c_total = thread["current_total_event"]
        for lib in thread.get("libs", []):
            if "libil2cpp" in lib["name"]:
                stats["base_pct"] = lib["baseline_pct"]
                stats["opt_pct"]  = lib["current_pct"]
                stats["delta_pp"] = lib["delta_pct"]
                scale = 1_000_000.0
                stats["base_total_event"] = b_total * lib["baseline_pct"] / 100.0 if b_total else None
                stats["opt_total_event"]  = c_total * lib["current_pct"] / 100.0 if c_total else None
                if stats["base_total_event"]:
                    stats["base_ms"] = stats["base_total_event"] / scale
                if stats["opt_total_event"]:
                    stats["opt_ms"] = stats["opt_total_event"] / scale
                if frame_count_base and stats.get("base_ms"):
                    stats["base_ms_per_frame"] = stats["base_ms"] / frame_count_base
                if frame_count_opt and stats.get("opt_ms"):
                    stats["opt_ms_per_frame"] = stats["opt_ms"] / frame_count_opt
    return stats


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Maple ILOpt 性能对比分析（多维度增强版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--base", required=True,
                        help="base 版本采样目录（支持通配符）")
    parser.add_argument("--opt",  required=True,
                        help="opt 版本采样目录（支持通配符）")
    parser.add_argument("--out",  default=None,
                        help="报告输出路径（默认：<opt_dir>/maple_report.txt）")
    args = parser.parse_args()

    base_dirs = resolve_run_dirs(args.base)
    opt_dirs  = resolve_run_dirs(args.opt)
    print(f"[INFO] base 采样目录: {len(base_dirs)} 个: {base_dirs}")
    print(f"[INFO] opt  采样目录: {len(opt_dirs)} 个: {opt_dirs}")

    base_metas = [load_meta(d) for d in base_dirs]
    opt_metas  = [load_meta(d) for d in opt_dirs]

    base_fc = int(avg([m["frame_count"] for m in base_metas if m.get("frame_count")])) or None
    opt_fc  = int(avg([m["frame_count"] for m in opt_metas  if m.get("frame_count")])) or None

    # 查找数据文件
    base_perf_files = [f for d in base_dirs if (f := find_perf_data(d))]
    opt_perf_files  = [f for d in opt_dirs  if (f := find_perf_data(d))]
    base_pdata_path = find_pdata(base_dirs[0])
    opt_pdata_path  = find_pdata(opt_dirs[0])
    base_pftrace    = find_pftrace(base_dirs[0])
    opt_pftrace     = find_pftrace(opt_dirs[0])

    print(f"[INFO] base pftrace : {base_pftrace}")
    print(f"[INFO] opt  pftrace : {opt_pftrace}")
    print(f"[INFO] base pdata   : {base_pdata_path}")
    print(f"[INFO] opt  pdata   : {opt_pdata_path}")

    if not base_perf_files:
        print("[ERROR] 未找到 base 的 perf.data")
        sys.exit(1)
    if not opt_perf_files:
        print("[ERROR] 未找到 opt 的 perf.data")
        sys.exit(1)

    base_meta0 = base_metas[0] if base_metas else {}
    opt_meta0  = opt_metas[0]  if opt_metas  else {}

    base_ts_start, base_ts_end = _get_time_window(base_meta0)
    opt_ts_start,  opt_ts_end  = _get_time_window(opt_meta0)
    if base_ts_start:
        print(f"[INFO] base mono_ns 窗口: {base_ts_start} - {base_ts_end}")
    if opt_ts_start:
        print(f"[INFO] opt  mono_ns 窗口: {opt_ts_start} - {opt_ts_end}")

    print(f"[INFO] 加载 base perf.data: {base_perf_files[0]}")
    base_bc = os.path.join(os.path.dirname(base_perf_files[0]), "binary_cache")
    base_profile = load_profile(
        base_perf_files[0],
        binary_cache=base_bc if os.path.isdir(base_bc) else None,
        label=base_meta0.get("label", "base"),
        time_start_ns=base_ts_start,
        time_end_ns=base_ts_end,
    )

    print(f"[INFO] 加载 opt  perf.data: {opt_perf_files[0]}")
    opt_bc = os.path.join(os.path.dirname(opt_perf_files[0]), "binary_cache")
    opt_profile = load_profile(
        opt_perf_files[0],
        binary_cache=opt_bc if os.path.isdir(opt_bc) else None,
        label=opt_meta0.get("label", "opt"),
        time_start_ns=opt_ts_start,
        time_end_ns=opt_ts_end,
    )

    # simpleperf 分析
    print("[INFO] 运行 Level 1 So 对比...")
    so_result = so_compare.compare(base_profile, opt_profile, min_pct=0.3)
    il2cpp_stats = extract_il2cpp_stats(so_result, base_fc, opt_fc)

    print("[INFO] 提取主线程热点函数...")
    base_hotspots = analyze_main_thread_hotspots(base_profile)
    opt_hotspots  = analyze_main_thread_hotspots(opt_profile)
    hotspot_cmp   = compare_main_thread_hotspots(base_hotspots, opt_hotspots)

    print("[INFO] 提取 Worker/Job 线程负载...")
    base_all_threads = collect_all_thread_so(base_profile)
    opt_all_threads  = collect_all_thread_so(opt_profile)
    worker_cmp       = compare_worker_threads(base_all_threads, opt_all_threads)

    print("[INFO] 运行 Level 2 Anchor 对比...")
    anchor_result = anchor_compare.compare(base_profile, opt_profile, anchors=ANCHOR_FUNCS)
    try:
        anchor_result = anchor_compare.compare(base_profile, opt_profile, anchors=ANCHOR_FUNCS)
    except Exception as e:
        anchor_result = {"error": str(e), "anchors": []}

    print("[INFO] 运行 Level 3 函数级 Diff...")
    try:
        func_result = func_compare.compare(base_profile, opt_profile)
    except Exception as e:
        func_result = {"items": [], "text": f"  [SKIP] func_compare 失败: {e}\n"}

    # perfetto 分析
    # atrace 色块名 = CombinedProfile_<profile_name>，查找时用 LIKE 前缀匹配
    raw_profile_name = base_meta0.get("profile_name", "")
    perf_prefix_base = f"CombinedProfile_{raw_profile_name}" if raw_profile_name else "CombinedProfile"
    print(f"[INFO] 解析 base perfetto trace (prefix={perf_prefix_base})...")
    base_perf = run_perfetto_analyzer(base_pftrace, perf_prefix_base)

    raw_opt_profile_name = opt_meta0.get("profile_name", "")
    perf_prefix_opt = f"CombinedProfile_{raw_opt_profile_name}" if raw_opt_profile_name else "CombinedProfile"
    print(f"[INFO] 解析 opt  perfetto trace (prefix={perf_prefix_opt})...")
    opt_perf  = run_perfetto_analyzer(opt_pftrace, perf_prefix_opt)

    if base_perf.get("parse_status") == "skipped":
        print(f"[WARN] base perfetto: {base_perf['parse_notes']}")
    else:
        print(f"[INFO] base perfetto 解析: {base_perf.get('parse_status')} | 帧数={base_perf.get('frame_count')} | P95={base_perf.get('frame_p95_ms')}ms")
    if opt_perf.get("parse_status") == "skipped":
        print(f"[WARN] opt  perfetto: {opt_perf['parse_notes']}")
    else:
        print(f"[INFO] opt  perfetto 解析: {opt_perf.get('parse_status')} | 帧数={opt_perf.get('frame_count')} | P95={opt_perf.get('frame_p95_ms')}ms")

    # pdata 分析
    print("[INFO] 解析 Unity Profiler .pdata...")
    base_pdata_stats = run_pdata_analysis(base_pdata_path)
    opt_pdata_stats  = run_pdata_analysis(opt_pdata_path)
    if base_pdata_stats:
        print(f"[INFO] base pdata: 帧数={base_pdata_stats.frame_count}  P50={base_pdata_stats.frame_ms_median:.2f}ms  P95={base_pdata_stats.frame_ms_p95:.2f}ms")
    if opt_pdata_stats:
        print(f"[INFO] opt  pdata: 帧数={opt_pdata_stats.frame_count}  P50={opt_pdata_stats.frame_ms_median:.2f}ms  P95={opt_pdata_stats.frame_ms_p95:.2f}ms")

    # 生成报告
    report_text = format_report(
        base_dirs, opt_dirs,
        base_metas, opt_metas,
        so_result, il2cpp_stats, anchor_result, func_result,
        base_hotspots, opt_hotspots, hotspot_cmp,
        worker_cmp,
        base_perf, opt_perf,
        base_pdata_stats, opt_pdata_stats,
    )

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    try:
        print("\n" + report_text)
    except Exception:
        pass

    out_path = args.out or os.path.join(opt_dirs[0], "maple_report.txt")
    reporter.write_text(report_text, out_path)
    print(f"[OK] 报告已保存: {out_path}")

    # JSON 输出（供 web 界面使用）
    json_path = out_path.replace(".txt", ".json")
    full_result = {
        "meta": {
            "base":   base_meta0.get("label", "base"),
            "opt":    opt_meta0.get("label", "opt"),
            "device": base_meta0.get("device", "?"),
            "scene":  base_meta0.get("scene", "?"),
        },
        "il2cpp_stats": il2cpp_stats,
        "level1_so_compare": so_result,
        "level2_anchor_compare": anchor_result,
        "level3_func_diff": {"items": func_result.get("items", [])},
        "main_thread_hotspots": {"base": base_hotspots, "opt": opt_hotspots, "compare": hotspot_cmp},
        "worker_threads": worker_cmp,
        "perfetto": {"base": base_perf, "opt": opt_perf},
        "pdata": {
            "base": {
                "frame_count":      base_pdata_stats.frame_count if base_pdata_stats else None,
                "frame_ms_median":  base_pdata_stats.frame_ms_median if base_pdata_stats else None,
                "frame_ms_p95":     base_pdata_stats.frame_ms_p95 if base_pdata_stats else None,
                "markers": {
                    n: {"ms_mean": round(m.ms_mean, 3), "ms_p95": round(m.ms_p95, 3)}
                    for n, m in (base_pdata_stats.markers.items() if base_pdata_stats else {})
                },
            } if base_pdata_stats else None,
            "opt": {
                "frame_count":      opt_pdata_stats.frame_count if opt_pdata_stats else None,
                "frame_ms_median":  opt_pdata_stats.frame_ms_median if opt_pdata_stats else None,
                "frame_ms_p95":     opt_pdata_stats.frame_ms_p95 if opt_pdata_stats else None,
                "markers": {
                    n: {"ms_mean": round(m.ms_mean, 3), "ms_p95": round(m.ms_p95, 3)}
                    for n, m in (opt_pdata_stats.markers.items() if opt_pdata_stats else {})
                },
            } if opt_pdata_stats else None,
        },
        "frame_counts": {"base": base_fc, "opt": opt_fc},
    }

    def _default(o):
        try:
            import dataclasses
            return dataclasses.asdict(o)
        except Exception:
            return str(o)

    reporter.write_json(full_result, json_path)
    print(f"[OK] JSON 已保存: {json_path}")


if __name__ == "__main__":
    main()
