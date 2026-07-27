"""探查计算脚本：PlayerLoop 各阶段 diff、Lua 总负载、Job 等待去重、Worker 均衡、渲染 Pass。"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('docs/report/_intermediate/stressmove/simpleperf-profile.json', encoding='utf-8') as f:
    sm = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile.json', encoding='utf-8') as f:
    base = json.load(f)

sm_total = sm['meta']['totalSamples']
base_total = base['meta']['totalSamples']


def find_playerloop_stages(profile, main_thread_pct):
    stages = {}
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != 'UnityMain':
            continue

        def find_inner_pl(n):
            """ExecutePlayerLoop 会嵌套两次，钻到最内层。"""
            for c in n.get('children', []):
                if 'ExecutePlayerLoop' in c.get('name', ''):
                    return find_inner_pl(c) or c
            return n

        # 先找第一个 ExecutePlayerLoop
        def find_first(n):
            if 'ExecutePlayerLoop' in n.get('name', ''):
                return n
            for c in n.get('children', []):
                r = find_first(c)
                if r:
                    return r
            return None

        pl_node = find_first(t['root'])
        if not pl_node:
            continue
        inner = find_inner_pl(pl_node)
        keywords = [
            'ScriptRunBehaviourUpdate', 'ScriptRunBehaviourLateUpdate',
            'PlayerSendFrameComplete', 'PlayerUpdateCanvases',
            'ParticleSystemBeginUpdateAll', 'ParticleSystemEndUpdateAll',
            'LegacyAnimationUpdate', 'FinishFrameRendering',
            'UpdateTextureStreamingManager', 'PlayerEmitCanvasGeometry',
            'UpdateAllRenderers', 'SendMouseEvents',
            'PreUpdate', 'EarlyUpdate', 'LuaMultiThreadGC',
            'InitializationSystemGroup', 'SimulationSystemGroup', 'PresentationSystemGroup',
            'TimeUpdate', 'BehaviourFixedUpdate', 'PhysicsUpdate',
        ]
        for c in inner.get('children', []):
            stage_name = c.get('name', '')
            key = None
            for kw in keywords:
                if kw in stage_name:
                    key = kw
                    break
            if key and key not in stages:
                stages[key] = {
                    'name': stage_name[:90],
                    'totalPct_main': c.get('totalPct', 0),
                    'totalPct_global': c.get('totalPct', 0) * main_thread_pct / 100,
                }
        break
    return stages


base_main_pct = 46.10
sm_main_pct = 39.29
base_stages = find_playerloop_stages(base, base_main_pct)
sm_stages = find_playerloop_stages(sm, sm_main_pct)

print('=== PlayerLoop stages: base vs stressmove ===')
print(f'{"stage":<38} {"base%main":>10} {"sm%main":>10} {"base abs":>10} {"sm abs":>10} {"abs delta":>10}')
all_keys = set(base_stages.keys()) | set(sm_stages.keys())
ordered = [
    'ScriptRunBehaviourUpdate', 'InitializationSystemGroup', 'SimulationSystemGroup',
    'PresentationSystemGroup', 'PreUpdate', 'EarlyUpdate', 'BehaviourFixedUpdate',
    'PhysicsUpdate', 'TimeUpdate', 'ScriptRunBehaviourLateUpdate',
    'LegacyAnimationUpdate', 'ParticleSystemBeginUpdateAll',
    'ParticleSystemEndUpdateAll', 'FinishFrameRendering', 'PlayerUpdateCanvases',
    'PlayerEmitCanvasGeometry', 'UpdateAllRenderers', 'PlayerSendFrameComplete',
    'UpdateTextureStreamingManager', 'SendMouseEvents', 'LuaMultiThreadGC',
]
seen = set()
for k in ordered + sorted(all_keys):
    if k in seen or k not in all_keys:
        continue
    seen.add(k)
    b = base_stages.get(k, {})
    s = sm_stages.get(k, {})
    b_pct = b.get('totalPct_main', 0)
    s_pct = s.get('totalPct_main', 0)
    b_abs = b_pct / 100 * base_main_pct / 100 * base_total
    s_abs = s_pct / 100 * sm_main_pct / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else (float('inf') if s_abs > 0 else 0)
    delta_str = f'{delta:+7.1f}%' if delta != float('inf') else '   N/A'
    print(f'{k:<38} {b_pct:>9.2f}% {s_pct:>9.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta_str:>10}')

# Lua 总负载（基础版：libxlua 占比 + il2cpp 内 XLua 桥接路径）
print('\n=== Lua load ===')
for label, prof, total in [('base', base, base_total), ('stressmove', sm, sm_total)]:
    lua_xlua_pct = next((m['value'] for m in prof['core']['metrics']
                       if m['key'] == 'cpu.lib.libxlua.pct'), 0)
    bridge_sum = [0.0]
    bridge_keys = ['XLua', 'xluaL_', 'xlua_', 'CSLua', 'LuaCS', 'LuaCallBack', 'pin_invoke']

    def scan_bridge(n, root_thread_pct):
        name = n.get('name', '')
        if any(k in name for k in bridge_keys):
            bridge_sum[0] += n.get('selfPct', 0) * root_thread_pct / 100
        for c in n.get('children', []):
            scan_bridge(c, root_thread_pct)

    for t in prof['detail']['simpleperf']['callTrees']:
        scan_bridge(t['root'], t['root'].get('totalPct', 0))
    bridge_pct = bridge_sum[0]
    print(f'  {label}: libxlua {lua_xlua_pct:.2f}% + IL2CPP-XLua桥接 {bridge_pct:.3f}% = Lua总 {lua_xlua_pct + bridge_pct:.2f}%')
    print(f'    samples: {(lua_xlua_pct + bridge_pct)/100 * total:.0f}')

# JobWorker 4 条线程负载均衡度
print('\n=== JobWorker thread balance ===')
worker_keys = ['Thread_129', 'Thread_135', 'Thread_136', 'Thread_158']
for label, prof in [('base', base), ('stressmove', sm)]:
    pcts = {}
    for m in prof['core']['metrics']:
        if m['key'].startswith('cpu.thread.'):
            tname = m['key'].replace('cpu.thread.', '').replace('.pct', '')
            if tname in worker_keys:
                pcts[tname] = m['value']
    if pcts:
        vals = list(pcts.values())
        max_v = max(vals)
        min_v = min(vals)
        balance = (max_v - min_v) / min_v * 100 if min_v else 0
        print(f'  {label}: {pcts}')
        print(f'    max-min delta: {balance:.1f}%')

# UnityMain 内 WaitForJobGroupID 全局占比（去重路径）
print('\n=== UnityMain WaitForJobGroupID detection ===')
for label, prof in [('base', base), ('stressmove', sm)]:
    for t in prof['detail']['simpleperf']['callTrees']:
        if t['thread'] != 'UnityMain':
            continue

        main_pct = t['root'].get('totalPct', 0)
        path_seen = set()
        hits = []

        def collect_waits(n, parent_path=''):
            nm = n.get('name', '')
            cur_path = parent_path + '>' + nm[:60]
            if 'WaitForJobGroupID' in nm or 'JobHandle' in nm:
                key = cur_path[-200:]
                if key not in path_seen:
                    path_seen.add(key)
                    hits.append({'pct': n.get('totalPct', 0), 'path': cur_path})
            for c in n.get('children', []):
                collect_waits(c, cur_path)

        collect_waits(t['root'])
        total_thread = sum(h['pct'] for h in hits)
        total_global = total_thread * main_pct / 100
        print(f'  {label}: UnityMain Wait subtree pct (in-thread)={total_thread:.3f}%  global={total_global:.3f}%')
        for h in hits[:6]:
            print(f'    {h["pct"]:.3f}%: ...{h["path"][-110:]}')
        break

# 渲染 Pass 子树（stressmove）
print('\n=== Stressmove rendering pass subtree ===')
targets = [
    'ShadowPass_ProcessShadow', 'PlanarShadow_RenderShadow', 'PlanarShadow_BeginProcessShadow',
    'DrawRendererPass_Execute', 'BloomPass_Execute', 'DrawFoliageInstanceRenderers',
    'OutsideForestRenderer', 'PlayerUpdateCanvases', 'PlayerEmitCanvasGeometry',
    'TextureStreamingManager', 'ParticleSystem_BeginUpdate', 'MobileBaseRenderer_Setup',
]
for t in sm['detail']['simpleperf']['callTrees']:
    if t['thread'] != 'UnityMain':
        continue
    main_pct = t['root'].get('totalPct', 0)
    hits = []

    def find_in_tree(n, depth=0):
        nm = n.get('name', '')
        for tg in targets:
            if tg in nm:
                hits.append({'name': nm[:90], 'totalPct': n.get('totalPct', 0), 'selfPct': n.get('selfPct', 0)})
                break
        for c in n.get('children', []):
            find_in_tree(c, depth + 1)

    find_in_tree(t['root'])
    seen_names = set()
    for h in sorted(hits, key=lambda x: -x['totalPct']):
        if h['name'] in seen_names:
            continue
        seen_names.add(h['name'])
        global_pct = h['totalPct'] * main_pct / 100
        print(f'  thread {h["totalPct"]:6.2f}% / global {global_pct:5.2f}% | {h["name"]}')
    break
