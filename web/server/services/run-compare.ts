// P3: 两 Run 对比 — 决策 9 五步 + report-spec §5/§6.3
// 读 runs / run_metrics / detail.callTrees (不碰旧 sessions/maple_* 表)

import type { CallTree, CallTreeNode, Metric, Run, SourceId } from '../../shared/perf-model.js';
import { KNOWN_SOURCE_IDS } from '../../shared/perf-model.js';
import type {
  CallTreeNodeDelta,
  CompareSynthesisItem,
  CompareVerdict,
  ComparabilityLevel,
  MetricDelta,
  PerfettoUniqueCompare,
  RunCompareResult,
  SimpleperfUniqueCompare,
  SourceDiffTree,
  UnityUniqueCompare,
} from '../../shared/run-compare-types.js';
import { getRun } from './run-store.js';
import { buildCompareMarkdown } from './compare-report-builder.js';
import { saveCompareReportMarkdown } from './report-export.js';

function metricVal(metrics: Metric[], key: string, source?: SourceId): number | undefined {
  const m = metrics.find(x => x.key === key && (!source || x.source === source));
  return m?.value;
}

function metricsByPrefix(metrics: Metric[], prefix: string, source: SourceId): Metric[] {
  return metrics.filter(m => m.source === source && m.key.startsWith(prefix));
}

function labelForKey(key: string): string {
  const map: Record<string, string> = {
    'frame.fps': 'FPS',
    'frame.avgMs': '帧均 (ms)',
    'frame.p95Ms': 'P95 (ms)',
    'frame.slowRate33Ms': '慢帧率 (>33ms)',
    'jank.count': 'Jank 次数',
    'jank.bigCount': 'BigJank 次数',
    'jank.rate': 'Jank 率 (%)',
    'gc.allocCount': 'GC.Alloc/帧',
  };
  if (map[key]) return map[key];
  if (key.startsWith('marker.')) return key.replace('marker.', '').replace('.msPerFrame', '');
  if (key.startsWith('cpu.lib.')) return `SO ${key.replace('cpu.lib.', '').replace('.pct', '')}`;
  if (key.startsWith('cpu.thread.')) return `线程 ${key.replace('cpu.thread.', '').replace('.pct', '')}`;
  if (key.startsWith('cpu.func.')) return key.replace('cpu.func.', '').replace('.selfPct', '');
  if (key.startsWith('cpu.anchor.')) return `Anchor ${key.replace('cpu.anchor.', '').replace('.subtreePct', '')}`;
  if (key.startsWith('thread.')) return key.replace('thread.', '').replace(/\.(running|runnable|sleeping)Pct$/, ' $1%');
  if (key === 'system.cpuFreqAvgMhz') return 'CPU 频率 (MHz)';
  if (key === 'system.gpuBusyPct') return 'GPU 忙 (%)';
  return key;
}

function deltaMetric(
  key: string,
  unit: string,
  source: SourceId,
  baseline: number | undefined,
  current: number | undefined,
  lowerIsBetter = true,
): MetricDelta | null {
  if (baseline === undefined && current === undefined) return null;
  const b = baseline ?? 0;
  const c = current ?? 0;
  const delta = c - b;
  const deltaPct = b !== 0 ? Math.round((delta / b) * 1000) / 10 : null;
  const improved = lowerIsBetter ? delta < -0.001 : delta > 0.001;
  return {
    key,
    label: labelForKey(key),
    unit,
    source,
    baseline: b,
    current: c,
    delta: Math.round(delta * 1000) / 1000,
    deltaPct,
    improved,
  };
}

function pairMetrics(
  baseMetrics: Metric[],
  curMetrics: Metric[],
  source: SourceId,
  keys: string[],
  lowerIsBetter = true,
): MetricDelta[] {
  const out: MetricDelta[] = [];
  for (const key of keys) {
    const d = deltaMetric(
      key,
      baseMetrics.find(m => m.key === key)?.unit ?? '%',
      source,
      metricVal(baseMetrics, key, source),
      metricVal(curMetrics, key, source),
      lowerIsBetter,
    );
    if (d) out.push(d);
  }
  return out;
}

