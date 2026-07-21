// 三源趋势聚合端点: 按版本号分组, 中位数聚合三源关键指标。
//
// 数据来源:
//   Unity   → runs.core_frame_json (FrameStat[]: fps / p95Ms)
//   simpleperf → run_metrics (key LIKE 'cpu.lib.%.pct')
//   Perfetto → runs.core_threads_json (ThreadStat[]: runningPct / runnablePct / sleepingPct)
//
// 同版本多 Run 取中位数 (性能数据抗异常最稳健)。

import { FastifyInstance } from 'fastify';
import { eq, and, asc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runs, runMetrics } from '../db/schema.js';
import type { FrameStat, ThreadStat } from '../../shared/perf-model.js';

export async function triadTrendsRoutes(app: FastifyInstance) {
  app.get('/runs/triad-trends', async (request, reply) => {
    const q = request.query as {
      projectName?: string;
      device?: string;
      scene?: string;
    };

    const db = getDb();

    // 1. 查 runs (status=ready), 按创建时间升序
    const conditions = [eq(runs.status, 'ready')];
    if (q.projectName) conditions.push(eq(runs.projectName, q.projectName));
    if (q.device) conditions.push(eq(runs.device, q.device));
    if (q.scene) conditions.push(eq(runs.scene, q.scene));

    const runRows = db
      .select({
        id: runs.id,
        version: runs.version,
        device: runs.device,
        scene: runs.scene,
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
        runIds: group.map(r => r.id),
        createdAt: Math.min(...group.map(r => r.createdAt)),
      };
    });

    // --- Unity: fps + p95Ms (从 coreFrameJson) ---
    const unityFps: (number | null)[] = [];
    const unityP95: (number | null)[] = [];
    for (const v of versionOrder) {
      const group = versionGroups.get(v)!;
      const fpsVals: number[] = [];
      const p95Vals: number[] = [];
      for (const row of group) {
        const frames = safeParse<FrameStat[]>(row.coreFrameJson, []);
        // Unity 的帧口径是 playerloop; 取第一条 unity 源的 frame
        const uf = frames.find(f => f.source === 'unity_profiler' || f.frameDefinition === 'playerloop');
        if (uf) {
          if (typeof uf.fps === 'number') fpsVals.push(uf.fps);
          if (typeof uf.p95Ms === 'number') p95Vals.push(uf.p95Ms);
        }
      }
      unityFps.push(fpsVals.length ? median(fpsVals) : null);
      unityP95.push(p95Vals.length ? median(p95Vals) : null);
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
    const otherSoNames = soAggregated.slice(8).map(s => s.name);

    const simpleperfSoPct: Record<string, (number | null)[]> = {};
    for (const soName of topSoNames) {
      simpleperfSoPct[soName] = versionOrder.map(v => {
        const vals = versionSoVals.get(v)!.get(soName);
        return vals && vals.length ? median(vals) : null;
      });
    }
    // "其他" 合并
    if (otherSoNames.length) {
      simpleperfSoPct['其他'] = versionOrder.map(v => {
        const vals: number[] = [];
        for (const soName of otherSoNames) {
          const sv = versionSoVals.get(v)!.get(soName);
          if (sv) vals.push(...sv);
        }
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
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

    for (const v of versionOrder) {
      const group = versionGroups.get(v)!;
      for (const tp of targetThreadPatterns) {
        const runnings: number[] = [];
        const runnables: number[] = [];
        const sleepings: number[] = [];
        for (const row of group) {
          const threads = safeParse<ThreadStat[]>(row.coreThreadsJson, []);
          // 找匹配的线程 (perfetto 源)
          const matched = threads.find(t => t.source === 'perfetto' && tp.match(t.name));
          if (matched) {
            if (typeof matched.runningPct === 'number') runnings.push(matched.runningPct);
            if (typeof matched.runnablePct === 'number') runnables.push(matched.runnablePct);
            if (typeof matched.sleepingPct === 'number') sleepings.push(matched.sleepingPct);
          }
        }
        perfettoRunning[tp.label].push(runnings.length ? median(runnings) : null);
        perfettoRunnable[tp.label].push(runnables.length ? median(runnables) : null);
        perfettoSleeping[tp.label].push(sleepings.length ? median(sleepings) : null);
      }
    }

    return reply.send({
      versions,
      filters: { projectName: q.projectName ?? null, device: q.device ?? null, scene: q.scene ?? null },
      unity: { fps: unityFps, p95Ms: unityP95 },
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
    unity: { fps: [], p95Ms: [] },
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
