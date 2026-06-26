"""Gold-style narrative call trees from Provider callTrees JSON (readable names, skip il2cpp noise)."""

import re
from .tree_utils import norm_symbol

# Nodes to skip entirely (promote children)
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

# Friendly renames (substring match)
_FRIENDLY = [
    (r"UniversalRenderPipeline_Render_m", "UniversalRenderPipeline.Render"),
    (r"UniversalRenderPipeline_RenderCameraStack_m", "UniversalRenderPipeline.RenderCameraStack"),
    (r"UniversalRenderPipeline_RenderSingleCamera_m", "UniversalRenderPipeline.RenderSingleCamera"),
    (r"FrameworkCore_OnUpdate_m", "Core.Update → FrameworkCore_OnUpdate"),
    (r"FrameworkCore_OnLateUpdate_m", "Core.LateUpdate"),
    (r"MapManager_OnUpdate_m", "MapManager_OnUpdate"),
    (r"BattleUIManager_OnUpdate_m", "BattleUIManager_OnUpdate"),
    (r"OutSideViewArmyLineMgr_OnUpdate_m", "OutSideViewArmyLineMgr_OnUpdate"),
    (r"OutSideViewArmyLineMgr_UpdateStraightMoveLine_m", "UpdateStraightMoveLine"),
    (r"OutsideLineCtrl_RefreshLine_m", "OutsideLineCtrl.RefreshLine"),
    (r"OutSideViewArmyLineMgr_GetArmyLineID_m", "GetArmyLineID"),
    (r"MUIControlManager_OnLateUpdate_m", "MUIControlManager.OnLateUpdate"),
    (r"MUILayout_Set3DPosition_m", "MUILayout.Set3DPosition"),
    (r"MeshUIManager_OnLateUpdate_m", "MeshUIManager.OnLateUpdate"),
    (r"LuaMgr_OnUpdate_m", "LuaMgr_OnUpdate"),
    (r"GameLauncher_Update_m", "GameLauncher.Update"),
    (r"GameLauncher_LateUpdate_m", "GameLauncher.LateUpdate"),
    (r"MoveChain_SoldierMoveSystem\.SoldierMoveJob", "MoveChain_SoldierMoveSystem.SoldierMoveJob"),
    (r"RotationLerpSystem", "RotationLerpSystem.DoSmoothLerp"),
    (r"WriteInstanceDataJob", "WriteInstanceDataJob"),
    (r"UtilHeightMapBurst", "UtilHeightMapBurst.GetSamplerHeights"),
    (r"SyncViewEntitySystem", "SyncViewEntitySystem"),
    (r"DrawFoliageInstanceRenderers", "DrawFoliageInstanceRenderers"),
    (r"OutsideForestRenderer", "OutsideForestRenderer.DrawInternal"),
    (r"PlanarShadow", "PlanarShadow"),
    (r"BloomPass", "BloomPass.Execute"),
    (r"MobileBaseRenderer_Setup", "MobileBaseRenderer.Setup"),
    (r"TBUBaseFeature", "TBUBaseFeature.AddRenderPasses"),
    (r"ConstantBuffersGLES::UpdateBuffers", "ConstantBuffersGLES.UpdateBuffers"),
    (r"ConstantBuffersGLES::UpdateCB", "ConstantBuffersGLES.UpdateCB"),
    (r"DrawBuffersStereo", "DrawBuffersStereo"),
    (r"BeforeDrawCall", "BeforeDrawCall"),
    (r"SetVertexStateGLES", "SetVertexStateGLES"),
    (r"ApplyGpuProgramGLES", "ApplyGpuProgramGLES"),
    (r"PresentFrame", "PresentFrame"),
    (r"eglSwapBuffers", "eglSwapBuffers"),
]

_ANNOTATIONS = [
    (("MUILayout_Set3DPosition", "MUILayout.Set3DPosition"), "see §4.4 MeshUI"),
    (("MUIControlManager_OnLateUpdate", "MUIControlManager.OnLateUpdate"), "see §4.4 MeshUI"),
    (("MeshUIManager_OnLateUpdate",), "see §4.4 MeshUI"),
    (("OutSideViewArmyLineMgr", "UpdateStraightMoveLine"), "see §4.5 行军线"),
    (("OutsideLineCtrl_RefreshLine", "OutsideLineCtrl.RefreshLine"), "see §4.5 行军线"),
    (("GetArmyLineID",), "see §4.5 行军线"),
    (("__memcpy",), "see §10"),
    (("GC_end_stubborn_change",), "see §10"),
    (("RenderManager::RenderCameras",), "[详见 §6.1]"),
    (("ScriptRunBehaviourLateUpdate",), ""),
    (("luaV_execute", "lua_pcall"), "Lua VM"),
]

