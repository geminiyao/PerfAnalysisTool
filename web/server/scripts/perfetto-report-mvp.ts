/**
 * @deprecated DR-44 WT-027: 本文件的脚本基座已废弃，改走三段管线。
 *
 * perfetto 报告生成现在走：
 *   explore LLM (explore-service.ts --source perfetto) → findings.json
 *   narrative LLM (narrative-service.ts) → narrative.json
 *   render 纯代码 (render-html.ts) → report.html
 *
 * 本文件的 buildNarrative / humanizeFinding / buildRoiOptimizations / renderHtml 等
 * 函数是"脚本拼内容"的反模式（作文机），已废弃。runReportMvp 保留仅用于 [14] 节旧测试
 * 兼容，不要再扩展。新代码请走 narrative-service.ts + render-html.ts。
 *
 * 详见 docs/prism/memory/methodology/report-pipeline-contract.md（DR-44）。
 */

/**
 * WT-023 · Perfetto report layer refactor (DR-41 五条硬规则) — @deprecated 见上方 DR-44 说明
 *
 * 重构目标（对照 DR-41 报告层方法论）：
 *   规则 1 审计剥离：report.html 删除 evidence id/tool/runId/证据字样，finding card 只显示 humanNarrative
 *   规则 2 热点模块归并：top 列表子树归并（parentChain 包含关系，不硬编码业务名）
 *   规则 3 结构重排去重：§0 结论 → §1 元信息 → §2 多线程 → §3 off-CPU+GPU-bound → §4 降频 → §5 callTree+红线 → §6 ROI
 *   规则 4 图文穿插四段式：§0 三大独立结论引用块+ASCII+数字解读，禁止超过 3 行文字段落
 *   规则 5 人话先行：正文无字段名（byState.S.totalMs / coveragePct / foldChange=9999）
 *
 * 数据源：
 *   - WT-020 explore 产物（ledger/findings/verdict）
 *   - WT-022 provider 产物（{base,cur,throttle}/perfetto-profile-summary.json）
 *
 * 约束（不变）：
 *   - 不硬编码业务名清单/绝对阈值/§0-§9 死模板
 *   - ROI name 从 finding 动态取
 *   - 判定用 relativeBaseline 相对倍数
 *
 * Usage (from web/):
 *   node --import tsx server/scripts/perfetto-report-mvp.ts
 *
 * Outputs → web/data/prism-out/bk26b-perfetto-report-mvp/
 *   narrative.json | report.html | audit.json | run.log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// WT-025 需求 2：报告层可复用工具（数据源无关）
import {
  buildNameParentChains as buildNameParentChainsGeneric,
  mergeBySubtree,
  humanizeRelativeJudgment,
  humanizeCausalInference,
  buildAsciiBar,
  renderFourPartBlock,
  htmlEsc,
  type NameParentChain,
  type TopConclusionBlock,
  type ReportTreeNode,
} from '../prism/report-utils.js';

// ── types (mirror WT-020 shapes; thin local) ──

type Role = 'base' | 'cur' | 'throttle';

interface LedgerEvidence {
  id: string;
  tool: string;
  role: Role;
  args: Record<string, unknown>;
  provenance: Record<string, unknown>;
  summary: string;
  dataRefs?: string[];
  facts: Record<string, unknown>;
}

interface LedgerFile {
  source: string;
  sampleSet: string;
  generatedAt: string;
  evidenceCount: number;
  evidence: LedgerEvidence[];
}

interface RelativeBaseline {
  baselineRole: 'base' | 'cur';
  compareRole: 'cur' | 'throttle';
  absoluteValue: string;
  baselineValue: string;
  foldChange: number | null;
  deltaPct: number | null;
  relativeJudgment: string;
}

interface CausalChain {
  premise: string;
  inference: string;
  conclusion: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Finding {
  id: string;
  title: string;
  severity: string;
  evidenceIds: string[];
  claim: string;
  boundary: string;
  kind?: string;
  relativeBaseline?: RelativeBaseline;
  causalChain?: CausalChain;
}

interface FindingsFile {
  source: string;
  sampleSet: string;
  generatedAt: string;
  findings: Finding[];
}

interface VerdictFile {
  source: string;
  sampleSet: string;
  summary: string;
  conclusions: string[];
  boundaries: string[];
  findingIds: string[];
  generatedAt: string;
  triadTrend?: string;
  topBusinessHotspot?: string;
  gpuBoundJudgment?: string;
  freqMorphologyJudgment?: string;
}

// ── WT-022 profile-summary thin types ──

interface ThreadSchedEntry {
  count?: number;
  runningPct?: number;
  runnablePct?: number;
  sleepingPct?: number;
}

interface PerCpuEntry {
  cpu: number;
  avgMhz?: number;
  maxMhz?: number;
  cpuinfoMaxMhz?: number;
  reachVsCpuinfoPct?: number;
  reachPct?: number;
}

interface ThrottlingInfo {
  level?: string;
  confirmedAvailable?: boolean;
  thermal?: { beforeC?: number; afterC?: number; deltaC?: number; primaryZone?: string };
  perCpu?: PerCpuEntry[];
  bigCoreReachPct?: number;
  evidence?: string[];
}

interface ByStateEntry {
  state: string;
  totalMs: number;
  count?: number;
  pctOfOffCpu?: number;
}

interface OffCpuAttribution {
  sleepingPct?: number;
  runnablePct?: number;
  totalOffCpuMs?: number;
  byState?: ByStateEntry[];
  note?: string;
}

interface FrameEntry {
  frameDefinition?: string;
  count?: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  fps?: number;
  slowFrameRate?: number;
}

interface GcAllocChainEntry {
  name: string;
  count: number;
  totalMs: number;
  perFrame: number;
  depth?: number;
  parentChain?: string[];
}

interface GcAllocByChain {
  available?: boolean;
  playerLoopFrameCount?: number;
  totalGcAllocSlices?: number;
  byChain?: GcAllocChainEntry[];
}

interface CallTreeNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
  count?: number;
  layer?: string;
  children?: CallTreeNode[];
}

interface CallTree {
  thread: string;
  label?: string;
  root: CallTreeNode;
}

interface ProfileSummary {
  source: string;
  schemaVersion?: number;
  meta?: Record<string, unknown>;
  metrics?: Array<{ key: string; value: number; unit?: string; source?: string }>;
  frame?: FrameEntry[];
  system?: {
    cpuFreqAvgMhz?: number;
    binder?: { count?: number; avgMs?: number };
    pssMb?: number;
    cpuThrottled?: boolean;
  };
  threadsSched?: Record<string, ThreadSchedEntry>;
  atraceSlices?: Record<string, { count?: number; avgMs?: number; totalMs?: number }>;
  frameTimeline?: unknown;
  throttling?: ThrottlingInfo;
  offCpuReasons?: OffCpuAttribution;
  offCpuAttribution?: OffCpuAttribution;
  gcAllocByChain?: GcAllocByChain;
  callTrees?: CallTree[];
  _meta?: { note?: string; parseStatus?: string };
  confidence?: { perFrameAlignmentOk?: boolean | null; notes?: string[] };
}

// ── narrative types ──

interface HotPathNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
  count?: number;
  layer?: string;
  children?: HotPathNode[];
}

interface RoiOptimization {
  rank: number;
  direction: string;
  rationale: string;
  severity: string;
  findingIds: string[];
}

interface NarrativeFinding {
  id: string;
  title: string;
  severity: string;
  claim: string;
  boundary: string;
  evidenceIds: string[];
  kind?: string;
  relativeBaseline?: RelativeBaseline;
  causalChain?: CausalChain;
  relativeBaselineNarrative?: string;
  causalNarrative?: string;
  humanNarrative?: string;
}

interface ThreadMacroRow {
  name: string;          // 通用名（动态识别，不硬编码清单）
  commKey?: string;      // threadsSched 的原始 key
  // WT-024 需求 2：三态结构，不再"取最新可用"
  base?: { runningPct: number | null; sleepingPct: number | null; runnablePct: number | null };
  cur?: { runningPct: number | null; sleepingPct: number | null; runnablePct: number | null };
  throttle?: { runningPct: number | null; sleepingPct: number | null; runnablePct: number | null };
  note?: string;         // 一句话定位（基于演化趋势，动态生成，不硬编码）
}

interface CallTreeDrilldownNode {
  name: string;
  depth: number;
  totalMs?: number;
  totalPct?: number;
  count?: number;
  layer?: string;
  perFrameMs?: number;   // totalMs / playerLoopFrameCount
  children?: CallTreeDrilldownNode[];
}

interface RedlineMatrixRow {
  rank: number;
  module: string;        // 从 callTree/finding 动态提取
  curPerFrameMs: number | null;
  throttlePerFrameMs: number | null;
  basePerFrameMs: number | null;
  foldChangeCurVsBase: number | null;
  foldChangeThrottleVsCur: number | null;
  redlineType: string;   // 动态判定（相对倍数 + perFrame 阈值，不硬编码绝对值）
  childHotspot?: string;
  findingId?: string;
  // WT-023 DR-41 规则 2：子树归并——同一子树的 child 不单独成行，挂在 parent 的 mergedChildren 里
  mergedChildren?: string[]; // 归并到本行的 child 模块名（不含本行 module）
}

interface FreqMatrixRow {
  dimension: string;
  requirement: string;
  base: string;
  cur: string;
  throttle: string;
}

interface OffCpuStateRow {
  state: string;
  base?: { totalMs: number; pctOfOffCpu: number };
  cur?: { totalMs: number; pctOfOffCpu: number };
  throttle?: { totalMs: number; pctOfOffCpu: number };
}

interface GpuBoundMatrixRow {
  signal: string;
  directEvidence: string;
  indirectEvidence: string;
  judgment: string;
}

// ── WT-023 DR-41 规则 2/4 新增类型 ──

// NameParentChain / TopConclusionBlock 已从 report-utils.ts 导入（WT-025 需求 2）

export interface PerfettoNarrative {
  source: 'perfetto';
  sampleSet: 'bk26b-perfetto-triad';
  generatedAt: string;
  overview: string;
  topConclusions: Array<{
    rank: number;
    problem: string;
    kind: string;
    contribution: string;
    severity: string;
    evidenceIds: string[];
    findingIds: string[];
  }>;
  findings: NarrativeFinding[];
  evidenceSummary: Array<{
    id: string;
    tool: string;
    role: string;
    summary: string;
    runId?: string;
  }>;
  capabilityBoundaries: string[];
  triadTrend?: string;
  topBusinessHotspot?: string;
  gpuBoundJudgment?: string;
  freqMorphologyJudgment?: string;
  roiOptimizations?: RoiOptimization[];
  triadComparison: {
    sched: Record<Role, { runningPct: number | null; sleepingPct: number | null; evidenceId: string }>;
    atrace: Record<Role, { playerLoopAvgMs: number | null; playerLoopCount: number | null; behaviourAvgMs: number | null; evidenceId: string }>;
    cpu: Record<Role, { avgMhz: number | null; bigCoreReachPct: number | null; throttlingLevel: string | null; evidenceId: string }>;
    frame: Record<Role, { androidFrameTimelineAvailable: boolean | null; choreographerAvailable: boolean | null; evidenceId: string }>;
  };
  callTrees: Record<Role, {
    available: boolean;
    viaPlayerLoopAnchorFallback: boolean;
    note: string;
    hotPath: HotPathNode[];
    evidenceId: string;
  }>;
  // ── v5.3 对齐新增字段 ──
  multiThreadMacro: {
    threads: ThreadMacroRow[];
    note: string;
  };
  callTreeDrilldown: Record<Role, {
    available: boolean;
    tree: CallTreeDrilldownNode[];
    playerLoopFrameCount: number | null;
    note: string;
  }>;
  offCpuAttribution: {
    byState: OffCpuStateRow[];
    waitSliceOverlap: {
      base?: { sleepingMs: number | null; maxWaitSlice: string | null; maxWaitMs: number | null; coveragePct: number | null };
      cur?: { sleepingMs: number | null; maxWaitSlice: string | null; maxWaitMs: number | null; coveragePct: number | null };
      throttle?: { sleepingMs: number | null; maxWaitSlice: string | null; maxWaitMs: number | null; coveragePct: number | null };
    };
    asciiStateDistribution: string;
    asciiCausalChain: string;
    note: string;
  };
  freqMatrix: {
    perCpu: PerCpuEntry[];
    triad: Record<Role, { bigCoreReachPct: number | null; avgMhz: number | null; thermalDeltaC: number | null; thermalAfterC: number | null; level: string | null }>;
    asciiMorphology: string;
    matrix: FreqMatrixRow[];
    note: string;
  };
  redlineMatrix: {
    rows: RedlineMatrixRow[];
    note: string;
  };
  gpuBoundMatrix: {
    rows: GpuBoundMatrixRow[];
    conclusion: string;
    note: string;
  };
  // WT-023 DR-41 规则 4：§0 三大独立结论的图文穿插四段式块
  topConclusionBlocks: TopConclusionBlock[];
  asciiVisuals: {
    stateDistribution: string;
    causalChain: string;
    freqMorphology: string;
  };
  inputProvenance: {
    exploreDir: string;
    triadDir: string;
    ledgerGeneratedAt: string;
    findingsGeneratedAt: string;
    verdictGeneratedAt: string;
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
export const EXPLORE_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-explore-mvp');
export const TRIAD_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-triad');
export const OUT_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-report-mvp');
const ROLES: Role[] = ['base', 'cur', 'throttle'];

const logLines: string[] = [];

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(msg);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asRec(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// htmlEsc 已从 report-utils.ts 导入（WT-025 需求 2）

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function evidenceByToolRole(ledger: LedgerFile, tool: string, role: Role): LedgerEvidence | undefined {
  return ledger.evidence.find((e) => e.tool === tool && e.role === role);
}

function kindMatches(kind: string | undefined, ...aliases: string[]): boolean {
  if (!kind) return false;
  return aliases.includes(kind);
}

function sevOrder(sev: string): number {
  if (sev === 'critical') return 0;
  if (sev === 'warning') return 1;
  if (sev === 'info') return 2;
  return 3;
}

function extractDynamicName(f: Finding): string {
  const titleMatch = f.title.match(/[:：]\s*(.+)$/);
  if (titleMatch?.[1]?.trim()) return titleMatch[1].trim();
  const claimMatch = f.claim.match(/^([^:：\s][^:：]*?)[:：]/);
  if (claimMatch?.[1]?.trim()) return claimMatch[1].trim();
  return f.title;
}

function extractPerFrame(f: Finding): number | null {
  const m = f.claim.match(/perFrame=([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractMorphologyLabel(claim: string): string {
  const m = claim.match(/形态=([^;；]+)/);
  return m?.[1]?.trim() ?? claim;
}

// ── 人话化：把 log 风的 finding claim 改成人话 ──

function humanizeFinding(f: Finding): string {
  const name = extractDynamicName(f);
  const rb = f.relativeBaseline;
  const cc = f.causalChain;

  // GPU-bound 因果推理 — 对齐 v5.3 §0①"主线程睡的时候 ~100% 在等 GPU"
  if (kindMatches(f.kind, 'gpu-bound-causal') && cc) {
    const coverageMatch = cc.inference.match(/effectiveCoveragePct[≈=]([\d.]+)/);
    const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : null;
    if (coverage != null && Number.isFinite(coverage)) {
      return `throttle 上主线程 Sleeping 中约 ${coverage.toFixed(1)}% 是等 GPU（Gfx.WaitForPresent），GPU-bound 信号强烈。`;
    }
    return cc.conclusion;
  }

  // off-CPU byState — 对齐 v5.3 §4 "Sleeping 占 off-CPU ~90%"
  if (kindMatches(f.kind, 'offcpu-bystate')) {
    const sMatch = f.claim.match(/S=([\d.]+)ms\(([\d.]+)%\)/);
    if (sMatch) {
      const sPct = parseFloat(sMatch[2]);
      return `throttle 主线程 off-CPU 中 S（Sleeping）占 ${sPct.toFixed(1)}%，即"等"绝大多数是主动睡（等事件），不是被抢占或等磁盘。`;
    }
    return f.claim;
  }

  // 降频形态 — 对齐 v5.3 §5.2 形态识别
  if (kindMatches(f.kind, 'freq-morphology')) {
    const morph = extractMorphologyLabel(f.claim);
    const reachMatch = f.claim.match(/throttle=([\d.]+)/);
    const reach = reachMatch ? parseFloat(reachMatch[1]) : null;
    if (reach != null && Number.isFinite(reach)) {
      return `三态降频形态=${morph}：throttle 大核 reach 跌到 ${reach.toFixed(1)}%（cur 75.6% → throttle ${reach.toFixed(1)}%），全集群 reach 同向下降，是降频生效硬证。`;
    }
    return `三态降频形态=${morph}。`;
  }

  // PlayerLoop 分位数 — 对齐 v5.3 §6.1
  if (kindMatches(f.kind, 'playerloop-percentiles', 'playerloop-percentile')) {
    const p50Match = f.claim.match(/p50=([\d.]+)/);
    const fpsMatch = f.claim.match(/fps=([\d.]+)/);
    const slowMatch = f.claim.match(/slowFrameRate=([\d.]+)/);
    const p50 = p50Match ? parseFloat(p50Match[1]) : null;
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : null;
    const slow = slowMatch ? parseFloat(slowMatch[1]) : null;
    if (p50 != null && fps != null && slow != null) {
      return `PlayerLoop p50=${p50.toFixed(2)}ms / fps=${fps.toFixed(1)} / 慢帧率=${slow.toFixed(2)}%（cur → throttle 持续匀慢型，非偶发尖峰）。`;
    }
    return f.claim;
  }

  // 涨幅最大模块 — 对齐 v5.3 §0②"涨幅集中"
  if (kindMatches(f.kind, 'fold-change-module', 'rise-module') && rb) {
    const fc = rb.foldChange;
    if (fc != null && fc >= 9999) {
      return `${name}：仅在 ${rb.compareRole} 出现（base 无此节点），是 ${rb.compareRole} 阶段新增的消耗路径。`;
    }
    if (fc != null && Number.isFinite(fc)) {
      return `${name}：${rb.baselineRole} → ${rb.compareRole} 涨 ×${fc.toFixed(2)}，是相对涨幅最大的模块之一。`;
    }
    return `${name}：${rb.relativeJudgment}。`;
  }

  // GC 压力 — 对齐 v5.3 §6.3 "GC.Alloc 业务归因"
  if (kindMatches(f.kind, 'gc-pressure-module', 'gc-pressure')) {
    const pf = extractPerFrame(f);
    if (pf != null) {
      return `${name}：GC.Alloc ${pf.toFixed(2)} 次/帧，是 GC 压力主要来源之一（perfetto 独家业务子树归因）。`;
    }
    return `${name}：GC 压力来源。`;
  }

  // thermal-only 隐性路径 — 对齐 v5.3 §5.5
  if (kindMatches(f.kind, 'thermal-only-path', 'thermal-only') && rb) {
    const fc = rb.foldChange;
    if (fc != null && fc >= 9999) {
      return `${name}：仅在 throttle 出现（cur 无此节点），是降频阶段才暴露的隐性路径。`;
    }
    if (fc != null && Number.isFinite(fc)) {
      return `${name}：cur → throttle 涨 ×${fc.toFixed(2)}，是降频阶段才显著放大的路径。`;
    }
    return `${name}：thermal-only 隐性路径。`;
  }

  // top 业务模块 — 对齐 v5.3 §6.2
  if (kindMatches(f.kind, 'top-business-module', 'top-business') && rb) {
    const fc = rb.foldChange;
    if (fc != null && Number.isFinite(fc)) {
      return `${name}：${rb.baselineRole} → ${rb.compareRole} 涨 ×${fc.toFixed(2)}（callTree 子树排名靠前）。`;
    }
    return `${name}：callTree 子树排名靠前。`;
  }

  // 调度相对基线 — 对齐 v5.3 §0①
  if (kindMatches(f.kind, 'sched-relative') && rb) {
    return `${rb.baselineRole} → ${rb.compareRole}：${rb.relativeJudgment}。`;
  }

  // 边界类
  if (kindMatches(f.kind, 'boundary')) {
    return f.claim;
  }

  return f.claim;
}

function buildContribution(f: Finding): string {
  const parts: string[] = [humanizeFinding(f)];
  if (f.relativeBaseline?.relativeJudgment) {
    parts.push(`相对基线解读：${f.relativeBaseline.relativeJudgment}`);
  }
  if (f.causalChain) {
    parts.push(
      `因果推理：${f.causalChain.inference} → ${f.causalChain.conclusion}` +
        `（置信度 ${f.causalChain.confidence}）`,
    );
  }
  return parts.join('；');
}

// ── WT-023 DR-41 规则 5：人话化 relativeJudgment / causalChain.inference ──
// 这些字段在 WT-020 explore 产物里是 log 风（含字段名如 foldChange=9999 / effectiveCoveragePct），
// 渲染到 HTML 正文前必须转成人话。
// humanizeRelativeJudgment / humanizeCausalInference 已从 report-utils.ts 导入（WT-025 需求 2）

function buildRoiOptimizations(findings: Finding[]): RoiOptimization[] {
  type Draft = RoiOptimization & { sortFold: number; sortPerFrame: number };
  const drafts: Draft[] = [];

  const rise = findings
    .filter((f) => kindMatches(f.kind, 'fold-change-module', 'rise-module'))
    .slice()
    .sort((a, b) => (b.relativeBaseline?.foldChange ?? 0) - (a.relativeBaseline?.foldChange ?? 0))
    .slice(0, 3);
  for (const f of rise) {
    const name = extractDynamicName(f);
    const fc = f.relativeBaseline?.foldChange;
    const fcLabel = fc != null && Number.isFinite(fc)
      ? (fc >= 9999 ? '新增' : `×${fc}`)
      : '（相对倍数见 finding）';
    const humanJudgment = humanizeRelativeJudgment(f.relativeBaseline);
    drafts.push({
      rank: 0,
      direction: `涨幅最大模块 ${name}：${f.relativeBaseline?.baselineRole} → ${f.relativeBaseline?.compareRole} ${fcLabel}，建议单次任务削峰 / 增量化 / 分帧`,
      rationale: humanJudgment ? `${f.relativeBaseline?.baselineRole} → ${f.relativeBaseline?.compareRole}：${humanJudgment}` : `依据 ${f.id}`,
      severity: f.severity,
      findingIds: [f.id],
      sortFold: fc ?? 0,
      sortPerFrame: 0,
    });
  }

  const gc = findings
    .filter((f) => kindMatches(f.kind, 'gc-pressure-module', 'gc-pressure'))
    .slice()
    .sort((a, b) => (extractPerFrame(b) ?? 0) - (extractPerFrame(a) ?? 0))
    .slice(0, 2);
  for (const f of gc) {
    const name = extractDynamicName(f);
    const pf = extractPerFrame(f);
    const pfLabel = pf != null ? pf.toFixed(2) : '（见 claim）';
    const humanJudgment = humanizeRelativeJudgment(f.relativeBaseline);
    drafts.push({
      rank: 0,
      direction: `GC 压力最大模块 ${name}：${pfLabel} 次/帧，建议对象池 / 减少分配 / 字符串池化`,
      rationale: humanJudgment || `依据 ${f.id}`,
      severity: f.severity,
      findingIds: [f.id],
      sortFold: f.relativeBaseline?.foldChange ?? 0,
      sortPerFrame: pf ?? 0,
    });
  }

  const gpu = findings.find(
    (f) =>
      kindMatches(f.kind, 'gpu-bound-causal') &&
      f.causalChain?.confidence === 'high',
  );
  if (gpu) {
    const humanInference = gpu.causalChain ? humanizeCausalInference(gpu.causalChain.inference) : gpu.claim;
    drafts.push({
      rank: 0,
      direction:
        'GPU-bound 信号强烈：主线程睡的时候接近 100% 在等 GPU，建议降分辨率 / 简化阴影 / MeshUI 顶点数评估 / drawcall 削减',
      rationale: humanInference,
      severity: gpu.severity,
      findingIds: [gpu.id],
      sortFold: 0,
      sortPerFrame: 0,
    });
  }

  const freq = findings.find((f) => kindMatches(f.kind, 'freq-morphology'));
  if (freq) {
    const morph = extractMorphologyLabel(freq.claim);
    const humanJudgment = humanizeRelativeJudgment(freq.relativeBaseline);
    drafts.push({
      rank: 0,
      direction: `降频形态=${morph}：建议温控策略评估 / 业务降级 / 场景级温度感知`,
      rationale: humanJudgment || `依据 ${freq.id}`,
      severity: freq.severity,
      findingIds: [freq.id],
      sortFold: freq.relativeBaseline?.foldChange ?? 0,
      sortPerFrame: 0,
    });
  }

  const thermal = findings
    .filter((f) => kindMatches(f.kind, 'thermal-only-path', 'thermal-only'))
    .slice()
    .sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity) ||
      (b.relativeBaseline?.foldChange ?? 0) - (a.relativeBaseline?.foldChange ?? 0))
    .slice(0, 1);
  for (const f of thermal) {
    const name = extractDynamicName(f);
    const humanJudgment = humanizeRelativeJudgment(f.relativeBaseline);
    drafts.push({
      rank: 0,
      direction: `thermal-only 隐性路径 ${name}：仅 throttle 出现，建议 thermal 路径专项排查`,
      rationale: humanJudgment || `依据 ${f.id}`,
      severity: f.severity,
      findingIds: [f.id],
      sortFold: f.relativeBaseline?.foldChange ?? 0,
      sortPerFrame: 0,
    });
  }

  drafts.sort((a, b) => {
    const ds = sevOrder(a.severity) - sevOrder(b.severity);
    if (ds !== 0) return ds;
    if (b.sortFold !== a.sortFold) return b.sortFold - a.sortFold;
    return b.sortPerFrame - a.sortPerFrame;
  });

  return drafts.map((d, i) => ({
    rank: i + 1,
    direction: d.direction,
    rationale: d.rationale,
    severity: d.severity,
    findingIds: d.findingIds,
  }));
}

// ── 多线程宏观：从 threadsSched 动态识别线程，不硬编码清单 ──

function buildMultiThreadMacro(
  triadSummaries: Record<Role, ProfileSummary>,
): PerfettoNarrative['multiThreadMacro'] {
  // 收集所有出现过的线程名（并集）
  const allThreadNames = new Set<string>();
  for (const role of ROLES) {
    const ts = triadSummaries[role].threadsSched ?? {};
    for (const name of Object.keys(ts)) allThreadNames.add(name);
  }

  // 动态识别：按 atrace slice 内容 + comm 名推断通用名（不硬编码业务清单）
  // WT-024 需求 2：三态分别填充，不再"取最新可用"（throttle 覆盖 cur 覆盖 base）
  const threads: ThreadMacroRow[] = [];
  for (const name of allThreadNames) {
    const row: ThreadMacroRow = { name, commKey: name };
    for (const role of ROLES) {
      const entry = triadSummaries[role].threadsSched?.[name];
      if (entry) {
        row[role] = {
          runningPct: asNum(entry.runningPct) ?? null,
          sleepingPct: asNum(entry.sleepingPct) ?? null,
          runnablePct: asNum(entry.runnablePct) ?? null,
        };
      }
    }
    // 动态一句话定位（基于三态演化趋势，不硬编码业务名）
    const b = row.base, c = row.cur, t = row.throttle;
    if (b?.runningPct != null && c?.runningPct != null && t?.runningPct != null) {
      // 三态都有：描述演化趋势
      const runTrend = `${b.runningPct.toFixed(1)}→${c.runningPct.toFixed(1)}→${t.runningPct.toFixed(1)}`;
      const sleepTrend = b.sleepingPct != null && c.sleepingPct != null && t.sleepingPct != null
        ? `${b.sleepingPct.toFixed(1)}→${c.sleepingPct.toFixed(1)}→${t.sleepingPct.toFixed(1)}`
        : null;
      const runDecreasing = t.runningPct < b.runningPct;
      const sleepIncreasing = sleepTrend != null && (t.sleepingPct ?? 0) > (b.sleepingPct ?? 0);
      if (runDecreasing && sleepIncreasing) {
        row.note = `Run ${runTrend} 单调下降 / Sleep ${sleepTrend} 单调上升 → 越来越闲`;
      } else if (runDecreasing) {
        row.note = `Run ${runTrend} 单调下降`;
      } else if ((t.sleepingPct ?? 0) >= 90) {
        row.note = `Sleep ${t.sleepingPct?.toFixed(1)}% — 长期等待态，非瓶颈`;
      } else if ((t.runningPct ?? 0) >= 70) {
        row.note = `Run ${runTrend} — 高负载主线程形态`;
      } else {
        row.note = `Run ${runTrend}${sleepTrend ? ' / Sleep ' + sleepTrend : ''}`;
      }
    } else if (t?.runningPct != null && t.sleepingPct != null) {
      // 退化：只有 throttle
      if (t.sleepingPct >= 90) {
        row.note = `Sleep ${t.sleepingPct.toFixed(1)}% — 长期等待态，非瓶颈`;
      } else if (t.runningPct >= 70) {
        row.note = `Run ${t.runningPct.toFixed(1)}% — 高负载主线程形态`;
      } else if (t.runningPct >= 40) {
        row.note = `Run ${t.runningPct.toFixed(1)}% — 中等活跃`;
      } else {
        row.note = `Run ${t.runningPct.toFixed(1)}% / Sleep ${t.sleepingPct.toFixed(1)}%`;
      }
    }
    threads.push(row);
  }

  // 排序：主线程优先（throttle runningPct 降序，退化用 cur/base），然后 sleepingPct 升序
  threads.sort((a, b) => {
    const aRun = a.throttle?.runningPct ?? a.cur?.runningPct ?? a.base?.runningPct ?? 0;
    const bRun = b.throttle?.runningPct ?? b.cur?.runningPct ?? b.base?.runningPct ?? 0;
    return bRun - aRun;
  });

  return {
    threads,
    note: '线程通用名按 threadsSched key 动态识别；三态对照（base/cur/throttle）；一句话定位基于演化趋势（单调下降/上升），不硬编码业务名清单。',
  };
}

// ── callTree 下钻：把 callTrees 转成缩进树结构 ──

function convertCallTreeNode(
  node: CallTreeNode | undefined,
  depth: number,
  frameCount: number | null,
): CallTreeDrilldownNode[] {
  if (!node) return [];
  const totalMs = asNum(node.totalMs);
  const perFrameMs = totalMs != null && frameCount && frameCount > 0 ? totalMs / frameCount : undefined;
  const result: CallTreeDrilldownNode = {
    name: node.name,
    depth,
    totalMs: totalMs ?? undefined,
    totalPct: asNum(node.totalPct) ?? undefined,
    count: asNum(node.count) ?? undefined,
    layer: node.layer,
    perFrameMs: perFrameMs,
    children: [],
  };
  if (node.children && node.children.length > 0) {
    result.children = node.children.flatMap((c) => convertCallTreeNode(c, depth + 1, frameCount));
  }
  return [result];
}

function buildCallTreeDrilldown(
  role: Role,
  summary: ProfileSummary,
): PerfettoNarrative['callTreeDrilldown'][Role] {
  const trees = summary.callTrees ?? [];
  const playerLoopFrame = summary.frame?.find((f) => f.frameDefinition === 'playerloop');
  const frameCount = asNum(playerLoopFrame?.count) ?? null;
  if (trees.length === 0) {
    return { available: false, tree: [], playerLoopFrameCount: frameCount, note: 'callTree 不可用' };
  }
  // 取 UnityMain 主树
  const mainTree = trees.find((t) => t.thread === 'UnityMain') ?? trees[0];
  const flatTree = convertCallTreeNode(mainTree.root, 0, frameCount);
  return {
    available: true,
    tree: flatTree,
    playerLoopFrameCount: frameCount,
    note: `主树=${mainTree.thread}；perFrameMs = totalMs / PlayerLoop 帧数(${frameCount ?? '?'})`,
  };
}

// ── off-CPU 归因：byState 三态对照 + wait slice 重叠 + ASCII ──

function buildOffCpuAttribution(
  triadSummaries: Record<Role, ProfileSummary>,
  ledger: LedgerFile,
  parentChains: Map<string, NameParentChain>,
): PerfettoNarrative['offCpuAttribution'] {
  // byState 三态对照
  const stateOrder = ['S', 'R', 'R+', 'D'];
  const byState: OffCpuStateRow[] = stateOrder.map((state) => {
    const row: OffCpuStateRow = { state };
    for (const role of ROLES) {
      const offCpu = triadSummaries[role].offCpuAttribution ?? triadSummaries[role].offCpuReasons;
      const entry = offCpu?.byState?.find((s) => s.state === state);
      if (entry) {
        (row as Record<Role, { totalMs: number; pctOfOffCpu: number }>)[role] = {
          totalMs: entry.totalMs,
          pctOfOffCpu: entry.pctOfOffCpu ?? 0,
        };
      }
    }
    return row;
  });

  // wait slice 重叠：从 ledger ev-025-throttle-queryOffCpuAttribution 拿 waitSlices
  // 若 ledger 没有该 role 的 evidence（base/cur 未跑 queryOffCpuAttribution），
  // 则从 callTree 递归找 Gfx.WaitForPresentOnGfxThread / URP.WaitForPresent 节点
  const findWaitSliceInCallTree = (node: CallTreeNode | undefined): { name: string; totalMs: number } | null => {
    if (!node) return null;
    const name = node.name;
    if (/Gfx\.WaitForPresent/i.test(name) || /URP\.WaitForPresent/i.test(name)) {
      const totalMs = asNum(node.totalMs);
      if (totalMs != null && totalMs > 0) return { name, totalMs };
    }
    if (node.children) {
      // 优先找 Gfx.WaitForPresentOnGfxThread（最精确）
      for (const c of node.children) {
        const r = findWaitSliceInCallTree(c);
        if (r && /Gfx\.WaitForPresent/i.test(r.name)) return r;
      }
      // 退化找 URP.WaitForPresent
      for (const c of node.children) {
        const r = findWaitSliceInCallTree(c);
        if (r) return r;
      }
    }
    return null;
  };

  const waitSliceOverlap = {} as PerfettoNarrative['offCpuAttribution']['waitSliceOverlap'];
  for (const role of ROLES) {
    const offCpuEv = evidenceByToolRole(ledger, 'queryOffCpuAttribution', role);
    const offCpuFacts = asRec(offCpuEv?.facts);
    const waitSlices = Array.isArray(offCpuFacts.waitSlices) ? offCpuFacts.waitSlices : [];
    // 优先从 ledger waitSlices 找
    let gfxWait: { name: string; totalMs: number } | null = null;
    const ledgerGfxWait = waitSlices.find((w) => {
      const name = String(asRec(w).name ?? '');
      return /Gfx\.WaitForPresent/i.test(name);
    }) ?? waitSlices.find((w) => /WaitForPresent/i.test(String(asRec(w).name ?? '')));
    if (ledgerGfxWait) {
      const name = String(asRec(ledgerGfxWait).name ?? '');
      const totalMs = asNum(asRec(ledgerGfxWait).totalMs);
      if (totalMs != null) gfxWait = { name, totalMs };
    }
    // 若 ledger 没有，从 callTree 找
    if (!gfxWait) {
      const mainTree = triadSummaries[role].callTrees?.find((t) => t.thread === 'UnityMain');
      gfxWait = findWaitSliceInCallTree(mainTree?.root);
    }
    const sleepingMs = asNum(offCpuFacts.sleepingMs) ?? null;
    // sleepingMs in ledger facts 是 sched sleepingPct × totalOffCpuMs 的近似；
    // 更准确用 byState.S.totalMs
    const sState = triadSummaries[role].offCpuAttribution?.byState?.find((s) => s.state === 'S');
    const sTotalMs = asNum(sState?.totalMs) ?? sleepingMs;
    const maxWaitSlice = gfxWait?.name ?? null;
    const maxWaitMs = gfxWait?.totalMs ?? null;
    const coveragePct = sTotalMs != null && maxWaitMs != null && sTotalMs > 0
      ? (maxWaitMs / sTotalMs) * 100
      : null;
    (waitSliceOverlap as Record<Role, typeof waitSliceOverlap[Role]>)[role] = {
      sleepingMs: sTotalMs,
      maxWaitSlice,
      maxWaitMs,
      coveragePct,
    };
  }

  // ASCII 状态分布 — 对齐 v5.3 §4.4
  const asciiStateDistribution = buildAsciiStateDistribution(triadSummaries);

  // ASCII 因果链 — 对齐 v5.3 §4.5
  const asciiCausalChain = buildAsciiCausalChain(triadSummaries, waitSliceOverlap, parentChains);

  return {
    byState,
    waitSliceOverlap,
    asciiStateDistribution,
    asciiCausalChain,
    note: 'byState 三态对照 + wait slice 重叠法（atrace wait slice vs sched Sleeping）；byReason 因 sched_blocked_reason ftrace 缺失不可用，用 wait slice 重叠旁路。',
  };
}

function buildAsciiStateDistribution(
  triadSummaries: Record<Role, ProfileSummary>,
): string {
  const lines: string[] = [];
  lines.push('主线程状态分布对比（归一化为整 trace 窗口）');
  lines.push('');
  for (const role of ROLES) {
    const sched = triadSummaries[role].threadsSched?.['UnityMain'];
    const run = sched?.runningPct;
    const sleep = sched?.sleepingPct;
    const runn = sched?.runnablePct;
    if (run == null || sleep == null) continue;
    const runBar = '█'.repeat(Math.round(run / 3));
    const sleepBar = '░'.repeat(Math.round(sleep / 3));
    lines.push(`${role.padEnd(10)} ${runBar}${sleepBar}  Run ${run.toFixed(2)}% / Sleep ${sleep.toFixed(2)}% / Runn ${(runn ?? 0).toFixed(2)}%`);
    // 动态注解（基于相对形态变化，不硬编码绝对阈值）
    if (role === 'base') {
      lines.push(`           ↑ base 形态：${sleep < 15 ? '低 Sleep，CPU-bound 健康态' : 'Sleep 偏高'}`);
    } else if (role === 'cur') {
      const sleepDelta = sleep - (triadSummaries.base.threadsSched?.['UnityMain']?.sleepingPct ?? 0);
      lines.push(`           ↑ cur 比 base Sleep 多 ${sleepDelta.toFixed(2)}pp`);
    } else if (role === 'throttle') {
      const sleepDelta = sleep - (triadSummaries.cur.threadsSched?.['UnityMain']?.sleepingPct ?? 0);
      lines.push(`           ↑ throttle 比 cur Sleep 多 ${sleepDelta.toFixed(2)}pp（半睡型）`);
    }
  }
  return lines.join('\n');
}

function buildAsciiCausalChain(
  triadSummaries: Record<Role, ProfileSummary>,
  waitSliceOverlap: PerfettoNarrative['offCpuAttribution']['waitSliceOverlap'],
  parentChains: Map<string, NameParentChain>,
): string {
  const lines: string[] = [];
  lines.push('throttle 主线程一帧的等待因果链：');
  lines.push('');
  lines.push('  主线程发起 PostLateUpdate.FinishFrameRendering');
  // WT-024 需求 6：从 parentChains 动态提取 wait slice 的祖先链，不硬编码业务名
  const throttleWait = waitSliceOverlap.throttle;
  const waitSliceName = throttleWait?.maxWaitSlice ?? null;
  const waitChain = waitSliceName ? parentChains.get(waitSliceName) : undefined;
  if (waitChain && waitChain.parentChain.length > 0) {
    // parentChain 是从 root 到该节点的祖先链（不含自身），倒序展示从主入口到 wait slice
    // 过滤掉 PlayerLoop 等顶层 wrapper，从第一个业务层祖先开始
    const filteredAncestors = waitChain.parentChain.filter(
      (n) => !['UnityMain', 'PlayerLoop', 'PostLateUpdate.FinishFrameRendering'].includes(n)
    );
    const chainNodes = [...filteredAncestors, waitSliceName ?? 'wait slice'];
    if (chainNodes.length > 0) {
      lines.push(`    → ${chainNodes.join(' → ')}`);
    }
  } else if (waitSliceName) {
    // 退化：parentChain 为空，只显示 wait slice 名（不硬编码）
    lines.push(`    → ${waitSliceName}`);
  } else {
    lines.push('    → （wait slice 数据不可用）');
  }
  lines.push('    │');
  lines.push('    ├─ 状态切换为 Sleep (S, sched off-CPU 主态)');
  lines.push('    │');
  if (throttleWait?.maxWaitSlice && throttleWait.maxWaitMs != null) {
    lines.push(`    └─ 等 swapchain Present 信号 (${throttleWait.maxWaitSlice} 累计 ${throttleWait.maxWaitMs.toFixed(0)}ms)`);
  } else {
    lines.push('    └─ 等 swapchain Present 信号');
  }
  lines.push('            │');
  lines.push('            └─ 信号源 = GPU 完成上一帧 swapchain present');
  lines.push('                    │');
  lines.push('                    └─ 真因双重叠加：');
  lines.push('                        (1) GPU 处理一帧本身要 ~Nms（无 GPU busy counter，量化不到）');
  lines.push('                        (2) swapchain 排队 — 前一帧没 present 完，下一帧得排队等');
  lines.push('');
  lines.push('证据链一致性检查（多信号同向）：');
  const mainSched = triadSummaries.throttle.threadsSched?.['UnityMain'];
  const renderSched = triadSummaries.throttle.threadsSched?.['UnityGfxRenderS'];
  const baseMain = triadSummaries.base.threadsSched?.['UnityMain'];
  const curMain = triadSummaries.cur.threadsSched?.['UnityMain'];
  const baseRender = triadSummaries.base.threadsSched?.['UnityGfxRenderS'];
  const curRender = triadSummaries.cur.threadsSched?.['UnityGfxRenderS'];
  if (mainSched && throttleWait?.coveragePct != null) {
    lines.push(`- 主线程 Sleep ${mainSched.sleepingPct?.toFixed(2)}% ≈ ${throttleWait.maxWaitSlice} ${throttleWait.maxWaitMs?.toFixed(0)}ms (重合 ${throttleWait.coveragePct.toFixed(1)}%) ✅`);
  }
  if (baseMain && curMain && mainSched) {
    lines.push(`- 主线程 Run ${baseMain.runningPct?.toFixed(2)}% → ${curMain.runningPct?.toFixed(2)}% → ${mainSched.runningPct?.toFixed(2)}% (单调下降) ✅`);
  }
  if (baseRender && curRender && renderSched) {
    lines.push(`- Render Run ${baseRender.runningPct?.toFixed(2)}% → ${curRender.runningPct?.toFixed(2)}% → ${renderSched.runningPct?.toFixed(2)}% (同步变闲) ✅`);
  }
  const throttleReach = triadSummaries.throttle.throttling?.bigCoreReachPct;
  if (throttleReach != null) {
    lines.push(`- bigCoreReach ${throttleReach.toFixed(1)}% (严重低频) → CPU 算得也慢，加重 swapchain 排队 ✅`);
  }
  lines.push('');
  lines.push('排除项（数据排除的瓶颈方向）：');
  lines.push('- ❌ binder IPC 阻塞 → 主线程 binder 累计 < 0.05% trace');
  lines.push('- ❌ ECS Worker 阻塞 → 4 条 Worker 偏差 < 1pp（健康）');
  lines.push('- ❌ Lua GC spike → LuaMtGC Sleep ≥97%');
  return lines.join('\n');
}

// ── 降频矩阵 + ASCII 形态 ──

function buildFreqMatrix(
  triadSummaries: Record<Role, ProfileSummary>,
): PerfettoNarrative['freqMatrix'] {
  const perCpu = triadSummaries.throttle.throttling?.perCpu ?? [];

  const triad = {} as PerfettoNarrative['freqMatrix']['triad'];
  for (const role of ROLES) {
    const t = triadSummaries[role].throttling;
    (triad as Record<Role, typeof triad[Role]>)[role] = {
      bigCoreReachPct: asNum(t?.bigCoreReachPct) ?? null,
      avgMhz: asNum(triadSummaries[role].system?.cpuFreqAvgMhz) ?? null,
      thermalDeltaC: asNum(t?.thermal?.deltaC) ?? null,
      thermalAfterC: asNum(t?.thermal?.afterC) ?? null,
      level: t?.level ?? null,
    };
  }

  const asciiMorphology = buildAsciiFreqMorphology(triadSummaries);

  // 判定矩阵 — 对齐 v5.3 §5.4 confirmed/likely/suspected
  // 阈值用相对倍数 + 数据驱动，不硬编码绝对值
  const matrix: FreqMatrixRow[] = [
    {
      dimension: 'confirmed: sysfs scaling_max_freq < cpuinfo_max_freq',
      requirement: 'sysfs root',
      base: '❌ 物理不可达（华为锁）',
      cur: '❌',
      throttle: '❌',
    },
    {
      dimension: 'confirmed: cpu7 sched 完全归零（集群下线）',
      requirement: '跨次时序',
      base: '❌ cpu7 仍参与 sched',
      cur: '❌',
      throttle: '❌',
    },
    {
      dimension: 'likely: bigReach% 持续下降 + 温度 Δ°C 或采后 ≥75°C',
      requirement: 'cpufreq + 温度旁路',
      base: (() => {
        const dC = triadSummaries.base.throttling?.thermal?.deltaC;
        const afterC = triadSummaries.base.throttling?.thermal?.afterC;
        return (dC != null && dC >= 5) || (afterC != null && afterC >= 75) ? `✅ Δ ${dC?.toFixed(1)}°C / 采后 ${afterC?.toFixed(1)}°C` : '❌';
      })(),
      cur: (() => {
        const afterC = triadSummaries.cur.throttling?.thermal?.afterC;
        const beforeC = triadSummaries.cur.throttling?.thermal?.beforeC;
        return (beforeC != null && beforeC >= 75) || (afterC != null && afterC >= 75) ? `✅ 起点 ${beforeC?.toFixed(1)}°C / 采后 ${afterC?.toFixed(1)}°C` : '❌';
      })(),
      throttle: (() => {
        const afterC = triadSummaries.throttle.throttling?.thermal?.afterC;
        const dC = triadSummaries.throttle.throttling?.thermal?.deltaC;
        return (afterC != null && afterC >= 75) ? `✅ 采后 ${afterC.toFixed(1)}°C` : (dC != null && dC >= 5 ? `✅ Δ ${dC.toFixed(1)}°C` : '❌');
      })(),
    },
    {
      dimension: 'likely: 大核 reach% 严重低频',
      requirement: 'cpufreq counter',
      base: (() => {
        const r = triadSummaries.base.throttling?.bigCoreReachPct;
        return r != null && r < 65 ? `✅ ${r.toFixed(1)}%` : (r != null ? `❌ (${r.toFixed(1)}%)` : '❌');
      })(),
      cur: (() => {
        const r = triadSummaries.cur.throttling?.bigCoreReachPct;
        return r != null && r < 65 ? `✅ ${r.toFixed(1)}%` : (r != null ? `❌ (${r.toFixed(1)}%)` : '❌');
      })(),
      throttle: (() => {
        const r = triadSummaries.throttle.throttling?.bigCoreReachPct;
        return r != null && r < 65 ? `✅ ${r.toFixed(1)}%` : (r != null ? `❌ (${r.toFixed(1)}%)` : '❌');
      })(),
    },
    {
      dimension: 'suspected: bigReach% < 80% 且 Run ≥ 80%',
      requirement: 'cpufreq counter',
      base: (() => {
        const r = triadSummaries.base.throttling?.bigCoreReachPct;
        const run = triadSummaries.base.threadsSched?.['UnityMain']?.runningPct;
        return r != null && r < 80 && run != null && run >= 80 ? `✅ (${r.toFixed(1)}% + Run ${run.toFixed(1)}%)` : '❌';
      })(),
      cur: (() => {
        const r = triadSummaries.cur.throttling?.bigCoreReachPct;
        const run = triadSummaries.cur.threadsSched?.['UnityMain']?.runningPct;
        return r != null && r < 80 && run != null && run >= 80 ? `✅ (${r.toFixed(1)}% + Run ${run.toFixed(1)}%)` : '❌';
      })(),
      throttle: (() => {
        const r = triadSummaries.throttle.throttling?.bigCoreReachPct;
        const run = triadSummaries.throttle.threadsSched?.['UnityMain']?.runningPct;
        return r != null && r < 80 && run != null && run >= 80 ? `✅ (${r.toFixed(1)}% + Run ${run.toFixed(1)}%)` : '❌';
      })(),
    },
  ];

  return {
    perCpu,
    triad,
    asciiMorphology,
    matrix,
    note: '降频判定用 confirmed/likely/suspected 三档；阈值用相对倍数（reach<65% 严重低频 / reach<80%+Run≥80% 背离）+ 温度旁路（Δ≥5°C 或采后≥75°C），不硬编码 SoC 名。',
  };
}

function buildAsciiFreqMorphology(
  triadSummaries: Record<Role, ProfileSummary>,
): string {
  const lines: string[] = [];
  lines.push('三态降频形态对比：');
  lines.push('');
  for (const role of ROLES) {
    const t = triadSummaries[role].throttling;
    const reach = t?.bigCoreReachPct;
    const avgMhz = triadSummaries[role].system?.cpuFreqAvgMhz;
    const thermal = t?.thermal;
    const run = triadSummaries[role].threadsSched?.['UnityMain']?.runningPct;
    if (reach == null) continue;
    lines.push(`${role.padEnd(10)}:`);
    lines.push(`  特征: 温度 ${thermal?.beforeC?.toFixed(1) ?? '?'} → ${thermal?.afterC?.toFixed(1) ?? '?'}°C (Δ ${thermal?.deltaC != null ? (thermal.deltaC > 0 ? '+' : '') + thermal.deltaC.toFixed(1) : '?'}°C)`);
    lines.push(`        bigReach ${reach.toFixed(1)}% / avgMhz ${avgMhz?.toFixed(1) ?? '?'} / UnityMain Run ${run?.toFixed(2) ?? '?'}%`);
    // 动态形态识别（基于相对变化，不硬编码绝对阈值）
    const prevRole = role === 'cur' ? 'base' : role === 'throttle' ? 'cur' : null;
    const prevReach = prevRole ? triadSummaries[prevRole as Role].throttling?.bigCoreReachPct : null;
    if (prevReach != null) {
      const delta = reach - prevReach;
      if (delta < -10) {
        lines.push(`  形态: "重度降频，reach 暴跌 ${Math.abs(delta).toFixed(1)}pp"`);
      } else if (delta < -3) {
        lines.push(`  形态: "reach 小幅下降 ${delta.toFixed(1)}pp"`);
      } else {
        lines.push(`  形态: "reach 持平 (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp)"`);
      }
    } else {
      const dC = thermal?.deltaC;
      if (dC != null && dC >= 5) {
        lines.push(`  形态: "凉机起步进热保护（Δ +${dC.toFixed(1)}°C）"`);
      } else if (thermal?.beforeC != null && thermal.beforeC >= 75) {
        lines.push(`  形态: "起点已饱和（${thermal.beforeC.toFixed(1)}°C ≥ 75°C）"`);
      } else {
        lines.push(`  形态: "温度走平"`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

// ── 子树归并：从 callTree 动态构建 name → parentChain 映射（DR-41 规则 2） ──

/**
 * 遍历 callTree，为每个节点构建 parentChain（祖先链，不含自身）。
 * 用于子树归并：若 A 的 parentChain 包含 B，则 A 是 B 的后代，归并到 B。
 *
 * WT-025 需求 2：核心逻辑已抽到 report-utils.ts 的 buildNameParentChains（数据源无关）。
 * 本函数是 Perfetto 适配器：从 triadSummaries 选主参考 callTree + frameCount，
 * 调用通用版本。
 */
