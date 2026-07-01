/**
 * unity-diff-builder.ts — Unity Profiler 双版本对比 Provider（确定性 diff 计算）。
 *
 * 输入：base + cur 两份 preprocess-result.json
 * 输出：
 *   - unity-diff-summary.json  — 所有 Δ 数字（AI 不准动）
 *   - performance-report_unity_diff_skeleton.md  — Provider 骨架报告
 *
 * 与 simpleperf-diff-analysis v4 hybrid 模式同构。
 *
 * 用法：
 *   npx tsx unity-diff-builder.ts --base <base.json> --cur <cur.json> --out <out_dir>
 *
 * 依据：.claude/skills/unity-profiler-compare/SKILL.md
 */
import * as fs from 'fs';
import * as path from 'path';

interface AggregatedCallTreeNode {
  name: string;
  depth: number;
  msTotal: number;
  msPerFrameTotal: number;
  msSelf: number;
  msPerFrameSelf: number;
  presentOnFrameCount: number;
  presentRate: number;
  threadPct: number;
  count: number;
  gcAllocCount: number;
  children: AggregatedCallTreeNode[];
}

interface AggregatedCallTree {
  threadName: string;
  frameCount: number;
  msTotalAllFrames: number;
  msPerFrameTotal: number;
  presentOnFrameCount: number;
  roots: AggregatedCallTreeNode[];
}

interface MarkerOutput {
  name: string;
  msSelfMean: number;
  msSelfMedian: number;
  msSelfMax: number;
  msTotalMean: number;
  percentOfFrame: number;
  count: number;
  presentOnFrameCount: number;
  callsPerFrame: number;
  thread: string;
  spikeRatio: number;
}

interface PreprocessResult {
  config: { targetFps: number; frameBudgetMs: number };
  frameSummary: {
    count: number;
    actualFps: number;
    mean: number; median: number; min: number; max: number;
    q1: number; q3: number;
    p90?: number; p95?: number; p99?: number; p999?: number;
    jankCount: number; bigJankCount: number;
  };
  markers: MarkerOutput[];
  markersByThread?: Record<string, MarkerOutput[]>;
  aggregatedCallTrees?: AggregatedCallTree[];
  markerSpikes?: any[];
  jankFrames?: any[];
  threads: { name: string; msMedian: number; msMax: number; msPerFrameTotal?: number; topMarkers?: any[] }[];
  memory?: {
    gcAllocatedInFrame?: { mean?: number; median?: number; p95?: number; max?: number };
  };
}

// ============ 类型：diff 输出 ============

type DiffStatus = 'degraded' | 'improved' | 'stable' | 'newly_added' | 'removed';

interface DiffNumberPair {
  base: number | null;
  cur: number | null;
  delta: number | null;
  deltaPct: number | null;
  status: DiffStatus;
}

interface CallTreeNodeDiff {
  path: string;
  name: string;
  depth: number;
  msPerFrameTotal: DiffNumberPair;
  msPerFrameSelf: DiffNumberPair;
  threadPct: DiffNumberPair;
  gcAllocCount: DiffNumberPair;
  status: DiffStatus;
  children: CallTreeNodeDiff[];
}

interface CallTreeDiff {
  threadName: string;
  baseFrameCount: number;
  curFrameCount: number;
  msPerFrameTotal: DiffNumberPair;
  roots: CallTreeNodeDiff[];
}

interface MarkerDiff {
  name: string;
  thread: string;
  msSelfMean: DiffNumberPair;
  percentOfFrame: DiffNumberPair;
  spikeRatio: DiffNumberPair;
  status: DiffStatus;
}

export interface UnityDiffSummary {
  generatedAt: string;
  meta: {
    base: { label: string; targetFps: number; frameCount: number };
    cur: { label: string; targetFps: number; frameCount: number };
  };
  /** §1 同源性校验 */
  consistency: {
    targetFpsMatch: boolean;
    framesRatio: number;  // cur/base
    note: string[];
  };
  /** §2 帧级 Δ */
  frameSummary: Record<'mean' | 'median' | 'p90' | 'p95' | 'p99' | 'p999' | 'actualFps' | 'jankCount' | 'bigJankCount', DiffNumberPair>;
  /** §3 主线程 + per-thread aggregatedCallTrees Δ */
  callTreesDiff: CallTreeDiff[];
  /** §4 各线程 markersByThread Δ */
  markersByThreadDiff: Record<string, MarkerDiff[]>;
  /** §5 GC Δ — 业务子树 */
  gcAttribution: {
    totalAllocPerFrame: DiffNumberPair;
    /** 帧级 gcAllocatedInFrame 均值（字节/帧），不可按子树拆分 */
    gcBytesPerFrame?: DiffNumberPair;
    topSubtrees: { path: string; name: string; gcAlloc: DiffNumberPair; msPerFrameTotal: DiffNumberPair }[];
  };
  /** §3 Top-N 热点（与 §8 P 候选同源） */
  topHotspots: { rank: number; name: string; path: string; msPerFrameSelf: DiffNumberPair; msPerFrameTotal: DiffNumberPair; gcAllocCount: DiffNumberPair; status: DiffStatus }[];
  /** §6 慢帧 / 波动 Δ */
  spikes: { newSpikes: MarkerDiff[]; resolvedSpikes: MarkerDiff[]; changed: MarkerDiff[] };
  /** §7 新增 / 消失 marker */
  presence: { addedInCur: string[]; removedFromCur: string[] };
}

