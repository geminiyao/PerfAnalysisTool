import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, metrics, simpleperfSessions } from '../db/schema.js';
import { diffPreprocess } from '../services/preprocess-differ.js';
import { getConfig } from '../utils/config.js';
import type { MetricDiff } from '../../shared/types.js';

export async function compareRoutes(app: FastifyInstance) {
  /**
   * POST /api/compare
   * 对比多个分析结果（汇总指标）
   * body: { sessionIds: [id1, id2] }
   */
  app.post('/compare', async (request, reply) => {
    const { sessionIds } = request.body as { sessionIds: string[] };

    if (!sessionIds || sessionIds.length < 2) {
      return reply.status(400).send({ error: '至少选择两个分析结果进行对比' });
    }

    if (sessionIds.length > 4) {
      return reply.status(400).send({ error: '最多支持4个结果同时对比' });
    }

    const db = getDb();

    // 查询 sessions
    const sessionList = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, sessionIds))
      .all();

    // 查询 metrics
    const metricsList = await db
      .select()
      .from(metrics)
      .where(inArray(metrics.sessionId, sessionIds))
      .all();

    if (metricsList.length < 2) {
      return reply.status(400).send({ error: '所选会话中没有足够的指标数据' });
    }

    // 计算差异（以第一个为基准）
    const diffs = calculateDiffs(metricsList);

    return reply.send({
      sessions: sessionList,
      metrics: metricsList,
      diffs,
    });
  });

  /**
   * POST /api/compare/diff
   * Marker 级深度对比（基于 preprocess-result.json）
   * body: { baselineId: string, currentId: string }
   */
  app.post('/compare/diff', async (request, reply) => {
    const { baselineId, currentId } = request.body as { baselineId: string; currentId: string };

    if (!baselineId || !currentId) {
      return reply.status(400).send({ error: '需要提供 baselineId 和 currentId' });
    }

    if (baselineId === currentId) {
      return reply.status(400).send({ error: '不能与自身对比' });
    }

    try {
      const result = diffPreprocess(baselineId, currentId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.get('/compare/simpleperf/sessions', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit || 80), 200);
    const db = getDb();
    const items = await db
      .select()
      .from(simpleperfSessions)
      .where(inArray(simpleperfSessions.status, ['completed', 'ai_analyzing']))
      .limit(limit)
      .all();
    return { items: items.sort((a, b) => b.createdAt - a.createdAt) };
  });

  app.post('/compare/simpleperf', async (request, reply) => {
    const body = (request.body || {}) as { baselineId?: string; currentId?: string; levels?: string; aggregateByThreadName?: boolean };
    const { baselineId, currentId } = body;
    if (!baselineId || !currentId) return reply.status(400).send({ error: '需要提供 baselineId 和 currentId' });
    if (baselineId === currentId) return reply.status(400).send({ error: '不能与自身对比' });

    const db = getDb();
    const selected = await db.select().from(simpleperfSessions).where(inArray(simpleperfSessions.id, [baselineId, currentId])).all();
    const baseline = selected.find(s => s.id === baselineId);
    const current = selected.find(s => s.id === currentId);
    if (!baseline || !current) return reply.status(404).send({ error: 'simpleperf 会话不存在' });
    if (baseline.status !== 'completed' || current.status !== 'completed') return reply.status(400).send({ error: '只能对比 completed 状态的 simpleperf 会话' });

    const result = await runSimpleperfCompare(baseline, current, body.levels || '123', Boolean(body.aggregateByThreadName));
    return reply.send(result);
  });
}

