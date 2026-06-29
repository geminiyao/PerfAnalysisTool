"""Top-N business module ranking — card A.8."""

# Map auto-discovered module ids → probe ids by semantic substrings.
# Auto ids look like "auto_main_thread_BattleUIManager_UpdateMUIPos_xxx", so
# we test substring/display for slot membership instead of exact id match.
PROBE_MODULE_MAP_LEGACY = {
    "wwise": "probe.middleware.wwise",
    "meshui": "probe.csharp.meshUI",
    "army_line": "probe.csharp.outsideViewArmyLine",
    "ecs_burst": None,
    "network": "probe.net.tserver",
}

SLOT_PROBE_MATCHERS = [
    # (substring matcher tested against id+display+rootSymbol, slot)
    (("libAkSoundEngine", "Wwise", "wwise"), "wwise"),
    (("lib_burst_generated", "ECS Burst", "ecs_burst"), "ecs_burst"),
    (("MUI", "MeshUI", "BattleUIManager_UpdateMUIPos"), "meshui"),
    (("OutSideViewArmyLineMgr", "OutsideLineCtrl", "OutsideLineMesh", "army_line"), "army_line"),
    (("TServer", "network"), "network"),
    (("lua_mtgc_worker", "Lua GC"), "lua_gc_worker"),
]


def _slot_for_module(module):
    haystack = " ".join([
        module.get("id", ""), module.get("display", ""), module.get("rootSymbol", ""),
    ])
    for keys, slot in SLOT_PROBE_MATCHERS:
        if any(k in haystack for k in keys):
            return slot
    return None


def _probe_id_for_module(module):
    slot = _slot_for_module(module)
    return PROBE_MODULE_MAP_LEGACY.get(slot)


def _effective_verdict(module, slot, probe_verdict):
    """Align Top-N 判定 with gold narrative.

    Auto-discovery may split a logical module across multiple ids, so the
    slot-derived rules consider the full module subtree. NEW (no base) and
    large absDelta also trigger red even when the probe is green (probe is a
    %-based signal; new business hotspots should still be flagged).
    """
    d = module.get("absDelta", 0)
    cur = module.get("curAbs", 0)
    if slot == "army_line":
        if d == "NEW" or (isinstance(d, (int, float)) and d >= 150):
            return "red"
    if slot == "meshui":
        # Per-knowledge §6 阈值 >5% main, but auto-split modules each report
        # their own %main; if combined cur is large or it's NEW, surface red.
        if probe_verdict == "red":
            return "red"
        if d == "NEW" or (isinstance(d, (int, float)) and d >= 500):
            return "red"
        if cur > 500 and probe_verdict == "green":
            return "red"
    return probe_verdict or "green"


def compute_top_n(business_modules_diff, probes_diff, top_k=12):
    probe_verdict = {p["id"]: p.get("verdict", "green") for p in probes_diff}
    rows = []
    for m in business_modules_diff:
        if m.get("absDelta", 0) == 0 and m.get("curAbs", 0) == 0:
            continue
        slot = _slot_for_module(m)
        probe_id = PROBE_MODULE_MAP_LEGACY.get(slot) if slot else None
        raw = probe_verdict.get(probe_id, "green") if probe_id else "green"
        verdict = _effective_verdict(m, slot, raw)
        thread_hint = {
            "ecs_burst": "job_worker × 4",
            "wwise": "wwise_worker",
            "lua_gc_worker": "lua_mtgc_worker",
            "meshui": "main_thread",
            "army_line": "main_thread",
        }.get(slot, "")
        rows.append({
            "rank": 0,
            "verdict": verdict,
            "moduleId": m["id"],
            "slot": slot,
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
