"""Auto module discovery — onion peel + common-ancestor merge.

Replaces the hardcoded BUSINESS_MODULES dict in business_modules.py with a
data-driven discovery pipeline:

  Step 1 (onion peel):
    Collect every callTree node and classify by selfPct:
      - selfPct < HOT_SELF_PCT_GLOBAL → wrapper (skip)
      - selfPct >= HOT_SELF_PCT_GLOBAL → real hotspot candidate

  Step 2 (runtime exclusion):
    Drop runtime-class symbols (__memcpy / GC_* / tlsf_* / ...). They are
    surfaced under §10 call-up tracing instead of being treated as modules.

  Step 3 (common-ancestor merge):
    For every hotspot candidate, walk up its ancestors. Group hotspots that
    share a common business ancestor — i.e. an ancestor whose totalPct
    accounts for ≥ MERGE_RATIO × Σ(child hotspots' selfPct). This is the
    "module" — the smallest subtree that contains the hotspots.

  Step 4 (project-agnostic special modules):
    Library-level modules (Wwise, Burst Job, etc.) and worker threads
    (Lua MtGC) come from layer/lib/identity, not callTree mining. Auto-add.

Output schema matches business_modules.compute_business_modules so the rest
of the pipeline is unchanged.
"""

from .tree_utils import iter_cg_nodes, norm_symbol, thread_global_pct, lib_base
from .naming import sanitize_lib

# ----- Tunables (single source of truth) -----
HOT_SELF_PCT_GLOBAL = 0.05      # selfPct (in global %) threshold for hotspot
MIN_HOTSPOT_ABS = 30            # min abs samples for a hotspot to count
MIN_MODULE_ABS = 80             # min abs samples for a discovered module
MIN_MODULE_HOTSPOTS = 1         # min hotspot count per module
MERGE_RATIO = 1.2               # ancestor totalPct >= MERGE_RATIO × Σ child self
MAX_MODULES_PER_THREAD = 8      # cap to avoid micro-modules

# Symbols whose self time is real but should NOT seed business modules. They
# are surfaced via §10 call-up tracing or already covered by lib-level modules.
RUNTIME_SYMBOL_SUBSTRINGS = (
    "__memcpy", "__memset", "__memmove", "memmove",
    "__ieee754_powf", "__ieee754_sqrtf", "__ieee754_atan2f", "sqrtf",
    "GC_end_stubborn_change", "GC_mark_from", "GC_push_all", "GC_apply_to_each_object",
    "tlsf_memalign", "tlsf_malloc", "tlsf_free",
    "je_malloc", "je_free", "je_realloc",
    "il2cpp_alloc", "il2cpp::vm::Object::NewAllocSpecific",
    "MemoryManager::Allocate", "MemoryManager::Deallocate",
    "BucketAllocator::Allocate", "ThreadsafeLinearAllocator",
    "XXH32", "XXH64",
    # JIT/runtime plumbing — not a "business" symbol
    "art_jni_trampoline", "ScriptingInvocation::Invoke",
    "il2cpp::vm::Runtime::Invoke", "RuntimeInvoker_",
    # framework wrappers that have no useful self
    "@plt", "[unknown]",
)

