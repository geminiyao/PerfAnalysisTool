/**
 * unity-single-builder.ts — Unity Profiler 单次 Provider（确定性骨架报告）。
 *
 * 输入：preprocess-result.json
 * 输出：
 *   - unity-single-summary.json
 *   - performance-report_unity_single_skeleton.md
 *
 * 用法：
 *   npx tsx unity-single-builder.ts --input <preprocess.json> --out <out_dir> --label <label>
 */
import * as fs from 'fs';
import * as path from 'path';

// ============ 输入类型 ============

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
  mustReport?: boolean;
  mustReportReason?: string;
}

interface PreprocessResult {
  config: { targetFps: number; frameBudgetMs: number };
  frameSummary: {
    count: number;
    actualFps: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    p90?: number;
    p95?: number;
    p99?: number;
    p999?: number;
    worstFrameIndex?: number;
    medianFrameIndex?: number;
    jankCount: number;
    bigJankCount: number;
  };
  markers: MarkerOutput[];
  markersByThread?: Record<string, MarkerOutput[]>;
  aggregatedCallTrees?: AggregatedCallTree[];
  markerSpikes?: {
    name: string;
    msSelfMean: number;
    spikeRatio: number;
    msSelfP95?: number;
  }[];
  threads: { name: string; msMedian: number; msMax: number; msPerFrameTotal?: number; topMarkers?: { name: string; msSelfMean: number; percentOfFrame: number }[] }[];
  memory?: {
    gcAllocatedInFrame?: { mean?: number; median?: number; p95?: number; max?: number };
  };
}

// ============ 输出类型 ============

export interface HotspotRow {
  rank: number;
  name: string;
  path: string;
  /** msSelfMean × presentOnFrameCount ÷ frameCount */
  perTraceMs: number;
  msPerFrameSelf: number;
  msPerFrameTotal: number;
  msSelfWhenPresent: number;
  percentOfFrame: number;
  presentOnFrameCount: number;
  callsPerFrame: number;
  gcAllocCount: number;
  mustReport?: boolean;
  isGroup?: boolean;
  groupKey?: string;
  memberCount?: number;
  members?: HotspotRow[];
}

export interface HotspotPresentRow {
  rank: number;
  name: string;
  path: string;
  msSelfWhenPresent: number;
  perTraceMs: number;
  presentOnFrameCount: number;
  presentRate: number;
  isGroup?: boolean;
  groupKey?: string;
  memberCount?: number;
}

export interface UnitySingleSummary {
  generatedAt: string;
  meta: { label: string; targetFps: number; frameCount: number; frameBudgetMs: number };
  frameSummary: PreprocessResult['frameSummary'];
  mainThread?: AggregatedCallTree;
  topHotspots: HotspotRow[];
  topHotspotsPresent: HotspotPresentRow[];
  mustReportMarkers: { name: string; perTraceMs: number; percentOfFrame: number; reason: string }[];
  markersByThread: Record<string, MarkerOutput[]>;
  gcAttribution: {
    totalAllocPerFrame: number | null;
    gcBytesPerFrameKb: number | null;
    topSubtrees: { path: string; name: string; gcAllocCount: number; msPerFrameTotal: number }[];
  };
  spikes: { name: string; spikeRatio: number; msSelfMean: number }[];
  specialMarkers: { name: string; perTraceMs: number | null; percentOfFrame: number | null; thread: string }[];
  threads: PreprocessResult['threads'];
}

// ============ 常量 ============

const HOT_SELF_MS = 0.25;
const WARM_SELF_MS = 0.12;
const TREE_MIN_SELF_MS = 0.1;
const TREE_MIN_TOTAL_MS = 0.1;
const PRESENT_HOTSPOT_MIN_MS = 0.2;
const SPARSE_MAX_PRESENT_RATE = 0.5;

export const STAGE_NAME_RE = /^(PlayerLoop|Update\.|LateUpdate\.|PreLateUpdate\.|FixedUpdate\.|Initialization\.|EarlyUpdate\.|PostLateUpdate\.|TimeUpdate\.|BehaviourUpdate$|LateBehaviourUpdate$|InitializationSystemGroup|SimulationSystemGroup|PresentationSystemGroup|Core\.Update$|Core\.LateUpdate$|Core\.FixedUpdate$)/;

const GC_STAGE_NAME_RE = new RegExp(
  STAGE_NAME_RE.source
    + '|UnityEngine\\.CoreModule\\.dll!.*RenderPipelineManager.*|URP\\.Render$|URP\\.RenderCameraStack$|URP\\.RenderSingleCamera$|AOE\\.dll!AOE::GameLauncher\\.\\w+\\(\\)$',
);

/** 含 GameLauncher→Core→Lua/Map 的业务 phase */
export const BUSINESS_PHASE_RE = /^Update\.ScriptRunBehaviourUpdate$|^PreLateUpdate\.ScriptRunBehaviourLateUpdate$/;

// ============ 工具 ============

function safeRound(x: number, digits = 2): number {
  return parseFloat(x.toFixed(digits));
}

function calcPerTraceMs(m: Pick<MarkerOutput, 'msSelfMean' | 'presentOnFrameCount'>, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return safeRound((m.msSelfMean * m.presentOnFrameCount) / frameCount, 3);
}

function calcPerTraceTotalMs(m: Pick<MarkerOutput, 'msTotalMean' | 'presentOnFrameCount'>, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return safeRound((m.msTotalMean * m.presentOnFrameCount) / frameCount, 3);
}

function msSelfWhenPresent(msSelf: number, presentCount: number): number {
  if (presentCount <= 0) return 0;
  return safeRound(msSelf / presentCount, 3);
}

function isStageName(name: string): boolean {
  return STAGE_NAME_RE.test(name);
}

function isPbDecodeName(name: string): boolean {
  return /\*\*\* pb\.decode\*\*\*/i.test(name);
}

function isResMarkerName(name: string): boolean {
  return /^\[res\]/i.test(name);
}

function isUrpMarkerName(name: string): boolean {
  return /^URP\./.test(name);
}

function isUrpRenderPassHotspot(row: Pick<HotspotRow, 'name' | 'path'>): boolean {
  return /^URP\./.test(row.name)
    && /FinishFrameRendering|RenderPipelineManager|URP\.Render/.test(row.path);
}

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

// ============ 调用树路径 ============

type NodeWithPath = AggregatedCallTreeNode & { path: string };