_BUSINESS_KW = (
    "FrameworkCore", "MapManager", "BattleUI", "OutSideViewArmyLine", "OutsideLine",
    "MeshUI", "MUILayout", "MUIControl", "LuaMgr", "TServer", "GameLauncher",
    "ScriptRunBehaviour", "PlayerLoop", "TextureStreaming", "ParticleSystem",
    "PlayerUpdateCanvases", "LegacyAnimation", "RenderManager", "UniversalRenderPipeline",
    "DrawRendererPass", "ShadowPass", "BloomPass", "GfxDevice", "DrawBuffers",
    "ConstantBuffers", "SoldierMoveJob", "ArmyMoveJob", "RotationLerp",
)


def friendly_name(raw):
    s = raw.split("→")[-1].strip() if "→" in raw else raw
    s = _HASH_SUFFIX.sub("", s)
    s = norm_symbol(s)
    for pat, repl in _FRIENDLY:
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
            if not any(k in ch.get("name", "") for k in _BUSINESS_KW):
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

_HOT_MODULE_IDS = frozenset({"meshui", "army_line"})


def _bm_map(diff):
    return {m.get("id"): m for m in (diff or {}).get("businessModules", [])}


def _bm_children(diff, module_id):
    m = _bm_map(diff).get(module_id) or {}
    return m.get("children") or []


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


def _render_folded_phase(lines, prefix, branch, phase_node, extra=""):
    pl = phase_node.get("phaseLabel") or friendly_name(phase_node.get("name", ""))
    mk = _gold_markers(phase_node)
    lines.append(_gold_line(
        prefix, branch, pl,
        phase_node.get("absSamples", 0), phase_node.get("mainThreadPct", 0),
        mk, extra=extra + _gold_delta_note(phase_node),
    ))


def _render_lua_warning(lines, prefix):
    lines.append("%s│   └─ ⚠️ Lua 内部管理器名 simpleperf 不可见" % prefix)
    lines.append("%s│       需 Unity Profiler 看 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等" % prefix)


def _render_update_hotspot_block(lines, prefix, mt_root, um_root, main_ms, main_abs, total_samples, diff):
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
                    set3d_self = _sum_bm_self(mesh_kids, "MUILayout_Set3DPosition")
                    lines.append(bu_p + "    └─ MUILayout.Set3DPosition × %d 层递归                            see §4.4 MeshUI" % max(depth, 1))
                    sp = mm_p + "│       "
                    if set3d_self:
                        lines.append(sp + "├─ MUILayout.Set3DPosition 自身代码累加 (%s self)        📈🔴" % set3d_self)
                    mui_self = _sum_bm_self(mesh_kids, "MUIControlManager_OnLateUpdate")
                    if mui_self:
                        lines.append(sp + "├─ MUIControlManager.OnLateUpdate 同支路 (%s self)       📈🔴" % mui_self)
                    enum_self = _sum_meshui_enumerator_self(diff, total_samples)
                    if enum_self:
                        lines.append(sp + "├─ Enumerator.MoveNext × 多处 (~%s self 累加)            📈🔴" % enum_self)
                    fresh = _sum_bm_self(mesh_kids, "FreshVertexAttribute")
                    if fresh:
                        lines.append(sp + "├─ MUIRendererBase.FreshVertexAttribute")
                        lines.append(sp + "│   └─ __memcpy (%s self)                                  see §10.1" % fresh)
                    gc_self = 0
                    for cu in (diff or {}).get("callUpTracing", []):
                        if cu.get("runtime") == "GC_end_stubborn_change":
                            for tc in cu.get("topCallers", []):
                                if "MUILayout_Set3DPosition" in tc.get("callerChain", ""):
                                    gc_self = max(gc_self, int(round(tc.get("globalPct", 0) / 100.0 * total_samples)))
                    if gc_self:
                        lines.append(sp + "├─ GC_end_stubborn_change (%s self)                       📈   see §10.3" % gc_self)
                    sprite_self = _sum_bm_self(mesh_kids, "MUIText_Set3DPosition") + _sum_bm_self(mesh_kids, "MUISprite")
                    if sprite_self:
                        lines.append(sp + "├─ MUIText / MUISprite.Set3DPosition (~%s self)" % sprite_self)
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
                        usl["abs"], usl["pct"], "📈", ann="see §4.5 行军线",
                    ))
                    usl_p = ap + "│   "
                    ref_self = _sum_bm_self(army_kids, "OutsideLineCtrl_RefreshLine")
                    if ref_self:
                        lines.append(usl_p + "├─ OutsideLineCtrl.RefreshLine (%s self)                      📈🔴" % ref_self)
                    job_self = _sum_bm_self(army_kids, "CalculateVertexJob")
                    if job_self:
                        lines.append(usl_p + "├─ CalculateVertexJob.Schedule (%s, Job 调度) 🟢                实际下沉 Worker" % job_self)
                    list_self = _ct_metrics(um_root, "ToNativeList", main_ms, main_abs, total_samples)
                    if list_self and list_self["self"]:
                        lines.append(usl_p + "├─ ListExtensions.ToNativeList (%s, 分配开销)" % list_self["self"])
                    mesh_v_self = _sum_bm_self(army_kids, "OutsideLineMesh_RefreshLineVertex")
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
                ent = _ct_metrics(um_root, "MapEntityManager.GetEntity", main_ms, main_abs, total_samples)
                if ent:
                    lines.append(_gold_line(ap, "├─ ", "MapEntityManager.GetEntity", ent["abs"], ent["pct"], "🟢"))
                exists = _ct_metrics(um_root, "EntityComponentStore.Exists", main_ms, main_abs, total_samples)
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
        lines.append(inner + "    └─ MUIControlManager.OnLateUpdate (%s self)                              📈🔴 see §4.4 MeshUI" % (
            mui_self or mesh.get("absSelf", 0),
        ))
        lines.append(inner + "        └─ ...（与 BattleUIManager.UpdateMUIPos 同 MUILayout 路径汇流）")


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
    hot_ids |= _HOT_MODULE_IDS

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
            _render_folded_phase(lines, pfx, branch, ph, extra)

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
    for keys, note in _ANNOTATIONS:
        if any(k in name for k in keys):
            return note
    return ""


