"""perf_provider.py - SimpleperfProvider (源 id = simpleperf)。

职责 (出数据, 确定性代码): 解析 perf.data → 产出统一 PerfProfile 片段, 与 unity_profiler
Provider 同一份磁盘 JSON 契约 (web/shared/perf-model.ts), 供 web 侧 ingest 入库。

  - core.metrics: 按 docs/metric-key-naming-spec.md 写 key
        cpu.lib.<so>.pct / cpu.thread.<t>.pct / cpu.func.<f>.selfPct / cpu.anchor.<a>.subtreePct
  - core.frame/threads/system: simpleperf 不产 (frame=perfetto/unity; 调度态线程=perfetto)
  - detail.simpleperf: { symbolCheck, callTrees[](节点带 layer), anchors[], foldedPath,
        flamegraphPath, event, threadCpuMs, layerBreakdown }

复用现有分析逻辑 (loader / single_profile / anchor_compare), 不重写采样统计。
依据: docs/report-spec-and-data-contract.md §4/§7 (验收契约), §1.5 (统一 CallTree),
      docs/metric-key-naming-spec.md, docs/data-sources-guide.md §2/§6, 决策 8 (layer 分层)。

注意: simpleperf 分析依赖 NDK 的 report_html.RecordData (纯 Python), 故 Provider 必须 Python;
产出的 simpleperf-profile.json 与 unity-profile.json 同构, web 侧 ingest-run.ts 通用读取。
"""

import os
import re

from . import config, single_profile, anchor_compare

SOURCE = "simpleperf"
SCHEMA_VERSION = 1  # 必须与 web/shared/perf-model.ts 的 PERF_PROFILE_SCHEMA_VERSION 一致
SCALE = config.TIME_SCALE_NS  # ns -> ms

# ------------------------------------------------------------
# 分层 (决策 8): 节点按所属 .so 归类 业务/引擎/运行时/噪音
# ------------------------------------------------------------
# business: 游戏自身代码 (IL2CPP 转译的 C#、Lua、Burst job、自研 native)
# engine:   Unity 引擎 + 中间件
# runtime:  C/C++ 运行时、ART、GPU 驱动、系统库
# noise:    内核、未知、空转 (不可优化或非应用代码)
_LAYER_TOKENS = {
    "business": [
        "libil2cpp.so", "libxlua.so", "lib_burst_generated.so",
        "libAOENative", "libTBUNative", "libGameNative",
        "base.odex", "base.vdex", "base.oat", "classes",
    ],
    "engine": [
        "libunity.so", "libmain.so", "libAkSoundEngine", "libUE", "libfmod",
    ],
    "runtime": [
        "libc.so", "libm.so", "libc++", "libstdc++", "libdl", "liblog",
        "libart", "libandroid_runtime", "libnativehelper",
        "libGLESv2", "libEGL", "libgsl", "libadreno", "libutils", "libutilscallstack",
        "libz.so", "libssl", "libcrypto", "libbinder", "libcutils",
    ],
    "noise": [
        "[kernel.kallsyms]", "[unknown]", "swapper", "[vdso]", "/system/bin",
    ],
}


def classify_layer(lib_basename):
    """按 .so basename 归一化到 业务/引擎/运行时/噪音 之一。默认 runtime。"""
    if not lib_basename:
        return "noise"
    for layer, tokens in _LAYER_TOKENS.items():
        for tok in tokens:
            if tok in lib_basename:
                return layer
    return "runtime"


# ------------------------------------------------------------
# 命名 (metric-key-naming-spec §2: 实体段保留大小写, 含 '.' 改 '_')
# ------------------------------------------------------------
_LIB_EXT = re.compile(r"\.(so|odex|vdex|oat|apk|dex)(\[|$)")


def sanitize_lib(lib_basename):
    """libil2cpp.so -> libil2cpp; lib含其他点 -> 下划线。"""
    name = lib_basename
    # 去常见扩展名 (与命名规范示例 cpu.lib.libil2cpp.pct 对齐)
    m = _LIB_EXT.search(name)
    if m:
        name = name[: m.start()]
    name = name.strip("[]")
    return re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_") or "unknown"


def sanitize_thread(name):
    return re.sub(r"[^A-Za-z0-9_]+", "_", name or "unknown").strip("_") or "unknown"


def sanitize_func(name, max_len=80):
    s = re.sub(r"[^A-Za-z0-9_]+", "_", name or "").strip("_")
    if len(s) > max_len:
        s = s[:max_len].rstrip("_")
    return s or "anon"


_UNSYM = re.compile(r"\[\+(0x)?[0-9a-fA-F]+\]|\[unknown\]")


