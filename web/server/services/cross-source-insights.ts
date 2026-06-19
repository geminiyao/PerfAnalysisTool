// 跨源 insights 结构化生成 (去用例化, 决策 5: evidence = { source, detail }[])。
// 读证据 digest → Insight[] + headline, 供 analysis_reports 入库。
//
// 依据: docs/performance-platform-requirements-v2.md §8, docs/report-spec-and-data-contract.md §0/§6。

import type { Confidence, Insight, InsightSeverity, SourceId } from '../../shared/perf-model.js';
import type { CrossSourceDigest } from './cross-source-digest.js';

function slug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64).toLowerCase() || 'unknown';
}

function fmtPct(v: number | undefined, digits = 1): string {
  return v == null ? '?' : `${v.toFixed(digits)}`;
}

function fmtMs(v: number | undefined, digits = 2): string {
  return v == null ? '?' : `${v.toFixed(digits)}ms`;
}

/** 统计 crossRef 主题下 ≥2 源有命中。 */
function crossRefSources(ref: Record<string, { name: string } | undefined>): SourceId[] {
  const map: Record<string, SourceId> = { unity: 'unity_profiler', simpleperf: 'simpleperf', perfetto: 'perfetto' };
  return Object.entries(ref)
    .filter(([, v]) => v?.name)
    .map(([k]) => map[k])
    .filter((s): s is SourceId => !!s);
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
  const sources = digest.run.sources;

  // —— 瓶颈定型 ——
  if (pfMain && pfMain.runningPct >= 70 && (spMainPct == null || spMainPct >= 25)) {
    const evidence: Insight['evidence'] = [];
    if (pfMain) evidence.push({ source: 'perfetto', detail: `UnityMain Running ${fmtPct(pfMain.runningPct)}% (Sleeping ${fmtPct(pfMain.sleepingPct)}%)` });
    if (spMainPct != null) evidence.push({ source: 'simpleperf', detail: `UnityMain 占全机 CPU ${fmtPct(spMainPct)}% (cpu.thread.UnityMain.pct)` });
    insights.push({
      id: 'bottleneck.cpu_bound',
      severity: 'critical',
      confidence: evidence.length >= 2 ? 'high' : 'medium',
      sources: evidence.map(e => e.source),
      evidence,
      conclusion: '主线程 CPU-bound: perfetto 显示 UnityMain 高 Running%, simpleperf 印证主线程占全机 CPU 首位',
      recommendation: '优先削减主线程脚本/渲染命令构建耗时; 等待型优化 (vsync/GPU) 非首要杠杆',
    });
  } else if (pfMain && pfMain.sleepingPct >= 30) {
    insights.push({
      id: 'bottleneck.wait_type',
      severity: 'high',
      confidence: 'medium',
      sources: ['perfetto'],
      evidence: [{ source: 'perfetto', detail: `UnityMain Sleeping ${fmtPct(pfMain.sleepingPct)}% / Running ${fmtPct(pfMain.runningPct)}%` }],
      conclusion: '主线程等待型瓶颈: Sleeping 占比高, CPU 计算不是首要限制',
      recommendation: '排查 vsync/GPU 呈现等待、锁竞争或 binder 阻塞; 补采 GPU busy / FrameTimeline',
    });
  }

  const throttle = bi.throttling;
  if (throttle?.level && throttle.level !== 'none') {
    insights.push({
      id: 'bottleneck.thermal_throttle',
      severity: 'high',
      confidence: throttle.level === 'confirmed' ? 'high' : 'medium',
      sources: ['perfetto'],
      evidence: [{ source: 'perfetto', detail: `降频 level=${throttle.level}, 大核可达 ${fmtPct(throttle.bigCoreReachPct)}% (detail.perfetto.throttling)` }],
      conclusion: `[推断] 存在热降频/频率受限, CPU 时间解读需打折`,
      recommendation: '复采时带 sysfs thermal 旁路做确认级判定; 对比前确认两 run 温控条件一致',
    });
  }

  // —— 帧口径可比性 ——
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
      conclusion: `多帧口径并存 (${defs}), 禁直接相减; 帧率以 playerloop 口径为准`,
      recommendation: notes.length ? notes.join('; ') : '对比帧率前对齐口径与采样窗口',
    });
  }

  const pfWindow = (digest.sameCapture.perfetto as { profileWindow?: { durMs?: number } } | undefined)?.profileWindow;
  if (pfWindow?.durMs != null && digest.frameMetricsUnity.avgMs && digest.run.frameCount) {
    const unityWindowSec = (digest.frameMetricsUnity.avgMs * digest.run.frameCount) / 1000;
    if (pfWindow.durMs < unityWindowSec * 0.5) {
      insights.push({
        id: 'frame.window_mismatch',
        severity: 'medium',
        confidence: 'high',
        sources: ['perfetto', 'unity_profiler'],
        evidence: [
          { source: 'perfetto', detail: `profileWindow ${fmtMs(pfWindow.durMs)} (detail.perfetto.profileWindow)` },
          { source: 'unity_profiler', detail: `约 ${unityWindowSec.toFixed(1)}s / ${digest.run.frameCount} 帧 (frame.avgMs × frameCount)` },
        ],
        conclusion: 'perfetto 采样窗口短于 unity 覆盖窗口, 跨源占比对账需注意窗口差异',
      });
    }
  }

  // —— GPU 数据缺失 ——
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

  // —— 跨源印证 (crossRefs) ——
  for (const [topic, ref] of Object.entries(digest.crossRefs)) {
    const hitSources = crossRefSources(ref);
    if (hitSources.length < 2) continue;
    const evidence = (['unity', 'simpleperf', 'perfetto'] as const)
      .map(k => {
        const node = ref[k];
        if (!node?.name) return null;
        const src: SourceId = k === 'unity' ? 'unity_profiler' : k;
        const pct = node.totalPct ?? node.selfPct;
        return { source: src, detail: `${node.name} totalPct=${fmtPct(pct)}% (detail.${src}.callTrees)` };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);

    const labels: Record<string, string> = {
      scripting_update: '脚本 Update 阶段',
      lua: 'Lua 调度/执行',
      rendering_canvas: '渲染/Canvas 阶段',
    };
    insights.push({
      id: `cross.${topic}`,
      severity: 'high',
      confidence: hitSources.length >= 3 ? 'high' : 'medium',
      sources: hitSources,
      evidence,
      conclusion: `[共性] ${labels[topic] ?? topic}: ${hitSources.length} 源同向命中`,
    });
  }

  // —— perfetto 主循环阶段 (depth=0 的 top 阶段) ——
  const topStages = digest.perfettoStageBreakdown.filter(s => s.depth <= 1).slice(0, 4);
  for (const stage of topStages) {
    if ((stage.totalPct ?? 0) < 5) continue;
    insights.push({
      id: `perfetto.stage.${slug(stage.name)}`,
      severity: (stage.totalPct ?? 0) >= 20 ? 'high' : 'medium',
      confidence: 'high',
      sources: ['perfetto'],
      evidence: [{ source: 'perfetto', detail: `${stage.name} 占 UnityMain ${fmtPct(stage.totalPct)}% (detail.perfetto.callTrees)` }],
      conclusion: `主循环阶段 ${stage.name} 占主线程 ${fmtPct(stage.totalPct)}%`,
    });
  }

  // —— unity Top 热点 (动态, 去用例化) ——
  const GC_MARKER = /^GC/i;
  const PRESENT = /PresentFrame|WaitForPresent|Gfx\.Wait/i;
  for (const m of digest.unityHotMarkers.slice(0, 6)) {
    if (/^PlayerLoop$/i.test(m.name)) continue;
    const matchedSp = digest.simpleperfBusinessHotNodes.find(n =>
      m.name.includes(n.name.replace(/^CS:/, '')) || n.name.toLowerCase().includes(m.name.split('.').pop()?.toLowerCase() ?? ''),
    );
    const evidence: Insight['evidence'] = [
      { source: 'unity_profiler', detail: `marker.${m.name} self ${fmtMs(m.msSelfMean)}/帧, 占帧 ${fmtPct(m.percentOfFrame)}% (${m.presentOnFrameCount}/${digest.run.frameCount} 帧)` },
    ];
    const hitSources: SourceId[] = ['unity_profiler'];
    if (matchedSp) {
      evidence.push({ source: 'simpleperf', detail: `${matchedSp.name} selfPct=${fmtPct(matchedSp.selfPct)}% (detail.simpleperf.callTrees)` });
      hitSources.push('simpleperf');
    }

    let severity: InsightSeverity = 'medium';
    let recommendation: string | undefined;
    if (GC_MARKER.test(m.name)) {
      severity = 'critical';
      recommendation = '削减每帧 GC.Alloc 次数与分配量, 避免同步 GC.Collect 慢帧';
    } else if (PRESENT.test(m.name)) {
      severity = 'medium';
      recommendation = '[推断] 可能含呈现等待; 需 GPU/FrameTimeline 数据区分 CPU vs 等 GPU';
    } else if ((m.percentOfFrame ?? 0) >= 5) {
      severity = 'high';
      recommendation = `审计 ${m.name} 每帧更新逻辑, 考虑降频/裁剪/缓存`;
    }

    insights.push({
      id: `hotspot.marker.${slug(m.name)}`,
      severity,
      confidence: hitSources.length >= 2 ? 'high' : 'medium',
      sources: hitSources,
      evidence,
      conclusion: `热点 marker ${m.name}: self ${fmtMs(m.msSelfMean)}/帧 (${fmtPct(m.percentOfFrame)}% 占帧)`,
      recommendation,
    });
  }

  // —— GC 分配压力 ——
  const allocCount = digest.gc.allocCount;
  if (allocCount != null && allocCount >= 50) {
    insights.push({
      id: 'gc.allocation_pressure',
      severity: allocCount >= 100 ? 'critical' : 'high',
      confidence: 'high',
      sources: ['unity_profiler'],
      evidence: [
        { source: 'unity_profiler', detail: `gc.allocCount=${fmtPct(allocCount, 1)}/帧` },
        ...(digest.gc.markerGCMsPerFrame != null
          ? [{ source: 'unity_profiler' as SourceId, detail: `marker.GC_Collect.msPerFrame=${fmtMs(digest.gc.markerGCMsPerFrame)}/帧` }]
          : []),
      ],
      conclusion: `每帧 GC 分配 ${fmtPct(allocCount, 1)} 次, 易触发 GC 慢帧`,
      recommendation: '消除 Update/LateUpdate 热路径上的临时分配 (List/Dictionary/字符串拼接)',
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
      evidence: [{
        source: 'unity_profiler',
        detail: `${s.name} spikeRatio=${fmtPct(s.spikeRatio, 1)}x, max=${fmtMs(s.msSelfMax)}, 窗口帧 ${s.window ?? '?'}`,
      }],
      conclusion: `波动热点 ${s.name}: P95/P99 来源, spike ${fmtPct(s.spikeRatio, 1)}x`,
      recommendation: `定位帧窗口 ${s.window ?? '?'} 的触发条件 (粒子爆发/批渲染/场景事件)`,
    });
  }

  // —— simpleperf 独有 ——
  const sym = digest.symbolCheck as { status?: string; appSymbolizedPct?: number; anchorsResolved?: number; anchorsTotal?: number } | null;
  if (sym?.status) {
    const conf: Confidence = sym.status === 'FAIL' ? 'low' : sym.status === 'PASS_WITH_WARNING' ? 'medium' : 'high';
    insights.push({
      id: 'unique.simpleperf.symbol_check',
      severity: sym.status === 'FAIL' ? 'high' : 'info',
      confidence: conf,
      sources: ['simpleperf'],
      evidence: [{
        source: 'simpleperf',
        detail: `symbolCheck=${sym.status}, appSymbolized=${sym.appSymbolizedPct ?? '?'}%, anchors ${sym.anchorsResolved ?? 0}/${sym.anchorsTotal ?? 0}`,
      }],
      conclusion: sym.status === 'FAIL'
        ? '[独有] simpleperf 符号校验 FAIL, 函数级结论不可靠'
        : `[独有] simpleperf 符号校验 ${sym.status}`,
      recommendation: sym.status === 'FAIL' ? '补齐符号/binary cache 后复跑' : undefined,
    });
  }

  const atraceOverhead = digest.cpuFuncsTopSelf.find(f => /vfprintf|atrace|snprintf/i.test(f.name));
  if (atraceOverhead && atraceOverhead.value >= 2) {
    insights.push({
      id: 'unique.simpleperf.atrace_overhead',
      severity: 'medium',
      confidence: 'high',
      sources: ['simpleperf'],
      evidence: [{ source: 'simpleperf', detail: `${atraceOverhead.name} selfPct=${fmtPct(atraceOverhead.value)}% (cpu.func.*)` }],
      conclusion: '[独有] 采集时 atrace 埋点开销抬高业务函数占比 (观测偏差)',
      recommendation: '正式采样关闭 atrace; 跨源对比时扣除该开销',
    });
  }

  // —— 排序: severity 权重 + 保持生成顺序内的稳定 ——
  const sevOrder: Record<InsightSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  insights.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // —— headline (结论先行) ——
  const bottleneck = insights.find(i => i.id.startsWith('bottleneck.'));
  const topHot = insights.find(i => i.id.startsWith('hotspot.') && i.severity !== 'info');
  const fps = digest.frameMetricsUnity.fps;
  const parts: string[] = [];
  if (bottleneck) parts.push(bottleneck.conclusion.split(':')[0] ?? bottleneck.conclusion);
  if (fps != null) parts.push(`约 ${fmtPct(fps, 1)}fps`);
  if (topHot) {
    const name = topHot.id.replace('hotspot.marker.', '').replace(/_/g, ' ');
    parts.push(`头号热点 ${name}`);
  }
  const headline = parts.length
    ? parts.join('; ')
    : `跨源综合分析 (${sources.join('+')})`;

  return { insights, headline };
}
