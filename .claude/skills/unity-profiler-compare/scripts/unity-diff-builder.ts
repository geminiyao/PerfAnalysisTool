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
  /** self ms ÷ 出现帧数（仅 marker 存在的帧） */
  msSelfWhenPresent: DiffNumberPair;
  presentRate: DiffNumberPair;
  presentOnFrameCount: { base: number | null; cur: number | null };
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
  /** §3 Top-N 热点（帧预算：÷总帧数） */
  topHotspots: HotspotRow[];
  /** §3 Top-N 补充（出现帧 self 均值：÷出现帧数） */
  topHotspotsPresent: HotspotPresentRow[];
  /** §6 慢帧 / 波动 Δ */
  spikes: { newSpikes: MarkerDiff[]; resolvedSpikes: MarkerDiff[]; changed: MarkerDiff[] };
  /** §7 新增 / 消失 marker */
  presence: { addedInCur: string[]; removedFromCur: string[] };
}

interface HotspotRow {
  rank: number;
  name: string;
  path: string;
  msPerFrameSelf: DiffNumberPair;
  msPerFrameTotal: DiffNumberPair;
  gcAllocCount: DiffNumberPair;
  status: DiffStatus;
  isGroup?: boolean;
  groupKey?: string;
  memberCount?: number;
  members?: HotspotRow[];
}

interface HotspotPresentRow {
  rank: number;
  name: string;
  path: string;
  msSelfWhenPresent: DiffNumberPair;
  msPerFrameSelf: DiffNumberPair;
  presentRate: DiffNumberPair;
  presentOnFrameCount: { base: number | null; cur: number | null };
  status: DiffStatus;
  isGroup?: boolean;
  groupKey?: string;
  memberCount?: number;
}

interface PresentHotspotDisplayRow {
  rank: number;
  label: string;
  row: HotspotPresentRow;
  isGroup: boolean;
  members: HotspotPresentRow[];
}

function msWhenPresent(msSelf: number | undefined, presentCount: number | undefined): number | null {
  if (msSelf == null || presentCount == null || presentCount <= 0) return null;
  return safeRound(msSelf / presentCount, 3);
}

// ============ Δ 计算辅助 ============

const SIGNIFICANT_DELTA_PCT = 5;  // ≥5% 视为变化
const STABLE_THRESHOLD_MS = 0.05;  // ms/帧 < 0.05 视为稳态噪声
/** §3 主树剪枝：信号阈值（非行数上限）；完整数据始终在 unity-diff-summary.json */
const TREE_MIN_TOTAL_DELTA_MS = 0.1;
const TREE_MIN_SELF_DELTA_MS = 0.1;
const TREE_MIN_CUR_MS = 0.1;
const TREE_MIN_GC_DELTA = 100;
const TREE_MIN_IMPROVED_DELTA_MS = 0.5;  // 仅展示幅度较大的改善

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
  const msSelfWhenPresent = makeDiffPair(
    msWhenPresent(baseNode?.msSelf, baseNode?.presentOnFrameCount),
    msWhenPresent(curNode?.msSelf, curNode?.presentOnFrameCount),
  );
  const presentRate = makeDiffPair(baseNode?.presentRate, curNode?.presentRate);
  const presentOnFrameCount = {
    base: baseNode?.presentOnFrameCount ?? null,
    cur: curNode?.presentOnFrameCount ?? null,
  };
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
    msPerFrameTotal, msPerFrameSelf, msSelfWhenPresent, presentRate, presentOnFrameCount, threadPct, gcAllocCount,
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

const PRESENT_HOTSPOT_MIN_CUR_MS = 0.2;

/** 主线程「出现帧 self 均值」热点（÷出现帧数，leaf-first） */
export function collectPresentFrameHotspots(main: CallTreeDiff | undefined, limit = 8): CallTreeNodeDiff[] {
  if (!main) return [];
  const candidates: CallTreeNodeDiff[] = [];
  const walk = (n: CallTreeNodeDiff) => {
    if (!isStageName(n.name) && !/^GC(\.|$)/.test(n.name)) {
      const curWp = n.msSelfWhenPresent.cur ?? 0;
      const deltaWp = n.msSelfWhenPresent.delta ?? 0;
      const interesting =
        curWp >= PRESENT_HOTSPOT_MIN_CUR_MS
        || (n.status === 'newly_added' && curWp >= 0.15)
        || (n.msSelfWhenPresent.status === 'degraded' && deltaWp >= 0.1);
      if (interesting && (n.status === 'degraded' || n.status === 'newly_added' || deltaWp >= 0.1)) {
        candidates.push(n);
      }
    }
    n.children.forEach(walk);
  };
  main.roots.forEach(walk);
  return dedupeLeafFirstByPath(candidates, n => n.msSelfWhenPresent.cur ?? 0, limit);
}

function isPbDecodeName(name: string): boolean {
  return /\*\*\* pb\.decode\*\*\*/i.test(name);
}

function isResMarkerName(name: string): boolean {
  return /^\[res\]/i.test(name);
}

function aggregatePresentGroup(members: HotspotPresentRow[], label: string, groupKey: string): HotspotPresentRow {
  const curWp = Math.max(...members.map(m => m.msSelfWhenPresent.cur ?? 0));
  const baseWp = Math.max(...members.map(m => m.msSelfWhenPresent.base ?? 0), 0);
  const pfCur = members.reduce((s, m) => s + (m.presentOnFrameCount.cur ?? 0), 0);
  const pfBase = members.reduce((s, m) => s + (m.presentOnFrameCount.base ?? 0), 0);
  const msPfB = members.reduce((s, m) => s + (m.msPerFrameSelf.base ?? 0), 0);
  const msPfC = members.reduce((s, m) => s + (m.msPerFrameSelf.cur ?? 0), 0);
  return {
    rank: 0,
    name: label,
    path: members[0]?.path ?? label,
    msSelfWhenPresent: makeDiffPair(baseWp || null, curWp),
    msPerFrameSelf: makeDiffPair(msPfB || null, msPfC),
    presentRate: makeDiffPair(
      pfBase && members[0] ? safeRound((pfBase / (members[0].presentOnFrameCount.base ? 1 : 1)) * 0, 1) : null,
      null,
    ),
    presentOnFrameCount: { base: pfBase || null, cur: pfCur || null },
    presentRate: makeDiffPair(null, null),
    status: members.some(m => m.status === 'newly_added') ? 'newly_added' : 'degraded',
    isGroup: true,
    groupKey,
    memberCount: members.length,
  };
}