# Pure dispatcher frames that should be transparent during merge (skip when
# locating the smallest meaningful ancestor). They are Unity engine concepts,
# not project-specific.
DISPATCHER_FRAMES = (
    "ExecutePlayerLoop",
    "PlayerLoop()",
    "UnityPlayerLoop",
    "nativeRender",
    "CallUpdateMethod",
    "BehaviourManager::Update",
    "BaseBehaviourManager",
    "MonoBehaviour::CallUpdateMethod",
    "ScriptingInvocation::Invoke",
    "il2cpp::vm::Runtime::Invoke",
    "RuntimeInvoker_",
    "art_jni_trampoline",
    "android.os.",
    "Looper.loop",
    "UnityPlayer",
    "__start_thread",
    "__pthread_start",
    "RunThreadWrapper",
    "JobQueue::WorkLoop",
    "JobQueue::Exec",
    "InitPlayerLoopCallbacks",
    "Forward()",
    "::Update()",
    "BehaviourUpdate",
    "LateBehaviourManager::Update",
    "LateBehaviourUpdate",
    # ECS scheduling wrappers — they only schedule jobs, not real business work
    "ComponentSystem_Update_",
    "ComponentSystemBase",
    "ComponentSystemGroup_UpdateAllSystems",
    "EntityCommandBufferSystem",
    # GfxDeviceWorker top-level dispatch — real business is one level down
    # (DrawBuffers / ConstantBuffersGLES / PresentFrame etc.)
    "GfxDeviceWorker::RunCommand",
    "GfxDeviceWorker::RunExt",
    "GfxDeviceWorker::RunGfxDeviceWorker",
    "Thread::RunThreadWrapper",
    # URP top-level dispatch — real business is at Pass level
    "ScriptableRenderContext::ExtractAndExecute",
    "ExtractAndExecuteRenderPipelineNoCleanup",
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
    "RenderPipelineManager_DoRenderLoop",
    "UniversalRenderPipeline_Render_",
    "UniversalRenderPipeline_RenderCameraStack_",
    "UniversalRenderPipeline_RenderSingleCamera_",
    "ScriptableRenderer_Execute_",
    "ScriptableRenderer_ExecuteBlock_",
    "ScriptableRenderer_ExecuteRenderPass_",
    "RenderManager::RenderCameras",
    # ECS UpdateFunction.Invoke is the SystemGroup tick wrapper
    "UpdateFunction_Invoke_",
    # Job worker scheduling
    "JobQueue::Steal",
    "JobQueue::CreateGroup",
    "JobQueue::ScheduleJob",
    "GfxRenderSlaver::RunGfxRenderSlaver",
    "GfxRenderSlaver",
)


def _is_runtime(name):
    if not name:
        return True
    for s in RUNTIME_SYMBOL_SUBSTRINGS:
        if s in name:
            return True
    return False


def _is_dispatcher(name):
    if not name:
        return True
    for s in DISPATCHER_FRAMES:
        if s in name:
            return True
    return False


def _walk_with_path(root, callback):
    """DFS yielding (node, path-from-root-exclusive)."""
    def _w(node, path):
        callback(node, path)
        new_path = path + [node]
        for c in node.get("child_graph", []):
            _w(c, new_path)
    for c in root.get("child_graph", []):
        _w(c, [])


def _collect_hotspots(cg, thread_ec, tg_pct, total_samples):
    """Step 1+2: collect hotspot nodes (real self time) with their ancestor path."""
    hotspots = []
    if not thread_ec:
        return hotspots

    def _cb(node, path):
        name = node.get("func_name") or ""
        # Skip runtime + dispatcher frames as hotspot candidates: their self
        # time is real but they are plumbing, not "business hotspots". They
        # remain visible as transparent ancestors in path[].
        if _is_runtime(name) or _is_dispatcher(name):
            return
        self_pct_thread = node["event_count"] / thread_ec * 100.0
        self_pct_global = self_pct_thread * tg_pct / 100.0
        abs_s = round(self_pct_global / 100.0 * total_samples)
        if self_pct_global < HOT_SELF_PCT_GLOBAL or abs_s < MIN_HOTSPOT_ABS:
            return
        hotspots.append({
            "name": name,
            "selfPctGlobal": self_pct_global,
            "absSelf": abs_s,
            "subtreeCount": node["subtree_event_count"],
            "selfCount": node["event_count"],
            "path": list(path),  # ancestors root → parent (excl. self)
            "_cgnode": node,     # keep ref for downstream metrics
        })

    _walk_with_path(cg, _cb)
    return hotspots