async function runSimpleperfCompare(baseline: any, current: any, levels: string, aggregateByThreadName: boolean) {
  const config = getConfig();
  const simpleperfRoot = path.join(config.skillProjectPath, 'simpleperf');
  const compareDir = path.join(config.dataDir, 'simpleperf_compare', `${baseline.id}_vs_${current.id}`);
  const outPrefix = path.join(compareDir, 'compare');
  fs.mkdirSync(compareDir, { recursive: true });

  const binaryCachePath = current.binaryCachePath || baseline.binaryCachePath || '';
  const args = [
    path.join(simpleperfRoot, 'scripts', 'compare.py'),
    baseline.perfDataPath,
    current.perfDataPath,
    '--out',
    outPrefix,
    '--levels',
    levels.replace(/[^123]/g, '') || '123',
  ];
  if (binaryCachePath) args.push('--binary-cache', binaryCachePath);
  if (aggregateByThreadName) args.push('--aggregate-by-thread-name');

  const python = process.env.PYTHON || 'python';
  const proc = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(python, args, { cwd: simpleperfRoot, shell: true, windowsHide: true, env: { ...process.env } });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('close', code => resolve({ code, output }));
    child.on('error', err => resolve({ code: -1, output: err.message }));
  });

  const jsonPath = outPrefix + '.json';
  const txtPath = outPrefix + '.txt';
  if (proc.code !== 0 || !fs.existsSync(jsonPath)) {
    throw new Error(proc.output || `simpleperf compare 失败，退出码 ${proc.code}`);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return {
    baseline: toSimpleperfCompareSession(baseline),
    current: toSimpleperfCompareSession(current),
    binaryCachePath,
    artifacts: {
      jsonPath,
      txtPath: fs.existsSync(txtPath) ? txtPath : null,
    },
    ...normalizeSimpleperfCompare(raw),
  };
}

function toSimpleperfCompareSession(session: any) {
  return {
    id: session.id,
    fileName: session.fileName,
    projectName: session.projectName,
    version: session.version,
    branch: session.branch,
    buildId: session.buildId,
    device: session.device,
    scene: session.scene,
    createdAt: session.createdAt,
  };
}

function normalizeSimpleperfCompare(raw: any) {
  const level1 = raw.level1_so_compare || { threads: [] };
  const level2 = raw.level2_anchor_compare || { anchors: [] };
  const level3 = raw.level3_func_diff || { functions: [], text: '' };
  const threadSummary = (level1.threads || []).map((thread: any) => {
    const baselineTotal = Number(thread.baseline_total_event || 0);
    const currentTotal = Number(thread.current_total_event || 0);
    const libs = (thread.libs || []).map((lib: any) => {
      const baselineEvent = baselineTotal * Number(lib.baseline_pct || 0) / 100;
      const currentEvent = currentTotal * Number(lib.current_pct || 0) / 100;
      const deltaEvent = currentEvent - baselineEvent;
      return {
        ...lib,
        baseline_event: Math.round(baselineEvent),
        current_event: Math.round(currentEvent),
        delta_event: Math.round(deltaEvent),
        delta_event_pct: baselineEvent ? Math.round((deltaEvent / baselineEvent * 100) * 1000) / 1000 : null,
      };
    });
    const maxDelta = libs.reduce((acc: number, lib: any) => Math.max(acc, Math.abs(Number(lib.delta_pct || 0))), 0);
    const topDegraded = libs.filter((lib: any) => Number(lib.delta_pct || 0) > 0).sort((a: any, b: any) => Number(b.delta_pct || 0) - Number(a.delta_pct || 0)).slice(0, 3);
    const topImproved = libs.filter((lib: any) => Number(lib.delta_pct || 0) < 0).sort((a: any, b: any) => Number(a.delta_pct || 0) - Number(b.delta_pct || 0)).slice(0, 3);
    return { ...thread, libs, maxDelta, topDegraded, topImproved };
  });
  const soSummary = buildSoSummary(threadSummary);

  return {
    meta: raw.meta || {},
    summary: raw.summary || {},
    level1: { ...level1, threads: threadSummary, soSummary },
    level2,
    level3,
  };
}

