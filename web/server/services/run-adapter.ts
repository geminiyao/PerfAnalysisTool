// 旧筒仓表 → 新领域模型 的【只读】适配器 (P0 过渡方案)
//
// 目的: 在不改动旧表、不双写、不删表的前提下, 把历史数据按新 Run/Analysis 视图读出,
// 供新模型上层 (P2 单次详情 / P3 对比 / 趋势) 复用。所有函数纯读取 + 内存映射。
//
// 覆盖映射:
//   maple_runs (+ maple_pdata_results + maple_perfetto_results) → Run (含 unity_profiler/perfetto core)
//   sessions   (+ metrics)                                       → Run (unity_profiler 单次上传)
//   simpleperf_sessions                                          → Run (simpleperf raw, core 视产物而定)
//   maple_compare_reports / maple_compare_sessions               → Analysis(mode='compare') + Report
//
// 注意: 旧硬编码列在此翻译为指标袋 metrics[] (如 il2cppBasePct → cpu.lib.libil2cpp.pct),
// 富数据/产物指针归入 detail。core 缺失字段降级, 不报错。

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  mapleRuns,
  maplePdataResults,
  maplePerfettoResults,
  mapleCompareReports,
  sessions,
  metrics as legacyMetrics,
  simpleperfSessions,
} from '../db/schema.js';
import {
  PERF_PROFILE_SCHEMA_VERSION,
  type Run,
  type Analysis,
  type Report,
  type Metric,
  type MetricUnit,
  type FrameStat,
  type ThreadStat,
  type SystemStat,
  type SourceId,
  type RawAssetRef,
  type SourceDetail,
  type PerfProfile,
  type Insight,
} from '../../shared/perf-model.js';

function metric(key: string, value: number | null | undefined, unit: MetricUnit, source: SourceId): Metric | null {
  if (value == null || Number.isNaN(value)) return null;
  return { key, value, unit, source };
}