def _meaningful_ancestor(hotspot):
    """Return the deepest non-dispatcher ancestor (the 'business' frame)."""
    for anc in reversed(hotspot["path"]):
        nm = anc.get("func_name") or ""
        if not _is_dispatcher(nm) and not _is_runtime(nm):
            return anc
    # If no business ancestor (everything is dispatcher), return None — the
    # hotspot itself becomes the module root.
    return None


def _common_ancestor_id(hotspots):
    """Find deepest ancestor shared by ALL hotspots in `hotspots`.

    Returns an integer index into the path (-1 = no shared ancestor).
    Path uses object identity (each node dict has a unique id())."""
    if not hotspots:
        return -1, None
    # Use id(node) sequences along each path; intersect.
    paths = [[id(n) for n in h["path"]] for h in hotspots]
    min_len = min(len(p) for p in paths)
    deepest = -1
    deepest_node = None
    for i in range(min_len):
        anc_id = paths[0][i]
        if all(p[i] == anc_id for p in paths):
            deepest = i
            deepest_node = hotspots[0]["path"][i]
        else:
            break
    return deepest, deepest_node


def _greedy_group_by_ancestor(hotspots):
    """Step 3: greedy clustering by meaningful ancestor.

    Two hotspots belong to the same module if they share at least one
    non-dispatcher ancestor whose totalPct (subtree_event_count) is ≥
    MERGE_RATIO × Σ(member self_count). Otherwise they form independent
    modules. Each hotspot's *deepest* meaningful ancestor seeds a candidate
    module, and we collapse modules whose roots overlap up the chain.
    """
    # Bucket by the id of the deepest meaningful ancestor; "" → standalone.
    buckets = {}
    standalone = []
    for h in hotspots:
        anc = _meaningful_ancestor(h)
        if anc is None:
            standalone.append(h)
            continue
        key = id(anc)
        b = buckets.setdefault(key, {"ancestor": anc, "members": []})
        b["members"].append(h)

    # Now try to merge buckets whose ancestors are themselves on the same
    # business ancestor chain. We walk each bucket's ancestor up; if we hit
    # another bucket's ancestor, merge.
    bucket_list = list(buckets.values())
    # Sort by ancestor depth (shallowest first); when merging, deeper buckets
    # absorb into shallower.
    # We approximate "depth" by length of any member's path that contains the ancestor.
    def _depth(b):
        anc = b["ancestor"]
        for m in b["members"]:
            for i, n in enumerate(m["path"]):
                if id(n) == id(anc):
                    return i
        return 0

    bucket_list.sort(key=_depth)

    # Each bucket points to its "absorbed-into" bucket.
    parent = {id(b["ancestor"]): id(b["ancestor"]) for b in bucket_list}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    bucket_by_id = {id(b["ancestor"]): b for b in bucket_list}

    # For each bucket, walk up the ancestor's path; if we hit another bucket
    # ancestor whose subtree count >= 1.0 of ours, absorb into the higher one.
    # CRITICAL: only merge into ancestors that are themselves non-dispatcher
    # business frames (otherwise we'd collapse into ExecutePlayerLoop / RunCommand).
    for b in bucket_list:
        anc = b["ancestor"]
        # Find a member's path containing this ancestor.
        sample_path = None
        for m in b["members"]:
            for i, n in enumerate(m["path"]):
                if id(n) == id(anc):
                    sample_path = m["path"][:i]  # ancestors above 'anc'
                    break
            if sample_path is not None:
                break
        if not sample_path:
            continue
        # Walk from immediate parent up to the root.
        for higher in reversed(sample_path):
            higher_name = higher.get("func_name") or ""
            # Stop walking up once we cross a dispatcher boundary — we don't
            # want to merge into engine plumbing.
            if _is_dispatcher(higher_name):
                continue
            hid = id(higher)
            if hid in bucket_by_id:
                # Merge b into higher's group.
                root_a = find(id(anc))
                root_b = find(hid)
                if root_a != root_b:
                    parent[root_a] = root_b
                break

    # Collect groups.
    groups = {}
    for b in bucket_list:
        root = find(id(b["ancestor"]))
        g = groups.setdefault(root, {"ancestor": bucket_by_id[root]["ancestor"],
                                     "members": []})
        g["members"].extend(b["members"])

    # Validate each group: ancestor's subtree_count vs members' total selfCount.
    valid_groups = []
    for g in groups.values():
        total_self = sum(m["selfCount"] for m in g["members"])
        anc_subtree = g["ancestor"]["subtree_event_count"]
        if anc_subtree >= MERGE_RATIO * total_self:
            valid_groups.append(g)
        else:
            # Ancestor too tight (the hotspots dominate it); split: each hotspot
            # becomes its own module rooted at its meaningful ancestor.
            for m in g["members"]:
                anc_node = _meaningful_ancestor(m) or m["_cgnode"]
                valid_groups.append({"ancestor": anc_node, "members": [m]})

    # Standalone (no business ancestor) hotspots: each becomes its own module,
    # with the hotspot node itself as the "ancestor".
    for h in standalone:
        # Wrap hotspot to expose cg-node interface used downstream.
        # We don't have the cg node directly here; reconstruct via path lookup.
        # Path is empty (it WAS standalone), so the hotspot itself is root.
        # Build a minimal pseudo-node by remembering the original cg refs.
        # Easiest: re-walk; but cheaper: stash node refs at hotspot collection.
        valid_groups.append({
            "ancestor": h["_cgnode"],
            "members": [h],
        })

    return valid_groups