def is_unsymbolized(func_name):
    """未还原符号: 形如 dso[+offset] / [kernel.kallsyms][+ffff..] / [unknown] / 空。"""
    if not func_name:
        return True
    return bool(_UNSYM.search(func_name))


# ------------------------------------------------------------
# 调用树: loader 的 per-thread call_graph -> 统一 CallTreeNode (§1.5)
#
# NDK `g` 图在线程根下是「多棵栈前缀并列」(forest), 不是单条完整调用链。
# 展示时: 标注 JobQueue::WorkLoop 等入口帧; top 分支保留热路径祖先 (NDK g 图为 forest)。
# ------------------------------------------------------------
# 越靠前优先级越高 (同线程多命中时优先 WorkLoop 而非析构/单测符号)
_ENTRY_PRIORITY = [
    "JobQueue::WorkLoop",
    "ExecutePlayerLoop",
    "GfxDeviceWorker::RunCommand",
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
    "BackgroundJobQueue",
    "WorkerThread::Run",
]


def _entry_rank(func_name):
    if not func_name or func_name.startswith("Thread-"):
        return None
    if "~" in func_name:  # 析构等不适合做展示根
        return None
    for i, hint in enumerate(_ENTRY_PRIORITY):
        if hint in func_name:
            return i
    return None


def _iter_cg_nodes(node):
    yield node
    for c in node.get("child_graph", []):
        yield from _iter_cg_nodes(c)


def _find_best_entry_node(cg):
    """在线程合并栈中找优先级最高且 subtree 最大的引擎入口帧。"""
    best = None
    best_rank = 999
    best_ec = 0
    for node in _iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        rank = _entry_rank(fn)
        if rank is None:
            continue
        ec = node["subtree_event_count"]
        if rank < best_rank or (rank == best_rank and ec > best_ec):
            best = node
            best_rank = rank
            best_ec = ec
    return best


def _lib_base(profile, lib_id):
    name = profile.lib_name(lib_id)
    return name.rsplit("/", 1)[-1] if name else ""


def _mark_hot_cg_nodes(node, thread_ec, min_pct, marks, depth=0, max_depth=40):
    """标记需保留的节点: 子树占比达标, 或位于热叶子的祖先链上。"""
    if thread_ec <= 0:
        marks[id(node)] = True
        return True
    sub_pct = node["subtree_event_count"] / thread_ec * 100.0
    self_pct = node["event_count"] / thread_ec * 100.0
    hot = sub_pct >= min_pct or self_pct >= min_pct * 0.15
    child_hot = False
    if depth < max_depth:
        for c in node.get("child_graph", []):
            if _mark_hot_cg_nodes(c, thread_ec, min_pct, marks, depth + 1, max_depth):
                child_hot = True
    keep = hot or child_hot
    marks[id(node)] = keep
    return keep


def _to_unified_node_thread(
    profile,
    node,
    thread_ec,
    marks,
    max_depth,
    depth=0,
):
    """线程内口径 (thread_ec) 构建统一节点; 仅输出 marks 中的路径。"""
    if not marks.get(id(node), False):
        return None
    self_ec = node["event_count"]
    sub_ec = node["subtree_event_count"]
    lib_base = _lib_base(profile, node.get("lib_id", -1))
    name = node["func_name"] or "[root]"
    children = []
    if depth < max_depth:
        kids = sorted(node["child_graph"], key=lambda c: c["subtree_event_count"], reverse=True)
        for c in kids:
            child = _to_unified_node_thread(profile, c, thread_ec, marks, max_depth, depth + 1)
            if child:
                children.append(child)
    out = {
        "name": name,
        "selfMs": round(self_ec / SCALE, 3),
        "totalMs": round(sub_ec / SCALE, 3),
        "selfPct": round(self_ec / thread_ec * 100.0, 3) if thread_ec else 0.0,
        "totalPct": round(sub_ec / thread_ec * 100.0, 3) if thread_ec else 0.0,
        "children": children,
    }
    if lib_base:
        out["layer"] = classify_layer(lib_base)
    return out