function attachPaths(node: AggregatedCallTreeNode, parentPath: string): NodeWithPath {
  const p = parentPath ? `${parentPath}▸${node.name}` : node.name;
  return {
    ...node,
    path: p,
    children: node.children.map(c => attachPaths(c, p)),
  } as NodeWithPath;
}

function attachTreePaths(tree: AggregatedCallTree): AggregatedCallTree & { roots: NodeWithPath[] } {
  return {
    ...tree,
    roots: tree.roots.map(r => attachPaths(r, '')),
  };
}

function findNodeByPath(roots: NodeWithPath[], targetPath: string): NodeWithPath | null {
  let found: NodeWithPath | null = null;
  const walk = (n: NodeWithPath) => {
    if (n.path === targetPath) found = n;
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return found;
}

function findBestNodeByName(roots: NodeWithPath[], name: string): NodeWithPath | null {
  let best: NodeWithPath | null = null;
  const walk = (n: NodeWithPath) => {
    if (n.name === name) {
      if (!best || n.msPerFrameSelf > best.msPerFrameSelf) best = n;
    }
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return best;
}

function collectNodesOnPath(roots: NodeWithPath[], targetPath: string): NodeWithPath[] {
  const chain: NodeWithPath[] = [];
  const walk = (nodes: NodeWithPath[]): boolean => {
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
  walk(roots);
  return chain;
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

// ============ 热点收集 ============

function markerToHotspotRow(m: MarkerOutput, rank: number, frameCount: number, path: string, gcAlloc = 0): HotspotRow {
  const perTraceMs = calcPerTraceMs(m, frameCount);
  return {
    rank,
    name: m.name,
    path,
    perTraceMs,
    msPerFrameSelf: perTraceMs,
    msPerFrameTotal: calcPerTraceTotalMs(m, frameCount),
    msSelfWhenPresent: m.msSelfMean,
    percentOfFrame: m.percentOfFrame,
    presentOnFrameCount: m.presentOnFrameCount,
    callsPerFrame: m.callsPerFrame,
    gcAllocCount: gcAlloc,
    mustReport: m.mustReport,
  };
}

function aggregateBudgetGroup(members: HotspotRow[], label: string, groupKey: string): HotspotRow {
  const sorted = [...members].sort((a, b) => b.perTraceMs - a.perTraceMs);
  return {
    rank: 0,
    name: label,
    path: groupKey === 'urp.render' ? findUrpGroupAnchorPath(sorted) : (sorted[0]?.path ?? label),
    perTraceMs: safeRound(sorted.reduce((s, m) => s + m.perTraceMs, 0), 3),
    msPerFrameSelf: safeRound(sorted.reduce((s, m) => s + m.msPerFrameSelf, 0), 3),
    msPerFrameTotal: safeRound(sorted.reduce((s, m) => s + m.msPerFrameTotal, 0), 3),
    msSelfWhenPresent: Math.max(...sorted.map(m => m.msSelfWhenPresent)),
    percentOfFrame: safeRound(sorted.reduce((s, m) => s + m.percentOfFrame, 0), 1),
    presentOnFrameCount: Math.max(...sorted.map(m => m.presentOnFrameCount)),
    callsPerFrame: safeRound(sorted.reduce((s, m) => s + m.callsPerFrame, 0), 2),
    gcAllocCount: sorted.reduce((s, m) => s + m.gcAllocCount, 0),
    mustReport: sorted.some(m => m.mustReport),
    isGroup: true,
    groupKey,
    memberCount: sorted.length,
    members: sorted,
  };
}

export function buildBudgetHotspotDisplayRows(rows: HotspotRow[], limit = 8): HotspotRow[] {
  const urp = rows.filter(r => isUrpMarkerName(r.name) || isUrpRenderPassHotspot(r));
  const decode = rows.filter(r => isPbDecodeName(r.name));
  const res = rows.filter(r => isResMarkerName(r.name));
  const rest = rows.filter(r => !isPbDecodeName(r.name) && !isResMarkerName(r.name) && !isUrpMarkerName(r.name) && !isUrpRenderPassHotspot(r));

  const buckets: HotspotRow[] = [...rest];
  if (urp.length >= 2) {
    buckets.push(aggregateBudgetGroup(urp, `URP 渲染管线（${urp.length} 项合并）`, 'urp.render'));
  } else {
    buckets.push(...urp);
  }
  if (decode.length) {
    buckets.push(aggregateBudgetGroup(decode, `网络 pb.decode（${decode.length} 项合并）`, 'pb.decode'));
  }
  if (res.length) {
    buckets.push(aggregateBudgetGroup(res, `资源 [res] 加载/卸载（${res.length} 项合并）`, 'res'));
  }
  buckets.sort((a, b) => b.perTraceMs - a.perTraceMs);
  return buckets.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 }));
}

function collectMainThreadMarkers(data: PreprocessResult): MarkerOutput[] {
  const byThread = data.markersByThread ?? {};
  const mainKey = Object.keys(byThread).find(k => /Main Thread/i.test(k));
  if (mainKey && byThread[mainKey]?.length) return byThread[mainKey];
  return (data.markers ?? []).filter(m => /Main Thread/i.test(m.thread));
}

function buildTopHotspots(data: PreprocessResult, mainRoots: NodeWithPath[]): HotspotRow[] {
  const fc = data.frameSummary.count;
  const raw: HotspotRow[] = [];
  for (const m of collectMainThreadMarkers(data)) {
    if (isStageName(m.name) || /^GC(\.|$)/.test(m.name)) continue;
    const node = findBestNodeByName(mainRoots, m.name);
    const path = node?.path ?? m.name;
    const gc = node?.gcAllocCount ?? 0;
    raw.push(markerToHotspotRow(m, 0, fc, path, gc));
  }
  raw.sort((a, b) => b.perTraceMs - a.perTraceMs);
  return buildBudgetHotspotDisplayRows(raw, 8);
}

function aggregatePresentGroup(members: HotspotPresentRow[], label: string, groupKey: string): HotspotPresentRow {
  return {
    rank: 0,
    name: label,
    path: members[0]?.path ?? label,
    msSelfWhenPresent: Math.max(...members.map(m => m.msSelfWhenPresent)),
    perTraceMs: safeRound(members.reduce((s, m) => s + m.perTraceMs, 0), 3),
    presentOnFrameCount: members.reduce((s, m) => s + m.presentOnFrameCount, 0),
    presentRate: Math.max(...members.map(m => m.presentRate)),
    isGroup: true,
    groupKey,
    memberCount: members.length,
  };
}

function buildPresentHotspotDisplayRows(rows: HotspotPresentRow[], limit = 8): HotspotPresentRow[] {
  const urp = rows.filter(r => /^URP\./.test(r.name));
  const decode = rows.filter(r => isPbDecodeName(r.name));
  const res = rows.filter(r => isResMarkerName(r.name));
  const rest = rows.filter(r => !isPbDecodeName(r.name) && !isResMarkerName(r.name) && !/^URP\./.test(r.name));

  const buckets: HotspotPresentRow[] = [...rest];
  if (urp.length >= 2) {
    buckets.push(aggregatePresentGroup(urp, `URP 渲染管线（${urp.length} 项合并）`, 'urp.render'));
  } else {
    buckets.push(...urp);
  }
  if (decode.length) buckets.push(aggregatePresentGroup(decode, `网络 pb.decode（${decode.length} 项合并）`, 'pb.decode'));
  if (res.length) buckets.push(aggregatePresentGroup(res, `资源 [res] 加载/卸载（${res.length} 项合并）`, 'res'));
  buckets.sort((a, b) => b.msSelfWhenPresent - a.msSelfWhenPresent);
  return buckets.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 }));
}