function compact(items: (Metric | null)[]): Metric[] {
  return items.filter((m): m is Metric => m !== null);
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function emptyProfile(): PerfProfile {
  return {
    raw: [],
    core: {
      schemaVersion: PERF_PROFILE_SCHEMA_VERSION,
      metrics: [],
      frame: [],
      threads: [],
      system: {},
      confidence: { perFrameAlignmentOk: true, notes: [] },
    },
    detail: {},
  };
}

// ============================================================
// maple_runs → Run
// ============================================================

/** 把一次同步采样 (maple_runs 行 + 其 pdata/perfetto 解析结果) 适配为新 Run。 */
export function mapleRunToRun(runId: string): Run | null {
  const db = getDb();
  const run = db.select().from(mapleRuns).where(eq(mapleRuns.id, runId)).get();
  if (!run) return null;

  const pdata = db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, runId)).get();
  const perfetto = db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, runId)).get();

  const profile = emptyProfile();
  const sources: SourceId[] = [];
  const detail: SourceDetail = {};
  const allMetrics: Metric[] = [];
  const notes: string[] = [];

  // raw 指针
  const raw: RawAssetRef[] = [];
  if (run.perfDataPath) raw.push({ source: 'simpleperf', role: 'perf_data', localPath: run.perfDataPath });
  if (run.ptracePath) raw.push({ source: 'perfetto', role: 'pftrace', localPath: run.ptracePath });
  for (const p of safeParse<string[]>(run.pdataPaths, [])) {
    raw.push({ source: 'unity_profiler', role: 'unity_profiler_data', localPath: p, fileName: p.split(/[\\/]/).pop() });
  }
  profile.raw = raw;

  // unity_profiler core (来自 maple_pdata_results)
  if (pdata) {
    sources.push('unity_profiler');
    const fps = pdata.avgFrameMs > 0 ? 1000 / pdata.avgFrameMs : 0;
    profile.core.frame.push({
      source: 'unity_profiler',
      frameDefinition: 'playerloop',
      p50Ms: pdata.p50FrameMs,
      p95Ms: pdata.p95FrameMs,
      p99Ms: pdata.p99FrameMs,
      fps,
      slowFrameRate: pdata.slowFrames33Rate,
    } satisfies FrameStat);
    allMetrics.push(...compact([
      metric('frame.avgMs', pdata.avgFrameMs, 'ms', 'unity_profiler'),
      metric('frame.p50Ms', pdata.p50FrameMs, 'ms', 'unity_profiler'),
      metric('frame.p95Ms', pdata.p95FrameMs, 'ms', 'unity_profiler'),
      metric('frame.p99Ms', pdata.p99FrameMs, 'ms', 'unity_profiler'),
      metric('frame.maxMs', pdata.maxFrameMs, 'ms', 'unity_profiler'),
      metric('frame.slowRate33Ms', pdata.slowFrames33Rate, '%', 'unity_profiler'),
      metric('marker.BehaviourUpdate.msPerFrame', pdata.scriptingMs, 'ms', 'unity_profiler'),
      metric('marker.WaitForTargetFPS.msPerFrame', pdata.waitForTargetFpsMs, 'ms', 'unity_profiler'),
      metric('marker.Camera_Render.msPerFrame', pdata.renderingMs, 'ms', 'unity_profiler'),
      metric('marker.Physics_Processing.msPerFrame', pdata.physicsMs, 'ms', 'unity_profiler'),
      metric('gc.allocCount', pdata.gcAllocCount, 'count', 'unity_profiler'),
      metric('gc.allocBytes', pdata.gcAllocBytes, 'bytes', 'unity_profiler'),
    ]));
    detail.unity_profiler = {
      frameDist: safeParse(pdata.frameDistJson, null),
      topMarkers: safeParse(pdata.topMarkersJson, null),
    };
  }

  // perfetto core (来自 maple_perfetto_results)
  if (perfetto) {
    sources.push('perfetto');
    if (perfetto.frameP50Ms != null || perfetto.frameP95Ms != null) {
      const fps = perfetto.frameAvgMs && perfetto.frameAvgMs > 0 ? 1000 / perfetto.frameAvgMs : 0;
      profile.core.frame.push({
        source: 'perfetto',
        frameDefinition: 'choreographer',
        p50Ms: perfetto.frameP50Ms ?? 0,
        p95Ms: perfetto.frameP95Ms ?? 0,
        p99Ms: perfetto.frameP99Ms ?? 0,
        fps,
        slowFrameRate: 0,
      } satisfies FrameStat);
    }
    if (perfetto.mainThreadRunningPct != null) {
      profile.core.threads.push({
        source: 'perfetto',
        name: 'UnityMain',
        runningPct: perfetto.mainThreadRunningPct ?? 0,
        runnablePct: perfetto.mainThreadRunnablePct ?? 0,
        sleepingPct: perfetto.mainThreadSleepingPct ?? 0,
      } satisfies ThreadStat);
    }
    const system: SystemStat = {
      cpuFreqAvgMhz: perfetto.cpuFreqAvgMhz ?? undefined,
      gpuBusyPct: perfetto.gpuUtilizationPct ?? undefined,
      pssMb: perfetto.pssMb ?? undefined,
    };
    if (perfetto.binderCallCount != null) {
      system.binder = { count: perfetto.binderCallCount, avgMs: perfetto.binderAvgDurMs ?? 0 };
    }
    profile.core.system = { ...profile.core.system, ...system };
    allMetrics.push(...compact([
      metric('system.cpuFreqAvgMhz', perfetto.cpuFreqAvgMhz, 'mhz', 'perfetto'),
      metric('system.gpuFreqAvgMhz', perfetto.gpuFreqAvgMhz, 'mhz', 'perfetto'),
      metric('system.gpuBusyPct', perfetto.gpuUtilizationPct, '%', 'perfetto'),
      metric('thread.UnityMain.runningPct', perfetto.mainThreadRunningPct, '%', 'perfetto'),
      metric('thread.UnityMain.runnablePct', perfetto.mainThreadRunnablePct, '%', 'perfetto'),
      metric('thread.UnityMain.sleepingPct', perfetto.mainThreadSleepingPct, '%', 'perfetto'),
      metric('system.binder.count', perfetto.binderCallCount, 'count', 'perfetto'),
      metric('system.binder.avgMs', perfetto.binderAvgDurMs, 'ms', 'perfetto'),
      metric('system.pssMb', perfetto.pssMb, 'mb', 'perfetto'),
    ]));
    if (perfetto.parseStatus && perfetto.parseStatus !== 'ok') {
      notes.push(`perfetto 解析 ${perfetto.parseStatus}${perfetto.parseNotes ? ': ' + perfetto.parseNotes : ''}`);
    }
    detail.perfetto = {
      profileWindow: {
        startNs: perfetto.profileWindowStartNs,
        endNs: perfetto.profileWindowEndNs,
        durMs: perfetto.profileWindowDurMs,
      },
      parseStatus: perfetto.parseStatus,
      parseNotes: perfetto.parseNotes,
    };
  }

  // simpleperf: maple_runs 仅存 raw 指针, 逐 run 的 core 在旧模型里没有 (仅 compare 报告里有 il2cpp 数值)。
  if (run.perfDataPath) {
    sources.push('simpleperf');
    notes.push('simpleperf 逐 run 指标在旧模型未单独入库, 仅 raw 可用 (深层联合时回读)。');
  }

  profile.core.metrics = allMetrics;
  profile.core.confidence = { perFrameAlignmentOk: true, notes };
  profile.detail = detail;

  return {
    id: run.id,
    label: run.label,
    sources: Array.from(new Set(sources)),
    status: run.status === 'completed' ? 'ready' : run.status === 'failed' ? 'failed' : 'parsing',
    meta: {
      device: run.device,
      scene: run.scene,
      durationSec: run.durationSec,
      frameCount: run.frameCount ?? undefined,
      monoNsStart: run.monoNsStart ?? undefined,
      monoNsEnd: run.monoNsEnd ?? undefined,
    },
    profile,
    createdAt: run.createdAt,
    completedAt: run.completedAt ?? undefined,
    error: run.error ?? undefined,
    legacy: { table: 'maple_runs', id: run.id },
  };
}

