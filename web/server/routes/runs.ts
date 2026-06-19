// P2/P3: 新模型 runs / run_metrics / analysis_reports API (不读旧 sessions/maple_* 表)。



import path from 'path';

import { FastifyInstance } from 'fastify';

import { getRun, listRuns } from '../services/run-store.js';

import { getAnalysisReportByRunId } from '../services/analysis-store.js';

import { compareRuns } from '../services/run-compare.js';

import { runPostIngestAnalysis } from '../services/run-analysis-service.js';

import { ensureCompareFlamegraph, getCachedFlamegraphPath } from '../services/run-compare-flame.js';



export async function runsRoutes(app: FastifyInstance) {

  /** GET /runs — 列出新模型 runs */

  app.get('/runs', async (request) => {

    const q = request.query as { limit?: string; offset?: string };

    const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);

    const offset = parseInt(q.offset ?? '0', 10) || 0;

    return listRuns(limit, offset);

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

    const body = (request.body ?? {}) as { cliProvider?: 'codebuddy' | 'claude' | 'mock'; targetFps?: number };

    try {

      const result = await runPostIngestAnalysis(id, {

        cliProvider: body.cliProvider,

        targetFps: body.targetFps,

      });

      const analysis = getAnalysisReportByRunId(id);

      return { ...result, ...(analysis ?? {}) };

    } catch (e: any) {

      return reply.status(400).send({ error: e.message });

    }

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

