// 跨源证据 digest 构建 (确定性关联层, framework §6 ②)。
// 读多源 Run → 按主题汇证据 JSON, 供 skill 解读或 insights 生成器消费。
//
// 依据: docs/analysis-framework-design.md §2.1/§6, docs/report-spec-and-data-contract.md §0/§5.4。

import fs from 'fs';
import path from 'path';
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
  // Phase 1a 新增（依据 .claude/skills/cross-source-analysis/SKILL.md "Step 2 主轴/独家/元信息"）：
  unityCallTreeComposite: IndentedNode[];                                       // unity worstFrame ∪ medianFrame 合成缩进树
  perfettoCallTreeIndented: { thread: string; nodes: IndentedNode[] }[];        // perfetto 关键线程缩进树原貌
  simpleperfCallTreeIndented: { thread: string; nodes: IndentedNode[] }[];      // simpleperf 关键线程缩进树原貌
  simpleperfSoBreakdown: SoBreakdown | null;                                    // so 分层（business/engine/runtime/middleware/noise）
  threadCategory: { name: string; cpuPct: number; category: ThreadCategory; reason: string }[];
  capabilityMatrix: { dimension: string; status: 'ok' | 'partial' | 'missing'; note: string }[];
  sameCaptureExt: {
    durationMs: { unity?: number; perfetto?: number; simpleperf?: number };
    durationDriftPct: number | null;
    timestamps: { unity?: string; perfetto?: string; simpleperf?: string };
    timeOffsetMaxMin: number | null;
    verdict: 'aligned' | 'partial' | 'unaligned';
  };
  // Phase 1b: 降频证据链（thermal/cpuinfo 旁路 + cpufreq 推测合一）
  throttlingEvidence: ThrottlingEvidence;
  // Phase 2: off-CPU 等待分类 + 多线程互等
  offCpuAttribution: OffCpuAttribution;
  interThreadWait: InterThreadWait;
  // Phase 3: 三源业务节点对位 + 冲突标注 + native 反向
  alignedHotNodes: AlignedHotNode[];
  nativeReverseCallStack: NativeReverseEntry[];
  confidence: Record<string, unknown>;
}

export interface AlignedHotNode {
  /** 业务节点显示名（unity 主轴） */
  name: string;
  /** 短键（提取 Mgr/Manager/方法名等关键词） */
  shortKey: string;
  unity?: { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string };
  perfetto?: { name: string; totalPct?: number; selfPct?: number; thread: string; matchedBy: string };
  simpleperf?: { name: string; selfPct?: number; totalPct?: number; thread: string; matchedBy: string };
  conflict?: { kind: 'missing_source' | 'pct_drift' | 'thread_mismatch'; detail: string };
}

export interface NativeReverseEntry {
  /** native 函数名（被反查） */
  func: string;
  selfPct: number;
  /** 反向调用源：哪些上层节点最终调到 func */
  callers: { name: string; totalPct?: number; selfPct?: number; thread: string }[];
  thread: string;
}

export interface OffCpuAttribution {
  /** 主线程 Sleeping 占比（来自 perfetto offCpuReasons） */
  sleepingPct: number | null;
  runnablePct: number | null;
  /** 拆分（来自 atraceSlices 占主线程时间累计） */
  byCategory: {
    gpu_wait: { totalMs: number; pctOfMain: number; sliceNames: string[] };
    vsync_wait: { totalMs: number; pctOfMain: number; sliceNames: string[] };
    lock_wait: { totalMs: number; pctOfMain: number; sliceNames: string[] };
    binder_wait: { totalMs: number; pctOfMain: number; sliceNames: string[] };
    gc_stw: { totalMs: number; pctOfMain: number; sliceNames: string[] };
    other_sleep: { totalMs: number; pctOfMain: number; note: string };
  };
  evidence: string[];
  /** 数据可达性：sched_blocked_reason 缺时说明用 atrace 旁路 */
  dataSource: 'atrace_proxy' | 'sched_blocked_reason' | 'mixed';
  note: string;
}

export interface InterThreadWait {
  /** binder 调用对端进程归属 */
  binder: { count: number; avgMs: number; serverPid: number | null; serverName: string | null };
  /** Render 线程等 GPU 信号 (Semaphore.WaitForSignal proxy) */
  renderWaitGpu: { totalMs: number | null; pctOfRender: number | null; note: string };
  /** UnityMain Sleeping 与 GfxRenderS / Render Sleeping 的关联 */
  mainVsRender: { mainSleepingPct: number | null; renderSleepingPct: number | null; relation: string } | null;
}

export interface ThrottlingEvidence {
  /** sysfs 旁路文件是否可用（thermal_before/after.txt + cpuinfo_max_freq.txt） */
  sidecarAvailable: boolean;
  /** 来源：trace 同目录、采集 sample 目录 */
  sidecarPath: string | null;
  /** 综合判定：confirmed (sysfs 证据) > likely (温度高/cooling 激活) > suspected (cpufreq 背离) > none */
  verdict: 'confirmed' | 'likely' | 'suspected' | 'none';
  thermal: {
    before: { tempsMaxC: number | null; thermalZones: number } | null;
    after: { tempsMaxC: number | null; thermalZones: number } | null;
    deltaC: number | null;
  };
  cpuinfoMaxFreqMhz: number[];     // 8 核 cpuinfo_max_freq
  scalingMaxFreqMhz: number[];     // 8 核 scaling_max_freq（after 优先）
  reachPctPerCpu: { cpu: number; avgMhz: number; maxMhz: number; reachPct: number }[];
  bigCoreReachPct: number | null;
  coolingActive: boolean;
  evidence: string[];              // 关键证据描述（中文）
}

export interface IndentedNode {
  depth: number;
  name: string;
  selfMs?: number;
  totalMs?: number;
  selfPct?: number;
  totalPct?: number;
  count?: number;
  layer?: string;
  gcAllocCount?: number;
  /** 仅 unity 合成树用：节点首次出现的源帧（worst / median / both） */
  sourceFrame?: 'worst' | 'median' | 'both';
}

export interface SoBreakdown {
  layers: { layer: string; abs: number; pct: number; libs: { name: string; abs: number; pct: number }[] }[];
  totalSamples: number;
}