// ============ Δ 计算辅助 ============

const SIGNIFICANT_DELTA_PCT = 5;  // ≥5% 视为变化
const STABLE_THRESHOLD_MS = 0.05;  // ms/帧 < 0.05 视为稳态噪声

function safeRound(x: number, digits = 2): number {
  return parseFloat(x.toFixed(digits));
}

function classifyDelta(base: number | null, cur: number | null): DiffStatus {
  if (base == null && cur == null) return 'stable';
  if (base == null && cur != null) return 'newly_added';
  if (base != null && cur == null) return 'removed';
  const b = base!;
  const c = cur!;
  if (Math.abs(c - b) < STABLE_THRESHOLD_MS) return 'stable';
  if (b === 0) return c > 0 ? 'newly_added' : 'stable';
  const pct = ((c - b) / Math.abs(b)) * 100;
  if (pct > SIGNIFICANT_DELTA_PCT) return 'degraded';
  if (pct < -SIGNIFICANT_DELTA_PCT) return 'improved';
  return 'stable';
}

function makeDiffPair(base: number | null | undefined, cur: number | null | undefined): DiffNumberPair {
  const b = base == null ? null : base;
  const c = cur == null ? null : cur;
  let delta: number | null = null;
  let deltaPct: number | null = null;
  if (b != null && c != null) {
    delta = safeRound(c - b, 3);
    if (b !== 0) deltaPct = safeRound(((c - b) / Math.abs(b)) * 100, 1);
  } else if (b == null && c != null) {
    delta = c;
    deltaPct = null;
  } else if (b != null && c == null) {
    delta = -b;
    deltaPct = null;
  }
  return { base: b, cur: c, delta, deltaPct, status: classifyDelta(b, c) };
}

// ============ aggregatedCallTrees 路径对位 ============

function diffCallTreeNode(baseNode: AggregatedCallTreeNode | undefined, curNode: AggregatedCallTreeNode | undefined, parentPath: string): CallTreeNodeDiff {
  const name = (baseNode ?? curNode)!.name;
  const path = parentPath ? `${parentPath}▸${name}` : name;
  const depth = (baseNode ?? curNode)!.depth;

  const msPerFrameTotal = makeDiffPair(baseNode?.msPerFrameTotal, curNode?.msPerFrameTotal);
  const msPerFrameSelf = makeDiffPair(baseNode?.msPerFrameSelf, curNode?.msPerFrameSelf);
  const threadPct = makeDiffPair(baseNode?.threadPct, curNode?.threadPct);
  const gcAllocCount = makeDiffPair(baseNode?.gcAllocCount, curNode?.gcAllocCount);

  // 子节点对位
  const childMap = new Map<string, { base?: AggregatedCallTreeNode; cur?: AggregatedCallTreeNode }>();
  for (const c of baseNode?.children ?? []) {
    if (!childMap.has(c.name)) childMap.set(c.name, {});
    childMap.get(c.name)!.base = c;
  }
  for (const c of curNode?.children ?? []) {
    if (!childMap.has(c.name)) childMap.set(c.name, {});
    childMap.get(c.name)!.cur = c;
  }

  const children: CallTreeNodeDiff[] = [];
  for (const [, pair] of childMap) {
    children.push(diffCallTreeNode(pair.base, pair.cur, path));
  }
  // 按 cur msPerFrameTotal 降序，再按 |delta| 降序
  children.sort((a, b) => {
    const aw = (a.msPerFrameTotal.cur ?? a.msPerFrameTotal.base ?? 0);
    const bw = (b.msPerFrameTotal.cur ?? b.msPerFrameTotal.base ?? 0);
    return bw - aw;
  });

  // 节点状态：用 msPerFrameTotal status 作为主要标
  return {
    path, name, depth,
    msPerFrameTotal, msPerFrameSelf, threadPct, gcAllocCount,
    status: msPerFrameTotal.status,
    children,
  };
}

function diffAggregatedCallTrees(baseTrees: AggregatedCallTree[] = [], curTrees: AggregatedCallTree[] = []): CallTreeDiff[] {
  const threadMap = new Map<string, { base?: AggregatedCallTree; cur?: AggregatedCallTree }>();
  for (const t of baseTrees) {
    if (!threadMap.has(t.threadName)) threadMap.set(t.threadName, {});
    threadMap.get(t.threadName)!.base = t;
  }
  for (const t of curTrees) {
    if (!threadMap.has(t.threadName)) threadMap.set(t.threadName, {});
    threadMap.get(t.threadName)!.cur = t;
  }

  const out: CallTreeDiff[] = [];
  for (const [threadName, pair] of threadMap) {
    const baseFrameCount = pair.base?.frameCount ?? 0;
    const curFrameCount = pair.cur?.frameCount ?? 0;
    const msPerFrameTotal = makeDiffPair(pair.base?.msPerFrameTotal, pair.cur?.msPerFrameTotal);

    // 顶层根节点合并对位
    const rootMap = new Map<string, { base?: AggregatedCallTreeNode; cur?: AggregatedCallTreeNode }>();
    for (const r of pair.base?.roots ?? []) {
      if (!rootMap.has(r.name)) rootMap.set(r.name, {});
      rootMap.get(r.name)!.base = r;
    }
    for (const r of pair.cur?.roots ?? []) {
      if (!rootMap.has(r.name)) rootMap.set(r.name, {});
      rootMap.get(r.name)!.cur = r;
    }
    const roots: CallTreeNodeDiff[] = [];
    for (const [, p] of rootMap) {
      roots.push(diffCallTreeNode(p.base, p.cur, ''));
    }
    roots.sort((a, b) => (b.msPerFrameTotal.cur ?? b.msPerFrameTotal.base ?? 0) - (a.msPerFrameTotal.cur ?? a.msPerFrameTotal.base ?? 0));

    out.push({ threadName, baseFrameCount, curFrameCount, msPerFrameTotal, roots });
  }
  // 按主线程优先排序
  out.sort((a, b) => {
    if (/Main Thread/i.test(a.threadName)) return -1;
    if (/Main Thread/i.test(b.threadName)) return 1;
    if (/Render Thread/i.test(a.threadName)) return -1;
    if (/Render Thread/i.test(b.threadName)) return 1;
    return (b.msPerFrameTotal.cur ?? b.msPerFrameTotal.base ?? 0) - (a.msPerFrameTotal.cur ?? a.msPerFrameTotal.base ?? 0);
  });
  return out;
}