function buildPresentHotspotDisplayRows(rows: HotspotPresentRow[], limit = 8): PresentHotspotDisplayRow[] {
  const urp = rows.filter(r => isUrpRenderPassHotspot(r));
  const decode = rows.filter(r => isPbDecodeName(r.name));
  const res = rows.filter(r => isResMarkerName(r.name));
  const rest = rows.filter(r => !isPbDecodeName(r.name) && !isResMarkerName(r.name) && !isUrpRenderPassHotspot(r));

  const buckets: HotspotPresentRow[] = [...rest];
  if (urp.length >= 2) {
    buckets.push(aggregatePresentGroup(urp, `URP 渲染管线（${urp.length} 项合并）`, 'urp.render'));
  } else {
    buckets.push(...urp);
  }
  if (decode.length) {
    buckets.push(aggregatePresentGroup(decode, `网络 pb.decode（${decode.length} 项合并）`, 'pb.decode'));
  }
  if (res.length) {
    buckets.push(aggregatePresentGroup(res, `资源 [res] 加载/卸载（${res.length} 项合并）`, 'res'));
  }
  buckets.sort((a, b) => (b.msSelfWhenPresent.cur ?? 0) - (a.msSelfWhenPresent.cur ?? 0));

  return buckets.slice(0, limit).map((row, i) => ({
    rank: i + 1,
    label: row.name,
    row: { ...row, rank: i + 1 },
    isGroup: Boolean(row.isGroup),
    members: row.groupKey === 'pb.decode' ? decode
      : row.groupKey === 'res' ? res
        : row.groupKey === 'urp.render' ? urp
          : [row],
  }));
}

function fmtPresentFramesCell(
  pf: { base: number | null; cur: number | null },
  totalFrames: { base: number; cur: number },
): string {
  const b = pf.base == null ? '—' : String(pf.base);
  const c = pf.cur == null ? '—' : String(pf.cur);
  return `${b}→${c} / ${totalFrames.base}→${totalFrames.cur}`;
}

function toHotspotRow(n: CallTreeNodeDiff, rank: number): HotspotRow {
  return {
    rank, name: n.name, path: n.path,
    msPerFrameSelf: n.msPerFrameSelf, msPerFrameTotal: n.msPerFrameTotal,
    gcAllocCount: n.gcAllocCount, status: n.status,
  };
}

function toHotspotPresentRow(n: CallTreeNodeDiff, rank: number): HotspotPresentRow {
  return {
    rank, name: n.name, path: n.path,
    msSelfWhenPresent: n.msSelfWhenPresent, msPerFrameSelf: n.msPerFrameSelf,
    presentRate: n.presentRate,
    presentOnFrameCount: n.presentOnFrameCount,
    status: n.msSelfWhenPresent.status,
  };
}

function isUrpRenderPassHotspot(row: Pick<HotspotRow, 'name' | 'path'>): boolean {
  return /^URP\./.test(row.name)
    && /FinishFrameRendering|RenderPipelineManager|URP\.Render/.test(row.path);
}

function sumDiffPairs(members: HotspotRow[], pick: (r: HotspotRow) => DiffNumberPair): DiffNumberPair {
  const base = members.reduce((s, m) => s + (pick(m).base ?? 0), 0);
  const cur = members.reduce((s, m) => s + (pick(m).cur ?? 0), 0);
  return makeDiffPair(base || null, cur || null);
}

function findUrpGroupAnchorPath(members: HotspotRow[]): string {
  for (const m of members) {
    const parts = m.path.split('▸');
    const idx = parts.findIndex(p => p === 'URP.RenderSingleCamera');
    if (idx >= 0) return parts.slice(0, idx + 1).join('▸');
  }
  for (const m of members) {
    const parts = m.path.split('▸');
    const idx = parts.findIndex(p => /FinishFrameRendering/.test(p));
    if (idx >= 0) return parts.slice(0, idx + 1).join('▸');
  }
  return members[0]?.path ?? 'URP';
}

function aggregateBudgetGroup(members: HotspotRow[], label: string, groupKey: string): HotspotRow {
  const sorted = [...members].sort((a, b) => (b.msPerFrameSelf.delta ?? 0) - (a.msPerFrameSelf.delta ?? 0));
  return {
    rank: 0,
    name: label,
    path: findUrpGroupAnchorPath(sorted),
    msPerFrameSelf: sumDiffPairs(sorted, r => r.msPerFrameSelf),
    msPerFrameTotal: sumDiffPairs(sorted, r => r.msPerFrameTotal),
    gcAllocCount: sumDiffPairs(sorted, r => r.gcAllocCount),
    status: sorted.some(m => m.status === 'degraded') ? 'degraded' : sorted[0]?.status ?? 'stable',
    isGroup: true,
    groupKey,
    memberCount: sorted.length,
    members: sorted,
  };
}

/** 帧预算 Top-N 展示行：合并 URP pass 等同族热点 */
export function buildBudgetHotspotDisplayRows(rows: HotspotRow[], limit = 8): HotspotRow[] {
  const urp = rows.filter(isUrpRenderPassHotspot);
  const rest = rows.filter(r => !isUrpRenderPassHotspot(r));
  const buckets: HotspotRow[] = [...rest];
  if (urp.length >= 2) {
    buckets.push(aggregateBudgetGroup(urp, `URP 渲染管线（${urp.length} 项合并）`, 'urp.render'));
  } else {
    buckets.push(...urp);
  }
  buckets.sort((a, b) => (b.msPerFrameSelf.delta ?? 0) - (a.msPerFrameSelf.delta ?? 0));
  return buckets.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 }));
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
  const rawHotspots = collectUniqueDegradedLeaves(mainThread, 16).map((n, i) => toHotspotRow(n, i + 1));
  const topHotspots = buildBudgetHotspotDisplayRows(rawHotspots, 8);
  const topHotspotsPresent = collectPresentFrameHotspots(mainThread, 24).map((n, i) => toHotspotPresentRow(n, i + 1));

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
    topHotspotsPresent,
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

