"""func_compare.py - Level 3: function-level A/M/D diff.

Re-engineered from the original aoe_report_diff.py with these changes:

  1. BUG FIX (original lines 224-225): the "Deleted" detection loop used the
     stale ``cur_func_name`` from the *previous* loop instead of the current
     ``prev_func_name``, so the D path was effectively dead. Fixed here to key
     on ``prev_func_name``.
  2. No debugpy: the original blocked on debugpy.wait_for_client() at import.
  3. Parameterized lib whitelist: auto-detected from the perf.data libList
     (config.resolve_lib_whitelist) instead of a hardcoded package path.
  4. Percentage output: each function reports delta_ms AND delta_pct relative
     to the anchor subtree.
  5. Inline-aware annotation: functions whose self time is ~0 but subtree time
     is large are flagged ``maybe_inlined`` (callers absorbed their cost).

Threads are matched across builds by their "characteristic function" index
(config.THREAD_CHARACTERISTIC_FUNCS), so UnityMain<->UnityMain etc. line up
even if tids differ.
"""

import copy

from . import config


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
def _is_black_listed(func_name):
    low = func_name.lower()
    return any(tok.lower() in low for tok in config.FUNC_NAME_BLACK_LIST)


def _is_no_record(func_name):
    return any(key in func_name for key in config.NO_RECORD_FUNC_NAMES)


def _characteristic_index(func_name):
    for i, key in enumerate(config.THREAD_CHARACTERISTIC_FUNCS):
        if key in func_name:
            return i
    return -1


def _make_func(func_name="", lib_name="", subtree_ms=0.0, self_ms=0.0,
               children=None, mask=""):
    return {
        "func_name": func_name,
        "lib_name": lib_name,
        "subtree_event_time": subtree_ms,
        "self_event_time": self_ms,
        "children_dict": children if children is not None else {},
        "merge_mask": mask,
    }


# ---------------------------------------------------------------------------
# Build per-thread function dict from a call graph
# ---------------------------------------------------------------------------
def _walk(node, ret_dict, lib_whitelist, scale):
    """Mirror of the original get_thread_func_dict, with self time tracked.

    Returns the characteristic-func index discovered in this subtree (or -1).
    """
    char_index = -1
    func_name = node["func_name"]
    if func_name:
        char_index = _characteristic_index(func_name)

    if _is_black_listed(func_name):
        return char_index

    subtree_ms = node["subtree_event_count"] / scale
    self_ms = node["event_count"] / scale
    lib_id = node["lib_id"]
    lib_name = ""
    if lib_id >= 0:
        # lib_name resolved lazily by caller via whitelist membership check
        lib_name = node.get("_lib_name", "")

    is_root_like = lib_id < 0
    in_whitelist = lib_name in lib_whitelist

    if not _is_no_record(func_name) and (is_root_like or in_whitelist):
        existing = ret_dict.get(func_name)
        if not existing:
            fd = _make_func(func_name, lib_name, subtree_ms, self_ms)
            if is_root_like:
                fd["children_dict"] = {}
            ret_dict[func_name] = fd
        else:
            existing["subtree_event_time"] += subtree_ms
            existing["self_event_time"] += self_ms

    for child in node["child_graph"]:
        if is_root_like:
            children_dict = ret_dict[func_name]["children_dict"]
            sub_index = _walk(child, children_dict, lib_whitelist, scale)
        else:
            sub_index = _walk(child, ret_dict, lib_whitelist, scale)
        char_index = char_index if char_index >= 0 else sub_index

    return char_index


def _annotate_lib_names(node, profile):
    """Attach resolved lib name onto each node for whitelist matching."""
    node["_lib_name"] = profile.lib_name(node["lib_id"])
    for child in node["child_graph"]:
        _annotate_lib_names(child, profile)


def _thread_dicts(profile, lib_whitelist):
    """Return {char_index: thread_func_dict} for characteristic threads."""
    scale = config.TIME_SCALE_NS
    result = {}
    for _pname, thread in profile.iter_threads():
        cg = thread["call_graph"]
        _annotate_lib_names(cg, profile)
        func_dict = {}
        char_index = _walk(cg, func_dict, lib_whitelist, scale)
        if char_index < 0:
            continue
        tname = thread["thread_name"]
        if func_dict.get(tname) and func_dict[tname]["children_dict"]:
            func_dict[tname]["characteristic_func_index"] = char_index
            result[char_index] = func_dict[tname]
    return result


# ---------------------------------------------------------------------------
# Merge two thread dicts into A/M/D
# ---------------------------------------------------------------------------
def _merge_children(merged_children, prev_thread, cur_thread):
    prev_children = prev_thread.get("children_dict", {})
    cur_children = cur_thread.get("children_dict", {})

    # Added / Modified
    for cur_name, cur_fd in cur_children.items():
        cur_ms = cur_fd["subtree_event_time"]
        prev_fd = prev_children.get(cur_name)
        if not prev_fd:
            merged_children[cur_name] = copy.copy(cur_fd)
            merged_children[cur_name]["merge_mask"] = "A"
            merged_children[cur_name]["subtree_event_time"] = cur_ms
        else:
            delta = cur_ms - prev_fd["subtree_event_time"]
            merged_children[cur_name] = copy.copy(cur_fd)
            merged_children[cur_name]["subtree_event_time"] = delta
            merged_children[cur_name]["merge_mask"] = "M"

    # Deleted -- BUG FIX: original keyed on the stale ``cur_func_name``; key on
    # the iteration's own ``prev_name`` instead.
    for prev_name, prev_fd in prev_children.items():
        if prev_name in merged_children:
            continue
        merged_children[prev_name] = copy.copy(prev_fd)
        merged_children[prev_name]["subtree_event_time"] = -prev_fd["subtree_event_time"]
        merged_children[prev_name]["merge_mask"] = "D"


