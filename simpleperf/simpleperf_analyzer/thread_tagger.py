"""Thread identity tagging per knowledge base v2.1 §2."""

from .tree_utils import (
    find_entry_at_depth,
    lib_pct_in_thread,
    max_subtree_pct_for_keywords,
)

LUA_MTGC_KW = ["LuaMultiThreadGC_LuaGCThreadProc", "lua_execute_mtgc", "do_realgc"]
MAIN_KW = ["ExecutePlayerLoop", "nativeRender", "UnityPlayerLoop"]
RENDER_KW = ["ScriptableRenderContext::ExtractAndExecute", "ExecuteScriptableRenderLoop"]
RHI_KW = ["GfxDeviceWorker::RunCommand", "RunGfxDeviceWorker"]
JOB_KW = ["JobQueue::WorkLoop"]
WWISE_LIB = "libAkSoundEngine"


def tag_thread(profile, thread, grand_total_ec):
    comm = thread["thread_name"]
    cg = thread["call_graph"]
    ec = thread["event_count"] or 1

    entry = find_entry_at_depth(cg, LUA_MTGC_KW, 3, 12)
    if entry:
        return "lua_mtgc_worker", "entry=%s" % entry

    if "UnityGfxRenderS" in comm:
        return "render_thread", "comm=%s" % comm

    if comm.startswith("AAudio_") or "AudioTrack" in comm or "AudioOut" in comm:
        return "audio_callback", "comm=%s" % comm

    if "Choreograp" in comm:
        return "choreographer", "comm=%s" % comm

    wwise_pct = lib_pct_in_thread(profile, cg, ec, WWISE_LIB)
    if wwise_pct >= 80:
        return "wwise_worker", "libAkSoundEngine=%.1f%%" % wwise_pct

    rhi_pct, rhi_hit = max_subtree_pct_for_keywords(cg, ec, RHI_KW)
    if rhi_pct >= 50:
        return "rhi_thread", "hit=%s %.1f%%" % (rhi_hit or "RHI", rhi_pct)

    job_pct, job_hit = max_subtree_pct_for_keywords(cg, ec, JOB_KW)
    if job_pct >= 50:
        return "job_worker", "hit=%s %.1f%%" % (job_hit or "JobQueue", job_pct)

    render_pct, render_hit = max_subtree_pct_for_keywords(cg, ec, RENDER_KW)
    if render_pct >= 30:
        return "render_thread", "hit=%s %.1f%%" % (render_hit or "Render", render_pct)

    if comm == "UnityMain":
        main_pct, main_hit = max_subtree_pct_for_keywords(cg, ec, MAIN_KW)
        if main_pct >= 30:
            return "main_thread", "hit=%s %.1f%%" % (main_hit or "PlayerLoop", main_pct)
        return "main_subthread", "comm=UnityMain no PlayerLoop"

    roots = []
    for c in cg.get("child_graph", [])[:3]:
        fn = c.get("func_name") or ""
        if fn:
            roots.append(fn[:60])
    if roots:
        return "unidentified", "top=%s" % " | ".join(roots)
    return "unidentified", "empty call graph"


def tag_all_threads(profile, grand_total_ec):
    from .naming import thread_key as _thread_key

    out = []
    for _pname, th in profile.iter_threads():
        if th["event_count"] <= 0:
            continue
        identity, evidence = tag_thread(profile, th, grand_total_ec)
        g_pct = th["event_count"] / grand_total_ec * 100.0 if grand_total_ec else 0.0
        out.append({
            "key": _thread_key(th),
            "tid": th["tid"],
            "comm": th["thread_name"],
            "identity": identity,
            "identityEvidence": evidence,
            "absSamples": round(g_pct / 100.0 * profile.total_samples),
            "globalPct": round(g_pct, 3),
            "cpuMs": round(th["event_count"] / 1_000_000.0, 1),
        })
    out.sort(key=lambda x: -x["absSamples"])
    return out