// ============ markersByThread Δ ============

function diffMarkersByThread(base: Record<string, MarkerOutput[]> = {}, cur: Record<string, MarkerOutput[]> = {}): Record<string, MarkerDiff[]> {
  const allThreads = new Set<string>([...Object.keys(base), ...Object.keys(cur)]);
  const out: Record<string, MarkerDiff[]> = {};
  for (const thread of allThreads) {
    const baseMap = new Map<string, MarkerOutput>();
    for (const m of base[thread] ?? []) baseMap.set(m.name, m);
    const curMap = new Map<string, MarkerOutput>();
    for (const m of cur[thread] ?? []) curMap.set(m.name, m);
    const allNames = new Set<string>([...baseMap.keys(), ...curMap.keys()]);
    const diffs: MarkerDiff[] = [];
    for (const name of allNames) {
      const b = baseMap.get(name);
      const c = curMap.get(name);
      const msSelfMean = makeDiffPair(b?.msSelfMean, c?.msSelfMean);
      const percentOfFrame = makeDiffPair(b?.percentOfFrame, c?.percentOfFrame);
      const spikeRatio = makeDiffPair(b?.spikeRatio, c?.spikeRatio);
      diffs.push({
        name, thread,
        msSelfMean, percentOfFrame, spikeRatio,
        status: msSelfMean.status,
      });
    }
    diffs.sort((a, b) => {
      const aw = Math.max(a.msSelfMean.cur ?? 0, a.msSelfMean.base ?? 0);
      const bw = Math.max(b.msSelfMean.cur ?? 0, b.msSelfMean.base ?? 0);
      return bw - aw;
    });
    out[thread] = diffs.slice(0, 20);  // top 20 per thread
  }
  return out;
}

// ============ 共享：业务节点选取 / leaf-first 去重 ============

/** 泛阶段名（Unity 内置 PlayerLoop 阶段，对 GC/ROI 归因无可操作性，应过滤） */
export const STAGE_NAME_RE = /^(PlayerLoop|Update\.|LateUpdate\.|PreLateUpdate\.|FixedUpdate\.|Initialization\.|EarlyUpdate\.|PostLateUpdate\.|TimeUpdate\.|BehaviourUpdate$|LateBehaviourUpdate$|InitializationSystemGroup|SimulationSystemGroup|PresentationSystemGroup|Core\.Update$|Core\.LateUpdate$|Core\.FixedUpdate$)/;

const GC_STAGE_NAME_RE = new RegExp(
  STAGE_NAME_RE.source
    + '|UnityEngine\\.CoreModule\\.dll!.*RenderPipelineManager.*|URP\\.Render$|URP\\.RenderCameraStack$|URP\\.RenderSingleCamera$|AOE\\.dll!AOE::GameLauncher\\.\\w+\\(\\)$',
);

function isStageName(name: string): boolean {
  return STAGE_NAME_RE.test(name);
}