function pairByPrefix(
  baseMetrics: Metric[],
  curMetrics: Metric[],
  source: SourceId,
  prefix: string,
  lowerIsBetter = true,
  topN = 12,
): MetricDelta[] {
  const baseMap = new Map(metricsByPrefix(baseMetrics, prefix, source).map(m => [m.key, m]));
  const curMap = new Map(metricsByPrefix(curMetrics, prefix, source).map(m => [m.key, m]));
  const keys = new Set([...baseMap.keys(), ...curMap.keys()]);
  const deltas: MetricDelta[] = [];
  for (const key of keys) {
    const b = baseMap.get(key);
    const c = curMap.get(key);
    const d = deltaMetric(key, b?.unit ?? c?.unit ?? '%', source, b?.value, c?.value, lowerIsBetter);
    if (d) deltas.push(d);
  }
  return deltas
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN);
}

function pickNodeVals(n: CallTreeNode) {
  return {
    selfPct: n.selfPct,
    totalPct: n.totalPct,
    selfMs: n.selfMs,
    totalMs: n.totalMs,
  };
}

function diffCallTreeNodes(
  baseRoot: CallTreeNode,
  curRoot: CallTreeNode,
): CallTreeNodeDelta[] {
  const results: CallTreeNodeDelta[] = [];

  function walk(bNode: CallTreeNode | undefined, cNode: CallTreeNode | undefined) {
    if (!bNode && !cNode) return;
    if (!bNode && cNode) {
      results.push({ name: cNode.name, mask: 'A', layer: cNode.layer, current: pickNodeVals(cNode) });
      for (const ch of cNode.children) walk(undefined, ch);
      return;
    }
    if (bNode && !cNode) {
      results.push({ name: bNode.name, mask: 'D', layer: bNode.layer, baseline: pickNodeVals(bNode) });
      for (const ch of bNode.children) walk(ch, undefined);
      return;
    }
    const b = bNode!;
    const c = cNode!;
    const bPct = b.selfPct ?? b.totalPct ?? 0;
    const cPct = c.selfPct ?? c.totalPct ?? 0;
    const deltaPct = cPct - bPct;
    const bMs = b.selfMs ?? b.totalMs;
    const cMs = c.selfMs ?? c.totalMs;
    const deltaMs = bMs !== undefined && cMs !== undefined ? cMs - bMs : undefined;
    const maybeInlined = Math.abs(deltaPct) > 0.5 && cPct < bPct * 0.1;

    if (Math.abs(deltaPct) > 0.3 || Math.abs(deltaMs ?? 0) > 0.1) {
      results.push({
        name: b.name,
        mask: 'M',
        layer: b.layer ?? c.layer,
        baseline: pickNodeVals(b),
        current: pickNodeVals(c),
        deltaPct: Math.round(deltaPct * 100) / 100,
        deltaMs: deltaMs !== undefined ? Math.round(deltaMs * 100) / 100 : undefined,
        maybeInlined,
      });
    }

    const cChildMap = new Map(c.children.map(ch => [ch.name, ch]));
    const bChildMap = new Map(b.children.map(ch => [ch.name, ch]));
    for (const cn of new Set([...cChildMap.keys(), ...bChildMap.keys()])) {
      walk(bChildMap.get(cn), cChildMap.get(cn));
    }
  }

  walk(baseRoot, curRoot);
  return results;
}

function diffCallTrees(baseTrees: CallTree[], curTrees: CallTree[]): CallTreeNodeDelta[] {
  const all: CallTreeNodeDelta[] = [];
  const curByThread = new Map(curTrees.map(t => [t.thread, t]));

  for (const bt of baseTrees) {
    const ct = curByThread.get(bt.thread);
    if (!ct) continue;
    all.push(...diffCallTreeNodes(bt.root, ct.root));
  }

  for (const ct of curTrees) {
    if (!baseTrees.find(t => t.thread === ct.thread)) {
      all.push(...diffCallTreeNodes({ name: '(root)', children: [] }, ct.root));
    }
  }

  return all
    .sort((a, b) => Math.abs(b.deltaPct ?? b.deltaMs ?? 0) - Math.abs(a.deltaPct ?? a.deltaMs ?? 0))
    .slice(0, 20);
}