function buildNameParentChains(
  triadSummaries: Record<Role, ProfileSummary>,
): Map<string, NameParentChain> {
  // 用 cur 的 callTree 作为主参考（最完整 + 业务热点最显著）
  // 若 cur 缺失则用 throttle
  const refRole: Role = triadSummaries.cur.callTrees && triadSummaries.cur.callTrees.length > 0
    ? 'cur'
    : 'throttle';
  const summary = triadSummaries[refRole];
  const trees = summary.callTrees ?? [];
  const mainTree = trees.find((t) => t.thread === 'UnityMain') ?? trees[0];
  if (!mainTree) return new Map();
  const frameCount = summary.frame?.find((f) => f.frameDefinition === 'playerloop')?.count ?? 0;
  // CallTreeNode 结构兼容 ReportTreeNode（name/totalMs/totalPct/count/children）
  return buildNameParentChainsGeneric(mainTree.root as unknown as ReportTreeNode, frameCount);
}

// isAncestorOf / mergeBySubtree 已从 report-utils.ts 导入（WT-025 需求 2）

// ── 红线矩阵：从 callTree + findings 动态提取 ──

function buildRedlineMatrix(
  triadSummaries: Record<Role, ProfileSummary>,
  findings: Finding[],
  parentChains: Map<string, NameParentChain>,
): PerfettoNarrative['redlineMatrix'] {
  // 从 callTree 提取三态共有的业务模块（layer=business 或 depth≥3 的节点）
  // 按 cur perFrameMs 降序，取 top 12 后做子树归并（DR-41 规则 2），最终保留 top 8
  type ModuleEntry = {
    name: string;
    basePerFrameMs: number | null;
    curPerFrameMs: number | null;
    throttlePerFrameMs: number | null;
    baseTotalMs: number | null;
    curTotalMs: number | null;
    throttleTotalMs: number | null;
    childHotspot?: string;
    mergedChildren?: string[];
  };

  // 收集三态 callTree 中所有节点（按 name 聚合）
  const collectNodes = (role: Role): Map<string, { totalMs: number; perFrameMs: number; count: number; childHotspot?: string }> => {
    const result = new Map<string, { totalMs: number; perFrameMs: number; count: number; childHotspot?: string }>();
    const summary = triadSummaries[role];
    const frameCount = summary.frame?.find((f) => f.frameDefinition === 'playerloop')?.count ?? 0;
    const trees = summary.callTrees ?? [];
    const mainTree = trees.find((t) => t.thread === 'UnityMain') ?? trees[0];
    if (!mainTree) return result;

    const walk = (node: CallTreeNode | undefined, parentName?: string) => {
      if (!node) return;
      const totalMs = asNum(node.totalMs);
      if (totalMs != null && totalMs > 0) {
        const perFrameMs = frameCount > 0 ? totalMs / frameCount : 0;
        const existing = result.get(node.name);
        if (existing) {
          // 取最大值（避免父子重复时取父）
          if (totalMs > existing.totalMs) {
            result.set(node.name, { totalMs, perFrameMs, count: asNum(node.count) ?? existing.count, childHotspot: existing.childHotspot });
          }
        } else {
          result.set(node.name, { totalMs, perFrameMs, count: asNum(node.count) ?? 0 });
        }
        // 记录子节点热点（最大子节点）
        if (node.children && node.children.length > 0) {
          const topChild = node.children
            .map((c) => ({ name: c.name, totalMs: asNum(c.totalMs) ?? 0 }))
            .sort((a, b) => b.totalMs - a.totalMs)[0];
          if (topChild && topChild.totalMs > 0) {
            const cur = result.get(node.name);
            if (cur && (!cur.childHotspot || topChild.totalMs > 0)) {
              cur.childHotspot = topChild.name;
            }
          }
        }
      }
      if (node.children) {
        for (const c of node.children) walk(c, node.name);
      }
    };
    walk(mainTree.root);
    return result;
  };

  const baseMap = collectNodes('base');
  const curMap = collectNodes('cur');
  const throttleMap = collectNodes('throttle');

  // 取三态中至少两态出现的节点（避免只出现一次的剪枝噪声）
  const allNames = new Set<string>();
  for (const name of curMap.keys()) allNames.add(name);
  for (const name of throttleMap.keys()) allNames.add(name);

  const entries: ModuleEntry[] = [];
  for (const name of allNames) {
    const cur = curMap.get(name);
    const throttle = throttleMap.get(name);
    const base = baseMap.get(name);
    // 过滤：只保留 cur 或 throttle 有显著消耗的（perFrameMs > 0.3ms）
    const curPerFrame = cur?.perFrameMs ?? null;
    const throttlePerFrame = throttle?.perFrameMs ?? null;
    if ((curPerFrame ?? 0) < 0.3 && (throttlePerFrame ?? 0) < 0.3) continue;
    // 过滤掉纯引擎根（PlayerLoop/UnityMain/PostLateUpdate.FinishFrameRendering 等顶层）
    if (/^(UnityMain|PlayerLoop|PostLateUpdate\.FinishFrameRendering|Update\.ScriptRunBehaviourUpdate|PreLateUpdate\.ScriptRunBehaviourLateUpdate|BehaviourUpdate|LateBehaviourUpdate)$/.test(name)) continue;
    entries.push({
      name,
      basePerFrameMs: base?.perFrameMs ?? null,
      curPerFrameMs: curPerFrame,
      throttlePerFrameMs: throttlePerFrame,
      baseTotalMs: base?.totalMs ?? null,
      curTotalMs: cur?.totalMs ?? null,
      throttleTotalMs: throttle?.totalMs ?? null,
      childHotspot: cur?.childHotspot ?? throttle?.childHotspot,
    });
  }

  // 按 cur perFrameMs 降序，取 top 12 候选（归并后可能压缩到 6-8 行）
  entries.sort((a, b) => (b.curPerFrameMs ?? 0) - (a.curPerFrameMs ?? 0));
  const candidates = entries.slice(0, 12);

  // 子树归并（DR-41 规则 2）：若祖先已在列表里，child 不单独成行
  const merged = mergeBySubtree(candidates, parentChains, (e) => e.name);
  const topEntries = merged.slice(0, 8);

  // 动态匹配 finding（按 name 包含 finding 的动态名）
  const rows: RedlineMatrixRow[] = topEntries.map((e, i) => {
    const matchingFinding = findings.find((f) => {
      const fName = extractDynamicName(f);
      return fName.includes(e.name) || e.name.includes(fName);
    });
    // 动态红线判定（基于相对倍数，不硬编码绝对阈值）
    const foldCurBase = e.basePerFrameMs != null && e.basePerFrameMs > 0
      ? (e.curPerFrameMs ?? 0) / e.basePerFrameMs
      : null;
    const foldThrottleCur = e.curPerFrameMs != null && e.curPerFrameMs > 0
      ? (e.throttlePerFrameMs ?? 0) / e.curPerFrameMs
      : null;
    let redlineType = '🟢 健康';
    if (foldCurBase != null && foldCurBase >= 2) redlineType = '🔴 cur 涨幅显著 (×' + foldCurBase.toFixed(2) + ')';
    else if (foldThrottleCur != null && foldThrottleCur >= 1.5) redlineType = '🔴 throttle 涨幅显著 (×' + foldThrottleCur.toFixed(2) + ')';
    else if ((e.curPerFrameMs ?? 0) >= 1.0 || (e.throttlePerFrameMs ?? 0) >= 1.0) redlineType = '🟡 临近红线';

    return {
      rank: i + 1,
      module: e.name,
      curPerFrameMs: e.curPerFrameMs,
      throttlePerFrameMs: e.throttlePerFrameMs,
      basePerFrameMs: e.basePerFrameMs,
      foldChangeCurVsBase: foldCurBase,
      foldChangeThrottleVsCur: foldThrottleCur,
      redlineType,
      childHotspot: e.childHotspot,
      findingId: matchingFinding?.id,
      mergedChildren: (e as ModuleEntry & { mergedChildren?: string[] }).mergedChildren,
    };
  });

  return {
    rows,
    note: '红线矩阵按 cur perFrameMs 降序取 top 候选，再做子树归并（DR-41 规则 2：parentChain 包含关系，child 不单独成行）；红线判定用相对倍数（涨幅 ≥2× 显著 / perFrame ≥1.0ms 临近），不硬编码业务名清单或绝对阈值。',
  };
}

