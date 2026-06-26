"""Main thread annotated call tree — card A.9."""

from .playerloop_phases import PHASE_KEYWORDS, find_main_thread_cg
from .tree_utils import iter_cg_nodes, norm_symbol, thread_global_pct

PHASE_LABELS = {kw: label for label, kw in PHASE_KEYWORDS}


def _phase_for_name(fn):
    for kw, label in PHASE_LABELS.items():
        if kw in fn:
            return label
    return None


def _build_node(profile, node, thread_ec, grand_total_ec, total_samples, base_hits, depth, max_depth, min_pct):
    if depth > max_depth:
        return None
    fn = node.get("func_name") or "[root]"
    self_ec = node["event_count"]
    sub_ec = node["subtree_event_count"]
    tg = thread_global_pct(thread_ec, grand_total_ec)
    self_g = self_ec / thread_ec * tg / 100.0 if thread_ec else 0.0
    line_main = sub_ec / thread_ec * 100.0 if thread_ec else 0.0
    abs_self = round(self_g / 100.0 * total_samples)
    abs_total = round(sub_ec / grand_total_ec * total_samples) if grand_total_ec else 0

    if depth > 0 and sub_ec / thread_ec * 100.0 < min_pct and self_ec / thread_ec * 100.0 < min_pct * 0.2:
        return None

    children = []
    for c in sorted(node.get("child_graph", []), key=lambda x: -x["subtree_event_count"]):
        ch = _build_node(profile, c, thread_ec, grand_total_ec, total_samples, base_hits, depth + 1, max_depth, min_pct)
        if ch:
            children.append(ch)

    if depth > 0 and not children and sub_ec / thread_ec * 100.0 < min_pct:
        return None

    b_abs = base_hits.get(norm_symbol(fn), 0)
    abs_delta = abs_total - b_abs
    markers = []
    if abs_delta >= 100:
        markers.append("📈")
    if self_g >= 0.05 and abs_self >= 100:
        markers.append("🔴")
    elif self_g >= 0.05:
        markers.append("🟡")
    elif line_main >= 5 and self_g < 0.05:
        markers.append("🟡")
    else:
        markers.append("🟢")

    is_wrapper = self_g < 0.05 and any(
        c["subtree_event_count"] / max(sub_ec, 1) >= 0.9
        for c in node.get("child_graph", [])
    ) if sub_ec else False

    return {
        "name": norm_symbol(fn),
        "absSamples": abs_total,
        "absSelf": abs_self,
        "mainThreadPct": round(line_main, 3),
        "selfPctGlobal": round(self_g, 3),
        "markers": markers,
        "isWrapper": is_wrapper,
        "phaseLabel": _phase_for_name(fn),
        "absDelta": abs_delta,
        "children": children,
    }


def _collect_abs_hits(cg, thread_ec, grand_total_ec, total_samples):
    hits = {}
    for node in iter_cg_nodes(cg):
        fn = norm_symbol(node.get("func_name") or "")
        if not fn:
            continue
        sub_ec = node["subtree_event_count"]
        abs_t = round(sub_ec / grand_total_ec * total_samples) if grand_total_ec else 0
        if abs_t > hits.get(fn, 0):
            hits[fn] = abs_t
    return hits


def compute_main_thread_tree(profile, grand_total_ec, tagged_threads, total_samples, base_profile=None):
    cg, main_ec = find_main_thread_cg(profile, tagged_threads)
    if not cg:
        return None

    base_hits = {}
    if base_profile:
        bcg, bec = find_main_thread_cg(base_profile[0], base_profile[1])
        if bcg:
            base_hits = _collect_abs_hits(bcg, bec, base_profile[2], base_profile[3])

    root_cg = cg
    for node in iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        if "ExecutePlayerLoop" in fn:
            root_cg = node
            break

    root = _build_node(profile, root_cg, main_ec, grand_total_ec, total_samples, base_hits, 0, 12, 0.5)
    if not root:
        root = _build_node(profile, cg, main_ec, grand_total_ec, total_samples, base_hits, 0, 12, 0.3)

    main_g = thread_global_pct(main_ec, grand_total_ec)
    return {
        "thread": "main_thread",
        "absSamples": round(main_ec / grand_total_ec * total_samples) if grand_total_ec else 0,
        "globalPct": round(main_g, 3),
        "root": root,
    }
