// 共享类型定义 - 前后端通用

/** CLI 工具提供者 - 可扩展 */
export type CliProvider = 'codebuddy' | 'claude' | 'mock';

/** CLI 提供者选项（前端下拉列表用） */
export interface CliProviderOption {
  value: CliProvider;
  label: string;
  description: string;
}

/** 可用的 CLI 提供者列表 */
export const CLI_PROVIDERS: CliProviderOption[] = [
  { value: 'codebuddy', label: 'CodeBuddy', description: 'Tencent CodeBuddy CLI (默认)' },
  { value: 'claude', label: 'Claude Code', description: 'Anthropic Claude Code CLI' },
  { value: 'mock', label: 'Mock 模式', description: '使用已有数据模拟，不消耗 token (调试用)' },
];

/** 分析会话状态 */
export type SessionStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

/** 分析会话 */
export interface AssetSummary {
  id: string;
  assetType: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  storageBackend: string;
  localPath?: string;
  remoteKey?: string;
  role?: string;
  createdAt?: number;
}

export interface Session {
  id: string;
  fileName: string;
  fileSize: number;
  status: SessionStatus;
  createdBy: string;
  projectName: string;
  version: string;
  branch?: string;
  device?: string;
  scene?: string;
  notes?: string;
  createdAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
  inputAsset?: AssetSummary;
  assets?: AssetSummary[];
}

/** 性能指标摘要 */
export interface Metrics {
  id: string;
  sessionId: string;
  totalFrames: number;
  avgFrameMs: number;
  maxFrameMs: number;
  medianFrameMs: number;
  p95FrameMs: number;
  fps: number;
  jankCount: number;
  jankRate: number;
  bigJankCount: number;
  topMarkerCount: number;
  topMarkerTotalMs: number;
  spikeCount: number;
}

/** 上传元数据表单 */
export interface UploadMeta {
  projectName: string;
  version: string;
  createdBy: string;
  branch?: string;
  device?: string;
  scene?: string;
  notes?: string;
}

/** 分析进度事件 */
export interface ProgressEvent {
  sessionId: string;
  stage: 'queued' | 'preprocessing' | 'analyzing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  timestamp: number;
  /** CLI 实时输出日志行 */
  log?: string;
}

/** simpleperf 细分阶段 */
export type SimpleperfStage =
  | 'idle'
  | 'uploading_perf_data'
  | 'uploading_symbols'
  | 'upload_completed'
  | 'creating_session'
  | 'queued'
  | 'extracting_perf'
  | 'extract_completed'
  | 'generating_structured_report'
  | 'structured_report_ready'
  | 'ai_prompt_ready'
  | 'ai_thinking'
  | 'ai_streaming'
  | 'ai_completed'
  | 'writing_ai_report'
  | 'report_ready'
  | 'completed'
  | 'failed';

export type MapleCompareStage = SimpleperfStage;

/** 采集入库 Tab 异步任务 */
export type IngestJobKind = 'unity' | 'simpleperf' | 'perfetto' | 'merge' | 'unified';
export type IngestJobStatus = 'processing' | 'done' | 'failed';

export interface IngestJobEvent {
  jobId: string;
  type: 'connected' | 'stage' | 'log' | 'done' | 'error';
  stage?: SimpleperfStage | 'queued';
  message?: string;
  progress?: number;
  logLine?: string;
  runId?: string;
  sources?: string[];
  label?: string;
  error?: string;
  createdAt: number;
}

export interface IngestRunResponse {
  runId: string;
  sources: string[];
  label?: string;
  url: string;
}

export interface IngestJobStartResponse {
  jobId: string;
  status: 'processing';
}

/** simpleperf 可观测分析事件 */
export interface SimpleperfProgressEvent {
  sessionId: string;
  type: 'stage' | 'log' | 'structured_report' | 'ai_prompt' | 'ai_delta' | 'ai_stats' | 'artifact' | 'done' | 'error';
  stage?: SimpleperfStage;
  message?: string;
  progress?: number;
  prompt?: string;
  text?: string;
  report?: any;
  artifact?: {
    kind: 'json' | 'txt' | 'folded' | 'ai' | 'md' | 'flame';
    path?: string;
    url?: string;
  };
  error?: string;
  createdAt: number;
}

