// 跨源 insights 结构化生成 (去用例化, 决策 5: evidence = { source, detail }[])。
// 读证据 digest → Insight[] + headline, 供 analysis_reports 入库。
//
// Phase 4+ 重写：headline + 共性/独有/建议三个章节全部基于 Phase 1-3 新字段
// (alignedHotNodes / nativeReverseCallStack / offCpuAttribution / unityCallTreeComposite)，
// 业务模块名直接出现在结论里，不再用 "Update.ScriptRunBehaviourUpdate" 这种泛阶段。
//
// 依据: docs/performance-platform-requirements-v2.md §8, docs/report-spec-and-data-contract.md §0/§6。

import type { Confidence, Insight, InsightSeverity, SourceId } from '../../shared/perf-model.js';
import type { CrossSourceDigest, AlignedHotNode, IndentedNode } from './cross-source-digest.js';

function slug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64).toLowerCase() || 'unknown';
}

function fmtPct(v: number | undefined | null, digits = 1): string {
  return v == null ? '?' : `${v.toFixed(digits)}`;
}

function fmtMs(v: number | undefined | null, digits = 2): string {
  return v == null ? '?' : `${v.toFixed(digits)}ms`;
}

/** 从合成缩进树里挑 gcAllocCount > minAlloc 的业务子树（[[methodology_gc_alloc_attribution]]）。 */
function pickGcAllocSubtrees(nodes: IndentedNode[], minAlloc = 50): { name: string; depth: number; gcAllocCount: number; totalMs?: number; totalPct?: number; sourceFrame?: string }[] {
  return nodes
    .filter(n => (n.gcAllocCount ?? 0) >= minAlloc)
    .sort((a, b) => (b.gcAllocCount ?? 0) - (a.gcAllocCount ?? 0))
    .slice(0, 8)
    .map(n => ({ name: n.name, depth: n.depth, gcAllocCount: n.gcAllocCount!, totalMs: n.totalMs, totalPct: n.totalPct, sourceFrame: n.sourceFrame }));
}

/** 从对位表里挑高价值候选：业务模块、双/三源命中、非泛阶段（不是 PlayerLoop / Update 顶层）。 */
function pickActionableHotNodes(aligned: AlignedHotNode[]): AlignedHotNode[] {
  const NOISE_NAME = /^PlayerLoop$|^Update\.|^LateUpdate\.|^PreLateUpdate\.|^Initialization$/;
  return aligned.filter(a => {
    if (NOISE_NAME.test(a.shortKey)) return false;
    return a.unity && (a.perfetto || a.simpleperf);
  }).slice(0, 6);
}

/** 从对位表里挑"仅 unity 命中"的，作为待补强候选。 */
function pickUnityOnlyHotNodes(aligned: AlignedHotNode[]): AlignedHotNode[] {
  return aligned.filter(a => a.conflict?.kind === 'missing_source' && a.unity).slice(0, 4);
}