// ============================================================
// sessions (+ metrics) → Run (unity_profiler 单次上传)
// ============================================================

export function legacyProfilerSessionToRun(sessionId: string): Run | null {
  const db = getDb();
  const s = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!s) return null;
  const m = db.select().from(legacyMetrics).where(eq(legacyMetrics.sessionId, sessionId)).get();

  const profile = emptyProfile();
  if (s.filePath) {
    profile.raw.push({ source: 'unity_profiler', role: 'unity_profiler_data', localPath: s.filePath, fileName: s.fileName });
  }
  if (m) {
    const fps = m.fps || (m.avgFrameMs > 0 ? 1000 / m.avgFrameMs : 0);
    profile.core.frame.push({
      source: 'unity_profiler',
      frameDefinition: 'playerloop',
      p50Ms: m.medianFrameMs,
      p95Ms: m.p95FrameMs,
      p99Ms: 0,
      fps,
      slowFrameRate: m.jankRate,
    });
    profile.core.metrics = compact([
      metric('frame.avgMs', m.avgFrameMs, 'ms', 'unity_profiler'),
      metric('frame.p50Ms', m.medianFrameMs, 'ms', 'unity_profiler'),
      metric('frame.p95Ms', m.p95FrameMs, 'ms', 'unity_profiler'),
      metric('frame.maxMs', m.maxFrameMs, 'ms', 'unity_profiler'),
      metric('frame.fps', fps, 'fps', 'unity_profiler'),
      metric('jank.count', m.jankCount, 'count', 'unity_profiler'),
      metric('jank.rate', m.jankRate, '%', 'unity_profiler'),
      metric('jank.bigCount', m.bigJankCount, 'count', 'unity_profiler'),
      metric('spike.count', m.spikeCount, 'count', 'unity_profiler'),
    ]);
  }

  return {
    id: s.id,
    label: s.fileName,
    sources: ['unity_profiler'],
    status: s.status === 'completed' ? 'ready' : s.status === 'failed' ? 'failed' : 'parsing',
    meta: {
      device: s.device ?? undefined,
      scene: s.scene ?? undefined,
      projectName: s.projectName,
      version: s.version,
      branch: s.branch ?? undefined,
      createdBy: s.createdBy,
      notes: s.notes ?? undefined,
    },
    profile,
    createdAt: s.createdAt,
    completedAt: s.completedAt ?? undefined,
    error: s.error ?? undefined,
    legacy: { table: 'sessions', id: s.id },
  };
}

// ============================================================
// simpleperf_sessions → Run (simpleperf raw + 产物指针)
// ============================================================