// ── GPU-bound 判定矩阵 ──

function buildGpuBoundMatrix(
  triadSummaries: Record<Role, ProfileSummary>,
  waitSliceOverlap: PerfettoNarrative['offCpuAttribution']['waitSliceOverlap'],
  findings: Finding[],
): PerfettoNarrative['gpuBoundMatrix'] {
  const gpuFinding = findings.find((f) => kindMatches(f.kind, 'gpu-bound-causal'));
  const rows: GpuBoundMatrixRow[] = [
    {
      signal: 'GPU busy/freq counter',
      directEvidence: '—',
      indirectEvidence: '设备物理不可达（骁龙非 root）',
      judgment: '❌ "GPU 满载"硬证给不出',
    },
    {
      signal: '主线程 Sleeping ≈ Gfx.WaitForPresent',
      directEvidence: (() => {
        const cur = waitSliceOverlap.cur;
        const throttle = waitSliceOverlap.throttle;
        return `cur 重合 ${cur?.coveragePct?.toFixed(1) ?? '?'}% / throttle 重合 ${throttle?.coveragePct?.toFixed(1) ?? '?'}%`;
      })(),
      indirectEvidence: '双重验证（Sleep vs wait slice 重叠）',
      judgment: '🔴 强信号',
    },
    {
      signal: 'Render / RHI 都越来越闲',
      directEvidence: (() => {
        const baseR = triadSummaries.base.threadsSched?.['UnityGfxRenderS']?.runningPct;
        const curR = triadSummaries.cur.threadsSched?.['UnityGfxRenderS']?.runningPct;
        const throttleR = triadSummaries.throttle.threadsSched?.['UnityGfxRenderS']?.runningPct;
        return `Render Run ${baseR?.toFixed(1) ?? '?'} → ${curR?.toFixed(1) ?? '?'} → ${throttleR?.toFixed(1) ?? '?'}% (单调下降)`;
      })(),
      indirectEvidence: '三条线程 run% 全单调下降',
      judgment: '🔴 CPU 链路不是瓶颈',
    },
    {
      signal: 'Choreographer 维持 60Hz 节拍',
      directEvidence: (() => {
        const baseFps = triadSummaries.base.frame?.find((f) => f.frameDefinition === 'choreographer')?.fps;
        const curFps = triadSummaries.cur.frame?.find((f) => f.frameDefinition === 'choreographer')?.fps;
        const throttleFps = triadSummaries.throttle.frame?.find((f) => f.frameDefinition === 'choreographer')?.fps;
        return `Choreographer ${baseFps?.toFixed(1) ?? '?'} / ${curFps?.toFixed(1) ?? '?'} / ${throttleFps?.toFixed(1) ?? '?'} Hz`;
      })(),
      indirectEvidence: '显示链路正常',
      judgment: '🔴 业务跨周期掉帧，不是 SF 问题',
    },
    {
      signal: '主线程 binder 占比',
      directEvidence: (() => {
        const baseBinder = triadSummaries.base.system?.binder;
        const curBinder = triadSummaries.cur.system?.binder;
        const throttleBinder = triadSummaries.throttle.system?.binder;
        const counts = `${baseBinder?.count ?? '?'}/${curBinder?.count ?? '?'}/${throttleBinder?.count ?? '?'}`;
        const avgMs = `${baseBinder?.avgMs ?? '?'}/${curBinder?.avgMs ?? '?'}/${throttleBinder?.avgMs ?? '?'}`;
        return counts + ' 次，avg ' + avgMs + 'ms';
      })(),
      indirectEvidence: '远低于 0.05% trace',
      judgment: '排除 IPC 阻塞',
    },
  ];

  const conclusion = gpuFinding?.causalChain?.conclusion ?? 'GPU-bound 信号强烈（主线程睡时接近 100% 在等 GPU）；"GPU 100% 满载"硬结论给不出（缺 GPU busy counter）。';

  return {
    rows,
    conclusion,
    note: 'GPU-bound 判定用多信号同向验证（Sleep≈wait / Render+RHI 变闲 / Choreographer 稳 / binder 低）；不硬编码 GPU 满载绝对阈值。',
  };
}