def _to_unified_node(profile, node, grand_total_ec, min_pct, max_depth, depth=0):
    """lib 调用树节点 -> 统一节点; 按 totalPct>=min_pct 且 depth<=max_depth 剪枝。"""
    self_ec = node["event_count"]
    sub_ec = node["subtree_event_count"]
    lib_base = _lib_base(profile, node.get("lib_id", -1))
    name = node["func_name"] or "[root]"
    children = []
    if depth < max_depth:
        kids = sorted(node["child_graph"], key=lambda c: c["subtree_event_count"], reverse=True)
        for c in kids:
            if grand_total_ec and (c["subtree_event_count"] / grand_total_ec * 100.0) < min_pct:
                continue
            children.append(_to_unified_node(profile, c, grand_total_ec, min_pct, max_depth, depth + 1))
    out = {
        "name": name,
        "selfMs": round(self_ec / SCALE, 3),
        "totalMs": round(sub_ec / SCALE, 3),
        "selfPct": round(self_ec / grand_total_ec * 100.0, 3) if grand_total_ec else 0.0,
        "totalPct": round(sub_ec / grand_total_ec * 100.0, 3) if grand_total_ec else 0.0,
        "children": children,
    }
    if lib_base:
        out["layer"] = classify_layer(lib_base)
    return out


def _thread_call_trees(profile, grand_total_ec, top_threads, min_pct, max_depth):
    """取 CPU 占比最高的若干线程, 各产一棵「有上下文」的 CallTree。"""
    threads = []
    for pname, thread in profile.iter_threads():
        threads.append((thread["event_count"], pname, thread))
    threads.sort(key=lambda x: x[0], reverse=True)

    trees = []
    for ec, _pname, thread in threads[:top_threads]:
        if grand_total_ec and (ec / grand_total_ec * 100.0) < 1.0:
            break
        thread_ec = ec or 1
        cg = thread["call_graph"]
        tname = thread["thread_name"]
        entry = _find_best_entry_node(cg)

        # 一律用 top 分支 + 路径保留 (避免 forest 根 siblings 误读); 入口帧仅作标注
        branches = sorted(cg.get("child_graph", []), key=lambda c: c["subtree_event_count"], reverse=True)
        children = []
        for branch in branches[:4]:
            marks = {}
            _mark_hot_cg_nodes(branch, thread_ec, min_pct, marks, max_depth=max_depth)
            u = _to_unified_node_thread(profile, branch, thread_ec, marks, max_depth)
            if u:
                children.append(u)

        root_name = tname
        if entry and entry.get("func_name") and entry["func_name"] != tname:
            root_name = "%s → %s" % (tname, entry["func_name"])

        root = {
            "name": root_name,
            "selfMs": 0,
            "totalMs": round(thread_ec / SCALE, 3),
            "selfPct": 0,
            "totalPct": round(thread_ec / grand_total_ec * 100.0, 3) if grand_total_ec else 0.0,
            "children": children,
        }
        trees.append({
            "thread": tname,
            "label": "thread-total",
            "root": root,
        })
    return trees


# ------------------------------------------------------------
# 符号化质量校验 (PASS / WARN / FAIL)
# ------------------------------------------------------------
def _symbol_check(profile, anchors_resolved, total_anchors):
    """区分"应用代码符号化质量"(真信号) 与 内核/未知占比 (预期噪音)。"""
    total_self = 0.0
    unknown_self = 0.0
    kernel_self = 0.0
    app_self = 0.0
    app_sym_self = 0.0
    for func_name, lib_name, self_ec, _sub in single_profile._iter_functions(profile):
        if self_ec <= 0:
            continue
        total_self += self_ec
        base = lib_name.rsplit("/", 1)[-1] if lib_name else ""
        layer = classify_layer(base)
        unsym = is_unsymbolized(func_name)
        if unsym:
            unknown_self += self_ec
        if "kernel" in base:
            kernel_self += self_ec
        if layer in ("business", "engine"):
            app_self += self_ec
            if not unsym:
                app_sym_self += self_ec
    total_self = total_self or 1.0
    app_sym_pct = (app_sym_self / app_self * 100.0) if app_self else 0.0
    notes = []
    if app_sym_pct < 50:
        status = "FAIL"
        notes.append("应用层 (业务/引擎) 符号化率 <50%, 函数级结论不可信, 仅 lib/线程级占比可参考。")
    elif app_sym_pct < 85 or anchors_resolved == 0:
        status = "WARN"
        if app_sym_pct < 85:
            notes.append("应用层符号化率 <85%, 部分热点函数可能未还原 (显示为 dso[+offset])。")
        if anchors_resolved == 0:
            notes.append("anchor 子树均未命中: 调用栈未回溯到引擎入口帧 (栈深受限/引擎符号不全), anchor 占比仅供参考。")
    else:
        status = "PASS"
    return {
        "status": status,
        "appSymbolizedPct": round(app_sym_pct, 1),
        "kernelPct": round(kernel_self / total_self * 100.0, 1),
        "unknownPct": round(unknown_self / total_self * 100.0, 1),
        "anchorsResolved": anchors_resolved,
        "anchorsTotal": total_anchors,
        "notes": notes,
    }


