"""Business module aggregation — auto-discovery via onion peel + common ancestor merge.

Replaces the previous hardcoded BUSINESS_MODULES dict with a data-driven
discovery pipeline (see auto_module_discovery.py for the algorithm). Output
schema unchanged so the rest of the pipeline (probes, top_n_engine,
v4_report_renderer) is not affected.

Legacy keyword path now reads from the active project pack
(projects/<name>/business-modules.yaml).
"""

from .auto_module_discovery import discover_business_modules
from .project_pack import load_project_pack
from .tree_utils import collect_self_hits, sum_self_global
from .naming import sanitize_lib


def _threads_for_scope(profile, tagged_threads, scope):
    if scope == "all_threads":
        return list(profile.iter_threads())
    identity = scope
    tids = {t["tid"] for t in tagged_threads if t["identity"] == identity}
    if not tids:
        return []
    return [(p, th) for p, th in profile.iter_threads() if th["tid"] in tids]


def _lib_pct(metrics, lib_name):
    key = "cpu.lib.%s.pct" % sanitize_lib(lib_name)
    for m in metrics:
        if m["key"] == key:
            return m["value"]
    return 0.0


def compute_business_modules(profile, grand_total_ec, tagged_threads, metrics, total_samples,
                              project_pack=None, binary_cache=None):
    """Auto-discover business modules from callTree (onion peel + common-ancestor merge).

    Project-agnostic algorithm: no hardcoded keywords. Modules emerge from the
    data; project-pack labels (slot section/title) are applied later by the
    renderer.
    """
    return discover_business_modules(
        profile, grand_total_ec, tagged_threads, metrics, total_samples,
    )


def compute_business_modules_legacy(profile, grand_total_ec, tagged_threads, metrics, total_samples,
                                     project_pack=None, binary_cache=None):
    """Legacy keyword path — reads modules from project pack YAML."""
    pack = project_pack or load_project_pack(binary_cache=binary_cache)
    modules = []
    for cfg in pack.business_modules:
        mod_id = cfg["id"]
        mode = cfg.get("discoverMode")
        if mode == "lib_match":
            g_pct = _lib_pct(metrics, cfg["libMatch"])
            abs_s = round(g_pct / 100.0 * total_samples)
            children = []
        elif mode in ("subtree_sum_self", "sum_self"):
            scope = cfg.get("scope", "all_threads")
            keywords = cfg.get("keywords") or []
            if not keywords:
                continue
            g_pct = 0.0
            child_map = {}
            for _p, th in _threads_for_scope(profile, tagged_threads, scope):
                ec = th["event_count"] or 1
                g_pct += sum_self_global(th["call_graph"], ec, grand_total_ec, keywords)
                hits = collect_self_hits(profile, th["call_graph"], ec, grand_total_ec, keywords)
                for fn, sp in hits.items():
                    child_map[fn] = child_map.get(fn, 0.0) + sp
            abs_s = round(g_pct / 100.0 * total_samples)
            children = [
                {
                    "function": fn,
                    "selfPctGlobal": round(sp, 3),
                    "absSelf": round(sp / 100.0 * total_samples),
                }
                for fn, sp in sorted(child_map.items(), key=lambda x: -x[1])[:10]
            ]
        else:
            # Modules without a discover-mode (e.g. lua_vm in some packs) — skip.
            continue

        modules.append({
            "id": mod_id,
            "display": cfg.get("display", mod_id),
            "globalPct": round(g_pct, 3),
            "absSamples": abs_s,
            "children": children,
        })
    modules.sort(key=lambda x: -x["absSamples"])
    return modules
