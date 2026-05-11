import { FastifyInstance } from 'fastify';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, metrics } from '../db/schema.js';
import type { TrendQuery, TrendPoint } from '../../shared/types.js';

export async function trendsRoutes(app: FastifyInstance) {
  /**
   * GET /api/trends
   * 获取趋势数据（指标随时间的变化）
   */
  app.get('/trends', async (request, reply) => {
    const query = request.query as TrendQuery;

    if (!query.projectName || !query.metric) {
      return reply.status(400).send({ error: '需要指定 projectName 和 metric' });
    }

    const db = getDb();

    // 构建筛选条件
    const conditions = [
      eq(sessions.projectName, query.projectName),
      eq(sessions.status, 'completed'),
    ];
    if (query.dateFrom) conditions.push(gte(sessions.createdAt, query.dateFrom));
    if (query.dateTo) conditions.push(lte(sessions.createdAt, query.dateTo));

    // 联表查询 sessions + metrics
    const results = await db
      .select({
        sessionId: sessions.id,
        version: sessions.version,
        date: sessions.createdAt,
        // 动态选择指标列 - 这里查询所有指标，后续在应用层筛选
        avgFrameMs: metrics.avgFrameMs,
        maxFrameMs: metrics.maxFrameMs,
        medianFrameMs: metrics.medianFrameMs,
        p95FrameMs: metrics.p95FrameMs,
        fps: metrics.fps,
        jankCount: metrics.jankCount,
        jankRate: metrics.jankRate,
        bigJankCount: metrics.bigJankCount,
        spikeCount: metrics.spikeCount,
        totalFrames: metrics.totalFrames,
      })
      .from(sessions)
      .innerJoin(metrics, eq(sessions.id, metrics.sessionId))
      .where(and(...conditions))
      .orderBy(sessions.createdAt)
      .all();

    // 提取指定指标
    const metricKey = query.metric as string;
    const points: TrendPoint[] = results.map(r => ({
      sessionId: r.sessionId,
      version: r.version || '',
      date: r.date,
      value: (r as any)[metricKey] ?? 0,
    }));

    return reply.send({
      projectName: query.projectName,
      metric: query.metric,
      points,
    });
  });

  /**
   * GET /api/trends/metrics
   * 返回可用的趋势指标列表
   */
  app.get('/trends/metrics', async (_request, reply) => {
    return reply.send([
      { key: 'fps', label: '平均 FPS', unit: 'fps', lowerIsBetter: false },
      { key: 'avgFrameMs', label: '平均帧时间', unit: 'ms', lowerIsBetter: true },
      { key: 'maxFrameMs', label: '最大帧时间', unit: 'ms', lowerIsBetter: true },
      { key: 'medianFrameMs', label: '中位帧时间', unit: 'ms', lowerIsBetter: true },
      { key: 'p95FrameMs', label: 'P95 帧时间', unit: 'ms', lowerIsBetter: true },
      { key: 'jankCount', label: 'Jank 帧数', unit: '帧', lowerIsBetter: true },
      { key: 'jankRate', label: 'Jank 率', unit: '%', lowerIsBetter: true },
      { key: 'bigJankCount', label: '严重 Jank 数', unit: '帧', lowerIsBetter: true },
      { key: 'spikeCount', label: 'Spike 数量', unit: '个', lowerIsBetter: true },
    ]);
  });
}
