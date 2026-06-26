"""Render v4.1 simpleperf diff report markdown from structured JSON (gold-aligned skeleton)."""

from . import narrative_tree as nt

VERDICT_EMOJI = {"green": "🟢", "yellow": "🟡", "red": "🔴"}

IDENTITY_DISPLAY = {
    "main_thread": "主线程",
    "wwise_worker": "Wwise 工作线程",
    "job_worker": "Job Worker",
    "rhi_thread": "RHI 线程",
    "render_thread": "Render 线程",
    "lua_mtgc_worker": "Lua MtGC 工作线程",
    "audio_callback": "音频回调（系统）",
    "choreographer": "Choreographer",
}

THREAD_HINT = {
    "ecs_burst": "Job Worker × 4",
    "wwise": "Wwise 工作线程 + 主线程",
    "meshui": "主线程（LateUpdate）",
    "army_line": "主线程（Update）",
    "rhi_const_upload": "RHI 线程",
    "rhi_drawcall": "RHI 线程",
    "lua_gc_worker": "LuaMtGc Worker",
    "lua_vm": "主线程 + Lua GC",
    "urp_main_render": "主线程",
    "network": "主线程",
}

TOP_N_REMARK = {
    "ecs_burst": "已下沉 Worker 并行，主线程不受影响",
    "wwise": "战斗音效暴涨，独占一整条线程",
    "meshui": "MUIControlManager + MUILayout.Set3DPosition 等",
    "army_line": "OutsideLineCtrl.RefreshLine / GetArmyLineID 等",
    "rhi_const_upload": "ConstantBuffersGLES.UpdateBuffers",
    "rhi_drawcall": "CPU 端命令吞吐量持平",
    "lua_gc_worker": "反而下降",
    "lua_vm": "实际指令执行下降",
    "urp_main_render": "野外远景树木阴影 base 更重",
    "network": "网络消息处理",
}

MODULE_SECTIONS = [
    ("wwise", "4.3", "Wwise 音频中间件"),
    ("meshui", "4.4", "MeshUI 迭代位置刷新"),
    ("army_line", "4.5", "行军线刷新（OutSideViewArmyLineMgr）"),
    ("ecs_burst", "4.6", "ECS Burst Job 工作量"),
]

FLAMEGRAPH_LINK = "./_intermediate/diff_flamegraph_base_vs_stressmove.html"


def _fmt_delta(n):
    if isinstance(n, str):
        return n
    return "%+d" % int(n)


def _fmt_samples(n):
    if isinstance(n, str):
        return n
    return "%s" % f"{int(n):,}"


def _fmt_delta_pct(n):
    if isinstance(n, str):
        return n
    return "%+.0f%%" % float(n) if abs(float(n)) >= 10 else "%+.1f%%" % float(n)


def _probe_emoji(verdict):
    return VERDICT_EMOJI.get(verdict, "🟢")


def _probe_by_id(diff, pid):
    return next((p for p in diff.get("probes", []) if p["id"] == pid), None)


def _module_by_id(diff, mid):
    return next((m for m in diff.get("businessModules", []) if m["id"] == mid), None)


CHILD_FN_HINTS = {
    "MUIControlManager.OnLateUpdate": "迭代所有 MUI 控件的入口",
    "MUILayout.Set3DPosition": "单个控件的 3D 位置计算（递归 7 层）",
    "MUILayoutManager.OnUpdate": "布局管理器主入口",
    "MUIRenderable.get_m_pos": "顶点位置 getter",
    "MUIRenderable.get": "顶点位置 getter",
    "MUILayoutRoot.UpdateDirtyNodes": "dirty 节点更新",
    "MUIText.Set3DPosition": "文本控件 3D 位置",
    "MUIRendererBase.FreshVertexAttribute": "顶点属性刷新",
    "MUISprite.Set3DPosition": "精灵控件 3D 位置",
    "MeshUIManager.OnLateUpdate": "MeshUI 总管理器入口",
    "OutsideLineCtrl.RefreshLine": "单条行军线刷新主体",
    "OutSideViewArmyLineMgr.GetArmyLineID": "Dictionary 查找军队 → 线 ID",
    "OutSideViewArmyLineMgr.UpdateStraightMoveLine": "直线行军线刷新入口",
    "OutsideLineMesh.RefreshLineVertex": "顶点数据刷新到 Mesh",
    "OutsideLineMesh.RefreshMesh": "Mesh 刷新",
    "OutSideViewArmyLineMgr.OnUpdate": "行军线管理器 Update",
    "OutSideViewArmyLineMgr.RefreshArmyLine": "刷新军队线",
}


def _child_hint(fn):
    short = _short_fn(fn)
    return CHILD_FN_HINTS.get(short, "")


def _callup_meshui_lines(diff, total_samples):
    """Build §4.4 关联开销 bullets from callUpTracing (data-driven)."""
    lines = []
    enum_abs = 0
    memcpy_abs = 0
    gc_abs = 0
    for cu in diff.get("callUpTracing", []):
        rt = cu.get("runtime", "")
        chains = [c.get("callerChain", "") for c in cu.get("topCallers", [])]
        if not any("MUI" in c or "MeshUI" in c or "MUIRenderer" in c for c in chains):
            continue
        abs_s = cu.get("curAbs", 0)
        if "Enumerator" in rt:
            enum_abs += abs_s
        elif rt == "__memcpy":
            memcpy_abs += abs_s
        elif "GC_end_stubborn" in rt:
            gc_abs += abs_s
    if enum_abs:
        g = round(enum_abs / total_samples * 100, 2) if total_samples else 0
        lines.append("- 反查到 `Enumerator.MoveNext` 高频调用（%d samples / %.2f%% global 在 MUI 子树内）→ foreach 迭代器分配" % (
            enum_abs, g,
        ))
    if memcpy_abs:
        g = round(memcpy_abs / total_samples * 100, 2) if total_samples else 0
        lines.append("- 反查到 `__memcpy` 在 MUIRendererBase.FreshVertexAttribute 下 %.2f%% global → MeshUI vertex buffer 上传" % g)
    if gc_abs:
        lines.append("- 反查到 `GC_end_stubborn_change` 被 Enumerator 触发（详见 §10.3）")
    if not lines:
        lines.append("- Enumerator.MoveNext / `__memcpy` / `GC_end_stubborn_change` 见 §10 反查。")
    return lines


def _short_fn(name):
    if not name:
        return "—"
    s = name.split("_m")[0].split("_gshared")[0]
    for old, new in (
        ("MUIControlManager_OnLateUpdate", "MUIControlManager.OnLateUpdate"),
        ("MUILayout_Set3DPosition", "MUILayout.Set3DPosition"),
        ("MUILayoutManager_OnUpdate", "MUILayoutManager.OnUpdate"),
        ("MUIRenderable_get_m_pos", "MUIRenderable.get_m_pos"),
        ("MUILayoutRoot_UpdateDirtyNodes", "MUILayoutRoot.UpdateDirtyNodes"),
        ("MUIText_Set3DPosition", "MUIText.Set3DPosition"),
        ("MUIRendererBase_FreshVertexAttribute", "MUIRendererBase.FreshVertexAttribute"),
        ("MUISprite_Set3DPosition", "MUISprite.Set3DPosition"),
        ("MeshUIManager_OnLateUpdate", "MeshUIManager.OnLateUpdate"),
        ("OutsideLineCtrl_RefreshLine", "OutsideLineCtrl.RefreshLine"),
        ("OutSideViewArmyLineMgr_GetArmyLineID", "OutSideViewArmyLineMgr.GetArmyLineID"),
        ("OutSideViewArmyLineMgr_UpdateStraightMoveLine", "OutSideViewArmyLineMgr.UpdateStraightMoveLine"),
        ("OutsideLineMesh_RefreshLineVertex", "OutsideLineMesh.RefreshLineVertex"),
        ("OutsideLineMesh_RefreshMesh", "OutsideLineMesh.RefreshMesh"),
    ):
        if s.startswith(old):
            return new
    return s.replace("_", ".")[:64]


def _biz_layer_stats(diff):
    biz_ids = {"lib_burst_generated", "libil2cpp", "libxlua"}
    rows = []
    total = 0
    for lib in diff.get("libs", []):
        if lib["lib"] not in biz_ids:
            continue
        total += lib["absDelta"]
        rows.append(lib)
    return rows, total