export type ThreadCategory = 'main' | 'render' | 'rhi' | 'job_worker' | 'audio_middleware' | 'audio_system' | 'lua_gc' | 'engine' | 'system' | 'unknown';

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

// === Phase 1a: 三源缩进树原貌透传 ===

/** 把结构化 CallTree 平铺为 IndentedNode[]，保留每一层 + 关键字段。minPct 控制裁剪密度。 */
function flattenIndented(
  tree: CallTree | undefined,
  opts: { minPct?: number; maxDepth?: number; topPerLevel?: number } = {},
): IndentedNode[] {
  if (!tree?.root) return [];
  const minPct = opts.minPct ?? 0.5;
  const maxDepth = opts.maxDepth ?? 8;
  const topPerLevel = opts.topPerLevel ?? 30;
  const out: IndentedNode[] = [];
  const walk = (n: CallTreeNode, d: number) => {
    if (d > maxDepth) return;
    const kids = (n.children ?? [])
      .filter(c => (c.totalPct ?? 0) >= minPct)
      .sort((a, b) => (b.totalPct ?? 0) - (a.totalPct ?? 0))
      .slice(0, topPerLevel);
    for (const c of kids) {
      out.push({
        depth: d,
        name: c.name,
        selfMs: (c as any).selfMs,
        totalMs: (c as any).totalMs,
        selfPct: c.selfPct,
        totalPct: c.totalPct,
        count: (c as any).count,
        layer: (c as any).layer,
        gcAllocCount: (c as any).gcAllocCount,
      });
      walk(c, d + 1);
    }
  };
  walk(tree.root, 0);
  return out;
}

/** 选关键线程的缩进树（默认 UnityMain；如缺则按总占比挑前 3）。 */
function indentedTreesForKeyThreads(
  trees: CallTree[],
  opts: { minPct?: number; maxDepth?: number } = {},
): { thread: string; nodes: IndentedNode[] }[] {
  if (!trees.length) return [];
  const main = trees.find(t => t.thread === 'UnityMain');
  const picked: CallTree[] = [];
  if (main) picked.push(main);
  const others = trees.filter(t => t !== main);
  for (const t of others.slice(0, 3)) picked.push(t);
  return picked.map(t => ({ thread: t.thread, nodes: flattenIndented(t, opts) }));
}

// === Phase 1a: unity worstFrame ∪ medianFrame 合成缩进树 ===

interface ParsedFrameTreeLine {
  depth: number;
  name: string;
  ms: number;
  pct: number;
  selfMs?: number;
}

/**
 * 解析 preprocess-result.json 的 frameTrees[].treeText：
 *
 *   PlayerLoop: 24.0ms (99.9%) [self=0.2ms]
 *     Update.ScriptRun...: 7.0ms (29.0%)
 *       AOE.dll!...: 6.3ms (26.2%)
 *
 * 缩进 2 空格 = 1 层。
 */
function parseUnityFrameTreeText(text: string): ParsedFrameTreeLine[] {
  if (!text) return [];
  const out: ParsedFrameTreeLine[] = [];
  const lineRe = /^(\s*)(\S.*?):\s*([\d.]+)ms\s*\(([\d.]+)%\)(?:\s*\[self=([\d.]+)ms\])?\s*$/;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = raw.match(lineRe);
    if (!m) continue;
    const depth = Math.floor((m[1].length || 0) / 2);
    out.push({
      depth,
      name: m[2].trim(),
      ms: parseFloat(m[3]),
      pct: parseFloat(m[4]),
      selfMs: m[5] != null ? parseFloat(m[5]) : undefined,
    });
  }
  return out;
}

/** 把结构化 CallTree 转成 IndentedNode[]（用于 unity callTree 当合成树的 fallback）。 */
function callTreeToIndentedNodes(tree: CallTree | undefined, opts: { minPct?: number; maxDepth?: number; sourceFrame?: 'worst' | 'median' | 'both' } = {}): IndentedNode[] {
  if (!tree?.root) return [];
  const minPct = opts.minPct ?? 0.5;
  const maxDepth = opts.maxDepth ?? 8;
  const out: IndentedNode[] = [];
  const walk = (n: CallTreeNode, d: number) => {
    if (d > maxDepth) return;
    const kids = (n.children ?? [])
      .filter(c => (c.totalPct ?? 0) >= minPct)
      .sort((a, b) => (b.totalPct ?? 0) - (a.totalPct ?? 0));
    for (const c of kids) {
      out.push({
        depth: d,
        name: c.name,
        selfMs: (c as any).selfMs,
        totalMs: (c as any).totalMs,
        selfPct: c.selfPct,
        totalPct: c.totalPct,
        count: (c as any).count,
        layer: (c as any).layer,
        gcAllocCount: (c as any).gcAllocCount,
        sourceFrame: opts.sourceFrame,
      });
      walk(c, d + 1);
    }
  };
  walk(tree.root, 0);
  return out;
}

/**
 * 合成 worstFrame + medianFrame 的缩进树。
 *
 * 数据源优先级（从高到低）：
 *   1) Phase X.2 aggregatedCallTrees per-thread（全 trace 平均 ms/帧）— 优先
 *   2) preprocess-result.json 的 frameTrees[].treeText（字符串）— preprocess 直跑场景
 *   3) merged profile 的 callTrees[].label 含 worst/median 标签的结构化树 — ingest 后场景
 */
function buildUnityCompositeTree(
  frameTrees: { label?: string; treeText?: string; msFrame?: number }[],
  unityCallTrees: CallTree[] = [],
  aggregatedCallTrees?: any[],
): IndentedNode[] {
  // 路径 0 (Phase X.2 优先): aggregatedCallTrees 的 Main Thread 是真"全 trace 平均 ms/帧"
  if (Array.isArray(aggregatedCallTrees) && aggregatedCallTrees.length > 0) {
    const main = aggregatedCallTrees.find(t => /Main Thread/i.test(t.threadName ?? '')) ?? aggregatedCallTrees[0];
    if (main?.roots?.length) {
      return aggregatedToIndented(main.roots, 0);
    }
  }

  // 路径 1：treeText 字符串
  const worstFt = frameTrees.find(t => /worst/i.test(t.label ?? ''));
  const medianFt = frameTrees.find(t => /median/i.test(t.label ?? ''));
  if (worstFt?.treeText || medianFt?.treeText) {
    return composeFromTreeText(worstFt?.treeText, medianFt?.treeText);
  }

  // 路径 2：merged profile callTrees（label 含 worst/median）
  const worstCt = unityCallTrees.find(t => /worst/i.test(t.label ?? '')) ?? unityCallTrees[0];
  const medianCt = unityCallTrees.find(t => /median/i.test(t.label ?? ''));
  if (worstCt || medianCt) {
    return composeFromCallTrees(worstCt, medianCt);
  }
  return [];
}