def _module_display(group):
    """Choose a display string from the ancestor symbol."""
    anc = group["ancestor"]
    nm = norm_symbol(anc.get("func_name") or "[anon]")
    n_hot = len(group["members"])
    if n_hot == 1 and id(anc) == id(group["members"][0]):
        return nm
    return "%s 子树（含 %d 个真热点）" % (nm, n_hot)


def _discover_modules_in_thread(profile, cg, thread_ec, grand_total_ec,
                                total_samples, thread_label):
    if not thread_ec:
        return []
    tg = thread_global_pct(thread_ec, grand_total_ec)
    hotspots = _collect_hotspots(cg, thread_ec, tg, total_samples)
    if not hotspots:
        return []
    groups = _greedy_group_by_ancestor(hotspots)

    modules = []
    for g in groups:
        anc = g["ancestor"]
        members = g["members"]
        # absSamples = ancestor's subtree (all CPU under this module).
        anc_self_pct_thread = anc["event_count"] / thread_ec * 100.0
        anc_self_pct_global = anc_self_pct_thread * tg / 100.0
        sub_pct_thread = anc["subtree_event_count"] / thread_ec * 100.0
        sub_pct_global = sub_pct_thread * tg / 100.0
        abs_s = round(sub_pct_global / 100.0 * total_samples)
        if abs_s < MIN_MODULE_ABS:
            continue
        # Children = top hotspots inside this module, by absSelf.
        children = [
            {
                "function": norm_symbol(m["name"]),
                "selfPctGlobal": round(m["selfPctGlobal"], 3),
                "absSelf": m["absSelf"],
            }
            for m in sorted(members, key=lambda x: -x["absSelf"])[:10]
        ]
        modules.append({
            "id": "auto_%s_%s" % (thread_label, norm_symbol(anc.get("func_name") or "anon")[:60]),
            "display": _module_display(g),
            "globalPct": round(sub_pct_global, 3),
            "absSamples": abs_s,
            "rootSymbol": norm_symbol(anc.get("func_name") or ""),
            "thread": thread_label,
            "discoveryMode": "auto_callTree",
            "children": children,
        })

    # Cap modules per thread (keep top by absSamples).
    modules.sort(key=lambda x: -x["absSamples"])
    return modules[:MAX_MODULES_PER_THREAD]


