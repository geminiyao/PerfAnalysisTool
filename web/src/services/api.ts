import type {
  Session, Metrics, PaginatedResponse, HistoryQuery, CompareResult, DiffResult, TrendPoint, CliProvider,
  IngestJobEvent, IngestRunResponse, IngestJobStartResponse,
} from '../../shared/types';

const BASE_URL = '/cpu/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `请求失败: ${res.status}`);
  }
  return res.json();
}

/** 上传 .pdata 文件 */
export async function uploadFile(file: File, meta: Record<string, string>): Promise<{ id: string; assetId?: string; sha256?: string; storageBackend?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(meta).forEach(([k, v]) => formData.append(k, v));

  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '上传失败' }));
    throw new Error(err.error);
  }
  return res.json();
}

/** 分析参数 */
export interface AnalysisParams {
  targetFps?: number;
  jankMultiplier?: number;
  bigJankMultiplier?: number;
  budgetRatio?: number;
}

/** 触发分析 */
export async function startAnalysis(sessionId: string, cliProvider: CliProvider = 'codebuddy', params?: AnalysisParams) {
  return request<{ sessionId: string; status: string; queuePosition: number }>('/analysis/start', {
    method: 'POST',
    body: JSON.stringify({ sessionId, cliProvider, params }),
  });
}

/** 获取分析状态 */
export async function getAnalysis(sessionId: string) {
  return request<Session>(`/analysis/${sessionId}`);
}

/** 订阅分析进度 (SSE) */
export function subscribeProgress(sessionId: string, onEvent: (data: any) => void): () => void {
  const eventSource = new EventSource(`${BASE_URL}/analysis/${sessionId}/progress`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {}
  };

  eventSource.onerror = () => {
    eventSource.close();
  };

  return () => eventSource.close();
}

/** 获取队列状态 */
export async function getQueueStatus() {
  return request<{ running: string | null; queued: any[]; totalProcessed: number }>('/analysis/queue/status');
}

/** 查询历史记录 */
export async function getHistory(query: HistoryQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.append(k, String(v));
  });
  return request<PaginatedResponse<Session>>(`/history?${params}`);
}

/** 获取汇总统计 */
export async function getHistoryStats() {
  return request<{
    total: number;
    completed: number;
    failed: number;
    avgDuration: number;
    projects: { projectName: string; count: number }[];
  }>('/history/stats');
}

/** 获取项目列表 */
export async function getProjects(): Promise<string[]> {
  return request<string[]>('/history/projects');
}

/** 对比分析 */
export async function compareAnalyses(sessionIds: string[]) {
  return request<CompareResult>('/compare', {
    method: 'POST',
    body: JSON.stringify({ sessionIds }),
  });
}

/** Marker 级深度对比 */
export async function compareDiff(baselineId: string, currentId: string) {
  return request<DiffResult>('/compare/diff', {
    method: 'POST',
    body: JSON.stringify({ baselineId, currentId }),
  });
}

/** 获取趋势数据 */
export async function getTrends(projectName: string, metric: string, dateFrom?: number, dateTo?: number) {
  const params = new URLSearchParams({ projectName, metric });
  if (dateFrom) params.append('dateFrom', String(dateFrom));
  if (dateTo) params.append('dateTo', String(dateTo));
  return request<{ projectName: string; metric: string; points: TrendPoint[] }>(`/trends?${params}`);
}

/** 获取可用趋势指标 */
export async function getTrendMetrics() {
  return request<{ key: string; label: string; unit: string; lowerIsBetter: boolean }[]>('/trends/metrics');
}

/** 删除分析记录 */
export async function deleteAnalysis(sessionId: string) {
  return request<{ success: boolean }>(`/analysis/${sessionId}`, { method: 'DELETE' });
}

// ============================================================
// P2: 新模型 Run API (runs / run_metrics / analysis_reports)
// ============================================================

import type { Run, Analysis, Report } from '@shared/perf-model';

export interface RunListItem {
  id: string;
  label?: string;
  sources: string[];
  status: string;
  device: string;
  scene: string;
  projectName: string;
  version: string;
  frameCount?: number;
  metricCount: number;
  createdAt: number;
}

export async function listRuns(limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<{ items: RunListItem[]; total: number }>(`/runs?${params}`);
}

export async function getRunDetail(runId: string) {
  return request<{
    run: Run;
    analysis: { analysis: Analysis; report: Report } | null;
  }>(`/runs/${runId}`);
}

export async function compareRuns(baseRunId: string, currentRunId: string) {
  return request<import('@shared/run-compare-types').RunCompareResult>('/runs/compare', {
    method: 'POST',
    body: JSON.stringify({ baseRunId, currentRunId }),
  });
}

export function compareFlamegraphUrl(baseRunId: string, currentRunId: string): string {
  const params = new URLSearchParams({ baseRunId, currentRunId });
  return `${BASE_URL}/runs/compare/flamegraph?${params}`;
}