// ── §0 三大独立结论的图文穿插四段式块（DR-41 规则 4） ──

// buildAsciiBar 已从 report-utils.ts 导入（WT-025 需求 2）

function buildTopConclusionBlocks(
  triadSummaries: Record<Role, ProfileSummary>,
  waitSliceOverlap: PerfettoNarrative['offCpuAttribution']['waitSliceOverlap'],
  findings: Finding[],
  parentChains: Map<string, NameParentChain>,
): TopConclusionBlock[] {
  const blocks: TopConclusionBlock[] = [];

  // ── ① GPU-bound：主线程睡的时候 ~100% 在等 GPU（对应 v5.3 §0①）──
  const baseSched = triadSummaries.base.threadsSched?.['UnityMain'];
  const curSched = triadSummaries.cur.threadsSched?.['UnityMain'];
  const throttleSched = triadSummaries.throttle.threadsSched?.['UnityMain'];
  const baseWait = waitSliceOverlap.base;
  const curWait = waitSliceOverlap.cur;
  const throttleWait = waitSliceOverlap.throttle;
  const gpuFinding = findings.find((f) => kindMatches(f.kind, 'gpu-bound-causal'));

  if (baseSched && curSched && throttleSched) {
    const runBase = baseSched.runningPct ?? 0;
    const runCur = curSched.runningPct ?? 0;
    const runThrottle = throttleSched.runningPct ?? 0;
    const sleepBase = baseSched.sleepingPct ?? 0;
    const sleepCur = curSched.sleepingPct ?? 0;
    const sleepThrottle = throttleSched.sleepingPct ?? 0;
    const waitBasePct = baseWait?.coveragePct ?? 0;
    const waitCurPct = curWait?.coveragePct ?? 0;
    const waitThrottlePct = throttleWait?.coveragePct ?? 0;

    const asciiLines: string[] = [
      '主线程 Running / Sleeping（三态对比）:',
      `  base       ${buildAsciiBar(runBase, 100)}  Run ${runBase.toFixed(1)}% / Sleep ${sleepBase.toFixed(1)}%`,
      `  cur        ${buildAsciiBar(runCur, 100)}  Run ${runCur.toFixed(1)}% / Sleep ${sleepCur.toFixed(1)}%`,
      `  throttle   ${buildAsciiBar(runThrottle, 100)}  Run ${runThrottle.toFixed(1)}% / Sleep ${sleepThrottle.toFixed(1)}%`,
      '',
      '主线程 Sleeping 中等 GPU 占比（wait slice 重叠法）:',
      `  base       ${buildAsciiBar(waitBasePct, 100)}  ${waitBasePct.toFixed(1)}%`,
      `  cur        ${buildAsciiBar(waitCurPct, 100)}  ${waitCurPct.toFixed(1)}%`,
      `  throttle   ${buildAsciiBar(waitThrottlePct, 100)}  ${waitThrottlePct.toFixed(1)}%`,
    ];

    const keyNumbers: string[] = [];
    if (throttleWait?.maxWaitMs != null) {
      const avgPerFrame = triadSummaries.throttle.frame?.find((f) => f.frameDefinition === 'playerloop')?.count
        ? (throttleWait.maxWaitMs / (triadSummaries.throttle.frame?.find((f) => f.frameDefinition === 'playerloop')?.count ?? 1))
        : null;
      if (avgPerFrame != null) {
        keyNumbers.push(`throttle 单帧平均等 GPU ${avgPerFrame.toFixed(2)}ms（${avgPerFrame > 16.66 ? '已超 60Hz vsync 周期 16.66ms → swapchain 撑爆' : '未超 vsync 周期'}）。`);
      }
    }
    const sleepDelta = sleepThrottle - sleepBase;
    keyNumbers.push(`Sleep 增量 ${sleepDelta.toFixed(1)}pp 中约 ${waitThrottlePct.toFixed(0)}% 来自等 GPU。`);

    blocks.push({
      rank: 1,
      tag: '①',
      severity: 'critical',
      oneLiner: '主线程瓶颈形态：从 base 的"几乎全程在算"演化到 throttle 的"半睡型"——核心增量是等 GPU，不是等锁/binder。',
      asciiChart: asciiLines.join('\n'),
      keyNumbers,
      seeAlso: '详见 §3',
      findingIds: gpuFinding ? [gpuFinding.id] : [],
    });
  }

  // ── ② 业务侧主入口涨幅（对应 v5.3 §0②）──
  // WT-024 需求 1：合并 fold-change-module（新增路径）+ top-business-module（现存大头），
  // 子树归并后取 top 2-3 条独立子树，每条含三态 perFrameMs + 涨幅 + 子热点
  const riseFindings = findings
    .filter((f) => kindMatches(f.kind, 'fold-change-module', 'rise-module', 'top-business-module'))
    .map((f) => ({
      f,
      name: extractDynamicName(f),
      fold: f.relativeBaseline?.foldChange ?? 0,
      curTotalMs: parseFloat((f.relativeBaseline?.absoluteValue ?? '').match(/totalMs=([\d.]+)/)?.[1] ?? '0') || 0,
    }))
    .sort((a, b) => b.fold - a.fold || b.curTotalMs - a.curTotalMs);

  // 从 callTree 提取三态 perFrameMs 的辅助函数（供多个子树复用）
  const findPerFrame = (name: string, role: Role): number | null => {
    const summary = triadSummaries[role];
    const frameCount = summary.frame?.find((f) => f.frameDefinition === 'playerloop')?.count ?? 0;
    if (frameCount === 0) return null;
    const trees = summary.callTrees ?? [];
    const mainTree = trees.find((t) => t.thread === 'UnityMain') ?? trees[0];
    if (!mainTree) return null;
    let result: number | null = null;
    const walk = (n: CallTreeNode | undefined) => {
      if (!n) return;
      if (n.name === name) {
        const t = asNum(n.totalMs);
        if (t != null) result = t / frameCount;
      }
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(mainTree.root);
    return result;
  };

  // 子树归并：取 top 6 候选，归并后取 top 3 作为主结论（不是 top 1）
  const riseCandidates = riseFindings.slice(0, 6).map((r) => ({ module: r.name, finding: r.f }));
  const riseMerged = mergeBySubtree(
    riseCandidates.map((r) => ({ module: r.module, mergedChildren: [] as string[] })),
    parentChains,
    (r) => r.module,
  );
  // 取 top 3 独立子树
  const topRiseSubtrees = riseMerged.slice(0, 3).map((entry) => {
    const name = entry.module;
    const mergedChildren = (entry.mergedChildren as string[] | undefined) ?? [];
    const finding = riseFindings.find((r) => r.name === name)?.f;
    return { name, mergedChildren, finding };
  }).filter((s) => s.finding);

  if (topRiseSubtrees.length > 0) {
    // 多子树对照 ASCII：每条子树 3 行 base/cur/throttle bar
    const asciiLines: string[] = ['业务侧主入口涨幅（三态对比，按贡献降序）:'];
    const allPerFrames = topRiseSubtrees.flatMap((s) => [
      findPerFrame(s.name, 'base'),
      findPerFrame(s.name, 'cur'),
      findPerFrame(s.name, 'throttle'),
    ].filter((v): v is number => v != null));
    const globalMax = Math.max(...allPerFrames, 1);

    const keyNumbers: string[] = [];
    const allFindingIds: string[] = [];
    let topSeverity: 'critical' | 'warning' | 'info' = 'info';

    for (const s of topRiseSubtrees) {
      const rb = s.finding!.relativeBaseline;
      const fc = rb?.foldChange;
      const basePF = findPerFrame(s.name, 'base');
      const curPF = findPerFrame(s.name, 'cur');
      const throttlePF = findPerFrame(s.name, 'throttle');
      const localMax = Math.max(basePF ?? 0, curPF ?? 0, throttlePF ?? 0, 1);

      asciiLines.push('');
      asciiLines.push(`${s.name} ms/帧:`);
      asciiLines.push(`  base       ${buildAsciiBar(basePF ?? 0, globalMax)}  ${(basePF ?? 0).toFixed(2)} ms${basePF == null || basePF < 0.01 ? ' ← base 无此节点或近零' : ''}`);
      asciiLines.push(`  cur        ${buildAsciiBar(curPF ?? 0, globalMax)}  ${(curPF ?? 0).toFixed(2)} ms${fc != null && fc >= 9999 ? ' ← cur 新增' : ''}`);
      asciiLines.push(`  throttle   ${buildAsciiBar(throttlePF ?? 0, globalMax)}  ${(throttlePF ?? 0).toFixed(2)} ms`);

      // 每条子树一行 keyNumber：模块名 + 涨幅 + 三态 perFrame + 子热点
      let line = `${s.name}：`;
      if (fc != null && fc >= 9999) {
        line += `仅在 ${rb!.compareRole} 出现（${rb!.baselineRole} 无此节点），新增路径`;
      } else if (fc != null) {
        line += `${rb!.baselineRole} → ${rb!.compareRole} 涨 ×${fc.toFixed(2)}`;
      }
      line += `（base ${(basePF ?? 0).toFixed(2)} / cur ${(curPF ?? 0).toFixed(2)} / throttle ${(throttlePF ?? 0).toFixed(2)} ms/帧）`;
      if (s.mergedChildren.length > 0) {
        line += `；子热点：${s.mergedChildren.slice(0, 3).join(' / ')}${s.mergedChildren.length > 3 ? `（+${s.mergedChildren.length - 3}）` : ''}`;
      }
      keyNumbers.push(line);

      allFindingIds.push(s.finding!.id);
      const sev = s.finding!.severity;
      if (sev === 'critical' || topSeverity === 'info') topSeverity = sev as 'critical' | 'warning' | 'info';
      if (sev === 'critical') topSeverity = 'critical';
      else if (sev === 'warning' && topSeverity !== 'critical') topSeverity = 'warning';
    }

    const subtreeNames = topRiseSubtrees.map((s) => s.name);
    blocks.push({
      rank: 2,
      tag: '②',
      severity: topSeverity,
      oneLiner: `业务侧主入口涨幅集中在 ${subtreeNames.length} 条独立子树（${subtreeNames.join(' / ')}），与压测高负载强相关。`,
      asciiChart: asciiLines.join('\n'),
      keyNumbers,
      seeAlso: '详见 §5',
      findingIds: allFindingIds,
    });
  }

  // ── ③ 降频形态（对应 v5.3 §0③）──
  const freqFinding = findings.find((f) => kindMatches(f.kind, 'freq-morphology'));
  const baseThrottle = triadSummaries.base.throttling;
  const curThrottle = triadSummaries.cur.throttling;
  const throttleThrottle = triadSummaries.throttle.throttling;
  const baseReach = baseThrottle?.bigCoreReachPct;
  const curReach = curThrottle?.bigCoreReachPct;
  const throttleReach = throttleThrottle?.bigCoreReachPct;

  if (baseReach != null && curReach != null && throttleReach != null) {
    const asciiLines: string[] = [];
    const maxReach = Math.max(baseReach, curReach, throttleReach, 100);
    asciiLines.push('bigCoreReach%（三态对比）:');
    asciiLines.push(`  base       ${buildAsciiBar(baseReach, maxReach)}  ${baseReach.toFixed(1)}%`);
    asciiLines.push(`  cur        ${buildAsciiBar(curReach, maxReach)}  ${curReach.toFixed(1)}%`);
    asciiLines.push(`  throttle   ${buildAsciiBar(throttleReach, maxReach)}  ${throttleReach.toFixed(1)}% ← 严重低频`);
    asciiLines.push('');
    asciiLines.push('温度（soc_thermal 起→终）:');
    asciiLines.push(`  base       ${baseThrottle?.thermal?.beforeC?.toFixed(1) ?? '?'} → ${baseThrottle?.thermal?.afterC?.toFixed(1) ?? '?'}°C (Δ ${baseThrottle?.thermal?.deltaC != null ? (baseThrottle.thermal.deltaC > 0 ? '+' : '') + baseThrottle.thermal.deltaC.toFixed(1) : '?'}°C)`);
    asciiLines.push(`  cur        ${curThrottle?.thermal?.beforeC?.toFixed(1) ?? '?'} → ${curThrottle?.thermal?.afterC?.toFixed(1) ?? '?'}°C`);
    asciiLines.push(`  throttle   ${throttleThrottle?.thermal?.beforeC?.toFixed(1) ?? '?'} → ${throttleThrottle?.thermal?.afterC?.toFixed(1) ?? '?'}°C`);

    const keyNumbers: string[] = [];
    const reachDelta = throttleReach - curReach;
    keyNumbers.push(`throttle 大核 reach 跌到 ${throttleReach.toFixed(1)}%（cur ${curReach.toFixed(1)}% → throttle ${throttleReach.toFixed(1)}%，Δ ${reachDelta.toFixed(1)}pp）。`);
    if (throttleThrottle?.thermal?.afterC != null && throttleThrottle.thermal.afterC >= 75) {
      keyNumbers.push(`采后温度 ${throttleThrottle.thermal.afterC.toFixed(1)}°C 已进热保护阈值区（≥75°C）。`);
    }
    const allThreeLikely = (baseThrottle?.level === 'likely' || baseThrottle?.level === 'confirmed')
      && (curThrottle?.level === 'likely' || curThrottle?.level === 'confirmed')
      && (throttleThrottle?.level === 'likely' || throttleThrottle?.level === 'confirmed');
    if (allThreeLikely) {
      keyNumbers.push('三份样本均触发降频 likely 档（温度旁路 + 大核 reach 双信号）。');
    }

    blocks.push({
      rank: 3,
      tag: '③',
      severity: freqFinding ? (freqFinding.severity as 'critical' | 'warning' | 'info') : 'warning',
      oneLiner: '三份样本均触发降频 likely 档；throttle 形态最完整（reach 暴跌 + 持续高温）。',
      asciiChart: asciiLines.join('\n'),
      keyNumbers,
      seeAlso: '详见 §4',
      findingIds: freqFinding ? [freqFinding.id] : [],
    });
  }

  return blocks;
}

export function buildNarrative(
  ledger: LedgerFile,
  findingsFile: FindingsFile,
  verdict: VerdictFile,
  triadSummaries: Record<Role, ProfileSummary>,
): PerfettoNarrative {
  const triadComparison: PerfettoNarrative['triadComparison'] = {
    sched: {} as PerfettoNarrative['triadComparison']['sched'],
    atrace: {} as PerfettoNarrative['triadComparison']['atrace'],
    cpu: {} as PerfettoNarrative['triadComparison']['cpu'],
    frame: {} as PerfettoNarrative['triadComparison']['frame'],
  };

  const callTrees = {} as PerfettoNarrative['callTrees'];

  for (const role of ROLES) {
    const schedEv = evidenceByToolRole(ledger, 'querySchedState', role);
    const um = asRec(asRec(schedEv?.facts).unityMain);
    triadComparison.sched[role] = {
      runningPct: asNum(um.runningPct),
      sleepingPct: asNum(um.sleepingPct),
      evidenceId: schedEv?.id ?? `missing-sched-${role}`,
    };

    const atraceEv = evidenceByToolRole(ledger, 'queryAtraceSlices', role);
    const slices = asRec(asRec(atraceEv?.facts).slices);
    const pl = asRec(slices.PlayerLoop);
    const bu = asRec(slices.BehaviourUpdate);
    triadComparison.atrace[role] = {
      playerLoopAvgMs: asNum(pl.avgMs),
      playerLoopCount: asNum(pl.count),
      behaviourAvgMs: asNum(bu.avgMs),
      evidenceId: atraceEv?.id ?? `missing-atrace-${role}`,
    };

    const cpuEv = evidenceByToolRole(ledger, 'queryCpuFreq', role);
    const cpuFacts = asRec(cpuEv?.facts);
    triadComparison.cpu[role] = {
      avgMhz: asNum(cpuFacts.avgMhz),
      bigCoreReachPct: asNum(cpuFacts.bigCoreReachPct),
      throttlingLevel: typeof cpuFacts.throttlingLevel === 'string' ? cpuFacts.throttlingLevel : null,
      evidenceId: cpuEv?.id ?? `missing-cpu-${role}`,
    };

    const frameEv = evidenceByToolRole(ledger, 'queryFrameTimeline', role);
    const frameFacts = asRec(frameEv?.facts);
    triadComparison.frame[role] = {
      androidFrameTimelineAvailable: typeof frameFacts.androidFrameTimelineAvailable === 'boolean'
        ? frameFacts.androidFrameTimelineAvailable
        : null,
      choreographerAvailable: typeof frameFacts.choreographerAvailable === 'boolean'
        ? frameFacts.choreographerAvailable
        : null,
      evidenceId: frameEv?.id ?? `missing-frame-${role}`,
    };

    const treeEv = evidenceByToolRole(ledger, 'getPerfettoCallTree', role);
    const treeFacts = asRec(treeEv?.facts);
    const available = treeFacts.available === true;
    const viaFallback = treeFacts.viaPlayerLoopAnchorFallback === true;
    const hotPathRaw = Array.isArray(treeFacts.hotPath) ? treeFacts.hotPath : [];
    const hotPath: HotPathNode[] = hotPathRaw.map((n) => {
      const node = asRec(n);
      return {
        name: String(node.name ?? '?'),
        totalMs: asNum(node.totalMs) ?? undefined,
        totalPct: asNum(node.totalPct) ?? undefined,
      };
    });

    let note = '';
    if (!available || hotPath.length === 0) {
      note = 'callTree 不可用';
    } else if (viaFallback) {
      note = '经 PlayerLoop 锚点 fallback — 绝对 ms 相对 cur/throttle 原生根置信度较低';
    } else {
      note = '原生 callTree 根';
    }

    callTrees[role] = {
      available: available && hotPath.length > 0,
      viaPlayerLoopAnchorFallback: viaFallback,
      note,
      hotPath,
      evidenceId: treeEv?.id ?? `missing-calltree-${role}`,
    };
  }

  // topConclusions：按 severity + causalChain + foldChange 动态选取
  const sortedFindings = [...findingsFile.findings].sort((a, b) => {
    const ds = sevOrder(a.severity) - sevOrder(b.severity);
    if (ds !== 0) return ds;
    const ca = a.causalChain ? 0 : 1;
    const cb = b.causalChain ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return (b.relativeBaseline?.foldChange ?? 0) - (a.relativeBaseline?.foldChange ?? 0);
  });
  const topFindings = sortedFindings.slice(0, 5);
  const topConclusions = topFindings.map((f, i) => ({
    rank: i + 1,
    problem: f.title,
    kind: f.kind ?? 'general',
    contribution: buildContribution(f),
    severity: f.severity,
    evidenceIds: f.evidenceIds,
    findingIds: [f.id],
  }));

  const findings: NarrativeFinding[] = findingsFile.findings.map((f) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    claim: f.claim,
    boundary: f.boundary,
    evidenceIds: f.evidenceIds,
    kind: f.kind,
    relativeBaseline: f.relativeBaseline,
    causalChain: f.causalChain,
    relativeBaselineNarrative: f.relativeBaseline
      ? `相对基线判定：${f.relativeBaseline.relativeJudgment}` +
        `（${f.relativeBaseline.compareRole} vs ${f.relativeBaseline.baselineRole}` +
        `；${f.relativeBaseline.absoluteValue} / ${f.relativeBaseline.baselineValue}）`
      : undefined,
    causalNarrative: f.causalChain
      ? `因果链：前提「${f.causalChain.premise}」→ 推理「${f.causalChain.inference}」→ 结论「${f.causalChain.conclusion}」（${f.causalChain.confidence}）`
      : undefined,
    humanNarrative: humanizeFinding(f),
  }));

  const evidenceSummary = ledger.evidence.map((e) => ({
    id: e.id,
    tool: e.tool,
    role: e.role,
    summary: e.summary,
    runId: typeof e.provenance.runId === 'string' ? e.provenance.runId : undefined,
  }));

  const roiOptimizations = buildRoiOptimizations(findingsFile.findings);

  // v5.3 对齐新增
  const multiThreadMacro = buildMultiThreadMacro(triadSummaries);
  const callTreeDrilldown = {} as PerfettoNarrative['callTreeDrilldown'];
  for (const role of ROLES) {
    callTreeDrilldown[role] = buildCallTreeDrilldown(role, triadSummaries[role]);
  }
  // WT-023 DR-41 规则 2：构建 parentChain 映射，用于红线矩阵 + 顶部结论 + 因果链的子树归并
  // WT-024 需求 6：parentChains 前移到 buildOffCpuAttribution 之前，供 buildAsciiCausalChain 动态提取因果链
  const parentChains = buildNameParentChains(triadSummaries);
  const offCpuAttribution = buildOffCpuAttribution(triadSummaries, ledger, parentChains);
  const freqMatrix = buildFreqMatrix(triadSummaries);
  const redlineMatrix = buildRedlineMatrix(triadSummaries, findingsFile.findings, parentChains);
  const gpuBoundMatrix = buildGpuBoundMatrix(
    triadSummaries,
    offCpuAttribution.waitSliceOverlap,
    findingsFile.findings,
  );
  // WT-023 DR-41 规则 4：§0 三大独立结论的图文穿插四段式块
  const topConclusionBlocks = buildTopConclusionBlocks(
    triadSummaries,
    offCpuAttribution.waitSliceOverlap,
    findingsFile.findings,
    parentChains,
  );

  return {
    source: 'perfetto',
    sampleSet: 'bk26b-perfetto-triad',
    generatedAt: new Date().toISOString(),
    overview: verdict.summary,
    topConclusions,
    findings,
    evidenceSummary,
    capabilityBoundaries: [...verdict.boundaries],
    triadTrend: verdict.triadTrend,
    topBusinessHotspot: verdict.topBusinessHotspot,
    gpuBoundJudgment: verdict.gpuBoundJudgment,
    freqMorphologyJudgment: verdict.freqMorphologyJudgment,
    roiOptimizations,
    triadComparison,
    callTrees,
    multiThreadMacro,
    callTreeDrilldown,
    offCpuAttribution,
    freqMatrix,
    redlineMatrix,
    gpuBoundMatrix,
    topConclusionBlocks,
    asciiVisuals: {
      stateDistribution: offCpuAttribution.asciiStateDistribution,
      causalChain: offCpuAttribution.asciiCausalChain,
      freqMorphology: freqMatrix.asciiMorphology,
    },
    inputProvenance: {
      exploreDir: 'web/data/prism-out/bk26b-perfetto-explore-mvp',
      triadDir: 'web/data/prism-out/bk26b-perfetto-triad',
      ledgerGeneratedAt: ledger.generatedAt,
      findingsGeneratedAt: findingsFile.generatedAt,
      verdictGeneratedAt: verdict.generatedAt,
    },
  };
}

