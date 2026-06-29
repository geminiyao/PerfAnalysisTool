"""Business module aggregation — auto-discovery via onion peel + common ancestor merge.

Replaces the previous hardcoded BUSINESS_MODULES dict with a data-driven
discovery pipeline (see auto_module_discovery.py for the algorithm). Output
schema unchanged so the rest of the pipeline (probes, top_n_engine,
v4_report_renderer) is not affected.

Legacy hardcoded path kept as `compute_business_modules_legacy` for regression
diff during the migration.
"""

from .auto_module_discovery import discover_business_modules
from .tree_utils import collect_self_hits, sum_self_global
from .naming import sanitize_lib

# Legacy hardcoded definitions retained for regression / fallback only.
BUSINESS_MODULES_LEGACY = {
    "wwise": {
        "mode": "lib_match",
        "lib": "libAkSoundEngine",
        "display": "Wwise 音频中间件",
    },
    "ecs_burst": {
        "mode": "lib_match",
        "lib": "lib_burst_generated",
        "display": "ECS Burst Job 工作量",
    },
    "meshui": {
        "mode": "subtree_sum_self",
        "scope": "main_thread",
        "keywords": [
            "MUIControlManager", "MUILayout", "MUIRendererBase", "MUIText", "MUISprite",
            "MeshUIManager", "MUIRenderable", "MUIDefaultRenderer", "MUISpriteSliced",
            "MUILayoutRoot", "MUILayoutManager",
        ],
        "display": "MeshUI 迭代位置刷新",
    },
    "army_line": {
        "mode": "subtree_sum_self",
        "scope": "main_thread",
        "keywords": [
            "OutSideViewArmyLineMgr", "OutsideLineCtrl", "OutsideLineMesh", "CalculateVertexJob",
        ],
        "display": "行军线刷新（OutSideViewArmyLineMgr）",
    },
    "urp_main_render": {
        "mode": "subtree_sum_self",
        "scope": "main_thread",
        "keywords": [
            "UniversalRenderPipeline", "RenderCameraStack", "RenderSingleCamera",
            "ScriptableRenderer_Execute", "ExecuteRenderPass", "ShadowPass", "PlanarShadow",
            "DrawRendererPass", "BloomPass", "MobileBaseRenderer",
            "DrawFoliageInstanceRenderers", "OutsideForestRenderer", "OutsideTreeTypeRenderer",
            "TBUBaseFeature", "TBURenderGraph",
        ],
        "display": "URP 主线程渲染配置",
    },
    "rhi_const_upload": {
        "mode": "subtree_sum_self",
        "scope": "rhi_thread",
        "keywords": ["ConstantBuffersGLES"],
        "display": "RHI 常量缓冲上传",
    },
    "rhi_drawcall": {
        "mode": "subtree_sum_self",
        "scope": "rhi_thread",
        "keywords": [
            "GfxDeviceGLES::DrawBuffers", "DrawBuffersStereo", "BeforeDrawCall",
            "SetVertexStateGLES", "ApplyGpuProgramGLES",
        ],
        "display": "RHI DrawCall 提交",
    },
    "lua_vm": {
        "mode": "sum_self",
        "scope": "all_threads",
        "keywords": ["luaV_execute", "luaD_call", "lua_pcall", "luaH_get", "propagatemark", "luaC_step"],
        "display": "Lua VM 解释执行",
    },
    "lua_gc_worker": {
        "mode": "subtree_sum_self",
        "scope": "lua_mtgc_worker",
        "keywords": ["LuaMultiThreadGC_LuaGCThreadProc", "lua_execute_mtgc", "do_realgc"],
        "display": "Lua GC 工作线程",
    },
    "network": {
        "mode": "subtree_sum_self",
        "scope": "main_thread",
        "keywords": [
            "TServerManager", "TServer_Tick", "TServer_DecodeMessages",
            "TServer_RecvMessages", "TServer_HandleMessages",
        ],
        "display": "网络消息处理",
    },
}


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


def compute_business_modules(profile, grand_total_ec, tagged_threads, metrics, total_samples):
    """Auto-discover business modules from callTree (onion peel + common-ancestor merge).

    Project-agnostic: no hardcoded keywords. Modules emerge from the data.
    """
    return discover_business_modules(
        profile, grand_total_ec, tagged_threads, metrics, total_samples,
    )


def compute_business_modules_legacy(profile, grand_total_ec, tagged_threads, metrics, total_samples):
    """Legacy hardcoded keyword path — kept for regression diff during migration."""
    modules = []
    for mod_id, cfg in BUSINESS_MODULES_LEGACY.items():
        mode = cfg["mode"]
        if mode == "lib_match":
            g_pct = _lib_pct(metrics, cfg["lib"])
            abs_s = round(g_pct / 100.0 * total_samples)
            children = []
        else:
            scope = cfg.get("scope", "all_threads")
            keywords = cfg["keywords"]
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

        modules.append({
            "id": mod_id,
            "display": cfg["display"],
            "globalPct": round(g_pct, 3),
            "absSamples": abs_s,
            "children": children,
        })
    modules.sort(key=lambda x: -x["absSamples"])
    return modules