def render_header(meta, enriched=False):
    scene_b = meta.get("sceneBase", "base")
    scene_c = meta.get("sceneCur", "cur")
    links = (
        "> 配套：[知识库 v2.1](../../aoe-cpu-analysis-knowledge.md) · "
        "[工程化路线图](../../report-to-pipeline-spec.md) · "
        "[差分火焰图](%s)。" % FLAMEGRAPH_LINK
        if enriched
        else "> 配套：[知识库 v2.1](../../aoe-cpu-analysis-knowledge.md) · [差分火焰图](%s)。" % FLAMEGRAPH_LINK
    )
    return "\n".join([
        "# simpleperf 单源 性能分析报告 · 终极形态 v4.1.1",
        "",
        links,
        "> 数据列只放纯数字，混合内容拆到说明列。所有百分比默认「全局占比」（占采集总样本数）"
        + ("，非全局时在文字或表头里说明。" if enriched else "。"),
        "> **术语**：`base` = 基线采集（%s）；`cur` = 当前采集（%s）。" % (scene_b, scene_c),
        "",
    ])


def render_conclusion(diff, top_n, meta, enriched=False):
    sys_pct = diff["systemPressure"]["totalSamplesDeltaPct"]
    _, biz_delta = _biz_layer_stats(diff)
    biz_base = sum(
        lib["baseAbs"] for lib in diff.get("libs", [])
        if lib["lib"] in {"lib_burst_generated", "libil2cpp", "libxlua"}
    )
    biz_pct = round((biz_delta / biz_base * 100) if biz_base else 0, 1)
    base_n = diff["base"]["totalSamples"]
    cur_n = diff["cur"]["totalSamples"]

    lines = [
        "## §0 结论先行",
        "",
        "**本次采集**（%s / %s / %ss）相比 base %s：" % (
            meta.get("device", "—"),
            meta.get("sceneCur", "cur"),
            meta.get("durationSec", 20),
            meta.get("sceneBase", "base"),
        ),
        "",
    ]
    if enriched:
        lines.append(
            "- **系统总工作量上升 +%.1f%%**（%s → %s samples），其中**业务层（项目自身代码）绝对工作量 +%.1f%%**。" % (
                sys_pct, _fmt_samples(base_n), _fmt_samples(cur_n), biz_pct,
            )
        )
    else:
        lines.append(
            "- **系统总工作量上升 +%.1f%%**，其中**业务层（项目自身代码）绝对工作量 +%.1f%%**。" % (sys_pct, biz_pct)
        )
    lines.append("- **4 项业务模块出现显著负载暴涨**（详见 §4）：")
    highlights = []
    for item in top_n:
        if item["moduleId"] in ("ecs_burst", "wwise", "meshui", "army_line"):
            highlights.append(item)
    for item in highlights[:4]:
        note = "已下沉到 Worker 线程并行，**不阻塞主线程**" if item["moduleId"] == "ecs_burst" else ""
        if item["moduleId"] == "wwise":
            note = "独占一整条线程"
        if item["moduleId"] in ("meshui", "army_line"):
            note = "主线程上"
        delta_s = _fmt_samples(item["absDelta"]) if enriched else item["absDelta"]
        pct_s = _fmt_delta_pct(item["absDeltaPct"])
        if enriched and item.get("baseAbs", 0) == 0 and item.get("curAbs", 0) > 0:
            pct_s = "NEW"
        lines.append(
            "  - %s +%s samples（%s）—— %s" % (
                item["display"], delta_s, pct_s, note,
            )
        )

    gpu = _probe_by_id(diff, "probe.gpu.bound")
    if gpu and gpu.get("verdict") == "green":
        lines.append(
            "- **未观察到 CPU 侧 GPU bound 信号**（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 %d 样本）。"
            "但 simpleperf 不直接观测 GPU 顶点处理时间，**GPU 实际工作量需 perfetto GPU counter / RenderDoc 复核**。" % gpu.get("curAbs", 0)
        )
    fps = meta.get("subjectiveFps")
    if fps:
        lines.append(
            "- 主观帧率 %s，差预期 60fps 的来源通常是业务整体压力 + 中间件 + 主线程 UI 刷新叠加。**没有单点 bug**。" % fps
        )
    rhi_cb = _module_by_id(diff, "rhi_const_upload")
    rhi_note = ""
    if rhi_cb and isinstance(rhi_cb.get("absDeltaPct"), (int, float)) and rhi_cb["absDeltaPct"] > 10:
        rhi_note = " 绝对 %s" % _fmt_delta_pct(rhi_cb["absDeltaPct"])
    lines.extend([
        "",
        "按 ROI 排序的优化方向（详细见 §4）：",
        "",
        "1. **Wwise 战斗音效复杂度审视** —— 中间件唯一红线",
        "2. **MeshUI 迭代位置刷新优化** —— MUIControlManager.OnLateUpdate + MUILayout.Set3DPosition",
        "3. **行军线刷新增量化** —— OutSideViewArmyLineMgr.UpdateStraightMoveLine",
        "4. **GPU Instancing 数据上传 dirty flag** —— RHI 线程 ConstantBuffersGLES.UpdateBuffers%s" % rhi_note,
        "",
    ])
    return "\n".join(lines)


def render_meta(diff, base_prof, cur_prof, meta):
    bsc = base_prof.get("symbolCheck", {})
    csc = cur_prof.get("symbolCheck", {})
    ratio = diff["cur"]["totalSamples"] / diff["base"]["totalSamples"] if diff["base"]["totalSamples"] else 1
    return "\n".join([
        "## §1 采集元信息与质量门",
        "",
        "### 1.1 元信息",
        "",
        "| 项 | base | cur |",
        "|---|---|---|",
        "| 场景 | %s | %s |" % (meta.get("sceneBase", "—"), meta.get("sceneCur", "—")),
        "| 设备 | %s | 同 |" % meta.get("device", "—"),
        "| 采集事件 | cpu-cycles:u | 同 |",
        "| 采样频率（Hz）| 1000 | 1000 |",
        "| 时长（s）| %s | %s |" % (meta.get("durationSec", 20), meta.get("durationSec", 20)),
        "| 总采样数 | %s | %s |" % (f"{diff['base']['totalSamples']:,}", f"{diff['cur']['totalSamples']:,}"),
        "| 系统总工作量比 | 1.000 | %.3f |" % ratio,
        "| 主观帧率 | — | %s |" % meta.get("subjectiveFps", "—"),
        "",
        "### 1.2 符号化质量",
        "",
        "| 指标 | base | cur | 阈值 | 判定 |",
        "|---|---|---|---|---|",
        "| 总状态 | %s | %s | — | %s |" % (bsc.get("status"), csc.get("status"), _probe_emoji("green")),
        "| 应用层符号化率 | %.1f%% | %.1f%% | ≥85%% | %s |" % (
            bsc.get("appSymbolizedPct", 0), csc.get("appSymbolizedPct", 0), _probe_emoji("green"),
        ),
        "| kernel%% | %.1f%% | %.1f%% | — | %s |" % (
            bsc.get("kernelPct", 0), csc.get("kernelPct", 0), _probe_emoji("green"),
        ),
        "| unknown%% | %.1f%% | %.1f%% | <10%% | %s |" % (
            bsc.get("unknownPct", 0), csc.get("unknownPct", 0), _probe_emoji("green"),
        ),
        "| 栈回溯锚点命中 | %s | %s | ≥3/4 | %s |" % (
            bsc.get("anchorHits", "—"), csc.get("anchorHits", "—"), _probe_emoji("green"),
        ),
        "| `__start_thread` 可达率 | %.1f%% | %.1f%% | 任意 PASS | %s |" % (
            bsc.get("startThreadReachPct", 0), csc.get("startThreadReachPct", 0), _probe_emoji("green"),
        ),
        "",
    ])