function checkComparability(base: Run, current: Run) {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const warnings: string[] = [];

  const deviceOk = !base.meta.device || !current.meta.device || base.meta.device === current.meta.device;
  checks.push({ name: '设备', ok: deviceOk, detail: `${base.meta.device || '?'} vs ${current.meta.device || '?'}` });
  if (!deviceOk) warnings.push('设备不一致, 对比结论可信度降低');

  const sceneOk = !base.meta.scene || !current.meta.scene || base.meta.scene === current.meta.scene;
  checks.push({ name: '场景', ok: sceneOk, detail: `${base.meta.scene || '?'} vs ${current.meta.scene || '?'}` });
  if (!sceneOk) warnings.push('场景名不一致, 请确认是否为同场景');

  const sharedSources = base.sources.filter(s => current.sources.includes(s));
  checks.push({
    name: '源重叠',
    ok: sharedSources.length > 0,
    detail: `共有 ${sharedSources.length} 源: ${sharedSources.join(', ') || '无'}`,
  });
  if (sharedSources.length === 0) warnings.push('两 Run 无共同数据源, 无法做三源差分');

  const frameDelta = Math.abs((base.meta.frameCount ?? 0) - (current.meta.frameCount ?? 0));
  const frameOk = !base.meta.frameCount || !current.meta.frameCount
    || frameDelta <= Math.max(20, (base.meta.frameCount ?? 0) * 0.15);
  checks.push({
    name: '帧数',
    ok: frameOk,
    detail: `${base.meta.frameCount ?? '?'} vs ${current.meta.frameCount ?? '?'} (差 ${frameDelta})`,
  });
  if (!frameOk) warnings.push('帧数偏差 >15%, 帧均指标对比需谨慎');

  const baseTag = `${base.label ?? ''} ${base.meta.version ?? ''} ${base.id}`.toLowerCase();
  const curTag = `${current.label ?? ''} ${current.meta.version ?? ''} ${current.id}`.toLowerCase();
  const looksBase = (t: string) => t.includes('base') && !t.includes('opt');
  const bothBase = looksBase(baseTag) && looksBase(curTag) && base.id !== current.id;
  if (bothBase) {
    warnings.push('两 Run 均似 base 采集, 非 base vs opt — 需采集优化后(opt)数据才有意义');
    checks.push({ name: 'base/opt 配对', ok: false, detail: '未检测到 opt Run' });
  } else {
    checks.push({ name: 'base/opt 配对', ok: true, detail: '已区分基准与对比' });
  }

  const failCount = checks.filter(c => !c.ok).length;
  let level: ComparabilityLevel = 'ok';
  if (failCount >= 2 || sharedSources.length === 0) level = 'not_comparable';
  else if (failCount === 1 || warnings.length > 0) level = 'acceptable';

  return { level, checks, warnings };
}

function buildSourceDiffTree(source: SourceId, base: Run, current: Run): SourceDiffTree | null {
  if (!base.sources.includes(source) || !current.sources.includes(source)) return null;

  const bM = base.profile.core.metrics;
  const cM = current.profile.core.metrics;
  const bDetail = base.profile.detail as Record<string, { callTrees?: CallTree[] }>;
  const cDetail = current.profile.detail as Record<string, { callTrees?: CallTree[] }>;

  let macro: MetricDelta[] = [];
  let note: string | undefined;

  switch (source) {
    case 'unity_profiler':
      macro = [
        ...pairMetrics(bM, cM, source, ['frame.fps', 'frame.avgMs', 'frame.p95Ms', 'frame.slowRate33Ms', 'jank.rate', 'jank.count'], true),
        ...pairByPrefix(bM, cM, source, 'marker.', true, 6),
      ];
      break;
    case 'simpleperf':
      macro = [
        ...pairByPrefix(bM, cM, source, 'cpu.lib.', true, 6),
        ...pairByPrefix(bM, cM, source, 'cpu.thread.', true, 4),
      ];
      break;
    case 'perfetto':
      macro = [
        ...pairByPrefix(bM, cM, source, 'thread.', true, 6),
        ...pairMetrics(bM, cM, source, ['system.cpuFreqAvgMhz', 'system.gpuBusyPct'], true),
      ];
      note = 'perfetto 差分回答「线程在算还是在等变了」, 不回答「哪个函数变了」(那是 simpleperf)';
      break;
    default:
      macro = pairByPrefix(bM, cM, source, '', true, 8);
  }

  const topNodes = diffCallTrees(bDetail[source]?.callTrees ?? [], cDetail[source]?.callTrees ?? []);
  return { source, macro, topNodes, note };
}