/** Phase X.2: 把 aggregatedCallTree 节点扁平化为 IndentedNode[]（保留 ms/帧 + gcAllocCount）。 */
function aggregatedToIndented(roots: any[], startDepth: number, parentMinPct = 0.5): IndentedNode[] {
  const out: IndentedNode[] = [];
  const walk = (n: any, depth: number) => {
    if (n.threadPct < parentMinPct && depth > 0) return;
    out.push({
      depth,
      name: n.name,
      selfMs: n.msPerFrameSelf,
      totalMs: n.msPerFrameTotal,
      totalPct: n.threadPct,
      count: n.count,
      gcAllocCount: n.gcAllocCount,
      sourceFrame: 'both',  // aggregatedCallTrees 是全 trace 聚合，取代 worst/median 标签
    });
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, startDepth);
  return out;
}

function composeFromTreeText(worstText?: string, medianText?: string): IndentedNode[] {
  const wParsed = worstText ? parseUnityFrameTreeText(worstText) : [];
  const mParsed = medianText ? parseUnityFrameTreeText(medianText) : [];

  const pathKey = (lines: ParsedFrameTreeLine[], idx: number): string => {
    const stack: string[] = [];
    for (let i = 0; i <= idx; i++) {
      const l = lines[i];
      stack.length = l.depth;
      stack.push(l.name);
    }
    return stack.join('▸');
  };

  const mMap = new Map<string, ParsedFrameTreeLine>();
  mParsed.forEach((l, i) => mMap.set(pathKey(mParsed, i), l));

  const out: IndentedNode[] = [];
  const seen = new Set<string>();
  wParsed.forEach((l, i) => {
    const k = pathKey(wParsed, i);
    seen.add(k);
    const m = mMap.get(k);
    out.push({ depth: l.depth, name: l.name, selfMs: l.selfMs, totalMs: l.ms, totalPct: l.pct, sourceFrame: m ? 'both' : 'worst' });
  });
  mParsed.forEach((l, i) => {
    const k = pathKey(mParsed, i);
    if (seen.has(k)) return;
    out.push({ depth: l.depth, name: l.name, selfMs: l.selfMs, totalMs: l.ms, totalPct: l.pct, sourceFrame: 'median' });
  });
  return out;
}

function composeFromCallTrees(worst?: CallTree, median?: CallTree): IndentedNode[] {
  const w = worst ? callTreeToIndentedNodes(worst, { minPct: 0.5, maxDepth: 8 }) : [];
  const m = median ? callTreeToIndentedNodes(median, { minPct: 0.5, maxDepth: 8 }) : [];
  // 路径 key：用 (depth, accumulated parent names) 模拟
  const keyOf = (nodes: IndentedNode[], idx: number) => {
    const stack: string[] = [];
    for (let i = 0; i <= idx; i++) {
      const n = nodes[i];
      stack.length = n.depth;
      stack.push(n.name);
    }
    return stack.join('▸');
  };
  const mMap = new Map<string, IndentedNode>();
  m.forEach((n, i) => mMap.set(keyOf(m, i), n));

  const out: IndentedNode[] = [];
  const seen = new Set<string>();
  w.forEach((n, i) => {
    const k = keyOf(w, i);
    seen.add(k);
    const inMedian = mMap.get(k);
    out.push({ ...n, sourceFrame: inMedian ? 'both' : 'worst' });
  });
  m.forEach((n, i) => {
    const k = keyOf(m, i);
    if (seen.has(k)) return;
    out.push({ ...n, sourceFrame: 'median' });
  });
  return out;
}

// === Phase 1a: simpleperf so 分层结构 ===

/** 把 simpleperf provider 输出的 layerBreakdown 标准化为 SoBreakdown。
 *
 *  当前 provider 输出格式：{ business: 26.97, engine: 40.96, runtime: 31.77, noise: 0.29 }（百分比标量）
 *  也兼容老格式：{ business: { absolute, percent, libs: [...] }, ... }
 */
function buildSoBreakdown(
  layerBreakdown: Record<string, any> | null | undefined,
  cpuLibs: { name: string; value: number; unit: string }[],
): SoBreakdown | null {
  if (!layerBreakdown) return null;

  const layers: SoBreakdown['layers'] = [];
  let totalSamples = 0;

  for (const [layer, info] of Object.entries(layerBreakdown)) {
    let pct = 0;
    let abs = 0;
    let libs: { name: string; abs: number; pct: number }[] = [];

    if (typeof info === 'number') {
      // 标量百分比格式
      pct = info;
    } else if (typeof info === 'object' && info != null) {
      abs = (info as any).absolute ?? 0;
      pct = (info as any).percent ?? 0;
      libs = ((info as any).libs ?? []).slice(0, 8).map((l: any) => ({
        name: l.name,
        abs: l.absolute ?? l.samples ?? 0,
        pct: l.percent ?? 0,
      }));
      totalSamples += abs;
    } else {
      continue;
    }

    // 没带 libs → 从 cpuLibs 按层规则挑（按当前 provider 输出格式，几乎一定走这里）
    if (!libs.length) {
      const filter = SO_LAYER_RULES[layer] ?? (() => false);
      libs = cpuLibs.filter(l => filter(l.name)).slice(0, 6).map(l => ({ name: l.name, abs: 0, pct: l.value }));
    }
    layers.push({ layer, abs, pct, libs });
  }
  return { layers: layers.sort((a, b) => b.pct - a.pct), totalSamples };
}