export async function generateRunAnalysis(
  runId: string,
  opts?: { cliProvider?: CliProvider; targetFps?: number },
) {
  return request<{
    analysis: Analysis;
    report: Report;
    skill?: string;
    markdownPath?: string;
    digestPath?: string;
  }>(`/runs/${runId}/generate-analysis`, {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  });
}

/** @deprecated 使用 generateRunAnalysis */
export const generateCrossSourceAnalysis = generateRunAnalysis;

export function ingestUnifiedRun(
  files: File[],
  meta: Record<string, string> & { cliProvider?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/unified', fd), onEvent);
}

async function postIngestMultipart(url: string, formData: FormData): Promise<IngestJobStartResponse> {
  const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '入库失败');
  }
  return res.json();
}

async function postIngestJson(url: string, body: unknown): Promise<IngestJobStartResponse> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '入库失败');
  }
  return res.json();
}

export function waitIngestJob(
  jobId: string,
  onEvent?: (event: IngestJobEvent) => void,
): Promise<IngestRunResponse> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`${BASE_URL}/runs/ingest/jobs/${jobId}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as IngestJobEvent;
        if (data.type === 'connected') return;
        onEvent?.(data);
        if (data.type === 'done' && data.runId) {
          es.close();
          resolve({
            runId: data.runId,
            sources: data.sources ?? [],
            label: data.label,
            url: `/runs/${data.runId}`,
          });
        }
        if (data.type === 'error') {
          es.close();
          reject(new Error(data.error || data.message || '入库失败'));
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
      reject(new Error('进度连接中断，请查看 Runs 列表或重试'));
    };
  });
}

async function ingestWithProgress(
  start: () => Promise<IngestJobStartResponse>,
  onEvent?: (event: IngestJobEvent) => void,
): Promise<IngestRunResponse> {
  const { jobId } = await start();
  return waitIngestJob(jobId, onEvent);
}

export function ingestUnityRun(
  file: File,
  meta: Record<string, string>,
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('file', file);
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/unity', fd), onEvent);
}

export function ingestSimpleperfRun(
  file: File,
  meta: Record<string, string>,
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('perfData', file);
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/simpleperf', fd), onEvent);
}

export function ingestPerfettoRun(
  file: File,
  meta: Record<string, string>,
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('file', file);
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/perfetto', fd), onEvent);
}

export function mergeRuns(
  runIds: string[],
  meta: Record<string, string> = {},
  onEvent?: (event: IngestJobEvent) => void,
) {
  return ingestWithProgress(() => postIngestJson('/runs/ingest/merge', { runIds, ...meta }), onEvent);
}

// ============================================================
// 优化建议 API
// ============================================================

import type { SourcePathStatus, OptimizeSuggestRequest } from '../../shared/types';

/** 获取源码路径配置 */
export async function getSourcePathConfig() {
  return request<SourcePathStatus>('/config/source-path');
}

/** 设置源码路径 */
export async function setSourcePath(srcPath: string) {
  return request<SourcePathStatus>('/config/source-path', {
    method: 'POST',
    body: JSON.stringify({ path: srcPath }),
  });
}

/** 触发源码映射 */
export async function triggerMapSource(sessionId: string) {
  return request<{ cached: boolean; map: any }>('/optimize/map-source', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/** 一键应用代码修改 */
export async function applyPatch(filePath: string, before: string, after: string) {
  return request<{ success: boolean; file: string }>('/optimize/apply-patch', {
    method: 'POST',
    body: JSON.stringify({ filePath, before, after }),
  });
}

/** 批量查询已有优化方案 */
export async function getOptimizeResults(sessionId: string) {
  return request<Record<string, { result: string; sourceFiles: any[]; createdAt: number }>>(`/optimize/results/${sessionId}`);
}

/** 启动 AI 优化建议任务，返回 taskId + sourceFiles，然后用 EventSource 订阅进度 */
export function requestOptimizeSuggest(
  body: OptimizeSuggestRequest & { issueKey: string },
  onEvent: (event: any) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  let eventSource: EventSource | null = null;
  let cancelled = false;
  let taskId: string | null = null;

  fetch(`${BASE_URL}/optimize/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (cancelled) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      onError(err.error || `请求失败: ${res.status}`);
      return;
    }

    const data = await res.json();
    taskId = data.taskId;

    if (data.sourceFiles?.length) {
      onEvent({ type: 'source_found', sourceFiles: data.sourceFiles });
    }

    if (cancelled) return;

    eventSource = new EventSource(`${BASE_URL}/optimize/progress/${taskId}`);

    eventSource.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (event.type === 'connected') return;
        onEvent(event);
        if (event.type === 'done' || event.type === 'error') {
          eventSource?.close();
          onDone();
        }
      } catch { /* skip */ }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      if (!cancelled) {
        onDone();
      }
    };
  }).catch((err) => {
    if (!cancelled) {
      onError(err.message);
    }
  });

  return () => {
    cancelled = true;
    eventSource?.close();
    if (taskId) {
      fetch(`${BASE_URL}/optimize/cancel/${taskId}`, { method: 'POST' }).catch(() => {});
    }
  };
}