function collectPresentFrameHotspots(data: PreprocessResult, mainRoots: NodeWithPath[], steadyPaths: Set<string>, limit = 16): HotspotPresentRow[] {
  const fc = data.frameSummary.count;
  const candidates: HotspotPresentRow[] = [];
  const walk = (n: NodeWithPath) => {
    if (!isStageName(n.name) && !/^GC(\.|$)/.test(n.name) && !isNoiseCallTreeName(n.name)) {
      const rate = fc > 0 ? n.presentOnFrameCount / fc : 0;
      const wp = n.presentOnFrameCount > 0 ? safeRound(n.msSelf / n.presentOnFrameCount, 3) : 0;
      const sparse = rate > 0 && rate < SPARSE_MAX_PRESENT_RATE;
      if (sparse && wp >= PRESENT_HOTSPOT_MIN_MS && !steadyPaths.has(n.path)) {
        candidates.push({
          rank: 0,
          name: n.name,
          path: n.path,
          msSelfWhenPresent: wp,
          perTraceMs: n.msPerFrameSelf,
          presentOnFrameCount: n.presentOnFrameCount,
          presentRate: safeRound(rate * 100, 1),
        });
      }
    }
    n.children.forEach(walk);
  };
  mainRoots.forEach(walk);
  return dedupeLeafFirstByPath(candidates, n => n.msSelfWhenPresent, limit);
}

function buildGcAttribution(mainRoots: NodeWithPath[], data: PreprocessResult): UnitySingleSummary['gcAttribution'] {
  const fc = data.frameSummary.count;
  const playerLoop = mainRoots.find(r => /PlayerLoop/i.test(r.name)) ?? mainRoots[0];
  const totalAlloc = playerLoop ? safeRound(playerLoop.gcAllocCount / Math.max(fc, 1), 1) : null;
  const bytesMean = data.memory?.gcAllocatedInFrame?.mean;
  const gcBytesPerFrameKb = bytesMean != null ? safeRound(bytesMean / 1024, 1) : null;

  const subtrees: { path: string; name: string; gcAllocCount: number; msPerFrameTotal: number }[] = [];
  const walk = (n: NodeWithPath) => {
    if (n.gcAllocCount >= 50 && !GC_STAGE_NAME_RE.test(n.name)) {
      subtrees.push({
        path: n.path,
        name: n.name,
        gcAllocCount: n.gcAllocCount,
        msPerFrameTotal: n.msPerFrameTotal,
      });
    }
    n.children.forEach(walk);
  };
  mainRoots.forEach(walk);
  const topSubtrees = dedupeLeafFirstByPath(subtrees, s => s.gcAllocCount, 8);

  return { totalAllocPerFrame: totalAlloc, gcBytesPerFrameKb, topSubtrees };
}

function buildSpecialMarkers(data: PreprocessResult, fc: number): UnitySingleSummary['specialMarkers'] {
  const names = ['WaitForTargetFPS', 'Gfx.WaitForPresent', 'WaitForRenderThread', 'GC.Collect'];
  const all = data.markers ?? [];
  return names.map(name => {
    const m = all.find(x => x.name === name);
    if (!m) return { name, perTraceMs: null, percentOfFrame: null, thread: '未出现' };
    return {
      name,
      perTraceMs: calcPerTraceMs(m, fc),
      percentOfFrame: m.percentOfFrame,
      thread: m.thread,
    };
  });
}

// ============ 剪枝 phase 树（port unity-diff） ============

interface TreeRenderCtx {
  budgetPaths: string[];
  presentPaths: string[];
  inBusinessSpine: boolean;
}

function withBusinessSpine(ctx: TreeRenderCtx, node: NodeWithPath): TreeRenderCtx {
  if (ctx.inBusinessSpine || BUSINESS_PHASE_RE.test(node.name)) {
    return { ...ctx, inBusinessSpine: true };
  }
  return ctx;
}

function nodeSelfTier(node: NodeWithPath, ctx: TreeRenderCtx): 'hot' | 'warm' | 'hide' {
  if (ctx.budgetPaths.includes(node.path)) return 'hot';
  if (ctx.presentPaths.includes(node.path)) return 'warm';
  if (node.msPerFrameSelf >= HOT_SELF_MS || node.msPerFrameTotal >= 0.35) return 'hot';
  if (node.msPerFrameSelf >= WARM_SELF_MS || node.msPerFrameTotal >= 0.12) return 'warm';
  if (isStageName(node.name) && node.msPerFrameTotal >= 0.5) return 'warm';
  return 'hide';
}

