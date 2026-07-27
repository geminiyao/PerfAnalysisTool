"""v4 报告补充数据：模块聚合 + Top-N 算法 + base 对应模块。"""
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('docs/report/_intermediate/stressmove/simpleperf-profile.json', encoding='utf-8') as f:
    sm = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile.json', encoding='utf-8') as f:
    base = json.load(f)

base_total = base['meta']['totalSamples']
sm_total = sm['meta']['totalSamples']


def metric(prof, key):
    for m in prof['core']['metrics']:
        if m['key'] == key:
            return m['value']
    return 0


# ===== 模块归一规则 =====
MODULE_RULES = [
    # name, keywords (callTree symbol contains any), scope_thread (None=all)
    ('Wwise 音频中间件', None, None, 'lib_match', 'libAkSoundEngine'),
    ('ECS Burst Job 工作量', None, None, 'lib_match', 'lib_burst_generated'),
    ('MeshUI 迭代位置刷新', ['MUIControlManager', 'MUILayout', 'MUIRendererBase',
                          'MUIText', 'MUISprite', 'MeshUIManager', 'MUIRenderable',
                          'MUIDefaultRenderer', 'MUISpriteSliced'], 'UnityMain', 'subtree_sum_self', None),
    ('行军线刷新（OutSideViewArmyLineMgr）', ['OutSideViewArmyLineMgr', 'OutsideLineCtrl',
                                            'OutsideLineMesh', 'CalculateVertexJob'],
     'UnityMain', 'subtree_sum_self', None),
    ('URP 主线程渲染配置', ['UniversalRenderPipeline', 'RenderCameraStack', 'RenderSingleCamera',
                          'ScriptableRenderer_Execute', 'ExecuteRenderPass', 'ShadowPass',
                          'PlanarShadow', 'DrawRendererPass', 'BloomPass', 'MobileBaseRenderer',
                          'DrawFoliageInstanceRenderers', 'OutsideForestRenderer',
                          'OutsideTreeTypeRenderer', 'TBUBaseFeature', 'TBURenderGraph'],
     'UnityMain', 'subtree_sum_self', None),
    ('RHI 常量缓冲上传', ['ConstantBuffersGLES'], 'Thread-102', 'subtree_sum_self', None),
    ('RHI DrawCall 提交', ['GfxDeviceGLES::DrawBuffers', 'DrawBuffersStereo',
                          'BeforeDrawCall', 'SetVertexStateGLES',
                          'ApplyGpuProgramGLES'], 'Thread-102', 'subtree_sum_self', None),
    ('Lua VM 解释执行', ['luaV_execute', 'luaD_call', 'lua_pcall', 'luaH_get',
                       'propagatemark', 'luaC_step'], None, 'sum_self', None),
    ('Lua GC 工作线程', ['LuaMultiThreadGC_LuaGCThreadProc', 'lua_execute_mtgc',
                       'do_realgc'], None, 'subtree_sum_self', None),
]


def norm(nm):
    nm = re.sub(r'_m[0-9A-F]{32}_gshared$', '', nm)
    nm = re.sub(r'_m[0-9A-F]{32}$', '', nm)
    return nm


def sum_subtree_self_for_module(profile, keywords, scope_thread):
    """按模块归一：扫描线程内所有节点，匹配关键字的 selfPct 累加，全局口径。"""
    total = 0.0
    for t in profile['detail']['simpleperf']['callTrees']:
        if scope_thread is not None and t['thread'] != scope_thread:
            continue
        thread_global_pct = t['root'].get('totalPct', 0)

        def scan(n):
            nonlocal total
            nm = n.get('name', '')
            for kw in keywords:
                if kw in nm:
                    total += n.get('selfPct', 0) * thread_global_pct / 100
                    break
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
    return total


def sum_self_all_threads(profile, keywords):
    """跨线程 sum selfPct."""
    total = 0.0
    for t in profile['detail']['simpleperf']['callTrees']:
        thread_global_pct = t['root'].get('totalPct', 0)

        def scan(n):
            nonlocal total
            nm = n.get('name', '')
            for kw in keywords:
                if kw in nm:
                    total += n.get('selfPct', 0) * thread_global_pct / 100
                    break
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
    return total


def compute_module(profile, total_samples, name, keywords, scope, mode, lib_name):
    if mode == 'lib_match':
        v = metric(profile, f'cpu.lib.{lib_name}.pct')
        return v, v / 100 * total_samples
    if mode == 'subtree_sum_self':
        v = sum_subtree_self_for_module(profile, keywords, scope)
        return v, v / 100 * total_samples
    if mode == 'sum_self':
        v = sum_self_all_threads(profile, keywords)
        return v, v / 100 * total_samples
    return 0, 0


print('=== v4 Top-N (业务模块聚合 + 跨线程，按绝对增量排序) ===')
print(f'{"模块":<40} {"base abs":>10} {"sm abs":>10} {"增量 abs":>12} {"增量%":>10}')
rows = []
for name, kws, scope, mode, lib in MODULE_RULES:
    bp, bas = compute_module(base, base_total, name, kws, scope, mode, lib)
    sp, sas = compute_module(sm, sm_total, name, kws, scope, mode, lib)
    delta_abs = sas - bas
    delta_pct = (sas / bas - 1) * 100 if bas > 0 else float('inf')
    rows.append({
        'name': name, 'base_abs': bas, 'sm_abs': sas,
        'base_pct_g': bp, 'sm_pct_g': sp,
        'delta_abs': delta_abs, 'delta_pct': delta_pct,
    })

rows.sort(key=lambda x: -x['delta_abs'])
for r in rows:
    dp = f'+{r["delta_pct"]:.0f}%' if r['delta_pct'] != float('inf') else 'NEW'
    print(f'{r["name"]:<40} {r["base_abs"]:>10.0f} {r["sm_abs"]:>10.0f} {r["delta_abs"]:>+12.0f} {dp:>10}')

# ===== 模块内 self% 拆细（每个模块 top 5 子节点 self） =====
print('\n=== 模块内部子节点 self 拆细 (sm) ===')


def collect_module_children(profile, keywords, scope_thread):
    hits = {}
    for t in profile['detail']['simpleperf']['callTrees']:
        if scope_thread is not None and t['thread'] != scope_thread:
            continue
        thread_global_pct = t['root'].get('totalPct', 0)

        def scan(n):
            nm = n.get('name', '')
            for kw in keywords:
                if kw in nm:
                    sp = n.get('selfPct', 0) * thread_global_pct / 100
                    if sp > 0:
                        key = norm(nm)
                        hits[key] = hits.get(key, 0) + sp
                    break
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
    return hits


for name, kws, scope, mode, lib in MODULE_RULES:
    if mode != 'subtree_sum_self':
        continue
    print(f'\n--- {name} ---')
    hits = collect_module_children(sm, kws, scope)
    for k, v in sorted(hits.items(), key=lambda x: -x[1])[:10]:
        abs_s = v / 100 * sm_total
        if abs_s < 5:
            break
        print(f'  self {v:6.3f}%g  abs={abs_s:5.0f}  {k[:90]}')
