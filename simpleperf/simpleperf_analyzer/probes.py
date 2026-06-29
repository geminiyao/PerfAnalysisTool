"""Probe detection engine per knowledge base v2.1 §6 / card A.5.

Probe definitions (PROBE_DEFS) are loaded from the active project pack
(projects/<name>/probes.yaml). The legacy hardcoded PROBE_DEFS list is gone;
all probe metadata, including project-specific keywords, lives in YAML.
"""

from .playerloop_phases import find_main_thread_cg
from .project_pack import load_project_pack
from .tree_utils import max_subtree_pct_for_keywords, sum_line_global_dedup, sum_self_global


def _probe_defs(pack):
    """Convert YAML probe entries to runtime tuples used by compute_probes.

    Output schema preserves the legacy positional format so existing readers
    in the function below stay unchanged:
        (id, display, kind, thresholds, *kind_specific_args, knowledge_ref)
    """
    defs = []
    for p in pack.probes:
        pid = p["id"]
        display = p.get("display") or pid
        kind = p["kind"]
        thresholds = p.get("thresholds") or {"green": 0, "yellow": 0, "red": 100}
        kref = p.get("knowledgeRef", "")

        if kind == "module":
            defs.append((pid, display, kind, thresholds, p["module"], kref))
        elif kind == "module_main":
            defs.append((pid, display, kind, thresholds, p["module"], kref))
        elif kind == "keywords_main":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "keywords_global":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "keywords_global_self":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "keywords_global_dedup":
            defs.append((pid, display, kind, thresholds, p["keywords"], p.get("scope", "main_thread"), kref))
        elif kind == "keywords_rhi":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "keywords_rhi_observe":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "phase_ms":
            defs.append((pid, display, kind, thresholds, p["phaseLabel"], kref))
        elif kind == "phase_ms_combined":
            defs.append((pid, display, kind, thresholds, kref))
            # phaseLabels are stored on the dict and looked up below.
        elif kind == "keywords_main_ms":
            defs.append((pid, display, kind, thresholds, p["keywords"], kref))
        elif kind == "thread_balance":
            defs.append((pid, display, kind, thresholds, p["threadIdentity"], kref))
        else:
            # Unknown kind — skip with warning.
            continue
    return defs


def _verdict(value, thresholds):
    """green < green_th; yellow in [green, yellow); red >= yellow (per knowledge base §6)."""
    if value >= thresholds["yellow"]:
        return "red"
    if value >= thresholds["green"]:
        return "yellow"
    return "green"


def _main_pct(g, main_g):
    return g / main_g * 100.0 if main_g > 0 else 0.0


def _ms_per_frame(abs_samples, duration_sec=20, fps=60):
    return abs_samples / (duration_sec * fps) if abs_samples else 0.0


def compute_probes(profile, grand_total_ec, tagged_threads, business_modules, playerloop_stages, total_samples,
                   project_pack=None, binary_cache=None):
    pack = project_pack or load_project_pack(binary_cache=binary_cache)
    probe_defs = _probe_defs(pack)
    probes_yaml_by_id = {p["id"]: p for p in pack.probes}

    mod_map = {m["id"]: m for m in business_modules}
    main_g = next((t["globalPct"] for t in tagged_threads if t["identity"] == "main_thread"), 0.0)
    phase_map = {s["label"]: s for s in playerloop_stages}
    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}

    def cg_for(identity):
        for _p, th in profile.iter_threads():
            if tid_identity.get(th["tid"]) == identity:
                return th["call_graph"], th["event_count"] or 1
        return None, 0

    probes = []
    for pdef in probe_defs:
        pid, display, kind, thresholds = pdef[:4]
        rest = pdef[4:]
        knowledge_ref = rest[-1]
        value = 0.0
        abs_samples = 0
        unit = "%global"

        if kind == "module":
            mod_id = rest[0]
            m = mod_map.get(mod_id, {})
            value = m.get("globalPct", 0.0)
            abs_samples = m.get("absSamples", 0)
        elif kind == "module_main":
            mod_id = rest[0]
            m = mod_map.get(mod_id, {})
            g = m.get("globalPct", 0.0)
            value = _main_pct(g, main_g)
            abs_samples = m.get("absSamples", 0)
            unit = "%main"
        elif kind == "keywords_main":
            kws = rest[0]
            cg, ec = find_main_thread_cg(profile, tagged_threads)
            if cg:
                g = sum_self_global(cg, ec, grand_total_ec, kws)
                value = _main_pct(g, main_g)
                abs_samples = round(g / 100.0 * total_samples)
            unit = "%main"
        elif kind == "keywords_global":
            kws = rest[0]
            for _p, th in profile.iter_threads():
                ec = th["event_count"] or 1
                value += sum_self_global(th["call_graph"], ec, grand_total_ec, kws)
            abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_global_self":
            kws = rest[0]
            for _p, th in profile.iter_threads():
                ec = th["event_count"] or 1
                value += sum_self_global(th["call_graph"], ec, grand_total_ec, kws)
            abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_global_dedup":
            kws, scope = rest[0], rest[1]
            cg, ec = cg_for(scope)
            if cg:
                value, _ = sum_line_global_dedup(cg, ec, grand_total_ec, kws)
                abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_rhi":
            kws = rest[0]
            cg, ec = cg_for("rhi_thread")
            if cg:
                value, _ = max_subtree_pct_for_keywords(cg, ec, kws)
                abs_samples = round(value / 100.0 * ec / grand_total_ec * total_samples) if grand_total_ec else 0
            unit = "%rhi"
        elif kind == "keywords_rhi_observe":
            kws = rest[0]
            cg, ec = cg_for("rhi_thread")
            if cg:
                value, _ = max_subtree_pct_for_keywords(cg, ec, kws)
                abs_samples = round(value / 100.0 * ec / grand_total_ec * total_samples) if grand_total_ec else 0
            unit = "%rhi"
            verdict = "green"
        elif kind == "phase_ms":
            ph = phase_map.get(rest[0], {})
            abs_samples = ph.get("absSamples", 0)
            value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "phase_ms_combined":
            phase_labels = (probes_yaml_by_id.get(pid) or {}).get("phaseLabels") or []
            abs_samples = sum(phase_map.get(lbl, {}).get("absSamples", 0) for lbl in phase_labels)
            value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "keywords_main_ms":
            kws = rest[0]
            cg, ec = find_main_thread_cg(profile, tagged_threads)
            if cg:
                g = sum_self_global(cg, ec, grand_total_ec, kws)
                abs_samples = round(g / 100.0 * total_samples)
                value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "thread_balance":
            identity = rest[0]
            workers = sorted(
                [t for t in tagged_threads if t["identity"] == identity],
                key=lambda x: -x["absSamples"],
            )[:4]
            pcts = [t["globalPct"] for t in workers]
            if len(pcts) >= 2:
                mn, mx = min(pcts), max(pcts)
                value = (mx - mn) / mn * 100.0 if mn > 0 else 0.0
            unit = "%"

        verdict = _verdict(value, thresholds) if kind != "keywords_rhi_observe" else "green"
        probes.append({
            "id": pid,
            "display": display,
            "value": round(value, 3),
            "unit": unit,
            "absSamples": abs_samples,
            "thresholds": thresholds,
            "verdict": verdict,
            "knowledgeRef": knowledge_ref,
        })
    return probes