function effectiveTreeTier(node: NodeWithPath, ctx: TreeRenderCtx): 'hot' | 'warm' | 'hide' {
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

function shouldShowCallTreeNode(node: NodeWithPath, ctx: TreeRenderCtx): boolean {
  if (isNoiseCallTreeName(node.name)) {
    return node.children.some(c => shouldShowCallTreeNode(c, ctx));
  }
  return effectiveTreeTier(node, ctx) !== 'hide';
}

const PLUMBING_NAME_RE = /(\.|^)sampler_/i;

function isManagerLikeName(name: string): boolean {
  if (/\.(sampler_|ProcessTasks|EntityTask|TimeoutTask)/i.test(name)) return false;
  if (name === 'MapSignificanceMgr' || name === 'BattleHeadMgr') return true;
  if (/^CS:AOE\./.test(name) && /(Mgr|Manager|UIManager)$/.test(name)) return true;
  return false;
}

function isBudgetModule(node: NodeWithPath, ctx: TreeRenderCtx): boolean {
  return ctx.budgetPaths.includes(node.path);
}

function isModuleTaskLeaf(node: NodeWithPath): boolean {
  return /ProcessTask_/i.test(node.name);
}

function isPlumbingNode(node: NodeWithPath): boolean {
  if (isManagerLikeName(node.name)) return false;
  if (PLUMBING_NAME_RE.test(node.name)) return true;
  if (/\.(ProcessTasks|EntityTask|TimeoutTask)$/i.test(node.name)) return true;
  if (/\.On\w+Schedule$/.test(node.name) && node.msPerFrameSelf < 0.08) return true;
  if (/\.OnUpdate$/.test(node.name)) return false;
  const self = node.msPerFrameSelf;
  const total = node.msPerFrameTotal;
  if (node.children.length > 0 && total > 0.05 && self / total < 0.03) return true;
  return false;
}

function isSubsystemEntry(child: NodeWithPath, ctx: TreeRenderCtx): boolean {
  if (isBudgetModule(child, ctx)) return true;
  if (ctx.budgetPaths.some(p => p.startsWith(child.path + '▸') || p === child.path)) return true;
  return child.msPerFrameSelf >= 0.3 || child.msPerFrameTotal >= 0.5;
}

function isPromotedTaskNode(node: NodeWithPath, ctx: TreeRenderCtx): boolean {
  if (/ProcessTask_/i.test(node.name)) {
    return node.msPerFrameTotal >= 0.12 || node.msPerFrameSelf >= 0.15;
  }
  if (ctx.presentPaths.includes(node.path)) {
    return node.msPerFrameTotal >= 0.08;
  }
  return false;
}

function dedupeNodesByPath(nodes: NodeWithPath[]): NodeWithPath[] {
  const seen = new Set<string>();
  const out: NodeWithPath[] = [];
  for (const n of nodes) {
    if (seen.has(n.path)) continue;
    seen.add(n.path);
    out.push(n);
  }
  return out;
}

function flattenModuleDescendants(node: NodeWithPath, ctx: TreeRenderCtx, depth = 0): NodeWithPath[] {
  if (depth > 14) return [];
  const out: NodeWithPath[] = [];
  for (const c of node.children) {
    if (isNoiseCallTreeName(c.name)) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
      continue;
    }
    if (isBudgetModule(c, ctx)) { out.push(c); continue; }
    if (isPlumbingNode(c)) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
      continue;
    }
    if (isModuleTaskLeaf(c) && isPromotedTaskNode(c, ctx)) { out.push(c); continue; }
    if (isSubsystemEntry(c, ctx) && isManagerLikeName(c.name)) { out.push(c); continue; }
    if (c.children.some(ch => isModuleTaskLeaf(ch) || isPlumbingNode(ch) || isBudgetModule(ch, ctx))) {
      out.push(...flattenModuleDescendants(c, ctx, depth + 1));
    }
  }
  return dedupeNodesByPath(out);
}

function isModuleAggregator(node: NodeWithPath, ctx: TreeRenderCtx): boolean {
  if (isStageName(node.name) || isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return false;
  if (node.name === 'MapSignificanceMgr' || /^MapSignificanceMgr\.sampler_/i.test(node.name)) return true;
  if (node.msPerFrameTotal < 0.25) return false;
  const tasks = flattenModuleDescendants(node, ctx).filter(n => isModuleTaskLeaf(n));
  return tasks.length >= 2;
}

function isModuleContainer(node: NodeWithPath): boolean {
  return /OnTick&UpdateSchedule$/.test(node.name) || /OnLateUpdateSchedule$/.test(node.name);
}

function isModuleBoundary(node: NodeWithPath, ctx: TreeRenderCtx): boolean {
  if (isModuleAggregator(node, ctx) || isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return true;
  if (isModuleContainer(node)) return true;
  return isManagerLikeName(node.name);
}

function getModuleTreeChildren(node: NodeWithPath, ctx: TreeRenderCtx): NodeWithPath[] {
  if (node.name === 'PlayerLoop') {
    return node.children.filter(c => !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx));
  }
  if (!ctx.inBusinessSpine) return [];

  if (isBudgetModule(node, ctx) || isModuleTaskLeaf(node)) return [];

  if (isModuleAggregator(node, ctx)) {
    return flattenModuleDescendants(node, ctx)
      .filter(n => isModuleTaskLeaf(n) && isPromotedTaskNode(n, ctx))
      .sort((a, b) => b.msPerFrameTotal - a.msPerFrameTotal)
      .slice(0, 8);
  }

  if (isManagerLikeName(node.name)) {
    const scheduleKids = node.children.filter(c => isModuleContainer(c) && shouldShowCallTreeNode(c, ctx));
    if (scheduleKids.length) return scheduleKids;
    const hasSubManager = node.children.some(c =>
      !isNoiseCallTreeName(c.name) && (isManagerLikeName(c.name) || isModuleAggregator(c, ctx)),
    );
    if (!hasSubManager) {
      return node.children.filter(c => /\.OnUpdate$/.test(c.name) && !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx));
    }
  }

  if (!isModuleBoundary(node, ctx)) {
    return node.children.filter(c => !isNoiseCallTreeName(c.name) && shouldShowCallTreeNode(c, ctx));
  }

  const direct: NodeWithPath[] = [];
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
    if (isModuleAggregator(c, ctx)) direct.push(c);
    else if (isSubsystemEntry(c, ctx) && isManagerLikeName(c.name)) direct.push(c);
    else if (isSubsystemEntry(c, ctx) && /\.OnUpdate$/.test(c.name)) direct.push(c);
  }
  return dedupeNodesByPath(direct).sort((a, b) => b.msPerFrameTotal - a.msPerFrameTotal);
}

function formatCallTreeNodeLine(node: NodeWithPath, tier: 'hot' | 'warm'): string {
  const emoji = tier === 'hot' ? '🔴' : '🟡';
  const label = /^MapSignificanceMgr/.test(node.name) && /\.sampler_/.test(node.name)
    ? 'MapSignificanceMgr'
    : node.name;
  return `${label} (self ${node.msPerFrameSelf.toFixed(2)}ms/帧, total ${node.msPerFrameTotal.toFixed(2)}ms/帧) ${emoji}`;
}

