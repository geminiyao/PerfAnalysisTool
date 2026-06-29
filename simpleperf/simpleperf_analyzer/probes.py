"""Probe detection engine per knowledge base v2.1 §6 / card A.5."""

from .playerloop_phases import find_main_thread_cg
from .tree_utils import max_subtree_pct_for_keywords, sum_line_global_dedup, sum_self_global

PROBE_DEFS = [
    ("probe.net.tserver", "网络消息（TServerManager 子树）", "module_main", {"green": 8, "yellow": 15, "red": 100}, "network", "v2.1 §4.1.1"),
    ("probe.lua.totalLoad", "Lua 总负载", "keywords_global", {"green": 8, "yellow": 10, "red": 100},
     ["luaV_execute", "luaD_call", "lua_pcall", "LuaMgr", "XLua"], "v2.1 §4.1.2"),
    ("probe.lua.luaMgrOnUpdate", "LuaMgr OnUpdate", "keywords_main", {"green": 12, "yellow": 20, "red": 100},
     ["LuaMgr_OnUpdate", "LuaMgr.OnUpdate"], "v2.1 §4.1.2"),
    ("probe.csharp.mapManager", "MapManager OnUpdate", "keywords_main", {"green": 8, "yellow": 10, "red": 100},
     ["MapManager_OnUpdate"], "v2.1 §4.1.3"),
    ("probe.csharp.battleUIManager", "BattleUIManager OnUpdate", "keywords_main", {"green": 2, "yellow": 3, "red": 100},
     ["BattleUIManager_OnUpdate"], "v2.1 §4.1.3"),
    ("probe.csharp.outsideViewArmyLine", "OutSideViewArmyLineMgr", "keywords_main", {"green": 2, "yellow": 3, "red": 100},
     ["OutSideViewArmyLineMgr"], "v2.1 §4.1.3"),
    ("probe.csharp.mapManager.lateUpdate", "MapManager LateUpdate", "keywords_main", {"green": 5, "yellow": 8, "red": 100},
     ["MapManager_OnLateUpdate", "Outside.MapManager.LateUpdate"], "v2.1 §4.2.1"),
    ("probe.lua.luaMgrOnLateUpdate", "LuaMgr OnLateUpdate", "keywords_main", {"green": 5, "yellow": 8, "red": 100},
     ["LuaMgr_OnLateUpdate"], "v2.1 §4.2.1"),
    ("probe.csharp.meshUI", "MeshUI 子树", "module_main", {"green": 3, "yellow": 5, "red": 100}, "meshui", "v2.1 §4.2.2"),
    ("probe.anim.legacy", "LegacyAnimationUpdate", "phase_ms", {"green": 0.6, "yellow": 1.0, "red": 100},
     "PreLateUpdate.LegacyAnimationUpdate", "v2.1 §4.3"),
    ("probe.fx.particle", "ParticleSystem 合计", "phase_ms_combined", {"green": 0.6, "yellow": 1.0, "red": 100}, "v2.1 §4.3"),
    ("probe.ui.canvas", "PlayerUpdateCanvases", "phase_ms", {"green": 0.6, "yellow": 1.0, "red": 100},
     "PostLateUpdate.PlayerUpdateCanvases", "v2.1 §4.4"),
    ("probe.ecs.mainwait", "主线程 Job 等待", "keywords_global_dedup", {"green": 0.5, "yellow": 2, "red": 100},
     ["WaitForJobGroupID", "JobHandle::Complete", "JobHandle_Complete",
      "ScheduleBatchedJobsAndComplete", "CombineDependenciesInternalPtr"],
     "main_thread", "v2.1 §4.5"),
    ("probe.ecs.jobworker.balance", "Job Worker 均衡度", "thread_balance", {"green": 20, "yellow": 30, "red": 100},
     "job_worker", "v2.1 §4.5"),
    ("probe.render.urp.shadow", "URP ShadowPass", "keywords_main", {"green": 5, "yellow": 8, "red": 100},
     ["ShadowPass", "PlanarShadow"], "v2.1 §4.6"),
    ("probe.render.urp.foliage", "URP Foliage/Tree", "keywords_main", {"green": 3, "yellow": 5, "red": 100},
     ["DrawFoliage", "OutsideForestRenderer"], "v2.1 §4.6"),
    ("probe.render.urp.postfx", "URP 后处理", "keywords_main", {"green": 3, "yellow": 5, "red": 100},
     ["BloomPass", "PostProcessPass"], "v2.1 §4.6"),
    ("probe.render.urp.setup", "MobileBaseRenderer Setup", "keywords_main", {"green": 2, "yellow": 3, "red": 100},
     ["MobileBaseRenderer"], "v2.1 §4.6"),
    ("probe.gpu.bound", "GPU bound 主信号", "keywords_global_dedup", {"green": 2, "yellow": 5, "red": 100},
     ["GfxDeviceClient::WaitForPendingPresent", "GfxDeviceClient::PresentFrame"], "main_thread", "v2.1 §4.6"),
    ("probe.gpu.bound.eglSwap", "eglSwapBuffers（辅助）", "keywords_rhi", {"green": 10, "yellow": 15, "red": 100},
     ["eglSwapBuffers"], "v2.1 §4.7"),
    ("probe.rhi.constUpload", "RHI 常量缓冲上传", "keywords_rhi", {"green": 25, "yellow": 40, "red": 100},
     ["ConstantBuffersGLES"], "v2.1 §4.7"),
    ("probe.rhi.drawcall", "RHI DrawCall", "keywords_rhi_observe", {"green": 999, "yellow": 999, "red": 100},
     ["GfxDeviceGLES::DrawBuffers"], "v2.1 §4.7"),
    ("probe.res.loader", "资源加载平均", "keywords_main_ms", {"green": 1, "yellow": 2, "red": 100},
     ["LoaderManagerTickLoadOnFrameEnd"], "v2.1 §4.8"),
    ("probe.lua.mtgc.worker", "Lua GC worker", "module", {"green": 1, "yellow": 2, "red": 100}, "lua_gc_worker", "v2.1 §4.9"),
    ("probe.middleware.wwise", "Wwise 音频中间件", "module", {"green": 3, "yellow": 7, "red": 100}, "wwise", "v2.1 §4.10"),
    ("probe.gc.boehmBackground", "Boehm GC 后台", "keywords_global_self", {"green": 1, "yellow": 2, "red": 100},
     ["GC_end_stubborn_change", "GC_mark_from", "GC_push_all"], "v2.1 §4.11"),
]