function findNodeByPath(main: CallTreeDiff, targetPath: string): CallTreeNodeDiff | null {
  let found: CallTreeNodeDiff | null = null;
  const walk = (n: CallTreeNodeDiff) => {
    if (n.path === targetPath) found = n;
    n.children.forEach(walk);
  };
  main.roots.forEach(walk);
  return found;
}

function hotspotEmoji(status: DiffStatus): string {
  if (status === 'degraded') return '🔴';
  if (status === 'newly_added') return '🆕';
  if (status === 'improved') return '🟢';
  return '⚪';
}

function collectNodesOnPath(main: CallTreeDiff, targetPath: string): CallTreeNodeDiff[] {
  const chain: CallTreeNodeDiff[] = [];
  const walk = (nodes: CallTreeNodeDiff[]): boolean => {
    for (const n of nodes) {
      if (targetPath === n.path || targetPath.startsWith(n.path + '▸')) {
        chain.push(n);
        if (n.path === targetPath) return true;
        if (walk(n.children)) return true;
        chain.pop();
      }
    }
    return false;
  };
  walk(main.roots);
  return chain;
}

function formatCallTreeNodeLine(node: CallTreeNodeDiff, tier: 'hot' | 'warm'): string {
  const emoji = tier === 'hot' ? '🔴' : '🟡';
  const ms = fmtPair(node.msPerFrameTotal, 'ms').replace(/[🔴🟢🆕➖⚪🟡]/g, '').trim();
  const gc = node.gcAllocCount.delta != null && Math.abs(node.gcAllocCount.delta) >= 100
    ? ` gcΔ=${node.gcAllocCount.delta > 0 ? '+' : ''}${node.gcAllocCount.delta.toFixed(0)}`
    : '';
  const tag = node.status === 'newly_added' ? ' 🆕' : node.status === 'improved' ? ' 🟢' : '';
  const label = /^MapSignificanceMgr/.test(node.name) && /\.sampler_/.test(node.name)
    ? 'MapSignificanceMgr'
    : node.name;
  return `${label}: ${ms} ${emoji}${gc}${tag}`;
}

function renderHotspotPathTree(main: CallTreeDiff | undefined, targetPath: string): string[] {
  if (!main) return ['_主线程数据缺失_'];
  const chain = collectNodesOnPath(main, targetPath);
  if (!chain.length) return [`_路径未在主线程树中找到_`];
  return chain.map((node, depth) => `${'  '.repeat(depth)}└─ ${formatCallTreeNodeLine(node, 'hot')}`);
}

function collectHotspotChildBreakdown(node: CallTreeNodeDiff | null, limit = 8): CallTreeNodeDiff[] {
  return (node?.children ?? [])
    .filter(c => c.status !== 'stable' || Math.abs(c.msPerFrameSelf.delta ?? 0) >= 0.03)
    .sort((a, b) => Math.abs(b.msPerFrameSelf.delta ?? 0) - Math.abs(a.msPerFrameSelf.delta ?? 0))
    .slice(0, limit);
}

/** 入口路径（过长时折叠中间透传层） */
function renderCompactEntryPath(main: CallTreeDiff, targetPath: string): string[] {
  const chain = collectNodesOnPath(main, targetPath);
  if (!chain.length) return ['_路径未找到_'];
  if (chain.length <= 6) {
    return chain.map((node, depth) =>
      `${'  '.repeat(depth)}└─ ${formatCallTreeNodeLine(node, depth === chain.length - 1 ? 'hot' : 'warm')}`,
    );
  }
  const out: string[] = [];
  out.push(`└─ ${formatCallTreeNodeLine(chain[0], 'warm')}`);
  const phase = chain.find((n, i) => i > 0 && (isStageName(n.name) || /GameLauncher/.test(n.name))) ?? chain[1];
  out.push(`  └─ ${formatCallTreeNodeLine(phase, 'warm')}`);
  out.push('    └─ …');
  const parent = chain[chain.length - 2];
  const target = chain[chain.length - 1];
  if (parent.path !== phase.path) {
    out.push(`      └─ ${formatCallTreeNodeLine(parent, 'warm')}`);
    out.push(`        └─ ${formatCallTreeNodeLine(target, 'hot')}`);
  } else {
    out.push(`      └─ ${formatCallTreeNodeLine(target, 'hot')}`);
  }
  return out;
}

/** §3 Top-N 驱动调用树（同 simpleperf §5.2：按 Top-N 排列，每项下挂子 marker） */
function renderTopNDrivenCallTree(main: CallTreeDiff, topN: HotspotRow[], analysisDepth = 5): string[] {
  const lines: string[] = [];
  const analyzed = Math.min(analysisDepth, topN.length);
  lines.push('### Top-N 驱动调用树', '');
  lines.push(
    '> 与上表 **# 列一一对应**。每项 = **入口** + **子 marker 拆分**（ms/帧）；' +
    (analyzed > 0
      ? `业务叙事见 §3.3 ~ §3.${2 + analyzed}。`
      : '业务叙事见 §3.x。'),
    '',
  );
  for (const h of topN) {
    const node = findNodeByPath(main, h.path);
    const sd = h.msPerFrameSelf.delta ?? 0;
    const td = h.msPerFrameTotal.delta ?? 0;
    const emoji = hotspotEmoji(h.status);
    const ref = h.rank <= analysisDepth ? `→ §3.${h.rank + 2}` : '';
    lines.push(
      `#### #${h.rank} ${h.name}  ·  self ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms/帧  ·  total ${td >= 0 ? '+' : ''}${td.toFixed(2)}ms/帧  ${emoji}${ref ? `  ${ref}` : ''}`,
      '',
    );
    lines.push('**入口**：', '', '```');
    lines.push(...renderCompactEntryPath(main, h.path));
    lines.push('```', '');
    lines.push('**子 marker 拆分**（|self Δ| 降序）：', '');
    if (h.isGroup && h.groupKey === 'urp.render' && h.members?.length) {
      lines.push('| pass | self Δ ms/帧 | total Δ ms/帧 | GC Δ |');
      lines.push('|---|---:|---:|---:|');
      for (const m of h.members) {
        const cs = m.msPerFrameSelf.delta ?? 0;
        const ct = m.msPerFrameTotal.delta ?? 0;
        const cg = m.gcAllocCount.delta ?? 0;
        lines.push(
          `| ${m.name} | ${cs >= 0 ? '+' : ''}${cs.toFixed(2)}ms | ${ct >= 0 ? '+' : ''}${ct.toFixed(2)}ms | ${cg >= 0 ? '+' : ''}${cg.toFixed(0)} |`,
        );
      }
      lines.push('');
      continue;
    }
    const children = collectHotspotChildBreakdown(node);
    if (children.length) {
      lines.push('```');
      for (const c of children) {
        const cs = c.msPerFrameSelf.delta ?? 0;
        lines.push(
          `└─ ${formatCallTreeNodeLine(c, 'warm')}  (selfΔ ${cs >= 0 ? '+' : ''}${cs.toFixed(2)}ms/帧)`,
        );
      }
      lines.push('```');
    } else {
      lines.push('_叶子 / 引擎管线节点，无显著子 marker_', '');
    }
    lines.push('');
  }
  return lines;
}

