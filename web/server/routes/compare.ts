import { FastifyInstance } from 'fastify';
import { inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, metrics } from '../db/schema.js';
import type { MetricDiff } from '../../shared/types.js';

export async function compareRoutes(app: FastifyInstance) {
  /**
   * POST /api/compare
   * 对比多个分析结果
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
