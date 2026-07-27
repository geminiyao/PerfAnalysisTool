"""按全量 callTree 查找 PlayerLoop 各阶段 — 不依赖外层 ExecutePlayerLoop 嵌套结构。"""
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('docs/report/_intermediate/stressmove/simpleperf-profile.json', encoding='utf-8') as f:
    sm = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile.json', encoding='utf-8') as f:
    base = json.load(f)

base_total = base['meta']['totalSamples']
sm_total = sm['meta']['totalSamples']

PHASES = [
    ('ScriptRunBehaviourUpdate', 'UpdateScriptRunBehaviourUpdate'),
    ('ScriptRunBehaviourLateUpdate', 'PreLateUpdateScriptRunBehaviourLateUpdate'),
    ('PlayerSendFrameComplete', 'PostLateUpdatePlayerSendFrameComplete'),
    ('PlayerUpdateCanvases', 'PostLateUpdatePlayerUpdateCanvases'),
    ('ParticleSystemBeginUpdateAll', 'PreLateUpdateParticleSystemBeginUpdateAll'),
    ('ParticleSystemEndUpdateAll', 'PostLateUpdateParticleSystemEndUpdateAll'),
    ('LegacyAnimationUpdate', 'PreLateUpdateLegacyAnimationUpdate'),
    ('FinishFrameRendering', 'PostLateUpdateFinishFrameRendering'),
    ('UpdateTextureStreamingManager', 'EarlyUpdateUpdateTextureStreamingManager'),
    ('PlayerEmitCanvasGeometry', 'PostLateUpdatePlayerEmitCanvasGeometry'),
    ('UpdateAllRenderers', 'PostLateUpdateUpdateAllRenderers'),
    ('SendMouseEvents', 'PreUpdateSendMouseEvents'),
    ('InitializationSystemGroup', 'InitializationSystemGroup'),
    ('SimulationSystemGroup', 'SimulationSystemGroup'),
    ('PresentationSystemGroup', 'PresentationSystemGroup'),
    ('LuaMultiThreadGC', 'LuaMultiThreadGC'),
    ('PhysicsUpdate', 'PhysicsUpdate'),
    ('BehaviourFixedUpdate', 'BehaviourFixedUpdate'),
    ('TimeUpdate', 'TimeUpdate'),
]


def find_phase_in_main(profile, search_kw):
    """全量 UnityMain callTree 中找出含 search_kw 的最大 totalPct 节点。"""
    main_thread_pct = 0
    best = 0
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != 'UnityMain':
            continue
        main_thread_pct = t['root'].get('totalPct', 0)

        def scan(n):
            nonlocal best
            nm = n.get('name', '')
            if search_kw in nm:
                best = max(best, n.get('totalPct', 0))
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
        break
    return best, main_thread_pct


print('=== PlayerLoop stages diff (base vs stressmove) ===')
print(f'{"stage":<35} {"base%main":>10} {"sm%main":>10} {"base abs":>10} {"sm abs":>10} {"delta":>9}')
for label, kw in PHASES:
    b_pct, b_main = find_phase_in_main(base, kw)
    s_pct, s_main = find_phase_in_main(sm, kw)
    b_abs = b_pct / 100 * b_main / 100 * base_total
    s_abs = s_pct / 100 * s_main / 100 * sm_total
    if b_abs == 0 and s_abs == 0:
        continue
    if b_abs > 0:
        delta = (s_abs / b_abs - 1) * 100
        delta_str = f'{delta:+7.1f}%'
    else:
        delta_str = '   N/A'
    print(f'{label:<35} {b_pct:>9.2f}% {s_pct:>9.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta_str:>9}')

# base 的 RenderManager.RenderCameras 占比
print('\n=== base vs stressmove: 主线程主要子树 ===')
KEY_SUBTREES = [
    ('RenderManager::RenderCameras', 'RenderManager::RenderCameras'),
    ('UnityPlayerLoop', 'UnityPlayerLoop'),
    ('nativeRender', 'nativeRender'),
]
for label, kw in KEY_SUBTREES:
    b_pct, b_main = find_phase_in_main(base, kw)
    s_pct, s_main = find_phase_in_main(sm, kw)
    b_abs = b_pct / 100 * b_main / 100 * base_total
    s_abs = s_pct / 100 * s_main / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else 0
    print(f'  {label:<35} base {b_pct:6.2f}%/main → {s_pct:6.2f}%/main  abs Δ {delta:+.1f}%')

# 各 Pass 的 base 数据
print('\n=== base 渲染 Pass（对照 stressmove）===')
for kw in ['PlanarShadow_RenderShadow', 'BloomPass_Execute', 'DrawFoliageInstanceRenderers',
          'OutsideForestRenderer_DrawInternal', 'ShadowPass_ProcessShadow', 'MobileBaseRenderer_Setup',
          'DrawRendererPass_Execute']:
    b_pct, b_main = find_phase_in_main(base, kw)
    s_pct, s_main = find_phase_in_main(sm, kw)
    b_abs = b_pct / 100 * b_main / 100 * base_total
    s_abs = s_pct / 100 * s_main / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else 0
    print(f'  {kw[:35]:<35}  base {b_pct:5.2f}%→ sm {s_pct:5.2f}%  abs Δ {delta:+.1f}%')

# RHI 线程主要子树 base vs stressmove
print('\n=== RHI 线程 (Thread-102) 子树 base vs stressmove ===')


def find_in_rhi(profile, search_kw):
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != 'Thread-102':
            continue
        thread_pct = t['root'].get('totalPct', 0)
        best = 0

        def scan(n):
            nonlocal best
            nm = n.get('name', '')
            if search_kw in nm:
                best = max(best, n.get('totalPct', 0))
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
        return best, thread_pct
    return 0, 0


for kw in ['DrawBuffers', 'ConstantBuffersGLES::UpdateBuffers', 'ConstantBuffersGLES::UpdateCB',
          'eglSwapBuffers', 'PresentFrame', 'JobQueue::WaitForJobGroupID',
          'SetShadersThreadable', 'DynamicVBO::DrawChunk']:
    b_pct, b_th = find_in_rhi(base, kw)
    s_pct, s_th = find_in_rhi(sm, kw)
    b_global = b_pct * b_th / 100
    s_global = s_pct * s_th / 100
    b_abs = b_global / 100 * base_total
    s_abs = s_global / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else 0
    print(f'  {kw[:35]:<35}  base {b_pct:5.2f}%→ sm {s_pct:5.2f}% (in-thread) | global {b_global:.2f}%→{s_global:.2f}% | abs Δ {delta:+.1f}%')
