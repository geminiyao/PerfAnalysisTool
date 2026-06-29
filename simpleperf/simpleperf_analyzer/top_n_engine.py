"""Top-N business module ranking — card A.8.

Slot matchers, probe→slot mapping, and per-slot effective-verdict rules
come from the active project pack (projects/<name>/slot-matchers.yaml +
business-modules.yaml). Module → slot resolution uses the same SLOT_MATCHERS
shape as v4_report_renderer / narrative_tree.
"""

from .project_pack import load_project_pack


def _pack():
    return load_project_pack()


def _slot_matchers_substr():
    """Convert YAML slot matchers into [(substr-tuple, slot), ...] form
    used by Top-N's `id+display+rootSymbol` haystack matching.

    Each YAML rule contributes one substring per (kind, value) — kind
    metadata is dropped because the haystack mixes all three fields.
    """
    rules = []
    matchers = _pack().slot_matchers or {}
    for slot, entries in matchers.items():
        keys = []
        for entry in entries:
            v = entry.get("value")
            if v:
                keys.append(v)
        if keys:
            rules.append((tuple(keys), slot))
    return rules


def _probe_for_slot(slot):
    for m in _pack().business_modules:
        if m.get("id") == slot:
            return m.get("probeId")
    return None


def _slot_for_module(module):
    haystack = " ".join([
        module.get("id", ""), module.get("display", ""), module.get("rootSymbol", ""),
    ])
    for keys, slot in _slot_matchers_substr():
        if any(k in haystack for k in keys):
            return slot
    return None


def _probe_id_for_module(module):
    slot = _slot_for_module(module)
    return _probe_for_slot(slot) if slot else None


def _effective_verdict(module, slot, probe_verdict):
    """Align Top-N 判定 with gold narrative.

    Auto-discovery may split a logical module across multiple ids, so slot-
    derived rules look at the full module subtree. NEW (no base) and large
    absDelta also trigger red even when the probe is green (probe is a
    %-based signal; new business hotspots should still be flagged).

    Project pack hotModuleIds (slot-matchers.yaml) drives which slots get
    the elevated NEW/Δ→red treatment.
    """
    d = module.get("absDelta", 0)
    cur = module.get("curAbs", 0)
    hot = _pack().hot_module_ids
    if slot == "army_line" and "army_line" in hot:
        if d == "NEW" or (isinstance(d, (int, float)) and d >= 150):
            return "red"
    if slot == "meshui" and "meshui" in hot:
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
        probe_id = _probe_for_slot(slot) if slot else None
        raw = probe_verdict.get(probe_id, "green") if probe_id else "green"
        verdict = _effective_verdict(m, slot, raw)
        # Look up the slot's threadHint from the project pack.
        thread_hint = ""
        if slot:
            for cfg in _pack().business_modules:
                if cfg.get("id") == slot:
                    thread_hint = cfg.get("threadHint", "")
                    break
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