interface TreeRenderCtx {
  budgetPaths: string[];
  presentPaths: string[];
  /** 仅 ScriptRunBehaviour Update/LateUpdate 业务链内展开模块 */
  inBusinessSpine: boolean;
}

/** 含 GameLauncher→Core→Lua/Map 的业务 phase（非 URP/Canvas/Profiler 等） */
const BUSINESS_PHASE_RE = /^Update\.ScriptRunBehaviourUpdate$|^PreLateUpdate\.ScriptRunBehaviourLateUpdate$/;

function withBusinessSpine(ctx: TreeRenderCtx, node: CallTreeNodeDiff): TreeRenderCtx {
  if (ctx.inBusinessSpine || BUSINESS_PHASE_RE.test(node.name)) {
    return { ...ctx, inBusinessSpine: true };
  }
  return ctx;
}

function nodeSelfTier(node: CallTreeNodeDiff, ctx: TreeRenderCtx): 'hot' | 'warm' | 'hide' {
  const totalD = Math.abs(node.msPerFrameTotal.delta ?? 0);
  const selfD = Math.abs(node.msPerFrameSelf.delta ?? 0);
  const curTotal = node.msPerFrameTotal.cur ?? 0;
  if (ctx.budgetPaths.includes(node.path)) return 'hot';
  if (ctx.presentPaths.includes(node.path)) return 'warm';
  if (node.status === 'degraded' && (totalD >= 0.35 || selfD >= 0.25)) return 'hot';
  if (node.status === 'degraded' && totalD >= 0.12) return 'warm';
  if (node.status === 'newly_added' && curTotal >= 0.15) return 'warm';
  if (node.status === 'improved' && totalD >= TREE_MIN_IMPROVED_DELTA_MS) return 'warm';
  return 'hide';
}

function effectiveTreeTier(node: CallTreeNodeDiff, ctx: TreeRenderCtx): 'hot' | 'warm' | 'hide' {
  let childTier: 'hot' | 'warm' | 'hide' = 'hide';
  for (const c of node.children) {
    const ct = effectiveTreeTier(c, ctx);
    if (ct === 'hot') { childTier = 'hot'; break; }
    if (ct === 'warm') childTier = 'warm';
  }
  const onBudgetAnc = ctx.budgetPaths.some(p => p.startsWith(node.path + '▸') || p === node.path);
  const onPresentAnc = ctx.presentPaths.some(p => p.startsWith(node.path + '▸') || p === node.path);
  const self = nodeSelfTier(node, ctx);
  if (self === 'hot') return 'hot';
  if (childTier === 'hot') return (onBudgetAnc || onPresentAnc || self === 'warm') ? 'hot' : 'warm';
  if (self === 'warm' || childTier === 'warm') return 'warm';
  if ((onBudgetAnc || onPresentAnc) && childTier !== 'hide') return 'warm';
  return 'hide';
}

