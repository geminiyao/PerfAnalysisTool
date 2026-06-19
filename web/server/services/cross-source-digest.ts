// 跨源证据 digest 构建 (确定性关联层, framework §6 ②)。
// 读多源 Run → 按主题汇证据 JSON, 供 skill 解读或 insights 生成器消费。
//
// 依据: docs/analysis-framework-design.md §2.1/§6, docs/report-spec-and-data-contract.md §0/§5.4。

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runs } from '../db/schema.js';
import { getRunMetrics } from './run-store.js';
import type { CallTree, CallTreeNode, SourceId } from '../../shared/perf-model.js';

type MetricRow = { key: string; value: number; unit: string; source: string };

export interface CrossSourceDigest {
  generatedAt: string;
  run: { id: string; label: string | null; device: string; scene: string; sources: SourceId[]; frameCount: number | null };
  sameCapture: Record<string, unknown>;
  frame: { source: string; def: string; p50Ms: number; p95Ms: number; p99Ms: number; fps: number; slowFrameRate: number }[];
  frameMetricsUnity: Record<string, number | undefined>;
  bottleneckInputs: Record<string, unknown>;
  cpuLibs: { name: string; value: number; unit: string }[];
  cpuThreads: { name: string; value: number; unit: string }[];
  cpuFuncsTopSelf: { name: string; value: number; unit: string }[];
  anchors: { name: string; value: number; unit: string }[];
  symbolCheck: Record<string, unknown> | null;
  scheduling: { name: string; runningPct: number; runnablePct: number; sleepingPct: number }[];
  system: Record<string, unknown>;
  offCpuReasons: Record<string, unknown> | null;
  gc: Record<string, number | undefined>;
  jank: Record<string, number | undefined>;
  unityHotMarkers: {
    name: string; msSelfMean?: number; msSelfMax?: number; percentOfFrame?: number;
    presentOnFrameCount?: number; thread?: string; callChain?: string; mustReport?: boolean;
  }[];
  unitySpikes: {
    name: string; msSelfMedian?: number; msSelfMax?: number; spikeRatio?: number;
    spikeFrameCount?: number; window?: string | null;
  }[];
  unityThreadSummary: unknown[];
  unityBusinessHotNodes: { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string }[];
  simpleperfLayerBreakdown: Record<string, unknown> | null;
  simpleperfBusinessHotNodes: { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string }[];
  perfettoStageBreakdown: { depth: number; name: string; totalPct?: number; selfPct?: number }[];
  perfettoAtraceSlices: Record<string, unknown> | null;
  sourceMapAvailable: boolean;
  mainLoopStages: Record<string, unknown>;
  crossRefs: Record<string, Record<string, { thread: string; name: string; totalPct?: number; selfPct?: number } | undefined>>;
  confidence: Record<string, unknown>;
}

function val(metrics: MetricRow[], key: string): number | undefined {
  return metrics.find(m => m.key === key)?.value;
}

function byPrefix(metrics: MetricRow[], prefix: string, suffix = ''): { name: string; value: number; unit: string }[] {
  return metrics
    .filter(m => m.key.startsWith(prefix) && m.key.endsWith(suffix))
    .map(m => ({ name: m.key.slice(prefix.length, suffix ? m.key.length - suffix.length : undefined), value: m.value, unit: m.unit }))
    .sort((a, b) => b.value - a.value);
}

function topChildren(tree: CallTree | undefined, n = 12): { name: string; totalPct?: number; selfPct?: number; layer?: string }[] {
  if (!tree?.root?.children) return [];
  return [...tree.root.children]
    .sort((a, b) => (b.totalPct ?? 0) - (a.totalPct ?? 0))
    .slice(0, n)
    .map(c => ({ name: c.name, totalPct: c.totalPct, selfPct: c.selfPct, layer: c.layer }));
}

function findNode(trees: CallTree[], kw: string): { thread: string; name: string; totalPct?: number; selfPct?: number } | undefined {
  let best: { thread: string; name: string; totalPct?: number; selfPct?: number } | undefined;
  const low = kw.toLowerCase();
  const walk = (n: CallTreeNode, thread: string) => {
    if (n.name?.toLowerCase().includes(low)) {
      if (!best || (n.totalPct ?? 0) > (best.totalPct ?? 0)) best = { thread, name: n.name, totalPct: n.totalPct, selfPct: n.selfPct };
    }
    n.children?.forEach(c => walk(c, thread));
  };
  for (const t of trees) walk(t.root, t.thread);
  return best;
}

function walkAll(trees: CallTree[], cb: (n: CallTreeNode, thread: string) => void): void {
  const walk = (n: CallTreeNode, thread: string) => { cb(n, thread); n.children?.forEach(c => walk(c, thread)); };
  for (const t of trees) walk(t.root, t.thread);
}

function looksBusiness(name: string): boolean {
  return /^CS:/.test(name) || /_m[0-9A-F]{20,}/.test(name) || /Mgr|Manager/.test(name);
}