function buildUnityUnique(base: Run, current: Run): UnityUniqueCompare | undefined {
  if (!base.sources.includes('unity_profiler') || !current.sources.includes('unity_profiler')) return undefined;
  const bM = base.profile.core.metrics;
  const cM = current.profile.core.metrics;
  const g = (ms: Metric[], k: string) => metricVal(ms, k, 'unity_profiler') ?? 0;
  return {
    jank: {
      baseline: { count: g(bM, 'jank.count'), bigCount: g(bM, 'jank.bigCount'), rate: g(bM, 'jank.rate'), slowRate33: g(bM, 'frame.slowRate33Ms') },
      current: { count: g(cM, 'jank.count'), bigCount: g(cM, 'jank.bigCount'), rate: g(cM, 'jank.rate'), slowRate33: g(cM, 'frame.slowRate33Ms') },
      delta: {
        count: g(cM, 'jank.count') - g(bM, 'jank.count'),
        bigCount: g(cM, 'jank.bigCount') - g(bM, 'jank.bigCount'),
        rate: g(cM, 'jank.rate') - g(bM, 'jank.rate'),
        slowRate33: g(cM, 'frame.slowRate33Ms') - g(bM, 'frame.slowRate33Ms'),
      },
    },
    topMarkerDeltas: pairByPrefix(bM, cM, 'unity_profiler', 'marker.', true, 10),
  };
}

function buildSimpleperfUnique(base: Run, current: Run): SimpleperfUniqueCompare | undefined {
  if (!base.sources.includes('simpleperf') || !current.sources.includes('simpleperf')) return undefined;
  return {
    soDeltas: pairByPrefix(base.profile.core.metrics, current.profile.core.metrics, 'simpleperf', 'cpu.lib.', true, 10),
    anchorDeltas: pairByPrefix(base.profile.core.metrics, current.profile.core.metrics, 'simpleperf', 'cpu.anchor.', true, 8),
  };
}

function buildPerfettoUnique(base: Run, current: Run): PerfettoUniqueCompare | undefined {
  if (!base.sources.includes('perfetto') || !current.sources.includes('perfetto')) return undefined;
  const bSys = base.profile.core.system;
  const cSys = current.profile.core.system;
  const systemDeltas: MetricDelta[] = [];
  const freq = deltaMetric('system.cpuFreqAvgMhz', 'mhz', 'perfetto', bSys.cpuFreqAvgMhz, cSys.cpuFreqAvgMhz, false);
  const gpu = deltaMetric('system.gpuBusyPct', '%', 'perfetto', bSys.gpuBusyPct, cSys.gpuBusyPct, true);
  if (freq) systemDeltas.push(freq);
  if (gpu) systemDeltas.push(gpu);
  let throttleNote: string | undefined;
  if (bSys.cpuThrottled !== cSys.cpuThrottled) {
    throttleNote = `降频状态变化: ${bSys.cpuThrottled ? '有' : '无'} → ${cSys.cpuThrottled ? '有' : '无'}`;
  }
  return {
    threadDeltas: pairByPrefix(base.profile.core.metrics, current.profile.core.metrics, 'perfetto', 'thread.', true, 8),
    systemDeltas,
    throttleNote,
  };
}

function inferVerdict(
  comparability: ComparabilityLevel,
  macroDeltas: MetricDelta[],
): { verdict: CompareVerdict; confidence: 'high' | 'medium' | 'low'; reason: string; headline: string } {
  if (comparability === 'not_comparable') {
    return {
      verdict: 'inconclusive',
      confidence: 'low',
      reason: '可比性校验未通过, 不给优化结论',
      headline: '不可比 — 请先对齐场景/设备/采集, 或采集 opt 数据',
    };
  }

  const frameMetrics = macroDeltas.filter(m => m.key.startsWith('frame.') || m.key === 'jank.rate');
  const improved = frameMetrics.filter(m => m.improved).length;
  const degraded = frameMetrics.filter(m => !m.improved && Math.abs(m.delta) > 0.01).length;

  if (improved > degraded && improved >= 2) {
    return {
      verdict: 'effective',
      confidence: comparability === 'ok' ? 'high' : 'medium',
      reason: `帧相关指标 ${improved} 项改善 vs ${degraded} 项恶化`,
      headline: '优化有效 — 帧率/帧时多项改善',
    };
  }
  if (degraded > improved && degraded >= 2) {
    return {
      verdict: 'regression',
      confidence: comparability === 'ok' ? 'high' : 'medium',
      reason: `帧相关指标 ${degraded} 项恶化 vs ${improved} 项改善`,
      headline: '有回归 — 帧率/帧时多项恶化',
    };
  }
  return {
    verdict: 'ineffective',
    confidence: 'medium',
    reason: '帧相关指标无明显同向变化',
    headline: '优化效果不明显 — 关键帧指标变化有限',
  };
}

