"""PlayerLoop phase detection per knowledge base v2.1 / card A.2."""

from .tree_utils import max_subtree_pct_for_keywords, thread_global_pct

PHASE_KEYWORDS = [
    ("Update.ScriptRunBehaviourUpdate", "UpdateScriptRunBehaviourUpdate"),
    ("PreLateUpdate.ScriptRunBehaviourLateUpdate", "PreLateUpdateScriptRunBehaviourLateUpdate"),
    ("PostLateUpdate.PlayerSendFrameComplete", "PostLateUpdatePlayerSendFrameComplete"),
    ("PostLateUpdate.PlayerUpdateCanvases", "PostLateUpdatePlayerUpdateCanvases"),
    ("PreLateUpdate.ParticleSystemBeginUpdateAll", "PreLateUpdateParticleSystemBeginUpdateAll"),
    ("PostLateUpdate.ParticleSystemEndUpdateAll", "PostLateUpdateParticleSystemEndUpdateAll"),
    ("PreLateUpdate.LegacyAnimationUpdate", "PreLateUpdateLegacyAnimationUpdate"),
    ("PostLateUpdate.FinishFrameRendering", "PostLateUpdateFinishFrameRendering"),
    ("EarlyUpdate.UpdateTextureStreamingManager", "EarlyUpdateUpdateTextureStreamingManager"),
    ("PostLateUpdate.PlayerEmitCanvasGeometry", "PostLateUpdatePlayerEmitCanvasGeometry"),
    ("PostLateUpdate.UpdateAllRenderers", "PostLateUpdateUpdateAllRenderers"),
    ("PreUpdate.SendMouseEvents", "PreUpdateSendMouseEvents"),
    ("LuaMultiThreadGC.main", "LuaMultiThreadGC"),
]


def find_main_thread_cg(profile, tagged_threads):
    tid = None
    for t in tagged_threads:
        if t["identity"] == "main_thread":
            tid = t["tid"]
            break
    if tid is None:
        for _p, th in profile.iter_threads():
            if th["thread_name"] == "UnityMain":
                tid = th["tid"]
                break
    if tid is None:
        return None, 0
    for _p, th in profile.iter_threads():
        if th["tid"] == tid:
            return th["call_graph"], th["event_count"] or 1
    return None, 0


def compute_playerloop_stages(profile, grand_total_ec, tagged_threads):
    cg, main_ec = find_main_thread_cg(profile, tagged_threads)
    if not cg:
        return []

    total_samples = profile.total_samples
    stages = []
    for label, keyword in PHASE_KEYWORDS:
        pct_main, hit = max_subtree_pct_for_keywords(cg, main_ec, [keyword])
        if pct_main < 0.01:
            continue
        abs_s = round(pct_main / 100.0 * main_ec / grand_total_ec * total_samples) if grand_total_ec else 0
        g_pct = pct_main * thread_global_pct(main_ec, grand_total_ec) / 100.0
        stages.append({
            "label": label,
            "keyword": keyword,
            "hitSymbol": hit,
            "totalPctMain": round(pct_main, 3),
            "totalPctGlobal": round(g_pct, 3),
            "absSamples": abs_s,
        })
    return stages