def _is_interesting(name, total_pct, self_pct):
    if any(k in name for k in _BUSINESS_KW):
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

    urp = find_deepest_subtree(rc, "UniversalRenderPipeline_Render_m")
    stack = find_deepest_subtree(rc, "UniversalRenderPipeline_RenderCameraStack")
    single = find_deepest_subtree(rc, "UniversalRenderPipeline_RenderSingleCamera")
    chain = [
        (urp, "UniversalRenderPipeline.Render"),
        (stack, "RenderCameraStack"),
        (single, "RenderSingleCamera"),
    ]
    prefix = ""
    for i, (node, label) in enumerate(chain):
        if not node:
            continue
        branch = "└─ " if i == len(chain) - 1 and not single else "└─ "
        if i > 0:
            prefix = "   " * i
        lines.append(_fmt_tree_line(
            label, _node_main_abs(node, main_ms, main_abs, total_samples), _main_pct(node, main_ms),
            prefix, "└─ " if i == 0 else "   " * (i - 1) + "└─ ",
            node.get("selfPct", 0), _urp_markers(node, total_samples),
        ))

    exec_pass = find_deepest_subtree(single or rc, "ScriptableRenderer_ExecuteRenderPass")
    if exec_pass:
        pfx = "      "
        lines.append(_fmt_tree_line(
            "ScriptableRenderer.Execute → ExecuteRenderPass",
            _node_main_abs(exec_pass, main_ms, main_abs, total_samples), _main_pct(exec_pass, main_ms),
            pfx, "├─ ", exec_pass.get("selfPct", 0), _urp_markers(exec_pass, total_samples),
        ))
        pfx2 = pfx + "│  "
        pass_specs = [
            ("DrawRendererPass_Execute", "DrawRendererPass", [
                ("DrawFoliageInstanceRenderers", "DrawFoliageInstanceRenderers"),
                ("OutsideForestRenderer_DrawInternal", "OutsideForestRenderer.DrawInternal"),
                ("OutsideTreeTypeRenderer_DrawForestCell", "OutsideTreeTypeRenderer.DrawForestCell"),
            ]),
            ("PlanarShadow", "ShadowPass.ProcessShadow", [
                ("PlanarShadow_RenderShadow", "PlanarShadow.RenderShadow"),
                ("PlanarShadow_BeginProcessShadow", "PlanarShadow.BeginProcessShadow"),
            ]),
            ("BloomPass", "BloomPass.Execute", []),
        ]
        for j, (kw, label, subs) in enumerate(pass_specs):
            node = find_deepest_subtree(exec_pass, kw)
            if not node:
                continue
            br = "├─ " if j < len(pass_specs) - 1 else "└─ "
            lines.append(_fmt_tree_line(
                label, _node_main_abs(node, main_ms, main_abs, total_samples), _main_pct(node, main_ms),
                pfx2, br, node.get("selfPct", 0), _urp_markers(node, total_samples),
            ))
            spfx = pfx2 + ("│  " if j < len(pass_specs) - 1 else "   ")
            for k, (skw, slabel) in enumerate(subs):
                sub = find_deepest_subtree(node, skw)
                if not sub:
                    continue
                sbr = "└─ " if k == len(subs) - 1 else "├─ "
                lines.append(_fmt_tree_line(
                    slabel, _node_main_abs(sub, main_ms, main_abs, total_samples), _main_pct(sub, main_ms),
                    spfx, sbr, sub.get("selfPct", 0), _urp_markers(sub, total_samples),
                ))

    setup = find_deepest_subtree(single or rc, "MobileBaseRenderer_Setup") or find_deepest_subtree(
        single or rc, "SetupRenderPassFromFeatures")
    if setup:
        lines.append(_fmt_tree_line(
            friendly_name(setup.get("name", "MobileBaseRenderer.Setup")),
            _node_main_abs(setup, main_ms, main_abs, total_samples), _main_pct(setup, main_ms),
            "   ", "└─ ", setup.get("selfPct", 0), _urp_markers(setup, total_samples),
        ))
        feat = find_deepest_subtree(setup, "TBUBaseFeature") or find_deepest_subtree(setup, "SetupRenderPassFromFeatures")
        if feat:
            lines.append(_fmt_tree_line(
                friendly_name(feat.get("name", "SetupRenderPassFromFeatures")),
                _node_main_abs(feat, main_ms, main_abs, total_samples), _main_pct(feat, main_ms),
                "      ", "└─ ", feat.get("selfPct", 0), _urp_markers(feat, total_samples),
            ))
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
        for kw, lbl in [("SetVertexStateGLES", "SetVertexStateGLES"), ("ApplyGpuProgramGLES", "ApplyGpuProgramGLES")]:
            n = find_deepest_subtree(draw, kw)
            if n:
                rhi_line(n, "   │  ", "├─ ", lbl)

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