function renderModuleCallTreeNode(node: NodeWithPath, depth: number, lines: string[], ctx: TreeRenderCtx) {
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

function renderPrunedPhaseTree(mainRoots: NodeWithPath[], summary: UnitySingleSummary): string[] {
  const lines: string[] = [];
  const budgetPaths = (summary.topHotspots ?? []).flatMap(h =>
    h.isGroup && h.members ? h.members.map(m => m.path) : [h.path],
  );
  const presentPaths = (summary.topHotspotsPresent ?? []).map(h => h.path);
  lines.push('### 3.1 主线程 phase 总览（剪枝热点树）', '');
  lines.push(
    '> **剪枝结构**：PlayerLoop 各 phase 一行；Update/LateUpdate **业务链**展开到模块边界；🔴/🟡 为 Top-N / 稀疏热点路径。' +
    '全量节点见 `unity-single-summary.json`。',
    '',
  );
  const treeCtx: TreeRenderCtx = { budgetPaths, presentPaths, inBusinessSpine: false };
  lines.push('```');
  for (const r of mainRoots) renderModuleCallTreeNode(r, 0, lines, treeCtx);
  lines.push('```', '');
  return lines;
}

// ============ 紧凑入口路径 ============

function formatCompactNodeLine(node: NodeWithPath, tier: 'hot' | 'warm'): string {
  return `${node.name} (self ${node.msPerFrameSelf.toFixed(2)}ms/帧)`;
}

/** 入口路径（过长时折叠中间透传层） */
export function renderCompactEntryPath(mainRoots: NodeWithPath[], targetPath: string): string[] {
  const chain = collectNodesOnPath(mainRoots, targetPath);
  if (!chain.length) return ['_路径未找到_'];
  if (chain.length <= 6) {
    return chain.map((node, depth) =>
      `${'  '.repeat(depth)}└─ ${formatCompactNodeLine(node, depth === chain.length - 1 ? 'hot' : 'warm')}`,
    );
  }
  const out: string[] = [];
  out.push(`└─ ${formatCompactNodeLine(chain[0], 'warm')}`);
  const phase = chain.find((n, i) => i > 0 && (isStageName(n.name) || /GameLauncher/.test(n.name))) ?? chain[1];
  out.push(`  └─ ${formatCompactNodeLine(phase, 'warm')}`);
  out.push('    └─ …');
  const parent = chain[chain.length - 2];
  const target = chain[chain.length - 1];
  if (parent.path !== phase.path) {
    out.push(`      └─ ${formatCompactNodeLine(parent, 'warm')}`);
    out.push(`        └─ ${formatCompactNodeLine(target, 'hot')}`);
  } else {
    out.push(`      └─ ${formatCompactNodeLine(target, 'hot')}`);
  }
  return out;
}

function collectHotspotChildBreakdown(node: NodeWithPath | null, limit = 8): NodeWithPath[] {
  return (node?.children ?? [])
    .filter(c => c.msPerFrameSelf >= 0.03 || c.gcAllocCount >= 50)
    .sort((a, b) => b.msPerFrameSelf - a.msPerFrameSelf)
    .slice(0, limit);
}

// ============ 主入口 summary ============

export function buildUnitySingleSummary(data: PreprocessResult, label: string): UnitySingleSummary {
  const mainRaw = (data.aggregatedCallTrees ?? []).find(t => /Main Thread/i.test(t.threadName));
  const main = mainRaw ? attachTreePaths(mainRaw) : undefined;
  const mainRoots = main?.roots ?? [];

  const topHotspots = buildTopHotspots(data, mainRoots);
  const steadyPaths = new Set(topHotspots.flatMap(h => h.isGroup && h.members ? h.members.map(m => m.path) : [h.path]));
  const presentRaw = collectPresentFrameHotspots(data, mainRoots, steadyPaths, 24);
  const topHotspotsPresent = buildPresentHotspotDisplayRows(presentRaw, 8);

  const fc = data.frameSummary.count;
  const mustReportMarkers = (data.markers ?? [])
    .filter(m => m.mustReport)
    .map(m => ({
      name: m.name,
      perTraceMs: calcPerTraceMs(m, fc),
      percentOfFrame: m.percentOfFrame,
      reason: m.mustReportReason ?? '',
    }));

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      label,
      targetFps: data.config.targetFps,
      frameCount: fc,
      frameBudgetMs: data.config.frameBudgetMs,
    },
    frameSummary: data.frameSummary,
    mainThread: mainRaw,
    topHotspots,
    topHotspotsPresent,
    mustReportMarkers,
    markersByThread: data.markersByThread ?? {},
    gcAttribution: buildGcAttribution(mainRoots, data),
    spikes: (data.markerSpikes ?? []).slice(0, 12).map(s => ({
      name: s.name,
      spikeRatio: s.spikeRatio,
      msSelfMean: s.msSelfMean,
    })),
    specialMarkers: buildSpecialMarkers(data, fc),
    threads: data.threads ?? [],
  };
}

// ============ 骨架 markdown ============

