import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/index.js';
import { sessions, metrics, reports } from '../db/schema.js';
import { analysisQueue } from '../services/analysis-queue.js';
import { getConfig } from '../utils/config.js';
import type { ProgressEvent, CliProvider } from '../../shared/types.js';

// 存储 SSE 连接
const sseClients = new Map<string, Set<(event: ProgressEvent) => void>>();

/** 发送进度事件到所有监听的客户端 */
export function emitProgress(event: ProgressEvent) {
  const clients = sseClients.get(event.sessionId);
  if (clients) {
    for (const send of clients) {
      send(event);
    }
  }
}

export async function analysisRoutes(app: FastifyInstance) {
  /**
   * POST /api/analysis/start
   * 触发分析（将任务加入队列）
   */
  app.post('/analysis/start', async (request, reply) => {
    const { sessionId, cliProvider = 'codebuddy' } = request.body as { sessionId: string; cliProvider?: CliProvider };

    if (!sessionId) {
      return reply.status(400).send({ error: '缺少 sessionId' });
    }

    const db = getDb();
    const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

    if (!session) {
      return reply.status(404).send({ error: '分析会话不存在' });
    }

    if (session.status === 'running' || session.status === 'completed') {
      return reply.status(409).send({ error: `会话状态为 ${session.status}，不能重新触发` });
    }

    // 加入分析队列（传递 CLI 提供者）
    const position = analysisQueue.enqueue(sessionId, cliProvider);

    // 更新状态
    await db.update(sessions).set({ status: 'queued' }).where(eq(sessions.id, sessionId));

    return reply.send({
      sessionId,
      status: 'queued',
      queuePosition: position,
    });
  });

  /**
   * GET /api/analysis/:id
   * 获取分析状态和结果
   */
  app.get('/analysis/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!session) {
      return reply.status(404).send({ error: '不存在' });
    }

    return reply.send(session);
  });

  /**
   * GET /api/analysis/:id/progress
   * SSE 端点 - 实时推送分析进度
   */
  app.get('/analysis/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // 注册 SSE 客户端
    if (!sseClients.has(id)) {
      sseClients.set(id, new Set());
    }

    const send = (event: ProgressEvent) => {
      try {
        if (!reply.raw.writable) return;
        const canContinue = reply.raw.write(
          `data: ${JSON.stringify(event)}\n\n`
        );
        if (!canContinue) {
          // 背压处理 - 暂停流(如有引用)
          console.warn('[SSE] Backpressure detected for session', event.sessionId);
        }
      } catch (err: any) {
        console.error(`[SSE] Write error for session ${event.sessionId}:`, err.message);
      }
    };

    sseClients.get(id)!.add(send);

    // 客户端断开时清理
    request.raw.on('close', () => {
      const clients = sseClients.get(id);
      if (clients) {
        clients.delete(send);
        if (clients.size === 0) {
          sseClients.delete(id);
        }
      }
    });

    // 发送初始心跳
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', sessionId: id })}\n\n`);
  });

  /**
   * GET /api/analysis/queue/status
   * 获取队列状态
   */
  app.get('/analysis/queue/status', async (_request, reply) => {
    return reply.send(analysisQueue.getStatus());
  });

  /**
   * GET /api/report/:id/content
   * 获取报告 Markdown 内容
   */
  app.get('/report/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const report = await db.select().from(reports).where(eq(reports.sessionId, id)).get();
    if (!report || !report.content) {
      return reply.status(404).send('');
    }

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return reply.send(report.content);
  });

  /**
   * GET /api/report/:id/metrics
   * 获取分析指标
   */
  app.get('/report/:id/metrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const metric = await db.select().from(metrics).where(eq(metrics.sessionId, id)).get();
    if (!metric) {
      return reply.status(404).send({ error: '无指标数据' });
    }

    return reply.send(metric);
  });

  /**
   * GET /api/report/:id/logs
   * 获取分析日志
   */
  app.get('/report/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = getConfig();
    const logPath = path.join(config.dataDir, 'results', id, 'analysis.log');

    if (!fs.existsSync(logPath)) {
      return reply.status(404).send('');
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return reply.send(content);
  });

  /**
   * GET /api/report/:id/preprocess
   * 获取预处理结构化数据 (preprocess-result.json)
   */
  app.get('/report/:id/preprocess', async (request, reply) => {
    const { id } = request.params as { id: string };
    const config = getConfig();
    const preprocessPath = path.join(config.dataDir, 'results', id, 'preprocess-result.json');

    if (!fs.existsSync(preprocessPath)) {
      return reply.status(404).send({ error: '无预处理数据' });
    }

    const content = fs.readFileSync(preprocessPath, 'utf-8');
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.send(content);
  });

  /**
   * DELETE /api/analysis/:id
   * 删除分析记录
   */
  app.delete('/analysis/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    await db.delete(sessions).where(eq(sessions.id, id));

    return reply.send({ success: true });
  });
}
