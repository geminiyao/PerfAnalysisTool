// P2/P3: 新模型 runs / run_metrics / analysis_reports API (不读旧 sessions/maple_* 表)。



import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { FastifyInstance } from 'fastify';

import { getRun, listRuns } from '../services/run-store.js';

import { getAnalysisReportByRunId, listAnalysesByRunId, getAnalysisReport } from '../services/analysis-store.js';

import { compareRuns } from '../services/run-compare.js';

import { runPostIngestAnalysis, runAnalysisForSources } from '../services/run-analysis-service.js';

import { ensureCompareFlamegraph, getCachedFlamegraphPath } from '../services/run-compare-flame.js';

import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { analysisQueue } from '../services/analysis-queue.js';
import type { PrismPipelineOptions } from '../services/prism-runner.js';



export async function runsRoutes(app: FastifyInstance) {

  /** GET /runs — 列出新模型 runs */

  app.get('/runs', async (request) => {

    const q = request.query as { limit?: string; offset?: string };

    const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);

    const offset = parseInt(q.offset ?? '0', 10) || 0;

    return listRuns(limit, offset);

  });



  /** GET /runs/by-version/:version — 某版本下所有 Run + 各自已有分析 (Dashboard 抽屉用) */

  app.get('/runs/by-version/:version', async (request, reply) => {

    const { version } = request.params as { version: string };

    const { items } = listRuns(200, 0);

    const matched = items.filter(r => (r.version || '(未标注版本)') === decodeURIComponent(version));

    const result = matched.map(run => ({
      ...run,
      analyses: listAnalysesByRunId(run.id),
    }));

    return { version: decodeURIComponent(version), items: result };

  });



  /** GET /runs/compare/flamegraph — 差分火焰图 HTML (simpleperf) */

  app.get('/runs/compare/flamegraph', async (request, reply) => {

    const q = request.query as { baseRunId?: string; currentRunId?: string };

    if (!q.baseRunId || !q.currentRunId) {

      return reply.status(400).send({ error: '需要 baseRunId 和 currentRunId' });

    }

    try {

      await ensureCompareFlamegraph(q.baseRunId, q.currentRunId);

      const filePath = getCachedFlamegraphPath(q.baseRunId, q.currentRunId);

      if (!filePath) {

        return reply.status(404).send({ error: '差分火焰图生成失败' });

      }

      return reply.sendFile(path.basename(filePath), path.dirname(filePath));

    } catch (e: any) {

      return reply.status(400).send({ error: e.message });

    }

  });



  /** POST /runs/compare — P3 两 Run 对比 (决策 9 五步) */

  app.post('/runs/compare', async (request, reply) => {

    const { baseRunId, currentRunId } = request.body as { baseRunId?: string; currentRunId?: string };

    if (!baseRunId || !currentRunId) {

      return reply.status(400).send({ error: '需要 baseRunId 和 currentRunId' });

    }

    try {

      return compareRuns(baseRunId, currentRunId);

    } catch (e: any) {

      return reply.status(400).send({ error: e.message });

    }

  });



  /** POST /runs/:id/generate-analysis — 三源 skill / 多源 cross */

  app.post('/runs/:id/generate-analysis', async (request, reply) => {

    const { id } = request.params as { id: string };

    const body = (request.body ?? {}) as { cliProvider?: 'codebuddy' | 'claude' | 'mock'; targetFps?: number; sources?: string[] };

    try {

      const result = body.sources && body.sources.length > 0
        ? await runAnalysisForSources(id, body.sources, { cliProvider: body.cliProvider, targetFps: body.targetFps })
        : await runPostIngestAnalysis(id, { cliProvider: body.cliProvider, targetFps: body.targetFps });

      const analysis = getAnalysisReportByRunId(id);

      return { ...result, ...(analysis ?? {}) };

    } catch (e: any) {

      return reply.status(400).send({ error: e.message });

    }

  });



  /**
   * POST /runs/:id/generate-prism-analysis — 触发 Prism 三段管线 (WT-051a 需求 C)
   *
   * Body: { source: 'unity'|'perfetto', multiStateDir?: string, skipExplore?: boolean, timeoutMs?: number }
   * 返回: { sessionId, status: 'queued', position }
   *
   * 异步走 analysisQueue（taskType='prism'），不阻塞 API。
   */
  app.post('/runs/:id/generate-prism-analysis', async (request, reply) => {

    const { id: runId } = request.params as { id: string };

    const body = (request.body ?? {}) as {
      source?: 'unity' | 'perfetto';
      multiStateDir?: string;
      skipExplore?: boolean;
      timeoutMs?: number;
      outputDir?: string;
    };

    if (!body.source) {
      return reply.status(400).send({ error: '需要 source (unity | perfetto)' });
    }

    // unity/perfetto 都支持单 Run (探索阶段从 DB 读 runId 数据) 和多态 (multiStateDir) 两种模式
    // 不再硬性要求 multiStateDir — 由探索阶段自适应态数

    const db = getDb();

    // 创建一个 session 记录这次 Prism 管线运行（复用 sessions 表机制）
    // Prism 没有输入文件，fileName 用占位符标识
    const sessionId = `prism-${runId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      await db.insert(sessions).values({
        id: sessionId,
        fileName: `prism-${body.source}-${runId}`,
        fileSize: 0,
        filePath: body.multiStateDir ?? null,
        status: 'queued',
        createdBy: 'prism',
        projectName: '',
        version: '',
        createdAt: Date.now(),
      });
    } catch (e: any) {
      return reply.status(500).send({ error: `创建 session 失败: ${e.message}` });
    }

    // 构造 Prism 管线参数（runId 用 URL 参数，不是 session id）
    const prismOpts: PrismPipelineOptions = {
      source: body.source,
      runId,
      multiStateDir: body.multiStateDir,
      skipExplore: body.skipExplore,
      timeoutMs: body.timeoutMs,
      outputDir: body.outputDir,
    };

    // 入队（taskType='prism'），返回队列位置
    const position = analysisQueue.enqueue(sessionId, 'codebuddy', undefined, 'prism', prismOpts);

    return {
      sessionId,
      status: 'queued',
      position,
    };

  });



  /**
   * GET /api/prism-timing/:analysisId — serve pipeline-timing.json
   */
  app.get('/prism-timing/:analysisId', async (request, reply) => {
    const { analysisId } = request.params as { analysisId: string };

    // 从 analyses 表查报告路径，推断 timing 文件位置
    try {
      const ar = getAnalysisReport(analysisId);
      if (ar?.report?.markdown?.startsWith('__PRISM_REPORT__:')) {
        const reportRelPath = ar.report.markdown.slice('__PRISM_REPORT__:'.length).trim();
        const timingPath = path.resolve(process.cwd(), reportRelPath.replace('report.html', 'pipeline-timing.json'));
        if (fs.existsSync(timingPath)) {
          const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
          return reply.send(timing);
        }
      }
    } catch { /* fall through */ }

    // 兜底：按 ID 提取 runId，找最新的 pipeline-timing.json
    try {
      let runIdMatch = analysisId.match(/^prism-(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      if (!runIdMatch) {
        runIdMatch = analysisId.match(/^prism-(.+)-\d{13,}-[a-f0-9]+$/);
      }
      if (runIdMatch) {
        const runId = runIdMatch[1];
        const prismOutBase = path.resolve(process.cwd(), 'data', 'prism-out', runId);
        if (fs.existsSync(prismOutBase)) {
          const subdirs = fs.readdirSync(prismOutBase)
            .filter(d => fs.statSync(path.join(prismOutBase, d)).isDirectory())
            .filter(d => fs.existsSync(path.join(prismOutBase, d, 'pipeline-timing.json')))
            .sort()
            .reverse();
          if (subdirs.length > 0) {
            const timingPath = path.join(prismOutBase, subdirs[0], 'pipeline-timing.json');
            const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
            return reply.send(timing);
          }
        }
      }
    } catch { /* fall through */ }

    return reply.code(404).send({ error: 'pipeline-timing.json not found' });
  });

  /**
   * GET /api/prism-report/:sessionId — serve Prism report.html (WT-051a 需求 D)
   *
   * 从 session 关联的 assets 找 report.html，直接返回 HTML（iframe 加载）。
   * 兜底：如果 asset 没注册，按 outputDir 约定尝试从 web/data/prism-out/<runId>/<timestamp>/report.html 找。
   */
  app.get('/prism-report/:sessionId', async (request, reply) => {

    const { sessionId } = request.params as { sessionId: string };

    const db = getDb();

    let reportHtmlPath: string | null = null;

    // ★ 优先：从 analyses 表查 report.markdown（含 __PRISM_REPORT__:<path> 标记）
    try {
      const ar = getAnalysisReport(sessionId);
      if (ar?.report?.markdown?.startsWith('__PRISM_REPORT__:')) {
        const relPath = ar.report.markdown.slice('__PRISM_REPORT__:'.length).trim();
        const fullPath = path.resolve(process.cwd(), relPath);
        if (fs.existsSync(fullPath)) {
          reportHtmlPath = fullPath;
        }
      }
    } catch { /* fall through to filesystem search */ }

    // 兜底：按 Prism 输出目录约定 web/data/prism-out/<runId>/<timestamp>/report.html
    if (!reportHtmlPath) {
      // ID 可能是 analysisId（prism-<runId>-YYYY-MM-DD_HH-MM-SS）或 sessionId（prism-<runId>-<epoch_ms>-<hex>）
      let runIdMatch = sessionId.match(/^prism-(.+)-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      if (!runIdMatch) {
        runIdMatch = sessionId.match(/^prism-(.+)-\d{13,}-[a-f0-9]+$/);
      }
      const runId = runIdMatch ? runIdMatch[1] : sessionId;

      const prismOutBase = path.resolve(process.cwd(), 'data', 'prism-out', runId);
      if (fs.existsSync(prismOutBase)) {
        try {
          const subdirs = fs.readdirSync(prismOutBase)
            .filter(d => fs.statSync(path.join(prismOutBase, d)).isDirectory())
            .filter(d => fs.existsSync(path.join(prismOutBase, d, 'report.html')))
            .sort()
            .reverse();
          if (subdirs.length > 0) {
            reportHtmlPath = path.join(prismOutBase, subdirs[0], 'report.html');
          }
        } catch {
          // ignore
        }
      }
    }

    if (!reportHtmlPath || !fs.existsSync(reportHtmlPath)) {
      return reply.status(404).send({ error: `Prism report.html not found for session ${sessionId}` });
    }

    const html = fs.readFileSync(reportHtmlPath, 'utf-8');
    reply.type('text/html').send(html);

  });



  /** GET /runs/:id — 单次分析详情 (Run + 可选交叉结论) */

  app.get('/runs/:id', async (request, reply) => {

    const { id } = request.params as { id: string };

    const run = getRun(id);

    if (!run) {

      return reply.status(404).send({ error: `Run not found: ${id}` });

    }

    const analysis = getAnalysisReportByRunId(id);

    return { run, analysis };

  });

}

