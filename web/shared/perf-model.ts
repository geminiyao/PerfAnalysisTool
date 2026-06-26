// 通用 Android 性能分析平台 · P0 领域模型地基
//
// 依据:
//   - docs/analysis-framework-design.md §5 (Run = raw + core + detail) / §6 (分层 + skill 架构)
//   - docs/performance-platform-requirements-v2.md §2 (领域模型) / §8 (insights) / §11 (命名迁移)
//
// 命名约定 (硬约束):
//   - 无 Maple 关键字; pdata/.pdata 统一为 UnityProfilerData, 源 id = 'unity_profiler'。
//   - core 用"指标袋 metrics[]"承载跨源可比指标, 禁止 il2cppBasePct 这类用例耦合的硬编码列。
//   - detail 为 schemaless 原样留档, 新维度进 detail, 不撑爆 core。

// ============================================================
// 源标识
// ============================================================

/** 数据源 id。已知三源 + 可扩展 (新增源遵循"1 Provider + 1 单源 skill")。 */
export type SourceId = 'unity_profiler' | 'simpleperf' | 'perfetto' | (string & {});

/** 已落地的三源 (用于遍历 / 校验)。 */
export const KNOWN_SOURCE_IDS = ['unity_profiler', 'simpleperf', 'perfetto'] as const;

// ============================================================
// core —— 归一化指标 (统一词汇表)
// ============================================================

/** 帧口径: 不同源各一条, 禁止默认直比 (Choreographer ≠ PlayerLoop)。 */
export type FrameDefinition = 'playerloop' | 'choreographer' | 'frametimeline' | (string & {});

export type MetricUnit = 'ms' | '%' | 'pp' | 'mhz' | 'count' | 'mb' | 'bytes' | (string & {});

export type Confidence = 'high' | 'medium' | 'low';

/**
 * 指标袋的一行。加指标 = 多一行, 不改表结构。
 * key 采用统一命名空间, 例: 'cpu.lib.libil2cpp.pct' / 'frame.p95Ms' / 'system.cpuFreqAvgMhz'。
 */
export interface Metric {
  key: string;
  value: number;
  unit: MetricUnit;
  source: SourceId;
  confidence?: Confidence;
}

/** 帧分布 (每源一条, 显式标注口径)。 */
export interface FrameStat {
  source: SourceId;
  frameDefinition: FrameDefinition;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  fps: number;
  /** 慢帧占比 (0-1 或 %, 由 source 决定, 文案需注明)。 */
  slowFrameRate: number;
}

/** 线程调度状态 (主要来自 perfetto)。 */
export interface ThreadStat {
  source: SourceId;
  name: string;
  runningPct: number;
  runnablePct: number;
  sleepingPct: number;
}

/** 系统级状态 (频率 / 降频 / GPU / binder / 内存)。字段可缺失 → 降级。 */
export interface SystemStat {
  cpuFreqAvgMhz?: number;
  cpuThrottled?: boolean;
  thermalC?: number;
  gpuBusyPct?: number;
  binder?: { count: number; avgMs: number };
  pssMb?: number;
}

/** 跨源可信度: 帧偏差超阈值即告警。 */
export interface ProfileConfidence {
  perFrameAlignmentOk: boolean;
  notes: string[];
}

/** 当前归一化逻辑版本。core 由 raw 重算时据此判断是否需要重解析。 */
export const PERF_PROFILE_SCHEMA_VERSION = 1;

/** core —— 物化入库的归一化视图, 服务于单次展示 / 列表 / 趋势。 */
export interface PerfProfileCore {
  schemaVersion: number;
  metrics: Metric[];
  frame: FrameStat[];
  threads: ThreadStat[];
  system: SystemStat;
  confidence: ProfileConfidence;
}

// ============================================================
// CallTree —— 三源共享的"以已知根为起点的每线程调用树" (contract §1.5)
//
// 决策 8: 三源都产"以已知根为起点的每线程调用树", 统一结构, 放 detail.<source>.callTrees。
// 这棵树同时支撑单源热点(self 最高节点) / anchor(选定节点 totalPct) / 对比差分(同名节点配对做减法)。
// 无树的新源 (Thermal/PMU 等) 不产即可, 不破坏可插拔。
// ============================================================