def _compare_thread_dicts(prev_threads, cur_threads):
    merged = {}
    # A / M for characteristic threads present in current build
    for c_index, cur_thread in cur_threads.items():
        cur_name = cur_thread["func_name"]
        cur_ms = cur_thread["subtree_event_time"]
        prev_thread = prev_threads.get(c_index, {})
        prev_ms = prev_thread.get("subtree_event_time", 0.0)

        node = _make_func(func_name=cur_name,
                          subtree_ms=cur_ms - prev_ms,
                          mask="M" if prev_thread else "A")
        # absolute reference time for percentage (current build, fallback prev)
        node["abs_event_time"] = cur_ms or prev_ms
        if prev_thread and prev_thread.get("func_name") != cur_name:
            node["func_name"] = "prev_%s|cur_%s" % (
                prev_thread.get("func_name", ""), cur_name)
        merged[c_index] = node
        _merge_children(node["children_dict"], prev_thread, cur_thread)

    # D for threads only in baseline
    for c_index, prev_thread in prev_threads.items():
        if c_index in merged:
            continue
        node = _make_func(func_name=prev_thread["func_name"],
                          subtree_ms=-prev_thread["subtree_event_time"],
                          mask="D")
        node["abs_event_time"] = prev_thread["subtree_event_time"]
        merged[c_index] = node
        _merge_children(node["children_dict"], prev_thread, {})
    return merged


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _dump_func(fd, indent, anchor_total_ms):
    pct = ""
    if anchor_total_ms:
        pct = " (%+.2f%%)" % (fd["subtree_event_time"] / anchor_total_ms * 100.0)
    inl = ""
    if fd.get("self_event_time", 0) < 0.5 and abs(fd["subtree_event_time"]) > config.TIME_THRESHOLD_MS:
        inl = " [maybe_inlined]"
    return "%s[%s] %s %.2fms%s%s\n" % (
        "\t" * indent, fd["merge_mask"], fd["func_name"],
        fd["subtree_event_time"], pct, inl)


def _render_text(merged, lib_whitelist):
    out = []
    target_libs = sorted(lib_whitelist)
    for fd in merged.values():
        anchor_total = fd.get("abs_event_time") or None
        out.append(_dump_func(fd, 0, None))
        children = sorted(fd["children_dict"].items(),
                          key=lambda x: abs(x[1]["subtree_event_time"]),
                          reverse=True)
        for _name, child in children:
            if abs(child["subtree_event_time"]) < config.TIME_THRESHOLD_MS:
                continue
            out.append(_dump_func(child, 1, anchor_total))
    return "".join(out) or "  (no functions exceed threshold)\n"


def _render_items(merged):
    """Machine-readable list of changed functions."""
    items = []
    for c_index, fd in merged.items():
        anchor_total = fd.get("abs_event_time") or None
        children = []
        for name, child in fd["children_dict"].items():
            if abs(child["subtree_event_time"]) < config.TIME_THRESHOLD_MS:
                continue
            children.append({
                "func": name,
                "lib": child.get("lib_name", ""),
                "delta_ms": round(child["subtree_event_time"], 3),
                "delta_pct": round(child["subtree_event_time"] / anchor_total * 100.0, 3)
                if anchor_total else None,
                "mask": child["merge_mask"],
                "maybe_inlined": child.get("self_event_time", 0) < 0.5
                and abs(child["subtree_event_time"]) > config.TIME_THRESHOLD_MS,
            })
        children.sort(key=lambda x: abs(x["delta_ms"]), reverse=True)
        items.append({
            "thread_anchor": fd["func_name"],
            "delta_ms": round(fd["subtree_event_time"], 3),
            "abs_ms": round(anchor_total, 3) if anchor_total else None,
            "mask": fd["merge_mask"],
            "functions": children,
        })
    items.sort(key=lambda x: abs(x["delta_ms"]), reverse=True)
    return items


def compare(baseline_profile, current_profile, lib_whitelist=None):
    """Function-level A/M/D diff between two profiles.

    :param lib_whitelist: set of full lib paths to include. If None, it is
        auto-detected from the union of both profiles' libLists using
        config.DEFAULT_LIB_TOKENS.
    :return: dict {'items': [...], 'text': str}
    """
    if lib_whitelist is None:
        merged_libs = set(baseline_profile.lib_list) | set(current_profile.lib_list)
        lib_whitelist = config.resolve_lib_whitelist(list(merged_libs))

    prev_threads = _thread_dicts(baseline_profile, lib_whitelist)
    cur_threads = _thread_dicts(current_profile, lib_whitelist)
    merged = _compare_thread_dicts(prev_threads, cur_threads)

    return {
        "items": _render_items(merged),
        "text": _render_text(merged, lib_whitelist),
    }
