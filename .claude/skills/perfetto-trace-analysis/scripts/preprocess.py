#!/usr/bin/env python3
"""
Perfetto Trace Preprocessor for Unity Android Games.

Extracts system-level performance data from .pftrace files:
- Frame timing (PlayerLoop-based)
- CPU scheduling (big/little core, migrations, preemption)
- CPU frequency (throttling detection)
- Thread overlap analysis (Main vs Render)
- System interference

Usage:
  python preprocess.py --input <file.pftrace> --target-fps <fps> [--output-dir <dir>] [--config <config.json>]
  python preprocess.py --input <file.pftrace> --query-frame <index>
"""

import argparse
import json
import os
import sys
import statistics
from pathlib import Path

# Force UTF-8 mode on Windows to handle Chinese characters correctly
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONUTF8', '1')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

from perfetto.trace_processor import TraceProcessor


def check_table_exists(tp: TraceProcessor, table_name: str) -> bool:
    """Check if a table exists in the Perfetto trace database."""
    try:
        result = tp.query(f"""
            SELECT COUNT(*) as cnt FROM sqlite_master
            WHERE type='table' AND name='{table_name}'
        """)
        for row in result:
            return row.cnt > 0
    except Exception:
        pass
    return False


def load_config(script_dir: str) -> dict:
    config_path = os.path.join(script_dir, '..', 'config.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[preprocess] Could not load config.json: {e}, using defaults", file=sys.stderr)
        return {
            "targetFps": 30,
            "gameProcess": "com.tencent.aoeyz",
            "jank": {"jankMultiplier": 2, "bigJankMultiplier": 3},
            "mainThread": {"name": "UnityMain"},
            "renderThread": {"name": "UnityGfxRenderS"},
            "filter": {"minSliceDurMs": 0.1},
            "blacklist": ["Semaphore.WaitForSignal", "WaitForJobGroupID"]
        }


def find_game_process(tp: TraceProcessor, game_process_name: str) -> tuple:
    """Find game process PID and upid."""
    result = tp.query(f"""
        SELECT id as upid, pid, name FROM process
        WHERE name LIKE '%{game_process_name}%' AND name NOT LIKE '%:xg%' AND name NOT LIKE '%:daemon%'
        LIMIT 1
    """)
    for row in result:
        return row.upid, row.pid, row.name
    return None, None, None


def find_thread_tid(tp: TraceProcessor, upid: int, thread_name: str) -> int:
    """Find thread TID by name within game process."""
    result = tp.query(f"""
        SELECT tid FROM thread
        WHERE upid = {upid} AND name LIKE '%{thread_name}%'
        LIMIT 1
    """)
    for row in result:
        return row.tid
    return None


def get_device_info(tp: TraceProcessor) -> dict:
    """Extract CPU core info (big/little clusters, frequency ranges)."""
    result = tp.query("""
        SELECT cpu,
               CAST(MIN(value)/1000 AS INT) as min_mhz,
               CAST(MAX(value)/1000 AS INT) as max_mhz
        FROM counter
        JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
        WHERE cpu_counter_track.name = 'cpufreq'
        GROUP BY cpu
        ORDER BY cpu
    """)

    cores = []
    for row in result:
        cores.append({
            "id": row.cpu,
            "minMhz": row.min_mhz,
            "maxMhz": row.max_mhz
        })

    if not cores:
        return {"cpuCores": [], "coreCount": 0, "bigCores": [], "littleCores": []}

    # Classify big/little by clustering max frequencies
    # Group cores with same max frequency together, then split by frequency gap
    freq_groups = {}
    for c in cores:
        freq_groups.setdefault(c["maxMhz"], []).append(c["id"])

    sorted_freqs = sorted(freq_groups.keys())
    if len(sorted_freqs) >= 2:
        # Find the biggest gap between frequency groups
        max_gap = 0
        split_idx = 0
        for i in range(1, len(sorted_freqs)):
            gap = sorted_freqs[i] - sorted_freqs[i-1]
            if gap > max_gap:
                max_gap = gap
                split_idx = i
        little_freqs = sorted_freqs[:split_idx]
        big_freqs = sorted_freqs[split_idx:]
        little_cores = [cid for f in little_freqs for cid in freq_groups[f]]
        big_cores = [cid for f in big_freqs for cid in freq_groups[f]]
    else:
        # All cores have same max frequency - treat all as "big"
        big_cores = [c["id"] for c in cores]
        little_cores = []

    for c in cores:
        c["cluster"] = "big" if c["id"] in big_cores else "little"

    return {
        "cpuCores": cores,
        "coreCount": len(cores),
        "bigCores": big_cores,
        "littleCores": little_cores
    }


def get_frame_timing(tp: TraceProcessor, main_tid: int, config: dict) -> dict:
    """Extract frame timing from PlayerLoop slices."""
    result = tp.query(f"""
        SELECT s.ts, CAST(s.dur AS REAL) / 1e6 as dur_ms
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.id
        WHERE t.tid = {main_tid} AND s.name = 'PlayerLoop' AND s.dur > 0
        ORDER BY s.ts
    """)

    frames = []
    for row in result:
        frames.append({"ts": row.ts, "durMs": row.dur_ms})

    if not frames:
        return {"count": 0, "actualFps": 0, "frames": []}

    durations = [f["durMs"] for f in frames]
    durations_sorted = sorted(durations)
    n = len(durations)

    target_fps = config.get("targetFps", 30)
    frame_budget = 1000.0 / target_fps
    jank_mult = config["jank"]["jankMultiplier"]
    bigjank_mult = config["jank"]["bigJankMultiplier"]

    # Jank detection (same logic as unity skill: current / prev3avg)
    jank_frames = []
    for i in range(3, n):
        prev3_avg = (durations[i-1] + durations[i-2] + durations[i-3]) / 3
        if prev3_avg <= 0:
            continue
        ratio = durations[i] / prev3_avg
        level = None
        if ratio >= bigjank_mult:
            level = "BigJank"
        elif ratio >= jank_mult:
            level = "Jank"
        if level:
            jank_frames.append({
                "frameIndex": i,
                "durationMs": round(durations[i], 2),
                "prevAvgMs": round(prev3_avg, 2),
                "ratio": round(ratio, 2),
                "level": level
            })

    return {
        "count": n,
        "actualFps": round(1000.0 / statistics.mean(durations), 1),
        "mean": round(statistics.mean(durations), 2),
        "median": round(statistics.median(durations), 2),
        "min": round(min(durations), 2),
        "max": round(max(durations), 2),
        "q1": round(durations_sorted[n // 4], 2),
        "q3": round(durations_sorted[n * 3 // 4], 2),
        "jankCount": sum(1 for j in jank_frames if j["level"] == "Jank"),
        "bigJankCount": sum(1 for j in jank_frames if j["level"] == "BigJank"),
        "jankFrames": jank_frames,
        "frames": [{"index": i, "durMs": round(d, 2)} for i, d in enumerate(durations)]
    }


def get_scheduling_info(tp: TraceProcessor, tid: int, thread_label: str, device: dict, trace_start: int, trace_end: int) -> dict:
    """Get CPU scheduling info for a thread."""
    big_cores = device.get("bigCores", [])
    little_cores = device.get("littleCores", [])

    # Thread state distribution (running on which CPU)
    result = tp.query(f"""
        SELECT cpu, CAST(SUM(dur) AS REAL) / 1e6 as total_ms, COUNT(*) as slices
        FROM sched_slice
        WHERE utid = (SELECT id FROM thread WHERE tid = {tid} LIMIT 1)
        AND dur > 0
        GROUP BY cpu
        ORDER BY total_ms DESC
    """)

    per_cpu = {}
    total_run_ms = 0
    for row in result:
        per_cpu[row.cpu] = {"totalMs": round(row.total_ms, 2), "slices": row.slices}
        total_run_ms += row.total_ms

    big_core_ms = sum(per_cpu.get(c, {}).get("totalMs", 0) for c in big_cores)
    little_core_ms = sum(per_cpu.get(c, {}).get("totalMs", 0) for c in little_cores)

    on_big_pct = round(big_core_ms / total_run_ms * 100, 1) if total_run_ms > 0 else 0
    on_little_pct = round(little_core_ms / total_run_ms * 100, 1) if total_run_ms > 0 else 0

    # Core migrations
    result = tp.query(f"""
        SELECT COUNT(*) as migrations FROM (
            SELECT cpu, LAG(cpu) OVER (ORDER BY ts) as prev_cpu
            FROM sched_slice
            WHERE utid = (SELECT id FROM thread WHERE tid = {tid} LIMIT 1)
            AND dur > 0
        ) WHERE cpu != prev_cpu AND prev_cpu IS NOT NULL
    """)
    migrations = 0
    for row in result:
        migrations = row.migrations

    # Runnable time (time spent waiting to be scheduled)
    result = tp.query(f"""
        SELECT CAST(dur AS REAL) / 1e6 as dur_ms
        FROM thread_state
        WHERE utid = (SELECT id FROM thread WHERE tid = {tid} LIMIT 1)
        AND state = 'R'
        AND dur > 0
        ORDER BY dur DESC
    """)
    runnable_times = []
    for row in result:
        runnable_times.append(row.dur_ms)

    avg_runnable = round(statistics.mean(runnable_times), 3) if runnable_times else 0
    max_runnable = round(max(runnable_times), 3) if runnable_times else 0
    p95_runnable = round(sorted(runnable_times)[int(len(runnable_times) * 0.95)], 3) if len(runnable_times) > 20 else max_runnable
    total_runnable = round(sum(runnable_times), 2) if runnable_times else 0

    # Preemption count: times thread went from Running to Runnable (involuntary context switch)
    preemption_count = 0
    try:
        result = tp.query(f"""
            SELECT COUNT(*) as cnt FROM (
                SELECT state, LAG(state) OVER (ORDER BY ts) as prev_state
                FROM thread_state
                WHERE utid = (SELECT id FROM thread WHERE tid = {tid} LIMIT 1)
                AND dur > 0
            ) WHERE state = 'R' AND prev_state = 'Running'
        """)
        for row in result:
            preemption_count = row.cnt or 0
    except Exception:
        preemption_count = 0

    # Wakeup latency: time from Sleep->Runnable transition (approximated from thread_state)
    wakeup_latencies = []
    try:
        result = tp.query(f"""
            SELECT CAST(dur AS REAL) / 1e6 as dur_ms
            FROM thread_state
            WHERE utid = (SELECT id FROM thread WHERE tid = {tid} LIMIT 1)
            AND state = 'R'
            AND dur > 0
            ORDER BY dur DESC
            LIMIT 500
        """)
        # Wakeup latency approximation: runnable durations that follow a sleep state
        # Since we already have runnable_times, we use them as wakeup latency proxy
        # True wakeup latency = time from waking event to running, which equals runnable time
        wakeup_latencies = runnable_times[:500] if runnable_times else []
    except Exception:
        wakeup_latencies = []

    avg_wakeup = round(statistics.mean(wakeup_latencies), 3) if wakeup_latencies else 0
    max_wakeup = round(max(wakeup_latencies), 3) if wakeup_latencies else 0
    p95_wakeup = round(sorted(wakeup_latencies)[int(len(wakeup_latencies) * 0.95)], 3) if len(wakeup_latencies) > 20 else max_wakeup

    return {
        "tid": tid,
        "label": thread_label,
        "totalRunMs": round(total_run_ms, 2),
        "onBigCorePercent": on_big_pct,
        "onLittleCorePercent": on_little_pct,
        "perCpu": per_cpu,
        "coreMigrations": migrations,
        "runnableCount": len(runnable_times),
        "avgRunnableMs": avg_runnable,
        "maxRunnableMs": max_runnable,
        "p95RunnableMs": p95_runnable,
        "totalRunnableMs": total_runnable,
        "preemptionCount": preemption_count,
        "avgWakeupLatencyMs": avg_wakeup,
        "maxWakeupLatencyMs": max_wakeup,
        "p95WakeupLatencyMs": p95_wakeup
    }


def get_cpu_frequency_analysis(tp: TraceProcessor, device: dict, trace_start: int, trace_end: int) -> dict:
    """Analyze CPU frequency changes and detect throttling with scientific classification.

    Uses 4 methods to distinguish thermal throttling from normal DVFS:
    1. Load-frequency divergence (high load + freq drop = thermal)
    2. Frequency ceiling lock (max freq decreasing over time)
    3. Thermal zone temperature (direct thermal data if available)
    4. Cluster-wide synchronous drop (all cores in cluster drop together)
    """
    big_cores = device.get("bigCores", [])
    little_cores = device.get("littleCores", [])

    if not big_cores:
        return {
            "bigCoreAvgMhz": 0, "littleCoreAvgMhz": 0,
            "throttleEvents": [], "frequencyTimeline": [],
            "throttleClassification": {"thermalThrottle": False, "normalDvfs": False, "evidence": []}
        }

    # Average frequency per cluster
    big_core_list = ",".join(str(c) for c in big_cores)
    little_core_list = ",".join(str(c) for c in little_cores)

    result = tp.query(f"""
        SELECT CAST(AVG(value)/1000 AS INT) as avg_mhz
        FROM counter
        JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
        WHERE cpu_counter_track.name = 'cpufreq' AND cpu IN ({big_core_list})
    """)
    big_avg = 0
    for row in result:
        big_avg = row.avg_mhz or 0

    result = tp.query(f"""
        SELECT CAST(AVG(value)/1000 AS INT) as avg_mhz
        FROM counter
        JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
        WHERE cpu_counter_track.name = 'cpufreq' AND cpu IN ({little_core_list})
    """)
    little_avg = 0
    for row in result:
        little_avg = row.avg_mhz or 0

    # Collect per-core frequency timeline (all big cores, for multi-method analysis)
    per_core_freq = {}  # core_id -> [(ts_ns, mhz), ...]
    for core_id in big_cores:
        result = tp.query(f"""
            SELECT ts, CAST(value/1000 AS INT) as mhz
            FROM counter
            JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
            WHERE cpu_counter_track.name = 'cpufreq' AND cpu = {core_id}
            ORDER BY ts
        """)
        core_data = []
        for row in result:
            core_data.append((row.ts, row.mhz))
        if core_data:
            per_core_freq[core_id] = core_data

    # === Basic throttle event detection (frequency crosses below 80% max) ===
    throttle_events = []
    for core_id in big_cores:
        max_freq = next((c["maxMhz"] for c in device["cpuCores"] if c["id"] == core_id), 0)
        throttle_threshold = max_freq * 0.8
        core_data = per_core_freq.get(core_id, [])

        prev_mhz = None
        for ts, mhz in core_data:
            if prev_mhz and prev_mhz > throttle_threshold and mhz <= throttle_threshold:
                throttle_events.append({
                    "coreId": core_id,
                    "fromMhz": prev_mhz,
                    "toMhz": mhz,
                    "tsMs": round((ts - trace_start) / 1e6, 1)
                })
            prev_mhz = mhz

    # === Method 1: Load-Frequency Divergence ===
    # Check if CPU is busy when frequency drops (high utilization + low freq = thermal)
    load_freq_divergence = []
    for evt in throttle_events[:20]:  # Check up to 20 events
        ts_ns = trace_start + int(evt["tsMs"] * 1e6)
        # Check sched_slice density around this timestamp (±50ms window)
        try:
            result = tp.query(f"""
                SELECT CAST(SUM(dur) AS REAL) / 1e6 as busy_ms
                FROM sched_slice
                WHERE cpu = {evt['coreId']}
                AND ts >= {ts_ns - 50000000} AND ts < {ts_ns + 50000000}
                AND dur > 0
            """)
            busy_ms = 0
            for row in result:
                busy_ms = row.busy_ms or 0
            # 100ms window, if >70ms busy = high utilization
            utilization = busy_ms / 100.0
            if utilization > 0.7:
                load_freq_divergence.append({
                    "tsMs": evt["tsMs"],
                    "coreId": evt["coreId"],
                    "utilization": round(utilization * 100, 1),
                    "freqMhz": evt["toMhz"]
                })
        except Exception:
            pass

    # === Method 2: Frequency Ceiling Lock Detection ===
    # Split timeline into windows and check if max-achievable frequency decreases over time
    ceiling_lock = {"detected": False, "windows": []}
    freq_reachability = {"reachable": True, "observedMaxMhz": 0, "theoreticalMaxMhz": 0, "ratio": 1.0}
    if per_core_freq:
        sample_core = big_cores[0]
        core_data = per_core_freq.get(sample_core, [])
        theoretical_max = next((c["maxMhz"] for c in device["cpuCores"] if c["id"] == sample_core), 0)

        if core_data:
            # === Frequency Reachability Analysis ===
            # Can the CPU actually reach its theoretical max during this trace?
            observed_max = max(mhz for _, mhz in core_data)
            reachability_ratio = observed_max / theoretical_max if theoretical_max > 0 else 1.0

            freq_reachability = {
                "reachable": observed_max >= theoretical_max * 0.95,
                "observedMaxMhz": observed_max,
                "theoreticalMaxMhz": theoretical_max,
                "ratio": round(reachability_ratio, 3)
            }

            if not freq_reachability["reachable"]:
                thermal_score += 3
                evidence.append(f"频率可达性受限: 实际最高{observed_max}MHz < 理论最高{theoretical_max}MHz的95% (达到率{round(reachability_ratio*100,1)}%)")

            # Ceiling lock detection (existing logic)
            trace_dur_ns = trace_end - trace_start
            window_count = 5  # Split into 5 time windows
            window_dur = trace_dur_ns / window_count
            window_maxes = []
            for w in range(window_count):
                w_start = trace_start + int(w * window_dur)
                w_end = w_start + int(window_dur)
                w_freqs = [mhz for ts, mhz in core_data if w_start <= ts < w_end]
                if w_freqs:
                    window_maxes.append({
                        "window": w + 1,
                        "maxMhz": max(w_freqs),
                        "avgMhz": round(statistics.mean(w_freqs))
                    })

            # Detect ceiling decrease: if later windows have lower max than earlier ones
            if len(window_maxes) >= 3:
                first_max = window_maxes[0]["maxMhz"]
                last_max = window_maxes[-1]["maxMhz"]
                if first_max > 0 and last_max < first_max * 0.85:
                    ceiling_lock["detected"] = True
                ceiling_lock["windows"] = window_maxes

    # === Method 3: Thermal Zone Temperature (if available) ===
    thermal_data = {"available": False, "maxTemp": 0, "avgTemp": 0, "timeline": []}
    try:
        # Check for thermal_zone counters
        result = tp.query("""
            SELECT t.name, c.ts, c.value
            FROM counter c
            JOIN counter_track t ON c.track_id = t.id
            WHERE t.name LIKE '%thermal%' OR t.name LIKE '%temp%'
            ORDER BY c.ts
            LIMIT 500
        """)
        temps = []
        temp_timeline = []
        last_ts = 0
        for row in result:
            # Temperature values could be in millidegrees (45000) or degrees (45)
            temp = row.value / 1000.0 if row.value > 1000 else row.value
            if 10 < temp < 120:  # Sanity check
                temps.append(temp)
                ts_ms = (row.ts - trace_start) / 1e6
                if ts_ms - last_ts >= 200:  # Sample every 200ms
                    temp_timeline.append({"tsMs": round(ts_ms, 0), "tempC": round(temp, 1)})
                    last_ts = ts_ms

        if temps:
            thermal_data = {
                "available": True,
                "maxTemp": round(max(temps), 1),
                "avgTemp": round(statistics.mean(temps), 1),
                "timeline": temp_timeline[:50]
            }
    except Exception:
        pass

    # === Method 4: Cluster-Wide Synchronous Drop ===
    # Check if all big cores drop to same frequency simultaneously
    cluster_sync_drops = []
    if len(big_cores) >= 2 and len(per_core_freq) >= 2:
        # Sample at throttle event timestamps: are all big cores at same (low) freq?
        for evt in throttle_events[:15]:
            ts_ns = trace_start + int(evt["tsMs"] * 1e6)
            core_freqs_at_ts = {}
            for cid in big_cores:
                cdata = per_core_freq.get(cid, [])
                # Find freq closest to this timestamp
                closest_freq = None
                for ts, mhz in cdata:
                    if ts <= ts_ns + 10000000:  # within 10ms
                        closest_freq = mhz
                    else:
                        break
                if closest_freq is not None:
                    core_freqs_at_ts[cid] = closest_freq

            # All cores at same low frequency = cluster-level thermal cap
            if len(core_freqs_at_ts) >= 2:
                freqs = list(core_freqs_at_ts.values())
                max_core_freq = next((c["maxMhz"] for c in device["cpuCores"] if c["id"] == big_cores[0]), 0)
                # Check: all within 5% of each other AND below 85% of max
                if max(freqs) > 0 and (max(freqs) - min(freqs)) / max(freqs) < 0.05:
                    if max(freqs) < max_core_freq * 0.85:
                        cluster_sync_drops.append({
                            "tsMs": evt["tsMs"],
                            "unifiedFreqMhz": min(freqs),
                            "coreFreqs": core_freqs_at_ts
                        })

    # === Classify throttle type ===
    evidence = []
    is_thermal = False
    is_normal_dvfs = False

    # Thermal evidence scoring
    thermal_score = 0

    if load_freq_divergence:
        thermal_score += 3
        evidence.append(f"负载-频率背离: {len(load_freq_divergence)}次高负载(>{load_freq_divergence[0]['utilization']:.0f}%)时降频")

    if ceiling_lock["detected"]:
        thermal_score += 2
        if ceiling_lock["windows"]:
            first_w = ceiling_lock["windows"][0]["maxMhz"]
            last_w = ceiling_lock["windows"][-1]["maxMhz"]
            drop_pct = round((1 - last_w / first_w) * 100, 1) if first_w > 0 else 0
            evidence.append(f"频率上限锁定: 频率天花板从{first_w}MHz降至{last_w}MHz (降{drop_pct}%)")

    if thermal_data["available"] and thermal_data["maxTemp"] > 42:
        thermal_score += 3
        evidence.append(f"温度数据: 最高{thermal_data['maxTemp']}°C, 均值{thermal_data['avgTemp']}°C")

    if cluster_sync_drops:
        thermal_score += 2
        evidence.append(f"全核同步降频: {len(cluster_sync_drops)}次大核集体降至{cluster_sync_drops[0]['unifiedFreqMhz']}MHz")

    # === Method 5: Sustained Low Frequency Duration ===
    # Calculate how long big cores stay below threshold (for long traces)
    sustained_low = {"detected": False, "lowFreqPercent": 0, "totalLowMs": 0}
    if per_core_freq and big_cores:
        sample_core = big_cores[0]
        core_data = per_core_freq.get(sample_core, [])
        max_freq = next((c["maxMhz"] for c in device["cpuCores"] if c["id"] == sample_core), 0)
        low_threshold = max_freq * 0.8
        trace_dur_ms = (trace_end - trace_start) / 1e6

        if len(core_data) >= 2 and trace_dur_ms > 0:
            total_low_ns = 0
            for i in range(len(core_data) - 1):
                ts_curr, mhz_curr = core_data[i]
                ts_next, _ = core_data[i + 1]
                if mhz_curr <= low_threshold:
                    total_low_ns += (ts_next - ts_curr)

            total_low_ms = total_low_ns / 1e6
            low_pct = total_low_ms / trace_dur_ms * 100

            sustained_low = {
                "detected": low_pct > 15,
                "lowFreqPercent": round(low_pct, 1),
                "totalLowMs": round(total_low_ms, 1),
                "threshold": f"<{int(low_threshold)}MHz"
            }

            if low_pct > 30:
                thermal_score += 2
                evidence.append(f"持续低频: 大核{round(low_pct, 1)}%时间运行在<{int(low_threshold)}MHz")
            elif low_pct > 15:
                thermal_score += 1
                evidence.append(f"部分低频: 大核{round(low_pct, 1)}%时间运行在<{int(low_threshold)}MHz")

    # === Method 6: Cooling Device State (if available) ===
    cdev_data = {"available": False, "events": []}
    try:
        result = tp.query("""
            SELECT t.name, c.ts, CAST(c.value AS INT) as state
            FROM counter c
            JOIN counter_track t ON c.track_id = t.id
            WHERE t.name LIKE '%cdev%' OR t.name LIKE '%cooling%' OR t.name LIKE '%cpu_budget%'
            ORDER BY c.ts
            LIMIT 200
        """)
        cdev_events = []
        for row in result:
            cdev_events.append({
                "name": row.name,
                "tsMs": round((row.ts - trace_start) / 1e6, 1),
                "state": row.state
            })
        if cdev_events:
            cdev_data = {"available": True, "events": cdev_events[:50]}
            thermal_score += 3
            evidence.append(f"系统级降频信号: 检测到{len(cdev_events)}个cooling device状态变化")
    except Exception:
        pass

    # === Throttle Impact: correlate freq drops with frame time ===
    throttle_impact = {"avgFrameTimeInThrottle": 0, "avgFrameTimeNormal": 0, "impactMs": 0}

    if thermal_score >= 3:
        is_thermal = True
    elif throttle_events and thermal_score == 0:
        is_normal_dvfs = True
        evidence.append("频率变化发生在低负载时段，属于 Governor 正常节能调节")

    # Frequency timeline (sampled every ~50ms for big core 0)
    freq_timeline = []
    if big_cores:
        sample_core = big_cores[0]
        core_data = per_core_freq.get(sample_core, [])
        last_ts = 0
        for ts, mhz in core_data:
            ts_ms = (ts - trace_start) / 1e6
            if ts_ms - last_ts >= 50:
                freq_timeline.append({"tsMs": round(ts_ms, 0), "mhz": mhz})
                last_ts = ts_ms

    return {
        "bigCoreAvgMhz": big_avg,
        "littleCoreAvgMhz": little_avg,
        "throttleEvents": throttle_events,
        "frequencyTimeline": freq_timeline[:100],
        "throttleClassification": {
            "thermalThrottle": is_thermal,
            "normalDvfs": is_normal_dvfs,
            "thermalScore": thermal_score,
            "evidence": evidence,
            "loadFreqDivergence": load_freq_divergence[:10],
            "ceilingLock": ceiling_lock,
            "freqReachability": freq_reachability,
            "thermalZone": thermal_data,
            "clusterSyncDrops": cluster_sync_drops[:10],
            "sustainedLow": sustained_low,
            "coolingDevice": cdev_data
        }
    }


def get_thread_overlap(tp: TraceProcessor, main_tid: int, render_tid: int) -> dict:
    """Analyze overlap between main and render threads."""
    # Get running intervals for both threads
    main_utid_q = f"(SELECT id FROM thread WHERE tid = {main_tid} LIMIT 1)"
    render_utid_q = f"(SELECT id FROM thread WHERE tid = {render_tid} LIMIT 1)"

    # Total running time for each
    result = tp.query(f"""
        SELECT CAST(SUM(dur) AS REAL) / 1e6 as total_ms
        FROM sched_slice WHERE utid = {main_utid_q} AND dur > 0
    """)
    main_total = 0
    for row in result:
        main_total = row.total_ms or 0

    result = tp.query(f"""
        SELECT CAST(SUM(dur) AS REAL) / 1e6 as total_ms
        FROM sched_slice WHERE utid = {render_utid_q} AND dur > 0
    """)
    render_total = 0
    for row in result:
        render_total = row.total_ms or 0

    # Render thread waiting (Semaphore.WaitForSignal as proxy)
    result = tp.query(f"""
        SELECT CAST(SUM(s.dur) AS REAL) / 1e6 as wait_ms
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.id
        WHERE t.tid = {render_tid} AND s.name = 'Semaphore.WaitForSignal'
    """)
    render_wait = 0
    for row in result:
        render_wait = row.wait_ms or 0

    return {
        "mainTotalRunMs": round(main_total, 2),
        "renderTotalRunMs": round(render_total, 2),
        "renderWaitingMs": round(render_wait, 2),
        "renderActiveMs": round(render_total - render_wait, 2) if render_total > render_wait else round(render_total, 2)
    }


def get_system_interference(tp: TraceProcessor, main_tid: int, game_pid: int) -> dict:
    """Detect system processes preempting game threads."""
    main_utid_q = f"(SELECT id FROM thread WHERE tid = {main_tid} LIMIT 1)"

    # Find what runs on the same CPU when main thread is runnable but not running
    # Simplified: find top processes that ran on same CPUs during trace
    result = tp.query(f"""
        SELECT p.name as process_name, COUNT(*) as preempt_count,
               CAST(SUM(ss.dur) AS REAL) / 1e6 as total_ms
        FROM sched_slice ss
        JOIN thread t ON ss.utid = t.id
        JOIN process p ON t.upid = p.id
        WHERE p.pid != {game_pid}
        AND ss.cpu IN (
            SELECT DISTINCT cpu FROM sched_slice WHERE utid = {main_utid_q}
        )
        AND ss.dur > 100000
        GROUP BY p.name
        ORDER BY total_ms DESC
        LIMIT 15
    """)

    interference = []
    for row in result:
        if row.process_name:
            interference.append({
                "process": row.process_name,
                "count": row.preempt_count,
                "totalMs": round(row.total_ms, 2)
            })

    return {"topInterferingProcesses": interference}


def get_top_slices(tp: TraceProcessor, tid: int, limit: int = 20) -> list:
    """Get top slices by total time for a thread."""
    result = tp.query(f"""
        SELECT s.name, COUNT(*) as cnt,
               CAST(SUM(s.dur) / 1e6 AS REAL) as total_ms,
               CAST(MAX(s.dur) / 1e6 AS REAL) as max_ms,
               CAST(AVG(s.dur) / 1e6 AS REAL) as avg_ms
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.id
        WHERE t.tid = {tid} AND s.dur > 0
        GROUP BY s.name
        ORDER BY total_ms DESC
        LIMIT {limit}
    """)

    slices = []
    for row in result:
        slices.append({
            "name": row.name,
            "count": row.cnt,
            "totalMs": round(row.total_ms, 2),
            "maxMs": round(row.max_ms, 2),
            "avgMs": round(row.avg_ms, 2)
        })
    return slices


def get_job_worker_stats(tp: TraceProcessor, upid: int, device: dict, trace_duration_ms: float, config: dict) -> dict:
    """Get Job Worker thread utilization stats.

    Tries multiple detection strategies:
    1. Named patterns (Job.Worker, Worker Thread)
    2. Thread-N patterns (Unity default naming on some Android versions)
    """
    big_cores = device.get("bigCores", [])
    little_cores = device.get("littleCores", [])
    name_patterns = config.get("jobWorker", {}).get("namePatterns", ["Worker Thread", "Job.Worker", "Job Worker"])
    thread_id_patterns = config.get("jobWorker", {}).get("threadIdPatterns", ["Thread-"])

    # Strategy 1: Find by explicit name patterns
    conditions = " OR ".join([f"t.name LIKE '%{p}%'" for p in name_patterns])
    result = tp.query(f"""
        SELECT t.tid, t.name
        FROM thread t
        WHERE t.upid = {upid} AND ({conditions})
    """)

    worker_tids = []
    for row in result:
        worker_tids.append({"tid": row.tid, "name": row.name})

    # Strategy 2: If no named workers found, try Thread-N pattern
    # These are likely Job Workers if they have short burst slices (not IO/network threads)
    if not worker_tids and thread_id_patterns:
        tid_conditions = " OR ".join([f"t.name LIKE '{p}%'" for p in thread_id_patterns])
        result = tp.query(f"""
            SELECT t.tid, t.name,
                   CAST(SUM(ss.dur) AS REAL) / 1e6 as run_ms,
                   COUNT(ss.id) as slice_count
            FROM thread t
            LEFT JOIN sched_slice ss ON ss.utid = t.id AND ss.dur > 0
            WHERE t.upid = {upid} AND ({tid_conditions})
            GROUP BY t.tid, t.name
            HAVING run_ms > 1
            ORDER BY run_ms DESC
            LIMIT 20
        """)
        for row in result:
            # Heuristic: Job Workers tend to have many short slices (burst pattern)
            if row.slice_count > 5 and row.run_ms > 5:
                worker_tids.append({"tid": row.tid, "name": row.name})

    detection_method = "named" if any("Job" in w["name"] or "Worker" in w["name"] for w in worker_tids) else "thread_id_heuristic"

    if not worker_tids:
        return {
            "count": 0,
            "totalRunMs": 0,
            "avgUtilizationPercent": 0,
            "onBigCorePercent": 0,
            "onLittleCorePercent": 0,
            "topWorkerMs": 0,
            "detectionMethod": "none",
            "workers": []
        }

    # Aggregate scheduling data for all workers
    total_run_ms = 0
    big_core_ms = 0
    little_core_ms = 0
    top_worker_ms = 0

    for worker in worker_tids:
        result = tp.query(f"""
            SELECT cpu, CAST(SUM(dur) AS REAL) / 1e6 as total_ms
            FROM sched_slice
            WHERE utid = (SELECT id FROM thread WHERE tid = {worker['tid']} LIMIT 1)
            AND dur > 0
            GROUP BY cpu
        """)
        worker_ms = 0
        for row in result:
            worker_ms += row.total_ms
            if row.cpu in big_cores:
                big_core_ms += row.total_ms
            elif row.cpu in little_cores:
                little_core_ms += row.total_ms
        total_run_ms += worker_ms
        top_worker_ms = max(top_worker_ms, worker_ms)

    worker_count = len(worker_tids)
    # Utilization = total run time / (worker_count * trace_duration)
    max_possible_ms = worker_count * trace_duration_ms
    avg_utilization = round(total_run_ms / max_possible_ms * 100, 1) if max_possible_ms > 0 else 0
    on_big_pct = round(big_core_ms / total_run_ms * 100, 1) if total_run_ms > 0 else 0
    on_little_pct = round(little_core_ms / total_run_ms * 100, 1) if total_run_ms > 0 else 0

    return {
        "count": worker_count,
        "totalRunMs": round(total_run_ms, 2),
        "avgUtilizationPercent": avg_utilization,
        "onBigCorePercent": on_big_pct,
        "onLittleCorePercent": on_little_pct,
        "topWorkerMs": round(top_worker_ms, 2),
        "detectionMethod": detection_method,
        "workers": [{"tid": w["tid"], "name": w["name"]} for w in worker_tids[:10]]
    }


def get_playerloop_breakdown(tp: TraceProcessor, main_tid: int, config: dict) -> dict:
    """Build precise 6-phase breakdown of PlayerLoop frame time.

    Phases (based on Unity frame structure):
    - C# Logic: BehaviourUpdate/LateUpdate content excluding Lua
    - Lua Logic: Slices matching luaIdentifiers (CS:AOE, LuaMgr)
    - ECS/Job: SystemGroup slices (Initialization/Simulation/Presentation)
    - UGUI: PlayerUpdateCanvases
    - Rendering CPU: FinishFrameRendering (URP)
    - Wait/Sync: PlayerSendFrameComplete, WaitForJobGroupID, WaitForPresent
    """
    phases_config = config.get("playerLoopPhases", {})
    lua_identifiers = phases_config.get("luaIdentifiers", ["CS:AOE", "LuaMgr", "CS:"])

    # 1. Get PlayerLoop total
    result = tp.query(f"""
        SELECT CAST(SUM(dur) / 1e6 AS REAL) as total_ms, COUNT(*) as cnt
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.id
        WHERE t.tid = {main_tid} AND s.name = 'PlayerLoop' AND s.dur > 0
    """)
    playerloop_total_ms = 0
    playerloop_count = 0
    for row in result:
        playerloop_total_ms = row.total_ms or 0
        playerloop_count = row.cnt or 0

    if playerloop_count == 0:
        return {"playerLoopTotalMs": 0, "frameCount": 0, "avgFrameMs": 0, "phases": [], "categories": []}

    avg_frame_ms = playerloop_total_ms / playerloop_count

    # 2. Get depth=1 slices (direct children of PlayerLoop)
    result = tp.query(f"""
        SELECT s.name, COUNT(*) as cnt,
               CAST(SUM(s.dur) / 1e6 AS REAL) as total_ms,
               CAST(AVG(s.dur) / 1e6 AS REAL) as avg_ms,
               CAST(MAX(s.dur) / 1e6 AS REAL) as max_ms
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.id
        WHERE t.tid = {main_tid} AND s.dur > 0 AND s.depth = 1
        GROUP BY s.name
        ORDER BY total_ms DESC
        LIMIT 40
    """)
    depth1_slices = []
    for row in result:
        depth1_slices.append({
            "name": row.name, "count": row.cnt,
            "totalMs": round(row.total_ms, 2), "avgMs": round(row.avg_ms, 2), "maxMs": round(row.max_ms, 2)
        })

    # 3. Classify depth=1 slices into phases using config mapping
    phase_map = {
        "rendering": phases_config.get("rendering", ["PostLateUpdate.FinishFrameRendering"]),
        "logic_update": phases_config.get("logic_update", ["Update.ScriptRunBehaviourUpdate", "BehaviourUpdate"]),
        "logic_late": phases_config.get("logic_late", ["PreLateUpdate.ScriptRunBehaviourLateUpdate", "LateBehaviourUpdate"]),
        "ecs": phases_config.get("ecs", ["SimulationSystemGroup", "InitializationSystemGroup", "PresentationSystemGroup", "Default World"]),
        "ui": phases_config.get("ui", ["PostLateUpdate.PlayerUpdateCanvases"]),
        "wait": phases_config.get("wait", ["PostLateUpdate.PlayerSendFrameComplete", "WaitForJobGroupID", "Gfx.WaitForPresent"])
    }

    categories = {
        "rendering": {"totalMs": 0, "slices": []},
        "logic_csharp": {"totalMs": 0, "slices": []},
        "logic_lua": {"totalMs": 0, "slices": []},
        "ecs": {"totalMs": 0, "slices": []},
        "ui": {"totalMs": 0, "slices": []},
        "wait": {"totalMs": 0, "slices": []},
        "other": {"totalMs": 0, "slices": []}
    }

    # Slices that need Lua/C# split (logic_update + logic_late)
    logic_slice_names = set()
    for name in phase_map.get("logic_update", []) + phase_map.get("logic_late", []):
        logic_slice_names.add(name)

    for s in depth1_slices:
        matched = False

        # Check rendering
        for pattern in phase_map["rendering"]:
            if pattern in s["name"]:
                categories["rendering"]["totalMs"] += s["totalMs"]
                categories["rendering"]["slices"].append(s["name"])
                matched = True
                break
        if matched:
            continue

        # Check ECS
        for pattern in phase_map["ecs"]:
            if pattern in s["name"]:
                categories["ecs"]["totalMs"] += s["totalMs"]
                categories["ecs"]["slices"].append(s["name"])
                matched = True
                break
        if matched:
            continue

        # Check UI
        for pattern in phase_map["ui"]:
            if pattern in s["name"]:
                categories["ui"]["totalMs"] += s["totalMs"]
                categories["ui"]["slices"].append(s["name"])
                matched = True
                break
        if matched:
            continue

        # Check wait
        for pattern in phase_map["wait"]:
            if pattern in s["name"]:
                categories["wait"]["totalMs"] += s["totalMs"]
                categories["wait"]["slices"].append(s["name"])
                matched = True
                break
        if matched:
            continue

        # Check logic (needs Lua/C# split)
        is_logic = False
        for pattern in phase_map["logic_update"] + phase_map["logic_late"]:
            if pattern in s["name"]:
                is_logic = True
                break

        if is_logic:
            # This slice is logic - split into Lua vs C# later
            categories["logic_csharp"]["totalMs"] += s["totalMs"]
            categories["logic_csharp"]["slices"].append(s["name"])
        else:
            categories["other"]["totalMs"] += s["totalMs"]
            categories["other"]["slices"].append(s["name"])

    # 4. Split logic into Lua vs C#
    # Query Lua-identified slices within BehaviourUpdate/LateBehaviourUpdate
    lua_conditions = " OR ".join([f"s.name LIKE '%{lid}%'" for lid in lua_identifiers])
    try:
        result = tp.query(f"""
            SELECT CAST(SUM(s.dur) / 1e6 AS REAL) as lua_ms
            FROM slice s
            JOIN thread_track tt ON s.track_id = tt.id
            JOIN thread t ON tt.utid = t.id
            WHERE t.tid = {main_tid} AND s.dur > 0
            AND s.depth >= 2
            AND ({lua_conditions})
        """)
        lua_total_ms = 0
        for row in result:
            lua_total_ms = row.lua_ms or 0

        # Lua takes from the logic_csharp bucket
        if lua_total_ms > 0 and lua_total_ms <= categories["logic_csharp"]["totalMs"]:
            categories["logic_lua"]["totalMs"] = lua_total_ms
            categories["logic_csharp"]["totalMs"] -= lua_total_ms
    except Exception:
        pass

    # 5. Build output with display names
    display_names = {
        "rendering": "Rendering CPU",
        "logic_csharp": "C# Logic",
        "logic_lua": "Lua Logic",
        "ecs": "ECS/Job",
        "ui": "UGUI",
        "wait": "Wait/Sync",
        "other": "Other"
    }

    category_summary = []
    for cat_key, cat_data in categories.items():
        if cat_data["totalMs"] > 0.1:
            per_frame_ms = cat_data["totalMs"] / playerloop_count
            pct = cat_data["totalMs"] / playerloop_total_ms * 100
            category_summary.append({
                "category": cat_key,
                "displayName": display_names.get(cat_key, cat_key),
                "totalMs": round(cat_data["totalMs"], 2),
                "perFrameMs": round(per_frame_ms, 2),
                "percent": round(pct, 1),
                "topSlices": cat_data["slices"][:5]
            })

    category_summary.sort(key=lambda x: x["totalMs"], reverse=True)

    return {
        "playerLoopTotalMs": round(playerloop_total_ms, 2),
        "frameCount": playerloop_count,
        "avgFrameMs": round(avg_frame_ms, 2),
        "phases": depth1_slices[:20],
        "categories": category_summary
    }


def get_gpu_completion_analysis(tp: TraceProcessor, trace_start: int, main_tid: int) -> dict:
    """Analyze GPU completion fence data if available."""
    # Check for GPU completion tracks
    try:
        result = tp.query("""
            SELECT t.id as track_id, t.name, COUNT(c.id) as sample_count
            FROM counter c
            JOIN counter_track t ON c.track_id = t.id
            WHERE t.name LIKE '%GPU%' OR t.name LIKE '%gpu%'
            GROUP BY t.id, t.name
            ORDER BY sample_count DESC
        """)
        gpu_tracks = []
        for row in result:
            gpu_tracks.append({"trackId": row.track_id, "name": row.name, "samples": row.sample_count})

        if not gpu_tracks:
            return {"available": False, "tracks": []}

        # Check for Gfx.WaitForPresent in main thread (GPU wait indicator)
        result = tp.query(f"""
            SELECT COUNT(*) as cnt,
                   CAST(SUM(s.dur) / 1e6 AS REAL) as total_ms,
                   CAST(AVG(s.dur) / 1e6 AS REAL) as avg_ms,
                   CAST(MAX(s.dur) / 1e6 AS REAL) as max_ms
            FROM slice s
            JOIN thread_track tt ON s.track_id = tt.id
            JOIN thread t ON tt.utid = t.id
            WHERE t.tid = {main_tid}
            AND (s.name LIKE '%WaitForPresent%' OR s.name LIKE '%Gfx.Present%')
            AND s.dur > 0
        """)
        gpu_wait = {"count": 0, "totalMs": 0, "avgMs": 0, "maxMs": 0}
        for row in result:
            gpu_wait = {
                "count": row.cnt or 0,
                "totalMs": round(row.total_ms or 0, 2),
                "avgMs": round(row.avg_ms or 0, 2),
                "maxMs": round(row.max_ms or 0, 2)
            }

        return {
            "available": True,
            "tracks": gpu_tracks[:5],
            "gpuWaitOnMainThread": gpu_wait
        }
    except Exception:
        return {"available": False, "tracks": []}


def get_gpu_analysis(tp: TraceProcessor, trace_start: int, trace_end: int, config: dict) -> dict:
    """Extract GPU performance data (frequency, utilization) with graceful degradation."""
    gpu_config = config.get("gpu", {})
    freq_names = gpu_config.get("frequencyTrackNames", ["gpu_frequency", "gpufreq", "GPU Frequency"])
    util_names = gpu_config.get("utilizationTrackNames", ["gpu_utilization", "GPU Utilization", "gpu_busy", "GPU Busy"])
    util_threshold = gpu_config.get("utilizationHighThreshold", 80)

    # Check if gpu_counter_track table exists
    has_gpu_counter = check_table_exists(tp, "gpu_counter_track")

    if not has_gpu_counter:
        return {
            "available": False,
            "dataSource": "none",
            "frequency": None,
            "utilization": None,
            "gpuBound": {"likely": False, "confidence": "low", "evidence": "No GPU data in trace"}
        }

    # Try to get GPU frequency
    frequency_data = None
    try:
        # Build LIKE conditions for frequency track names
        freq_conditions = " OR ".join([f"t.name LIKE '%{n}%'" for n in freq_names])
        result = tp.query(f"""
            SELECT c.ts, c.value
            FROM counter c
            JOIN gpu_counter_track t ON c.track_id = t.id
            WHERE {freq_conditions}
            ORDER BY c.ts
        """)
        freq_values = []
        freq_timeline = []
        last_ts = 0
        for row in result:
            mhz = int(row.value / 1e6) if row.value > 1e6 else int(row.value)  # handle Hz vs MHz
            freq_values.append(mhz)
            ts_ms = (row.ts - trace_start) / 1e6
            if ts_ms - last_ts >= 50:  # Sample every 50ms
                freq_timeline.append({"tsMs": round(ts_ms, 0), "mhz": mhz})
                last_ts = ts_ms

        if freq_values:
            frequency_data = {
                "avgMhz": round(statistics.mean(freq_values)),
                "maxMhz": max(freq_values),
                "minMhz": min(freq_values),
                "timeline": freq_timeline[:100]
            }
    except Exception as e:
        print(f"[preprocess] GPU frequency query failed: {e}", file=sys.stderr)

    # Try to get GPU utilization
    utilization_data = None
    try:
        util_conditions = " OR ".join([f"t.name LIKE '%{n}%'" for n in util_names])
        result = tp.query(f"""
            SELECT c.ts, c.value
            FROM counter c
            JOIN gpu_counter_track t ON c.track_id = t.id
            WHERE {util_conditions}
            ORDER BY c.ts
        """)
        util_values = []
        util_timeline = []
        last_ts = 0
        for row in result:
            pct = row.value if row.value <= 100 else row.value / 100.0  # handle 0-100 vs 0-10000
            util_values.append(pct)
            ts_ms = (row.ts - trace_start) / 1e6
            if ts_ms - last_ts >= 50:
                util_timeline.append({"tsMs": round(ts_ms, 0), "percent": round(pct, 1)})
                last_ts = ts_ms

        if util_values:
            utilization_data = {
                "avgPercent": round(statistics.mean(util_values), 1),
                "maxPercent": round(max(util_values), 1),
                "timeline": util_timeline[:100]
            }
    except Exception as e:
        print(f"[preprocess] GPU utilization query failed: {e}", file=sys.stderr)

    # Determine data availability
    if not frequency_data and not utilization_data:
        return {
            "available": False,
            "dataSource": "none",
            "frequency": None,
            "utilization": None,
            "gpuBound": {"likely": False, "confidence": "low", "evidence": "GPU tables exist but no relevant data found"}
        }

    data_source = "partial"
    if frequency_data and utilization_data:
        data_source = "gpu_counter"
    elif frequency_data:
        data_source = "partial"
    elif utilization_data:
        data_source = "partial"

    # GPU-bound determination
    gpu_bound = {"likely": False, "confidence": "low", "evidence": ""}
    if utilization_data and utilization_data["avgPercent"] > util_threshold:
        gpu_bound = {
            "likely": True,
            "confidence": "high",
            "evidence": f"GPU utilization avg {utilization_data['avgPercent']}% > {util_threshold}% threshold"
        }
    elif frequency_data and frequency_data["avgMhz"] >= frequency_data["maxMhz"] * 0.95:
        gpu_bound = {
            "likely": True,
            "confidence": "medium",
            "evidence": f"GPU frequency sustained near max ({frequency_data['avgMhz']}/{frequency_data['maxMhz']} MHz)"
        }

    return {
        "available": True,
        "dataSource": data_source,
        "frequency": frequency_data,
        "utilization": utilization_data,
        "gpuBound": gpu_bound
    }


def get_time_segment_analysis(frames: list, cpu_freq: dict, jank_frames: list, config: dict) -> dict:
    """Split trace into time segments and compare metrics across segments."""
    seg_config = config.get("timeSegment", {})
    seg_count = seg_config.get("segmentCount", 3)
    thermal_threshold = seg_config.get("thermalDegradationThreshold", 0.85)
    burst_concentration = seg_config.get("burstSpikeConcentration", 0.6)
    warmup_threshold = seg_config.get("warmupThreshold", 1.15)
    sustained_frames = seg_config.get("sustainedSlowFrames", 5)
    sustained_mult = seg_config.get("sustainedSlowMultiplier", 1.5)

    if not frames or len(frames) < seg_count * 2:
        return {"segmentCount": seg_count, "segments": [], "patterns": {}}

    target_fps = config.get("targetFps", 30)
    frame_budget = 1000.0 / target_fps

    # Split frames into equal segments by frame count
    n = len(frames)
    seg_size = n // seg_count
    labels = ["前段", "中段", "后段"] if seg_count == 3 else [f"段{i+1}" for i in range(seg_count)]

    # Build jank frame index set
    jank_indices = set()
    for j in jank_frames:
        jank_indices.add(j["frameIndex"])

    # Compute throttle event timestamps
    throttle_events = cpu_freq.get("throttleEvents", [])
    freq_timeline = cpu_freq.get("frequencyTimeline", [])

    segments = []
    for i in range(seg_count):
        start_idx = i * seg_size
        end_idx = (i + 1) * seg_size if i < seg_count - 1 else n
        seg_frames = frames[start_idx:end_idx]

        durations = [f["durMs"] for f in seg_frames]
        seg_fps = round(1000.0 / statistics.mean(durations), 1) if durations else 0
        avg_frame_time = round(statistics.mean(durations), 2) if durations else 0

        # Count jank in this segment
        seg_jank_count = sum(1 for idx in range(start_idx, end_idx) if idx in jank_indices)

        # Estimate time range for this segment (cumulative frame durations)
        time_start_ms = sum(frames[j]["durMs"] for j in range(start_idx)) if start_idx > 0 else 0
        time_end_ms = time_start_ms + sum(f["durMs"] for f in seg_frames)

        # Count throttle events in this time range
        seg_throttle_count = sum(1 for t in throttle_events
                                  if time_start_ms <= t["tsMs"] <= time_end_ms)

        # Average big core frequency in this time range from timeline
        seg_freq_values = [f["mhz"] for f in freq_timeline
                           if time_start_ms <= f["tsMs"] <= time_end_ms]
        seg_avg_freq = round(statistics.mean(seg_freq_values)) if seg_freq_values else 0

        segments.append({
            "label": labels[i] if i < len(labels) else f"段{i+1}",
            "frameRange": [start_idx, end_idx - 1],
            "timeRangeMs": [round(time_start_ms, 0), round(time_end_ms, 0)],
            "frameCount": len(seg_frames),
            "avgFps": seg_fps,
            "avgFrameTimeMs": avg_frame_time,
            "jankCount": seg_jank_count,
            "bigCoreAvgMhz": seg_avg_freq,
            "throttleEventCount": seg_throttle_count
        })

    # Pattern detection
    patterns = {
        "thermalDegradation": False,
        "burstSpike": False,
        "warmup": False,
        "sustainedSlow": False,
        "description": ""
    }
    descriptions = []

    if len(segments) >= 2:
        first_seg = segments[0]
        last_seg = segments[-1]

        # Thermal degradation: last segment FPS much lower + frequency drop
        if first_seg["avgFps"] > 0 and last_seg["avgFps"] < first_seg["avgFps"] * thermal_threshold:
            freq_dropped = (first_seg["bigCoreAvgMhz"] > 0 and last_seg["bigCoreAvgMhz"] > 0
                           and last_seg["bigCoreAvgMhz"] < first_seg["bigCoreAvgMhz"] * 0.85)
            throttle_increased = last_seg["throttleEventCount"] > first_seg["throttleEventCount"] * 2
            if freq_dropped or throttle_increased:
                patterns["thermalDegradation"] = True
                fps_drop = round((1 - last_seg["avgFps"] / first_seg["avgFps"]) * 100, 1)
                descriptions.append(f"热降频趋势：后段帧率较前段下降{fps_drop}%")

        # Burst spike: jank concentrated in one segment
        total_jank = sum(s["jankCount"] for s in segments)
        if total_jank > 0:
            for seg in segments:
                if seg["jankCount"] > total_jank * burst_concentration:
                    patterns["burstSpike"] = True
                    descriptions.append(f"Burst Spike：{seg['label']}集中了{seg['jankCount']}/{total_jank}次Jank")
                    break

        # Warmup: first segment noticeably slower than rest
        rest_avg = statistics.mean([s["avgFrameTimeMs"] for s in segments[1:]]) if len(segments) > 1 else 0
        if rest_avg > 0 and first_seg["avgFrameTimeMs"] > rest_avg * warmup_threshold:
            patterns["warmup"] = True
            descriptions.append(f"预热模式：前段帧耗时{first_seg['avgFrameTimeMs']}ms > 中后段均值{round(rest_avg, 2)}ms")

    # Sustained slow: consecutive frames exceeding budget
    consecutive = 0
    max_consecutive = 0
    for f in frames:
        if f["durMs"] > frame_budget * sustained_mult:
            consecutive += 1
            max_consecutive = max(max_consecutive, consecutive)
        else:
            consecutive = 0
    if max_consecutive >= sustained_frames:
        patterns["sustainedSlow"] = True
        descriptions.append(f"持续慢帧：连续{max_consecutive}帧超过{round(frame_budget * sustained_mult, 1)}ms")

    patterns["description"] = "；".join(descriptions) if descriptions else "未检测到明显性能趋势模式"

    return {
        "segmentCount": seg_count,
        "segments": segments,
        "patterns": patterns
    }


def main():
    parser = argparse.ArgumentParser(description="Perfetto Trace Preprocessor")
    parser.add_argument("--input", required=True, help="Path to .pftrace file")
    parser.add_argument("--target-fps", type=int, default=None, help="Target FPS (overrides config)")
    parser.add_argument("--output-dir", default="./output", help="Output directory")
    parser.add_argument("--config", default=None, help="Path to config.json")
    parser.add_argument("--query-frame", type=int, default=None, help="Query specific frame details")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    config = load_config(script_dir)

    if args.target_fps:
        config["targetFps"] = args.target_fps

    print(f"[preprocess] Loading trace: {args.input}", file=sys.stderr)
    tp = TraceProcessor(file_path=args.input)
    print(f"[preprocess] Trace loaded successfully", file=sys.stderr)

    # Find game process
    game_name = config["gameProcess"]
    upid, game_pid, process_name = find_game_process(tp, game_name)
    if not upid:
        print(f"[preprocess] ERROR: Game process '{game_name}' not found in trace", file=sys.stderr)
        sys.exit(1)
    print(f"[preprocess] Game process: {process_name} (PID {game_pid})", file=sys.stderr)

    # Find key threads
    main_tid = find_thread_tid(tp, upid, config["mainThread"]["name"])
    render_tid = find_thread_tid(tp, upid, config["renderThread"]["name"])
    print(f"[preprocess] Main thread TID: {main_tid}, Render thread TID: {render_tid}", file=sys.stderr)

    if not main_tid:
        print(f"[preprocess] ERROR: Main thread '{config['mainThread']['name']}' not found", file=sys.stderr)
        sys.exit(1)

    # Get trace time range
    result = tp.query("SELECT MIN(ts) as start_ts, MAX(ts) as end_ts FROM sched_slice WHERE dur > 0")
    trace_start, trace_end = 0, 0
    for row in result:
        trace_start, trace_end = row.start_ts, row.end_ts
    trace_duration_ms = (trace_end - trace_start) / 1e6

    # === Collect all data ===
    print(f"[preprocess] Extracting frame timing...", file=sys.stderr)
    frame_data = get_frame_timing(tp, main_tid, config)

    print(f"[preprocess] Extracting device info...", file=sys.stderr)
    device = get_device_info(tp)

    print(f"[preprocess] Extracting CPU scheduling (main thread)...", file=sys.stderr)
    main_sched = get_scheduling_info(tp, main_tid, "UnityMain", device, trace_start, trace_end)

    render_sched = None
    if render_tid:
        print(f"[preprocess] Extracting CPU scheduling (render thread)...", file=sys.stderr)
        render_sched = get_scheduling_info(tp, render_tid, "UnityGfxRenderS", device, trace_start, trace_end)

    print(f"[preprocess] Extracting CPU frequency...", file=sys.stderr)
    cpu_freq = get_cpu_frequency_analysis(tp, device, trace_start, trace_end)

    print(f"[preprocess] Extracting thread overlap...", file=sys.stderr)
    overlap = get_thread_overlap(tp, main_tid, render_tid) if render_tid else {}

    print(f"[preprocess] Extracting system interference...", file=sys.stderr)
    interference = get_system_interference(tp, main_tid, game_pid)

    print(f"[preprocess] Extracting top slices...", file=sys.stderr)
    main_top_slices = get_top_slices(tp, main_tid, 25)
    render_top_slices = get_top_slices(tp, render_tid, 15) if render_tid else []

    print(f"[preprocess] Extracting PlayerLoop breakdown...", file=sys.stderr)
    playerloop_breakdown = get_playerloop_breakdown(tp, main_tid, config)

    print(f"[preprocess] Extracting Job Worker stats...", file=sys.stderr)
    job_workers = get_job_worker_stats(tp, upid, device, trace_duration_ms, config)

    print(f"[preprocess] Extracting GPU analysis...", file=sys.stderr)
    gpu_analysis = get_gpu_analysis(tp, trace_start, trace_end, config)

    print(f"[preprocess] Extracting GPU completion data...", file=sys.stderr)
    gpu_completion = get_gpu_completion_analysis(tp, trace_start, main_tid)

    print(f"[preprocess] Computing time segment analysis...", file=sys.stderr)
    time_segments = get_time_segment_analysis(
        frame_data["frames"], cpu_freq, frame_data["jankFrames"], config
    )

    # === Build output ===
    output = {
        "config": {
            "targetFps": config["targetFps"],
            "frameBudgetMs": round(1000.0 / config["targetFps"], 2),
            "gameProcess": process_name
        },
        "traceInfo": {
            "durationMs": round(trace_duration_ms, 0),
            "inputFile": os.path.basename(args.input)
        },
        "device": device,
        "frameSummary": {
            "count": frame_data["count"],
            "actualFps": frame_data["actualFps"],
            "mean": frame_data["mean"],
            "median": frame_data["median"],
            "min": frame_data["min"],
            "max": frame_data["max"],
            "q1": frame_data["q1"],
            "q3": frame_data["q3"],
            "jankCount": frame_data["jankCount"],
            "bigJankCount": frame_data["bigJankCount"]
        },
        "jankFrames": frame_data["jankFrames"],
        "scheduling": {
            "mainThread": main_sched,
            "renderThread": render_sched,
            "jobWorkers": job_workers
        },
        "cpuFrequency": cpu_freq,
        "threadOverlap": overlap,
        "systemInterference": interference,
        "topSlices": {
            "mainThread": main_top_slices,
            "renderThread": render_top_slices
        },
        "playerLoopBreakdown": playerloop_breakdown,
        "gpuAnalysis": gpu_analysis,
        "gpuCompletion": gpu_completion,
        "timeSegmentAnalysis": time_segments,
        "perFrameTimeline": frame_data["frames"]
    }

    # === Write output ===
    os.makedirs(args.output_dir, exist_ok=True)
    output_path = os.path.join(args.output_dir, "preprocess-result.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"[preprocess] Output saved to: {os.path.abspath(output_path)}", file=sys.stderr)
    print(f"[preprocess] Frames: {frame_data['count']}, FPS: {frame_data['actualFps']}, Duration: {trace_duration_ms:.0f}ms", file=sys.stderr)

    # Also print JSON to stdout for piping
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