# ------------------------------------------------------------
# 主构建
# ------------------------------------------------------------
def build_profile_dict(
    profile,
    raw_path,
    binary_cache=None,
    out_dir=None,
    top_func=None,
    top_lib=25,
    top_thread=25,
    top_tree_threads=8,
    lib_min_pct=0.5,
    thread_min_pct=0.5,
    tree_min_pct=0.15,
    tree_max_depth=40,
    anchors=None,
):
    """构建 PerfProfile dict + AI 摘要。out_dir 给定时写 folded stacks 并设 foldedPath。"""
    top_func = top_func or config.DEFAULT_TOP_N
    anchors = anchors or config.DEFAULT_ANCHOR_FUNCS

    ana = single_profile.analyze(profile, top_n=top_func)
    event = ana["meta"]["event"]

    # grand total (event counts) —— 与 single_profile 的 grand_total 同口径 (线程 ec 之和)
    grand_total_ec = 0
    for _p, th in profile.iter_threads():
        grand_total_ec += th["event_count"]
    grand_total_ec = grand_total_ec or 1
    total_ms = grand_total_ec / SCALE

    metrics = []

    # cpu.lib.<so>.pct
    for l in ana["libs"]:
        if l["pct"] < lib_min_pct:
            continue
        key = "cpu.lib.%s.pct" % sanitize_lib(l["name"])
        metrics.append({"key": key, "value": l["pct"], "unit": "%", "source": SOURCE})
        if len([m for m in metrics if m["key"].startswith("cpu.lib.")]) >= top_lib:
            break

    # cpu.thread.<t>.pct (含 Job.Worker 类)
    for t in ana["threads"]:
        if t["pct"] < thread_min_pct:
            continue
        key = "cpu.thread.%s.pct" % sanitize_thread(t["name"])
        metrics.append({"key": key, "value": t["pct"], "unit": "%", "source": SOURCE})
        if len([m for m in metrics if m["key"].startswith("cpu.thread.")]) >= top_thread:
            break

    # cpu.func.<f>.selfPct (仅已符号化的真实函数; 未还原地址不入 core, 计入 symbolCheck)
    func_count = 0
    seen_func_keys = set()
    for h in ana["hotspots"]:
        if is_unsymbolized(h["func"]):
            continue
        key = "cpu.func.%s.selfPct" % sanitize_func(h["func"])
        if key in seen_func_keys:
            continue
        seen_func_keys.add(key)
        metrics.append({"key": key, "value": h["pct"], "unit": "%", "source": SOURCE})
        func_count += 1
        if func_count >= top_func:
            break

    # cpu.anchor.<a>.subtreePct
    anchor_ms = anchor_compare._profile_anchor_ms(profile, anchors)
    anchors_detail = []
    anchors_resolved = 0
    for a in anchors:
        ms = anchor_ms.get(a, 0.0)
        pct = (ms / total_ms * 100.0) if total_ms else 0.0
        if ms > 0:
            anchors_resolved += 1
        anchors_detail.append({"name": a, "subtreeMs": round(ms, 3), "subtreePct": round(pct, 3)})
        # 仅命中的 anchor 入 core (未命中=0 无意义, 记在 detail.anchors)
        if ms > 0:
            metrics.append({
                "key": "cpu.anchor.%s.subtreePct" % sanitize_func(a, 60),
                "value": round(pct, 3), "unit": "%", "source": SOURCE,
            })

    # 符号化校验
    symbol_check = _symbol_check(profile, anchors_resolved, len(anchors))

    # 分层占比 (业务/引擎/运行时/噪音) —— 报告"结论先行"用
    layer_self = {"business": 0.0, "engine": 0.0, "runtime": 0.0, "noise": 0.0}
    total_self = 0.0
    for func_name, lib_name, self_ec, _sub in single_profile._iter_functions(profile):
        if self_ec <= 0:
            continue
        total_self += self_ec
        base = lib_name.rsplit("/", 1)[-1] if lib_name else ""
        layer_self[classify_layer(base)] += self_ec
    total_self = total_self or 1.0
    layer_breakdown = {k: round(v / total_self * 100.0, 2) for k, v in layer_self.items()}

    # 统一 callTrees (top 线程, 全量树剪到 tree_min_pct)
    call_trees = _thread_call_trees(profile, grand_total_ec, top_tree_threads, tree_min_pct, tree_max_depth)

    # threadCpuMs
    thread_cpu_ms = {}
    for _p, th in profile.iter_threads():
        thread_cpu_ms[th["thread_name"]] = round(th["event_count"] / SCALE, 1)

    # folded stacks -> 文件 (foldedPath)
    folded_path = None
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        folded_path = os.path.join(out_dir, "simpleperf-folded.txt")
        with open(folded_path, "w", encoding="utf-8") as f:
            f.write(single_profile.folded_stacks(profile))

    # confidence notes
    notes = list(symbol_check["notes"])
    if profile.total_samples < 50000:
        notes.append("采样数 %d 偏少, 占比统计稳定性下降。" % profile.total_samples)
    if event != "cpu-clock" and event != "task-clock":
        notes.append("事件为 %s (非 cpu-clock), 绝对 ms 无意义, 仅占比可比。" % event)

    detail = {
        "symbolCheck": symbol_check,
        "layerBreakdown": layer_breakdown,
        "callTrees": call_trees,
        "anchors": anchors_detail,
        "foldedPath": folded_path,
        "flamegraphPath": None,  # P1 不渲染 SVG; 可用 foldedPath 喂 flamegraph 工具 (软参数)
        "event": event,
        "threadCpuMs": thread_cpu_ms,
        "totalSamples": profile.total_samples,
    }

    profile_dict = {
        "raw": [{
            "source": SOURCE, "role": "simpleperf_data",
            "localPath": os.path.abspath(raw_path), "fileName": os.path.basename(raw_path),
        }],
        "core": {
            "schemaVersion": SCHEMA_VERSION,
            "metrics": metrics,
            "frame": [],     # simpleperf 不产帧口径
            "threads": [],   # 调度态线程是 perfetto; simpleperf 线程 CPU 占比在 metrics
            "system": {},
            "confidence": {"perFrameAlignmentOk": None, "notes": notes},
        },
        "detail": {SOURCE: detail},
        "meta": {
            "device": profile.machine_type,
            "recordTime": profile.record_time,
            "event": event,
            "totalSamples": profile.total_samples,
        },
    }

    summary = _build_summary(profile_dict, ana, symbol_check, layer_breakdown, anchors_detail, call_trees)
    return {"profile": profile_dict, "summary": summary, "foldedPath": folded_path}