def _layer_lib_modules(profile, grand_total_ec, metrics, total_samples):
    """Lib-level modules (Wwise / Burst / xLua VM) — unchanged from legacy.

    These are not "discovered" via callTree mining but read from per-lib
    aggregates because the lib is itself the unit.
    """
    out = []
    LIB_DEFS = [
        ("wwise", "libAkSoundEngine", "音频中间件 libAkSoundEngine"),
        ("ecs_burst", "lib_burst_generated", "ECS Burst Job (lib_burst_generated)"),
        ("lua_vm_lib", "libxlua", "Lua VM (libxlua)"),
    ]
    for mod_id, lib_substr, display in LIB_DEFS:
        # Compute exact lib pct from per-thread aggregation for accuracy.
        lib_ec = 0
        for _p, th in profile.iter_threads():
            for n in iter_cg_nodes(th["call_graph"]):
                lid = n.get("lib_id", -1)
                if lid >= 0:
                    base = lib_base(profile, lid)
                    if lib_substr in base:
                        lib_ec += n["event_count"]
        g_pct = (lib_ec / grand_total_ec * 100.0) if grand_total_ec else 0.0
        abs_s = round(g_pct / 100.0 * total_samples)
        if abs_s < MIN_MODULE_ABS:
            continue
        out.append({
            "id": mod_id,
            "display": display,
            "globalPct": round(g_pct, 3),
            "absSamples": abs_s,
            "rootSymbol": lib_substr,
            "thread": "all_threads",
            "discoveryMode": "lib_aggregate",
            "children": [],
        })
    return out


def _worker_thread_modules(profile, tagged_threads, grand_total_ec, total_samples):
    """Whole-thread modules for identities like lua_mtgc_worker, wwise_worker.

    These threads' identity *is* the module — anything they do is the module's
    workload. Avoids fragmenting them into multiple sub-modules.
    """
    out = []
    THREAD_MODULES = [
        ("lua_mtgc_worker", "lua_gc_worker", "Lua GC 工作线程"),
        # wwise_worker is already covered by 'wwise' lib module; skip to avoid dup.
    ]
    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}
    for identity, mod_id, display in THREAD_MODULES:
        ec = 0
        for _p, th in profile.iter_threads():
            if tid_identity.get(th["tid"]) == identity:
                ec += th["event_count"] or 0
        g_pct = (ec / grand_total_ec * 100.0) if grand_total_ec else 0.0
        abs_s = round(g_pct / 100.0 * total_samples)
        if abs_s < 30:  # lower bar, GC worker can be small
            continue
        out.append({
            "id": mod_id,
            "display": display,
            "globalPct": round(g_pct, 3),
            "absSamples": abs_s,
            "rootSymbol": identity,
            "thread": identity,
            "discoveryMode": "thread_identity",
            "children": [],
        })
    return out


def discover_business_modules(profile, grand_total_ec, tagged_threads,
                              metrics, total_samples):
    """Top-level entry: return a unified module list (auto + lib + thread)."""
    modules = []

    # 1. Auto-discover from callTree per "interesting" thread.
    INTERESTING_IDENTITIES = ("main_thread", "rhi_thread", "render_thread")
    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}
    for _p, th in profile.iter_threads():
        identity = tid_identity.get(th["tid"], "unidentified")
        if identity not in INTERESTING_IDENTITIES:
            continue
        mods = _discover_modules_in_thread(
            profile, th["call_graph"], th["event_count"] or 1,
            grand_total_ec, total_samples, identity,
        )
        modules.extend(mods)

    # 2. Library-level modules.
    modules.extend(_layer_lib_modules(profile, grand_total_ec, metrics, total_samples))

    # 3. Worker-thread-level modules.
    modules.extend(_worker_thread_modules(
        profile, tagged_threads, grand_total_ec, total_samples,
    ))

    # Deduplicate by id (last write wins).
    by_id = {}
    for m in modules:
        by_id[m["id"]] = m
    out = list(by_id.values())
    out.sort(key=lambda x: -x["absSamples"])
    return out
