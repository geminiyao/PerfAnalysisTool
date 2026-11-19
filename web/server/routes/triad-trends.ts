// 三源趋势聚合端点: 按版本号分组, 中位数聚合三源关键指标。
//
// 数据来源:
//   Unity   → runs.core_frame_json 中的 FPS 和分位数，以及 run_metrics 中的 frame.avgMs
//   simpleperf → run_metrics (key LIKE 'cpu.lib.%.pct')
//   Perfetto → runs.core_threads_json (ThreadStat[]: runningPct / runnablePct / sleepingPct)
//
// 同版本多 Run 取中位数 (性能数据抗异常最稳健)。

import { FastifyInstance } from 'fastify';
import { eq, ne, and, asc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runs, runMetrics } from '../db/schema.js';
import type { FrameStat, ThreadStat } from '../../shared/perf-model.js';

export async function triadTrendsRoutes(app: FastifyInstance) {
  app.get('/runs/triad-trends', async (request, reply) => {
    const q = request.query as {
      projectName?: string;
      device?: string;
      scene?: string;
      label?: string;
    };

    const db = getDb();

    // 1. 查 runs (status=ready), 按创建时间升序
    const conditions = [eq(runs.status, 'ready'), ne(runs.version, ''), ne(runs.createdBy, 'collector')];
    if (q.projectName) conditions.push(eq(runs.projectName, q.projectName));
    if (q.device) conditions.push(eq(runs.device, q.device));
    if (q.scene) conditions.push(eq(runs.scene, q.scene));
    if (q.label) conditions.push(eq(runs.label, q.label));

    const runRows = db
      .select({
        id: runs.id,
        version: runs.version,
        device: runs.device,
        scene: runs.scene,
        label: runs.label,
        projectName: runs.projectName,
        coreFrameJson: runs.coreFrameJson,
        coreThreadsJson: runs.coreThreadsJson,
        createdAt: runs.createdAt,
      })
      .from(runs)
      .where(and(...conditions))
      .orderBy(asc(runs.createdAt))
      .all();

    if (runRows.length === 0) {
      return reply.send(emptyResult());
    }

    // 2. 按 version 分组 (保持首次出现顺序)
    const versionOrder: string[] = [];
    const versionGroups: Map<string, typeof runRows> = new Map();
    for (const row of runRows) {
      const v = row.version || '(未标注版本)';
      if (!versionGroups.has(v)) {
        versionGroups.set(v, []);
        versionOrder.push(v);
      }
      versionGroups.get(v)!.push(row);
    }

    // 3. 聚合每版本的三源数据 (中位数)
    const versions = versionOrder.map(v => {
      const group = versionGroups.get(v)!;
      return {
        version: v,
        runCount: group.length,
        unityRunCount: 0,
        sourceRunIds: { unity_profiler: [] as string[], simpleperf: [] as string[], perfetto: [] as string[] },
        runIds: group.map(r => r.id),
        createdAt: Math.min(...group.map(r => r.createdAt)),
      };
    });

    const meanRows = db.select({ runId: runMetrics.runId, value: runMetrics.value })
      .from(runMetrics).innerJoin(runs, eq(runs.id, runMetrics.runId))
      .where(and(...conditions, eq(runMetrics.source, 'unity_profiler'),
        eq(runMetrics.key, 'frame.avgMs'), eq(runMetrics.unit, 'ms'))).all();
    const meanByRun = new Map(meanRows.filter(r => Number.isFinite(r.value) && r.value > 0).map(r => [r.runId, r.value]));

    const unityFps: (number | null)[] = [];
    const unityAvgMs: (number | null)[] = [];
    const unityP50: (number | null)[] = [];
    const unityP99: (number | null)[] = [];
    const unityP95: (number | null)[] = [];
    for (const v of versionOrder) {
      const group = versionGroups.get(v)!;
      const fpsVals: number[] = [];
      const avgVals: number[] = [];
      const p50Vals: number[] = [];
      const p99Vals: number[] = [];
      const p95Vals: number[] = [];
      for (const row of group) {
        const frames = safeParse<FrameStat[]>(row.coreFrameJson, []);
        // Unity 的帧口径是 playerloop; 取第一条 unity 源的 frame
        const uf = frames.find(f => f.source === 'unity_profiler' || f.frameDefinition === 'playerloop');
        const avgMs = meanByRun.get(row.id);
        if (avgMs != null) avgVals.push(avgMs);
        if (avgMs != null || (uf && (uf.fps > 0 || uf.p95Ms > 0))) {
          versions[unityFps.length].sourceRunIds.unity_profiler.push(row.id);
        }
        if (uf) {
          if (Number.isFinite(uf.p50Ms) && uf.p50Ms > 0) p50Vals.push(uf.p50Ms);
          if (Number.isFinite(uf.p99Ms) && uf.p99Ms > 0) p99Vals.push(uf.p99Ms);
          if (Number.isFinite(uf.fps) && uf.fps > 0) fpsVals.push(uf.fps);
          if (Number.isFinite(uf.p95Ms) && uf.p95Ms > 0) p95Vals.push(uf.p95Ms);
        }
      }
      unityP50.push(p50Vals.length ? median(p50Vals) : null);
      unityAvgMs.push(avgVals.length ? median(avgVals) : null);
      unityP99.push(p99Vals.length ? median(p99Vals) : null);
      unityFps.push(fpsVals.length ? median(fpsVals) : null);
      unityP95.push(p95Vals.length ? median(p95Vals) : null);
      versions[unityP95.length - 1].unityRunCount = p95Vals.length;
    }

    // --- simpleperf: so 占比 (从 run_metrics, key LIKE 'cpu.lib.%.pct') ---
    // 收集所有 runId, 一次性查 metrics, 再在内存分组
    const allRunIds = runRows.map(r => r.id);
    const soMetricRows = db
      .select({ runId: runMetrics.runId, key: runMetrics.key, value: runMetrics.value })
      .from(runMetrics)
      .where(and(eq(runMetrics.source, 'simpleperf'), sql`${runMetrics.key} LIKE 'cpu.lib.%.pct'`))
      .all()
      .filter(m => allRunIds.includes(m.runId));

    // runId → version 映射
    const runIdToVersion = new Map<string, string>();
    for (const row of runRows) {
      runIdToVersion.set(row.id, row.version || '(未标注版本)');
    }

    // 收集所有 so 名 (key 去掉前缀 cpu.lib. 和后缀 .pct)
    const soNameSet = new Set<string>();
    const versionSoVals: Map<string, Map<string, number[]>> = new Map(); // version → soName → values[]
    for (const v of versionOrder) versionSoVals.set(v, new Map());

    for (const m of soMetricRows) {
      const v = runIdToVersion.get(m.runId);
      if (!v) continue;
      const soName = m.key.replace(/^cpu\.lib\./, '').replace(/\.pct$/, '');
      soNameSet.add(soName);
      if (!versionSoVals.get(v)!.has(soName)) {
        versionSoVals.get(v)!.set(soName, []);
      }
      versionSoVals.get(v)!.get(soName)!.push(m.value);
    }

    // 取每版本每 so 的中位数, 按"全版本均值"降序取 Top 8
    const soAggregated: { name: string; avgPct: number }[] = [];
    for (const soName of soNameSet) {
      const medians: number[] = [];
      for (const v of versionOrder) {
        const vals = versionSoVals.get(v)!.get(soName);
        if (vals && vals.length) medians.push(median(vals));
      }
      if (medians.length) {
        soAggregated.push({ name: soName, avgPct: medians.reduce((a, b) => a + b, 0) / medians.length });
      }
    }
    soAggregated.sort((a, b) => b.avgPct - a.avgPct);
    const topSoNames = soAggregated.slice(0, 8).map(s => s.name);
    const soRunIds = new Set(soMetricRows.map(row => row.runId));
    for (const v of versions) v.sourceRunIds.simpleperf = v.runIds.filter(id => soRunIds.has(id));
    const otherSoNames = soAggregated.slice(8).map(s => s.name);

    const simpleperfSoPct: Record<string, (number | null)[]> = {};
    for (const soName of topSoNames) {
      simpleperfSoPct[soName] = versionOrder.map(v => {
        const vals = versionSoVals.get(v)!.get(soName);
        return vals && vals.length ? median(vals) : null;
      });
    }
    // "其他"先按 Run 求和，再在版本内取中位数；直接跨 Run 求和会随重复次数虚增。
    if (otherSoNames.length) {
      const otherNames = new Set(otherSoNames);
      const otherByRun = new Map<string, number>();
      for (const m of soMetricRows) {
        const soName = m.key.replace(/^cpu\.lib\./, '').replace(/\.pct$/, '');
        if (otherNames.has(soName)) otherByRun.set(m.runId, (otherByRun.get(m.runId) ?? 0) + m.value);
      }
      simpleperfSoPct['其他'] = versionOrder.map(v => {
        const vals = versionGroups.get(v)!.map(r => otherByRun.get(r.id)).filter((x): x is number => x != null);
        return vals.length ? median(vals) : null;
      });
    }

    // --- Perfetto: 三线程 running/sleeping/runnable (从 coreThreadsJson) ---
    // 关注: UnityMain (主线程), UnityGfxRenderS (渲染), submit/UnityGfxDriverWorker (提交)
    const targetThreadPatterns = [
      { label: '主线程', match: (n: string) => /UnityMain/i.test(n) },
      { label: '渲染线程', match: (n: string) => /UnityGfxRenderS|RenderThread|Render/i.test(n) },
      { label: '提交线程', match: (n: string) => /Submit|UnityGfxDriverWorker|Gfx.*Submit/i.test(n) },
    ];

    const perfettoRunning: Record<string, (number | null)[]> = {};
    const perfettoRunnable: Record<string, (number | null)[]> = {};
    const perfettoSleeping: Record<string, (number | null)[]> = {};
    for (const tp of targetThreadPatterns) {
      perfettoRunning[tp.label] = [];
      perfettoRunnable[tp.label] = [];
      perfettoSleeping[tp.label] = [];
    }

    for (const version of versions) {
      const group = versionGroups.get(version.version)!;
      const runningRunIds = new Set<string>();
      for (const tp of targetThreadPatterns) {
        const runnings: number[] = [];
        const runnables: number[] = [];
        const sleepings: number[] = [];
        for (const row of group) {
          const threads = safeParse<ThreadStat[]>(row.coreThreadsJson, []);
          // 找匹配的线程 (perfetto 源)
          const matched = threads.find(t => t.source === 'perfetto' && tp.match(t.name));
          if (matched) {
            if (Number.isFinite(matched.runningPct)) { runnings.push(matched.runningPct); runningRunIds.add(row.id); }
            if (typeof matched.runnablePct === 'number') runnables.push(matched.runnablePct);
            if (typeof matched.sleepingPct === 'number') sleepings.push(matched.sleepingPct);
          }
        }
        perfettoRunning[tp.label].push(runnings.length ? median(runnings) : null);
        perfettoRunnable[tp.label].push(runnables.length ? median(runnables) : null);
        perfettoSleeping[tp.label].push(sleepings.length ? median(sleepings) : null);
      }
      version.sourceRunIds.perfetto = [...runningRunIds];
    }

    return reply.send({
      versions,
      filters: { projectName: q.projectName ?? null, device: q.device ?? null, scene: q.scene ?? null, label: q.label ?? null },
      unity: { fps: unityFps, avgMs: unityAvgMs, p50Ms: unityP50, p95Ms: unityP95, p99Ms: unityP99 },
      simpleperf: { soNames: Object.keys(simpleperfSoPct), soPct: simpleperfSoPct },
      perfetto: {
        threadLabels: targetThreadPatterns.map(tp => tp.label),
        running: perfettoRunning,
        runnable: perfettoRunnable,
        sleeping: perfettoSleeping,
      },
    });
  });
}

function emptyResult() {
  return {
    versions: [],
    filters: {},
    unity: { fps: [], avgMs: [], p50Ms: [], p95Ms: [], p99Ms: [] },
    simpleperf: { soNames: [], soPct: {} },
    perfetto: { threadLabels: [], running: {}, runnable: {}, sleeping: {} },
  };
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