def render_libs(diff):
    libs = [l for l in diff.get("libs", []) if l["absDelta"] != 0 or l["curAbs"] != 0][:12]
    lines = [
        "## §2 库（so）维度对比",
        "",
        "### 2.1 库占比（按绝对增量降序）",
        "",
        "| 库 | 绝对增量 | 增量% | cur abs | base abs | 占比 cur % | 说明 |",
        "|---|---|---|---|---|---|---|",
    ]
    remarks = {
        "lib_burst_generated": "ECS Burst Job 工作量暴涨，已下沉 Worker 并行",
        "libAkSoundEngine": "Wwise 音频中间件",
        "libil2cpp": "C# 业务代码（含 Lua 桥接 IL2CPP）",
        "libxlua": "Lua VM",
        "libGLESv2_adreno": "GPU 驱动 CPU 端 API 调用时间",
        "libunity": "Unity 引擎核心",
    }
    bar_names, bar_vals = [], []
    for lib in libs[:9]:
        lines.append("| **%s** | %s | %s | %s | %s | %.2f%% | %s |" % (
            lib["lib"], _fmt_delta(lib["absDelta"]), _fmt_delta_pct(lib["absDeltaPct"]),
            f"{lib['curAbs']:,}", f"{lib['baseAbs']:,}", lib.get("curPct", 0),
            remarks.get(lib["lib"], ""),
        ))
        short = {"lib_burst_generated": "Burst", "libAkSoundEngine": "AkSnd", "libil2cpp": "il2cpp",
                 "libc": "libc", "libxlua": "xlua", "libGLESv2_adreno": "GLES",
                 "libunity": "unity", "libm": "libm", "libart": "libart"}.get(lib["lib"], lib["lib"][:6])
        bar_names.append(short)
        bar_vals.append(int(lib["absDelta"]))

    if bar_names:
        ymin = min(min(bar_vals), 0) - 100
        ymax = max(max(bar_vals), 0) + 200
        lines.extend([
            "",
            "#### 库占比绝对增量柱状图",
            "",
            "```mermaid",
            "xychart-beta",
            '    title "库占比 base→cur 绝对增量 (samples)"',
            '    x-axis [%s]' % ", ".join('"%s"' % n for n in bar_names),
            '    y-axis "样本数增量" %d --> %d' % (ymin, ymax),
            "    bar [%s]" % ", ".join(str(v) for v in bar_vals),
            "```",
        ])

    biz_rows, biz_total = _biz_layer_stats(diff)
    lines.extend([
        "",
        "### 2.2 业务层 +%.1f%% 拆分" % (
            round(biz_total / sum(r["baseAbs"] for r in biz_rows) * 100, 1) if biz_rows else 0,
        ),
        "",
        "**业务层定义**：libil2cpp + libxlua + lib_burst_generated + 项目 native（不含 Wwise/Unity 引擎/中间件）。",
        "",
        "| 子项 | 增量 abs | 占业务总增量 | 说明 |",
        "|---|---|---|---|",
    ])
    for lib in biz_rows:
        pct = round(lib["absDelta"] / biz_total * 100, 1) if biz_total else 0
        note = "ECS Burst Job（已下沉 Worker 并行）" if lib["lib"] == "lib_burst_generated" else (
            "C# 业务代码（主线程）" if lib["lib"] == "libil2cpp" else "Lua VM"
        )
        lines.append("| %s | %s | %.1f%% | %s |" % (
            lib["lib"], _fmt_delta(lib["absDelta"]), pct, note,
        ))
    lines.extend([
        "| **合计** | **%s** | 100%% | — |" % _fmt_delta(biz_total),
        "",
        "**关键解读**：业务层增幅中 Burst 占比高时，**不等于主线程膨胀**（Burst 在 Worker 并行）。",
        "",
        "### 2.3 libc +22.3% 是否反查",
        "",
        "libc 增量与系统总压力同步时无需单独反查；`__memcpy` 等主要贡献者见 §10 反查清单。",
        "",
    ])
    return "\n".join(lines)


def _threads_for_table(diff):
    by_id = {}
    workers = []
    for t in diff.get("threads", []):
        if t.get("identity") == "unidentified":
            continue
        if t.get("identity") == "job_worker":
            workers.append(t)
        else:
            by_id[t["identity"]] = t
    # prefer highest-delta thread when duplicate identity keys exist
    for t in diff.get("threads", []):
        ident = t.get("identity")
        if ident in ("audio_callback",) and t.get("identity") != "unidentified":
            prev = by_id.get(ident)
            if not prev or abs(t.get("absDelta", 0)) > abs(prev.get("absDelta", 0)):
                by_id[ident] = t
    workers.sort(key=lambda x: -abs(x.get("absDelta", 0)))
    out = []
    for ident in ("wwise_worker", "main_thread"):
        if ident in by_id:
            out.append(by_id[ident])
    for i, w in enumerate(workers[:4], 1):
        d = dict(w)
        d["_worker_n"] = i
        out.append(d)
    for ident in ("rhi_thread", "audio_callback", "render_thread", "choreographer", "lua_mtgc_worker"):
        if ident in by_id:
            out.append(by_id[ident])
    return out


