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
def _slice_tree(tp, utid, win_dur_ns, min_pct=0.5, max_depth=12):
    rows = _safe(tp, """
        SELECT s.id id, s.parent_id parent_id, s.name name, s.dur dur
        FROM slice s JOIN thread_track tt ON s.track_id = tt.id
        WHERE tt.utid = %d AND s.dur >= 0
    """ % utid, "slices utid=%d" % utid)
    if not rows:
        return None
    children_of = {}  # parent_id -> [row]
    roots = []
    by_id = {}
    for r in rows:
        by_id[r.id] = r
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

    return aggregate(roots, 0)


# ------------------------------------------------------------
# 降频推断 (推测级; 确认级需 sysfs 旁路 scaling_max vs cpuinfo_max)
# ------------------------------------------------------------
def _throttling(tp, win, main_running_pct, sysfs_available=False):
    rows = _safe(tp, """
        SELECT cct.cpu cpu, AVG(c.value) avg_khz, MAX(c.value) max_khz, COUNT(*) n
        FROM counter c JOIN cpu_counter_track cct ON c.track_id = cct.id
        WHERE cct.name = 'cpufreq'
        GROUP BY cct.cpu ORDER BY cct.cpu
    """, "per-cpu cpufreq")
    per_cpu = []
    if rows:
        for r in rows:
            if r.max_khz is None:
                continue
            per_cpu.append({
                "cpu": int(r.cpu),
                "avgMhz": _round(float(r.avg_khz) / 1000.0, 1),
                "maxMhz": _round(float(r.max_khz) / 1000.0, 1),
                "reachPct": _round(float(r.avg_khz) / float(r.max_khz) * 100, 1) if r.max_khz else 0.0,
            })
    evidence = []
    level = "unknown"
    if not per_cpu:
        evidence.append("trace 无 cpufreq 计数器, 无法推断频率。")
        return {"level": level, "confirmedAvailable": sysfs_available, "perCpu": per_cpu, "evidence": evidence}

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
    evidence.append("确认级降频判定需 sysfs 旁路 (scaling_max_freq vs cpuinfo_max_freq / cooling state); 本样本无 thermal_before/after.txt, 故仅推测级。")
    return {
        "level": level,
        "confirmedAvailable": sysfs_available,
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
        tree = _slice_tree(tp, main_utid, win_dur_ns, min_pct=slice_tree_min_pct, max_depth=slice_tree_max_depth)
        if tree:
            call_trees.append({"thread": "UnityMain", "label": "atrace-slice-tree", "root": {
                "name": "UnityMain", "totalPct": 100.0, "children": tree,
            }})
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
    throttling = _throttling(tp, win.replace("ts >=", "c.ts >=") if win else "", main_running_pct, sysfs_available=False)
    if throttling.get("level") == "suspected":
        system["cpuThrottled"] = True

    # --- off-CPU 归因 (主线程睡眠占比; 细分阻塞原因需内核 sched_blocked_reason) ---
    off_cpu = None
    if main_running_pct is not None:
        ms = threads_sched.get("UnityMain", {})
        off_cpu = {"sleepingPct": ms.get("sleepingPct"), "runnablePct": ms.get("runnablePct"),
                   "note": "主线程非运行时间拆分 (GPU 等待/锁/binder/vsync) 需内核 sched_blocked_reason, 本 trace 未含细分。"}

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
        "offCpuReasons": profile["detail"][SOURCE]["offCpuReasons"],
        "callTrees": [{"thread": t["thread"], "label": t["label"],
                       "root": _prune(t["root"], summary_min_pct, summary_max_depth)} for t in call_trees],
        "_meta": {"note": "单源 perfetto PerfProfile 摘要。全量 slice 树在 perfetto-profile.json 的 detail.perfetto.callTrees "
                  "(此处剪枝 totalPct>=%s%%, depth<=%d)。" % (summary_min_pct, summary_max_depth),
                  "parseStatus": profile["detail"][SOURCE]["parseStatus"]},
    }
