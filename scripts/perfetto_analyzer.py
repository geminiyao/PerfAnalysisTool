#!/usr/bin/env python3
"""perfetto_analyzer.py - 解析 .pftrace 文件，提取 Maple 对比所需的关键指标。

依赖：pip install perfetto
用法：python perfetto_analyzer.py <trace.pftrace> [--profile-name CombinedProfile]

输出：JSON（stdout），供 maple_compare.py / maple-analyzer.ts 读取。

提取指标：
  - CombinedProfile_xxx 色块时间窗口（profile_window_start/end_ns）
  - UnityMain 线程调度分布（Running / Runnable / Sleeping 占比）
  - 所有 Worker / Job 线程 CPU 调度分布
  - Unity atrace 关键 slice（PlayerLoop / Scripting / Camera.Render 等）帧均时长
  - Choreographer 帧时长分布 P50/P95/P99
  - CPU 频率均值
  - GPU 利用率（GpuQueue 或 gpu_mem 上报，fallback freqency）
  - GPU 频率均值（如设备驱动上报）
  - Binder 调用次数 + 均值延迟
  - PSS 内存均值
"""

import argparse
import json
import sys

try:
    from perfetto.trace_processor import TraceProcessor
except ImportError:
    print(json.dumps({
        "parse_status": "failed",
        "parse_notes": "perfetto Python library not installed. Run: pip install perfetto",
    }))
    sys.exit(0)  # 非 1，让 TS 侧 insert partial 结果而非抛异常


# Unity atrace 中常见的关键 slice 名称（子字符串匹配或精确匹配）
UNITY_KEY_SLICES = [
    "PlayerLoop",
    "BehaviourUpdate",
    "ScriptRunBehaviourUpdate",
    "Camera.Render",
    "Shadows.Draw",
    "RenderForward",
    "WaitForTargetFPS",
    "GC.Collect",
    "Physics.Processing",
    "Rendering",
    "Coroutines",
    "AnimatorControllerPlayback",
]


def safe_query(tp, sql, description=""):
    """执行 SQL，失败时返回 None 并记录警告（不中断整体解析）。"""
    try:
        return tp.query(sql)
    except Exception as e:
        print(f"[perfetto_analyzer] WARN: {description} query failed: {e}", file=sys.stderr)
        return None


def _percentile(sorted_vals, pct):
    if not sorted_vals:
        return 0.0
    idx = int((len(sorted_vals) - 1) * pct / 100)
    return sorted_vals[max(0, min(idx, len(sorted_vals) - 1))]


