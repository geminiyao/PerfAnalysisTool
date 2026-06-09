"""single_profile.py - Analyse one perf.data file.

Provides:
  * Top-N hotspot functions by SELF event count (where time is actually spent).
  * Per-thread CPU breakdown (which thread burns CPU).
  * Per-so CPU breakdown (which shared library burns CPU).
  * Folded-stack generation for flamegraph tools (stackcollapse format).

Self event count is the right metric for hotspots: subtree counts would just
bubble everything up to thread roots. We read it from the per-thread per-lib
FunctionScope counts in record_info (functions[].c = [sampleCount, eventCount,
subtreeEventCount]).
"""

from . import config


def _iter_functions(profile):
    """Yield (func_name, lib_name, self_ec, subtree_ec) for every function.

    Aggregated across threads/libs from the per-thread libs[].functions[].
    """
    info = profile.record_info
    agg = {}  # func_id -> [self_ec, subtree_ec]
    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in config.CPU_EVENT_NAMES:
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                for lib in thread.get("libs", []):
                    for func in lib.get("functions", []):
                        fid = func["f"]
                        _sc, ec, sec = func["c"]
                        slot = agg.setdefault(fid, [0, 0])
                        slot[0] += ec
                        slot[1] += sec
    for fid, (self_ec, sub_ec) in agg.items():
        yield (profile.func_name(fid),
               profile.lib_name(profile.func_lib_id(fid)),
               self_ec, sub_ec)


def analyze(profile, top_n=None):
    """Return a dict with hotspots + thread/so breakdown."""
    top_n = top_n or config.DEFAULT_TOP_N
    scale = config.TIME_SCALE_NS

    # --- hotspots ---
    funcs = list(_iter_functions(profile))
    total_self = sum(f[2] for f in funcs) or 1
    funcs.sort(key=lambda f: f[2], reverse=True)
    hotspots = []
    for name, lib, self_ec, _sub in funcs[:top_n]:
        if self_ec <= 0:
            continue
        hotspots.append({
            "func": name,
            "lib": lib.rsplit("/", 1)[-1] if lib else "",
            "self_ms": round(self_ec / scale, 3),
            "pct": round(self_ec / total_self * 100.0, 3),
        })

    # --- per-thread ---
    info = profile.record_info
    thread_names = info["threadNames"]
    thread_acc = {}
    lib_acc = {}
    grand_total = 0
    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in config.CPU_EVENT_NAMES:
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                tname = thread_names.get(thread["tid"]) or str(thread["tid"])
                tec = thread.get("eventCount", 0)
                thread_acc[tname] = thread_acc.get(tname, 0) + tec
                grand_total += tec
                for lib in thread.get("libs", []):
                    lname = profile.lib_name(lib["libId"])
                    base = lname.rsplit("/", 1)[-1] if lname else "[unknown]"
                    lib_acc[base] = lib_acc.get(base, 0) + lib.get("eventCount", 0)
    grand_total = grand_total or 1

    threads = [{
        "name": n,
        "self_ms": round(ec / scale, 3),
        "pct": round(ec / grand_total * 100.0, 3),
    } for n, ec in sorted(thread_acc.items(), key=lambda x: x[1], reverse=True)]

    libs = [{
        "name": n,
        "self_ms": round(ec / scale, 3),
        "pct": round(ec / grand_total * 100.0, 3),
    } for n, ec in sorted(lib_acc.items(), key=lambda x: x[1], reverse=True) if ec > 0]

    event = next((s["eventName"] for s in info["sampleInfo"]
                  if s["eventName"] in config.CPU_EVENT_NAMES), "?")

    return {
        "meta": {
            "file": profile.path,
            "label": profile.label,
            "event": event,
            "total_samples": profile.total_samples,
        },
        "hotspots": hotspots,
        "threads": threads,
        "libs": libs,
    }


def folded_stacks(profile, thread_filter=None):
    """Generate folded stacks (semicolon-separated; count) for flamegraphs.

    :param thread_filter: optional thread name; only that thread is emitted.
    :return: str, one folded stack per line.
    """
    lines = []

    def walk(node, stack):
        name = node["func_name"] or "[root]"
        new_stack = stack + [name]
        self_ec = node["event_count"]
        if self_ec > 0:
            lines.append("%s %d" % (";".join(new_stack), self_ec))
        for child in node["child_graph"]:
            walk(child, new_stack)

    for _pname, thread in profile.iter_threads():
        if thread_filter and thread["thread_name"] != thread_filter:
            continue
        walk(thread["call_graph"], [thread["thread_name"]])
    return "\n".join(lines) + "\n"
