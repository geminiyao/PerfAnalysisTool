#!/usr/bin/env python3
"""perfetto_provider.py - PerfettoProvider (源 id = perfetto)。

职责 (出数据, 确定性代码): 解析 .pftrace → 产出统一 PerfProfile 片段, 与 unity/simpleperf
Provider 同一份磁盘 JSON 契约 (web/shared/perf-model.ts), 供 web 侧 ingest-run.ts 入库。

  - core.metrics: thread.<name>.{running,runnable,sleeping}Pct / system.cpuFreqAvgMhz /
        system.gpuBusyPct / system.binder.{count,avgMs} / system.pssMb (按 metric-key-naming-spec)
  - core.threads[perfetto] (ThreadStat[]) / core.frame[perfetto] (choreographer) / core.system
  - detail.perfetto: { profileWindow, threadsSched, callTrees[](atrace slice 树, 带 layer),
        throttling{level,evidence,...}, offCpuReasons, frameTimeline?, atraceSlices,
        gpu, parseStatus, parseNotes }

复用 scripts/perfetto_analyzer.py 的查询模式 (TraceProcessor SQL); 加厚三块: atrace slice 树、
逐核降频推断 (推测级, 确认级需 sysfs 旁路)、frameTimeline jank。
依据: docs/report-spec-and-data-contract.md §4/§7, §1.5 (统一 CallTree), 决策 8/9,
      CommonTools/AndroidPerfettoScripts/降频观测指南.md (降频判定两级)。

注意: perfetto 解析依赖 perfetto Python 库 (trace_processor)。Provider 用 Python, 产出与
unity/simpleperf 同一份 PerfProfile JSON 契约, web ingest 通用读取。
"""

import json
import os
import sys

SOURCE = "perfetto"
SCHEMA_VERSION = 1  # 必须与 web/shared/perf-model.ts 的 PERF_PROFILE_SCHEMA_VERSION 一致

# 关键线程白名单 (契约 §8 软参数: Provider 默认, 可配置覆盖)
KEY_THREAD_HINTS = ["UnityMain", "UnityGfxRenderS", "GfxDevice", "Render",
                    "Job", "Worker", "AAudio", "Audio"]

# atrace slice → layer (决策 8; perfetto 粒度到 slice 调度级)
_SLICE_LAYER = {
    "business": ["BehaviourUpdate", "ScriptRun", "Coroutines", "Lua", "Update", "FixedUpdate", "LateUpdate"],
    "engine": ["PlayerLoop", "Camera.Render", "RenderForward", "Shadows", "Render", "Gfx",
               "Culling", "ParticleSystem", "Canvas", "Physics", "Animation", "Animator"],
    "runtime": ["GC.Collect", "GC.", "WaitForTargetFPS", "Wait", "Sync", "Present", "Mutex"],
}


def _slice_layer(name):
    for layer, toks in _SLICE_LAYER.items():
        for t in toks:
            if t in name:
                return layer
    return "engine"  # atrace 默认是引擎语义层


def _safe(tp, sql, desc=""):
    try:
        return list(tp.query(sql))
    except Exception as e:
        print("[perfetto_provider] WARN: %s failed: %s" % (desc, e), file=sys.stderr)
        return None


def _pct(sorted_vals, p):
    if not sorted_vals:
        return 0.0
    i = int((len(sorted_vals) - 1) * p / 100)
    return sorted_vals[max(0, min(i, len(sorted_vals) - 1))]


def _round(n, d=2):
    try:
        return round(float(n), d)
    except Exception:
        return 0.0


def _metric(key, value, unit):
    return {"key": key, "value": _round(value, 3), "unit": unit, "source": SOURCE}


def _sanitize(name):
    import re
    return re.sub(r"[^A-Za-z0-9_]+", "_", name or "unknown").strip("_") or "unknown"


# ------------------------------------------------------------
# 线程调度
# ------------------------------------------------------------
def _thread_sched(tp, utid, win):
    rows = _safe(tp, """
        SELECT state, SUM(dur) total_ns FROM thread_state
        WHERE utid = %d %s GROUP BY state
    """ % (utid, win), "thread_state %d" % utid)
    if not rows:
        return None
    sm, total = {}, 0
    for r in rows:
        sm[r.state] = int(r.total_ns or 0)
        total += int(r.total_ns or 0)
    if total == 0:
        return None
    return {
        "runningPct": _round(sm.get("Running", 0) / total * 100),
        "runnablePct": _round(sm.get("R", 0) / total * 100),
        "sleepingPct": _round((sm.get("S", 0) + sm.get("D", 0)) / total * 100),
        "totalNs": total,
    }


# ------------------------------------------------------------
# atrace slice 树 (聚合同名兄弟; 以 parent_id 建树)
# ------------------------------------------------------------
def _slice_subtree_dur(row_id, children_of, seen=None):
    """递归求一个 slice 的子树 dur 之和 (仅 dur>=0 的子节点)。用于 dur<0 的 root 估算。"""
    if seen is None:
        seen = set()
    if row_id in seen:
        return 0
    seen.add(row_id)
    total = 0
    for child in children_of.get(row_id, []):
        cd = int(child.dur or 0)
        if cd >= 0:
            total += cd
        total += _slice_subtree_dur(child.id, children_of, seen)
    return total