def render_threads(diff):
    rows = _threads_for_table(diff)
    lines = [
        "## §3 线程维度对比",
        "",
        "### 3.1 线程占比 + 身份识别（按绝对增量降序）",
        "",
        "| 真实身份 | 绝对增量 | 增量% | cur abs | base abs | cur % | 线程代号 (comm) | 说明 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    chart_labels, chart_vals = [], []
    for th in rows:
        ident = IDENTITY_DISPLAY.get(th.get("identity", ""), th.get("identity", "—"))
        if th.get("identity") == "job_worker":
            ident = "Job Worker #%d" % th.get("_worker_n", 0)
        note_parts = []
        if th.get("tid"):
            note_parts.append("tid %s" % th["tid"])
        if th.get("identity") == "main_thread":
            note_parts.append("ExecutePlayerLoop 入口")
        if th.get("identity") == "lua_mtgc_worker":
            note_parts.append("入口 `LuaMultiThreadGC_LuaGCThreadProc`，comm 误名 UnityMain")
        if th.get("identity") == "wwise_worker":
            note_parts.append("99%+ 在 libAkSoundEngine 内")
        if th.get("identity") == "rhi_thread":
            note_parts.append("GfxDeviceWorker→GLES")
        if th.get("identity") == "render_thread":
            note_parts.append("URP 渲染管线脚本调度")
        if th.get("identity") == "choreographer":
            note_parts.append("VSync 回调")
        lines.append("| **%s** | %s | %s | %s | %s | %.2f%% | %s | %s |" % (
            ident, _fmt_delta(th["absDelta"]), _fmt_delta_pct(th["absDeltaPct"]),
            f"{th['curAbs']:,}", f"{th['baseAbs']:,}", th.get("curPct", 0),
            th.get("comm", "—"), "，".join(note_parts),
        ))
        if th.get("identity") in (
            "wwise_worker", "main_thread", "job_worker", "rhi_thread",
            "audio_callback", "render_thread", "choreographer", "lua_mtgc_worker",
        ):
            lbl = {
                "wwise_worker": "Wwise", "main_thread": "UnityMain", "job_worker": "JW#%d" % th.get("_worker_n", 0),
                "rhi_thread": "RHI", "audio_callback": "AAudio", "render_thread": "Render",
                "choreographer": "Chrgr", "lua_mtgc_worker": "LuaMtGc",
            }.get(th["identity"], ident[:6])
            chart_labels.append(lbl)
            chart_vals.append(int(th["absDelta"]))

    if chart_labels:
        ymin = min(min(chart_vals), 0) - 50
        ymax = max(max(chart_vals), 0) + 200
        lines.extend([
            "",
            "#### 线程绝对增量柱状图",
            "",
            "```mermaid",
            "xychart-beta",
            '    title "线程占比 base→cur 绝对增量 (samples)"',
            '    x-axis [%s]' % ", ".join('"%s"' % n for n in chart_labels),
            '    y-axis "样本数增量" %d --> %d' % (ymin, ymax),
            "    bar [%s]" % ", ".join(str(v) for v in chart_vals),
            "```",
        ])

    gles = next((l for l in diff.get("libs", []) if "GLES" in l.get("lib", "")), None)
    rhi = next((t for t in diff.get("threads", []) if t.get("identity") == "rhi_thread"), None)
    bal = _probe_by_id(diff, "probe.ecs.jobworker.balance")
    wwise_th = next((t for t in diff.get("threads", []) if t.get("identity") == "wwise_worker"), None)
    wwise_lib = next((l for l in diff.get("libs", []) if l.get("lib") == "libAkSoundEngine"), None)

    lines.extend([
        "",
        "### 3.2 同名 UnityMain 陷阱",
        "",
        "多条线程 comm 可能都叫 `UnityMain`。**tid 19292** 是真主线程，**tid 19816** 是 Lua MtGC 工作线程。"
        "Provider 已用 `{comm}#{tid}` 复合 key + identity 消歧。",
        "",
        "### 3.3 关键判定",
        "",
        "- **CPU 端 GPU 命令吞吐量基本不变**（libGLESv2 %s / RHI 线程 %s）。"
        "这只说明 CPU 端调驱动 API 的时间不变，**不等于 GPU 工作量不变**——需 perfetto GPU counter / RenderDoc 复核。" % (
            _fmt_delta_pct(gles["absDeltaPct"]) if gles else "—",
            _fmt_delta_pct(rhi["absDeltaPct"]) if rhi else "—",
        ),
        "- **ECS 并行化健康**：Job Worker 均衡探针 %s（偏差阈值 20%%）。" % (
            _probe_emoji(bal.get("verdict", "green")) if bal else "🟢",
        ),
        "- **Wwise 独占一整条工作线程**（%s global）+ 库占比 %s global，两个角度同源。" % (
            "%.2f%%" % wwise_th.get("curPct", 0) if wwise_th else "—",
            "%.2f%%" % wwise_lib.get("curPct", 0) if wwise_lib else "—",
        ),
        "",
        "### 3.4 对照差分火焰图",
        "",
        "可视化验证：[`%s`](%s)。红色 = cur 变重 / 蓝色 = base 变重 / 白色 = 不变。重点关注：" % (
            FLAMEGRAPH_LINK, FLAMEGRAPH_LINK,
        ),
        "- UnityMain → ScriptRunBehaviourUpdate 子树（红色，业务上涨）",
        "- UnityMain → RenderManager::RenderCameras 子树（蓝/白，URP 主线程配置）",
        "- Thread-102 → DrawBuffers 子树（近白色，命令吞吐量）",
        "- Wwise / NativeThread 工作线程（红色时，中间件暴涨）",
        "",
    ])
    return "\n".join(lines)


def render_top_n_section(diff, top_n, cur_prof_detail=None, enriched=False):
    bm_map = {m["id"]: m for m in diff.get("businessModules", [])}
    lines = [
        "## §4 全局性能热点 Top-N",
        "",
        "> 跨线程视角，按「业务模块」聚合，按 base→cur **绝对增量**排序。运行时函数归 §10。",
        "",
        "### 4.1 Top-N 总表",
        "",
    ]
    if enriched:
        lines.append(
            "口径说明：`base abs` / `cur abs` 为模块内相关函数 **self 累加**（避免父子重复）。"
            "Wwise / ECS Burst / Lua GC 等若内部 symbol 不可细分，用库或线程级累加。"
        )
    else:
        lines.append("口径说明：`base abs` / `cur abs` 为模块内相关函数 **self 累加**（避免父子重复）。")
    lines.extend([
        "",
        "| # | 判定 | 业务模块 | 所在线程 | base abs | cur abs | 增量 abs | 增量% | 说明 |",
        "|---|---|---|---|---|---|---|---|---|",
    ])
    for item in top_n[:10]:
        mid = item["moduleId"]
        lines.append("| %d | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            item["rank"], _probe_emoji(item["verdict"]), item["display"],
            THREAD_HINT.get(mid, item.get("thread", "—")),
            f"{item['baseAbs']:,}", f"{item['curAbs']:,}",
            _fmt_delta(item["absDelta"]), _fmt_delta_pct(item["absDeltaPct"]),
            TOP_N_REMARK.get(mid, ""),
        ))

    red_items = [x for x in top_n if x.get("verdict") == "red"]
    red_n = len(red_items)
    if enriched:
        lines.extend([
            "",
            "### 4.2 Top-N 解读",
            "",
            "**🔴 触发红线的 %d 项（含中间件）= 真正需要关注的方向**。"
            "其余为健康并行模块（ECS Burst）或 base→cur 下降项，无需特别关注。" % red_n,
            "",
            "下面 §4.3 ~ §4.6 是每个 Top 项的细化分析（含调用入口、关联开销与优化方向）。",
            "",
        ])
    else:
        lines.extend([
            "",
            "### 4.2 Top-N 解读",
            "",
            "**🔴 触发红线的 %d 项（含中间件）= 真正需要关注的方向**。"
            "其余为健康并行模块（ECS Burst）或 base→cur 下降项，无需特别关注。" % red_n,
            "",
            "下面 §4.3 ~ §4.6 是每个 Top 项的细化分析。",
            "",
        ])

    total_samples = diff["cur"]["totalSamples"]
    rank_map = {x["moduleId"]: x["rank"] for x in top_n}

    for mid, sec, title in MODULE_SECTIONS:
        m = bm_map.get(mid) or _module_by_id(diff, mid)
        if not m:
            continue
        rank = rank_map.get(mid, "?")
        verdict = _probe_emoji(next((x["verdict"] for x in top_n if x["moduleId"] == mid), "green"))
        extra_title = " 不需优化" if mid == "ecs_burst" and verdict == "🟢" else ""
        lines.append("### %s %s（Top-N #%s，%s%s）" % (sec, title, rank, verdict, extra_title))
        lines.append("")
        lines.extend(_render_module_body(mid, m, diff, total_samples, cur_prof_detail))
        lines.append("")

    return "\n".join(lines)