/** leaf-first：同链只保留最具体（最深）节点，与 §8 uniqueByLeaf 同构 */
function dedupeLeafFirstByPath<T extends { path: string }>(
  items: T[],
  scoreFn: (t: T) => number,
  limit: number,
): T[] {
  const sorted = [...items].sort((a, b) => scoreFn(b) - scoreFn(a));
  let out: T[] = [];
  for (const item of sorted) {
    if (out.some(k => k.path.startsWith(item.path + '▸'))) continue;
    out = out.filter(k => !item.path.startsWith(k.path + '▸'));
    out.push(item);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** 主线程 degraded 业务叶子（§3 Top-N / §8 P 候选同源） */
export function collectUniqueDegradedLeaves(main: CallTreeDiff | undefined, limit = 5): CallTreeNodeDiff[] {
  if (!main) return [];
  const degradedNodes: CallTreeNodeDiff[] = [];
  const walk = (n: CallTreeNodeDiff) => {
    const selfDelta = n.msPerFrameSelf.delta ?? 0;
    if (!isStageName(n.name) && n.status === 'degraded' && selfDelta >= 0.3) degradedNodes.push(n);
    n.children.forEach(walk);
  };
  main.roots.forEach(walk);
  return dedupeLeafFirstByPath(degradedNodes, n => n.msPerFrameSelf.delta ?? 0, limit);
}

// ============ GC 业务归因 Δ ============

function collectGcSubtrees(node: CallTreeNodeDiff, parentPath: string, out: { path: string; name: string; gcAlloc: DiffNumberPair; msPerFrameTotal: DiffNumberPair }[]) {
  const path = parentPath ? `${parentPath}▸${node.name}` : node.name;
  const baseAlloc = node.gcAllocCount.base ?? 0;
  const curAlloc = node.gcAllocCount.cur ?? 0;
  if ((baseAlloc >= 50 || curAlloc >= 50)
      && (node.gcAllocCount.status !== 'stable')
      && !GC_STAGE_NAME_RE.test(node.name)) {
    out.push({ path, name: node.name, gcAlloc: node.gcAllocCount, msPerFrameTotal: node.msPerFrameTotal });
  }
  for (const c of node.children) collectGcSubtrees(c, path, out);
}

function buildGcAttribution(
  callTreesDiff: CallTreeDiff[],
  base: PreprocessResult,
  cur: PreprocessResult,
): UnityDiffSummary['gcAttribution'] {
  const main = callTreesDiff.find(t => /Main Thread/i.test(t.threadName));
  if (!main) return { totalAllocPerFrame: makeDiffPair(0, 0), topSubtrees: [] };

  const playerLoop = main.roots.find(r => /PlayerLoop/i.test(r.name)) ?? main.roots[0];
  const baseAllocTotal = playerLoop?.gcAllocCount.base ?? 0;
  const curAllocTotal = playerLoop?.gcAllocCount.cur ?? 0;
  const baseFC = base.frameSummary.count;
  const curFC = cur.frameSummary.count;
  const baseAllocPerFrame = baseFC > 0 ? baseAllocTotal / baseFC : 0;
  const curAllocPerFrame = curFC > 0 ? curAllocTotal / curFC : 0;
  const totalAllocPerFrame = makeDiffPair(safeRound(baseAllocPerFrame, 1), safeRound(curAllocPerFrame, 1));

  const baseBytes = base.memory?.gcAllocatedInFrame?.mean;
  const curBytes = cur.memory?.gcAllocatedInFrame?.mean;
  const gcBytesPerFrame = (baseBytes != null || curBytes != null)
    ? makeDiffPair(baseBytes != null ? safeRound(baseBytes / 1024, 1) : null, curBytes != null ? safeRound(curBytes / 1024, 1) : null)
    : undefined;

  const allSubtrees: { path: string; name: string; gcAlloc: DiffNumberPair; msPerFrameTotal: DiffNumberPair }[] = [];
  for (const r of main.roots) collectGcSubtrees(r, '', allSubtrees);

  const topSubtrees = dedupeLeafFirstByPath(
    allSubtrees,
    s => Math.abs(s.gcAlloc.delta ?? 0),
    8,
  );

  return { totalAllocPerFrame, gcBytesPerFrame, topSubtrees };
}

// ============ Spike Δ ============

function buildSpikesDiff(base: PreprocessResult, cur: PreprocessResult): UnityDiffSummary['spikes'] {
  const baseMap = new Map<string, any>();
  for (const s of base.markerSpikes ?? []) baseMap.set(s.name, s);
  const curMap = new Map<string, any>();
  for (const s of cur.markerSpikes ?? []) curMap.set(s.name, s);

  const newSpikes: MarkerDiff[] = [];
  const resolvedSpikes: MarkerDiff[] = [];
  const changed: MarkerDiff[] = [];

  for (const [name, c] of curMap) {
    const b = baseMap.get(name);
    const msSelfMean = makeDiffPair(b?.msSelfMean, c.msSelfMean);
    const percentOfFrame = makeDiffPair(b?.msSelfP95, c.msSelfP95);
    const spikeRatio = makeDiffPair(b?.spikeRatio, c.spikeRatio);
    const md: MarkerDiff = { name, thread: '?', msSelfMean, percentOfFrame, spikeRatio, status: spikeRatio.status };
    if (!b) newSpikes.push(md);
    else if (Math.abs((spikeRatio.deltaPct ?? 0)) >= 30) changed.push(md);
  }
  for (const [name, b] of baseMap) {
    if (!curMap.has(name)) {
      const msSelfMean = makeDiffPair(b.msSelfMean, null);
      const percentOfFrame = makeDiffPair(b.msSelfP95, null);
      const spikeRatio = makeDiffPair(b.spikeRatio, null);
      resolvedSpikes.push({ name, thread: '?', msSelfMean, percentOfFrame, spikeRatio, status: 'removed' });
    }
  }
  return { newSpikes: newSpikes.slice(0, 8), resolvedSpikes: resolvedSpikes.slice(0, 8), changed: changed.slice(0, 8) };
}

// ============ 主入口 ============

export function buildUnityDiffSummary(base: PreprocessResult, cur: PreprocessResult, meta: { baseLabel: string; curLabel: string }): UnityDiffSummary {
  // §1 同源性
  const targetFpsMatch = base.config.targetFps === cur.config.targetFps;
  const framesRatio = base.frameSummary.count > 0 ? cur.frameSummary.count / base.frameSummary.count : 0;
  const consistencyNotes: string[] = [];
  if (!targetFpsMatch) consistencyNotes.push(`⚠️ targetFps 不一致: base=${base.config.targetFps} cur=${cur.config.targetFps}`);
  if (framesRatio < 0.5 || framesRatio > 2) consistencyNotes.push(`⚠️ 帧数差异大: base=${base.frameSummary.count} cur=${cur.frameSummary.count} (ratio ${safeRound(framesRatio, 2)})`);

  // §2 frameSummary Δ
  const frameSummary = {
    mean: makeDiffPair(base.frameSummary.mean, cur.frameSummary.mean),
    median: makeDiffPair(base.frameSummary.median, cur.frameSummary.median),
    p90: makeDiffPair(base.frameSummary.p90, cur.frameSummary.p90),
    p95: makeDiffPair(base.frameSummary.p95, cur.frameSummary.p95),
    p99: makeDiffPair(base.frameSummary.p99, cur.frameSummary.p99),
    p999: makeDiffPair(base.frameSummary.p999, cur.frameSummary.p999),
    actualFps: makeDiffPair(base.frameSummary.actualFps, cur.frameSummary.actualFps),
    jankCount: makeDiffPair(base.frameSummary.jankCount, cur.frameSummary.jankCount),
    bigJankCount: makeDiffPair(base.frameSummary.bigJankCount, cur.frameSummary.bigJankCount),
  };
  // 反转 fps 类指标的 status 语义（越大越好；其他 ms/jank 类越小越好）
  if (frameSummary.actualFps.status === 'improved') frameSummary.actualFps.status = 'degraded';
  else if (frameSummary.actualFps.status === 'degraded') frameSummary.actualFps.status = 'improved';

  // §3 callTreesDiff
  const callTreesDiff = diffAggregatedCallTrees(base.aggregatedCallTrees, cur.aggregatedCallTrees);

  // §4 markersByThreadDiff
  const markersByThreadDiff = diffMarkersByThread(base.markersByThread, cur.markersByThread);

  // §5 GC 业务归因
  const gcAttribution = buildGcAttribution(callTreesDiff, base, cur);

  const mainThread = callTreesDiff.find(t => /Main Thread/i.test(t.threadName));
  const topHotspots = collectUniqueDegradedLeaves(mainThread, 8).map((n, i) => ({
    rank: i + 1,
    name: n.name,
    path: n.path,
    msPerFrameSelf: n.msPerFrameSelf,
    msPerFrameTotal: n.msPerFrameTotal,
    gcAllocCount: n.gcAllocCount,
    status: n.status,
  }));

  // §6 Spikes
  const spikes = buildSpikesDiff(base, cur);

  // §7 Marker 新增/消失
  const baseMarkerNames = new Set((base.markers ?? []).map(m => m.name));
  const curMarkerNames = new Set((cur.markers ?? []).map(m => m.name));
  const presence = {
    addedInCur: [...curMarkerNames].filter(n => !baseMarkerNames.has(n)).slice(0, 20),
    removedFromCur: [...baseMarkerNames].filter(n => !curMarkerNames.has(n)).slice(0, 20),
  };

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      base: { label: meta.baseLabel, targetFps: base.config.targetFps, frameCount: base.frameSummary.count },
      cur: { label: meta.curLabel, targetFps: cur.config.targetFps, frameCount: cur.frameSummary.count },
    },
    consistency: { targetFpsMatch, framesRatio: safeRound(framesRatio, 2), note: consistencyNotes },
    frameSummary,
    callTreesDiff,
    markersByThreadDiff,
    gcAttribution,
    topHotspots,
    spikes,
    presence,
  };
}

