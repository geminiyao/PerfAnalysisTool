"""Gold-style narrative call trees from Provider callTrees JSON (readable names, skip il2cpp noise).

All project-specific symbol/label tables (label rewrites, annotations, business
keywords, slot matchers, hot-module ids, burst-job labels) are loaded from the
active project pack (projects/<name>/*.yaml). The legacy hardcoded constants
were promoted to default-fallbacks via the project pack `_generic` package.
"""

import re
from .project_pack import load_project_pack
from .tree_utils import norm_symbol

# Nodes to skip entirely (promote children) — these are universal Unity engine
# wrappers, NOT project-specific, so they remain hardcoded here.
_SKIP_RES = [
    re.compile(r"^__start_thread"),
    re.compile(r"^__pthread_start"),
    re.compile(r"^Thread::RunThreadWrapper"),
    re.compile(r"^com\.unity3d\.player"),
    re.compile(r"^sigsetjmp"),
    re.compile(r"^jni::"),
    re.compile(r"^InitPlayerLoopCallbacks\(\)"),
    re.compile(r"^void BaseBehaviourManager::CommonUpdate"),
    re.compile(r"^BehaviourManager::Update"),
    re.compile(r"^LateBehaviourManager::Update"),
    re.compile(r"^RuntimeInvoker_"),
    re.compile(r"^il2cpp::vm::Runtime"),
    re.compile(r"^SetupCoroutine_InvokeMoveNext"),
    re.compile(r"^WillRenderCanvases_Invoke"),
    re.compile(r"^ScriptingInvocation::Invoke"),
    re.compile(r"^RenderPipelineManager_DoRenderLoop"),
    re.compile(r"^ScriptableRenderContext::ExtractAndExecuteRenderPipeline"),
    re.compile(r"^Unity\.Entities\.JobChunkExtensions\.JobChunkProducer"),
]

# IL2CPP hash suffix on C# methods
_HASH_SUFFIX = re.compile(r"(_m[0-9A-F]{32}(_gshared)?|_356fe412ab5d279ecb02e1e6360be035)$")


def _pack():
    return load_project_pack()


def _label_rewrites():
    return [(item.get("match", ""), item.get("display", "")) for item in _pack().label_rewrites if item.get("match")]


def _annotations_pairs():
    """List of (tuple_of_keys, note_string)."""
    out = []
    for entry in _pack().annotations:
        keys = entry.get("keys") or []
        out.append((tuple(keys), entry.get("note", "")))
    return out


def _business_kw():
    return tuple(_pack().business_keywords or ())


def _hot_module_ids():
    return _pack().hot_module_ids


def _slot_matchers_dict():
    """Convert slot-matchers YAML into {slot: [(kind, key), ...]}."""
    out = {}
    for slot, rules in (_pack().slot_matchers or {}).items():
        out[slot] = [(r.get("kind"), r.get("value")) for r in rules]
    return out



def friendly_name(raw):
    s = raw.split("→")[-1].strip() if "→" in raw else raw
    s = _HASH_SUFFIX.sub("", s)
    s = norm_symbol(s)
    for pat, repl in _label_rewrites():
        if pat in s or re.search(pat, s):
            return repl
    # Strip C# generic noise
    s = re.sub(r"`\d+<[^>]+>", "", s)
    s = re.sub(r"\([^)]*\)\s*->\s*void.*$", "", s)
    s = re.sub(r"\(AOE\.DOTS\.[^)]+\)", "", s)
    # C++ / IL2CPP: keep readable prefix before first '('
    if "::" in s and "(" in s:
        s = s.split("(")[0]
    s = re.sub(r"_m[0-9A-F]{32,40}$", "", s)
    s = re.sub(r"_gshared$", "", s)
    if len(s) > 72:
        s = s[:69] + "..."
    return s or raw[:72]


def should_skip(name):
    base = name.split("→")[-1].strip()
    return any(r.search(base) for r in _SKIP_RES)


def should_skip_node(node):
    if node.get("phaseLabel"):
        return False
    return should_skip(node.get("name", ""))


def _delta_pct_str(node):
    d = node.get("absDelta", 0)
    abs_t = node.get("absSamples", 0)
    if not isinstance(d, (int, float)) or d == 0:
        return ""
    base = abs_t - d
    if base <= 0:
        return "NEW" if d > 0 else ""
    return "%+.0f%%" % (d / base * 100)


def _pruned_line(node, prefix, branch, extra_note=""):
    name = node.get("phaseLabel") or friendly_name(node.get("name", ""))
    abs_t = node.get("absSamples", 0)
    mp = node.get("mainThreadPct", 0)
    markers = "".join(node.get("markers", []))
    wrapper = " [wrapper]" if node.get("isWrapper") else ""
    self_g = node.get("selfPctGlobal", 0)
    self_note = ""
    if self_g >= 0.05:
        self_note = " (self %.2f%% global)" % self_g
    elif node.get("absSelf", 0) >= 50:
        self_note = " (self %s)" % node.get("absSelf", 0)
    d_str = _delta_pct_str(node)
    d_note = (", base→cur " + d_str) if d_str else ""
    ann = _annotation(node.get("name", "")) or _annotation(name)
    ann_s = ("  " + ann) if ann else ""
    note = extra_note + d_note
    note_s = (" " + note) if note else ""
    return "%s%s%s (%s / %.2f%%)%s%s %s%s%s" % (
        prefix, branch, name, f"{abs_t:,}", mp, wrapper, self_note, markers, note_s, ann_s,
    )


def _deepest_subtree(node, keywords, depth=0):
    if depth > 12:
        return None
    nm = node.get("name", "")
    if any(k in nm for k in keywords):
        return node
    best = None
    for ch in node.get("children", []):
        hit = _deepest_subtree(ch, keywords, depth + 1)
        if hit and (not best or hit.get("absSamples", 0) > best.get("absSamples", 0)):
            best = hit
    return best


def _collect_phase_nodes(root, out, depth=0):
    if depth > 6 or not root:
        return
    if root.get("phaseLabel"):
        out.append(root)
        return
    for ch in root.get("children", []):
        _collect_phase_nodes(ch, out, depth + 1 if not should_skip_node(ch) else depth)


def _render_pruned_children(node, lines, prefix, main_abs, total_samples, depth, max_depth, min_main_pct=0.35):
    kids = sorted(node.get("children", []), key=lambda x: -x.get("absSamples", 0))
    visible = []
    for ch in kids:
        if should_skip_node(ch):
            sub = ch.get("children", [])
            if sub:
                visible.extend(sub)
            continue
        if ch.get("mainThreadPct", 0) < min_main_pct and ch.get("selfPctGlobal", 0) < 0.05:
            if not any(k in ch.get("name", "") for k in _business_kw()):
                continue
        visible.append(ch)
    for i, ch in enumerate(visible[:12]):
        _render_pruned_node(ch, lines, prefix, i == len(visible) - 1, main_abs, total_samples, depth, max_depth)


def _render_pruned_node(node, lines, prefix, is_last, main_abs, total_samples, depth, max_depth):
    if depth > max_depth or not node:
        return
    branch = "└─ " if is_last else "├─ "
    extra = ""
    pl = node.get("phaseLabel") or ""
    if pl and "ScriptRunBehaviourUpdate" in pl:
        extra = "业务主入口"
    elif pl and "ScriptRunBehaviourLateUpdate" in pl:
        extra = "MeshUI + 视野"
    lines.append(_pruned_line(node, prefix, branch, extra))

    child_prefix = prefix + ("│  " if not is_last and depth > 0 else "   ")
    if "LuaMgr_OnUpdate" in node.get("name", "") and depth <= 5:
        lines.append("%s└─ ⚠️ Lua 内部管理器名 simpleperf 不可见" % child_prefix)
        lines.append("%s   需 Unity Profiler 看 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等" % child_prefix)

    pl = node.get("phaseLabel") or ""
    if "ScriptRunBehaviourUpdate" in pl or "ScriptRunBehaviourLateUpdate" in pl:
        lines.append("%s│  └─ MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke" % prefix)
        anchor = _deepest_subtree(node, ["FrameworkCore_OnUpdate", "FrameworkCore_OnLateUpdate"])
        if anchor:
            _render_pruned_children(anchor, lines, child_prefix, main_abs, total_samples, depth + 1, max_depth, 0.4)
        return
    if "GameLauncher_Update" in node.get("name", ""):
        anchor = _deepest_subtree(node, ["FrameworkCore_OnUpdate"])
        if anchor:
            _render_pruned_children(anchor, lines, child_prefix, main_abs, total_samples, depth + 1, max_depth, 0.4)
        return
    if "GameLauncher_LateUpdate" in node.get("name", ""):
        anchor = _deepest_subtree(node, ["FrameworkCore_OnLateUpdate"])
        if anchor:
            lines.append(_pruned_line(anchor, child_prefix, "└─ ", ""))
            _render_pruned_children(anchor, lines, child_prefix + "   ", main_abs, total_samples, depth + 2, max_depth, 0.35)
        return
    _render_pruned_children(node, lines, child_prefix, main_abs, total_samples, depth + 1, max_depth)