function fmtMs(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}ms`;
}

function renderPresentHotspotSection(present: HotspotPresentRow[], fc: number): string[] {
  if (!present.length) return [];
  const lines: string[] = [];
  lines.push('### 3.2b 稀疏出现帧热点（出现帧 self 均值）', '');
  lines.push(
    '> **出现帧/总帧** = marker 在多少帧出现过 / 采集总帧数。**self ms（出现帧）** = 累计 self ms ÷ 出现帧数。' +
    '与 §3.2 稳态 Top-N（perTraceMs）互补。',
    '',
  );
  lines.push('| # | 模块 | self ms（出现帧） | perTraceMs | 出现帧/总帧 | 出现率% |');
  lines.push('|---:|---|---:|---:|---|---:|');
  for (const row of present) {
    const pf = `${row.presentOnFrameCount}/${fc}`;
    lines.push(`| ${row.rank} | ${row.name} | ${row.msSelfWhenPresent.toFixed(2)}ms | ${row.perTraceMs.toFixed(2)}ms | ${pf} | ${row.presentRate.toFixed(1)}% |`);
  }
  lines.push('');

  const decodeGroup = present.find(d => d.groupKey === 'pb.decode');
  if (decodeGroup && (decodeGroup.memberCount ?? 0) > 1) {
    const members = present.filter(p => isPbDecodeName(p.name));
    lines.push('**pb.decode 明细**（合并项展开）：', '');
    lines.push('| marker | self ms（出现帧） | 出现帧/总帧 | perTraceMs |');
    lines.push('|---|---:|---|---:|');
    for (const m of [...members].sort((a, b) => b.msSelfWhenPresent - a.msSelfWhenPresent).slice(0, 12)) {
      lines.push(`| ${m.name} | ${m.msSelfWhenPresent.toFixed(2)}ms | ${m.presentOnFrameCount}/${fc} | ${m.perTraceMs.toFixed(2)}ms |`);
    }
    lines.push('');
  }
  return lines;
}

function renderInterleavedHotspotSections(summary: UnitySingleSummary, mainRoots: NodeWithPath[]): string[] {
  const lines: string[] = [];
  const hotspots = (summary.topHotspots ?? []).slice(0, 5);
  if (!hotspots.length) {
    lines.push('_无 Top-N 热点_', '');
    return lines;
  }

  lines.push('### 3.3 Top 热点细化分析', '');
  lines.push(
    `> §3.4 ~ §3.${3 + hotspots.length} 与 **§3.2 #1~#${hotspots.length}** 一一对应：` +
    '每项含入口树 + 子 marker 拆分 + 身份；**分析层**由 AI 填写分析槽。',
    '',
  );

  for (const [i, h] of hotspots.entries()) {
    const secNum = i + 4;
    const tag = `§3.${secNum}`;
    const node = !h.isGroup ? findNodeByPath(mainRoots, h.path) : null;
    const tagLabel = h.mustReport ? 'mustReport' : '';

    lines.push(`### 3.${secNum} ${h.name}（Top-N #${h.rank}${tagLabel ? `，${tagLabel}` : ''}）`, '');

    lines.push('**入口**：', '', '```');
    if (h.isGroup && h.groupKey === 'urp.render' && !node) {
      lines.push('_aggregatedCallTrees 中未定位合并锚点；见下方子 marker 表。_');
    } else if (node || h.path) {
      lines.push(...renderCompactEntryPath(mainRoots, h.path));
    } else {
      lines.push('_路径未找到；见 markers 表 callChain。_');
    }
    lines.push('```', '');

    lines.push('**子 marker 拆分**（按 self ms/帧 降序）：', '');
    if (h.isGroup && h.members?.length) {
      lines.push('| 子 marker | self ms/帧 | total ms/帧 | 占帧% | GC 次数 |');
      lines.push('|---|---:|---:|---:|---:|');
      for (const m of h.members) {
        lines.push(`| ${m.name} | ${m.perTraceMs.toFixed(2)}ms | ${m.msPerFrameTotal.toFixed(2)}ms | ${m.percentOfFrame.toFixed(1)}% | ${m.gcAllocCount} |`);
      }
      lines.push('');
    } else {
      const children = collectHotspotChildBreakdown(node, 10);
      if (children.length) {
        lines.push('```');
        for (const c of children) {
          lines.push(`└─ ${formatCompactNodeLine(c, 'warm')}  (total ${c.msPerFrameTotal.toFixed(2)}ms/帧)`);
        }
        lines.push('```', '');
      } else {
        lines.push('_叶子 / 引擎管线节点，无显著子 marker_', '');
      }
    }

    lines.push('**身份**（Provider）：', '');
    lines.push(`- perTraceMs ${h.perTraceMs.toFixed(2)}ms/帧；total ${h.msPerFrameTotal.toFixed(2)}ms/帧；占帧 ${h.percentOfFrame.toFixed(1)}%`);
    lines.push(`- 出现帧 ${h.presentOnFrameCount}/${summary.meta.frameCount}；calls/帧 ${h.callsPerFrame.toFixed(2)}`);
    if (h.msSelfWhenPresent > 0 && h.presentOnFrameCount < summary.meta.frameCount) {
      lines.push(`- 出现帧 self 均值 ${h.msSelfWhenPresent.toFixed(2)}ms`);
    }
    if (h.gcAllocCount >= 1) lines.push(`- GC.Alloc ${h.gcAllocCount} 次（全 trace 子树累计）`);
    lines.push('');

    lines.push(`**业务含义**：<!-- LLM_FILL:${tag}:业务含义: 60-120字，解读上表数字；禁止编造子 marker -->`, '');
    lines.push(`**调用入口**：<!-- LLM_FILL:${tag}:调用入口: 1句，节点须出现在上方入口树或子表 -->`, '');
    lines.push(`**优化方向**：<!-- LLM_FILL:${tag}:优化方向: 3-5条bullet，每条引用上表子 marker -->`, '');
    lines.push(`**探索（待验证）**：<!-- LLM_FILL:${tag}:探索: 1-2条跨§假设，标注依据 §? -->`, '');
    lines.push('', '---', '');
  }
  return lines;
}