// ============ 骨架 markdown 渲染 ============

function fmtPair(pair: DiffNumberPair, unit = 'ms'): string {
  const fmt = (v: number | null) => v == null ? '—' : (unit === '%' ? `${v.toFixed(1)}%` : `${v.toFixed(2)}${unit}`);
  const b = fmt(pair.base);
  const c = fmt(pair.cur);
  const d = pair.delta == null ? '' : (pair.delta >= 0 ? `+${pair.delta.toFixed(2)}` : pair.delta.toFixed(2));
  const dp = pair.deltaPct == null ? '' : ` (${pair.deltaPct >= 0 ? '+' : ''}${pair.deltaPct.toFixed(1)}%)`;
  const emoji = pair.status === 'degraded' ? '🔴' : pair.status === 'improved' ? '🟢' : pair.status === 'newly_added' ? '🆕' : pair.status === 'removed' ? '➖' : '⚪';
  return `${b} → ${c} ${d ? `(${d}${unit}${dp})` : ''} ${emoji}`;
}

function renderCallTreeNode(node: CallTreeNodeDiff, depth: number, maxLines: { remaining: number }, lines: string[]) {
  if (maxLines.remaining <= 0) return;
  if (node.msPerFrameTotal.status === 'stable' && (node.msPerFrameTotal.cur ?? 0) < 0.5) {
    // 噪声，跳过
    return;
  }
  const indent = '  '.repeat(Math.min(depth, 8));
  const emoji = node.status === 'degraded' ? '🔴' : node.status === 'improved' ? '🟢' : node.status === 'newly_added' ? '🆕' : node.status === 'removed' ? '➖' : '⚪';
  const ms = fmtPair(node.msPerFrameTotal, 'ms').replace(/[🔴🟢🆕➖⚪]/g, '').trim();
  const gc = node.gcAllocCount.delta != null && Math.abs(node.gcAllocCount.delta) >= 100 ? ` gcΔ=${node.gcAllocCount.delta > 0 ? '+' : ''}${node.gcAllocCount.delta.toFixed(0)}` : '';
  lines.push(`${indent}└─ ${node.name}: ${ms} ${emoji}${gc}`);
  maxLines.remaining--;
  for (const c of node.children) renderCallTreeNode(c, depth + 1, maxLines, lines);
}