const SO_LAYER_RULES: Record<string, (name: string) => boolean> = {
  business: n => /^libil2cpp|^libxlua|^lib_burst_generated|^libAOENative|^libTBUNative|^libGameNative|base\.(odex|vdex|oat)$/i.test(n),
  engine: n => /^libunity|^libGLESv2|^libEGL|^libVk/i.test(n),
  middleware: n => /^libAk|^libfmod|^libwwise/i.test(n),
  runtime: n => /^libc(\.so)?$|^libm(\.so)?$|^libart|^libdl|^libstdc\+\+|^libutils/i.test(n),
  noise: n => /kernel|kallsyms|^\[kernel|^lib(c|m)\+\+/i.test(n),
};

// === Phase 3: 三源业务节点对位 + 冲突标注 + native 反向 ===

/** 从 unity 节点名提取短键（用于跨源匹配）。
 *
 *  例：
 *    "CS:AOE.Outside.MapManager"   → "MapManager"
 *    "LuaMgr.OnTick&UpdateSchedule" → "LuaMgr.OnTick"
 *    "OutSideViewArmyLineMgr"       → "OutSideViewArmyLineMgr"
 *    "MapSignificanceMgr.ProcessTasks" → "MapSignificanceMgr.ProcessTasks"
 */
function extractShortKey(name: string): string {
  if (!name) return name;
  // CS:AOE.X.Y.MgrName → MgrName
  const csMatch = name.match(/^CS:.*?\.([A-Z]\w+(?:Mgr|Manager|Ctrl))$/);
  if (csMatch) return csMatch[1];
  // X.Y.Method → 取末尾两段
  const parts = name.split('.');
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('.');
    // 把 & 后的内容裁掉（如 "OnTick&UpdateSchedule" → "OnTick"）
    return tail.split('&')[0];
  }
  return name;
}

/** 在结构化 callTree 中按子串模糊查找最匹配的节点。 */
function findBestMatch(
  trees: CallTree[],
  needles: string[],
): { name: string; totalPct?: number; selfPct?: number; thread: string; matchedBy: string } | undefined {
  const needleLow = needles.map(n => n.toLowerCase());
  let best: { name: string; totalPct?: number; selfPct?: number; thread: string; matchedBy: string } | undefined;

  const walk = (n: CallTreeNode, thread: string) => {
    const nameLow = (n.name ?? '').toLowerCase();
    for (const needle of needleLow) {
      if (!needle) continue;
      if (nameLow.includes(needle)) {
        const tp = (n.totalPct ?? 0);
        if (!best || tp > (best.totalPct ?? 0)) {
          best = { name: n.name, totalPct: n.totalPct, selfPct: n.selfPct, thread, matchedBy: needle };
        }
      }
    }
    n.children?.forEach(c => walk(c, thread));
  };
  for (const t of trees) walk(t.root, t.thread);
  return best;
}

function buildAlignedHotNodes(
  unityHotNodes: { name: string; selfPct?: number; selfMs?: number; totalPct?: number; thread: string }[],
  pfTrees: CallTree[],
  spTrees: CallTree[],
): AlignedHotNode[] {
  const out: AlignedHotNode[] = [];
  const seen = new Set<string>();
  for (const u of unityHotNodes.slice(0, 12)) {
    const shortKey = extractShortKey(u.name);
    if (seen.has(shortKey)) continue;
    seen.add(shortKey);

    // 候选 needle 列表：full name、shortKey、Mgr/Manager 关键词、Lua 函数前缀
    const needles = new Set<string>([u.name, shortKey]);
    const mgrMatch = shortKey.match(/([A-Z]\w+(?:Mgr|Manager|Ctrl))/);
    if (mgrMatch) needles.add(mgrMatch[1]);
    const luaMatch = u.name.match(/Lua[A-Z]\w+/);
    if (luaMatch) needles.add(luaMatch[0]);
    const tailMethod = shortKey.split('.').pop();
    if (tailMethod && tailMethod !== shortKey) needles.add(tailMethod);

    const pf = findBestMatch(pfTrees, [...needles]);
    const sp = findBestMatch(spTrees, [...needles]);

    let conflict: AlignedHotNode['conflict'];
    const present = [u, pf, sp].filter(Boolean).length;
    if (present < 2) {
      conflict = { kind: 'missing_source', detail: `仅 ${[u && 'unity', pf && 'perfetto', sp && 'simpleperf'].filter(Boolean).join('+')} 命中` };
    } else if (pf && u.selfPct && pf.selfPct) {
      const drift = Math.abs(u.selfPct - pf.selfPct) / Math.max(u.selfPct, pf.selfPct);
      if (drift > 0.5) conflict = { kind: 'pct_drift', detail: `unity selfPct=${u.selfPct}% / perfetto selfPct=${pf.selfPct}% 偏差 ${(drift * 100).toFixed(0)}%` };
    }

    out.push({
      name: u.name,
      shortKey,
      unity: u,
      perfetto: pf,
      simpleperf: sp,
      conflict,
    });
  }
  return out;
}

/** 反向调用栈：Top selfPct 函数从原 callTree 反向追溯祖先链。 */
function buildNativeReverseCallStack(
  spTrees: CallTree[],
  topFuncs: { name: string; value: number; unit: string }[],
  limit = 8,
): NativeReverseEntry[] {
  const out: NativeReverseEntry[] = [];

  for (const f of topFuncs.slice(0, limit)) {
    // 在每棵 simpleperf 树里找 selfPct 最高且 name 最匹配 f.name 的节点，记录其祖先链
    const fLow = f.name.toLowerCase();
    let bestPath: { name: string; totalPct?: number; selfPct?: number; thread: string }[] = [];
    let bestThread = '';

    const walk = (n: CallTreeNode, thread: string, path: CallTreeNode[]) => {
      const nameLow = (n.name ?? '').toLowerCase();
      if (nameLow.includes(fLow) || fLow.includes(nameLow)) {
        if (!bestPath.length || (n.selfPct ?? 0) > (bestPath[bestPath.length - 1].selfPct ?? 0)) {
          // 反向：从根到当前节点
          bestPath = [...path, n].map(p => ({ name: p.name, totalPct: p.totalPct, selfPct: p.selfPct, thread }));
          bestThread = thread;
        }
      }
      n.children?.forEach(c => walk(c, thread, [...path, n]));
    };
    for (const t of spTrees) walk(t.root, t.thread, []);

    if (!bestPath.length) continue;
    // 反向：caller 列表从根开始（祖先到自己）
    out.push({
      func: f.name,
      selfPct: f.value,
      callers: bestPath.slice(0, 8),
      thread: bestThread,
    });
  }

  return out;
}