function renderPresentHotspotSection(
  presentN: HotspotPresentRow[],
  meta: UnityDiffSummary['meta'],
): string[] {
  const lines: string[] = [];
  const totalFrames = { base: meta.base.frameCount, cur: meta.cur.frameCount };
  const display = buildPresentHotspotDisplayRows(presentN, 8);
  if (!display.length) return lines;

  lines.push('### Top-N 主线程热点（出现帧 self 均值，÷出现帧数）', '');
  lines.push(
    '> **出现帧/总帧** = 该 marker 在多少帧里出现过 / 采集总帧数。**self ms（出现帧）** = 累计 self ms ÷ 出现帧数。' +
    '与帧预算 Top-N 互补；已在帧预算表出现的项见 **Top-N 驱动调用树** 对应 #。',
    '',
  );
  lines.push('| # | 模块 | self ms（出现帧）base→cur | Δ | 出现帧/总帧 base→cur | self ms/帧 Δ | 状态 |');
  lines.push('|---:|---|---:|---:|---|---:|---|');
  for (const item of display) {
    const row = item.row;
    const b = row.msSelfWhenPresent.base?.toFixed(2) ?? '—';
    const c = row.msSelfWhenPresent.cur?.toFixed(2) ?? '—';
    const d = row.msSelfWhenPresent.delta;
    const dStr = d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}ms`;
    const pf = fmtPresentFramesCell(row.presentOnFrameCount, totalFrames);
    const sd = row.msPerFrameSelf.delta ?? 0;
    const emoji = row.status === 'degraded' ? '🔴' : row.status === 'newly_added' ? '🆕' : row.status === 'improved' ? '🟢' : '⚪';
    lines.push(`| ${item.rank} | ${item.label} | ${b}→${c} | ${dStr} | ${pf} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms | ${emoji} |`);
  }
  lines.push('');

  const decodeGroup = display.find(d => d.row.groupKey === 'pb.decode');
  if (decodeGroup && decodeGroup.members.length > 1) {
    lines.push('**pb.decode 明细**（合并项展开，按出现帧 self 降序）：', '');
    lines.push('| marker | self ms（出现帧）cur | 出现帧/总帧 cur | self ms/帧 Δ |');
    lines.push('|---|---:|---|---:|');
    for (const m of [...decodeGroup.members].sort((a, b) => (b.msSelfWhenPresent.cur ?? 0) - (a.msSelfWhenPresent.cur ?? 0))) {
      const wp = m.msSelfWhenPresent.cur?.toFixed(2) ?? '—';
      const pf = `${m.presentOnFrameCount.cur ?? '—'} / ${totalFrames.cur}`;
      const sd = m.msPerFrameSelf.delta ?? 0;
      lines.push(`| ${m.name} | ${wp} | ${pf} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms |`);
    }
    lines.push('');
  }

  const resGroup = display.find(d => d.row.groupKey === 'res');
  if (resGroup && resGroup.members.length > 1) {
    lines.push('**[res] 资源 明细**（合并项展开）：', '');
    lines.push('| marker | self ms（出现帧）cur | 出现帧/总帧 cur | self ms/帧 Δ |');
    lines.push('|---|---:|---|---:|');
    for (const m of [...resGroup.members].sort((a, b) => (b.msSelfWhenPresent.cur ?? 0) - (a.msSelfWhenPresent.cur ?? 0)).slice(0, 12)) {
      const shortName = m.name.length > 72 ? m.name.slice(0, 69) + '…' : m.name;
      const wp = m.msSelfWhenPresent.cur?.toFixed(2) ?? '—';
      const pf = `${m.presentOnFrameCount.cur ?? '—'} / ${totalFrames.cur}`;
      const sd = m.msPerFrameSelf.delta ?? 0;
      lines.push(`| ${shortName} | ${wp} | ${pf} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms |`);
    }
    lines.push('');
  }

  const urpGroup = display.find(d => d.row.groupKey === 'urp.render');
  if (urpGroup && urpGroup.members.length > 1) {
    lines.push('**URP 渲染 pass 明细**（合并项展开）：', '');
    lines.push('| pass | self ms（出现帧）cur | self ms/帧 Δ |');
    lines.push('|---|---:|---:|');
    for (const m of [...urpGroup.members].sort((a, b) => (b.msPerFrameSelf.delta ?? 0) - (a.msPerFrameSelf.delta ?? 0))) {
      const wp = m.msSelfWhenPresent.cur?.toFixed(2) ?? '—';
      const sd = m.msPerFrameSelf.delta ?? 0;
      lines.push(`| ${m.name} | ${wp} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms |`);
    }
    lines.push('');
  }
  return lines;
}

/** §3.3+ per-hotspot 子节（展示层骨架 + LLM_FILL 分析槽） */
function renderHotspotSubsections(summary: UnityDiffSummary, main: CallTreeDiff | undefined): string[] {
  const lines: string[] = [];
  const hotspots = (summary.topHotspots ?? []).slice(0, 5);
  if (!hotspots.length) {
    lines.push('_无 Top-N 热点（self Δ < 0.3ms/帧 或无 degraded 叶子）_', '');
    return lines;
  }

  lines.push('### 3.2 Top 热点细化分析', '');
  lines.push(
    `> §3.3 ~ §3.${2 + hotspots.length} 与 **Top-N 驱动调用树 #1~#${hotspots.length}** 一一对应：` +
    '展示层（身份 + 子函数表 + 关联事实）由 Provider 渲染；**分析层**由 LLM 填写 `LLM_FILL` 槽。',
    '',
  );

  for (const [i, h] of hotspots.entries()) {
    const secNum = i + 3;
    const tag = `§3.${secNum}`;
    const node = main && !h.isGroup ? findNodeByPath(main, h.path) : null;
    const emoji = hotspotEmoji(h.status);

    lines.push(`### 3.${secNum} ${h.name}（Top-N #${h.rank}，${emoji}）`, '');

    lines.push('**身份**：', '');
    const sd = h.msPerFrameSelf.delta ?? 0;
    const td = h.msPerFrameTotal.delta ?? 0;
    lines.push(`- self ms/帧 Δ ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms；total ms/帧 Δ ${td >= 0 ? '+' : ''}${td.toFixed(2)}ms`);
    if (node && node.msPerFrameSelf.cur != null && node.msPerFrameTotal.cur != null && node.msPerFrameTotal.cur > 0) {
      const selfRatio = ((node.msPerFrameSelf.cur / node.msPerFrameTotal.cur) * 100).toFixed(0);
      lines.push(`- self/total = ${selfRatio}%`);
    }
    const gcD = h.gcAllocCount.delta ?? 0;
    if (Math.abs(gcD) >= 1) {
      lines.push(`- GC.Alloc Δ ${gcD >= 0 ? '+' : ''}${gcD.toFixed(0)} 次（全 trace）`);
    }
    if (h.status === 'newly_added') lines.push('- 🆕 base 完全没有此模块，cur 新引入');
    lines.push('');
    lines.push(`> 调用树见上文 **Top-N 驱动调用树 #${h.rank}**（入口 + 子 marker 拆分）`, '');

    lines.push('**模块内部细分**（Provider，按 |self Δ| 降序；与驱动树子 marker 同源）：', '');
    if (h.isGroup && h.members?.length) {
      lines.push('| 子 marker | self Δ ms/帧 | total Δ ms/帧 | GC Δ | 状态 |');
      lines.push('|---|---:|---:|---:|---|');
      for (const m of h.members) {
        const cs = m.msPerFrameSelf.delta ?? 0;
        const ct = m.msPerFrameTotal.delta ?? 0;
        const cg = m.gcAllocCount.delta ?? 0;
        lines.push(
          `| ${m.name} | ${cs >= 0 ? '+' : ''}${cs.toFixed(2)}ms | ${ct >= 0 ? '+' : ''}${ct.toFixed(2)}ms | ${cg >= 0 ? '+' : ''}${cg.toFixed(0)} | ${hotspotEmoji(m.status)} |`,
        );
      }
      lines.push('');
    } else {
      const children = collectHotspotChildBreakdown(node, 10);
      if (children.length) {
        lines.push('| 子 marker | self Δ ms/帧 | total Δ ms/帧 | GC Δ | 状态 |');
        lines.push('|---|---:|---:|---:|---|');
        for (const c of children) {
          const cs = c.msPerFrameSelf.delta ?? 0;
          const ct = c.msPerFrameTotal.delta ?? 0;
          const cg = c.gcAllocCount.delta ?? 0;
          lines.push(
            `| ${c.name} | ${cs >= 0 ? '+' : ''}${cs.toFixed(2)}ms | ${ct >= 0 ? '+' : ''}${ct.toFixed(2)}ms | ${cg >= 0 ? '+' : ''}${cg.toFixed(0)} | ${hotspotEmoji(c.status)} |`,
          );
        }
        lines.push('');
      } else {
        lines.push('_无显著子节点 Δ（叶子热点或子树未展开）_', '');
      }
    }

    lines.push('**关联事实**（展示层，可校验）：', '');
    const gcRelated = summary.gcAttribution.topSubtrees
      .filter(s => h.path.includes(s.name) || s.path.includes(h.name) || h.path.endsWith(s.name))
      .slice(0, 2);
    if (gcRelated.length) {
      for (const g of gcRelated) {
        const gd = g.gcAlloc.delta ?? 0;
        lines.push(`- §5 GC 子树 \`${g.name}\`：Δ ${gd >= 0 ? '+' : ''}${gd.toFixed(0)} 次`);
      }
    } else {
      lines.push('- _本节无直接 GC 叶子归因；见 §5 总表_');
    }
    lines.push('');

    lines.push(`**业务含义**：<!-- LLM_FILL:${tag}:业务含义: 60-120字，解读上表数字与场景；禁止编造子函数名 -->`, '');
    lines.push(`**调用入口**：<!-- LLM_FILL:${tag}:调用入口: 1句，节点须出现在 §3 callTree 或上表 -->`, '');
    lines.push(`**优化方向**：<!-- LLM_FILL:${tag}:优化方向: 3-5条bullet，每条引用上表子 marker -->`, '');
    lines.push(`**探索（待验证）**：<!-- LLM_FILL:${tag}:探索: 1-2条跨§假设，须标注依据，允许「可能」 -->`, '');
    lines.push('', '---', '');
  }
  return lines;
}

