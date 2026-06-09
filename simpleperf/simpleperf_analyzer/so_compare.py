"""so_compare.py - Level 1: per-thread, per-so CPU proportion comparison.

This is the most robust comparison level: it is completely immune to function
inlining because it only looks at the *aggregate* event count attributed to
each shared library within each thread. If libil2cpp.so drops from 58%% to 54%%
of UnityMain's time, that is real regardless of how the compiler inlined things.

Data source: record_info['sampleInfo'][i]['processes'][j]['threads'][k]
                ['libs'][m] -> {'libId', 'eventCount', 'functions': [...]}
The per-thread per-lib ``eventCount`` is the *self* event count of that lib in
that thread (sum of leaf-sample counts), which is exactly what we want for a
proportion breakdown.
"""

import os

from . import config

# Threads that usually matter most; surfaced first regardless of delta size.
PRIORITY_THREAD_TOKENS = (
    "UnityMain", "UnityGfx", "GfxDeviceWorker", "Render", "Worker", "Job",
)


def _thread_priority(name):
    for i, tok in enumerate(PRIORITY_THREAD_TOKENS):
        if tok in name:
            return i
    return len(PRIORITY_THREAD_TOKENS)


def _thread_lib_breakdown(profile, thread_raw):
    """Return (thread_total, {lib_name: self_event_count}) for one thread.

    ``thread_raw`` is the raw thread dict from record_info (has 'libs').
    """
    libs = {}
    total = 0
    for lib in thread_raw.get("libs", []):
        name = profile.lib_name(lib["libId"])
        ec = lib.get("eventCount", 0)
        if ec <= 0:
            continue
        libs[name] = libs.get(name, 0) + ec
        total += ec
    return total, libs


def _collect_threads(profile):
    """Map thread_name -> (total_event_count, {lib_name: event_count}).

    Threads sharing a name are merged (covers split worker threads).
    """
    info = profile.record_info
    thread_names = info["threadNames"]
    merged = {}
    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in config.CPU_EVENT_NAMES:
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                tname = thread_names.get(thread["tid"]) or str(thread["tid"])
                total, libs = _thread_lib_breakdown(profile, thread)
                if tname not in merged:
                    merged[tname] = [0, {}]
                merged[tname][0] += total
                acc = merged[tname][1]
                for k, v in libs.items():
                    acc[k] = acc.get(k, 0) + v
    return merged


def compare(baseline_profile, current_profile, lib_tokens=None, min_pct=0.5):
    """Compare so-level proportions between two profiles.

    :param min_pct: only report libs that reach this proportion (%) in either
        the baseline or the current profile.
    :return: dict suitable for reporter.format_compare_text / write_json.
    """
    base = _collect_threads(baseline_profile)
    cur = _collect_threads(current_profile)

    threads_out = []
    thread_names = sorted(set(base) | set(cur))
    for tname in thread_names:
        b_total, b_libs = base.get(tname, (0, {}))
        c_total, c_libs = cur.get(tname, (0, {}))
        if b_total == 0 and c_total == 0:
            continue

        lib_names = sorted(set(b_libs) | set(c_libs))
        libs_out = []
        for full in lib_names:
            base_name = os.path.basename(full) or full
            b_pct = (b_libs.get(full, 0) / b_total * 100.0) if b_total else 0.0
            c_pct = (c_libs.get(full, 0) / c_total * 100.0) if c_total else 0.0
            if b_pct < min_pct and c_pct < min_pct:
                continue
            libs_out.append({
                "name": base_name,
                "full_path": full,
                "baseline_pct": round(b_pct, 3),
                "current_pct": round(c_pct, 3),
                "delta_pct": round(c_pct - b_pct, 3),
            })
        if not libs_out:
            continue
        libs_out.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)
        threads_out.append({
            "name": tname,
            "baseline_total_event": b_total,
            "current_total_event": c_total,
            "libs": libs_out,
        })

    # priority threads first, then by largest movement
    threads_out.sort(
        key=lambda t: (
            _thread_priority(t["name"]),
            -max((abs(l["delta_pct"]) for l in t["libs"]), default=0),
        ),
    )
    return {"threads": threads_out}