# PlayerLoop phase order for gold-style §5.2 (hotspot expand, others fold).
_GOLD_PHASE_ORDER = [
    "EarlyUpdate.UpdateTextureStreamingManager",
    "PreUpdate.SendMouseEvents",
    "Update.ScriptRunBehaviourUpdate",
    "PreLateUpdate.LegacyAnimationUpdate",
    "PreLateUpdate.ParticleSystemBeginUpdateAll",
    "PreLateUpdate.ScriptRunBehaviourLateUpdate",
    "PostLateUpdate.FinishFrameRendering",
    "PostLateUpdate.PlayerEmitCanvasGeometry",
    "PostLateUpdate.PlayerUpdateCanvases",
    "PostLateUpdate.UpdateAllRenderers",
    "PostLateUpdate.ParticleSystemEndUpdateAll",
    "PostLateUpdate.PlayerSendFrameComplete",
]

_HOT_MODULE_IDS = frozenset()  # legacy fallback; real value comes from project pack via _hot_module_ids()


def _bm_map(diff):
    return {m.get("id"): m for m in (diff or {}).get("businessModules", [])}


# Semantic slot matchers: auto-discovered module ids vary by data (e.g.
# "auto_main_thread_BattleUIManager_UpdateMUIPos_xxx") so we can't index by
# fixed strings like "meshui" anymore. Each slot describes a set of module
# patterns; _bm_children unions all matching modules' children.
# Active rules come from project pack slot-matchers.yaml via _slot_matchers_dict().


def _slot_match(module, matchers):
    for kind, key in matchers:
        if kind == "id" and module.get("id") == key:
            return True
        if kind == "rootSymbol" and key in (module.get("rootSymbol") or ""):
            return True
        if kind == "displayContains" and key in (module.get("display") or ""):
            return True
    return False


def _modules_for_slot(diff, slot):
    matchers = _slot_matchers_dict().get(slot)
    if not matchers:
        m = _bm_map(diff).get(slot)
        return [m] if m else []
    return [m for m in (diff or {}).get("businessModules", []) if _slot_match(m, matchers)]


def _bm_children(diff, module_id):
    """Merged children across all modules matching the semantic slot.

    Falls back to the legacy direct-id lookup when the slot has no entry.
    De-duplicates by function name; keeps the row with the larger curAbs.
    """
    matched = _modules_for_slot(diff, module_id)
    if not matched:
        return []
    merged = {}
    for m in matched:
        for ch in m.get("children") or []:
            fn = ch.get("function", "")
            if fn not in merged or ch.get("curAbs", 0) > merged[fn].get("curAbs", 0):
                merged[fn] = ch
    return sorted(merged.values(), key=lambda x: -x.get("curAbs", 0))


def _find_mt_node(root, keyword, depth=0):
    if not root or depth > 40:
        return None
    nm = root.get("name", "")
    if keyword in nm or keyword in (root.get("phaseLabel") or ""):
        return root
    for ch in root.get("children", []):
        hit = _find_mt_node(ch, keyword, depth + 1)
        if hit:
            return hit
    return None


def _gold_delta_note(node):
    d = _delta_pct_str(node or {})
    return (", base→cur " + d) if d else ""


def _gold_markers(node, self_abs=0, is_hotspot=False):
    d = (node or {}).get("absDelta", 0)
    sp = (node or {}).get("selfPctGlobal", 0)
    sa = self_abs or (node or {}).get("absSelf", 0)
    parts = []
    if d >= 100 or is_hotspot:
        parts.append("📈")
    if sp >= 0.05 and sa >= 50:
        parts.append("🔴")
    elif sp >= 0.05 or ((node or {}).get("mainThreadPct", 0) >= 3 and sp < 0.05):
        parts.append("🟡")
    else:
        parts.append("🟢")
    return "".join(dict.fromkeys(parts))


def _gold_line(prefix, branch, label, abs_t, pct, markers="", wrapper="", self_note="", ann="", extra=""):
    w = (" [%s]" % wrapper.strip("[] ")) if wrapper else ""
    sn = (" " + self_note) if self_note else ""
    mk = (" " + markers) if markers else ""
    an = ("  " + ann) if ann else ""
    ex = (" " + extra) if extra else ""
    return "%s%s%s (%s / %.2f%%)%s%s%s%s%s" % (
        prefix, branch, label, f"{int(abs_t):,}", pct, w, sn, mk, ex, an,
    )


def _ct_metrics(um_root, keyword, main_ms, main_abs, total_samples):
    node = find_deepest_subtree(um_root, keyword) if um_root else None
    if not node:
        return None
    return {
        "node": node,
        "abs": _node_main_abs(node, main_ms, main_abs, total_samples),
        "pct": _main_pct(node, main_ms),
        "self": _self_abs(node, total_samples),
    }


def _count_recursive_depth(node, name_substr, depth=0):
    if not node or depth > 20:
        return 0
    nm = node.get("name", "")
    if name_substr in nm:
        child_depths = [_count_recursive_depth(c, name_substr, depth + 1) for c in node.get("children", [])]
        return 1 + (max(child_depths) if child_depths else 0)
    best = 0
    for c in node.get("children", []):
        best = max(best, _count_recursive_depth(c, name_substr, 0))
    return best


def _sum_bm_self(children, keyword):
    return sum(c.get("curAbs", 0) for c in children if keyword in c.get("function", ""))


def _sum_recursive_self(root, name_substr, main_ms, main_abs, total_samples, depth=0):
    """Sum self event_count of every descendant node whose name contains name_substr.

    Used for cases where Set3DPosition recurses 7-8 levels and the gold
    standard reports the *cumulative* self across the recursion chain."""
    if not root or depth > 30:
        return 0
    total = 0
    nm = root.get("name", "")
    if name_substr in nm:
        total += _self_abs(root, total_samples)
    for c in root.get("children", []):
        total += _sum_recursive_self(c, name_substr, main_ms, main_abs, total_samples, depth + 1)
    return total


def collect_main_wait_paths(call_trees, total_samples, top_k=6):
    """Find main-thread WaitForJobGroupID / JobHandle.Complete paths and
    return [(pct_main, "A → B → WaitForJobGroupID"), ...] sorted desc.

    Path consolidation rule: pick the deepest 3-frame business chain ending
    at the wait node; group identical chains and keep the largest."""
    um = find_call_tree(call_trees, "UnityMain")
    if not um:
        return []
    main_ms = um.get("totalMs", 0) or 1
    keywords = ("WaitForJobGroupID", "JobHandle_Complete", "JobHandle::Complete",
                "ScheduleBatchedJobsAndComplete", "CombineDependenciesInternalPtr")

    paths = {}

    def walk(node, ancestors):
        nm = node.get("name", "")
        if any(k in nm for k in keywords):
            chain = ancestors[-3:] + [node]
            label_parts = []
            for n in chain:
                fn = friendly_name(n.get("name", ""))
                # Strip wrapper-y noise.
                if any(s in fn for s in ("MonoBehaviour.CallUpdate", "Runtime.Invoke",
                                          "ScriptingInvocation", "RuntimeInvoker_",
                                          "UpdateFunction.Invoke", "ComponentSystemBase",
                                          "ComponentSystem.Update", "BehaviourUpdate",
                                          "il2cpp Runtime")):
                    continue
                label_parts.append(fn)
            if not label_parts:
                label_parts = [friendly_name(node.get("name", ""))]
            label = " → ".join(label_parts[-3:])
            pct = _main_pct(node, main_ms)
            if label not in paths or pct > paths[label]:
                paths[label] = pct
        for c in node.get("children", []):
            walk(c, ancestors + [node])

    walk(um, [])
    out = sorted(paths.items(), key=lambda kv: -kv[1])
    return [(p, k) for k, p in out if p >= 0.05][:top_k]