function buildSoSummary(threads: any[]) {
  const acc = new Map<string, any>();
  let baselineTotal = 0;
  let currentTotal = 0;

  for (const thread of threads) {
    const threadBaselineTotal = Number(thread.baseline_total_event || 0);
    const threadCurrentTotal = Number(thread.current_total_event || 0);
    baselineTotal += threadBaselineTotal;
    currentTotal += threadCurrentTotal;

    for (const lib of thread.libs || []) {
      const key = lib.full_path || lib.name;
      const item = acc.get(key) || {
        name: lib.name,
        full_path: key,
        baseline_event: 0,
        current_event: 0,
        thread_count: 0,
        topThreads: [],
      };
      const baselineEvent = threadBaselineTotal * Number(lib.baseline_pct || 0) / 100;
      const currentEvent = threadCurrentTotal * Number(lib.current_pct || 0) / 100;
      item.baseline_event += baselineEvent;
      item.current_event += currentEvent;
      item.thread_count += 1;
      item.topThreads.push({
        name: thread.name,
        baseline_pct: lib.baseline_pct,
        current_pct: lib.current_pct,
        delta_pct: lib.delta_pct,
        baseline_event: Math.round(baselineEvent),
        current_event: Math.round(currentEvent),
        delta_event: Math.round(currentEvent - baselineEvent),
        delta_event_pct: baselineEvent ? Math.round(((currentEvent - baselineEvent) / baselineEvent * 100) * 1000) / 1000 : null,
      });
      acc.set(key, item);
    }
  }

  return Array.from(acc.values()).map(item => {
    const baselinePct = baselineTotal ? item.baseline_event / baselineTotal * 100 : 0;
    const currentPct = currentTotal ? item.current_event / currentTotal * 100 : 0;
    return {
      ...item,
      baseline_event: Math.round(item.baseline_event),
      current_event: Math.round(item.current_event),
      delta_event: Math.round(item.current_event - item.baseline_event),
      delta_event_pct: item.baseline_event ? Math.round(((item.current_event - item.baseline_event) / item.baseline_event * 100) * 1000) / 1000 : null,
      baseline_pct: Math.round(baselinePct * 1000) / 1000,
      current_pct: Math.round(currentPct * 1000) / 1000,
      delta_pct: Math.round((currentPct - baselinePct) * 1000) / 1000,
      topThreads: item.topThreads.sort((a: any, b: any) => Math.abs(Number(b.delta_pct || 0)) - Math.abs(Number(a.delta_pct || 0))).slice(0, 5),
    };
  }).sort((a, b) => Math.abs(Number(b.delta_pct || 0)) - Math.abs(Number(a.delta_pct || 0)));
}

/** 指标标签映射 */
const METRIC_LABELS: Record<string, { label: string; lowerIsBetter: boolean }> = {
  avgFrameMs: { label: '平均帧时间 (ms)', lowerIsBetter: true },
  maxFrameMs: { label: '最大帧时间 (ms)', lowerIsBetter: true },
  medianFrameMs: { label: '中位帧时间 (ms)', lowerIsBetter: true },
  p95FrameMs: { label: 'P95 帧时间 (ms)', lowerIsBetter: true },
  fps: { label: '平均 FPS', lowerIsBetter: false },
  jankCount: { label: 'Jank 帧数', lowerIsBetter: true },
  jankRate: { label: 'Jank 率 (%)', lowerIsBetter: true },
  bigJankCount: { label: '严重 Jank 帧数', lowerIsBetter: true },
  spikeCount: { label: 'Spike 数量', lowerIsBetter: true },
  totalFrames: { label: '总帧数', lowerIsBetter: false },
};

function calculateDiffs(metricsList: any[]): MetricDiff[] {
  const diffs: MetricDiff[] = [];
  const base = metricsList[0];

  for (const [key, meta] of Object.entries(METRIC_LABELS)) {
    const values = metricsList.map(m => m[key] ?? 0);
    const baseVal = base[key] ?? 0;
    const lastVal = metricsList[metricsList.length - 1][key] ?? 0;
    const delta = lastVal - baseVal;
    const deltaPercent = baseVal !== 0 ? (delta / baseVal) * 100 : 0;

    // 判断是否改善
    const improved = meta.lowerIsBetter ? delta < 0 : delta > 0;

    diffs.push({
      metric: key,
      label: meta.label,
      values,
      delta,
      deltaPercent: Math.round(deltaPercent * 100) / 100,
      improved,
    });
  }

  return diffs;
}