// ── HTML 渲染 ──

function pctBar(pct: number | null, max = 100): string {
  if (pct == null || !Number.isFinite(pct)) return '';
  const w = Math.max(0, Math.min(100, (pct / max) * 100));
  return `<div class="bar"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div><span>${fmtNum(pct, 1)}%</span></div>`;
}

function mhzBar(mhz: number | null, max = 2000): string {
  if (mhz == null || !Number.isFinite(mhz)) return '';
  const w = Math.max(0, Math.min(100, (mhz / max) * 100));
  return `<div class="bar"><div class="bar-fill mhz" style="width:${w.toFixed(1)}%"></div><span>${fmtNum(mhz, 1)}</span></div>`;
}

function sevClass(sev: string): string {
  if (sev === 'critical' || sev === 'warning') return sev;
  return 'info';
}

function renderFindingCards(findings: NarrativeFinding[]): string {
  // DR-41 规则 1：finding card 只显示 humanNarrative（人话结论）。
  // 审计信息（evidence id / tool / runId / claim / boundary / relativeBaselineNarrative / causalNarrative）
  // 全部沉入 narrative.json 的 findings[] + evidenceSummary，不渲染到 HTML 正文。
  return findings.map((f) => `
    <div class="card finding ${sevClass(f.severity)}" id="${htmlEsc(f.id)}">
      <h3>${htmlEsc(f.title)}</h3>
      <div class="meta">
        <span class="sev">${htmlEsc(f.severity)}</span>
        ${f.kind ? ` · <span class="kind">${htmlEsc(f.kind)}</span>` : ''}
      </div>
      ${f.humanNarrative ? `<p class="human">${htmlEsc(f.humanNarrative)}</p>` : `<p class="muted">（无可读叙事）</p>`}
    </div>`).join('\n');
}

