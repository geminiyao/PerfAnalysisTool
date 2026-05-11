import type { Session, Metrics, PaginatedResponse, HistoryQuery, CompareResult, DiffResult, TrendPoint, CliProvider } from '../../shared/types';

const BASE_URL = '/api';

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
export async function uploadFile(file: File, meta: Record<string, string>): Promise<{ id: string }> {
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