export function buildSkeletonMarkdown(summary: UnitySingleSummary): string {
  const lines: string[] = [];
  const { meta, frameSummary, topHotspots, mustReportMarkers, gcAttribution, spikes, specialMarkers, threads } = summary;
  const fc = meta.frameCount;
  const budget = meta.frameBudgetMs;
  const mainRaw = summary.mainThread;
  const mainRoots = mainRaw ? attachTreePaths(mainRaw).roots : [];

  lines.push(`# Unity Profiler 单次 CPU 报告 — ${meta.label}`);
  lines.push('');
  lines.push(`> 标签: ${meta.label} · ${fc} 帧 · target ${meta.targetFps}fps · 预算 ${budget}ms/帧`);
  lines.push(`> 生成: unity-single-builder · ${summary.generatedAt.slice(0, 19)}`);
  lines.push('', '---', '');

  // §-1
  lines.push('## §-1 数据采集 · 能力声明', '');
  lines.push('| 项 | 值 |', '|---|---|');
  lines.push(`| 数据源 | unity_profiler（PlayerLoop 帧口径） |`);
  lines.push(`| 帧数 | ${fc} |`);
  lines.push(`| target FPS | ${meta.targetFps} |`);
  lines.push('');
  lines.push('> **本报告能答**：主线程/各线程 marker 耗时、aggregatedCallTrees、Jank/spike、GC 次数（全 trace 累计）。');
  lines.push('> **本报告不能答**：native 符号级热点（需 simpleperf）、线程 Sleeping/降频（需 perfetto）、GPU 真瓶颈定性需多源交叉。');
  lines.push('', '---', '');

  // §0
  const top5 = topHotspots.slice(0, 5);
  const spikeCount = spikes.length;
  const mustCount = mustReportMarkers.length;
  const gcAllocStr = gcAttribution.totalAllocPerFrame != null
    ? String(gcAttribution.totalAllocPerFrame)
    : '—';

  lines.push('## §0 结论先行', '');
  lines.push('> **① 帧预算形态**', '>', '```');
  lines.push(`mean ${frameSummary.mean.toFixed(2)}ms / budget ${budget}ms · P95 ${(frameSummary.p95 ?? 0).toFixed(2)}ms · Jank ${frameSummary.jankCount}`);
  lines.push('```');
  lines.push('<!-- LLM_FILL:§0:①帧预算: 50-120字，引用上面 mean/P95/Jank，判定达标/贴预算/系统性慢；禁新数字 -->', '');
  lines.push('> **② 头号业务热点 Top-5**', '>', '```');
  for (const h of top5) {
    lines.push(`#${h.rank} ${h.name}  ${h.perTraceMs.toFixed(2)}ms/帧  ${h.percentOfFrame.toFixed(1)}%`);
  }
  lines.push('```');
  lines.push('<!-- LLM_FILL:§0:②业务热点: 50-120字，引用 Top-5 名称与 perTraceMs；禁编造模块名 -->', '');
  lines.push('> **③ GC / 波动态势**', '>', '```');
  lines.push(`GC.Alloc ~${gcAllocStr} 次/帧 · spikes ${spikeCount} · mustReport ${mustCount} 项`);
  lines.push('```');
  lines.push('<!-- LLM_FILL:§0:③GC波动: 50-120字，引用 GC/spike/mustReport 数字 -->', '', '');
  lines.push('**按 ROI 排序的优化方向：**', '', '<!-- LLM_FILL:§0:ROI: 3-5条 `1. **模块** — 理由`，引用 §0 证据 -->', '', '---', '');

  // §1
  lines.push('## §1 口径与可信度', '');
  lines.push('- 帧口径：`playerloop`（Unity 主循环），**不可与 perfetto Choreographer 直比**。');
  lines.push(`- mustReport 强制覆盖：**${mustCount}** 项（见 §3.2）。`);
  lines.push('<!-- LLM_FILL:§1:可信度: 30-80字，若帧数偏低或 spike 多则打折说明 -->', '', '---', '');

  // §2
  lines.push('## §2 帧级分布', '');
  lines.push('| 指标 | 数值 | evidence |', '|---|---|---|');
  lines.push(`| mean | ${frameSummary.mean.toFixed(2)}ms | frameSummary.mean |`);
  lines.push(`| median | ${frameSummary.median.toFixed(2)}ms | frameSummary.median |`);
  lines.push(`| P90/P95/P99 | ${(frameSummary.p90 ?? 0).toFixed(2)}/${(frameSummary.p95 ?? 0).toFixed(2)}/${(frameSummary.p99 ?? 0).toFixed(2)}ms | frameSummary |`);
  lines.push(`| min / max | ${frameSummary.min.toFixed(2)} / ${frameSummary.max.toFixed(2)}ms | frameSummary |`);
  lines.push(`| worst #${frameSummary.worstFrameIndex ?? '?'} | ${frameSummary.max.toFixed(2)}ms | frameSummary |`);
  lines.push(`| Jank / BigJank | ${frameSummary.jankCount} / ${frameSummary.bigJankCount} | frameSummary |`);
  lines.push(`| 实测 FPS | ${frameSummary.actualFps.toFixed(1)} | frameSummary.actualFps |`);
  lines.push('', '<!-- LLM_FILL:§2:分布形态: 1-2句解读 P50/P99/Jank 形态（稳定贴预算 vs 尖峰） -->', '', '---', '');

  // §3
  lines.push('## §3 主线程热点与调用树', '');
  if (mainRoots.length) {
    lines.push(...renderPrunedPhaseTree(mainRoots, summary));

    lines.push('### 3.2 Top-N 稳态热点（perTraceMs = self 均值×出现帧÷总帧数）', '');
    lines.push('| # | marker | perTraceMs | total ms/帧 | 占帧% | 出现帧/总帧 | calls/帧 |');
    lines.push('|---:|---|---:|---:|---:|---|---:|');
    for (const row of topHotspots) {
      const pf = `${row.presentOnFrameCount}/${fc}`;
      lines.push(`| ${row.rank} | ${row.name} | ${row.perTraceMs.toFixed(2)}ms | ${row.msPerFrameTotal.toFixed(2)}ms | ${row.percentOfFrame.toFixed(1)}% | ${pf} | ${row.callsPerFrame.toFixed(2)} |`);
    }
    lines.push('');

    if (mustReportMarkers.length) {
      lines.push('**mustReport 强制清单**（Provider，不可遗漏）：', '');
      lines.push('| marker | perTraceMs | 占帧% | 原因 |', '|---|---:|---:|---|');
      for (const m of mustReportMarkers) {
        const pct = (dataMarkersPercent(summary, m.name) ?? m.percentOfFrame).toFixed(1);
        lines.push(`| ${m.name} | ${m.perTraceMs.toFixed(2)}ms | ${pct}% | ${m.reason} |`);
      }
      lines.push('');
    }

    const presentSection = renderPresentHotspotSection(summary.topHotspotsPresent ?? [], fc);
    if (presentSection.length) lines.push(...presentSection);

    lines.push(...renderInterleavedHotspotSections(summary, mainRoots));
  } else {
    lines.push('_主线程 aggregatedCallTrees 缺失_', '');
  }
  lines.push('', '---', '');

  // §4
  lines.push('## §4 各线程负载', '');
  lines.push('> Provider 仅展开 **perTraceMs Top-10** 非主线程子节（其余线程负载过低未单列）；分析槽由 LLM 填写。', '');
  const sortedThreads = [...threads].sort((a, b) => (b.msPerFrameTotal ?? 0) - (a.msPerFrameTotal ?? 0));
  lines.push('| 线程 | ms 中位 | ms 最大 | ms/帧 total |', '|---|---:|---:|---:|');
  for (const t of sortedThreads.slice(0, 12)) {
    lines.push(`| ${t.name} | ${t.msMedian.toFixed(2)}ms | ${t.msMax.toFixed(2)}ms | ${(t.msPerFrameTotal ?? 0).toFixed(2)}ms |`);
  }
  lines.push('');

  const byThread = summary.markersByThread;
  // §4 仅保留负载最高的非主线程（Provider 给表，LLM 填分析；避免 15+ 低价值 Background 槽拖垮 CLI）
  const threadKeys = Object.keys(byThread)
    .filter(k => !/Main Thread/i.test(k))
    .map(thread => {
      const markers = byThread[thread] ?? [];
      const peakPerTrace = markers.reduce((best, m) => Math.max(best, calcPerTraceMs(m, fc)), 0);
      return { thread, peakPerTrace, markers };
    })
    .filter(t => t.markers.length > 0 && t.peakPerTrace >= 0.01)
    .sort((a, b) => b.peakPerTrace - a.peakPerTrace)
    .slice(0, 10)
    .map(t => t.thread);
  for (const thread of threadKeys) {
    const markers = (byThread[thread] ?? []).slice(0, 5);
    if (!markers.length) continue;
    lines.push(`### ${thread}`, '');
    lines.push('| marker | perTraceMs | 占帧% |', '|---|---:|---:|');
    for (const m of markers) {
      const pt = calcPerTraceMs(m, fc);
      lines.push(`| ${m.name} | ${pt.toFixed(2)}ms | ${m.percentOfFrame.toFixed(1)}% |`);
    }
    lines.push('', `<!-- LLM_FILL:§4:${thread}: 1-2句解读该线程 marker 表数字 -->`, '');
  }
  lines.push('<!-- LLM_FILL:§4:线程总述: 2-4句，主/Render/Submit/Job 负载形态；引用上表数字 -->', '', '---', '');

  // §5
  lines.push('## §5 GC 压力', '');
  lines.push(`- 帧均 GC.Alloc 次数（全 trace 估算）: **${gcAttribution.totalAllocPerFrame ?? '—'}** 次/帧`);
  if (gcAttribution.gcBytesPerFrameKb != null) {
    lines.push(`- 帧均 GC 分配字节: **${gcAttribution.gcBytesPerFrameKb}** KB/帧`);
  }
  if (gcAttribution.topSubtrees.length) {
    lines.push('', '| 业务子树 | GC 次数（全 trace） | ms/帧 total |', '|---|---:|---:|');
    for (const s of gcAttribution.topSubtrees) {
      lines.push(`| ${s.name} \`${s.path.split('▸').slice(-2).join('▸')}\` | ${s.gcAllocCount} | ${s.msPerFrameTotal.toFixed(2)}ms |`);
    }
  }
  lines.push('', '<!-- LLM_FILL:§5:GC态势: 60-120字，解读次数/字节，关联 §3 GC 热点 -->', '', '---', '');

  // §6
  lines.push('## §6 Jank / 慢帧', '');
  lines.push(`- **Jank 帧数 = ${frameSummary.jankCount}**；最差帧 #${frameSummary.worstFrameIndex ?? '?'} ${frameSummary.max.toFixed(2)}ms。`);
  lines.push('', '<!-- LLM_FILL:§6:Jank模式: 1-3句，Jank=0 也要解释慢帧来源 -->', '', '---', '');

  // §7
  lines.push('## §7 Marker 波动 (spikes)', '');
  if (spikes.length) {
    lines.push('| marker | spikeRatio | selfMean |', '|---|---:|---:|');
    for (const s of spikes.slice(0, 10)) {
      lines.push(`| ${s.name} | ${s.spikeRatio.toFixed(1)}× | ${s.msSelfMean.toFixed(2)}ms |`);
    }
    lines.push('');
  }
  lines.push('<!-- LLM_FILL:§7:波动判定: 1-2句，哪些 spike 值得跟进 -->', '', '---', '');

  // §8
  lines.push('## §8 引擎/等待类特殊 Marker', '');
  lines.push('| Marker | perTraceMs | 占帧% | 线程 |', '|---|---:|---:|---|');
  for (const s of specialMarkers) {
    const pt = s.perTraceMs != null ? `${s.perTraceMs.toFixed(2)}ms` : '—';
    const pct = s.percentOfFrame != null ? `${s.percentOfFrame.toFixed(1)}%` : '—';
    lines.push(`| ${s.name} | ${pt} | ${pct} | ${s.thread} |`);
  }
  lines.push('', '<!-- LLM_FILL:§8:瓶颈定型: 1-2句 CPU/GPU/轻松/混合，引用上表 -->', '', '---', '');

  // §9
  lines.push('## §9 可执行建议（ROI 索引）', '');
  const roi = topHotspots.slice(0, 5);
  if (roi.length) {
    lines.push('| 优先级 | 模块 | perTraceMs | 详见 |', '|---:|---|---:|---|');
    for (const [i, h] of roi.entries()) {
      lines.push(`| P${i + 1} | ${h.name} | ${h.perTraceMs.toFixed(2)}ms | §3.${i + 4} |`);
    }
  } else {
    lines.push('- 无显著热点');
  }
  lines.push('', '_§9 为索引；叙事见 §3.x 分析槽。_', '', '---', '');

  // §10
  lines.push('## §10 局限与下一步', '');
  lines.push('| 问题 | 本报告 | 建议补采 |', '|---|---|---|');
  lines.push('| native 热点符号 | ❌ | simpleperf |');
  lines.push('| 线程 Sleeping / 降频 | ❌ | perfetto |');
  lines.push('| GPU bound 定性 | 🟡 仅 Wait 类 marker | perfetto + GPU counter |');
  lines.push('', '<!-- LLM_FILL:§10:下一步: 2-4条可执行补采/验证建议 -->', '', '---', '');

  lines.push('', '_本骨架由 unity-single-builder 产出；展示层由 Provider 锁定；分析槽由 AI 填写。_');

  return lines.join('\n');
}