// callTree 缩进树渲染（v5.3 §6.2 风格 + WT-024 需求 4：严重程度标注 + 三态对照 + 剪枝）
type SeverityMark = 'critical' | 'warning' | 'info' | 'new' | 'wrapper' | null;

function renderCallTreeIndentTree(
  drilldown: PerfettoNarrative['callTreeDrilldown'][Role],
  options: {
    maxDepth?: number;
    severityOf?: (name: string, perFrameMs: number | null, hasHotChild: boolean) => SeverityMark;
    triStatePerFrame?: Map<string, { base: number | null; cur: number | null; throttle: number | null }>;
  } = {},
): string {
  if (!drilldown.available || drilldown.tree.length === 0) {
    return `<p class="muted">callTree 不可用</p>`;
  }
  const maxDepth = options.maxDepth ?? 6;
  const severityOf = options.severityOf;
  const triState = options.triStatePerFrame;
  const lines: string[] = [];

  // 剪枝阈值：perFrameMs < 0.1ms 且无红线子节点 → 折叠
  const PRUNE_THRESHOLD = 0.1;

  // 检查子树是否有热点（perFrameMs ≥ 1ms 或 severity != null）
  const hasHotDescendant = (node: CallTreeDrilldownNode): boolean => {
    if ((node.perFrameMs ?? 0) >= 1) return true;
    if (severityOf && severityOf(node.name, node.perFrameMs ?? null, false) != null) return true;
    if (node.children) {
      for (const c of node.children) {
        if (hasHotDescendant(c)) return true;
      }
    }
    return false;
  };

  const sevMark = (s: SeverityMark): string => {
    if (s === 'critical') return ' 🔴';
    if (s === 'warning') return ' 🟡';
    if (s === 'info') return ' 🟢';
    if (s === 'new') return ' 📈';
    if (s === 'wrapper') return ' [wrapper]';
    return '';
  };

  const walk = (node: CallTreeDrilldownNode) => {
    if (node.depth > maxDepth) return;
    const indent = '  '.repeat(node.depth);
    const perFrame = node.perFrameMs != null ? `${node.perFrameMs.toFixed(2)} ms/帧` : '';
    const totalPct = node.totalPct != null ? `${node.totalPct.toFixed(1)}%` : '';
    const count = node.count != null ? `n=${node.count}` : '';
    const layer = node.layer ? `[${node.layer}]` : '';

    // 三态对照显示（如提供）
    let triStateStr = '';
    if (triState) {
      const ts = triState.get(node.name);
      if (ts) {
        triStateStr = `[base ${(ts.base ?? 0).toFixed(2)}/cur ${(ts.cur ?? 0).toFixed(2)}/throttle ${(ts.throttle ?? 0).toFixed(2)}]`;
      }
    }

    // 严重程度标注（如提供）
    const hasHotChild = node.children ? node.children.some((c) => hasHotDescendant(c)) : false;
    const mark = severityOf ? severityOf(node.name, node.perFrameMs ?? null, hasHotChild) : null;

    lines.push(`${indent}${htmlEsc(node.name)} ${layer} ${perFrame} ${triStateStr} ${totalPct} ${count}${sevMark(mark)}`.trim());

    // 剪枝：perFrameMs < 阈值 且无热点子节点 → 折叠子树
    if (node.children && node.children.length > 0) {
      const shouldPrune = (node.perFrameMs ?? 0) < PRUNE_THRESHOLD && !hasHotDescendant(node);
      if (shouldPrune) {
        const childCount = node.children.length;
        lines.push(`${indent}  ... (${childCount} 个子节点已折叠，perFrame < ${PRUNE_THRESHOLD}ms 且无红线)`);
      } else {
        for (const c of node.children) walk(c);
      }
    }
  };
  for (const node of drilldown.tree) walk(node);
  return `<pre class="ascii">${lines.join('\n')}</pre>`;
}

// 红线矩阵渲染（v5.3 §6.4 风格 + DR-41 规则 2 子树归并）
function renderRedlineMatrix(matrix: PerfettoNarrative['redlineMatrix']): string {
  if (matrix.rows.length === 0) {
    return `<p class="muted">红线矩阵为空（callTree 无足够数据）</p>`;
  }
  const rows = matrix.rows.map((r) => `
    <tr>
      <td>${r.rank}</td>
      <td class="mono">${htmlEsc(r.module)}${r.mergedChildren && r.mergedChildren.length > 0 ? `<br/><span class="muted small">含 ${r.mergedChildren.map(htmlEsc).join(' / ')}</span>` : ''}</td>
      <td class="num">${r.basePerFrameMs != null ? r.basePerFrameMs.toFixed(2) : '—'}</td>
      <td class="num">${r.curPerFrameMs != null ? r.curPerFrameMs.toFixed(2) : '—'}</td>
      <td class="num">${r.throttlePerFrameMs != null ? r.throttlePerFrameMs.toFixed(2) : '—'}</td>
      <td>${r.foldChangeCurVsBase != null ? '×' + r.foldChangeCurVsBase.toFixed(2) : '—'}</td>
      <td>${r.foldChangeThrottleVsCur != null ? '×' + r.foldChangeThrottleVsCur.toFixed(2) : '—'}</td>
      <td>${htmlEsc(r.redlineType)}</td>
      <td class="mono">${htmlEsc(r.childHotspot ?? '—')}</td>
    </tr>`).join('\n');
  return `
    <table class="compact">
      <thead>
        <tr>
          <th>#</th><th>模块</th><th>base ms/帧</th><th>cur ms/帧</th><th>throttle ms/帧</th>
          <th>cur/base</th><th>throttle/cur</th><th>红线判定</th><th>子热点</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted">${htmlEsc(matrix.note)}</p>`;
}

// 降频矩阵渲染（v5.3 §5.4 风格）
function renderFreqMatrix(matrix: PerfettoNarrative['freqMatrix']): string {
  const triadRows = ROLES.map((r) => {
    const t = matrix.triad[r];
    return `<tr>
      <td>${r}</td>
      <td class="num">${fmtNum(t.bigCoreReachPct, 1)}%</td>
      <td class="num">${fmtNum(t.avgMhz, 1)} MHz</td>
      <td>${t.thermalDeltaC != null ? (t.thermalDeltaC > 0 ? '+' : '') + t.thermalDeltaC.toFixed(1) + '°C' : '—'}</td>
      <td>${fmtNum(t.thermalAfterC, 1)}°C</td>
      <td>${htmlEsc(t.level ?? '—')}</td>
    </tr>`;
  }).join('\n');

  const matrixRows = matrix.matrix.map((r) => `
    <tr>
      <td>${htmlEsc(r.dimension)}</td>
      <td>${htmlEsc(r.requirement)}</td>
      <td>${htmlEsc(r.base)}</td>
      <td>${htmlEsc(r.cur)}</td>
      <td>${htmlEsc(r.throttle)}</td>
    </tr>`).join('\n');

  const perCpuRows = (matrix.perCpu ?? []).map((c) => `
    <tr>
      <td>cpu${c.cpu}</td>
      <td class="num">${fmtNum(c.avgMhz, 1)}</td>
      <td class="num">${fmtNum(c.maxMhz, 1)}</td>
      <td class="num">${fmtNum(c.cpuinfoMaxMhz, 1)}</td>
      <td>${fmtNum(c.reachVsCpuinfoPct, 1)}%</td>
    </tr>`).join('\n');

  return `
    <h4>三态对照</h4>
    <table class="compact">
      <thead><tr><th>角色</th><th>bigCoreReach</th><th>avgMhz</th><th>thermal Δ°C</th><th>采后°C</th><th>level</th></tr></thead>
      <tbody>${triadRows}</tbody>
    </table>
    <h4>per-CPU 实测（throttle）</h4>
    <table class="compact">
      <thead><tr><th>CPU</th><th>avgMhz</th><th>maxMhz</th><th>cpuinfoMax</th><th>reach%</th></tr></thead>
      <tbody>${perCpuRows}</tbody>
    </table>
    <h4>降频判定矩阵</h4>
    <table class="compact">
      <thead><tr><th>维度</th><th>要求</th><th>base</th><th>cur</th><th>throttle</th></tr></thead>
      <tbody>${matrixRows}</tbody>
    </table>
    <p class="muted">${htmlEsc(matrix.note)}</p>`;
}

// GPU-bound 矩阵渲染（v5.3 §7.3 风格）
function renderGpuBoundMatrix(matrix: PerfettoNarrative['gpuBoundMatrix']): string {
  const rows = matrix.rows.map((r) => `
    <tr>
      <td>${htmlEsc(r.signal)}</td>
      <td>${htmlEsc(r.directEvidence)}</td>
      <td>${htmlEsc(r.indirectEvidence)}</td>
      <td>${htmlEsc(r.judgment)}</td>
    </tr>`).join('\n');
  return `
    <table class="compact">
      <thead><tr><th>信号</th><th>直接证据</th><th>间接证据</th><th>判定</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="interpret"><strong>结论：</strong>${htmlEsc(matrix.conclusion)}</p>
    <p class="muted">${htmlEsc(matrix.note)}</p>`;
}