def parse_trace(trace_path: str, profile_name_prefix: str) -> dict:
    result = {
        "parse_status": "ok",
        "parse_notes": "",
    }
    notes = []

    tp = TraceProcessor(trace=trace_path)

    # -----------------------------------------------------------------------
    # 1. 找 CombinedProfile_xxx 色块时间窗口
    # -----------------------------------------------------------------------
    profile_window_start_ns = None
    profile_window_end_ns = None

    slice_q = safe_query(tp, f"""
        SELECT ts, dur, name
        FROM slice
        WHERE name LIKE '{profile_name_prefix}%'
        ORDER BY ts
        LIMIT 1
    """, "profile window slice")

    if slice_q is not None:
        rows = list(slice_q)
        if rows:
            row = rows[0]
            profile_window_start_ns = int(row.ts)
            profile_window_end_ns = int(row.ts + row.dur)
            result["profile_window_start_ns"] = str(profile_window_start_ns)
            result["profile_window_end_ns"] = str(profile_window_end_ns)
            result["profile_window_dur_ms"] = round(row.dur / 1e6, 3)
        else:
            notes.append(f"No slice matching '{profile_name_prefix}%' found in trace")

    # 如果找不到色块，用整段 trace 的时间范围
    if profile_window_start_ns is None:
        meta_q = safe_query(tp, "SELECT start_ts, end_ts FROM trace_bounds", "trace bounds")
        if meta_q is not None:
            rows = list(meta_q)
            if rows:
                profile_window_start_ns = int(rows[0].start_ts)
                profile_window_end_ns = int(rows[0].end_ts)
                notes.append("Using full trace range (CombinedProfile slice not found)")

    win_filter = ""
    if profile_window_start_ns and profile_window_end_ns:
        win_filter = f"AND ts >= {profile_window_start_ns} AND ts <= {profile_window_end_ns}"

    win_filter_c = ""  # 用于 counter 表 (c.ts)
    if profile_window_start_ns and profile_window_end_ns:
        win_filter_c = f"AND c.ts >= {profile_window_start_ns} AND c.ts <= {profile_window_end_ns}"

    # -----------------------------------------------------------------------
    # 2. 查询所有线程 utid / 名称
    # -----------------------------------------------------------------------
    thread_q = safe_query(tp, """
        SELECT utid, name, tid
        FROM thread
        WHERE name IS NOT NULL
    """, "all threads")

    threads_by_name: dict = {}   # name -> [utid, ...]
    main_utid = None
    if thread_q is not None:
        for row in thread_q:
            name = row.name or ""
            threads_by_name.setdefault(name, []).append(int(row.utid))
            if name == "UnityMain" and main_utid is None:
                main_utid = int(row.utid)

    if main_utid is None:
        notes.append("UnityMain thread not found")

    # -----------------------------------------------------------------------
    # 3. 单个线程调度分布（Running / Runnable / Sleeping）
    # -----------------------------------------------------------------------
    def get_thread_sched(utid: int) -> dict:
        q = safe_query(tp, f"""
            SELECT state, SUM(dur) as total_ns
            FROM thread_state
            WHERE utid = {utid} {win_filter}
            GROUP BY state
        """, f"thread_state utid={utid}")
        if q is None:
            return {}
        state_map: dict = {}
        total_ns = 0
        for row in q:
            state_map[row.state] = int(row.total_ns)
            total_ns += int(row.total_ns)
        if total_ns == 0:
            return {}
        return {
            "running_pct":  round(state_map.get("Running", 0) / total_ns * 100, 2),
            "runnable_pct": round(state_map.get("R", 0) / total_ns * 100, 2),
            "sleeping_pct": round((state_map.get("S", 0) + state_map.get("D", 0)) / total_ns * 100, 2),
            "total_ns":     total_ns,
        }

    # UnityMain 调度
    if main_utid is not None:
        sched = get_thread_sched(main_utid)
        if sched:
            result["main_thread_running_pct"]  = sched["running_pct"]
            result["main_thread_runnable_pct"] = sched["runnable_pct"]
            result["main_thread_sleeping_pct"] = sched["sleeping_pct"]

    # -----------------------------------------------------------------------
    # 4. Worker / Job / GfxDeviceWorker 线程调度汇总
    # -----------------------------------------------------------------------
    worker_keywords = ["Worker", "Job", "GfxDevice", "Render", "Loading", "Audio"]
    worker_threads_sched = {}

    for tname, utids in threads_by_name.items():
        if not any(kw in tname for kw in worker_keywords):
            continue
        # 合并同名多线程
        combined: dict = {"running_pct": 0.0, "runnable_pct": 0.0, "sleeping_pct": 0.0,
                          "total_ns": 0, "count": len(utids)}
        for utid in utids:
            s = get_thread_sched(utid)
            if s:
                combined["total_ns"] += s["total_ns"]
                combined["running_pct"]  += s["running_pct"]
                combined["runnable_pct"] += s["runnable_pct"]
                combined["sleeping_pct"] += s["sleeping_pct"]
        if combined["total_ns"] == 0:
            continue
        n = len(utids)
        worker_threads_sched[tname] = {
            "count":        n,
            "running_pct":  round(combined["running_pct"] / n, 2),
            "runnable_pct": round(combined["runnable_pct"] / n, 2),
            "sleeping_pct": round(combined["sleeping_pct"] / n, 2),
        }

    if worker_threads_sched:
        result["worker_threads_sched"] = worker_threads_sched

    # -----------------------------------------------------------------------
    # 5. CPU 频率均值（加权平均，单位 MHz）
    # -----------------------------------------------------------------------
    cpu_freq_q = safe_query(tp, f"""
        SELECT AVG(value) as avg_freq_khz
        FROM counter c
        JOIN counter_track ct ON c.track_id = ct.id
        WHERE ct.name = 'cpufreq' {win_filter_c}
    """, "cpu_freq")

    if cpu_freq_q is not None:
        rows = list(cpu_freq_q)
        if rows and rows[0].avg_freq_khz is not None:
            result["cpu_freq_avg_mhz"] = round(float(rows[0].avg_freq_khz) / 1000.0, 1)

    # -----------------------------------------------------------------------
    # 6. GPU 利用率（GpuQueue busy 时间占比）
    # -----------------------------------------------------------------------
    # 方法1: gpu_mem / GpuQueue slice
    gpu_util_q = safe_query(tp, f"""
        SELECT SUM(dur) as busy_ns
        FROM slice s
        JOIN track t ON s.track_id = t.id
        WHERE t.name LIKE '%GpuQueue%' OR t.name LIKE '%gpu_queue%'
        {win_filter}
    """, "gpu_queue_busy")

    if gpu_util_q is not None:
        rows = list(gpu_util_q)
        if rows and rows[0].busy_ns is not None:
            win_dur = (profile_window_end_ns - profile_window_start_ns) if profile_window_start_ns else 1
            result["gpu_busy_pct"] = round(float(rows[0].busy_ns) / win_dur * 100, 2)

    # 方法2: GPU 频率均值（依赖驱动上报，可能不存在）
    gpu_freq_q = safe_query(tp, f"""
        SELECT AVG(value) as avg_freq
        FROM counter c
        JOIN counter_track ct ON c.track_id = ct.id
        WHERE ct.name LIKE '%gpu%freq%' {win_filter_c}
    """, "gpu_freq")

    if gpu_freq_q is not None:
        rows = list(gpu_freq_q)
        if rows and rows[0].avg_freq is not None:
            result["gpu_freq_avg_mhz"] = round(float(rows[0].avg_freq) / 1e6, 1)
        else:
            notes.append("GPU frequency counter not available on this device")

    # -----------------------------------------------------------------------
    # 7. 帧时长分布（Choreographer doFrame 信号间隔）
    # 尝试多种名称：不同 Android 版本 / ROM 命名不同
    # -----------------------------------------------------------------------
    frame_q = None
    for chore_name in (
        "Choreographer#doFrame",
        "Choreographer#doFrame-start",
        "DrawFrame",
        "android.view.ViewRootImpl#performTraversals",
        "doFrame",
    ):
        q = safe_query(tp, f"""
            SELECT ts
            FROM slice
            WHERE name LIKE '%{chore_name}%'
            {win_filter}
            ORDER BY ts
            LIMIT 2000
        """, f"choreographer_{chore_name}")
        if q is not None:
            rows = list(q)
            if len(rows) >= 2:
                frame_q = iter(rows)
                notes_label = chore_name
                break

    if frame_q is not None:
        timestamps = [int(row.ts) for row in frame_q]
        if len(timestamps) >= 2:
            frame_durs_ms = [
                (timestamps[i+1] - timestamps[i]) / 1e6
                for i in range(len(timestamps) - 1)
                if (timestamps[i+1] - timestamps[i]) / 1e6 < 500
            ]
            if frame_durs_ms:
                frame_durs_ms.sort()
                n = len(frame_durs_ms)
                result["frame_count"]  = n
                result["frame_avg_ms"] = round(sum(frame_durs_ms) / n, 2)
                result["frame_p50_ms"] = round(_percentile(frame_durs_ms, 50), 2)
                result["frame_p95_ms"] = round(_percentile(frame_durs_ms, 95), 2)
                result["frame_p99_ms"] = round(_percentile(frame_durs_ms, 99), 2)
        else:
            notes.append("Not enough Choreographer frames found")

    # -----------------------------------------------------------------------
    # 8. Unity atrace 关键 slice 帧均时长（UnityMain 线程）
    # -----------------------------------------------------------------------
    if main_utid is not None:
        unity_slice_stats = {}
        for slice_name in UNITY_KEY_SLICES:
            sq = safe_query(tp, f"""
                SELECT COUNT(*) as cnt, AVG(dur) as avg_dur_ns, SUM(dur) as sum_dur_ns
                FROM slice s
                JOIN thread_track tt ON s.track_id = tt.id
                WHERE tt.utid = {main_utid}
                  AND s.name LIKE '{slice_name}%'
                  {win_filter.replace('ts >=', 's.ts >=')}
            """, f"unity_slice_{slice_name}")
            if sq is not None:
                rows = list(sq)
                if rows and rows[0].cnt and int(rows[0].cnt) > 0:
                    unity_slice_stats[slice_name] = {
                        "count":      int(rows[0].cnt),
                        "avg_ms":     round(float(rows[0].avg_dur_ns) / 1e6, 3),
                        "total_ms":   round(float(rows[0].sum_dur_ns) / 1e6, 2),
                    }
        if unity_slice_stats:
            result["unity_slices"] = unity_slice_stats

    # -----------------------------------------------------------------------
    # 9. Binder 调用（UnityMain 发起）
    # -----------------------------------------------------------------------
    if main_utid is not None:
        binder_q = safe_query(tp, f"""
            SELECT COUNT(*) as cnt, AVG(dur) as avg_dur_ns
            FROM slice s
            JOIN thread_track tt ON s.track_id = tt.id
            WHERE tt.utid = {main_utid}
              AND s.name LIKE 'binder%'
              {win_filter.replace('ts >=', 's.ts >=')}
        """, "binder")

        if binder_q is not None:
            rows = list(binder_q)
            if rows and rows[0].cnt:
                result["binder_call_count"] = int(rows[0].cnt)
                if rows[0].avg_dur_ns is not None:
                    result["binder_avg_dur_ms"] = round(float(rows[0].avg_dur_ns) / 1e6, 3)

    # -----------------------------------------------------------------------
    # 10. PSS（进程内存，可能不在 trace 里）
    # -----------------------------------------------------------------------
    pss_q = safe_query(tp, """
        SELECT AVG(value) as avg_pss
        FROM counter c
        JOIN process_counter_track pct ON c.track_id = pct.id
        WHERE pct.name = 'mem.rss.anon'
        LIMIT 1
    """, "pss")

    if pss_q is not None:
        rows = list(pss_q)
        if rows and rows[0].avg_pss is not None:
            result["pss_mb"] = round(float(rows[0].avg_pss) / 1024 / 1024, 1)

    # -----------------------------------------------------------------------
    # 汇总 notes
    # -----------------------------------------------------------------------
    if notes:
        result["parse_status"] = "partial"
        result["parse_notes"] = "; ".join(notes)

    tp.close()
    return result


def main():
    parser = argparse.ArgumentParser(description="Parse perfetto trace for Maple analysis")
    parser.add_argument("trace_path", help="Path to .pftrace file")
    parser.add_argument("--profile-name", default="CombinedProfile",
                        help="Prefix of the atrace section name (default: CombinedProfile)")
    args = parser.parse_args()

    try:
        result = parse_trace(args.trace_path, args.profile_name)
    except Exception as e:
        result = {
            "parse_status": "failed",
            "parse_notes": str(e)[:500],
        }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