const SLICE_CATEGORY_RULES: { match: RegExp; category: 'gpu_wait' | 'vsync_wait' | 'lock_wait' | 'binder_wait' | 'gc_stw' }[] = [
  { match: /Gfx\.WaitForPresent|WaitForCommandBuffer|WaitForGPU|GfxDeviceClient::WaitForPendingPresent/i, category: 'gpu_wait' },
  { match: /WaitForTargetFPS|WaitForVsync|VSync/i, category: 'vsync_wait' },
  { match: /Mutex|Semaphore\.WaitForSignal|WaitForJob|Lock|CriticalSection/i, category: 'lock_wait' },
  { match: /Binder|IPC|Wait.*binder/i, category: 'binder_wait' },
  { match: /GC\.Collect|GC_Collect|MarkAndSweep|StopTheWorld/i, category: 'gc_stw' },
];

function buildOffCpuAttribution(detail: Record<string, any>): OffCpuAttribution {
  const pf = detail.perfetto ?? {};
  const offReasons = pf.offCpuReasons ?? {};
  const slices: Record<string, { count: number; avgMs: number; totalMs: number }> = pf.atraceSlices ?? {};

  // 主线程 PlayerLoop 总时长作为分母
  const playerLoopTotal = slices.PlayerLoop?.totalMs ?? null;
  const profileWindowMs = pf.profileWindow?.durMs ?? null;
  const denom = playerLoopTotal ?? profileWindowMs ?? 0;

  const empty = () => ({ totalMs: 0, pctOfMain: 0, sliceNames: [] as string[] });
  const byCategory: OffCpuAttribution['byCategory'] = {
    gpu_wait: empty(),
    vsync_wait: empty(),
    lock_wait: empty(),
    binder_wait: empty(),
    gc_stw: empty(),
    other_sleep: { totalMs: 0, pctOfMain: 0, note: '' },
  };

  for (const [name, info] of Object.entries(slices)) {
    if (!info?.totalMs) continue;
    const rule = SLICE_CATEGORY_RULES.find(r => r.match.test(name));
    if (!rule) continue;
    byCategory[rule.category].totalMs += info.totalMs;
    byCategory[rule.category].sliceNames.push(name);
  }
  for (const k of ['gpu_wait', 'vsync_wait', 'lock_wait', 'binder_wait', 'gc_stw'] as const) {
    if (denom > 0) byCategory[k].pctOfMain = Math.round(byCategory[k].totalMs / denom * 1000) / 10;
  }

  // other_sleep = sleepingPct 减去归类的等待占比
  const sleepingPct = typeof offReasons.sleepingPct === 'number' ? offReasons.sleepingPct : null;
  const allocatedPct =
    byCategory.gpu_wait.pctOfMain +
    byCategory.vsync_wait.pctOfMain +
    byCategory.lock_wait.pctOfMain +
    byCategory.binder_wait.pctOfMain;
  if (sleepingPct != null) {
    const otherPct = Math.max(0, sleepingPct - allocatedPct);
    byCategory.other_sleep = {
      totalMs: denom > 0 ? Math.round(otherPct / 100 * denom * 10) / 10 : 0,
      pctOfMain: Math.round(otherPct * 10) / 10,
      note: 'sleepingPct 减去归类的 GPU/vsync/lock/binder 等待之后剩余',
    };
  }

  const evidence: string[] = [];
  if (byCategory.gpu_wait.pctOfMain > 5) evidence.push(`等 GPU: ${byCategory.gpu_wait.pctOfMain}% (来源: ${byCategory.gpu_wait.sliceNames.join(', ')})`);
  if (byCategory.vsync_wait.pctOfMain > 1) evidence.push(`等 vsync: ${byCategory.vsync_wait.pctOfMain}% (来源: ${byCategory.vsync_wait.sliceNames.join(', ')})`);
  if (byCategory.lock_wait.pctOfMain > 1) evidence.push(`等锁/信号: ${byCategory.lock_wait.pctOfMain}% (来源: ${byCategory.lock_wait.sliceNames.join(', ')})`);
  if (byCategory.gc_stw.pctOfMain > 1) evidence.push(`GC STW: ${byCategory.gc_stw.pctOfMain}% (主线程被 GC.Collect 暂停)`);

  const hasBlockedReason = !!(offReasons.byReason || offReasons.bySchedBlockedReason);
  const dataSource: OffCpuAttribution['dataSource'] = hasBlockedReason
    ? 'sched_blocked_reason'
    : (Object.keys(slices).length ? 'atrace_proxy' : 'mixed');

  return {
    sleepingPct,
    runnablePct: typeof offReasons.runnablePct === 'number' ? offReasons.runnablePct : null,
    byCategory,
    evidence,
    dataSource,
    note: hasBlockedReason
      ? '内核 sched_blocked_reason 可用，分类置信度高'
      : 'sched_blocked_reason 不可用 (常见于华为非 root)，使用 atrace slice 旁路法对账 sleepingPct',
  };
}

// === Phase 2: 多线程互等关系（binder 对端 + Render proxy） ===