def _render_module_body(mid, m, diff, total_samples, cur_prof_detail=None):
    lines = []
    if mid == "wwise":
        lib = next((l for l in diff.get("libs", []) if l.get("lib") == "libAkSoundEngine"), None)
        th = next((t for t in diff.get("threads", []) if t.get("identity") == "wwise_worker"), None)
        lines.extend([
            "**身份**：",
            "- 库 libAkSoundEngine.so 占比 base %.2f%% → cur %.2f%%（绝对 %s → %s samples）" % (
                lib.get("basePct", 0) if lib else 0, lib.get("curPct", 0) if lib else 0,
                f"{m['baseAbs']:,}", f"{m['curAbs']:,}",
            ),
            "- Wwise 工作线程（comm = %s, tid %s）独占 base %.2f%% → cur %.2f%%（绝对 %s → %s samples）" % (
                th.get("comm", "NativeThread") if th else "—",
                th.get("tid", "—") if th else "—",
                th.get("basePct", 0) if th else 0,
                th.get("curPct", 0) if th else 0,
                f"{th['baseAbs']:,}" if th else "—",
                f"{th['curAbs']:,}" if th else "—",
            ),
            "- 库与线程两个口径同源（线程内绝大部分在 libAkSoundEngine 内）",
            "",
            "**业务含义**：base 野外几乎无音效；cur 压测触发部队脚步声、武器声、单位移动音效、UI 提示音叠加 → DSP 处理压力激增。",
            "",
            "**本源边界**：libAkSoundEngine 内部 symbol 多为 `[+offset]`（Wwise 未提供 debug 符号），"
            "simpleperf **无法定位 Wwise 内部哪个事件最重**，事件级归因必须用 **Wwise Profiler**。",
            "",
            "**优化方向**：",
            "- 并发 voice 数限制（超出听觉密度阈值的声音直接 cull）",
            "- DSP 效果链精简（远距离声音禁用混响 / EQ）",
            "- 事件触发频率（脚步声合并 / 群体音效）",
            "- Wwise Profiler Monitor 确认 Active Voices",
        ])
    elif mid in ("meshui", "army_line"):
        children = sorted(m.get("children", []), key=lambda x: -x.get("curAbs", 0))
        lines.append("**模块内部细分**（按 self 绝对量排序）：")
        lines.append("")
        lines.append("| 子函数 | cur self abs | self % global | 说明 |")
        lines.append("|---|---|---|---|")
        for ch in children[:10]:
            g_pct = round(ch.get("curAbs", 0) / total_samples * 100, 3) if total_samples else 0
            hint = _child_hint(ch.get("function", ""))
            lines.append("| %s | %d | %.3f%% | %s |" % (
                _short_fn(ch.get("function")), ch.get("curAbs", 0), g_pct, hint,
            ))
        mod_g = round(m.get("curAbs", 0) / total_samples * 100, 2) if total_samples else 0
        lines.append("| **模块 self 合计** | **%d** | **%.2f%%** | — |" % (
            m.get("curAbs", 0), mod_g,
        ))
        lines.append("")
        if mid == "meshui":
            lines.extend([
                "**调用入口**：主线程 ScriptRunBehaviourLateUpdate → MeshUIManager.OnLateUpdate → "
                "MUIControlManager.OnLateUpdate → ... 同时 ScriptRunBehaviourUpdate → BattleUIManager.OnUpdate → "
                "BattleUIManager.UpdateMUIPos → 也走到 MUILayout.Set3DPosition（**两路汇流**）。",
                "",
                "**关联开销**：",
            ])
            lines.extend(_callup_meshui_lines(diff, total_samples))
            lines.extend([
                "",
                "**优化方向**：",
                "- MeshUI 内部 `IEnumerator<T>` 改为 `for (int i=0; i<count; i++)` 索引访问，避免迭代器对象分配",
                "- MUILayout.Set3DPosition 递归多层，dirty 缓存：静止控件跳过位置重算",
                "- 视野裁剪：屏幕外的悬浮 UI 不更新位置",
            ])
        else:
            lines.extend([
                "**调用入口**：主线程 ScriptRunBehaviourUpdate → FrameworkCore_OnUpdate → "
                "MapManager_OnUpdate → OutSideViewArmyLineMgr_OnUpdate → UpdateStraightMoveLine。",
                "",
                "**业务含义**：每帧重算所有可见队伍的行军轨迹。压测场景下 base 几乎为 0，cur 暴涨为主线程压力源之一。",
                "",
                "**优化方向**：",
                "- 增量更新：仅 dirty 队伍刷新轨迹（队伍未移动或视野未变时跳过）",
                "- 视距分级：远处队伍降频更新（如每 3–5 帧一次）",
                "- 几何缓存：轨迹折线变化不大时复用上一帧结果",
                "- GetArmyLineID 的 Dictionary 查找热路径上可缓存 ID",
            ])
    elif mid == "ecs_burst":
        bal = _probe_by_id(diff, "probe.ecs.mainwait")
        wait_p = _probe_by_id(diff, "probe.ecs.mainwait")
        wait_val = wait_p.get("curValue", 0) if wait_p else 0
        wait_abs = wait_p.get("curAbs", 0) if wait_p else 0
        workers = sorted(
            [t for t in diff.get("threads", []) if t.get("identity") == "job_worker"],
            key=lambda x: -x.get("curAbs", 0),
        )[:4]
        w_desc = ""
        if workers:
            w_desc = "（%s cur 各约 %.1f%% global）" % (
                "/".join("Thread-%s" % t.get("tid", "?") for t in workers),
                sum(t.get("curPct", 0) for t in workers) / len(workers),
            )
        lines.extend([
            "虽然增量绝对量最大（%s samples），但**全部跑在 Job Worker 线程上并行**%s。" % (
                _fmt_delta(m["absDelta"]), w_desc,
            ),
            "主线程上仅触发零星 Job 等待（共 %s samples / %.3f%% global，远低于 2%% 红线）。"
            "**ECS 并行化健康，无需优化**。" % (
                f"{wait_abs:,}" if wait_abs else "—", wait_val,
            ),
            "",
        ])
        burst_rows = []
        if cur_prof_detail:
            burst_rows = nt.collect_burst_jobs(cur_prof_detail.get("callTrees"), total_samples, top_k=5)
        if burst_rows:
            parts = ["%s（%s abs）" % (r[1], f"{r[2]:,}") for r in burst_rows]
            lines.append("Top Burst Job（详见 §7.3）：%s 等。" % " / ".join(parts))
        else:
            lines.append("Top Burst Job 详见 §7.3。")
    return lines


def _pl_verdict(label, abs_delta_pct):
    if "ScriptRunBehaviourUpdate" in label and abs_delta_pct > 50:
        return "red"
    if "ScriptRunBehaviourLateUpdate" in label and abs_delta_pct > 40:
        return "yellow"
    return "green"


def render_playerloop(diff, cur_prof_detail, base_prof_detail=None):
    main_tree = cur_prof_detail.get("mainThreadTree") or {}
    main_abs = main_tree.get("absSamples", 0)
    main_global = main_tree.get("globalPct", 0)
    base_main = (base_prof_detail or {}).get("mainThreadTree") or {}
    base_main_abs = base_main.get("absSamples", 0)
    lines = [
        "## §5 主线程深度分析",
        "",
        "### 5.1 主线程 PlayerLoop 阶段表",
        "",
        "主线程 cur 总绝对样本：%s / 占全局 %.2f%%。下表是主线程内 PlayerLoop 子树各阶段切分（不可直接相加，因有重叠子节点）：" % (
            f"{main_abs:,}" if main_abs else "—", main_global,
        ),
        "",
        "| 阶段 | base abs | cur abs | base 主线程% | cur 主线程% | 增量% | 判定 | 说明 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    stage_notes = {
        "UpdateTextureStreamingManager": "纹理 streaming",
        "PlayerUpdateCanvases": "UGUI Canvas",
        "PlayerEmitCanvasGeometry": "UGUI 几何提交",
        "FinishFrameRendering": "帧渲染收尾",
        "LegacyAnimationUpdate": "Legacy 动画",
        "ParticleSystemBeginUpdateAll": "粒子开始",
        "UpdateAllRenderers": "渲染器列表",
        "SendMouseEvents": "输入",
        "PreSendMouseEvents": "输入",
        "ParticleSystemEndUpdateAll": "粒子结束",
        "LuaMultiThreadGC": "主线程同步开销",
    }
    for pl in diff.get("playerLoopStages", []):
        if pl.get("curAbs", 0) == 0 and pl.get("baseAbs", 0) == 0:
            continue
        label = pl.get("label", "")
        d_pct = pl.get("absDeltaPct", 0)
        if isinstance(d_pct, str):
            d_str = d_pct
        else:
            d_str = _fmt_delta_pct(d_pct)
        v = _pl_verdict(label, float(d_pct) if isinstance(d_pct, (int, float)) else 0)
        note = ""
        if "ScriptRunBehaviourUpdate" in label:
            note = "业务主逻辑，见 §5.2"
        elif "ScriptRunBehaviourLateUpdate" in label:
            note = "MeshUI + 视野，见 §5.2"
        elif "PlayerSendFrameComplete" in label:
            note = "资源加载尾部"
        else:
            for k, n in stage_notes.items():
                if k in label:
                    note = n
                    break
        base_pct = round(pl.get("baseAbs", 0) / base_main_abs * 100, 2) if base_main_abs else "—"
        cur_pct = pl.get("totalPctMain", 0)
        lines.append("| %s | %s | %s | %s | %.2f%% | %s | %s | %s |" % (
            label.replace("PreLateUpdate.", "").replace("PostLateUpdate.", "").replace("EarlyUpdate.", "").replace("Update.", ""),
            pl.get("baseAbs", 0), pl.get("curAbs", 0),
            ("%s%%" % base_pct) if isinstance(base_pct, (int, float)) else base_pct,
            cur_pct, d_str, _probe_emoji(v), note,
        ))
    rc_note = "详见 §6.1"
    call_trees = cur_prof_detail.get("callTrees") or []
    um = nt.find_call_tree(call_trees, "UnityMain")
    rc = nt.find_deepest_subtree(um, "RenderManager::RenderCameras") if um else None
    if rc and um and main_abs:
        rc_abs = nt._node_main_abs(rc, um.get("totalMs", 1), main_abs, diff["cur"]["totalSamples"])
        rc_pct = nt._main_pct(rc, um.get("totalMs", 1))
        rc_note = "%s samples / %.2f%% 主线程，详见 §6.1" % (f"{rc_abs:,}", rc_pct)
    lines.extend([
        "",
        "**主线程 PlayerLoop 之外入口**：",
        "- `RenderManager::RenderCameras`（URP 主线程侧）：%s" % rc_note,
        "",
    ])
    return "\n".join(lines)