function topBusinessNodes(trees: CallTree[], n = 12): { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string }[] {
  const best = new Map<string, { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string }>();
  walkAll(trees, (node, thread) => {
    if (!node.name || !looksBusiness(node.name)) return;
    const cur = best.get(node.name);
    if (!cur || (node.selfPct ?? node.selfMs ?? 0) > (cur.selfPct ?? cur.selfMs ?? 0)) {
      best.set(node.name, { name: node.name, selfPct: node.selfPct, selfMs: node.selfMs, totalPct: node.totalPct, thread });
    }
  });
  return [...best.values()].sort((a, b) => (b.selfPct ?? b.selfMs ?? 0) - (a.selfPct ?? a.selfMs ?? 0)).slice(0, n);
}

function flattenStages(tree: CallTree | undefined, minPct = 2, maxDepth = 6): { depth: number; name: string; totalPct?: number; selfPct?: number }[] {
  if (!tree?.root) return [];
  const out: { depth: number; name: string; totalPct?: number; selfPct?: number }[] = [];
  const walk = (n: CallTreeNode, d: number) => {
    if (d > maxDepth) return;
    for (const c of n.children ?? []) {
      if ((c.totalPct ?? 0) >= minPct) { out.push({ depth: d, name: c.name, totalPct: c.totalPct, selfPct: c.selfPct }); walk(c, d + 1); }
    }
  };
  walk(tree.root, 0);
  return out;
}

