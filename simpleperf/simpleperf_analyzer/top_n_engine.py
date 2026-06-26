"""Top-N business module ranking — card A.8."""

PROBE_MODULE_MAP = {
    "wwise": "probe.middleware.wwise",
    "meshui": "probe.csharp.meshUI",
    "army_line": "probe.csharp.outsideViewArmyLine",
    "ecs_burst": None,
    "network": "probe.net.tserver",
}


def _effective_verdict(module_id, probe_verdict, module):
    """Align Top-N 判定列 with gold narrative (army_line NEW 热点标红)."""
    if module_id == "army_line":
        d = module.get("absDelta", 0)
        if d == "NEW" or (isinstance(d, (int, float)) and d >= 150):
            return "red"
    if module_id == "meshui" and probe_verdict == "green" and module.get("curAbs", 0) > 500:
        return "red"
    return probe_verdict or "green"


def compute_top_n(business_modules_diff, probes_diff, top_k=12):
    probe_verdict = {p["id"]: p.get("verdict", "green") for p in probes_diff}
    rows = []
    for m in business_modules_diff:
        if m.get("absDelta", 0) == 0 and m.get("curAbs", 0) == 0:
            continue
        probe_id = PROBE_MODULE_MAP.get(m["id"])
        raw = probe_verdict.get(probe_id, "green") if probe_id else "green"
        verdict = _effective_verdict(m["id"], raw, m)
        thread_hint = {
            "ecs_burst": "job_worker × 4",
            "wwise": "wwise_worker",
            "lua_gc_worker": "lua_mtgc_worker",
            "meshui": "main_thread",
            "army_line": "main_thread",
        }.get(m["id"], "")
        rows.append({
            "rank": 0,
            "verdict": verdict,
            "moduleId": m["id"],
            "display": m.get("display", m["id"]),
            "thread": thread_hint,
            "baseAbs": m.get("baseAbs", 0),
            "curAbs": m.get("curAbs", 0),
            "absDelta": m.get("absDelta", 0),
            "absDeltaPct": m.get("absDeltaPct", 0),
            "children": m.get("children", []),
        })
    rows.sort(key=lambda x: -abs(x["absDelta"]))
    for i, r in enumerate(rows[:top_k]):
        r["rank"] = i + 1
    return rows[:top_k]