def _sum_meshui_enumerator_self(diff, total_samples):
    total = _sum_bm_self(_bm_children(diff, "meshui"), "Enumerator_MoveNext")
    if total:
        return total
    for cu in (diff or {}).get("callUpTracing", []):
        if cu.get("runtime") != "GC_end_stubborn_change":
            continue
        for tc in cu.get("topCallers", []):
            chain = tc.get("callerChain", "")
            if "MUILayout_Set3DPosition" in chain and "Enumerator_MoveNext" in chain:
                total += int(round(tc.get("globalPct", 0) / 100.0 * total_samples))
    return total


def _render_folded_phase(lines, prefix, branch, phase_node, extra="", um_root=None, main_ms=0, main_abs=0, total_samples=0):
    pl = phase_node.get("phaseLabel") or friendly_name(phase_node.get("name", ""))
    mk = _gold_markers(phase_node)
    lines.append(_gold_line(
        prefix, branch, pl,
        phase_node.get("absSamples", 0), phase_node.get("mainThreadPct", 0),
        mk, extra=extra + _gold_delta_note(phase_node),
    ))
    # Drill one level into common engine-managed phases so §5.2 isn't a
    # one-line summary for non-business phases either. Only inspect the
    # callTree (um_root) — phase_node itself is from the pruned mainThreadTree
    # and may not carry deep children.
    if not um_root or not main_ms or not main_abs:
        return
    inner_pfx = prefix + "│   "
    drilldown_specs = {
        "PreLateUpdate.LegacyAnimationUpdate": [
            ("AnimationManager::Update", "AnimationManager.Update", [
                ("Animation::UpdateAnimation", "Animation.UpdateAnimation", []),
            ]),
        ],
        "PreLateUpdate.ParticleSystemBeginUpdateAll": [
            ("ParticleSystem::BeginUpdate", "ParticleSystem.BeginUpdate", [
                ("ParticleSystem::Update1a", "ParticleSystem.Update1a", []),
                ("CalculateWorldMatrixAndBoundsJob", "ParticleSystemRenderer.CalculateWorldMatrixAndBoundsJob", []),
            ]),
        ],
        "PostLateUpdate.PlayerUpdateCanvases": [
            ("UI::Canvas::UpdateBatches", "UI.Canvas.UpdateBatches", []),
        ],
        "PostLateUpdate.PlayerEmitCanvasGeometry": [
            ("UI::Canvas::EmitWorldGeometry", "UI.Canvas.EmitWorldGeometry", []),
        ],
        "EarlyUpdate.UpdateTextureStreamingManager": [
            ("TextureStreamingManager::Update", "TextureStreamingManager.Update", []),
        ],
        "PostLateUpdate.PlayerSendFrameComplete": [
            ("PlayerEndOfFrame", "PlayerEndOfFrame", [
                ("LoaderManagerTickLoadOnFrameEnd", "LoaderManagerTickLoadOnFrameEnd", []),
            ]),
        ],
        "PostLateUpdate.FinishFrameRendering": [
            ("RenderPipelineManager_DoRenderLoop", "RenderPipelineManager.DoRenderLoop_Internal", []),
        ],
    }
    specs = drilldown_specs.get(pl, [])
    if not specs:
        return

    def render_chain(parent, items, pfx_local, last_set):
        for j, item in enumerate(items):
            kw, label, subs = item
            node = find_deepest_subtree(parent, kw)
            if not node:
                continue
            is_last = (j == len(items) - 1) and last_set
            br = "└─ " if is_last else "├─ "
            abs_t = _node_main_abs(node, main_ms, main_abs, total_samples)
            pct = _main_pct(node, main_ms)
            self_p = node.get("selfPct", 0)
            self_note = " (self %.2f%% global)" % self_p if self_p >= 0.05 else ""
            lines.append("%s%s%s (%s / %.2f%%)%s" % (
                pfx_local, br, label, f"{abs_t:,}", pct, self_note,
            ))
            child_pfx = pfx_local + ("    " if is_last else "│   ")
            if subs:
                render_chain(node, subs, child_pfx, last_set=True)

    # Anchor drilldown at the phase's matching node in um_root.
    phase_kw = pl.split(".")[-1] if "." in pl else pl
    anchor = find_deepest_subtree(um_root, phase_kw)
    if not anchor:
        anchor = um_root
    render_chain(anchor, specs, inner_pfx, last_set=True)


def _render_lua_warning(lines, prefix):
    lines.append("%s│   └─ ⚠️ Lua 内部管理器名 simpleperf 不可见" % prefix)
    lines.append("%s│       需 Unity Profiler 看 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等" % prefix)