def _slice_tree(tp, utid, win_dur_ns, min_pct=0.5, max_depth=12):
    """返回 (nodes, fallback_note)。fallback_note 非 None 时表示走了 PlayerLoop anchor fallback。"""
    # 主查询: 仅 dur>=0 的 slice (避免 dur=-1 噪音进入非 root 层聚合)
    rows = _safe(tp, """
        SELECT s.id id, s.parent_id parent_id, s.name name, s.dur dur
        FROM slice s JOIN thread_track tt ON s.track_id = tt.id
        WHERE tt.utid = %d AND s.dur >= 0
    """ % utid, "slices utid=%d" % utid)
    if not rows:
        return [], None
    children_of = {}  # parent_id -> [row]
    roots = []
    for r in rows:
        if r.parent_id is None:
            roots.append(r)
        else:
            children_of.setdefault(r.parent_id, []).append(r)

    def aggregate(slice_rows, depth):
        # 按 name 聚合一组兄弟 slice: sum dur / count / 合并各自子节点
        groups = {}
        for r in slice_rows:
            g = groups.setdefault(r.name, {"dur": 0, "count": 0, "child_ids": []})
            g["dur"] += int(r.dur or 0)
            g["count"] += 1
            g["child_ids"].extend(children_of.get(r.id, []))
        nodes = []
        for name, g in groups.items():
            total_pct = (g["dur"] / win_dur_ns * 100) if win_dur_ns else 0.0
            if total_pct < min_pct:
                continue
            node = {
                "name": name,
                "totalMs": _round(g["dur"] / 1e6, 2),
                "totalPct": _round(total_pct, 2),
                "count": g["count"],
                "layer": _slice_layer(name),
                "children": aggregate(g["child_ids"], depth + 1) if depth < max_depth else [],
            }
            nodes.append(node)
        nodes.sort(key=lambda n: n["totalMs"], reverse=True)
        return nodes

    primary = aggregate(roots, 0)
    if primary:
        return primary, None

    # Fallback (BUG-P2): root 聚合为空 — base 样本里真正有价值的 PlayerLoop 多数不是
    # parent_id IS NULL 的 root，而是挂在其它容器下的 anchor slice。fallback 选取所有
    # name='PlayerLoop' slice 作为虚拟 roots，仍只聚合真实 slice 子树；dur<0 的 slice 用子树 sum 估算。
    pl_anchor_rows = _safe(tp, """
        SELECT s.id id, s.parent_id parent_id, s.name name, s.dur dur
        FROM slice s JOIN thread_track tt ON s.track_id = tt.id
        WHERE tt.utid = %d AND s.name = 'PlayerLoop'
    """ % utid, "playerloop anchors utid=%d" % utid)
    if not pl_anchor_rows:
        return [], "root 聚合为空且无 PlayerLoop anchor; callTrees 空 (顶层 slice 全被 dur<0 或 min_pct 剪掉)。"
    # 把 PlayerLoop anchor 的 dur<0 替换为子树 sum, 并注入 children_of (它们的 children 已在主查询 rows 里)
    virtual_roots = []
    for r in pl_anchor_rows:
        if r.dur is not None and int(r.dur) < 0:
            sub_dur = _slice_subtree_dur(r.id, children_of)
            # 用子树 sum 作为 root dur (估算); 挂一个临时 row 对象避免修改原 row
            class _VRow:
                pass
            vr = _VRow()
            vr.id = r.id
            vr.parent_id = None
            vr.name = r.name
            vr.dur = sub_dur if sub_dur > 0 else 0
            virtual_roots.append(vr)
        else:
            virtual_roots.append(r)
    fallback_nodes = aggregate(virtual_roots, 0)
    note = None
    if fallback_nodes:
        note = ("root 聚合为空 (顶层 roots 被 dur/min_pct 过滤); "
                "fallback 选取 PlayerLoop anchor (%d 个) 作为虚拟 roots 聚合真实子树, "
                "dur<0 anchor 用子树 sum 估算。" % len(pl_anchor_rows))
    else:
        note = ("root 聚合为空; PlayerLoop fallback 仍空 (PlayerLoop 子树全被 min_pct=%.2f%% 剪掉或无子节点)。" % min_pct)
    return fallback_nodes, note


