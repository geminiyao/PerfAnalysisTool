"""anchor_compare.py - Level 2: anchor-function subtree time comparison.

For each configured anchor function (e.g. ExecutePlayerLoop), we walk the
per-thread call graph, find the node whose name contains the anchor substring,
and read its ``subtree_event_count``. The subtree count covers the anchor plus
everything it calls, so this metric is also inline-resistant: inlining moves
time *within* the subtree but does not change the subtree total.

We convert event_count -> ms via config.TIME_SCALE_NS (valid for cpu-clock /
task-clock; for cpu-cycles the absolute ms is meaningless but the delta_pct
still reflects relative change).
"""

from . import config


def _find_anchor_subtree(node, anchor, found):
    """Depth-first; accumulate subtree_event_count of every node matching anchor.

    Once an anchor node is found we do NOT descend into it again for the same
    anchor (avoids double counting nested recursion of the same function).
    """
    name = node["func_name"]
    if name and anchor in name:
        found[0] += node["subtree_event_count"]
        return  # stop descent under this matched node
    for child in node["child_graph"]:
        _find_anchor_subtree(child, anchor, found)


def _profile_anchor_ms(profile, anchors):
    """Return {anchor: total_subtree_ms} summed across all threads."""
    scale = config.TIME_SCALE_NS
    result = {a: 0.0 for a in anchors}
    for _pname, thread in profile.iter_threads():
        cg = thread["call_graph"]
        for anchor in anchors:
            found = [0]
            _find_anchor_subtree(cg, anchor, found)
            result[anchor] += found[0] / scale
    return result


def compare(baseline_profile, current_profile, anchors=None):
    """Compare anchor subtree times between two profiles.

    :param anchors: list of anchor-function substrings; defaults to
        config.DEFAULT_ANCHOR_FUNCS.
    :return: dict with 'anchors': [{name, baseline_ms, current_ms, delta_ms, delta_pct}]
    """
    anchors = anchors or config.DEFAULT_ANCHOR_FUNCS
    base = _profile_anchor_ms(baseline_profile, anchors)
    cur = _profile_anchor_ms(current_profile, anchors)

    out = []
    for anchor in anchors:
        b = base.get(anchor, 0.0)
        c = cur.get(anchor, 0.0)
        if b == 0.0 and c == 0.0:
            continue
        delta_pct = ((c - b) / b * 100.0) if b else float("inf")
        out.append({
            "name": anchor,
            "baseline_ms": round(b, 3),
            "current_ms": round(c, 3),
            "delta_ms": round(c - b, 3),
            "delta_pct": round(delta_pct, 3) if b else None,
        })
    out.sort(key=lambda x: abs(x["delta_ms"]), reverse=True)
    return {"anchors": out}