def _render_update_hotspot_block(lines, prefix, mt_root, um_root, main_ms, main_abs, total_samples, diff):
    """§5.2 update-phase hotspot block.

    NOTE: This template currently embeds aoeyz-specific business manager
    names (FrameworkCore / MapManager / BattleUIManager / OutSideViewArmy*
    / TServerManager / MUI*). It only kicks in when those symbols exist in
    the callTree, so other projects fall back gracefully to the parent
    chain renderer. Plan: future hotspot-tree YAML DSL would let each
    project pack express its own "PlayerLoop hotspot" template — see
    docs/refactor-progress.md.
    """
    mesh_kids = _bm_children(diff, "meshui")
    army_kids = _bm_children(diff, "army_line")

    fc = _find_mt_node(mt_root, "FrameworkCore_OnUpdate")
    if fc:
        lines.append(_gold_line(
            prefix, "└─ ", "Core.Update → FrameworkCore_OnUpdate",
            fc.get("absSamples", 0), fc.get("mainThreadPct", 0),
            _gold_markers(fc), "wrapper, self %.2f%% global" % fc.get("selfPctGlobal", 0),
        ))
        inner = prefix + "    "
        lines.append(inner + "│")

        lua = _find_mt_node(fc, "LuaMgr_OnUpdate") or _find_mt_node(fc, "BaseLuaMgr_OnUpdate")
        if lua:
            lines.append(_gold_line(
                inner, "├─ ", "LuaMgr_OnUpdate → BaseLuaMgr_OnUpdate",
                lua.get("absSamples", 0), lua.get("mainThreadPct", 0),
                _gold_markers(lua), "wrapper" + _gold_delta_note(lua),
            ))
            _render_lua_warning(lines, inner)

        mm = _find_mt_node(fc, "MapManager_OnUpdate")
        if mm:
            lines.append(_gold_line(
                inner, "├─ ", "MapManager_OnUpdate",
                mm.get("absSamples", 0), mm.get("mainThreadPct", 0),
                _gold_markers(mm), "wrapper, self %.2f%% global" % mm.get("selfPctGlobal", 0),
            ))
            mm_p = inner + "│   "

            bu = _find_mt_node(mm, "BattleUIManager_OnUpdate")
            if bu:
                lines.append(_gold_line(
                    mm_p, "├─ ", "BattleUIManager_OnUpdate",
                    bu.get("absSamples", 0), bu.get("mainThreadPct", 0),
                    _gold_markers(bu), "wrapper, self %.2f%% global" % bu.get("selfPctGlobal", 0)
                    + _gold_delta_note(bu),
                ))
                bu_p = mm_p + "│   "
                mpos = _ct_metrics(um_root, "BattleUIManager_UpdateMUIPos", main_ms, main_abs, total_samples)
                if mpos:
                    lines.append(_gold_line(
                        bu_p, "└─ ", "BattleUIManager.UpdateMUIPos",
                        mpos["abs"], mpos["pct"], "🟡", "wrapper",
                    ))
                    depth = _count_recursive_depth(mpos["node"], "MUILayout_Set3DPosition")
                    # Sum recursive Set3DPosition self across the recursion chain (gold standard
                    # totals the *self* event_count at every recursive level, not just the
                    # immediate one stored in module children).
                    set3d_self = _sum_recursive_self(
                        mpos["node"], "MUILayout_Set3DPosition", main_ms, main_abs, total_samples,
                    )
                    if not set3d_self:
                        set3d_self = _sum_bm_self(mesh_kids, "MUILayout_Set3DPosition")
                    lines.append(bu_p + "    └─ MUILayout.Set3DPosition × %d 层递归                            see §4.4" % max(depth, 1))
                    sp = mm_p + "│       "
                    if set3d_self:
                        lines.append(sp + "├─ MUILayout.Set3DPosition 自身代码累加 (%s self)        📈🔴" % set3d_self)
                    mui_self = _sum_bm_self(mesh_kids, "MUIControlManager_OnLateUpdate")
                    if mui_self:
                        lines.append(sp + "├─ MUIControlManager.OnLateUpdate 同支路 (%s self)       📈🔴" % mui_self)
                    enum_self = _sum_meshui_enumerator_self(diff, total_samples)
                    if not enum_self:
                        # Fallback: sum Enumerator_MoveNext self under MUI subtree.
                        enum_self = _sum_recursive_self(
                            mpos["node"], "Enumerator_MoveNext", main_ms, main_abs, total_samples,
                        )
                    if enum_self:
                        lines.append(sp + "├─ Enumerator.MoveNext × 多处 (~%s self 累加)            📈🔴" % enum_self)
                    fresh_self = _sum_bm_self(mesh_kids, "FreshVertexAttribute")
                    fresh_node = find_deepest_subtree(mpos["node"], "FreshVertexAttribute")
                    if fresh_node:
                        memcpy = find_deepest_subtree(fresh_node, "__memcpy")
                        memcpy_self = _self_abs(memcpy, total_samples) if memcpy else 0
                        lines.append(sp + "├─ MUIRendererBase.FreshVertexAttribute")
                        if memcpy_self:
                            lines.append(sp + "│   └─ __memcpy (%s self)                                  see §10.1" % memcpy_self)
                        elif fresh_self:
                            lines.append(sp + "│   └─ __memcpy (%s self)                                  see §10.1" % fresh_self)
                    elif fresh_self:
                        lines.append(sp + "├─ MUIRendererBase.FreshVertexAttribute")
                        lines.append(sp + "│   └─ __memcpy (%s self)                                  see §10.1" % fresh_self)
                    gc_self = 0
                    for cu in (diff or {}).get("callUpTracing", []):
                        if cu.get("runtime") == "GC_end_stubborn_change":
                            for tc in cu.get("topCallers", []):
                                if "MUILayout_Set3DPosition" in tc.get("callerChain", ""):
                                    gc_self = max(gc_self, int(round(tc.get("globalPct", 0) / 100.0 * total_samples)))
                    if gc_self:
                        lines.append(sp + "├─ GC_end_stubborn_change (%s self)                       📈   see §10.3" % gc_self)
                    text_node = find_deepest_subtree(mpos["node"], "MUIText_Set3DPosition")
                    sprite_node = find_deepest_subtree(mpos["node"], "MUISprite_Set3DPosition")
                    sprite_self_abs = (_self_abs(text_node, total_samples) if text_node else 0) \
                        + (_self_abs(sprite_node, total_samples) if sprite_node else 0)
                    if not sprite_self_abs:
                        sprite_self_abs = _sum_bm_self(mesh_kids, "MUIText_Set3DPosition") + _sum_bm_self(mesh_kids, "MUISprite")
                    if sprite_self_abs:
                        lines.append(sp + "├─ MUIText / MUISprite.Set3DPosition (~%s self)" % sprite_self_abs)
                    lines.append(sp + "└─ ...")

            army = _find_mt_node(mm, "OutSideViewArmyLineMgr_OnUpdate")
            if army:
                lines.append(_gold_line(
                    mm_p, "├─ ", "OutSideViewArmyLineMgr_OnUpdate",
                    army.get("absSamples", 0), army.get("mainThreadPct", 0),
                    _gold_markers(army, is_hotspot=True), "wrapper" + _gold_delta_note(army),
                ))
                ap = mm_p + "│   "
                usl = _ct_metrics(um_root, "UpdateStraightMoveLine", main_ms, main_abs, total_samples)
                if usl:
                    lines.append(_gold_line(
                        ap, "├─ ", "UpdateStraightMoveLine",
                        usl["abs"], usl["pct"], "📈", ann="see §4.5",
                    ))
                    usl_p = ap + "│   "
                    ref_self = _sum_bm_self(army_kids, "OutsideLineCtrl_RefreshLine")
                    if not ref_self:
                        rfn = find_deepest_subtree(usl["node"], "OutsideLineCtrl_RefreshLine")
                        ref_self = _self_abs(rfn, total_samples) if rfn else 0
                    if ref_self:
                        lines.append(usl_p + "├─ OutsideLineCtrl.RefreshLine (%s self)                      📈🔴" % ref_self)
                    # CalculateVertexJob.Schedule subtree (Job dispatched to worker — main thread cost is the schedule call only).
                    job_node = find_deepest_subtree(usl["node"], "CalculateVertexJob")
                    if job_node:
                        job_total = _node_main_abs(job_node, main_ms, main_abs, total_samples)
                        lines.append(usl_p + "├─ CalculateVertexJob.Schedule (%s, Job 调度) 🟢                实际下沉 Worker" % job_total)
                    else:
                        job_self = _sum_bm_self(army_kids, "CalculateVertexJob")
                        if job_self:
                            lines.append(usl_p + "├─ CalculateVertexJob.Schedule (%s, Job 调度) 🟢                实际下沉 Worker" % job_self)
                    list_node = find_deepest_subtree(usl["node"], "ToNativeList")
                    if list_node:
                        list_total = _node_main_abs(list_node, main_ms, main_abs, total_samples)
                        if list_total:
                            lines.append(usl_p + "├─ ListExtensions.ToNativeList (%s, 分配开销)" % list_total)
                    mesh_v_self = _sum_bm_self(army_kids, "OutsideLineMesh_RefreshLineVertex")
                    if not mesh_v_self:
                        mvn = find_deepest_subtree(usl["node"], "RefreshLineVertex")
                        mesh_v_self = _node_main_abs(mvn, main_ms, main_abs, total_samples) if mvn else 0
                    if mesh_v_self:
                        lines.append(usl_p + "└─ OutsideLineMesh.RefreshLineVertex (%s)" % mesh_v_self)
                ref_line = _ct_metrics(um_root, "RefreshArmyLine", main_ms, main_abs, total_samples)
                gid_self = _sum_bm_self(army_kids, "GetArmyLineID")
                if ref_line or gid_self:
                    ref_abs = ref_line["abs"] if ref_line else gid_self
                    ref_pct = ref_line["pct"] if ref_line else 0
                    lines.append(_gold_line(ap, "├─ ", "RefreshArmyLine", ref_abs, ref_pct, "🟡", "wrapper"))
                    if gid_self:
                        lines.append(ap + "│   └─ GetArmyLineID (%s, self %s)                                📈🔴 Dictionary 查找" % (
                            gid_self, gid_self,
                        ))
                ent = _ct_metrics(um_root, "MapEntityManager_GetEntity", main_ms, main_abs, total_samples)
                if ent:
                    lines.append(_gold_line(ap, "├─ ", "MapEntityManager.GetEntity", ent["abs"], ent["pct"], "🟢"))
                exists = _ct_metrics(um_root, "EntityComponentStore_Exists", main_ms, main_abs, total_samples)
                if exists:
                    mk = "🟡" if exists["self"] >= 40 else "🟢"
                    lines.append(_gold_line(
                        ap, "└─ ", "EntityComponentStore.Exists", exists["abs"], exists["pct"],
                        mk, self_note="(self %s)" % exists["self"] if exists["self"] else "",
                    ))

        tserver = _find_mt_node(fc, "TServerManager_OnUpdate")
        if tserver:
            lines.append(_gold_line(
                inner, "└─ ", "TServerManager_OnUpdate",
                tserver.get("absSamples", 0), tserver.get("mainThreadPct", 0), "🟢",
            ))