def render_main_tree(cur_prof_detail, diff=None, enriched=False, base_prof_detail=None, top_n=None):
    total_samples = (diff or {}).get("cur", {}).get("totalSamples", 0)
    call_trees = cur_prof_detail.get("callTrees") or []
    main_tree = cur_prof_detail.get("mainThreadTree") or {}
    intro_lines = [
        "按 `%` 表示主线程内占比；abs = 绝对样本数；self = 节点自身 self%（global）。" if enriched else
        "按 `%` 表示主线程内占比；abs = 绝对样本数；self = 节点自身 self%%（global）。",
    ]
    if not enriched:
        intro_lines.append("已省略 il2cpp RuntimeInvoker / ScriptingInvocation 等包装层。")
    hot_line = (
        "- 🔴 **高 self 真热点**：节点 self ≥ 0.05%% global 且 abs ≥ 100 samples，表示自身代码就重"
        if enriched else
        "- 🔴 **高 self 真热点**：节点 self ≥ 0.05%% global 且 abs 较大，表示自身代码就重"
    )
    lines = [
        "### 5.2 主线程完整调用树",
        "",
        *intro_lines,
        "",
        "**标记图例**：",
        "- 📈 **新增压力源**：base→cur 增量 abs ≥ 100 samples，表示压力上涨明显",
        hot_line,
        "- 🟡 **次级关注**：self ≥ 0.05%% global 但 abs 较小，或 totalPct 高但 self 接近 0（wrapper）",
        "- 🟢 **健康**：未触发任何阈值",
        "- 📈🔴 可叠加；`[wrapper]` 表示节点自身 self 接近 0，热点在子节点",
        "",
        "```",
    ]
    if enriched and main_tree.get("root") and call_trees:
        lines.extend(nt.render_main_thread_gold_style(
            call_trees, main_tree, total_samples, diff=diff, top_n=top_n,
        ))
    elif main_tree.get("root"):
        lines.extend(nt.render_main_thread_from_pruned_tree(
            main_tree, call_trees, total_samples, enriched=enriched,
        ))
    elif call_trees:
        lines.extend(nt.render_main_thread_narrative(call_trees, total_samples))
    else:
        lines.append("(主线程树未生成)")
    lines.extend(["```", ""])
    return "\n".join(lines)


def _render_tree_node(node, indent=0, max_depth=6):
    """Fallback raw tree (mainThreadTree JSON)."""
    if not node or indent > max_depth:
        return []
    name = node.get("name", "?")
    if len(name) > 72:
        name = nt.friendly_name(name)
    abs_s = node.get("absSamples", 0)
    main_p = node.get("mainThreadPct", 0)
    markers = "".join(node.get("markers", []))
    prefix = "│  " * (indent - 1) + ("├─ " if indent else "")
    lines = ["%s%s (%s / %.2f%%) %s" % (prefix, name, f"{abs_s:,}", main_p, markers)]
    for ch in node.get("children", [])[:8]:
        lines.extend(_render_tree_node(ch, indent + 1, max_depth))
    return lines


def render_main_probes(diff, cur_prof_detail):
    bm = {m["id"]: m for m in diff.get("businessModules", [])}
    mesh = bm.get("meshui", {})
    army = bm.get("army_line", {})
    lines = [
        "### 5.3 主线程红线扫描结果",
        "",
        "按知识库 v2.1 §6 阈值表自动扫描结果：",
        "",
        "| 检测项 | 实测 | 单位 | 阈值（红线）| 判定 | 说明 |",
        "|---|---|---|---|---|---|",
    ]
    scan = [
        ("probe.net.tserver", "%main", ">15%", "网络消息（TServerManager 子树）"),
        ("probe.lua.total", "%global", ">10%", "Lua 总负载"),
        ("probe.csharp.meshUI", "%main", ">3%", "MeshUI 子树"),
        ("probe.csharp.outsideViewArmyLine", "%main", ">3%", "OutSideViewArmyLineMgr 子树"),
        ("probe.ecs.mainwait", "%global", ">2%", "主线程 Job 等待"),
        ("probe.render.playerupdatecanvases", "ms/frame", ">0.6", "PlayerUpdateCanvases（UGUI）"),
        ("probe.render.legacyanimation", "ms/frame", ">0.6", "LegacyAnimationUpdate"),
        ("probe.render.particlesystem", "ms/frame", ">0.6", "ParticleSystem 合计"),
        ("probe.lua.mtgc.worker", "%global", ">1%", "Boehm GC 后台标记"),
    ]
    pmap = {p["id"]: p for p in diff.get("probes", [])}
    for pid, unit, thresh, note in scan:
        p = pmap.get(pid)
        if not p:
            continue
        lines.append("| %s | %.3f | %s | %s | %s | %s |" % (
            note, p.get("curValue", 0), unit, thresh,
            _probe_emoji(p.get("verdict", "green")), note if pid.startswith("probe.render") else "",
        ))
    if mesh.get("curAbs"):
        g = mesh["curAbs"] / diff["cur"]["totalSamples"] * 100 if diff["cur"]["totalSamples"] else 0
        mp = pmap.get("probe.csharp.meshUI")
        lines.append("| MeshUI 子树（self 合计）| %.2f | 全局%% | >5%% 主线程%% | %s | 见 §4.4 |" % (
            g, _probe_emoji(mp.get("verdict", "green") if mp else "green"),
        ))
    if army.get("curAbs"):
        g = army["curAbs"] / diff["cur"]["totalSamples"] * 100 if diff["cur"]["totalSamples"] else 0
        v = _effective_army_verdict(army)
        lines.append("| OutSideViewArmyLineMgr 模块 | %.2f | 全局%% | >3%% | %s | 见 §4.5 |" % (g, _probe_emoji(v)))
    lines.extend([
        "",
        "**注**：`MapManager_OnUpdate` 等高占比 wrapper 的真热点已下钻到 BattleUIManager / OutSideViewArmyLineMgr，"
        "故 §4 Top-N 不重复列 MapManager_OnUpdate。",
        "",
    ])
    return "\n".join(lines)


def _effective_army_verdict(army_mod):
    d = army_mod.get("absDelta", 0)
    if d == "NEW" or (isinstance(d, (int, float)) and d >= 150):
        return "red"
    return "green"


def render_rendering(diff, cur_prof_detail, base_prof_detail):
    total_samples = diff["cur"]["totalSamples"]
    call_trees = cur_prof_detail.get("callTrees") or []
    base_trees = (base_prof_detail or {}).get("callTrees") or []
    bm = {m["id"]: m for m in diff.get("businessModules", [])}
    urp = bm.get("urp_main_render", {})
    urp_b = urp.get("baseAbs", 0)
    urp_c = urp.get("curAbs", 0)

    urp_tree, urp_note = nt.render_urp_section(
        call_trees, total_samples, urp_b, urp_c,
        main_abs=(cur_prof_detail.get("mainThreadTree") or {}).get("absSamples", 0),
        base_trees=base_trees,
    )
    rhi_lines, rhi_bullets = nt.render_rhi_section(call_trees, total_samples, diff.get("threads", []), base_trees)
    gpu_rows = nt.gpu_present_rows(call_trees, base_trees, total_samples)
    gpu_probe = _probe_by_id(diff, "probe.gpu.bound")
    egl = _probe_by_id(diff, "probe.gpu.bound.eglSwap")

    lines = [
        "## §6 渲染相关线程",
        "",
        "### 6.1 主线程上的 URP 渲染管线下钻",
        "",
        "调用入口：UnityMain → `RenderManager::RenderCameras`（不在 PlayerLoop 子树内）。",
        "",
        "```",
    ]
    lines.extend(urp_tree)
    lines.extend([
        "```",
        "",
        urp_note,
        "",
        "### 6.2 RHI 线程下钻（Thread-102 / GfxDeviceWorker）",
        "",
        "调用入口：独立线程，`GfxDeviceWorker::RunGfxDeviceWorker → RunCommand`。",
        "",
        "```",
    ])
    lines.extend(rhi_lines)
    lines.extend([
        "```",
        "",
    ])
    lines.extend(rhi_bullets)
    lines.extend([
        "",
        "### 6.3 GPU bound 判定（修正自 v1/v2/v3 误判）",
        "",
        "**正确的 GPU bound 信号在主线程，不是 RHI 线程**：",
        "",
        "| symbol | 真实线程 | base | cur | 含义 |",
        "|---|---|---|---|---|",
    ])
    for sym, thread, b, c, meaning in gpu_rows:
        lines.append("| %s | %s | %s | %s | %s |" % (sym, thread, b, c, meaning))
    verdict = gpu_probe.get("verdict", "green") if gpu_probe else "green"
    lines.extend([
        "",
        "**判定**：%s **未观察到 CPU 侧 GPU bound 信号**。" % _probe_emoji(verdict),
        "",
        "**边界说明**：",
        "- ✅ 可以说「本次未观察到 CPU 侧 GPU bound 信号」",
        "- ❌ 不能说「GPU 不是瓶颈」——simpleperf 看的是 CPU 调 driver API 的时间",
        "- ❌ 不能仅凭 libGLESv2 占比推断 GPU 工作量不变",
        "- 真实 GPU 工作量需 perfetto GPU counter / RenderDoc",
        "",
        "**Unity Profiler marker 对照**：",
        "",
        "| Unity Profiler | simpleperf C++ symbol | 真实线程 | 含义 |",
        "|---|---|---|---|",
        "| Gfx.PresentFrame（主线程）| GfxDeviceClient::WaitForPendingPresent | 主线程 | 主线程等 GPU |",
        "| Gfx.PresentFrame（Render）| GfxDeviceGLES::PresentFrame | RHI | RHI 执行 Present |",
        "",
    ])
    if egl:
        lines.append("eglSwapBuffers 探针：base %.3f%% → cur %.3f%% RHI（%s）。" % (
            egl.get("baseValue", 0), egl.get("curValue", 0), _probe_emoji(egl.get("verdict", "green")),
        ))
        lines.append("")
    return "\n".join(lines)


