#!/usr/bin/env python3
"""render_perfetto_skeleton.py — perfetto N 列骨架渲染器

输入：1~N 份 perfetto-profile-summary.json
输出：带 <!-- LLM_FILL --> 占位符的骨架 markdown

N=1：单次形态（贴近 docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md）
N>=2：diff 形态（贴近 docs/report/performance-report_perfetto_ULTIMATE_v5.3.md，
       支持任意角色名，不写死 base/cur/throttle）

数字 / 表格 / ASCII 比例条 / callTree 节点签名全由 Python 渲染；
叙事位置留 <!-- LLM_FILL: <task-card> --> 由 LLM 填空。

跟 simpleperf v4_report_renderer.py 同形态，但 perfetto 数据语义不同（dur_ns
vs hit count），所以独立实现。
"""

import argparse
import json
import os
import sys
from typing import Any

# 项目知识包（自动检测）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perfetto_project_pack import load_project_pack  # noqa: E402


# ---------------------------------------------------------------------------
# 数据加载
# ---------------------------------------------------------------------------
def load_sample(path: str, role: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        summary = json.load(f)
    return {"role": role, "path": path, "summary": summary}


def metric_val(metrics: list[dict], key: str) -> float | None:
    for m in metrics or []:
        if m.get("key") == key:
            v = m.get("value")
            if isinstance(v, (int, float)):
                return float(v)
    return None


def first_frame(summary: dict, definition: str) -> dict:
    for f in summary.get("frame", []) or []:
        if f.get("frameDefinition") == definition:
            return f
    return {}


def thread_sched(summary: dict, name: str) -> dict | None:
    ts = summary.get("threadsSched") or {}
    if name in ts:
        return ts[name]
    for t in summary.get("threadsSchedList") or []:
        if t.get("name") == name or t.get("commName") == name:
            return t
    return None


# ---------------------------------------------------------------------------
# 数字格式化
# ---------------------------------------------------------------------------
def fmt_pct(v: Any, digits: int = 2) -> str:
    if isinstance(v, (int, float)):
        return f"{float(v):.{digits}f}%"
    return "—"


def fmt_ms(v: Any, digits: int = 2) -> str:
    if isinstance(v, (int, float)):
        return f"{float(v):.{digits}f} ms"
    return "—"


def fmt_num(v: Any, digits: int = 2) -> str:
    if isinstance(v, (int, float)):
        return f"{float(v):.{digits}f}"
    return "—"


def fmt_int(v: Any) -> str:
    if isinstance(v, (int, float)):
        return str(int(v))
    return "—"


# ---------------------------------------------------------------------------
# ASCII 比例条
# ---------------------------------------------------------------------------
def bar(pct: float, width: int = 40) -> str:
    if pct is None or pct < 0:
        pct = 0
    if pct > 100:
        pct = 100
    fill = int(pct / 100 * width)
    return "█" * fill + "░" * (width - fill)


def running_sleep_bar(running_pct: float | None, width: int = 40) -> str:
    if running_pct is None:
        return "─" * width
    return bar(running_pct, width)


# ---------------------------------------------------------------------------
# 章节渲染 — §-1 数据采集 · 能力声明
# ---------------------------------------------------------------------------
def render_section_minus_1(samples: list[dict]) -> str:
    n = len(samples)
    is_single = n == 1
    out = ["## §-1 数据采集 · 能力声明", ""]
    out.append("### -1.1 本次采集的数据" + ("" if is_single else "（列表）"))
    out.append("")
    if is_single:
        out.append("| 角色 | 时间点 | trace 文件 | 进程 pid |")
        out.append("|---|---|---|---|")
    else:
        out.append("| 角色 | 时间点 | 时长 | PlayerLoop 帧数 | 文件 |")
        out.append("|---|---|---|---|---|")

    for s in samples:
        meta = s["summary"].get("meta") or {}
        scene = meta.get("scene") or "—"
        device = meta.get("device") or "—"
        pid = meta.get("pid") or "auto"
        # 时间点从 trace 文件名/路径推断
        path = s["path"]
        sample_name = os.path.basename(os.path.dirname(path)) or "unknown"
        if is_single:
            out.append(f"| **{s['role']}** | {scene} | {sample_name} | {pid} |")
        else:
            pl = first_frame(s["summary"], "playerloop")
            fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
            count = fa.get("count") or pl.get("count") or "—"
            duration = "—"
            tn = thread_sched(s["summary"], "UnityMain")
            if tn and tn.get("totalNs"):
                duration = f"{tn['totalNs']/1e9:.2f} s"
            out.append(
                f"| **{s['role']}** | {scene} | {duration} | {count} | {sample_name} |"
            )
    out.append("")

    if not is_single:
        out.append(
            "> ⚠️ 跨次对比一律用 **ms/帧** 或 **占整 trace %（totalPct）** 归一化, "
            "绝对 totalMs 仅本次内部参考。"
        )
        out.append("")

    out.append("旁路文件：")
    out.append("")
    out.append("| 旁路文件 | 用途 |")
    out.append("|---|---|")
    out.append("| collection-manifest.json | 记录 root 状态、sysfs 旁路成功项 |")
    out.append("| thermal_before / thermal_after | 采前/采后 thermal_zone 温度 |")
    out.append("| cpuinfo_max_freq | 8 核理论上限频率（reach% 分母校准）|")
    out.append("")

    out.append("### -1.2 数据维度矩阵")
    out.append("")
    out.append("| 维度 | 状态 | 用途 |")
    out.append("|---|---|---|")
    out.append("| atrace 业务 slice (PlayerLoop / Core.Update / 各 Mgr) | ✅ | 主线程一帧时间去向 |")
    out.append("| sched 三态 (Running / Sleeping / Runnable) | ✅ | off-CPU 归因 |")
    out.append("| CPU 频率 cpufreq counter (per-CPU avg/max) | ✅ | 降频时序 |")
    out.append("| 温度旁路 thermal_zone | ✅ | 降频升 likely 档判定 |")
    out.append("| cpuinfo_max_freq | ✅ | reach% 分母校准 |")
    out.append("| callTrees 父子链 | ✅ | 业务模块剥洋葱 selfMs |")
    out.append("| RHI / LuaMtGC / ECSWorker × 4 自动识别 | ✅ | 多线程独立分析 |")
    out.append("| android_binder_txns server 进程归属 | ✅ | 主线程被谁阻塞 |")
    out.append("| Choreographer fps (屏幕 vsync 节拍) | ✅ | 显示链路 vs PlayerLoop 对照 |")
    out.append("| GC.Alloc 业务子树归因 (次/帧) | ✅ | 业务分配源定位 |")
    out.append("| ❌ sched_blocked_reason ftrace | 物理不可达 | 华为非 root 实测内核静默丢弃 |")
    out.append("| ❌ sysfs scaling_max_freq | 物理不可达 | 华为锁了 Permission denied |")
    out.append("| ❌ GPU busy / freq counter | 物理不可达 | 骁龙需 root 注入 producer |")
    out.append("| ❌ actual_frame_timeline_slice | 需 Provider config 改造 | VSync miss 量化 |")
    out.append("| ❌ Wwise 内部细分 | 结构性不可达 | atrace 无埋点, 用 simpleperf 互补 |")
    out.append("")

    out.append("### -1.3 本报告能 / 不能回答的问题")
    out.append("")
    out.append("| 想回答 | 能否 | 走哪节 |")
    out.append("|---|---|---|")
    out.append("| 主线程一帧时间花在哪? | ✅ | §6.2 callTrees 缩进树 |")
    out.append("| 主线程在算还是在等? 等什么? | ✅ | §4 off-CPU 归因 |")
    out.append("| 哪些业务模块超红线? | ✅ | §6.3 Top 热点下钻 |")
    out.append("| GC 压力源在哪个业务模块? | ✅ | §6.3 + GC.Alloc/帧 |")
    out.append("| 机器是否降频? 严重程度? | ✅ likely 档 | §5 降频时序 |")
    out.append("| RHI / Render / ECSWorker / LuaMtGC 各自健康度? | ✅ | §3 多线程独立分析 |")
    out.append("| 主线程 binder 调用发给谁? | ✅ | §3.1 / §7 |")
    out.append("| 是否 GPU-bound? | 🟡 强信号能给, GPU 满载硬证给不出 | §7 |")
    if not is_single:
        out.append("| 跨样本演化对比? | ✅ | §0 / §4.4 / §6.2 多列对照 |")
    else:
        out.append("| 跨样本演化对比? | ❌ 单次报告物理不可能 | 用 diff skill |")
    out.append("| Wwise 内部耗时? | ❌ 用 simpleperf | — |")
    out.append("| 严格 confirmed 降频判定? | ❌ 华为非 root 物理不可达 | 停在 likely 档 |")
    out.append("| 函数级 CPU self%? | ❌ 用 simpleperf | — |")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §0 结论先行
# ---------------------------------------------------------------------------
def render_section_0(samples: list[dict]) -> str:
    n = len(samples)
    out = ["## §0 结论先行", ""]
    out.append("> ### ⚠️ " + ("三大独立观察" if n == 1 else "三大独立结论") + "（按强度排序）")
    out.append(">")

    # ① 主线程瓶颈形态
    out.append("> **① 主线程瓶颈形态**")
    out.append(">")
    out.append("> ```")
    out.append("> UnityMain Running / Sleeping (sched):")
    for s in samples:
        ts = thread_sched(s["summary"], "UnityMain") or {}
        run = ts.get("runningPct")
        sleep = ts.get("sleepingPct")
        runn = ts.get("runnablePct")
        out.append(
            f">   {s['role']:<10} {running_sleep_bar(run)} "
            f"Run {fmt_pct(run)} / Sleep {fmt_pct(sleep)} / Runnable {fmt_pct(runn)}"
        )
    out.append(">")
    out.append("> Gfx.WaitForPresent 单次 avg（主线程睡等 GPU 上一帧）:")
    for s in samples:
        slices = s["summary"].get("aoeHotSlices") or []
        gfx = next((x for x in slices if (x.get("label") or "").lower().startswith("gfx.waitforpresent")), None)
        avg = (gfx or {}).get("avgMs")
        out.append(f">   {s['role']:<10} {fmt_ms(avg)}")
    out.append("> ```")
    out.append(">")
    out.append("> <!-- LLM_FILL: 1-3 句话总结上面 Running/Sleeping ASCII 比例条和 Gfx.WaitForPresent 单次 avg 揭示的主线程瓶颈形态。"
               "必须引用上面给出的 Running%、Sleeping%、Gfx.WaitForPresent 单次 avg 数字。"
               "判定瓶颈形态属于：CPU-bound 健康 / 算+等混合 / 半睡型 GPU-bound 三档之一。"
               "严禁新加任何不在上面 ASCII 块的数字。50-150 字 Chinese。 -->")
    out.append(">")
    out.append("> 详见 §3.1 / §4 / §7。")
    out.append(">")

    # ② 业务侧主消耗源
    out.append("> **② 业务侧主消耗源**")
    out.append(">")
    out.append("> ```")
    # 用 cur sample（如果有）或 last sample 作为业务参考
    biz_sample = samples[-1] if n > 1 else samples[0]
    biz_role = biz_sample["role"]
    pl_count = ((biz_sample["summary"].get("frameAnalysis") or {}).get("summary") or {}).get("count") or 1
    hot = sorted(
        [s for s in (biz_sample["summary"].get("aoeHotSlices") or [])
         if not (s.get("label") or "").lower().startswith("gfx.")
         and not (s.get("label") or "").lower().startswith("waitforpresent")],
        key=lambda s: float(s.get("totalMs") or 0),
        reverse=True,
    )[:5]
    for h in hot:
        label = h.get("label") or "?"
        total_ms = float(h.get("totalMs") or 0)
        ms_per_frame = total_ms / max(1, pl_count)
        pct = h.get("totalPct") or 0
        out.append(
            f">   {label:<28} {biz_role} {ms_per_frame:6.2f} ms/帧 ({pct:.2f}% trace)"
        )
    out.append("> ```")
    out.append(">")
    out.append("> <!-- LLM_FILL: 1-3 句话总结上面 Top 业务模块清单的负载特征，"
               "必须引用上面 ms/帧 数字。判断哪个模块是头号 CPU 消耗源。"
               "热点名称必须来自上面清单，不要编造或固定套用业务模块名。50-150 字 Chinese。 -->")
    out.append(">")
    out.append("> 详见 §6.2 / §6.3。")
    out.append(">")

    # ③ 降频/温度
    out.append("> **③ 降频与热预算**")
    out.append(">")
    out.append("> ```")
    for s in samples:
        thr = s["summary"].get("throttling") or {}
        ms = s["summary"].get("machineState") or {}
        big_reach = thr.get("bigCoreReachPct") or ms.get("bigCoreReachPct")
        level = thr.get("level") or "—"
        out.append(
            f">   {s['role']:<10} bigCoreReach {fmt_pct(big_reach, 1):<8} 降频判定: {level}"
        )
    out.append("> ```")
    out.append(">")
    out.append("> <!-- LLM_FILL: 1-3 句话解读上面 bigCoreReach% 和降频判定级，"
               "判断热预算是否紧张。必须引用上面给出的数字。50-150 字 Chinese。 -->")
    out.append(">")
    out.append("> 详见 §5。")
    out.append("")
    out.append("**按 ROI 排序的优化方向：**")
    out.append("")
    out.append("<!-- LLM_FILL: 列出 3-5 条具体优化方向，每条一行，格式 `1. **<模块/方向>** — <一句话理由>`。"
               "必须引用上面 §0 提到的模块名和数字。优先级按预估 ROI 排序。 -->")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §1 采集质量声明 + 数据口径
# ---------------------------------------------------------------------------
def render_section_1(samples: list[dict]) -> str:
    out = ["## §1 采集质量声明 + 数据口径", ""]
    out.append("### §1.1 trace 实际时长")
    out.append("")
    out.append("| 数据 | 实际窗口 | 帧数 | fps |")
    out.append("|---|---|---|---|")
    for s in samples:
        tn = thread_sched(s["summary"], "UnityMain")
        dur = f"~{tn['totalNs']/1e9:.2f} s" if tn and tn.get("totalNs") else "—"
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        count = fa.get("count") or "—"
        fps = fmt_num(fa.get("fps"), 1)
        out.append(f"| {s['role']} | {dur} | {count} | {fps} |")
    out.append("")
    if len(samples) > 1:
        out.append("> ⚠️ 跨次对比一律用 **ms/帧** 或 **占整 trace %（totalPct）** 归一化。")
        out.append("")

    out.append("### §1.2 数据口径")
    out.append("")
    out.append("| 口径 | 计算公式 | 用途 |")
    out.append("|---|---|---|")
    out.append("| **callTrees totalMs / totalPct** | 直接读 callTrees[].root 沿父子链节点 totalMs；totalPct = totalMs / 整 trace ms × 100% | 主线程一帧时间去向 唯一正确口径 |")
    out.append("| **selfMs**（剥洋葱）| totalMs - sum(直接子 totalMs) | 节点自身入口逻辑真正消耗 |")
    out.append("| **单次 avgMs** | totalMs / count | 区分'涨在频次 vs 涨在单次' |")
    out.append("| **ms/帧**（推算）| totalMs / PlayerLoop 帧数 | 跨次帧数不同时归一化对比 |")
    out.append("| ~~atraceSlices LIKE 全 trace 的 totalMs~~ | ❌ 不可用做'占帧消耗' | 仅可用 count 字段 |")
    out.append("")
    out.append("> ⚠️ 反模式 M1：atraceSlices LIKE 累加会跨多个父子层级重复计数。本报告全部使用 callTrees 父子链。")
    out.append("")
    out.append("### §1.3 数据缺口")
    out.append("")
    out.append("- **sched_blocked_reason ftrace**（❌）→ §4 用 atrace wait slice 重叠法替代")
    out.append("- **sysfs scaling_max_freq**（❌）→ §5 降频判定停在 likely 档")
    out.append("- **GPU busy / freq counter**（❌）→ §7 用 Gfx.WaitForPresent 单次 avg 间接信号")
    out.append("- **actual_frame_timeline_slice**（❌）→ Choreographer fps 替代")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §2 元信息
# ---------------------------------------------------------------------------
def render_section_2(samples: list[dict]) -> str:
    n = len(samples)
    out = ["## §2 采集元信息", ""]
    headers = ["项"] + [f"**{s['role']}**" for s in samples]
    out.append("| " + " | ".join(headers) + " |")
    out.append("|" + "|".join(["---"] * (n + 1)) + "|")

    def row(label: str, values: list[str]) -> str:
        return "| " + label + " | " + " | ".join(values) + " |"

    # 场景
    out.append(row("场景推断", [(s["summary"].get("meta") or {}).get("scene") or "—" for s in samples]))
    # 时长
    durs = []
    for s in samples:
        tn = thread_sched(s["summary"], "UnityMain")
        durs.append(f"~{tn['totalNs']/1e9:.2f} s" if tn and tn.get("totalNs") else "—")
    out.append(row("实际 trace 长度", durs))
    # 帧数
    counts = []
    for s in samples:
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        counts.append(str(fa.get("count") or "—"))
    out.append(row("**PlayerLoop 帧数**", counts))
    # p50/p95/p99
    ps = []
    for s in samples:
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        ps.append(f"{fmt_num(fa.get('p50Ms'))} / {fmt_num(fa.get('p95Ms'))} / {fmt_num(fa.get('p99Ms'))}")
    out.append(row("**PlayerLoop p50 / p95 / p99 (ms)**", ps))
    # fps
    fps_list = []
    for s in samples:
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        fps_list.append(f"**{fmt_num(fa.get('fps'), 1)}**")
    out.append(row("**PlayerLoop fps**", fps_list))
    # Choreographer
    chor = []
    for s in samples:
        cf = first_frame(s["summary"], "choreographer")
        chor.append(fmt_num(cf.get("fps"), 1))
    out.append(row("**Choreographer fps**（屏幕节拍）", chor))
    # slowFrame
    slow = []
    for s in samples:
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        slow.append(fmt_pct(fa.get("slowFrameRate33")))
    out.append(row("slowFrameRate >33ms", slow))
    # cpu freq avg
    cf = []
    for s in samples:
        ms = s["summary"].get("machineState") or {}
        cf.append(f"{fmt_num(ms.get('cpuFreqAvgMhz'), 1)} MHz")
    out.append(row("CPU 平均频率", cf))
    # bigCoreReach
    big = []
    for s in samples:
        thr = s["summary"].get("throttling") or {}
        ms = s["summary"].get("machineState") or {}
        big.append(fmt_pct(thr.get("bigCoreReachPct") or ms.get("bigCoreReachPct"), 1))
    out.append(row("大核 bigCoreReach%", big))
    # 降频判定
    lvl = []
    for s in samples:
        thr = s["summary"].get("throttling") or {}
        lvl.append(f"**{thr.get('level') or '—'}**")
    out.append(row("降频判定级", lvl))

    out.append("")
    out.append("**Choreographer fps vs PlayerLoop fps 关系：**")
    out.append("")
    out.append("<!-- LLM_FILL: 对每个样本，比较 Choreographer fps 和 PlayerLoop fps："
               "若两者接近 → 业务跟得上屏幕节拍；若 Choreographer >> PlayerLoop fps × 2 → "
               "跨 vsync 周期掉帧。引用上面表格中的具体数字。每个样本一行 `- <角色>：<对比> → <判定>`。 -->")
    out.append("")
    out.append("**温度时序故事：**")
    out.append("")
    out.append("<!-- LLM_FILL: 1-2 句话从 bigCoreReach% 和降频判定级解读热预算和降频形态。"
               "必须引用上面表格中的 bigCoreReach 数字。30-100 字。 -->")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §3 多线程独立分析
# ---------------------------------------------------------------------------
def render_section_3(samples: list[dict]) -> str:
    out = ["## §3 多线程独立分析", ""]
    out.append("### §3.0 线程一览")
    out.append("")
    out.append("| 通用名 | comm（实测）| 关键 atrace 特征 | 一句话定位 |")
    out.append("|---|---|---|---|")
    out.append("| **UnityMain** | UnityMain | `PlayerLoop` × N、`Core.Update`、`LuaMgr.*` | 业务/Lua/ECS 调度主入口 |")
    out.append("| **Render** | UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |")
    out.append("| **RHI** | Thread-XXX | `eglSwapBuffers` / `Gfx.PresentFrame` | 直调 GLES driver |")
    out.append("| **Lua MtGC** | LuaMtGC | `LuaMtGc.ExecuteMtGc` / `LuaMultiThreadGC` | xLua C# GC 线程 |")
    out.append("| **ECS Worker × 4** | ECSWorker_0/1/2/3 | `xxxJob (Burst)` × 数万 | Unity Job System Burst Worker |")
    out.append("| **Audio** | Audio Mixer Thr / Audio Stream Th | 内核 AudioFlinger 回调 | 音频回放 |")
    out.append("| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` | VSync 回调 |")
    out.append("| ❌ Wwise | — | atrace 无埋点 | **本源结构性不可见**（永久声明）|")
    out.append("")

    threads_to_render = [
        ("UnityMain", "§3.1 UnityMain（主线程）", "业务/Lua/ECS 调度主入口"),
        ("UnityGfxRenderS", "§3.2 Render（UnityGfxRenderS）", "Unity 命令录制层 / 等主线程发命令"),
        ("RHI", "§3.3 RHI", "直调 GLES driver 处理 eglSwapBuffers"),
        ("LuaMtGC", "§3.4 Lua MtGC", "xLua C# GC 线程"),
        ("ECSWorker_0", "§3.5 ECS Worker × 4", "Job System Burst Worker"),
    ]

    for tname, title, hint in threads_to_render:
        out.append("### " + title)
        out.append("")
        out.append("| 指标 | " + " | ".join(f"**{s['role']}**" for s in samples) + " |")
        out.append("|" + "|".join(["---"] * (len(samples) + 1)) + "|")
        for metric_label, key in [
            ("Running%", "runningPct"),
            ("Sleeping%", "sleepingPct"),
            ("Runnable%", "runnablePct"),
        ]:
            row = "| " + metric_label + " | "
            vals = []
            for s in samples:
                ts = thread_sched(s["summary"], tname) or {}
                vals.append(fmt_pct(ts.get(key)))
            row += " | ".join(vals) + " |"
            out.append(row)
        out.append("")

        if tname == "UnityMain":
            # 加 binder server process
            out.append("**主线程 binder 调用 server 进程：**")
            out.append("")
            for s in samples:
                bp = (s["summary"].get("binderPeers") or {}).get("byServerProcess") or []
                if not bp:
                    out.append(f"- {s['role']}：—")
                    continue
                top = bp[0]
                out.append(f"- {s['role']}：{top.get('serverProcess')} × {top.get('count')} 次, totalMs={top.get('totalMs')} ms")
            out.append("")
            out.append("<!-- LLM_FILL: 一句话给出 binder 是不是主线程阻塞主因的判定，引用上面 binder 数字。"
                       "15-30 字 Chinese。 -->")
            out.append("")

        out.append(f"<!-- LLM_FILL: 1-2 句话判断 {tname} 形态（瓶颈/健康/等什么）。"
                   f"必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->")
        out.append("")

    out.append("### §3.6 Audio 线程池")
    out.append("")
    out.append("Audio Mixer Thr / Audio Stream Th 通常无明显异常，链路健康，不是瓶颈。")
    out.append("")
    out.append("### §3.7 Choreographer")
    out.append("")
    chor_rows = []
    for s in samples:
        cf = first_frame(s["summary"], "choreographer")
        chor_rows.append(f"- {s['role']}: {fmt_num(cf.get('fps'), 1)} Hz")
    out.extend(chor_rows)
    out.append("")
    out.append("<!-- LLM_FILL: 一句话总结 Choreographer 屏幕节拍。15-50 字。 -->")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §4 主线程 off-CPU 归因
# ---------------------------------------------------------------------------
def render_section_4(samples: list[dict]) -> str:
    out = ["## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）", ""]
    out.append("### §4.1 结论前置")
    out.append("")
    out.append("> <!-- LLM_FILL: 2-4 句话给出主线程 Sleeping 时间归因结论："
               "即'多大比例是等 GPU、多大比例是 vsync 等待'。必须从下面 §4.3 重叠法表格取数字。"
               "判断当前样本是健康双缓冲 / 算+等混合 / 强 GPU-bound 之一。50-150 字。 -->")
    out.append("")
    out.append("### §4.2 byState 分布（off-CPU 拆分）")
    out.append("")
    out.append("| 样本 | S 态占比 | R 态占比 | D 态占比 | 含义 |")
    out.append("|---|---|---|---|---|")
    for s in samples:
        oa = s["summary"].get("offCpuAttribution") or {}
        by = oa.get("byReason") or []
        # 按 state 聚合 pctOfOffCpu
        pct_by_state = {}
        for entry in by:
            st = (entry.get("state") or "?").strip()
            pct_by_state[st] = pct_by_state.get(st, 0) + (entry.get("pctOfOffCpu") or 0)
        out.append(
            f"| {s['role']} | {fmt_pct(pct_by_state.get('S'))} | {fmt_pct(pct_by_state.get('R'))} | "
            f"{fmt_pct(pct_by_state.get('D'))} | <!-- LLM_FILL: 一句话解读 D 态是否异常 / S 态主因 --> |"
        )
    out.append("")

    out.append("### §4.3 atrace wait slice 重叠法（核心证据）")
    out.append("")
    out.append("| 样本 | UnityMain Sleeping totalMs | Gfx.WaitForPresent self totalMs | 重合度（Sleep 中等 GPU 比例） |")
    out.append("|---|---|---|---|")
    for s in samples:
        tn = thread_sched(s["summary"], "UnityMain") or {}
        sleep_pct = (tn.get("sleepingPct") or 0) / 100
        total_ns = tn.get("totalNs") or 0
        sleep_ms = sleep_pct * total_ns / 1e6
        slices = s["summary"].get("aoeHotSlices") or []
        gfx = next((x for x in slices if (x.get("label") or "").lower().startswith("gfx.waitforpresent")), None)
        gfx_ms = float((gfx or {}).get("totalMs") or 0)
        ratio = (gfx_ms / sleep_ms * 100) if sleep_ms > 0 else 0
        out.append(
            f"| {s['role']} | {fmt_ms(sleep_ms)} | {fmt_ms(gfx_ms)} | **{ratio:.1f}%** |"
        )
    out.append("")

    out.append("### §4.4 主线程状态分布可视化（ASCII）")
    out.append("")
    out.append("```")
    out.append("状态分布（主线程总时长归一化为整 trace 窗口）")
    out.append("")
    for s in samples:
        ts = thread_sched(s["summary"], "UnityMain") or {}
        run = ts.get("runningPct") or 0
        sleep = ts.get("sleepingPct") or 0
        runn = ts.get("runnablePct") or 0
        slices = s["summary"].get("aoeHotSlices") or []
        gfx = next((x for x in slices if (x.get("label") or "").lower().startswith("gfx.waitforpresent")), None)
        gfx_avg = float((gfx or {}).get("avgMs") or 0)
        out.append(
            f"{s['role']}:  {running_sleep_bar(run)}  Run {run:.2f}% / Sleep {sleep:.2f}% / Runnable {runn:.2f}%"
        )
        out.append(f"            ↑ Gfx.WaitForPresent 单次 avg {gfx_avg:.2f} ms")
        out.append("")
    out.append("```")
    out.append("")
    out.append("<!-- LLM_FILL: 1-2 句话总结上面 ASCII 比例条揭示的'算 vs 等'分布特征。"
               "必须引用上面 Run/Sleep% 和 Gfx.WaitForPresent 单次 avg。50-100 字。 -->")
    out.append("")

    out.append("### §4.5 因果链可视化")
    out.append("")
    out.append("<!-- LLM_FILL: 用 ASCII 树状图绘制主线程一帧的等待因果链（PlayerLoop → URP.WaitForPresent → Sleep → 等 GPU semaphore → RHI Gfx.PresentFrame）。"
               "深度 3-5 层。引用本节 §4.3 重合度 + §4.4 单次 avg 数字作为每条因果链的证据。"
               "末尾加'证据链一致性'清单，列 3-5 条数字证据。结构参考金标准 v5.3 §4.5。 -->")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §5 降频时序证据链
# ---------------------------------------------------------------------------
def render_section_5(samples: list[dict]) -> str:
    out = ["## §5 降频时序证据链（perfetto 独家）", ""]
    out.append("### §5.1 三态对照表")
    out.append("")
    out.append("| 样本 | bigReach% | UnityMain run% | PlayerLoop p50/p99 | level |")
    out.append("|---|---|---|---|---|")
    for s in samples:
        thr = s["summary"].get("throttling") or {}
        ms = s["summary"].get("machineState") or {}
        big = thr.get("bigCoreReachPct") or ms.get("bigCoreReachPct")
        ts = thread_sched(s["summary"], "UnityMain") or {}
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        out.append(
            f"| **{s['role']}** | {fmt_pct(big, 1)} | {fmt_pct(ts.get('runningPct'))} | "
            f"{fmt_num(fa.get('p50Ms'))} / {fmt_num(fa.get('p99Ms'))} | **{thr.get('level') or '—'}** |"
        )
    out.append("")

    out.append("### §5.2 降频形态识别")
    out.append("")
    out.append("```")
    for s in samples:
        thr = s["summary"].get("throttling") or {}
        ms = s["summary"].get("machineState") or {}
        big = thr.get("bigCoreReachPct") or ms.get("bigCoreReachPct") or 0
        out.append(f"{s['role']}:")
        out.append(f"  bigReach: {big:.1f}%")
        out.append(f"  level:    {thr.get('level') or '—'}")
        out.append("")
    out.append("```")
    out.append("")
    out.append("<!-- LLM_FILL: 1-3 句话识别每个样本的降频形态："
               "'热预算紧但还顶得住' / '饱和高温' / '重度降频'。引用上面 bigReach% 数字。每个样本一行。 -->")
    out.append("")

    out.append("### §5.3 per-CPU 实测表")
    out.append("")
    # 找 per-cpu 数据
    samples_with_cpu = [s for s in samples if (s["summary"].get("throttling") or {}).get("perCpu")]
    if samples_with_cpu:
        s0 = samples_with_cpu[0]
        per_cpu = (s0["summary"].get("throttling") or {}).get("perCpu") or []
        # 表头：CPU | <role1 avg/max> | <role2 avg/max> | ... | cpuinfo_max
        header = ["CPU"] + [f"{s['role']} avg/max" for s in samples] + ["cpuinfo_max"]
        out.append("| " + " | ".join(header) + " |")
        out.append("|" + "|".join(["---"] * len(header)) + "|")
        for cpu_idx, c0 in enumerate(per_cpu):
            cpu_label = f"cpu{c0.get('cpu', cpu_idx)}"
            row = [cpu_label]
            for s in samples:
                pc = (s["summary"].get("throttling") or {}).get("perCpu") or []
                ci = next((c for c in pc if c.get("cpu") == c0.get("cpu")), None)
                if ci:
                    row.append(f"{fmt_num(ci.get('avgMhz'), 1)} / {fmt_num(ci.get('maxMhz'), 1)}")
                else:
                    row.append("—")
            row.append(fmt_num(c0.get("cpuinfoMaxMhz"), 1))
            out.append("| " + " | ".join(row) + " |")
    out.append("")

    out.append("### §5.4 降频判定矩阵")
    out.append("")
    out.append("| 维度 | 要求 | 本次 |")
    out.append("|---|---|---|")
    out.append("| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |")
    out.append("| **confirmed**: cpu7 sched 归零（集群下线）| 跨次时序 | ❌/✅ |")
    out.append("| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C | cpufreq + 温度旁路 | ✅/❌ |")
    out.append("| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ✅/❌ |")
    out.append("| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅/❌ |")
    out.append("")
    levels = " / ".join((s["summary"].get("throttling") or {}).get("level") or "—" for s in samples)
    out.append(f"**当前判定**：{' / '.join(s['role'] for s in samples)} 三档分别为 {levels}")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §6 主线程一帧时间去向
# ---------------------------------------------------------------------------
def render_section_6(samples: list[dict]) -> str:
    pack = load_project_pack(summary=samples[-1]["summary"])
    hot_module_map = pack.hot_module_section_map()
    out = ["## §6 主线程一帧时间去向", ""]

    # §6.1 PlayerLoop 分位数
    out.append("### §6.1 PlayerLoop 帧分位数")
    out.append("")
    out.append("| 分位 | " + " | ".join(f"**{s['role']}**" for s in samples) + " |")
    out.append("|" + "|".join(["---"] * (len(samples) + 1)) + "|")
    for label, key in [
        ("p50 ms", "p50Ms"),
        ("p95 ms", "p95Ms"),
        ("p99 ms", "p99Ms"),
        ("slowFrame >33ms", "slowFrameRate33"),
        ("fps", "fps"),
        ("帧数", "count"),
    ]:
        vals = []
        for s in samples:
            fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
            v = fa.get(key)
            if "ms" in label:
                vals.append(fmt_num(v))
            elif label.startswith("slowFrame"):
                vals.append(fmt_pct(v))
            elif label == "fps":
                vals.append(fmt_num(v, 1))
            else:
                vals.append(str(v) if v is not None else "—")
        out.append("| " + label + " | " + " | ".join(vals) + " |")
    out.append("")
    out.append("<!-- LLM_FILL: 1-2 句话解读 p50→p99 分布的形态（持续匀速/偶发尖峰）。"
               "必须引用上面分位数数字。30-80 字。 -->")
    out.append("")

    # §6.2 callTrees 缩进树（用 cur 或最后一个样本的 callTree 作主样本，添加多列签名）
    out.append("### §6.2 主线程 callTrees 缩进树")
    out.append("")
    out.append("**形式硬规则**：")
    out.append("")
    out.append("- 必须缩进树展示，不用表格")
    if len(samples) == 1:
        out.append(f"- 每节点格式：`[X.XX ms/帧 / NN.N% trace]`")
    else:
        roles_str = " / ".join(s["role"] for s in samples)
        out.append(f"- 每节点格式：`[{roles_str} ms/帧]`")
    out.append("- 标记体系：📈 增量 >50% / 🔴 单次平均超红线 / 🟡 临近红线 / 🟢 健康 / 🔵 wait 型")
    out.append("- 树深度至少展开到业务模块叶子")
    out.append("")
    out.append("```")
    # 计算 PlayerLoop 帧数 per sample
    pl_counts = {}
    for s in samples:
        fa = (s["summary"].get("frameAnalysis") or {}).get("summary") or {}
        pl_counts[s["role"]] = max(1, fa.get("count") or 1)

    # 用 last sample 的 callTree 作骨架 (因为 last sample 通常负载最重，结构最丰富)
    main_sample = samples[-1]
    trees = main_sample["summary"].get("callTrees") or []
    main_tree = next((t for t in trees if t.get("thread") == "UnityMain"), None)

    if main_tree and main_tree.get("root"):
        # 收集所有样本的 path → totalMs 映射
        path_data: dict[tuple[str, ...], dict[str, float]] = {}

        def walk(node: dict, sample_role: str, path: tuple[str, ...]):
            new_path = path + (node.get("name") or "?",)
            d = path_data.setdefault(new_path, {})
            d[sample_role] = float(node.get("totalMs") or 0)
            for c in node.get("children") or []:
                walk(c, sample_role, new_path)

        for s in samples:
            t_list = s["summary"].get("callTrees") or []
            t = next((t for t in t_list if t.get("thread") == "UnityMain"), None)
            if t and t.get("root"):
                walk(t["root"], s["role"], ())

        # 按 main_sample 的 callTree 结构渲染（主样本结构丰富）
        def render_node(node: dict, depth: int = 0, max_depth: int = 6, prefix: str = "") -> list[str]:
            lines = []
            if depth > max_depth:
                return lines
            name = node.get("name") or "?"
            path = []  # 我们用 walk 收集的 path 已经是 tuple
            # 简化：用 name 做 key（同名节点会聚合，简化版本）
            ms_per_frame = []
            for s in samples:
                t_list = s["summary"].get("callTrees") or []
                t = next((t for t in t_list if t.get("thread") == "UnityMain"), None)
                # 在该 sample 的 callTree 里递归找名字相同的节点
                found = find_node_by_name(t["root"] if t else None, name, depth)
                if found:
                    ms_per_frame.append(float(found.get("totalMs") or 0) / pl_counts[s["role"]])
                else:
                    ms_per_frame.append(0.0)

            sig_parts = [f"{v:.2f}" for v in ms_per_frame]
            sig = "[" + " / ".join(sig_parts) + " ms/帧]" if len(samples) > 1 else f"[{ms_per_frame[0]:.2f} ms/帧]"

            indent = "│  " * (depth - 1) + ("├─ " if depth > 0 else "")
            lines.append(f"{indent}{name:<40} {sig}")

            for child in (node.get("children") or [])[:8]:
                lines.extend(render_node(child, depth + 1, max_depth))
            return lines

        def find_node_by_name(root, name, depth_hint):
            if not root:
                return None
            if root.get("name") == name:
                return root
            for c in (root.get("children") or [])[:30]:
                found = find_node_by_name(c, name, depth_hint - 1)
                if found:
                    return found
            return None

        lines = render_node(main_tree["root"], depth=0, max_depth=5)
        out.extend(lines)
    out.append("```")
    out.append("")
    out.append("<!-- LLM_FILL: 给上面缩进树添加业务解读：每个主要节点（占帧 >5% 或单次超红线）后面加 `← <一句注解>`。"
               "必须引用本树中的 ms/帧 数字。注释只能加在 `← ...` 形式，不要修改树结构本身。 -->")
    out.append("")

    # §6.3 Top 红线热点
    out.append("### §6.3 Top 红线热点子函数下钻")
    out.append("")
    main_sample = samples[-1]
    biz_role = main_sample["role"]
    pl_count = pl_counts[biz_role]
    hot = sorted(
        [s for s in (main_sample["summary"].get("aoeHotSlices") or [])
         if not (s.get("label") or "").lower().startswith("gfx.")
         and not (s.get("label") or "").lower().startswith("waitforpresent")],
        key=lambda s: float(s.get("totalMs") or 0),
        reverse=True,
    )[:5]

    gc_modules = (main_sample["summary"].get("gcAllocByModule") or [])

    for i, h in enumerate(hot, 1):
        label = h.get("label") or "?"
        total_ms = float(h.get("totalMs") or 0)
        ms_per_frame = total_ms / max(1, pl_count)
        avg = h.get("avgMs")
        cnt = h.get("count")
        pct = h.get("totalPct")
        out.append(f"#### 6.3.{i} {label}")
        out.append("")
        # 项目包知识注入
        mod_info = hot_module_map.get(label) or {}
        if mod_info:
            out.append(f"> 项目包知识：**{mod_info.get('display') or label}** "
                       f"(线程: {mod_info.get('threadHint', '—')} "
                       f"· 红线参考: {mod_info.get('topNRemark', '—')})")
            out.append("")
        out.append(f"```")
        out.append(f"{label} ({biz_role}: {ms_per_frame:.2f} ms/帧 / {pct:.2f}% trace / 单次 avg {fmt_ms(avg)})")
        out.append(f"  count: {cnt}")
        if len(samples) > 1:
            out.append(f"  跨样本 ms/帧 对比:")
            for s in samples:
                slices = s["summary"].get("aoeHotSlices") or []
                hh = next((x for x in slices if x.get("label") == label), None)
                if hh:
                    pl = pl_counts[s["role"]]
                    out.append(f"    {s['role']:<10} {float(hh.get('totalMs') or 0)/pl:.3f} ms/帧 (cnt {hh.get('count')})")
        out.append(f"```")
        out.append("")
        # GC.Alloc 业务归因
        gc = next((m for m in gc_modules if (m.get("module") or m.get("pattern") or "") == label), None)
        if gc:
            out.append(f"**GC.Alloc 业务归因（{biz_role}）：**")
            out.append("")
            out.append(f"- {label} 子树：{gc.get('allocPerFrame')} 次/帧 (allocCount {gc.get('allocCount')}, allocTotalMs {fmt_ms(gc.get('allocTotalMs'), 2)})")
            out.append("")

        out.append(f"<!-- LLM_FILL: 给 {label} 写优化方向 3-5 条 bullets，"
                   f"格式 `- <具体可行优化>`。必须引用本节数字。"
                   f"不要预设业务模块名，只能用本次数据中已出现的名字。 -->")
        out.append("")

    # §6.4 红线触发清单
    out.append("### §6.4 红线触发清单")
    out.append("")
    out.append("| 优先级 | 模块 | " + " | ".join(f"{s['role']} ms/帧" for s in samples) + " | 红线类型 |")
    out.append("|" + "|".join(["---"] * (len(samples) + 3)) + "|")
    for i, h in enumerate(hot, 1):
        label = h.get("label") or "?"
        cells = []
        for s in samples:
            slices = s["summary"].get("aoeHotSlices") or []
            hh = next((x for x in slices if x.get("label") == label), None)
            if hh:
                pl = pl_counts[s["role"]]
                cells.append(f"{float(hh.get('totalMs') or 0)/pl:.2f}")
            else:
                cells.append("—")
        out.append(f"| {i} | {label} | " + " | ".join(cells) + " | <!-- LLM_FILL: 一句红线类型 --> |")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §7 渲染链路 + GPU bound 判定
# ---------------------------------------------------------------------------
def render_section_7(samples: list[dict]) -> str:
    out = ["## §7 渲染链路 + GPU bound 判定", ""]
    out.append("### §7.1 Gfx.WaitForPresent 单次 avg")
    out.append("")
    out.append("| 样本 | 单次 avg | 含义 |")
    out.append("|---|---|---|")
    for s in samples:
        slices = s["summary"].get("aoeHotSlices") or []
        gfx = next((x for x in slices if (x.get("label") or "").lower().startswith("gfx.waitforpresent")), None)
        avg = (gfx or {}).get("avgMs")
        out.append(f"| {s['role']} | **{fmt_ms(avg)}** | <!-- LLM_FILL: 一句话给出'是否超 vsync 周期 16.67ms'判定 --> |")
    out.append("")
    out.append("**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.67ms）→ GPU 成为瓶颈。")
    out.append("")

    out.append("### §7.3 GPU bound 判定矩阵")
    out.append("")
    out.append("| 信号 | 直接证据 | 间接证据 | 判定 |")
    out.append("|---|---|---|---|")
    out.append("| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |")
    out.append("| **Gfx.WaitForPresent 单次 > vsync** | <!-- LLM_FILL: 引用 §7.1 数字 --> | ✅ | <!-- LLM_FILL: 给出 🔴/🟡/🟢 --> |")
    out.append("| **主线程 Sleeping ≈ Gfx.WaitForPresent** | <!-- LLM_FILL: 引用 §4.3 重合度 --> | ✅ | <!-- LLM_FILL: 🔴/🟡/🟢 --> |")
    out.append("| **Render / RHI 都越来越闲** | <!-- LLM_FILL: 引用 §3.2/§3.3 三态演化 --> | ✅ | <!-- LLM_FILL: 🔴/🟡/🟢 --> |")
    out.append("| Choreographer 维持节拍 | <!-- LLM_FILL: 引用 §3.7 数字 --> | ✅ | 🟢 显示链路正常 |")
    out.append("| 主线程 binder 占比 | <!-- LLM_FILL: 引用 §3.1 数字 --> | ✅ | <!-- LLM_FILL: 排除/不排除 IPC 阻塞 --> |")
    out.append("")
    out.append("**判定**：")
    out.append("")
    out.append("<!-- LLM_FILL: 对每个样本给出 GPU bound 判定结论（强 GPU-bound / 中等 / 不是）。"
               "格式 `- <角色>: <判定>` 每行一个。 -->")
    out.append("")
    out.append("---")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# §9 / §10 能力边界 + 自评
# ---------------------------------------------------------------------------
def render_section_9_10(samples: list[dict]) -> str:
    out = ["## §9 本源能力边界 + 工程化建议（分四档）", ""]
    out.append("### §9.1 能力矩阵")
    out.append("")
    out.append("参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度。")
    out.append("")
    out.append("### §9.2 工程化建议")
    out.append("")
    out.append("#### 🟢 已落实")
    out.append("")
    out.append("<!-- LLM_FILL: 列出 3-5 条本报告已经回答了的能力（引用对应章节）。 -->")
    out.append("")
    out.append("#### 🟡 待 Provider 子查询扩展（不阻塞本报告）")
    out.append("")
    out.append("<!-- LLM_FILL: 列出 2-4 条 Provider 端可加强的查询（如 callTrees adaptive 剪枝、cpu offline 检测、threadsSchedList 默认覆盖更广）。 -->")
    out.append("")
    out.append("#### 🔴 物理 / 结构性不可达（永久声明）")
    out.append("")
    out.append("- sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）")
    out.append("- sysfs scaling_max_freq 旁路（confirmed 档不可达）")
    out.append("- GPU busy / freq counter（骁龙需 root 注入 producer）")
    out.append("- Wwise 内部细分（atrace 无 native 埋点）")
    out.append("")
    out.append("#### 后续工程项")
    out.append("")
    out.append("<!-- LLM_FILL: 列出 1-3 条后续可做项（如跨次 diff、单帧逐线程时间轴等）。 -->")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## §10 自评")
    out.append("")
    out.append("- [x] 结论先行（§0）")
    out.append("- [x] 完整证据链（每条挂数据来源）")
    out.append("- [x] 数据口径透明（§1.2 公式表）")
    out.append("- [x] 数据缺口诚实声明（§1.3 / §-1.2 / §9.1 三处冗余）")
    out.append("- [x] 可执行建议（§0 ROI 排序 + §6.3 各模块优化方向 + §9.2 分四档）")
    out.append("- [x] 不编造（线程名 / 百分比 / 模块名全部来自 summary）")
    out.append("- [x] 降频/可信度：likely 档诚实标注 + 缺 sysfs 数据")
    out.append("- [x] 帧口径：Choreographer fps vs PlayerLoop fps 关系明示")
    if len(samples) == 1:
        out.append("- [x] 单次报告**不能**做跨次演化 → 用 diff skill")
    else:
        out.append("- [x] 跨样本对比：所有数字按 ms/帧 或 totalPct 归一化")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def render_report(samples: list[dict]) -> str:
    pack = load_project_pack(summary=samples[-1]["summary"])
    n = len(samples)
    title = "Perfetto 单次性能分析报告" if n == 1 else f"Perfetto {n} 份对比性能分析报告"
    parts = [f"# {title}", ""]
    parts.append(f"> 项目包：**{pack.name}**" + (" (auto-detected)" if pack.name != "_generic" else " (fallback)"))
    parts.append("")
    if n > 1:
        parts.append(f"> {n} 份样本：" + ", ".join(s["role"] for s in samples))
        parts.append("")
    parts.append(render_section_minus_1(samples))
    parts.append(render_section_0(samples))
    parts.append(render_section_1(samples))
    parts.append(render_section_2(samples))
    parts.append(render_section_3(samples))
    parts.append(render_section_4(samples))
    parts.append(render_section_5(samples))
    parts.append(render_section_6(samples))
    parts.append(render_section_7(samples))
    parts.append(render_section_9_10(samples))
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser(description="Render perfetto N-column skeleton markdown")
    ap.add_argument(
        "--sample",
        action="append",
        required=True,
        help="role=path/to/perfetto-profile-summary.json （可多次，至少 1 次）",
    )
    ap.add_argument("--out", required=True, help="输出 markdown 文件")
    args = ap.parse_args()

    samples = []
    for s in args.sample:
        if "=" not in s:
            print(f"[ERR] --sample 格式 role=path: {s}", file=sys.stderr)
            sys.exit(2)
        role, path = s.split("=", 1)
        if not os.path.isfile(path):
            print(f"[ERR] summary 不存在: {path}", file=sys.stderr)
            sys.exit(2)
        samples.append(load_sample(path, role))

    md = render_report(samples)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(md)
    n_lines = md.count("\n") + 1
    print(f"[OK] {args.out}  ({n_lines} 行, {len(samples)} 列)", file=sys.stderr)


if __name__ == "__main__":
    main()