/** 历史查询参数 */
export interface HistoryQuery {
  page?: number;
  limit?: number;
  projectName?: string;
  version?: string;
  createdBy?: string;
  status?: SessionStatus;
  dateFrom?: number;
  dateTo?: number;
  search?: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** 对比结果 */
export interface CompareResult {
  sessions: Session[];
  metrics: Metrics[];
  diffs: MetricDiff[];
}

/** 指标差异 */
export interface MetricDiff {
  metric: string;
  label: string;
  values: number[];
  delta: number;
  deltaPercent: number;
  improved: boolean;
}

/** 趋势数据点 */
export interface TrendPoint {
  sessionId: string;
  version: string;
  date: number;
  value: number;
}

/** 趋势查询参数 */
export interface TrendQuery {
  projectName: string;
  metric: keyof Metrics;
  dateFrom?: number;
  dateTo?: number;
}

// ============================================================
// Diff 对比类型
// ============================================================

/** 单个 Marker 的 diff */
export interface MarkerDiff {
  name: string;
  thread: string;
  baseline: { selfMean: number; selfMax: number; percentOfFrame: number; callsPerFrame: number } | null;
  current: { selfMean: number; selfMax: number; percentOfFrame: number; callsPerFrame: number } | null;
  delta: { selfMean: number; selfMax: number; percentOfFrame: number };
  deltaPercent: { selfMean: number; percentOfFrame: number };
  status: 'improved' | 'degraded' | 'new' | 'removed' | 'unchanged';
  mustReport: boolean;
}

/** Jank 对比摘要 */
export interface JankComparison {
  baseline: { count: number; bigJankCount: number; totalFrames: number };
  current: { count: number; bigJankCount: number; totalFrames: number };
}

/** 帧汇总对比 */
export interface FrameSummaryDiff {
  metric: string;
  label: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  improved: boolean;
}

/** Diff 完整结果 */
export interface DiffResult {
  frameSummaryDiffs: FrameSummaryDiff[];
  markerDiffs: MarkerDiff[];
  jankComparison: JankComparison;
}

/** 服务器配置 */
export interface ServerConfig {
  port: number;
  dataDir: string;
  maxUploadSize: string;
  retentionDays: number;
  skillProjectPath: string;
  storageBackend?: 'local' | 'cdn' | 'cos';
  assetStorageDir?: string;
  cdnEnabled?: boolean;
  cdnProvider?: string;
  remoteStorageConfigured?: boolean;
  /** 各 CLI 工具的可执行路径，不配则使用 PATH 中的命令名 */
  cliPaths: Partial<Record<CliProvider, string>>;
  /** Unity 工程源码根目录（服务端本地路径），用于源码定位和优化建议 */
  sourceProjectPath?: string;
}

// ============================================================
// 优化建议相关类型
// ============================================================

/** 源码路径配置状态 */
export interface SourcePathStatus {
  configured: boolean;
  path?: string;
  hasAssets?: boolean;
}

/** 优化建议请求 */
export interface OptimizeSuggestRequest {
  sessionId: string;
  issueType: 'hotspot' | 'jank' | 'spike';
  markerName: string;
  callChain?: string;
  hotPath?: string;
  /** 性能数据上下文 */
  perfContext: {
    msSelfMean?: number;
    msSelfMax?: number;
    percentOfFrame?: number;
    msFrame?: number;
    ratio?: number;
    dominantMarker?: string;
    thread?: string;
  };
}

/** 优化建议 SSE 事件 */
export interface OptimizeSuggestEvent {
  type: 'source_found' | 'analyzing' | 'chunk' | 'log' | 'done' | 'error';
  /** source_found: 源码定位结果 */
  sourceFiles?: { path: string; line: number; snippet?: string }[];
  /** chunk: AI 输出的文本片段 */
  text?: string;
  /** log: CLI 实时日志行（thinking、tool_use 等中间过程） */
  log?: string;
  /** error: 错误信息 */
  error?: string;
}

/** 优化方案 DB 行（查询返回值） */
export interface OptimizeResultRow {
  id: string;
  sessionId: string;
  issueKey: string;
  issueType: string;
  result: string;
  sourceFiles: { path: string; line: number }[];
  createdAt: number;
}
