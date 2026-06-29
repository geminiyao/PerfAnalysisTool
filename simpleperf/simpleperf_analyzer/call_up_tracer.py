"""Runtime function call-up tracing per knowledge base v2.1 §5 / card A.4.

CALL_UP_TARGETS and CALLER_MODULE_RULES come from the active project pack
(projects/<name>/caller-modules.yaml). The legacy hardcoded lists are gone.
"""

from .project_pack import load_project_pack
from .tree_utils import iter_cg_nodes, norm_symbol, thread_global_pct, walk_cg_with_ancestors


def _classify_module(chain_names, rules, unclassified_label):
    for entry in rules:
        keywords = entry.get("keywords") or []
        module = entry.get("module") or unclassified_label
        for name in chain_names:
            for kw in keywords:
                if kw in name:
                    return module
    return unclassified_label


def _match_target(fn, targets):
    for t in targets:
        if t in fn or fn == t:
            return t
    return None


def compute_call_up_tracing(profile, grand_total_ec, tagged_threads,
                            project_pack=None, binary_cache=None):
    pack = project_pack or load_project_pack(binary_cache=binary_cache)
    targets = list(pack.call_up_targets)
    rules = list(pack.caller_module_rules)
    unclassified_label = pack.caller_unclassified_label

    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}
    results = {t: [] for t in targets}

    for _p, th in profile.iter_threads():
        ec = th["event_count"] or 1
        tg = thread_global_pct(ec, grand_total_ec)
        thread_id = tid_identity.get(th["tid"], th["thread_name"])

        def on_node(node, ancestors):
            fn = node.get("func_name") or ""
            target = _match_target(fn, targets)
            if not target:
                return
            chain = ancestors[-3:]
            chain_names = [norm_symbol(a.get("func_name") or "") for a in chain]
            chain_key = " < ".join(reversed([n[:60] for n in chain_names if n]))
            line_pct = node["subtree_event_count"] / ec * 100.0 if ec else 0.0
            g_pct = line_pct * tg / 100.0
            module = _classify_module(chain_names + [norm_symbol(fn)], rules, unclassified_label)
            results[target].append({
                "callerChain": chain_key or fn[:60],
                "thread": thread_id,
                "globalPct": round(g_pct, 4),
                "module": module,
            })

        walk_cg_with_ancestors(th["call_graph"], [], on_node)

    output = []
    for target in targets:
        hits = results[target]
        raw_hit_count = len(hits)
        dedup = {}
        for h in hits:
            k = (h["callerChain"], h["thread"])
            if k not in dedup or h["globalPct"] > dedup[k]["globalPct"]:
                dedup[k] = h
        top = sorted(dedup.values(), key=lambda x: -x["globalPct"])[:10]
        # totalGlobalPct: sum across ALL dedup entries (not just top 10) so the
        # report's "global X%" reflects the full footprint.
        full_total = round(sum(h["globalPct"] for h in dedup.values()), 4)
        output.append({
            "runtime": target,
            "totalGlobalPct": full_total,
            "totalHits": raw_hit_count,
            "uniqueCallChains": len(dedup),
            "topCallers": top,
        })
    return output