function dataMarkersPercent(summary: UnitySingleSummary, name: string): number | undefined {
  const m = (summary.mustReportMarkers.find(x => x.name === name));
  return m?.percentOfFrame;
}

// ============ CLI ============

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function main() {
  const inputPath = arg('input');
  const outDir = arg('out');
  const label = arg('label') ?? 'unity-single';
  if (!inputPath || !outDir) {
    console.error('Usage: tsx unity-single-builder.ts --input <preprocess.json> --out <out_dir> [--label <label>]');
    process.exit(1);
  }

  const data: PreprocessResult = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const summary = buildUnitySingleSummary(data, label);

  fs.mkdirSync(outDir, { recursive: true });
  const summaryPath = path.join(outDir, 'unity-single-summary.json');
  const skeletonPath = path.join(outDir, 'performance-report_unity_single_skeleton.md');

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  const md = buildSkeletonMarkdown(summary);
  fs.writeFileSync(skeletonPath, md, 'utf-8');

  const llmFillCount = (md.match(/<!-- LLM_FILL/g) ?? []).length;
  const lineCount = md.split('\n').length;

  console.error(`[unity-single] summary → ${summaryPath}`);
  console.error(`[unity-single] skeleton → ${skeletonPath}`);
  console.error(`[unity-single] topHotspots: ${summary.topHotspots.length}, present: ${summary.topHotspotsPresent.length}`);
  console.log(JSON.stringify({ summaryPath, skeletonPath, lineCount, llmFillCount }, null, 2));
}

if (require.main === module) main();