export function simpleperfSessionToRun(id: string): Run | null {
  const db = getDb();
  const s = db.select().from(simpleperfSessions).where(eq(simpleperfSessions.id, id)).get();
  if (!s) return null;

  const profile = emptyProfile();
  profile.raw.push({ source: 'simpleperf', role: 'perf_data', localPath: s.perfDataPath, fileName: s.fileName });
  if (s.binaryCachePath) {
    profile.raw.push({ source: 'simpleperf', role: 'binary_cache', localPath: s.binaryCachePath });
  }
  profile.detail.simpleperf = {
    resultJsonPath: s.resultJsonPath,
    resultTextPath: s.resultTextPath,
    foldedPath: s.foldedPath,
    flamegraphPath: s.flamegraphPath,
    aiReportPath: s.aiReportPath,
  };
  profile.core.confidence.notes.push('simpleperf core 指标待 Provider 解析 (P1); 当前仅 raw + 产物指针。');

  return {
    id: s.id,
    label: s.fileName,
    sources: ['simpleperf'],
    status: s.status === 'completed' ? 'ready' : s.status === 'failed' ? 'failed' : 'parsing',
    meta: {
      device: s.device ?? undefined,
      scene: s.scene ?? undefined,
      projectName: s.projectName,
      version: s.version,
      branch: s.branch ?? undefined,
      notes: s.notes ?? undefined,
    },
    profile,
    createdAt: s.createdAt,
    completedAt: s.completedAt ?? undefined,
    error: s.error ?? undefined,
    legacy: { table: 'simpleperf_sessions', id: s.id },
  };
}

// ============================================================
// maple_compare_reports → Analysis(compare) + Report
// ============================================================

export function mapleCompareToAnalysis(id: string): { analysis: Analysis; report: Report } | null {
  const db = getDb();
  const c = db.select().from(mapleCompareReports).where(eq(mapleCompareReports.id, id)).get();
  if (!c) return null;

  const conclusion = safeParse<{ isOptEffective?: boolean; confidence?: string; notes?: string[] }>(
    c.conclusionJson,
    {},
  );

  const insights: Insight[] = [];
  if (c.il2cppDeltaPp != null) {
    insights.push({
      id: 'cpu.lib.libil2cpp.delta',
      severity: 'high',
      confidence: (conclusion.confidence as Insight['confidence']) || 'medium',
      sources: ['simpleperf'],
      evidence: [{ source: 'simpleperf', detail: `libil2cpp CPU 占比 ${c.il2cppBasePct ?? '?'}% → ${c.il2cppOptPct ?? '?'}% (Δ ${c.il2cppDeltaPp}pp)` }],
      conclusion: `libil2cpp CPU 占比变化 ${c.il2cppDeltaPp}pp`,
    });
  }
  if (c.scriptingDeltaPct != null) {
    insights.push({
      id: 'marker.scripting.delta',
      severity: 'medium',
      confidence: 'medium',
      sources: ['unity_profiler'],
      evidence: [{ source: 'unity_profiler', detail: `Scripting 帧均 ${c.scriptingBaseMsPerFrame ?? '?'}ms → ${c.scriptingOptMsPerFrame ?? '?'}ms (Δ ${c.scriptingDeltaPct}%)` }],
      conclusion: `Scripting 帧均耗时变化 ${c.scriptingDeltaPct}%`,
    });
  }

  const headline = conclusion.isOptEffective == null
    ? undefined
    : conclusion.isOptEffective
      ? '对比结论: 优化有效 (来自旧 compare 报告)'
      : '对比结论: 优化无明显效果 (来自旧 compare 报告)';

  const analysis: Analysis = {
    id: c.id,
    mode: 'compare',
    runIds: [c.baseRunId, c.optRunId],
    status: 'completed',
    skill: 'cross-source-analysis',
    createdAt: c.createdAt,
    completedAt: c.createdAt,
    reportId: c.id,
    legacy: { table: 'maple_compare_reports', id: c.id },
  };

  const report: Report = {
    id: c.id,
    analysisId: c.id,
    headline,
    markdown: c.reportText ?? '',
    insights,
    createdAt: c.createdAt,
  };

  return { analysis, report };
}

/** 列出所有可适配为 Run 的 maple_runs id (供过渡期列表页枚举)。 */
export function listAdaptableMapleRunIds(): string[] {
  const db = getDb();
  return db.select({ id: mapleRuns.id }).from(mapleRuns).all().map(r => r.id);
}