def _gc_alloc_by_chain(tp, main_utid, win, call_trees, player_loop_frame_count):
    """GC.Alloc 业务子树归因：遍历 callTree 全树，不预设模块名清单。

    对每个 GC.Alloc slice 沿 parent_id 向上找第一个出现在 callTree 节点集合里的 name
    （最深业务节点），避免祖先重复累加。
    """
    empty = {
        "available": False,
        "playerLoopFrameCount": player_loop_frame_count,
        "totalGcAllocSlices": 0,
        "byChain": [],
    }
    if main_utid is None:
        return empty

    # name -> {depth, parentChain}；同名取最深
    name_meta = {}

    def walk_tree(node, ancestors, depth):
        name = node.get("name")
        if not name:
            return
        chain = ancestors + [name]
        prev = name_meta.get(name)
        if prev is None or depth > prev["depth"]:
            name_meta[name] = {"depth": depth, "parentChain": chain}
        for child in node.get("children") or []:
            walk_tree(child, chain, depth + 1)

    for tree in call_trees or []:
        root = tree.get("root") or {}
        walk_tree(root, [], 0)

    calltree_names = set(name_meta.keys())
    if not calltree_names:
        return empty

    win_s = win.replace("ts >=", "s.ts >=") if win else ""
    rows = _safe(tp, """
        SELECT s.id id, s.parent_id parent_id, s.name name, s.dur dur
        FROM slice s JOIN thread_track tt ON s.track_id=tt.id
        WHERE tt.utid=%d %s
    """ % (main_utid, win_s), "slices for gcAllocByChain")
    if not rows:
        return empty

    by_id = {}
    for r in rows:
        try:
            by_id[int(r.id)] = r
        except (TypeError, ValueError):
            continue

    gc_slices = [r for r in rows if r.name and str(r.name).startswith("GC.Alloc")]
    agg = {}  # name -> {count, totalNs}
    for g in gc_slices:
        cur = g.parent_id
        attributed = None
        seen = set()
        while cur is not None:
            try:
                cid = int(cur)
            except (TypeError, ValueError):
                break
            if cid in seen:
                break
            seen.add(cid)
            parent = by_id.get(cid)
            if parent is None:
                break
            pname = str(parent.name or "")
            if pname in calltree_names and not pname.startswith("GC.Alloc"):
                attributed = pname
                break
            cur = parent.parent_id
        if attributed is None:
            continue
        entry = agg.setdefault(attributed, {"count": 0, "totalNs": 0})
        entry["count"] += 1
        dur = int(g.dur or 0) if g.dur is not None else 0
        if dur > 0:
            entry["totalNs"] += dur

    by_chain = []
    for name, e in agg.items():
        meta = name_meta.get(name, {"depth": 0, "parentChain": [name]})
        per_frame = None
        if player_loop_frame_count and player_loop_frame_count > 0:
            per_frame = _round(e["count"] / float(player_loop_frame_count), 2)
        by_chain.append({
            "name": name,
            "count": e["count"],
            "totalMs": _round(e["totalNs"] / 1e6, 3),
            "perFrame": per_frame,
            "depth": meta["depth"],
            "parentChain": meta["parentChain"],
        })
    by_chain.sort(
        key=lambda x: (
            x["perFrame"] is not None,
            x["perFrame"] if x["perFrame"] is not None else -1,
            x["count"],
        ),
        reverse=True,
    )
    return {
        "available": len(by_chain) > 0,
        "playerLoopFrameCount": player_loop_frame_count,
        "totalGcAllocSlices": len(gc_slices),
        "byChain": by_chain,
    }


# ------------------------------------------------------------
# 降频推断 (推测级; 确认级需 sysfs 旁路 scaling_max vs cpuinfo_max)
# ------------------------------------------------------------

def _read_thermal(path):
    """解析 thermal_before/after.txt: zoneN=name:temp_millicelsius → 取主要 zone。"""
    if not path or not os.path.isfile(path):
        return None
    zones = {}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if ":" not in val:
                    continue
                name, raw_temp = val.rsplit(":", 1)
                try:
                    zones[key.strip()] = {"name": name.strip(), "tempC": _round(int(raw_temp) / 1000.0, 1)}
                except ValueError:
                    continue
    except Exception as e:
        print("[perfetto_provider] WARN: thermal read failed %s: %s" % (path, e), file=sys.stderr)
        return None
    if not zones:
        return None
    # 主要 thermal zone = soc_thermal / board_thermal (soc 优先), 其余多为 modem 负值噪音
    primary = None
    for prefer in ("soc_thermal", "board_thermal"):
        for z in zones.values():
            if z["name"] == prefer:
                primary = z
                break
        if primary:
            break
    if not primary:
        # fallback: 第一个温度 > 0 的 zone
        for z in zones.values():
            if z["tempC"] > 0:
                primary = z
                break
    return {"primary": primary, "zones": zones}


def _read_cpuinfo_max(path):
    """解析 cpuinfo_max_freq.txt: 每行一个 CPU 的 max freq (KHz) → 列表 (index=max cpu)。"""
    if not path or not os.path.isfile(path):
        return None
    freqs = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    freqs.append(int(line))
                except ValueError:
                    continue
    except Exception as e:
        print("[perfetto_provider] WARN: cpuinfo_max_freq read failed %s: %s" % (path, e), file=sys.stderr)
        return None
    return freqs if freqs else None


def _read_sidecar(trace_path):
    """读取 trace 同目录 sidecar: collection-manifest.json / thermal_before/after.txt / cpuinfo_max_freq.txt。

    返回 dict: {collectionManifest, thermalBefore, thermalAfter, thermalDelta, cpuinfoMaxKhz}。
    缺失项为 None。不抛异常 (sidecar 是可选增强, 缺失不应阻断解析)。
    """
    trace_dir = os.path.dirname(os.path.abspath(trace_path)) if trace_path else None
    sidecar = {
        "collectionManifest": None, "thermalBefore": None,
        "thermalAfter": None, "thermalDelta": None, "cpuinfoMaxKhz": None,
    }
    if not trace_dir or not os.path.isdir(trace_dir):
        return sidecar
    # manifest
    mf = os.path.join(trace_dir, "collection-manifest.json")
    if os.path.isfile(mf):
        try:
            with open(mf, "r", encoding="utf-8") as f:
                sidecar["collectionManifest"] = json.load(f)
        except Exception as e:
            print("[perfetto_provider] WARN: manifest read failed: %s" % e, file=sys.stderr)
    # thermal
    tb = _read_thermal(os.path.join(trace_dir, "thermal_before.txt"))
    ta = _read_thermal(os.path.join(trace_dir, "thermal_after.txt"))
    sidecar["thermalBefore"] = tb
    sidecar["thermalAfter"] = ta
    if tb and ta and tb.get("primary") and ta.get("primary"):
        sidecar["thermalDelta"] = _round(ta["primary"]["tempC"] - tb["primary"]["tempC"], 1)
    # cpuinfo max
    sidecar["cpuinfoMaxKhz"] = _read_cpuinfo_max(os.path.join(trace_dir, "cpuinfo_max_freq.txt"))
    return sidecar


