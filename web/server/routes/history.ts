import { FastifyInstance } from 'fastify';
import { eq, desc, and, like, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, metrics } from '../db/schema.js';
import type { HistoryQuery } from '../../shared/types.js';

export async function historyRoutes(app: FastifyInstance) {
  /**
   * GET /api/history
   * 分页查询历史记录，支持多种筛选条件
   */
  app.get('/history', async (request, reply) => {
    const query = request.query as HistoryQuery;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const db = getDb();

    // 构建筛选条件
    const conditions = [];
    if (query.projectName) {
      conditions.push(eq(sessions.projectName, query.projectName));
    }
    if (query.version) {
      conditions.push(eq(sessions.version, query.version));
    }
    if (query.createdBy) {
      conditions.push(eq(sessions.createdBy, query.createdBy));
    }
    if (query.status) {
      conditions.push(eq(sessions.status, query.status));
    }
    if (query.dateFrom) {
      conditions.push(gte(sessions.createdAt, query.dateFrom));
    }
    if (query.dateTo) {
      conditions.push(lte(sessions.createdAt, query.dateTo));
    }
    if (query.search) {
      conditions.push(like(sessions.fileName, `%${query.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // 查询总数
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(where)
      .get();
    const total = countResult?.count || 0;

    // 查询数据
    const items = await db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({
      items,
      total,
      page,
      limit,
    });
  });

  /**
   * GET /api/history/stats
   * 汇总统计
   */
  app.get('/history/stats', async (_request, reply) => {
    const db = getDb();

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`sum(case when status = 'completed' then 1 else 0 end)`,
        failed: sql<number>`sum(case when status = 'failed' then 1 else 0 end)`,
        avgDuration: sql<number>`avg(duration)`,
      })
      .from(sessions)
      .get();

    // 获取项目列表
    const projects = await db
      .select({ projectName: sessions.projectName, count: sql<number>`count(*)` })
      .from(sessions)
      .where(sql`project_name != ''`)
      .groupBy(sessions.projectName)
      .all();

    return reply.send({
      ...stats,
      projects,
    });
  });

  /**
   * GET /api/history/projects
   * 获取所有项目名（用于筛选下拉）
   */
  app.get('/history/projects', async (_request, reply) => {
    const db = getDb();

    const projects = await db
      .selectDistinct({ projectName: sessions.projectName })
      .from(sessions)
      .where(sql`project_name != ''`)
      .all();

    return reply.send(projects.map(p => p.projectName));
  });
}