def _verdict(value, thresholds):
    """green < green_th; yellow in [green, yellow); red >= yellow (per knowledge base §6)."""
    if value >= thresholds["yellow"]:
        return "red"
    if value >= thresholds["green"]:
        return "yellow"
    return "green"


def _main_pct(g, main_g):
    return g / main_g * 100.0 if main_g > 0 else 0.0


def _ms_per_frame(abs_samples, duration_sec=20, fps=60):
    return abs_samples / (duration_sec * fps) if abs_samples else 0.0


def compute_probes(profile, grand_total_ec, tagged_threads, business_modules, playerloop_stages, total_samples):
    mod_map = {m["id"]: m for m in business_modules}
    main_g = next((t["globalPct"] for t in tagged_threads if t["identity"] == "main_thread"), 0.0)
    phase_map = {s["label"]: s for s in playerloop_stages}
    tid_identity = {t["tid"]: t["identity"] for t in tagged_threads}

    def cg_for(identity):
        for _p, th in profile.iter_threads():
            if tid_identity.get(th["tid"]) == identity:
                return th["call_graph"], th["event_count"] or 1
        return None, 0

    probes = []
    for pdef in PROBE_DEFS:
        pid, display, kind, thresholds = pdef[:4]
        rest = pdef[4:]
        knowledge_ref = rest[-1]
        value = 0.0
        abs_samples = 0
        unit = "%global"

        if kind == "module":
            mod_id = rest[0]
            m = mod_map.get(mod_id, {})
            value = m.get("globalPct", 0.0)
            abs_samples = m.get("absSamples", 0)
        elif kind == "module_main":
            mod_id = rest[0]
            m = mod_map.get(mod_id, {})
            g = m.get("globalPct", 0.0)
            value = _main_pct(g, main_g)
            abs_samples = m.get("absSamples", 0)
            unit = "%main"
        elif kind == "keywords_main":
            kws = rest[0]
            cg, ec = find_main_thread_cg(profile, tagged_threads)
            if cg:
                g = sum_self_global(cg, ec, grand_total_ec, kws)
                value = _main_pct(g, main_g)
                abs_samples = round(g / 100.0 * total_samples)
            unit = "%main"
        elif kind == "keywords_global":
            kws = rest[0]
            for _p, th in profile.iter_threads():
                ec = th["event_count"] or 1
                value += sum_self_global(th["call_graph"], ec, grand_total_ec, kws)
            abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_global_self":
            kws = rest[0]
            for _p, th in profile.iter_threads():
                ec = th["event_count"] or 1
                value += sum_self_global(th["call_graph"], ec, grand_total_ec, kws)
            abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_global_dedup":
            kws, scope = rest[0], rest[1]
            cg, ec = cg_for(scope)
            if cg:
                value, _ = sum_line_global_dedup(cg, ec, grand_total_ec, kws)
                abs_samples = round(value / 100.0 * total_samples)
        elif kind == "keywords_rhi":
            kws = rest[0]
            cg, ec = cg_for("rhi_thread")
            if cg:
                value, _ = max_subtree_pct_for_keywords(cg, ec, kws)
                abs_samples = round(value / 100.0 * ec / grand_total_ec * total_samples) if grand_total_ec else 0
            unit = "%rhi"
        elif kind == "keywords_rhi_observe":
            kws = rest[0]
            cg, ec = cg_for("rhi_thread")
            if cg:
                value, _ = max_subtree_pct_for_keywords(cg, ec, kws)
                abs_samples = round(value / 100.0 * ec / grand_total_ec * total_samples) if grand_total_ec else 0
            unit = "%rhi"
            verdict = "green"
        elif kind == "phase_ms":
            ph = phase_map.get(rest[0], {})
            abs_samples = ph.get("absSamples", 0)
            value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "phase_ms_combined":
            abs_samples = (
                phase_map.get("PreLateUpdate.ParticleSystemBeginUpdateAll", {}).get("absSamples", 0)
                + phase_map.get("PostLateUpdate.ParticleSystemEndUpdateAll", {}).get("absSamples", 0)
            )
            value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "keywords_main_ms":
            kws = rest[0]
            cg, ec = find_main_thread_cg(profile, tagged_threads)
            if cg:
                g = sum_self_global(cg, ec, grand_total_ec, kws)
                abs_samples = round(g / 100.0 * total_samples)
                value = _ms_per_frame(abs_samples)
            unit = "ms/帧"
        elif kind == "thread_balance":
            identity = rest[0]
            workers = sorted(
                [t for t in tagged_threads if t["identity"] == identity],
                key=lambda x: -x["absSamples"],
            )[:4]
            pcts = [t["globalPct"] for t in workers]
            if len(pcts) >= 2:
                mn, mx = min(pcts), max(pcts)
                value = (mx - mn) / mn * 100.0 if mn > 0 else 0.0
            unit = "%"

        verdict = _verdict(value, thresholds) if kind != "keywords_rhi_observe" else "green"
        probes.append({
            "id": pid,
            "display": display,
            "value": round(value, 3),
            "unit": unit,
            "absSamples": abs_samples,
            "thresholds": thresholds,
            "verdict": verdict,
            "knowledgeRef": knowledge_ref,
        })
    return probes
