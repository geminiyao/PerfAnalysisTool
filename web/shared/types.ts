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
  /** 各 CLI 工具的可执行路径，不配则使用 PATH 中的命令名 */
  cliPaths: Partial<Record<CliProvider, string>>;
}