export function buildSkeletonMarkdown(summary: UnityDiffSummary): string {
  const lines: string[] = [];
  const { meta, consistency, frameSummary, callTreesDiff, markersByThreadDiff, gcAttribution, spikes, presence } = summary;

  lines.push(`# Unity Profiler 双版本对比报告 — ${meta.base.label} vs ${meta.cur.label}`);
  lines.push('');
  lines.push(`> base: ${meta.base.label} (${meta.base.frameCount} 帧, target ${meta.base.targetFps}fps)`);
  lines.push(`> cur: ${meta.cur.label} (${meta.cur.frameCount} 帧, target ${meta.cur.targetFps}fps)`);
  lines.push(`> 生成: unity-diff-builder · ${summary.generatedAt.slice(0, 19)}`);
  lines.push('', '---', '');

  // §0 一句话结论 — Provider 给基础结论, AI 润色
  const meanDelta = frameSummary.mean.delta ?? 0;
  const p95Delta = frameSummary.p95.delta ?? 0;
  const status = meanDelta > 0.5 ? '回归' : meanDelta < -0.5 ? '改善' : '稳定';
  const main = callTreesDiff.find(t => /Main Thread/i.test(t.threadName));
  const topRegression = collectUniqueDegradedLeaves(main, 1)[0] ?? null;

  lines.push('## §0 一句话结论', '');
  lines.push(`**主线程帧均 ${frameSummary.mean.base?.toFixed(2)}ms → ${frameSummary.mean.cur?.toFixed(2)}ms (${meanDelta >= 0 ? '+' : ''}${meanDelta.toFixed(2)}ms, ${status})；P95 ${frameSummary.p95.base?.toFixed(2)} → ${frameSummary.p95.cur?.toFixed(2)} (${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}ms)。**`);
  if (topRegression) {
    lines.push('');
    lines.push(`> **头号回归**: ${topRegression.path} ms/帧 ${fmtPair(topRegression.msPerFrameTotal, 'ms')}`);
  }
  lines.push('', '---', '');

  // §1 同源性
  lines.push('## §1 同源性校验', '');
  lines.push('| 项 | base | cur |');
  lines.push('|---|---|---|');
  lines.push(`| target FPS | ${meta.base.targetFps} | ${meta.cur.targetFps} ${consistency.targetFpsMatch ? '✅' : '⚠️'} |`);
  lines.push(`| 帧数 | ${meta.base.frameCount} | ${meta.cur.frameCount} (ratio ${consistency.framesRatio}) |`);
  for (const n of consistency.note) lines.push(`- ${n}`);
  lines.push('', '---', '');

  // §2 帧级 Δ
  lines.push('## §2 帧级 Δ', '');
  lines.push('| 指标 | base | cur | Δ | Δ% | 状态 |');
  lines.push('|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(frameSummary)) {
    const emoji = v.status === 'degraded' ? '🔴' : v.status === 'improved' ? '🟢' : '⚪';
    lines.push(`| ${k} | ${v.base ?? '—'} | ${v.cur ?? '—'} | ${v.delta == null ? '—' : (v.delta >= 0 ? '+' : '') + v.delta.toFixed(2)} | ${v.deltaPct == null ? '—' : (v.deltaPct >= 0 ? '+' : '') + v.deltaPct.toFixed(1) + '%'} | ${emoji} |`);
  }
  lines.push('', '---', '');

  // §3 主线程业务子树 Δ
  lines.push('## §3 主线程业务子树 Δ (aggregatedCallTrees)', '');
  if (main) {
    lines.push(`Main Thread ms/帧: ${fmtPair(main.msPerFrameTotal, 'ms')}`, '');
    lines.push('```');
    const remaining = { remaining: 40 };
    for (const r of main.roots) renderCallTreeNode(r, 0, remaining, lines);
    lines.push('```');
    const topN = summary.topHotspots?.length
      ? summary.topHotspots
      : collectUniqueDegradedLeaves(main, 8).map((n, i) => ({
          rank: i + 1, name: n.name, path: n.path,
          msPerFrameSelf: n.msPerFrameSelf, msPerFrameTotal: n.msPerFrameTotal,
          gcAllocCount: n.gcAllocCount, status: n.status,
        }));
    if (topN.length) {
      lines.push('', '### Top-N 主线程热点 (msSelf Δ)', '');
      lines.push('| # | 模块 | self ms/帧 Δ | total ms/帧 Δ | GC.Alloc Δ (全trace 次数) | 状态 |');
      lines.push('|---:|---|---:|---:|---:|---|');
      for (const row of topN) {
        const sd = row.msPerFrameSelf.delta ?? 0;
        const td = row.msPerFrameTotal.delta ?? 0;
        const gc = row.gcAllocCount.delta ?? 0;
        const emoji = row.status === 'degraded' ? '🔴' : row.status === 'newly_added' ? '🆕' : row.status === 'improved' ? '🟢' : '⚪';
        lines.push(`| ${row.rank} | ${row.name} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms | ${td >= 0 ? '+' : ''}${td.toFixed(2)}ms | ${gc >= 0 ? '+' : ''}${gc.toFixed(0)} | ${emoji} |`);
      }
      lines.push('', '<!-- ENRICH_FILL:§3要点 -->', '');
    }
  } else {
    lines.push('_主线程数据缺失_');
  }
  lines.push('', '---', '');

  // §4 各线程 Δ
  lines.push('## §4 各线程 (per-thread) Δ', '');
  for (const [thread, diffs] of Object.entries(markersByThreadDiff)) {
    if (!diffs.length || /Main Thread/i.test(thread)) continue;
    const visible = diffs.filter(d => d.status !== 'stable').slice(0, 5);
    if (!visible.length) continue;
    lines.push(`### ${thread}`, '');
    lines.push('| marker | selfMean base→cur | Δ | 状态 |');
    lines.push('|---|---|---|---|');
    for (const d of visible) {
      const emoji = d.status === 'degraded' ? '🔴' : d.status === 'improved' ? '🟢' : d.status === 'newly_added' ? '🆕' : d.status === 'removed' ? '➖' : '⚪';
      const b = d.msSelfMean.base?.toFixed(2) ?? '—';
      const c = d.msSelfMean.cur?.toFixed(2) ?? '—';
      const dlt = d.msSelfMean.delta == null ? '—' : (d.msSelfMean.delta >= 0 ? '+' : '') + d.msSelfMean.delta.toFixed(2) + 'ms';
      lines.push(`| ${d.name} | ${b}→${c} | ${dlt} | ${emoji} |`);
    }
    lines.push('', `<!-- ENRICH_FILL:§4:${thread} -->`, '');
  }
  lines.push('---', '');

  // §5 GC Δ
  lines.push('## §5 GC 压力 Δ', '');
  lines.push(`每帧 GC.Alloc **次数**: ${fmtPair(gcAttribution.totalAllocPerFrame, '次/帧').replace(/[🔴🟢🆕➖⚪]/g, '').trim()}`);
  if (gcAttribution.gcBytesPerFrame) {
    const kb = fmtPair(gcAttribution.gcBytesPerFrame, 'KB/帧').replace(/[🔴🟢🆕➖⚪]/g, '').trim();
    lines.push(`每帧 GC **分配字节**（帧级 counter 均值）: ${kb}`);
    lines.push('> **局限**：字节口径来自 `memory.gcAllocatedInFrame` 帧级 counter，**无法**按业务子树拆分归因。');
  }
  lines.push('> **口径**：下表 `GC.Alloc 次数` 为 **全 trace 累计**（子树内 marker 次数向上聚合）；`Δ 次数` = cur − base。', '');
  if (gcAttribution.topSubtrees.length) {
    lines.push('| 业务子树（叶子归因） | GC.Alloc 次数 base→cur（全 trace） | Δ 次数 | ms/帧 Δ |');
    lines.push('|---|---|---:|---:|');
    for (const s of gcAttribution.topSubtrees) {
      const ga = `${s.gcAlloc.base ?? 0}→${s.gcAlloc.cur ?? 0}`;
      const gd = s.gcAlloc.delta == null ? '—' : (s.gcAlloc.delta >= 0 ? '+' : '') + s.gcAlloc.delta.toFixed(0);
      const md = s.msPerFrameTotal.delta == null ? '—' : (s.msPerFrameTotal.delta >= 0 ? '+' : '') + s.msPerFrameTotal.delta.toFixed(2) + 'ms';
      lines.push(`| ${s.name} \`${s.path.split('▸').slice(-2).join('▸')}\` | ${ga} | ${gd} | ${md} |`);
    }
  }
  lines.push('', '<!-- ENRICH_FILL:§5要点 -->', '', '---', '');

  // §6 慢帧 / 波动 Δ
  lines.push('## §6 慢帧 / 波动 Δ', '');
  if (spikes.newSpikes.length) {
    lines.push(`### 新增 spike (cur 独有)`, '');
    lines.push('| marker | spikeRatio | selfMean |');
    lines.push('|---|---|---|');
    for (const s of spikes.newSpikes) lines.push(`| ${s.name} | ${s.spikeRatio.cur?.toFixed(1) ?? '—'}× | ${s.msSelfMean.cur?.toFixed(2) ?? '—'}ms |`);
    lines.push('');
  }
  if (spikes.resolvedSpikes.length) {
    lines.push(`### 已解决 spike (base 独有)`, '');
    lines.push('| marker | base spikeRatio |');
    lines.push('|---|---|');
    for (const s of spikes.resolvedSpikes) lines.push(`| ${s.name} | ${s.spikeRatio.base?.toFixed(1) ?? '—'}× |`);
    lines.push('');
  }
  lines.push('---', '');

  // §7 新增 / 消失 marker
  lines.push('## §7 新增 / 消失 marker', '');
  if (presence.addedInCur.length) {
    lines.push('**cur 新增**: ' + presence.addedInCur.slice(0, 10).join(', '));
    lines.push('');
  }
  if (presence.removedFromCur.length) {
    lines.push('**cur 消失**: ' + presence.removedFromCur.slice(0, 10).join(', '));
    lines.push('');
  }
  lines.push('---', '');

  // §8 可执行建议
  lines.push('## §8 可执行建议（按 ROI）', '');
  const uniqueByLeaf = collectUniqueDegradedLeaves(main, 5);

  uniqueByLeaf.forEach((n, i) => {
    lines.push(`### P${i + 1} — 削减 ${n.name} (self ${(n.msPerFrameSelf.delta ?? 0).toFixed(2)}ms/帧 回归)`);
    lines.push('');
    lines.push('**身份**：');
    lines.push(`- 路径：\`${n.path}\``);
    lines.push(`- self ms/帧 ${fmtPair(n.msPerFrameSelf, 'ms')}`);
    lines.push(`- total ms/帧 ${fmtPair(n.msPerFrameTotal, 'ms')}`);
    if (n.msPerFrameSelf.cur != null && n.msPerFrameTotal.cur != null && n.msPerFrameTotal.cur > 0) {
      const selfRatio = ((n.msPerFrameSelf.cur / n.msPerFrameTotal.cur) * 100).toFixed(0);
      lines.push(`- self/total = ${selfRatio}% （${Number(selfRatio) > 70 ? '⚠️ 自身循环即瓶颈，优化收益高' : '主要由子节点贡献，需进一步下钻'}）`);
    }
    if (n.gcAllocCount.delta != null && Math.abs(n.gcAllocCount.delta) >= 100) {
      lines.push(`- gcAlloc Δ ${n.gcAllocCount.delta > 0 ? '+' : ''}${n.gcAllocCount.delta.toFixed(0)} 次/全trace（${n.gcAllocCount.delta > 0 ? '同步 GC 风险升高' : '同步 GC 风险降低'}）`);
    }
    if (n.status === 'newly_added') lines.push(`- 🆕 base 完全没有此模块，cur 新引入`);
    lines.push('');

    lines.push('**业务含义** (_AI_FILL: 2-3 句话解释为什么 base→cur 此模块负载暴涨/出现，结合压测场景与业务知识_)：');
    lines.push('- _待 AI 填充：业务背景解释_');
    lines.push('');

    lines.push('**本源边界** (_AI_FILL: Profile 数据能 / 不能告诉你什么_)：');
    lines.push('- _待 AI 填充：哪些诊断 self/total 已经能定，哪些需要 Frame Debugger / RenderDoc / Memory Profiler 复核_');
    lines.push('');

    lines.push('**优化方向** (_AI_FILL: ≥3 条具体可操作项_)：');
    lines.push('1. _待 AI 填充：第一优化方向_');
    lines.push('2. _待 AI 填充：第二优化方向_');
    lines.push('3. _待 AI 填充：第三优化方向_');
    lines.push('');

    // 模块内部细分（Provider 直接给数据）
    if (n.children && n.children.length) {
      const subDegraded = n.children
        .filter(c => c.status === 'degraded' || c.status === 'newly_added')
        .filter(c => Math.abs(c.msPerFrameSelf.delta ?? 0) >= 0.05 || Math.abs(c.msPerFrameTotal.delta ?? 0) >= 0.1)
        .sort((a, b) => Math.abs(b.msPerFrameSelf.delta ?? 0) - Math.abs(a.msPerFrameSelf.delta ?? 0))
        .slice(0, 6);
      if (subDegraded.length) {
        lines.push('**模块内部细分**（Provider 数据，AI 不准改）：');
        for (const c of subDegraded) {
          const selfStr = `self ${c.msPerFrameSelf.base?.toFixed(2) ?? '—'}→${c.msPerFrameSelf.cur?.toFixed(2) ?? '—'}ms`;
          const dlt = c.msPerFrameSelf.delta == null ? '' : ` (${c.msPerFrameSelf.delta >= 0 ? '+' : ''}${c.msPerFrameSelf.delta.toFixed(2)}ms)`;
          const emoji = c.status === 'newly_added' ? '🆕' : '🔴';
          lines.push(`- ${c.name}: ${selfStr}${dlt} ${emoji}`);
        }
        lines.push('');
      }
    }
  });
  if (!uniqueByLeaf.length) lines.push('- 无显著回归，本版本稳定或改善');
  lines.push('', '---', '', `_本骨架由 unity-diff-builder 自动产出，含 5 段标准结构（身份/业务含义/本源边界/优化方向/细分）。AI 仅填充标记 \`_AI_FILL_\` 的部分。_`);

  return lines.join('\n');
}