def _render_lateupdate_hotspot_block(lines, prefix, mt_root, um_root, main_ms, main_abs, total_samples, diff):
    """§5.2 late-update hotspot block — aoeyz-shaped template, see
    _render_update_hotspot_block docstring for migration notes."""
    mesh_kids = _bm_children(diff, "meshui")
    fc = _find_mt_node(mt_root, "FrameworkCore_OnLateUpdate")
    if not fc:
        return
    lines.append(_gold_line(prefix, "└─ ", "Core.LateUpdate", fc.get("absSamples", 0), fc.get("mainThreadPct", 0), "🟡"))
    inner = prefix + "    "
    lines.append(inner + "├─ LuaMgr.OnLateUpdate (含 MapCameraCtrl, 视野/无极缩放)")
    _render_lua_warning(lines, inner)
    mm_late = _find_mt_node(fc, "MapManager_OnLateUpdate")
    if mm_late:
        lines.append(_gold_line(
            inner, "├─ ", "MapManager.OnLateUpdate",
            mm_late.get("absSamples", 0), mm_late.get("mainThreadPct", 0), "🟢",
        ))
    mesh = _find_mt_node(fc, "MeshUIManager_OnLateUpdate")
    if mesh:
        mui_self = _sum_bm_self(mesh_kids, "MUIControlManager_OnLateUpdate")
        lines.append(_gold_line(
            inner, "└─ ", "MeshUIManager.OnLateUpdate",
            mesh.get("absSamples", 0), mesh.get("mainThreadPct", 0), _gold_markers(mesh),
        ))
        lines.append(inner + "    └─ MUIControlManager.OnLateUpdate (%s self)                              📈🔴 see §4.4" % (
            mui_self or mesh.get("absSelf", 0),
        ))
        lines.append(inner + "        └─ ...（更深层位置计算细节见 §4.4）")


def render_main_thread_gold_style(call_trees, main_tree, total_samples, diff=None, top_n=None):
    """Gold §5.2: fold healthy phases, force-expand Top-N hotspot subtrees from real data."""
    um_root = find_call_tree(call_trees, "UnityMain")
    mt_root = (main_tree or {}).get("root")
    if not um_root or not mt_root:
        return render_main_thread_narrative(call_trees, total_samples)

    main_abs = (main_tree or {}).get("absSamples", 0) or _abs_samples(um_root, total_samples)
    main_g = (main_tree or {}).get("globalPct", 0) or um_root.get("totalPct", 0)
    main_ms = um_root.get("totalMs", 1)

    hot_ids = {item.get("moduleId") or item.get("id") for item in (top_n or []) if item.get("verdict") == "red"}
    hot_ids |= _hot_module_ids()

    phases = []
    _collect_phase_nodes(mt_root, phases)
    phase_by_label = {}
    for ph in phases:
        pl = ph.get("phaseLabel") or ""
        if pl:
            phase_by_label[pl] = ph

    lines = ["UnityMain (%s / 100%% / cur 全局 %.2f%%)" % (f"{main_abs:,}", main_g)]
    epl = _find_mt_node(mt_root, "ExecutePlayerLoop") or mt_root
    lines.append("├─ ExecutePlayerLoop (%s / %.2f%%)" % (
        f"{epl.get('absSamples', main_abs):,}", epl.get("mainThreadPct", 100),
    ))
    lines.append("│  │")

    ordered = [phase_by_label[lbl] for lbl in _GOLD_PHASE_ORDER if lbl in phase_by_label]
    seen = {id(p) for p in ordered}
    ordered.extend([p for p in phases if id(p) not in seen])

    hotspot_phases = {"Update.ScriptRunBehaviourUpdate", "PreLateUpdate.ScriptRunBehaviourLateUpdate"}
    for idx, ph in enumerate(ordered):
        pl = ph.get("phaseLabel") or ""
        is_last = idx == len(ordered) - 1
        branch = "└─ " if is_last else "├─ "
        pfx = "│  "

        if pl == "Update.ScriptRunBehaviourUpdate":
            extra = "业务主入口" + _gold_delta_note(ph)
            lines.append(_gold_line(
                pfx, branch, pl, ph.get("absSamples", 0), ph.get("mainThreadPct", 0),
                _gold_markers(ph), extra=extra,
            ))
            lines.append(pfx + "│   └─ MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke")
            _render_update_hotspot_block(lines, pfx + "│       ", mt_root, um_root, main_ms, main_abs, total_samples, diff)
        elif pl == "PreLateUpdate.ScriptRunBehaviourLateUpdate":
            lines.append(_gold_line(
                pfx, branch, pl, ph.get("absSamples", 0), ph.get("mainThreadPct", 0),
                _gold_markers(ph), extra=_gold_delta_note(ph),
            ))
            _render_lateupdate_hotspot_block(lines, pfx + "│   ", mt_root, um_root, main_ms, main_abs, total_samples, diff)
        elif pl in hotspot_phases:
            pass
        else:
            extra = ""
            if "ParticleSystem" in pl and ph.get("absDelta", 0) >= 100:
                extra = "self 见子节点"
            _render_folded_phase(lines, pfx, branch, ph, extra,
                                  um_root=um_root, main_ms=main_ms,
                                  main_abs=main_abs, total_samples=total_samples)

    rc = find_deepest_subtree(um_root, "RenderManager::RenderCameras")
    if rc:
        rc_abs = _node_main_abs(rc, main_ms, main_abs, total_samples)
        rc_pct = _main_pct(rc, main_ms)
        lines.append("└─ RenderManager::RenderCameras (%s / %.2f%%)                                        [详见 §6.1]" % (
            f"{rc_abs:,}", rc_pct,
        ))
        lines.append("    └─ UniversalRenderPipeline.Render → RenderCameraStack → RenderSingleCamera")
    return lines


def render_main_thread_from_pruned_tree(main_tree, call_trees, total_samples, enriched=False):
    root = main_tree.get("root")
    if not root:
        return ["(主线程树未生成)"]
    main_abs = main_tree.get("absSamples", 0)
    main_g = main_tree.get("globalPct", 0)
    max_depth = 12 if enriched else 8
    phase_limit = 18 if enriched else 14
    lines = ["UnityMain (%s / 100%% / cur 全局 %.2f%%)" % (f"{main_abs:,}", main_g)]

    epl_abs = root.get("absSamples", main_abs)
    epl_pct = root.get("mainThreadPct", 100)
    lines.append("├─ ExecutePlayerLoop (%s / %.2f%%)" % (f"{epl_abs:,}", epl_pct))

    phases = []
    _collect_phase_nodes(root, phases)
    phases.sort(key=lambda x: -x.get("absSamples", 0))
    for i, ph in enumerate(phases[:phase_limit]):
        sub = []
        _render_pruned_node(ph, sub, "│  ", i == min(len(phases), phase_limit) - 1, main_abs, total_samples, 1, max_depth)
        lines.extend(sub)

    um_root = find_call_tree(call_trees, "UnityMain")
    rc = find_deepest_subtree(um_root, "RenderManager::RenderCameras") if um_root else None
    if rc and um_root:
        main_ms = um_root.get("totalMs", 1)
        abs_rc = _node_main_abs(rc, main_ms, main_abs, total_samples)
        pct_rc = _main_pct(rc, main_ms)
        lines.append("└─ RenderManager::RenderCameras (%s / %.2f%%)  [详见 §6.1]" % (
            f"{abs_rc:,}", pct_rc,
        ))
        lines.append("   └─ UniversalRenderPipeline.Render → RenderCameraStack → RenderSingleCamera")
    return lines


def _annotation(name):
    for keys, note in _annotations_pairs():
        if any(k in name for k in keys):
            return note
    return ""


def _is_interesting(name, total_pct, self_pct):
    if any(k in name for k in _business_kw()):
        return True
    if total_pct >= 0.35:
        return True
    if self_pct >= 0.05:
        return True
    return False