function buildInterThreadWait(detail: Record<string, any>, system: Record<string, any>, threadsCore: { name: string; sleepingPct: number; runningPct: number }[]): InterThreadWait {
  const pf = detail.perfetto ?? {};
  const binder = system.binder ?? {};

  // binder 对端进程归属：当前 provider 没查 android_binder_txns 表，先留 null + note
  // Phase 4 时 provider 扩展 SQL 后填进来
  const binderInfo = {
    count: binder.count ?? 0,
    avgMs: binder.avgMs ?? 0,
    serverPid: binder.serverPid ?? null,
    serverName: binder.serverName ?? null,
  };

  // Render 线程 Semaphore.WaitForSignal proxy
  // 当前 perfetto provider 已有此 SQL（preprocess.py line 824），但未透传到 summary。先尝试从已有数据推
  const renderWaitGpu = {
    totalMs: pf.renderWaitGpuMs ?? null,
    pctOfRender: pf.renderWaitGpuPct ?? null,
    note: pf.renderWaitGpuMs != null
      ? 'Render 线程 Semaphore.WaitForSignal 累计'
      : 'provider 未透传 Render proxy（preprocess.py L824 SQL 已有，需后续 provider 扩展）',
  };

  const main = threadsCore.find(t => t.name === 'UnityMain');
  const render = threadsCore.find(t => /^UnityGfxRender|^Render Thread|^Render$/i.test(t.name));
  let mainVsRender: InterThreadWait['mainVsRender'] = null;
  if (main && render) {
    const mainSleep = main.sleepingPct;
    const renderSleep = render.sleepingPct;
    let relation = '';
    if (mainSleep > 30 && renderSleep > 60) {
      relation = '主线程睡 + Render 也睡 → 主线程在等 GPU/Present，渲染管线已发完命令';
    } else if (mainSleep < 10 && renderSleep > 60) {
      relation = '主线程满负荷 + Render 长睡 → CPU-bound (主线程)，渲染端有余量';
    } else if (mainSleep > 30 && renderSleep < 30) {
      relation = '主线程睡 + Render 忙 → 主线程在等 Render 完成（少见）';
    } else {
      relation = '主线程 / Render 各自忙于工作';
    }
    mainVsRender = { mainSleepingPct: mainSleep, renderSleepingPct: renderSleep, relation };
  }

  return { binder: binderInfo, renderWaitGpu, mainVsRender };
}

interface ThermalSysfsParsed {
  scalingMax: Record<string, number>;
  cpuinfoMax: Record<string, number>;
  thermalTempsMilliC: number[];
  coolingStates: number[];
}

/** 解析 thermal_before/after.txt 旁路文件（与 perfetto preprocess.py: parse_thermal_sysfs 同口径）。 */
function parseThermalSysfsFile(filepath: string): ThermalSysfsParsed | null {
  if (!fs.existsSync(filepath)) return null;
  let text: string;
  try { text = fs.readFileSync(filepath, 'utf-8'); } catch { return null; }
  const data: ThermalSysfsParsed = { scalingMax: {}, cpuinfoMax: {}, thermalTempsMilliC: [], coolingStates: [] };
  let section: 'scaling' | 'cpuinfo' | 'thermal' | 'cooling' | '' = '';
  let cpuIdx = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.includes('scaling_max_freq') && line.includes('---')) { section = 'scaling'; cpuIdx = 0; continue; }
    if (line.includes('cpuinfo_max_freq') && line.includes('---')) { section = 'cpuinfo'; cpuIdx = 0; continue; }
    if (line.includes('thermal_zone') && line.includes('---')) { section = 'thermal'; continue; }
    if (line.includes('cooling_device') && line.includes('---')) { section = 'cooling'; continue; }
    if (/^\d+$/.test(line)) {
      const v = parseInt(line, 10);
      if (section === 'scaling') { data.scalingMax[`cpu${cpuIdx}`] = v; cpuIdx++; }
      else if (section === 'cpuinfo') { data.cpuinfoMax[`cpu${cpuIdx}`] = v; cpuIdx++; }
      continue;
    }
    if (section === 'thermal' && line.includes(':')) {
      const parts = line.split(':');
      const v = parseInt(parts[parts.length - 1].trim(), 10);
      if (!Number.isNaN(v)) data.thermalTempsMilliC.push(v);
      continue;
    }
    if (section === 'cooling' && line.includes('state=')) {
      const v = parseInt(line.split('state=').pop()!.trim(), 10);
      if (!Number.isNaN(v)) data.coolingStates.push(v);
    }
  }
  return data;
}

