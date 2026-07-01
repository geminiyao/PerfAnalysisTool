// 采集入库异步任务 + SSE 进度（Upload Tab 使用）

import type { IngestJobEvent, IngestJobKind, IngestJobStatus } from '../../shared/types.js';
import { v4 as uuid } from 'uuid';
import {
  buildAndIngestPerfetto,
  buildAndIngestSimpleperf,
  buildAndIngestUnity,
  ingestUnifiedFiles,
  mergeRunsByIds,
  type IngestMeta,
  type PerfettoIngestOptions,
  type UnifiedIngestOptions,
} from './run-ingest-service.js';
import { detectSourcesFromPaths } from './ingest-detect.js';
import { runPostIngestAnalysis } from './run-analysis-service.js';
import { DEFAULT_TARGET_FPS } from './unity-preprocess-runner.js';
import { buildPerfettoTriadReport, type PerfettoTriadInput } from './perfetto-triad-service.js';
import {
  buildSimpleperfDiffReport,
  ingestSimpleperfDiffBundle,
  type SimpleperfDiffBundleInput,
  type SimpleperfDiffInput,
} from './simpleperf-diff-service.js';
import {
  buildUnityCompareReport,
  type UnityCompareInput,
} from './unity-compare-service.js';

export interface IngestJobRecord {
  id: string;
  kind: IngestJobKind;
  status: IngestJobStatus;
  runId?: string;
  label?: string;
  sources?: string[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const jobs = new Map<string, IngestJobRecord>();
const events = new Map<string, IngestJobEvent[]>();
const clients = new Map<string, Set<NodeJS.WritableStream>>();

function emit(jobId: string, partial: Omit<IngestJobEvent, 'jobId' | 'createdAt'> & { createdAt?: number }) {
  const event: IngestJobEvent = {
    jobId,
    createdAt: partial.createdAt ?? Date.now(),
    ...partial,
  };
  const list = events.get(jobId) ?? [];
  list.push(event);
  events.set(jobId, list.slice(-300));

  for (const client of clients.get(jobId) ?? []) {
    try {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      clients.get(jobId)?.delete(client);
    }
  }
}

function progressLogger(jobId: string) {
  return (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    emit(jobId, { type: 'log', message: trimmed, logLine: trimmed });
  };
}

export function createIngestJob(kind: IngestJobKind): IngestJobRecord {
  const job: IngestJobRecord = {
    id: uuid(),
    kind,
    status: 'processing',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  events.set(job.id, []);
  emit(job.id, { type: 'stage', stage: 'queued', message: '任务已创建', progress: 5 });
  return job;
}

export function getIngestJob(jobId: string): IngestJobRecord | undefined {
  return jobs.get(jobId);
}

export function getIngestJobEvents(jobId: string): IngestJobEvent[] {
  return events.get(jobId) ?? [];
}

export function subscribeIngestJob(jobId: string, client: NodeJS.WritableStream) {
  const set = clients.get(jobId) ?? new Set<NodeJS.WritableStream>();
  set.add(client);
  clients.set(jobId, set);
  client.write(`data: ${JSON.stringify({ type: 'connected', jobId, createdAt: Date.now() })}\n\n`);
  for (const event of getIngestJobEvents(jobId)) {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

export function unsubscribeIngestJob(jobId: string, client: NodeJS.WritableStream) {
  clients.get(jobId)?.delete(client);
  if (clients.get(jobId)?.size === 0) clients.delete(jobId);
}

function finishJob(
  job: IngestJobRecord,
  run: { id: string; sources: string[]; label?: string },
  extra?: { analysisSkill?: string; reportPath?: string; reportMarkdown?: string; runIds?: string[]; triadId?: string; diffId?: string },
) {
  job.status = 'done';
  job.runId = run.id;
  job.label = run.label;
  job.sources = run.sources;
  job.completedAt = Date.now();
  emit(job.id, {
    type: 'done',
    stage: 'completed',
    message: extra?.analysisSkill
      ? `完成: 入库 + ${extra.analysisSkill} 分析`
      : '入库完成',
    progress: 100,
    runId: run.id,
    runIds: extra?.runIds,
    triadId: extra?.triadId,
    diffId: extra?.diffId,
    reportPath: extra?.reportPath,
    reportMarkdown: extra?.reportMarkdown,
    sources: run.sources,
    label: run.label,
  });
}

function failJob(job: IngestJobRecord, error: string) {
  job.status = 'failed';
  job.error = error;
  job.completedAt = Date.now();
  emit(job.id, { type: 'error', stage: 'failed', message: '入库失败', progress: 100, error });
}

export function runUnityIngestJob(jobId: string, pdataPath: string, meta: IngestMeta) {
  const job = jobs.get(jobId);
  if (!job) return;
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在解析 .pdata…', progress: 20 });
      const run = await buildAndIngestUnity(pdataPath, meta, progressLogger(jobId));
      finishJob(job, run);
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export function runSimpleperfIngestJob(
  jobId: string,
  perfPath: string,
  meta: IngestMeta & { binaryCachePath?: string },
) {
  const job = jobs.get(jobId);
  if (!job) return;
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在解析 perf.data…', progress: 15 });
      const run = await buildAndIngestSimpleperf(perfPath, meta, progressLogger(jobId));
      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在运行 simpleperf skill…', progress: 65 });
      const analysis = await runPostIngestAnalysis(run.id, {
        binaryCachePath: meta.binaryCachePath,
        onLog: progressLogger(jobId),
      });
      finishJob(job, run, { analysisSkill: analysis.skill, reportPath: analysis.markdownPath });
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export function runPerfettoIngestJob(
  jobId: string,
  tracePath: string,
  meta: IngestMeta,
  options: PerfettoIngestOptions = {},
) {
  const job = jobs.get(jobId);
  if (!job) return;
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在解析 trace…', progress: 15 });
      const run = await buildAndIngestPerfetto(tracePath, meta, options, progressLogger(jobId));
      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在运行 perfetto skill…', progress: 65 });
      const analysis = await runPostIngestAnalysis(run.id, {
        perfetto: options,
        onLog: progressLogger(jobId),
      });
      finishJob(job, run, { analysisSkill: analysis.skill, reportPath: analysis.markdownPath });
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export function runMergeIngestJob(jobId: string, runIds: string[], meta: IngestMeta) {
  const job = jobs.get(jobId);
  if (!job) return;
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在合并 Run…', progress: 30 });
      const run = await mergeRunsByIds(runIds, meta);
      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在生成交叉报告…', progress: 70 });
      const analysis = await runPostIngestAnalysis(run.id, { onLog: progressLogger(jobId) });
      finishJob(job, run, { analysisSkill: analysis.skill, reportPath: analysis.markdownPath });
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export interface UnifiedIngestJobParams {
  filePaths: string[];
  meta: IngestMeta;
  binaryCachePath?: string;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: import('../../shared/types.js').CliProvider;
  targetFps?: number;
  skipAnalysis?: boolean;
}

export function runUnifiedIngestJob(jobId: string, params: UnifiedIngestJobParams) {
  const job = jobs.get(jobId);
  if (!job) return;
  const log = progressLogger(jobId);
  void (async () => {
    try {
      const detected = detectSourcesFromPaths(params.filePaths);
      const sourceIds = [
        detected.unity && 'unity_profiler',
        detected.simpleperf && 'simpleperf',
        detected.perfetto && 'perfetto',
      ].filter(Boolean);
      emit(jobId, {
        type: 'stage',
        stage: 'extracting_perf',
        message: `识别到 ${sourceIds.join(' + ') || '无源'}`,
        progress: 10,
      });

      const unifiedOpts: UnifiedIngestOptions = {
        meta: params.meta,
        binaryCachePath: params.binaryCachePath,
        perfetto: params.perfetto,
        metaJsonPath: detected.metaJson,
      };

      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在构建并入库…', progress: 25 });
      const run = await ingestUnifiedFiles(detected, unifiedOpts, log);

      if (params.skipAnalysis) {
        finishJob(job, run);
        return;
      }

      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在运行 skill 分析…', progress: 65 });
      const targetFps = params.targetFps ?? params.meta.targetFps ?? DEFAULT_TARGET_FPS;
      const analysis = await runPostIngestAnalysis(run.id, {
        cliProvider: params.cliProvider,
        targetFps,
        binaryCachePath: params.binaryCachePath,
        perfetto: params.perfetto,
        onLog: log,
      });
      finishJob(job, run, { analysisSkill: analysis.skill, reportPath: analysis.markdownPath });
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export interface PerfettoTriadIngestJobParams {
  samples: PerfettoTriadInput[];
  meta: IngestMeta;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: import('../../shared/types.js').CliProvider;
}

export function runPerfettoTriadIngestJob(jobId: string, params: PerfettoTriadIngestJobParams) {
  const job = jobs.get(jobId);
  if (!job) return;
  const log = progressLogger(jobId);
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在构建三份 perfetto profile…', progress: 15 });
      const result = await buildPerfettoTriadReport(params.samples, {
        meta: params.meta,
        perfetto: params.perfetto,
        cliProvider: params.cliProvider,
        onLog: log,
      });
      finishJob(
        job,
        { id: result.triadId, sources: ['perfetto'], label: params.meta.label ?? result.triadId },
        {
          analysisSkill: 'perfetto-trace-analysis+triad',
          reportPath: result.reportPath,
          runIds: result.runIds,
          triadId: result.triadId,
        },
      );
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export interface SimpleperfDiffIngestJobParams {
  input: SimpleperfDiffInput;
  meta: IngestMeta;
  binaryCachePath?: string;
  sceneBase?: string;
  sceneCur?: string;
  cliProvider?: import('../../shared/types.js').CliProvider;
  skipAiEnrich?: boolean;
}

export function runSimpleperfDiffIngestJob(jobId: string, params: SimpleperfDiffIngestJobParams) {
  const job = jobs.get(jobId);
  if (!job) return;
  const log = progressLogger(jobId);
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在构建 base+cur simpleperf diff…', progress: 15 });
      const result = await buildSimpleperfDiffReport(params.input, {
        meta: params.meta,
        binaryCachePath: params.binaryCachePath,
        sceneBase: params.sceneBase,
        sceneCur: params.sceneCur,
        cliProvider: params.cliProvider,
        skipAiEnrich: params.skipAiEnrich,
        onLog: log,
      });
      finishJob(
        job,
        { id: result.diffId, sources: ['simpleperf'], label: params.meta.label ?? result.diffId },
        {
          analysisSkill: result.usedAi ? 'simpleperf-diff-analysis+enriched' : 'simpleperf-diff-analysis',
          reportPath: result.reportPath,
          reportMarkdown: result.markdown,
          runIds: [result.runId],
          diffId: result.diffId,
        },
      );
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export interface SimpleperfDiffBundleIngestJobParams {
  bundle: SimpleperfDiffBundleInput;
  meta: IngestMeta;
}

// === Phase A.4: unity_compare ingest job ===
export interface UnityCompareIngestJobParams {
  input: UnityCompareInput;
  meta: IngestMeta;
  cliProvider?: 'codebuddy' | 'claude' | 'mock';
  skipAiEnrich?: boolean;
}

export function runUnityCompareIngestJob(jobId: string, params: UnityCompareIngestJobParams) {
  const job = jobs.get(jobId);
  if (!job) return;
  const log = progressLogger(jobId);
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'extracting_perf', message: '正在 preprocess base+cur unity 数据…', progress: 15 });
      const result = await buildUnityCompareReport(params.input, {
        cliProvider: params.cliProvider,
        skipAiEnrich: params.skipAiEnrich,
        onLog: log,
      });
      finishJob(
        job,
        { id: result.diffId, sources: ['unity_profiler'], label: params.meta.label ?? result.diffId },
        {
          analysisSkill: result.usedAi ? 'unity-profiler-compare+enriched' : 'unity-profiler-compare',
          reportPath: result.reportPath,
          reportMarkdown: result.markdown,
          runIds: [],
          diffId: result.diffId,
        },
      );
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}

export function runSimpleperfDiffBundleIngestJob(jobId: string, params: SimpleperfDiffBundleIngestJobParams) {
  const job = jobs.get(jobId);
  if (!job) return;
  const log = progressLogger(jobId);
  void (async () => {
    try {
      emit(jobId, { type: 'stage', stage: 'generating_structured_report', message: '正在校验上传的 v4 差分报告…', progress: 40 });
      const result = await ingestSimpleperfDiffBundle(params.bundle, { meta: params.meta, onLog: log });
      finishJob(
        job,
        { id: result.diffId, sources: ['simpleperf'], label: params.meta.label ?? result.diffId },
        {
          analysisSkill: 'simpleperf-diff-analysis',
          reportPath: result.reportPath,
          reportMarkdown: result.markdown,
          runIds: [result.runId],
          diffId: result.diffId,
        },
      );
    } catch (e: any) {
      failJob(job, e.message || String(e));
    }
  })();
}
