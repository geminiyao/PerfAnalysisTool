"""Shared call-graph traversal utilities for simpleperf RecordData trees."""

import re


def iter_cg_nodes(node):
    yield node
    for c in node.get("child_graph", []):
        yield from iter_cg_nodes(c)


def thread_global_pct(thread_ec, grand_total_ec):
    if not grand_total_ec:
        return 0.0
    return thread_ec / grand_total_ec * 100.0


def lib_base(profile, lib_id):
    name = profile.lib_name(lib_id)
    return name.rsplit("/", 1)[-1] if name else ""


def max_subtree_pct_for_keywords(cg, thread_ec, keywords):
    best = 0.0
    hit = None
    for node in iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        for kw in keywords:
            if kw in fn:
                pct = node["subtree_event_count"] / thread_ec * 100.0 if thread_ec else 0.0
                if pct > best:
                    best = pct
                    hit = fn
                break
    return best, hit


def sum_self_global(cg, thread_ec, grand_total_ec, keywords):
    tg = thread_global_pct(thread_ec, grand_total_ec)
    total = 0.0
    for node in iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        for kw in keywords:
            if kw in fn:
                self_pct = node["event_count"] / thread_ec * 100.0 if thread_ec else 0.0
                total += self_pct * tg / 100.0
                break
    return total


def sum_line_global_dedup(cg, thread_ec, grand_total_ec, keywords):
    tg = thread_global_pct(thread_ec, grand_total_ec)
    hits = {}
    for node in iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        for kw in keywords:
            if kw in fn:
                line_pct = node["subtree_event_count"] / thread_ec * 100.0 if thread_ec else 0.0
                g = line_pct * tg / 100.0
                if fn not in hits or g > hits[fn]:
                    hits[fn] = g
                break
    return sum(hits.values()), hits


def lib_pct_in_thread(profile, cg, thread_ec, lib_substr):
    lib_ec = 0
    for node in iter_cg_nodes(cg):
        lid = node.get("lib_id", -1)
        if lid >= 0:
            base = lib_base(profile, lid)
            if lib_substr in base:
                lib_ec += node["event_count"]
    return lib_ec / thread_ec * 100.0 if thread_ec else 0.0


def find_entry_at_depth(cg, keywords, min_depth=5, max_depth=10):
    def walk(node, depth):
        if min_depth <= depth <= max_depth:
            fn = node.get("func_name") or ""
            for kw in keywords:
                if kw in fn:
                    return fn
        if depth >= max_depth:
            return None
        for c in node.get("child_graph", []):
            hit = walk(c, depth + 1)
            if hit:
                return hit
        return None

    for c in cg.get("child_graph", []):
        hit = walk(c, 1)
        if hit:
            return hit
    return None


def norm_symbol(nm):
    nm = re.sub(r"_m[0-9A-F]{32}_gshared$", "", nm)
    nm = re.sub(r"_m[0-9A-F]{32}$", "", nm)
    return nm


def collect_self_hits(profile, cg, thread_ec, grand_total_ec, keywords):
    tg = thread_global_pct(thread_ec, grand_total_ec)
    hits = {}
    for node in iter_cg_nodes(cg):
        fn = node.get("func_name") or ""
        for kw in keywords:
            if kw in fn:
                sp = node["event_count"] / thread_ec * 100.0 if thread_ec else 0.0
                if sp > 0:
                    key = norm_symbol(fn)
                    g = sp * tg / 100.0
                    hits[key] = hits.get(key, 0.0) + g
                break
    return hits


def walk_cg_with_ancestors(node, ancestors, callback):
    callback(node, ancestors)
    new_anc = ancestors + [node]
    for c in node.get("child_graph", []):
        walk_cg_with_ancestors(c, new_anc, callback)