function buildThrottlingEvidence(
  detail: Record<string, any>,
  raw: { source?: string; localPath?: string; role?: string }[],
): ThrottlingEvidence {
  const pfThrottling = detail.perfetto?.throttling ?? {};
  const perCpuFromPerfetto = (pfThrottling.perCpu ?? []) as { cpu: number; avgMhz: number; maxMhz: number; reachPct: number }[];

  // 找 perfetto trace 同目录的旁路文件
  const pfRaw = raw.find(r => r.source === 'perfetto' && r.localPath);
  const sampleDir = pfRaw?.localPath ? path.dirname(pfRaw.localPath) : null;

  const evidence: string[] = [];
  let sidecarAvailable = false;
  let sidecarPath: string | null = null;
  const thermal: ThrottlingEvidence['thermal'] = {
    before: null,
    after: null,
    deltaC: null,
  };
  const cpuinfoMaxFreqMhz: number[] = [];
  const scalingMaxFreqMhz: number[] = [];
  let coolingActive = false;
  let verdict: ThrottlingEvidence['verdict'] = 'none';

  if (sampleDir && fs.existsSync(sampleDir)) {
    sidecarPath = sampleDir;
    let beforeFile: string | null = null;
    let afterFile: string | null = null;
    try {
      const files = fs.readdirSync(sampleDir);
      const before = files.filter(f => /^thermal_before/.test(f)).sort();
      const after = files.filter(f => /^thermal_after/.test(f)).sort();
      beforeFile = before.length ? path.join(sampleDir, before[before.length - 1]) : null;
      afterFile = after.length ? path.join(sampleDir, after[after.length - 1]) : null;
    } catch { /* ignore */ }

    const beforeData = beforeFile ? parseThermalSysfsFile(beforeFile) : null;
    const afterData = afterFile ? parseThermalSysfsFile(afterFile) : null;

    if (beforeData || afterData) {
      sidecarAvailable = true;

      const cleanTempC = (raw: number) => raw > 1000 ? Math.round(raw / 100) / 10 : raw; // 毫摄氏度 → 摄氏度
      const summarize = (d: ThermalSysfsParsed | null) => {
        if (!d || !d.thermalTempsMilliC.length) return null;
        const max = Math.max(...d.thermalTempsMilliC);
        return { tempsMaxC: cleanTempC(max), thermalZones: d.thermalTempsMilliC.length };
      };
      thermal.before = summarize(beforeData);
      thermal.after = summarize(afterData);
      if (thermal.before && thermal.after) {
        thermal.deltaC = Math.round((thermal.after.tempsMaxC! - thermal.before.tempsMaxC!) * 10) / 10;
      }

      // cpuinfo_max / scaling_max（after 优先）
      const ref = afterData ?? beforeData!;
      for (let i = 0; i < 8; i++) {
        const key = `cpu${i}`;
        if (ref.cpuinfoMax[key]) cpuinfoMaxFreqMhz.push(Math.round(ref.cpuinfoMax[key] / 1000));
        if (ref.scalingMax[key]) scalingMaxFreqMhz.push(Math.round(ref.scalingMax[key] / 1000));
      }
      coolingActive = (ref.coolingStates ?? []).some(s => s > 0);

      // verdict: confirmed (sysfs 限制有据) → likely (温度 > 42 或 cooling) → 沿用 perfetto 推测
      let limitedCpu = false;
      for (const k of Object.keys(ref.scalingMax)) {
        const sm = ref.scalingMax[k];
        const cm = ref.cpuinfoMax[k];
        if (cm && sm < cm) { limitedCpu = true; break; }
      }
      if (limitedCpu || coolingActive) {
        verdict = 'confirmed';
        evidence.push(`[确认] sysfs 旁路: scaling_max < cpuinfo_max 或 cooling 激活`);
      } else if (thermal.after && thermal.after.tempsMaxC! > 42) {
        verdict = 'likely';
        evidence.push(`[likely] 温度高: max=${thermal.after.tempsMaxC}°C`);
      }
      if (thermal.deltaC && thermal.deltaC > 5) evidence.push(`温升 +${thermal.deltaC}°C: 凉机进热段，1-2 min 后必然进入 throttle`);
    }
  }

  // 没拿到 sidecar → 沿用 perfetto provider 的 cpufreq 推测
  if (!sidecarAvailable) {
    if (pfThrottling.level && pfThrottling.level !== 'none') {
      verdict = pfThrottling.level === 'suspected' ? 'suspected' : 'likely';
    }
    if (Array.isArray(pfThrottling.evidence)) evidence.push(...pfThrottling.evidence);
    if (!sidecarPath) evidence.push(`未找到旁路文件 (thermal_before/after.txt + cpuinfo_max_freq.txt)；判定停在 perfetto 推测档`);
  }

  return {
    sidecarAvailable,
    sidecarPath,
    verdict,
    thermal,
    cpuinfoMaxFreqMhz,
    scalingMaxFreqMhz,
    reachPctPerCpu: perCpuFromPerfetto,
    bigCoreReachPct: pfThrottling.bigCoreReachPct ?? null,
    coolingActive,
    evidence,
  };
}

const THREAD_CATEGORY_RULES: { match: (name: string) => boolean; category: ThreadCategory; reason: string }[] = [
  { match: n => n === 'UnityMain', category: 'main', reason: '主线程' },
  { match: n => /^UnityGfxRender/i.test(n), category: 'render', reason: 'Unity 渲染线程' },
  { match: n => /^Thread[-_]10[0-9]$|^GfxDeviceWorker/i.test(n), category: 'rhi', reason: 'RHI / GfxDeviceWorker' },
  { match: n => /^Thread[-_]1[3-9][0-9]$|JobWorker|^Job\./i.test(n), category: 'job_worker', reason: 'Job Worker (ECS Burst)' },
  { match: n => /^NativeThread|libAk|Wwise/i.test(n), category: 'audio_middleware', reason: 'Wwise / 音频中间件' },
  { match: n => /Audio.*(Mixer|Stream)|^AAudio/i.test(n), category: 'audio_system', reason: '系统音频线程' },
  { match: n => /LuaMtGC|LuaMultiThreadGC/i.test(n), category: 'lua_gc', reason: 'xLua MtGC' },
  { match: n => /UnityChoreograp|VSync/i.test(n), category: 'system', reason: '系统调度 / VSync' },
];

function classifyThread(name: string): { category: ThreadCategory; reason: string } {
  for (const r of THREAD_CATEGORY_RULES) if (r.match(name)) return { category: r.category, reason: r.reason };
  return { category: 'unknown', reason: '未识别' };
}

// === Phase 1a: 能力矩阵 ===