/** 从 DB 读多源 Run, 构建证据 digest (只汇集对齐, 不下结论)。 */
export function buildCrossSourceDigest(runId: string): CrossSourceDigest {
  const db = getDb();
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new Error(`Run not found: ${runId}`);

  const metrics = getRunMetrics(runId) as MetricRow[];
  const sources: SourceId[] = JSON.parse(run.sources ?? '[]');
  const frame = JSON.parse(run.coreFrameJson ?? '[]') as { source: string; frameDefinition: string; p50Ms: number; p95Ms: number; p99Ms: number; fps: number; slowFrameRate: number }[];
  const threadsCore = JSON.parse(run.coreThreadsJson ?? '[]') as { source: string; name: string; runningPct: number; runnablePct: number; sleepingPct: number }[];
  const system = JSON.parse(run.coreSystemJson ?? '{}');
  const detail = JSON.parse(run.detailJson ?? '{}') as Record<string, any>;

  const unityTrees: CallTree[] = detail.unity_profiler?.callTrees ?? [];
  const spTrees: CallTree[] = detail.simpleperf?.callTrees ?? [];
  const pfTrees: CallTree[] = detail.perfetto?.callTrees ?? [];

  const unityMainSp = spTrees.find(t => t.thread === 'UnityMain');
  const unityMainPf = pfTrees.find(t => t.thread === 'UnityMain');
  const unityWorst = unityTrees.find(t => /worst/i.test(t.label ?? '')) ?? unityTrees[0];
  const pfUnityMain = threadsCore.find(t => t.name === 'UnityMain');

  const uMarkers: any[] = detail.unity_profiler?.markers ?? [];
  const uSpikes: any[] = detail.unity_profiler?.markerSpikes ?? [];
  const NOISE = /Wait|Idle|Semaphore|Sleep|Mutex|Synchroniz/i;
  const unityHotMarkers = uMarkers
    .filter(m => !NOISE.test(m.name))
    .sort((a, b) => (b.msSelfMean ?? 0) - (a.msSelfMean ?? 0))
    .slice(0, 12)
    .map(m => ({ name: m.name, msSelfMean: m.msSelfMean, msSelfMax: m.msSelfMax, percentOfFrame: m.percentOfFrame, presentOnFrameCount: m.presentOnFrameCount, thread: m.thread, callChain: m.callChain, mustReport: m.mustReport }));
  const unitySpikes = uSpikes
    .map(s => ({ ...s, _w: (s.spikeFrameIndices ?? []) as number[] }))
    .sort((a, b) => (b.spikeRatio ?? 0) - (a.spikeRatio ?? 0))
    .slice(0, 10)
    .map(s => ({ name: s.name, msSelfMedian: s.msSelfMedian, msSelfMax: s.msSelfMax, spikeRatio: s.spikeRatio, spikeFrameCount: s.spikeFrameCount, window: s._w.length ? `${Math.min(...s._w)}–${Math.max(...s._w)}` : null }));

  return {
    generatedAt: new Date().toISOString(),
    run: { id: run.id, label: run.label, device: run.device, scene: run.scene, sources, frameCount: run.frameCount },
    sameCapture: {
      device: run.device,
      simpleperf: { event: detail.simpleperf?.event, recordTime: detail.simpleperf?.recordTime },
      perfetto: { profileWindow: detail.perfetto?.profileWindow, pid: detail.perfetto?.pid },
    },
    frame: frame.map(f => ({ source: f.source, def: f.frameDefinition, p50Ms: f.p50Ms, p95Ms: f.p95Ms, p99Ms: f.p99Ms, fps: f.fps, slowFrameRate: f.slowFrameRate })),
    frameMetricsUnity: {
      fps: val(metrics, 'frame.fps'), avgMs: val(metrics, 'frame.avgMs'), p50Ms: val(metrics, 'frame.p50Ms'),
      p95Ms: val(metrics, 'frame.p95Ms'), p99Ms: val(metrics, 'frame.p99Ms'), maxMs: val(metrics, 'frame.maxMs'),
      slowRate33Ms: val(metrics, 'frame.slowRate33Ms'), jankCount: val(metrics, 'jank.count'), jankRate: val(metrics, 'jank.rate'),
    },
    bottleneckInputs: {
      perfetto_UnityMain: pfUnityMain ? { runningPct: pfUnityMain.runningPct, runnablePct: pfUnityMain.runnablePct, sleepingPct: pfUnityMain.sleepingPct } : undefined,
      simpleperf_UnityMain_cpuPct: val(metrics, 'cpu.thread.UnityMain.pct'),
      gpuBusyPct: system.gpuBusyPct ?? null,
      cpuFreqAvgMhz: system.cpuFreqAvgMhz ?? null,
      throttling: detail.perfetto?.throttling ?? null,
    },
    cpuLibs: byPrefix(metrics, 'cpu.lib.', '.pct').slice(0, 12),
    cpuThreads: byPrefix(metrics, 'cpu.thread.', '.pct').slice(0, 12),
    cpuFuncsTopSelf: byPrefix(metrics, 'cpu.func.', '.selfPct').slice(0, 12),
    anchors: byPrefix(metrics, 'cpu.anchor.', '.subtreePct'),
    symbolCheck: detail.simpleperf?.symbolCheck ?? null,
    scheduling: threadsCore.map(t => ({ name: t.name, runningPct: t.runningPct, runnablePct: t.runnablePct, sleepingPct: t.sleepingPct })),
    system: { cpuFreqAvgMhz: system.cpuFreqAvgMhz, gpuBusyPct: system.gpuBusyPct, binder: system.binder, pssMb: system.pssMb, cpuThrottled: system.cpuThrottled, thermalC: system.thermalC },
    offCpuReasons: detail.perfetto?.offCpuReasons ?? null,
    gc: { allocCount: val(metrics, 'gc.allocCount'), collectMsPerFrame: val(metrics, 'gc.collectMsPerFrame'), markerGCMsPerFrame: val(metrics, 'marker.GC_Collect.msPerFrame') },
    jank: { count: val(metrics, 'jank.count'), bigCount: val(metrics, 'jank.bigCount'), rate: val(metrics, 'jank.rate'), spikeCount: val(metrics, 'spike.count') },
    unityHotMarkers,
    unitySpikes,
    unityThreadSummary: detail.unity_profiler?.threadSummary ?? [],
    unityBusinessHotNodes: topBusinessNodes(unityTrees, 12),
    simpleperfLayerBreakdown: detail.simpleperf?.layerBreakdown ?? null,
    simpleperfBusinessHotNodes: topBusinessNodes(spTrees, 12),
    perfettoStageBreakdown: flattenStages(unityMainPf, 2, 6),
    perfettoAtraceSlices: detail.perfetto?.atraceSlices ?? null,
    sourceMapAvailable: !!detail.unity_profiler?.markerSourceMap,
    mainLoopStages: {
      unity_worstFrame: { tree: unityWorst?.label ?? unityWorst?.thread, top: topChildren(unityWorst) },
      perfetto_UnityMain_atrace: { top: topChildren(unityMainPf) },
      simpleperf_UnityMain_native: { top: topChildren(unityMainSp) },
    },
    crossRefs: {
      scripting_update: {
        unity: findNode(unityTrees, 'BehaviourUpdate') ?? findNode(unityTrees, 'Update.ScriptRun'),
        simpleperf: findNode(spTrees, 'GameLauncher_Update') ?? findNode(spTrees, 'Runtime::Invoke'),
        perfetto: findNode(pfTrees, 'ScriptRunBehaviourUpdate') ?? findNode(pfTrees, 'PlayerLoop'),
      },
      lua: {
        unity: findNode(unityTrees, 'Lua'),
        simpleperf: findNode(spTrees, 'luaV_execute') ?? findNode(spTrees, 'lua_pcall'),
        perfetto: findNode(pfTrees, 'LuaMgr') ?? findNode(pfTrees, 'Lua:'),
      },
      rendering_canvas: {
        unity: findNode(unityTrees, 'Canvas') ?? findNode(unityTrees, 'Render'),
        simpleperf: findNode(spTrees, 'libGLESv2') ?? findNode(spTrees, 'Render'),
        perfetto: findNode(pfTrees, 'Canvas') ?? findNode(pfTrees, 'URP'),
      },
    },
    confidence: JSON.parse(run.coreConfidenceJson ?? '{}'),
  };
}