/** 从 digest 确定性生成结构化 insights (不依赖用例 prompt)。 */
export function generateCrossSourceInsights(digest: CrossSourceDigest): { insights: Insight[]; headline: string } {
  const insights: Insight[] = [];
  const bi = digest.bottleneckInputs as {
    perfetto_UnityMain?: { runningPct: number; sleepingPct: number; runnablePct: number };
    simpleperf_UnityMain_cpuPct?: number;
    gpuBusyPct?: number | null;
    throttling?: { level?: string; bigCoreReachPct?: number };
  };

  const pfMain = bi.perfetto_UnityMain;
  const spMainPct = bi.simpleperf_UnityMain_cpuPct;
  const off = digest.offCpuAttribution;
  const tev = digest.throttlingEvidence;
  const actionable = pickActionableHotNodes(digest.alignedHotNodes);
  const unityOnly = pickUnityOnlyHotNodes(digest.alignedHotNodes);
  const gcSubtrees = pickGcAllocSubtrees(digest.unityCallTreeComposite, 50);

  // —— 瓶颈定型（结合 offCpuAttribution 拆"在算还是在等"）——
  if (pfMain && pfMain.runningPct >= 70 && (spMainPct == null || spMainPct >= 25)) {
    const evidence: Insight['evidence'] = [];
    evidence.push({ source: 'perfetto', detail: `UnityMain Running ${fmtPct(pfMain.runningPct)}% (Sleeping ${fmtPct(pfMain.sleepingPct)}%)` });
    if (spMainPct != null) evidence.push({ source: 'simpleperf', detail: `UnityMain 占全机 CPU ${fmtPct(spMainPct)}%` });
    insights.push({
      id: 'bottleneck.cpu_bound',
      severity: 'critical',
      confidence: evidence.length >= 2 ? 'high' : 'medium',
      sources: evidence.map(e => e.source),
      evidence,
      conclusion: '主线程 CPU-bound: UnityMain 几乎全程在算代码，不是在等 GPU/锁/vsync',
      recommendation: '优先削减主线程业务模块耗时（见 §4 对位表）；等待型优化非首要杠杆',
    });
  } else if (pfMain && pfMain.sleepingPct >= 30) {
    const evidence: Insight['evidence'] = [{ source: 'perfetto', detail: `UnityMain Sleeping ${fmtPct(pfMain.sleepingPct)}% / Running ${fmtPct(pfMain.runningPct)}%` }];
    const cat = off.byCategory;
    let dominant = '';
    if (cat.gpu_wait.pctOfMain >= 5) dominant = `等 GPU ${fmtPct(cat.gpu_wait.pctOfMain)}% (slice: ${cat.gpu_wait.sliceNames.join(',')})`;
    else if (cat.vsync_wait.pctOfMain >= 3) dominant = `等 vsync ${fmtPct(cat.vsync_wait.pctOfMain)}%`;
    else if (cat.gc_stw.pctOfMain >= 3) dominant = `GC STW 暂停 ${fmtPct(cat.gc_stw.pctOfMain)}%`;
    if (dominant) evidence.push({ source: 'perfetto', detail: dominant });
    insights.push({
      id: 'bottleneck.wait_type',
      severity: 'high',
      confidence: dominant ? 'high' : 'medium',
      sources: ['perfetto'],
      evidence,
      conclusion: dominant
        ? `主线程等待型瓶颈：核心增量是${dominant}`
        : '主线程等待型瓶颈：Sleeping 占比高，但等什么细分数据不足',
      recommendation: dominant.includes('等 GPU')
        ? '降 drawcall / 缩 transparent pass，从渲染端缓解 GPU 压力'
        : dominant.includes('GC STW')
          ? '削减 GC.Alloc 触发的同步 GC（见 §5 GC 业务归因）'
          : '补采 GPU busy / FrameTimeline 后再判 GPU-bound',
    });
  }

  // —— 降频证据链 ——
  if (tev.verdict !== 'none') {
    const ev: Insight['evidence'] = [
      { source: 'perfetto', detail: `verdict=${tev.verdict}, sidecar=${tev.sidecarAvailable ? 'sysfs 旁路确认' : 'cpufreq 推测'}` },
    ];
    if (tev.bigCoreReachPct != null) ev.push({ source: 'perfetto', detail: `大核 reach ${fmtPct(tev.bigCoreReachPct)}%` });
    if (tev.thermal.after?.tempsMaxC != null) ev.push({ source: 'perfetto', detail: `温度 max=${tev.thermal.after.tempsMaxC}°C${tev.thermal.deltaC != null ? ` (Δ${tev.thermal.deltaC > 0 ? '+' : ''}${tev.thermal.deltaC}°C)` : ''}` });
    insights.push({
      id: 'bottleneck.thermal_throttle',
      severity: tev.verdict === 'confirmed' ? 'high' : 'medium',
      confidence: tev.verdict === 'confirmed' ? 'high' : tev.verdict === 'likely' ? 'medium' : 'low',
      sources: ['perfetto'],
      evidence: ev,
      conclusion: tev.verdict === 'confirmed' ? '确认级降频：sysfs scaling_max < cpuinfo_max 或 cooling 激活'
        : tev.verdict === 'likely' ? 'likely 档降频：温度高 / cooling 风险'
          : '推测级降频：cpufreq 背离主线程负载',
      recommendation: '考虑场景级温度感知降级（降分辨率 / 关阴影）；正式采集带 thermal 旁路文件做确认级判定',
    });
  }

  // —— §8.1 共性结论：基于 alignedHotNodes 的真实业务对位 ——
  for (const a of actionable) {
    const sources: SourceId[] = ['unity_profiler'];
    if (a.perfetto) sources.push('perfetto');
    if (a.simpleperf) sources.push('simpleperf');

    const ev: Insight['evidence'] = [];
    if (a.unity) ev.push({ source: 'unity_profiler', detail: `${a.unity.name} self ${fmtPct(a.unity.selfPct)}% / total ${fmtPct(a.unity.totalPct)}%` });
    if (a.perfetto) ev.push({ source: 'perfetto', detail: `${a.perfetto.name} totalPct=${fmtPct(a.perfetto.totalPct)}% (matched by '${a.perfetto.matchedBy}')` });
    if (a.simpleperf) ev.push({ source: 'simpleperf', detail: `${a.simpleperf.name} totalPct=${fmtPct(a.simpleperf.totalPct)}% (matched by '${a.simpleperf.matchedBy}')` });

    let selfBound = '';
    if (a.unity?.selfPct && a.unity?.totalPct && a.unity.totalPct > 0) {
      const ratio = a.unity.selfPct / a.unity.totalPct;
      if (ratio > 0.7) selfBound = `；self/total=${(ratio * 100).toFixed(0)}% → 自身循环即瓶颈，优化收益高`;
    }

    insights.push({
      id: `cross.module.${slug(a.shortKey)}`,
      severity: (a.unity?.totalPct ?? 0) >= 5 ? 'high' : 'medium',
      confidence: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
      sources,
      evidence: ev,
      conclusion: `[共性] **${a.shortKey}** 业务模块 ${sources.length} 源同向命中${selfBound}`,
      recommendation: a.shortKey.includes('Lua')
        ? `审计 ${a.shortKey} 内部 Lua 调度逻辑（OnTick/OnUpdate/OnLateUpdate 几个回调），降频或缓存上帧结果`
        : a.shortKey.includes('Mgr') || a.shortKey.includes('Manager')
          ? `${a.shortKey} 每帧更新成本明显，考虑按距离/可见性裁剪、增量更新、降频`
          : `审计 ${a.shortKey} 的每帧逻辑`,
    });
  }

  // —— §5 GC 业务子树归因（[[methodology_gc_alloc_attribution]]）——
  if (gcSubtrees.length) {
    const ev: Insight['evidence'] = gcSubtrees.slice(0, 5).map(g => ({
      source: 'unity_profiler' as SourceId,
      detail: `${g.name} 每帧 alloc=${g.gcAllocCount} 次, 总耗时 ${fmtMs(g.totalMs)}, 占帧 ${fmtPct(g.totalPct)}%`,
    }));
    insights.push({
      id: 'gc.allocation_attribution',
      severity: gcSubtrees[0].gcAllocCount >= 100 ? 'critical' : 'high',
      confidence: 'high',
      sources: ['unity_profiler'],
      evidence: ev,
      conclusion: `[GC 业务归因] 每帧 alloc 次数最多的业务子树：${gcSubtrees.slice(0, 3).map(g => `${g.name}(${g.gcAllocCount})`).join(', ')}`,
      recommendation: `按 [methodology_gc_alloc_attribution]：每帧 alloc>100 即 hot allocation。优先消除上述业务子树里的临时分配（List/Dictionary/字符串拼接/装箱/lambda 闭包）`,
    });
  } else if (digest.gc.allocCount != null && digest.gc.allocCount >= 50) {
    insights.push({
      id: 'gc.allocation_pressure',
      severity: digest.gc.allocCount >= 100 ? 'critical' : 'high',
      confidence: 'medium',
      sources: ['unity_profiler'],
      evidence: [{ source: 'unity_profiler', detail: `gc.allocCount=${fmtPct(digest.gc.allocCount, 1)}/帧（注：缺业务子树归因数据，无法定位到具体模块）` }],
      conclusion: `每帧 GC 分配 ${fmtPct(digest.gc.allocCount, 1)} 次，易触发 GC 慢帧`,
      recommendation: '补 gcAllocCount 标注到 callTree 节点后做业务子树归因',
    });
  }

  // —— Top 波动 ——
  for (const s of digest.unitySpikes.slice(0, 3)) {
    if ((s.spikeRatio ?? 0) < 3) continue;
    insights.push({
      id: `spike.marker.${slug(s.name)}`,
      severity: (s.spikeRatio ?? 0) >= 10 ? 'high' : 'medium',
      confidence: 'medium',
      sources: ['unity_profiler'],
      evidence: [{ source: 'unity_profiler', detail: `${s.name} spikeRatio=${fmtPct(s.spikeRatio, 1)}× max=${fmtMs(s.msSelfMax)} 帧窗口 ${s.window ?? '?'}` }],
      conclusion: `波动热点 ${s.name}: P95/P99 主要来源, spike ${fmtPct(s.spikeRatio, 1)}×`,
      recommendation: `定位帧窗口 ${s.window ?? '?'} 的触发条件（粒子爆发 / 批渲染 / 场景事件）`,
    });
  }

  // —— §8.2 各源独有问题：基于真实数据 ——

  if (unityOnly.length) {
    insights.push({
      id: 'unique.simpleperf.coverage_gap',
      severity: 'info',
      confidence: 'high',
      sources: ['unity_profiler'],
      evidence: unityOnly.slice(0, 3).map(a => ({
        source: 'unity_profiler' as SourceId,
        detail: `${a.shortKey} unity self=${fmtPct(a.unity?.selfPct)}% 但 simpleperf/perfetto 未命中`,
      })),
      conclusion: `[独有] ${unityOnly.length} 个业务模块仅 unity 命中，simpleperf/perfetto 漏采`,
      recommendation: 'simpleperf 符号化率不足或 sample 时长过短可能导致漏采；检查 binary_cache 和采集时长',
    });
  }

  if (digest.nativeReverseCallStack.length) {
    const top3 = digest.nativeReverseCallStack.slice(0, 3);
    insights.push({
      id: 'unique.simpleperf.native_reverse',
      severity: 'medium',
      confidence: 'high',
      sources: ['simpleperf'],
      evidence: top3.map(e => ({
        source: 'simpleperf' as SourceId,
        detail: `${e.func} (selfPct=${e.selfPct.toFixed(2)}%) 来源调用链: ${e.callers.slice(-3).map(c => c.name.slice(0, 40)).join(' ← ')}`,
      })),
      conclusion: `[独有] simpleperf native 反向追溯：${top3.map(e => e.func).join(', ')} 等热函数已锁定上游业务调用源`,
      recommendation: top3.some(e => /memcpy|memset|memmove/i.test(e.func))
        ? `${top3.find(e => /memcpy/i.test(e.func))?.func ?? 'memcpy'} 高占比通常来自 GPU Instancing 数据上传或 MeshUI 顶点拷贝，对应 caller 优化 dirty flag`
        : '审计高占比 native 函数的上游 caller 看是否有可优化路径',
    });
  }

  const soBreak = digest.simpleperfSoBreakdown;
  const business = soBreak?.layers.find(l => l.layer === 'business');
  if (business) {
    const il2cpp = business.libs.find(lb => /libil2cpp/i.test(lb.name));
    const xlua = business.libs.find(lb => /libxlua/i.test(lb.name));
    if (il2cpp && xlua) {
      const ratio = il2cpp.pct / Math.max(xlua.pct, 0.01);
      insights.push({
        id: 'unique.simpleperf.business_layer',
        severity: 'info',
        confidence: 'high',
        sources: ['simpleperf'],
        evidence: [
          { source: 'simpleperf', detail: `libil2cpp ${il2cpp.pct.toFixed(2)}% (C# 业务) vs libxlua ${xlua.pct.toFixed(2)}% (Lua VM) → C#/Lua 比 ${ratio.toFixed(1)}×` },
          { source: 'simpleperf', detail: `business 层占比 ${business.pct.toFixed(1)}% (项目自身代码)` },
        ],
        conclusion: ratio < 2
          ? `[独有] C# 与 Lua 负载相近 (C#/Lua=${ratio.toFixed(1)}×)，Lua 比重偏高`
          : `[独有] C# 主导业务负载 (C#/Lua=${ratio.toFixed(1)}×)`,
        recommendation: ratio < 2 ? '关注 LuaMgr.OnTick 等 Lua 调度子树（见 §4 对位表）' : '正常 C# 主导形态',
      });
    }
  }

  if (off.sleepingPct != null && off.sleepingPct >= 5) {
    const cat = off.byCategory;
    const breakdown: string[] = [];
    if (cat.gpu_wait.pctOfMain > 0) breakdown.push(`等 GPU ${fmtPct(cat.gpu_wait.pctOfMain)}%`);
    if (cat.vsync_wait.pctOfMain > 0) breakdown.push(`等 vsync ${fmtPct(cat.vsync_wait.pctOfMain)}%`);
    if (cat.gc_stw.pctOfMain > 0) breakdown.push(`GC STW ${fmtPct(cat.gc_stw.pctOfMain)}%`);
    if (cat.lock_wait.pctOfMain > 0) breakdown.push(`等锁 ${fmtPct(cat.lock_wait.pctOfMain)}%`);
    if (cat.other_sleep.pctOfMain > 0) breakdown.push(`其他 ${fmtPct(cat.other_sleep.pctOfMain)}%`);

    insights.push({
      id: 'unique.perfetto.off_cpu_attribution',
      severity: 'info',
      confidence: off.dataSource === 'sched_blocked_reason' ? 'high' : 'medium',
      sources: ['perfetto'],
      evidence: [{ source: 'perfetto', detail: `Sleeping ${fmtPct(off.sleepingPct)}% 拆分: ${breakdown.join(', ')}` }],
      conclusion: `[独有] perfetto off-CPU 归因：${breakdown.slice(0, 2).join(', ')} 是主要等待源`,
      recommendation: off.dataSource === 'atrace_proxy'
        ? '采集开 sched_blocked_reason 后归因可达 high 置信（华为非 root 物理不可达，需 root 设备）'
        : undefined,
    });
  }

  // —— 帧口径可比性 / GPU 缺数据 ——
  if (digest.frame.length >= 2) {
    const defs = digest.frame.map(f => `${f.source}:${f.def}(${fmtPct(f.fps, 1)}fps)`).join(' vs ');
    const notes = (digest.confidence.notes as string[] | undefined) ?? [];
    insights.push({
      id: 'frame.comparability',
      severity: 'info',
      confidence: 'high',
      sources: digest.frame.map(f => f.source as SourceId),
      evidence: digest.frame.map(f => ({
        source: f.source as SourceId,
        detail: `${f.def} p50=${fmtMs(f.p50Ms)} fps=${fmtPct(f.fps, 1)} slowRate=${fmtPct(f.slowFrameRate)}%`,
      })),
      conclusion: `多帧口径并存 (${defs}), 禁直接相减; 帧率以 playerloop 为准`,
      recommendation: notes.length ? notes.join('; ') : '对比帧率前对齐口径',
    });
  }

  if (bi.gpuBusyPct == null) {
    insights.push({
      id: 'system.gpu_data_missing',
      severity: 'info',
      confidence: 'high',
      sources: ['perfetto'],
      evidence: [{ source: 'perfetto', detail: 'system.gpuBusyPct 缺失, 无 FrameTimeline' }],
      conclusion: 'GPU 是否次级瓶颈无法定论 (数据缺失)',
      recommendation: '采集开 GPU counter + actual_frame_timeline 后再判 GPU-bound',
    });
  }

  const sevOrder: Record<InsightSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  insights.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // —— headline (用真实业务模块) ——
  const bottleneck = insights.find(i => i.id.startsWith('bottleneck.'));
  const fps = digest.frameMetricsUnity.fps;
  const parts: string[] = [];
  if (bottleneck) parts.push(bottleneck.conclusion.split(/[:：]/)[0]);
  if (fps != null) parts.push(`${fmtPct(fps, 1)}fps`);

  const topHot = actionable.sort((a, b) => (b.unity?.totalPct ?? 0) - (a.unity?.totalPct ?? 0))[0];
  if (topHot) parts.push(`头号业务模块 ${topHot.shortKey}`);
  if (gcSubtrees.length && gcSubtrees[0].gcAllocCount >= 100) parts.push(`GC alloc 集中于 ${gcSubtrees[0].name.slice(0, 30)}`);

  const headline = parts.length
    ? parts.join('; ')
    : `跨源综合分析 (${digest.run.sources.join('+')})`;

  return { insights, headline };
}