// ============ CLI ============

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function main() {
  const basePath = arg('base');
  const curPath = arg('cur');
  const outDir = arg('out');
  if (!basePath || !curPath || !outDir) {
    console.error('Usage: tsx unity-diff-builder.ts --base <base.json> --cur <cur.json> --out <out_dir>');
    process.exit(1);
  }
  const base: PreprocessResult = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
  const cur: PreprocessResult = JSON.parse(fs.readFileSync(curPath, 'utf-8'));

  const summary = buildUnityDiffSummary(base, cur, {
    baseLabel: arg('base-label') ?? path.basename(basePath, '.json'),
    curLabel: arg('cur-label') ?? path.basename(curPath, '.json'),
  });

  fs.mkdirSync(outDir, { recursive: true });
  const summaryPath = path.join(outDir, 'unity-diff-summary.json');
  const skeletonPath = path.join(outDir, 'performance-report_unity_diff_skeleton.md');

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  const md = buildSkeletonMarkdown(summary);
  fs.writeFileSync(skeletonPath, md, 'utf-8');

  console.error(`[unity-diff] summary → ${summaryPath}`);
  console.error(`[unity-diff] skeleton → ${skeletonPath}`);
  console.error(`[unity-diff] callTreesDiff: ${summary.callTreesDiff.length} threads, top regression: ${summary.callTreesDiff[0]?.threadName ?? '?'}`);
  console.log(JSON.stringify({ summaryPath, skeletonPath, mdLines: md.split('\n').length }, null, 2));
}

if (require.main === module) main();