function renderSection8RoiIndex(summary: UnityDiffSummary, main: CallTreeDiff | undefined): string[] {
  const lines: string[] = [];
  const hotspots = (summary.topHotspots ?? collectUniqueDegradedLeaves(main, 5).map((n, i) => ({
    rank: i + 1, name: n.name, path: n.path,
    msPerFrameSelf: n.msPerFrameSelf, msPerFrameTotal: n.msPerFrameTotal,
    gcAllocCount: n.gcAllocCount, status: n.status,
  }))).slice(0, 5);

  lines.push('> 详细分析见 §3.3 ~ §3.' + (hotspots.length ? 2 + hotspots.length : 'N') + '；本节为 ROI 优先级索引。', '');
  if (hotspots.length) {
    lines.push('| 优先级 | 模块 | self Δ ms/帧 | 详见 |');
    lines.push('|---:|---|---:|---|');
    for (const [i, h] of hotspots.entries()) {
      const sd = h.msPerFrameSelf.delta ?? 0;
      lines.push(`| P${i + 1} | ${h.name} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms | §3.${i + 3} |`);
    }
  } else {
    lines.push('- 无显著回归热点，本版本稳定或改善');
  }
  lines.push('');
  lines.push('_§8 为索引；业务叙事与优化方向在 §3.x 的 LLM_FILL 槽填写。_', '');
  return lines;
}