def find_call_tree(call_trees, thread_substr):
    for t in call_trees or []:
        if thread_substr in t.get("thread", ""):
            return t.get("root")
    return None


def find_subtree(root, keyword, depth=0, max_depth=80):
    if not root or depth > max_depth:
        return None
    if keyword in root.get("name", ""):
        return root
    for ch in root.get("children", []):
        hit = find_subtree(ch, keyword, depth + 1, max_depth)
        if hit:
            return hit
    return None


def find_deepest_subtree(root, keyword):
    best = None
    nodes = []
    _walk_all_nodes(root, nodes)
    for n in nodes:
        if keyword in n.get("name", ""):
            if not best or n.get("totalMs", 0) > best.get("totalMs", 0):
                best = n
    return best


def _node_main_abs(node, thread_root_ms, main_abs_samples, total_samples=0):
    if thread_root_ms and node.get("totalMs"):
        return int(round(node["totalMs"] / thread_root_ms * main_abs_samples))
    return _abs_samples(node, total_samples)


def _fmt_tree_line(name, abs_t, pct, prefix, branch, self_g=0, markers="", ann=""):
    wrapper = ""
    self_note = ""
    if self_g >= 0.05:
        self_note = " (self %.2f%% global)" % self_g
    ann_s = ("  " + ann) if ann else ""
    mk = (" " + markers) if markers else ""
    return "%s%s%s (%s / %.2f%%)%s%s%s" % (
        prefix, branch, name, f"{abs_t:,}", pct, self_note, mk, ann_s,
    )


def _urp_markers(node, total_samples):
    sp = node.get("selfPct", 0)
    if sp >= 0.05:
        return "🔴"
    if node.get("totalPct", 0) >= 1.0 or sp >= 0.03:
        return "🟡"
    return "🟢"


def render_urp_gold_tree(rc, um_root, main_abs, total_samples):
    """Gold-style URP drill-down (named passes, skip il2cpp wrappers)."""
    if not rc:
        return ["(RenderCameras 子树未找到)"]
    main_ms = um_root.get("totalMs", 1) if um_root else rc.get("totalMs", 1)
    lines = []
    abs_rc = _node_main_abs(rc, main_ms, main_abs, total_samples)
    pct_rc = _main_pct(rc, main_ms)
    lines.append("RenderManager::RenderCameras (%s / %.2f%% 主线程)" % (f"{abs_rc:,}", pct_rc))

    def fmt(node, label, prefix, branch, mark_override=None):
        return _fmt_tree_line(
            label, _node_main_abs(node, main_ms, main_abs, total_samples),
            _main_pct(node, main_ms),
            prefix, branch, node.get("selfPct", 0),
            mark_override or _urp_markers(node, total_samples),
        )

    urp = find_deepest_subtree(rc, "UniversalRenderPipeline_Render_m")
    stack = find_deepest_subtree(rc, "UniversalRenderPipeline_RenderCameraStack")
    single = find_deepest_subtree(rc, "UniversalRenderPipeline_RenderSingleCamera")
    if urp:
        lines.append(fmt(urp, "UniversalRenderPipeline.Render", "", "└─ "))
    if stack:
        lines.append(fmt(stack, "RenderCameraStack", "   ", "└─ "))
    if single:
        lines.append(fmt(single, "RenderSingleCamera", "      ", "└─ "))

    # ScriptableRenderer.Execute → ExecuteRenderPass tree
    exec_pass = find_deepest_subtree(single or rc, "ScriptableRenderer_ExecuteRenderPass")
    if exec_pass:
        pfx = "         "
        lines.append(fmt(exec_pass, "ScriptableRenderer.Execute → ExecuteRenderPass", pfx, "├─ "))
        pfx2 = pfx + "│  "
        pass_specs = [
            ("DrawRendererPass_Execute", "DrawRendererPass", [
                ("DrawFoliageInstanceRenderers", "DrawFoliageInstanceRenderers", [
                    ("OutsideForestRenderer_DrawInternal", "OutsideForestRenderer.DrawInternal", [
                        ("OutsideTreeTypeRenderer_DrawForestCell", "OutsideTreeTypeRenderer.DrawForestCell", []),
                    ]),
                ]),
                ("RenderMeshSystemV2_DrawRenderers", "RenderMeshSystemV2.DrawRenderers", []),
            ]),
            ("ShadowPass_ProcessShadow", "ShadowPass.ProcessShadow", [
                ("PlanarShadow_RenderShadow", "PlanarShadow.RenderShadow", []),
                ("PlanarShadow_BeginProcessShadow", "PlanarShadow.BeginProcessShadow", [
                    ("CalculateTerrainHeight", "CalculateTerrainHeight", []),
                ]),
            ]),
            ("BloomPass_Execute", "BloomPass.Execute", [
                ("ScriptableRenderContext::Submit", "ScriptableRenderContext.Submit", [
                    ("TranscriptScriptableRenderContext::CopyFrom", "TranscriptScriptableRenderContext.CopyFrom", []),
                ]),
            ]),
        ]

        def render_pass_chain(parent, specs, pfx_local, last_set):
            for j, item in enumerate(specs):
                kw, label, subs = item
                node = find_deepest_subtree(parent, kw)
                if not node:
                    continue
                is_last = (j == len(specs) - 1) and last_set
                br = "└─ " if is_last else "├─ "
                lines.append(fmt(node, label, pfx_local, br))
                child_pfx = pfx_local + ("   " if is_last else "│  ")
                if subs:
                    render_pass_chain(node, subs, child_pfx, last_set=True)

        render_pass_chain(exec_pass, pass_specs, pfx2, last_set=False)

    # MobileBaseRenderer.Setup → SetupRenderPassFromFeatures → TBUBaseFeature.AddRenderPasses
    setup = find_deepest_subtree(single or rc, "MobileBaseRenderer_Setup")
    if setup:
        lines.append(fmt(setup, "MobileBaseRenderer.Setup", "         ", "└─ "))
        sfeat = find_deepest_subtree(setup, "SetupRenderPassFromFeatures")
        if sfeat:
            lines.append(fmt(sfeat, "SetupRenderPassFromFeatures", "            ", "└─ "))
            tbu = find_deepest_subtree(sfeat, "TBUBaseFeature_AddRenderPasses")
            if tbu:
                lines.append(fmt(tbu, "TBUBaseFeature.AddRenderPasses", "               ", "└─ "))
    return lines