def collect_burst_jobs(call_trees, total_samples, top_k=11):
    hits = {}
    labels = {
        "SoldierMoveJob": ("MoveChain_SoldierMoveSystem.SoldierMoveJob", "ECS 士兵移动"),
        "ArmyMoveJob": ("MoveChain_ArmyMoveSystem.ArmyMoveJob", "ECS 队伍移动"),
        "RotationLerpSystem": ("RotationLerpSystem.DoSmoothLerp", "ECS 旋转插值"),
        "WriteInstanceDataJob": ("WriteInstanceDataJob", "GPU Instancing 数据回写"),
        "UtilHeightMapBurst": ("UtilHeightMapBurst.GetSamplerHeights", "地形高度采样"),
        "SyncViewEntitySystem": ("SyncViewEntitySystem", "ECS → 显示同步"),
        "LocalToParentSystem": ("LocalToParentSystem.ChildLocalToWorld", "Transform 层级变换"),
        "OnStepMove": ("SoldierMoveJob.OnStepMove", "ECS 单步移动"),
        "SyncLogicEntitySystem": ("SyncLogicEntitySystem", "ECS 逻辑同步"),
        "ArchiveSoldier": ("MoveChain_SoldierMoveSystem.ArchiveSoldier", "ECS 士兵归档"),
        "RefreshCurPosition": ("ArmyMoveSystem.RefreshCurPosition", "ECS 路径点刷新"),
    }
    for tree in call_trees or []:
        th = tree.get("thread", "")
        if not any(x in th for x in ("Thread-129", "Thread-135", "Thread-136", "Thread-158")):
            continue
        nodes = []
        _walk_all_nodes(tree.get("root"), nodes)
        for n in nodes:
            nm = n.get("name", "")
            for key, (display, module) in labels.items():
                if key in nm:
                    abs_s = _self_abs(n, total_samples) or _abs_samples(n, total_samples)
                    if abs_s <= 0:
                        continue
                    g = n.get("selfPct", 0) or n.get("totalPct", 0)
                    prev = hits.get(display)
                    if not prev or abs_s > prev["abs"]:
                        hits[display] = {"abs": abs_s, "globalPct": g, "module": module}
    rows = sorted(hits.items(), key=lambda x: -x[1]["abs"])[:top_k]
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