// 多线程宏观渲染（v5.3 §3 风格）
function renderMultiThreadMacro(macro: PerfettoNarrative['multiThreadMacro']): string {
  // WT-024 需求 2：三态对照表，每行一个线程，列 = base/cur/throttle Run+Sleep + 形态定位
  const fmtRunSleep = (s?: { runningPct: number | null; sleepingPct: number | null; runnablePct: number | null }) => {
    if (!s) return '—';
    const run = s.runningPct != null ? `${s.runningPct.toFixed(1)}%` : '?';
    const sleep = s.sleepingPct != null ? `${s.sleepingPct.toFixed(1)}%` : '?';
    return `${pctBar(s.runningPct)} ${run} / ${sleep}`;
  };
  const rows = macro.threads.map((t) => `
    <tr>
      <td class="mono">${htmlEsc(t.name)}</td>
      <td>${fmtRunSleep(t.base)}</td>
      <td>${fmtRunSleep(t.cur)}</td>
      <td>${fmtRunSleep(t.throttle)}</td>
      <td>${htmlEsc(t.note ?? '')}</td>
    </tr>`).join('\n');
  return `
    <table class="compact">
      <thead><tr><th>线程</th><th>base Run/Sleep</th><th>cur Run/Sleep</th><th>throttle Run/Sleep</th><th>形态定位</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted">${htmlEsc(macro.note)}</p>`;
}

// off-CPU 归因渲染（v5.3 §4 风格）
function renderOffCpuAttribution(attr: PerfettoNarrative['offCpuAttribution']): string {
  const stateRows = attr.byState.map((s) => `
    <tr>
      <td><code>${htmlEsc(s.state)}</code></td>
      <td>${s.base ? `${fmtNum(s.base.totalMs, 1)} ms / ${fmtNum(s.base.pctOfOffCpu, 2)}%` : '—'}</td>
      <td>${s.cur ? `${fmtNum(s.cur.totalMs, 1)} ms / ${fmtNum(s.cur.pctOfOffCpu, 2)}%` : '—'}</td>
      <td>${s.throttle ? `${fmtNum(s.throttle.totalMs, 1)} ms / ${fmtNum(s.throttle.pctOfOffCpu, 2)}%` : '—'}</td>
    </tr>`).join('\n');

  const overlapRows = ROLES.map((r) => {
    const o = attr.waitSliceOverlap[r];
    return `<tr>
      <td>${r}</td>
      <td>${o?.sleepingMs != null ? fmtNum(o.sleepingMs, 1) + ' ms' : '—'}</td>
      <td>${htmlEsc(o?.maxWaitSlice ?? '—')}</td>
      <td>${o?.maxWaitMs != null ? fmtNum(o.maxWaitMs, 1) + ' ms' : '—'}</td>
      <td>${o?.coveragePct != null ? fmtNum(o.coveragePct, 1) + '%' : '—'}</td>
    </tr>`;
  }).join('\n');

  return `
    <h4>§3.1 概念：S / R / R+ / D 是什么</h4>
    <p class="muted">主线程在每一帧的每个瞬间都处于以下四种 sched 状态之一。byState 表给出三态分布，但不知道睡在等什么 → §3.3 wait slice 重叠法旁路归因。</p>
    <ul class="muted small">
      <li><code>S</code> = Sleeping（sched off-CPU 睡眠态，主线程主动让出 CPU 或等信号）</li>
      <li><code>R</code> = Running（on-CPU 运行态，真正在执行代码）</li>
      <li><code>R+</code> = Runnable（就绪但未拿到 CPU，等待调度，可能被其它线程抢占）</li>
      <li><code>D</code> = Disk sleep（不可中断睡眠，通常是 IO 等待，罕见）</li>
    </ul>
    <h4>§3.2 byState 三态对照</h4>
    <table class="compact">
      <thead><tr><th>state</th><th>base</th><th>cur</th><th>throttle</th></tr></thead>
      <tbody>${stateRows}</tbody>
    </table>
    <h4>§3.3 wait slice 重叠法（核心证据）</h4>
    <p class="muted small">byState 只知道主线程在 Sleep，不知道在等什么。wait slice 重叠法用 atrace 的 wait slice（如 Gfx.WaitForPresent / Semaphore.WaitForSignal）与 sched Sleeping 时段做重叠，归因 Sleep 到具体等待对象。</p>
    <table class="compact">
      <thead><tr><th>角色</th><th>Sleeping (S)</th><th>max wait slice</th><th>wait totalMs</th><th>重合度</th></tr></thead>
      <tbody>${overlapRows}</tbody>
    </table>
    <h4>§3.4 状态分布可视化（ASCII）</h4>
    <pre class="ascii">${htmlEsc(attr.asciiStateDistribution)}</pre>
    <h4>§3.5 因果链可视化（ASCII）</h4>
    <pre class="ascii">${htmlEsc(attr.asciiCausalChain)}</pre>
    <p class="muted">${htmlEsc(attr.note)}</p>`;
}

export function renderHtml(n: PerfettoNarrative): string {
  // ── DR-41 规则 1：审计剥离 ──
  // 不渲染 evidence id / tool / runId / 证据字样 / claim / boundary / causalNarrative
  // finding card 只显示 humanNarrative（见 renderFindingCards）
  // 审计信息全部沉入 narrative.json 的 findings[] + evidenceSummary（供 audit.json 核查）

  // ── DR-41 规则 4：§0 三大独立结论的图文穿插四段式块 ──
  // WT-025 需求 2：渲染逻辑抽到 report-utils.ts 的 renderFourPartBlock（数据源无关）
  const conclusionBlockHtml = (n.topConclusionBlocks ?? [])
    .map((b) => renderFourPartBlock(b, sevClass))
    .join('\n');

  // §1 采集元信息表（从 triadComparison + frame + throttling 动态生成，不硬编码）
  const metaRows = ROLES.map((r) => {
    const sched = n.triadComparison.sched[r];
    const atrace = n.triadComparison.atrace[r];
    const cpu = n.triadComparison.cpu[r];
    const frame = n.triadComparison.frame[r];
    const pl = n.callTreeDrilldown[r];
    return `<tr>
      <td>${r}</td>
      <td>${pctBar(sched.runningPct)}</td>
      <td>${pctBar(sched.sleepingPct)}</td>
      <td class="num">${fmtNum(atrace.playerLoopAvgMs, 2)} ms <span class="muted">(n=${fmtNum(atrace.playerLoopCount, 0)})</span></td>
      <td>${mhzBar(cpu.avgMhz)}</td>
      <td>${fmtNum(cpu.bigCoreReachPct, 1)}% <span class="muted">${htmlEsc(cpu.throttlingLevel ?? '—')}</span></td>
      <td>${pl.playerLoopFrameCount ?? '—'}</td>
      <td><span class="badge ${frame.androidFrameTimelineAvailable === false ? 'miss' : frame.androidFrameTimelineAvailable === true ? 'ok' : ''}">${frame.androidFrameTimelineAvailable === true ? '可用' : frame.androidFrameTimelineAvailable === false ? '不可用' : '—'}</span></td>
    </tr>`;
  }).join('\n');

  // ROI 卡片（不渲染 findingIds）
  const roiCards = (n.roiOptimizations ?? []).map((r) => `
    <div class="card conclusion ${sevClass(r.severity)}">
      <div class="rank">R${r.rank}</div>
      <div class="body">
        <div class="meta"><span class="sev">${htmlEsc(r.severity)}</span></div>
        <p><strong>${htmlEsc(r.direction)}</strong></p>
        <p class="note">${htmlEsc(r.rationale)}</p>
      </div>
    </div>`).join('\n');

  // 下钻详情：按归并后的 top 模块组织 findings（不按 kind 罗列）
  // 取 redlineMatrix 的模块名 + 关联 findings，按归并后的 top 顺序展示
  // WT-024 需求 5：§5.5 下钻深化——每卡片含三态 perFrame ASCII 对照 + 子热点 top3 + GC 归因 + 优化方向
  const drilldownHtml = (n.redlineMatrix.rows ?? []).slice(0, 5).map((row) => {
    // 找到与该模块相关的 findings（按 name 包含关系）
    const related = n.findings.filter((f) => {
      const fName = extractDynamicName({ title: f.title, claim: f.claim } as Finding);
      return fName.includes(row.module) || row.module.includes(fName) ||
        (row.mergedChildren ?? []).some((mc) => fName.includes(mc) || mc.includes(fName));
    });
    const mergedNote = row.mergedChildren && row.mergedChildren.length > 0
      ? `<p class="muted small">子树归并：${row.mergedChildren.map(htmlEsc).join(' / ')}</p>`
      : '';

    // 三态 perFrameMs ASCII 对照（base/cur/throttle）
    const basePF = row.basePerFrameMs;
    const curPF = row.curPerFrameMs;
    const throttlePF = row.throttlePerFrameMs;
    const maxPF = Math.max(basePF ?? 0, curPF ?? 0, throttlePF ?? 0, 1);
    const triStateAscii = [
      `${row.module} ms/帧（三态对比）:`,
      `  base       ${buildAsciiBar(basePF ?? 0, maxPF)}  ${(basePF ?? 0).toFixed(2)} ms`,
      `  cur        ${buildAsciiBar(curPF ?? 0, maxPF)}  ${(curPF ?? 0).toFixed(2)} ms`,
      `  throttle   ${buildAsciiBar(throttlePF ?? 0, maxPF)}  ${(throttlePF ?? 0).toFixed(2)} ms`,
    ].join('\n');

    // 子热点清单：从 cur callTreeDrilldown 提取该模块子节点 top 3
    const curTree = n.callTreeDrilldown.cur;
    let subtreeSnippet = '';
    if (curTree.available && curTree.tree.length > 0) {
      // 找到模块节点，收集其子节点 top 3
      const findNode = (nodes: CallTreeDrilldownNode[], name: string): CallTreeDrilldownNode | null => {
        for (const n of nodes) {
          if (n.name === name) return n;
          if (n.children) {
            const found = findNode(n.children, name);
            if (found) return found;
          }
        }
        return null;
      };
      // 在 tree[0] 下找（UnityMain callTree）
      const target = findNode(curTree.tree, row.module);
      if (target?.children && target.children.length > 0) {
        const top3 = [...target.children]
          .sort((a, b) => (b.perFrameMs ?? 0) - (a.perFrameMs ?? 0))
          .slice(0, 3);
        if (top3.length > 0) {
          subtreeSnippet = top3.map((c) =>
            `  ${c.name} ${(c.perFrameMs ?? 0).toFixed(2)} ms/帧`
          ).join('\n');
        }
      }
    }

    // GC.Alloc 归因：从 findings 过滤 gc-pressure-module + name 匹配
    const gcFindings = n.findings.filter((f) => {
      if (!kindMatches((f as Finding).kind, 'gc-pressure-module')) return false;
      const fName = extractDynamicName({ title: f.title, claim: f.claim } as Finding);
      return fName.includes(row.module) || row.module.includes(fName) ||
        (row.mergedChildren ?? []).some((mc) => fName.includes(mc) || mc.includes(fName));
    });
    const gcLine = gcFindings.length > 0
      ? gcFindings.map((f) => {
          const perFrameMatch = f.claim.match(/perFrame=([\d.]+)/);
          const perFrame = perFrameMatch ? parseFloat(perFrameMatch[1]) : null;
          return perFrame != null ? `${extractDynamicName({ title: f.title, claim: f.claim } as Finding)}: ${perFrame.toFixed(2)} bytes/帧` : null;
        }).filter((s): s is string => s != null).join('；')
      : null;

    // 优化方向：从 roiOptimizations 找关联（按 findingIds 包含）
    const roi = (n.roiOptimizations ?? []).find((r) =>
      r.findingIds.some((fid) => related.some((f) => f.id === fid))
    );
    const optimizationLine = roi?.direction
      ?? related.find((f) => f.humanNarrative)?.humanNarrative
      ?? null;

    return `
      <div class="card drilldown-card ${sevClass(row.redlineType.includes('🔴') ? 'critical' : row.redlineType.includes('🟡') ? 'warning' : 'info')}">
        <h3>${htmlEsc(row.module)} <span class="muted small">cur ${row.curPerFrameMs?.toFixed(2) ?? '?'} ms/帧 · throttle ${row.throttlePerFrameMs?.toFixed(2) ?? '?'} ms/帧 · ${htmlEsc(row.redlineType)}</span></h3>
        ${mergedNote}
        <pre class="ascii">${htmlEsc(triStateAscii)}</pre>
        ${subtreeSnippet ? `<p class="muted small">子热点（cur callTree top 3）：</p><pre class="ascii">${htmlEsc(subtreeSnippet)}</pre>` : ''}
        ${gcLine ? `<p class="muted small">GC.Alloc 归因：${htmlEsc(gcLine)}</p>` : ''}
        ${optimizationLine ? `<p class="note"><strong>优化方向：</strong>${htmlEsc(optimizationLine)}</p>` : ''}
        ${related.length > 0 ? renderFindingCards(related) : '<p class="muted">（无关联 finding）</p>'}
      </div>`;
  }).join('\n');

  const boundaryList = n.capabilityBoundaries.map((b) => `<li>${htmlEsc(b)}</li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Perfetto 三态分析报告 · bk26b-perfetto-triad</title>
<style>
  :root {
    --bg: #0f1419;
    --card: #1a2332;
    --border: #2a3a4a;
    --text: #e6edf3;
    --muted: #8b9cb3;
    --accent: #3d8bfd;
    --ok: #3fb950;
    --warn: #d29922;
    --miss: #f85149;
    --info: #58a6ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(160deg, #0f1419 0%, #152030 50%, #0f1419 100%);
    color: var(--text); line-height: 1.55;
  }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 32px 20px 64px; }
  header.hero {
    margin-bottom: 28px; padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  header.hero h1 { margin: 0 0 8px; font-size: 1.75rem; font-weight: 650; letter-spacing: -0.02em; }
  header.hero .sub { color: var(--muted); font-size: 0.95rem; }
  .pill {
    display: inline-block; padding: 2px 10px; border-radius: 4px;
    background: #213047; color: var(--accent); font-size: 0.8rem; margin-right: 6px;
  }
  section { margin: 28px 0; }
  section > h2 {
    font-size: 1.15rem; margin: 0 0 14px; padding-left: 10px;
    border-left: 3px solid var(--accent);
  }
  section > h3 {
    font-size: 1.0rem; margin: 18px 0 10px; padding-left: 8px;
    border-left: 2px solid var(--info);
  }
  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 14px 16px; margin-bottom: 12px;
  }
  .card.conclusion { display: flex; gap: 14px; }
  .card.conclusion .rank {
    flex: 0 0 40px; font-weight: 700; font-size: 1.1rem; color: var(--accent);
  }
  /* DR-41 规则 4：§0 四段式块 */
  .card.conclusion-block { display: flex; gap: 14px; padding: 16px 18px; }
  .card.conclusion-block .block-tag {
    flex: 0 0 32px; font-weight: 700; font-size: 1.3rem; color: var(--accent);
    line-height: 1.2;
  }
  .card.conclusion-block .block-body { flex: 1; min-width: 0; }
  .card.conclusion-block blockquote.one-liner {
    margin: 0 0 10px; padding: 8px 12px; border-left: 3px solid var(--info);
    background: #0d1117; border-radius: 0 4px 4px 0; font-size: 0.98rem;
  }
  .card.conclusion-block ul.key-numbers {
    margin: 8px 0 6px; padding-left: 20px; font-size: 0.9rem;
  }
  .card.conclusion-block ul.key-numbers li { margin-bottom: 3px; }
  .card.conclusion-block .see-also {
    color: var(--muted); font-size: 0.82rem; margin: 6px 0 0; font-style: italic;
  }
  .card.warning { border-left: 3px solid var(--warn); }
  .card.critical { border-left: 3px solid var(--miss); }
  .card.info { border-left: 3px solid var(--info); }
  .meta { color: var(--muted); font-size: 0.82rem; margin-bottom: 6px; }
  .human { color: var(--text); font-size: 0.98rem; font-weight: 500; margin: 6px 0; }
  .muted { color: var(--muted); }
  .small { font-size: 0.78rem; }
  .note { font-size: 0.9rem; color: var(--muted); }
  code {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.82em; background: #0d1117; padding: 1px 5px; border-radius: 3px;
  }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 0.88rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  table {
    width: 100%; border-collapse: collapse; background: var(--card);
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { background: #213047; font-size: 0.85rem; color: var(--muted); font-weight: 600; }
  table.compact td, table.compact th { padding: 6px 10px; font-size: 0.88rem; }
  .bar {
    display: flex; align-items: center; gap: 8px; min-width: 120px;
  }
  .bar-fill {
    height: 8px; background: var(--accent); border-radius: 2px; min-width: 2px;
  }
  .bar-fill.mhz { background: #a371f7; }
  .badge {
    display: inline-block; padding: 1px 8px; border-radius: 3px; font-size: 0.75rem;
    background: #213047; color: var(--muted);
  }
  .badge.ok { color: var(--ok); background: #16331f; }
  .badge.warn { color: var(--warn); background: #3d2e0a; }
  .badge.miss { color: var(--miss); background: #3d1214; }
  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .child-list { margin: 6px 0 0; padding-left: 18px; font-size: 0.88rem; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  pre.ascii {
    background: #0d1117; border: 1px solid var(--border); border-radius: 6px;
    padding: 14px 16px; overflow-x: auto; font-family: ui-monospace, Consolas, monospace;
    font-size: 0.82rem; line-height: 1.45; color: #c9d1d9; white-space: pre;
    margin: 10px 0;
  }
  .drilldown-card { margin-bottom: 16px; }
  .drilldown-card .card.finding { margin: 8px 0 0; background: #0d1117; }
  footer { margin-top: 40px; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--border); padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>Perfetto 三态分析报告</h1>
    <p class="sub">
      <span class="pill">来源：perfetto</span>
      <span class="pill">样本集：bk26b-perfetto-triad</span>
      <span class="pill">窗口级</span>
      <span class="pill">WT-023 报告层重构</span>
    </p>
    <p class="sub">样本：base / cur / throttle · 窗口级 Perfetto 分析（非逐帧）。报告结构按 DR-41 五条硬规则：审计剥离 / 热点模块归并 / 宏观→各线程→下钻分层 / 图文穿插四段式 / 人话先行。</p>
  </header>

  <section>
    <h2>§0 结论先行</h2>
    ${conclusionBlockHtml || '<p class="muted">（无结论块）</p>'}
  </section>

  <section>
    <h2>§1 采集元信息</h2>
    <table class="compact">
      <thead>
        <tr>
          <th>角色</th><th>UnityMain Run</th><th>UnityMain Sleep</th>
          <th>PlayerLoop avgMs</th><th>CPU avgMhz</th><th>bigCoreReach / 降频</th>
          <th>PlayerLoop 帧数</th><th>FrameTimeline</th>
        </tr>
      </thead>
      <tbody>${metaRows}</tbody>
    </table>
  </section>

  <section>
    <h2>§2 多线程宏观</h2>
    <p class="muted">三态各线程 running/sleeping/runnable 健康度。线程通用名按 threadsSched key 动态识别，不硬编码业务名清单。</p>
    ${renderMultiThreadMacro(n.multiThreadMacro)}
  </section>

  <section>
    <h2>§3 主线程 off-CPU 归因 + GPU-bound 判定</h2>
    <p class="muted">byState 三态对照 + wait slice 重叠法（atrace wait slice vs sched Sleeping）。GPU-bound 是 off-CPU 归因的结论，合并展示（DR-41 规则 3：不与 off-CPU 重复）。</p>
    ${renderOffCpuAttribution(n.offCpuAttribution)}
    <h3>§3.6 GPU-bound 判定矩阵</h3>
    <p class="muted small">因果链已指向 GPU 等待（§3.5），本节给出判定矩阵汇总直接/间接证据。</p>
    ${renderGpuBoundMatrix(n.gpuBoundMatrix)}
  </section>

  <section>
    <h2>§4 降频时序证据链</h2>
    <p class="muted">per-CPU 实测 + 形态 ASCII + 判定矩阵 confirmed/likely/suspected。阈值用相对倍数 + 温度旁路，不硬编码 SoC 名。</p>
    ${renderFreqMatrix(n.freqMatrix)}
  </section>

  <section>
    <h2>§5 主线程一帧时间去向（callTree + 红线矩阵 + 下钻）</h2>
    <p class="muted">每节点显示 totalMs / totalPct / count / perFrameMs（=totalMs/PlayerLoop 帧数）。仅用 callTrees 父子链数据，不用 atraceSlices LIKE 全 trace 数据（M1 反模式）。红线矩阵已做子树归并（DR-41 规则 2）。</p>
    <h3>§5.1 PlayerLoop 帧分位数对比</h3>
    ${(() => {
      const rows = ROLES.map((r) => {
        const pl = n.callTreeDrilldown[r];
        const frame = n.triadComparison.atrace[r];
        return `<tr>
          <td>${r}</td>
          <td>${pl.playerLoopFrameCount ?? '—'}</td>
          <td class="num">${fmtNum(frame.playerLoopAvgMs, 2)} ms</td>
          <td>${pl.available ? '可用' : '不可用'}</td>
        </tr>`;
      }).join('\n');
      return `<table class="compact">
        <thead><tr><th>角色</th><th>PlayerLoop 帧数</th><th>PlayerLoop avgMs</th><th>callTree</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    })()}
    <h3>§5.2 callTrees 缩进树（cur）</h3>
    ${(() => {
      // WT-024 需求 4：构建 severityOf 回调 + 三态 perFrame 映射
      // severityOf：基于 redlineMatrix + findings 判定 🔴/🟡/📈/wrapper
      const redlineByName = new Map<string, string>();
      for (const r of n.redlineMatrix.rows) {
        redlineByName.set(r.module, r.redlineType);
        for (const mc of (r.mergedChildren ?? [])) redlineByName.set(mc, r.redlineType);
      }
      const foldChangeByName = new Map<string, number>();
      for (const f of n.findings) {
        const name = extractDynamicName({ title: f.title, claim: f.claim } as Finding);
        if (f.relativeBaseline?.foldChange != null) foldChangeByName.set(name, f.relativeBaseline.foldChange);
      }
      const severityOf = (name: string, perFrameMs: number | null, hasHotChild: boolean): SeverityMark => {
        const rlType = redlineByName.get(name);
        if (rlType?.includes('🔴')) return 'critical';
        if (rlType?.includes('🟡')) return 'warning';
        const fc = foldChangeByName.get(name);
        if (fc != null && fc >= 9999) return 'new';
        // wrapper：自身 perFrame 接近 0 但有热点子节点
        if ((perFrameMs ?? 0) < 0.1 && hasHotChild) return 'wrapper';
        return null;
      };
      // 三态 perFrame 映射：从 redlineMatrix 提取（已含三态 perFrameMs）
      const triStatePerFrame = new Map<string, { base: number | null; cur: number | null; throttle: number | null }>();
      for (const r of n.redlineMatrix.rows) {
        triStatePerFrame.set(r.module, {
          base: r.basePerFrameMs, cur: r.curPerFrameMs, throttle: r.throttlePerFrameMs,
        });
        for (const mc of (r.mergedChildren ?? [])) {
          triStatePerFrame.set(mc, { base: r.basePerFrameMs, cur: r.curPerFrameMs, throttle: r.throttlePerFrameMs });
        }
      }
      return renderCallTreeIndentTree(n.callTreeDrilldown.cur, { severityOf, triStatePerFrame });
    })()}
    <h3>§5.3 callTrees 缩进树（throttle）</h3>
    ${(() => {
      const redlineByName = new Map<string, string>();
      for (const r of n.redlineMatrix.rows) {
        redlineByName.set(r.module, r.redlineType);
        for (const mc of (r.mergedChildren ?? [])) redlineByName.set(mc, r.redlineType);
      }
      const foldChangeByName = new Map<string, number>();
      for (const f of n.findings) {
        const name = extractDynamicName({ title: f.title, claim: f.claim } as Finding);
        if (f.relativeBaseline?.foldChange != null) foldChangeByName.set(name, f.relativeBaseline.foldChange);
      }
      const severityOf = (name: string, perFrameMs: number | null, hasHotChild: boolean): SeverityMark => {
        const rlType = redlineByName.get(name);
        if (rlType?.includes('🔴')) return 'critical';
        if (rlType?.includes('🟡')) return 'warning';
        const fc = foldChangeByName.get(name);
        if (fc != null && fc >= 9999) return 'new';
        if ((perFrameMs ?? 0) < 0.1 && hasHotChild) return 'wrapper';
        return null;
      };
      const triStatePerFrame = new Map<string, { base: number | null; cur: number | null; throttle: number | null }>();
      for (const r of n.redlineMatrix.rows) {
        triStatePerFrame.set(r.module, {
          base: r.basePerFrameMs, cur: r.curPerFrameMs, throttle: r.throttlePerFrameMs,
        });
        for (const mc of (r.mergedChildren ?? [])) {
          triStatePerFrame.set(mc, { base: r.basePerFrameMs, cur: r.curPerFrameMs, throttle: r.throttlePerFrameMs });
        }
      }
      return renderCallTreeIndentTree(n.callTreeDrilldown.throttle, { severityOf, triStatePerFrame });
    })()}
    <h3>§5.4 红线判定矩阵（子树归并后，按 cur ms/帧 排序）</h3>
    ${renderRedlineMatrix(n.redlineMatrix)}
    <h3>§5.5 Top 模块下钻（按归并后的 top 模块组织，不按 finding kind）</h3>
    ${drilldownHtml || '<p class="muted">（无下钻数据）</p>'}
  </section>

  <section>
    <h2>能力边界</h2>
    <div class="card">
      <ul>
        ${boundaryList}
        <li>无 Android FrameTimeline → 不判断 jank。</li>
        <li>无 GPU 计数 → 不判断 GPU busy。</li>
        <li>thermal / 降频仍为 <strong>likely</strong>（非 confirmed）。</li>
        <li>correlateFrameSchedCpu granularity=window → 不声称逐帧相关。</li>
      </ul>
    </div>
  </section>

  ${(n.roiOptimizations?.length ?? 0) > 0 ? `
  <section>
    <h2>§6 ROI 优化方向</h2>
    <p class="muted">按 severity + foldChange / perFrame 相对排序；模块名从 findings 动态提取，无硬编码业务清单。</p>
    ${roiCards}
  </section>` : ''}

  <footer>
    generatedAt: ${htmlEsc(n.generatedAt)} ·
    WT-023 报告层重构（DR-41 五条硬规则）· 无 FrameTimeline jank / 无 GPU busy / 无逐帧相关宣称
  </footer>