/** 资源加载 / Cleanup Job 等高频低耗时噪声名 */
function isNoiseCallTreeName(name: string): boolean {
  if (isPbDecodeName(name)) return true;
  if (isResMarkerName(name)) return true;
  if (/^\[res\](goLoader|assetLoader|abLoader)_async:/.test(name)) return true;
  if (/^\[res\]go: assets\//.test(name)) return true;
  if (/\(Cleanup\):/.test(name)) return true;
  if (/^ParticleSystem\.(GeometryJob|ColorOverLifetime|Sort|TextureSheet)/.test(name)) return true;
  if (/^(GatherChunksAndOffsetsJob|UnsafeHashMapDataDisposeJob|Instantiate\.Copy)$/.test(name)) return true;
  if (/^mscorlib\.dll!System::Func/.test(name)) return true;
  if (/^VisualWrapper\.BindShadow$/.test(name)) return true;
  if (/^AssetRefCnt\./.test(name)) return true;
  if (/^Instantiate(\.|$)/.test(name)) return true;
  return false;
}

function isInterestingCallTreeNode(node: CallTreeNodeDiff): boolean {
  if (isNoiseCallTreeName(node.name)) return false;

  const curTotal = node.msPerFrameTotal.cur ?? 0;
  const baseTotal = node.msPerFrameTotal.base ?? 0;
  const totalDelta = Math.abs(node.msPerFrameTotal.delta ?? 0);
  const selfDelta = Math.abs(node.msPerFrameSelf.delta ?? 0);
  const gcDelta = Math.abs(node.gcAllocCount.delta ?? 0);

  if (node.status === 'improved') {
    return totalDelta >= TREE_MIN_IMPROVED_DELTA_MS;
  }
  if (node.status === 'degraded') {
    return totalDelta >= TREE_MIN_TOTAL_DELTA_MS || selfDelta >= TREE_MIN_SELF_DELTA_MS || gcDelta >= TREE_MIN_GC_DELTA;
  }
  if (node.status === 'newly_added') {
    return curTotal >= TREE_MIN_CUR_MS || gcDelta >= 500;
  }
  if (node.status === 'removed') {
    return baseTotal >= TREE_MIN_CUR_MS || gcDelta >= 500;
  }
  // stable：仅高耗时或有明显 Δ（纯 gc 小抖动不展示）
  return curTotal >= 1.0 || totalDelta >= TREE_MIN_TOTAL_DELTA_MS;
}

function isOnHotspotAncestorPath(nodePath: string, hotspotPaths: string[]): boolean {
  return hotspotPaths.some(hp => hp === nodePath || hp.startsWith(nodePath + '▸'));
}

function shouldShowCallTreeNode(node: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  if (isNoiseCallTreeName(node.name)) {
    return node.children.some(c => shouldShowCallTreeNode(c, ctx));
  }
  return effectiveTreeTier(node, ctx) !== 'hide';
}

/** 调度/容器透传节点（self≈0，子树承载真实工作） */
const PLUMBING_NAME_RE = /(\.|^)sampler_/i;

function isManagerLikeName(name: string): boolean {
  if (/\.(sampler_|ProcessTasks|EntityTask|TimeoutTask)/i.test(name)) return false;
  if (name === 'MapSignificanceMgr' || name === 'BattleHeadMgr') return true;
  if (/^CS:AOE\./.test(name) && /(Mgr|Manager|UIManager)$/.test(name)) return true;
  return false;
}

function isBudgetModule(node: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  return ctx.budgetPaths.includes(node.path);
}

function isModuleTaskLeaf(node: CallTreeNodeDiff): boolean {
  return /ProcessTask_/i.test(node.name);
}

function isPlumbingNode(node: CallTreeNodeDiff): boolean {
  if (isManagerLikeName(node.name)) return false;
  if (PLUMBING_NAME_RE.test(node.name)) return true;
  if (/\.(ProcessTasks|EntityTask|TimeoutTask)$/i.test(node.name)) return true;
  if (/\.On\w+Schedule$/.test(node.name) && (node.msPerFrameSelf.cur ?? 0) < 0.08) return true;
  if (/\.OnUpdate$/.test(node.name)) return false;
  const self = node.msPerFrameSelf.cur ?? 0;
  const total = node.msPerFrameTotal.cur ?? 0;
  if (node.children.length > 0 && total > 0.05 && self / total < 0.03 && Math.abs(node.msPerFrameSelf.delta ?? 0) < 0.05) {
    return true;
  }
  return false;
}

/** 帧预算 Top-N 下的子系统入口（MapManager → LineMgr / BattleUIManager） */
function isSubsystemEntry(child: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  if (isBudgetModule(child, ctx)) return true;
  if (ctx.budgetPaths.some(p => p.startsWith(child.path + '▸') || p === child.path)) return true;
  const selfD = Math.abs(child.msPerFrameSelf.delta ?? 0);
  const totalD = Math.abs(child.msPerFrameTotal.delta ?? 0);
  return selfD >= 0.3 || totalD >= 0.5;
}

/** 提权到模块树的任务级节点（ProcessTask_* / 出现帧热点） */
function isPromotedTaskNode(node: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  if (/ProcessTask_/i.test(node.name)) {
    const td = Math.abs(node.msPerFrameTotal.delta ?? 0);
    const cur = node.msPerFrameTotal.cur ?? 0;
    return td >= 0.12 || cur >= 0.15 || (node.status === 'newly_added' && cur >= 0.08);
  }
  if (ctx.presentPaths.includes(node.path)) {
    const cur = node.msPerFrameTotal.cur ?? 0;
    return cur >= 0.08 || node.status === 'newly_added';
  }
  return false;
}

function dedupeNodesByPath(nodes: CallTreeNodeDiff[]): CallTreeNodeDiff[] {
  const seen = new Set<string>();
  const out: CallTreeNodeDiff[] = [];
  for (const n of nodes) {
    if (seen.has(n.path)) continue;
    seen.add(n.path);
    out.push(n);
  }
  return out;
}

function flattenModuleDescendants(node: CallTreeNodeDiff, ctx: TreeRenderCtx, depth = 0): CallTreeNodeDiff[] {
  if (depth > 14) return [];
  const out: CallTreeNodeDiff[] = [];
  for (const c of node.children) {
    if (isNoiseCallTreeName(c.name)) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
      continue;
    }
    if (isBudgetModule(c, ctx)) {
      out.push(c);
      continue;
    }
    if (isPlumbingNode(c)) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
      continue;
    }
    if (isModuleTaskLeaf(c) && isPromotedTaskNode(c, ctx)) {
      out.push(c);
      continue;
    }
    if (isSubsystemEntry(c, ctx) && isManagerLikeName(c.name)) {
      out.push(c);
      continue;
    }
    if (c.children.some(ch => isModuleTaskLeaf(ch) || isPlumbingNode(ch) || isBudgetModule(ch, ctx))) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
    }
  }
  return dedupeNodesByPath(out);
}

/** 聚合模块：MapSignificanceMgr 类（含 sampler 节点名） */
function isModuleAggregator(node: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  if (isStageName(node.name) || isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return false;
  if (node.name === 'MapSignificanceMgr' || /^MapSignificanceMgr\.sampler_/i.test(node.name)) return true;
  const totalD = node.msPerFrameTotal.delta ?? 0;
  if (totalD < 0.25) return false;
  const tasks = flattenModuleDescendants(node, ctx).filter(n => isModuleTaskLeaf(n));
  return tasks.length >= 2;
}

function isModuleContainer(node: CallTreeNodeDiff): boolean {
  return /OnTick&UpdateSchedule$/.test(node.name)
    || /OnLateUpdateSchedule$/.test(node.name);
}

function isModuleBoundary(node: CallTreeNodeDiff, ctx: TreeRenderCtx): boolean {
  if (isModuleAggregator(node, ctx) || isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return true;
  if (isModuleContainer(node)) return true;
  return isManagerLikeName(node.name);
}

function getModuleTreeChildren(node: CallTreeNodeDiff, ctx: TreeRenderCtx): CallTreeNodeDiff[] {
  if (node.name === 'PlayerLoop') {
    return node.children.filter(c => !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx));
  }
  if (!ctx.inBusinessSpine) return [];

  if (isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return [];

  if (isModuleAggregator(node, ctx)) {
    return flattenModuleDescendants(node, ctx)
      .filter(n => isModuleTaskLeaf(n) && isPromotedTaskNode(n, ctx))
      .sort((a, b) => Math.abs(b.msPerFrameTotal.delta ?? 0) - Math.abs(a.msPerFrameTotal.delta ?? 0))
      .slice(0, 8);
  }

  // 叶子 Mgr（无子 Mgr）：不展开业务子树；BattleHeadMgr 保留 .OnUpdate
  if (isManagerLikeName(node.name)) {
    const scheduleKids = node.children.filter(c => isModuleContainer(c) && shouldShowCallTreeNode(c, ctx));
    if (scheduleKids.length) return scheduleKids;

    const hasSubManager = node.children.some(c =>
      !isNoiseCallTreeName(c.name) && (isManagerLikeName(c.name) || isModuleAggregator(c, ctx)),
    );
    if (!hasSubManager) {
      return node.children.filter(c =>
        /\.OnUpdate$/.test(c.name) && !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx),
      );
    }
  }

  // 阶段 / 调度链：正常向下导航，直到模块边界
  if (!isModuleBoundary(node, ctx)) {
    return node.children.filter(c => !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx));
  }

  // 模块容器（MapManager / Lua Schedule）：只展示子系统入口
  const direct: CallTreeNodeDiff[] = [];
  for (const c of node.children) {
    if (isNoiseCallTreeName(c.name)) continue;
    if (!shouldShowCallTreeNode(c, ctx)) continue;
    if (isPlumbingNode(c)) {
      const inner = flattenModuleDescendants(c, ctx).filter(n =>
        isModuleAggregator(n, ctx) || (isSubsystemEntry(n, ctx) && isManagerLikeName(n.name)),
      );
      direct.push(...inner);
      continue;
    }
    if (isModuleAggregator(c, ctx)) {
      direct.push(c);
    } else if (isSubsystemEntry(c, ctx) && isManagerLikeName(c.name)) {
      direct.push(c);
    } else if (isSubsystemEntry(c, ctx) && /\.OnUpdate$/.test(c.name)) {
      direct.push(c);
    }
  }
  return dedupeNodesByPath(direct).sort(
    (a, b) => Math.abs(b.msPerFrameTotal.delta ?? 0) - Math.abs(a.msPerFrameTotal.delta ?? 0),
  );
}

