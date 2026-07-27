"""v3 报告所需全部数据一次性抽全。"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('docs/report/_intermediate/stressmove/simpleperf-profile.json', encoding='utf-8') as f:
    sm = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile.json', encoding='utf-8') as f:
    base = json.load(f)

base_total = base['meta']['totalSamples']
sm_total = sm['meta']['totalSamples']


def thread_pct(prof, name):
    for m in prof['core']['metrics']:
        if m['key'] == f'cpu.thread.{name}.pct':
            return m['value']
    return 0.0


def lib_pct(prof, name):
    for m in prof['core']['metrics']:
        if m['key'] == f'cpu.lib.{name}.pct':
            return m['value']
    return 0.0


# === 1. 库占比 ===
print('\n=== 1. 库占比 ===')
libs = ['libunity', 'libil2cpp', 'libxlua', 'libAkSoundEngine', 'lib_burst_generated',
        'libGLESv2_adreno', 'libc', 'libm', 'libart', 'libAOENative', 'libTBUNative',
        'libGameNative', 'libdl', 'libandroid_runtime', 'libnativehelper']
print(f'{"lib":<25} {"base%":>8} {"sm%":>8} {"base abs":>10} {"sm abs":>10} {"delta%":>10}')
for l in libs:
    b = lib_pct(base, l)
    s = lib_pct(sm, l)
    if b == 0 and s == 0:
        continue
    b_abs = b / 100 * base_total
    s_abs = s / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else 0
    print(f'{l:<25} {b:>7.2f}% {s:>7.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta:>+9.1f}%')

# === 2. 线程占比 ===
print('\n=== 2. 线程占比 ===')
threads = ['UnityMain', 'Thread_102', 'UnityGfxRenderS', 'NativeThread',
           'Thread_129', 'Thread_135', 'Thread_136', 'Thread_158',
           'AAudio_1', 'UnityChoreograp', 'Thread_9']
print(f'{"thread":<25} {"base%":>8} {"sm%":>8} {"base abs":>10} {"sm abs":>10} {"delta%":>10}')
for t in threads:
    b = thread_pct(base, t)
    s = thread_pct(sm, t)
    if b == 0 and s == 0:
        continue
    b_abs = b / 100 * base_total
    s_abs = s / 100 * sm_total
    delta = (s_abs / b_abs - 1) * 100 if b_abs > 0 else (float('inf') if s_abs > 0 else 0)
    print(f'{t:<25} {b:>7.2f}% {s:>7.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta:>+9.1f}%')


# === 3. 主线程内"剥洋葱"后真热点 Top-N ===
print('\n=== 3. 主线程剥洋葱后真热点 (按 abs self 降序) ===')


def collect_self_hotspots(profile, thread_name='UnityMain', min_self_pct=0.05):
    """收集 callTree 内所有 selfPct >= min_self_pct 的节点，作为真热点候选。"""
    hits = []
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != thread_name:
            continue
        thread_total_pct = t['root'].get('totalPct', 0)

        def scan(n, parent_chain):
            nm = n.get('name', '')
            self_pct = n.get('selfPct', 0)
            tot_pct = n.get('totalPct', 0)
            if self_pct >= min_self_pct:
                # 跳过通用 wrapper symbol
                hits.append({
                    'name': nm,
                    'selfPct': self_pct,
                    'totalPct': tot_pct,
                    'global_self_pct': self_pct * thread_total_pct / 100,
                    'global_total_pct': tot_pct * thread_total_pct / 100,
                    'parent': parent_chain[-1] if parent_chain else '',
                })
            for c in n.get('children', []):
                scan(c, parent_chain + [nm[:60]])
        scan(t['root'], [])
        break
    return hits


sm_hits = collect_self_hotspots(sm)
base_hits = collect_self_hotspots(base)

# 名字归一：去掉 mangle id _m...
import re


def normalize(nm):
    nm = re.sub(r'_m[0-9A-F]{32}_gshared$', '', nm)
    nm = re.sub(r'_m[0-9A-F]{32}$', '', nm)
    return nm[:100]


# 把同名节点合并（callTree forest 会重复展开）
agg = {}
for h in sm_hits:
    k = normalize(h['name'])
    if k not in agg:
        agg[k] = {'self_pct_max': 0, 'self_pct_sum': 0, 'global_self': 0, 'parents': set()}
    agg[k]['self_pct_max'] = max(agg[k]['self_pct_max'], h['selfPct'])
    agg[k]['self_pct_sum'] += h['selfPct']
    agg[k]['global_self'] += h['global_self_pct']
    if h['parent']:
        agg[k]['parents'].add(normalize(h['parent']))

agg_base = {}
for h in base_hits:
    k = normalize(h['name'])
    if k not in agg_base:
        agg_base[k] = {'global_self': 0}
    agg_base[k]['global_self'] += h['global_self_pct']

print(f'{"function":<80} {"sm self%g":>10} {"sm abs":>8} {"base abs":>8} {"delta":>10}')
items = sorted(agg.items(), key=lambda x: -x[1]['global_self'])
for k, v in items[:35]:
    abs_sm = v['global_self'] / 100 * sm_total
    abs_base = agg_base.get(k, {}).get('global_self', 0) / 100 * base_total
    if abs_sm < 30:  # 噪音过滤
        continue
    delta_str = f'{(abs_sm/abs_base - 1)*100:+.0f}%' if abs_base > 0 else 'NEW'
    print(f'{k:<80} {v["global_self"]:>9.3f}% {abs_sm:>8.0f} {abs_base:>8.0f} {delta_str:>10}')

# === 4. Burst Job (Worker 线程) 真热点 ===
print('\n=== 4. Burst Job Top (Worker 线程, lib_burst_generated) ===')
worker_pct = sum(thread_pct(sm, f'Thread_{i}') for i in ['129', '135', '136', '158'])
print(f'  worker 总占比 sm = {worker_pct:.2f}% global')

# 从 stressmove summary 拿 hotspots
with open('docs/report/_intermediate/stressmove/simpleperf-profile-summary.json', encoding='utf-8') as f:
    sms = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile-summary.json', encoding='utf-8') as f:
    bs = json.load(f)

base_burst = {}
for h in bs.get('hotspots', []):
    if 'lib_burst' in h.get('lib', ''):
        base_burst[normalize(h['func'])] = h['pct']

sm_burst = {}
for h in sms.get('hotspots', []):
    if 'lib_burst' in h.get('lib', ''):
        sm_burst[normalize(h['func'])] = h['pct']

print(f'{"burst job":<90} {"sm%g":>8} {"sm abs":>8} {"base abs":>8} {"delta":>10}')
for k, v in sorted(sm_burst.items(), key=lambda x: -x[1])[:15]:
    abs_sm = v / 100 * sm_total
    abs_base = base_burst.get(k, 0) / 100 * base_total
    delta = f'{(abs_sm/abs_base - 1)*100:+.0f}%' if abs_base > 0 else 'NEW'
    print(f'{k:<90} {v:>7.3f}% {abs_sm:>8.0f} {abs_base:>8.0f} {delta:>10}')


# === 5. PlayerLoop 阶段 ===
print('\n=== 5. PlayerLoop 阶段 ===')
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
    ('LuaMultiThreadGC', 'LuaMultiThreadGC'),
]


def find_max_subtree(profile, kw, thread='UnityMain'):
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != thread:
            continue
        thread_total_pct = t['root'].get('totalPct', 0)
        best = 0

        def scan(n):
            nonlocal best
            if kw in n.get('name', ''):
                best = max(best, n.get('totalPct', 0))
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
        return best, thread_total_pct
    return 0, 0


base_main = thread_pct(base, 'UnityMain')
sm_main = thread_pct(sm, 'UnityMain')

print(f'{"phase":<35} {"base%main":>10} {"sm%main":>10} {"base abs":>10} {"sm abs":>10} {"delta":>10}')
for label, kw in PHASES:
    b_pct, _ = find_max_subtree(base, kw)
    s_pct, _ = find_max_subtree(sm, kw)
    b_abs = b_pct / 100 * base_main / 100 * base_total
    s_abs = s_pct / 100 * sm_main / 100 * sm_total
    if b_abs == 0 and s_abs == 0:
        continue
    delta = f'{(s_abs/b_abs - 1)*100:+.0f}%' if b_abs > 0 else 'NEW'
    print(f'{label:<35} {b_pct:>9.2f}% {s_pct:>9.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta:>10}')

# === 6. RHI 线程子树 ===
print('\n=== 6. RHI 线程 (Thread-102) 子树 ===')
RHI = [
    'GfxDeviceWorker::RunCommand', 'DrawBuffers',
    'ConstantBuffersGLES::UpdateBuffers', 'ConstantBuffersGLES::UpdateCB',
    'BeforeDrawCall', 'PresentFrame', 'eglSwapBuffers',
    'JobQueue::WaitForJobGroupID', 'SetShadersThreadable',
    'SetVertexStateGLES', 'ApplyGpuProgramGLES', 'DynamicVBO::DrawChunk',
]
base_rhi = thread_pct(base, 'Thread_102')
sm_rhi = thread_pct(sm, 'Thread_102')

print(f'{"symbol":<40} {"base%rhi":>10} {"sm%rhi":>10} {"base abs":>10} {"sm abs":>10} {"delta":>10}')
for kw in RHI:
    b_pct, _ = find_max_subtree(base, kw, 'Thread-102')
    s_pct, _ = find_max_subtree(sm, kw, 'Thread-102')
    b_abs = b_pct / 100 * base_rhi / 100 * base_total
    s_abs = s_pct / 100 * sm_rhi / 100 * sm_total
    if b_abs == 0 and s_abs == 0:
        continue
    delta = f'{(s_abs/b_abs - 1)*100:+.0f}%' if b_abs > 0 else 'NEW'
    print(f'{kw:<40} {b_pct:>9.2f}% {s_pct:>9.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta:>10}')
