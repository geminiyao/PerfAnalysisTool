"""Runtime function call-up tracing per knowledge base v2.1 §5 / card A.4."""

from .tree_utils import iter_cg_nodes, norm_symbol, thread_global_pct, walk_cg_with_ancestors

CALL_UP_TARGETS = [
    "__memcpy", "__memset", "memmove",
    "__ieee754_powf", "__ieee754_sqrtf", "__ieee754_atan2f",
    "GC_end_stubborn_change", "GC_mark_from", "GC_push_all",
    "tlsf_memalign", "tlsf_malloc", "tlsf_free",
    "je_malloc", "je_free",
    "il2cpp::vm::Object::NewAllocSpecific", "il2cpp_alloc",
    "ThreadsafeLinearAllocator::Allocate",
    "MemoryManager::Allocate", "BucketAllocator::Allocate",
    "XXH32", "XXH64",
]

CALLER_MODULE_RULES = [
    (["ConstantBuffersGLES", "InstancingBatcher", "MapConstantBuffers"], "RHI / GPU Instancing"),
    (["Mesh::SetVertexData", "MUIRendererBase", "MUIDefaultRenderer"], "MeshUI 顶点上传"),
    (["MUIControlManager", "MUILayout", "MUIText", "MUISprite", "MUIRenderable"], "MeshUI"),
    (["PlanarShadow", "ShadowPass"], "URP / 阴影"),
    (["BloomPass", "PostProcess"], "URP / 后处理"),
    (["OutsideForestRenderer", "DrawFoliage", "OutsideTreeTypeRenderer"], "URP / 树木 Instancing"),
    (["RenderingCommandBuffer", "ScriptableRenderContext", "TranscriptScriptableRenderContext"], "URP / 命令缓冲"),
    (["TServer", "TServerManager"], "网络消息处理"),
    (["LuaMgr", "XLua", "luaV_execute", "lua_pcall"], "Lua"),
    (["UIGeometryJob"], "UGUI 几何 Job"),
    (["Adreno"], "GPU 驱动黑盒"),
    (["libAkSoundEngine"], "Wwise"),
    (["Enumerator", "MoveNext"], "C# 迭代器"),
    (["OutSideViewArmyLineMgr", "OutsideLineCtrl"], "行军线"),
    (["BattleUIManager"], "战斗 UI"),
]


def _classify_module(chain_names):
    for keywords, module in CALLER_MODULE_RULES:
        for name in chain_names:
            for kw in keywords:
                if kw in name:
                    return module
    return "未分类"


def _match_target(fn):
    for t in CALL_UP_TARGETS:
        if t in fn or fn == t:
            return t
    return None


def compute_call_up_tracing(profile, grand_total_ec, tagged_threads):
    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}
    results = {t: [] for t in CALL_UP_TARGETS}

    for _p, th in profile.iter_threads():
        ec = th["event_count"] or 1
        tg = thread_global_pct(ec, grand_total_ec)
        thread_id = tid_identity.get(th["tid"], th["thread_name"])

        def on_node(node, ancestors):
            fn = node.get("func_name") or ""
            target = _match_target(fn)
            if not target:
                return
            chain = ancestors[-3:]
            chain_names = [norm_symbol(a.get("func_name") or "") for a in chain]
            chain_key = " < ".join(reversed([n[:60] for n in chain_names if n]))
            line_pct = node["subtree_event_count"] / ec * 100.0 if ec else 0.0
            g_pct = line_pct * tg / 100.0
            module = _classify_module(chain_names + [norm_symbol(fn)])
            results[target].append({
                "callerChain": chain_key or fn[:60],
                "thread": thread_id,
                "globalPct": round(g_pct, 4),
                "module": module,
            })

        walk_cg_with_ancestors(th["call_graph"], [], on_node)

    output = []
    for target in CALL_UP_TARGETS:
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