function buildSynthesis(
  diffTrees: SourceDiffTree[],
  unique: RunCompareResult['unique'],
  comparability: ComparabilityLevel,
): CompareSynthesisItem[] {
  if (comparability === 'not_comparable') return [];

  const items: CompareSynthesisItem[] = [];
  const sourcesWithImprovement = new Set<SourceId>();

  for (const tree of diffTrees) {
    if (tree.macro.filter(m => m.improved && Math.abs(m.delta) > 0.1).length >= 2) {
      sourcesWithImprovement.add(tree.source);
    }
  }

  if (sourcesWithImprovement.size >= 2) {
    items.push({
      kind: 'common',
      sources: [...sourcesWithImprovement],
      conclusion: `多源同向改善 (${[...sourcesWithImprovement].join(' + ')}), 优化方向可信`,
      evidence: '宏观指标在多源上同向变好',
      severity: 'high',
    });
  }

  const topSo = unique.simpleperf?.soDeltas.find(d => d.improved && Math.abs(d.delta) > 0.5);
  if (topSo) {
    items.push({
      kind: 'unique',
      sources: ['simpleperf'],
      conclusion: `${topSo.label} CPU 占比下降 ${Math.abs(topSo.delta).toFixed(1)}pp`,
      evidence: `cpu.lib.* 差分 (${topSo.key})`,
      severity: 'medium',
    });
  }

  if (unique.perfetto?.throttleNote) {
    items.push({
      kind: 'unique',
      sources: ['perfetto'],
      conclusion: unique.perfetto.throttleNote,
      evidence: 'system.cpuThrottled',
      severity: 'medium',
    });
  }

  const jd = unique.unity_profiler?.jank.delta;
  if (jd && (jd.count !== 0 || jd.rate !== 0)) {
    items.push({
      kind: 'unique',
      sources: ['unity_profiler'],
      conclusion: `Jank ${jd.count > 0 ? '增加' : '减少'} ${Math.abs(jd.count)} 次`,
      evidence: 'jank.count / jank.rate',
      severity: jd.count > 0 ? 'high' : 'low',
    });
  }

  for (const tree of diffTrees) {
    const deleted = tree.topNodes.find(n => n.mask === 'D');
    if (deleted) {
      items.push({
        kind: 'unique',
        sources: [tree.source],
        conclusion: `热点消失: ${deleted.name}`,
        evidence: `detail.${tree.source}.callTrees [D]`,
        severity: 'medium',
      });
    }
  }

  return items;
}

/** 对比两个 Run, 产出决策 9 五步结构 */
export function compareRuns(baseRunId: string, currentRunId: string): RunCompareResult {
  if (baseRunId === currentRunId) throw new Error('不能与自身对比');

  const base = getRun(baseRunId);
  const current = getRun(currentRunId);
  if (!base) throw new Error(`基准 Run 不存在: ${baseRunId}`);
  if (!current) throw new Error(`对比 Run 不存在: ${currentRunId}`);

  const comparability = checkComparability(base, current);
  const sharedSources = base.sources.filter(s => current.sources.includes(s));

  const diffTrees: SourceDiffTree[] = [];
  for (const src of KNOWN_SOURCE_IDS) {
    if (sharedSources.includes(src)) {
      const tree = buildSourceDiffTree(src, base, current);
      if (tree) diffTrees.push(tree);
    }
  }

  const allMacro = diffTrees.flatMap(t => t.macro);
  let { verdict, confidence, reason, headline } = inferVerdict(comparability.level, allMacro);

  const noOptPair = comparability.warnings.some(w => w.includes('均似 base'));
  if (noOptPair) {
    headline = '演示对比 — 缺 opt 采集, 结论仅供参考';
    verdict = 'inconclusive';
  }

  const unique = {
    unity_profiler: buildUnityUnique(base, current),
    simpleperf: buildSimpleperfUnique(base, current),
    perfetto: buildPerfettoUnique(base, current),
  };

  const synthesis = buildSynthesis(diffTrees, unique, comparability.level);
  const result: RunCompareResult = {
    baseRunId,
    currentRunId,
    headline,
    verdict,
    confidence,
    verdictReason: reason,
    comparability,
    diffTrees,
    unique,
    synthesis,
    markdown: '',
  };
  result.markdown = buildCompareMarkdown(result);
  result.markdownPath = saveCompareReportMarkdown(baseRunId, currentRunId, result.markdown);
  return result;
}