def _prune_tree(node, min_pct, max_depth, depth=0):
    """剪枝但保留热节点的祖先链 (path-preserving)。"""
    if depth >= max_depth:
        return dict(node, children=[])

    child_nodes = sorted(node.get("children", []), key=lambda c: c.get("totalMs", 0), reverse=True)
    kept_children = [_prune_tree(c, min_pct, max_depth, depth + 1) for c in child_nodes]

    def _subtree_hot(n):
        if n.get("totalPct", 0) >= min_pct or n.get("selfPct", 0) >= min_pct * 0.2:
            return True
        return any(_subtree_hot(c) for c in n.get("children", []))

    if depth == 0:
        # 根节点: 保留所有有热后代的分支
        children = [c for c in kept_children if _subtree_hot(c)]
    else:
        children = [
            c for c in kept_children
            if c.get("totalPct", 0) >= min_pct or c.get("selfPct", 0) >= min_pct * 0.2
            or any(ch.get("totalPct", 0) >= min_pct for ch in c.get("children", []))
        ]

    out = dict(node)
    out["children"] = children
    return out


def _build_summary(profile_dict, ana, symbol_check, layer_breakdown, anchors_detail, call_trees):
    """AI 读这个 (不读全量 detail)。剪枝树 totalPct>=1% & depth<=10。"""
    detail = profile_dict["detail"][SOURCE]
    return {
        "source": SOURCE,
        "schemaVersion": SCHEMA_VERSION,
        "meta": profile_dict["meta"],
        "metrics": profile_dict["core"]["metrics"],
        "confidence": profile_dict["core"]["confidence"],
        "symbolCheck": symbol_check,
        "layerBreakdown": layer_breakdown,
        "hotspots": ana["hotspots"],   # top-N self (含未符号化, 供透明判断)
        "threads": ana["threads"][:15],
        "libs": ana["libs"][:20],
        "anchors": anchors_detail,
        "callTrees": [
            {"thread": t["thread"], "label": t["label"], "root": _prune_tree(t["root"], 0.15, 12)}
            for t in call_trees
        ],
        "_meta": {
            "note": "单源 simpleperf PerfProfile 摘要。全量 callTrees / folded stacks 在 simpleperf-profile.json 的 detail.simpleperf (+ foldedPath)。callTrees 此处已按 totalPct>=1% 剪枝。",
            "foldedPath": detail["foldedPath"],
            "event": detail["event"],
        },
    }