def render_rhi_gold_tree(rhi_root, rhi_abs, rhi_pct_global, total_samples):
    if not rhi_root:
        return ["(RHI 子树未找到)"]
    run = find_deepest_subtree(rhi_root, "GfxDeviceWorker::RunCommand") or rhi_root
    rhi_ms = run.get("totalMs", 1)
    lines = ["Thread-102 / RHI (%s / %.2f%% global)" % (f"{rhi_abs:,}", rhi_pct_global)]
    lines.append("└─ GfxDeviceWorker.RunCommand (%s / %.2f%% RHI)" % (
        f"{_node_main_abs(run, rhi_ms, rhi_abs, total_samples):,}",
        99.0 if run.get("totalMs") else 0,
    ))

    def rhi_line(node, prefix, branch, label=None):
        if not node:
            return
        nm = label or friendly_name(node.get("name", ""))
        pct_rhi = node.get("totalMs", 0) / rhi_ms * 100.0
        lines.append(_fmt_tree_line(
            nm, _node_main_abs(node, rhi_ms, rhi_abs, total_samples), pct_rhi,
            prefix, branch, node.get("selfPct", 0), _urp_markers(node, total_samples),
            _annotation(node.get("name", "")),
        ))

    draw = find_deepest_subtree(run, "GfxDeviceGLES::DrawBuffers")
    if draw:
        rhi_line(draw, "   ", "├─ ", "DrawBuffers")
        stereo = find_deepest_subtree(draw, "DrawBuffersStereo")
        if stereo:
            rhi_line(stereo, "   │  ", "├─ ", "DrawBuffersStereo")
            ranges = find_deepest_subtree(stereo, "DrawBufferRanges")
            if ranges:
                lines.append("   │  │  └─ DrawBufferRanges → Adreno driver internal (黑盒)")
        before = find_deepest_subtree(draw, "BeforeDrawCall")
        if before:
            rhi_line(before, "   │  ", "├─ ", "BeforeDrawCall")
            cb = find_deepest_subtree(before, "ConstantBuffersGLES::UpdateBuffers")
            if cb:
                rhi_line(cb, "   │  │  ", "└─ ", "ConstantBuffersGLES.UpdateBuffers")
                upload = find_deepest_subtree(cb, "DataBufferGLES::Upload")
                if upload:
                    rhi_line(upload, "   │  │     ", "└─ ", "DataBufferGLES.Upload")
                    memcpy = find_deepest_subtree(upload, "__memcpy")
                    if memcpy:
                        rhi_line(memcpy, "   │  │        ", "└─ ", "__memcpy")
        for kw, lbl in [("SetVertexStateGLES", "SetVertexStateGLES")]:
            n = find_deepest_subtree(draw, kw)
            if n:
                rhi_line(n, "   │  ", "├─ ", lbl)
        # ApplyGpuProgramGLES is a sibling of DrawBuffers (under SetShaders sub-tree)
        # but gold standard lists it inside DrawBuffers section — match that.
        apl = find_deepest_subtree(run, "ApplyGpuProgramGLES")
        if apl:
            rhi_line(apl, "   │  ", "└─ ", "ApplyGpuProgramGLES")

    present = find_deepest_subtree(run, "GfxDeviceGLES::PresentFrame") or find_deepest_subtree(run, "PresentFrame")
    if present:
        rhi_line(present, "   ", "├─ ", "PresentFrame")
        egl = find_deepest_subtree(present, "eglSwapBuffers")
        if egl:
            rhi_line(egl, "   │  ", "└─ ", "eglSwapBuffers")

    jobq = find_deepest_subtree(run, "JobQueue::WaitForJobGroupID")
    if jobq:
        rhi_line(jobq, "   ", "├─ ", "JobQueue.WaitForJobGroupID")
        lines.append("   │  [等 GeometryJob 完成，压测下偶发]")

    shaders = find_deepest_subtree(run, "SetShadersThreadable")
    if shaders:
        rhi_line(shaders, "   ", "├─ ", "SetShadersThreadable")

    ucb = find_deepest_subtree(run, "ConstantBuffersGLES::UpdateCB")
    if ucb:
        rhi_line(ucb, "   ", "├─ ", "ConstantBuffersGLES.UpdateCB")
        memcpy_in_ucb = find_deepest_subtree(ucb, "__memcpy")
        if memcpy_in_ucb:
            rhi_line(memcpy_in_ucb, "   │  ", "└─ ", "__memcpy")

    dvbo = find_deepest_subtree(run, "DynamicVBO::DrawChunk")
    if dvbo:
        rhi_line(dvbo, "   ", "└─ ", "DynamicVBO.DrawChunk")

    return lines


def _render_abs_from_trees(call_trees_cur, call_trees_base, keyword, total_samples):
    cur_abs = 0
    base_abs = 0
    for trees, which in ((call_trees_base, "b"), (call_trees_cur, "c")):
        for t in trees or []:
            n = find_deepest_subtree(t.get("root"), keyword)
            if n:
                val = _abs_samples(n, total_samples)
                if which == "b":
                    base_abs = max(base_abs, val)
                else:
                    cur_abs = max(cur_abs, val)
    return base_abs, cur_abs


def _abs_samples(node, total_samples):
    if total_samples and node.get("totalPct"):
        return int(round(node["totalPct"] / 100.0 * total_samples))
    return int(round(node.get("totalMs", 0)))


def _self_abs(node, total_samples):
    if total_samples and node.get("selfPct"):
        return int(round(node["selfPct"] / 100.0 * total_samples))
    return int(round(node.get("selfMs", 0)))


def _main_pct(node, main_total_ms):
    if not main_total_ms:
        return 0.0
    return node.get("totalMs", 0) / main_total_ms * 100.0


def _markers(node, total_samples):
    abs_t = _abs_samples(node, total_samples)
    self_a = _self_abs(node, total_samples)
    self_g = node.get("selfPct", 0)
    m = []
    if abs_t >= 100 and node.get("absDelta", 0) >= 100:
        m.append("📈")
    elif abs_t >= 100:
        m.append("📈")
    if self_g >= 0.05 and self_a >= 50:
        m.append("🔴")
    elif self_g >= 0.05 or (node.get("totalPct", 0) >= 1.0 and self_g < 0.05):
        m.append("🟡")
    else:
        m.append("🟢")
    return "".join(dict.fromkeys(m))  # dedupe


def _render_node(node, lines, prefix, is_last, total_samples, main_total_ms, depth, max_depth, min_pct):
    if depth > max_depth or not node:
        return
    raw = node.get("name", "")
    if should_skip(raw):
        kids = sorted(node.get("children", []), key=lambda x: -x.get("totalMs", 0))
        for i, ch in enumerate(kids[:8]):
            _render_node(ch, lines, prefix, i == len(kids) - 1, total_samples, main_total_ms,
                         depth, max_depth, min_pct)
        return

    name = friendly_name(raw)
    tp = node.get("totalPct", 0)
    sp = node.get("selfPct", 0)
    if depth > 0 and not _is_interesting(raw, tp, sp) and tp < min_pct:
        return

    abs_t = _abs_samples(node, total_samples)
    mp = _main_pct(node, main_total_ms)
    branch = "└─ " if is_last else "├─ "
    if depth == 0:
        branch = ""
    elif depth == 1:
        branch = "├─ " if not is_last else "└─ "

    wrapper = ""
    if sp < 0.05 and node.get("children") and tp >= 0.3:
        wrapper = " [wrapper]"
    self_note = ""
    if sp >= 0.05:
        self_note = " (self %.2f%% global)" % sp

    ann = _annotation(raw)
    ann_s = ("  " + ann) if ann else ""
    mk = _markers(node, total_samples) if depth > 0 else ""

    if depth == 0:
        line = name
    elif main_total_ms and mp > 0:
        line = "%s%s (%s / %.2f%%)%s%s %s%s" % (
            prefix, branch, f"{abs_t:,}", mp, wrapper, self_note, mk, ann_s,
        )
    else:
        line = "%s%s (%s / %.2f%% global)%s%s %s%s" % (
            prefix, branch, f"{abs_t:,}", tp, wrapper, self_note, mk, ann_s,
        )
    lines.append(line.rstrip())

    kids = sorted(
        [c for c in node.get("children", []) if not should_skip(c.get("name", "")) or c.get("children")],
        key=lambda x: -x.get("totalMs", 0),
    )
    # Collapse il2cpp: if only child is il2cpp chain, show one line then grandchildren
    if len(kids) == 1 and should_skip(kids[0].get("name", "")):
        sub = kids[0].get("children", [])
        if sub and any("RuntimeInvoker" in c.get("name", "") or "ScriptingInvocation" in c.get("name", "")
                       for c in sub):
            if depth > 0 and "ScriptRunBehaviour" in raw or "CallUpdateMethod" in raw:
                lines.append("%s│  └─ MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke" % prefix)
            kids = sub

    child_prefix = prefix + ("│  " if not is_last and depth > 0 else "   ")
    for i, ch in enumerate(kids[:10]):
        _render_node(ch, lines, child_prefix, i == len(kids) - 1, total_samples, main_total_ms,
                     depth + 1, max_depth, min_pct)


def render_main_thread_narrative(call_trees, total_samples):
    root = find_call_tree(call_trees, "UnityMain")
    if not root:
        return ["(主线程 callTrees 未找到)"]

    main_ms = root.get("totalMs", 1)
    main_abs = _abs_samples(root, total_samples)
    main_g = root.get("totalPct", 0)
    lines = ["UnityMain (%s / 100%% / cur 全局 %.2f%%)" % (f"{main_abs:,}", main_g)]

    epl = find_subtree(root, "ExecutePlayerLoop")
    if epl:
        lines.append("├─ ExecutePlayerLoop (%s / %.2f%%)" % (
            f"{_abs_samples(epl, total_samples):,}", _main_pct(epl, main_ms),
        ))
        kids = sorted(epl.get("children", []), key=lambda x: -x.get("totalMs", 0))
        for i, ch in enumerate(kids[:14]):
            sub_lines = []
            _render_node(ch, sub_lines, "│  ", i == len(kids) - 1, total_samples, main_ms, 1, 9, 0.25)
            lines.extend(sub_lines)

    rc = find_subtree(root, "RenderManager::RenderCameras")
    if rc:
        lines.append("└─ RenderManager::RenderCameras (%s / %.2f%%)  [详见 §6.1]" % (
            f"{_abs_samples(rc, total_samples):,}", _main_pct(rc, main_ms),
        ))
        lines.append("   └─ UniversalRenderPipeline.Render → RenderCameraStack → RenderSingleCamera")
    return lines