/** 节点层次标签 (主要 simpleperf 用; unity/perfetto 可不填)。 */
export type CallTreeLayer = 'business' | 'engine' | 'runtime' | 'noise' | (string & {});

/** 统一调用树节点。三源 detail 都放一份, 字段名一致 (便于对比层按名配对)。 */
export interface CallTreeNode {
  name: string;
  /** 自身耗时 (不含子树)。 */
  selfMs?: number;
  selfPct?: number;
  /** 子树总耗时。 */
  totalMs?: number;
  totalPct?: number;
  /** 层次标签 (simpleperf 用; 业务/引擎/运行时/噪音)。 */
  layer?: CallTreeLayer;
  children: CallTreeNode[];
}

/** 一棵以某根 (PlayerLoop / 线程入口) 为起点的调用树。挂在 detail.<source>.callTrees[]。 */
export interface CallTree {
  /** 树所属线程名。 */
  thread: string;
  /** 可选: 这棵树的取样来源 (如 'worstFrame#123' / 'medianFrame' / 'thread-total')。 */
  label?: string;
  root: CallTreeNode;
}

// ============================================================
// detail —— schemaless 各源富数据 (不归一化)
// ============================================================

export interface PerfettoThreadSchedEntry {
  name?: string;
  count?: number;
  runningPct?: number;
  runnablePct?: number;
  sleepingPct?: number;
  totalNs?: number;
  tid?: number;
  commName?: string;
  identifiedBy?: string;
  [k: string]: unknown;
}

export interface PerfettoAoeHotSlice {
  label?: string;
  pattern?: string;
  count?: number;
  totalMs?: number;
  avgMs?: number;
  maxMs?: number;
  totalPct?: number;
  selfMs?: number;
  selfPct?: number;
  [k: string]: unknown;
}

export interface PerfettoThermalInfo {
  beforeC?: number | null;
  afterC?: number | null;
  deltaC?: number | null;
  [k: string]: unknown;
}

export interface PerfettoCpuThrottlingEntry {
  cpu?: number;
  avgMhz?: number | null;
  maxMhz?: number | null;
  cpuinfoMaxMhz?: number | null;
  reachVsCpuinfoPct?: number | null;
  reachPct?: number | null;
  [k: string]: unknown;
}

export interface PerfettoThrottling {
  level?: string;
  confirmedAvailable?: boolean;
  thermal?: PerfettoThermalInfo | null;
  collectionManifest?: Record<string, unknown> | null;
  perCpu?: PerfettoCpuThrottlingEntry[];
  bigCoreReachPct?: number | null;
  [k: string]: unknown;
}

export interface PerfettoBinderPeerEntry {
  name?: string;
  serverProcess?: string;
  count?: number;
  avgMs?: number;
  maxMs?: number;
  totalMs?: number;
  [k: string]: unknown;
}

export interface PerfettoBinderPeers {
  byTxnName?: PerfettoBinderPeerEntry[];
  byServerProcess?: PerfettoBinderPeerEntry[];
  [k: string]: unknown;
}