function buildCapabilityMatrix(detail: Record<string, any>): { dimension: string; status: 'ok' | 'partial' | 'missing'; note: string }[] {
  const pf = detail.perfetto ?? {};
  const sp = detail.simpleperf ?? {};
  const u = detail.unity_profiler ?? {};

  const entries: { dimension: string; status: 'ok' | 'partial' | 'missing'; note: string }[] = [];
  const has = (cond: any, ok: string, missing: string): { status: 'ok' | 'partial' | 'missing'; note: string } =>
    cond ? { status: 'ok', note: ok } : { status: 'missing', note: missing };

  entries.push({ dimension: 'unity 帧 markers', ...has((u.markers ?? []).length > 0, '已采', 'unity_profiler.markers 空') });
  entries.push({ dimension: 'unity worst/median frame tree', ...has((u.frameTrees ?? []).length >= 2, 'worst+median 齐备', '帧树缺失或不完整') });
  entries.push({ dimension: 'unity sourceMap', ...has(!!u.markerSourceMap, '已配 projectPath', '未配 projectPath，建议无法到行级') });
  entries.push({ dimension: 'perfetto sched 三态', ...has(((pf.threadsSched ?? []).length > 0) || (Object.keys(detail.perfetto?.threadsSched ?? {}).length > 0), '已采', 'sched 三态缺') });
  entries.push({ dimension: 'perfetto callTrees (atrace)', ...has((pf.callTrees ?? []).length > 0, '已采', 'atrace slice tree 缺') });
  entries.push({ dimension: 'perfetto throttling 旁路', status: pf.throttling?.confirmedAvailable ? 'ok' : pf.throttling ? 'partial' : 'missing', note: pf.throttling?.confirmedAvailable ? 'sysfs 旁路齐, confirmed' : pf.throttling ? `仅 ${pf.throttling.level}` : '无降频判定' });
  entries.push({ dimension: 'perfetto Gfx.WaitForPresent', ...has(pf.atraceSlices?.['Gfx.WaitForPresent'], '已采', 'atrace 未捕获 WaitForPresent') });
  entries.push({ dimension: 'perfetto WaitForTargetFPS', ...has(pf.atraceSlices?.WaitForTargetFPS, '已采', 'atrace 未捕获 WaitForTargetFPS') });
  entries.push({ dimension: 'perfetto frameTimeline', ...has(pf.frameTimeline, '已采', 'actual_frame_timeline 缺，VSync miss 无法量化') });
  entries.push({ dimension: 'perfetto GPU counter', ...has(detail.perfetto?.gpu?.busyPct != null, '已采', 'GPU busy/freq 缺，GPU 是否瓶颈无法定论') });
  entries.push({ dimension: 'perfetto sched_blocked_reason', ...has(pf.offCpuReasons?.byReason, '已采', '内核 ftrace 静默丢弃，off-CPU byReason 缺') });
  entries.push({ dimension: 'simpleperf 符号化', ...has((sp.symbolCheck?.appSymbolizedPct ?? sp.symbolCheck?.appPercent) >= 80, `app ${sp.symbolCheck?.appSymbolizedPct ?? sp.symbolCheck?.appPercent ?? '?'}%`, sp.symbolCheck ? `app ${sp.symbolCheck?.appSymbolizedPct ?? sp.symbolCheck?.appPercent ?? '?'}% < 80% (status=${sp.symbolCheck?.status ?? '?'})` : '符号化失败') });
  entries.push({ dimension: 'simpleperf layerBreakdown', ...has(sp.layerBreakdown && Object.keys(sp.layerBreakdown).length, '已分层', 'layerBreakdown 缺') });
  return entries;
}

// === Phase 1a: 同次性校验扩展 ===

function buildSameCaptureExt(detail: Record<string, any>, frameCount: number | null): {
  durationMs: { unity?: number; perfetto?: number; simpleperf?: number };
  durationDriftPct: number | null;
  timestamps: { unity?: string; perfetto?: string; simpleperf?: string };
  timeOffsetMaxMin: number | null;
  verdict: 'aligned' | 'partial' | 'unaligned';
} {
  const pfDur = detail.perfetto?.profileWindow?.durMs;
  const spDur = (detail.simpleperf?.recordTime?.durationSec ?? detail.simpleperf?.duration ?? null);
  const spDurMs = typeof spDur === 'number' ? spDur * 1000 : undefined;
  const uDurMs = frameCount && detail.unity_profiler?.frameSummary?.mean ? frameCount * detail.unity_profiler.frameSummary.mean : undefined;

  const durs = [pfDur, spDurMs, uDurMs].filter((v): v is number => typeof v === 'number' && v > 0);
  let driftPct: number | null = null;
  if (durs.length >= 2) {
    const max = Math.max(...durs);
    const min = Math.min(...durs);
    driftPct = max > 0 ? ((max - min) / max) * 100 : null;
  }

  const tsU = detail.unity_profiler?.captureTime ?? detail.unity_profiler?.recordTime;
  const tsP = detail.perfetto?.captureTime ?? detail.perfetto?.recordTime;
  const tsS = detail.simpleperf?.recordTime?.captureTime ?? detail.simpleperf?.recordTime;
  const tsList = [tsU, tsP, tsS].filter(Boolean).map(t => new Date(t).getTime()).filter(n => !Number.isNaN(n));
  let offsetMin: number | null = null;
  if (tsList.length >= 2) {
    offsetMin = (Math.max(...tsList) - Math.min(...tsList)) / 60000;
  }

  let verdict: 'aligned' | 'partial' | 'unaligned' = 'partial';
  if (driftPct != null && driftPct < 20 && (offsetMin == null || offsetMin < 5)) verdict = 'aligned';
  else if ((driftPct != null && driftPct > 50) || (offsetMin != null && offsetMin > 30)) verdict = 'unaligned';

  return {
    durationMs: { unity: uDurMs, perfetto: pfDur, simpleperf: spDurMs },
    durationDriftPct: driftPct,
    timestamps: { unity: tsU, perfetto: tsP, simpleperf: tsS },
    timeOffsetMaxMin: offsetMin,
    verdict,
  };
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
    // === Phase 1a 新增字段 ===
    unityCallTreeComposite: buildUnityCompositeTree(detail.unity_profiler?.frameTrees ?? [], unityTrees, detail.unity_profiler?.aggregatedCallTrees),
    perfettoCallTreeIndented: indentedTreesForKeyThreads(pfTrees, { minPct: 1, maxDepth: 8 }),
    simpleperfCallTreeIndented: indentedTreesForKeyThreads(spTrees, { minPct: 0.3, maxDepth: 8 }),
    simpleperfSoBreakdown: buildSoBreakdown(detail.simpleperf?.layerBreakdown, byPrefix(metrics, 'cpu.lib.', '.pct')),
    threadCategory: byPrefix(metrics, 'cpu.thread.', '.pct').slice(0, 16).map(t => {
      const c = classifyThread(t.name);
      return { name: t.name, cpuPct: t.value, category: c.category, reason: c.reason };
    }),
    capabilityMatrix: buildCapabilityMatrix(detail),
    sameCaptureExt: buildSameCaptureExt(detail, run.frameCount),
    throttlingEvidence: buildThrottlingEvidence(detail, JSON.parse(run.rawJson ?? '[]')),
    offCpuAttribution: buildOffCpuAttribution(detail),
    interThreadWait: buildInterThreadWait(detail, system, threadsCore.map(t => ({ name: t.name, sleepingPct: t.sleepingPct, runningPct: t.runningPct }))),
    alignedHotNodes: buildAlignedHotNodes(topBusinessNodes(unityTrees, 12), pfTrees, spTrees),
    nativeReverseCallStack: buildNativeReverseCallStack(spTrees, byPrefix(metrics, 'cpu.func.', '.selfPct'), 8),
    confidence: JSON.parse(run.coreConfidenceJson ?? '{}'),
  };
}