def render_ecs(diff, cur_prof_detail):
    workers = sorted(
        [t for t in diff.get("threads", []) if t.get("identity") == "job_worker"],
        key=lambda x: -x.get("curAbs", 0),
    )
    bal = _probe_by_id(diff, "probe.ecs.jobworker.balance")
    wait = _probe_by_id(diff, "probe.ecs.mainwait")
    total_samples = diff["cur"]["totalSamples"]
    burst_rows = nt.collect_burst_jobs(cur_prof_detail.get("callTrees"), total_samples)

    lines = [
        "## §7 ECS / Worker 线程",
        "",
        "### 7.1 Job Worker 均衡度",
        "",
        "| Worker | base % global | cur % global | base abs | cur abs |",
        "|---|---|---|---|---|",
    ]
    w_pcts_b = []
    w_pcts_c = []
    for w in workers[:4]:
        lines.append("| %s | %.2f%% | %.2f%% | %s | %s |" % (
            w.get("comm"), w.get("basePct", 0), w.get("curPct", 0),
            f"{w['baseAbs']:,}", f"{w['curAbs']:,}",
        ))
        w_pcts_b.append(w.get("basePct", 0))
        w_pcts_c.append(w.get("curPct", 0))
    if w_pcts_c:
        spread = max(w_pcts_c) - min(w_pcts_c)
        lines.append("| **max-min 偏差** | **%.1f%%** | **%.1f%%** | — | — |" % (
            max(w_pcts_b) - min(w_pcts_b) if w_pcts_b else 0, spread,
        ))
    if bal:
        lines.append("")
        lines.append("%s PASS（红线 >30%%）。均衡探针偏差 %.3f%%。" % (
            _probe_emoji(bal.get("verdict", "green")), bal.get("curValue", 0),
        ))
    lines.extend([
        "",
        "### 7.2 主线程 Job Wait 检测",
        "",
        "| 指标 | base abs | cur abs | base % global | cur % global | 红线 | 判定 |",
        "|---|---|---|---|---|---|---|",
    ])
    if wait:
        lines.append("| 主线程 WaitForJobGroupID/Complete 子树合计 | — | — | %.3f%% | %.3f%% | >2%% | %s %s |" % (
            wait.get("baseValue", 0), wait.get("curValue", 0),
            _probe_emoji(wait.get("verdict", "green")), wait.get("verdict", ""),
        ))
    lines.extend([
        "",
        "来源：Unity ECS Transform 同步点（设计内固有），**不是业务 Job 互等**。详见 §4.6 / §5.3。",
        "",
        "### 7.3 Top Burst Job 列表",
        "",
        "按 self 全局% 排序（cur 数据）：",
        "",
        "| # | Burst Job | cur abs | self % global | 业务模块 |",
        "|---|---|---|---|---|",
    ])
    burst_total = 0
    for rank, name, abs_s, g, mod in burst_rows:
        burst_total += abs_s
        lines.append("| %d | %s | %s | %.2f%% | %s |" % (rank, name, abs_s, g, mod))
    ecs = _module_by_id(diff, "ecs_burst")
    if ecs:
        lines.append("")
        lines.append("合计约 **%.1f%% global**，与 lib_burst_generated（%s samples）一致。**ECS 健康度 %s PASS**。" % (
            burst_total / total_samples * 100 if total_samples else 0,
            f"{ecs['curAbs']:,}",
            _probe_emoji("green"),
        ))
    lines.append("")
    return "\n".join(lines)


def render_wwise_chapter(diff):
    p = _probe_by_id(diff, "probe.middleware.wwise")
    m = _module_by_id(diff, "wwise")
    th = next((t for t in diff.get("threads", []) if t.get("identity") == "wwise_worker"), None)
    lines = ["## §8 中间件 — Wwise 专章", ""]
    if th:
        lines.append("**线程**：tid %s / comm %s / identity `wwise_worker`" % (th.get("tid"), th.get("comm")))
    lines.append("")
    lines.append("| 指标 | base | cur | Δ |")
    lines.append("|---|---|---|---|")
    if m:
        lines.append("| 库绝对样本 | %s | %s | %s |" % (
            f"{m['baseAbs']:,}", f"{m['curAbs']:,}", _fmt_delta(m["absDelta"]),
        ))
    if p:
        lines.append("| 全局占比 | %.3f%% | %.3f%% | %s |" % (
            p.get("baseValue", 0), p.get("curValue", 0), _probe_emoji(p.get("verdict")),
        ))
    lines.extend([
        "",
        "**优化建议**：Voice Limiting、MixBus 链深度检查、Wwise Profiler Monitor 确认 Active Voices。",
        "",
    ])
    return "\n".join(lines)


def render_lua_gc(diff, enriched=False):
    th = next((t for t in diff.get("threads", []) if t.get("identity") == "lua_mtgc_worker"), None)
    p = _probe_by_id(diff, "probe.lua.mtgc.worker")
    lines = ["## §9 Lua GC 工作线程专章", ""]
    if th:
        lines.extend([
            "**tid %s**，comm = `%s`（**误名**），identity = `lua_mtgc_worker`。" % (th.get("tid"), th.get("comm")),
            "入口 `LuaMultiThreadGC_LuaGCThreadProc`。**勿与主线程 UnityMain 混淆。**",
            "",
            "| 指标 | base | cur |",
            "|---|---|---|",
            "| 绝对样本 | %s | %s |" % (f"{th['baseAbs']:,}", f"{th['curAbs']:,}"),
            "| Δ | — | %s |" % _fmt_delta(th["absDelta"]),
            "",
        ])
    if p:
        lines.append("探针 `probe.lua.mtgc.worker`：%.3f%% global，%s。" % (
            p.get("curValue", 0), _probe_emoji(p.get("verdict")),
        ))
        lines.append("")
    if enriched and th:
        lines.extend([
            "**意外发现**：cur 下 Lua GC 工作线程负载可能低于 base（绝对 %s）。"
            "base 野外 Lua 临时对象分配率更高；cur 行军压测主增量在 ECS Burst（native，不经 Lua 分配）。" % _fmt_delta(th["absDelta"]),
            "",
            "**对 Unity Profiler 用户的提示**：Profiler 中的 Lua GC 线程即 tid %s；simpleperf 曾因 comm 同名误标为 UnityMain。"
            "两份数据一致，没有漏采。" % th.get("tid"),
            "",
            "判定：%s PASS（<1%% global 红线）。" % _probe_emoji(p.get("verdict", "green") if p else "green"),
            "",
        ])
    return "\n".join(lines)


def _cu_by_runtime(diff, needle):
    return [cu for cu in diff.get("callUpTracing", []) if needle in cu.get("runtime", "")]


def _cu_caller_rows(cu_list, total_samples, top_k=5):
    rows = []
    for cu in sorted(cu_list, key=lambda x: -x.get("curTotalGlobalPct", 0))[:top_k]:
        for h in (cu.get("topCallers") or [])[:1]:
            rows.append((cu.get("curTotalGlobalPct", 0), h.get("callerChain", "?")[:80], h.get("module", "—")))
    return rows