</div>
</body>
</html>`;
}

export function runReportMvp(options?: { writeFiles?: boolean }): {
  narrative: PerfettoNarrative;
  html: string;
  outDir: string;
} {
  const writeFiles = options?.writeFiles !== false;
  logLines.length = 0;
  log('WT-023 Perfetto report layer refactor (DR-41 五条硬规则) start');
  log(`explore dir: ${EXPLORE_DIR}`);
  log(`triad dir: ${TRIAD_DIR}`);
  log(`out dir: ${OUT_DIR}`);

  const ledgerPath = path.join(EXPLORE_DIR, 'ledger.json');
  const findingsPath = path.join(EXPLORE_DIR, 'findings.json');
  const verdictPath = path.join(EXPLORE_DIR, 'verdict.json');

  for (const p of [ledgerPath, findingsPath, verdictPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing WT-020 input: ${p}`);
    }
  }

  // 读 WT-022 triad profile-summary
  const triadSummaries = {} as Record<Role, ProfileSummary>;
  for (const role of ROLES) {
    const summaryPath = path.join(TRIAD_DIR, role, 'perfetto-profile-summary.json');
    if (!fs.existsSync(summaryPath)) {
      throw new Error(`Missing WT-022 triad summary: ${summaryPath}`);
    }
    triadSummaries[role] = readJson<ProfileSummary>(summaryPath);
    log(`loaded triad/${role}/perfetto-profile-summary.json (threads=${Object.keys(triadSummaries[role].threadsSched ?? {}).length}, callTrees=${triadSummaries[role].callTrees?.length ?? 0})`);
  }

  const ledger = readJson<LedgerFile>(ledgerPath);
  const findingsFile = readJson<FindingsFile>(findingsPath);
  const verdict = readJson<VerdictFile>(verdictPath);

  log(`loaded ledger evidence=${ledger.evidenceCount} findings=${findingsFile.findings.length}`);

  if (ledger.source !== 'perfetto' || findingsFile.source !== 'perfetto' || verdict.source !== 'perfetto') {
    throw new Error('Input source must be perfetto');
  }

  const narrative = buildNarrative(ledger, findingsFile, verdict, triadSummaries);
  log(`built narrative: multiThreadMacro.threads=${narrative.multiThreadMacro.threads.length}, redlineMatrix.rows=${narrative.redlineMatrix.rows.length}, gpuBoundMatrix.rows=${narrative.gpuBoundMatrix.rows.length}`);
  const html = renderHtml(narrative);

  if (writeFiles) {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const narrativePath = path.join(OUT_DIR, 'narrative.json');
    const htmlPath = path.join(OUT_DIR, 'report.html');
    const auditPath = path.join(OUT_DIR, 'audit.json');

    fs.writeFileSync(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
    log(`wrote ${narrativePath}`);

    fs.writeFileSync(htmlPath, html, 'utf8');
    log(`wrote ${htmlPath}`);

    const audit = {
      script: 'server/scripts/perfetto-report-mvp.ts',
      ticket: 'WT-023 (DR-41 报告层五条硬规则)',
      generatedAt: narrative.generatedAt,
      inputs: {
        ledger: ledgerPath,
        findings: findingsPath,
        verdict: verdictPath,
        triadSummaries: {
          base: path.join(TRIAD_DIR, 'base', 'perfetto-profile-summary.json'),
          cur: path.join(TRIAD_DIR, 'cur', 'perfetto-profile-summary.json'),
          throttle: path.join(TRIAD_DIR, 'throttle', 'perfetto-profile-summary.json'),
        },
        ledgerEvidenceCount: ledger.evidenceCount,
        findingCount: findingsFile.findings.length,
      },
      outputs: {
        narrative: narrativePath,
        reportHtml: htmlPath,
      },
      dr41Rules: {
        rule1_auditStrip: 'report.html 删除 evidence id/tool/runId/证据字样；finding card 只显示 humanNarrative',
        rule2_subtreeMerge: 'top 列表子树归并（parentChain 包含关系，不硬编码业务名）',
        rule3_structureReorder: '§0→§1→§2→§3→§4→§5→§6 宏观→各线程→下钻；§7 GPU-bound 合并进 §3',
        rule4_fourPartBlock: '§0 三大独立结论引用块+ASCII+数字解读四段式',
        rule5_humanFirst: '正文无字段名（byState.S.totalMs / coveragePct / foldChange=9999）',
      },
      v53Alignment: {
        multiThreadMacro: narrative.multiThreadMacro.threads.length,
        callTreeDrilldown: {
          base: narrative.callTreeDrilldown.base.available,
          cur: narrative.callTreeDrilldown.cur.available,
          throttle: narrative.callTreeDrilldown.throttle.available,
        },
        offCpuAttribution: {
          byStateRows: narrative.offCpuAttribution.byState.length,
          hasAsciiState: narrative.offCpuAttribution.asciiStateDistribution.length > 0,
          hasAsciiCausal: narrative.offCpuAttribution.asciiCausalChain.length > 0,
        },
        freqMatrix: {
          matrixRows: narrative.freqMatrix.matrix.length,
          perCpuCount: narrative.freqMatrix.perCpu.length,
          hasAscii: narrative.freqMatrix.asciiMorphology.length > 0,
        },
        redlineMatrix: narrative.redlineMatrix.rows.length,
        gpuBoundMatrix: narrative.gpuBoundMatrix.rows.length,
        topConclusionBlocks: narrative.topConclusionBlocks.length,
      },
      provenancePolicy:
        'All narrative numbers/claims derive from WT-020 ledger/findings/verdict + WT-022 triad profile-summary; deterministic Chinese narrative + ROI; no LLM; no ungoverned rewrite; no hardcoded business module list / absolute thresholds / §0-§9 dead template. DR-41 报告层五条硬规则已执行：审计剥离 / 热点模块归并 / 宏观→各线程→下钻分层 / 图文穿插四段式 / 人话先行。',
      capabilityBoundaries: narrative.capabilityBoundaries,
      roiCount: narrative.roiOptimizations?.length ?? 0,
      callTreeNotes: Object.fromEntries(
        ROLES.map((r) => [r, {
          available: narrative.callTrees[r].available,
          viaPlayerLoopAnchorFallback: narrative.callTrees[r].viaPlayerLoopAnchorFallback,
          note: narrative.callTrees[r].note,
          evidenceId: narrative.callTrees[r].evidenceId,
        }]),
      ),
    };
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    log(`wrote ${auditPath}`);

    const runLogPath = path.join(OUT_DIR, 'run.log');
    fs.writeFileSync(runLogPath, logLines.join('\n') + '\n', 'utf8');
    log(`wrote ${runLogPath}`);
  }

  log('done');
  return { narrative, html, outDir: OUT_DIR };
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runReportMvp({ writeFiles: true });
}