def render_subtree_narrative(root, title, total_samples, thread_total_ms=None, max_depth=8, min_pct=0.2):
    if not root:
        return [title, "(子树未找到)"]
    lines = [title]
    _render_node(root, lines, "", True, total_samples, thread_total_ms, 0, max_depth, min_pct)
    return lines


def render_urp_section(call_trees, total_samples, urp_base_abs, urp_cur_abs, main_abs=0, base_trees=None):
    um_root = find_call_tree(call_trees, "UnityMain")
    rc = find_deepest_subtree(um_root, "RenderManager::RenderCameras") if um_root else None
    if not rc:
        return ["(RenderCameras 子树未找到)"], ""
    if not main_abs and um_root:
        main_abs = _abs_samples(um_root, total_samples)
    if um_root:
        urp_cur_abs = _node_main_abs(rc, um_root.get("totalMs", 1), main_abs, total_samples)
    if base_trees is not None:
        urp_base_abs, _ = _render_abs_from_trees(call_trees, base_trees, "RenderManager::RenderCameras", total_samples)
        if um_root:
            for t in base_trees or []:
                if "UnityMain" in t.get("thread", ""):
                    brc = find_deepest_subtree(t.get("root"), "RenderManager::RenderCameras")
                    if brc:
                        b_main = t.get("root", {}).get("totalMs", um_root.get("totalMs", 1))
                        b_main_abs = _abs_samples(t.get("root"), total_samples)
                        urp_base_abs = _node_main_abs(brc, b_main, b_main_abs, total_samples)
                        break
    tree = render_urp_gold_tree(rc, um_root, main_abs, total_samples)
    delta_pct = ((urp_cur_abs - urp_base_abs) / urp_base_abs * 100) if urp_base_abs else 0
    note = (
        "**反直觉发现**：URP 主线程渲染配置 base→cur 绝对变化约 %+.1f%%（%s → %s samples）。"
        "这只表示主线程 URP 配置代码变化，**不等于 GPU 实际渲染压力变化**（详见 §6.3）。"
        % (delta_pct, f"{urp_base_abs:,}", f"{urp_cur_abs:,}")
    )
    return tree, note


def render_rhi_section(call_trees, total_samples, diff_threads, base_trees=None):
    root = find_call_tree(call_trees, "Thread-102")
    if not root:
        root = find_call_tree(call_trees, "19471")
    rhi = next((t for t in diff_threads if t.get("identity") == "rhi_thread"), {})
    rhi_abs = rhi.get("curAbs", _abs_samples(root, total_samples) if root else 0)
    rhi_pct = rhi.get("curPct", root.get("totalPct", 0) if root else 0)
    lines = render_rhi_gold_tree(root, rhi_abs, rhi_pct, total_samples)
    bullets = [
        "**关键变化**：",
        "- 命令吞吐量（DrawBuffers）CPU 端变化见上表",
        "- 常量缓冲上传（UpdateBuffers）见 ConstantBuffersGLES 子树",
        "- GeometryJob 等待见 JobQueue::WaitForJobGroupID（若有）",
    ]
    return lines, bullets


def _walk_all_nodes(root, out, depth=0, max_depth=80):
    if not root or depth > max_depth:
        return
    out.append(root)
    for ch in root.get("children", []):
        _walk_all_nodes(ch, out, depth + 1, max_depth)


def collect_burst_jobs(call_trees, total_samples, top_k=11, hotspots=None):
    """Top Burst jobs by *global* self%.

    The simplest correct source is profile.summary.hotspots — its self %
    is already global (function self_ec / grand_total_ec, see
    perf_provider._symbol_check / single_profile._iter_functions). Falling
    back to callTree introduces thread-vs-global confusion.

    `hotspots` is a list of {"func", "lib", "pct", "self_ms"} from the
    summary. If absent (legacy callers), we approximate from callTrees by
    converting per-thread selfPct → global via root.totalPct.
    """
    label_specs = [(j["keyword"], j["display"], j["module"]) for j in _pack().burst_jobs]

    if hotspots:
        # Preferred path: use globally-aggregated self pct from summary.
        rows = []
        for keyword, display, module in label_specs:
            best_pct = 0.0
            for h in hotspots:
                lib = h.get("lib") or ""
                if "lib_burst_generated" not in lib:
                    continue
                func = h.get("func") or ""
                if keyword in func:
                    p = h.get("pct", 0)
                    if p > best_pct:
                        best_pct = p
            if best_pct <= 0:
                continue
            abs_s = int(round(best_pct / 100.0 * total_samples)) if total_samples else 0
            rows.append((display, abs_s, best_pct, module))
        rows.sort(key=lambda x: -x[1])
        rows = rows[:top_k]
        return [(i + 1, d, a, p, m) for i, (d, a, p, m) in enumerate(rows)]

    # Fallback: aggregate via callTree (thread → global conversion).
    by_display: dict = {}
    for tree in call_trees or []:
        th = tree.get("thread", "")
        if not any(x in th for x in ("Thread-129", "Thread-135", "Thread-136", "Thread-158")):
            continue
        root = tree.get("root") or {}
        thread_global_pct = root.get("totalPct", 0) or 0
        if thread_global_pct <= 0:
            continue
        nodes = []
        _walk_all_nodes(root, nodes)
        per_thread_max: dict = {}
        for n in nodes:
            nm = n.get("name", "")
            for keyword, display, module in label_specs:
                if keyword in nm:
                    self_pct_thread = n.get("selfPct", 0) or 0
                    if self_pct_thread <= 0:
                        continue
                    self_pct_global = self_pct_thread * thread_global_pct / 100.0
                    prev = per_thread_max.get(display)
                    if not prev or self_pct_global > prev[0]:
                        per_thread_max[display] = (self_pct_global, module)
                    break
        for display, (sp_g, module) in per_thread_max.items():
            abs_s = int(round(sp_g / 100.0 * total_samples)) if total_samples else 0
            if abs_s <= 0:
                continue
            if display not in by_display:
                by_display[display] = {"abs": 0, "globalPct": 0.0, "module": module}
            by_display[display]["abs"] += abs_s
            by_display[display]["globalPct"] += sp_g
    rows = sorted(by_display.items(), key=lambda x: -x[1]["abs"])[:top_k]
    return [(i + 1, display, r["abs"], r["globalPct"], r["module"]) for i, (display, r) in enumerate(rows)]


def gpu_present_rows(call_trees_cur, call_trees_base, total_samples):
    specs = [
        ("GfxDeviceClient::WaitForPendingPresent", "主线程", "主信号：主线程等 RHI Present"),
        ("GfxDeviceClient::PresentFrame", "主线程", "主线程发起 Present"),
        ("GfxDeviceGLES::PresentFrame", "RHI 线程", "RHI 实际执行 Present"),
        ("eglSwapBuffers", "RHI", "辅助参考，不能单独判定"),
    ]
    rows = []
    for sym, thread, meaning in specs:
        b = 0
        c = 0
        for trees, acc in ((call_trees_base, "b"), (call_trees_cur, "c")):
            for t in trees or []:
                nodes = []
                _walk_all_nodes(t.get("root"), nodes)
                for n in nodes:
                    if sym in n.get("name", ""):
                        val = _self_abs(n, total_samples) or _abs_samples(n, total_samples)
                        if acc == "b":
                            b = max(b, val)
                        else:
                            c = max(c, val)
        rows.append((sym, thread, b, c, meaning))
    return rows