export interface PerfettoGcAllocModule {
  module?: string;
  pattern?: string;
  moduleSliceCount?: number;
  allocCount?: number;
  allocBytes?: number;
  allocMb?: number;
  allocPerFrame?: number;
  topAllocSlices?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface PerfettoOffCpuAttribution {
  totalOffCpuMs?: number;
  byState?: Array<Record<string, unknown>>;
  blockedReasonTopK?: Array<Record<string, unknown>>;
  wakerTopK?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface PerfettoDetail {
  profileWindow?: { startNs?: string; endNs?: string; durMs?: number; [k: string]: unknown };
  parseOptions?: Record<string, unknown>;
  threadsSched?: Record<string, PerfettoThreadSchedEntry>;
  threadsSchedList?: PerfettoThreadSchedEntry[];
  threadSchedView?: {
    primary?: PerfettoThreadSchedEntry[];
    jobWorkerPool?: PerfettoThreadSchedEntry | null;
    jobWorkers?: PerfettoThreadSchedEntry[];
    others?: PerfettoThreadSchedEntry[];
    [k: string]: unknown;
  };
  aoeHotSlices?: PerfettoAoeHotSlice[];
  throttling?: PerfettoThrottling | null;
  binderPeers?: PerfettoBinderPeers;
  gcAllocByModule?: PerfettoGcAllocModule[];
  offCpuAttribution?: PerfettoOffCpuAttribution;
  frameAnalysis?: FrameAnalysis;
  frameTimeline?: unknown;
  machineState?: Record<string, unknown>;
  offCpu?: Record<string, unknown>;
  callTrees?: CallTree[];
  [k: string]: unknown;
}

/** 各源专属富数据/产物指针。新维度进这里, 永不撑爆 core。 */
export interface SourceDetail {
  unity_profiler?: unknown; // frameAnalysis / markers / callTree …
  simpleperf?: unknown;     // folded / flamegraphPath / 完整函数表 …
  perfetto?: PerfettoDetail; // frameAnalysis / sqlResults / surfaceFlinger …
  [k: string]: unknown;
}

// ============================================================
// frameAnalysis — L1–L3 帧分析（ingest 契约，见 docs/frame-analysis-data-contract.md）
// ============================================================

export type DeviceTier = 'high' | 'mid' | 'low' | 'unknown';

export interface FrameAnalysisSummary {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  fps: number;
  slowFrameRate33?: number;
  slowFrameRate50?: number;
  worstFrameIndex?: number;
  medianFrameIndex?: number;
  p95FrameIndex?: number;
  frameIndexOffset?: number;
}

export interface SlowFrameEntry {
  frameIndex: number;
  ms: number;
  rank: number;
}

export interface TraceSegment {
  startFrame: number;
  endFrame: number;
  label: string;
  source: 'marker' | 'meta' | 'inferred' | 'manual' | 'combined-profile';
  confidence?: 'high' | 'medium' | 'low';
}

export interface FrameContext {
  frameIndex: number;
  labels: Record<string, string>;
  evidence?: Array<{
    classifierId: string;
    markers?: string[];
    confidence?: 'high' | 'inferred';
  }>;
}

export interface ContextSummary {
  byClassifier: Record<string, number>;
  segments?: TraceSegment[];
}

export interface WatchTargetMatch {
  type: 'marker' | 'slice';
  patterns: string[];
}

export interface WatchRule {
  id?: string;
  ref?: string;
  when?: string;
  expr?: string;
  params?: Record<string, number>;
  severity?: 'warn' | 'critical';
  message?: string;
}

export interface WatchTarget {
  id: string;
  knowledgeRef?: string;
  match: {
    unity?: WatchTargetMatch;
    perfetto?: WatchTargetMatch;
  };
  playerLoopPhase?: string[];
  callPath?: string[];
  notes?: string;
  rules: WatchRule[];
}

export interface WatchSpec {
  version: number;
  schemaRef: string;
  preset?: string;
  deviceTier?: DeviceTier;
  frameBudgetMs: number;
  targets: WatchTarget[];
  specPath?: string;
}

export interface MarkerFrameSeries {
  targetId: string;
  timings: (number | null)[];
  presentCount: number;
  summary?: {
    medianMs: number;
    p95Ms: number;
    maxMs: number;
  };
}

export interface FlaggedFrame {
  frameIndex: number;
  targetId: string;
  ruleId: string;
  severity: 'warn' | 'critical';
  actualMs: number;
  frameMs?: number;
  context?: Record<string, string>;
  deviceTier?: DeviceTier;
  message: string;
}

/** detail.<source>.frameAnalysis — L1 帧基础设施 + L1.5 context + L2 watchSpec 快照 + L3 派生 */
export interface FrameAnalysis {
  frameDefinition: FrameDefinition;
  thread?: string;
  summary: FrameAnalysisSummary;
  timings: number[];
  slowFrames?: SlowFrameEntry[];
  frameTrees?: CallTree[];
  segments?: TraceSegment[];
  contextByFrame?: FrameContext[];
  contextSummary?: ContextSummary;
  watchSpec?: WatchSpec;
  series?: MarkerFrameSeries[];
  flags?: FlaggedFrame[];
}

// ============================================================
// raw —— 原始文件指针 (真相源)
// ============================================================

/** 原始文件指针, 引用统一 Asset 存储 (assets 表)。 */
export interface RawAssetRef {
  source: SourceId;
  /** assets.id; 适配旧表时可能仅有 localPath。 */
  assetId?: string;
  /** 角色: perf_data | binary_cache | unity_profiler_data | pftrace | meta … */
  role: string;
  fileName?: string;
  localPath?: string;
  sha256?: string;
}

// ============================================================
// PerfProfile = raw + core + detail
// ============================================================

export interface PerfProfile {
  raw: RawAssetRef[];
  core: PerfProfileCore;
  detail: SourceDetail;
}

// ============================================================
// Run —— 一次采集 = 出数据的单元
// ============================================================

export type RunStatus = 'pending' | 'parsing' | 'ready' | 'failed';

export interface RunMeta {
  device?: string;
  scene?: string;
  projectName?: string;
  version?: string;
  branch?: string;
  createdBy?: string;
  notes?: string;
  durationSec?: number;
  frameCount?: number;
  /** Unity skill / preprocess 目标帧率 (默认 60)。 */
  targetFps?: number;
  /** clock_monotonic 对齐窗口 (text 存 bigint)。 */
  monoNsStart?: string;
  monoNsEnd?: string;
  /** 高端 / 中端 / 低端 / unknown — 见 docs/device-tier-map.json */
  deviceTier?: DeviceTier;
}

export interface Run {
  id: string;
  label?: string;
  /** 本 Run 实际含哪些源。 */
  sources: SourceId[];
  status: RunStatus;
  meta: RunMeta;
  profile: PerfProfile;
  createdAt: number;
  completedAt?: number;
  error?: string;
  /** 过渡期标识: 该 Run 由哪个旧表的哪行适配而来 (只读适配产物)。 */
  legacy?: { table: string; id: string };
}

// ============================================================
// Analysis —— 分析任务 (single / compare)
// ============================================================

export type AnalysisMode = 'single' | 'compare';
export type AnalysisStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

export interface Analysis {
  id: string;
  mode: AnalysisMode;
  /** single: 1 个 runId; compare: 2 个 [base, current]。 */
  runIds: string[];
  status: AnalysisStatus;
  /** 解读用 skill: unity-profiler-analysis / simpleperf-analysis / perfetto-analysis / cross-source-analysis。 */
  skill?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
  reportId?: string;
  legacy?: { table: string; id: string };
}

// ============================================================
// Report —— 分析产出 (结论先行 + insights), 挂在 Analysis 上
// ============================================================

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 证据条目: 按源通用命名 (去用例化, 不写 <source>Evidence 的硬编码字段)。 */
export interface InsightEvidence {
  source: SourceId;
  detail: string;
}

/** 单条洞见, 对应需求 §8 的 insights 结构 (去 Maple 化)。 */
export interface Insight {
  id: string;
  severity: InsightSeverity;
  confidence: Confidence;
  sources: SourceId[];
  evidence?: InsightEvidence[];
  /** 普通话结论先行。 */
  conclusion: string;
  recommendation?: string;
}

export interface Report {
  id: string;
  analysisId: string;
  /** 结论先行: 页面最顶部的一句普通话总结。 */
  headline?: string;
  markdown: string;
  insights: Insight[];
  createdAt: number;
}

// ============================================================
// Provider 接口 (P1 落地的签名, P0 仅预声明地基)
// ============================================================

/**
 * 某数据源的解析器 (出数据, 确定性代码)。
 * P1 把 3 个解析器包成 Provider, 各产出 PerfProfile 片段, 由上层合并入同一 Run。
 * P0 仅声明接口形状, 不实现; 便于后续按此签名落地。
 */
export interface PerfProvider {
  readonly source: SourceId;
  /** 该源能解析的 raw 角色 (供采集/校验阶段路由文件)。 */
  readonly acceptsRoles: string[];
  /** 解析 raw → 该源的 PerfProfile 片段 (core 片段 + detail 片段)。 */
  parse(input: ProviderParseInput): Promise<ProviderParseResult>;
}

export interface ProviderParseInput {
  runId: string;
  raw: RawAssetRef[];
  /** 工具链/符号路径等, 由 Provider 自定; 保持 schemaless。 */
  options?: Record<string, unknown>;
}

export interface ProviderParseResult {
  source: SourceId;
  metrics: Metric[];
  frame: FrameStat[];
  threads: ThreadStat[];
  /** 该源能贡献的 system 字段 (合并时按源覆盖)。 */
  system: Partial<SystemStat>;
  detail: unknown;
  notes: string[];
}