function renderModuleCallTreeNode(node: CallTreeNodeDiff, depth: number, lines: string[], ctx: TreeRenderCtx) {
  const nodeCtx = withBusinessSpine(ctx, node);
  if (isNoiseCallTreeName(node.name)) {
    for (const c of getModuleTreeChildren(node, nodeCtx)) {
      renderModuleCallTreeNode(c, depth, lines, withBusinessSpine(nodeCtx, c));
    }
    return;
  }
  const tier = effectiveTreeTier(node, ctx);
  if (tier === 'hide') return;
  lines.push(`${'  '.repeat(depth)}└─ ${formatCallTreeNodeLine(node, tier)}`);
  for (const c of getModuleTreeChildren(node, nodeCtx)) {
    renderModuleCallTreeNode(c, depth + 1, lines, withBusinessSpine(nodeCtx, c));
  }
}

/** PlayerLoop phase 总览（折叠完整树），与 Top-N 驱动树互补 */
function renderPhaseOverviewTree(main: CallTreeDiff, summary: UnityDiffSummary): string[] {
  const lines: string[] = [];
  const budgetPaths = (summary.topHotspots ?? []).flatMap(h =>
    h.isGroup && h.members ? h.members.map(m => m.path) : [h.path],
  );
  lines.push('### 主线程 phase 总览（折叠完整树）', '');
  lines.push(
    '> **全局结构**：PlayerLoop 各 phase 一行；Update/LateUpdate **业务链**展开到模块边界。' +
    '下方 Top-N 表/驱动树按 **# 优先级** 展开；节点级全量见 `unity-diff-summary.json`。',
    '',
  );
  const treeCtx: TreeRenderCtx = {
    budgetPaths,
    presentPaths: (summary.topHotspotsPresent ?? []).map(h => h.path),
    inBusinessSpine: false,
  };
  lines.push('```');
  for (const r of main.roots) renderModuleCallTreeNode(r, 0, lines, treeCtx);
  lines.push('```', '');
  return lines;
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

  // §3 主线程热点与调用树
  lines.push('## §3 主线程热点与调用树 (aggregatedCallTrees)', '');
  if (main) {
    lines.push(`Main Thread ms/帧: ${fmtPair(main.msPerFrameTotal, 'ms')}`, '');
    const topN = summary.topHotspots?.length
      ? summary.topHotspots
      : buildBudgetHotspotDisplayRows(
          collectUniqueDegradedLeaves(main, 16).map((n, i) => toHotspotRow(n, i + 1)),
          8,
        );
    if (topN.length) {
      lines.push(...renderPhaseOverviewTree(main, summary));
      lines.push('### Top-N 主线程热点（帧预算，self ms/帧 ÷总帧数）', '');
      lines.push('| # | 模块 | self ms/帧 Δ | total ms/帧 Δ | GC.Alloc Δ (全trace 次数) | 状态 |');
      lines.push('|---:|---|---:|---:|---:|---|');
      for (const row of topN) {
        const sd = row.msPerFrameSelf.delta ?? 0;
        const td = row.msPerFrameTotal.delta ?? 0;
        const gc = row.gcAllocCount.delta ?? 0;
        const emoji = row.status === 'degraded' ? '🔴' : row.status === 'newly_added' ? '🆕' : row.status === 'improved' ? '🟢' : '⚪';
        lines.push(`| ${row.rank} | ${row.name} | ${sd >= 0 ? '+' : ''}${sd.toFixed(2)}ms | ${td >= 0 ? '+' : ''}${td.toFixed(2)}ms | ${gc >= 0 ? '+' : ''}${gc.toFixed(0)} | ${emoji} |`);
      }
      lines.push('');
      lines.push(...renderTopNDrivenCallTree(main, topN, 5));
      const presentN = summary.topHotspotsPresent ?? [];
      if (presentN.length) {
        lines.push(...renderPresentHotspotSection(presentN, meta));
      }
      lines.push(...renderHotspotSubsections(summary, main));
    } else {
      lines.push('_无 Top-N 热点（self Δ < 0.3ms/帧 或无 degraded 叶子）_');
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

  // §8 可执行建议 — ROI 索引（详细分析在 §3.x）
  lines.push('## §8 可执行建议（按 ROI）', '');
  lines.push(...renderSection8RoiIndex(summary, main));
  lines.push('', '---', '', '_本骨架由 unity-diff-builder 自动产出。展示层表格/树由 Provider 锁定；§3.x 的 `LLM_FILL` 槽由 AI 填写分析叙事。_');

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