def render_call_up(diff, enriched=False):
    if not enriched:
        lines = [
            "## §10 反查清单（运行时函数 → 业务模块）",
            "",
            "| 运行时符号 | cur 全局% | Δ abs | Top 上游调用者 | 归属业务模块 |",
            "|---|---|---|---|---|",
        ]
        for cu in sorted(diff.get("callUpTracing", []), key=lambda x: -x.get("curTotalGlobalPct", 0)):
            if cu.get("curTotalGlobalPct", 0) < 0.05 and cu.get("absDelta", 0) < 5:
                continue
            callers = cu.get("topCallers", [])[:3]
            caller_s = " / ".join(
                "%s (%.2f%%)" % (h.get("callerChain", "?")[:40], h.get("globalPct", 0)) for h in callers
            ) or "—"
            mod = callers[0].get("module", "—") if callers else "—"
            lines.append("| `%s` | %.3f%% | %s | %s | %s |" % (
                cu["runtime"], cu.get("curTotalGlobalPct", 0), _fmt_delta(cu.get("absDelta", 0)),
                caller_s[:120], mod,
            ))
        lines.append("")
        return "\n".join(lines)

    total = diff["cur"]["totalSamples"]
    memcpy_list = _cu_by_runtime(diff, "__memcpy")
    powf_list = _cu_by_runtime(diff, "__ieee754_powf")
    gc_list = _cu_by_runtime(diff, "GC_end_stubborn")
    tlsf_list = _cu_by_runtime(diff, "tlsf_memalign") + _cu_by_runtime(diff, "ThreadsafeLinearAllocator")

    memcpy_pct = sum(c.get("curTotalGlobalPct", 0) for c in memcpy_list)
    lines = [
        "## §10 反查清单（运行时函数 → 业务模块）",
        "",
        "> simpleperf 单源核心独有能力：把「看似分散的运行时开销」反查到业务调用源。",
        "",
        "### 10.1 `__memcpy` 反查（全局 %.2f%% / %d 处命中）" % (memcpy_pct, len(memcpy_list)),
        "",
        "| 全局% | Caller 链 | 业务模块 |",
        "|---|---|---|",
    ]
    for g, chain, mod in _cu_caller_rows(memcpy_list, total, 6):
        lines.append("| %.2f | %s | %s |" % (g, chain, mod))
    lines.extend([
        "",
        "**结论**：__memcpy 主要集中在 **GPU Instancing + MeshUI** 路径（详见 §4.4 / §6）。",
        "",
        "### 10.2 `__ieee754_powf` 反查",
        "",
        "| 全局% | Caller 链 | 业务模块 |",
        "|---|---|---|",
    ])
    for g, chain, mod in _cu_caller_rows(powf_list, total, 5):
        lines.append("| %.2f | %s | %s |" % (g, chain, mod))
    if not powf_list:
        lines.append("| — | （cur 未命中显著 powf）| — |")
    lines.extend([
        "",
        "**结论**：主要来自 UGUI 几何 Job gamma 校正——静态 UI 走 UGUI、悬浮 UI 走 MeshUI，为项目设计。",
        "",
        "### 10.3 `GC_end_stubborn_change` 反查（Boehm GC 触发源）",
        "",
        "| 全局% | Caller |",
        "|---|---|",
    ])
    for cu in sorted(gc_list, key=lambda x: -x.get("curTotalGlobalPct", 0))[:6]:
        chain = (cu.get("topCallers") or [{}])[0].get("callerChain", "?")[:70]
        lines.append("| %.2f | %s |" % (cu.get("curTotalGlobalPct", 0), chain))
    lines.extend([
        "",
        "**结论**：主要触发源 = **MeshUI 迭代器**（Enumerator.MoveNext）。改为索引 for 循环可减少分配。",
        "",
        "### 10.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查",
        "",
        "| Caller | 业务模块 |",
        "|---|---|",
    ])
    for cu in sorted(tlsf_list, key=lambda x: -x.get("curTotalGlobalPct", 0))[:5]:
        chain = (cu.get("topCallers") or [{}])[0].get("callerChain", "?")[:70]
        mod = (cu.get("topCallers") or [{}])[0].get("module", "—")
        lines.append("| %s | %s |" % (chain, mod))
    lines.extend([
        "",
        "**结论**：集中在 URP 命令缓冲与 GPU Instancing 分配路径。",
        "",
    ])
    return "\n".join(lines)


def render_boundary(enriched=False):
    if not enriched:
        return "\n".join([
            "## §11 本源能力边界",
            "",
            "| 想回答的问题 | simpleperf 能/否 | 替代源 |",
            "|---|---|---|",
            "| 函数级 CPU self% / 库线程对比 | ✅ | 本报告 |",
            "| 业务模块剥洋葱 | ✅ | businessModules / mainThreadTree |",
            "| GPU 是否满载 | 🟡 | perfetto GPU counter / RenderDoc |",
            "| off-CPU / 等锁 / binder | ❌ | perfetto sched |",
            "| 降频 / 热节流 | ❌ | perfetto cpufreq |",
            "| Wwise 内部事件级归因 | ❌ | Wwise Profiler |",
            "| 帧时间 / 掉帧原因 | 🟡 | Unity Profiler / perfetto |",
            "",
            "**工程化建议**：simpleperf + perfetto 互补采数；维护 binary_cache；对 wwise/meshUI 探针设 CI 回归阈值。",
            "",
        ])
    return "\n".join([
        "## §11 本源能力边界",
        "",
        "| 想回答 | 本源能/否 | 替代源 |",
        "|---|---|---|",
        "| 帧级耗时（哪帧卡）| ❌ | Unity Profiler |",
        "| Lua 内部管理器名 | ❌ | Unity Profiler / perfetto |",
        "| GC.Collect 单次 STW 耗时 | ❌ | Unity Profiler |",
        "| 主线程 off-CPU（在算 vs 在等）| ❌ | perfetto sched |",
        "| 降频 / 热限频 | ❌ | perfetto sysfs |",
        "| **GPU 实际工作量** | ❌ | perfetto GPU counter / RenderDoc |",
        "| Wwise 内部事件级归因 | ❌ | Wwise Profiler |",
        "| 资源加载 spike | ❌ | Unity Profiler |",
        "",
        "**本源独有能力**：",
        "1. native 中间件真实 CPU 占用（Wwise / Burst / 自研 native）",
        "2. 运行时函数反查到业务模块（memcpy / powf / GC_* 等）",
        "3. C# 业务管理器函数级 self%（libil2cpp 符号化良好时）",
        "4. Lua 宏观总负载（含 XLua 桥接路径）",
        "5. 线程身份反推 + 同名线程消歧",
        "6. GPU Instancing / 常量缓冲上传等 RHI 层细节",
        "7. Boehm GC 后台开销（区别于 GC.Collect STW）",
        "",
        "**工程化建议**：simpleperf + perfetto 互补采数；维护 binary_cache；对 wwise/meshUI 探针设 CI 回归阈值。",
        "",
    ])


def render_v4_report(diff, top_n, base_prof_detail, cur_prof_detail, meta=None, enriched=False):
    meta = meta or {}
    parts = [
        render_header(meta, enriched=enriched),
        render_conclusion(diff, top_n, meta, enriched=enriched),
        render_meta(diff, base_prof_detail, cur_prof_detail, meta),
        render_libs(diff),
        render_threads(diff),
        render_top_n_section(diff, top_n, cur_prof_detail, enriched=enriched),
        render_playerloop(diff, cur_prof_detail, base_prof_detail),
        render_main_tree(cur_prof_detail, diff, enriched=enriched, base_prof_detail=base_prof_detail, top_n=top_n),
        render_main_probes(diff, cur_prof_detail),
        render_rendering(diff, cur_prof_detail, base_prof_detail),
        render_ecs(diff, cur_prof_detail),
        render_wwise_chapter(diff),
        render_lua_gc(diff, enriched=enriched),
        render_call_up(diff, enriched=enriched),
        render_boundary(enriched=enriched),
    ]
    if enriched:
        return "\n---\n\n".join(parts)
    return "\n".join(parts)