def _throttling(tp, win, main_running_pct, sidecar=None):
    """降频推断。sidecar = _read_sidecar() 返回值; 提供时 thermal/cpuinfo/manifest 进入 throttling。"""
    sidecar = sidecar or {}
    rows = _safe(tp, """
        SELECT cct.cpu cpu, AVG(c.value) avg_khz, MAX(c.value) max_khz, COUNT(*) n
        FROM counter c JOIN cpu_counter_track cct ON c.track_id = cct.id
        WHERE cct.name = 'cpufreq'
        GROUP BY cct.cpu ORDER BY cct.cpu
    """, "per-cpu cpufreq")
    per_cpu = []
    cpuinfo_max_khz = sidecar.get("cpuinfoMaxKhz")
    if rows:
        for r in rows:
            if r.max_khz is None:
                continue
            cpu_idx = int(r.cpu)
            # cpuinfo theoretical max (from sidecar, per-cpu); 越界则取最大值
            cpuinfo_khz = None
            if cpuinfo_max_khz:
                cpuinfo_khz = cpuinfo_max_khz[cpu_idx] if cpu_idx < len(cpuinfo_max_khz) else max(cpuinfo_max_khz)
            reach_vs_cpuinfo = None
            if cpuinfo_khz:
                reach_vs_cpuinfo = _round(float(r.avg_khz) / float(cpuinfo_khz) * 100, 1)
            per_cpu.append({
                "cpu": cpu_idx,
                "avgMhz": _round(float(r.avg_khz) / 1000.0, 1),
                "maxMhz": _round(float(r.max_khz) / 1000.0, 1),
                "cpuinfoMaxMhz": _round(float(cpuinfo_khz) / 1000.0, 1) if cpuinfo_khz else None,
                "reachVsCpuinfoPct": reach_vs_cpuinfo,
                "reachPct": _round(float(r.avg_khz) / float(r.max_khz) * 100, 1) if r.max_khz else 0.0,
            })
    evidence = []
    level = "unknown"
    # thermal sidecar
    thermal_info = None
    tb = sidecar.get("thermalBefore")
    ta = sidecar.get("thermalAfter")
    if tb or ta:
        thermal_info = {
            "beforeC": tb["primary"]["tempC"] if tb and tb.get("primary") else None,
            "afterC": ta["primary"]["tempC"] if ta and ta.get("primary") else None,
            "deltaC": sidecar.get("thermalDelta"),
            "primaryZone": (tb or ta or {}).get("primary", {}).get("name") if (tb or ta) else None,
        }
    # confirmedAvailable 语义: sidecar 存在 (thermal/cpuinfo available) 即 True; 但确认级降频仍需 scaling_max_freq / cooling state
    manifest = sidecar.get("collectionManifest")
    sysfs_manifest = (manifest or {}).get("sysfs", {}) if isinstance(manifest, dict) else {}
    has_thermal_sidecar = bool(tb and ta)
    has_cpuinfo_sidecar = bool(cpuinfo_max_khz)
    has_scaling = bool(sysfs_manifest.get("scalingMaxFreq"))
    confirmed_available = has_thermal_sidecar or has_cpuinfo_sidecar

    if not per_cpu:
        evidence.append("trace 无 cpufreq 计数器, 无法推断频率。")
        return {
            "level": level, "confirmedAvailable": confirmed_available,
            "thermal": thermal_info, "collectionManifest": manifest,
            "perCpu": per_cpu, "evidence": evidence,
        }

    # 大核 = 观测 max 最高的若干核
    per_cpu_sorted = sorted(per_cpu, key=lambda c: c["maxMhz"], reverse=True)
    big = per_cpu_sorted[:max(1, len(per_cpu) // 4)]
    big_reach = sum(c["reachPct"] for c in big) / len(big)

    # 推测信号 (降频观测指南 §二 推测级)
    suspected = False
    if main_running_pct is not None and main_running_pct >= 80 and big_reach < 80:
        suspected = True
        evidence.append("[推测] 负载-频率背离: 主线程高负载 (Running %.1f%%) 但大核平均频率仅达观测峰值的 %.1f%% (<80%%)。"
                        % (main_running_pct, big_reach))
    if big_reach < 70:
        suspected = True
        evidence.append("[推测] 大核持续低频: 平均频率仅达观测峰值 %.1f%%。" % big_reach)

    level = "suspected" if suspected else "none"
    # evidence: sidecar 存在时不再错误声称"无 thermal_before/after.txt"; 诚实说明 confirmed throttling 仍需 scaling/cooling
    if confirmed_available:
        parts = []
        if has_thermal_sidecar:
            parts.append("thermal_before/after.txt")
        if has_cpuinfo_sidecar:
            parts.append("cpuinfo_max_freq.txt")
        evidence.append("thermal/cpuinfo sidecar available (%s), 但确认级降频仍缺 scaling_max_freq / cooling state 证据。"
                        % ", ".join(parts))
    else:
        evidence.append("确认级降频判定需 sysfs 旁路 (scaling_max_freq vs cpuinfo_max_freq / cooling state); 本样本无 thermal/cpuinfo sidecar, 故仅推测级。")
    return {
        "level": level,
        "confirmedAvailable": confirmed_available,
        "thermal": thermal_info,
        "collectionManifest": manifest,
        "perCpu": per_cpu,
        "bigCoreReachPct": _round(big_reach, 1),
        "evidence": evidence,
    }


# ------------------------------------------------------------
# 主构建
# ------------------------------------------------------------
def build_profile_dict(
    trace_path,
    meta=None,
    profile_name="CombinedProfile",
    slice_tree_min_pct=0.5,
    slice_tree_max_depth=12,
    summary_min_pct=1.0,
    summary_max_depth=8,
):
    from perfetto.trace_processor import TraceProcessor
    meta = meta or {}
    tp = TraceProcessor(trace=trace_path)
    notes = []
    parse_status = "ok"

    # --- 时间窗 (无 CombinedProfile 色块 → 全 trace 区间, 用户选项 fulltrace) ---
    win_start = win_end = None
    sl = _safe(tp, "SELECT ts, dur FROM slice WHERE name LIKE '%s%%' ORDER BY ts LIMIT 1" % profile_name, "profile slice")
    if sl:
        win_start = int(sl[0].ts)
        win_end = int(sl[0].ts + sl[0].dur)
    if win_start is None:
        tb = _safe(tp, "SELECT start_ts, end_ts FROM trace_bounds", "trace bounds")
        if tb:
            win_start, win_end = int(tb[0].start_ts), int(tb[0].end_ts)
        notes.append("未找到 '%s' 色块, 采用全 trace 区间 (含非稳态段, 未做战斗窗裁剪)。" % profile_name)
        parse_status = "partial"
    win = "AND ts >= %d AND ts <= %d" % (win_start, win_end) if win_start else ""
    win_dur_ns = (win_end - win_start) if win_start else 1

    # --- 目标进程 pid (来自 meta; 隔离游戏进程的线程, 避免把其它进程同名 UnityMain 混入) ---
    target_pid = None
    try:
        target_pid = int(meta.get("pid")) if meta.get("pid") is not None else None
    except (TypeError, ValueError):
        target_pid = None
    if target_pid is None:
        # fallback: 取含 UnityMain 且该 UnityMain 调度样本最多的进程
        pr = _safe(tp, """
            SELECT p.pid pid, SUM(ts2.dur) total FROM thread t
            JOIN process p ON t.upid = p.upid
            JOIN thread_state ts2 ON ts2.utid = t.utid
            WHERE t.name = 'UnityMain' GROUP BY p.pid ORDER BY total DESC LIMIT 1
        """, "fallback target pid")
        if pr:
            target_pid = int(pr[0].pid)
            notes.append("meta 无 pid, 自动选取 UnityMain 调度量最大的进程 pid=%d。" % target_pid)

    pid_filter = ("AND p.pid = %d" % target_pid) if target_pid else ""
    th_rows = _safe(tp, """
        SELECT t.utid utid, t.name name, t.tid tid FROM thread t
        JOIN process p ON t.upid = p.upid
        WHERE t.name IS NOT NULL %s
    """ % pid_filter, "threads") or []
    threads_by_name = {}
    main_utid = None
    main_run_ns = -1
    for r in th_rows:
        threads_by_name.setdefault(r.name, []).append(int(r.utid))
    # 选主线程: 同名 UnityMain 可能有多个 (含近乎空闲的同名孪生线程), 取 *Running 时间最长* 的那个,
    # 而非 totalNs 最长 (孪生线程 totalNs 可能更大但几乎全程 sleeping)。
    for u in threads_by_name.get("UnityMain", []):
        rr = _safe(tp, "SELECT SUM(dur) d FROM thread_state WHERE utid=%d AND state='Running' %s" % (u, win),
                   "unitymain running %d" % u)
        run_ns = int(rr[0].d) if rr and rr[0].d is not None else 0
        if run_ns > main_run_ns:
            main_utid, main_run_ns = u, run_ns
    if main_utid is None:
        notes.append("未找到 UnityMain 线程 (target_pid=%s)。" % target_pid)

    # --- 调度: 关键线程 ---
    metrics = []
    core_threads = []
    threads_sched = {}
    main_running_pct = None
    for tname, utids in threads_by_name.items():
        if not any(h in tname for h in KEY_THREAD_HINTS):
            continue
        # UnityMain 只取代表性主线程 (防同名孪生线程稀释); 其余 (worker 池) 时间加权合并同名实例。
        if tname == "UnityMain" and main_utid is not None:
            utids = [main_utid]
        # 按 totalNs 时间加权合并同名线程 (避免空闲同名实例稀释占比)
        wr = wrn = wsl = 0.0
        tot = 0
        for u in utids:
            s = _thread_sched(tp, u, win)
            if s:
                wr += s["runningPct"] * s["totalNs"]
                wrn += s["runnablePct"] * s["totalNs"]
                wsl += s["sleepingPct"] * s["totalNs"]
                tot += s["totalNs"]
        if tot == 0:
            continue
        run, runn, sleep = _round(wr / tot), _round(wrn / tot), _round(wsl / tot)
        threads_sched[tname] = {"count": len(utids), "runningPct": run, "runnablePct": runn, "sleepingPct": sleep}
        ent = _sanitize(tname)
        metrics.append(_metric("thread.%s.runningPct" % ent, run, "%"))
        metrics.append(_metric("thread.%s.runnablePct" % ent, runn, "%"))
        metrics.append(_metric("thread.%s.sleepingPct" % ent, sleep, "%"))
        core_threads.append({"source": SOURCE, "name": tname, "runningPct": run, "runnablePct": runn, "sleepingPct": sleep})
        if tname == "UnityMain":
            main_running_pct = run

    # --- CPU 频率均值 ---
    system = {}
    cf = _safe(tp, """
        SELECT AVG(value) avg_khz FROM counter c JOIN counter_track ct ON c.track_id=ct.id
        WHERE ct.name='cpufreq' %s
    """ % (win.replace("ts >=", "c.ts >=") if win else ""), "cpufreq avg")
    if cf and cf[0].avg_khz is not None:
        v = _round(float(cf[0].avg_khz) / 1000.0, 1)
        system["cpuFreqAvgMhz"] = v
        metrics.append(_metric("system.cpuFreqAvgMhz", v, "mhz"))

    # --- GPU busy ---
    gpu = {}
    gq = _safe(tp, """
        SELECT SUM(dur) busy_ns FROM slice s JOIN track t ON s.track_id=t.id
        WHERE (t.name LIKE '%%GpuQueue%%' OR t.name LIKE '%%gpu_queue%%') %s
    """ % win, "gpu busy")
    if gq and gq[0].busy_ns is not None:
        v = _round(float(gq[0].busy_ns) / win_dur_ns * 100, 2)
        system["gpuBusyPct"] = v
        gpu["busyPct"] = v
        metrics.append(_metric("system.gpuBusyPct", v, "%"))
    gfq = _safe(tp, """
        SELECT AVG(value) avg_freq FROM counter c JOIN counter_track ct ON c.track_id=ct.id
        WHERE ct.name LIKE '%%gpu%%freq%%' %s
    """ % (win.replace("ts >=", "c.ts >=") if win else ""), "gpu freq")
    if gfq and gfq[0].avg_freq is not None:
        v = _round(float(gfq[0].avg_freq) / 1e6, 1)
        metrics.append(_metric("system.gpuFreqAvgMhz", v, "mhz"))
        gpu["freqAvgMhz"] = v
    else:
        notes.append("设备未上报 GPU 频率计数器; GPU 是否瓶颈无法定论。")

    # --- Choreographer 帧 ---
    core_frame = []
    frame_q = None
    for cn in ("Choreographer#doFrame", "Choreographer#doFrame-start", "DrawFrame", "doFrame"):
        q = _safe(tp, "SELECT ts FROM slice WHERE name LIKE '%%%s%%' %s ORDER BY ts LIMIT 5000" % (cn, win), "chore %s" % cn)
        if q and len(q) >= 2:
            frame_q = q
            break
    if frame_q:
        ts = [int(r.ts) for r in frame_q]
        durs = sorted([(ts[i + 1] - ts[i]) / 1e6 for i in range(len(ts) - 1) if (ts[i + 1] - ts[i]) / 1e6 < 500])
        if durs:
            avg = sum(durs) / len(durs)
            p50, p95, p99 = _pct(durs, 50), _pct(durs, 95), _pct(durs, 99)
            slow = len([d for d in durs if d > 1000.0 / 30]) / len(durs) * 100  # >33.3ms 占比
            core_frame.append({
                "source": SOURCE, "frameDefinition": "choreographer",
                "p50Ms": _round(p50), "p95Ms": _round(p95), "p99Ms": _round(p99),
                "fps": _round(1000.0 / avg if avg else 0, 1), "slowFrameRate": _round(slow),
            })

    # --- PlayerLoop 帧 (应用一帧实际耗时; 与 choreographer 并列) ---
    player_loop_frame_count = None
    if main_utid is not None:
        win_pl = win.replace("ts >=", "s.ts >=") if win else ""
        pl_frames = _safe(tp, """
            SELECT s.ts ts, s.dur dur
            FROM slice s JOIN thread_track tt ON s.track_id=tt.id
            WHERE tt.utid=%d AND s.name='PlayerLoop' %s
            ORDER BY s.ts
        """ % (main_utid, win_pl), "playerloop frames")
        if pl_frames:
            durs = sorted([int(r.dur) / 1e6 for r in pl_frames
                           if r.dur is not None and int(r.dur) > 0 and int(r.dur) / 1e6 < 500])
            if durs:
                avg = sum(durs) / len(durs)
                p50, p95, p99 = _pct(durs, 50), _pct(durs, 95), _pct(durs, 99)
                slow = len([d for d in durs if d > 1000.0 / 30]) / len(durs) * 100
                player_loop_frame_count = len(durs)
                core_frame.append({
                    "source": SOURCE, "frameDefinition": "playerloop",
                    "count": len(durs),
                    "p50Ms": _round(p50), "p95Ms": _round(p95), "p99Ms": _round(p99),
                    "fps": _round(1000.0 / avg if avg else 0, 1), "slowFrameRate": _round(slow),
                })

    # --- FrameTimeline (expected vs actual jank, 若 trace 含) ---
    frame_timeline = None
    ft = _safe(tp, "SELECT jank_type, COUNT(*) n FROM actual_frame_timeline_slice GROUP BY jank_type", "frametimeline")
    if ft:
        jank = {r.jank_type: int(r.n) for r in ft}
        total = sum(jank.values())
        janky = sum(n for k, n in jank.items() if k and "None" not in str(k))
        frame_timeline = {"totalFrames": total, "jankyFrames": janky,
                          "jankRate": _round(janky / total * 100, 2) if total else 0.0, "byType": jank}
    else:
        notes.append("trace 无 FrameTimeline (actual_frame_timeline_slice); 显示链路掉帧/VSync miss 无法量化。")

    # --- atrace slice 树 (UnityMain) ---
    call_trees = []
    atrace_slices = {}
    if main_utid is not None:
        tree, tree_fallback_note = _slice_tree(tp, main_utid, win_dur_ns, min_pct=slice_tree_min_pct, max_depth=slice_tree_max_depth)
        if tree:
            call_trees.append({"thread": "UnityMain", "label": "atrace-slice-tree", "root": {
                "name": "UnityMain", "totalPct": 100.0, "children": tree,
            }})
        if tree_fallback_note:
            notes.append(tree_fallback_note)
        # 关键 slice 帧均 (供 marker.* 跨源对照, source=perfetto)
        for sname in ("PlayerLoop", "BehaviourUpdate", "Camera.Render", "GC.Collect", "WaitForTargetFPS", "Coroutines"):
            q = _safe(tp, """
                SELECT COUNT(*) cnt, AVG(dur) avg_ns, SUM(dur) sum_ns
                FROM slice s JOIN thread_track tt ON s.track_id=tt.id
                WHERE tt.utid=%d AND s.name LIKE '%s%%' %s
            """ % (main_utid, sname, win.replace("ts >=", "s.ts >=") if win else ""), "slice %s" % sname)
            if q and q[0].cnt and int(q[0].cnt) > 0:
                atrace_slices[sname] = {"count": int(q[0].cnt), "avgMs": _round(float(q[0].avg_ns) / 1e6, 3),
                                        "totalMs": _round(float(q[0].sum_ns) / 1e6, 2)}

    # --- GC.Alloc 业务子树归因 (遍历 callTree 全树, 不预设模块名) ---
    gc_alloc = {
        "available": False,
        "playerLoopFrameCount": player_loop_frame_count,
        "totalGcAllocSlices": 0,
        "byChain": [],
    }
    if main_utid is not None and call_trees:
        gc_alloc = _gc_alloc_by_chain(tp, main_utid, win, call_trees, player_loop_frame_count)

    # --- binder / pss ---
    if main_utid is not None:
        bq = _safe(tp, """
            SELECT COUNT(*) cnt, AVG(dur) avg_ns FROM slice s JOIN thread_track tt ON s.track_id=tt.id
            WHERE tt.utid=%d AND s.name LIKE 'binder%%' %s
        """ % (main_utid, win.replace("ts >=", "s.ts >=") if win else ""), "binder")
        if bq and bq[0].cnt is not None:
            cnt = int(bq[0].cnt)
            avg = _round(float(bq[0].avg_ns) / 1e6, 3) if bq[0].avg_ns else 0.0
            system["binder"] = {"count": cnt, "avgMs": avg}
            metrics.append(_metric("system.binder.count", cnt, "count"))
            metrics.append(_metric("system.binder.avgMs", avg, "ms"))
    pq = _safe(tp, """
        SELECT AVG(value) v FROM counter c JOIN process_counter_track pct ON c.track_id=pct.id
        WHERE pct.name='mem.rss.anon' LIMIT 1
    """, "pss")
    if pq and pq[0].v is not None:
        v = _round(float(pq[0].v) / 1024 / 1024, 1)
        system["pssMb"] = v
        metrics.append(_metric("system.pssMb", v, "mb"))

    # --- 降频推断 ---
    sidecar = _read_sidecar(trace_path)
    throttling = _throttling(tp, win.replace("ts >=", "c.ts >=") if win else "", main_running_pct, sidecar=sidecar)
    if throttling.get("level") == "suspected":
        system["cpuThrottled"] = True

    # --- off-CPU 归因 (byState 细分; byReason/blockedFunction 需内核 sched_blocked_reason) ---
    # offCpuAttribution 与 offCpuReasons 共享同一对象 (向后兼容扩展字段)
    off_cpu = None
    if main_utid is not None:
        state_rows = _safe(tp, """
            SELECT state, SUM(dur) total_ns, COUNT(*) cnt
            FROM thread_state
            WHERE utid=%d %s
            GROUP BY state
        """ % (main_utid, win), "main thread state by state")
        by_state = []
        total_off = 0
        if state_rows:
            for r in state_rows:
                s = str(r.state or "Unknown")
                ns = int(r.total_ns or 0)
                cnt = int(r.cnt or 0)
                if s == "Running":
                    continue  # off-CPU = 非 Running
                total_off += ns
                by_state.append({"state": s, "totalMs": _round(ns / 1e6, 1),
                                  "count": cnt, "pctOfOffCpu": None})
            for b in by_state:
                b["pctOfOffCpu"] = _round(b["totalMs"] / (total_off / 1e6) * 100, 2) if total_off else 0.0
        ms = threads_sched.get("UnityMain", {})
        off_cpu = {
            "sleepingPct": ms.get("sleepingPct"),
            "runnablePct": ms.get("runnablePct"),
            "totalOffCpuMs": _round(total_off / 1e6, 1) if total_off else 0.0,
            "byState": by_state,
            "note": ("byState 直接从 thread_state 表分组求和; "
                     "byReason 细分 (blockedFunction) 需内核 sched_blocked_reason, 本 trace 未含."),
        }

    tp.close()

    if parse_status == "ok" and notes:
        parse_status = "partial"

    detail = {
        "profileWindow": {"startNs": str(win_start) if win_start else None,
                          "endNs": str(win_end) if win_end else None,
                          "durMs": _round(win_dur_ns / 1e6, 1)},
        "parseOptions": {
            "profileName": profile_name,
            "sliceTreeMinPct": slice_tree_min_pct,
            "sliceTreeMaxDepth": slice_tree_max_depth,
            "summaryMinPct": summary_min_pct,
            "summaryMaxDepth": summary_max_depth,
        },
        "threadsSched": threads_sched,
        "callTrees": call_trees,
        "atraceSlices": atrace_slices,
        "throttling": throttling,
        "offCpuReasons": off_cpu,
        "offCpuAttribution": off_cpu,  # 同一对象; query 可从任一字段读 byState
        "gcAllocByChain": gc_alloc,
        "frameTimeline": frame_timeline,
        "gpu": gpu,
        "parseStatus": parse_status,
        "parseNotes": notes,
    }

    profile = {
        "raw": [{"source": SOURCE, "role": "pftrace",
                 "localPath": os.path.abspath(trace_path), "fileName": os.path.basename(trace_path)}],
        "core": {
            "schemaVersion": SCHEMA_VERSION,
            "metrics": metrics,
            "frame": core_frame,
            "threads": core_threads,
            "system": system,
            "confidence": {"perFrameAlignmentOk": None, "notes": notes},
        },
        "detail": {SOURCE: detail},
        "meta": {
            "device": meta.get("device"),
            "scene": meta.get("scene"),
            "durationSec": meta.get("duration_sec"),
            "pid": meta.get("pid"),
        },
    }
    summary = _build_summary(
        profile, throttling, atrace_slices, frame_timeline, threads_sched, call_trees,
        summary_min_pct, summary_max_depth,
    )
    return {"profile": profile, "summary": summary}


def _prune(node, min_pct, max_depth, depth=0):
    kids = [] if depth >= max_depth else [
        _prune(c, min_pct, max_depth, depth + 1)
        for c in sorted(node.get("children", []), key=lambda c: c.get("totalMs", 0), reverse=True)
        if c.get("totalPct", 0) >= min_pct
    ]
    out = dict(node)
    out["children"] = kids
    return out


def _build_summary(profile, throttling, atrace_slices, frame_timeline, threads_sched, call_trees,
                   summary_min_pct=1.0, summary_max_depth=8):
    detail = profile["detail"][SOURCE]
    gc_full = detail.get("gcAllocByChain") or {}
    gc_chain = gc_full.get("byChain") or []
    # summary 剪枝: perFrame ≥ 0.1 或 count ≥ 10
    gc_pruned = [
        c for c in gc_chain
        if (c.get("perFrame") is not None and c.get("perFrame") >= 0.1) or (c.get("count") or 0) >= 10
    ]
    gc_summary = {
        "available": bool(gc_full.get("available")),
        "playerLoopFrameCount": gc_full.get("playerLoopFrameCount"),
        "totalGcAllocSlices": gc_full.get("totalGcAllocSlices", 0),
        "byChain": gc_pruned,
    } if gc_full else None
    return {
        "source": SOURCE,
        "schemaVersion": SCHEMA_VERSION,
        "meta": profile["meta"],
        "metrics": profile["core"]["metrics"],
        "frame": profile["core"]["frame"],
        "system": profile["core"]["system"],
        "confidence": profile["core"]["confidence"],
        "threadsSched": threads_sched,
        "atraceSlices": atrace_slices,
        "frameTimeline": frame_timeline,
        "throttling": throttling,
        "offCpuReasons": detail.get("offCpuReasons"),
        "offCpuAttribution": detail.get("offCpuAttribution"),
        "gcAllocByChain": gc_summary,
        "callTrees": [{"thread": t["thread"], "label": t["label"],
                       "root": _prune(t["root"], summary_min_pct, summary_max_depth)} for t in call_trees],
        "_meta": {"note": "单源 perfetto PerfProfile 摘要。全量 slice 树在 perfetto-profile.json 的 detail.perfetto.callTrees "
                  "(此处剪枝 totalPct>=%s%%, depth<=%d)。gcAllocByChain 剪枝 perFrame≥0.1 或 count≥10。"
                  % (summary_min_pct, summary_max_depth),
                  "parseStatus": detail["parseStatus"]},
    }
