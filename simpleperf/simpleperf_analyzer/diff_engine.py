"""base vs cur diff engine — card A.6."""

def _delta_pct(cur_abs, base_abs):
    if base_abs == 0:
        return "NEW"
    return round((cur_abs / base_abs - 1) * 100.0, 1)


def _diff_row(base_val, cur_val, system_delta_pct):
    base_abs = base_val.get("absSamples", 0) if isinstance(base_val, dict) else int(base_val or 0)
    cur_abs = cur_val.get("absSamples", 0) if isinstance(cur_val, dict) else int(cur_val or 0)
    base_pct = base_val.get("globalPct", 0) if isinstance(base_val, dict) else base_val
    cur_pct = cur_val.get("globalPct", 0) if isinstance(cur_val, dict) else cur_val
    abs_delta = cur_abs - base_abs
    dp = _delta_pct(cur_abs, base_abs)
    excess = round(dp - system_delta_pct, 1) if isinstance(dp, (int, float)) else dp
    return {
        "baseAbs": base_abs,
        "curAbs": cur_abs,
        "basePct": base_pct,
        "curPct": cur_pct,
        "absDelta": abs_delta,
        "absDeltaPct": dp,
        "excessVsSystem": excess,
    }


def _index_by(items, key):
    return {i[key]: i for i in items}


