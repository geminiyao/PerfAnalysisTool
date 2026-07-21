import type {
  Session, Metrics, PaginatedResponse, HistoryQuery, CompareResult, DiffResult, TrendPoint, CliProvider,
  IngestJobEvent, IngestRunResponse, IngestJobStartResponse,
} from '../../shared/types';
import type { ReportBundle } from '../../shared/report-bundle';

function apiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3000/cpu/api';
  }
  return '/cpu/api';
}

const BASE_URL = apiBaseUrl();

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

export interface ReportPreviewSample {
  key: string;
  label: string;
  kind: 'unity' | 'simpleperf' | 'perfetto' | 'cross';
  mode: 'single' | 'diff';
  relativePath: string;
  description: string;
  available: boolean;
}

export interface ReportPreviewDetail extends ReportPreviewSample {
  markdown: string;
}

export async function listReportPreviewSamples() {
  return request<{ items: ReportPreviewSample[] }>('/report-preview/samples');
}

export async function getReportPreviewSample(key: string) {
  return request<ReportPreviewDetail>(`/report-preview/samples/${encodeURIComponent(key)}`);
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

function uploadFileName(f: File): string {
  return ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/');
}

export function ingestUnifiedRun(
  files: File[],
  meta: Record<string, string> & { cliProvider?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f, uploadFileName(f));
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

function ingestDoneResponse(event: IngestJobEvent): IngestRunResponse | null {
  if (event.type !== 'done' || !event.runId) return null;
  return {
    runId: event.runId,
    sources: event.sources ?? [],
    label: event.label,
    url: `/runs/${event.runId}`,
    runIds: event.runIds,
    triadId: event.triadId,
    diffId: event.diffId,
    reportPath: event.reportPath,
    reportMarkdown: event.reportMarkdown,
  };
}

async function pollIngestJob(jobId: string, onEvent?: (event: IngestJobEvent) => void): Promise<IngestRunResponse> {
  let seen = 0;
  while (true) {
    const data = await request<{ job: { status: string; error?: string }; events: IngestJobEvent[] }>(`/runs/ingest/jobs/${jobId}`);
    for (const event of data.events.slice(seen)) onEvent?.(event);
    seen = data.events.length;
    const lastDone = [...data.events].reverse().map(ingestDoneResponse).find(Boolean);
    if (lastDone) return lastDone;
    if (data.job.status === 'failed') throw new Error(data.job.error || '入库失败');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

export function waitIngestJob(
  jobId: string,
  onEvent?: (event: IngestJobEvent) => void,
): Promise<IngestRunResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      void pollIngestJob(jobId, onEvent).then(resolve, reject).finally(() => { settled = true; });
    };
    const es = new EventSource(`${BASE_URL}/runs/ingest/jobs/${jobId}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as IngestJobEvent;
        if (data.type === 'connected') return;
        onEvent?.(data);
        const done = ingestDoneResponse(data);
        if (done) {
          settled = true;
          es.close();
          resolve(done);
        }
        if (data.type === 'error') {
          settled = true;
          es.close();
          reject(new Error(data.error || data.message || '入库失败'));
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
      fallback();
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
  fd.append('file', file, uploadFileName(file));
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/perfetto', fd), onEvent);
}

export function ingestPerfettoTriadRun(
  files: { base: File[]; cur: File[]; throttle: File[] },
  meta: Record<string, string> & { cliProvider?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  for (const role of ['base', 'cur', 'throttle'] as const) {
    for (const f of files[role]) fd.append(role, f, uploadFileName(f));
  }
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/perfetto-triad', fd), onEvent);
}

export function ingestPerfettoTriadLocalRun(
  paths: { base: string; cur: string; throttle: string },
  meta: Record<string, string> & { cliProvider?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  return ingestWithProgress(() => postIngestJson('/runs/ingest/perfetto-triad/local', {
    paths,
    labels: { base: 'base', cur: 'cur', throttle: 'throttle' },
    ...meta,
  }), onEvent);
}

export function ingestSimpleperfDiffRun(
  files: { base: File; cur: File },
  meta: Record<string, string> & { cliProvider?: string; skipAiEnrich?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('base', files.base, uploadFileName(files.base));
  fd.append('cur', files.cur, uploadFileName(files.cur));
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/simpleperf-diff', fd), onEvent);
}

export function ingestSimpleperfDiffLocalRun(
  paths: { basePath: string; curPath: string; binaryCachePath?: string },
  meta: Record<string, string> & { cliProvider?: string; skipAiEnrich?: boolean; sceneBase?: string; sceneCur?: string },
  onEvent?: (event: IngestJobEvent) => void,
) {
  return ingestWithProgress(() => postIngestJson('/runs/ingest/simpleperf-diff/local', { ...paths, ...meta }), onEvent);
}

export function ingestSimpleperfDiffBundleRun(
  files: { report: File; diffJson?: File },
  meta: Record<string, string> = {},
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('report', files.report, uploadFileName(files.report));
  if (files.diffJson) fd.append('diffJson', files.diffJson, uploadFileName(files.diffJson));
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/simpleperf-diff/bundle', fd), onEvent);
}

/** Phase A.4: Unity 双版本对比 — 上传 .pdata */
export function ingestUnityCompareRun(
  files: { base: File; cur: File },
  meta: Record<string, string | number | boolean | undefined> = {},
  onEvent?: (event: IngestJobEvent) => void,
) {
  const fd = new FormData();
  fd.append('base', files.base, uploadFileName(files.base));
  fd.append('cur', files.cur, uploadFileName(files.cur));
  Object.entries(meta).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
  });
  return ingestWithProgress(() => postIngestMultipart('/runs/ingest/unity-compare', fd), onEvent);
}

/** Phase A.4: Unity 双版本对比 — 本地路径模式 */
export function ingestUnityCompareLocalRun(
  paths: { basePath: string; curPath: string },
  meta: Record<string, string | number | boolean | undefined> = {},
  onEvent?: (event: IngestJobEvent) => void,
) {
  return ingestWithProgress(() => postIngestJson('/runs/ingest/unity-compare/local', { ...paths, ...meta }), onEvent);
}

export function mergeRuns(
  runIds: string[],
  meta: Record<string, string> = {},
  onEvent?: (event: IngestJobEvent) => void,
) {
  return ingestWithProgress(() => postIngestJson('/runs/ingest/merge', { runIds, ...meta }), onEvent);
}

// ============================================================
// 三源趋势 API (Dashboard)
// ============================================================

export interface TriadVersionPoint {
  version: string;
  runCount: number;
  runIds: string[];
  createdAt: number;
}

export interface TriadTrendsData {
  versions: TriadVersionPoint[];
  filters: { projectName: string | null; device: string | null; scene: string | null };
  unity: { fps: (number | null)[]; p95Ms: (number | null)[] };
  simpleperf: { soNames: string[]; soPct: Record<string, (number | null)[]> };
  perfetto: {
    threadLabels: string[];
    running: Record<string, (number | null)[]>;
    runnable: Record<string, (number | null)[]>;
    sleeping: Record<string, (number | null)[]>;
  };
}

export async function fetchTriadTrends(params?: {
  projectName?: string;
  device?: string;
  scene?: string;
}): Promise<TriadTrendsData> {
  const qs = new URLSearchParams();
  if (params?.projectName) qs.set('projectName', params.projectName);
  if (params?.device) qs.set('device', params.device);
  if (params?.scene) qs.set('scene', params.scene);
  const query = qs.toString();
  return request<TriadTrendsData>(`/runs/triad-trends${query ? `?${query}` : ''}`);
}

// ============================================================
// 版本下钻 + 分析管理 API (Dashboard 抽屉)
// ============================================================

/** 已有分析摘要 (Dashboard 抽屉标注用) */
export interface AnalysisSummary {
  id: string;
  skill: string;
  typeLabel: string;  // Unity 单源 / simpleperf 单源 / Perfetto 单源 / 多源交叉
  status: string;
  headline?: string;
  hasReport: boolean;
  createdAt: number;
}

/** 版本下钻: 某版本下所有 Run + 各自已有分析 */
export interface VersionRunItem extends RunListItem {
  analyses: AnalysisSummary[];
}

export async function fetchRunsByVersion(version: string): Promise<{ version: string; items: VersionRunItem[] }> {
  const encoded = encodeURIComponent(version);
  return request(`/runs/by-version/${encoded}`);
}

/** 触发分析 (可选指定源子集: 单源/双源/三源) */
export async function generateRunAnalysisWithSources(
  runId: string,
  opts?: { cliProvider?: CliProvider; targetFps?: number; sources?: string[] },
) {
  return request<{ skill: string; markdownPath?: string; analysis?: unknown; report?: unknown }>(
    `/runs/${runId}/generate-analysis`,
    { method: 'POST', body: JSON.stringify(opts ?? {}) },
  );
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

export async function fetchReportBundle(sampleKey: string): Promise<ReportBundle> {
  return request<ReportBundle>(`/report-view/bundle/${encodeURIComponent(sampleKey)}`);
}

export async function fetchReportViewSamples(): Promise<{
  items: Array<{ key: string; label: string; reportType: string; description: string; available: boolean }>;
}> {
  return request('/report-view/samples');
}
