"""验证 wrapper vs 真热点"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('docs/report/_intermediate/stressmove/simpleperf-profile.json', encoding='utf-8') as f:
    sm = json.load(f)
with open('docs/report/_intermediate/base/simpleperf-profile.json', encoding='utf-8') as f:
    base = json.load(f)

sm_total = sm['meta']['totalSamples']
base_total = base['meta']['totalSamples']


def find_max_subtree(profile, search_kw, thread_filter='UnityMain'):
    """在指定线程的 callTree 中找含 search_kw 的最大 totalPct 节点（in-thread pct）。"""
    for t in profile['detail']['simpleperf']['callTrees']:
        if t['thread'] != thread_filter:
            continue
        main_thread_pct = t['root'].get('totalPct', 0)
        best = 0

        def scan(n):
            nonlocal best
            nm = n.get('name', '')
            if search_kw in nm:
                best = max(best, n.get('totalPct', 0))
            for c in n.get('children', []):
                scan(c)
        scan(t['root'])
        return best, main_thread_pct
    return 0, 0


def metric_lookup(prof, key):
    for m in prof['core']['metrics']:
        if m['key'] == key:
            return m['value']
    return 0.0


# 各业务模块（按用户 FrameworkCore 实测调用栈）
modules_main = [
    ('FrameworkCore_OnUpdate（业务总入口）', 'FrameworkCore_OnUpdate'),
    ('LuaMgr_OnUpdate', 'LuaMgr_OnUpdate_m'),
    ('BaseLuaMgr_OnUpdate', 'BaseLuaMgr_OnUpdate'),
    ('TServerManager_OnUpdate', 'TServerManager_OnUpdate'),
    ('TServer_Tick', 'TServer_Tick'),
    ('TServer_DecodeMessages', 'TServer_DecodeMessages'),
    ('TServer_RecvMessages', 'TServer_RecvMessages'),
    ('MapManager_OnUpdate (C#)', 'MapManager_OnUpdate'),
    ('BattleUIManager_OnUpdate', 'BattleUIManager_OnUpdate'),
    ('BattleUIManager_UpdateMUIPos', 'BattleUIManager_UpdateMUIPos'),
    ('BattleUIManager_UpdateSingleUIPos', 'BattleUIManager_UpdateSingleUIPos'),
    ('OutSideViewArmyLineMgr_OnUpdate', 'OutSideViewArmyLineMgr_OnUpdate'),
    ('OutSideViewArmyLineMgr_UpdateStraightMoveLine', 'OutSideViewArmyLineMgr_UpdateStraightMoveLine'),
    ('OutSideViewArmyLineMgr_RefreshArmyLine', 'OutSideViewArmyLineMgr_RefreshArmyLine'),
    ('OutSideViewArmyLineMgr_GetArmyLineID', 'OutSideViewArmyLineMgr_GetArmyLineID'),
    ('OutSideViewArmyLineMgr_OnUpdateLineEffect', 'OutSideViewArmyLineMgr_OnUpdateLineEffect'),
    ('MapManager_OnLateUpdate (C#)', 'MapManager_OnLateUpdate'),
    ('MapManager_MeetScope', 'MapManager_MeetScope'),
]

# 主线程基础占比（用 metrics 拿）
base_main_pct = metric_lookup(base, 'cpu.thread.UnityMain.pct')
sm_main_pct = metric_lookup(sm, 'cpu.thread.UnityMain.pct')

print(f"主线程 (%global): base={base_main_pct}%, stressmove={sm_main_pct}%")
print(f"采样总数: base={base_total}, stressmove={sm_total} (ratio={sm_total/base_total:.3f})\n")
print('=' * 130)
print(f'{"模块":<55} {"base %main":>10} {"sm %main":>10} {"base abs":>10} {"sm abs":>10} {"abs Δ":>10}')
print('=' * 130)
for label, kw in modules_main:
    b_pct, _ = find_max_subtree(base, kw, 'UnityMain')
    s_pct, _ = find_max_subtree(sm, kw, 'UnityMain')
    b_abs = b_pct / 100 * base_main_pct / 100 * base_total
    s_abs = s_pct / 100 * sm_main_pct / 100 * sm_total
    if b_abs == 0 and s_abs == 0:
        continue
    if b_abs > 0:
        delta = (s_abs / b_abs - 1) * 100
        delta_str = f'{delta:+7.1f}%'
    else:
        delta_str = '   N/A '
    print(f'{label:<55} {b_pct:>9.2f}% {s_pct:>9.2f}% {b_abs:>10.0f} {s_abs:>10.0f} {delta_str:>10}')

# ECS / 渲染 Pass 复用之前的代码
print()
print('=' * 130)
print('Burst Job (lib_burst_generated) Top hotspots:')
for label, prof, total in [('base', base, base_total), ('stressmove', sm, sm_total)]:
    print(f'\n  [{label}]')
    for h in prof['detail']['simpleperf'].get('callTrees', []):
        pass
    # 用 summary 的 hotspots
    hs = prof.get('detail', {}).get('simpleperf', {}).get('hotspots', None)
    # full profile 里 hotspots 是 detail.simpleperf 没的，要用 summary
# 直接从 summary 读
for label, name in [('base', 'base'), ('stressmove', 'stressmove')]:
    with open(f'docs/report/_intermediate/{name}/simpleperf-profile-summary.json', encoding='utf-8') as f:
        s = json.load(f)
    print(f'\n  [{label}] Top Burst self% (lib_burst_generated.so):')
    for h in s.get('hotspots', []):
        if 'lib_burst' in h.get('lib', ''):
            absamp = h['pct'] / 100 * (base_total if name == 'base' else sm_total)
            print(f"    {h['pct']:6.3f}% global  abs={absamp:5.0f}  {h['func'][:90]}")

# 业务层 +86.5% 拆分
print()
print('=' * 130)
print('业务层 +86.5% 拆分（按 lib 绝对样本数变化）:')
biz_libs = ['libil2cpp', 'libxlua', 'lib_burst_generated', 'libAOENative', 'libTBUNative', 'libGameNative']
biz_total_delta = 0
for lib in biz_libs:
    b = metric_lookup(base, f'cpu.lib.{lib}.pct')
    s = metric_lookup(sm, f'cpu.lib.{lib}.pct')
    b_abs = b / 100 * base_total
    s_abs = s / 100 * sm_total
    delta = s_abs - b_abs
    biz_total_delta += delta
    if b == 0 and s == 0:
        continue
    delta_pct = (s_abs / b_abs - 1) * 100 if b_abs > 0 else float('inf')
    print(f"  {lib:<28}  base {b:5.2f}% ({b_abs:5.0f})  sm {s:5.2f}% ({s_abs:5.0f})  abs Δ={delta:+5.0f} ({delta_pct:+.1f}%)")
print(f"  业务层总增量 (samples): {biz_total_delta:.0f}")