def compute_diff(base_ext, cur_ext, base_label="base", cur_label="cur", duration_sec=20):
    base_samples = base_ext.get("totalSamples", 0)
    cur_samples = cur_ext.get("totalSamples", 0)
    sys_pct = round((cur_samples / base_samples - 1) * 100.0, 1) if base_samples else 0.0

    diff = {
        "base": {"label": base_label, "totalSamples": base_samples, "durationSec": duration_sec},
        "cur": {"label": cur_label, "totalSamples": cur_samples, "durationSec": duration_sec},
        "systemPressure": {"totalSamplesDeltaPct": sys_pct},
    }

    # libs from metrics
    def lib_rows(metrics, total_samples):
        rows = []
        for m in metrics:
            if not m["key"].startswith("cpu.lib."):
                continue
            lib = m["key"].replace("cpu.lib.", "").replace(".pct", "")
            rows.append({
                "lib": lib,
                "globalPct": m["value"],
                "absSamples": round(m["value"] / 100.0 * total_samples),
            })
        return rows

    base_libs = _index_by(lib_rows(base_ext.get("metrics", []), base_samples), "lib")
    cur_libs = _index_by(lib_rows(cur_ext.get("metrics", []), cur_samples), "lib")
    libs = []
    for lib in sorted(set(base_libs) | set(cur_libs), key=lambda l: -abs(
        (cur_libs.get(l, {}).get("absSamples", 0) or round(cur_libs.get(l, {}).get("globalPct", 0) / 100 * cur_samples))
        - (base_libs.get(l, {}).get("absSamples", 0) or round(base_libs.get(l, {}).get("globalPct", 0) / 100 * base_samples))
    )):
        b = base_libs.get(lib, {"globalPct": 0, "absSamples": 0})
        c = cur_libs.get(lib, {"globalPct": 0, "absSamples": 0})
        b_abs = round(b["globalPct"] / 100.0 * base_samples)
        c_abs = round(c["globalPct"] / 100.0 * cur_samples)
        row = _diff_row({"globalPct": b["globalPct"], "absSamples": b_abs},
                        {"globalPct": c["globalPct"], "absSamples": c_abs}, sys_pct)
        row["lib"] = lib
        libs.append(row)
    diff["libs"] = sorted(libs, key=lambda x: -abs(x["absDelta"]))

    # threads
    base_th = _index_by(base_ext.get("threads", []), "key")
    cur_th = _index_by(cur_ext.get("threads", []), "key")
    threads = []
    for key in set(base_th) | set(cur_th):
        b = base_th.get(key, {})
        c = cur_th.get(key, {})
        row = _diff_row(b, c, sys_pct)
        row["key"] = key
        row["identity"] = c.get("identity") or b.get("identity")
        row["comm"] = c.get("comm") or b.get("comm")
        row["tid"] = c.get("tid") or b.get("tid")
        threads.append(row)
    diff["threads"] = sorted(threads, key=lambda x: -abs(x["absDelta"]))

    # playerLoopStages
    base_pl = _index_by(base_ext.get("playerLoopStages", []), "label")
    cur_pl = _index_by(cur_ext.get("playerLoopStages", []), "label")
    pls = []
    for label in set(base_pl) | set(cur_pl):
        b = base_pl.get(label, {})
        c = cur_pl.get(label, {})
        row = _diff_row(b, c, sys_pct)
        row["label"] = label
        row["totalPctMain"] = c.get("totalPctMain", b.get("totalPctMain", 0))
        pls.append(row)
    diff["playerLoopStages"] = sorted(pls, key=lambda x: -abs(x["absDelta"]))

    # businessModules
    base_bm = _index_by(base_ext.get("businessModules", []), "id")
    cur_bm = _index_by(cur_ext.get("businessModules", []), "id")
    bms = []
    for mid in set(base_bm) | set(cur_bm):
        b = base_bm.get(mid, {})
        c = cur_bm.get(mid, {})
        row = _diff_row(b, c, sys_pct)
        row["id"] = mid
        row["display"] = c.get("display") or b.get("display")
        # children diff
        bc = {ch["function"]: ch for ch in b.get("children", [])}
        cc = {ch["function"]: ch for ch in c.get("children", [])}
        children = []
        for fn in set(bc) | set(cc):
            cb = bc.get(fn, {"absSelf": 0, "selfPctGlobal": 0})
            ccur = cc.get(fn, {"absSelf": 0, "selfPctGlobal": 0})
            cr = _diff_row({"absSamples": cb.get("absSelf", 0)}, {"absSamples": ccur.get("absSelf", 0)}, sys_pct)
            cr["function"] = fn
            children.append(cr)
        row["children"] = sorted(children, key=lambda x: -abs(x["absDelta"]))
        bms.append(row)
    diff["businessModules"] = sorted(bms, key=lambda x: -abs(x["absDelta"]))

    # callUpTracing
    base_cu = _index_by(base_ext.get("callUpTracing", []), "runtime")
    cur_cu = _index_by(cur_ext.get("callUpTracing", []), "runtime")
    cus = []
    for rt in set(base_cu) | set(cur_cu):
        b = base_cu.get(rt, {})
        c = cur_cu.get(rt, {})
        row = _diff_row({"absSamples": round(b.get("totalGlobalPct", 0) / 100 * base_samples)},
                        {"absSamples": round(c.get("totalGlobalPct", 0) / 100 * cur_samples)}, sys_pct)
        row["runtime"] = rt
        row["baseTotalGlobalPct"] = b.get("totalGlobalPct", 0)
        row["curTotalGlobalPct"] = c.get("totalGlobalPct", 0)
        row["topCallers"] = c.get("topCallers", [])
        cus.append(row)
    diff["callUpTracing"] = sorted(cus, key=lambda x: -abs(x["absDelta"]))

    # probes
    base_pr = _index_by(base_ext.get("probes", []), "id")
    cur_pr = _index_by(cur_ext.get("probes", []), "id")
    prs = []
    for pid in sorted(set(base_pr) | set(cur_pr)):
        b = base_pr.get(pid, {})
        c = cur_pr.get(pid, {})
        row = _diff_row({"absSamples": b.get("absSamples", 0), "globalPct": b.get("value", 0)},
                        {"absSamples": c.get("absSamples", 0), "globalPct": c.get("value", 0)}, sys_pct)
        row.update({k: c.get(k, b.get(k)) for k in ("id", "display", "unit", "thresholds", "verdict", "knowledgeRef")})
        row["baseValue"] = b.get("value", 0)
        row["curValue"] = c.get("value", 0)
        prs.append(row)
    diff["probes"] = prs

    return diff
